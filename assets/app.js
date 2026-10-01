// Riedel-Tools als App (PWA) – wird auf der Startseite und über assets/auth-gate.js auf jeder Tool-Seite geladen.
// - meldet den Service Worker (sw.js) an: Seiten kommen immer frisch vom Server, offline aus dem Zwischenspeicher
// - ergänzt App-Symbol (Riedel-Logo), Manifest und iOS-Angaben, damit „Zum Home-Bildschirm“ überall die App anlegt
// - stellt window.RiedelApp bereit (Installieren-Hinweis auf der Startseite)
(function () {
  'use strict';
  if (window.RiedelApp) return;
  var me = document.currentScript;
  var root = new URL('../', me.src).href; // assets/ liegt direkt unter der Startseite
  var head = document.head;

  function add(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    head.appendChild(el);
    return el;
  }
  // Tools mit eigenem Manifest (z. B. Bautagebuch) behalten es
  if (!document.querySelector('link[rel="manifest"]')) add('link', { rel: 'manifest', href: root + 'manifest.webmanifest' });
  if (!document.querySelector('link[rel="apple-touch-icon"]')) add('link', { rel: 'apple-touch-icon', href: root + 'assets/icons/apple-touch-icon.png' });
  if (!document.querySelector('link[rel~="icon"]')) add('link', { rel: 'icon', type: 'image/png', href: root + 'assets/icons/favicon-32.png' });
  if (!document.querySelector('meta[name="theme-color"]')) {
    add('meta', { name: 'theme-color', content: '#F8F8F6', media: '(prefers-color-scheme: light)' });
    add('meta', { name: 'theme-color', content: '#1E2225', media: '(prefers-color-scheme: dark)' });
  }
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Riedel-Tools' });
  }

  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('rb-standalone');

  // ---------- Service Worker ----------
  var secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register(root + 'sw.js', { scope: root, updateViaCache: 'none' }).then(function (reg) {
      // Beim Zurückkehren in die App nach einer neuen Version des Service Workers schauen
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') reg.update().catch(function () {});
      });
    }).catch(function () {});
  }

  // ---------- Installieren ----------
  var deferred = null, listeners = [];
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    listeners.forEach(function (f) { f(); });
  });
  window.addEventListener('appinstalled', function () { deferred = null; listeners.forEach(function (f) { f(); }); });

  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS meldet sich als Mac
  var iosSafari = ios && !/CriOS|FxiOS|EdgiOS/.test(ua);

  window.RiedelApp = {
    root: root,
    standalone: standalone,
    ios: ios,
    iosSafari: iosSafari,
    canPrompt: function () { return !!deferred; },
    onChange: function (f) { listeners.push(f); },
    install: function () {
      if (!deferred) return Promise.resolve(false);
      var d = deferred; deferred = null;
      d.prompt();
      return d.userChoice.then(function (c) { listeners.forEach(function (f) { f(); }); return c && c.outcome === 'accepted'; });
    }
  };
})();
