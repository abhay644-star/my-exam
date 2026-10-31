// Tests for answer checking and marking. The site runs in the iframe with ?test, which exposes window.__aaTest.
(function () {
  'use strict';
  const results = [];
  const show = v => JSON.stringify(v);
  function ok(group, name, cond, detail) { results.push({ group, name, pass: !!cond, detail: cond ? '' : (detail || '') }); }
  function eq(group, name, got, want) { ok(group, name, show(got) === show(want), `got ${show(got)}, expected ${show(want)}`); }
  function near(group, name, got, want) { ok(group, name, got != null && Math.abs(got - want) < 1e-9 * Math.max(1, Math.abs(want)), `got ${show(got)}, expected ${want}`); }

  // ---------- typed numbers ----------
  function parsing(A) {
    const g = 'Reading typed numbers';
    [['4 1/5', 4.2], ['21/5', 4.2], ['−1/6', -1 / 6], ['2^4', 16], ['3.84 × 10^5', 384000], ['3.84 x 10^5', 384000],
     ['₹1,250', 1250], ['12 cm', 12], ['45°', 45], ['0.375', 0.375]].forEach(([s, v]) => near(g, `"${s}" reads as ${v}`, A.parseNum(s), v));
    eq(g, 'an empty box reads as nothing', A.parseNum(''), null);
    eq(g, 'words read as nothing', A.parseNum('abc'), null);
  }

  // ---------- one answer part ----------
  function checking(A) {
    const g = 'Checking one answer';
    const cases = [
      ['whole-number key 12', { type: 'num', ans: 12, ansText: '12' }, { '12': true, '12.0': true, '12 cm': true, '12.1': false, '': false }],
      ['exact decimal key 7.73', { type: 'num', ans: 7.73, ansText: '7.73' }, { '7.73': true, '7.730': true, '7.74': false, '7.7': false }],
      ['non-terminating key 1/3', { type: 'num', ans: 1 / 3, ansText: '1/3' }, { '1/3': true, '0.33': true, '0.333': true, '0.3': false, '0.34': false }],
      ['range key 0.72 to 0.76', { type: 'num', ans: 0.72, lo: 0.72, hi: 0.76, ansText: '0.72 to 0.76' }, { '0.72': true, '0.74': true, '0.76': true, '0.71': false, '0.77': false }],
      ['single option, key (c)', { type: 'choice', ans: 2, options: ['p', 'q', 'r', 's'] }, { '2': true, '1': false, '': false }],
      ['single option, key accepts (b) or (c)', { type: 'choice', ans: 1, accept: [1, 2], options: ['p', 'q', 'r', 's'] }, { '1': true, '2': true, '3': false }],
      ['one or more options, key (a)(c)', { type: 'multi', ans: [0, 2], options: ['p', 'q', 'r', 's'] }, { '0,2': true, '2,0': true, '0': false, '0,1,2': false }],
      ['one or more options, key also accepts (d)', { type: 'multi', ans: [0, 2], alts: [[3]], options: ['p', 'q', 'r', 's'] }, { '3': true, '0,2': true, '1': false }],
      ['typed word, small slips allowed', { type: 'text', alts: ['photosynthesis'], fuzzy: true, wrong: [] }, { 'Photosynthesis.': true, 'the photosynthesis': true, 'photosynthesys': true, 'respiration': false }],
      ['typed word, English: spelling exact', { type: 'text', alts: ['photosynthesis'], fuzzy: false, wrong: [] }, { 'PHOTOSYNTHESIS': true, 'photosynthesys': false }],
      ['typed word, a listed wrong option is never a slip', { type: 'text', alts: ['cation'], fuzzy: true, wrong: ['cations'] }, { 'cation': true, 'cations': false }],
      ['typed word, alternative answers', { type: 'text', alts: ['New Delhi', 'Delhi'], fuzzy: true, wrong: [] }, { 'new delhi': true, 'Delhi': true, 'Mumbai': false }],
    ];
    cases.forEach(([name, part, inputs]) => Object.keys(inputs).forEach(v =>
      eq(g, `${name}: "${v}" is ${inputs[v] ? 'right' : 'wrong'}`, A.checkPart(part, v), inputs[v])));
  }

  // ---------- marking rules for exam questions ----------
  const opts = ['p', 'q', 'r', 's'];
  const RULES = { questions: [
    { no: 1, subject: 'Physics', section: 'A', type: 'mcq', text: 'single option, +4 / -1', options: opts, answer: 1, sol: '' },
    { no: 2, subject: 'Physics', section: 'B', type: 'num', text: 'number, +4 / -1', answer: 5, sol: '' },
    { no: 3, subject: 'Physics', section: 'B', type: 'num', text: 'number range, no negative', answer: { lo: 0.72, hi: 0.76 }, neg: 0, sol: '' },
    { no: 4, subject: 'Physics', section: 'A', type: 'mcq', text: 'dropped question', options: opts, answer: 0, dropped: true, sol: '' },
    { no: 5, subject: 'Physics', section: 'C', type: 'multi', text: 'one or more correct, -2', options: opts, answer: [0, 1, 2], neg: 2, sol: '' },
    { no: 6, subject: 'Physics', section: 'A', type: 'mcq', text: 'key accepts (a) or (c)', options: opts, answer: 0, accept: [0, 2], sol: '' },
    { no: 7, subject: 'Physics', section: 'D', type: 'mcq', text: 'single option, +3 / -1', options: opts, answer: 3, full: 3, sol: '' },
  ] };
  const answers = list => { const a = {}; list.forEach((v, i) => { a[i + '-0'] = v; }); return a; };
  function rules(A) {
    const g = 'Marking rules';
    const mark = list => A.markPaper(A.examQs(RULES, 'fig/'), answers(list));
    eq(g, 'all right: full marks, dropped question full marks', mark(['1', '5', '0.74', '', '0,1,2', '2', '3']), [4, 4, 4, 4, 4, 4, 3]);
    eq(g, 'all blank: 0 each, dropped question still full marks', mark(['', '', '', '', '', '', '']), [0, 0, 0, 4, 0, 0, 0]);
    eq(g, 'all wrong: minus the negative mark (none for the range question), dropped question full marks', mark(['0', '6', '0.9', '1', '3', '1', '0']), [-1, -1, 0, 4, -2, -1, -1]);
    eq(g, '"5.0" for a key of 5 is right', mark(['', '5.0'])[1], 4);
    eq(g, '"5.4" for a key of 5 is wrong', mark(['', '5.4'])[1], -1);
    const multi = v => mark(['', '', '', '', v])[4];
    eq(g, 'one or more: 2 of 3 correct options, no wrong one = +2', multi('0,1'), 2);
    eq(g, 'one or more: 1 of 3 correct options, no wrong one = +1', multi('2'), 1);
    eq(g, 'one or more: a correct and a wrong option = negative mark', multi('0,3'), -2);
    eq(g, 'one or more: all correct options plus a wrong one = negative mark', multi('0,1,2,3'), -2);

    // school questions: marks split across parts by weight, no negative marks
    const q = { marks: 3, parts: [{ type: 'num', ans: 12, ansText: '12', w: 1 }, { type: 'num', ans: 5, ansText: '5', w: 2 }] };
    A.partMarks(q, 3);
    eq(g, 'school question: 3 marks split 1 + 2 by weight', q.parts.map(p => p.marks), [1, 2]);
    const school = (a, b) => A.markPaper([JSON.parse(JSON.stringify(q))], { '0-0': a, '0-1': b })[0];
    eq(g, 'school question: both parts right = 3', school('12', '5'), 3);
    eq(g, 'school question: first part only = 1', school('12', '4'), 1);
    eq(g, 'school question: second part only = 2', school('', '5'), 2);
    eq(g, 'school question: both wrong = 0, never negative', school('1', '1'), 0);
    const odd = { marks: 5, parts: [{ w: 1 }, { w: 1 }, { w: 1 }] };
    A.partMarks(odd, 5);
    eq(g, 'school question: part marks always add up to the question total (5 over 3 parts)', odd.parts.reduce((s, p) => s + p.marks, 0), 5);
  }

  // ---------- option labels kept in My mistakes ----------
  function labels(A) {
    const g = 'Option labels in My mistakes';
    const neet = A.examQs({ optLabels: '1234', questions: [{ no: 1, subject: 'Biology', section: 'A', type: 'mcq', text: 'x', options: opts, answer: 1, sol: '' }] }, 'fig/')[0];
    const saved = A.withPaper({ exam: { optLabels: '1234' } }, () => A.cleanQ(neet));
    eq(g, 'a NEET question keeps the labels 1234', saved.ol, '1234');
    eq(g, 'its answer still shows as (2) in a revision paper', A.withPaper({}, () => A.answerText(saved.parts[0])), '(2) q');
    const jee = A.examQs({ questions: [{ no: 1, subject: 'Physics', section: 'A', type: 'mcq', text: 'x', options: opts, answer: 1, sol: '' }] }, 'fig/')[0];
    const saved2 = A.withPaper({ exam: { optLabels: null } }, () => A.cleanQ(jee));
    eq(g, 'a JEE question shows as (b)', A.withPaper({}, () => A.answerText(saved2.parts[0])), '(b) q');
  }

  // ---------- the official papers ----------
  const PAPERS = [
    ['JEE Main 2026, 2 April Shift 1', '../jee/2026-04-02-s1/', 75, 300],
    ['NEET (UG) 2026 re-exam, code 50', '../neet/2026-reexam-50/', 180, 720],
    ['JEE Advanced 2026 Paper 1', '../jee-adv/2026-p1/', 48, 180],
    ['JEE Advanced 2026 Paper 2', '../jee-adv/2026-p2/', 54, 180],
  ];
  const keyOf = p => p.type === 'choice' ? String(p.ans) : p.type === 'multi' ? p.ans.join(',') : p.lo != null ? String(p.lo) : String(p.ans);
  function wrongOf(p) {
    if (p.type === 'num') return String((p.hi != null ? p.hi : p.ans) + 1000);
    const bad = p.options.map((o, j) => j).filter(j => p.type === 'choice' ? j !== p.ans && !(p.accept || []).includes(j)
      : !p.ans.includes(j) && !(p.alts || []).some(s => s.length === 1 && s[0] === j));
    return String(bad[0]);
  }
  async function papers(A) {
    const listed = Object.values(A.EXAM_PAGES).flatMap(p => p.papers);
    eq('Official papers', 'every paper offered on the site is in this test list (add new papers to PAPERS)',
      listed.map(m => '../' + m.path).filter(p => !PAPERS.some(x => x[1] === p)), []);
    eq('Official papers', 'start buttons read "3-hour" and "3 h 15 min"', [A.durLabel(180), A.durLabel(195)], ['3-hour', '3 h 15 min']);
    for (const [name, path, n, total] of PAPERS) {
      const g = 'Official paper: ' + name;
      let data;
      try { const r = await fetch(path + 'paper.json'); data = await r.json(); } catch (e) { ok(g, 'paper.json loads', false, String(e)); continue; }
      const meta = listed.find(m => '../' + m.path === path);
      eq(g, 'the start button shows the paper\'s real length', meta && meta.min, data.duration || 180);
      const qs = A.examQs(data, path + 'fig/');
      eq(g, 'number of questions', qs.length, n);
      eq(g, 'maximum marks', qs.reduce((s, q) => s + q.marks, 0), total);
      const badKey = qs.filter(q => q.parts.some(p => (p.type === 'choice' && !(p.ans >= 0 && p.ans < p.options.length))
        || (p.type === 'multi' && !(p.ans.length && p.ans.every(j => j >= 0 && j < p.options.length)))
        || (p.type === 'num' && !(isFinite(p.ans) && (p.lo == null || p.lo <= p.hi))))).map(q => q.no);
      eq(g, 'every answer key points to a real option or number', badKey, []);
      const sum = got => +got.reduce((s, x) => s + x, 0).toFixed(2);
      const all = f => { const a = {}; qs.forEach((q, i) => { a[i + '-0'] = f(q.parts[0]); }); return a; };
      const fresh = () => A.examQs(data, path + 'fig/');
      const full = A.markPaper(fresh(), all(keyOf));
      eq(g, 'answering every question with its key gives full marks', sum(full), total);
      eq(g, '...and no question loses marks', fresh().map((q, i) => q.marks - full[i] > 1e-9 ? q.no : null).filter(x => x != null), []);
      eq(g, 'leaving every question blank scores only the dropped questions', sum(A.markPaper(fresh(), all(() => ''))), sum(qs.map(q => q.dropped ? q.marks : 0)));
      eq(g, 'answering every question wrongly scores the negative marks', sum(A.markPaper(fresh(), all(wrongOf))), sum(qs.map(q => q.dropped ? q.marks : -q.neg)));
    }
  }

  // ---------- the school question banks ----------
  // what a student would type for a stored key: tags dropped, entities as shown (&lt;h1&gt; is typed as <h1>)
  const plain = s => { const t = document.createElement('textarea'); t.innerHTML = String(s).replace(/<[^>]+>/g, ''); return t.value; };
  async function banks(A) {
    const g = 'School question banks';
    let total = 0;
    for (const subj of Object.keys(A.BANK_INDEX)) {
      try { await A.ensureBank(subj); } catch (e) { ok(g, `${subj}: bank file loads`, false, String(e)); continue; }
      const items = A.T.filter(t => t.bank && t.subj === subj);
      total += items.length;
      const counts = {};
      items.forEach(t => { const c = counts[t.cls] = counts[t.cls] || {}; c[t.topic] = (c[t.topic] || 0) + 1; });
      eq(g, `${subj}: chapters and question counts match the index in index.html`, counts, A.BANK_INDEX[subj].classes);
      const badMcq = items.filter(t => t.mcq).filter(t => { const q = t.mcqGen(), p = q.parts[0]; return !(p.ans >= 0) || p.options.length < 4; }).map(t => t.id);
      eq(g, `${subj}: every multiple-choice version has its correct answer among 4 options`, badMcq, []);
      const badTyped = items.filter(t => !t.mcqOnly).filter(t => t.gen().parts.some(p => !A.checkPart(p, p.type === 'text' ? plain(p.alts[0]) : String(p.ans)))).map(t => t.id);
      eq(g, `${subj}: every typed answer key is accepted as a right answer`, badTyped, []);
    }
    eq(g, 'total questions in the banks', total, Object.values(A.BANK_INDEX).reduce((s, b) => s + Object.values(b.classes).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0), 0));
  }

  // ---------- the school pages for search engines (cbse/…, built by tools/build_pages.py) ----------
  async function schoolPages(A) {
    const g = 'School pages', ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const missing = [], stale = [], badLinks = [];
    let n = 0;
    for (const [i, c] of ROMAN.entries()) for (const s of A.SUBJECTS.filter(s => A.topicsFor(s, c).length)) {
      n++;
      const url = `../cbse/class-${i + 1}/${slug(s)}/`;
      let doc;
      try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); doc = new DOMParser().parseFromString(await r.text(), 'text/html'); }
      catch (e) { missing.push(url); continue; }
      const shown = [...doc.querySelectorAll('.chapters b')].map(b => b.textContent);
      if (JSON.stringify(shown) !== JSON.stringify(A.topicsFor(s, c))) stale.push(url);
      // every link into the app names this class and subject, and a chapter the app offers
      [...doc.querySelectorAll('a[href^="/?class="]')].forEach(a => { const q = new URL(a.getAttribute('href'), location.href).searchParams;
        if (q.get('class') !== c || q.get('subject') !== s || (q.get('chapter') && !A.topicsFor(s, c).includes(q.get('chapter')))) badLinks.push(url + ' ' + a.getAttribute('href')); });
    }
    eq(g, 'every class and subject the app offers has a page', missing, []);
    eq(g, 'every page lists the same chapters as the app (rebuild with tools/build_pages.py)', stale, []);
    eq(g, 'every "start" and chapter link opens the right class, subject and chapter', badLinks, []);
    eq(g, 'number of class and subject pages', n, 81);
  }

  // ---------- the chapter pages (cbse/class-11|12/<subject>/<chapter>/, built by tools/build_pages.py) ----------
  async function chapterPages(A) {
    const g = 'Chapter pages', slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const missing = [], unlinked = [], badStart = [];
    let n = 0;
    for (const [c, num] of [['XI', 11], ['XII', 12]]) for (const s of ['Physics', 'Chemistry', 'Biology', 'Mathematics']) {
      const subjUrl = `../cbse/class-${num}/${slug(s)}/`;
      const subjDoc = new DOMParser().parseFromString(await (await fetch(subjUrl)).text(), 'text/html');
      const links = [...subjDoc.querySelectorAll('.chapters a')].map(a => a.getAttribute('href'));
      for (const ch of A.topicsFor(s, c)) {
        n++;
        const path = `/cbse/class-${num}/${slug(s)}/${slug(ch)}/`;
        const r = await fetch('..' + path);
        if (!r.ok) { missing.push(path); continue; }
        if (!links.includes(path)) unlinked.push(path);
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html'), btn = doc.querySelector('a.btn');
        const q = btn && new URL(btn.getAttribute('href'), location.href).searchParams;
        if (!q || q.get('class') !== c || q.get('subject') !== s || q.get('chapter') !== ch || !doc.querySelectorAll('.samples .sq').length) badStart.push(path);
      }
    }
    eq(g, 'every Class 11 and 12 Physics, Chemistry, Biology and Mathematics chapter has a page (rebuild with tools/build_pages.py)', missing, []);
    eq(g, 'every chapter page is linked from its subject page', unlinked, []);
    eq(g, 'every chapter page has sample questions and a start button for that chapter', badStart, []);
    ok(g, 'number of chapter pages checked: ' + n, n > 0);
  }

  // ---------- the official paper pages (jee-main/…, jee-advanced/…, neet/…, built by tools/build_pages.py) ----------
  // the key each answer-key entry carries: option numbers, a number or lo~hi range, or "dropped"
  const keyText = q => { const p = q.parts[0];
    return q.dropped ? 'dropped' : p.type === 'num' ? (p.lo != null && p.lo !== p.hi ? `${p.lo}~${p.hi}` : String(p.ans))
      : p.type === 'multi' ? p.ans.join(',') : p.accept ? p.accept.join('/') : String(p.ans); };
  async function paperPages(A) {
    const html = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return new DOMParser().parseFromString(await r.text(), 'text/html'); };
    for (const [list, ex] of Object.entries(A.EXAM_PAGES)) {
      // the exam's list page links to one page per paper; each paper page's start button names its paper
      const pages = {};
      for (const a of (await html(`../${list}/`)).querySelectorAll(`.links a[href^="/${list}/"]`)) {
        const doc = await html('..' + a.getAttribute('href')), btn = doc.querySelector('a.btn');
        const id = btn && new URL(btn.getAttribute('href'), location.href).searchParams.get('paper');
        pages[id] = { url: a.getAttribute('href'), doc };
      }
      eq('Paper pages', `every ${ex.crumb} paper has a page, linked from /${list}/ (rebuild with tools/build_pages.py, then add the link)`,
        ex.papers.map(p => p.id).filter(id => !pages[id]), []);
      for (const p of ex.papers.filter(p => pages[p.id])) {
        const g = 'Paper page: ' + pages[p.id].url, data = await (await fetch('../' + p.path + 'paper.json')).json();
        const qs = A.examQs(data, '');
        const shown = [...pages[p.id].doc.querySelectorAll('.akey li')].map(li => [li.dataset.no, li.dataset.key]);
        eq(g, 'the answer key lists every question', shown.length, qs.length);
        eq(g, 'every answer matches the key the test is marked with', shown.filter(([no, key], i) => !qs[i] || String(qs[i].no) !== no || keyText(qs[i]) !== key).map(([no]) => no), []);
        eq(g, 'the start button opens this paper on its exam page', pages[p.id].doc.querySelector('a.btn').getAttribute('href'), `/?paper=${p.id}#${list}`);
      }
    }
  }

  // ---------- run ----------
  function render() {
    const fails = results.filter(r => !r.pass), sum = document.getElementById('summary');
    sum.textContent = fails.length ? `FAIL: ${fails.length} of ${results.length} checks failed` : `PASS: all ${results.length} checks passed`;
    sum.className = fails.length ? 'fail' : 'pass';
    sum.dataset.result = fails.length ? 'fail' : 'pass';
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    document.getElementById('list').innerHTML = fails.concat(results.filter(r => r.pass)).map(r =>
      `<li class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'} · ${esc(r.group)}: ${esc(r.name)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</li>`).join('');
  }
  async function run() {
    const frame = document.getElementById('app');
    let A = null;
    for (let i = 0; i < 100 && !A; i++) { await new Promise(r => setTimeout(r, 100)); A = frame.contentWindow && frame.contentWindow.__aaTest; }
    if (!A) { ok('Setup', 'the site loads with ?test', false, 'window.__aaTest not found'); return render(); }
    for (const t of [parsing, checking, rules, labels, papers, banks, schoolPages, chapterPages, paperPages]) {
      try { await t(A); } catch (e) { ok('Setup', t.name + ' ran without an error', false, e && e.stack || String(e)); }
    }
    render();
  }
  run();
})();
