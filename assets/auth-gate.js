// Zugangssperre für alle Riedel-Tools.
// Im <head> jeder Tool-Seite einbinden: <script src="../assets/auth-gate.js"></script>
// Die Seite bleibt unsichtbar, bis feststeht, dass die Person angemeldet und in tools_zugang
// freigeschaltet ist. Sonst geht es zur Startseite (Anmeldung) und danach zurück zum Tool.
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

  function toStart() {
    var next = location.pathname + location.search + location.hash;
    location.replace(root + '?next=' + encodeURIComponent(next));
  }
  function show() { hide.remove(); }

  function check() {
    if (!window.supabase) return toStart();
    var sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: CFG.storageKey }
    });
    sb.auth.getSession().then(function (r) {
      if (!r.data || !r.data.session) return toStart();
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
