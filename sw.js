// Tablou BTC — service worker: aplicația merge și fără internet, cu ultimele date salvate.
const VERSIUNE = 'tablou-btc-v2';
const DATE = 'tablou-btc-date';
const FONTURI = 'tablou-btc-fonturi';
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIUNE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => ![VERSIUNE, DATE, FONTURI].includes(x)).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin === location.origin && u.pathname.endsWith('/tablou.json')) e.respondWith(date(e.request));
  else if (u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com') e.respondWith(cacheIntai(e.request));
  else if (u.origin === location.origin) e.respondWith(reteaApoiCache(e.request));
});

async function date(req) { // întâi rețeaua; fără internet, ultima copie salvată
  const c = await caches.open(DATE);
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (r.ok) await c.put('tablou.json', r.clone());
    return r;
  } catch (err) {
    const v = await c.match('tablou.json');
    if (!v) throw err;
    const h = new Headers(v.headers);
    h.set('x-din-cache', '1');
    return new Response(await v.blob(), { status: 200, headers: h });
  }
}
async function reteaApoiCache(req) {
  const c = await caches.open(VERSIUNE);
  try {
    const r = await fetch(req);
    if (r.ok) await c.put(req, r.clone());
    return r;
  } catch (err) {
    const v = (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('./index.html') : null);
    if (v) return v;
    throw err;
  }
}
async function cacheIntai(req) {
  const c = await caches.open(FONTURI);
  const v = await c.match(req);
  if (v) return v;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') await c.put(req, r.clone());
  return r;
}
