"use strict";

// Automatische Gerüstplanung aus einem 3D-Modell (reine Rechenlogik, ohne DOM –
// läuft im Browser und zum Testen auch in Node).
//
// Ablauf:
//  1. Modell einlesen (OBJ, STL, glTF/GLB; IFC liefert modell3d.js über web-ifc)
//     → Dreiecksliste in Metern, z = oben, y = Norden (Plan-Koordinaten).
//  2. Hauptausrichtung der Wände bestimmen und das Modell so drehen, dass die
//     Wände parallel zum Raster liegen (ergibt saubere, rechtwinklige Umrisse).
//  3. Draufsicht rastern: Höhenkarte (höchster Punkt je Zelle) + Wandmaske
//     (senkrechte Flächen). Der Gebäudeumriss wird bevorzugt aus den Außenwänden
//     gebildet (Dachüberstände/Balkone liegen dann außerhalb), sonst aus der
//     Dachkante.
//  4. Umriss nachzeichnen, vereinfachen → Fassadenabschnitte mit Länge, Winkel
//     und Höhe (aus der Höhenkarte direkt hinter der Wand; Giebel werden
//     abgetreppt).
//  5. Höhensprünge innerhalb des Gebäudes (Staffelgeschoss, höherer Gebäudeteil
//     neben niedrigerem, Innenhof) erkennen → eigene Geschossebenen mit
//     Sockelhöhe = Dachfläche, auf der das Gerüst steht.

const ModelScaffold = (() => {
  // -------------------------------------------------------------------
  // Dreieckspuffer (wächst bei Bedarf, Float64 wegen georeferenzierter
  // Koordinaten mit großen Absolutwerten)
  // -------------------------------------------------------------------
  class TriBuffer {
    constructor(capacity = 9 * 4096) {
      this.data = new Float64Array(capacity);
      this.length = 0;
    }
    push9(ax, ay, az, bx, by, bz, cx, cy, cz) {
      if (this.length + 9 > this.data.length) {
        const next = new Float64Array(this.data.length * 2);
        next.set(this.data);
        this.data = next;
      }
      const d = this.data;
      let i = this.length;
      d[i++] = ax; d[i++] = ay; d[i++] = az;
      d[i++] = bx; d[i++] = by; d[i++] = bz;
      d[i++] = cx; d[i++] = cy; d[i++] = cz;
      this.length = i;
    }
    finish() {
      return this.data.subarray(0, this.length);
    }
  }

  // -------------------------------------------------------------------
  // Parser → { positions: Float64Array (9 Werte je Dreieck), defaultUp }
  // -------------------------------------------------------------------

  function parseOBJ(text) {
    const verts = [];
    const buf = new TriBuffer();
    const lines = text.split(/\r?\n/);
    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li];
      const c0 = line.charCodeAt(0);
      if (c0 !== 118 && c0 !== 102) continue; // 'v' / 'f'
      const parts = line.trim().split(/\s+/);
      if (parts[0] === "v") {
        verts.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
      } else if (parts[0] === "f") {
        const nV = verts.length / 3;
        const idx = [];
        for (let k = 1; k < parts.length; k += 1) {
          let v = parseInt(parts[k], 10);
          if (isNaN(v)) continue;
          v = v < 0 ? nV + v : v - 1;
          idx.push(v);
        }
        for (let k = 1; k + 1 < idx.length; k += 1) {
          const a = idx[0] * 3, b = idx[k] * 3, c = idx[k + 1] * 3;
          buf.push9(verts[a], verts[a + 1], verts[a + 2], verts[b], verts[b + 1], verts[b + 2], verts[c], verts[c + 1], verts[c + 2]);
        }
      }
    }
    return { positions: buf.finish(), defaultUp: "y" };
  }

  function parseSTL(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const buf = new TriBuffer();
    if (arrayBuffer.byteLength >= 84) {
      const n = dv.getUint32(80, true);
      if (84 + n * 50 === arrayBuffer.byteLength) {
        for (let i = 0; i < n; i += 1) {
          const o = 84 + i * 50 + 12;
          buf.push9(
            dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true),
            dv.getFloat32(o + 12, true), dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true),
            dv.getFloat32(o + 24, true), dv.getFloat32(o + 28, true), dv.getFloat32(o + 32, true)
          );
        }
        return { positions: buf.finish(), defaultUp: "z" };
      }
    }
    const text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    const v = [];
    let m;
    while ((m = re.exec(text))) {
      v.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
      if (v.length === 9) {
        buf.push9(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]);
        v.length = 0;
      }
    }
    return { positions: buf.finish(), defaultUp: "z" };
  }

  // glTF 2.0 (.glb oder .gltf mit eingebetteten data:-Puffern)
  function parseGLTF(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    let json;
    let bin = null;
    const magic = arrayBuffer.byteLength >= 12 ? new DataView(arrayBuffer).getUint32(0, true) : 0;
    if (magic === 0x46546c67) {
      const dv = new DataView(arrayBuffer);
      let off = 12;
      while (off + 8 <= arrayBuffer.byteLength) {
        const len = dv.getUint32(off, true);
        const type = dv.getUint32(off + 4, true);
        const chunk = u8.subarray(off + 8, off + 8 + len);
        if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
        else if (type === 0x004e4942) bin = chunk;
        off += 8 + len;
      }
    } else {
      json = JSON.parse(new TextDecoder().decode(u8));
    }
    if (!json) throw new Error("glTF: keine JSON-Daten gefunden.");
    if ((json.extensionsRequired || []).some((e) => /draco|meshopt/i.test(e))) {
      throw new Error("glTF ist komprimiert (Draco/Meshopt) – bitte ohne Komprimierung exportieren.");
    }

    const buffers = (json.buffers || []).map((b, i) => {
      if (b.uri === undefined) {
        if (i === 0 && bin) return bin;
        throw new Error("glTF: Binärpuffer fehlt.");
      }
      const mm = /^data:[^;]*;base64,(.*)$/.exec(b.uri);
      if (!mm) throw new Error("glTF verweist auf eine externe .bin-Datei – bitte als .glb (eine Datei) exportieren.");
      const raw = typeof atob === "function" ? atob(mm[1]) : Buffer.from(mm[1], "base64").toString("binary");
      const out = new Uint8Array(raw.length);
      for (let i2 = 0; i2 < raw.length; i2 += 1) out[i2] = raw.charCodeAt(i2);
      return out;
    });

    const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    function readAccessor(idx) {
      const acc = json.accessors[idx];
      const nc = NCOMP[acc.type];
      const out = new Float64Array(acc.count * nc);
      if (acc.bufferView === undefined) return out;
      const bv = json.bufferViews[acc.bufferView];
      const data = buffers[bv.buffer];
      const dv = new DataView(data.buffer, data.byteOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0));
      const cs = COMP[acc.componentType];
      const stride = bv.byteStride || cs * nc;
      for (let i = 0; i < acc.count; i += 1) {
        for (let c = 0; c < nc; c += 1) {
          const o = i * stride + c * cs;
          let v;
          switch (acc.componentType) {
            case 5126: v = dv.getFloat32(o, true); break;
            case 5125: v = dv.getUint32(o, true); break;
            case 5123: v = dv.getUint16(o, true); break;
            case 5122: v = dv.getInt16(o, true); break;
            case 5121: v = dv.getUint8(o); break;
            default: v = dv.getInt8(o);
          }
          out[i * nc + c] = v;
        }
      }
      return out;
    }

    function mul(a, b) {
      const r = new Array(16);
      for (let i = 0; i < 4; i += 1) {
        for (let j = 0; j < 4; j += 1) {
          r[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
        }
      }
      return r;
    }
    function nodeMatrix(n) {
      if (n.matrix) return n.matrix.slice();
      const [tx, ty, tz] = n.translation || [0, 0, 0];
      const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1];
      const [sx, sy, sz] = n.scale || [1, 1, 1];
      return [
        (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
        2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
        2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
        tx, ty, tz, 1,
      ];
    }

    const buf = new TriBuffer();
    function emitMesh(meshIdx, m) {
      const mesh = json.meshes[meshIdx];
      (mesh.primitives || []).forEach((prim) => {
        const mode = prim.mode === undefined ? 4 : prim.mode;
        if (mode !== 4 || prim.attributes.POSITION === undefined) return;
        const pos = readAccessor(prim.attributes.POSITION);
        const nVert = pos.length / 3;
        const w = new Float64Array(pos.length);
        for (let i = 0; i < nVert; i += 1) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          w[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
          w[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          w[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        const idx = prim.indices !== undefined ? readAccessor(prim.indices) : null;
        const count = idx ? idx.length : nVert;
        for (let t = 0; t + 2 < count; t += 3) {
          const a = (idx ? idx[t] : t) * 3, b = (idx ? idx[t + 1] : t + 1) * 3, c = (idx ? idx[t + 2] : t + 2) * 3;
          buf.push9(w[a], w[a + 1], w[a + 2], w[b], w[b + 1], w[b + 2], w[c], w[c + 1], w[c + 2]);
        }
      });
    }
    function walk(nodeIdx, parent) {
      const n = json.nodes[nodeIdx];
      const m = mul(parent, nodeMatrix(n));
      if (n.mesh !== undefined) emitMesh(n.mesh, m);
      (n.children || []).forEach((c) => walk(c, m));
    }
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const scene = (json.scenes || [])[json.scene || 0];
    if (scene && scene.nodes) scene.nodes.forEach((n) => walk(n, I));
    else (json.meshes || []).forEach((_, i) => emitMesh(i, I));
    return { positions: buf.finish(), defaultUp: "y" };
  }

  // IFC über eine bereits initialisierte web-ifc-API einlesen. web-ifc
  // liefert die Geometrie in Metern mit Y nach oben (wie three.js).
  const IFC_SKIP = [
    "IFCSPACE", "IFCOPENINGELEMENT", "IFCSITE", "IFCGEOGRAPHICELEMENT", "IFCANNOTATION",
    "IFCFURNISHINGELEMENT", "IFCFURNITURE", "IFCVIRTUALELEMENT", "IFCGRID", "IFCSPATIALZONE",
  ];
  function extractIfcTriangles(api, modelID, WebIFCNs, onProgress) {
    const skip = new Set(IFC_SKIP.map((t) => WebIFCNs[t]).filter((v) => typeof v === "number"));
    const buf = new TriBuffer();
    let elements = 0, skipped = 0;
    api.StreamAllMeshes(modelID, (flatMesh) => {
      let type = null;
      try { type = api.GetLineType(modelID, flatMesh.expressID); } catch (e) { /* unbekannt */ }
      if (type !== null && skip.has(type)) { skipped += 1; return; }
      elements += 1;
      const geoms = flatMesh.geometries;
      for (let gi = 0; gi < geoms.size(); gi += 1) {
        const pg = geoms.get(gi);
        const geom = api.GetGeometry(modelID, pg.geometryExpressID);
        const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const m = pg.flatTransformation;
        const nV = v.length / 6;
        const wv = new Float64Array(nV * 3);
        for (let k = 0; k < nV; k += 1) {
          const x = v[k * 6], y = v[k * 6 + 1], z = v[k * 6 + 2];
          wv[k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
          wv[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          wv[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        for (let t = 0; t + 2 < idx.length; t += 3) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
          buf.push9(wv[a], wv[a + 1], wv[a + 2], wv[b], wv[b + 1], wv[b + 2], wv[c], wv[c + 1], wv[c + 2]);
        }
        if (typeof geom.delete === "function") geom.delete();
      }
      if (onProgress && elements % 200 === 0) onProgress(elements);
    });
    return { positions: buf.finish(), defaultUp: "y", elements, skipped };
  }

  function parseByName(fileName, arrayBuffer) {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (ext === "obj") return parseOBJ(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
    if (ext === "stl") return parseSTL(arrayBuffer);
    if (ext === "glb" || ext === "gltf") return parseGLTF(arrayBuffer);
    throw new Error(`Dateiformat .${ext} wird nicht unterstützt (IFC, OBJ, STL, GLB/glTF).`);
  }

  // -------------------------------------------------------------------
  // Achsen / Einheiten
  // -------------------------------------------------------------------

  // Schätzt die Hochachse: geneigte Dachflächen haben Normalen mit Anteil in
  // der Hochachse plus einer horizontalen Achse – die Achse, die in den
  // schrägen Flächen am häufigsten vorkommt, ist "oben". Ohne Schrägen
  // (Flachdach) gilt die Vorgabe des Dateiformats.
  function guessUpAxis(pos, defaultUp) {
    const oblique = { x: 0, y: 0, z: 0 };
    let total = 0;
    for (let i = 0; i < pos.length; i += 9) {
      const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
      const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const a = Math.hypot(nx, ny, nz);
      if (a < 1e-12) continue;
      total += a;
      const ax = Math.abs(nx) / a, ay = Math.abs(ny) / a, az = Math.abs(nz) / a;
      const big = [ax > 0.25, ay > 0.25, az > 0.25];
      if (big.filter(Boolean).length === 2 && Math.max(ax, ay, az) < 0.95) {
        if (big[0]) oblique.x += a;
        if (big[1]) oblique.y += a;
        if (big[2]) oblique.z += a;
      }
    }
    const sumOb = oblique.y + oblique.z;
    if (total > 0 && sumOb > 0.03 * total) {
      if (oblique.y > 1.5 * oblique.z && oblique.y > 1.2 * oblique.x) return "y";
      if (oblique.z > 1.5 * oblique.y && oblique.z > 1.2 * oblique.x) return "z";
    }
    return defaultUp || "z";
  }

  // Wandelt in Plan-Koordinaten um: x = Osten, y = Norden, z = oben, Meter.
  // Y-oben-Modelle (glTF, three.js, web-ifc) zeigen mit -Z nach Norden.
  function toPlanCoords(pos, up, scale) {
    const out = new Float64Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (up === "y") {
        out[i] = x * scale; out[i + 1] = -z * scale; out[i + 2] = y * scale;
      } else {
        out[i] = x * scale; out[i + 1] = y * scale; out[i + 2] = z * scale;
      }
    }
    return out;
  }

  function extents(pos) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const v = pos[i + k];
        if (v < mn[k]) mn[k] = v;
        if (v > mx[k]) mx[k] = v;
      }
    }
    return { min: mn, max: mx, size: mx.map((v, k) => v - mn[k]) };
  }

  // Einheit anhand der Gebäudegröße schätzen (Faktor → Meter).
  function guessScale(pos) {
    const e = extents(pos);
    const s = Math.max(e.size[0], e.size[1], e.size[2]);
    if (s > 3000) return 0.001;
    if (s > 600) return 0.01;
    return 1;
  }

  // -------------------------------------------------------------------
  // Raster-Werkzeuge
  // -------------------------------------------------------------------

  // Morphologie mit quadratischem Strukturelement (separierbar über
  // Präfixsummen). Quadratisch statt rund, weil das Raster an den Wänden
  // ausgerichtet ist: rechtwinklige Ecken bleiben dadurch exakt erhalten.
  function dilate(mask, w, h, r) {
    if (r <= 0) return mask.slice();
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    const pre = new Int32Array(Math.max(w, h) + 1);
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) pre[x + 1] = pre[x] + mask[row + x];
      for (let x = 0; x < w; x += 1) {
        const a = Math.max(0, x - r), b = Math.min(w, x + r + 1);
        tmp[row + x] = pre[b] - pre[a] > 0 ? 1 : 0;
      }
    }
    for (let x = 0; x < w; x += 1) {
      for (let y = 0; y < h; y += 1) pre[y + 1] = pre[y] + tmp[y * w + x];
      for (let y = 0; y < h; y += 1) {
        const a = Math.max(0, y - r), b = Math.min(h, y + r + 1);
        out[y * w + x] = pre[b] - pre[a] > 0 ? 1 : 0;
      }
    }
    return out;
  }
  function erode(mask, w, h, r) {
    if (r <= 0) return mask.slice();
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) inv[i] = mask[i] ? 0 : 1;
    const d = dilate(inv, w, h, r);
    for (let i = 0; i < w * h; i += 1) d[i] = d[i] ? 0 : 1;
    return d;
  }
  const closing = (m, w, h, r) => erode(dilate(m, w, h, r), w, h, r);
  const opening = (m, w, h, r) => dilate(erode(m, w, h, r), w, h, r);

  // Zellen, die vom Rand aus über Nicht-Masken-Zellen erreichbar sind.
  function exteriorOf(mask, w, h) {
    const ext = new Uint8Array(w * h);
    const stack = [];
    const push = (i) => {
      if (!mask[i] && !ext[i]) { ext[i] = 1; stack.push(i); }
    };
    for (let x = 0; x < w; x += 1) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y += 1) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    return ext;
  }
  function fillHoles(mask, w, h) {
    const ext = exteriorOf(mask, w, h);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) out[i] = ext[i] ? 0 : 1;
    return out;
  }

  // 4-zusammenhängende Komponenten → Array von Uint8-Masken (größte zuerst)
  function components(mask, w, h, minCells) {
    const label = new Int32Array(w * h);
    const comps = [];
    let next = 0;
    for (let s = 0; s < w * h; s += 1) {
      if (!mask[s] || label[s]) continue;
      next += 1;
      const cells = [];
      const stack = [s];
      label[s] = next;
      while (stack.length) {
        const i = stack.pop();
        cells.push(i);
        const x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of nb) {
          if (j >= 0 && j < w * h && mask[j] && !label[j]) { label[j] = next; stack.push(j); }
        }
      }
      if (cells.length >= minCells) comps.push(cells);
    }
    comps.sort((a, b) => b.length - a.length);
    return comps.map((cells) => {
      const m = new Uint8Array(w * h);
      cells.forEach((i) => (m[i] = 1));
      return m;
    });
  }

  // Randkanten der Maske zu geschlossenen Linienzügen verketten. Die Maske
  // liegt beim Ablaufen immer links (Außenumriss gegen den Uhrzeigersinn,
  // Löcher im Uhrzeigersinn). Ergebnis in Rasterpunkt-Koordinaten.
  function traceLoops(mask, w, h) {
    const W1 = w + 1;
    const out = new Map(); // vertexKey -> [edgeIdx]
    const edges = [];
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    const add = (x0, y0, x1, y1) => {
      const k = y0 * W1 + x0;
      edges.push({ x0, y0, x1, y1, used: false });
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(edges.length - 1);
    };
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!mask[y * w + x]) continue;
        if (!inside(x, y - 1)) add(x, y, x + 1, y);
        if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!inside(x - 1, y)) add(x, y + 1, x, y);
      }
    }
    const loops = [];
    for (let e0 = 0; e0 < edges.length; e0 += 1) {
      if (edges[e0].used) continue;
      const pts = [];
      let e = edges[e0];
      while (e && !e.used) {
        e.used = true;
        pts.push({ x: e.x0, y: e.y0 });
        const cand = (out.get(e.y1 * W1 + e.x1) || []).map((i) => edges[i]).filter((c) => !c.used);
        if (!cand.length) break;
        if (cand.length === 1) { e = cand[0]; continue; }
        // Sattelpunkt: links abbiegen hält diagonal berührende Flächen getrennt
        const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
        cand.sort((a, b) => {
          const ca = dx * (a.y1 - a.y0) - dy * (a.x1 - a.x0);
          const cb = dx * (b.y1 - b.y0) - dy * (b.x1 - b.x0);
          return cb - ca;
        });
        e = cand[0];
      }
      if (pts.length >= 4) loops.push(pts);
    }
    return loops;
  }

  // -------------------------------------------------------------------
  // Polygon-Werkzeuge (Meter)
  // -------------------------------------------------------------------

  function signedArea(ring) {
    let s = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }

  function removeCollinear(ring, tol = 1e-9) {
    let pts = ring.slice();
    let changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        const lab = Math.hypot(b.x - a.x, b.y - a.y), lbc = Math.hypot(c.x - b.x, c.y - b.y);
        if (lab < 1e-9 || lbc < 1e-9 || Math.abs(cross) / (lab * lbc) < tol) {
          pts.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return pts;
  }

  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }

  function dpOpen(pts, tol) {
    if (pts.length < 3) return pts.slice();
    let maxD = -1, idx = -1;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
    const left = dpOpen(pts.slice(0, idx + 1), tol);
    const right = dpOpen(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }

  function dpClosed(ring, tol) {
    if (ring.length < 4) return ring.slice();
    // An der Ecke beginnen, die am weitesten vom Schwerpunkt entfernt ist
    let cx = 0, cy = 0;
    ring.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= ring.length; cy /= ring.length;
    let i0 = 0, best = -1;
    ring.forEach((p, i) => {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > best) { best = d; i0 = i; }
    });
    const r = ring.slice(i0).concat(ring.slice(0, i0));
    let i1 = 0;
    best = -1;
    r.forEach((p, i) => {
      const d = Math.hypot(p.x - r[0].x, p.y - r[0].y);
      if (d > best) { best = d; i1 = i; }
    });
    const a = dpOpen(r.slice(0, i1 + 1), tol);
    const b = dpOpen(r.slice(i1).concat([r[0]]), tol);
    return a.slice(0, -1).concat(b.slice(0, -1));
  }

  function lineIntersect(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y)) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
    return { x: p1.x + d1x * t, y: p1.y + d1y * t };
  }

  // Sehr kurze Kanten (Rasterreste) entfernen: Nachbarkanten verlängern und
  // schneiden, bei parallelen Nachbarn auf die Mitte zusammenziehen.
  function removeShortEdges(ring, minLen) {
    let pts = ring.slice();
    let guard = 0;
    while (pts.length > 3 && guard < 1000) {
      guard += 1;
      let shortest = -1, sl = Infinity;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l < sl) { sl = l; shortest = i; }
      }
      if (sl >= minLen) break;
      const n = pts.length;
      const i = shortest;
      const a = pts[i], b = pts[(i + 1) % n];
      const prev = pts[(i - 1 + n) % n], next = pts[(i + 2) % n];
      const x = lineIntersect(prev, a, b, next);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const p = x && Math.hypot(x.x - mid.x, x.y - mid.y) < 3 * minLen ? x : mid;
      const j = (i + 1) % n;
      pts[i] = p;
      pts.splice(j, 1);
      pts = removeCollinear(pts, 0.02);
    }
    return pts;
  }

  // Kanten eines geschlossenen Rings parallel verschieben (positiv = nach
  // links in Laufrichtung) und Ecken neu schneiden.
  function offsetRing(ring, d) {
    const n = ring.length;
    const lines = [];
    for (let i = 0; i < n; i += 1) {
      const a = ring[i], b = ring[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      lines.push([{ x: a.x + nx * d, y: a.y + ny * d }, { x: b.x + nx * d, y: b.y + ny * d }]);
    }
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const L0 = lines[(i - 1 + n) % n], L1 = lines[i];
      const x = lineIntersect(L0[0], L0[1], L1[0], L1[1]);
      out.push(x && Math.hypot(x.x - ring[i].x, x.y - ring[i].y) < 5 * Math.abs(d) + 1e-6 ? x : L1[0]);
    }
    return out;
  }

  // Kanten nahe an der Rasterachse (nach dem Drehen = Hauptrichtung der
  // Wände) exakt achsparallel stellen und Ecken neu schneiden.
  function squareUp(ring, tolDeg) {
    const n = ring.length;
    const tol = Math.tan((tolDeg * Math.PI) / 180);
    const lines = [];
    for (let i = 0; i < n; i += 1) {
      const a = ring[i], b = ring[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dy) <= tol * Math.abs(dx)) {
        const y = (a.y + b.y) / 2;
        lines.push([{ x: a.x, y }, { x: b.x, y }]);
      } else if (Math.abs(dx) <= tol * Math.abs(dy)) {
        const x = (a.x + b.x) / 2;
        lines.push([{ x, y: a.y }, { x, y: b.y }]);
      } else {
        lines.push([a, b]);
      }
    }
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const L0 = lines[(i - 1 + n) % n], L1 = lines[i];
      const x = lineIntersect(L0[0], L0[1], L1[0], L1[1]);
      out.push(x && Math.hypot(x.x - ring[i].x, x.y - ring[i].y) < 1 ? x : ring[i]);
    }
    return out;
  }

  // -------------------------------------------------------------------
  // Hauptanalyse
  // -------------------------------------------------------------------

  const DEFAULTS = {
    res: 0.1, // Rasterweite (m), wird bei großen Modellen vergrößert
    ground: null, // Geländehöhe (m); null = automatisch
    topExtra: 1.0, // Gerüst über Traufe/Attika hinaus (Seitenschutz)
    bridgeWidth: 1.0, // Rücksprünge/Nischen schmaler als das werden überbrückt
    stepGable: true, // Giebel/schräge Oberkanten abtreppen
    stepTol: 1.0, // max. Höhenunterschied innerhalb eines Abschnitts (m)
    minSection: 1.0, // min. Länge eines abgetreppten Teilabschnitts (m)
    detectUpper: true, // Staffelgeschosse/höhere Gebäudeteile/Innenhöfe
    minStep: 2.0, // min. Fassadenhöhe eines Rücksprungs (m)
    minArea: 6, // min. Grundfläche eines Baukörpers (m²)
    wallReach: 2.5, // Wände müssen bis so nah ans Gelände reichen (m)
    maxCells: 6e6,
  };

  const COMPASS = ["Nord", "Nordost", "Ost", "Südost", "Süd", "Südwest", "West", "Nordwest"];
  function compassName(nx, ny) {
    // Winkel im Uhrzeigersinn ab Norden
    let a = (Math.atan2(nx, ny) * 180) / Math.PI;
    if (a < 0) a += 360;
    return COMPASS[Math.round(a / 45) % 8];
  }

  function dominantAngle(tris) {
    const bins = new Float64Array(90);
    for (let i = 0; i < tris.length; i += 9) {
      const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
      const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const a = Math.hypot(nx, ny, nz);
      if (a < 1e-9 || Math.abs(nz) / a > 0.1) continue;
      let deg = (Math.atan2(ny, nx) * 180) / Math.PI;
      deg = ((deg % 90) + 90) % 90;
      bins[Math.floor(deg) % 90] += a;
    }
    let best = 0, bestV = -1;
    for (let b = 0; b < 90; b += 1) {
      let v = 0;
      for (let k = -2; k <= 2; k += 1) v += bins[(b + k + 90) % 90];
      if (v > bestV) { bestV = v; best = b; }
    }
    // Feinbestimmung: gewichteter Kreismittelwert (Periode 90°) aller
    // Wandflächen nahe am Maximum
    let sc = 0, ss = 0;
    for (let i = 0; i < tris.length; i += 9) {
      const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
      const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const a = Math.hypot(nx, ny, nz);
      if (a < 1e-9 || Math.abs(nz) / a > 0.1) continue;
      const phi = Math.atan2(ny, nx) * 4;
      let diff = (((phi * 180) / Math.PI / 4 - (best + 0.5)) % 90 + 90) % 90;
      if (diff > 45) diff -= 90;
      if (Math.abs(diff) > 3.5) continue;
      sc += a * Math.cos(phi);
      ss += a * Math.sin(phi);
    }
    let ang = sc || ss ? (Math.atan2(ss, sc) * 180) / Math.PI / 4 : 0;
    if (ang > 45) ang -= 90;
    if (ang < -45) ang += 90;
    return (ang * Math.PI) / 180;
  }

  function analyze(planTris, userOpts) {
    const o = { ...DEFAULTS, ...(userOpts || {}) };
    const notes = [];
    const nTri = planTris.length / 9;
    if (!nTri) throw new Error("Das Modell enthält keine Dreiecksflächen.");

    // --- Drehen auf Hauptrichtung der Wände
    const theta = dominantAngle(planTris);
    const c = Math.cos(-theta), s = Math.sin(-theta);
    const T = new Float64Array(planTris.length);
    for (let i = 0; i < planTris.length; i += 3) {
      const x = planTris[i], y = planTris[i + 1];
      T[i] = c * x - s * y;
      T[i + 1] = s * x + c * y;
      T[i + 2] = planTris[i + 2];
    }
    const ext = extents(T);
    const zMin = ext.min[2], zMax = ext.max[2];

    // --- Geländehöhe
    let g = o.ground;
    let groundAuto = false;
    if (g === null || g === undefined || isNaN(g)) {
      groundAuto = true;
      g = zMin;
      if (zMin < -1.5 && zMax > 2) {
        g = 0;
        notes.push("Modell reicht deutlich unter ±0,00 (Keller/Fundamente) – Gelände wurde bei ±0,00 angenommen. Bei Bedarf „Geländehöhe“ von Hand eintragen.");
      }
    }

    // --- Raster
    const margin = 3;
    const minX = ext.min[0] - margin, minY = ext.min[1] - margin;
    const spanX = ext.size[0] + 2 * margin, spanY = ext.size[1] + 2 * margin;
    let res = Math.max(o.res, Math.sqrt((spanX * spanY) / o.maxCells));
    res = Math.ceil(res * 100) / 100;
    if (res > o.res + 1e-9) notes.push(`Großes Modell – Rasterweite auf ${res.toFixed(2)} m vergröbert.`);
    const w = Math.ceil(spanX / res), h = Math.ceil(spanY / res);
    const N = w * h;
    const H = new Float32Array(N).fill(-Infinity);
    const wall = new Uint8Array(N);
    const minWallExtent = 0.5;

    const setH = (cx, cy, z) => {
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) return;
      const i = cy * w + cx;
      if (z > H[i]) H[i] = z;
    };
    // Linie (in Zellkoordinaten) abtasten; z linear interpoliert
    const rasterLine = (x0, y0, z0, x1, y1, z1, isWall) => {
      const L = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(L * 2));
      for (let k = 0; k <= steps; k += 1) {
        const t = k / steps;
        const cx = Math.floor(x0 + (x1 - x0) * t), cy = Math.floor(y0 + (y1 - y0) * t);
        setH(cx, cy, z0 + (z1 - z0) * t);
        if (isWall && cx >= 0 && cy >= 0 && cx < w && cy < h) wall[cy * w + cx] = 1;
      }
    };

    for (let i = 0; i < T.length; i += 9) {
      const ax = (T[i] - minX) / res, ay = (T[i + 1] - minY) / res, az = T[i + 2];
      const bx = (T[i + 3] - minX) / res, by = (T[i + 4] - minY) / res, bz = T[i + 5];
      const cx = (T[i + 6] - minX) / res, cy = (T[i + 7] - minY) / res, cz = T[i + 8];
      // Normale (Meter) für Wand-Erkennung
      const ux = (bx - ax) * res, uy = (by - ay) * res, uz = bz - az;
      const vx = (cx - ax) * res, vy = (cy - ay) * res, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-12) continue;
      const tzMin = Math.min(az, bz, cz), tzMax = Math.max(az, bz, cz);
      const vertical = Math.abs(nz) / nl < 0.1;
      if (vertical) {
        // Nur Flächen, die bis in Bodennähe reichen, zählen als Außenwand –
        // Stirnseiten von Dachplatten (Ortgang/Traufe) hängen frei darüber.
        const isWall = tzMax - tzMin >= minWallExtent && tzMax > g + 0.3 && tzMin <= g + o.wallReach;
        // Projektion = Strecke zwischen den beiden am weitesten entfernten
        // Punkten; Oberkante entlang der Strecke = höchster Schnitt mit den
        // drei Dreieckskanten (wichtig für Giebelwände)
        const P = [[ax, ay, az], [bx, by, bz], [cx, cy, cz]];
        let bi = 0, bj = 1, bd = -1;
        for (let p = 0; p < 3; p += 1) {
          for (let q = p + 1; q < 3; q += 1) {
            const d = Math.hypot(P[p][0] - P[q][0], P[p][1] - P[q][1]);
            if (d > bd) { bd = d; bi = p; bj = q; }
          }
        }
        const A = P[bi], B = P[bj];
        const dxs = B[0] - A[0], dys = B[1] - A[1];
        const L2 = dxs * dxs + dys * dys;
        const u = P.map((p) => (L2 > 1e-12 ? ((p[0] - A[0]) * dxs + (p[1] - A[1]) * dys) / L2 : 0));
        const steps = Math.max(1, Math.ceil(Math.sqrt(L2) * 2));
        for (let k = 0; k <= steps; k += 1) {
          const t = k / steps;
          let zTop = -Infinity;
          for (let e = 0; e < 3; e += 1) {
            const p = e, q = (e + 1) % 3;
            const u0 = u[p], u1 = u[q];
            if (t < Math.min(u0, u1) - 1e-9 || t > Math.max(u0, u1) + 1e-9) continue;
            const z = Math.abs(u1 - u0) < 1e-12
              ? Math.max(P[p][2], P[q][2])
              : P[p][2] + ((P[q][2] - P[p][2]) * (t - u0)) / (u1 - u0);
            if (z > zTop) zTop = z;
          }
          if (zTop === -Infinity) zTop = tzMax;
          const cxx = Math.floor(A[0] + dxs * t), cyy = Math.floor(A[1] + dys * t);
          setH(cxx, cyy, zTop);
          if (isWall && cxx >= 0 && cyy >= 0 && cxx < w && cyy < h) wall[cyy * w + cxx] = 1;
        }
        continue;
      }
      // Fläche: Zellmittelpunkte im Dreieck, z baryzentrisch
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.floor(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.floor(Math.max(ay, by, cy)));
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) > 1e-12) {
        for (let yy = y0; yy <= y1; yy += 1) {
          const py = yy + 0.5;
          for (let xx = x0; xx <= x1; xx += 1) {
            const px = xx + 0.5;
            const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
            const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
            const l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            const z = l1 * az + l2 * bz + l3 * cz;
            const idx = yy * w + xx;
            if (z > H[idx]) H[idx] = z;
          }
        }
      }
      // Kanten zusätzlich, damit kleine/schmale Dreiecke nicht durchs Raster fallen
      rasterLine(ax, ay, az, bx, by, bz, false);
      rasterLine(bx, by, bz, cx, cy, cz, false);
      rasterLine(cx, cy, cz, ax, ay, az, false);
    }

    const rCells = (m) => Math.max(1, Math.round(m / res));
    const cellArea = res * res;

    // --- Belegte Fläche aus Draufsicht (inkl. Dachüberstand)
    let F = new Uint8Array(N);
    for (let i = 0; i < N; i += 1) F[i] = H[i] > g + 0.5 ? 1 : 0;
    F = opening(F, w, h, rCells(0.2)); // Zäune, Geländer, Masten entfernen
    const Ffilled = fillHoles(closing(F, w, h, rCells(o.bridgeWidth / 2)), w, h);
    let areaF = 0;
    for (let i = 0; i < N; i += 1) areaF += Ffilled[i];

    // --- Umriss aus Außenwänden (ohne Dachüberstand)
    const wallClosed = closing(dilate(wall, w, h, 1), w, h, rCells(o.bridgeWidth / 2));
    // Verbreiterung um eine Zelle wieder abziehen, damit die Außenkante auf
    // der Wandfläche liegt
    const W = erode(fillHoles(wallClosed, w, h), w, h, 1);
    let areaW = 0, areaWinF = 0;
    for (let i = 0; i < N; i += 1) {
      if (W[i]) { areaW += 1; if (Ffilled[i]) areaWinF += 1; }
    }
    const wallsUsable = areaF > 0 && areaWinF >= 0.5 * areaF && areaW <= 1.15 * areaF;
    let P;
    if (wallsUsable) {
      P = new Uint8Array(N);
      for (let i = 0; i < N; i += 1) P[i] = W[i] && Ffilled[i] ? 1 : 0;
      P = opening(P, w, h, rCells(0.2));
    } else {
      P = Ffilled;
      if (areaF > 0) {
        notes.push("Außenwände ließen sich nicht als geschlossene Kontur erkennen – der Umriss folgt der Dachkante (bei Dachüberstand also etwas zu groß). Bitte prüfen.");
      }
    }
    const Pfilled = fillHoles(P, w, h);

    const minCells = Math.ceil(o.minArea / cellArea);
    const bodies = components(Pfilled, w, h, minCells);
    if (!bodies.length) throw new Error("Kein Gebäude erkannt – Hochachse, Einheit oder Geländehöhe prüfen.");

    // Höhe mit "kein Bauteil" = Gelände
    const Hg = new Float32Array(N);
    for (let i = 0; i < N; i += 1) Hg[i] = H[i] === -Infinity || H[i] < g ? g : H[i];

    // --- Hilfsfunktionen im gedrehten Meter-System
    const cellOf = (x, y) => {
      const cx = Math.floor((x - minX) / res), cy = Math.floor((y - minY) / res);
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) return -1;
      return cy * w + cx;
    };
    const Hat = (x, y) => {
      const i = cellOf(x, y);
      return i < 0 ? -Infinity : H[i];
    };
    const inMask = (m, x, y) => {
      const i = cellOf(x, y);
      return i >= 0 && m[i] === 1;
    };
    const toMeters = (loop) => loop.map((p) => ({ x: minX + p.x * res, y: minY + p.y * res }));
    const simplify = (loopM) => {
      let r = removeCollinear(loopM);
      r = dpClosed(r, Math.max(1.5 * res, 0.12));
      r = removeShortEdges(r, Math.max(2.5 * res, 0.3));
      r = squareUp(r, 4);
      r = removeCollinear(r, 0.01);
      // Die Randzellen enthalten die Wandfläche; ihre Außenkante liegt im
      // Mittel eine halbe Zelle zu weit draußen → zur Maske hin verschieben.
      // Maske liegt links der Laufrichtung (traceLoops).
      r = offsetRing(r, res / 2);
      return r;
    };
    // zurück in Plan-Koordinaten (Norden = +y) für Himmelsrichtung/Vorschau
    const cb = Math.cos(theta), sb = Math.sin(theta);
    const unrotate = (p) => ({ x: cb * p.x - sb * p.y, y: sb * p.x + cb * p.y });

    // Höhenverlauf entlang einer Kante (Abtastung knapp hinter der Wand)
    function edgeProfile(a, b, inward) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const n = Math.max(2, Math.ceil(len / res));
      const offs = [0.5 * res, 0.15, 0.3];
      const samples = [];
      for (let k = 0; k < n; k += 1) {
        const sPos = ((k + 0.5) / n) * len;
        const px = a.x + dir.x * sPos, py = a.y + dir.y * sPos;
        let best = -Infinity;
        offs.forEach((d) => {
          const v = Hat(px + inward.x * d, py + inward.y * d);
          if (v > best) best = v;
        });
        samples.push({ s: sPos, h: best });
      }
      return { len, dir, samples };
    }

    // Abschnitt in Teilstücke mit ähnlicher Höhe zerlegen (Giebel abtreppen)
    function splitByHeight(profile) {
      const valid = profile.samples.filter((p) => p.h > -Infinity);
      if (!valid.length) return [];
      if (!o.stepGable) {
        const hmax = Math.max(...valid.map((p) => p.h));
        return [{ from: 0, to: profile.len, hTop: hmax }];
      }
      const runs = [];
      let cur = null;
      valid.forEach((p) => {
        if (cur && Math.max(cur.max, p.h) - Math.min(cur.min, p.h) <= o.stepTol) {
          cur.max = Math.max(cur.max, p.h);
          cur.min = Math.min(cur.min, p.h);
          cur.last = p.s;
        } else {
          cur = { first: p.s, last: p.s, max: p.h, min: p.h };
          runs.push(cur);
        }
      });
      // Grenzen in die Mitte zwischen den Abtastpunkten legen
      runs.forEach((r, i) => {
        r.from = i === 0 ? 0 : (runs[i - 1].last + r.first) / 2;
        r.to = i === runs.length - 1 ? profile.len : (r.last + runs[i + 1].first) / 2;
      });
      // zu kurze Teilstücke mit dem Nachbarn ähnlicher Höhe zusammenlegen
      let merged = true;
      while (merged && runs.length > 1) {
        merged = false;
        for (let i = 0; i < runs.length; i += 1) {
          const r = runs[i];
          if (r.to - r.from >= o.minSection) continue;
          const left = runs[i - 1], right = runs[i + 1];
          let t;
          if (!left) t = right;
          else if (!right) t = left;
          else t = Math.abs(left.max - r.max) <= Math.abs(right.max - r.max) ? left : right;
          t.from = Math.min(t.from, r.from);
          t.to = Math.max(t.to, r.to);
          t.max = Math.max(t.max, r.max);
          t.min = Math.min(t.min, r.min);
          runs.splice(i, 1);
          merged = true;
          break;
        }
      }
      return runs.map((r) => ({ from: r.from, to: r.to, hTop: r.max }));
    }

    // Auskragung (Dachüberstand/Balkon) vor der Wand messen
    function overhangAt(profile, a, outward) {
      const vals = [];
      profile.samples.forEach((p, k) => {
        if (k % 3) return;
        const px = a.x + profile.dir.x * p.s, py = a.y + profile.dir.y * p.s;
        let d = 0;
        for (let step = res; step <= 3; step += res) {
          const v = Hat(px + outward.x * step, py + outward.y * step);
          if (!(v > g + 0.5)) break;
          d = step;
        }
        vals.push(d);
      });
      if (!vals.length) return 0;
      vals.sort((x, y) => x - y);
      return vals[Math.floor(vals.length / 2)];
    }

    // Kette von Kanten (Meter, gedreht; Gebäude rechts) → Abschnitte
    function sectionsFromChain(pts, closed, base, label, measureOverhang) {
      const sections = [];
      const nEdges = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < nEdges; i += 1) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
        // Beim Ablauf im Uhrzeigersinn liegt das Gebäude rechts: rechts = (dir.y, -dir.x)
        const inward = { x: dir.y, y: -dir.x };
        const outward = { x: -inward.x, y: -inward.y };
        const profile = edgeProfile(a, b, inward);
        const runs = splitByHeight(profile);
        const nPlan = unrotate(outward);
        const dirName = compassName(nPlan.x, nPlan.y);
        const overhang = measureOverhang ? overhangAt(profile, a, outward) : 0;
        // Winkel zur nächsten Kante (positiv = Rechtsknick, wie Geometry.turtlePolygon)
        let angle = 90;
        if (closed || i < nEdges - 1) {
          const c2 = pts[(i + 2) % pts.length];
          const l2 = Math.hypot(c2.x - b.x, c2.y - b.y) || 1;
          const d2 = { x: (c2.x - b.x) / l2, y: (c2.y - b.y) / l2 };
          const cross = dir.x * d2.y - dir.y * d2.x;
          const dot = dir.x * d2.x + dir.y * d2.y;
          angle = (-Math.atan2(cross, dot) * 180) / Math.PI;
        }
        const edgeNo = sections.length ? sections[sections.length - 1].edgeNo + 1 : 1;
        if (!runs.length) continue;
        runs.forEach((r, k) => {
          const suffix = runs.length > 1 ? String.fromCharCode(97 + k) : "";
          const hFac = r.hTop - base;
          sections.push({
            edgeNo,
            name: `${label}${edgeNo}${suffix} ${dirName}`,
            length: r.to - r.from,
            facadeHeight: hFac,
            height: Math.max(0.5, hFac + o.topExtra),
            startAbs: Math.max(0, base - g), // Gerüstfuß, m über Gelände
            angle: k < runs.length - 1 ? 0 : angle,
            overhang,
            stepped: runs.length > 1,
            p0: { x: a.x + dir.x * r.from, y: a.y + dir.y * r.from },
            p1: { x: a.x + dir.x * r.to, y: a.y + dir.y * r.to },
          });
        });
      }
      return sections;
    }

    const stories = [];

    // --- Baukörper (Außenumriss)
    bodies.forEach((bodyMask, bi) => {
      const loops = traceLoops(bodyMask, w, h);
      let outer = null, oa = 0;
      loops.forEach((l) => {
        const a = signedArea(l);
        if (a > oa) { oa = a; outer = l; }
      });
      if (!outer) return;
      let ring = simplify(toMeters(outer));
      if (ring.length < 3) return;
      // im Uhrzeigersinn (Gebäude rechts); Start mit der Nordfassade (am
      // weitesten westlich), damit Lageplan und Tabelle "Norden oben" zeigen
      if (signedArea(ring) > 0) ring.reverse();
      let si = 0, bestScore = -Infinity;
      ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length];
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const nOut = unrotate({ x: -(q.y - p.y) / len, y: (q.x - p.x) / len });
        const score = nOut.y * 1000 - unrotate(p).x;
        if (score > bestScore) { bestScore = score; si = i; }
      });
      ring = ring.slice(si).concat(ring.slice(0, si));
      const sections = sectionsFromChain(ring, true, g, "", wallsUsable);
      if (!sections.length) return;
      stories.push({
        kind: "base",
        name: bodies.length > 1 ? `Baukörper ${bi + 1}` : "Gebäude",
        sockelhoehe: 0,
        closed: true,
        sections,
        ring,
      });
    });

    // --- Höhensprünge im Gebäude: Staffelgeschoss / höherer Gebäudeteil / Innenhof
    if (o.detectUpper) {
      const k2 = 2;
      const kFar = Math.max(k2 + 2, Math.round(0.7 / res));
      const lows = [];
      for (let y = kFar; y < h - kFar; y += 1) {
        for (let x = kFar; x < w - kFar; x += 1) {
          const i = y * w + x;
          if (!Pfilled[i]) continue;
          const hi = Hg[i];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = i + (dx + dy * w) * k2;
            const jf = i + (dx + dy * w) * kFar;
            if (!Pfilled[j] || !Pfilled[jf]) continue;
            if (hi - Hg[j] >= o.minStep && Math.abs(Hg[jf] - Hg[j]) < 0.3) lows.push(Hg[j]);
          }
        }
      }
      lows.sort((a, b) => a - b);
      const clusters = [];
      lows.forEach((v) => {
        const cl = clusters[clusters.length - 1];
        if (cl && v - cl.last <= 0.15) { cl.vals.push(v); cl.last = v; }
        else clusters.push({ vals: [v], last: v });
      });
      const levels = clusters
        .filter((cl) => cl.vals.length * res >= 3)
        .map((cl) => cl.vals[Math.floor(cl.vals.length / 2)])
        .slice(0, 8);

      levels.forEach((L) => {
        let M = new Uint8Array(N);
        for (let i = 0; i < N; i += 1) M[i] = Pfilled[i] && Hg[i] > L + o.minStep / 2 ? 1 : 0;
        // Attika, Schornsteine, schmale Gauben (< 1,2 m) entfernen
        M = opening(M, w, h, rCells(0.6));
        M = closing(M, w, h, rCells(o.bridgeWidth / 2));
        const minC = Math.ceil(4 / cellArea);
        components(M, w, h, minC).forEach((cm) => {
          traceLoops(cm, w, h).forEach((loop) => {
            if (Math.abs(signedArea(loop)) * cellArea < 4) return;
            let ring = simplify(toMeters(loop));
            if (ring.length < 3) return;
            // M liegt links → umdrehen, damit der Gebäudeteil rechts liegt
            ring.reverse();
            const n = ring.length;
            const ok = [];
            for (let i = 0; i < n; i += 1) {
              const a = ring[i], b = ring[(i + 1) % n];
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
              const out = { x: -dir.y, y: dir.x };
              let good = 0, tot = 0;
              const ns = Math.max(2, Math.ceil(len / 0.25));
              for (let k = 0; k < ns; k += 1) {
                const sp = ((k + 0.5) / ns) * len;
                const px = a.x + dir.x * sp, py = a.y + dir.y * sp;
                tot += 1;
                const q1 = { x: px + out.x * 0.4, y: py + out.y * 0.4 };
                const q2 = { x: px + out.x * 1.0, y: py + out.y * 1.0 };
                if (!inMask(Pfilled, q1.x, q1.y) || !inMask(Pfilled, q2.x, q2.y)) continue;
                const i1 = cellOf(q1.x, q1.y), i2 = cellOf(q2.x, q2.y);
                if (Math.abs(Hg[i1] - L) < 0.4 && Math.abs(Hg[i2] - L) < 0.4) good += 1;
              }
              ok.push(len >= 0.3 && good >= 0.5 * tot);
            }
            if (!ok.some(Boolean)) return;
            // zusammenhängende Ketten geeigneter Kanten bilden
            const chains = [];
            if (ok.every(Boolean)) {
              chains.push({ pts: ring, closed: true });
            } else {
              const start = ok.findIndex((v, i) => v && !ok[(i - 1 + n) % n]);
              for (let c0 = 0; c0 < n; c0 += 1) {
                const i = (start + c0) % n;
                if (!(ok[i] && !ok[(i - 1 + n) % n])) continue;
                const pts = [ring[i]];
                let j = i;
                while (ok[j]) {
                  pts.push(ring[(j + 1) % n]);
                  j = (j + 1) % n;
                  if (j === i) break;
                }
                chains.push({ pts, closed: false });
              }
            }
            chains.forEach((ch) => {
              const len = ch.pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - ch.pts[i - 1].x, p.y - ch.pts[i - 1].y) : 0), 0)
                + (ch.closed ? Math.hypot(ch.pts[0].x - ch.pts[ch.pts.length - 1].x, ch.pts[0].y - ch.pts[ch.pts.length - 1].y) : 0);
              if (len < 2) return;
              const sections = sectionsFromChain(ch.pts, ch.closed, L, "", false);
              const usable = sections.filter((sct) => sct.facadeHeight >= o.minStep * 0.75);
              if (!usable.length) return;
              const isCourt = L - g < 0.5;
              stories.push({
                kind: isCourt ? "court" : "upper",
                name: isCourt ? "Innenhof" : `Aufbau ab +${(L - g).toFixed(2).replace(".", ",")} m`,
                sockelhoehe: Math.max(0, L - g),
                closed: ch.closed,
                sections,
                ring: ch.pts,
              });
            });
          });
        });
      });
    }

    stories.forEach((st, i) => {
      updateTotals(st);
      st.take = true;
      if (stories.filter((s2) => s2.name === st.name).length > 1) st.name = `${st.name} (${i + 1})`;
    });

    return {
      stories,
      notes,
      ground: g,
      groundAuto,
      zMin,
      zMax,
      theta,
      wallsUsable,
      grid: { w, h, res, minX, minY, H, footprint: Pfilled },
      triangleCount: nTri,
    };
  }

  function updateTotals(st) {
    st.totalLength = st.sections.reduce((sum, x) => sum + x.length, 0);
    st.maxHeight = Math.max(...st.sections.map((x) => x.height));
    st.maxOverhang = Math.max(0, ...st.sections.map((x) => x.overhang || 0));
  }

  // Nach Bearbeitung in der Vorschau: Längen, Winkel, Namen und Summen
  // einer Geschossebene aus den Punkten (p0/p1) neu bestimmen. Gerade
  // durchlaufende Teilstücke (Winkel ≈ 0) behalten eine gemeinsame Nummer
  // mit a, b, c …
  function recomputeStory(result, st) {
    const c = Math.cos(result.theta), sn = Math.sin(result.theta);
    const secs = st.sections;
    const n = secs.length;
    secs.forEach((x) => {
      x.length = Math.hypot(x.p1.x - x.p0.x, x.p1.y - x.p0.y);
    });
    secs.forEach((x, i) => {
      const last = i === n - 1;
      if (last && !st.closed) { x.angle = 90; return; }
      const y = secs[(i + 1) % n];
      const d1 = { x: x.p1.x - x.p0.x, y: x.p1.y - x.p0.y };
      const d2 = { x: y.p1.x - y.p0.x, y: y.p1.y - y.p0.y };
      const cross = d1.x * d2.y - d1.y * d2.x;
      const dot = d1.x * d2.x + d1.y * d2.y;
      x.angle = (-Math.atan2(cross, dot) * 180) / Math.PI;
      if (Math.abs(x.angle) < 0.05) x.angle = 0;
    });
    // Nummerierung
    let no = 0;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && Math.abs(secs[j].angle) < 2) j += 1;
      no += 1;
      for (let k = i; k <= j; k += 1) {
        const x = secs[k];
        const len = x.length || 1;
        // außen = links der Laufrichtung (Gebäude rechts), in Plan-Koordinaten
        const ox = -(x.p1.y - x.p0.y) / len, oy = (x.p1.x - x.p0.x) / len;
        const dir = compassName(c * ox - sn * oy, sn * ox + c * oy);
        const suffix = j > i ? String.fromCharCode(97 + k - i) : "";
        x.edgeNo = no;
        x.stepped = j > i;
        x.name = `${no}${suffix} ${dir}`;
      }
      i = j + 1;
    }
    st.ring = secs.map((x) => x.p0).concat(st.closed ? [] : [secs[n - 1].p1]);
    updateTotals(st);
  }

  // Analyse-Ergebnis → Geschoss-Daten für die Abschnittstabelle
  function planPoint(result, p) {
    const c = Math.cos(result.theta), s = Math.sin(result.theta);
    return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
  }
  // Bezugspunkt (Plan-Koordinaten), auf den sich placement bezieht
  function referencePoint(result, selectedIdx) {
    const chosen = result.stories.filter((_, i) => !selectedIdx || selectedIdx.includes(i));
    return chosen.length ? planPoint(result, chosen[0].sections[0].p0) : { x: 0, y: 0 };
  }

  function toToolStories(result, selectedIdx) {
    const plan = (p) => planPoint(result, p);
    const chosen = result.stories.filter((_, i) => !selectedIdx || selectedIdx.includes(i));
    const ref = referencePoint(result, selectedIdx);
    return chosen
      .map((st) => {
        // Lage im Plan (Startpunkt + Richtung der ersten Kante), damit der
        // Lageplan/3D alle Geschossebenen an ihrer echten Position zeigt
        const a = plan(st.sections[0].p0), b = plan(st.sections[0].p1);
        const heading = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return { st, placement: { x: Math.round((a.x - ref.x) * 1000) / 1000, y: Math.round((a.y - ref.y) * 1000) / 1000, heading: Math.round(heading * 100) / 100 } };
      })
      .map(({ st, placement }) => ({
        placement,
        name: st.name,
        sockelhoehe: Math.round(st.sockelhoehe * 100) / 100,
        cornersConnected: true,
        cornersClosed: st.closed,
        sections: st.sections.map((s) => ({
          name: s.name,
          length: s.length.toFixed(2),
          height: s.height.toFixed(2),
          // abweichender Gerüstfuß (in der Vorschau geändert) – sonst Sockelhöhe
          start: s.startAbs !== undefined && Math.abs(s.startAbs - st.sockelhoehe) >= 0.005 ? s.startAbs.toFixed(2) : "",
          opening: 0,
          angle: Math.round(s.angle * 10) / 10,
          konsole: false,
          konsolenbreite: 0.3,
        })),
      }));
  }

  return {
    parseOBJ,
    parseSTL,
    parseGLTF,
    parseByName,
    extractIfcTriangles,
    guessUpAxis,
    guessScale,
    toPlanCoords,
    extents,
    analyze,
    toToolStories,
    referencePoint,
    recomputeStory,
    TriBuffer,
    DEFAULTS,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ModelScaffold;
