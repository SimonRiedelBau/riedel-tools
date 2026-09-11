"use strict";

const RASTER_PRESETS = {
  fein: [3.07, 2.57, 2.07, 1.57, 1.09, 0.72],
  "25": [2.5],
  "30": [3.0],
};

const STORAGE_KEY = "geruest-kalkulator-state-v2";

let sectionRowId = 0;
let lastCalcResult = null; // { storyResults, grandTotals }

const sectionsBody = document.getElementById("sections-body");
const rasterPresetEl = document.getElementById("raster-preset");
const rasterCustomLabel = document.getElementById("custom-raster-label");
const rasterCustomEl = document.getElementById("raster-custom");
const cornersConnectedEl = document.getElementById("corners-connected");
const cornersClosedEl = document.getElementById("corners-closed");

// ---------------------------------------------------------------------
// Geschossebenen (stories): each story is an independent floor plan
// (its own Fassadenabschnitte + corner settings). Global settings
// (Lagenhöhe, Gerüstbreite, Raster, ...) are shared across all stories.
// ---------------------------------------------------------------------

let stories = [];
let activeStoryIndex = 0;

function defaultSection(name) {
  return { name: name || "Fassade 1", length: "", height: "", opening: 0, angle: 90, konsole: false, konsolenbreite: 0.3 };
}

function createStory(name) {
  return {
    id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || `Geschoss ${stories.length + 1}`,
    sockelhoehe: 0,
    sections: [defaultSection("Fassade 1")],
    cornersConnected: false,
    cornersClosed: false,
  };
}

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

cornersConnectedEl.addEventListener("change", () => {
  cornersClosedEl.disabled = !cornersConnectedEl.checked;
  if (!cornersConnectedEl.checked) cornersClosedEl.checked = false;
  saveState();
});
cornersClosedEl.addEventListener("change", saveState);

function readSectionsFromDom() {
  const rows = [...sectionsBody.querySelectorAll("tr")];
  return rows.map((tr) => ({
    name: tr.querySelector(".s-name").value.trim() || "Abschnitt",
    length: tr.querySelector(".s-length").value,
    height: tr.querySelector(".s-height").value,
    opening: tr.querySelector(".s-opening").value,
    angle: tr.querySelector(".s-angle").value,
    konsole: tr.querySelector(".s-konsole").checked,
    konsolenbreite: tr.querySelector(".s-konsolenbreite").value,
  }));
}

function serializeActiveStoryFromDom() {
  const story = stories[activeStoryIndex];
  if (!story) return;
  story.sections = readSectionsFromDom();
  story.cornersConnected = cornersConnectedEl.checked;
  story.cornersClosed = cornersClosedEl.checked;
}

function loadStoryIntoDom(story) {
  sectionsBody.innerHTML = "";
  (story.sections.length ? story.sections : [defaultSection("Fassade 1")]).forEach((s) => addSectionRow(s));
  cornersConnectedEl.checked = Boolean(story.cornersConnected);
  cornersClosedEl.disabled = !cornersConnectedEl.checked;
  cornersClosedEl.checked = cornersConnectedEl.checked && Boolean(story.cornersClosed);
  document.getElementById("story-name").value = story.name;
  document.getElementById("story-sockelhoehe").value = story.sockelhoehe ?? 0;
  document.querySelectorAll(".active-story-badge").forEach((el) => (el.textContent = story.name));
}

function computeAutoSockelhoehe(index) {
  let cumulative = 0;
  for (let i = 0; i < index; i += 1) {
    const heights = stories[i].sections.map((s) => parseFloat(s.height) || 0);
    cumulative += heights.length ? Math.max(...heights) : 0;
  }
  return cumulative;
}

function renderStoryTabs() {
  const tabs = document.getElementById("story-tabs");
  tabs.innerHTML = stories
    .map((s, i) => `<button type="button" class="story-tab${i === activeStoryIndex ? " active" : ""}" data-idx="${i}">${escapeHtml(s.name)}</button>`)
    .join("");
  tabs.querySelectorAll(".story-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchToStory(Number(btn.dataset.idx)));
  });
  document.getElementById("story-delete-btn").disabled = stories.length <= 1;
}

function switchToStory(index) {
  if (index === activeStoryIndex) return;
  serializeActiveStoryFromDom();
  activeStoryIndex = index;
  loadStoryIntoDom(stories[activeStoryIndex]);
  renderStoryTabs();
  saveState();
}

document.getElementById("story-add-btn").addEventListener("click", () => {
  serializeActiveStoryFromDom();
  stories.push(createStory());
  activeStoryIndex = stories.length - 1;
  stories[activeStoryIndex].sockelhoehe = computeAutoSockelhoehe(activeStoryIndex);
  loadStoryIntoDom(stories[activeStoryIndex]);
  renderStoryTabs();
  saveState();
});

document.getElementById("story-duplicate-btn").addEventListener("click", () => {
  serializeActiveStoryFromDom();
  const src = stories[activeStoryIndex];
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = `story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  copy.name = `${src.name} (Kopie)`;
  stories.splice(activeStoryIndex + 1, 0, copy);
  activeStoryIndex += 1;
  stories[activeStoryIndex].sockelhoehe = computeAutoSockelhoehe(activeStoryIndex);
  loadStoryIntoDom(stories[activeStoryIndex]);
  renderStoryTabs();
  saveState();
});

document.getElementById("story-delete-btn").addEventListener("click", () => {
  if (stories.length <= 1) return;
  if (!confirm(`Geschoss "${stories[activeStoryIndex].name}" wirklich löschen?`)) return;
  stories.splice(activeStoryIndex, 1);
  activeStoryIndex = Math.max(0, activeStoryIndex - 1);
  loadStoryIntoDom(stories[activeStoryIndex]);
  renderStoryTabs();
  saveState();
});

document.getElementById("story-name").addEventListener("input", (e) => {
  stories[activeStoryIndex].name = e.target.value.trim() || `Geschoss ${activeStoryIndex + 1}`;
  renderStoryTabs();
  document.querySelectorAll(".active-story-badge").forEach((el) => (el.textContent = stories[activeStoryIndex].name));
  saveState();
});

document.getElementById("story-sockelhoehe").addEventListener("input", (e) => {
  stories[activeStoryIndex].sockelhoehe = parseFloat(e.target.value) || 0;
  saveState();
});

document.getElementById("story-sockelhoehe-auto-btn").addEventListener("click", () => {
  serializeActiveStoryFromDom();
  const auto = computeAutoSockelhoehe(activeStoryIndex);
  stories[activeStoryIndex].sockelhoehe = auto;
  document.getElementById("story-sockelhoehe").value = auto;
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

function normalizeSections(rawSections) {
  return rawSections
    .map((s) => ({
      name: (s.name || "Abschnitt").trim() || "Abschnitt",
      length: parseFloat(s.length) || 0,
      height: parseFloat(s.height) || 0,
      opening: parseFloat(s.opening) || 0,
      angle: parseFloat(s.angle),
      konsole: Boolean(s.konsole),
      konsolenbreite: parseFloat(s.konsolenbreite) || 0,
    }))
    .filter((s) => s.length > 0 && s.height > 0)
    .map((s) => ({ ...s, angle: isNaN(s.angle) ? 90 : s.angle }));
}

function getGlobalSettings() {
  return {
    lagenhoehe: parseFloat(document.getElementById("lagenhoehe").value) || 2.0,
    geruestbreite: parseFloat(document.getElementById("geruestbreite").value) || 0.7,
    belagbreite: parseFloat(document.getElementById("belagbreite").value) || 0.32,
    ankerraster: parseFloat(document.getElementById("ankerraster").value) || 8,
    diagonalraster: parseFloat(document.getElementById("diagonalraster").value) || 5,
    wandabstand: parseFloat(document.getElementById("wandabstand").value) || 0,
    rasterLengths: getRasterLengths(),
  };
}

// Calculates one story's quantities from its own sections + corner settings.
// Global settings (Lagenhöhe, Gerüstbreite, ...) are shared across stories.
function calculateStory(rawSections, cornersConnected, cornersClosed, globalSettings) {
  const { lagenhoehe, geruestbreite, belagbreite, ankerraster, diagonalraster, wandabstand, rasterLengths } = globalSettings;
  const bohlenProFeld = Math.max(1, Math.ceil(geruestbreite / belagbreite));

  const sections = normalizeSections(rawSections);
  if (!sections.length) return null;

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
    { flaeche: 0, laenge: 0, anker: 0, staender: 0, fussspindeln: 0, belaege: 0, gelaenderholme: 0, bordbretter: 0, diagonalen: 0, konsolen: 0, maxLagen: 0 }
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

function calculateAllStories() {
  serializeActiveStoryFromDom();
  const globalSettings = getGlobalSettings();

  const storyResults = [];
  const missing = [];
  for (const story of stories) {
    const result = calculateStory(story.sections, story.cornersConnected, story.cornersClosed, globalSettings);
    if (!result) {
      missing.push(story.name);
      continue;
    }
    storyResults.push({ story, result });
  }

  if (missing.length) {
    alert(`Bitte in jedem Geschoss mindestens einen Fassadenabschnitt mit Länge und Höhe eintragen. Fehlt bei: ${missing.join(", ")}.`);
    return null;
  }
  if (!storyResults.length) {
    alert("Bitte mindestens einen Fassadenabschnitt mit Länge und Höhe eintragen.");
    return null;
  }

  let cumulative = 0;
  storyResults.forEach((sr) => {
    const maxHeight = Math.max(...sr.result.perSection.map((s) => s.height));
    sr.sockelhoehe = sr.story.sockelhoehe || 0;
    cumulative = Math.max(cumulative, sr.sockelhoehe + maxHeight);
  });

  const grandTotals = storyResults.reduce(
    (acc, sr) => {
      const t = sr.result.totals;
      acc.flaeche += t.flaeche;
      acc.laenge += t.laenge;
      acc.anker += t.anker;
      acc.staender += t.staender;
      acc.fussspindeln += t.fussspindeln;
      acc.belaege += t.belaege;
      acc.gelaenderholme += t.gelaenderholme;
      acc.bordbretter += t.bordbretter;
      acc.diagonalen += t.diagonalen;
      acc.konsolen += t.konsolen;
      acc.maxLagen = Math.max(acc.maxLagen, t.maxLagen);
      return acc;
    },
    { flaeche: 0, laenge: 0, anker: 0, staender: 0, fussspindeln: 0, belaege: 0, gelaenderholme: 0, bordbretter: 0, diagonalen: 0, konsolen: 0, maxLagen: 0 }
  );
  grandTotals.gesamthoehe = cumulative;

  return { storyResults, grandTotals, globalSettings };
}

function fmt(n, digits = 1) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

function renderResultsBody(result, prefix) {
  return result.perSection
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
}

function renderFieldsBody(result) {
  return result.perSection
    .map((s) => {
      const dist = s.fieldFill.counts.map((c) => `${c.n} × ${fmt(c.len, 2)} m`).join(", ");
      return `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${dist}</td>
        <td>${fmt(s.fieldFill.covered, 2)}</td>
      </tr>`;
    })
    .join("");
}

function renderPerStoryBlock(sr, idx) {
  const { story, result, sockelhoehe } = sr;
  const cornerNote =
    result.corners.connected && result.perSection.length > 1
      ? `<p class="hint">Ecken berücksichtigt: ${result.corners.count} gemeinsame Eckverbindung(en) (${
          result.corners.closed ? "geschlossener Umlauf" : "offener Rundgang"
        }) – dadurch ${result.corners.eckStaenderKorrektur} Ständer und ${result.corners.eckSpindelKorrektur} Fußspindel(n) weniger.</p>`
      : "";
  return `
    <div class="per-story-block">
      <h4>${escapeHtml(story.name)} — Sockelhöhe ${fmt(sockelhoehe, 2)} m, Fläche ${fmt(result.totals.flaeche, 1)} m², ${result.totals.maxLagen} Lagen</h4>
      ${cornerNote}
      <div class="table-wrap">
        <table class="results-subtable">
          <thead>
            <tr>
              <th>Abschnitt</th><th>Länge (m)</th><th>Höhe (m)</th><th>Fläche (m²)</th>
              <th>Felder</th><th>Lagen</th><th>Anker</th><th>Konsole</th><th>Ausladung (m)</th>
            </tr>
          </thead>
          <tbody>${renderResultsBody(result)}</tbody>
        </table>
      </div>
      <div class="table-wrap">
        <table class="results-subtable">
          <thead><tr><th>Abschnitt</th><th>Feldlängen-Verteilung</th><th>Gedeckte Länge (m)</th></tr></thead>
          <tbody>${renderFieldsBody(result)}</tbody>
        </table>
      </div>
    </div>`;
}

function renderResults(calcResult) {
  const { storyResults, grandTotals } = calcResult;

  document.getElementById("results-panel").classList.remove("hidden");
  document.getElementById("export-csv-btn").disabled = false;
  document.getElementById("print-btn").disabled = false;

  const summaryCards = document.getElementById("summary-cards");
  summaryCards.innerHTML = `
    <div class="card"><div class="value">${fmt(grandTotals.flaeche, 1)}</div><div class="label">Gerüstfläche gesamt (m²)</div></div>
    <div class="card"><div class="value">${fmt(grandTotals.laenge, 1)}</div><div class="label">Gerüstlänge gesamt (m, Summe Geschosse)</div></div>
    <div class="card"><div class="value">${fmt(grandTotals.gesamthoehe, 2)}</div><div class="label">Gesamthöhe (m, oberste Lage)</div></div>
    <div class="card"><div class="value">${grandTotals.anker}</div><div class="label">Anker gesamt</div></div>
    <div class="card"><div class="value">${storyResults.length}</div><div class="label">Geschosse</div></div>
  `;

  document.getElementById("corner-note").classList.add("hidden");

  const perStoryContainer = document.getElementById("per-story-results");
  perStoryContainer.innerHTML = storyResults.map((sr, i) => renderPerStoryBlock(sr, i)).join("");

  const materialBody = document.getElementById("material-body");
  const konsolenAbschnitteGesamt = storyResults.reduce((n, sr) => n + sr.result.perSection.filter((s) => s.konsole).length, 0);
  const settings = calcResult.globalSettings;
  const materialRows = [
    ["Gerüstböden/Beläge", grandTotals.belaege, "Stk", konsolenAbschnitteGesamt ? `Breite je Abschnitt inkl. Konsole berücksichtigt (${konsolenAbschnitteGesamt} Abschnitt(e) mit Konsole, über alle Geschosse)` : `Bohlen à ${fmt(settings.belagbreite, 2)} m Breite`],
    ["Ständer/Vertikalrahmen", grandTotals.staender, "Stk", "je Feldgrenze und Lage, Eckkorrektur je Geschoss bereits berücksichtigt"],
    ["Fußspindeln", grandTotals.fussspindeln, "Stk", "nur Standfläche der jeweils untersten Lage je Geschoss"],
    ["Geländerholme (Handlauf + Zwischenholm)", grandTotals.gelaenderholme, "Stk", "2 je Feld und Lage"],
    ["Bordbretter", grandTotals.bordbretter, "Stk", "1 je Feld und Lage"],
    ["Diagonalen", grandTotals.diagonalen, "Stk", `1 je ${settings.diagonalraster} Felder und Lage`],
    ["Wandanker", grandTotals.anker, "Stk", `Raster ${fmt(settings.ankerraster, 1)} m² je Anker`],
  ];
  if (grandTotals.konsolen > 0) {
    materialRows.push(["Konsolen", grandTotals.konsolen, "Stk", `je Ständerposition und Lage, an ${konsolenAbschnitteGesamt} Abschnitt(en) über alle Geschosse`]);
  }
  materialBody.innerHTML = materialRows
    .map(([name, qty, unit, note]) => `<tr><td>${escapeHtml(name)}</td><td>${qty}</td><td>${unit}</td><td>${escapeHtml(note)}</td></tr>`)
    .join("");
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderPlan2D(result) {
  const svg = document.getElementById("plan2d-svg");
  const note = document.getElementById("plan2d-note");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const geometry = result?.geometry;
  if (!geometry || geometry.ring.length < 2) {
    note.textContent =
      'Für dieses Geschoss ist "Abschnitte bilden einen zusammenhängenden Rundgang" nicht aktiviert (oder keine Abschnitte) – daher kein automatischer Lageplan.';
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
  const hasKonsole = result.perSection.some((s) => s.konsole);
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
  note.textContent = `Schwarz = Gebäudelinie, grau gestrichelt = Ständerachse, blau = Gerüst-Außenkante${
    hasKonsole ? ", orange gestrichelt = Außenkante inkl. Konsole" : ""
  }.${closingNote}`;
}

function renderPlan2DStorySelect(calcResult) {
  const select = document.getElementById("plan2d-story-select");
  select.innerHTML = calcResult.storyResults.map((sr, i) => `<option value="${i}">${escapeHtml(sr.story.name)}</option>`).join("");
  select.value = String(Math.min(activeStoryIndex, calcResult.storyResults.length - 1));
  renderPlan2D(calcResult.storyResults[Number(select.value)].result);
}

document.getElementById("plan2d-story-select").addEventListener("change", (e) => {
  if (!lastCalcResult) return;
  const idx = Number(e.target.value);
  renderPlan2D(lastCalcResult.storyResults[idx]?.result);
});

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

document.getElementById("calc-btn").addEventListener("click", () => {
  const calcResult = calculateAllStories();
  if (!calcResult) return;
  lastCalcResult = calcResult;
  renderResults(calcResult);
  renderPlan2DStorySelect(calcResult);
  if (typeof View3D !== "undefined") View3D.renderStories(calcResult.storyResults, calcResult.globalSettings);
  saveState();
});

document.getElementById("print-btn").addEventListener("click", () => {
  window.print();
});

document.getElementById("export-csv-btn").addEventListener("click", () => {
  if (!lastCalcResult) return;
  const { storyResults, grandTotals } = lastCalcResult;
  const lines = [];
  lines.push("Geruestmengen-Kalkulator - Ergebnis (alle Geschosse)");

  storyResults.forEach((sr) => {
    lines.push("");
    lines.push(`Geschoss;${sr.story.name};Sockelhoehe (m);${fmt(sr.sockelhoehe, 2)}`);
    lines.push("Abschnitt;Laenge (m);Hoehe (m);Flaeche (m2);Felder;Lagen;Anker;Konsole;Konsolenbreite (m);Ausladung (m)");
    sr.result.perSection.forEach((s) => {
      lines.push(
        `${s.name};${fmt(s.length, 2)};${fmt(s.height, 2)};${fmt(s.flaeche, 1)};${s.felder};${s.lagen};${s.anker};${s.konsole ? "ja" : "nein"};${fmt(s.konsolenbreite, 2)};${fmt(s.ausladung, 2)}`
      );
    });
    lines.push(`Zwischensumme;${fmt(sr.result.totals.laenge, 2)};;${fmt(sr.result.totals.flaeche, 1)};;;${sr.result.totals.anker}`);
  });

  lines.push("");
  lines.push(`Gesamtsumme;${fmt(grandTotals.laenge, 2)};;${fmt(grandTotals.flaeche, 1)};;;${grandTotals.anker}`);
  lines.push(`Gesamthoehe (m);${fmt(grandTotals.gesamthoehe, 2)}`);
  lines.push("");
  lines.push("Bauteil;Menge;Einheit");
  lines.push(`Geruestboeden/Belaege;${grandTotals.belaege};Stk`);
  lines.push(`Staender/Vertikalrahmen;${grandTotals.staender};Stk`);
  lines.push(`Fussspindeln;${grandTotals.fussspindeln};Stk`);
  lines.push(`Gelaenderholme;${grandTotals.gelaenderholme};Stk`);
  lines.push(`Bordbretter;${grandTotals.bordbretter};Stk`);
  lines.push(`Diagonalen;${grandTotals.diagonalen};Stk`);
  lines.push(`Wandanker;${grandTotals.anker};Stk`);
  if (grandTotals.konsolen > 0) lines.push(`Konsolen;${grandTotals.konsolen};Stk`);

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

// ---------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------

function saveState() {
  try {
    serializeActiveStoryFromDom();
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
      },
      stories,
      activeStoryIndex,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* localStorage nicht verfügbar - kein Problem, nur Komfortfunktion */
  }
}

function migrateLegacyState() {
  try {
    const raw = localStorage.getItem("geruest-kalkulator-state-v1");
    if (!raw) return null;
    const legacy = JSON.parse(raw);
    if (!legacy?.sections?.length) return null;
    const story = createStory("Geschoss 1");
    story.sections = legacy.sections;
    story.cornersConnected = Boolean(legacy.settings?.cornersConnected);
    story.cornersClosed = Boolean(legacy.settings?.cornersClosed);
    return { settings: legacy.settings, stories: [story], activeStoryIndex: 0 };
  } catch (e) {
    return null;
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
  if (!state) state = migrateLegacyState();

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
  }

  stories = state?.stories?.length ? state.stories : [createStory("Geschoss 1")];
  activeStoryIndex = Math.min(state?.activeStoryIndex ?? 0, stories.length - 1);

  loadStoryIntoDom(stories[activeStoryIndex]);
  renderStoryTabs();
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

if (window.location.protocol === "file:") {
  document.getElementById("file-protocol-warning").classList.remove("hidden");
}
