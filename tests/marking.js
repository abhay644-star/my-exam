// Tests for answer checking and marking. The site runs in the iframe with ?test, which exposes window.__aaTest.
(function () {
  'use strict';
  const results = [];
  // the local test server now and then drops a burst of requests (hundreds of pages are read): a request that fails, or whose
  // body breaks off, is tried up to 5 more times, waiting longer each time (the body is read here, so a break while reading it is retried too)
  const fetch = async (u, o) => { for (let k = 0; ; k++) { try { const r = await window.fetch(u, o), b = await r.arrayBuffer(); return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); }
    catch (e) { if (k >= 5) throw e; await new Promise(r => setTimeout(r, 500 * (k + 1))); } } };
  const show = v => JSON.stringify(v);
  function ok(group, name, cond, detail) { results.push({ group, name, pass: !!cond, detail: cond ? '' : (detail || '') }); }
  function eq(group, name, got, want) { ok(group, name, show(got) === show(want), `got ${show(got)}, expected ${show(want)}`); }
  function near(group, name, got, want) { ok(group, name, got != null && Math.abs(got - want) < 1e-9 * Math.max(1, Math.abs(want)), `got ${show(got)}, expected ${want}`); }

  // ---------- typed numbers ----------
  function parsing(A) {
    const g = 'Reading typed numbers';
    [['4 1/5', 4.2], ['21/5', 4.2], ['−1/6', -1 / 6], ['2^4', 16], ['3.84 × 10^5', 384000], ['3.84 x 10^5', 384000],
     ['₹1,250', 1250], ['12 cm', 12], ['45°', 45], ['0.375', 0.375],
     ['seven', 7], ['forty-one', 41], ['two hundred and eighty', 280], ['Article 356', 356], ['20 per cent', 20], ["4 o'clock", 4]].forEach(([s, v]) => near(g, `"${s}" reads as ${v}`, A.parseNum(s), v));
    eq(g, 'an empty box reads as nothing', A.parseNum(''), null);
    eq(g, 'words read as nothing', A.parseNum('abc'), null);
  }

  // ---------- one answer part ----------
  function checking(A) {
    const g = 'Checking one answer';
    const cases = [
      // a symbol answer is compared symbol for symbol: any other symbol is wrong, the word for it is right
      ['symbol key "#" (or "hash")', { type: 'text', alts: ['hash', '#'], fuzzy: true, wrong: [] }, { '#': true, ' # ': true, 'hash': true, '?': false, '$': false, '.': false }],
      ['symbol key "Ω" (or "ohm")', { type: 'text', alts: ['ohm', 'Ω'], fuzzy: true, wrong: [] }, { 'Ω': true, 'ohm': true, 'Ω!': false, '%': false }],
      ['whole-number key 12', { type: 'num', ans: 12, ansText: '12' }, { '12': true, '12.0': true, '12 cm': true, '12.1': false, '': false }],
      ['exact decimal key 7.73', { type: 'num', ans: 7.73, ansText: '7.73' }, { '7.73': true, '7.730': true, '7.74': false, '7.7': false }],
      ['non-terminating key 1/3', { type: 'num', ans: 1 / 3, ansText: '1/3' }, { '1/3': true, '0.33': true, '0.333': true, '0.3': false, '0.34': false }],
      ['range key 0.72 to 0.76', { type: 'num', ans: 0.72, lo: 0.72, hi: 0.76, ansText: '0.72 to 0.76' }, { '0.72': true, '0.74': true, '0.76': true, '0.71': false, '0.77': false }],
      ['two ranges: -29.95 to -29.8 or 29.8 to 29.95', { type: 'num', ans: -29.95, lo: -29.95, hi: -29.8, ranges: [[29.8, 29.95]], ansText: '' }, { '-29.9': true, '29.9': true, '29.95': true, '0': false, '-29.7': false, '30': false }],
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

  // ---------- written answers marked by the student (CBSE board practice papers) ----------
  const W = { questions: [
    { no: 1, subject: 'Mathematics', section: 'A', type: 'mcq', full: 1, neg: 0, text: 'x', options: opts, answer: 2, sol: 's' },
    { no: 2, subject: 'Mathematics', section: 'B', type: 'written', full: 2, neg: 0, text: 'x', model: 'model answer', points: [{ t: 'formula', m: 1 }, { t: 'answer', m: 1 }] },
    { no: 3, subject: 'Mathematics', section: 'E', type: 'written', full: 4, neg: 0, text: 'case', parts: [
      { q: '(i) a', marks: 1, model: 'm1', points: [{ t: 'p', m: 1 }] },
      { q: '(ii) b', marks: 1, model: 'm2', points: [{ t: 'p', m: 0.5 }, { t: 'q', m: 0.5 }] },
      { q: '(iii) c', marks: 2, model: 'm3', points: [{ t: 'p', m: 1 }, { t: 'q', m: 1 }] }] }] };
  function written(A) {
    const g = 'Written answers (board papers)';
    const qs = () => A.examQs(W, 'fig/'), mark = ans => A.markPaper(qs(), ans);
    eq(g, 'case-based parts keep their own marks (1 + 1 + 2)', qs()[2].parts.map(p => p.marks), [1, 1, 2]);
    eq(g, 'a written question is not multiple choice', [qs()[1].kind, qs()[1].parts[0].type], ['w', 'self']);
    eq(g, 'MCQ: right 1, wrong 0 (no negative marks)', [mark({ '0-0': '2' })[0], mark({ '0-0': '1' })[0]], [1, 0]);
    eq(g, 'written: the marks of the points ticked', mark({ '1-0': 'my answer', '1-0s': '0' })[1], 1);
    eq(g, 'written: every point ticked = full marks', mark({ '1-0': 'my answer', '1-0s': '0,1' })[1], 2);
    eq(g, 'written: no point ticked = 0', mark({ '1-0': 'my answer' })[1], 0);
    eq(g, 'written: a blank answer scores 0, even with points ticked', mark({ '1-0': ' ', '1-0s': '0,1' })[1], 0);
    eq(g, 'written: a tick that is not a marking point is ignored', mark({ '1-0': 'a', '1-0s': '0,5,x' })[1], 1);
    eq(g, 'case-based: half marks add up across the parts', mark({ '2-0': 'a', '2-0s': '0', '2-1': 'b', '2-1s': '1', '2-2': 'c', '2-2s': '1' })[2], 2.5);
    eq(g, 'case-based: only the parts answered score', mark({ '2-2': 'c', '2-2s': '0,1', '2-0s': '0' })[2], 2);
    // an internal choice (OR): the student's choice decides which marking points count
    const OR = { questions: [{ no: 1, subject: 'Mathematics', section: 'B', type: 'written', full: 2, neg: 0, text: 'x', model: 'first', points: [{ t: 'a', m: 2 }],
      or: { text: 'y', model: 'other', points: [{ t: 'b', m: 1 }, { t: 'c', m: 1 }] } }] };
    const orq = () => A.examQs(OR, 'fig/');
    eq(g, 'OR: the alternative is kept with its own model answer and points', [orq()[0].parts[0].alt.model, orq()[0].parts[0].alt.points.length], ['other', 2]);
    eq(g, 'OR: answering the first question marks against its points', A.markPaper(orq(), { '0-0': 'ans', '0-0s': '0' })[0], 2);
    eq(g, 'OR: answering the OR question marks against the OR points', A.markPaper(orq(), { '0-0': 'ans', '0-0c': '1', '0-0s': '1' })[0], 1);
    eq(g, 'OR: a tick beyond the chosen question\'s points is ignored', A.markPaper(orq(), { '0-0': 'ans', '0-0s': '0,1' })[0], 2);
    ok(g, 'OR: the answer key shows both model answers', /first[\s\S]*OR[\s\S]*other/.test(A.answerText(orq()[0].parts[0])));
    const q = qs()[1];
    A.markPaper([q], { '0-0': 'a', '0-0s': '0' });
    ok(g, 'the answer key shows the model answer and the marking points', /^model answer/.test(A.answerText(q.parts[0])) && /Marking points: formula \(1 mark\); answer \(1 mark\)/.test(A.answerText(q.parts[0])), A.answerText(q.parts[0]));
    const saved = A.withPaper({ exam: {} }, () => A.cleanQ(q));
    eq(g, 'saved in My mistakes without the student\'s answer or marks', ['user', 'ok', 'got', 'ticks'].filter(k => k in saved.parts[0]), []);
    ok(g, '...and passes the backup restore check', A.dataOk(saved, 0));
  }
  // ---------- "Your weak chapters" on an exam's page ----------
  function weak(A) {
    const g = 'Your weak chapters';
    const h = [
      { list: 'neet', label: '', chs: { 'XII|Physics|Current Electricity': [4, 16], 'XI|Physics|Units and Measurements': [8, 8], 'XII|Biology|Evolution': [-2, 8] } },
      { list: 'neet', label: '', chs: { 'XII|Physics|Current Electricity': [0, 8] } },
      { list: 'neet', label: 'Retry: questions to review', chs: { 'XII|Physics|Current Electricity': [0, 40] } },
      { list: 'jee-main', label: '', chs: { 'XII|Physics|Current Electricity': [0, 40] } },
      { list: 'neet', label: '', chs: { 'XII|Physics|No Such Chapter': [0, 40] } },
      { list: 'neet', label: '', chs: null }];
    const w = A.weakChapters('neet', h);
    eq(g, 'counts this exam\'s attempts with chapter marks, not retries or other exams', w.n, 3);
    eq(g, 'adds up each chapter over the attempts, most marks lost first; chapters at full marks or not in the exam\'s list are left out',
      w.list.map(c => [c.name, c.g, c.t]), [['Current Electricity', 4, 24], ['Evolution', -2, 8]]);
    eq(g, 'negative marks show as 0%, never below', w.list[1].pct, 0);
    eq(g, 'each chapter points to its "Practise by chapter" entry', w.list.every(c => c.k >= 0), true);
    eq(g, 'no attempts: nothing to show', A.weakChapters('neet', []).list, []);
    const rec = A.cleanHistRec({ d: 1, subj: 'NEET', cls: 'x', pct: 50, nq: 1, exam: true, list: 'neet', chs: { 'XII|Physics|Nuclei': [1, 4], bad: 'x' } });
    eq(g, 'a history record keeps its exam and chapter marks through a backup restore (bad entries dropped)', [rec.list, rec.chs], ['neet', { 'XII|Physics|Nuclei': [1, 4] }]);
  }
  // ---------- My progress: school chapters to revise, and board papers taken ----------
  function progress(A) {
    const g = 'My progress';
    const h = [
      { exam: false, subj: 'Science', cls: 'X', label: '', top: { 'Electricity': [2, 10], 'Life Processes': [9, 10] } },
      { exam: false, subj: 'Science', cls: 'X', label: '', top: { 'Electricity': [1, 5] } },
      { exam: false, subj: 'Science', cls: 'X', label: 'Retry: questions to review', top: { 'Electricity': [0, 50] } },
      { exam: false, subj: 'Science', cls: 'X', label: '', top: { 'Not A Chapter': [0, 10] } },
      { exam: true, pid: '10-maths-1', pct: 40, label: '' }, { exam: true, pid: '10-maths-1', pct: 65, label: '' },
      { exam: true, pid: '10-maths-1', pct: 90, label: 'Second attempt' }, { exam: true, pid: '2026-04-02-s1', pct: 70, label: '' }];
    eq(g, 'school chapters added up over full papers (not retries), weak ones only, real chapters only', A.weakSchool(h).map(c => [c.name, c.g, c.t, c.pct]), [['Electricity', 3, 15, 20]]);
    eq(g, 'board papers: best score of the full attempts, and how many', A.boardDone(h), { '10-maths-1': { best: 65, n: 2 } });
  }
  // every board practice paper offered: loads, adds up, and full marks are reachable
  async function boardPapers(A) {
    const ids = A.BOARD_PAPERS.map(m => m.id);
    eq('Board practice papers', 'every paper id is unique', ids.filter((x, i) => ids.indexOf(x) !== i), []);
    for (const m of A.BOARD_PAPERS) {
      const g = 'Board practice paper: ' + m.id, path = '../' + m.path;
      let data;
      try { const r = await fetch(path + 'paper.json'); data = await r.json(); } catch (e) { ok(g, 'paper.json loads', false, String(e)); continue; }
      eq(g, 'the paper is the one listed', [data.id, data.label, data.board], [m.id, 'Practice paper', 'CBSE pattern']);
      eq(g, 'the start button shows the paper\'s real length', m.min, data.duration);
      const qs = A.examQs(data, path + 'fig/');
      ok(g, 'the listed pattern gives the right number of questions and marks', m.pat.indexOf(`${qs.length} questions`) === 0 && m.pat.indexOf(`${data.maxMarks} marks`) > 0, m.pat);
      eq(g, 'maximum marks', A.maxMarks(qs, null), data.maxMarks);
      eq(g, 'no negative marks', qs.filter(q => q.neg).map(q => q.no), []);
      eq(g, 'the parts of each question add up to its marks', qs.filter(q => Math.abs(q.parts.reduce((s, p) => s + p.marks, 0) - q.marks) > 1e-9).map(q => q.no), []);
      eq(g, 'the marking points of each written answer add up to its marks', qs.filter(q => q.parts.some(p => p.type === 'self' && Math.abs(p.points.reduce((s, t) => s + t.m, 0) - p.marks) > 1e-9)).map(q => q.no), []);
      eq(g, '...and so do those of each OR choice', qs.filter(q => q.parts.some(p => p.alt && Math.abs(p.alt.points.reduce((s, t) => s + t.m, 0) - p.marks) > 1e-9)).map(q => q.no), []);
      eq(g, 'every MCQ key points to a real option', qs.filter(q => q.parts[0].type === 'choice' && !(q.parts[0].ans >= 0 && q.parts[0].ans < q.parts[0].options.length)).map(q => q.no), []);
      const ans = {};
      qs.forEach((q, i) => q.parts.forEach((p, j) => { if (p.type === 'choice') ans[i + '-' + j] = String(p.ans); else if (p.type === 'self') { ans[i + '-' + j] = 'answer'; ans[i + '-' + j + 's'] = p.points.map((t, k) => k).join(','); } }));
      eq(g, 'every key and every marking point gives full marks', +A.markPaper(A.examQs(data, path + 'fig/'), ans).reduce((s, x) => s + x, 0).toFixed(2), data.maxMarks);
      const chs = A.topicsFor(m.subj, m.cls);
      // (a question with no school chapter, such as an English writing task, has none; one that has a chapter must name a real one)
      eq(g, 'every chapter named is a school chapter, for "Chapters to revise"', qs.filter(q => q.ch && (q.ch.cls !== m.cls || chs.indexOf(q.ch.name) < 0)).map(q => q.no), []);
      ok(g, 'most questions have a school chapter', qs.filter(q => q.ch).length >= qs.length / 2, `${qs.filter(q => q.ch).length} of ${qs.length}`);
      eq(g, 'every question, as saved in My mistakes, passes the backup restore check', A.withPaper({ exam: {} }, () => qs.filter(q => !A.dataOk(A.cleanQ(q), 0)).map(q => q.no)), []);
    }
  }

  // the board practice papers' own pages (written by tools/build_pages.py): a hub linking every paper, and one page per paper
  // with every question and a button that opens it in the app
  async function boardPaperPages(A) {
    const g = 'Board practice paper pages', slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const html = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return new DOMParser().parseFromString(await r.text(), 'text/html'); };
    const pathOf = m => `/cbse/class-${m.cls === 'X' ? 10 : 12}/${slug(m.subj)}/practice-paper-${m.id.split('-').pop()}-2027/`;
    const hub = await html('../cbse/board-exam-2027/').catch(() => null);
    ok(g, 'the hub page exists and links every paper (run tools/build_pages.py)', hub && A.BOARD_PAPERS.every(m => hub.querySelector(`a[href="${pathOf(m)}"]`)),
      hub ? A.BOARD_PAPERS.filter(m => !hub.querySelector(`a[href="${pathOf(m)}"]`)).map(m => m.id).join(', ') : 'no hub page');
    const bad = [];
    for (const m of A.BOARD_PAPERS) {
      const doc = await html('..' + pathOf(m)).catch(() => null);
      if (!doc) { bad.push(m.id + ': no page'); continue; }
      const data = await (await fetch('../' + m.path + 'paper.json')).json();
      const btn = doc.querySelector('a.btn');
      if (!btn || btn.getAttribute('href') !== `/?bp=${m.id}#board`) bad.push(m.id + ': start button ' + (btn && btn.getAttribute('href')));
      if (doc.querySelectorAll('li.sq').length !== data.questions.length) bad.push(`${m.id}: ${doc.querySelectorAll('li.sq').length} of ${data.questions.length} questions`);
      if (!/not an official CBSE paper/.test(doc.querySelector('.lede').textContent)) bad.push(m.id + ': no "not official" line');
    }
    eq(g, 'every paper has its page, with every question, a "not official" line and a button opening it in the app', bad, []);
    // each board subject's page links to CBSE's own sample paper (links only, nothing copied)
    const subjPages = [...new Set(A.BOARD_PAPERS.map(m => `/cbse/class-${m.cls === 'X' ? 10 : 12}/${slug(m.subj)}/`))], noOff = [];
    for (const p of subjPages) { const d = await html('..' + p).catch(() => null); if (!d || !d.querySelector('a[href^="https://cbseacademic.nic.in/"]') || !/Official CBSE papers/.test(d.body.textContent)) noOff.push(p); }
    eq(g, 'every board subject page has an "Official CBSE papers" section linking to CBSE\'s sample paper', noOff, []);
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

  // ---------- "Compared with the real exam" (real candidate counts, no guessed ranks) ----------
  function realExam(A) {
    const g = 'Compared with the real exam';
    for (const [k, d] of Object.entries(A.REAL_DIST)) {
      const [list, id] = k.split('/');
      ok(g, `${k} is an official paper`, (A.EXAM_PAGES[list] || { papers: [] }).papers.some(p => p.id === id));
      ok(g, `${k}: marks go down and counts go up`, d.rows.every((r, i) => !i || (r.marks < d.rows[i - 1].marks && r.n > d.rows[i - 1].n)));
    }
    const neet = { list: 'neet', id: '2026-reexam-50' }, txt = (sc, p) => {
      const div = document.createElement('div');
      div.innerHTML = A.withPaper(Object.assign({ exam: neet, label: 'Official paper', mode: 'exam' }, p), () => A.realLine(sc));
      return div.textContent.replace(/\s+/g, ' ');
    };
    ok(g, '715: in the top 19', /ranked in the top 19\./.test(txt(715)), txt(715));
    ok(g, '700 (not above 700): between 20 and 138', /roughly between 20 and 138\./.test(txt(700)), txt(700));
    ok(g, '690: between 20 and 138', /roughly between 20 and 138\./.test(txt(690)), txt(690));
    ok(g, '689: between 139 and 1,492', /roughly between 139 and 1,492\./.test(txt(689)), txt(689));
    ok(g, '612: between 1,493 and 10,160', /roughly between 1,493 and 10,160\./.test(txt(612)), txt(612));
    ok(g, '500: between 10,161 and 90,780', /roughly between 10,161 and 90,780\./.test(txt(500)), txt(500));
    ok(g, '499: below 90,780', /ranked below 90,780\./.test(txt(499)), txt(499));
    ok(g, 'names the exam and the source', /NEET \(UG\) 2026 re-examination/.test(txt(612)) && /NTA result statistics/.test(txt(612)));
    ok(g, 'Practice mode says the timed exam is fairer', /Practice mode/.test(txt(612, { mode: 'practice' })) && !/Practice mode/.test(txt(612)));
    ok(g, 'a second attempt at the whole paper is compared', txt(612, { label: 'Second attempt' }) !== '');
    eq(g, 'a retry of some questions is not compared', txt(300, { label: 'Retry: questions to review' }), '');
    eq(g, 'a paper without real counts (NEET 2025) is not compared', txt(612, { exam: { list: 'neet', id: '2025-45' } }), '');
    eq(g, 'a JEE Main paper is not compared', txt(200, { exam: { list: 'jee-main', id: '2026-04-02-s1' } }), '');
  }

  // ---------- "This week's free mocks" ----------
  function weekly(A, win) {
    const g = "This week's free mocks", day = (y, m, d, h = 12) => new win.Date(y, m - 1, d, h), ymd = x => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
    const sun = A.weekInfo(day(2026, 11, 8, 23)), mon = A.weekInfo(day(2026, 11, 9, 0)), wed = A.weekInfo(day(2026, 11, 11));
    eq(g, 'Sunday 8 Nov 2026 is in the week Mon 2 to Sun 8 Nov', [ymd(sun.a), ymd(sun.b), sun.a.getDay(), sun.b.getDay()], ['2026-11-2', '2026-11-8', 1, 0]);
    ok(g, 'the week changes on Monday and stays the same until Sunday', mon.w === sun.w + 1 && wed.w === mon.w && ymd(mon.a) === '2026-11-9');
    eq(g, 'a week across the clock change (Mar 2026 in Europe) still starts on Monday', A.weekInfo(day(2026, 3, 30)).a.getDay(), 1);
    for (const w of [0, 1, sun.w, mon.w]) {
      const ps = A.weeklyPapers(w);
      ok(g, `week ${w}: one official paper for each of JEE Main, JEE Advanced and NEET`, ps.map(x => x.list).join() === 'jee-main,jee-advanced,neet' && ps.every(x => x.p && A.EXAM_PAGES[x.list].papers.includes(x.p)));
    }
    ok(g, 'next week has different papers', A.weeklyPapers(mon.w).every((x, i) => x.p !== A.weeklyPapers(sun.w)[i].p));
  }

  function greetings(A, win) {
    const g = 'Festival greetings', day = (y, m, d, h = 12) => new win.Date(y, m - 1, d, h), id = x => (A.greetFor(x) || {}).id || null;
    ok(g, 'every greeting has a valid date range and text', A.GREETS.every(x => /^\d{4}-\d\d-\d\d$/.test(x.from) && /^\d{4}-\d\d-\d\d$/.test(x.to) && x.from <= x.to && x.id && x.html));
    eq(g, 'Diwali 2026: shown from 7 to 10 Nov, not on 6 or 11 Nov', [day(2026, 11, 6, 23), day(2026, 11, 7, 0), day(2026, 11, 8), day(2026, 11, 10, 23), day(2026, 11, 11, 0)].map(id), [null, 'diwali-2026', 'diwali-2026', 'diwali-2026', null]);
  }

  // ---------- the official papers ----------
  const PAPERS = [
    ['JEE Main 2026, 2 April Shift 1', '../jee/2026-04-02-s1/', 75, 300],
    ['NEET (UG) 2026 re-exam, code 50', '../neet/2026-reexam-50/', 180, 720],
    ['NEET (UG) 2025, code 45', '../neet/2025-45/', 180, 720],
    ['NEET (UG) 2024, code T1', '../neet/2024-T1/', 200, 720],
    ['NEET (UG) 2023, code E1', '../neet/2023-E1/', 200, 720],
    ['NEET (UG) 2022, code Q1', '../neet/2022-Q1/', 200, 720],
    ['JEE Advanced 2026 Paper 1', '../jee-adv/2026-p1/', 48, 180],
    ['JEE Advanced 2026 Paper 2', '../jee-adv/2026-p2/', 54, 180],
    ['JEE Main 2026, 2 April Shift 2', '../jee/2026-04-02-s2/', 75, 300],
    ['JEE Main 2026, 4 April Shift 1', '../jee/2026-04-04-s1/', 75, 300],
    ['JEE Main 2026, 4 April Shift 2', '../jee/2026-04-04-s2/', 75, 300],
    ['JEE Main 2026, 5 April Shift 1', '../jee/2026-04-05-s1/', 75, 300],
    ['JEE Main 2026, 5 April Shift 2', '../jee/2026-04-05-s2/', 75, 300],
    ['JEE Main 2026, 6 April Shift 1', '../jee/2026-04-06-s1/', 75, 300],
    ['JEE Main 2026, 6 April Shift 2', '../jee/2026-04-06-s2/', 75, 300],
    ['JEE Main 2026, 8 April Shift 2', '../jee/2026-04-08-s2/', 75, 300],
    ...['21', '22', '23', '24', '28'].flatMap(d => [1, 2].map(s => [`JEE Main 2026, ${+d} January Shift ${s}`, `../jee/2026-01-${d}-s${s}/`, 75, 300])),
    ...['02', '03', '04', '07'].flatMap(d => [1, 2].map(s => [`JEE Main 2025, ${+d} April Shift ${s}`, `../jee/2025-04-${d}-s${s}/`, 75, 300])),
    ['JEE Main 2025, 8 April Shift 2', '../jee/2025-04-08-s2/', 75, 300],
    ...['22', '23', '24', '28', '29'].flatMap(d => [1, 2].map(s => [`JEE Main 2025, ${+d} January Shift ${s}`, `../jee/2025-01-${d}-s${s}/`, 75, 300])),
    ['JEE Advanced 2025 Paper 1', '../jee-adv/2025-p1/', 48, 180],
    ['JEE Advanced 2025 Paper 2', '../jee-adv/2025-p2/', 48, 180],
    ['JEE Advanced 2024 Paper 1', '../jee-adv/2024-p1/', 51, 180],
    ['JEE Advanced 2024 Paper 2', '../jee-adv/2024-p2/', 51, 180],
    ['JEE Advanced 2023 Paper 1', '../jee-adv/2023-p1/', 51, 180],
    ['JEE Advanced 2023 Paper 2', '../jee-adv/2023-p2/', 51, 180],
    ['JEE Advanced 2022 Paper 1', '../jee-adv/2022-p1/', 54, 180],
    ['JEE Advanced 2022 Paper 2', '../jee-adv/2022-p2/', 54, 180],
    ['JEE Advanced 2021 Paper 1', '../jee-adv/2021-p1/', 57, 180],
    ['JEE Advanced 2021 Paper 2', '../jee-adv/2021-p2/', 57, 180],
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
      // ex: the paper's "attempt any N" sections (NEET 2024 Section B), marked as in the exam
      const ex = { secLimit: data.secLimit || null };
      eq(g, 'maximum marks', A.maxMarks(qs, ex), total);
      const badKey = qs.filter(q => q.parts.some(p => (p.type === 'choice' && !(p.ans >= 0 && p.ans < p.options.length))
        || (p.type === 'multi' && !(p.ans.length && p.ans.every(j => j >= 0 && j < p.options.length)))
        || (p.type === 'num' && !(isFinite(p.ans) && (p.lo == null || p.lo <= p.hi))))).map(q => q.no);
      eq(g, 'every answer key points to a real option or number', badKey, []);
      const sum = got => +got.reduce((s, x) => s + x, 0).toFixed(2);
      const all = f => { const a = {}; qs.forEach((q, i) => { a[i + '-0'] = f(q.parts[0]); }); return a; };
      const fresh = () => A.examQs(data, path + 'fig/');
      const qsK = fresh(), full = A.markPaper(qsK, all(keyOf), ex);
      eq(g, 'answering every question with its key gives full marks', sum(full), total);
      eq(g, '...and no counted question loses marks', qsK.map((q, i) => !q.uncounted && q.marks - full[i] > 1e-9 ? q.no : null).filter(x => x != null), []);
      const qsB = fresh();
      eq(g, 'leaving every question blank scores only the dropped questions', sum(A.markPaper(qsB, all(() => ''), ex)), sum(qsB.map(q => q.dropped && q.inMax !== false ? q.marks : 0)));
      const qsW = fresh();
      eq(g, 'answering every question wrongly scores the negative marks of the counted questions', sum(A.markPaper(qsW, all(wrongOf), ex)), sum(qsW.map(q => q.inMax === false ? 0 : q.dropped ? q.marks : -q.neg)));
      if (data.secLimit) eq(g, 'only the first N answered questions of each "attempt any N" section count', qsW.filter(q => q.uncounted).length,
        qs.filter(q => data.secLimit[String(q.sec).split('-').pop()]).length - Object.entries(qs.reduce((m, q) => { const n = data.secLimit[String(q.sec).split('-').pop()]; if (n) m[q.sec] = n; return m; }, {})).reduce((s, [, n]) => s + n, 0));
      eq(g, 'every question, as saved in My mistakes, passes the backup restore check',
        A.withPaper({ exam: { optLabels: data.optLabels || null } }, () => fresh().filter(q => !A.dataOk(A.cleanQ(q), 0)).map(q => q.no)), []);
    }
    // "Practise by chapter" (EXAM_CH, written by build_pages.py) matches the papers: every tagged question is in exactly one
    // chapter, with the right count and papers (run build_pages.py after changing a paper.json or the papers list)
    for (const [list, ex] of Object.entries(A.EXAM_PAGES)) {
      const g = 'Practise by chapter: ' + ex.crumb, want = {};
      for (const [i, m] of ex.papers.entries()) {
        const data = await (await fetch('../' + m.path + 'paper.json')).json();
        data.questions.forEach(x => { if (!x.chapter) return; const k = [x.chSubj || x.subject, x.chapter, x.chCls || ''].join('|'), w = want[k] = want[k] || [0, []]; w[0]++; if (w[1].indexOf(i) < 0) w[1].push(i); });
      }
      const got = {};
      Object.entries(A.EXAM_CH[list] || {}).forEach(([s, chs]) => chs.forEach(c => { got[[s, c[0], c[1]].join('|')] = [c[2], c[3]]; }));
      const diff = Object.keys(Object.assign({}, want, got)).filter(k => show(want[k]) !== show(got[k]));
      eq(g, 'the chapter list matches the questions in the papers', diff.map(k => `${k}: ${show(got[k])} vs ${show(want[k])}`), []);
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
    // question quality, read from the bank files themselves
    const norm = s => plain(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const LV = new Set(['E', 'M', 'C', 'X']), badLevel = [], dupOpt = [], dupText = [], strayTag = [], noExpl = [], numAlt = [], mcqOnlyNoOpts = [], emptyAlt = [];
    const byId = new Map(A.T.filter(t => t.bank).map(t => [t.id, t]));
    // a "<" that starts something the page would read as a tag, other than the formatting the banks use
    const stray = s => /<(?!\/?(sub|sup|br|b|i|u|em|strong|span|code|small|table|tr|td|th|tbody|thead)\b)[a-zA-Z\/!]/.test(String(s));
    for (const subj of Object.keys(A.BANK_INDEX)) {
      let d;
      try { d = await (await fetch('../' + A.BANK_INDEX[subj].file)).json(); } catch (e) { continue; }
      const seen = new Map();
      d.questions.forEach((q, i) => {
        const id = `${subj} #${i} (Class ${q.c}, ${q.t})`;
        if (!LV.has(q.l)) badLevel.push(id);
        if (Array.isArray(q.o)) { const opts = [String(q.a).split('|')[0]].concat(q.o).map(norm); if (new Set(opts).size !== opts.length) dupOpt.push(id); }
        const k = q.c + '|' + norm(q.q) + '|' + norm(q.a || '') + '|' + (q.p ? q.p.map(p => norm(p[0])).join('|') : '');
        if (seen.has(k)) dupText.push(`${id} = #${seen.get(k)}`); else seen.set(k, i);
        if ([q.q, q.a, q.e].concat(q.o || [], ...(q.p || [])).some(stray)) strayTag.push(id);
        if (!q.e || !String(q.e).trim()) noExpl.push(id);
        // a number answer is marked as a number, so every other form it lists ("8.3|8") must also be accepted when typed
        const t = byId.get(subj + '_' + i);
        if (t && !q.p && !t.mcqOnly && String(q.a).includes('|')) {
          const part = t.gen().parts[0];
          if (part.type === 'num') String(q.a).split('|').slice(1).forEach(alt => { if (!A.checkPart(part, plain(alt))) numAlt.push(`${id}: "${alt}" (key ${part.ans})`); });
        }
        if (q.m && !(Array.isArray(q.o) && q.o.length >= 3)) mcqOnlyNoOpts.push(id);
        // a typed answer made only of punctuation ("!") reads as nothing, so any other mark would be accepted too
        if (t && !t.mcqOnly && !q.p) { const part = t.gen().parts[0]; if (part.type === 'text' && ['?', '.', '¤'].some(m => !part.alts.map(plain).includes(m) && A.checkPart(part, m))) emptyAlt.push(id); }
      });
    }
    eq(g, 'every question has a difficulty level (E, M, C or X)', badLevel, []);
    eq(g, 'no question shows the same option twice (answer and wrong options all differ)', dupOpt, []);
    eq(g, 'no question is repeated within a class and subject', dupText, []);
    eq(g, 'no stray "<" that the page would read as a tag', strayTag, []);
    eq(g, 'every question has an explanation', noExpl, []);
    eq(g, 'every other accepted form of a number answer is also marked right when typed', numAlt, []);
    eq(g, 'every multiple-choice-only question has its three wrong options', mcqOnlyNoOpts, []);
    eq(g, 'a lone "?", "." or other symbol is marked right only where it is itself an answer', emptyAlt, []);
    eq(g, 'total questions in the banks', total, Object.values(A.BANK_INDEX).reduce((s, b) => s + Object.values(b.classes).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0), 0));
  }

  // ---------- the Mathematics question generators (Classes I to XII), each run many times with a fixed seed ----------
  async function generators(A, W) {
    const g = 'Maths generators', gens = A.T.filter(t => !t.bank && t.gen), R0 = W.Math.random;
    const typed = p => p.type === 'choice' ? String(p.ans) : p.type === 'select' ? p.ans : p.surd || (p.disp && !isFinite(+p.disp) && /√/.test(p.disp)) ? p.disp : p.sci ? `${+(p.ans / 10 ** Math.floor(Math.log10(Math.abs(p.ans)))).toPrecision(10)} x 10^${Math.floor(Math.log10(Math.abs(p.ans)))}` : p.type === 'text' ? p.alts[0] : String(p.ans);
    const errors = [], rejected = [], badMcq = [];
    W.Math.random = A.seeded(20261102);
    try {
      for (const t of gens) for (let k = 0; k < 40; k++) {
        let q;
        try { q = t.gen(); } catch (e) { errors.push(`${t.id}: ${e.message}`); break; }
        const p = q.parts.find(p => !A.checkPart(p, typed(p)));
        if (p) { rejected.push(`${t.id}: "${String(q.text).slice(0, 50)}" key ${JSON.stringify(typed(p))}`); break; }
        if (t.mcq) { const m = A.makeMCQ(t), o = m && m.parts[0].options;
          if (m && (o.length !== 4 || new Set(o).size !== 4 || !(m.parts[0].ans >= 0))) { badMcq.push(`${t.id}: ${JSON.stringify(o)}`); break; } }
      }
    } finally { W.Math.random = R0; }
    eq(g, 'every generator runs without an error', errors, []);
    eq(g, 'every generated answer key is accepted when typed', rejected, []);
    eq(g, 'every multiple-choice version has 4 different options, one of them right', badMcq, []);
    ok(g, 'generators checked: ' + gens.length, gens.length > 100);
    // every chapter in the Mathematics chapter lists has questions (generated, or fixed ones from the Mathematics bank)
    await A.ensureBank('Mathematics');
    const empty = [];
    for (const c of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'])
      for (const tp of A.topicsFor('Mathematics', c)) if (!A.T.some(t => t.subj === 'Mathematics' && t.cls === c && t.topic === tp)) empty.push(`${c}: ${tp}`);
    eq(g, 'every Mathematics chapter has questions', empty, []);
  }

  // ---------- custom papers: random settings, as a student could choose them ----------
  async function customPapers(A) {
    const g = 'Custom papers', ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    let s = 20261101; const rnd = n => { s = (s * 1103515245 + 12345) % 2147483648; return Math.floor(s / 2147483648 * n); };
    const combos = []; for (const c of ROMAN) for (const sub of A.SUBJECTS) if (A.topicsFor(sub, c).length) combos.push([c, sub]);
    const problems = { crash: [], count: [], key: [], marks: [], chapter: [], mcq: [], repeat: [] };
    let built = 0, refused = 0;
    for (let i = 0; i < 150; i++) {
      const [klass, subject] = combos[rnd(combos.length)], all = A.topicsFor(subject, klass);
      await A.ensureBank(subject);
      const topics = rnd(3) ? 'ALL' : all.filter(() => rnd(2)).slice(0, 3);
      const w = [rnd(5), rnd(5), rnd(5), rnd(5)].map(x => x + 1), tw = w.reduce((a, b) => a + b, 0);
      const mix = { E: Math.floor(w[0] / tw * 100), M: Math.floor(w[1] / tw * 100), C: Math.floor(w[2] / tw * 100) }; mix.X = 100 - mix.E - mix.M - mix.C;
      const nq = 1 + rnd(60), usemcq = !!rnd(2);
      const cfg = { klass, subject, topics: topics.length === 0 ? 'ALL' : topics, nq, usemcq, nmcq: 1 + rnd(nq), mix, duration: 10 + rnd(171),
        marks: { MCQ: 1 + rnd(12), E: 1 + rnd(12), M: 1 + rnd(12), C: 1 + rnd(12), X: 1 + rnd(12) } };
      const tag = `${subject} ${klass} n=${nq}${cfg.topics === 'ALL' ? '' : ' (' + cfg.topics.length + ' chapters)'}`;
      let r;
      try { r = A.buildWith(cfg, 1000 + i); } catch (e) { problems.crash.push(tag + ': ' + e.message); continue; }
      if (r.errs.length) { refused++; continue; }
      built++;
      const qs = r.paper.qs;
      if (!qs.length || (qs.length !== nq && !r.paper.notes.some(n => /instead of/.test(n)))) problems.count.push(`${tag}: ${qs.length} questions, no note`);
      if (usemcq && qs.filter(q => q.kind === 'mcq').length > cfg.nmcq) problems.mcq.push(tag);
      for (const q of qs) {
        if (q.marks !== (q.kind === 'mcq' ? cfg.marks.MCQ : cfg.marks[q.level])) { problems.marks.push(`${tag}: Q${q.no}`); break; }
        // other chapters only when the chosen ones run short, and then the paper says so
        if (cfg.topics !== 'ALL' && !cfg.topics.includes(q.topic) && !r.paper.notes.some(n => /other Class/.test(n))) { problems.chapter.push(`${tag}: ${q.topic} (chosen: ${cfg.topics.join(' | ')}) with no note`); break; }
        // what a student types for the key: standard-form answers as "2.63 x 10^4", surd answers as shown ("(√7 + √5)/2")
        const typed = p => { if (p.type === 'text') return plain(p.alts[0]); if (p.surd) return p.disp; if (p.sci) { const e = Math.floor(Math.log10(Math.abs(p.ans))); return `${+(p.ans / 10 ** e).toPrecision(10)} x 10^${e}`; } return String(p.ans); };
        const bad = q.parts.find(p => !p.ansText || !A.checkPart(p, typed(p)));
        if (bad) { problems.key.push(`${tag}: Q${q.no} "${String(q.text).slice(0, 60)}" part type ${bad.type}, ans ${JSON.stringify(bad.ans)}, ansText ${JSON.stringify(bad.ansText)}, id ${q.id || ''}`); break; }
      }
      const again = A.buildWith(cfg, 1000 + i);
      if (JSON.stringify(again.paper.qs.map(q => q.text)) !== JSON.stringify(qs.map(q => q.text))) problems.repeat.push(tag);
    }
    eq(g, `150 random settings: no setting breaks the paper builder (${built} papers built, ${refused} settings refused with a message)`, problems.crash, []);
    eq(g, 'every paper has the questions asked for, or says why it has fewer', problems.count, []);
    eq(g, 'no paper has more multiple-choice questions than asked for', problems.mcq, []);
    eq(g, 'every question carries the marks set for its level', problems.marks, []);
    eq(g, 'chosen chapters only', problems.chapter, []);
    eq(g, 'every answer key in a custom paper is accepted', problems.key, []);
    eq(g, 'the same paper code rebuilds the same paper', problems.repeat, []);
    ok(g, 'most random settings build a paper', built > 100, `${built} built`);

    // a shared paper or class challenge records the bank size (n=…): after new questions are added to the end of the
    // bank, the same link must still rebuild exactly the same paper
    await A.ensureBank('Science');
    const cfgS = { klass: 'X', subject: 'Science', topics: 'ALL', nq: 20, usemcq: false, nmcq: 1, mix: { E: 25, M: 25, C: 25, X: 25 }, duration: 40,
      marks: { MCQ: 1, E: 1, M: 2, C: 3, X: 4 } };
    const cap = A.bankLen('Science'), first = A.buildWith(cfgS, 4242, cap).paper.qs.map(q => q.text);
    const proto = A.T.find(t => t.bank && t.subj === 'Science' && t.cls === 'X'), added = [];
    for (let i = 0; i < 200; i++) added.push(Object.assign({}, proto, { id: 'Science_new' + i, bi: cap + i, level: 'EMCX'[i % 4], mcq: false, mcqOnly: false,
      gen: () => ({ text: 'NEW QUESTION ' + i, parts: [{ type: 'text', alts: ['x'], fuzzy: false, wrong: [], w: 1 }], sol: '' }) }));
    A.T.push(...added);
    try {
      const capped = A.buildWith(cfgS, 4242, cap).paper.qs.map(q => q.text), open = A.buildWith(cfgS, 4242).paper.qs.map(q => q.text);
      ok(g, 'a link made before new questions were added rebuilds the same paper', JSON.stringify(capped) === JSON.stringify(first), capped.filter((t, i) => t !== first[i]).slice(0, 2).join(' / '));
      ok(g, 'without the bank size, new questions can appear (so the check above means something)', open.some(t => /^NEW QUESTION/.test(t)), `${open.length} questions`);
    } finally { A.T.splice(A.T.length - added.length, added.length); }
  }

  // ---------- the school pages for search engines (cbse/…, built by tools/build_pages.py) ----------
  async function schoolPages(A) {
    const g = 'School pages', ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const slug = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
    const g = 'Chapter pages', slug = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const missing = [], unlinked = [], badStart = [];
    let n = 0;
    const scope = [['IX', 9, ['Science', 'Mathematics']], ['X', 10, ['Science', 'Social Science', 'English', 'Mathematics']], ['XI', 11, ['Physics', 'Chemistry', 'Biology', 'Mathematics']], ['XII', 12, ['Physics', 'Chemistry', 'Biology', 'Mathematics']]];
    for (const [c, num, subjects] of scope) for (const s of subjects) {
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
    eq(g, 'every Class 9 Science and Mathematics, Class 10 Science, Social Science, English and Mathematics, and Class 11 and 12 Physics, Chemistry, Biology and Mathematics chapter has a page (rebuild with tools/build_pages.py)', missing, []);
    eq(g, 'every chapter page is linked from its subject page', unlinked, []);
    eq(g, 'every chapter page has sample questions and a start button for that chapter', badStart, []);
    ok(g, 'number of chapter pages checked: ' + n, n > 0);
  }
  // Hindi chapter pages: their addresses are a Latin spelling of the Devanagari name, made by build_pages.py, so the pages
  // are found from the links on each Hindi subject page; every chapter with at least 10 questions has one
  async function hindiChapterPages(A) {
    const g = 'Hindi chapter pages', bad = [];
    let n = 0;
    for (const [i, c] of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'].entries()) {
      const url = `../cbse/class-${i + 1}/hindi/`, doc = new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
      const links = [...doc.querySelectorAll('.chapters a')].filter(a => /^\/cbse\//.test(a.getAttribute('href')));
      const counts = A.bankCounts('Hindi', c), want = A.topicsFor('Hindi', c).filter(t => (counts[t] || 0) >= 10);
      const got = links.map(a => a.querySelector('b').textContent);
      if (want.join('|') !== got.join('|')) bad.push(`Class ${i + 1}: links to ${got.length} of ${want.length} chapters`);
      for (const a of links) {
        n++;
        const href = a.getAttribute('href'), r = await fetch('..' + href);
        if (!/^\/cbse\/class-\d+\/hindi\/[a-z0-9]+(-[a-z0-9]+)*\/$/.test(href) || !r.ok) { bad.push(href + ': bad address or missing'); continue; }
        const page = new DOMParser().parseFromString(await r.text(), 'text/html'), btn = page.querySelector('a.btn');
        const q = btn && new URL(btn.getAttribute('href'), location.href).searchParams, ch = a.querySelector('b').textContent;
        const samples = page.querySelectorAll('.samples .sq').length;
        if (!q || q.get('class') !== c || q.get('subject') !== 'Hindi' || q.get('chapter') !== ch) bad.push(href + ': start button');
        if (!samples || samples > ((counts[ch] || 0) >= 15 ? 8 : 5)) bad.push(`${href}: ${samples} sample questions`);
        if (!page.querySelector('h1 [lang="hi"]')) bad.push(href + ': chapter name not marked as Hindi');
      }
    }
    eq(g, 'every Hindi chapter with 10 or more questions has a page, linked from its subject page, with a few samples and a start button', bad, []);
    ok(g, 'number of Hindi chapter pages checked: ' + n, n >= 100);
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
  // exam chapter pages: /<exam>/<subject>/ lists the chapters as EXAM_CH does; each chapter page has every question on it and
  // a button that opens that chapter in the app
  async function examChapterPages(A) {
    const html = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return new DOMParser().parseFromString(await r.text(), 'text/html'); };
    for (const [list, subs] of Object.entries(A.EXAM_CH)) {
      const crumb = A.EXAM_PAGES[list].crumb, examDoc = await html(`../${list}/`);
      for (const [s, chs] of Object.entries(subs)) {
        const hub = `/${list}/${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`, g = 'Exam chapter pages: ' + hub;
        ok(g, `/${list}/ links to the ${crumb} ${s} chapter list`, !!examDoc.querySelector(`.links a[href="${hub}"]`));
        let hubDoc; try { hubDoc = await html('..' + hub); } catch (e) { ok(g, 'the chapter list page exists (run tools/build_pages.py)', false, String(e)); continue; }
        const links = [...hubDoc.querySelectorAll('.chapters a')];
        eq(g, 'it lists every chapter, most-tested first', links.map(a => a.querySelector('b').textContent), chs.map(c => c[0]));
        const bad = [];
        for (const [k, a] of links.entries()) {
          const c = chs[k], doc = await html('..' + a.getAttribute('href')).catch(() => null);
          if (!doc) { bad.push(a.getAttribute('href') + ': missing'); continue; }
          const n = doc.querySelectorAll('.samples .sq').length, btn = doc.querySelector('a.btn'), q = btn ? new URL(btn.getAttribute('href'), location.href) : null;
          if (n !== c[2]) bad.push(`${a.getAttribute('href')}: ${n} questions, expected ${c[2]}`);
          if (!q || q.hash !== '#' + list || q.searchParams.get('cs') !== s || q.searchParams.get('cc') !== c[0] || q.searchParams.get('cl') !== c[1]) bad.push(`${a.getAttribute('href')}: button ${btn && btn.getAttribute('href')}`);
        }
        eq(g, 'every chapter page has all its questions and opens that chapter in the app', bad, []);
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
    for (const t of [parsing, checking, rules, written, weak, progress, labels, realExam, weekly, greetings, papers, boardPapers, boardPaperPages, banks, generators, customPapers, schoolPages, chapterPages, hindiChapterPages, paperPages, examChapterPages]) {
      try { await t(A, frame.contentWindow); } catch (e) { ok('Setup', t.name + ' ran without an error', false, e && e.stack || String(e)); }
    }
    render();
  }
  run();
})();
