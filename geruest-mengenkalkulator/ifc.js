"use strict";

// IFC (BIM) import: reads an .ifc file entirely client-side (nothing is
// uploaded anywhere), lists its building storeys, and proposes wall
// centerline segments per storey plus a rough roof-overhang suggestion.
// This is a best-effort geometric estimate, not an exact survey — the
// proposed points always land in PlanTrace's normal editable canvas
// (drag to correct, right-click to delete) before being applied.

const IfcImport = (() => {
  const storeySelect = document.getElementById("ifc-storey-select");
  const loadStoreyBtn = document.getElementById("ifc-load-storey-btn");
  const storeyStatus = document.getElementById("ifc-storey-status");
  const roofBox = document.getElementById("ifc-roof-box");
  const roofStatus = document.getElementById("ifc-roof-status");
  const roofApplyBtn = document.getElementById("ifc-roof-apply-btn");
  const fileStatus = document.getElementById("plan-file-status");

  const WALL_TYPES = ["IFCWALL", "IFCWALLSTANDARDCASE"];
  const ROOF_SLAB_TYPES = ["IFCROOF", "IFCSLAB"];

  let ifcApi = null;
  let modelID = null;
  let storeys = []; // { expressID, name, elevation, elements }
  let suggestedOverhang = 0;

  const available = typeof WebIFC !== "undefined";
  if (!available && fileStatus) {
    // handled lazily in handleFile() so the message only appears when an
    // .ifc file is actually chosen, not on every page load.
  }

  async function ensureApi() {
    if (ifcApi) return ifcApi;
    ifcApi = new WebIFC.IfcAPI();
    ifcApi.SetWasmPath("vendor/", true);
    await ifcApi.Init(undefined, true); // forceSingleThread: no COOP/COEP headers required
    return ifcApi;
  }

  function setStatus(el, text) {
    if (el) el.textContent = text;
  }

  function applyMat4(m, p) {
    return {
      x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
      y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
      z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    };
  }

  // Long-axis centerline of a point cloud via 2D PCA (eigenvector of the
  // largest-eigenvalue of the covariance matrix), robust to walls that
  // aren't perfectly axis-aligned or have a slightly irregular footprint.
  function pcaAxisSegment(pts) {
    const n = pts.length;
    let cx = 0, cy = 0;
    pts.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= n; cy /= n;
    let sxx = 0, syy = 0, sxy = 0;
    pts.forEach((p) => {
      const dx = p.x - cx, dy = p.y - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    });
    sxx /= n; syy /= n; sxy /= n;
    const trace = sxx + syy;
    const det = sxx * syy - sxy * sxy;
    const lambda1 = trace / 2 + Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    let ex, ey;
    if (Math.abs(sxy) > 1e-9) {
      ex = lambda1 - syy; ey = sxy;
    } else if (sxx >= syy) {
      ex = 1; ey = 0;
    } else {
      ex = 0; ey = 1;
    }
    const elen = Math.hypot(ex, ey) || 1;
    ex /= elen; ey /= elen;
    let minT = Infinity, maxT = -Infinity;
    pts.forEach((p) => {
      const t = (p.x - cx) * ex + (p.y - cy) * ey;
      minT = Math.min(minT, t); maxT = Math.max(maxT, t);
    });
    return { a: { x: cx + ex * minT, y: cy + ey * minT }, b: { x: cx + ex * maxT, y: cy + ey * maxT } };
  }

  function worldPointsForElement(expressID) {
    const flatMesh = ifcApi.GetFlatMesh(modelID, expressID);
    const pts = [];
    const geoms = flatMesh.geometries;
    for (let i = 0; i < geoms.size(); i += 1) {
      const pg = geoms.get(i);
      const geom = ifcApi.GetGeometry(modelID, pg.geometryExpressID);
      const vData = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      for (let v = 0; v < vData.length; v += 6) {
        pts.push(applyMat4(pg.flatTransformation, { x: vData[v], y: vData[v + 1], z: vData[v + 2] }));
      }
    }
    return pts;
  }

  function wallCenterlineSegment(expressID) {
    const pts = worldPointsForElement(expressID);
    if (pts.length < 3) return null;
    let minZ = Infinity;
    pts.forEach((p) => { minZ = Math.min(minZ, p.z); });
    const basePts = pts.filter((p) => p.z < minZ + 0.15);
    return pcaAxisSegment(basePts.length >= 3 ? basePts : pts);
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function chainLength(chain) {
    let sum = 0;
    for (let i = 0; i < chain.length - 1; i += 1) sum += dist(chain[i], chain[i + 1]);
    return sum;
  }

  // Same nearest-endpoint chaining approach used for loose DXF LINE
  // entities: connect wall segments into the longest continuous outline.
  function chainWallSegments(rawSegments) {
    const segs = rawSegments.map((s) => ({ a: s.a, b: s.b, used: false }));
    if (!segs.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    segs.forEach((s) => [s.a, s.b].forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }));
    const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
    const tol = Math.max(diag * 0.03, 0.15); // wall centerlines rarely meet exactly

    function chainFrom(startIdx) {
      let chain = [segs[startIdx].a, segs[startIdx].b];
      segs[startIdx].used = true;
      let extended = true;
      while (extended) {
        extended = false;
        const tail = chain[chain.length - 1];
        const head = chain[0];
        for (const s of segs) {
          if (s.used) continue;
          if (dist(s.a, tail) < tol) { chain.push(s.b); s.used = true; extended = true; }
          else if (dist(s.b, tail) < tol) { chain.push(s.a); s.used = true; extended = true; }
          else if (dist(s.a, head) < tol) { chain.unshift(s.b); s.used = true; extended = true; }
          else if (dist(s.b, head) < tol) { chain.unshift(s.a); s.used = true; extended = true; }
        }
      }
      return chain;
    }

    const chains = [];
    for (let i = 0; i < segs.length; i += 1) {
      if (!segs[i].used) chains.push(chainFrom(i));
    }
    chains.sort((a, b) => chainLength(b) - chainLength(a));
    const best = chains[0];
    const closed = best.length > 2 && dist(best[0], best[best.length - 1]) < tol;
    const points = closed ? best.slice(0, -1) : best;
    return { points, closed, chainCount: chains.length, usedCount: points.length, totalCount: rawSegments.length };
  }

  function bboxOf(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  async function handleFile(file) {
    if (!available) {
      setStatus(fileStatus, "IFC-Unterstützung nicht verfügbar (vendor/web-ifc-api-iife.js konnte nicht geladen werden).");
      return;
    }
    setStatus(fileStatus, "IFC-Datei wird geladen und im Browser geparst (kann bei großen Dateien einen Moment dauern) …");
    storeySelect.innerHTML = "";
    loadStoreyBtn.disabled = true;
    roofBox.classList.add("hidden");
    setStatus(storeyStatus, "");
    setStatus(roofStatus, "");

    try {
      const api = await ensureApi();
      const buffer = new Uint8Array(await file.arrayBuffer());
      if (modelID !== null) {
        try { api.CloseModel(modelID); } catch (e) { /* ignore */ }
      }
      modelID = api.OpenModel(buffer);

      const tree = await api.properties.getSpatialStructure(modelID, false);
      storeys = [];
      (function walk(node) {
        if ((node.type || "").toUpperCase() === "IFCBUILDINGSTOREY") storeys.push({ node, elements: [] });
        (node.children || []).forEach(walk);
      })(tree);
      storeys.forEach((s) => {
        (function collect(node, bucket) {
          (node.children || []).forEach((c) => {
            if ((c.type || "").toUpperCase() === "IFCBUILDINGSTOREY") return;
            bucket.push(c);
            collect(c, bucket);
          });
        })(s.node, s.elements);
      });

      if (!storeys.length) {
        setStatus(fileStatus, "Keine IfcBuildingStorey (Geschosse) im Modell gefunden.");
        return;
      }

      storeys.forEach((s, i) => {
        const line = api.GetLine(modelID, s.node.expressID);
        s.name = line.Name?.value || `Geschoss ${i + 1}`;
        s.elevation = typeof line.Elevation?.value === "number" ? line.Elevation.value : 0;
      });
      storeys.sort((a, b) => a.elevation - b.elevation);

      storeySelect.innerHTML = storeys
        .map((s, i) => {
          const wallCount = s.elements.filter((e) => WALL_TYPES.includes((e.type || "").toUpperCase())).length;
          return `<option value="${i}">${escapeHtml(s.name)} (Höhe ${s.elevation.toFixed(2)} m, ${wallCount} Wände)</option>`;
        })
        .join("");
      loadStoreyBtn.disabled = false;
      setStatus(
        fileStatus,
        `IFC geladen: ${storeys.length} Geschoss(e) gefunden. Geschoss wählen und „Wandlinien vorschlagen“ klicken.`
      );

      computeRoofOverhang(api);
    } catch (e) {
      if (window.location.protocol === "file:") {
        setStatus(
          fileStatus,
          "IFC-Import kann hier nicht laufen: Die Seite wurde direkt als Datei geöffnet (file://), und Browser blockieren aus " +
            "Sicherheitsgründen das Nachladen der IFC-Bibliothek (WASM) dabei. Abhilfe: die Seite über einen lokalen Server oder " +
            "eine echte Web-Adresse (http/https) öffnen – siehe Hinweis oben und README."
        );
      } else {
        setStatus(fileStatus, "IFC-Datei konnte nicht gelesen werden: " + e.message);
      }
    }
  }

  function computeRoofOverhang(api) {
    try {
      const allTypeIDs = [];
      ROOF_SLAB_TYPES.forEach((t) => {
        const enumVal = WebIFC[t];
        if (typeof enumVal === "number") allTypeIDs.push(enumVal);
      });
      let roofPts = [];
      allTypeIDs.forEach((typeID) => {
        const ids = api.GetLineIDsWithType(modelID, typeID);
        for (let i = 0; i < ids.size(); i += 1) {
          const id = ids.get(i);
          if (typeID === WebIFC.IFCSLAB) {
            const line = api.GetLine(modelID, id);
            const predefined = line.PredefinedType?.value;
            if (predefined !== "ROOF") continue;
          }
          try {
            roofPts = roofPts.concat(worldPointsForElement(id));
          } catch (e) { /* skip unreadable geometry */ }
        }
      });
      if (roofPts.length < 3) {
        roofBox.classList.add("hidden");
        suggestedOverhang = 0;
        return;
      }
      const roofBBox = bboxOf(roofPts);

      // Compare against the widest storey's wall footprint as a rough
      // proxy for the building envelope beneath the roof.
      let widest = null;
      storeys.forEach((s) => {
        const wallIds = s.elements.filter((e) => WALL_TYPES.includes((e.type || "").toUpperCase())).map((e) => e.expressID);
        let pts = [];
        wallIds.forEach((id) => {
          try { pts = pts.concat(worldPointsForElement(id)); } catch (e) { /* skip */ }
        });
        if (pts.length < 3) return;
        const bb = bboxOf(pts);
        if (!widest || bb.w * bb.h > widest.w * widest.h) widest = bb;
      });
      if (!widest) {
        roofBox.classList.add("hidden");
        suggestedOverhang = 0;
        return;
      }

      const overhangX = Math.max(0, (roofBBox.w - widest.w) / 2);
      const overhangY = Math.max(0, (roofBBox.h - widest.h) / 2);
      suggestedOverhang = Math.max(overhangX, overhangY);

      if (suggestedOverhang < 0.05) {
        roofBox.classList.add("hidden");
        return;
      }
      roofBox.classList.remove("hidden");
      setStatus(
        roofStatus,
        `Dachgeometrie gefunden: Dach ist grob ${fmtNum(overhangX)} m (X) / ${fmtNum(overhangY)} m (Y) größer als die Wandumrisse der flächenmäßig größten Etage – geschätzter Dachüberstand ≈ ${fmtNum(
          suggestedOverhang
        )} m. Grobe Schätzung über die Gesamt-Bounding-Box, nicht pro Seite – bitte gegen den echten Plan prüfen.`
      );
    } catch (e) {
      roofBox.classList.add("hidden");
      suggestedOverhang = 0;
    }
  }

  function fmtNum(n) {
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  loadStoreyBtn.addEventListener("click", () => {
    const idx = Number(storeySelect.value);
    const storey = storeys[idx];
    if (!storey) return;
    const walls = storey.elements.filter((e) => WALL_TYPES.includes((e.type || "").toUpperCase()));
    if (!walls.length) {
      setStatus(storeyStatus, "Keine Wände in diesem Geschoss gefunden.");
      return;
    }
    const rawSegments = [];
    let failed = 0;
    walls.forEach((w) => {
      const seg = wallCenterlineSegment(w.expressID);
      if (seg && Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) > 0.05) rawSegments.push(seg);
      else failed += 1;
    });
    if (!rawSegments.length) {
      setStatus(storeyStatus, "Aus den Wänden dieses Geschosses konnte keine Geometrie ausgewertet werden.");
      return;
    }
    const result = chainWallSegments(rawSegments);
    const failedNote = failed ? `, ${failed} Wand(e) ohne auswertbare Geometrie` : "";

    // Only trust a fully closed, single chain as a ready-to-use outline —
    // anything messier (T-junctions from interior walls confuse simple
    // endpoint-chaining) is shown as reference lines to trace over instead
    // of risking a wrong-looking "automatic" result.
    if (result && result.closed && result.chainCount === 1) {
      const note =
        `Automatischer Vorschlag aus ${walls.length} Wänden, zu einem geschlossenen Umriss mit ${result.usedCount} Punkten verkettet${failedNote}. ` +
        `Dies ist eine Schätzung aus der Wandgeometrie – bitte im Zeichenbereich prüfen: falsche/doppelte Linien per Rechtsklick löschen, Punkte bei Bedarf verschieben, dann „Fertig“.`;
      PlanTrace.loadPoints(result.points, result.closed, note);
      setStatus(storeyStatus, `${storey.name}: ${note}`);
    } else {
      const note =
        `Die ${walls.length} Wandmittellinien dieses Geschosses ließen sich nicht eindeutig automatisch zu einem Umriss verketten` +
        `${failedNote} (das passiert v. a. wenn Innenwände die Konturlinie stören) – sie werden unten als graue Hilfslinien angezeigt. ` +
        `Bitte auf „Punkte anklicken“ klicken und den Gebäudeumriss entlang der Hilfslinien selbst abklicken, dann „Fertig“.`;
      PlanTrace.setReferenceSegments(rawSegments, note);
      setStatus(storeyStatus, `${storey.name}: ${note}`);
    }
  });

  roofApplyBtn.addEventListener("click", () => {
    if (suggestedOverhang <= 0) return;
    const wandabstandInput = document.getElementById("wandabstand");
    const current = parseFloat(wandabstandInput.value) || 0;
    wandabstandInput.value = (current + suggestedOverhang).toFixed(2);
    wandabstandInput.dispatchEvent(new Event("input", { bubbles: true }));
    setStatus(roofStatus, `Wandabstand um ${fmtNum(suggestedOverhang)} m auf ${wandabstandInput.value} m erhöht (Einstellungen oben).`);
  });

  return { handleFile };
})();
