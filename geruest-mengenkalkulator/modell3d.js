"use strict";

// Oberfläche für "3D-Modell → Gerüst automatisch planen": Datei einlesen,
// ModelScaffold.analyze() ausführen, Draufsicht-Vorschau zeichnen und die
// erkannten Geschossebenen in die Abschnittstabelle übernehmen.

const Model3DPlanner = (() => {
  const fileInput = document.getElementById("m3d-file");
  const runBtn = document.getElementById("m3d-run-btn");
  const statusEl = document.getElementById("m3d-status");
  const resultBox = document.getElementById("m3d-result");
  const canvas = document.getElementById("m3d-canvas");
  const notesEl = document.getElementById("m3d-notes");
  const storiesBody = document.getElementById("m3d-stories-body");
  const detailsEl = document.getElementById("m3d-details");
  const applyBtn = document.getElementById("m3d-apply-btn");
  const applyStatus = document.getElementById("m3d-apply-status");

  const COLORS = ["#d62828", "#1d6fd6", "#2a9d5b", "#b5651d", "#7b3fb5", "#0f8b8d", "#c2185b", "#5d6d1f"];

  let raw = null; // { positions, defaultUp, fileName }
  let result = null;
  let planPositions = null; // Modell in Plan-Koordinaten (Meter, z oben) der letzten Auswertung
  let appliedModel = null; // für die 3D-Ansicht: { local: Float32Array (x, y, z relativ zu Bezugspunkt/Gelände) }

  // Das übernommene Modell wird im Browser (IndexedDB) gespeichert, damit es
  // nach dem Neuladen der Seite wieder in der 3D-Ansicht erscheint.
  const DB_NAME = "geruest-kalkulator-modell";
  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("kein IndexedDB")); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("model");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function storeModel(model) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("model", "readwrite");
        tx.objectStore("model").put(model, "applied");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (e) {
      /* Speichern nicht möglich (privates Fenster o. ä.) – Modell bleibt bis zum Neuladen sichtbar */
    }
  }
  async function restoreModel() {
    try {
      const db = await openDb();
      const model = await new Promise((resolve, reject) => {
        const req = db.transaction("model", "readonly").objectStore("model").get("applied");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (model && model.local && !appliedModel) {
        appliedModel = model;
        if (typeof View3D !== "undefined" && View3D.refresh) View3D.refresh();
      }
    } catch (e) {
      /* nichts gespeichert */
    }
  }

  const setStatus = (el, text) => { if (el) el.textContent = text; };
  const fmt = (n, d = 2) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nextFrame = () => new Promise((r) => setTimeout(r, 30));

  async function readIfc(file) {
    if (typeof WebIFC === "undefined" || typeof IfcImport === "undefined" || !IfcImport.getApi) {
      throw new Error("IFC-Unterstützung nicht verfügbar (vendor/web-ifc-api-iife.js konnte nicht geladen werden).");
    }
    const api = await IfcImport.getApi();
    const modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()));
    try {
      return ModelScaffold.extractIfcTriangles(api, modelID, WebIFC);
    } finally {
      try { api.CloseModel(modelID); } catch (e) { /* ignore */ }
    }
  }

  async function loadFile(file) {
    raw = null;
    result = null;
    resultBox.classList.add("hidden");
    runBtn.disabled = true;
    setStatus(statusEl, `„${file.name}“ wird gelesen …`);
    await nextFrame();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      let parsed;
      if (ext === "ifc") parsed = await readIfc(file);
      else parsed = ModelScaffold.parseByName(file.name, await file.arrayBuffer());
      const nTri = parsed.positions.length / 9;
      if (!nTri) throw new Error("Die Datei enthält keine Flächen (Dreiecke).");
      raw = { ...parsed, fileName: file.name };
      runBtn.disabled = false;
      await runAnalysis();
    } catch (e) {
      if (ext === "ifc" && window.location.protocol === "file:") {
        setStatus(statusEl, "IFC-Import kann hier nicht laufen: Die Seite wurde direkt als Datei geöffnet (file://) – bitte über einen lokalen Server oder die Web-Adresse öffnen (siehe Hinweis oben). OBJ, STL und GLB funktionieren auch so.");
      } else {
        setStatus(statusEl, "Modell konnte nicht gelesen werden: " + e.message);
      }
    }
  }

  function readOptions() {
    const num = (id) => {
      const v = document.getElementById(id).value;
      return v === "" ? null : parseFloat(v);
    };
    return {
      up: document.getElementById("m3d-up").value,
      unit: document.getElementById("m3d-unit").value,
      analyze: {
        ground: num("m3d-ground"),
        topExtra: num("m3d-top-extra") ?? 1,
        bridgeWidth: num("m3d-bridge") ?? 1,
        stepTol: Math.max(0.2, num("m3d-step-tol") ?? 1),
        minStep: Math.max(0.5, num("m3d-min-step") ?? 2),
        res: Math.max(0.03, num("m3d-res") ?? 0.1),
        stepGable: document.getElementById("m3d-step-gable").checked,
        detectUpper: document.getElementById("m3d-detect-upper").checked,
        scaffoldStart: Math.max(0, num("m3d-start") ?? 0),
      },
    };
  }

  async function runAnalysis() {
    if (!raw) return;
    const opts = readOptions();
    const up = opts.up === "auto" ? ModelScaffold.guessUpAxis(raw.positions, raw.defaultUp) : opts.up;
    const scale = opts.unit === "auto" ? ModelScaffold.guessScale(raw.positions) : parseFloat(opts.unit);
    const nTri = raw.positions.length / 9;
    setStatus(statusEl, `${nTri.toLocaleString("de-DE")} Dreiecke gelesen – Gerüst wird geplant …`);
    await nextFrame();
    try {
      const plan = ModelScaffold.toPlanCoords(raw.positions, up, scale);
      planPositions = plan;
      const t0 = performance.now();
      result = ModelScaffold.analyze(plan, opts.analyze);
      const unitName = { 1: "m", 0.01: "cm", 0.001: "mm" }[scale] || `Faktor ${scale}`;
      setStatus(
        statusEl,
        `„${raw.fileName}“: ${nTri.toLocaleString("de-DE")} Dreiecke, Hochachse ${up.toUpperCase()}${opts.up === "auto" ? " (automatisch)" : ""}, ` +
          `Einheit ${unitName}${opts.unit === "auto" ? " (automatisch)" : ""}, Gelände ${fmt(result.ground)} m${result.groundAuto ? " (automatisch)" : ""}, ` +
          `Gebäudehöhe bis ${fmt(result.zMax - result.ground)} m. Auswertung in ${Math.round(performance.now() - t0)} ms. ` +
          `Sieht die Vorschau falsch aus (z. B. Ansicht statt Grundriss), unter „Einstellungen“ Hochachse/Einheit umstellen.`
      );
      sel = null;
      undoStack = [];
      if (document.getElementById("m3d-undo-btn")) document.getElementById("m3d-undo-btn").disabled = true;
      renderResult(true);
    } catch (e) {
      result = null;
      resultBox.classList.add("hidden");
      setStatus(statusEl, "Automatische Planung fehlgeschlagen: " + e.message + " – Hochachse, Einheit oder Geländehöhe unter „Einstellungen“ prüfen.");
    }
  }

  // gedrehtes Analyse-System → Plan (Norden = +y)
  function toPlan(p) {
    const c = Math.cos(result.theta), s = Math.sin(result.theta);
    return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
  }

  // ---------------------------------------------------------------
  // Ergebnis-Tabellen
  // ---------------------------------------------------------------
  function renderResult(fit) {
    resultBox.classList.remove("hidden");
    setStatus(applyStatus, "");

    const notes = result.notes.slice();
    const maxOh = Math.max(0, ...result.stories.map((s) => s.maxOverhang || 0));
    if (maxOh >= 0.15) {
      notes.push(
        `Dachüberstand/Auskragung bis ca. ${fmt(maxOh)} m erkannt (Spalte „Dachüberstand“). Das Gerüst ist an der Außenwand geplant – ` +
          `bei Arbeiten an der Traufe Wandabstand bzw. Konsolen/Dachfang entsprechend prüfen.`
      );
    }
    if (result.stories.some((s) => s.kind === "court")) {
      notes.push("Innenhof erkannt: als eigene Geschossebene angelegt (Lageplan zeigt das Gerüst dort nur schematisch).");
    }
    if (result.stories.some((s) => s.sections.some((x) => x.stepped))) {
      notes.push("Giebel bzw. Seiten mit unterschiedlicher Höhe wurden in Teilabschnitte (a, b, c …) abgetreppt.");
    }
    notes.push("Automatischer Vorschlag aus der Modellgeometrie – vor Verwendung prüfen. Nach dem Übernehmen sind alle Werte in der Abschnittstabelle weiter änderbar.");
    notesEl.innerHTML = notes.map((n) => `<li>${esc(n)}</li>`).join("");

    renderTables();
    if (fit) fitView();
    drawPreview();
  }

  function renderTables() {
    storiesBody.innerHTML = result.stories
      .map((st, i) => `
        <tr>
          <td><input type="checkbox" class="m3d-take" data-idx="${i}" ${st.take !== false ? "checked" : ""}></td>
          <td><span class="m3d-swatch" style="background:${COLORS[i % COLORS.length]}"></span>${esc(st.name)}${st.closed ? "" : " <span class=\"hint\">(offener Zug)</span>"}</td>
          <td>${fmt(st.sockelhoehe)}</td>
          <td>${st.sections.length}</td>
          <td>${fmt(st.totalLength)}</td>
          <td>${fmt(st.maxHeight)}</td>
          <td>${st.maxOverhang ? fmt(st.maxOverhang) : "–"}</td>
        </tr>`)
      .join("");

    const open = new Set([...detailsEl.querySelectorAll("details[open]")].map((d) => d.dataset.idx));
    detailsEl.innerHTML = result.stories
      .map((st, i) => `
        <details class="m3d-story-details" data-idx="${i}" ${open.has(String(i)) ? "open" : ""}>
          <summary><span class="m3d-swatch" style="background:${COLORS[i % COLORS.length]}"></span>${esc(st.name)}: Abschnitte anzeigen</summary>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Abschnitt</th><th>Länge (m)</th><th>Start (m)</th><th>Ende (m)</th><th>Gerüsthöhe (m)</th><th>Winkel (°)</th><th>Dachüberstand (m)</th></tr></thead>
              <tbody>
                ${st.sections.map((s) => `<tr><td>${esc(s.name)}</td><td>${fmt(s.length)}</td><td>${fmt(s.startAbs)}</td><td>${fmt(s.startAbs + s.height)}</td><td>${fmt(s.height)}</td><td>${fmt(Math.abs(s.angle) < 0.5 ? 0 : s.angle, 0)}</td><td>${s.overhang ? fmt(s.overhang) : "–"}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </details>`)
      .join("");
  }

  // ---------------------------------------------------------------
  // Vorschau: Ansicht (Zoom/Pan), Zeichnen
  // ---------------------------------------------------------------
  const view = { k: 1, ox: 0, oy: 0, cssW: 600, cssH: 400 };
  let heightImage = null; // zwischengespeichertes Höhenbild je Auswertung
  let heightImageFor = null;
  // Auswahl: { kind: "section", si, i } | { kind: "vertex", si, j } | null
  let sel = null;
  let drag = null;
  let undoStack = [];

  const toScreen = (p) => ({ x: view.ox + view.k * p.x, y: view.oy - view.k * p.y });
  const fromScreen = (q) => ({ x: (q.x - view.ox) / view.k, y: (view.oy - q.y) / view.k });
  // Plan (Norden oben) ↔ gedrehtes Analyse-System, in dem die Punkte gespeichert sind
  function fromPlan(p) {
    const c = Math.cos(result.theta), s2 = Math.sin(result.theta);
    return { x: c * p.x + s2 * p.y, y: -s2 * p.x + c * p.y };
  }

  function sizeCanvas() {
    const wrapW = Math.min(canvas.parentElement.clientWidth || 900, 900);
    view.cssW = wrapW;
    view.cssH = Math.round(Math.min(560, Math.max(320, wrapW * 0.62)));
  }

  function fitView() {
    sizeCanvas();
    const pts = [];
    result.stories.forEach((st) => st.sections.forEach((x) => { pts.push(toPlan(x.p0)); pts.push(toPlan(x.p1)); }));
    if (!pts.length) return;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    pts.forEach((p) => { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x); by1 = Math.max(by1, p.y); });
    const pad = 3;
    bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad;
    view.k = Math.min(view.cssW / (bx1 - bx0), view.cssH / (by1 - by0));
    view.ox = (view.cssW - view.k * (bx1 - bx0)) / 2 - view.k * bx0;
    view.oy = (view.cssH + view.k * (by1 - by0)) / 2 + view.k * by0;
  }

  function buildHeightImage() {
    const { w, h, H } = result.grid;
    const g = result.ground;
    const top = Math.max(g + 1, result.zMax);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d");
    const img = octx.createImageData(w, h);
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        const v = H[j * w + i];
        const o = (j * w + i) * 4;
        if (!(v > g + 0.5)) { img.data[o + 3] = 0; continue; }
        const t = Math.min(1, Math.max(0, (v - g) / (top - g)));
        const c = Math.round(215 - t * 135);
        img.data[o] = c; img.data[o + 1] = c; img.data[o + 2] = c + 6; img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    heightImage = off;
    heightImageFor = result;
  }

  // Ecken einer Geschossebene: j = 0..n (bei geschlossenem Umlauf ist n ≡ 0)
  function vertexCount(st) {
    return st.closed ? st.sections.length : st.sections.length + 1;
  }
  function vertexAt(st, j) {
    return j < st.sections.length ? st.sections[j].p0 : st.sections[st.sections.length - 1].p1;
  }

  function drawPreview() {
    if (!result) return;
    if (heightImageFor !== result) buildHeightImage();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, k } = view;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, cssW, cssH);

    // Höhenbild (gedrehtes Raster → Plan)
    const { res, minX, minY } = result.grid;
    const ct = Math.cos(result.theta), stt = Math.sin(result.theta);
    const origin = toScreen(toPlan({ x: minX, y: minY }));
    ctx.save();
    ctx.setTransform(
      dpr * k * res * ct, -dpr * k * res * stt,
      -dpr * k * res * stt, -dpr * k * res * ct,
      dpr * origin.x, dpr * origin.y
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(heightImage, 0, 0);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Gerüstseiten
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    result.stories.forEach((st, si) => {
      const color = COLORS[si % COLORS.length];
      ctx.globalAlpha = st.take !== false ? 1 : 0.25;
      st.sections.forEach((s, i) => {
        const a = toScreen(toPlan(s.p0)), b = toScreen(toPlan(s.p1));
        const isSel = sel && sel.kind === "section" && sel.si === si && sel.i === i;
        ctx.strokeStyle = isSel ? "#111" : color;
        ctx.lineWidth = isSel ? 6 : 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (isSel) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // Nummer außen neben dem Abschnitt (Gebäude rechts der Laufrichtung,
        // auf dem Bildschirm ist "außen" damit rechts)
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // Nummer auf der Seite gegenüber dem Gerüst-Pfeil
        const sgn = s.flip ? 1 : -1;
        const nx = (sgn * (b.y - a.y)) / len, ny = (-sgn * (b.x - a.x)) / len;
        const mx = (a.x + b.x) / 2 + nx * 11, my = (a.y + b.y) / 2 + ny * 11;
        const label = s.name.split(" ")[0];
        if (len > 12 || isSel) {
          ctx.fillStyle = "rgba(250,250,250,0.85)";
          const tw = ctx.measureText(label).width + 6;
          ctx.fillRect(mx - tw / 2, my - 7, tw, 14);
          ctx.fillStyle = color;
          ctx.fillText(label, mx, my);
        }
      });
      // Pfeil: Seite, auf der das Gerüst steht (Standard = außen, also links
      // der Laufrichtung im Plan; auf dem Bildschirm rechts)
      st.sections.forEach((s) => {
        const arr = sideArrow(s);
        if (!arr) return;
        ctx.strokeStyle = "#e07a00";
        ctx.fillStyle = "#e07a00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(arr.m.x, arr.m.y);
        ctx.lineTo(arr.tip.x, arr.tip.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(arr.tip.x, arr.tip.y);
        ctx.lineTo(arr.w1.x, arr.w1.y);
        ctx.lineTo(arr.w2.x, arr.w2.y);
        ctx.closePath();
        ctx.fill();
      });
      // Ecken als Anfasser
      for (let j = 0; j < vertexCount(st); j += 1) {
        const q = toScreen(toPlan(vertexAt(st, j)));
        const isSel = sel && sel.kind === "vertex" && sel.si === si && sel.j === j;
        ctx.fillStyle = isSel ? "#111" : "#fff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, isSel ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });

    // Maß beim Ziehen
    if (drag && drag.kind === "vertex") {
      const st = result.stories[drag.si];
      const q = toScreen(toPlan(vertexAt(st, drag.j)));
      const lens = adjacentSections(st, drag.j).map((i) => fmt(st.sections[i].length)).join(" / ");
      ctx.font = "600 12px system-ui, sans-serif";
      const tw = ctx.measureText(lens + " m").width + 10;
      ctx.fillStyle = "#1d2124";
      ctx.fillRect(q.x + 10, q.y - 24, tw, 18);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(lens + " m", q.x + 15, q.y - 15);
    }

    // Nordpfeil + Maßstab
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#1d2124";
    ctx.strokeStyle = "#1d2124";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cssW - 24, 14); ctx.lineTo(cssW - 30, 30); ctx.lineTo(cssW - 18, 30); ctx.closePath();
    ctx.fill();
    ctx.fillText("N", cssW - 24, 40);
    const barM = [0.5, 1, 2, 5, 10, 20, 50, 100].find((m) => m * k > 60) || 100;
    ctx.beginPath();
    ctx.moveTo(12, cssH - 14); ctx.lineTo(12 + barM * k, cssH - 14);
    ctx.moveTo(12, cssH - 18); ctx.lineTo(12, cssH - 10);
    ctx.moveTo(12 + barM * k, cssH - 18); ctx.lineTo(12 + barM * k, cssH - 10);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(`${String(barM).replace(".", ",")} m`, 18 + barM * k, cssH - 14);
  }

  // ---------------------------------------------------------------
  // Vorschau bearbeiten
  // ---------------------------------------------------------------
  const editBox = document.getElementById("m3d-edit");
  const ed = (id) => document.getElementById(id);

  function snapshot() {
    undoStack.push(JSON.stringify(result.stories));
    if (undoStack.length > 50) undoStack.shift();
    ed("m3d-undo-btn").disabled = false;
  }
  function undo() {
    if (!undoStack.length) return;
    result.stories = JSON.parse(undoStack.pop());
    ed("m3d-undo-btn").disabled = !undoStack.length;
    sel = null;
    changed();
  }

  function changed(st) {
    if (st) ModelScaffold.recomputeStory(result, st);
    renderTables();
    drawPreview();
    showEditor();
  }

  function adjacentSections(st, j) {
    const n = st.sections.length;
    const out = [];
    if (j > 0 || st.closed) out.push((j - 1 + n) % n);
    if (j < n) out.push(j % n);
    return out;
  }

  function setVertex(st, j, p) {
    const n = st.sections.length;
    if (j < n) st.sections[j].p0 = { x: p.x, y: p.y };
    if (j > 0) st.sections[j - 1].p1 = { x: p.x, y: p.y };
    if (j === 0 && st.closed) st.sections[n - 1].p1 = { x: p.x, y: p.y };
    if (j === n) st.sections[n - 1].p1 = { x: p.x, y: p.y };
  }

  // Bildschirm-Geometrie des Seitenpfeils eines Abschnitts
  function sideArrow(s) {
    const a = toScreen(toPlan(s.p0)), b = toScreen(toPlan(s.p1));
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 14) return null;
    const sgn = s.flip ? -1 : 1;
    const nx = (sgn * (b.y - a.y)) / len, ny = (-sgn * (b.x - a.x)) / len;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const tip = { x: m.x + nx * 20, y: m.y + ny * 20 };
    const bx = m.x + nx * 11, by = m.y + ny * 11;
    return {
      m, tip,
      w1: { x: bx + ny * 5, y: by - nx * 5 },
      w2: { x: bx - ny * 5, y: by + nx * 5 },
      hit: { x: m.x + nx * 14, y: m.y + ny * 14 },
    };
  }

  function hitTest(q) {
    let best = null;
    // Seitenpfeile
    result.stories.forEach((st, si) => {
      st.sections.forEach((s, i) => {
        const arr = sideArrow(s);
        if (!arr) return;
        const d = Math.hypot(arr.hit.x - q.x, arr.hit.y - q.y);
        if (d < 10 && (!best || d < best.d)) best = { kind: "arrow", si, i, d };
      });
    });
    if (best) return best;
    // Ecken zuerst (Radius 9 px)
    result.stories.forEach((st, si) => {
      for (let j = 0; j < vertexCount(st); j += 1) {
        const v = toScreen(toPlan(vertexAt(st, j)));
        const d = Math.hypot(v.x - q.x, v.y - q.y);
        if (d < 9 && (!best || d < best.d)) best = { kind: "vertex", si, j, d };
      }
    });
    if (best) return best;
    result.stories.forEach((st, si) => {
      st.sections.forEach((s, i) => {
        const a = toScreen(toPlan(s.p0)), b = toScreen(toPlan(s.p1));
        const dx = b.x - a.x, dy = b.y - a.y;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
        const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y);
        if (d < 7 && (!best || d < best.d)) best = { kind: "section", si, i, d, t };
      });
    });
    return best;
  }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * view.cssW, y: ((e.clientY - r.top) / r.height) * view.cssH };
  }

  // Punkt beim Ziehen auf 1 cm runden und an Nachbarecken rechtwinklig
  // einrasten (im gedrehten System sind die Wände achsparallel). Alt = frei.
  function snapVertex(st, j, p, free) {
    if (free) return p;
    const tol = 8 / view.k;
    const out = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    const n = vertexCount(st);
    [j - 1, j + 1].forEach((jj) => {
      if (!st.closed && (jj < 0 || jj >= n)) return;
      const nb = vertexAt(st, (jj + n) % n);
      if (Math.abs(nb.x - out.x) < tol) out.x = nb.x;
      if (Math.abs(nb.y - out.y) < tol) out.y = nb.y;
    });
    return out;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!result) return;
    const q = canvasPos(e);
    const hit = hitTest(q);
    canvas.setPointerCapture(e.pointerId);
    if (hit && hit.kind === "arrow" && e.button === 0) {
      const st = result.stories[hit.si];
      snapshot();
      st.sections[hit.i].flip = !st.sections[hit.i].flip;
      sel = { kind: "section", si: hit.si, i: hit.i };
      drag = null;
      changed(st);
      return;
    }
    if (hit && hit.kind === "vertex" && e.button === 0) {
      snapshot();
      drag = { kind: "vertex", si: hit.si, j: hit.j, moved: false, start: q };
      sel = { kind: "vertex", si: hit.si, j: hit.j };
    } else if (hit && hit.kind === "section" && e.button === 0) {
      sel = { kind: "section", si: hit.si, i: hit.i };
      drag = null;
    } else {
      drag = { kind: "pan", last: q, start: q, moved: false };
    }
    drawPreview();
    showEditor();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) {
      const hit = result && hitTest(canvasPos(e));
      canvas.style.cursor = hit ? (hit.kind === "vertex" ? "move" : "pointer") : "grab";
      canvas.title = hit && hit.kind === "arrow" ? "Gerüst auf die andere Seite der Linie setzen" : "";
      return;
    }
    const q = canvasPos(e);
    if (drag.kind === "pan") {
      view.ox += q.x - drag.last.x;
      view.oy += q.y - drag.last.y;
      drag.last = q;
      if (Math.hypot(q.x - drag.start.x, q.y - drag.start.y) > 4) drag.moved = true;
      drawPreview();
    } else if (drag.kind === "vertex") {
      if (!drag.moved && Math.hypot(q.x - drag.start.x, q.y - drag.start.y) < 3) return;
      drag.moved = true;
      const st = result.stories[drag.si];
      setVertex(st, drag.j, snapVertex(st, drag.j, fromPlan(fromScreen(q)), e.altKey));
      ModelScaffold.recomputeStory(result, st);
      drawPreview();
    }
  });
  canvas.addEventListener("pointerup", () => {
    if (drag && drag.kind === "vertex") {
      if (!drag.moved) undoStack.pop(); // nur angeklickt, nichts geändert
      else changed(result.stories[drag.si]);
    }
    if (drag && drag.kind === "pan" && !drag.moved) {
      sel = null; // Klick ins Leere hebt die Auswahl auf
      drawPreview();
      showEditor();
    }
    drag = null;
  });
  canvas.addEventListener("wheel", (e) => {
    if (!result) return;
    e.preventDefault();
    const q = canvasPos(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const before = fromScreen(q);
    view.k = Math.min(400, Math.max(1, view.k * f));
    view.ox = q.x - view.k * before.x;
    view.oy = q.y + view.k * before.y;
    drawPreview();
  }, { passive: false });
  // Doppelklick auf eine Linie = Ecke einfügen
  canvas.addEventListener("dblclick", (e) => {
    if (!result) return;
    const hit = hitTest(canvasPos(e));
    if (hit && hit.kind === "section") splitSection(hit.si, hit.i, hit.t);
  });
  // Rechtsklick auf eine Ecke = Ecke entfernen
  canvas.addEventListener("contextmenu", (e) => {
    if (!result) return;
    const hit = hitTest(canvasPos(e));
    if (hit && hit.kind === "vertex") {
      e.preventDefault();
      removeVertex(hit.si, hit.j);
    }
  });

  function splitSection(si, i, t = 0.5) {
    const st = result.stories[si];
    const s = st.sections[i];
    snapshot();
    const tt = Math.min(0.9, Math.max(0.1, t));
    const m = { x: s.p0.x + (s.p1.x - s.p0.x) * tt, y: s.p0.y + (s.p1.y - s.p0.y) * tt };
    const second = { ...s, p0: { ...m }, p1: { ...s.p1 } };
    if (s.customName) second.name = `${s.name} (2)`;
    s.p1 = { ...m };
    st.sections.splice(i + 1, 0, second);
    sel = { kind: "vertex", si, j: i + 1 };
    changed(st);
  }

  function removeVertex(si, j) {
    const st = result.stories[si];
    const n = st.sections.length;
    if ((st.closed && n <= 3) || (!st.closed && n <= 1)) {
      setStatus(applyStatus, "Diese Ecke kann nicht entfernt werden – zu wenige Abschnitte übrig.");
      return;
    }
    snapshot();
    if (!st.closed && (j === 0 || j === n)) {
      // Endpunkt eines offenen Zugs: äußersten Abschnitt weglassen
      st.sections.splice(j === 0 ? 0 : n - 1, 1);
    } else {
      // zwei Abschnitte zu einem zusammenfassen (Höhe = höhere, Start = tieferer)
      const iPrev = (j - 1 + n) % n, iNext = j % n;
      const a = st.sections[iPrev], b = st.sections[iNext];
      const end = Math.max(a.startAbs + a.height, b.startAbs + b.height);
      a.startAbs = Math.min(a.startAbs, b.startAbs);
      a.height = end - a.startAbs;
      a.overhang = Math.max(a.overhang || 0, b.overhang || 0);
      a.p1 = { ...b.p1 };
      st.sections.splice(iNext, 1);
      if (iNext === 0) {
        // die zusammengefasste Seite ist jetzt die letzte – an den Anfang holen
        st.sections.unshift(st.sections.pop());
      }
    }
    sel = null;
    changed(st);
  }

  function removeSection(si, i) {
    const st = result.stories[si];
    const n = st.sections.length;
    if (n <= 1) {
      setStatus(applyStatus, "Letzter Abschnitt – zum Weglassen der ganzen Geschossebene das Häkchen „Übernehmen“ entfernen.");
      return;
    }
    snapshot();
    if (st.closed) {
      // Umlauf wird zum offenen Zug, der hinter der Lücke beginnt
      st.sections = st.sections.slice(i + 1).concat(st.sections.slice(0, i));
      st.closed = false;
    } else if (i === 0 || i === n - 1) {
      st.sections.splice(i, 1);
    } else {
      // Lücke mitten im Zug: in zwei Geschossebenen aufteilen
      const tail = { ...st, sections: st.sections.slice(i + 1), name: `${st.name} (Teil 2)` };
      st.sections = st.sections.slice(0, i);
      result.stories.splice(si + 1, 0, tail);
      ModelScaffold.recomputeStory(result, tail);
    }
    sel = null;
    changed(st);
  }

  function showEditor() {
    if (!editBox) return;
    const st = sel && result && result.stories[sel.si];
    if (!st) {
      editBox.classList.add("hidden");
      return;
    }
    editBox.classList.remove("hidden");
    ed("m3d-ed-sockel").value = r2(st.sockelhoehe);
    ed("m3d-ed-story-name").value = st.name;
    const isSec = sel.kind === "section";
    editBox.querySelectorAll(".m3d-ed-sec").forEach((el) => el.classList.toggle("hidden", !isSec));
    editBox.querySelectorAll(".m3d-ed-vtx").forEach((el) => el.classList.toggle("hidden", isSec));
    if (isSec) {
      const s = st.sections[sel.i];
      ed("m3d-ed-title").textContent = `${st.name} – Abschnitt ${s.name} (${fmt(s.length)} m)`;
      ed("m3d-ed-start").value = r2(s.startAbs);
      ed("m3d-ed-end").value = r2(s.startAbs + s.height);
      ed("m3d-ed-height").value = r2(s.height);
      ed("m3d-ed-length").value = r2(s.length);
      ed("m3d-ed-name").value = s.name;
      ed("m3d-ed-flip").value = s.flip ? "1" : "";
      ed("m3d-ed-konsole").checked = Boolean(s.konsole);
      ed("m3d-ed-konsolenbreite").value = r2(s.konsolenbreite !== undefined ? s.konsolenbreite : 0.3);
      ed("m3d-ed-konsolenbreite").disabled = !s.konsole;
      ed("m3d-ed-konsole-seite").value = s.konsoleSeite === "innen" ? "innen" : "aussen";
      ed("m3d-ed-konsole-seite").disabled = !s.konsole;
    } else {
      ed("m3d-ed-title").textContent = `${st.name} – Ecke ${sel.j + 1}`;
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;

  function editSection(fn) {
    const st = sel && result.stories[sel.si];
    if (!st || sel.kind !== "section") return;
    snapshot();
    fn(st.sections[sel.i], st);
    changed(st);
  }
  const numVal = (id) => parseFloat(ed(id).value);
  if (editBox) {
    ed("m3d-ed-start").addEventListener("change", () => {
      const v = numVal("m3d-ed-start");
      if (!isNaN(v)) editSection((s) => { const end = s.startAbs + s.height; s.startAbs = Math.max(0, v); s.height = Math.max(0.1, end - s.startAbs); });
    });
    ed("m3d-ed-end").addEventListener("change", () => {
      const v = numVal("m3d-ed-end");
      if (!isNaN(v)) editSection((s) => { s.height = Math.max(0.1, v - s.startAbs); });
    });
    ed("m3d-ed-height").addEventListener("change", () => {
      const v = numVal("m3d-ed-height");
      if (!isNaN(v)) editSection((s) => { s.height = Math.max(0.1, v); });
    });
    // Länge ändern: Endpunkt in Laufrichtung verschieben (folgende Seite passt sich an)
    ed("m3d-ed-length").addEventListener("change", () => {
      const v = numVal("m3d-ed-length");
      if (isNaN(v) || v <= 0.1) return;
      editSection((s, st) => {
        const len = Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) || 1;
        const p = { x: s.p0.x + ((s.p1.x - s.p0.x) / len) * v, y: s.p0.y + ((s.p1.y - s.p0.y) / len) * v };
        setVertex(st, sel.i + 1 === st.sections.length && st.closed ? 0 : sel.i + 1, p);
      });
    });
    ed("m3d-ed-sockel").addEventListener("change", () => {
      const v = numVal("m3d-ed-sockel");
      const st = sel && result.stories[sel.si];
      if (isNaN(v) || !st) return;
      snapshot();
      const old = st.sockelhoehe;
      st.sockelhoehe = Math.max(0, v);
      // Abschnitte, die auf der alten Sockelhöhe standen, gehen mit
      st.sections.forEach((s) => { if (Math.abs(s.startAbs - old) < 0.005) s.startAbs = st.sockelhoehe; });
      changed(st);
    });
    ed("m3d-ed-name").addEventListener("change", () => {
      const v = ed("m3d-ed-name").value.trim();
      if (v) editSection((s) => { s.name = v; s.customName = true; });
    });
    ed("m3d-ed-flip").addEventListener("change", () => editSection((s) => { s.flip = ed("m3d-ed-flip").value === "1"; }));
    ed("m3d-ed-story-name").addEventListener("change", () => {
      const v = ed("m3d-ed-story-name").value.trim();
      const st = sel && result.stories[sel.si];
      if (!v || !st) return;
      snapshot();
      st.name = v;
      changed(st);
    });
    ed("m3d-ed-konsole").addEventListener("change", () => editSection((s) => {
      s.konsole = ed("m3d-ed-konsole").checked;
      if (s.konsolenbreite === undefined) s.konsolenbreite = 0.3;
    }));
    ed("m3d-ed-konsolenbreite").addEventListener("change", () => {
      const v = numVal("m3d-ed-konsolenbreite");
      if (!isNaN(v)) editSection((s) => { s.konsolenbreite = Math.max(0, v); });
    });
    ed("m3d-ed-konsole-seite").addEventListener("change", () => editSection((s) => {
      s.konsoleSeite = ed("m3d-ed-konsole-seite").value;
    }));
    ed("m3d-ed-start-reset").addEventListener("click", () => {
      const st = sel && result.stories[sel.si];
      if (!st) return;
      snapshot();
      st.sections.forEach((s) => {
        const end = s.startAbs + s.height;
        s.startAbs = st.sockelhoehe;
        s.height = Math.max(0.1, end - s.startAbs);
      });
      changed(st);
    });
    ed("m3d-ed-split").addEventListener("click", () => sel && sel.kind === "section" && splitSection(sel.si, sel.i, 0.5));
    ed("m3d-ed-remove").addEventListener("click", () => sel && sel.kind === "section" && removeSection(sel.si, sel.i));
    ed("m3d-ed-remove-vtx").addEventListener("click", () => sel && sel.kind === "vertex" && removeVertex(sel.si, sel.j));
    ed("m3d-ed-close").addEventListener("click", () => { sel = null; drawPreview(); showEditor(); });
    ed("m3d-undo-btn").addEventListener("click", undo);
    ed("m3d-fit-btn").addEventListener("click", () => { fitView(); drawPreview(); });
  }

  function applyToTool() {
    if (!result) return;
    const idx = result.stories.map((st, i) => (st.take !== false ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) {
      setStatus(applyStatus, "Bitte mindestens eine Geschossebene zum Übernehmen auswählen.");
      return;
    }
    const stories = ModelScaffold.toToolStories(result, idx);
    // Bezugspunkt der Geschoss-Lagen (siehe toToolStories) für die 3D-Ansicht
    const ref = ModelScaffold.referencePoint(result, idx);
    const local = new Float32Array(planPositions.length);
    for (let i = 0; i < planPositions.length; i += 3) {
      local[i] = planPositions[i] - ref.x;
      local[i + 1] = planPositions[i + 1] - ref.y;
      local[i + 2] = planPositions[i + 2] - result.ground;
    }
    appliedModel = { local, fileName: raw.fileName };
    storeModel(appliedModel);
    window.dispatchEvent(new CustomEvent("model-stories-apply", { detail: { stories } }));
    const n = stories.reduce((sum, s) => sum + s.sections.length, 0);
    setStatus(applyStatus, `${stories.length} Geschossebene(n) mit ${n} Abschnitten übernommen und berechnet.`);
  }

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) loadFile(f);
  });
  runBtn.addEventListener("click", runAnalysis);
  applyBtn.addEventListener("click", applyToTool);
  storiesBody.addEventListener("change", (e) => {
    if (!result || !e.target.classList.contains("m3d-take")) return;
    result.stories[Number(e.target.dataset.idx)].take = e.target.checked;
    drawPreview();
  });
  window.addEventListener("resize", () => {
    if (result && !resultBox.classList.contains("hidden")) {
      fitView();
      drawPreview();
    }
  });

  restoreModel();

  // Bildschirmposition eines Punkts der Vorschau (für automatisierte Tests)
  function previewScreenPos(si, j) {
    const st = result && result.stories[si];
    return st ? toScreen(toPlan(vertexAt(st, j))) : null;
  }

  return { loadFile, runAnalysis, getAppliedModel: () => appliedModel, previewScreenPos };
})();
