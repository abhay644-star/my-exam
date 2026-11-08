// Journey tests: drive the app in an iframe at phone and desktop width, as a student would use it.
(function () {
  const results = [], frame = document.getElementById('app');
  const ok = (group, name, pass, detail) => results.push({ group, name, pass: !!pass, detail: pass ? '' : (detail || '') });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const W = () => frame.contentWindow, D = () => frame.contentDocument, $ = s => D().querySelector(s), $$ = s => [...D().querySelectorAll(s)];
  const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (f()) return true; } catch (e) {} await sleep(100); } return false; };
  const fire = (el, ev) => el.dispatchEvent(new (W().Event)(ev, { bubbles: true }));
  const visible = sel => $$(sel).filter(e => !e.hidden && e.offsetParent !== null);
  // a screen fits the width: nothing makes the page scroll sideways
  const fits = () => D().documentElement.scrollWidth <= D().documentElement.clientWidth + 1;
  // the outermost elements that stick out past the right edge, for the failure message
  const clipped = el => { for (let a = el.parentElement; a && a !== D().body; a = a.parentElement) { const s = W().getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.clip !== 'auto' || s.clipPath !== 'none') return true; } return false; };
  const wide = () => { const cw = D().documentElement.clientWidth, out = [];
    for (const el of D().querySelectorAll('body *')) { const r = el.getBoundingClientRect();
      if (r.width && r.right > cw + 1 && !clipped(el) && !(el.parentElement && el.parentElement.getBoundingClientRect().right > cw + 1)) {
        const q = el.closest('.q'); out.push(`${el.tagName.toLowerCase()}.${el.className || ''} in ${q ? q.id : 'page'} (right ${Math.round(r.right)})`); }
      if (out.length >= 6) break; }
    if (!out.length) for (const el of D().querySelectorAll('body *')) {  // nothing visible sticks out: name what is clipped
      const r = el.getBoundingClientRect(); if (!r.width || r.right <= cw + 1 || el.closest('.katex-mathml')) continue;
      let a = el.parentElement; while (a && a !== D().body && W().getComputedStyle(a).overflowX === 'visible' && W().getComputedStyle(a).clip === 'auto') a = a.parentElement;
      const q = el.closest('.q'); out.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal != null ? el.className.baseVal : el.className).slice(0, 30)} in ${q ? q.id : 'page'} (right ${Math.round(r.right)}, held by ${a ? a.tagName.toLowerCase() + '.' + String(a.className).slice(0, 30) + ' right ' + Math.round(a.getBoundingClientRect().right) : '-'})`);
      if (out.length >= 4) break; }
    return `scrollWidth ${D().documentElement.scrollWidth}, width ${cw}: ` + out.join('; '); };
  async function load(url) { frame.src = 'about:blank'; await sleep(50); frame.src = url; await until(() => W().__aaTest && D().readyState === 'complete', 15000); await sleep(300); }
  // a link the app tidies out of the address bar (and ?test with it, so there is no __aaTest): wait for what it shows instead
  async function loadLink(url, shown) { frame.src = 'about:blank'; await sleep(50); frame.src = url; await until(() => D().readyState === 'complete' && shown(), 15000); await sleep(300); }
  function answer(i, wrong) {  // answers question i: first option (a wrong one if asked), or a typed value
    const q = $('#q' + i), r = q.querySelector('input[type=radio]');
    if (r) { const pick = wrong ? $$(`#q${i} input[type=radio]`).find(x => +x.value !== W().__aaTest.paper.qs[i].parts[0].ans) : r; pick.checked = true; fire(pick, 'change'); return; }
    const t = q.querySelector('input[type=text],textarea'); t.value = wrong ? 'zzz 987' : '7'; fire(t, 'input');
  }

  async function journey(width, height) {
    const g = `Journey (${width} px)`;
    frame.style.width = width + 'px'; frame.style.height = height + 'px';
    await load('../index.html?test'); W().localStorage.clear();
    await load('../index.html?test#home');
    ok(g, 'home page shows and fits the width', !$('#homeView').hidden && fits(), wide());
    const pop = [...D().querySelectorAll('#homeView .popular a')].map(a => a.getAttribute('href'));
    const dead = [];
    for (const h of pop) { const r = await fetch('..' + h + 'index.html').catch(() => null); if (!r || !r.ok) dead.push(h); }
    ok(g, 'home page has popular practice links that all open', pop.length >= 5 && !dead.length, `${pop.length} links; missing ${dead.join(', ')}`);
    ok(g, 'home page has the three how-it-works steps', D().querySelectorAll('#homeView .steps li').length === 3);
    // the teachers' page: linked from the home page, and its "Set a class test" link opens School with the challenge panel open
    const tr = await fetch('../teachers/index.html').catch(() => null), tdoc = tr && tr.ok ? new DOMParser().parseFromString(await tr.text(), 'text/html') : null;
    ok(g, 'home page links to the teachers\' page, which links to the challenge panel', !!$('#homeView a[href="teachers/"]') && !!tdoc && !!tdoc.querySelector('a.btn[href="/?challenge#school"]'));
    await load('../index.html?test&challenge#school');
    ok(g, '?challenge opens School with "Challenge your class or friends" open', !$('#setup').hidden && $('#challenge').open, `setup ${!$('#setup').hidden}, open ${$('#challenge').open}`);
    await load('../index.html?test#home');

    // contact form: a new sum each time, and a reported question named in the email subject (sending is replaced here)
    $('#contactOpen').click(); await sleep(100);
    const sum = $('#cCheckQ').textContent.match(/^What is (\d+) \+ (\d+)\?$/), right = sum ? +sum[1] + +sum[2] : 0;
    ok(g, 'the contact form asks a sum', !!sum, $('#cCheckQ').textContent);
    let sentBody = null; W().fetch = async (u, o) => { sentBody = JSON.parse(o.body); return new (W().Response)('{"success":"true"}'); };
    $('#cMsg').value = 'Problem with a question\nScience – Class 10 · Question 5 (Light)\nWhat is wrong: test';
    $('#cCheck').value = String(right + 1); $('#contactForm').requestSubmit(); await sleep(150);
    ok(g, 'the contact form refuses a wrong sum', !sentBody && /Please type the answer/.test($('#cStatus').textContent), $('#cStatus').textContent);
    $('#cCheck').value = String(right); $('#contactForm').requestSubmit(); await until(() => sentBody);
    ok(g, 'a reported question is named in the email subject', sentBody && sentBody.subject === 'Problem: Science – Class 10 · Question 5 (Light)', sentBody && sentBody.subject);
    await load('../index.html?test#home');

    // 1. start a school paper
    W().location.hash = '#school'; await until(() => !$('#setup').hidden);
    $('#klass').value = 'X'; fire($('#klass'), 'change'); $('#subject').value = 'Science'; fire($('#subject'), 'change');
    await sleep(300);
    ok(g, 'School screen fits the width', fits());
    $('#mode_exam').checked = true; fire($('#mode_exam'), 'change');
    $('[data-preset="quick"]').click();
    const started = await until(() => !$('#test').hidden && $$('#sheet .q').length);
    const n = $$('#sheet .q').length;
    ok(g, 'Quick quiz starts with 10 questions', started && n === 10, `${n} questions`);
    ok(g, 'test screen fits the width', fits());
    // on a phone, scrolling down the paper shrinks the bar to one line (timer, Questions, Submit); back at the top it is full size
    if (width < 600) {
      const full = $('#bar').offsetHeight;
      // (headless Edge draws no frames, so the scroll event a browser sends after scrolling is sent here)
      W().scrollTo(0, 1500); W().dispatchEvent(new (W().Event)('scroll')); await sleep(150);
      const mini = $('#bar').offsetHeight;
      ok(g, 'scrolled on a phone, the bar is one line and still fits', $('#bar').classList.contains('mini') && mini < full && mini <= 70 && !!$('#submitBtn').offsetParent && !!$('#navBtn').offsetParent && fits(), `${full} px → ${mini} px`);
      W().scrollTo(0, 0); W().dispatchEvent(new (W().Event)('scroll')); await sleep(150);
      ok(g, 'back at the top, the bar is full size again', !$('#bar').classList.contains('mini'));
    }

    // 2. answer two, flag one, open the question navigator
    answer(0, true); answer(1); $('#q2 [data-flag]').click(); await sleep(150);  // one sure mistake, for My mistakes and the backup check
    ok(g, 'answer count updates (2 of …)', /^2$/.test($('#answered').textContent), $('#answered').textContent);
    ok(g, 'flagging shows "Review flagged (1)"', !$('#flagBtn').hidden && /\(1\)/.test($('#flagBtn').textContent), $('#flagBtn').textContent);
    $('#navBtn').click(); await sleep(150);
    const nb = $$('#nav .nb');
    ok(g, 'navigator lists every question and marks answered and flagged ones', !$('#navWrap').hidden && nb.length === n && nb[0].classList.contains('done') && nb[2].classList.contains('flag'));
    $('#navBtn').click();

    // 3. submit → Review blank → show all
    $('#submitBtn').click(); await sleep(150);
    ok(g, 'submit box offers "Review blank (8)" and "Review flagged (1)"', !$('#confirm').hidden && /\(8\)/.test($('#confirmBlank').textContent) && /\(1\)/.test($('#confirmFlag').textContent), $('#confirmBlank').textContent + ' / ' + $('#confirmFlag').textContent);
    $('#confirmBlank').click(); await sleep(200);
    ok(g, 'Review blank shows only the 8 blank questions', visible('#sheet .q').length === 8 && !$('#blankBtn').hidden, `${visible('#sheet .q').length} shown`);
    answer(3); await sleep(150);
    ok(g, 'a question answered while filtered stays on screen', !$('#q3').hidden);
    $('#blankBtn').click(); await sleep(150);
    ok(g, 'Show all questions brings back all of them', visible('#sheet .q').length === n);

    // 4. close and reopen: the paper and answers are kept
    await sleep(800);  // answers are saved half a second after typing
    await load('../index.html?test#home');
    ok(g, 'after reopening, the home page offers to resume the paper', !$('#resumeBox').hidden, $('#resumeBox').textContent);
    $('#resumeBtn').click(); await until(() => !$('#test').hidden);
    const kept = $('#q0 input:checked') || ($('#q0 input[type=text]') && $('#q0 input[type=text]').value);
    ok(g, 'resumed paper has the same answers and flag', !!kept && /^3$/.test($('#answered').textContent) && $('#q2 [data-flag]').getAttribute('aria-pressed') === 'true', `answered ${$('#answered').textContent}`);
    // leaving mid-paper by the top menu keeps it unfinished: the exam page offers to resume it, and a new paper asks first
    W().location.hash = '#jee-main'; await until(() => !$('#jeeView').hidden && $('#jeeList [data-mode="exam"]'));
    ok(g, 'leaving mid-paper, the exam page offers to resume it', !$('#resumeBox').hidden && /unfinished/.test($('#resumeBox').textContent), $('#resumeBox').textContent);
    let asked = 0; W().confirm = () => { asked++; return false; };
    $('#jeeList [data-mode="exam"]').click(); await sleep(300);
    ok(g, 'starting another paper asks first, and No keeps the unfinished one', asked === 1 && $('#test').hidden && !!W().localStorage.getItem('aa-active'), `asked ${asked}, test shown ${!$('#test').hidden}`);
    $('#resumeBtn').click(); await until(() => !$('#test').hidden);

    // 5. submit and review (with practice on the two days before today, so this paper makes a 3-day streak)
    const dk = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    W().localStorage.setItem('aa-days', JSON.stringify([dk(1), dk(2), dk(4)]));
    $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
    await until(() => !$('#results').hidden && $$('#results .res .q').length);
    const rq = $$('#results .res .q');
    ok(g, 'results show a score, the marked paper and a solution for every question', rq.length === n && rq.every(q => q.querySelector('.sol')) && /\d/.test($('#results').textContent));
    ok(g, 'results screen fits the width', fits());
    const scoreLine = $('#results .score').textContent.replace(/\s+/g, ' ');
    ok(g, 'results show the practice streak (3 days in a row; the gap before does not count)', /Practice streak: 3 days in a row/.test(scoreLine) && !/personal best|Your best/.test(scoreLine), scoreLine.slice(0, 300));
    ok(g, 'the score says "marks" and how many questions were answered', /\d+ \/ \d+ marks/.test(scoreLine) && /10 questions · 3 answered/.test(scoreLine), scoreLine.slice(0, 200));
    const lede = $('.top .lede');
    ok(g, width < 600 ? 'on a phone, the results screen has the smaller header' : 'on a computer, the full header stays', width < 600 ? lede.offsetParent === null : lede.offsetParent !== null);
    // "Your next step": names the weakest chapter, and its button starts a practice test on just that chapter
    const nx = $('#results .next');
    const nxName = nx && nx.querySelector('b') ? nx.querySelector('b').textContent : '';
    ok(g, 'results show "Your next step" with the weakest chapter and one Practise button', nx && nxName && nx.querySelectorAll('button').length === 1, nx ? nx.textContent.slice(0, 120) : 'missing');
    const advice = ($('#results .score .stack > span:nth-child(2)') || { textContent: '' }).textContent;
    ok(g, 'the advice line names the same chapter first as "Your next step"', !nxName || new RegExp('(revise|Focus next on) ' + nxName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(advice), `advice "${advice}" / next step "${nxName}"`);
    const blankBtn = $('#retryBlank');
    ok(g, 'results offer "Try the 7 I left blank"', blankBtn && /7/.test(blankBtn.textContent), blankBtn ? blankBtn.textContent : 'missing');
    $('#onlyLeftBlank') && $('#onlyLeftBlank').click(); await sleep(100);
    ok(g, 'the "left blank" filter shows only the blank questions', $$('#results .res .q').filter(q => !q.hidden).length === 7);
    blankBtn.click(); await until(() => !$('#test').hidden);
    ok(g, 'retrying the blank ones starts a 7-question paper', $$('#sheet .q').length === 7, `${$$('#sheet .q').length}`);
    // finish the retry so this attempt is in the history, then check the next step's comparison and its button
    $('#submitBtn').click(); await sleep(100); $('#confirmYes').click(); await until(() => !$('#results').hidden && $('#results .score'));
    const nx2 = $('#results .next');
    if (nx2) {
      ok(g, 'a second attempt compares with the last one, or says why not', /Your last|Last time|not compared/.test(nx2.textContent) || !$$('#results .next .hint').length, nx2.textContent.slice(0, 200));
      const chap = nx2.querySelector('b').textContent, setB = W().localStorage.getItem('mpp-settings');
      nx2.querySelector('[data-next]').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
      const topics = $$('#sheet .qtopic').map(t => t.textContent);
      ok(g, `"Practise ${chap}" starts a practice test on that chapter only`, topics.length && topics.every(t => t.includes(chap)), topics.slice(0, 3).join(' / '));
      ok(g, '...and leaves the saved settings (mode, chapters, length) as they were', W().localStorage.getItem('mpp-settings') === setB, W().localStorage.getItem('mpp-settings'));
      // the top menu during a paper asks first; No stays on the paper
      let askedNav = 0; W().confirm = () => { askedNav++; return false; };
      $('.topnav a[href="#home"]').click(); await sleep(150);
      ok(g, 'the top menu during a paper asks before leaving, and No stays on the paper', askedNav === 1 && !$('#test').hidden, `asked ${askedNav}, test shown ${!$('#test').hidden}`);
    }
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);

    // 5b. back up the progress, clear it, restore it: everything comes back, and restoring twice adds nothing
    W().location.hash = '#school'; await until(() => !$('#setup').hidden && $('#history'));
    ok(g, 'the progress card offers "Save a backup" and "Restore a backup"', !!$('#history #backupSave') && !!$('#history #backupLoad'));
    const A = W().__aaTest, LS = W().localStorage, hist0 = LS.getItem('aa-history'), mis0 = JSON.parse(LS.getItem('aa-mistakes') || '[]').length;
    const bk = JSON.parse(JSON.stringify(A.backupData()));
    LS.removeItem('aa-history'); LS.removeItem('aa-mistakes');
    const r1 = A.mergeBackup(bk), r2 = A.mergeBackup(bk);
    ok(g, 'restoring a backup brings back every paper and mistake', LS.getItem('aa-history') === hist0 && r1.papers === JSON.parse(hist0).length && r1.mist === mis0 && mis0 > 0, `papers ${r1.papers}, mistakes ${r1.mist} of ${mis0}`);
    ok(g, 'restoring the same backup again adds nothing twice', r2.papers === 0 && r2.mist === 0 && LS.getItem('aa-history') === hist0, `${r2.papers} / ${r2.mist}`);
    let refused = false; try { A.mergeBackup({ app: 'other', data: {} }); } catch (e) { refused = true; }
    ok(g, 'a file that is not a backup is refused', refused);
    // a hand-edited backup: markup or script in any field must not reach the page or this device's storage
    const hist1 = LS.getItem('aa-history'), mis1 = LS.getItem('aa-mistakes'), set1 = LS.getItem('mpp-settings'), want1 = LS.getItem('aa-want');
    const goodQ = JSON.parse(mis1)[0].q, evil = [
      { k: 'x1', d: 1, src: 'S', q: Object.assign({}, goodQ, { text: 'Hi <img src=x onerror="window.__pwned=1">' }) },
      { k: 'x2', d: 1, src: 'S', q: Object.assign({}, goodQ, { text: '<script>window.__pwned=1</script>' }) },
      { k: 'x3', d: 1, src: 'S', q: Object.assign({}, goodQ, { text: '<a href="javascript:alert(1)">a</a>' }) },
      { k: 'x4', d: 1, src: 'S', q: Object.assign({}, goodQ, { text: '<img src="https://evil.example/t.png">' }) },
      { k: 'x5', d: 1, src: 'S', q: Object.assign({}, goodQ, { text: '<span style="background:url(https://evil.example)">a</span>' }) },
      { k: 'x6', d: 1, src: 'S', q: Object.assign({}, goodQ, { text: 'Fine: x<sup>2</sup> and <table class="t"><tr><td>1</td></tr></table>' }) }];
    LS.removeItem('mpp-settings'); LS.removeItem('aa-want');
    const r3 = A.mergeBackup({ app: 'my-exam.in', v: 1, data: {
      'aa-history': JSON.stringify([{ d: 5, subj: 'X', cls: 'VII', pct: '<img src=x onerror=alert(1)>', nq: 3 }, { d: 6, subj: 'X', cls: 'VII', pct: 50, nq: '<b>' },
        { d: 7, subj: '<img src=x onerror="window.__pwned=1">', cls: 'VII', pct: 40, nq: 4, mode: 'practice', exam: false, mix: { E: 1, M: 1, C: 1, X: 1 }, top: { a: [1, 2] } }]),
      'aa-mistakes': JSON.stringify(evil),
      'mpp-settings': JSON.stringify({ mix: { E: '"><img src=x onerror=alert(1)>' }, marks: {} }), 'aa-want': JSON.stringify(['jee-main']) } });
    const histNow = JSON.parse(LS.getItem('aa-history')), misNow = JSON.parse(LS.getItem('aa-mistakes'));
    ok(g, 'a crafted backup: only the sound paper record is added', r3.papers === 1 && histNow.length === JSON.parse(hist1).length + 1, `${r3.papers}`);
    ok(g, 'a crafted backup: questions with script, event handlers, links or outside images are dropped; plain markup is kept', r3.mist === 1 && misNow.some(m => m.k === 'x6') && !misNow.some(m => /^x[1-5]$/.test(m.k)), `${r3.mist}: ${misNow.filter(m => /^x\d$/.test(m.k)).map(m => m.k)}`);
    ok(g, 'a crafted backup: settings with markup are refused, plain exam requests are kept', LS.getItem('mpp-settings') == null && LS.getItem('aa-want') === '["jee-main"]');
    A.renderHistory();
    ok(g, 'a crafted backup: the progress card shows the text as text and runs nothing', !W().__pwned && !$('#history img') && /&lt;img/.test($('#history').innerHTML));
    LS.setItem('aa-history', hist1); LS.setItem('aa-mistakes', mis1);
    if (set1 == null) LS.removeItem('mpp-settings'); else LS.setItem('mpp-settings', set1);
    if (want1 == null) LS.removeItem('aa-want'); else LS.setItem('aa-want', want1);
    A.renderHistory();

    // 6. practice mode: check an answer
    W().location.hash = '#school'; await until(() => !$('#setup').hidden);
    $('#mode_practice').checked = true; fire($('#mode_practice'), 'change');
    $('[data-preset="quick"]').click(); await until(() => !$('#test').hidden && $('#q0 [data-check]'));
    answer(0); $('#q0 [data-check]').click(); await sleep(200);
    ok(g, 'practice mode: "Check answer" shows the result and the explanation', !$('#fb0').hidden && /Explanation|Working/.test($('#fb0').textContent));
    ok(g, 'after "Check answer", focus moves to the result', W().document.activeElement === $('#fb0'), (W().document.activeElement || {}).id);
    const nb0 = $('#nav [data-go="0"]').getAttribute('aria-label'), nb1 = $('#nav [data-go="1"]').getAttribute('aria-label');
    ok(g, 'the question navigator says each question\'s state', /^Go to question 1: (correct|not fully correct)$/.test(nb0) && nb1 === 'Go to question 2: not answered', `${nb0} / ${nb1}`);
    $('#submitBtn').focus(); $('#submitBtn').click(); await sleep(100);
    const dlg = $('#confirm');
    ok(g, 'the finish box is a dialog and focus moves to its title', dlg.getAttribute('role') === 'dialog' && !dlg.hidden && W().document.activeElement === $('#confirmTitle'), (W().document.activeElement || {}).id);
    dlg.dispatchEvent(new (W().KeyboardEvent)('keydown', { key: 'Escape', bubbles: true })); await sleep(50);
    ok(g, 'Escape closes the finish box and puts focus back on Finish', dlg.hidden && W().document.activeElement === $('#submitBtn'), (W().document.activeElement || {}).id);
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);

    // 7. a class challenge: one link gives everyone the same questions, and its code goes into the results and the score message
    W().location.hash = '#school'; await until(() => !$('#setup').hidden);
    $('#mode_exam').checked = true; fire($('#mode_exam'), 'change');
    $('#challenge').open = true; $('#chSize').value = 'quick'; $('#chName').value = 'Class 10B test'; $('#chMake').click(); await sleep(200);
    const link = $('#chLink') ? $('#chLink').value : '', code = (link.match(/[?&]ch=([0-9A-Z]{4})(&|$)/) || [])[1];
    ok(g, 'Create challenge link gives a link with a 4-character code and the name', !!code && /[?&]cn=Class\+10B\+test/.test(link) && $('#chOut').textContent.includes(code), link || $('#chOut').textContent);
    ok(g, 'the challenge link records the bank size, so it gives the same questions after the bank grows', /[?&]n=[1-9]\d*(&|$)/.test(link), link);
    ok(g, 'the challenge panel fits the width', fits(), wide());
    const sheetText = () => $$('#sheet .q').map(q => q.textContent.replace(/\s+/g, ' ').slice(0, 300));
    async function openLink(query) {
      await load('../index.html?test&' + query);
      return await until(() => !$('#invite').hidden && $('#inviteStart')) ? $('#invite').textContent.replace(/\s+/g, ' ') : '';
    }
    let banner = await openLink(link.split('?')[1] || '');
    ok(g, 'the challenge link opens with the challenge name, code and "Start the challenge"', banner.includes('Class challenge: Class 10B test') && banner.includes(code) && /Start the challenge/.test(banner), banner);
    $('#inviteStart').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
    const first = sheetText();
    ok(g, 'the challenge starts with the 10 questions of a quick quiz', first.length === 10, `${first.length} questions`);
    answer(0); $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
    await until(() => !$('#results').hidden && $('#results .score'));
    const chScore = $('#results .score') ? $('#results .score').textContent.replace(/\s+/g, ' ') : '';
    ok(g, 'a second Class 10 Science paper compares with the personal best', /New personal best for Class 10 Science: \d+% \(before: \d+%\)|Your best for Class 10 Science: \d+%/.test(chScore), chScore.slice(0, 300));
    ok(g, 'challenge results name the challenge code',$('#results').textContent.includes(`Class challenge ${code}`), $('#results .score') ? $('#results').textContent.slice(0, 200) : 'no results');
    $('#shareBtn').click(); await sleep(150);
    const wa = decodeURIComponent(($('#sharePanel a.btnlink') || { href: '' }).href);
    ok(g, 'the score message names the challenge and links to the same challenge', wa.includes(`Challenge ${code} (Class 10B test): I scored`) && wa.includes(`ch=${code}`) && /[?&]p=\d+\./.test(wa), wa.slice(0, 300));
    ok(g, 'challenge results fit the width', fits(), wide());
    await openLink(link.split('?')[1] || ''); $('#inviteStart').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
    const second = sheetText();
    ok(g, 'opening the challenge link again gives exactly the same questions', second.length === first.length && second.every((t, i) => t === first[i]), `${second.length} vs ${first.length}; first difference at ${second.findIndex((t, i) => t !== first[i])}`);
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);
    // a code that does not belong to the paper code (an edited link) is ignored: it is an ordinary shared paper
    banner = await openLink((link.split('?')[1] || '').replace(`ch=${code}`, `ch=${code === 'ZZZZ' ? 'YYYY' : 'ZZZZ'}`));
    ok(g, 'an edited challenge code is ignored (the same paper, not a challenge)', !banner.includes('Class challenge') && /Take the same paper/.test(banner), banner);
    // 7b. today's challenge: every chapter, the same questions for everyone today, and the student's own settings kept
    await load('../index.html?test#home');
    const counts = W().__aaTest.homeCounts(), nPapers = Object.values(W().__aaTest.EXAM_PAGES).reduce((s, e) => s + e.papers.length, 0);
    ok(g, 'the home page shows the question and paper counts', /^\d{1,2}(,\d{2,3})+\+$|^\d{3}\+$/.test($('#qCount').textContent) && counts.n >= 9000 && +$('#pCount').textContent === nPapers && nPapers >= 20, `${$('#qCount').textContent} / ${$('#pCount').textContent} of ${nPapers}`);
    W().location.hash = '#school'; await until(() => !$('#setup').hidden);
    $('#klass').value = 'X'; fire($('#klass'), 'change'); $('#subject').value = 'Science'; fire($('#subject'), 'change'); await sleep(300);
    $('#mode_exam').checked = true; fire($('#mode_exam'), 'change');
    $('#nq').value = '25'; fire($('#nq'), 'input'); fire($('#nq'), 'change'); await sleep(100);
    ok(g, 'today\'s challenge is offered below the presets and names the class and subject', !!$('#dailyBtn') && /Class 10 Science/.test($('#dailyHint').textContent), $('#dailyHint').textContent);
    $('#dailyBtn').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
    const daily1 = sheetText(), dTopics = new Set($$('#sheet .qtopic').map(t => t.textContent));
    ok(g, 'today\'s challenge is 10 questions from several chapters', daily1.length === 10 && dTopics.size >= 3, `${daily1.length} questions, ${dTopics.size} chapters`);
    answer(0); $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
    await until(() => !$('#results').hidden && $('#results .score'));
    ok(g, 'its results say every student had these questions today', /Today's challenge, .*every student taking Class 10 Science today had these questions/.test($('#results').textContent.replace(/\s+/g, ' ')), $('#results').textContent.replace(/\s+/g, ' ').slice(0, 300));
    W().location.hash = '#school'; await until(() => !$('#setup').hidden);
    ok(g, 'after today\'s challenge, the student\'s own number of questions is back', $('#nq').value === '25', $('#nq').value);
    $('#dailyBtn').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
    const daily2 = sheetText();
    ok(g, 'taking today\'s challenge again gives exactly the same questions', daily2.length === 10 && daily2.every((t, i) => t === daily1[i]), `first difference at ${daily2.findIndex((t, i) => t !== daily1[i])}`);
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);
    // the teachers' page: its sample challenge link works, and the printable score sheet has a row per student
    frame.src = '../teachers/index.html'; await until(() => D().querySelector('a[href*="ch=DEMO"]'), 10000);
    const sample = D().querySelector('a[href*="ch=DEMO"]'), sheetLink = D().querySelector('a[href="score-sheet.html"]');
    banner = await openLink(sample ? sample.getAttribute('href').split('?')[1] : '');
    ok(g, 'the teachers\' sample challenge opens as a class challenge', banner.includes('Class challenge: Sample challenge') && banner.includes('DEMO'), banner);
    $('#inviteStart').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
    const sTopics = $$('#sheet .qtopic').map(t => t.textContent);
    ok(g, 'the sample challenge is a 10-question test on Chemical Reactions and Equations', sTopics.length === 10 && sTopics.every(t => t.includes('Chemical Reactions and Equations')), sTopics.slice(0, 2).join(' / '));
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);
    frame.src = '../teachers/score-sheet.html'; await until(() => D().querySelectorAll('#rows tr').length, 10000);
    ok(g, 'the teachers\' page links to a printable score sheet with 40 rows', !!sheetLink && D().querySelectorAll('#rows tr').length === 40, `${D().querySelectorAll('#rows tr').length} rows`);
    await load('../index.html?test#home');  // the app tidies a shared link out of the address bar, ?test with it

    // 8. an official paper: questions, maths and marking
    W().location.hash = '#jee-main'; await until(() => $('#jeeList [data-mode="exam"]'));
    $('#jeeList [data-mode="exam"]').click();
    await until(() => !$('#test').hidden && $$('#sheet .q').length, 20000);
    await until(() => $$('#sheet .katex').length > 20, 15000);
    ok(g, 'JEE Main paper opens with 75 questions and its maths typeset', $$('#sheet .q').length === 75 && $$('#sheet .katex').length > 20 && !$$('#sheet .katex-error').length, `${$$('#sheet .q').length} questions, ${$$('#sheet .katex').length} formulas, ${$$('#sheet .katex-error').length} errors`);
    ok(g, 'official paper fits the width', fits(), wide());
    ok(g, 'an official paper shows only its own instructions (not the school ones)', visible('#sheet ol.instr').length === 1 && /National Testing Agency/.test(visible('#sheet ol.instr')[0].textContent), visible('#sheet ol.instr').map(o => o.textContent.slice(0, 60)).join(' | '));
    $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
    await until(() => !$('#results').hidden);
    ok(g, 'an all-blank official paper scores 0 out of 300', /\b0\s*\/\s*300\b/.test($('#results').textContent.replace(/\s+/g, ' ')));

    // 8b. practise by chapter: every NEET question on one chapter, from all the papers, each named with its paper
    W().location.hash = '#neet'; await until(() => $('#chPick [data-chsubj="Biology"]'));
    const chips = $$('#chPick [data-chsubj]').map(b => b.textContent);
    ok(g, 'the NEET screen offers Practise by chapter for Physics, Chemistry and Biology', !$('#chPick').hidden && chips.join() === Object.keys(W().__aaTest.EXAM_CH.neet).join() && chips.length === 3, chips.join());
    $('#chPick [data-chsubj="Chemistry"]').click(); await sleep(100);
    const chem = W().__aaTest.EXAM_CH.neet.Chemistry, btns = $$('#chPick .chbtn');
    ok(g, 'choosing Chemistry lists its chapters, most-tested first', $('#chPick [data-chsubj="Chemistry"]').getAttribute('aria-pressed') === 'true' && btns.length === chem.length && btns[0].textContent.startsWith(chem[0][0]) && chem.every((c, i) => !i || chem[i - 1][2] >= c[2]), `${btns.length} of ${chem.length}: ${btns[0] && btns[0].textContent}`);
    ok(g, 'the chapter list fits the width', fits(), wide());
    btns[0].click(); await until(() => !$('#test').hidden && $$('#sheet .q').length, 20000);
    await sleep(1500);  // maths typeset and fitted
    const tags = $$('#sheet .qtopic').map(t => t.textContent);
    ok(g, `the chapter (${chem[0][0]}) opens with all its ${chem[0][2]} questions, each named with its paper`, tags.length === chem[0][2] && tags.every(t => /^Chemistry · NEET \(UG\) 20\d\d · .+ · Q\.\d+$/.test(t)) && new Set(tags.map(t => t.split(' · ')[1])).size === chem[0][3].length, `${tags.length} questions; ${tags[0]}`);
    ok(g, 'NEET options keep their (1)–(4) labels in chapter practice', /^\(1\)/.test($('#q0 .opt b').textContent) && !!$('#q0 [data-check]'), $('#q0 .opt b') && $('#q0 .opt b').textContent);
    ok(g, 'chapter practice fits the width, with no maths errors', fits() && !$$('#sheet .katex-error').length, wide());
    ok(g, 'chapter practice shows only its own instructions', visible('#sheet ol.instr').length === 1 && /Each question shows the paper it came from/.test(visible('#sheet ol.instr')[0].textContent), visible('#sheet ol.instr').map(o => o.textContent.slice(0, 60)).join(' | '));
    answer(0, true); $('#q0 [data-check]').click(); await sleep(200);
    ok(g, 'chapter practice: "Check answer" marks a wrong answer and shows the explanation', !$('#fb0').hidden && /Explanation|Working/.test($('#fb0').textContent) && W().__aaTest.paper.qs[0].got < 0, $('#fb0').textContent.slice(0, 120));
    $('#submitBtn').click(); await sleep(100); $('#confirmYes').click(); await until(() => !$('#results').hidden && $('#results .score'));
    const resTxt = $('#results').textContent.replace(/\s+/g, ' ');
    ok(g, 'its results name the exam, subject and chapter, and each question\'s paper', resTxt.includes(`NEET (UG) · Chemistry · ${chem[0][0]}`) && /Chemistry · NEET \(UG\) 20\d\d · .+ · Q\.\d+ · MCQ/.test(resTxt), resTxt.slice(0, 300));
    const mk = JSON.parse(W().localStorage.getItem('aa-mistakes') || '[]');
    ok(g, 'a wrong answer goes to My mistakes under its own paper\'s name', mk.length && /^NEET \(UG\) 20\d\d · /.test(mk[0].src) && mk[0].q.ol === '1234', mk[0] && mk[0].src);
    $('#shareBtn').click(); await sleep(150);
    const chLink = (decodeURIComponent(($('#sharePanel a.btnlink') || { href: '' }).href).match(/https:\/\/my-exam\.in\/\?\S+/) || ['https://my-exam.in/'])[0], chQ = new URL(chLink).searchParams;
    ok(g, 'the score message links to the same chapter', chQ.get('go') === 'neet/chapter' && chQ.get('cs') === 'Chemistry' && chQ.get('cc') === chem[0][0], chLink);
    ok(g, 'chapter results fit the width', fits(), wide());
    await loadLink('../index.html?test&' + chQ.toString(), () => !$('#invite').hidden && $('#chPick .chbtn.hl'));
    ok(g, 'the shared chapter link opens the NEET screen with that chapter marked', !$('#jeeView').hidden && /The chapter, NEET \(UG\) Chemistry · /.test($('#invite').textContent) && !!$('#chPick .chbtn.hl') && $('#chPick .chbtn.hl').textContent.startsWith(chem[0][0]), $('#invite').textContent.slice(0, 200));
    // an exam chapter page (/neet/chemistry/<chapter>/) fits a phone, and its button opens the app with that chapter marked
    frame.src = '../neet/chemistry/'; await until(() => D().querySelector('.chapters a') && D().readyState === 'complete', 10000);
    const chPage = D().querySelector('.chapters a').getAttribute('href');
    frame.src = '..' + chPage; await until(() => D().querySelector('a.btn') && D().readyState === 'complete', 10000); await sleep(1500);
    ok(g, 'an exam chapter page fits the width, with its maths typeset', fits() && !D().querySelectorAll('.katex-error').length, wide());
    await loadLink('../index.html?test&' + D().querySelector('a.btn').getAttribute('href').replace(/^\/\?/, ''), () => $('#chPick .chbtn.hl'));
    ok(g, 'its Practise button opens the NEET screen with that chapter marked', !$('#jeeView').hidden && !!$('#chPick .chbtn.hl') && $('#chPick .chbtn.hl').textContent.startsWith(chem[0][0]), chPage);

    // 8c. spaced revision: a mistake is due a day later; right once, it comes back in 3 days; right again, it leaves the list
    const DAY = 864e5, mkKey = mk[0] && mk[0].k, rec = () => JSON.parse(W().localStorage.getItem('aa-mistakes') || '[]').find(m => m.k === mkKey);
    const makeDue = () => { const a = JSON.parse(W().localStorage.getItem('aa-mistakes')); a.forEach(m => { m.due = m.k === mkKey ? Date.now() - 1000 : Date.now() + DAY; }); W().localStorage.setItem('aa-mistakes', JSON.stringify(a)); };
    await load('../index.html?test#home');
    const r0 = rec();
    ok(g, 'a new mistake is due again a day later, and the home page does not ask for it yet', r0 && r0.st === 0 && Math.abs(r0.due - Date.now() - DAY) < 600000 && $('#dueBox').hidden, r0 && JSON.stringify({ st: r0.st, due: r0.due }));
    async function reviseRight() {
      makeDue(); await load('../index.html?test#home');
      const box = $('#dueBox').hidden ? '' : $('#dueBox').textContent.replace(/\s+/g, ' ');
      $('#dueStart') && $('#dueStart').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
      const n = $$('#sheet .q').length, p = W().__aaTest.paper.qs[0].parts[0], r = $(`#q0 input[type=radio][value="${p.ans}"]`);
      if (r) { r.checked = true; fire(r, 'change'); }
      $('#submitBtn').click(); await sleep(100); $('#confirmYes').click(); await until(() => !$('#results').hidden && $('#results .score'));
      return { box, n, res: $('#results').textContent.replace(/\s+/g, ' ') };
    }
    const v1 = await reviseRight(), rv1 = rec();
    ok(g, 'when it is due, the home page offers it, and the revision paper has just that question', /^1 question from My mistakes is due for revision today/.test(v1.box) && v1.n === 1, `${v1.box} / ${v1.n} questions`);
    ok(g, 'answered right once, it stays and comes back in 3 days', rv1 && rv1.st === 1 && Math.abs(rv1.due - Date.now() - 3 * DAY) < 600000 && /1 answered right will come back on .+ for one more check/.test(v1.res), (rv1 ? JSON.stringify({ st: rv1.st }) : 'gone') + ' / ' + v1.res.slice(0, 200));
    const v2 = await reviseRight();
    ok(g, 'answered right a second time, it leaves My mistakes', !rec() && /1 answered right a second time and removed from My mistakes/.test(v2.res), v2.res.slice(0, 200));
    await load('../index.html?test#home');

    // 8b. this week's free mocks: one paper per exam on the home page; Start opens the exam's page and starts that timed paper
    const wk = $$('#weekly [data-weekly]');
    ok(g, "the home page shows this week's three free mocks", !$('#weekly').hidden && wk.length === 3, `${wk.length} buttons`);
    ok(g, "this week's mocks fit the width", fits(), wide());
    const wn = wk.find(b => /^neet\//.test(b.dataset.weekly));
    if (wn) {
      const wid = wn.dataset.weekly.split('/')[1]; W().confirm = () => true;
      wn.click(); await until(() => !$('#test').hidden && W().__aaTest.paper && W().__aaTest.paper.exam, 20000);
      const wp = W().__aaTest.paper;
      ok(g, "Start on this week's NEET mock opens that paper as a timed exam", wp && wp.exam && wp.exam.id === wid && wp.mode === 'exam' && W().location.hash === '#neet', `${wp && wp.exam && wp.exam.id}, ${wp && wp.mode}, ${W().location.hash}`);
      W().localStorage.removeItem('aa-active'); W().localStorage.removeItem('aa-active-paper');
      await load('../index.html?test#home');
    }

    // 8c. festival greeting: a test greeting for every date, so the check does not depend on today's date
    const GA = W().__aaTest;
    GA.GREETS.unshift({ id: 'test', from: '2000-01-01', to: '2999-12-31', html: '<span><b>Happy festival!</b> A test greeting long enough to wrap onto several lines on a phone screen, to check that it and its Close button fit.</span>' });
    W().localStorage.removeItem('aa-greet-test'); GA.renderGreet();
    const gb = $('#greet'), gc = $('#greet [data-greetclose]');
    ok(g, 'the festival greeting shows on the home page and fits the width', !gb.hidden && gc && fits() && gc.getBoundingClientRect().right <= W().innerWidth, wide());
    ok(g, 'its Close button is a 44 px touch target', gc && gc.getBoundingClientRect().height >= 44, gc && String(gc.getBoundingClientRect().height));
    if (gc) gc.click();
    GA.renderGreet();
    ok(g, 'once closed, the greeting stays closed', gb.hidden && W().localStorage.getItem('aa-greet-test') === 'closed');
    W().localStorage.removeItem('aa-greet-test'); GA.GREETS.shift(); GA.renderGreet();

    // 8b. a CBSE board practice paper (tests/board-sample): listed on School for its class and subject; a written answer is
    // marked by the student, after "Check answer" in practice and on one marking screen after submitting an exam
    {
      await load('../index.html?test#school');
      const GB = W().__aaTest;
      GB.BOARD_PAPERS.push({ id: 'test-board', cls: 'X', subj: 'Mathematics', name: 'Test board paper', date: 'Practice paper T', shift: '', pat: '4 questions · 3 hours · 8 marks', path: 'tests/board-sample/', min: 180 });
      const pickSchool = () => { $('#klass').value = 'X'; fire($('#klass'), 'change'); $('#subject').value = 'Mathematics'; fire($('#subject'), 'change'); };
      pickSchool();
      ok(g, 'board practice papers show on School for Class 10 Mathematics, and fit the width', !$('#boardBox').hidden && !!$('#boardBox [data-board="test-board"][data-mode="exam"]') && fits(), wide());
      $('#boardBox [data-board="test-board"][data-mode="practice"]').click();
      await until(() => !$('#test').hidden && $$('#sheet .q').length === 4, 15000);
      const ta = $('#q2 textarea');
      ok(g, 'a written question has an answer box', !!ta);
      if (ta) {
        ta.value = 'a = 3, d = 4\na10 = 3 + 9 x 4 = 39'; fire(ta, 'input');
        $('#q2 [data-check]').click(); await until(() => $$('#fb2 [data-sm]').length);
        ok(g, 'Check answer on a written question locks the answer and shows the model answer with a tick box per marking point', ta.disabled && $$('#fb2 [data-sm]').length === 2 && !!$('#fb2 .wmodel'), `${ta.disabled} ${$$('#fb2 [data-sm]').length}`);
        const c0 = $('#fb2 [data-sm]'); c0.checked = true; fire(c0, 'change');
        ok(g, 'ticking a point updates the marks', /Your marks: 1 \/ 2/.test($('#fb2 [data-smsum]').textContent), $('#fb2 [data-smsum]').textContent);
        $('#fb2 [data-smsave]').click(); await sleep(150);
        ok(g, 'Save my marks shows part marks for the question, marked by the student', !!$('#fb2 .pr.part') && /1 \/ 2, marked by you/.test($('#fb2').textContent) && fits(), $('#fb2').textContent.slice(0, 200));
      }
      $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);
      W().location.hash = '#school'; await until(() => !$('#setup').hidden); pickSchool();
      $('#boardBox [data-board="test-board"][data-mode="exam"]').click();
      await until(() => !$('#test').hidden && $$('#sheet .q').length === 4, 15000);
      const type = (sel, v) => { const t = $(sel); t.value = v; fire(t, 'input'); };
      const r1 = $('#q0 input[value="1"]'); r1.checked = true; fire(r1, 'change');
      const r2 = $('#q1 input[value="2"]'); r2.checked = true; fire(r2, 'change');
      type('#a2_0', 'a10 = 39'); type('#a3_0', '60 m2'); type('#a3_2', 'sqrt(144 + 25) = 13 m');
      $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
      await until(() => $('#smDone'));
      ok(g, 'submitting an exam with written answers opens the marking screen first', !!$('#smDone') && $$('#results .res .q').length === 2 && $$('#results [data-sm]').length === 5 && /Not answered/.test($('#results .res').textContent) && fits(), `${$$('#results .res .q').length} questions, ${$$('#results [data-sm]').length} tick boxes`);
      const tick = n => { const c = $$('#results [data-sm]')[n]; c.checked = true; fire(c, 'change'); };
      tick(0); tick(1); tick(2); await sleep(700);
      W().location.hash = '#home'; await until(() => !$('#resumeBox').hidden);
      ok(g, 'leaving the marking screen keeps the paper waiting to be marked', /waiting to be marked/.test($('#resumeBox').textContent), $('#resumeBox').textContent);
      $('#resumeBtn').click(); await until(() => $('#smDone'));
      ok(g, 'Resume goes back to the marking, with the ticks kept', $$('#results [data-sm]:checked').length === 3, String($$('#results [data-sm]:checked').length));
      tick(3);
      $('#smDone').click(); await until(() => $('#results .score'));
      // MCQ right 1 + wrong 0 + written 2 + case (i) 1 + (ii) blank 0 + (iii) 1 = 5
      ok(g, 'the result adds the multiple-choice marks and the marks the student gave', /^5\s*\/\s*8 marks/.test($('#results .score .big').textContent.trim()) && /marked by you/.test($('#results .res').textContent) && fits(), $('#results .score .big').textContent);
      ok(g, 'the board paper is finished: no unfinished paper is left', !W().localStorage.getItem('aa-active-paper'));
      GB.BOARD_PAPERS.pop();
    }

    // 9. at phone width, every official paper fits the screen with its maths typeset
    if (width < 500) {
      const bad = [];
      for (const [list, pg] of Object.entries(W().__aaTest.EXAM_PAGES)) for (const p of pg.papers) {
        W().location.hash = '#' + list; await until(() => $(`#jeeList [data-jee="${p.id}"][data-mode="exam"]`));
        $(`#jeeList [data-jee="${p.id}"][data-mode="exam"]`).click();
        await until(() => !$('#test').hidden && $$('#sheet .q').length, 20000);
        await until(() => $$('#sheet .katex').length > 5, 15000); await sleep(1500);  // fonts load, then formulas are fitted
        if (!fits() || $$('#sheet .katex-error').length) {
          // which questions make the page too wide: hide each in turn
          const culprits = [];
          if (!fits()) for (const q of $$('#sheet .q')) { const d0 = q.style.display; q.style.display = 'none'; const f = fits(); q.style.display = d0;
            if (f) {  // the smallest elements whose removal makes the page fit
              const fixers = [...q.querySelectorAll('*')].filter(e => { const d1 = e.style.display; e.style.display = 'none'; const ok2 = fits(); e.style.display = d1; return ok2; });
              const deepest = fixers.filter(e => !fixers.some(o => o !== e && e.contains(o))).slice(0, 3)
                .map(e => `${e.tagName.toLowerCase()}.${String(e.className.baseVal != null ? e.className.baseVal : e.className).slice(0, 30)} [${(e.textContent || '').trim().slice(0, 40)}] w${Math.round(e.getBoundingClientRect().width)}`);
              const cols = [...q.children].map(c => `${c.tagName.toLowerCase()}.${String(c.className).slice(0, 20)} w${Math.round(c.getBoundingClientRect().width)}`).join(' + ');
              culprits.push(`${q.id} (w${Math.round(q.getBoundingClientRect().width)}, sheet w${Math.round($('#sheet').getBoundingClientRect().width)}, columns ${W().getComputedStyle(q).gridTemplateColumns}: ${cols}): ${deepest.join(', ')}`); } }
          // the element whose right edge is exactly the page's scroll width
          const sw = D().documentElement.scrollWidth + D().documentElement.getBoundingClientRect().left;
          const edge = [...D().querySelectorAll('body *')].filter(e => Math.abs(e.getBoundingClientRect().right - sw) < 2).slice(0, 4)
            .map(e => { const cs = W().getComputedStyle(e); return `${e.tagName.toLowerCase()}.${String(e.className.baseVal != null ? e.className.baseVal : e.className).slice(0, 25)} pos ${cs.position} in ${(e.closest('.q') || {}).id || (e.parentElement && e.parentElement.id) || '?'} [${(e.textContent || '').trim().slice(0, 30)}]`; });
          bad.push(`${p.path} ${$$('#sheet .katex-error').length} maths errors; ${fits() ? '' : 'too wide: ' + culprits.join(' | ') + ' || at the edge: ' + edge.join('; ')}`);
        }
        $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);
      }
      ok(g, 'every official paper fits a phone screen, with no maths errors', !bad.length, bad.join(' || '));
    }
  }

  function render() {
    const fails = results.filter(r => !r.pass), sum = document.getElementById('summary');
    sum.textContent = fails.length ? `FAIL: ${fails.length} of ${results.length} checks failed` : `PASS: all ${results.length} checks passed`;
    sum.className = fails.length ? 'fail' : 'pass';
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    document.getElementById('list').innerHTML = fails.concat(results.filter(r => r.pass)).map(r =>
      `<li class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'} · ${esc(r.group)}: ${esc(r.name)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</li>`).join('');
  }
  (async () => {
    for (const [w, h] of [[390, 800], [1200, 900]]) {
      try { await journey(w, h); } catch (e) { ok(`Journey (${w} px)`, 'ran without an error', false, e && e.stack || String(e)); }
    }
    try { W().localStorage.clear(); } catch (e) {}
    render();
  })();
})();
