// Doka-Mietrechnung -> strukturierte Daten. Laeuft im Browser (window.DokaParser) und in Node (export).
(function (root) {
  const NUM = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
  const de = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
  const r2 = v => Math.round(v * 100) / 100;

  // PDF-Seite(n) -> Textzeilen, Spaltenabstaende als 3 Leerzeichen
  async function pdfToPages(pdfjs, data) {
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        const fs = Math.hypot(t[0], t[1]) || 9;
        const w = it.width * (fs / Math.hypot(it.transform[0], it.transform[1]) || 1);
        items.push({ s: it.str, x: t[4], y: t[5], w, fs });
      }
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      const rows = [];
      for (const it of items) {
        const row = rows.find(r => Math.abs(r.y - it.y) < 2.5);
        if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
      }
      rows.sort((a, b) => a.y - b.y);
      const lines = rows.map(r => {
        r.items.sort((a, b) => a.x - b.x);
        let out = '', end = null;
        for (const it of r.items) {
          if (end !== null) {
            const gap = it.x - end;
            out += gap > it.fs * 0.9 ? '   ' : gap > it.fs * 0.12 ? ' ' : '';
          }
          out += it.s.trim(); end = it.x + it.w;
        }
        return out;
      });
      pages.push(lines);
    }
    return { pages, numPages: doc.numPages };
  }

  const RE_RENT = new RegExp(String.raw`^(?<pcf>\+)?\s*(?<art>\d{9})\s+(?<name>.+?)\s{2,}(?:(?<date>\d{2}\.\d{2}\.\d{4})\s+)?(?<star>\*)?\s*` +
    String.raw`(?<qty>${NUM})\s+(?<me>[A-Z0-9]+)\s+(?:(?<pkg>\d+)\s+)?(?<ep>${NUM})\s+(?<pe>[A-Z0-9]+)\s+(?<ww>${NUM})\s+` +
    String.raw`(?<tage>\d+)\s+(?<satz>[\d,]+%)\s*/MT\s+(?<betrag>${NUM})\s*$`);
  const RE_FEE = new RegExp(String.raw`^\s*(?<art>\d{9})\s+(?<name>.+?)\s{2,}\*?\s*0,00\s+(?<basis>.+?)\s{2,}(?<betrag>${NUM})\s*$`);
  const RE_DIM = /^\s*(\d+,\d{2} x \d+,\d{2} x \d+,\d{2} m)\s*$/;
  const RE_ID = /^\s*(\d{3}-\d{6}-[\w\-]+)\s*$/;
  const RE_END = new RegExp(String.raw`^\s*(?<art>\d{9})\s+(?<name>.+?)\s{2,}(?<qty>${NUM})\s+(?<pe>[A-Z0-9]+)\s*$`);

  function parsePages(pages) {
    const p1 = pages[0].join('\n');
    const all = pages.flat();
    const t = all.join('\n');
    const inv = {};
    const g = (re, s = t) => { const m = s.match(re); return m ? m[1] : null; };
    inv.nr = g(/Nr\.:\s*(\d+)/);
    inv.datum = g(/Datum:\s+(\d{2}\.\d{2}\.\d{4})/);
    const zr = t.match(/Abrechnungszeitraum vom (\S+) bis (\S+)/);
    if (!inv.nr || !zr) throw new Error('Keine Doka-Mietrechnung erkannt (Rechnungsnummer oder Abrechnungszeitraum fehlt).');
    inv.von = zr[1]; inv.bis = zr[2];
    const grab = lab => { const m = p1.match(new RegExp(String.raw`(?:^|\s{2,})${lab}\s+(${NUM})\s*$`, 'm')); return m ? de(m[1]) : null; };
    inv.miete_brutto = grab('Miete');
    inv.rabatt = grab('Summe der Mietrechnungsrabatte');
    inv.netto = grab('Nettobetrag');
    inv.mwst = grab(String.raw`\d{1,2},\d{2}% MWSt\.`);
    inv.endsumme = grab('Endsumme');
    const br = {};
    if (p1.includes('setzt sich wie folgt zusammen')) {
      const blk = p1.split('setzt sich wie folgt zusammen')[1].split('Summe der Mietrechnungsrabatte')[0];
      for (const m of blk.matchAll(new RegExp(String.raw`(?:^|\s{3,})([A-ZÄÖÜ][\wäöüßÄÖÜ\- ]+?)\s{2,}(${NUM})\s*$`, 'gm'))) br[m[1].trim()] = de(m[2]);
    }
    inv.aufschluesselung = br;

    const pos = [], fees = [], endb = [];
    let section = { typ: 'Anfangsbestand', ref: null, datum: inv.von }, inEnd = false, last = null;
    for (const line of all) {
      if (line.includes('Endbestände (saldierte Mengen)')) { inEnd = true; last = null; continue; }
      if (/^\s*Anfangsbestand per/.test(line)) { section = { typ: 'Anfangsbestand', ref: null, datum: inv.von }; continue; }
      let m = line.match(/^\s*(Rücklieferschein|Lieferschein)\s+Nr\.\s*(\d+)\s+vom\s+(\S+)/);
      if (m) { section = { typ: m[1].startsWith('Rück') ? 'Rücklieferung' : 'Lieferung', ref: m[2], datum: m[3] }; continue; }
      m = line.match(/^\s*(\S.*?(?:schein|Gutschrift|Belastung|Korrektur)\S*)\s+Nr\.\s*(\d+)\s+vom\s+(\S+)/);
      if (m) { section = { typ: m[1], ref: m[2], datum: m[3] }; continue; }
      if (inEnd) {
        m = line.match(RE_END);
        if (m) { last = { art: m.groups.art, name: m.groups.name.trim(), menge: de(m.groups.qty), dim: null, id: null }; endb.push(last); continue; }
      } else {
        m = line.match(RE_RENT);
        if (m) {
          const x = m.groups;
          last = { abschnitt: section.typ, beleg: section.ref, beleg_datum: section.datum, art: x.art, name: x.name.trim(), datum: x.date || null,
            nicht_rabattfaehig: !!x.star, menge: de(x.qty), me: x.me, ep: de(x.ep), warenwert: de(x.ww), tage: +x.tage, satz: x.satz,
            betrag: de(x.betrag), dim: null, id: null };
          pos.push(last); continue;
        }
        m = line.match(RE_FEE);
        if (m) { fees.push({ beleg: section.ref, abschnitt: section.typ, art: m.groups.art, name: m.groups.name.trim(), basis: m.groups.basis.trim(), betrag: de(m.groups.betrag) }); last = null; continue; }
      }
      if (last) {
        m = line.match(RE_DIM); if (m && !last.dim) { last.dim = m[1]; continue; }
        m = line.match(RE_ID); if (m && !last.id) { last.id = m[1]; continue; }
      }
    }
    inv.positionen = pos; inv.nebenkosten = fees; inv.endbestand = endb;
    inv.summe_positionen = r2(pos.reduce((s, p) => s + p.betrag, 0) + fees.reduce((s, f) => s + f.betrag, 0));
    const a = t.match(new RegExp(String.raw`Anfangsbestand per\s+\S+\s+(${NUM})`));
    const e = t.match(new RegExp(String.raw`Endbestand\s+Summe Warenwert\s+(${NUM})`));
    inv.ww_anfang = a ? de(a[1]) : null; inv.ww_ende = e ? de(e[1]) : null;
    const [dd, mm, yy] = inv.von.split('.'); inv.monat = `${yy}-${mm}`;
    inv.quelle = 'digital';
    return inv;
  }

  async function parsePdf(pdfjs, data) {
    const { pages } = await pdfToPages(pdfjs, data);
    const chars = pages.flat().join('').length;
    if (chars < 200) { const err = new Error('SCAN'); err.scan = true; throw err; }
    return parsePages(pages);
  }

  const api = { parsePdf, parsePages, pdfToPages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DokaParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
