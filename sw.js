// Service worker for my-exam.in: lets the site open offline and be installed as an app.
// - Pages (index.html, the exam pages, privacy): network first and never from the browser's short-term cache, so a new
//   upload shows on the next reload; the saved copy is used when offline. All of them are saved when the app installs.
// - School question banks (banks/*.json): saved when the app installs, so school papers work offline from the start.
//   Their addresses carry a content hash (?v=…), written with BANK_FILES by tools/build_bank_index.py; an updated bank
//   replaces the old copy.
// - Exam papers, figures, icons, KaTeX and fonts: saved the first time they are used, refreshed in the background.
// - Analytics (GoatCounter) and the contact form are never cached.
// Change VERSION to clear old saved copies (for example after removing files).
const VERSION = 'v3';
const CACHE = 'aaexam-' + VERSION;
const BANKS = /* BANK_FILES:start */["banks/accountancy.json?v=05e96f673d", "banks/biology.json?v=41d326b9e0", "banks/business-studies.json?v=cebce1ef19", "banks/chemistry.json?v=23b2d98280", "banks/computer-science.json?v=9d5d74708f", "banks/economics.json?v=ab4514afd4", "banks/english.json?v=a26b1c0140", "banks/evs.json?v=366f92af80", "banks/geography.json?v=a28656d3d7", "banks/hindi.json?v=5ab41006a4", "banks/history.json?v=e6593ad61d", "banks/mathematics.json?v=8d8569f0cf", "banks/physics.json?v=26e70e58dc", "banks/political-science.json?v=c3b278d3a5", "banks/science.json?v=9b25f4851a", "banks/social-science.json?v=1c80223e8b"]/* BANK_FILES:end */;
const PAGES = ['./', 'jee-main/', 'jee-advanced/', 'neet/', 'privacy.html'];
const CORE = PAGES.concat(['index.html', 'pages.css', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'], BANKS);

// a bank file's address without its ?v= hash: only one copy of each bank is kept
const bankPath = url => { const u = new URL(url, self.location); return u.pathname.indexOf('/banks/') >= 0 ? u.pathname : null; };
const dropOldBanks = (c, keep) => c.keys().then(reqs => Promise.all(reqs.filter(r => { const p = bankPath(r.url); return p && p === bankPath(keep) && r.url !== new URL(keep, self.location).href; }).map(r => c.delete(r))));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).then(() => Promise.all(BANKS.map(b => dropOldBanks(c, b))))).then(() => self.skipWaiting()));
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

  if (req.mode === 'navigate') {
    if (!same) return;
    // pages: network first, always asking the server for a newer copy; saved under the address without ?query
    // (the home page under index.html, as installed)
    const home = url.pathname === '/' || url.pathname === '/index.html';
    const key = home ? 'index.html' : url.origin + url.pathname;
    e.respondWith(fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy))); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || Response.error())));
    return;
  }

  // everything else: saved copy at once, refreshed in the background (our own files skip the browser's 10-minute cache,
  // so a corrected paper.json is picked up on the next visit)
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const fresh = fetch(same ? new Request(req, { cache: 'no-cache' }) : req).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        return c.put(req, copy).then(() => bankPath(req.url) ? dropOldBanks(c, req.url) : null).then(() => res);
      }
      return res;
    }).catch(() => hit);
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  })));
});
