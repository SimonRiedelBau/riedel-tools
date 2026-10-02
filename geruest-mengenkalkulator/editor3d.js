"use strict";

// Bearbeitung direkt in der 3D-Ansicht: Gerüstseite anklicken → Werte des
// Abschnitts und Lage/Drehung des Geschosses hier ändern. Alle Änderungen
// laufen über ScaffoldData (script.js), damit Tabelle, Speicher und
// Berechnung denselben Stand haben.

const Editor3D = (() => {
  const panel = document.getElementById("editor3d");
  if (!panel || typeof View3D === "undefined" || typeof ScaffoldData === "undefined") return {};

  const $ = (id) => document.getElementById(id);
  const title = $("ed-title");
  const fields = {
    length: $("ed-length"),
    start: $("ed-start"),
    end: $("ed-end"),
    height: $("ed-height"),
    angle: $("ed-angle"),
    konsole: $("ed-konsole"),
    konsolenbreite: $("ed-konsolenbreite"),
    konsoleSeite: $("ed-konsole-seite"),
    sockel: $("ed-sockel"),
    x: $("ed-x"),
    y: $("ed-y"),
    heading: $("ed-heading"),
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (el) => parseFloat(el.value);

  // berechneter Stand des gewählten Abschnitts aus der letzten Berechnung
  function current() {
    const sel = View3D.getSelection();
    if (!sel || typeof lastCalcResult === "undefined" || !lastCalcResult) return null;
    const sr = lastCalcResult.storyResults.find((x) => x.story.id === sel.storyId);
    if (!sr) return null;
    const idx = sr.result.perSection.findIndex((s) => s.srcIndex === sel.srcIndex);
    if (idx < 0) return null;
    return { sel, sr, sec: sr.result.perSection[idx], idx };
  }

  function show() {
    const c = current();
    if (!c) {
      panel.classList.add("hidden");
      return;
    }
    const { sr, sec } = c;
    const pl = sr.story.placement || { x: 0, y: 0, heading: 0 };
    panel.classList.remove("hidden");
    title.textContent = `${sr.story.name} – ${sec.name}`;
    $("ed-story-legend").textContent = `Geschossebene „${sr.story.name}“ (ganzer Umriss)`;
    fields.length.value = r2(sec.length);
    fields.start.value = r2(sec.startAbs);
    fields.end.value = r2(sec.endAbs);
    fields.height.value = r2(sec.height);
    fields.angle.value = Math.round(sec.angle * 10) / 10;
    fields.konsole.checked = sec.konsole;
    fields.konsolenbreite.value = r2(sec.konsolenbreite || 0.3);
    fields.konsolenbreite.disabled = !sec.konsole;
    fields.konsoleSeite.value = sec.konsoleSeite === "innen" ? "innen" : "aussen";
    fields.konsoleSeite.disabled = !sec.konsole;
    fields.sockel.value = r2(sr.sockelhoehe || 0);
    fields.x.value = r2(pl.x || 0);
    fields.y.value = r2(pl.y || 0);
    fields.heading.value = Math.round((pl.heading || 0) * 100) / 100;
  }

  function section(patch) {
    const c = current();
    if (c) ScaffoldData.updateSection(c.sel.storyId, c.sel.srcIndex, patch);
  }
  function story(patch) {
    const c = current();
    if (c) ScaffoldData.updateStory(c.sel.storyId, patch);
  }

  // Werte übernehmen, sobald ein Feld verlassen bzw. mit Enter bestätigt wird
  const onChange = (el, fn) => el.addEventListener("change", () => {
    if (!isNaN(num(el))) fn(num(el));
  });
  onChange(fields.length, (v) => section({ length: v }));
  onChange(fields.start, (v) => section({ start: v }));
  onChange(fields.end, (v) => section({ end: v }));
  onChange(fields.height, (v) => section({ height: v }));
  onChange(fields.angle, (v) => section({ angle: v }));
  onChange(fields.konsolenbreite, (v) => section({ konsolenbreite: v }));
  fields.konsole.addEventListener("change", () => section({ konsole: fields.konsole.checked }));
  fields.konsoleSeite.addEventListener("change", () => section({ konsoleSeite: fields.konsoleSeite.value }));
  $("ed-start-reset").addEventListener("click", () => {
    const c = current();
    if (c) ScaffoldData.resetStarts(c.sel.storyId);
  });
  onChange(fields.sockel, (v) => story({ sockelhoehe: v }));
  onChange(fields.x, (v) => story({ x: v }));
  onChange(fields.y, (v) => story({ y: v }));
  onChange(fields.heading, (v) => story({ heading: v }));

  panel.querySelectorAll(".ed-move").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = current();
      if (!c) return;
      const step = parseFloat($("ed-move-step").value) || 0.1;
      const pl = c.sr.story.placement || { x: 0, y: 0, heading: 0 };
      story({ x: (pl.x || 0) + Number(btn.dataset.dx) * step, y: (pl.y || 0) + Number(btn.dataset.dy) * step });
    });
  });

  // Drehen um den Mittelpunkt des Umrisses (nicht um die erste Ecke)
  panel.querySelectorAll(".ed-rot").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = current();
      if (!c) return;
      const step = parseFloat($("ed-rot-step").value) || 1;
      const d = Number(btn.dataset.dir) * step;
      const pl = c.sr.story.placement || { x: 0, y: 0, heading: 0 };
      const ring = c.sr.result.geometry ? c.sr.result.geometry.ring : [];
      let cx = pl.x || 0, cy = pl.y || 0;
      if (ring.length) {
        cx = ring.reduce((sum, p) => sum + p.x, 0) / ring.length;
        cy = ring.reduce((sum, p) => sum + p.y, 0) / ring.length;
      }
      const rad = (d * Math.PI) / 180;
      const dx = (pl.x || 0) - cx, dy = (pl.y || 0) - cy;
      story({
        x: cx + Math.cos(rad) * dx - Math.sin(rad) * dy,
        y: cy + Math.sin(rad) * dx + Math.cos(rad) * dy,
        heading: (pl.heading || 0) + d,
      });
    });
  });

  // vorheriger/nächster Abschnitt im selben Geschoss
  function step(dir) {
    const c = current();
    if (!c) return;
    const list = c.sr.result.perSection;
    const next = list[(c.idx + dir + list.length) % list.length];
    View3D.select({ storyId: c.sel.storyId, srcIndex: next.srcIndex });
  }
  $("ed-prev").addEventListener("click", () => step(-1));
  $("ed-next").addEventListener("click", () => step(1));
  $("ed-close").addEventListener("click", () => View3D.select(null));

  View3D.onSelect(show);
  View3D.onHandle((sel, kind, value) => {
    if (!sel) return;
    ScaffoldData.updateSection(sel.storyId, sel.srcIndex, kind === "end" ? { end: value } : { start: value });
  });

  // nach jeder Neuberechnung (auch aus der Tabelle) Werte auffrischen
  document.getElementById("calc-btn").addEventListener("click", () => setTimeout(show, 0));
  const origCommit = ScaffoldData.commit.bind(ScaffoldData);
  ScaffoldData.commit = (st) => {
    origCommit(st);
    show();
  };

  return { show };
})();
