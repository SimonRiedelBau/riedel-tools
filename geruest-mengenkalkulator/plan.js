"use strict";

// Plan-Digitalisierung: Bild/PDF hochladen, Maßstab kalibrieren, Linie abklicken.
// Produces a list of {length, angle} segments the main app can drop into the
// Fassadenabschnitte table.

const PlanTrace = (() => {
  const canvas = document.getElementById("plan-canvas");
  const ctx = canvas.getContext("2d");
  const fileInput = document.getElementById("plan-file");
  const fileStatus = document.getElementById("plan-file-status");
  const calibrateBtn = document.getElementById("plan-calibrate-btn");
  const calibrateLengthInput = document.getElementById("plan-calibrate-length");
  const calibrateConfirmBtn = document.getElementById("plan-calibrate-confirm");
  const scaleStatus = document.getElementById("plan-scale-status");
  const traceBtn = document.getElementById("plan-trace-btn");
  const traceUndoBtn = document.getElementById("plan-trace-undo");
  const traceFinishBtn = document.getElementById("plan-trace-finish");
  const traceClosedCheckbox = document.getElementById("plan-trace-closed");
  const segmentsTable = document.getElementById("plan-segments-table");
  const segmentsBody = document.getElementById("plan-segments-body");
  const applyBtn = document.getElementById("plan-apply-btn");

  let image = null; // HTMLImageElement or HTMLCanvasElement
  let mode = "idle"; // idle | calibrating | tracing
  let calibrationPoints = [];
  let metersPerPixel = null;
  let tracePoints = [];
  let segments = []; // { length, angle }

  function setStatus(el, text) {
    el.textContent = text;
  }

  function fitCanvasToImage() {
    if (!image) return;
    const iw = image.width;
    const ih = image.height;
    const maxW = Math.min(canvas.parentElement.clientWidth || 900, 900);
    const maxH = 620;
    let scale = Math.min(maxW / iw, maxH / ih, 1.5);
    canvas.width = Math.round(iw * scale);
    canvas.height = Math.round(ih * scale);
    canvas.dataset.imgScale = String(scale);
    redraw();
  }

  function redraw() {
    if (!image) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (calibrationPoints.length) {
      ctx.fillStyle = "#1a73e8";
      ctx.strokeStyle = "#1a73e8";
      ctx.lineWidth = 2;
      calibrationPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      if (calibrationPoints.length === 2) {
        ctx.beginPath();
        ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
        ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
        ctx.stroke();
      }
    }

    if (tracePoints.length) {
      ctx.fillStyle = "#b5502e";
      ctx.strokeStyle = "#b5502e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      tracePoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      tracePoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        if (i > 0 && metersPerPixel) {
          const prev = tracePoints[i - 1];
          const distPx = Math.hypot(p.x - prev.x, p.y - prev.y);
          const distM = distPx * metersPerPixel;
          ctx.fillStyle = "#1f2430";
          ctx.font = "12px sans-serif";
          ctx.fillText(`${distM.toFixed(2)} m`, (prev.x + p.x) / 2 + 4, (prev.y + p.y) / 2 - 4);
          ctx.fillStyle = "#b5502e";
        }
      });
    }
  }

  function loadImageSource(src) {
    const img = new Image();
    img.onload = () => {
      image = img;
      fitCanvasToImage();
      calibrateBtn.disabled = false;
      setStatus(fileStatus, `Plan geladen (${img.width}×${img.height} px). Jetzt Maßstab kalibrieren.`);
    };
    img.onerror = () => {
      setStatus(fileStatus, "Datei konnte nicht als Bild geladen werden.");
    };
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
      image = off;
      fitCanvasToImage();
      calibrateBtn.disabled = false;
      setStatus(fileStatus, `PDF Seite 1 geladen (${off.width}×${off.height} px). Jetzt Maßstab kalibrieren.`);
    } catch (e) {
      setStatus(fileStatus, "PDF konnte nicht gelesen werden: " + e.message);
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    resetAll();
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setStatus(fileStatus, "PDF wird geladen …");
      const buf = await file.arrayBuffer();
      loadPdf(buf);
    } else {
      const reader = new FileReader();
      reader.onload = () => loadImageSource(reader.result);
      reader.readAsDataURL(file);
    }
  });

  function resetAll() {
    image = null;
    mode = "idle";
    calibrationPoints = [];
    metersPerPixel = null;
    tracePoints = [];
    segments = [];
    calibrateBtn.disabled = true;
    calibrateConfirmBtn.disabled = true;
    traceBtn.disabled = true;
    traceUndoBtn.disabled = true;
    traceFinishBtn.disabled = true;
    applyBtn.disabled = true;
    segmentsTable.classList.add("hidden");
    segmentsBody.innerHTML = "";
    setStatus(scaleStatus, "Maßstab noch nicht kalibriert.");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  calibrateBtn.addEventListener("click", () => {
    mode = "calibrating";
    calibrationPoints = [];
    calibrateConfirmBtn.disabled = true;
    setStatus(scaleStatus, "Klicke die beiden Enden der bekannten Strecke im Plan an.");
    redraw();
  });

  calibrateConfirmBtn.addEventListener("click", () => {
    if (calibrationPoints.length !== 2) return;
    const distPx = Math.hypot(
      calibrationPoints[1].x - calibrationPoints[0].x,
      calibrationPoints[1].y - calibrationPoints[0].y
    );
    const realLength = parseFloat(calibrateLengthInput.value) || 0;
    if (distPx < 1 || realLength <= 0) {
      setStatus(scaleStatus, "Ungültige Kalibrierung – bitte erneut versuchen.");
      return;
    }
    metersPerPixel = realLength / distPx;
    setStatus(scaleStatus, `Maßstab: ${metersPerPixel.toFixed(5)} m/px (${distPx.toFixed(1)} px = ${realLength} m).`);
    traceBtn.disabled = false;
    mode = "idle";
  });

  traceBtn.addEventListener("click", () => {
    mode = "tracing";
    tracePoints = [];
    traceUndoBtn.disabled = true;
    traceFinishBtn.disabled = true;
    applyBtn.disabled = true;
    segmentsTable.classList.add("hidden");
    redraw();
  });

  traceUndoBtn.addEventListener("click", () => {
    tracePoints.pop();
    traceUndoBtn.disabled = tracePoints.length === 0;
    traceFinishBtn.disabled = tracePoints.length < 2;
    redraw();
  });

  canvas.addEventListener("click", (evt) => {
    if (mode === "idle") return;
    const rect = canvas.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((evt.clientY - rect.top) / rect.height) * canvas.height;

    if (mode === "calibrating") {
      if (calibrationPoints.length >= 2) calibrationPoints = [];
      calibrationPoints.push({ x, y });
      if (calibrationPoints.length === 2) calibrateConfirmBtn.disabled = false;
      redraw();
    } else if (mode === "tracing") {
      tracePoints.push({ x, y });
      traceUndoBtn.disabled = false;
      traceFinishBtn.disabled = tracePoints.length < 2;
      redraw();
    }
  });

  function angleBetween(dxA, dyA, dxB, dyB) {
    const h1 = Math.atan2(dyA, dxA);
    const h2 = Math.atan2(dyB, dxB);
    let turn = ((h2 - h1) * 180) / Math.PI;
    turn = ((turn + 180) % 360 + 360) % 360 - 180;
    return turn;
  }

  traceFinishBtn.addEventListener("click", () => {
    if (tracePoints.length < 2 || !metersPerPixel) return;
    mode = "idle";
    const closed = traceClosedCheckbox.checked;
    const rawSegs = [];
    for (let i = 0; i < tracePoints.length - 1; i += 1) {
      const a = tracePoints[i];
      const b = tracePoints[i + 1];
      rawSegs.push({ dx: b.x - a.x, dy: b.y - a.y });
    }
    if (closed) {
      const first = tracePoints[0];
      const last = tracePoints[tracePoints.length - 1];
      rawSegs.push({ dx: first.x - last.x, dy: first.y - last.y });
    }
    segments = rawSegs.map((seg, i) => {
      const length = Math.hypot(seg.dx, seg.dy) * metersPerPixel;
      const next = rawSegs[(i + 1) % rawSegs.length];
      const angle = i < rawSegs.length - 1 || closed ? angleBetween(seg.dx, seg.dy, next.dx, next.dy) : 0;
      return { length, angle };
    });

    segmentsBody.innerHTML = segments
      .map(
        (s, i) => `
        <tr>
          <td>Seite ${i + 1}</td>
          <td>${s.length.toFixed(2)}</td>
          <td>${s.angle.toFixed(0)}</td>
        </tr>`
      )
      .join("");
    segmentsTable.classList.remove("hidden");
    applyBtn.disabled = false;
  });

  applyBtn.addEventListener("click", () => {
    if (!segments.length) return;
    window.dispatchEvent(
      new CustomEvent("plan-segments-apply", {
        detail: { segments, closed: traceClosedCheckbox.checked },
      })
    );
  });

  window.addEventListener("resize", () => {
    if (image) fitCanvasToImage();
  });

  return { resetAll };
})();
