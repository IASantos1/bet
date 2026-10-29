// The installed app's service worker: what makes Bet62 installable on Android and iOS, and opens it
// without a connection. Only the app's own shell is kept: the page (always fetched first, the copy
// only without a network) and its versioned scripts and styles (?v=…, never changing). Odds, the
// account, the casino and everything under /api always go to the server, untouched.

const CACHE = 'bet62-shell-v1';
const SHELL = ['/', '/manifest.json', '/icon-192.png?v=2', '/icon-512.png?v=2'];
const SKIP = /^\/(api|ws|admin|administrador|casino|media|r)(\/|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// A versioned file replaces its older versions (same path, another ?v=), so the cache stays small.
async function keep(req, res) {
  const c = await caches.open(CACHE);
  const url = new URL(req.url);
  for (const old of await c.keys()) {
    const o = new URL(old.url);
    if (o.pathname === url.pathname && o.search !== url.search) await c.delete(old);
  }
  await c.put(req, res);
}

const OFFLINE = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bet62</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1a1f24;color:#fff;font-family:system-ui,sans-serif;text-align:center">
<div><p style="font-size:28px;font-weight:900;margin:0">BET<span style="color:#7cff6b">62</span></p><p>Sem ligação à internet.</p><p style="opacity:.7">Volte a tentar quando estiver ligado.</p></div></body></html>`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  // The page: from the server; its last copy (or a short note) only when there is no network.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname === '/') { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put('/', copy))); }
      return res;
    }).catch(async () => (await caches.match('/')) || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  // Scripts and styles with ?v=: the same URL never changes, so the copy is good once kept.
  if (url.searchParams.has('v') && /\.(js|css|png|svg|json)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(keep(req, copy)); }
      return res;
    })));
  }
});

// A notification from the site (server/push.js): shown in the phone's own style, with the Bet62 icon,
// the big picture where the phone shows one (Android) and a vibration where it allows one.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: 'Bet62', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Bet62', {
    body: m.body || '', icon: '/icon-192.png?v=2', badge: '/icon-192.png?v=2', image: m.image || undefined,
    tag: m.tag || undefined, renotify: !!m.tag, vibrate: [120, 60, 120, 60, 320],
    data: { url: m.url || '/' }, actions: m.kind === 'win' ? [{ action: 'open', title: 'Ver aposta' }] : [],
  }));
});

// A tap on it: the app open already comes to the front on that page, else it opens there.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) return open.focus().then((c) => c?.navigate?.(url)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
