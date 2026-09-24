// Zugangssperre und gemeinsamer Rahmen für alle Riedel-Tools.
// Im <head> jeder Tool-Seite einbinden: <script src="../assets/auth-gate.js"></script>
// - Die Seite bleibt unsichtbar, bis feststeht, dass die Person angemeldet und in tools_zugang
//   freigeschaltet ist. Sonst geht es zur Startseite (Anmeldung) und danach zurück zum Tool.
// - Lädt assets/riedel.css (Farben, Schriften) und setzt oben die Leiste „← Riedel-Tools“ ein.
//   Name in der Leiste: <meta name="rb-tool" content="…">, sonst der Seitentitel.
(function () {
  'use strict';
  var CFG = window.RIEDEL_AUTH = {
    url: 'https://sazhfayopozqcluvmqqu.supabase.co', // Supabase-Projekt riedel-stahllisten
    key: 'sb_publishable_ZXiMVG3_xnblRTtMfJuJtA_kDgPuFLU',
    storageKey: 'riedel-auth' // gemeinsame Anmeldung für Startseite, Doka und Stahllisten
  };
  var me = document.currentScript;
  var root = new URL('../', me.src).href; // assets/ liegt direkt unter der Startseite
  var hide = document.createElement('style');
  hide.textContent = 'html{visibility:hidden!important}';
  document.head.appendChild(hide);

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('riedel.css', me.src).href;
  var cssReady = new Promise(function (res) { css.onload = css.onerror = res; setTimeout(res, 3000); });
  document.head.appendChild(css);

  var sb = null, session = null;
  function toStart() {
    var next = location.pathname + location.search + location.hash;
    location.replace(root + '?next=' + encodeURIComponent(next));
  }
  function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function bar() {
    if (document.querySelector('.rb-bar')) return;
    var m = document.querySelector('meta[name="rb-tool"]');
    var name = m ? m.content : document.title;
    var el = document.createElement('div'); // kein <nav>, damit Tag-Regeln der Tools nicht greifen
    el.className = 'rb-bar';
    el.setAttribute('role', 'navigation');
    el.setAttribute('aria-label', 'Riedel-Tools');
    el.innerHTML = '<a class="rb-home" href="' + esc(root) + '" title="Zurück zur Übersicht">' +
      '<img class="rb-logo" alt="" src="' + esc(root) + 'assets/logo-riedel.png">' +
      '<span class="rb-back">← Riedel-Tools</span></a>' +
      '<span class="rb-sep" aria-hidden="true">/</span><span class="rb-tool">' + esc(name) + '</span>' +
      '<span class="rb-right"><span class="rb-who">' + esc(session && session.user && session.user.email) + '</span>' +
      '<button class="rb-out" type="button">Abmelden</button></span>';
    el.querySelector('.rb-logo').onerror = function () {
      var s = document.createElement('span'); s.className = 'rb-mark'; s.textContent = 'RB'; this.replaceWith(s);
    };
    el.querySelector('.rb-out').onclick = function () {
      this.disabled = true;
      sb.auth.signOut().then(toStart, toStart);
    };
    // Vor <body> statt darin: so bleibt die Leiste unabhängig vom Layout des Tools (Ränder, Flexbox, Seitenleisten)
    document.documentElement.insertBefore(el, document.body);
  }
  function show() {
    var go = function () { bar(); cssReady.then(function () { hide.remove(); }); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  function check() {
    if (!window.supabase) return toStart();
    sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: CFG.storageKey }
    });
    sb.auth.getSession().then(function (r) {
      session = r.data && r.data.session;
      if (!session) return toStart();
      return sb.rpc('tools_berechtigt').then(function (res) {
        if (res.error || res.data !== true) return toStart();
        show();
        sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') toStart(); });
      });
    }).catch(toStart);
  }

  if (window.supabase) return check();
  var s = document.createElement('script');
  s.src = new URL('vendor/supabase.js', me.src).href;
  s.onload = check;
  s.onerror = toStart;
  document.head.appendChild(s);
})();
