"use strict";

const RASTER_PRESETS = {
  fein: [3.07, 2.57, 2.07, 1.57, 1.09, 0.72],
  "25": [2.5],
  "30": [3.0],
};

const STORAGE_KEY = "geruest-kalkulator-state-v1";

let sectionRowId = 0;
let lastResults = null;

const sectionsBody = document.getElementById("sections-body");
const rasterPresetEl = document.getElementById("raster-preset");
const rasterCustomLabel = document.getElementById("custom-raster-label");
const rasterCustomEl = document.getElementById("raster-custom");

function addSectionRow(data) {
  sectionRowId += 1;
  const id = sectionRowId;
  const tr = document.createElement("tr");
  tr.dataset.rowId = String(id);
  tr.innerHTML = `
    <td><input type="text" class="s-name" placeholder="z. B. Nordfassade" value="${data?.name ?? ""}"></td>
    <td><input type="number" class="s-length" min="0" step="0.01" value="${data?.length ?? ""}"></td>
    <td><input type="number" class="s-height" min="0" step="0.01" value="${data?.height ?? ""}"></td>
    <td><input type="number" class="s-opening" min="0" step="0.01" value="${data?.opening ?? 0}"></td>
    <td><input type="number" class="s-angle" step="1" value="${data?.angle ?? 90}"></td>
    <td><input type="checkbox" class="s-konsole" ${data?.konsole ? "checked" : ""}></td>
    <td><input type="number" class="s-konsolenbreite" min="0" step="0.01" value="${data?.konsolenbreite ?? 0.30}" ${data?.konsole ? "" : "disabled"}></td>
    <td><button type="button" class="row-remove-btn" title="Zeile entfernen">✕</button></td>
  `;
  tr.querySelector(".row-remove-btn").addEventListener("click", () => {
    tr.remove();
    saveState();
  });
  const konsoleCheckbox = tr.querySelector(".s-konsole");
  const konsolenbreiteInput = tr.querySelector(".s-konsolenbreite");
  konsoleCheckbox.addEventListener("change", () => {
    konsolenbreiteInput.disabled = !konsoleCheckbox.checked;
    saveState();
  });
  sectionsBody.appendChild(tr);
}

document.getElementById("add-section-btn").addEventListener("click", () => {
  addSectionRow();
  saveState();
});

rasterPresetEl.addEventListener("change", () => {
  rasterCustomLabel.classList.toggle("hidden", rasterPresetEl.value !== "custom");
  saveState();
});

const cornersConnectedEl = document.getElementById("corners-connected");
const cornersClosedEl = document.getElementById("corners-closed");

cornersConnectedEl.addEventListener("change", () => {
  cornersClosedEl.disabled = !cornersConnectedEl.checked;
  if (!cornersConnectedEl.checked) cornersClosedEl.checked = false;
  saveState();
});
cornersClosedEl.addEventListener("change", saveState);

function getRasterLengths() {
  const preset = rasterPresetEl.value;
  if (preset === "custom") {
    const raw = rasterCustomEl.value
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
    return raw.length ? raw.sort((a, b) => b - a) : [2.5];
  }
  return RASTER_PRESETS[preset] || RASTER_PRESETS.fein;
}

function fillFields(length, rasterLengths) {
  const sorted = [...rasterLengths].sort((a, b) => b - a);
  let remaining = length;
  const counts = [];
  for (const len of sorted) {
    let n = 0;
    while (remaining >= len - 1e-6) {
      n += 1;
      remaining -= len;
    }
    if (n > 0) counts.push({ len, n });
  }
  if (remaining > 1e-3) {
    const smallest = sorted[sorted.length - 1];
    const existing = counts.find((c) => c.len === smallest);
    if (existing) existing.n += 1;
    else counts.push({ len: smallest, n: 1 });
    remaining -= smallest;
  }
  const covered = length - remaining;
  const totalFields = counts.reduce((sum, c) => sum + c.n, 0);
  return { counts, covered, totalFields };
}

function readSections() {
  const rows = [...sectionsBody.querySelectorAll("tr")];
  return rows
    .map((tr) => ({
      name: tr.querySelector(".s-name").value.trim() || "Abschnitt",
      length: parseFloat(tr.querySelector(".s-length").value) || 0,
      height: parseFloat(tr.querySelector(".s-height").value) || 0,
      opening: parseFloat(tr.querySelector(".s-opening").value) || 0,
      angle: parseFloat(tr.querySelector(".s-angle").value),
      konsole: tr.querySelector(".s-konsole").checked,
      konsolenbreite: parseFloat(tr.querySelector(".s-konsolenbreite").value) || 0,
    }))
    .filter((s) => s.length > 0 && s.height > 0)
    .map((s) => ({ ...s, angle: isNaN(s.angle) ? 90 : s.angle }));
}

function calculate() {
  const lagenhoehe = parseFloat(document.getElementById("lagenhoehe").value) || 2.0;
  const geruestbreite = parseFloat(document.getElementById("geruestbreite").value) || 0.7;
  const belagbreite = parseFloat(document.getElementById("belagbreite").value) || 0.32;
  const ankerraster = parseFloat(document.getElementById("ankerraster").value) || 8;
  const diagonalraster = parseFloat(document.getElementById("diagonalraster").value) || 5;
  const wandabstand = parseFloat(document.getElementById("wandabstand").value) || 0;
  const rasterLengths = getRasterLengths();
  const bohlenProFeld = Math.max(1, Math.ceil(geruestbreite / belagbreite));
  const cornersConnected = document.getElementById("corners-connected").checked;
  const cornersClosed = document.getElementById("corners-closed").checked;

  const sections = readSections();
  if (!sections.length) {
    alert("Bitte mindestens einen Fassadenabschnitt mit Länge und Höhe eintragen.");
    return null;
  }

  const perSection = sections.map((s) => {
    const flaecheBrutto = s.length * s.height;
    const flaeche = Math.max(0, flaecheBrutto - s.opening);
    const lagen = Math.ceil(s.height / lagenhoehe);
    const fieldFill = fillFields(s.length, rasterLengths);
    const felder = fieldFill.totalFields;
    const anker = Math.ceil(flaeche / ankerraster);

    const arbeitsbreite = geruestbreite + (s.konsole ? s.konsolenbreite : 0);
    const bohlenProFeldSection = Math.max(1, Math.ceil(arbeitsbreite / belagbreite));
    const ausladung = wandabstand + geruestbreite + (s.konsole ? s.konsolenbreite : 0);

    const staender = (felder + 1) * lagen;
    const fussspindeln = felder + 1;
    const belaege = bohlenProFeldSection * felder * lagen;
    const gelaenderholme = 2 * felder * lagen;
    const bordbretter = felder * lagen;
    const diagonalBays = Math.ceil(felder / diagonalraster);
    const diagonalen = diagonalBays * lagen;
    const konsolen = s.konsole ? (felder + 1) * lagen : 0;

    return {
      ...s,
      flaecheBrutto,
      flaeche,
      lagen,
      felder,
      fieldFill,
      anker,
      arbeitsbreite,
      bohlenProFeldSection,
      ausladung,
      staender,
      fussspindeln,
      belaege,
      gelaenderholme,
      bordbretter,
      diagonalen,
      konsolen,
    };
  });

  const totals = perSection.reduce(
    (acc, s) => {
      acc.flaeche += s.flaeche;
      acc.laenge += s.length;
      acc.anker += s.anker;
      acc.staender += s.staender;
      acc.fussspindeln += s.fussspindeln;
      acc.belaege += s.belaege;
      acc.gelaenderholme += s.gelaenderholme;
      acc.bordbretter += s.bordbretter;
      acc.diagonalen += s.diagonalen;
      acc.konsolen += s.konsolen;
      acc.maxLagen = Math.max(acc.maxLagen, s.lagen);
      return acc;
    },
    {
      flaeche: 0,
      laenge: 0,
      anker: 0,
      staender: 0,
      fussspindeln: 0,
      belaege: 0,
      gelaenderholme: 0,
      bordbretter: 0,
      diagonalen: 0,
      konsolen: 0,
      maxLagen: 0,
    }
  );

  let eckStaenderKorrektur = 0;
  let eckSpindelKorrektur = 0;
  let eckenAnzahl = 0;
  if (cornersConnected && perSection.length > 1) {
    const n = perSection.length;
    const junctions = cornersClosed ? n : n - 1;
    for (let i = 0; i < junctions; i += 1) {
      const a = perSection[i];
      const b = perSection[(i + 1) % n];
      eckStaenderKorrektur += Math.min(a.lagen, b.lagen);
      eckSpindelKorrektur += 1;
      eckenAnzahl += 1;
    }
    totals.staender -= eckStaenderKorrektur;
    totals.fussspindeln -= eckSpindelKorrektur;
  }

  let geometry = null;
  if (cornersConnected && perSection.length >= 1) {
    const edges = perSection.map((s) => ({ length: s.length, angle: s.angle }));
    const walk = Geometry.turtlePolygon(edges, cornersClosed);
    const wandDist = perSection.map(() => wandabstand);
    const outerDist = perSection.map((s) => wandabstand + geruestbreite + (s.konsole ? s.konsolenbreite : 0));
    const baseOuterDist = perSection.map(() => wandabstand + geruestbreite);
    geometry = {
      ring: walk.ring,
      closed: cornersClosed,
      closingError: walk.closingError,
      staenderRing: Geometry.offsetPolygonEdges(walk.ring, cornersClosed, wandDist),
      outerRing: Geometry.offsetPolygonEdges(walk.ring, cornersClosed, outerDist),
      baseOuterRing: Geometry.offsetPolygonEdges(walk.ring, cornersClosed, baseOuterDist),
    };
  }

  return {
    perSection,
    totals,
    corners: { connected: cornersConnected, closed: cornersClosed, count: eckenAnzahl, eckStaenderKorrektur, eckSpindelKorrektur },
    settings: { lagenhoehe, geruestbreite, belagbreite, ankerraster, diagonalraster, wandabstand, bohlenProFeld },
    geometry,
  };
}

function fmt(n, digits = 1) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function renderResults(results) {
  const { perSection, totals, corners } = results;

  document.getElementById("results-panel").classList.remove("hidden");
  document.getElementById("export-csv-btn").disabled = false;
  document.getElementById("print-btn").disabled = false;

  const summaryCards = document.getElementById("summary-cards");
  summaryCards.innerHTML = `
    <div class="card"><div class="value">${fmt(totals.flaeche, 1)}</div><div class="label">Gerüstfläche gesamt (m²)</div></div>
    <div class="card"><div class="value">${fmt(totals.laenge, 1)}</div><div class="label">Gerüstlänge gesamt (m)</div></div>
    <div class="card"><div class="value">${totals.maxLagen}</div><div class="label">Max. Lagen (Abschnitt)</div></div>
    <div class="card"><div class="value">${totals.anker}</div><div class="label">Anker gesamt</div></div>
  `;

  const cornerNote = document.getElementById("corner-note");
  if (corners.connected && perSection.length > 1) {
    cornerNote.textContent = `Ecken berücksichtigt: ${corners.count} gemeinsame Eckverbindung(en) (${corners.closed ? "geschlossener Umlauf" : "offener Rundgang"}) – dadurch ${corners.eckStaenderKorrektur} Ständer und ${corners.eckSpindelKorrektur} Fußspindel(n) weniger, da an jeder Ecke ein Ständer von beiden angrenzenden Seiten gemeinsam genutzt wird.`;
    cornerNote.classList.remove("hidden");
  } else {
    cornerNote.classList.add("hidden");
  }

  const resultsBody = document.getElementById("results-body");
  resultsBody.innerHTML = perSection
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${fmt(s.length, 2)}</td>
        <td>${fmt(s.height, 2)}</td>
        <td>${fmt(s.flaeche, 1)}</td>
        <td>${s.felder}</td>
        <td>${s.lagen}</td>
        <td>${s.anker}</td>
        <td>${s.konsole ? `ja (${fmt(s.konsolenbreite, 2)} m)` : "–"}</td>
        <td>${fmt(s.ausladung, 2)}</td>
      </tr>`
    )
    .join("");

  const materialBody = document.getElementById("material-body");
  const konsolenAbschnitte = perSection.filter((s) => s.konsole).length;
  const materialRows = [
    [
      "Gerüstböden/Beläge",
      totals.belaege,
      "Stk",
      `Bohlen à ${fmt(results.settings.belagbreite, 2)} m Breite${konsolenAbschnitte ? `; Breite je Abschnitt inkl. Konsole berücksichtigt (${konsolenAbschnitte} Abschnitt(e) mit Konsole)` : `, ${results.settings.bohlenProFeld} je Feld`}`,
    ],
    [
      "Ständer/Vertikalrahmen",
      totals.staender,
      "Stk",
      `je Feldgrenze und Lage${results.corners.eckStaenderKorrektur ? ` (−${results.corners.eckStaenderKorrektur} durch ${results.corners.count} gemeinsame Eckständer)` : ""}`,
    ],
    [
      "Fußspindeln",
      totals.fussspindeln,
      "Stk",
      `nur Standfläche (unterste Lage)${results.corners.eckSpindelKorrektur ? ` (−${results.corners.eckSpindelKorrektur} durch gemeinsame Eckspindeln)` : ""}`,
    ],
    ["Geländerholme (Handlauf + Zwischenholm)", totals.gelaenderholme, "Stk", "2 je Feld und Lage"],
    ["Bordbretter", totals.bordbretter, "Stk", "1 je Feld und Lage"],
    ["Diagonalen", totals.diagonalen, "Stk", `1 je ${results.settings.diagonalraster} Felder und Lage`],
    ["Wandanker", totals.anker, "Stk", `Raster ${fmt(results.settings.ankerraster, 1)} m² je Anker`],
  ];
  if (totals.konsolen > 0) {
    materialRows.push([
      "Konsolen",
      totals.konsolen,
      "Stk",
      `je Ständerposition und Lage, an ${konsolenAbschnitte} Abschnitt(en); Außenkante rückt dort um die Konsolenbreite nach außen`,
    ]);
  }
  materialBody.innerHTML = materialRows
    .map(
      ([name, qty, unit, note]) => `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>${qty}</td>
        <td>${unit}</td>
        <td>${escapeHtml(note)}</td>
      </tr>`
    )
    .join("");

  const fieldsBody = document.getElementById("fields-body");
  fieldsBody.innerHTML = perSection
    .map((s) => {
      const dist = s.fieldFill.counts
        .map((c) => `${c.n} × ${fmt(c.len, 2)} m`)
        .join(", ");
      return `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${dist}</td>
        <td>${fmt(s.fieldFill.covered, 2)}</td>
      </tr>`;
    })
    .join("");
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderPlan2D(results) {
  const svg = document.getElementById("plan2d-svg");
  const note = document.getElementById("plan2d-note");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const geometry = results.geometry;
  if (!geometry || geometry.ring.length < 2) {
    note.textContent =
      'Aktiviere in den Einstellungen "Abschnitte bilden einen zusammenhängenden Rundgang", damit hieraus automatisch ein Lageplan erzeugt wird.';
    svg.setAttribute("viewBox", "0 0 100 100");
    return;
  }

  const allPoints = [...geometry.ring, ...geometry.staenderRing, ...geometry.outerRing, ...geometry.baseOuterRing];
  const b = Geometry.bounds([allPoints]);
  const pad = Math.max(1.5, (b.maxX - b.minX + b.maxY - b.minY) * 0.05);
  const width = b.maxX - b.minX + pad * 2 || 10;
  const height = b.maxY - b.minY + pad * 2 || 10;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const toSvg = (p) => ({ x: p.x - b.minX + pad, y: b.maxY - p.y + pad });

  function ringToPath(ring, closed) {
    const pts = ring.map(toSvg);
    return pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(3) + "," + p.y.toFixed(3)).join(" ") + (closed ? " Z" : "");
  }

  function addPath(d, attrs) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", d);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    svg.appendChild(el);
    return el;
  }

  const sw = Math.max(width, height) / 300;
  const fontSize = Math.max(width, height) / 55;

  addPath(ringToPath(geometry.ring, geometry.closed), { fill: "none", stroke: "#1f2430", "stroke-width": sw * 2.2 });
  addPath(ringToPath(geometry.staenderRing, geometry.closed), {
    fill: "none",
    stroke: "#8a8f98",
    "stroke-width": sw,
    "stroke-dasharray": `${sw * 3},${sw * 2}`,
  });
  addPath(ringToPath(geometry.baseOuterRing, geometry.closed), { fill: "none", stroke: "#1a73e8", "stroke-width": sw * 1.6 });
  const hasKonsole = results.perSection.some((s) => s.konsole);
  if (hasKonsole) {
    addPath(ringToPath(geometry.outerRing, geometry.closed), {
      fill: "none",
      stroke: "#b5502e",
      "stroke-width": sw * 1.2,
      "stroke-dasharray": `${sw * 2.5},${sw * 1.5}`,
    });
  }

  const n = geometry.ring.length;
  const edgeCount = geometry.closed ? n : n - 1;
  for (let i = 0; i < edgeCount; i += 1) {
    const a = geometry.ring[i];
    const bpt = geometry.ring[(i + 1) % n];
    const mid = toSvg({ x: (a.x + bpt.x) / 2, y: (a.y + bpt.y) / 2 });
    const len = Math.hypot(bpt.x - a.x, bpt.y - a.y);
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", mid.x);
    text.setAttribute("y", mid.y);
    text.setAttribute("font-size", fontSize);
    text.setAttribute("fill", "#1f2430");
    text.setAttribute("text-anchor", "middle");
    text.textContent = `${fmt(len, 2)} m`;
    svg.appendChild(text);
  }

  geometry.ring.forEach((v) => {
    const p = toSvg(v);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", p.x);
    c.setAttribute("cy", p.y);
    c.setAttribute("r", sw * 2);
    c.setAttribute("fill", "#1f2430");
    svg.appendChild(c);
  });

  // Scale bar
  const barLenM = width > 40 ? 10 : width > 15 ? 5 : 1;
  const barX = pad * 0.3;
  const barY = height - pad * 0.4;
  addPath(`M${barX},${barY} L${barX + barLenM},${barY}`, { stroke: "#1f2430", "stroke-width": sw * 1.5 });
  const barText = document.createElementNS(SVG_NS, "text");
  barText.setAttribute("x", barX);
  barText.setAttribute("y", barY - sw * 3);
  barText.setAttribute("font-size", fontSize * 0.8);
  barText.setAttribute("fill", "#1f2430");
  barText.textContent = `${barLenM} m`;
  svg.appendChild(barText);

  const closingNote =
    geometry.closingError != null && geometry.closingError > 0.05
      ? ` Hinweis: Schlussfehler des Rundgangs ${fmt(geometry.closingError, 2)} m – Längen/Winkel prüfen.`
      : "";
  note.textContent = `Schwarz = Gebäudelinie (eingegebene Längen/Winkel), grau gestrichelt = Ständerachse (Wandabstand ${fmt(
    results.settings.wandabstand,
    2
  )} m), blau = Gerüst-Außenkante${hasKonsole ? ", orange gestrichelt = Außenkante inkl. Konsole" : ""}.${closingNote}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("calc-btn").addEventListener("click", () => {
  const results = calculate();
  if (!results) return;
  lastResults = results;
  renderResults(results);
  renderPlan2D(results);
  if (typeof View3D !== "undefined") View3D.render(results);
  saveState();
});

document.getElementById("print-btn").addEventListener("click", () => {
  window.print();
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
  if (!lastResults) return;
  const { perSection, totals } = lastResults;
  const lines = [];
  lines.push("Gerüstmengen-Kalkulator - Ergebnis");
  lines.push("");
  lines.push("Abschnitt;Laenge (m);Hoehe (m);Flaeche (m2);Felder;Lagen;Anker;Konsole;Konsolenbreite (m);Ausladung (m)");
  perSection.forEach((s) => {
    lines.push(
      `${s.name};${fmt(s.length, 2)};${fmt(s.height, 2)};${fmt(s.flaeche, 1)};${s.felder};${s.lagen};${s.anker};${s.konsole ? "ja" : "nein"};${fmt(s.konsolenbreite, 2)};${fmt(s.ausladung, 2)}`
    );
  });
  lines.push(`Summe;${fmt(totals.laenge, 2)};;${fmt(totals.flaeche, 1)};;;${totals.anker}`);
  lines.push("");
  lines.push("Bauteil;Menge;Einheit");
  lines.push(`Geruestboeden/Belaege;${totals.belaege};Stk`);
  lines.push(`Staender/Vertikalrahmen;${totals.staender};Stk`);
  lines.push(`Fussspindeln;${totals.fussspindeln};Stk`);
  lines.push(`Gelaenderholme;${totals.gelaenderholme};Stk`);
  lines.push(`Bordbretter;${totals.bordbretter};Stk`);
  lines.push(`Diagonalen;${totals.diagonalen};Stk`);
  lines.push(`Wandanker;${totals.anker};Stk`);
  if (totals.konsolen > 0) lines.push(`Konsolen;${totals.konsolen};Stk`);

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "geruestmengen.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function saveState() {
  try {
    const state = {
      settings: {
        lagenhoehe: document.getElementById("lagenhoehe").value,
        geruestbreite: document.getElementById("geruestbreite").value,
        belagbreite: document.getElementById("belagbreite").value,
        ankerraster: document.getElementById("ankerraster").value,
        diagonalraster: document.getElementById("diagonalraster").value,
        wandabstand: document.getElementById("wandabstand").value,
        rasterPreset: rasterPresetEl.value,
        rasterCustom: rasterCustomEl.value,
        cornersConnected: cornersConnectedEl.checked,
        cornersClosed: cornersClosedEl.checked,
      },
      sections: readSections(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* localStorage nicht verfügbar - kein Problem, nur Komfortfunktion */
  }
}

function loadState() {
  let state = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {
    state = null;
  }

  if (state?.settings) {
    document.getElementById("lagenhoehe").value = state.settings.lagenhoehe ?? "2.00";
    document.getElementById("geruestbreite").value = state.settings.geruestbreite ?? "0.70";
    document.getElementById("belagbreite").value = state.settings.belagbreite ?? "0.32";
    document.getElementById("ankerraster").value = state.settings.ankerraster ?? "8";
    document.getElementById("diagonalraster").value = state.settings.diagonalraster ?? "5";
    document.getElementById("wandabstand").value = state.settings.wandabstand ?? "0.30";
    rasterPresetEl.value = state.settings.rasterPreset ?? "fein";
    rasterCustomEl.value = state.settings.rasterCustom ?? "";
    rasterCustomLabel.classList.toggle("hidden", rasterPresetEl.value !== "custom");
    cornersConnectedEl.checked = Boolean(state.settings.cornersConnected);
    cornersClosedEl.disabled = !cornersConnectedEl.checked;
    cornersClosedEl.checked = cornersConnectedEl.checked && Boolean(state.settings.cornersClosed);
  }

  if (state?.sections?.length) {
    state.sections.forEach((s) => addSectionRow(s));
  } else {
    addSectionRow({ name: "Fassade 1" });
  }
}

window.addEventListener("plan-segments-apply", (evt) => {
  const { segments, closed } = evt.detail;
  const defaultHeight = parseFloat(document.getElementById("plan-default-height").value) || 9.3;
  sectionsBody.innerHTML = "";
  segments.forEach((seg, i) => {
    addSectionRow({ name: `Seite ${i + 1}`, length: seg.length.toFixed(2), height: defaultHeight, angle: Math.round(seg.angle) });
  });
  cornersConnectedEl.checked = true;
  cornersClosedEl.disabled = false;
  cornersClosedEl.checked = closed;
  saveState();
  document.getElementById("sections-panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

// Auto-save on any input change within the settings/sections panels.
document.getElementById("settings-panel").addEventListener("input", saveState);
sectionsBody.addEventListener("input", saveState);

loadState();
