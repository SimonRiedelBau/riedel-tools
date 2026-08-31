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
    <td><button type="button" class="row-remove-btn" title="Zeile entfernen">✕</button></td>
  `;
  tr.querySelector(".row-remove-btn").addEventListener("click", () => {
    tr.remove();
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
    }))
    .filter((s) => s.length > 0 && s.height > 0);
}

function calculate() {
  const lagenhoehe = parseFloat(document.getElementById("lagenhoehe").value) || 2.0;
  const geruestbreite = parseFloat(document.getElementById("geruestbreite").value) || 0.7;
  const belagbreite = parseFloat(document.getElementById("belagbreite").value) || 0.32;
  const ankerraster = parseFloat(document.getElementById("ankerraster").value) || 8;
  const diagonalraster = parseFloat(document.getElementById("diagonalraster").value) || 5;
  const rasterLengths = getRasterLengths();
  const bohlenProFeld = Math.max(1, Math.ceil(geruestbreite / belagbreite));

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

    const staender = (felder + 1) * lagen;
    const fussspindeln = felder + 1;
    const belaege = bohlenProFeld * felder * lagen;
    const gelaenderholme = 2 * felder * lagen;
    const bordbretter = felder * lagen;
    const diagonalBays = Math.ceil(felder / diagonalraster);
    const diagonalen = diagonalBays * lagen;

    return {
      ...s,
      flaecheBrutto,
      flaeche,
      lagen,
      felder,
      fieldFill,
      anker,
      staender,
      fussspindeln,
      belaege,
      gelaenderholme,
      bordbretter,
      diagonalen,
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
      maxLagen: 0,
    }
  );

  return { perSection, totals, settings: { lagenhoehe, geruestbreite, belagbreite, ankerraster, diagonalraster, bohlenProFeld } };
}

function fmt(n, digits = 1) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function renderResults(results) {
  const { perSection, totals } = results;

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
      </tr>`
    )
    .join("");

  const materialBody = document.getElementById("material-body");
  const materialRows = [
    ["Gerüstböden/Beläge", totals.belaege, "Stk", `Bohlen à ${fmt(results.settings.belagbreite, 2)} m Breite, ${results.settings.bohlenProFeld} je Feld`],
    ["Ständer/Vertikalrahmen", totals.staender, "Stk", "je Feldgrenze und Lage"],
    ["Fußspindeln", totals.fussspindeln, "Stk", "nur Standfläche (unterste Lage)"],
    ["Geländerholme (Handlauf + Zwischenholm)", totals.gelaenderholme, "Stk", "2 je Feld und Lage"],
    ["Bordbretter", totals.bordbretter, "Stk", "1 je Feld und Lage"],
    ["Diagonalen", totals.diagonalen, "Stk", `1 je ${results.settings.diagonalraster} Felder und Lage`],
    ["Wandanker", totals.anker, "Stk", `Raster ${fmt(results.settings.ankerraster, 1)} m² je Anker`],
  ];
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
  lines.push("Abschnitt;Laenge (m);Hoehe (m);Flaeche (m2);Felder;Lagen;Anker");
  perSection.forEach((s) => {
    lines.push(`${s.name};${fmt(s.length, 2)};${fmt(s.height, 2)};${fmt(s.flaeche, 1)};${s.felder};${s.lagen};${s.anker}`);
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
        rasterPreset: rasterPresetEl.value,
        rasterCustom: rasterCustomEl.value,
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
    rasterPresetEl.value = state.settings.rasterPreset ?? "fein";
    rasterCustomEl.value = state.settings.rasterCustom ?? "";
    rasterCustomLabel.classList.toggle("hidden", rasterPresetEl.value !== "custom");
  }

  if (state?.sections?.length) {
    state.sections.forEach((s) => addSectionRow(s));
  } else {
    addSectionRow({ name: "Fassade 1" });
  }
}

// Auto-save on any input change within the settings/sections panels.
document.getElementById("settings-panel").addEventListener("input", saveState);
sectionsBody.addEventListener("input", saveState);

loadState();
