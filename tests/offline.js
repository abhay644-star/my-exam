// Offline tests: install the service worker and check what it saves, and when.
(async function () {
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : (detail || '') });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch (e) {} await sleep(100); } return false; };
  const saved = async () => { const c = await caches.open(CACHE); return (await c.keys()).map(r => new URL(r.url).pathname + new URL(r.url).search); };
  let CACHE = '';
  try {
    const src = await (await fetch('../sw.js')).text();
    CACHE = 'aaexam-' + src.match(/const VERSION = '([^']+)'/)[1];
    const banks = JSON.parse(src.match(/BANK_FILES:start \*\/(.*?)\/\* BANK_FILES:end/)[1]);

    const reg = await navigator.serviceWorker.register('../sw.js');
    const sw = reg.installing || reg.waiting || reg.active;
    // an install that fails (a file in CORE missing) leaves "ready" waiting for ever, so watch the worker's state instead
    const state = await new Promise(res => { if (sw.state === 'activated' || sw.state === 'redundant') return res(sw.state);
      sw.addEventListener('statechange', () => { if (sw.state === 'activated' || sw.state === 'redundant') res(sw.state); }); });
    ok('the service worker installs', state === 'activated', 'state: ' + state);
    const controlled = await until(() => navigator.serviceWorker.controller);
    ok('the service worker installs and controls the page', controlled);

    const atInstall = await saved();
    ok('install saves the pages and the app', ['/', '/index.html', '/jee-main/', '/privacy.html', '/pages.css'].every(p => atInstall.includes(p)), atInstall.join(', '));
    ok('install does not download the question banks', !atInstall.some(p => p.startsWith('/school-questions/')), atInstall.filter(p => p.startsWith('/school-questions/')).join(', '));

    // a bank is saved the first time it is used
    const bank = '/' + banks[0];
    const r = await fetch(bank);
    ok('a question bank loads through the service worker', r.ok && Array.isArray((await r.json()).questions));
    ok('a question bank is saved the first time it is used', await until(async () => (await saved()).includes(bank)), bank);

    // exam papers come from the network and are kept for offline use
    const paper = '/jee/2026-04-02-s1/paper.json';
    const pr = await fetch(paper, { cache: 'no-cache' });
    ok('an exam paper loads through the service worker', pr.ok && Array.isArray((await pr.json()).questions));
    ok('an exam paper is saved for offline use', await until(async () => (await saved()).includes(paper)), paper);

    // the installed app saves every bank in the background (the app calls this when installed and when opened as the app)
    const frame = document.createElement('iframe'); frame.title = 'App'; document.body.appendChild(frame);
    frame.src = '../index.html?test';
    await until(() => frame.contentWindow.__aaTest, 15000);
    await frame.contentWindow.__aaTest.saveAllBanks();
    const all = await saved(), missing = banks.map(b => '/' + b).filter(b => !all.includes(b));
    ok('the installed app saves every question bank', !missing.length, 'missing: ' + missing.join(', '));
  } catch (e) {
    ok('the tests ran without errors', false, String(e && e.stack || e));
  }

  const failed = results.filter(r => !r.pass).length, s = document.getElementById('summary');
  s.textContent = failed ? `FAIL: ${failed} of ${results.length} checks failed` : `PASS: all ${results.length} checks passed`;
  s.className = failed ? 'fail' : 'pass';
  document.getElementById('list').innerHTML = results.map(r => `<li class="${r.pass ? 'pass' : 'fail'}">${r.name}${r.detail ? `<small>${r.detail.replace(/</g, '&lt;')}</small>` : ''}</li>`).join('');
})();
