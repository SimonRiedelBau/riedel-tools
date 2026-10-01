// Riedel-Tools App (Service Worker)
// Ziel: Die App ist immer auf dem aktuellen Stand. Deshalb gilt „Netz zuerst“:
// Jede Seite und jede Datei wird bei bestehender Verbindung frisch vom Server geholt
// (der Browser fragt per ETag nur nach, ob sich etwas geändert hat – das geht schnell).
// Die Kopie im Zwischenspeicher wird nur benutzt, wenn kein Netz da ist (z. B. im Keller).
// Datenbank (Supabase) und fremde Server werden nicht angefasst.
const CACHE = 'riedel-tools-v1';
const START = new URL('./', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add(new Request(START, { cache: 'no-cache' }))).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('riedel-tools-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function offlinePage() {
  return new Response(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Riedel-Tools – offline</title><body style="margin:0;font:16px/1.5 system-ui,sans-serif;background:#ECEDEB;color:#1D2124;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box">
<div style="max-width:420px"><div style="width:56px;height:56px;background:#FF0000;color:#fff;display:grid;place-items:center;font-weight:700">RB</div>
<h1 style="font-size:24px;margin:16px 0 4px">Keine Internetverbindung</h1>
<p style="color:#5F666B;margin:0 0 16px">Diese Seite wurde noch nicht auf dem Gerät gespeichert. Bitte Verbindung prüfen und erneut versuchen.</p>
<button onclick="location.reload()" style="font:600 15px system-ui;padding:12px 18px;border:0;background:#1D2124;color:#fff">Erneut versuchen</button></div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(self.registration.scope)) return;

  e.respondWith((async () => {
    try {
      // 'no-cache' = immer beim Server nachfragen, nie eine alte Browser-Kopie ungeprüft nehmen
      const fresh = await fetch(req.mode === 'navigate'
        ? new Request(req.url, { cache: 'no-cache', credentials: 'include' })
        : new Request(req, { cache: 'no-cache' }));
      if (fresh.ok && fresh.type === 'basic') {
        const copy = fresh.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
      }
      return fresh;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return offlinePage();
      throw err;
    }
  })());
});
