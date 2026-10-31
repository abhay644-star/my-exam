# All in All Exam Practice

Timed CBSE practice papers, generated in the browser and marked instantly.

- Mathematics, English, Hindi, Computer Science: Classes I to XII
- EVS: Classes I to V
- Science, Social Science: Classes VI to X
- Physics, Chemistry, Biology, Accountancy, Business Studies, Economics, History, Geography, Political Science: Classes XI and XII

Live site: https://my-exam.in

## Hosting
- Hosted on GitHub Pages from the `main` branch (root folder).
- `CNAME` sets the custom domain `my-exam.in`.
- The app is one static page (`index.html`) with no build step. School question banks are in `school-questions/` and official exam papers in `jee/`, `jee-adv/` and `neet/`; both load only when a paper needs them.

## Editing a question bank
1. Edit the subject's file in `school-questions/` (for example `school-questions/physics.json`).
2. Run `py tools/build_school_index.py` from the site folder. It updates the bank index in `index.html` (chapters and question counts) and the list of files the service worker keeps for offline use in `sw.js`.
3. Run the tests (below) and upload the changed files together.

## Tests
- `powershell -File tests\run-tests.ps1` runs `tests/marking.html` in headless Microsoft Edge (needs Python and Edge) and prints PASS or the failed checks.
- The tests cover reading typed numbers, checking answers, the marking rules (+4 / −1, numerical ranges, dropped questions, JEE Advanced partial marks, school part marks), option labels in My mistakes, every official paper (question count, maximum marks, answer keys) and every school bank (counts match the index, every answer key is accepted).
- You can also open `tests/marking.html` in a browser from any local web server.
