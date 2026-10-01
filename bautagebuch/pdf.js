// Bautagebuch – Formular-Vorlage, PDF-Erzeugung (amtliches Blatt Rohbau + Anhang) und Erkennung von Kurznotizen.
// Aus der bisherigen Version übernommen; das PDF-Layout ist unverändert.
'use strict';
const LOGO_PNG="data:image/png;base64,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";

// ── Helpers ──────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
};
const todayISO = () => new Date().toISOString().split('T')[0];
const WMO = {
  0: 'Klar',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bewölkt',
  45: 'Neblig',
  51: 'Nieselregen',
  61: 'Leichter Regen',
  63: 'Regen',
  65: 'Starker Regen',
  71: 'Schneefall',
  80: 'Regenschauer',
  82: 'Starke Schauer',
  95: 'Gewitter'
};
function getN(c) {
  if ([80, 81, 82].includes(c)) return 'Regenschauer';
  if ([61, 63, 65].includes(c)) return 'Dauerregen';
  if ([71, 73, 75].includes(c)) return 'Schneefall';
  return '';
}
function getW(k) {
  return k < 5 ? 'still' : k < 30 ? 'maeßiger Wind' : 'starker Wind';
}
function wrapText(text, max) {
  if (!text) return [];
  if (!max) max = 106;
  var result = [];
  // Split on newlines first (user may type multi-line text)
  var paras = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (var p = 0; p < paras.length; p++) {
    var para = paras[p];
    if (!para || !para.trim()) {
      result.push('');
      continue;
    }
    var words = para.split(' '),
      cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (t.length <= max) cur = t;else {
        if (cur) result.push(cur);
        cur = words[i];
      }
    }
    if (cur) result.push(cur);
  }
  return result;
}

// Fehlende Pflichtfelder prüfen
function pruefeFehlend(form) {
  var fehlend = [];
  if (!form.ausgefuehrteArbeiten) fehlend.push('Ausgeführte Arbeiten');
  if (!form.temp7) fehlend.push('Temperatur 7h');
  if (!form.luftbewegung) fehlend.push('Luftbewegung');
  if (!form.besuche.polier) fehlend.push('Polier Unterschrift');
  if (!form.besuche.bauleiter) fehlend.push('Bauleiter Unterschrift');
  return fehlend;
}
const mkForm = () => ({
  datum: todayStr(),
  arbeitszeit: '07:00 - 16:00 Uhr',
  temp7: '',
  temp12: '',
  temp16: '',
  tempMax: '',
  tempMin: '',
  niederschlag: '',
  luftbewegung: '',
  arbeitskraefte: {
    polier: '',
    werkpolier: '',
    vorarbeiter: '',
    maurer: '',
    zimmerer: '',
    betonbauer: '',
    helfer: '',
    maschinenpersonal: '',
    azubis: ''
  },
  geraete: {
    raupen: 0,
    bagger: 0,
    kraene: 0,
    kompressor: 0,
    verdGeraete: 0,
    lkw: 0,
    betonstahl: 0,
    beton: 0
  },
  besuche: {
    polier: '',
    bauleiter: '',
    bauherr: ''
  },
  besucheText: '',
  nachunternehmer: '',
  ausgefuehrteArbeiten: '',
  sonstiges: '',
  anhangText: '',
  // Freitext für Anhang
  medien: [] // Array von {typ:'foto'|'sprache', dataUrl, beschreibung, transkription}
});

// ── PDF Builder ───────────────────────────────────────────────────
function buildPDFDoc(form, projektName, bauNr, blattNr) {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  var H = 841.89;
  function rl(y) {
    return H - y;
  }
  var R = [204, 0, 0],
    BK = [0, 0, 0],
    LG = [220, 220, 220];
  function hl(y, x0, x1, lw, col) {
    if (!x0) x0 = 56.8;
    if (!x1) x1 = 566.8;
    if (!lw) lw = 0.5;
    if (!col) col = BK;
    doc.setDrawColor(col[0], col[1], col[2]);
    doc.setLineWidth(lw);
    doc.line(x0, y, x1, y);
    doc.setDrawColor(0, 0, 0);
  }
  function rbar(y, label, x0, x1, bh) {
    if (!x0) x0 = 56.8;
    if (!x1) x1 = 566.8;
    if (!bh) bh = 12;
    doc.setFillColor(R[0], R[1], R[2]);
    doc.rect(x0, y, x1 - x0, bh, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(label, x0 + 3, y + bh - 3);
    doc.setTextColor(0, 0, 0);
    return y + bh;
  }
  function header(pt) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(450.7, 18.8, 51, 51.1);
    try {
      doc.addImage(LOGO_PNG, 'PNG', 452.7, 20.8, 47, 47);
    } catch (e) {}
    hl(14.3, 56.7, 566.9);
    hl(74, 56.7, 566.9);
    hl(45.6, 56.7, 443.3);
    hl(45.6, 509.1, 566.9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(pt === 'rohbau' ? 'Bautagebuch - Rohbau' : 'Bautagebuch - Anhang', 56.7, 68);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Blatt-Nr.:  ' + blattNr, 310, 57);
    doc.text('Datum:     ' + (form.datum || ''), 310, 68);
    doc.text('Baustelle:', 56.7, 84);
    doc.text(projektName || '', 112, 84);
    hl(88, 112, 564, 0.35, LG);
    doc.text('Bau-Nr.:', 56.7, 99);
    doc.text(bauNr || '', 106, 99);
    hl(103, 106, 376, 0.35, LG);
    doc.text('Arbeitszeit:', 383.2, 99);
    doc.text(form.arbeitszeit || '', 445, 99);
    hl(103, 445, 563.5, 0.35, LG);
  }
  function rohbau() {
    var Y = 112;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Wetter', 56.7, Y + 8);
    Y += 12;
    hl(Y, 56.8, 566.8, 0.5);
    Y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Temperatur:', 56.7, Y + 7);
    [[165, '7h', form.temp7], [232, '12h', form.temp12], [305, '16h', form.temp16], [375, 'max', form.tempMax], [445, 'min', form.tempMin]].forEach(function (t) {
      doc.text(t[1] + '  ' + (t[2] || '?'), t[0], Y + 7);
    });
    Y += 13;
    doc.text('Niederschlag:', 56.7, Y + 7);
    var nied = form.niederschlag || '';
    [[175, 'Regenschauer'], [320, 'Dauerregen'], [455, 'Schneefall']].forEach(function (n) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.rect(n[0], Y, 7, 7);
      if (nied && nied.toLowerCase().indexOf(n[1].toLowerCase()) >= 0) {
        doc.setFillColor(204, 0, 0);
        doc.rect(n[0] + 1.5, Y + 1.5, 4, 4, 'F');
        doc.setFillColor(0, 0, 0);
      }
      doc.text(n[1], n[0] + 10, Y + 7);
    });
    Y += 13;
    doc.text('Luftbewegung:', 56.7, Y + 7);
    var luft = form.luftbewegung || '';
    [[175, 'still'], [320, 'maeßiger Wind'], [455, 'starker Wind']].forEach(function (n) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.rect(n[0], Y, 7, 7);
      if (luft && n[1].toLowerCase().indexOf(luft.toLowerCase()) >= 0) {
        doc.setFillColor(204, 0, 0);
        doc.rect(n[0] + 1.5, Y + 1.5, 4, 4, 'F');
      }
      doc.setFillColor(0, 0, 0);
      doc.text(n[1], n[0] + 10, Y + 7);
    });
    Y += 16;
    var AKL = 56.8,
      AKR = 361.2,
      NUL = 371,
      NUR = 566.8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Arbeitskraefte (m/w/d)', AKL, Y + 8);
    doc.setFillColor(204, 0, 0);
    doc.rect(NUL, Y, NUR - NUL, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Nachunternehmer', NUL + 3, Y + 6);
    doc.setTextColor(0, 0, 0);
    Y += 10;
    var H7 = 7,
      D15 = 15,
      DIVS = [90.7, 124.7, 158.3, 192.3, 226, 259.9, 293.8, 327.4],
      cxs = [AKL].concat(DIVS).concat([AKR]);
    var akL = ['Polier', 'Werkpolier', 'Vorarbeiter', 'Maurer', 'Zimmerer', 'Betonbauer', 'Helfer', 'Masch.Pers', 'Azubis'];
    var akK = ['polier', 'werkpolier', 'vorarbeiter', 'maurer', 'zimmerer', 'betonbauer', 'helfer', 'maschinenpersonal', 'azubis'];
    doc.setFillColor(204, 0, 0);
    doc.rect(AKL, Y, AKR - AKL, H7, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    akL.forEach(function (l, i) {
      doc.text(l, (cxs[i] + cxs[i + 1]) / 2, Y + H7 - 1, {
        align: 'center'
      });
    });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(AKL, Y + H7, AKR - AKL, D15);
    doc.setLineWidth(0.4);
    DIVS.forEach(function (x) {
      doc.line(x, Y, x, Y + H7 + D15);
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    akK.forEach(function (k, i) {
      doc.text(String(form.arbeitskraefte[k] || ''), (cxs[i] + cxs[i + 1]) / 2, Y + H7 + D15 - 4, {
        align: 'center'
      });
    });
    var AKT = H7 + D15,
      GG = 8,
      GY = Y + AKT + GG;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Geraete', AKL, GY + 8);
    doc.text('Baustoffe', 284.5, GY + 8);
    var GYY = GY + 10,
      GH = 7,
      GD = 14,
      GDIVS = [94.6, 132.6, 170.9, 208.6, 246.6, 284.6, 322.6],
      gcxs = [AKL].concat(GDIVS).concat([AKR]);
    var gL = ['Radlader', 'Bagger', 'Kraene', 'Kompr.', 'Verd.Ger.', 'LKW', 'Betonstahl', 'Beton (m³)'];
    var gK = ['raupen', 'bagger', 'kraene', 'kompressor', 'verdGeraete', 'lkw', 'betonstahl', 'beton'];
    doc.setFillColor(204, 0, 0);
    doc.rect(AKL, GYY, AKR - AKL, GH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    gL.forEach(function (l, i) {
      doc.text(l, (gcxs[i] + gcxs[i + 1]) / 2, GYY + GH - 1, {
        align: 'center'
      });
    });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(AKL, GYY + GH, AKR - AKL, GD);
    doc.setLineWidth(0.4);
    GDIVS.forEach(function (x) {
      doc.line(x, GYY, x, GYY + GH + GD);
    });
    gK.forEach(function (k, i) {
      var cx = (gcxs[i] + gcxs[i + 1]) / 2,
        bx = cx - 3.5,
        by = GYY + GH + 3;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.rect(bx, by, 7, 7);
      if (form.geraete[k]) {
        doc.setFillColor(204, 0, 0);
        doc.rect(bx + 1.5, by + 1.5, 4, 4, 'F');
      }
      doc.setFillColor(0, 0, 0);
    });
    var GT = GH + GD,
      NBH = AKT + GG + 10 + GT + 10;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(NUL, Y, NUR - NUL, NBH);
    var LHN = 14;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    for (var i2 = 1; i2 < Math.floor(NBH / LHN); i2++) doc.line(NUL + 2, Y + i2 * LHN, NUR - 2, Y + i2 * LHN);
    doc.setDrawColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    var nuLines = (form.nachunternehmer || '').split('\n');
    nuLines.forEach(function (l, i) {
      var ty = Y + (i + 0.85) * LHN;
      if (ty < Y + NBH - 2) doc.text(l, NUL + 4, ty);
    });
    var CY = GYY + GT + 10;
    CY += 6;
    CY = rbar(CY, 'Ausgefuehrte Arbeiten:') + 2;
    var LH = 15,
      tL = wrapText(form.ausgefuehrteArbeiten);
    for (var i3 = 0, nR = Math.max(12, tL.length + 2); i3 < nR; i3++) {
      var ly = CY + (i3 + 1) * LH;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(56.7, ly, 567.3, ly);
      if (i3 < tL.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text((tL[i3] || '').replace(/\n/g, ' ').replace(/\r/g, ' '), 58.5, ly - LH * 0.35);
      }
    }
    CY += nR * LH + 8;
    CY = rbar(CY, 'Sonstiges / Besondere Vorkommnisse:') + 2;
    var sL = wrapText(form.sonstiges);
    for (var i4 = 0, nS = Math.max(3, sL.length + 1); i4 < nS; i4++) {
      var ly2 = CY + (i4 + 1) * LH;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(56.8, ly2, 567.1, ly2);
      if (i4 < sL.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text((sL[i4] || '').replace(/\n/g, ' ').replace(/\r/g, ' '), 58.5, ly2 - LH * 0.35);
      }
    }
    CY += nS * LH + 8;
    CY = rbar(CY, 'Besuche:') + 2;
    var bL = wrapText(form.besucheText);
    for (var i5 = 0, nB = Math.max(2, bL.length + 1); i5 < nB; i5++) {
      var ly3 = CY + (i5 + 1) * LH;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(56.8, ly3, 567.1, ly3);
      if (i5 < bL.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text((bL[i5] || '').replace(/\n/g, ' ').replace(/\r/g, ' '), 58.5, ly3 - LH * 0.35);
      }
    }
    CY += nB * LH + 10;
    hl(CY, 56.8, 566.8, 0.5);
    CY += 8;
    [[57, 'Polier:', 'polier'], [207, 'Bauleiter:', 'bauleiter'], [358, 'Bauherr:', 'bauherr']].forEach(function (s) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(s[1], s[0], CY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(form.besuche[s[2]] || '', s[0] + 45, CY);
      hl(CY + 10, s[0], s[0] + 131, 0.5);
    });
    CY += 18;
    hl(CY, 56.8, 566.8, 0.5);
  }
  function anhang() {
    var Y = 112;
    Y = rbar(Y, 'Ausgefuehrte Arbeiten') + 2;
    var LH = 15,
      tL = wrapText(form.ausgefuehrteArbeiten);
    for (var i = 0, nA = Math.max(22, tL.length + 2); i < nA; i++) {
      var ly = Y + (i + 1) * LH;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(56.7, ly, 567.3, ly);
      if (i < tL.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text((tL[i] || '').replace(/\n/g, ' ').replace(/\r/g, ' '), 58.5, ly - LH * 0.35);
      }
    }
    var CY = Y + nA * LH + 8;
    hl(CY, 56.8, 566.8, 0.5);
    CY += 8;
    [[57, 'Polier'], [207, 'Bauleiter'], [358, 'Bauherr']].forEach(function (s) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(s[1], s[0], CY);
      hl(CY + 10, s[0], s[0] + 131, 0.5);
    });
    CY += 18;
    hl(CY, 56.8, 566.8, 0.5);
  }
  header('rohbau');
  rohbau();
  doc.addPage();
  header('anhang');
  anhang();
  // Anhang-Seiten mit Fotos und Transkriptionen
  if (form.anhangText && form.anhangText.trim() || form.medien && form.medien.length > 0) {
    doc.addPage();
    drawAnhangMedien();
  }
  return doc;
  function drawAnhangMedien() {
    var Y = 14;
    // Header bar
    doc.setFillColor(204, 0, 0);
    doc.rect(56.8, Y, 510, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('Anhang - Fotos und Aufnahmen', 59, Y + 10);
    doc.setTextColor(0, 0, 0);
    Y += 20;
    // Freitext Anhang
    if (form.anhangText && form.anhangText.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Anmerkungen:', 56.8, Y);
      Y += 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      var anhLines = wrapText(form.anhangText, 100);
      anhLines.forEach(function (l) {
        if (Y > 800) {
          doc.addPage();
          Y = 20;
        }
        doc.text(l, 56.8, Y);
        Y += 13;
      });
      Y += 6;
    }
    // Fotos und Transkriptionen
    var medien = form.medien || [];
    medien.forEach(function (m, idx) {
      if (Y > 780) {
        doc.addPage();
        Y = 20;
      }
      // Nummer und Beschreibung
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(204, 0, 0);
      doc.text(idx + 1 + '. ' + (m.typ === 'foto' ? 'Foto' : 'Sprachaufnahme') + (m.beschreibung ? ' - ' + m.beschreibung : ''), 56.8, Y);
      doc.setTextColor(0, 0, 0);
      Y += 10;
      // Foto einbetten
      if (m.typ === 'foto' && m.dataUrl) {
        try {
          // Seitenverhältnis des Fotos beibehalten (w/h werden beim Hinzufügen gespeichert)
          var imgW = 230,
            imgH = 150;
          if (m.w && m.h) {
            imgH = Math.min(300, imgW * m.h / m.w);
            imgW = imgH * m.w / m.h;
          }
          if (Y + imgH > 820) {
            doc.addPage();
            Y = 20;
          }
          doc.addImage(m.dataUrl, 'JPEG', 56.8, Y, imgW, imgH);
          Y += imgH + 8;
        } catch (e) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(136, 136, 136);
          doc.text('[Foto konnte nicht eingebettet werden]', 56.8, Y);
          Y += 10;
          doc.setTextColor(0, 0, 0);
        }
      }
      // Transkription
      if (m.transkription && m.transkription.trim()) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);
        doc.text('Transkription:', 56.8, Y);
        Y += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        var tLines = wrapText(m.transkription, 108);
        tLines.forEach(function (l) {
          if (Y > 800) {
            doc.addPage();
            Y = 20;
          }
          doc.text(l, 60, Y);
          Y += 11;
        });
        doc.setTextColor(0, 0, 0);
        Y += 4;
      }
      // Trennlinie
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(56.8, Y, 567, Y);
      doc.setDrawColor(0, 0, 0);
      Y += 8;
    });
  }
}

// ── AI ────────────────────────────────────────────────────────────
// ── Lokaler NLP Parser (Fallback ohne API) ───────────────────────
function parseLokal(text, form) {
  var t = text.toLowerCase();
  var updates = {};
  var antwort = '';
  // Zahlen für Arbeitskräfte
  var akMap = {
    'polier': ['polier', 'poliere'],
    'maurer': ['maurer', 'mauerer'],
    'zimmerer': ['zimmerer'],
    'betonbauer': ['betonbauer', 'beton'],
    'helfer': ['helfer'],
    'vorarbeiter': ['vorarbeiter'],
    'werkpolier': ['werkpolier'],
    'maschinenpersonal': ['maschinist', 'maschinenpersonal', 'baggerfahrer', 'kranfahrer'],
    'azubis': ['azubi', 'lehrling', 'auszubildend']
  };
  // Arbeitskräfte erkennen
  var akUpdates = {};
  Object.entries(akMap).forEach(function (e) {
    var key = e[0],
      aliases = e[1];
    aliases.forEach(function (alias) {
      // nur ganze Wörter (Mehrzahl erlaubt): „4 betoniert“ ist kein Betonbauer
      var wort = alias + '(?:e|n|en|s)?(?![a-zäöüß])';
      var match = text.match(new RegExp('(\\d+)\\s*' + wort, 'i')) || text.match(new RegExp('(?:^|[^a-zäöüß])' + wort + '[:\\s]+(\\d+)', 'i'));
      if (match) {
        akUpdates[key] = parseInt(match[1] || match[2]);
        antwort = 'Arbeitskräfte aktualisiert!';
      }
    });
  });
  if (Object.keys(akUpdates).length > 0) updates.arbeitskraefte = akUpdates;
  // Geräte erkennen
  var geraeteMap = {
    'bagger': ['bagger'],
    'kraene': ['kran', 'kräne', 'kraene'],
    'raupen': ['raupe', 'radlader'],
    'kompressor': ['kompressor'],
    'verdGeraete': ['rüttel', 'verdicht'],
    'lkw': ['lkw', 'lastwagen'],
    'betonstahl': ['betonstahl'],
    'beton': ['betonpumpe', 'betonmischer']
  };
  var gUpdates = {};
  Object.entries(geraeteMap).forEach(function (e) {
    var key = e[0],
      aliases = e[1];
    aliases.forEach(function (alias) {
      if (t.includes(alias)) {
        var m = text.match(new RegExp('(\\d+)\\s*' + alias + '[a-zäöüß]*', 'i'));
        gUpdates[key] = m ? parseInt(m[1]) : 1;
      }
    });
  });
  if (Object.keys(gUpdates).length > 0) updates.geraete = gUpdates;
  // Wetter erkennen
  if (t.match(/\d+\s*(grad|°c|°)/)) {
    var temps = (text.match(/-?\d+\s*(grad|°c?)/gi) || []).map(function (x) { return parseInt(x, 10) + '°C'; });
    if (temps.length >= 1) updates.temp7 = temps[0];
    if (temps.length >= 2) updates.tempMax = temps[1];
  }
  if (t.includes('dauerregen')) updates.niederschlag = 'Dauerregen';
  else if (t.includes('regen')) updates.niederschlag = 'Regenschauer';
  if (t.includes('schnee')) updates.niederschlag = 'Schneefall';
  // Werte wie im PDF-Formular (Ankreuzfelder): still / maeßiger Wind / starker Wind
  if (t.includes('sturm') || t.includes('starker wind')) updates.luftbewegung = 'starker Wind';
  else if (t.includes('windstill') || /\bstill\b/.test(t)) updates.luftbewegung = 'still';
  else if (t.includes('wind')) updates.luftbewegung = 'maeßiger Wind';
  // Ausgeführte Arbeiten - immer erfassen wenn nichts anderes erkannt
  if (!antwort || Object.keys(updates).length === 0) {
    var neu = (form.ausgefuehrteArbeiten ? form.ausgefuehrteArbeiten + '\n' : '') + text;
    updates.ausgefuehrteArbeiten = neu;
    if (!antwort) antwort = 'Notiert in Ausgeführte Arbeiten!';
  }
  return {
    antwort: antwort || 'Verstanden!',
    updates: updates
  };
}
