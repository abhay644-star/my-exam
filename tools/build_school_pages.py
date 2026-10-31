"""Builds the school practice pages that search engines can read, and the sitemap.

Run from the site folder after any change to school-questions/*.json (after build_school_index.py):
    py tools/build_school_pages.py

- cbse/index.html: every class with its subjects.
- cbse/class-<n>/<subject>/index.html: one page per class and subject the app offers, with its chapters, a few sample
  questions (answers hidden) and links that open the app with that class, subject or chapter chosen.
- sitemap.xml: the fixed pages plus every page above. A page's date changes only when its content changes.
Chapters come from school-questions/*.json and, for Mathematics, from TOPICS in index.html, in the order the app
shows them. Pages for a class or subject the app no longer offers are removed.
"""
import datetime, html, json, random, re, shutil, sys
from pathlib import Path
from urllib.parse import quote, urlencode

site = Path(__file__).resolve().parent.parent
SITE = 'https://my-exam.in'
ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
NUM = {r: i + 1 for i, r in enumerate(ROMAN)}
FIXED = ['/', '/jee-main/', '/jee-advanced/', '/neet/', '/privacy.html']
NOTE = ('All in All Exam Practice is an independent site and is not affiliated with CBSE, NCERT, NTA or the IITs. '
        'Official question papers and answer keys are published by those bodies.')
esc = lambda s: html.escape(str(s), quote=True)
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

# ---------- what the app offers ----------
page = (site / 'index.html').read_text(encoding='utf-8')
def js_lists(block):
    """'KEY':['a','b'] or KEY:['a',"b's"] pairs from a JS object literal."""
    out = {}
    for key, body in re.findall(r"'?([\w| ]+)'?\s*:\s*\[(.*?)\]", block, re.S):
        out[key.strip()] = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", body)]
    return out
TOPICS = js_lists(re.search(r'const TOPICS=\{(.*?)\n\};', page, re.S).group(1))
CH_ORDER = js_lists(re.search(r'const CH_ORDER=\{(.*?)\};', page, re.S).group(1))
SUBJECTS = re.findall(r"'([^']+)'", re.search(r'const SUBJECTS=\[(.*?)\];', page).group(1))
assert sorted(TOPICS) == sorted(ROMAN), 'TOPICS in index.html has changed shape'

banks = {}
for f in (site / 'school-questions').glob('*.json'):
    d = json.loads(f.read_text(encoding='utf-8'))
    banks[d['subject']] = d['questions']

def chapters(subj, cls):
    """The app's chapter list for a class and subject (topicsFor in index.html)."""
    if subj == 'Mathematics':
        return TOPICS.get(cls, [])
    seen = []
    for q in banks.get(subj, []):
        if q['c'] == cls and q['t'] not in seen:
            seen.append(q['t'])
    order = CH_ORDER.get(f'{subj}|{cls}')
    if order:
        seen.sort(key=lambda t: order.index(t) + 1 if t in order else 99)
    return seen

offer = {cls: [s for s in SUBJECTS if chapters(s, cls)] for cls in ROMAN}

# ---------- page parts ----------
def app_link(cls, subj, chapter=None):
    q = {'class': cls, 'subject': subj}
    if chapter:
        q['chapter'] = chapter
    return '/?' + urlencode(q, quote_via=quote) + '#school'

def samples(subj, cls, n=5):
    """Up to n multiple-choice questions, one per chapter in turn, options in a fixed shuffled order."""
    by_ch = {}
    for i, q in enumerate(banks.get(subj, [])):
        if q['c'] == cls and not q.get('p') and isinstance(q.get('o'), list) and len(q['o']) >= 3:
            by_ch.setdefault(q['t'], []).append((i, q))
    out, k = [], 0
    chs = [c for c in chapters(subj, cls) if c in by_ch]
    while len(out) < n and chs and k < 50:
        lst = by_ch[chs[k % len(chs)]]
        if k // len(chs) < len(lst):
            out.append(lst[k // len(chs)])
        k += 1
    items = []
    for i, q in out:
        unit = ' ' + q['n'] if q.get('n') else ''
        fx = lambda x: f'{x}{unit}' if unit and re.fullmatch(r'-?[\d.]+', str(x).strip()) else str(x)
        correct = fx(str(q['a']).split('|')[0])
        opts = [correct] + [fx(o) for o in q['o'][:3]]
        random.Random(f'{subj}|{i}').shuffle(opts)
        li = ''.join(f'<li>{o}</li>' for o in opts)
        expl = f'<p>{q["e"]}</p>' if q.get('e') else ''
        items.append(f'<li class="sq"><p class="sqt"><small>{esc(q["t"])}</small><br>{q["q"]}</p><ol type="a">{li}</ol>'
                     f'<details><summary>Show answer</summary><p><b>Answer:</b> {correct}</p>{expl}</details></li>')
    return items

def shell(path, title, desc, crumbs, body):
    url = SITE + path
    crumb_html = ' › '.join(f'<a href="{u}">{esc(t)}</a>' if u else esc(t) for t, u in crumbs)
    ld = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': t, 'item': SITE + (u or path)} for i, (t, u) in enumerate(crumbs)]}
    return f'''<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="All in All Exam Practice">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og-image.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#2446a8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="/pages.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<!-- Generated by tools/build_school_pages.py: edit the tool or the question files, not this page. -->
<div class="wrap">
  <header class="top">
    <a class="brand" href="/"><img src="/favicon.svg" alt=""><span><span class="blue">All</span> <span class="in">in</span> <span class="red">All</span> Exam Practice</span></a>
  </header>

  <p class="crumbs">{crumb_html}</p>
{body}
  <footer class="foot">
    <a href="/">Home</a><a href="/cbse/">CBSE Classes I–XII</a><a href="/jee-main/">JEE Main papers</a><a href="/jee-advanced/">JEE Advanced papers</a><a href="/neet/">NEET (UG) papers</a><a href="/privacy.html">Privacy</a>
    <p class="note">{NOTE}</p>
  </footer>
</div>
<script data-goatcounter="https://aaexampractice.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
'''

def subject_page(cls, subj):
    n, chs = NUM[cls], chapters(subj, cls)
    path = f'/cbse/class-{n}/{slug(subj)}/'
    maths = subj == 'Mathematics'
    counts = {}
    for q in banks.get(subj, []):
        if q['c'] == cls:
            counts[q['t']] = counts.get(q['t'], 0) + 1
    total = sum(counts.values())
    size = 'new questions are made for every attempt' if maths else f'{total} questions'
    title = f'CBSE Class {n} {subj} Online Test – Free Chapter-wise Practice | All in All Exam Practice'
    desc = (f'Free CBSE Class {n} {subj} practice tests: {len(chs)} NCERT chapters, chapter tests and full mock papers, '
            f'marked instantly with {"worked solutions" if maths else "explanations"}. No sign-up.')
    rows = ''.join(
        f'<li><a href="{esc(app_link(cls, subj, c))}"><b>{esc(c)}</b>'
        f'{"" if maths and c not in counts else f"<small>{counts.get(c, 0)} questions</small>"}</a></li>' for c in chs)
    sq = samples(subj, cls)
    sq_html = (f'\n  <h2>Sample questions</h2>\n  <p>A few questions from the Class {n} {esc(subj)} bank. Every test picks a fresh mix.</p>\n'
               f'  <ol class="samples">{"".join(sq)}</ol>\n') if sq else ''
    others = ''.join(f'<a href="/cbse/class-{n}/{slug(s)}/">{esc(s)}</a>' for s in offer[cls] if s != subj)
    classes = ''.join(f'<a href="/cbse/class-{NUM[c]}/{slug(subj)}/">Class {NUM[c]}</a>' for c in ROMAN if subj in offer[c] and c != cls)
    body = f'''  <h1>CBSE Class {n} {esc(subj)}: free online practice tests</h1>
  <p class="lede">Practise Class {n} (Class {cls}) {esc(subj)} chapter by chapter, or take a full mock paper. Answers are marked instantly, with {"worked solutions" if maths else "explanations"}. Free, no sign-up; your scores stay on your device.</p>
  <a class="btn" href="{esc(app_link(cls, subj))}">Start a Class {n} {esc(subj)} test →</a>

  <h2>Chapters</h2>
  <p>{len(chs)} chapters following the NCERT syllabus; {size}. Choose a chapter to practise just that chapter.</p>
  <ul class="chapters">{rows}</ul>
{sq_html}
  <h2>How it works</h2>
  <ol>
    <li>Choose <b>Quick quiz</b> (10 questions), <b>Chapter test</b> (20) or <b>Full mock paper</b> (30), or set your own number of questions, time and difficulty.</li>
    <li>Pick <b>Practice</b> to check each answer as you go, or <b>Exam</b> for a timed paper.</li>
    <li>See your score, the correct answers and {"worked solutions" if maths else "explanations"} as soon as you finish. Questions you got wrong are saved to revise later.</li>
  </ol>

  <h2>More practice</h2>
  {f'<p class="links">Other Class {n} subjects: {others}</p>' if others else ''}
  {f'<p class="links">{esc(subj)} in other classes: {classes}</p>' if classes else ''}
'''
    crumbs = [('Home', '/'), ('CBSE', '/cbse/'), (f'Class {n}', f'/cbse/#class-{n}'), (subj, None)]
    return path, shell(path, title, desc, crumbs, body)

def hub_page():
    path = '/cbse/'
    blocks = ''.join(
        f'<section class="cls" id="class-{NUM[c]}"><h2>Class {NUM[c]}</h2><p class="links">'
        + ''.join(f'<a href="/cbse/class-{NUM[c]}/{slug(s)}/">{esc(s)}</a>' for s in offer[c]) + '</p></section>'
        for c in ROMAN if offer[c])
    body = f'''  <h1>CBSE Classes 1 to 12: free online practice tests</h1>
  <p class="lede">Chapter tests and full mock papers for every class, following the NCERT syllabus, marked instantly with explanations. Choose your class and subject.</p>
  <a class="btn" href="/#school">Start practising →</a>
{blocks}
'''
    return path, shell(path, 'CBSE Class 1 to 12 Online Tests – Free Chapter-wise Practice | All in All Exam Practice',
                       'Free CBSE practice tests for Classes 1 to 12: every subject, chapter by chapter, marked instantly with explanations. No sign-up.',
                       [('Home', '/'), ('CBSE', None)], body)

# ---------- write pages, remove stale ones, write the sitemap ----------
pages = [hub_page()] + [subject_page(c, s) for c in ROMAN for s in offer[c]]
written, unchanged = [], 0
for path, text in pages:
    f = site / path.strip('/') / 'index.html'
    if f.exists() and f.read_text(encoding='utf-8') == text:
        unchanged += 1
        continue
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(text, encoding='utf-8', newline='\n')
    written.append(path)

keep = {site / p.strip('/') for p, _ in pages}
removed = []
for d in sorted((site / 'cbse').glob('class-*/*')):
    if d.is_dir() and d not in keep:
        shutil.rmtree(d); removed.append('/' + d.relative_to(site).as_posix() + '/')
for d in (site / 'cbse').glob('class-*'):
    if d.is_dir() and not any(d.iterdir()):
        d.rmdir()

smap = site / 'sitemap.xml'
old = dict(re.findall(r'<loc>(.*?)</loc><lastmod>(.*?)</lastmod>', smap.read_text(encoding='utf-8'))) if smap.exists() else {}
today = datetime.date.today().isoformat()
urls = [SITE + p for p in FIXED] + [SITE + p for p, _ in pages]
lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    p = u[len(SITE):]
    date = today if p in written or u not in old else old[u]
    lines.append(f'  <url><loc>{u}</loc><lastmod>{date}</lastmod></url>')
lines.append('</urlset>')
smap.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')

print(f'{len(pages)} pages ({len(pages) - 1} class and subject pages + /cbse/): {len(written)} written, {unchanged} unchanged, {len(removed)} removed')
for r in removed:
    print('  removed', r)
print(f'sitemap.xml: {len(urls)} pages')
