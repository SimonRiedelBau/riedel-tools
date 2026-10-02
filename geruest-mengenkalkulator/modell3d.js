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
  let appliedModel = null; // für die 3D-Ansicht: { positions, ref, ground }

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
      renderResult();
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

  function renderResult() {
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

    storiesBody.innerHTML = result.stories
      .map((st, i) => `
        <tr>
          <td><input type="checkbox" class="m3d-take" data-idx="${i}" checked></td>
          <td><span class="m3d-swatch" style="background:${COLORS[i % COLORS.length]}"></span>${esc(st.name)}${st.closed ? "" : " <span class=\"hint\">(offener Zug)</span>"}</td>
          <td>${fmt(st.sockelhoehe)}</td>
          <td>${st.sections.length}</td>
          <td>${fmt(st.totalLength)}</td>
          <td>${fmt(st.maxHeight)}</td>
          <td>${st.maxOverhang ? fmt(st.maxOverhang) : "–"}</td>
        </tr>`)
      .join("");

    detailsEl.innerHTML = result.stories
      .map((st, i) => `
        <details class="m3d-story-details">
          <summary><span class="m3d-swatch" style="background:${COLORS[i % COLORS.length]}"></span>${esc(st.name)}: Abschnitte anzeigen</summary>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Abschnitt</th><th>Länge (m)</th><th>Fassadenhöhe (m)</th><th>Gerüsthöhe (m)</th><th>Winkel (°)</th><th>Dachüberstand (m)</th></tr></thead>
              <tbody>
                ${st.sections.map((s) => `<tr><td>${esc(s.name)}</td><td>${fmt(s.length)}</td><td>${fmt(s.facadeHeight)}</td><td>${fmt(s.height)}</td><td>${fmt(s.angle, 0)}</td><td>${s.overhang ? fmt(s.overhang) : "–"}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </details>`)
      .join("");

    drawPreview();
  }

  function drawPreview() {
    const wrapW = Math.min(canvas.parentElement.clientWidth || 900, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = wrapW, cssH = Math.round(Math.min(560, Math.max(320, wrapW * 0.62)));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, cssW, cssH);

    const { grid } = result;
    const { w, h, res, minX, minY, H } = grid;
    const g = result.ground;
    const top = Math.max(g + 1, result.zMax);

    // Ausschnitt: alle Umrisse + 2 m Rand
    const pts = [];
    result.stories.forEach((st) => st.ring.forEach((p) => pts.push(toPlan(p))));
    if (!pts.length) return;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    pts.forEach((p) => { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x); by1 = Math.max(by1, p.y); });
    const pad = 3;
    bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad;
    const k = Math.min(cssW / (bx1 - bx0), cssH / (by1 - by0));
    const ox = (cssW - k * (bx1 - bx0)) / 2 - k * bx0;
    const oy = (cssH + k * (by1 - by0)) / 2 + k * by0;
    const scr = (p) => ({ x: ox + k * p.x, y: oy - k * p.y });

    // Höhenbild (gedrehtes Raster → Plan)
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
    const ct = Math.cos(result.theta), stt = Math.sin(result.theta);
    const origin = scr(toPlan({ x: minX, y: minY }));
    ctx.save();
    ctx.setTransform(
      dpr * k * res * ct, -dpr * k * res * stt,
      -dpr * k * res * stt, -dpr * k * res * ct,
      dpr * origin.x, dpr * origin.y
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Gerüstseiten
    const taken = new Set([...storiesBody.querySelectorAll(".m3d-take")].filter((c) => c.checked).map((c) => Number(c.dataset.idx)));
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    result.stories.forEach((st, si) => {
      const color = COLORS[si % COLORS.length];
      const on = taken.size === 0 || taken.has(si);
      ctx.globalAlpha = on ? 1 : 0.25;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      st.sections.forEach((s) => {
        const a = scr(toPlan(s.p0)), b = scr(toPlan(s.p1));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // Nummer außen neben dem Abschnitt
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // Gebäude liegt im Plan rechts der Laufrichtung; auf dem Bildschirm
        // (y nach unten gespiegelt) liegt "außen" damit rechts
        const nx = (b.y - a.y) / len, ny = -(b.x - a.x) / len;
        const mx = (a.x + b.x) / 2 + nx * 11, my = (a.y + b.y) / 2 + ny * 11;
        const label = s.name.split(" ")[0];
        if (len > 12) {
          ctx.fillStyle = "rgba(250,250,250,0.85)";
          const tw = ctx.measureText(label).width + 6;
          ctx.fillRect(mx - tw / 2, my - 7, tw, 14);
          ctx.fillStyle = color;
          ctx.fillText(label, mx, my);
        }
      });
      ctx.globalAlpha = 1;
    });

    // Nordpfeil + Maßstab
    ctx.fillStyle = "#1d2124";
    ctx.strokeStyle = "#1d2124";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cssW - 24, 14); ctx.lineTo(cssW - 30, 30); ctx.lineTo(cssW - 18, 30); ctx.closePath();
    ctx.fill();
    ctx.fillText("N", cssW - 24, 40);
    const barM = [1, 2, 5, 10, 20, 50].find((m) => m * k > 60) || 50;
    ctx.beginPath();
    ctx.moveTo(12, cssH - 14); ctx.lineTo(12 + barM * k, cssH - 14);
    ctx.moveTo(12, cssH - 18); ctx.lineTo(12, cssH - 10);
    ctx.moveTo(12 + barM * k, cssH - 18); ctx.lineTo(12 + barM * k, cssH - 10);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(`${barM} m`, 18 + barM * k, cssH - 14);
  }

  function applyToTool() {
    if (!result) return;
    const idx = [...storiesBody.querySelectorAll(".m3d-take")].filter((c) => c.checked).map((c) => Number(c.dataset.idx));
    if (!idx.length) {
      setStatus(applyStatus, "Bitte mindestens eine Geschossebene zum Übernehmen auswählen.");
      return;
    }
    const stories = ModelScaffold.toToolStories(result, idx);
    // Bezugspunkt der Geschoss-Lagen (siehe toToolStories) für die 3D-Ansicht
    const ref = ModelScaffold.referencePoint(result, idx);
    appliedModel = { positions: planPositions, ref, ground: result.ground };
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
  storiesBody.addEventListener("change", () => result && drawPreview());
  window.addEventListener("resize", () => {
    if (result && !resultBox.classList.contains("hidden")) drawPreview();
  });

  return { loadFile, runAnalysis, getAppliedModel: () => appliedModel };
})();
