// Service worker for my-exam.in: lets the site open offline and be installed as an app.
// - Pages (index.html, the exam pages, privacy): network first and never from the browser's short-term cache, so a new
//   upload shows on the next reload; the saved copy is used when offline, or when the network takes over 4 seconds (slow
//   mobile data). All of them are saved when the app installs.
// - School question banks (school-questions/*.json): saved the first time a subject is used, not at install, so a first
//   visit on mobile data does not download all of them (2 MB). The installed app fetches the rest in the background
//   (saveAllBanks in index.html), so it has every subject offline. Their addresses carry a content hash (?v=…), written with
//   BANK_FILES by tools/build_school_index.py; an updated bank replaces the old copy.
// - Exam papers (*/paper.json): network first, so a corrected answer key is used at once; the saved copy when offline.
// - Figures, icons, KaTeX and fonts: saved the first time they are used, refreshed in the background.
// - Analytics (GoatCounter) and the contact form are never cached.
// Change VERSION to clear old saved copies (for example after removing files).
const VERSION = 'v3';
const CACHE = 'aaexam-' + VERSION;
const BANKS = /* BANK_FILES:start */["school-questions/accountancy.json?v=51f6285fa5", "school-questions/biology.json?v=b5dacf54ed", "school-questions/business-studies.json?v=54a56aa07d", "school-questions/chemistry.json?v=30937e824a", "school-questions/computer-science.json?v=ae3cfc77d0", "school-questions/economics.json?v=e490cde89e", "school-questions/english.json?v=67e92f0cf7", "school-questions/evs.json?v=d04b22d1dd", "school-questions/geography.json?v=29deea76b6", "school-questions/hindi.json?v=3730d798b2", "school-questions/history.json?v=4665a26ead", "school-questions/mathematics.json?v=6d5468c3ae", "school-questions/physics.json?v=59b3f5746e", "school-questions/political-science.json?v=96e2b8b4d6", "school-questions/science.json?v=888a29d3b8", "school-questions/social-science.json?v=82fe0fb3b8"]/* BANK_FILES:end */;
const PAGES = ['./', 'jee-main/', 'jee-advanced/', 'neet/', 'privacy.html', 'about.html'];
const CORE = PAGES.concat(['index.html', 'pages.css', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']);
const SLOW_PAGE_MS = 4000;

// a bank file's address without its ?v= hash: only one copy of each bank is kept
const bankPath = url => { const u = new URL(url, self.location); return u.pathname.indexOf('/school-questions/') >= 0 ? u.pathname : null; };
const dropOldBanks = (c, keep) => c.keys().then(reqs => Promise.all(reqs.filter(r => { const p = bankPath(r.url); return p && p === bankPath(keep) && r.url !== new URL(keep, self.location).href; }).map(r => c.delete(r))));

self.addEventListener('install', e => {
  // banks saved by an earlier version are kept, except copies an updated bank replaces
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
    const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {})); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));  // a slow page still replaces the saved copy when it arrives
    e.respondWith(caches.match(key).then(hit => {
      if (!hit) return net.catch(() => Response.error());
      return Promise.race([net.catch(() => hit), new Promise(r => setTimeout(() => r(hit), SLOW_PAGE_MS))]);
    }));
    return;
  }

  if (same && url.pathname.endsWith('/paper.json')) {
    e.respondWith(fetch(new Request(req, { cache: 'no-cache' })).then(res => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || Response.error())));
    return;
  }

  // everything else: saved copy at once, refreshed in the background (our own files skip the browser's 10-minute cache)
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const fresh = fetch(same ? new Request(req, { cache: 'no-cache' }) : req).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        // a copy that cannot be saved (storage full) must not lose the response itself
        return c.put(req, copy).then(() => bankPath(req.url) ? dropOldBanks(c, req.url) : null).catch(() => {}).then(() => res);
      }
      return res;
    }).catch(() => hit);
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  })));
});
