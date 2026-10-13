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
  const freehandBtn = document.getElementById("plan-freehand-btn");

  const stepsRaster = document.getElementById("plan-steps-raster");
  const stepsDxf = document.getElementById("plan-steps-dxf");
  const stepsIfc = document.getElementById("plan-steps-ifc");
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

  const pdfBox = document.getElementById("plan-pdf-box");
  const pdfPageLabel = document.getElementById("plan-pdf-page-label");
  const pdfPageSelect = document.getElementById("plan-pdf-page");
  const pdfScaleInput = document.getElementById("plan-pdf-scale");
  const pdfScaleBtn = document.getElementById("plan-pdf-scale-btn");
  const pdfScaleStatus = document.getElementById("plan-pdf-scale-status");
  const calibrateTitle = document.getElementById("plan-calibrate-title");
  const showScaffoldCheckbox = document.getElementById("plan-show-scaffold");
  const scaffoldFlipCheckbox = document.getElementById("plan-scaffold-flip");
  const exportBtn = document.getElementById("plan-export-btn");

  // PDF-Punkte (1/72 Zoll) je Meter auf dem Papier.
  const PT_PER_METER = 72 / 0.0254;
  // Übliche Planmaßstäbe – nur diese werden als „1:n“ im Plankopf akzeptiert,
  // damit Uhrzeiten, Verhältnisse o. Ä. nicht als Maßstab erkannt werden.
  const COMMON_SCALES = [5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 750, 1000, 1250, 2000, 2500, 5000];

  const HIT_RADIUS = 9;

  let source = null; // 'raster' | 'dxf'
  let image = null; // HTMLImageElement or HTMLCanvasElement (raster mode only)
  let imageSize = null; // {w,h} in working space (raster mode)
  let dxfDoc = null; // parsed DXF document (dxf mode)
  let pdfDoc = null; // pdf.js document (PDF plans)
  let pdfPxPerPt = null; // render resolution of the current PDF page

  let mode = "idle"; // idle | calibrating | tracing
  let panActive = false;
  let calibrationPoints = []; // working-space points
  let unitsPerMeter = null; // working-space units per real meter
  let tracePoints = []; // working-space points
  let segments = []; // { length, angle } — editable, feeds the apply step
  let referenceSegments = []; // { a, b } static guide lines (e.g. IFC wall centerlines) to trace over

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
    const pts = tracePoints.length
      ? tracePoints
      : calibrationPoints.length
      ? calibrationPoints
      : referenceSegments.flatMap((s) => [s.a, s.b]);
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
    if (source === "grid") return { minX: -15, minY: -15, maxX: 15, maxY: 15 };
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
    drawScene(ctx, canvas.width, canvas.height, 1);
  }

  function drawScene(ctx, width, height, k) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (source === "raster" && image) {
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
      ctx.drawImage(image, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else if (source === "dxf" || source === "grid") {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, width, height);
      drawGrid();
      if (source === "grid") {
        const origin = workingToScreen({ x: 0, y: 0 });
        ctx.fillStyle = "#c7ccd3";
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (referenceSegments.length) {
      ctx.strokeStyle = "#8a8f98";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      referenceSegments.forEach((seg) => {
        const a = workingToScreen(seg.a);
        const b = workingToScreen(seg.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
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

    const scaffoldLabels = drawScaffold(ctx, k);

    if (tracePoints.length) {
      const scr = tracePoints.map(workingToScreen);
      ctx.strokeStyle = "#C4000B";
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      scr.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (traceClosedCheckbox.checked && scr.length > 2) ctx.closePath();
      ctx.stroke();

      scr.forEach((p, i) => {
        ctx.fillStyle = "#C4000B";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1f2430";
        ctx.font = `${12 * k}px sans-serif`;
        ctx.fillText(String(i + 1), p.x + 7 * k, p.y - 7 * k);
        if (i > 0 && unitsPerMeter && !scaffoldLabels) {
          const prev = tracePoints[i - 1];
          const distPx = Math.hypot(tracePoints[i].x - prev.x, tracePoints[i].y - prev.y);
          const distM = distPx / unitsPerMeter;
          const mid = { x: (scr[i - 1].x + p.x) / 2, y: (scr[i - 1].y + p.y) / 2 };
          ctx.fillText(`${distM.toFixed(2)} m`, mid.x + 4, mid.y - 4);
        }
      });
    }
  }

  // ---- Gerüst auf dem Plan ------------------------------------------------

  function scaffoldSettings() {
    if (typeof getGlobalSettings === "function") return getGlobalSettings();
    return { geruestbreite: 0.7, wandabstand: 0.3, rasterLengths: [2.5] };
  }

  // Versetzt eine Punktkette um d (Arbeitsraum-Einheiten) zur Seite `sign`;
  // innere Ecken werden über den Schnitt der versetzten Nachbarkanten gebildet.
  function offsetChain(points, closed, d, sign) {
    const n = points.length;
    const edgeCount = closed ? n : n - 1;
    const lines = [];
    for (let i = 0; i < edgeCount; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const nrm = { x: dir.y * sign, y: -dir.x * sign };
      lines.push({ dir, p: { x: a.x + nrm.x * d, y: a.y + nrm.y * d }, q: { x: b.x + nrm.x * d, y: b.y + nrm.y * d } });
    }
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const prev = i > 0 ? lines[i - 1] : closed ? lines[edgeCount - 1] : null;
      const curr = i < edgeCount ? lines[i] : null;
      if (prev && curr) {
        const pt = Geometry.lineIntersect(prev.p, prev.dir, curr.p, curr.dir);
        // Sehr spitze Winkel: Gehrung begrenzen, sonst schießt die Ecke weit hinaus.
        out.push(pt && Math.hypot(pt.x - curr.p.x, pt.y - curr.p.y) < d * 4 + 1e-9 ? pt : curr.p);
      } else {
        out.push(curr ? curr.p : prev.q);
      }
    }
    return out;
  }

  // Zeichnet das Gerüst (Wandabstand + Gerüstbreite, Feldeinteilung) entlang
  // der abgeklickten Linie. Gibt true zurück, wenn Beschriftungen gezeichnet
  // wurden (dann entfallen die einfachen Längenangaben an der Linie).
  function drawScaffold(ctx, k) {
    if (!showScaffoldCheckbox.checked || !unitsPerMeter || tracePoints.length < 2) return false;
    const closed = traceClosedCheckbox.checked && tracePoints.length > 2;
    const { geruestbreite, wandabstand, rasterLengths } = scaffoldSettings();
    let sign = 1;
    if (closed) sign = Geometry.shoelaceArea(tracePoints) >= 0 ? 1 : -1; // nach außen
    if (scaffoldFlipCheckbox.checked) sign = -sign;
    const dIn = wandabstand * unitsPerMeter;
    const dOut = (wandabstand + geruestbreite) * unitsPerMeter;
    const inner = offsetChain(tracePoints, closed, dIn, sign).map(workingToScreen);
    const outer = offsetChain(tracePoints, closed, dOut, sign).map(workingToScreen);
    const n = tracePoints.length;
    const edgeCount = closed ? n : n - 1;
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

    for (let i = 0; i < edgeCount; i += 1) {
      const j = (i + 1) % n;
      ctx.fillStyle = "rgba(255, 170, 0, 0.35)";
      ctx.strokeStyle = "#d98200";
      ctx.lineWidth = 1.5 * k;
      ctx.beginPath();
      ctx.moveTo(inner[i].x, inner[i].y);
      ctx.lineTo(inner[j].x, inner[j].y);
      ctx.lineTo(outer[j].x, outer[j].y);
      ctx.lineTo(outer[i].x, outer[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const a = tracePoints[i];
      const b = tracePoints[j];
      const lengthM = Math.hypot(b.x - a.x, b.y - a.y) / unitsPerMeter;
      const nx = ((b.y - a.y) / (lengthM * unitsPerMeter || 1)) * sign;
      const ny = (-(b.x - a.x) / (lengthM * unitsPerMeter || 1)) * sign;
      let fieldCount = 0;
      if (lengthM > 0.05 && typeof fillFields === "function") {
        const { counts, totalFields } = fillFields(lengthM, rasterLengths);
        fieldCount = totalFields;
        ctx.strokeStyle = "#a35f00";
        ctx.lineWidth = 1 * k;
        ctx.beginPath();
        let cum = 0;
        counts.forEach((c) => {
          for (let f = 0; f < c.n; f += 1) {
            cum += c.len;
            const t = cum / lengthM;
            if (t >= 0.999) continue;
            // Querstrich rechtwinklig zur Fassade, vom Wandabstand bis zur Außenkante.
            const base = lerp(a, b, t);
            const p = workingToScreen({ x: base.x + nx * dIn, y: base.y + ny * dIn });
            const q = workingToScreen({ x: base.x + nx * dOut, y: base.y + ny * dOut });
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
          }
        });
        ctx.stroke();
      }

      const mid = lerp(outer[i], outer[j], 0.5);
      const midIn = lerp(inner[i], inner[j], 0.5);
      const dx = mid.x - midIn.x, dy = mid.y - midIn.y;
      const dl = Math.hypot(dx, dy) || 1;
      const lx = mid.x + (dx / dl) * 8 * k;
      const ly = mid.y + (dy / dl) * 8 * k;
      const label = `${lengthM.toFixed(2).replace(".", ",")} m${fieldCount ? ` · ${fieldCount} Felder` : ""}`;
      ctx.font = `bold ${12 * k}px sans-serif`;
      ctx.textAlign = dx > 0.3 * dl ? "left" : dx < -0.3 * dl ? "right" : "center";
      ctx.textBaseline = dy > 0.3 * dl ? "top" : dy < -0.3 * dl ? "bottom" : "middle";
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = "#7a4700";
      ctx.fillText(label, lx, ly);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    return true;
  }

  showScaffoldCheckbox.addEventListener("change", redraw);
  scaffoldFlipCheckbox.addEventListener("change", redraw);
  const settingsPanel = document.getElementById("settings-panel");
  if (settingsPanel) {
    settingsPanel.addEventListener("input", () => setTimeout(redraw, 0));
    settingsPanel.addEventListener("change", () => setTimeout(redraw, 0));
  }

  exportBtn.addEventListener("click", () => {
    let out = canvas;
    if (source === "raster" && imageSize) {
      out = document.createElement("canvas");
      out.width = imageSize.w;
      out.height = imageSize.h;
      const saved = view;
      view = { scale: 1, offsetX: 0, offsetY: 0 };
      try {
        drawScene(out.getContext("2d"), out.width, out.height, Math.max(1, Math.max(imageSize.w, imageSize.h) / 1200));
      } finally {
        view = saved;
      }
    }
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "plan-mit-geruest.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  });

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
    exportBtn.disabled = tracePoints.length < 2;
  }

  // Shift gedrückt: Punkt waagrecht bzw. senkrecht zum Bezugspunkt ausrichten.
  function snapOrtho(p, ref, evt) {
    if (!evt.shiftKey || !ref) return p;
    return Math.abs(p.x - ref.x) >= Math.abs(p.y - ref.y) ? { x: p.x, y: ref.y } : { x: ref.x, y: p.y };
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
    if (mode === "tracing" && traceHit === 0 && tracePoints.length >= 3) {
      // Klick auf den ersten Punkt schließt den Umlauf.
      traceClosedCheckbox.checked = true;
      mode = "idle";
      renderSegmentsPreview(computeSegments(tracePoints, true));
      redraw();
      return;
    }
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
      tracePoints.push(snapOrtho(pointAt(pos.x, pos.y), tracePoints[tracePoints.length - 1], evt));
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
        tracePoints[dragTarget.index] = snapOrtho(wp, tracePoints[dragTarget.index - 1], evt);
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
    pdfDoc = null;
    pdfPxPerPt = null;
    mode = "idle";
    panActive = false;
    panBtn.textContent = "Verschieben (Pan)";
    calibrationPoints = [];
    unitsPerMeter = null;
    tracePoints = [];
    segments = [];
    referenceSegments = [];
    view = { scale: 1, offsetX: 0, offsetY: 0 };

    calibrateBtn.disabled = true;
    calibrateConfirmBtn.disabled = true;
    traceBtn.disabled = true;
    panBtn.disabled = true;
    zoomFitBtn.disabled = true;
    traceUndoBtn.disabled = true;
    traceFinishBtn.disabled = true;
    applyBtn.disabled = true;
    exportBtn.disabled = true;
    pdfBox.classList.add("hidden");
    pdfPageLabel.classList.add("hidden");
    pdfPageSelect.innerHTML = "";
    pdfScaleInput.value = "";
    setStatus(pdfScaleStatus, "");
    calibrateTitle.textContent = "1. Maßstab kalibrieren (nur Bild/PDF)";
    segmentsTable.classList.add("hidden");
    segmentsBody.innerHTML = "";
    setStatus(scaleStatus, "Maßstab noch nicht kalibriert.");
    setStatus(dxfLayerStatus, "");
    setStatus(applyStatus, "");
    stepsRaster.classList.remove("hidden");
    stepsDxf.classList.add("hidden");
    stepsIfc.classList.add("hidden");
    resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  freehandBtn.addEventListener("click", () => {
    resetAll();
    fileInput.value = "";
    source = "grid";
    unitsPerMeter = 1; // working space = meters directly, no calibration needed
    stepsRaster.classList.add("hidden");
    stepsDxf.classList.add("hidden");
    stepsIfc.classList.add("hidden");
    resizeCanvas();
    fitView();
    panBtn.disabled = false;
    zoomFitBtn.disabled = false;
    traceBtn.disabled = false;
    setStatus(
      fileStatus,
      "Leeres Zeichenraster (1 Karo-Gitterlinie = passt sich beim Zoomen an). Auf „Punkte anklicken“ klicken und den Grundriss direkt abklicken."
    );
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    resetAll();
    const name = file.name.toLowerCase();

    if (name.endsWith(".dxf")) {
      stepsRaster.classList.add("hidden");
      stepsDxf.classList.remove("hidden");
      await loadDxf(file);
    } else if (name.endsWith(".ifc")) {
      stepsRaster.classList.add("hidden");
      stepsIfc.classList.remove("hidden");
      source = "grid"; // canvas shows a plain grid background while placing IFC-derived points
      resizeCanvas();
      if (typeof IfcImport === "undefined") {
        setStatus(fileStatus, "IFC-Unterstützung nicht verfügbar (vendor/web-ifc-api-iife.js konnte nicht geladen werden).");
      } else {
        await IfcImport.handleFile(file);
      }
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
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      pdfPageSelect.innerHTML = Array.from({ length: pdfDoc.numPages }, (_, i) => `<option value="${i + 1}">${i + 1} von ${pdfDoc.numPages}</option>`).join("");
      pdfPageLabel.classList.toggle("hidden", pdfDoc.numPages < 2);
      pdfBox.classList.remove("hidden");
      calibrateTitle.textContent = "oder: Maßstab über eine bekannte Strecke kalibrieren (z. B. bei eingescannten Plänen)";
      await renderPdfPage(1);
    } catch (e) {
      setStatus(fileStatus, "PDF konnte nicht gelesen werden: " + e.message);
    }
  }

  async function renderPdfPage(pageNo) {
    const doc = pdfDoc;
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    // Auflösung so wählen, dass auch große Pläne (A0) scharf bleiben, ohne
    // den Speicher zu sprengen: längste Seite max. ~5000 px.
    const pxPerPt = Math.max(1, Math.min(4, 5000 / Math.max(base.width, base.height)));
    const viewport = page.getViewport({ scale: pxPerPt });
    const off = document.createElement("canvas");
    off.width = Math.round(viewport.width);
    off.height = Math.round(viewport.height);
    const offCtx = off.getContext("2d");
    offCtx.fillStyle = "#ffffff";
    offCtx.fillRect(0, 0, off.width, off.height);
    await page.render({ canvasContext: offCtx, viewport }).promise;
    if (doc !== pdfDoc) return; // inzwischen andere Datei geladen

    source = "raster";
    image = off;
    imageSize = { w: off.width, h: off.height };
    pdfPxPerPt = pxPerPt;
    calibrationPoints = [];
    tracePoints = [];
    unitsPerMeter = null;
    mode = "idle";
    renderSegmentsPreview([]);
    updateTraceButtons();
    traceBtn.disabled = true;
    resizeCanvas();
    fitView();
    calibrateBtn.disabled = false;
    panBtn.disabled = false;
    zoomFitBtn.disabled = false;
    setStatus(scaleStatus, "Maßstab noch nicht kalibriert.");
    const paper = `${Math.round((base.width / 72) * 25.4)} × ${Math.round((base.height / 72) * 25.4)} mm`;
    setStatus(fileStatus, `PDF Seite ${pageNo} geladen (Blattgröße ${paper}).`);

    let found = null;
    try {
      found = detectScale(await page.getTextContent(), base);
    } catch (e) {
      found = null;
    }
    if (found) {
      pdfScaleInput.value = found.denominator;
      applyPdfScale(found.denominator, `automatisch aus dem Plankopf erkannt („${found.text}“)` +
        (found.alternatives.length ? `. Im Plan stehen auch: ${found.alternatives.map((d) => "1:" + d).join(", ")} – falls falsch, oben ändern` : ""));
    } else {
      setStatus(pdfScaleStatus,
        "Kein Maßstab im Plankopf gefunden (z. B. eingescannter Plan ohne Text). Maßstab oben eintragen oder unten über eine bekannte Strecke kalibrieren.");
    }
  }

  // Sucht Maßstabsangaben wie „M 1:100“, „Maßstab 1 : 50“ im Text der Seite.
  // Angaben mit Beschriftung („M“, „Maßstab“) und im Plankopf (unten rechts)
  // zählen mehr als lose „1:n“ im Plan.
  function detectScale(textContent, baseViewport) {
    const rows = new Map();
    textContent.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const [vx, vy] = baseViewport.convertToViewportPoint(it.transform[4], it.transform[5]);
      const key = Math.round(vy / 4);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: vx, y: vy, str: it.str });
    });
    const re = /(ma(?:ß|ss)stab|mst\.?|\bm\.?)?\s*[:=]?\s*(?<![\d.,])1\s*:\s*(\d{1,4})(?![\d:.,])/gi;
    const scores = new Map();
    const texts = new Map();
    rows.forEach((items) => {
      items.sort((a, b) => a.x - b.x);
      const line = items.map((i) => i.str).join(" ");
      const x = items[0].x, y = items[0].y;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        const d = parseInt(m[2], 10);
        if (!COMMON_SCALES.includes(d)) continue;
        let score = 1;
        if (m[1]) score += 10;
        if (x > baseViewport.width * 0.5 && y > baseViewport.height * 0.5) score += 3;
        scores.set(d, (scores.get(d) || 0) + score);
        if (!texts.has(d) || m[1]) texts.set(d, m[0].trim());
      }
    });
    if (!scores.size) return null;
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const denominator = ranked[0][0];
    return { denominator, text: texts.get(denominator), alternatives: ranked.slice(1).map((r) => r[0]) };
  }

  function applyPdfScale(denominator, how) {
    if (!pdfPxPerPt || !(denominator > 0)) return;
    unitsPerMeter = (pdfPxPerPt * PT_PER_METER) / denominator;
    calibrationPoints = [];
    setStatus(pdfScaleStatus, `Maßstab 1:${denominator} ${how}. Zur Kontrolle: Längen an der gezeichneten Linie mit der Bemaßung im Plan vergleichen.`);
    setStatus(scaleStatus, `Maßstab: 1 m = ${unitsPerMeter.toFixed(2)} px (aus Planmaßstab 1:${denominator}).`);
    traceBtn.disabled = false;
    mode = "tracing";
    panActive = false;
    panBtn.textContent = "Verschieben (Pan)";
    canvas.style.cursor = "crosshair";
    setStatus(fileStatus, `${fileStatus.textContent} Jetzt die Gerüstlinie entlang der Fassade abklicken.`);
    recomputeSegmentsLive();
    redraw();
  }

  pdfPageSelect.addEventListener("change", () => {
    if (pdfDoc) renderPdfPage(Number(pdfPageSelect.value)).catch((e) => setStatus(fileStatus, "PDF-Seite konnte nicht geladen werden: " + e.message));
  });

  pdfScaleBtn.addEventListener("click", () => {
    const d = parseFloat(pdfScaleInput.value);
    if (!(d > 0)) {
      setStatus(pdfScaleStatus, "Bitte einen gültigen Maßstab eintragen, z. B. 100 für 1:100.");
      return;
    }
    applyPdfScale(d, "von Hand eingetragen");
  });

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

  traceClosedCheckbox.addEventListener("change", () => {
    recomputeSegmentsLive();
    redraw();
  });

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

  // Public bridge for other import modules (ifc.js): hand over a set of
  // working-space points (already in meters, unitsPerMeter=1) plus whether
  // the outline is closed, so they land in the same editable trace/segment
  // pipeline as click-traced or DXF-derived points.
  function loadPoints(points, closed, statusText) {
    source = "grid";
    unitsPerMeter = 1;
    tracePoints = points.map((p) => ({ x: p.x, y: p.y }));
    traceClosedCheckbox.checked = Boolean(closed);
    mode = "idle";
    panBtn.disabled = false;
    zoomFitBtn.disabled = false;
    traceBtn.disabled = false;
    updateTraceButtons();
    resizeCanvas();
    fitView();
    recomputeSegmentsLive();
    if (statusText) setStatus(fileStatus, statusText);
  }

  // Shows a set of static guide lines (e.g. IFC wall centerlines) to trace
  // over manually with the normal click-to-add-point tool — used when an
  // automatic outline couldn't be reconstructed reliably.
  function setReferenceSegments(segs, statusText) {
    source = "grid";
    unitsPerMeter = 1;
    referenceSegments = segs.map((s) => ({ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y } }));
    tracePoints = [];
    mode = "idle";
    panBtn.disabled = false;
    zoomFitBtn.disabled = false;
    traceBtn.disabled = false;
    updateTraceButtons();
    resizeCanvas();
    fitView();
    if (statusText) setStatus(fileStatus, statusText);
  }

  return { resetAll, loadPoints, setReferenceSegments };
})();
