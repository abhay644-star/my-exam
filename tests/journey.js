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
  function answer(i, wrong) {  // answers question i: first option, or a typed value
    const q = $('#q' + i), r = q.querySelector('input[type=radio]');
    if (r) { r.checked = true; fire(r, 'change'); return; }
    const t = q.querySelector('input[type=text],textarea'); t.value = wrong ? 'zzz 987' : '7'; fire(t, 'input');
  }

  async function journey(width, height) {
    const g = `Journey (${width} px)`;
    frame.style.width = width + 'px'; frame.style.height = height + 'px';
    await load('../index.html?test'); W().localStorage.clear();
    await load('../index.html?test#home');
    ok(g, 'home page shows and fits the width', !$('#homeView').hidden && fits(), `scrollWidth ${D().documentElement.scrollWidth}`);
    const pop = [...D().querySelectorAll('#homeView .popular a')].map(a => a.getAttribute('href'));
    const dead = [];
    for (const h of pop) { const r = await fetch('..' + h + 'index.html').catch(() => null); if (!r || !r.ok) dead.push(h); }
    ok(g, 'home page has popular practice links that all open', pop.length >= 5 && !dead.length, `${pop.length} links; missing ${dead.join(', ')}`);
    ok(g, 'home page has the three how-it-works steps', D().querySelectorAll('#homeView .steps li').length === 3);

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

    // 2. answer two, flag one, open the question navigator
    answer(0); answer(1); $('#q2 [data-flag]').click(); await sleep(150);
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

    // 5. submit and review
    $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
    await until(() => !$('#results').hidden && $$('#results .res .q').length);
    const rq = $$('#results .res .q');
    ok(g, 'results show a score, the marked paper and a solution for every question', rq.length === n && rq.every(q => q.querySelector('.sol')) && /\d/.test($('#results').textContent));
    ok(g, 'results screen fits the width', fits());
    // "Your next step": names the weakest chapter, and its button starts a practice test on just that chapter
    const nx = $('#results .next');
    const nxName = nx && nx.querySelector('b') ? nx.querySelector('b').textContent : '';
    ok(g, 'results show "Your next step" with the weakest chapter and one Practise button', nx && nxName && nx.querySelectorAll('button').length === 1, nx ? nx.textContent.slice(0, 120) : 'missing');
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
      const chap = nx2.querySelector('b').textContent;
      nx2.querySelector('[data-next]').click(); await until(() => !$('#test').hidden && $$('#sheet .q').length);
      const topics = $$('#sheet .qtopic').map(t => t.textContent);
      ok(g, `"Practise ${chap}" starts a practice test on that chapter only`, topics.length && topics.every(t => t.includes(chap)), topics.slice(0, 3).join(' / '));
    }
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);

    // 6. practice mode: check an answer
    W().location.hash = '#school'; await until(() => !$('#setup').hidden);
    $('#mode_practice').checked = true; fire($('#mode_practice'), 'change');
    $('[data-preset="quick"]').click(); await until(() => !$('#test').hidden && $('#q0 [data-check]'));
    answer(0); $('#q0 [data-check]').click(); await sleep(200);
    ok(g, 'practice mode: "Check answer" shows the result and the explanation', !$('#fb0').hidden && /Explanation|Working/.test($('#fb0').textContent));
    $('#quitBtn').click(); await sleep(100); $('#confirmYes').click(); await sleep(200);

    // 7. an official paper: questions, maths and marking
    W().location.hash = '#jee-main'; await until(() => $('#jeeList [data-mode="exam"]'));
    $('#jeeList [data-mode="exam"]').click();
    await until(() => !$('#test').hidden && $$('#sheet .q').length, 20000);
    await until(() => $$('#sheet .katex').length > 20, 15000);
    ok(g, 'JEE Main paper opens with 75 questions and its maths typeset', $$('#sheet .q').length === 75 && $$('#sheet .katex').length > 20 && !$$('#sheet .katex-error').length, `${$$('#sheet .q').length} questions, ${$$('#sheet .katex').length} formulas, ${$$('#sheet .katex-error').length} errors`);
    ok(g, 'official paper fits the width', fits(), wide());
    $('#submitBtn').click(); await sleep(100); $('#confirmYes').click();
    await until(() => !$('#results').hidden);
    ok(g, 'an all-blank official paper scores 0 out of 300', /\b0\s*\/\s*300\b/.test($('#results').textContent.replace(/\s+/g, ' ')));

    // 8. at phone width, every official paper fits the screen with its maths typeset
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
