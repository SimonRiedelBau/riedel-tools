// Doka-Mietrechnungen: Vergleich mit der Vorgängerrechnung, Prüfliste, Excel-Liste und geprüfte Rechnung (PDF).
// Reine Rechenfunktionen hier; Speichern und Darstellung im Dashboard (index.html).
(function (root) {
  const SB = '999300105';
  const r2 = v => Math.round(v * 100) / 100;
  const eur = (v, d = 2) => v == null || isNaN(v) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const qty = v => v == null ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const monthIdx = m => (+m.slice(0, 4)) * 12 + (+m.slice(5)) - 1;
  const cleanName = s => String(s || '').replace(/\s{3,}\d+$/, '').trim();
  const segKey = s => String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 190);

  // Je Artikel (Artikelnummer + Doka-Kennung) Mengen, Betrag, EP und Endbestand einer Rechnung
  function agg(inv) {
    const g = {};
    const get = (art, id, name, dim) => {
      const key = art + '~' + (id || '');
      return g[key] || (g[key] = { key, art, id: id || '', name: cleanName(name), dim, anf: 0, lief: 0, rueck: 0, sonst: 0, betrag: 0, ep: null, satz: null, nr: null, ende: null, belege: new Set() });
    };
    (inv.positionen || []).forEach(p => {
      const o = get(p.art, p.id, p.name, p.dim);
      if (p.abschnitt === 'Anfangsbestand') o.anf += p.menge;
      else if (p.abschnitt === 'Lieferung') { o.lief += p.menge; o.belege.add(p.beleg); }
      else if (p.abschnitt === 'Rücklieferung') { o.rueck += p.menge; o.belege.add(p.beleg); }
      else { o.sonst += p.menge; o.belege.add(p.beleg); }
      o.betrag += p.betrag;
      if (o.ep == null) o.ep = p.ep;
      if (!o.satz) o.satz = p.satz;
      if (o.nr == null) o.nr = !!p.nicht_rabattfaehig;
    });
    (inv.endbestand || []).forEach(e => { const o = get(e.art, e.id, e.name, e.dim); o.ende = (o.ende || 0) + e.menge; });
    Object.values(g).forEach(o => { if (o.ende == null) o.ende = Math.max(0, o.anf + o.lief - o.rueck); o.betrag = r2(o.betrag); });
    return g;
  }

  // Vergleich Rechnung B mit Vorgängerrechnung A -> Liste der zu prüfenden Änderungen
  function compare(A, B) {
    const items = [], direct = monthIdx(B.monat) - monthIdx(A.monat) === 1;
    // Lieferscheine / Rücklieferscheine der neuen Rechnung (für den Filter)
    const belege = {};
    (B.positionen || []).concat(B.nebenkosten || []).forEach(p => { if (p.beleg && !belege[p.beleg]) belege[p.beleg] = { nr: p.beleg, typ: p.abschnitt, datum: p.beleg_datum || p.datum || '' }; });
    const a = agg(A), b = agg(B);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[key], y = b[key], R = [];
      const bel = o => [...o.belege].filter(Boolean).join(', ');
      if (x && !y && x.ende > 0.001 && direct) R.push({ t: `fehlt in dieser Rechnung, Vormonat-Ende ${qty(x.ende)} Stk`, s: 'bad' });
      if (!x && y) {
        if (y.anf > 0.001 && direct) R.push({ t: `im Anfangsbestand (${qty(y.anf)}), im Vormonat nicht vorhanden`, s: 'bad' });
        else if (!y.lief && !y.rueck && !y.sonst) R.push({ t: 'neue Position', s: 'warn' });
      }
      if (x && y) {
        if (direct && Math.abs(y.anf - (x.ende || 0)) > 0.001) R.push({ t: `Anfangsbestand ${qty(y.anf)} statt ${qty(x.ende || 0)} (Vormonat-Ende)`, s: 'bad' });
        if (x.ep != null && y.ep != null && Math.abs(x.ep - y.ep) > 0.001) R.push({ t: `EP ${eur(x.ep)} → ${eur(y.ep)} €`, s: 'bad' });
        if (x.satz && y.satz && x.satz !== y.satz) R.push({ t: `Mietsatz ${x.satz} → ${y.satz}`, s: 'bad' });
        if (x.nr != null && y.nr != null && x.nr !== y.nr) R.push({ t: y.nr ? 'jetzt nicht rabattfähig' : 'jetzt rabattfähig', s: 'bad' });
      }
      if (y) {
        if (y.lief) R.push({ t: `Lieferung +${qty(y.lief)} (LS ${bel(y)})`, s: 'warn' });
        if (y.rueck) R.push({ t: `Rücklieferung −${qty(y.rueck)} (RLS ${bel(y)})`, s: 'warn' });
        if (y.sonst) R.push({ t: `Sonstiger Beleg ${qty(y.sonst)} (${bel(y)})`, s: 'warn' });
      }
      if (x && y && !R.length && Math.abs(y.betrag - x.betrag) > 0.10) R.push({ t: `Betrag ${y.betrag > x.betrag ? '+' : '−'}${eur(Math.abs(y.betrag - x.betrag))} € bei gleicher Menge`, s: 'warn' });
      if (!R.length) continue;
      const o = y || x;
      items.push({ key: 'pos~' + segKey(key), posKey: key, kind: 'Position', art: o.art, id: o.id, name: o.name, dim: o.dim, belege: y ? [...y.belege].filter(Boolean) : [],
        altMenge: x ? x.ende : 0, neuMenge: y ? y.ende : 0, alt: x ? x.betrag : 0, neu: y ? y.betrag : 0, reasons: R, sev: R.some(r => r.s === 'bad') ? 'bad' : 'warn' });
    }
    const fa = {}, fb = {};
    (A.nebenkosten || []).forEach(f => fa[f.name] = (fa[f.name] || 0) + f.betrag);
    (B.nebenkosten || []).forEach(f => { const o = fb[f.name] || (fb[f.name] = { betrag: 0, basis: [], art: f.art, beleg: [] }); o.betrag += f.betrag; o.basis.push(f.basis); if (f.beleg) o.beleg.push(f.beleg); });
    Object.entries(fb).forEach(([n, o]) => {
      const R = [{ t: `${o.basis.join(' + ')}${o.beleg.length ? ' (Beleg ' + [...new Set(o.beleg)].join(', ') + ')' : ''}`, s: 'warn' }];
      if (!(n in fa)) R.push({ t: 'im Vormonat nicht berechnet', s: 'warn' });
      items.push({ key: 'nk~' + segKey(n), nkName: n, belege: [...new Set(o.beleg)], kind: 'Nebenkosten', art: o.art, id: '', name: n, altMenge: null, neuMenge: null, alt: r2(fa[n] || 0), neu: r2(o.betrag), reasons: R, sev: 'warn' });
    });
    const qa = A.miete_brutto ? -A.rabatt / A.miete_brutto : 0, qb = B.miete_brutto ? -B.rabatt / B.miete_brutto : 0;
    if (Math.abs(qa - qb) > 0.0005) items.push({ key: 'kopf~rabatt', kind: 'Rechnungskopf', art: '', id: '', name: 'Mietrechnungsrabatt', altMenge: null, neuMenge: null, alt: A.rabatt, neu: B.rabatt, reasons: [{ t: `Rabattquote ${eur(qa * 100, 1)} % → ${eur(qb * 100, 1)} % der Bruttomiete`, s: 'bad' }], sev: 'bad' });
    const sp = B.sumPos != null ? B.sumPos : B.summe_positionen;
    if (sp != null && B.miete_brutto != null && Math.abs(sp - B.miete_brutto) > 0.01) items.push({ key: 'kopf~summe', kind: 'Rechnungskopf', art: '', id: '', name: 'Summe der Positionen', altMenge: null, neuMenge: null, alt: B.miete_brutto, neu: sp, reasons: [{ t: `Positionen ergeben ${eur(sp)} €, Seite 1 nennt ${eur(B.miete_brutto)} €`, s: 'bad' }], sev: 'bad' });
    if (B.netto != null && B.mwst != null && Math.abs(B.netto * 0.19 - B.mwst) > 0.02) items.push({ key: 'kopf~mwst', kind: 'Rechnungskopf', art: '', id: '', name: 'Mehrwertsteuer', altMenge: null, neuMenge: null, alt: r2(B.netto * 0.19), neu: B.mwst, reasons: [{ t: 'MwSt. entspricht nicht 19 % vom Nettobetrag', s: 'bad' }], sev: 'bad' });
    items.sort((p, q) => (p.sev === q.sev ? 0 : p.sev === 'bad' ? -1 : 1) || Math.abs(q.neu - q.alt) - Math.abs(p.neu - p.alt));
    items.forEach((it, i) => { it.nr = i + 1; if (!it.belege) it.belege = []; });
    return { prev: A.monat, direct, items, belege: Object.values(belege).sort((x, y) => x.nr.localeCompare(y.nr)) };
  }

  const api = { agg, compare, cleanName, SB };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DokaPruefung = api;
})(typeof window !== 'undefined' ? window : globalThis);
