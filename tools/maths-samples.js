// Runs the app's own Mathematics question generators with a fixed seed and writes a few questions per Class XI and XII
// chapter (text, answers, worked solution) into #out as JSON, for tools/build_pages.py to show on the chapter pages.
(function () {
  const PER_CHAPTER = 6, CLASSES = ['XI', 'XII'];
  const out = document.getElementById('out');
  async function run() {
    const frame = document.getElementById('app');
    let A = null;
    for (let i = 0; i < 100 && !A; i++) { await new Promise(r => setTimeout(r, 100)); A = frame.contentWindow && frame.contentWindow.__aaTest; }
    if (!A) { out.textContent = 'ERROR: the site did not load with ?test'; return; }
    await A.ensureBank('Mathematics');
    // the same seed every run, so the pages change only when the generators change
    let s = 20261101;
    frame.contentWindow.Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const result = {};
    for (const cls of CLASSES) {
      result[cls] = {};
      for (const topic of A.topicsFor('Mathematics', cls)) {
        const gens = A.T.filter(t => t.cls === cls && t.topic === topic && (!t.bank || t.subj === 'Mathematics'));
        const items = [], seen = new Set();
        for (let k = 0; items.length < PER_CHAPTER && k < PER_CHAPTER * 4 && gens.length; k++) {
          const t = gens[k % gens.length];
          let q;
          try { q = t.gen(); } catch (e) { continue; }
          if (seen.has(q.text)) continue;
          seen.add(q.text);
          items.push({ level: t.level, q: q.text, parts: q.parts.map(p => ({ q: p.q || '', ans: String(A.answerText(p)) })), sol: q.sol || '' });
        }
        result[cls][topic] = items;
      }
    }
    out.textContent = JSON.stringify(result);
  }
  run().catch(e => { out.textContent = 'ERROR: ' + (e && e.stack || e); });
})();
