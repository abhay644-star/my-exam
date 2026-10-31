"""Rebuilds the school question index after any change to school-questions/*.json.

Run from the site folder:  py tools/build_school_index.py

- index.html: BANK_INDEX lists each subject's file (with a content hash, so browsers never mix an old file with a new
  index) and its chapters per class with the number of questions in each. The page uses it to fill the class, subject
  and chapter lists without downloading the banks.
- sw.js: BANK_FILES lists the same files, so the service worker keeps them for offline use.
Classes and chapters keep the order they first appear in in the bank file.
"""
import hashlib, json, re, sys
from pathlib import Path

site = Path(__file__).resolve().parent.parent

def put(path, name, value):
    text = path.read_text(encoding='utf-8')
    pat = re.compile(r'(/\* %s:start \*/).*?(/\* %s:end \*/)' % (name, name), re.S)
    if len(pat.findall(text)) != 1:
        sys.exit(f'{path.name}: expected one {name}:start / {name}:end marker pair')
    text = pat.sub(lambda m: m.group(1) + value + m.group(2), text)
    path.write_text(text, encoding='utf-8', newline='\n')

index, files, total = {}, [], 0
FOLDER = 'school-questions'
for f in sorted((site / FOLDER).glob('*.json')):
    raw = f.read_bytes()
    data = json.loads(raw)
    subj, qs = data['subject'], data['questions']
    url = f'{FOLDER}/{f.name}?v={hashlib.sha1(raw).hexdigest()[:10]}'
    classes = {}
    for q in qs:
        topics = classes.setdefault(q['c'], {})
        topics[q['t']] = topics.get(q['t'], 0) + 1
    index[subj] = {'file': url, 'classes': classes}
    files.append(url)
    total += len(qs)
    print(f'{subj:<18} {len(qs):>4} questions  {url}')

put(site / 'index.html', 'BANK_INDEX', 'const BANK_INDEX=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';')
put(site / 'sw.js', 'BANK_FILES', json.dumps(files))
print(f'{len(index)} subjects, {total} questions: index.html and sw.js updated')
