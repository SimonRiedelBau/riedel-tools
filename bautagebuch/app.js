// Bautagebuch – Oberfläche (ohne Framework).
// Daten: eigenes Supabase-Projekt (Tabellen projekte, berichte, profiles) – unverändert gegenüber der alten Version.
// PDF und Formular-Vorlage: pdf.js (mkForm, buildPDFDoc, pruefeFehlend, parseLokal, getN, getW, todayStr).
(function () {
  'use strict';

  // ---------- Datenbank ----------
  var SB_URL = 'https://dlypbcdoxlfyyavmrhlr.supabase.co';
  var SB_KEY = 'sb_publishable_VI2Oei75votfVOgtuVIcmw_K5-lAeLi';
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    getJ: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function headers(token, extra) {
    var h = { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + (token || SB_KEY) };
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }
  async function refreshToken() {
    var rt = LS.get('sb_refresh');
    if (!rt) return null;
    try {
      var r = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: headers(null), body: JSON.stringify({ refresh_token: rt }) });
      var d = await r.json();
      if (d.access_token) {
        LS.set('sb_token', d.access_token);
        if (d.refresh_token) LS.set('sb_refresh', d.refresh_token);
        if (d.user) LS.set('sb_user', d.user);
        return d.access_token;
      }
    } catch (e) {}
    return null;
  }
  // REST-Aufruf mit automatischer Verlängerung der Anmeldung
  async function api(method, path, body, retried) {
    var tok = LS.get('sb_token');
    var r = await fetch(SB_URL + '/rest/v1/' + path, {
      method: method,
      headers: headers(tok, method === 'GET' ? {} : { Prefer: 'return=representation' }),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    var txt = await r.text();
    var d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) {
      var msg = (d && (d.message || d.error_description || d.error)) || ('Fehler ' + r.status);
      if (!retried && (r.status === 401 || /jwt|token|expired/i.test(msg))) {
        var nt = await refreshToken();
        if (nt) return api(method, path, body, true);
        sessionEnded();
        throw new Error('Sitzung abgelaufen – bitte neu anmelden.');
      }
      throw new Error(msg);
    }
    return d;
  }
  var db = {
    select: function (t, q) { return api('GET', t + '?' + q).then(function (d) { return Array.isArray(d) ? d : []; }); },
    insert: function (t, row) { return api('POST', t, row).then(function (d) { return Array.isArray(d) ? d[0] : d; }); },
    update: function (t, q, row) { return api('PATCH', t + '?' + q, row).then(function (d) { return Array.isArray(d) ? d[0] : d; }); },
    remove: function (t, q) { return api('DELETE', t + '?' + q); }
  };
  async function authCall(path, body) {
    var r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: headers(null), body: JSON.stringify(body) });
    var d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error_description || d.msg || d.message || d.error || ('Fehler ' + r.status));
    return d;
  }

  // ---------- Entwürfe auf dem Gerät (IndexedDB, damit auch Fotos Platz haben) ----------
  var idb = (function () {
    var p = null;
    function open() {
      if (p) return p;
      p = new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('kein IndexedDB'));
        var rq = indexedDB.open('bautagebuch', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
      return p;
    }
    function tx(mode, fn) {
      return open().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction('kv', mode), st = t.objectStore('kv'), out = fn(st);
          t.oncomplete = function () { res(out && out.result); };
          t.onerror = function () { rej(t.error); };
        });
      });
    }
    return {
      get: function (k) { return tx('readonly', function (s) { return s.get(k); }).catch(function () { return LS.getJ('btb_' + k, null); }); },
      set: function (k, v) { return tx('readwrite', function (s) { s.put(v, k); }).catch(function () { var c = JSON.parse(JSON.stringify(v)); if (c.form) c.form.medien = []; LS.set('btb_' + k, c); }); },
      del: function (k) { LS.del('btb_' + k); return tx('readwrite', function (s) { s.delete(k); }).catch(function () {}); }
    };
  })();

  // ---------- Hilfen ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function errText(e) {
    var m = (e && e.message) || String(e);
    if (/failed to fetch|networkerror|load failed|network/i.test(m)) return 'Keine Verbindung zur Datenbank. Bitte Internet prüfen.';
    return m;
  }
  function deToIso(de) { var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(de || ''); return m ? m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]) : ''; }
  function isoToDe(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  var WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  function niceDate(iso) { if (!iso) return ''; var d = new Date(iso.slice(0, 10) + 'T12:00:00'); return WT[d.getDay()] + ', ' + isoToDe(iso.slice(0, 10)); }
  function isoWeek(iso) {
    var d = new Date(iso.slice(0, 10) + 'T12:00:00');
    var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 3);
    var y = d.getFullYear(), first = new Date(y, 0, 4);
    return { y: y, w: 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getDay() + 6) % 7)) / 7) };
  }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }
  function tempNum(v) { return String(v || '').replace(/\s*°\s*C?$/i, '').replace(',', '.'); }
  function toast(msg, bad) {
    var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, bad ? 6000 : 3200);
  }
  function icon(name) {
    var P = {
      chev: '<path d="M6 9l6 6 6-6"/>',
      mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
      cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
      copy: '<rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/>',
      dl: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>'
    }[name];
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P + '</svg>';
  }

  // ---------- Zustand ----------
  var S = {
    user: LS.getJ('sb_user', null),
    profil: null,
    projekte: [], hidden: [],
    pid: LS.get('btb_projekt', null),
    form: null, blatt: 1, editId: null, editStatus: null, draftAt: null, restored: false,
    lastSaved: null, saving: false,
    archiv: null, archivLoad: false,
    filt: LS.getJ('btb_filter', { projekt: 'aktiv', jahr: '', status: '', q: '', gruppe: 'kw' }),
    quickResult: '', recording: null, collapsed: {}
  };
  function projekt() { return S.projekte.find(function (p) { return p.id === S.pid; }) || null; }
  function view() { var h = (location.hash || '').slice(1); return ['bericht', 'archiv', 'projekte'].indexOf(h) >= 0 ? h : 'bericht'; }

  var AK = [['polier', 'Polier'], ['werkpolier', 'Werkpolier'], ['vorarbeiter', 'Vorarbeiter'], ['maurer', 'Maurer'], ['zimmerer', 'Zimmerer'],
    ['betonbauer', 'Betonbauer'], ['helfer', 'Helfer'], ['maschinenpersonal', 'Maschinenpersonal'], ['azubis', 'Azubis']];
  var GER = [['raupen', 'Raupen / Radlader'], ['bagger', 'Bagger'], ['kraene', 'Kräne'], ['kompressor', 'Kompressor'],
    ['verdGeraete', 'Verdichtungsgeräte'], ['lkw', 'Lkw'], ['betonstahl', 'Betonstahl (t)'], ['beton', 'Beton (m³)']];
  var NIED = [['', 'kein'], ['Regenschauer', 'Regenschauer'], ['Dauerregen', 'Dauerregen'], ['Schneefall', 'Schneefall']];
  var LUFT = [['still', 'still'], ['maeßiger Wind', 'mäßiger Wind'], ['starker Wind', 'starker Wind']];
  // Pflichtangaben (wie pruefeFehlend in pdf.js) → Feld, das markiert und angesprungen wird
  var REQ = { 'Ausgeführte Arbeiten': 'ausgefuehrteArbeiten', 'Temperatur 7h': 'temp7', 'Luftbewegung': 'luftbewegung', 'Polier Unterschrift': 'besuche.polier', 'Bauleiter Unterschrift': 'besuche.bauleiter' };
  var REQ_LABEL = { 'Ausgeführte Arbeiten': 'Ausgeführte Arbeiten', 'Temperatur 7h': 'Temperatur um 7 Uhr', 'Luftbewegung': 'Wind', 'Polier Unterschrift': 'Name Polier', 'Bauleiter Unterschrift': 'Name Bauleiter' };

  // ---------- Umrechnung Formular ↔ Datenbankzeile ----------
  function toRow(f, status) {
    var a = f.arbeitskraefte, g = f.geraete;
    var row = {
      projekt_id: S.pid, blatt_nr: S.blatt,
      datum: deToIso(f.datum) || new Date().toISOString().slice(0, 10),
      arbeitszeit: f.arbeitszeit, temp_7h: f.temp7, temp_12h: f.temp12, temp_16h: f.temp16, temp_max: f.tempMax, temp_min: f.tempMin,
      niederschlag: f.niederschlag, luftbewegung: f.luftbewegung,
      nachunternehmer: f.nachunternehmer, ausgefuehrte_arbeiten: f.ausgefuehrteArbeiten, sonstiges: f.sonstiges, besuche_text: f.besucheText,
      polier_name: f.besuche.polier, bauleiter_name: f.besuche.bauleiter, bauherr_name: f.besuche.bauherr,
      status: status, bestaetigt_am: status === 'bestaetigt' ? new Date().toISOString() : null,
      fehlende_felder: pruefeFehlend(f)
    };
    AK.forEach(function (k) { row['ak_' + k[0]] = a[k[0]]; });
    var col = { raupen: 'raupen', bagger: 'bagger', kraene: 'kraene', kompressor: 'kompressor', verdGeraete: 'verd_geraete', lkw: 'lkw', betonstahl: 'betonstahl', beton: 'beton' };
    Object.keys(col).forEach(function (k) { row['g_' + col[k]] = (+g[k] || 0) > 0; row['g_' + col[k] + '_anzahl'] = +g[k] || 0; });
    return row;
  }
  function fromRow(b) {
    var f = mkForm();
    f.datum = isoToDe(b.datum) || f.datum;
    f.arbeitszeit = b.arbeitszeit || f.arbeitszeit;
    f.temp7 = b.temp_7h || ''; f.temp12 = b.temp_12h || ''; f.temp16 = b.temp_16h || ''; f.tempMax = b.temp_max || ''; f.tempMin = b.temp_min || '';
    f.niederschlag = b.niederschlag || ''; f.luftbewegung = b.luftbewegung || '';
    AK.forEach(function (k) { f.arbeitskraefte[k[0]] = b['ak_' + k[0]] == null ? '' : String(b['ak_' + k[0]]); });
    var col = { raupen: 'raupen', bagger: 'bagger', kraene: 'kraene', kompressor: 'kompressor', verdGeraete: 'verd_geraete', lkw: 'lkw', betonstahl: 'betonstahl', beton: 'beton' };
    Object.keys(col).forEach(function (k) { f.geraete[k] = +b['g_' + col[k] + '_anzahl'] || 0; });
    f.besuche = { polier: b.polier_name || '', bauleiter: b.bauleiter_name || '', bauherr: b.bauherr_name || '' };
    f.besucheText = b.besuche_text || ''; f.nachunternehmer = b.nachunternehmer || '';
    f.ausgefuehrteArbeiten = b.ausgefuehrte_arbeiten || ''; f.sonstiges = b.sonstiges || '';
    return f;
  }
  function pdfFor(b) {
    var p = S.projekte.concat(S.hidden).find(function (x) { return x.id === b.projekt_id; }) || {};
    return buildPDFDoc(fromRow(b), p.name || '', p.bau_nr || '', b.blatt_nr || 1);
  }
  function pdfName(name, blatt, datumDe) {
    return 'Bautagebuch_' + String(name || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '-') + '_Blatt' + String(blatt).padStart(3, '0') + '_' + String(datumDe || '').replace(/\./g, '-') + '.pdf';
  }

  // ---------- Start ----------
  function boot() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', function () { render(); if (view() === 'archiv') loadArchiv(); });
    document.addEventListener('toggle', function (e) { var d = e.target; if (d.dataset && d.dataset.sec) S.collapsed[d.dataset.sec] = !d.open; }, true);
    if (!LS.get('sb_token') || !S.user) return renderLogin();
    start();
  }
  async function start() {
    $('#app').innerHTML = '<p class="loading">Projekte werden geladen …</p>';
    loadProfil();
    try { await loadProjekte(); }
    catch (e) { $('#app').innerHTML = '<div class="login"><div class="banner warn"><p>' + esc(errText(e)) + '</p><button class="btn sm" data-act="retry">Erneut versuchen</button></div></div>'; return; }
    await openProjekt(S.pid, true);
    if (view() === 'archiv') loadArchiv();
  }
  async function loadProfil() {
    var u = S.user || {};
    S.profil = { name: (u.user_metadata && u.user_metadata.full_name) || u.email || '', email: u.email, rolle: '' };
    try { var d = await db.select('profiles', 'id=eq.' + u.id); if (d[0]) S.profil = d[0]; } catch (e) {}
  }
  async function loadProjekte() {
    var all = await db.select('projekte', 'select=*&order=erstellt_am.desc');
    S.projekte = all.filter(function (p) { return p.status !== 'archiviert'; });
    S.hidden = all.filter(function (p) { return p.status === 'archiviert'; });
    if (!projekt()) S.pid = S.projekte[0] ? S.projekte[0].id : null;
    LS.set('btb_projekt', S.pid || '');
  }
  async function nextBlatt(pid) {
    try { var d = await db.select('berichte', 'select=blatt_nr&projekt_id=eq.' + pid + '&order=blatt_nr.desc&limit=1'); return d[0] ? (+d[0].blatt_nr || 0) + 1 : 1; }
    catch (e) { return null; }
  }
  // Projekt öffnen: gespeicherten Entwurf vom Gerät holen oder neuen Bericht anlegen
  async function openProjekt(pid, first) {
    S.pid = pid && S.projekte.some(function (p) { return p.id === pid; }) ? pid : (S.projekte[0] && S.projekte[0].id) || null;
    LS.set('btb_projekt', S.pid || '');
    S.quickResult = ''; S.restored = false;
    if (!S.pid) { S.form = null; render(); return; }
    var dr = await idb.get('draft:' + S.pid);
    if (dr && dr.form) {
      S.form = dr.form; S.blatt = dr.blatt || 1; S.editId = dr.editId || null; S.editStatus = dr.editStatus || null; S.draftAt = dr.at || null; S.lastSaved = dr.lastSaved || null;
      S.restored = !first || hasContent(S.form);
      render();
      if (!S.editId) nextBlatt(S.pid).then(function (n) { if (n && n > S.blatt) { S.blatt = n; saveDraft(); render(); } });
    } else {
      await newBericht(true);
    }
  }
  function hasContent(f) {
    return !!(f.ausgefuehrteArbeiten || f.sonstiges || f.nachunternehmer || f.besucheText || (f.medien && f.medien.length) ||
      AK.some(function (k) { return +f.arbeitskraefte[k[0]] > 0; }) || GER.some(function (k) { return +f.geraete[k[0]] > 0; }));
  }
  async function newBericht(silent) {
    var f = mkForm();
    var sig = LS.getJ('btb_sig_' + S.pid, null);
    if (sig) f.besuche = { polier: sig.polier || '', bauleiter: sig.bauleiter || '', bauherr: sig.bauherr || '' };
    var az = LS.get('btb_az_' + S.pid); if (az) f.arbeitszeit = az;
    S.form = f; S.editId = null; S.editStatus = null; S.lastSaved = null; S.draftAt = null; S.quickResult = ''; S.restored = false;
    S.blatt = (await nextBlatt(S.pid)) || S.blatt || 1;
    await idb.del('draft:' + S.pid);
    render();
    if (projekt() && projekt().lat) loadWetter(true);
    if (!silent) { window.scrollTo(0, 0); toast('Neuer Bericht – Blatt ' + S.blatt); }
  }
  var draftTimer = null;
  function saveDraft() {
    if (!S.pid || !S.form) return;
    S.draftAt = new Date().toISOString();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      idb.set('draft:' + S.pid, { form: S.form, blatt: S.blatt, editId: S.editId, editStatus: S.editStatus, at: S.draftAt, lastSaved: S.lastSaved });
      var el = $('#draftInfo'); if (el) el.innerHTML = draftInfo();
    }, 400);
  }
  function sessionEnded() {
    LS.del('sb_token'); LS.del('sb_user');
    setTimeout(function () { renderLogin('Deine Anmeldung ist abgelaufen. Bitte erneut anmelden – deine Entwürfe bleiben auf dem Gerät erhalten.'); }, 0);
  }

  // ---------- Anmeldung ----------
  function renderLogin(msg, mode) {
    mode = mode || 'login';
    var sign = mode === 'signup', reset = mode === 'reset';
    $('#app').innerHTML = '<div class="login">' +
      '<img class="logo" src="../assets/logo-riedel.png" alt="Riedel Bau">' +
      '<h1>Bautagebuch</h1><p class="hint">Tagesberichte für die Baustelle – mit Wetter, Personal, Geräten, Fotos und PDF.</p>' +
      '<form class="card" id="loginForm" data-mode="' + mode + '" novalidate>' +
      (reset ? '' : '<div class="tabs2" role="tablist"><button type="button" role="tab" aria-selected="' + !sign + '" data-act="loginmode" data-mode="login">Anmelden</button><button type="button" role="tab" aria-selected="' + sign + '" data-act="loginmode" data-mode="signup">Konto anlegen</button></div>') +
      (reset ? '<h2 style="font:700 22px/1.1 var(--rb-cond);margin:0 0 10px">Passwort zurücksetzen</h2>' : '') +
      (msg ? '<p class="msg ' + (/angelegt|E-Mail mit/.test(msg) ? 'ok' : 'bad') + '">' + esc(msg) + '</p>' : '') +
      (sign ? '<label class="f"><span>Name</span><input type="text" name="name" autocomplete="name" required></label>' : '') +
      '<label class="f"><span>E-Mail</span><input type="email" name="email" autocomplete="username" required value="' + esc(LS.get('btb_mail', '')) + '"></label>' +
      (reset ? '' : '<label class="f"><span>Passwort</span><input type="password" name="pw" autocomplete="' + (sign ? 'new-password' : 'current-password') + '" required></label>') +
      '<button class="btn red block" type="submit">' + (sign ? 'Konto anlegen' : reset ? 'Link zum Zurücksetzen senden' : 'Anmelden') + '</button>' +
      '<p class="hint sm" style="margin:12px 0 0">' + (reset ? '<button type="button" class="link" data-act="loginmode" data-mode="login">Zurück zur Anmeldung</button>' :
        sign ? 'Nach dem Anlegen kommt eine Bestätigungs-Mail. Die Rolle vergibt der Projektleiter.' :
        '<button type="button" class="link" data-act="loginmode" data-mode="reset">Passwort vergessen?</button>') + '</p>' +
      '</form><p class="hint sm">Das Bautagebuch hat eine eigene Anmeldung (eigene Datenbank) – unabhängig von der Anmeldung bei den Riedel-Tools.</p></div>';
  }
  async function doLogin(form) {
    var mode = form.dataset.mode, fd = new FormData(form);
    var email = String(fd.get('email') || '').trim(), pw = String(fd.get('pw') || ''), name = String(fd.get('name') || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return renderLogin('Bitte eine gültige E-Mail eingeben.', mode);
    LS.set('btb_mail', email);
    var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Bitte warten …';
    try {
      if (mode === 'reset') {
        await authCall('recover', { email: email });
        return renderLogin('Falls es ein Konto gibt, kommt gleich eine E-Mail mit einem Link zum Zurücksetzen.', 'login');
      }
      if (!pw) return renderLogin('Bitte das Passwort eingeben.', mode);
      if (mode === 'signup') {
        if (!name) return renderLogin('Bitte deinen Namen eingeben.', mode);
        var s = await authCall('signup', { email: email, password: pw, data: { full_name: name } });
        if (!s.access_token) return renderLogin('Konto angelegt. Bitte den Link in der Bestätigungs-Mail öffnen und dann anmelden.', 'login');
        return loggedIn(s);
      }
      loggedIn(await authCall('token?grant_type=password', { email: email, password: pw }));
    } catch (e) {
      var t = errText(e);
      renderLogin(/invalid login/i.test(t) ? 'E-Mail oder Passwort falsch.' : /not confirmed/i.test(t) ? 'E-Mail noch nicht bestätigt – bitte den Link in der Bestätigungs-Mail öffnen.' : t, mode);
    }
  }
  function loggedIn(d) {
    LS.set('sb_token', d.access_token); if (d.refresh_token) LS.set('sb_refresh', d.refresh_token); LS.set('sb_user', d.user);
    S.user = d.user; start();
  }
  async function logout() {
    try { await fetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: headers(LS.get('sb_token')) }); } catch (e) {}
    LS.del('sb_token'); LS.del('sb_refresh'); LS.del('sb_user'); S.user = null;
    closeDlg(); renderLogin('', 'login');
  }

  // ---------- Grundgerüst ----------
  function render() {
    if (!S.user) return renderLogin();
    var v = view(), p = projekt();
    var ini = String((S.profil && S.profil.name) || (S.user && S.user.email) || '?').split(/[\s.@]+/).filter(Boolean).slice(0, 2).map(function (s) { return s[0].toUpperCase(); }).join('');
    var html = '<header class="head"><div class="head-in">' +
      '<button class="pick" data-act="pickProjekt" aria-label="Projekt wechseln"><span class="pk-txt"><small>Projekt' + (p && p.bau_nr ? ' · Bau-Nr. ' + esc(p.bau_nr) : '') + '</small><b>' + esc(p ? p.name : 'Kein Projekt') + '</b></span><span class="chev">' + icon('chev') + '</span></button>' +
      '<button class="me" data-act="me" title="Mein Konto" aria-label="Mein Konto">' + esc(ini) + '</button></div>' +
      '<nav class="nav" aria-label="Bereiche">' +
      '<a href="#bericht"' + (v === 'bericht' ? ' aria-current="page"' : '') + '>Tagesbericht</a>' +
      '<a href="#archiv"' + (v === 'archiv' ? ' aria-current="page"' : '') + '>Berichte</a>' +
      '<a href="#projekte"' + (v === 'projekte' ? ' aria-current="page"' : '') + '>Projekte<span class="cnt">' + S.projekte.length + '</span></a>' +
      '</nav></header><main id="main">' + (v === 'archiv' ? archivHTML() : v === 'projekte' ? projekteHTML() : berichtHTML()) + '</main>' +
      (v === 'bericht' && p && S.form ? actionsHTML() : '');
    var y = window.scrollY;
    $('#app').innerHTML = html;
    window.scrollTo(0, y);
    if (v === 'bericht') updateStatus();
  }

  // ---------- Tagesbericht ----------
  function draftInfo() {
    var t = S.draftAt ? new Date(S.draftAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    var parts = [];
    if (S.lastSaved) parts.push('In der Datenbank gespeichert ' + new Date(S.lastSaved).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    else parts.push('Noch nicht in der Datenbank gespeichert');
    if (t) parts.push('auf dem Gerät gesichert ' + t);
    return esc(parts.join(' · '));
  }
  function berichtHTML() {
    var p = projekt();
    if (p && !S.form) return '<p class="loading">Bericht wird geladen …</p>';
    if (!p) return '<div class="empty"><b>Noch kein Projekt</b>Lege zuerst ein Projekt an – danach kannst du Tagesberichte schreiben.<div style="margin-top:14px"><button class="btn red" data-act="newProjekt">+ Projekt anlegen</button></div></div>';
    var f = S.form;
    var editing = !!S.editId;
    var h = '<div class="rhead"><h1>Blatt ' + esc(S.blatt) + '</h1>' +
      (editing ? '<span class="badge edit">' + (S.editStatus === 'bestaetigt' ? 'Bestätigten Bericht bearbeiten' : 'Entwurf in Bearbeitung') + '</span>' : '<span class="badge">Neuer Bericht</span>') +
      '<span class="sub" id="draftInfo">' + draftInfo() + '</span></div>';
    if (S.restored) h += '<div class="banner"><p>Dein letzter Stand von Blatt ' + esc(S.blatt) + ' wurde wiederhergestellt.</p><button class="btn sm sec" data-act="newBericht">Neuen Bericht beginnen</button></div>';
    if (editing) h += '<div class="banner"><p>Du bearbeitest einen gespeicherten Bericht. Änderungen werden erst mit „Speichern“ übernommen.</p><button class="btn sm sec" data-act="newBericht">Bearbeitung beenden</button></div>';

    // Schnellnotiz
    var speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    h += '<section class="card quick"><div class="ch"><h2>Schnell erfassen</h2></div><div class="cb">' +
      '<p class="hint">Schreib oder sprich, was heute los war – z. B. „3 Maurer, 2 Helfer, 1 Kran, Bodenplatte Achse 1–4 betoniert“. Personal und Geräte mit Zahl werden erkannt, der Text kommt zu „Ausgeführte Arbeiten“.</p>' +
      '<label class="sr" for="quick">Schnellnotiz</label><textarea id="quick" rows="3" placeholder="Was wurde heute gemacht?"></textarea>' +
      '<div class="row" style="margin-top:10px">' +
      (speech ? '<button class="btn sec" data-act="dictate" id="dictBtn">' + (S.recording ? '<span class="rec"><span class="dot"></span>Stopp</span>' : icon('mic') + 'Diktieren') + '</button>' : '') +
      '<button class="btn" data-act="quick" style="flex:1">Übernehmen</button>' +
      '<button class="btn sec" data-act="fromLast" title="Personal, Geräte, Nachunternehmer und Namen vom letzten Bericht">' + icon('copy') + '<span>Wie letzter Bericht</span></button></div>' +
      (S.quickResult ? '<p class="result">' + esc(S.quickResult) + '</p>' : '') +
      (speech ? '' : '<p class="hint sm" style="margin:10px 0 0">Tipp: Mit dem Mikrofon auf der Handy-Tastatur kannst du in jedes Feld diktieren.</p>') +
      '</div></section>';

    // 1 Datum & Wetter
    var az = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(f.arbeitszeit || '') || [];
    var temps = [['temp7', '7 Uhr'], ['temp12', '12 Uhr'], ['temp16', '16 Uhr'], ['tempMax', 'max'], ['tempMin', 'min']];
    h += sec('kopf', 1, 'Datum & Wetter',
      '<div class="dt"><label class="f"><span>Datum</span><input type="date" data-date value="' + esc(deToIso(f.datum)) + '"></label>' +
      '<label class="f"><span>Beginn</span><input type="time" data-az="von" value="' + esc(pad2((az[1] || '07:00').split(':')[0]) + ':' + (az[1] || '07:00').split(':')[1]) + '"></label>' +
      '<label class="f"><span>Ende</span><input type="time" data-az="bis" value="' + esc(pad2((az[2] || '16:00').split(':')[0]) + ':' + (az[2] || '16:00').split(':')[1]) + '"></label></div>' +
      '<div class="row" style="justify-content:space-between;margin-bottom:6px"><p class="lbl" style="margin:0">Temperatur in °C <b style="color:var(--rb-red-ink);font-weight:600">*</b></p>' +
      (p.lat ? '<button class="btn sm sec" data-act="wetter" id="wxBtn">' + icon('sun') + 'Wetter laden</button>' : '<button class="link" data-act="editProjekt" data-id="' + esc(p.id) + '">Ort eintragen für automatisches Wetter</button>') + '</div>' +
      '<div class="temps">' + temps.map(function (t) { return '<label><span>' + t[1] + '</span><input type="number" inputmode="decimal" step="any" data-temp="' + t[0] + '" id="f-' + t[0] + '" value="' + esc(tempNum(f[t[0]])) + '"></label>'; }).join('') + '</div>' +
      '<p class="lbl">Niederschlag</p><div class="chips">' + NIED.map(function (n) { return '<button type="button" class="chip" data-chip="niederschlag" data-v="' + esc(n[0]) + '" aria-pressed="' + ((f.niederschlag || '') === n[0]) + '">' + n[1] + '</button>'; }).join('') + '</div>' +
      '<p class="lbl" id="f-luftbewegung">Wind <b style="color:var(--rb-red-ink);font-weight:600">*</b></p><div class="chips">' + LUFT.map(function (n) { return '<button type="button" class="chip" data-chip="luftbewegung" data-v="' + esc(n[0]) + '" aria-pressed="' + (f.luftbewegung === n[0]) + '">' + n[1] + '</button>'; }).join('') + '</div>');

    // 2 Personal
    h += sec('personal', 2, 'Personal', '<div class="steps">' + AK.map(function (k) { return stepper('arbeitskraefte.' + k[0], k[1], f.arbeitskraefte[k[0]]); }).join('') + '</div><p class="sum" id="akSum"></p>');
    // 3 Geräte
    h += sec('geraete', 3, 'Geräte & Baustoffe', '<div class="steps">' + GER.map(function (k) { return stepper('geraete.' + k[0], k[1], f.geraete[k[0]]); }).join('') + '</div>');
    // 4 Arbeiten
    h += sec('arbeiten', 4, 'Arbeiten & Besonderheiten',
      '<label class="f"><span>Ausgeführte Arbeiten <b>*</b></span><textarea class="big" data-f="ausgefuehrteArbeiten" id="f-ausgefuehrteArbeiten" placeholder="z. B. Bodenplatte Achse 1–4 betoniert, Schalung Wände UG gestellt">' + esc(f.ausgefuehrteArbeiten) + '</textarea></label>' +
      '<label class="f"><span>Nachunternehmer (Firma, Anzahl Personen, Tätigkeit)</span><textarea data-f="nachunternehmer" rows="3" placeholder="z. B. Elektro Maier – 2 Personen – Leerrohre UG">' + esc(f.nachunternehmer) + '</textarea></label>' +
      '<label class="f"><span>Besuche auf der Baustelle</span><textarea data-f="besucheText" rows="2" placeholder="z. B. Architekt Hofmann, Prüfstatiker">' + esc(f.besucheText) + '</textarea></label>' +
      '<label class="f" style="margin-bottom:0"><span>Sonstiges (Behinderungen, Anordnungen, Lieferungen …)</span><textarea data-f="sonstiges" rows="3">' + esc(f.sonstiges) + '</textarea></label>');
    // 5 Fotos
    var med = f.medien || [];
    h += sec('fotos', 5, 'Fotos & Anhang',
      '<p class="hint">Fotos und Anmerkungen kommen auf eine eigene Anhang-Seite im PDF. Sie werden nur ins PDF übernommen, nicht in der Datenbank gespeichert.</p>' +
      (med.length ? '<div class="photos">' + med.map(function (m, i) {
        return '<div class="photo">' + (m.typ === 'foto' && m.dataUrl ? '<img src="' + m.dataUrl + '" alt="Foto ' + (i + 1) + '">' : '<p class="hint" style="padding:10px">Sprachnotiz: ' + esc(m.transkription || m.beschreibung) + '</p>') +
          '<div class="pi"><input type="text" data-f="medien.' + i + '.beschreibung" value="' + esc(m.beschreibung) + '" placeholder="Beschreibung" aria-label="Beschreibung Foto ' + (i + 1) + '">' +
          '<button class="btn sec" data-act="rmFoto" data-i="' + i + '" aria-label="Foto entfernen">' + icon('trash') + '</button></div></div>';
      }).join('') + '</div>' : '') +
      '<div class="row" style="margin-bottom:12px"><label class="btn sec filebtn">' + icon('cam') + 'Foto hinzufügen<input type="file" accept="image/*" multiple data-act="foto"></label></div>' +
      '<label class="f" style="margin-bottom:0"><span>Anmerkungen für den Anhang</span><textarea data-f="anhangText" rows="2">' + esc(f.anhangText) + '</textarea></label>');
    // 6 Unterschriften
    h += sec('namen', 6, 'Namen für die Unterschrift',
      '<div class="names"><label class="f"><span>Polier <b>*</b></span><input type="text" data-f="besuche.polier" id="f-besuche.polier" autocomplete="name" value="' + esc(f.besuche.polier) + '"></label>' +
      '<label class="f"><span>Bauleiter <b>*</b></span><input type="text" data-f="besuche.bauleiter" id="f-besuche.bauleiter" value="' + esc(f.besuche.bauleiter) + '"></label>' +
      '<label class="f"><span>Bauherr</span><input type="text" data-f="besuche.bauherr" value="' + esc(f.besuche.bauherr) + '"></label></div>' +
      '<p class="hint sm" style="margin:0">Die Namen werden für dieses Projekt gemerkt und beim nächsten Bericht vorgeschlagen.</p>');
    return h;
  }
  function sec(id, n, title, body) {
    return '<details class="card" data-sec="' + id + '"' + (S.collapsed[id] ? '' : ' open') + '><summary><span class="num-ix">' + n + '</span><span class="sh"><h2>' + title + '</h2><span class="st" id="st-' + id + '"></span></span><span class="tog">' + icon('chev') + '</span></summary><div class="cb">' + body + '</div></details>';
  }
  function stepper(path, label, val) {
    var v = +val || 0;
    return '<div class="step' + (v ? ' on' : '') + '"><span>' + esc(label) + '</span>' +
      '<button type="button" data-step="' + path + '" data-d="-1" aria-label="' + esc(label) + ' weniger">−</button>' +
      '<input type="number" inputmode="numeric" min="0" data-num="' + path + '" value="' + (v || '') + '" placeholder="0" aria-label="' + esc(label) + '">' +
      '<button type="button" class="plus" data-step="' + path + '" data-d="1" aria-label="' + esc(label) + ' mehr">+</button></div>';
  }
  function actionsHTML() {
    return '<div class="actions"><div class="actions-in">' +
      '<button class="prog" data-act="gotoMissing" id="prog"><small id="progTxt"></small><span class="bar" id="progBar"><i></i></span></button>' +
      '<button class="btn ghost" data-act="preview" title="PDF-Vorschau" aria-label="PDF-Vorschau">' + icon('eye') + '</button>' +
      '<button class="btn sec" data-act="saveDraft">Speichern<span class="lg">als Entwurf</span></button>' +
      '<button class="btn red" data-act="confirm">Bestätigen<span class="lg">+ PDF</span></button>' +
      '</div></div>';
  }
  // Abschnitts-Status und Fortschritt aktualisieren, ohne neu zu zeichnen (Fokus bleibt)
  function updateStatus() {
    var f = S.form; if (!f) return;
    var miss = pruefeFehlend(f);
    var akSum = AK.reduce(function (s, k) { return s + (+f.arbeitskraefte[k[0]] || 0); }, 0);
    var gSum = GER.filter(function (k) { return +f.geraete[k[0]] > 0; }).length;
    var med = (f.medien || []).length;
    function st(id, txt, cls, done) {
      var el = $('#st-' + id); if (!el) return;
      el.textContent = txt; el.className = 'st' + (cls ? ' ' + cls : '');
      el.closest('details').classList.toggle('done', !!done);
    }
    var kMiss = ['Temperatur 7h', 'Luftbewegung'].filter(function (x) { return miss.indexOf(x) >= 0; });
    st('kopf', kMiss.length ? 'fehlt: ' + kMiss.map(function (x) { return REQ_LABEL[x]; }).join(', ') : (f.temp7 || '') + (f.niederschlag ? ', ' + f.niederschlag : '') + ', ' + (LUFT.find(function (l) { return l[0] === f.luftbewegung; }) || ['', ''])[1], kMiss.length ? 'miss' : 'ok', !kMiss.length);
    st('personal', akSum ? akSum + (akSum === 1 ? ' Person' : ' Personen') : 'noch leer', akSum ? 'ok' : '', akSum > 0);
    st('geraete', gSum ? gSum + (gSum === 1 ? ' Gerät/Baustoff' : ' Geräte/Baustoffe') : 'keine', gSum ? 'ok' : '', gSum > 0);
    var aMiss = miss.indexOf('Ausgeführte Arbeiten') >= 0;
    st('arbeiten', aMiss ? 'fehlt: Ausgeführte Arbeiten' : 'ausgefüllt', aMiss ? 'miss' : 'ok', !aMiss);
    st('fotos', med ? med + (med === 1 ? ' Foto' : ' Fotos') : 'optional', med ? 'ok' : '', med > 0);
    var nMiss = ['Polier Unterschrift', 'Bauleiter Unterschrift'].filter(function (x) { return miss.indexOf(x) >= 0; });
    st('namen', nMiss.length ? 'fehlt: ' + nMiss.map(function (x) { return REQ_LABEL[x]; }).join(', ') : 'vollständig', nMiss.length ? 'miss' : 'ok', !nMiss.length);
    var sumEl = $('#akSum'); if (sumEl) sumEl.textContent = 'Zusammen: ' + akSum + (akSum === 1 ? ' Person' : ' Personen');
    var done = 5 - miss.length;
    var pt = $('#progTxt'), pb = $('#progBar');
    if (pt) pt.innerHTML = miss.length ? '<b>' + done + '/5</b><span class="lg"> Pflichtangaben · ' + esc(REQ_LABEL[miss[0]]) + ' fehlt</span>' : '<b>✓ Vollständig</b>';
    var pr = $('#prog'); if (pr) pr.title = miss.length ? 'Es fehlt: ' + miss.map(function (m) { return REQ_LABEL[m]; }).join(', ') + ' – antippen, um hinzuspringen' : 'Alle Pflichtangaben ausgefüllt';
    if (pb) { pb.firstChild.style.width = (done / 5 * 100) + '%'; pb.classList.toggle('full', !miss.length); }
    $$('.miss').forEach(function (el) { el.classList.remove('miss'); });
  }
  function gotoMissing() {
    var miss = pruefeFehlend(S.form); if (!miss.length) return;
    miss.forEach(function (m) { var el = document.getElementById('f-' + REQ[m]); if (el && el.tagName !== 'P') el.classList.add('miss'); });
    var el = document.getElementById('f-' + REQ[miss[0]]);
    if (!el) return;
    var d = el.closest('details'); if (d) d.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.focus && el.tagName !== 'P') setTimeout(function () { el.focus({ preventScroll: true }); }, 350);
  }

  // Wetter (Open-Meteo, wie bisher)
  async function loadWetter(auto) {
    var p = projekt(); if (!p || !p.lat) return;
    var f = S.form;
    if (auto && (f.temp7 || f.temp12)) return;
    var iso = deToIso(f.datum) || new Date().toISOString().slice(0, 10);
    var heute = new Date().toISOString().slice(0, 10);
    var days = Math.ceil((new Date(iso) - new Date(heute)) / 864e5);
    if (days > 15) { if (!auto) toast('Für dieses Datum gibt es noch keine Vorhersage.', true); return; }
    var btn = $('#wxBtn'); if (btn) { btn.disabled = true; btn.lastChild.textContent = 'Lädt …'; }
    var q = '?latitude=' + p.lat + '&longitude=' + p.lon + '&hourly=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Berlin';
    var url = iso < heute ? 'https://archive-api.open-meteo.com/v1/archive' + q + '&start_date=' + iso + '&end_date=' + iso
      : 'https://api.open-meteo.com/v1/forecast' + q + '&forecast_days=' + Math.max(1, days + 1);
    try {
      var d = await (await fetch(url)).json();
      if (!d.hourly) throw new Error(d.reason || 'keine Daten');
      var t = d.hourly.time || [];
      function at(h) { var i = t.indexOf(iso + 'T' + pad2(h) + ':00'); return i < 0 ? h : i; }
      var i7 = at(7), i12 = at(12), i16 = at(16), di = Math.max(0, (d.daily.time || []).indexOf(iso));
      function T(i) { var v = d.hourly.temperature_2m[i]; return v == null ? '' : Math.round(v) + '°C'; }
      var ws = d.hourly.windspeed_10m || [];
      var w = {
        temp7: T(i7), temp12: T(i12), temp16: T(i16),
        tempMax: d.daily.temperature_2m_max[di] == null ? '' : Math.round(d.daily.temperature_2m_max[di]) + '°C',
        tempMin: d.daily.temperature_2m_min[di] == null ? '' : Math.round(d.daily.temperature_2m_min[di]) + '°C',
        niederschlag: getN((d.hourly.weathercode || [])[i12] || 0),
        luftbewegung: getW(((ws[i7] || 0) + (ws[i12] || 0) + (ws[i16] || 0)) / 3)
      };
      Object.assign(f, w);
      saveDraft(); render();
      if (!auto) toast('Wetter für ' + f.datum + ' übernommen' + (iso < heute ? ' (Messwerte)' : ' (Vorhersage)') + '.');
    } catch (e) {
      if (!auto) toast('Wetter konnte nicht geladen werden: ' + errText(e), true);
      if (btn) { btn.disabled = false; btn.lastChild.textContent = 'Wetter laden'; }
    }
  }

  // Schnellnotiz übernehmen
  function applyQuick() {
    var ta = $('#quick'), txt = ta ? ta.value.trim() : '';
    if (!txt) { toast('Bitte erst etwas eintragen oder diktieren.'); if (ta) ta.focus(); return; }
    var f = S.form, before = JSON.stringify(f);
    var r = parseLokal(txt, f), u = r.updates, got = [];
    if (u.arbeitskraefte) Object.keys(u.arbeitskraefte).forEach(function (k) { f.arbeitskraefte[k] = String(u.arbeitskraefte[k]); got.push((AK.find(function (a) { return a[0] === k; }) || [k, k])[1] + ' ' + u.arbeitskraefte[k]); });
    if (u.geraete) Object.keys(u.geraete).forEach(function (k) { f.geraete[k] = u.geraete[k]; got.push((GER.find(function (a) { return a[0] === k; }) || [k, k])[1] + ' ' + u.geraete[k]); });
    ['temp7', 'tempMax', 'niederschlag', 'luftbewegung'].forEach(function (k) { if (u[k]) { f[k] = u[k]; got.push(k === 'luftbewegung' ? 'Wind: ' + u[k].replace('maeßiger', 'mäßiger') : k === 'niederschlag' ? u[k] : 'Temperatur ' + u[k]); } });
    // Der Text selbst gehört immer zu den ausgeführten Arbeiten
    var cur = f.ausgefuehrteArbeiten || '';
    if (cur.indexOf(txt) < 0) f.ausgefuehrteArbeiten = (u.ausgefuehrteArbeiten && u.ausgefuehrteArbeiten.indexOf(txt) >= 0) ? u.ausgefuehrteArbeiten : (cur ? cur + '\n' : '') + txt;
    S.quickResult = (got.length ? 'Erkannt: ' + got.join(', ') + '. ' : '') + 'Text unter „Ausgeführte Arbeiten“ ergänzt.';
    if (JSON.stringify(f) !== before) saveDraft();
    render();
  }
  function dictate() {
    if (S.recording) { S.recording.stop(); return; }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR(), ta = $('#quick'), base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
    rec.lang = 'de-DE'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = function (e) {
      var s = ''; for (var i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      var t = $('#quick'); if (t) t.value = base + s.trim();
    };
    rec.onerror = function (e) { toast(e.error === 'not-allowed' ? 'Mikrofon nicht erlaubt – bitte in den Einstellungen freigeben.' : 'Spracheingabe nicht möglich (' + e.error + ').', true); };
    rec.onend = function () { var keep = $('#quick') ? $('#quick').value : ''; S.recording = null; render(); var t = $('#quick'); if (t) t.value = keep; };
    S.recording = rec; rec.start();
    var b = $('#dictBtn'); if (b) b.innerHTML = '<span class="rec"><span class="dot"></span>Stopp</span>';
  }
  async function fromLast() {
    var q = 'select=*&projekt_id=eq.' + S.pid + '&order=blatt_nr.desc&limit=2';
    try {
      var rows = (await db.select('berichte', q)).filter(function (b) { return b.id !== S.editId; });
      if (!rows[0]) { toast('Für dieses Projekt gibt es noch keinen Bericht.'); return; }
      var l = fromRow(rows[0]), f = S.form;
      f.arbeitszeit = l.arbeitszeit; f.arbeitskraefte = l.arbeitskraefte; f.geraete = l.geraete;
      if (l.nachunternehmer) f.nachunternehmer = l.nachunternehmer;
      ['polier', 'bauleiter', 'bauherr'].forEach(function (k) { if (l.besuche[k]) f.besuche[k] = l.besuche[k]; });
      S.quickResult = 'Von Blatt ' + rows[0].blatt_nr + ' übernommen: Arbeitszeit, Personal, Geräte, Nachunternehmer und Namen. Bitte prüfen und anpassen.';
      saveDraft(); render();
    } catch (e) { toast(errText(e), true); }
  }
  // Fotos verkleinern (spart Platz, PDF bleibt handlich)
  function addFotos(files) {
    Array.prototype.forEach.call(files, function (file) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        S.form.medien = (S.form.medien || []).concat([{ typ: 'foto', dataUrl: c.toDataURL('image/jpeg', 0.8), beschreibung: '', transkription: '', w: c.width, h: c.height }]);
        saveDraft(); render();
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('Bild konnte nicht gelesen werden: ' + file.name, true); };
      img.src = url;
    });
  }

  // Speichern / Bestätigen
  async function speichern(bestaetigen, trotzdem) {
    var p = projekt(), f = S.form;
    if (!p || !f || S.saving) return;
    var miss = pruefeFehlend(f);
    if (bestaetigen && miss.length && !trotzdem) {
      return dlg('Noch nicht vollständig',
        '<p>Für den Bericht fehlen noch:</p><ul class="misslist">' + miss.map(function (m) { return '<li>' + esc(REQ_LABEL[m]) + '</li>'; }).join('') + '</ul><p class="hint">Du kannst trotzdem bestätigen – die Felder bleiben im PDF dann leer.</p>',
        '<button class="btn sec" value="force" data-act="forceConfirm">Trotzdem bestätigen</button><button class="btn red" value="fix" data-act="fixMissing">Ergänzen</button>');
    }
    if (!S.editId) {
      try {
        var dup = await db.select('berichte', 'select=id&projekt_id=eq.' + S.pid + '&blatt_nr=eq.' + S.blatt);
        if (dup.length && !confirm('Blatt ' + S.blatt + ' gibt es in diesem Projekt schon. Trotzdem als weiteres Blatt ' + S.blatt + ' speichern?')) return;
      } catch (e) {}
    }
    S.saving = true; $$('.actions .btn').forEach(function (b) { b.disabled = true; });
    // Ein bereits bestätigter Bericht bleibt beim Speichern von Korrekturen bestätigt
    var status = bestaetigen || S.editStatus === 'bestaetigt' ? 'bestaetigt' : 'entwurf';
    try {
      var row = toRow(f, status), saved;
      if (S.editId) saved = await db.update('berichte', 'id=eq.' + S.editId, row);
      else saved = await db.insert('berichte', row);
      if (saved && saved.id) S.editId = saved.id;
      S.editStatus = status; S.lastSaved = new Date().toISOString();
      LS.set('btb_sig_' + S.pid, f.besuche); LS.set('btb_az_' + S.pid, f.arbeitszeit);
      S.archiv = null;
      if (bestaetigen) {
        var doc = buildPDFDoc(f, p.name, p.bau_nr || '', S.blatt);
        doc.save(pdfName(p.name, S.blatt, f.datum));
        var b = S.blatt;
        S.saving = false;
        await newBericht(true);
        window.scrollTo(0, 0);
        toast('Blatt ' + b + ' bestätigt und als PDF gespeichert.');
      } else {
        S.saving = false; saveDraft(); render();
        toast((status === 'bestaetigt' ? 'Änderungen gespeichert' : 'Entwurf gespeichert') + ' (Blatt ' + S.blatt + ').');
      }
    } catch (e) {
      S.saving = false; saveDraft(); render();
      toast('Nicht gespeichert: ' + errText(e) + ' Deine Eingaben bleiben auf diesem Gerät erhalten.', true);
    }
  }
  function preview() {
    var p = projekt(); if (!p) return;
    var doc = buildPDFDoc(S.form, p.name, p.bau_nr || '', S.blatt);
    var url = doc.output('bloburl');
    dlg('PDF-Vorschau – Blatt ' + S.blatt,
      '<iframe class="pdfview" src="' + url + '" title="PDF-Vorschau"></iframe><p class="hint sm" style="margin:8px 0 0">Wird die Vorschau nicht angezeigt? <a href="' + url + '" target="_blank" rel="noopener">In neuem Fenster öffnen</a></p>',
      '<button class="btn sec" value="close">Schließen</button><button class="btn" data-act="dlPreview" value="dl">' + icon('dl') + 'Herunterladen</button>');
    S._previewDoc = doc;
  }

  // ---------- Berichte (Archiv) ----------
  async function loadArchiv(force) {
    if (S.archivLoad || (S.archiv && !force)) { if (view() === 'archiv') render(); return; }
    S.archivLoad = true; if (view() === 'archiv') render();
    try { S.archiv = await db.select('berichte', 'select=*&order=datum.desc,blatt_nr.desc'); S.archivErr = ''; }
    catch (e) { S.archivErr = errText(e); }
    S.archivLoad = false; if (view() === 'archiv') render();
  }
  function filtered() {
    var F = S.filt, all = S.archiv || [];
    return all.filter(function (b) {
      if (F.projekt === 'aktiv' && b.projekt_id !== S.pid) return false;
      if (F.projekt && F.projekt !== 'aktiv' && F.projekt !== 'alle' && b.projekt_id !== F.projekt) return false;
      if (F.jahr && String(b.datum || '').slice(0, 4) !== F.jahr) return false;
      if (F.status && (b.status === 'bestaetigt' ? 'bestaetigt' : 'entwurf') !== F.status) return false;
      if (F.q) { var q = F.q.toLowerCase(); if ((b.ausgefuehrte_arbeiten + ' ' + b.sonstiges + ' ' + b.nachunternehmer + ' ' + b.blatt_nr).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
  }
  function pname(id) { var p = S.projekte.concat(S.hidden).find(function (x) { return x.id === id; }); return p ? p.name : 'Unbekanntes Projekt'; }
  function archivHTML() {
    var F = S.filt;
    var jahre = Array.from(new Set((S.archiv || []).map(function (b) { return String(b.datum || '').slice(0, 4); }).filter(Boolean))).sort().reverse();
    var h = '<div class="sec-h"><h1>Berichte</h1><button class="btn sm sec" data-act="reloadArchiv">Aktualisieren</button></div>' +
      '<div class="filters">' +
      '<label class="wide">Suchen<input type="search" data-filt="q" value="' + esc(F.q) + '" placeholder="Text oder Blatt-Nr."></label>' +
      '<label class="wide">Projekt<select data-filt="projekt"><option value="aktiv"' + (F.projekt === 'aktiv' ? ' selected' : '') + '>Aktuelles Projekt</option><option value="alle"' + (F.projekt === 'alle' ? ' selected' : '') + '>Alle Projekte</option>' +
      S.projekte.concat(S.hidden).map(function (p) { return '<option value="' + esc(p.id) + '"' + (F.projekt === p.id ? ' selected' : '') + '>' + esc(p.name) + (p.status === 'archiviert' ? ' (ausgeblendet)' : '') + '</option>'; }).join('') + '</select></label>' +
      '<label>Jahr<select data-filt="jahr"><option value="">Alle</option>' + jahre.map(function (j) { return '<option' + (F.jahr === j ? ' selected' : '') + '>' + j + '</option>'; }).join('') + '</select></label>' +
      '<label>Status<select data-filt="status"><option value="">Alle</option><option value="entwurf"' + (F.status === 'entwurf' ? ' selected' : '') + '>Entwürfe</option><option value="bestaetigt"' + (F.status === 'bestaetigt' ? ' selected' : '') + '>Bestätigt</option></select></label>' +
      '<label>Gruppieren<select data-filt="gruppe"><option value="kw"' + (F.gruppe !== 'monat' ? ' selected' : '') + '>Woche</option><option value="monat"' + (F.gruppe === 'monat' ? ' selected' : '') + '>Monat</option></select></label></div>';
    if (S.archivLoad && !S.archiv) return h + '<p class="loading">Berichte werden geladen …</p>';
    if (S.archivErr) return h + '<div class="banner warn"><p>' + esc(S.archivErr) + '</p><button class="btn sm" data-act="reloadArchiv">Erneut versuchen</button></div>';
    var list = filtered();
    if (!list.length) return h + '<div class="empty"><b>Keine Berichte gefunden</b>' + ((S.archiv || []).length ? 'Mit diesen Filtern gibt es keine Berichte.' : 'Sobald du einen Tagesbericht speicherst, erscheint er hier.') + '</div>';
    var groups = [], idx = {};
    list.forEach(function (b) {
      var iso = String(b.datum || ''), key, label;
      if (!iso) { key = '0'; label = 'Ohne Datum'; }
      else if (F.gruppe === 'monat') { key = iso.slice(0, 7); label = MON[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4); }
      else { var w = isoWeek(iso); key = w.y + '-' + pad2(w.w); label = 'KW ' + w.w + ' / ' + w.y; }
      if (!idx[key]) { idx[key] = { key: key, label: label, items: [] }; groups.push(idx[key]); }
      idx[key].items.push(b);
    });
    var showP = F.projekt === 'alle';
    return h + groups.map(function (g) {
      return '<div class="group"><h3>' + esc(g.label) + '</h3><span>' + g.items.length + (g.items.length === 1 ? ' Bericht' : ' Berichte') + '</span>' +
        '<button class="btn sm sec" data-act="zip" data-key="' + esc(g.key) + '" title="Alle PDFs dieser Gruppe als ZIP">' + icon('dl') + 'ZIP</button></div>' +
        g.items.map(function (b) {
          var ok = b.status === 'bestaetigt';
          return '<article class="item' + (ok ? '' : ' draft') + '"><div class="t"><b>Blatt ' + esc(b.blatt_nr) + '</b><span class="d">' + esc(niceDate(b.datum)) + (showP ? ' · ' + esc(pname(b.projekt_id)) : '') + '</span>' +
            '<span class="badge ' + (ok ? 'ok' : 'warn') + '">' + (ok ? 'Bestätigt' : 'Entwurf') + '</span></div>' +
            '<p>' + esc(b.ausgefuehrte_arbeiten || '– keine Arbeiten eingetragen –') + '</p>' +
            '<div class="row"><button class="btn sm sec" data-act="pdf" data-id="' + esc(b.id) + '">' + icon('dl') + 'PDF</button>' +
            '<button class="btn sm" data-act="edit" data-id="' + esc(b.id) + '">Bearbeiten</button>' +
            '<button class="btn sm danger icon" data-act="del" data-id="' + esc(b.id) + '" aria-label="Blatt ' + esc(b.blatt_nr) + ' löschen" title="Löschen">' + icon('trash') + '</button></div></article>';
        }).join('');
    }).join('');
  }
  async function zipGroup(key) {
    var F = S.filt, items = filtered().filter(function (b) {
      var iso = String(b.datum || '');
      if (!iso) return key === '0';
      if (F.gruppe === 'monat') return iso.slice(0, 7) === key;
      var w = isoWeek(iso); return w.y + '-' + pad2(w.w) === key;
    });
    if (!items.length || !window.JSZip) return;
    var zip = new JSZip();
    items.forEach(function (b) { zip.file(pdfName(pname(b.projekt_id), b.blatt_nr, isoToDe(b.datum)), pdfFor(b).output('arraybuffer')); });
    var blob = await zip.generateAsync({ type: 'blob' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Bautagebuch_' + key + '.zip';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  async function editBericht(id) {
    var b = (S.archiv || []).find(function (x) { return x.id === id; }); if (!b) return;
    if (!S.projekte.some(function (p) { return p.id === b.projekt_id; })) { toast('Das Projekt dieses Berichts ist ausgeblendet. Bitte zuerst unter „Projekte“ wiederherstellen.', true); return; }
    // Ungespeicherter neuer Bericht im Zielprojekt? Dann erst nachfragen.
    var dr = b.projekt_id === S.pid ? { form: S.form, editId: S.editId, blatt: S.blatt } : await idb.get('draft:' + b.projekt_id);
    if (dr && dr.form && !dr.editId && hasContent(dr.form) &&
      !confirm('Im Projekt gibt es einen noch nicht gespeicherten Bericht (Blatt ' + dr.blatt + '). Er wird durch Blatt ' + b.blatt_nr + ' ersetzt. Fortfahren?')) return;
    S.pid = b.projekt_id; LS.set('btb_projekt', S.pid);
    S.form = fromRow(b); S.blatt = b.blatt_nr; S.editId = b.id; S.editStatus = b.status; S.lastSaved = null; S.quickResult = ''; S.restored = false;
    saveDraft();
    location.hash = '#bericht'; window.scrollTo(0, 0); render();
  }
  async function delBericht(id) {
    var b = (S.archiv || []).find(function (x) { return x.id === id; }); if (!b) return;
    if (!confirm('Blatt ' + b.blatt_nr + ' vom ' + isoToDe(b.datum) + ' wirklich löschen? Das kann nicht rückgängig gemacht werden.')) return;
    try {
      await db.remove('berichte', 'id=eq.' + id);
      S.archiv = S.archiv.filter(function (x) { return x.id !== id; });
      if (S.editId === id) { S.editId = null; S.editStatus = null; saveDraft(); }
      render(); toast('Blatt ' + b.blatt_nr + ' gelöscht.');
    } catch (e) { toast(errText(e), true); }
  }

  // ---------- Projekte ----------
  function projekteHTML() {
    var h = '<div class="sec-h"><h1>Projekte</h1><button class="btn red" data-act="newProjekt">+ Neues Projekt</button></div>';
    if (!S.projekte.length) h += '<div class="empty"><b>Noch keine Projekte</b>Lege dein erstes Projekt an.</div>';
    h += S.projekte.map(function (p) {
      var cur = p.id === S.pid;
      return '<div class="proj' + (cur ? ' cur' : '') + '"><div class="pt"><b>' + esc(p.name) + '</b><span>' +
        [p.bau_nr ? 'Bau-Nr. ' + esc(p.bau_nr) : '', p.ort ? esc(p.ort) : '', p.lat ? 'Wetter automatisch' : 'kein Ort – Wetter manuell'].filter(Boolean).join(' · ') + '</span></div>' +
        '<div class="row">' + (cur ? '<span class="badge ok">Ausgewählt</span>' : '<button class="btn sm" data-act="selectProjekt" data-id="' + esc(p.id) + '">Auswählen</button>') +
        '<button class="btn sm sec" data-act="editProjekt" data-id="' + esc(p.id) + '">Bearbeiten</button></div></div>';
    }).join('');
    if (S.hidden.length) {
      h += '<h2 style="font:700 20px/1.1 var(--rb-cond);margin:24px 0 10px">Ausgeblendete Projekte</h2>' + S.hidden.map(function (p) {
        return '<div class="proj"><div class="pt"><b>' + esc(p.name) + '</b><span>' + esc(p.bau_nr ? 'Bau-Nr. ' + p.bau_nr : '') + '</span></div><div class="row"><button class="btn sm sec" data-act="restoreProjekt" data-id="' + esc(p.id) + '">Wiederherstellen</button></div></div>';
      }).join('');
    }
    return h;
  }
  function projektDlg(p) {
    var neu = !p; p = p || {};
    S._geo = { lat: p.lat || null, lon: p.lon || null, id: p.id || null };
    dlg(neu ? 'Neues Projekt' : 'Projekt bearbeiten',
      '<label class="f"><span>Projektname / BVH <b>*</b></span><input type="text" id="pjName" value="' + esc(p.name) + '" required></label>' +
      '<label class="f"><span>Bau-Nr.</span><input type="text" id="pjNr" value="' + esc(p.bau_nr) + '" placeholder="z. B. 7421341"></label>' +
      '<label class="f"><span>Ort der Baustelle (für automatisches Wetter)</span><input type="search" id="pjOrt" value="' + esc(p.ort) + '" placeholder="z. B. Freising" autocomplete="off"></label>' +
      '<div class="geo" id="pjGeo" hidden></div><p class="okline" id="pjGeoOk"' + (p.lat ? '' : ' hidden') + '>Ort gefunden – das Wetter wird automatisch geladen.</p>' +
      (neu ? '' : '<div class="danger-zone"><p class="hint sm">Ausblenden: Projekt verschwindet aus der Liste, Berichte bleiben erhalten.</p><div class="row"><button type="button" class="btn sm sec" data-act="hideProjekt" data-id="' + esc(p.id) + '">Ausblenden</button><button type="button" class="btn sm danger" data-act="killProjekt" data-id="' + esc(p.id) + '">Endgültig löschen</button></div></div>'),
      '<button class="btn sec" value="close">Abbrechen</button><button class="btn red" data-act="saveProjekt" value="save">' + (neu ? 'Projekt anlegen' : 'Speichern') + '</button>');
    setTimeout(function () { var n = $('#pjName'); if (n && neu) n.focus(); }, 50);
  }
  var geoTimer = null;
  function geoSearch(q) {
    S._geo.lat = null; S._geo.lon = null; $('#pjGeoOk').hidden = true;
    clearTimeout(geoTimer);
    var box = $('#pjGeo');
    if (!q || q.length < 2) { box.hidden = true; return; }
    geoTimer = setTimeout(function () {
      fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=5&language=de').then(function (r) { return r.json(); }).then(function (d) {
        var res = d.results || [];
        box.hidden = !res.length;
        box.innerHTML = res.map(function (g) {
          return '<button type="button" data-act="geoPick" data-lat="' + g.latitude + '" data-lon="' + g.longitude + '" data-name="' + esc(g.name) + '">' + esc(g.name) + ' <small>' + esc([g.admin1, g.country].filter(Boolean).join(', ')) + '</small></button>';
        }).join('');
      }).catch(function () { box.hidden = true; });
    }, 300);
  }
  async function saveProjekt() {
    var name = $('#pjName').value.trim();
    if (!name) { $('#pjName').classList.add('miss'); $('#pjName').focus(); return; }
    var row = { name: name, bau_nr: $('#pjNr').value.trim() || null, ort: $('#pjOrt').value.trim() || null, lat: S._geo.lat, lon: S._geo.lon };
    try {
      if (S._geo.id) { await db.update('projekte', 'id=eq.' + S._geo.id, row); }
      else { row.status = 'aktiv'; var n = await db.insert('projekte', row); if (n && n.id) S.pid = n.id; }
      closeDlg();
      await loadProjekte();
      if (!S._geo.id) { await openProjekt(S.pid); location.hash = '#bericht'; toast('Projekt „' + name + '“ angelegt.'); }
      else { render(); toast('Projekt gespeichert.'); }
    } catch (e) { toast(errText(e), true); }
  }
  async function setStatus(id, status) {
    try {
      await db.update('projekte', 'id=eq.' + id, { status: status });
      closeDlg(); await loadProjekte();
      if (status === 'archiviert' && id === S.pid) await openProjekt(null); else render();
      toast(status === 'archiviert' ? 'Projekt ausgeblendet.' : 'Projekt wiederhergestellt.');
    } catch (e) { toast(errText(e), true); }
  }
  async function killProjekt(id) {
    var p = S.projekte.find(function (x) { return x.id === id; }); if (!p) return;
    var t = prompt('Projekt „' + p.name + '“ und ALLE Berichte endgültig löschen?\nDas kann nicht rückgängig gemacht werden.\n\nZum Bestätigen LÖSCHEN eingeben:');
    if (t == null) return;
    if (t.trim().toUpperCase() !== 'LÖSCHEN' && t.trim().toUpperCase() !== 'LOESCHEN') { toast('Nicht gelöscht – Eingabe stimmte nicht.', true); return; }
    try {
      await db.remove('berichte', 'projekt_id=eq.' + id);
      await db.remove('projekte', 'id=eq.' + id);
      await idb.del('draft:' + id);
      closeDlg(); S.archiv = null; await loadProjekte();
      if (id === S.pid) await openProjekt(null); else render();
      toast('Projekt gelöscht.');
    } catch (e) { toast(errText(e), true); }
  }
  function pickProjekt() {
    dlg('Projekt wählen',
      (S.projekte.length ? '<div class="plist">' + S.projekte.map(function (p) {
        return '<button type="button" data-act="selectProjekt" data-id="' + esc(p.id) + '"' + (p.id === S.pid ? ' aria-current="true"' : '') + '><span><b>' + esc(p.name) + '</b><small>' + esc([p.bau_nr ? 'Bau-Nr. ' + p.bau_nr : '', p.ort].filter(Boolean).join(' · ')) + '</small></span></button>';
      }).join('') + '</div>' : '<p>Noch keine Projekte.</p>'),
      '<button type="button" class="btn sec" data-act="gotoProjekte">Projekte verwalten</button><button type="button" class="btn red" data-act="newProjekt">+ Neues Projekt</button>');
  }
  async function selectProjekt(id) {
    closeDlg();
    if (id === S.pid) return;
    await openProjekt(id);
    if (view() === 'projekte') location.hash = '#bericht';
    toast('Projekt: ' + (projekt() ? projekt().name : ''));
  }
  function meDlg() {
    var pr = S.profil || {};
    dlg('Mein Konto',
      '<p style="margin:0 0 4px"><b>' + esc(pr.name || '') + '</b></p><p class="hint" style="margin:0 0 4px">' + esc((S.user && S.user.email) || '') + '</p>' +
      '<p class="hint">Rolle: ' + esc(pr.rolle || 'wird vom Projektleiter vergeben') + '</p>' +
      '<p class="hint sm">Das Bautagebuch hat eine eigene Anmeldung. „Abmelden“ meldet dich nur hier ab, nicht bei den Riedel-Tools.</p>',
      '<button class="btn sec" value="close">Schließen</button><button type="button" class="btn danger" data-act="logout">Vom Bautagebuch abmelden</button>');
  }

  // ---------- Dialog ----------
  function dlg(title, body, foot) {
    var d = $('#dlg');
    $('#dlgForm').innerHTML = '<div class="dh"><h2>' + esc(title) + '</h2><button class="btn ghost" value="close" aria-label="Schließen">✕</button></div><div class="db">' + body + '</div><div class="df">' + (foot || '') + '</div>';
    if (!d.open) d.showModal();
  }
  function closeDlg() { var d = $('#dlg'); if (d.open) d.close(); }

  // ---------- Ereignisse ----------
  function onKey(e) {
    // Enter in einem Dialogfeld = Hauptknopf (sonst würde der Dialog ohne Speichern schließen)
    if (e.key === 'Enter' && e.target.matches('#dlgForm input')) {
      e.preventDefault();
      var main = $('#dlgForm .df .btn.red'); if (main) main.click();
    }
  }
  function onSubmit(e) {
    if (e.target.id === 'loginForm') { e.preventDefault(); doLogin(e.target); }
  }
  function onClick(e) {
    var t = e.target.closest('[data-act],[data-chip],[data-step]');
    if (!t) return;
    if (t.dataset.chip) {
      S.form[t.dataset.chip] = t.dataset.v;
      $$('[data-chip="' + t.dataset.chip + '"]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === t)); });
      saveDraft(); updateStatus(); return;
    }
    if (t.dataset.step) {
      var path = t.dataset.step, v = Math.max(0, (+getPath(S.form, path) || 0) + (+t.dataset.d));
      setPath(S.form, path, path.indexOf('arbeitskraefte') === 0 ? (v ? String(v) : '') : v);
      var inp = t.parentNode.querySelector('input'); inp.value = v || '';
      t.parentNode.classList.toggle('on', v > 0);
      saveDraft(); updateStatus(); return;
    }
    var a = t.dataset.act;
    if (t.tagName === 'INPUT') return; // Datei-Auswahl läuft über change
    if (t.closest('#dlgForm') && !['saveProjekt', 'hideProjekt', 'killProjekt', 'geoPick', 'selectProjekt', 'gotoProjekte', 'newProjekt', 'logout', 'forceConfirm', 'fixMissing', 'dlPreview'].includes(a)) return;
    e.preventDefault();
    switch (a) {
      case 'retry': start(); break;
      case 'loginmode': renderLogin('', t.dataset.mode); break;
      case 'pickProjekt': pickProjekt(); break;
      case 'me': meDlg(); break;
      case 'logout': logout(); break;
      case 'newBericht':
        if (!S.editId && hasContent(S.form) && !confirm('Der aktuelle Bericht (Blatt ' + S.blatt + ') ist noch nicht gespeichert und wird verworfen. Neuen Bericht beginnen?')) return;
        newBericht(); break;
      case 'quick': applyQuick(); break;
      case 'dictate': dictate(); break;
      case 'fromLast': fromLast(); break;
      case 'wetter': loadWetter(false); break;
      case 'rmFoto': S.form.medien.splice(+t.dataset.i, 1); saveDraft(); render(); break;
      case 'gotoMissing': gotoMissing(); break;
      case 'preview': preview(); break;
      case 'dlPreview': if (S._previewDoc) S._previewDoc.save(pdfName(projekt().name, S.blatt, S.form.datum)); closeDlg(); break;
      case 'saveDraft': speichern(false); break;
      case 'confirm': speichern(true); break;
      case 'forceConfirm': closeDlg(); speichern(true, true); break;
      case 'fixMissing': closeDlg(); gotoMissing(); break;
      case 'reloadArchiv': loadArchiv(true); break;
      case 'zip': zipGroup(t.dataset.key); break;
      case 'pdf': var b = (S.archiv || []).find(function (x) { return x.id === t.dataset.id; }); if (b) pdfFor(b).save(pdfName(pname(b.projekt_id), b.blatt_nr, isoToDe(b.datum))); break;
      case 'edit': editBericht(t.dataset.id); break;
      case 'del': delBericht(t.dataset.id); break;
      case 'newProjekt': projektDlg(null); break;
      case 'editProjekt': projektDlg(S.projekte.find(function (p) { return p.id === t.dataset.id; })); break;
      case 'saveProjekt': saveProjekt(); break;
      case 'hideProjekt': if (confirm('Projekt ausblenden? Die Berichte bleiben erhalten, du kannst es jederzeit wiederherstellen.')) setStatus(t.dataset.id, 'archiviert'); break;
      case 'restoreProjekt': setStatus(t.dataset.id, 'aktiv'); break;
      case 'killProjekt': killProjekt(t.dataset.id); break;
      case 'geoPick':
        S._geo.lat = +t.dataset.lat; S._geo.lon = +t.dataset.lon; $('#pjOrt').value = t.dataset.name;
        $('#pjGeo').hidden = true; $('#pjGeoOk').hidden = false; break;
      case 'selectProjekt': selectProjekt(t.dataset.id); break;
      case 'gotoProjekte': closeDlg(); location.hash = '#projekte'; break;
    }
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'pjOrt') return geoSearch(t.value.trim());
    if (t.dataset.filt === 'q') { S.filt.q = t.value; LS.set('btb_filter', S.filt); clearTimeout(S._qt); S._qt = setTimeout(function () { var pos = t.selectionStart; render(); var n = $('[data-filt="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); return; }
    if (!S.form) return;
    if (t.dataset.f) { setPath(S.form, t.dataset.f, t.value); t.classList.remove('miss'); }
    else if (t.dataset.temp) { S.form[t.dataset.temp] = t.value === '' ? '' : t.value.replace(',', '.') + '°C'; t.classList.remove('miss'); }
    else if (t.dataset.num) {
      var v = Math.max(0, parseInt(t.value, 10) || 0), path = t.dataset.num;
      setPath(S.form, path, path.indexOf('arbeitskraefte') === 0 ? (v ? String(v) : '') : v);
      t.parentNode.classList.toggle('on', v > 0);
    } else return;
    saveDraft(); updateStatus();
  }
  function onChange(e) {
    var t = e.target;
    if (t.dataset.act === 'foto') { addFotos(t.files); t.value = ''; return; }
    if (t.dataset.filt && t.dataset.filt !== 'q') { S.filt[t.dataset.filt] = t.value; LS.set('btb_filter', S.filt); render(); return; }
    if (!S.form) return;
    if (t.hasAttribute('data-date')) {
      S.form.datum = isoToDe(t.value) || S.form.datum; saveDraft();
      if (projekt() && projekt().lat) loadWetter(false);
    } else if (t.dataset.az) {
      var von = $('[data-az="von"]').value || '07:00', bis = $('[data-az="bis"]').value || '16:00';
      S.form.arbeitszeit = von + ' - ' + bis + ' Uhr'; saveDraft();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
