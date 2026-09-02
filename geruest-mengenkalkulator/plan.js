"use strict";

// Plan-Digitalisierung: Bild/PDF/DXF einlesen, Maßstab kalibrieren (Bild/PDF)
// oder Ebene wählen (DXF), Gerüstlinie interaktiv abklicken/verschieben/löschen.
// Produces a list of {length, angle} segments the main app can drop into the
// Fassadenabschnitte table. All points live in "working space": image pixel
// space for raster plans, raw drawing units for DXF.

const PlanTrace = (() => {
  const canvas = document.getElementById("plan-canvas");
  const ctx = canvas.getContext("2d");
  const fileInput = document.getElementById("plan-file");
  const fileStatus = document.getElementById("plan-file-status");

  const stepsRaster = document.getElementById("plan-steps-raster");
  const stepsDxf = document.getElementById("plan-steps-dxf");
  const stepsTrace = document.getElementById("plan-steps-trace");

  const calibrateBtn = document.getElementById("plan-calibrate-btn");
  const calibrateLengthInput = document.getElementById("plan-calibrate-length");
  const calibrateConfirmBtn = document.getElementById("plan-calibrate-confirm");
  const scaleStatus = document.getElementById("plan-scale-status");

  const dxfLayerSelect = document.getElementById("dxf-layer-select");
  const dxfUnitSelect = document.getElementById("dxf-unit-select");
  const dxfUnitCustomLabel = document.getElementById("dxf-unit-custom-label");
  const dxfUnitCustom = document.getElementById("dxf-unit-custom");
  const dxfLoadLayerBtn = document.getElementById("dxf-load-layer-btn");
  const dxfLayerStatus = document.getElementById("dxf-layer-status");

  const traceBtn = document.getElementById("plan-trace-btn");
  const panBtn = document.getElementById("plan-pan-btn");
  const zoomFitBtn = document.getElementById("plan-zoom-fit-btn");
  const traceUndoBtn = document.getElementById("plan-trace-undo");
  const traceFinishBtn = document.getElementById("plan-trace-finish");
  const traceClosedCheckbox = document.getElementById("plan-trace-closed");
  const segmentsTable = document.getElementById("plan-segments-table");
  const segmentsBody = document.getElementById("plan-segments-body");
  const applyBtn = document.getElementById("plan-apply-btn");
  const applyStatus = document.getElementById("plan-apply-status");

  const HIT_RADIUS = 9;

  let source = null; // 'raster' | 'dxf'
  let image = null; // HTMLImageElement or HTMLCanvasElement (raster mode only)
  let imageSize = null; // {w,h} in working space (raster mode)
  let dxfDoc = null; // parsed DXF document (dxf mode)

  let mode = "idle"; // idle | calibrating | tracing
  let panActive = false;
  let calibrationPoints = []; // working-space points
  let unitsPerMeter = null; // working-space units per real meter
  let tracePoints = []; // working-space points
  let segments = []; // { length, angle } — editable, feeds the apply step

  let view = { scale: 1, offsetX: 0, offsetY: 0 };
  let dragTarget = null; // { list: 'trace'|'calibration', index }
  let panLast = null;

  function setStatus(el, text) {
    el.textContent = text;
  }

  function screenToWorking(sx, sy) {
    return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
  }
  function workingToScreen(p) {
    return { x: p.x * view.scale + view.offsetX, y: p.y * view.scale + view.offsetY };
  }

  function contentBounds() {
    if (source === "raster" && imageSize) {
      return { minX: 0, minY: 0, maxX: imageSize.w, maxY: imageSize.h };
    }
    const pts = tracePoints.length ? tracePoints : calibrationPoints;
    if (pts.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
      const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.15;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }

  function fitView() {
    const b = contentBounds();
    const w = Math.max(b.maxX - b.minX, 1e-6);
    const h = Math.max(b.maxY - b.minY, 1e-6);
    const scale = Math.min((canvas.width * 0.94) / w, (canvas.height * 0.94) / h);
    view.scale = scale;
    view.offsetX = canvas.width / 2 - ((b.minX + b.maxX) / 2) * scale;
    view.offsetY = canvas.height / 2 - ((b.minY + b.maxY) / 2) * scale;
    redraw();
  }

  function resizeCanvas() {
    const maxW = Math.min(canvas.parentElement.clientWidth || 900, 900);
    canvas.width = maxW;
    canvas.height = 560;
  }

  function niceStep(targetPx) {
    const rawUnits = targetPx / view.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(rawUnits)));
    const candidates = [1, 2, 5, 10].map((m) => m * pow);
    return candidates.reduce((a, b) => (Math.abs(b - rawUnits) < Math.abs(a - rawUnits) ? b : a));
  }

  function drawGrid() {
    const step = niceStep(70);
    const b = { minX: -view.offsetX / view.scale, minY: -view.offsetY / view.scale };
    const startX = Math.floor(b.minX / step) * step;
    const startY = Math.floor(b.minY / step) * step;
    ctx.strokeStyle = "#e3e6ea";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < b.minX + canvas.width / view.scale + step; x += step) {
      const s = workingToScreen({ x, y: 0 });
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, canvas.height);
    }
    for (let y = startY; y < b.minY + canvas.height / view.scale + step; y += step) {
      const s = workingToScreen({ x: 0, y });
      ctx.moveTo(0, s.y);
      ctx.lineTo(canvas.width, s.y);
    }
    ctx.stroke();
  }

  function redraw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (source === "raster" && image) {
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
      ctx.drawImage(image, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else if (source === "dxf") {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid();
    }

    if (calibrationPoints.length) {
      ctx.fillStyle = "#1a73e8";
      ctx.strokeStyle = "#1a73e8";
      ctx.lineWidth = 2;
      const scr = calibrationPoints.map(workingToScreen);
      if (scr.length === 2) {
        ctx.beginPath();
        ctx.moveTo(scr[0].x, scr[0].y);
        ctx.lineTo(scr[1].x, scr[1].y);
        ctx.stroke();
      }
      scr.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (tracePoints.length) {
      const scr = tracePoints.map(workingToScreen);
      ctx.strokeStyle = "#b5502e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      scr.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (traceClosedCheckbox.checked && scr.length > 2) ctx.closePath();
      ctx.stroke();

      scr.forEach((p, i) => {
        ctx.fillStyle = "#b5502e";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1f2430";
        ctx.font = "12px sans-serif";
        ctx.fillText(String(i + 1), p.x + 7, p.y - 7);
        if (i > 0 && unitsPerMeter) {
          const prev = tracePoints[i - 1];
          const distPx = Math.hypot(tracePoints[i].x - prev.x, tracePoints[i].y - prev.y);
          const distM = distPx / unitsPerMeter;
          const mid = { x: (scr[i - 1].x + p.x) / 2, y: (scr[i - 1].y + p.y) / 2 };
          ctx.fillText(`${distM.toFixed(2)} m`, mid.x + 4, mid.y - 4);
        }
      });
    }
  }

  function pointAt(sx, sy) {
    return screenToWorking(sx, sy);
  }

  function hitTest(list, sx, sy) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const s = workingToScreen(list[i]);
      if (Math.hypot(s.x - sx, s.y - sy) <= HIT_RADIUS) return i;
    }
    return -1;
  }

  function canvasEventPos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * canvas.width,
      y: ((evt.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function updateTraceButtons() {
    traceUndoBtn.disabled = tracePoints.length === 0;
    traceFinishBtn.disabled = tracePoints.length < 2;
  }

  function recomputeSegmentsLive() {
    if (mode === "tracing" || tracePoints.length) {
      renderSegmentsPreview(computeSegments(tracePoints, traceClosedCheckbox.checked));
    }
  }

  canvas.addEventListener("wheel", (evt) => {
    evt.preventDefault();
    const pos = canvasEventPos(evt);
    const before = screenToWorking(pos.x, pos.y);
    const factor = Math.exp(-evt.deltaY * 0.0015);
    view.scale = Math.min(Math.max(view.scale * factor, 1e-4), 1e6);
    const after = workingToScreen(before);
    view.offsetX += pos.x - after.x;
    view.offsetY += pos.y - after.y;
    redraw();
  }, { passive: false });

  canvas.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    const pos = canvasEventPos(evt);
    const idx = hitTest(tracePoints, pos.x, pos.y);
    if (idx >= 0) {
      tracePoints.splice(idx, 1);
      updateTraceButtons();
      recomputeSegmentsLive();
      redraw();
      return;
    }
    const cIdx = hitTest(calibrationPoints, pos.x, pos.y);
    if (cIdx >= 0) {
      calibrationPoints.splice(cIdx, 1);
      calibrateConfirmBtn.disabled = calibrationPoints.length !== 2;
      redraw();
    }
  });

  canvas.addEventListener("pointerdown", (evt) => {
    const pos = canvasEventPos(evt);
    canvas.setPointerCapture(evt.pointerId);

    if (panActive) {
      panLast = pos;
      return;
    }

    const traceHit = hitTest(tracePoints, pos.x, pos.y);
    if (traceHit >= 0) {
      dragTarget = { list: "trace", index: traceHit };
      return;
    }
    const calHit = hitTest(calibrationPoints, pos.x, pos.y);
    if (calHit >= 0) {
      dragTarget = { list: "calibration", index: calHit };
      return;
    }

    if (mode === "calibrating") {
      if (calibrationPoints.length >= 2) calibrationPoints = [];
      calibrationPoints.push(pointAt(pos.x, pos.y));
      calibrateConfirmBtn.disabled = calibrationPoints.length !== 2;
      redraw();
    } else if (mode === "tracing") {
      tracePoints.push(pointAt(pos.x, pos.y));
      updateTraceButtons();
      recomputeSegmentsLive();
      redraw();
    }
  });

  canvas.addEventListener("pointermove", (evt) => {
    const pos = canvasEventPos(evt);
    if (panActive && panLast) {
      view.offsetX += pos.x - panLast.x;
      view.offsetY += pos.y - panLast.y;
      panLast = pos;
      redraw();
      return;
    }
    if (dragTarget) {
      const wp = pointAt(pos.x, pos.y);
      if (dragTarget.list === "trace") {
        tracePoints[dragTarget.index] = wp;
        recomputeSegmentsLive();
      } else {
        calibrationPoints[dragTarget.index] = wp;
      }
      redraw();
    }
  });

  function endPointerInteraction() {
    dragTarget = null;
    panLast = null;
  }
  canvas.addEventListener("pointerup", endPointerInteraction);
  canvas.addEventListener("pointerleave", endPointerInteraction);

  panBtn.addEventListener("click", () => {
    panActive = !panActive;
    panBtn.textContent = panActive ? "Verschieben (aktiv)" : "Verschieben (Pan)";
    canvas.style.cursor = panActive ? "grab" : "crosshair";
  });

  zoomFitBtn.addEventListener("click", fitView);

  window.addEventListener("resize", () => {
    if (source) {
      resizeCanvas();
      fitView();
    }
  });

  // ---- File loading -------------------------------------------------

  function resetAll() {
    source = null;
    image = null;
    imageSize = null;
    dxfDoc = null;
    mode = "idle";
    panActive = false;
    panBtn.textContent = "Verschieben (Pan)";
    calibrationPoints = [];
    unitsPerMeter = null;
    tracePoints = [];
    segments = [];
    view = { scale: 1, offsetX: 0, offsetY: 0 };

    calibrateBtn.disabled = true;
    calibrateConfirmBtn.disabled = true;
    traceBtn.disabled = true;
    panBtn.disabled = true;
    zoomFitBtn.disabled = true;
    traceUndoBtn.disabled = true;
    traceFinishBtn.disabled = true;
    applyBtn.disabled = true;
    segmentsTable.classList.add("hidden");
    segmentsBody.innerHTML = "";
    setStatus(scaleStatus, "Maßstab noch nicht kalibriert.");
    setStatus(dxfLayerStatus, "");
    setStatus(applyStatus, "");
    stepsRaster.classList.remove("hidden");
    stepsDxf.classList.add("hidden");
    resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    resetAll();
    const name = file.name.toLowerCase();

    if (name.endsWith(".dxf")) {
      stepsRaster.classList.add("hidden");
      stepsDxf.classList.remove("hidden");
      await loadDxf(file);
    } else if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      setStatus(fileStatus, "PDF wird geladen …");
      const buf = await file.arrayBuffer();
      loadPdf(buf);
    } else {
      const reader = new FileReader();
      reader.onload = () => loadImageSource(reader.result);
      reader.readAsDataURL(file);
    }
  });

  function loadImageSource(src) {
    const img = new Image();
    img.onload = () => {
      source = "raster";
      image = img;
      imageSize = { w: img.width, h: img.height };
      resizeCanvas();
      fitView();
      calibrateBtn.disabled = false;
      panBtn.disabled = false;
      zoomFitBtn.disabled = false;
      setStatus(fileStatus, `Plan geladen (${img.width}×${img.height} px). Jetzt Maßstab kalibrieren.`);
    };
    img.onerror = () => setStatus(fileStatus, "Datei konnte nicht als Bild geladen werden.");
    img.src = src;
  }

  async function loadPdf(arrayBuffer) {
    if (typeof pdfjsLib === "undefined") {
      setStatus(fileStatus, "PDF-Unterstützung nicht verfügbar (vendor/pdf.min.js konnte nicht geladen werden). Bitte Plan als Bild (PNG/JPG) exportieren und hochladen.");
      return;
    }
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const off = document.createElement("canvas");
      off.width = viewport.width;
      off.height = viewport.height;
      await page.render({ canvasContext: off.getContext("2d"), viewport }).promise;
      source = "raster";
      image = off;
      imageSize = { w: off.width, h: off.height };
      resizeCanvas();
      fitView();
      calibrateBtn.disabled = false;
      panBtn.disabled = false;
      zoomFitBtn.disabled = false;
      setStatus(fileStatus, `PDF Seite 1 geladen (${off.width}×${off.height} px). Jetzt Maßstab kalibrieren.`);
    } catch (e) {
      setStatus(fileStatus, "PDF konnte nicht gelesen werden: " + e.message);
    }
  }

  // ---- DXF ------------------------------------------------------------

  const DXF_ENTITY_TYPES = ["LINE", "LWPOLYLINE", "POLYLINE"];

  async function loadDxf(file) {
    if (typeof DxfParser === "undefined") {
      setStatus(fileStatus, "DXF-Unterstützung nicht verfügbar (vendor/dxf-parser.js konnte nicht geladen werden).");
      return;
    }
    try {
      const text = await file.text();
      const parser = new DxfParser();
      const dxf = parser.parseSync(text);
      if (!dxf || !dxf.entities) throw new Error("Keine Entitäten gefunden");
      dxfDoc = dxf;
      source = "dxf";
      resizeCanvas();

      const counts = new Map();
      dxf.entities
        .filter((e) => DXF_ENTITY_TYPES.includes(e.type))
        .forEach((e) => counts.set(e.layer || "0", (counts.get(e.layer || "0") || 0) + 1));

      dxfLayerSelect.innerHTML = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([layer, n]) => `<option value="${escapeAttr(layer)}">${escapeAttr(layer)} (${n} Objekt${n === 1 ? "" : "e"})</option>`)
        .join("");

      if (!counts.size) {
        setStatus(fileStatus, "DXF geladen, aber keine LINE/LWPOLYLINE/POLYLINE-Objekte gefunden.");
        dxfLoadLayerBtn.disabled = true;
        return;
      }

      const insunits = dxf.header && dxf.header["$INSUNITS"];
      if (insunits === 4) dxfUnitSelect.value = "1000";
      else if (insunits === 5) dxfUnitSelect.value = "100";
      else if (insunits === 6) dxfUnitSelect.value = "1";

      dxfLoadLayerBtn.disabled = false;
      setStatus(fileStatus, `DXF geladen: ${dxf.entities.length} Objekte, ${counts.size} Ebene(n) mit Linien-/Polylinien-Geometrie.`);
    } catch (e) {
      setStatus(fileStatus, "DXF konnte nicht gelesen werden: " + e.message);
    }
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function chainLength(chain) {
    let sum = 0;
    for (let i = 0; i < chain.length - 1; i += 1) sum += dist(chain[i], chain[i + 1]);
    return sum;
  }

  function extractLayerGeometry(entities, layerName) {
    const ents = entities.filter((e) => (e.layer || "0") === layerName && DXF_ENTITY_TYPES.includes(e.type));
    const polylines = ents.filter((e) => e.type === "LWPOLYLINE" || e.type === "POLYLINE");
    const lines = ents.filter((e) => e.type === "LINE");

    if (polylines.length && (polylines.length > 1 || lines.length === 0)) {
      const best = polylines.reduce((a, b) => (b.vertices.length > a.vertices.length ? b : a));
      const points = best.vertices.map((v) => ({ x: v.x, y: v.y }));
      const extra = polylines.length - 1 + lines.length;
      const note =
        polylines.length === 1 && lines.length === 0
          ? `1 Polylinie mit ${points.length} Punkten übernommen.`
          : `${polylines.length} Polylinie(n) und ${lines.length} Linie(n) auf dieser Ebene – die längste Polylinie (${points.length} Punkte) wurde übernommen${extra ? `, ${extra} weitere Objekt(e) ignoriert` : ""}. Bei Bedarf Ebene im CAD bereinigen.`;
      return { points, closed: Boolean(best.shape), note };
    }

    if (lines.length) {
      const segs = lines
        .filter((l) => l.vertices && l.vertices.length >= 2)
        .map((l) => ({ a: { x: l.vertices[0].x, y: l.vertices[0].y }, b: { x: l.vertices[1].x, y: l.vertices[1].y }, used: false }));
      if (!segs.length) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      segs.forEach((s) => [s.a, s.b].forEach((p) => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }));
      const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
      const tol = Math.max(diag * 1e-4, 1e-6);

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
      const note =
        chains.length > 1
          ? `${lines.length} Linien gefunden, zu ${chains.length} getrennten Ketten verbunden – die längste (${points.length} Punkte) wurde übernommen. Bitte prüfen, ob das der vollständige Umriss ist, sonst Ebene im CAD bereinigen.`
          : `${lines.length} Linien zu einer durchgehenden Linie (${points.length} Punkte) verbunden.`;
      return { points, closed, note };
    }

    return null;
  }

  dxfUnitSelect.addEventListener("change", () => {
    dxfUnitCustomLabel.classList.toggle("hidden", dxfUnitSelect.value !== "custom");
  });

  dxfLoadLayerBtn.addEventListener("click", () => {
    if (!dxfDoc) return;
    const layer = dxfLayerSelect.value;
    const result = extractLayerGeometry(dxfDoc.entities, layer);
    if (!result || result.points.length < 2) {
      setStatus(dxfLayerStatus, "Auf dieser Ebene konnte keine durchgehende Linie/Polylinie gefunden werden.");
      return;
    }
    unitsPerMeter = dxfUnitSelect.value === "custom" ? parseFloat(dxfUnitCustom.value) || 1000 : parseFloat(dxfUnitSelect.value);
    tracePoints = result.points;
    traceClosedCheckbox.checked = result.closed;
    mode = "idle";
    panBtn.disabled = false;
    zoomFitBtn.disabled = false;
    traceBtn.disabled = false;
    updateTraceButtons();
    fitView();
    recomputeSegmentsLive();
    setStatus(dxfLayerStatus, result.note + ` Maßstab: 1 m = ${unitsPerMeter} Zeichnungseinheiten. Punkte können unten per Ziehen korrigiert werden.`);
  });

  // ---- Calibration (raster mode) --------------------------------------

  calibrateBtn.addEventListener("click", () => {
    mode = "calibrating";
    calibrationPoints = [];
    calibrateConfirmBtn.disabled = true;
    setStatus(scaleStatus, "Klicke die beiden Enden der bekannten Strecke im Plan an (Punkte können danach noch verschoben werden).");
    redraw();
  });

  calibrateConfirmBtn.addEventListener("click", () => {
    if (calibrationPoints.length !== 2) return;
    const distPx = dist(calibrationPoints[0], calibrationPoints[1]);
    const realLength = parseFloat(calibrateLengthInput.value) || 0;
    if (distPx < 1e-6 || realLength <= 0) {
      setStatus(scaleStatus, "Ungültige Kalibrierung – bitte erneut versuchen.");
      return;
    }
    unitsPerMeter = distPx / realLength;
    setStatus(scaleStatus, `Maßstab: 1 m = ${unitsPerMeter.toFixed(2)} px (${distPx.toFixed(1)} px = ${realLength} m).`);
    traceBtn.disabled = false;
    panBtn.disabled = false;
    zoomFitBtn.disabled = false;
    mode = "idle";
    redraw();
  });

  // ---- Tracing ----------------------------------------------------------

  traceBtn.addEventListener("click", () => {
    mode = "tracing";
    panActive = false;
    panBtn.textContent = "Verschieben (Pan)";
    canvas.style.cursor = "crosshair";
  });

  traceUndoBtn.addEventListener("click", () => {
    tracePoints.pop();
    updateTraceButtons();
    recomputeSegmentsLive();
    redraw();
  });

  traceClosedCheckbox.addEventListener("change", recomputeSegmentsLive);

  function angleBetween(dxA, dyA, dxB, dyB) {
    const h1 = Math.atan2(dyA, dxA);
    const h2 = Math.atan2(dyB, dxB);
    let turn = ((h2 - h1) * 180) / Math.PI;
    turn = (((turn + 180) % 360) + 360) % 360 - 180;
    return turn;
  }

  function computeSegments(points, closed) {
    if (points.length < 2 || !unitsPerMeter) return [];
    const rawSegs = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      rawSegs.push({ dx: b.x - a.x, dy: b.y - a.y });
    }
    if (closed) {
      const first = points[0];
      const last = points[points.length - 1];
      rawSegs.push({ dx: first.x - last.x, dy: first.y - last.y });
    }
    return rawSegs.map((seg, i) => {
      const length = Math.hypot(seg.dx, seg.dy) / unitsPerMeter;
      const next = rawSegs[(i + 1) % rawSegs.length];
      const angle = i < rawSegs.length - 1 || closed ? angleBetween(seg.dx, seg.dy, next.dx, next.dy) : 0;
      return { length, angle };
    });
  }

  function renderSegmentsPreview(newSegments) {
    segments = newSegments;
    if (!segments.length) {
      segmentsTable.classList.add("hidden");
      applyBtn.disabled = true;
      return;
    }
    segmentsBody.innerHTML = segments
      .map(
        (s, i) => `
        <tr data-idx="${i}">
          <td>Seite ${i + 1}</td>
          <td><input type="number" class="seg-length" step="0.01" min="0" value="${s.length.toFixed(2)}"></td>
          <td><input type="number" class="seg-angle" step="1" value="${s.angle.toFixed(0)}"></td>
        </tr>`
      )
      .join("");
    segmentsBody.querySelectorAll("tr").forEach((tr) => {
      const idx = Number(tr.dataset.idx);
      tr.querySelector(".seg-length").addEventListener("input", (e) => {
        segments[idx].length = parseFloat(e.target.value) || 0;
      });
      tr.querySelector(".seg-angle").addEventListener("input", (e) => {
        segments[idx].angle = parseFloat(e.target.value) || 0;
      });
    });
    segmentsTable.classList.remove("hidden");
    applyBtn.disabled = false;
  }

  traceFinishBtn.addEventListener("click", () => {
    mode = "idle";
    renderSegmentsPreview(computeSegments(tracePoints, traceClosedCheckbox.checked));
  });

  applyBtn.addEventListener("click", () => {
    if (!segments.length) return;
    window.dispatchEvent(
      new CustomEvent("plan-segments-apply", {
        detail: { segments: segments.map((s) => ({ ...s })), closed: traceClosedCheckbox.checked },
      })
    );
    setStatus(
      applyStatus,
      "In die Abschnittstabelle übernommen. Dort können die Werte weiterhin frei angepasst werden – anschließend oben auf „Berechnen“ klicken, um neu zu rechnen."
    );
  });

  resizeCanvas();

  return { resetAll };
})();
