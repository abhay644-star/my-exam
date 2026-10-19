// Service worker for my-exam.in: lets the site open offline and be installed as an app.
// - The page (index.html): network first, so new uploads show at once; the saved copy is used when offline.
// - Exam papers, figures, icons, KaTeX and fonts: served from the saved copy, refreshed in the background.
// - Analytics (GoatCounter) and the contact form are never cached.
// Change VERSION to clear old saved copies (for example after removing files).
const VERSION = 'v1';
const CACHE = 'aaexam-' + VERSION;
const CORE = ['./', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('aaexam-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !CDN.test(req.url)) return;          // GoatCounter, FormSubmit, WhatsApp: straight to the network

  const home = same && /\/(index\.html)?$/.test(url.pathname);
  if (req.mode === 'navigate' && home) {            // the page itself: network first
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
      return res;
    }).catch(() => caches.match('index.html')));
    return;
  }
  if (req.mode === 'navigate') return;              // any other page (none today): no offline copy

  // everything else: saved copy at once, refreshed in the background
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const fresh = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  })));
});
