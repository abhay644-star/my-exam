/* my-exam.in contact form: receives "Send us a message", keeps a copy in this Google Sheet and emails it to us.
   Set-up (once, signed in as contact.myexam@gmail.com, the inbox contact@my-exam.in forwards to):
   1. Create a Google Sheet called "my-exam.in messages", then Extensions > Apps Script.
   2. Replace the code there with this file and save.
   3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy, allow access.
   4. Copy the web app URL (ends in /exec) into CONTACT_ROUTES in index.html.
   5. Choose setupDailyCheck in the function list at the top and press Run (once), allowing access.
   After changing this code: Deploy > Manage deployments > edit > Version: New version (the URL stays the same). */

// straight to the Gmail inbox: mail sent to contact@my-exam.in comes back through Cloudflare to the account that sent it, and Gmail hides it from the inbox
const TO = 'contact.myexam@gmail.com';
const MAX_LEN = 5000;      // longest message we accept
const MAX_PER_HOUR = 30;   // all senders together; stops a flood filling the Sheet or the mail quota

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const msg = String(d.message || '').trim();
    const email = String(d.email || '').trim();
    const page = String(d.page || '').slice(0, 500);
    // the form names a reported paper and question in the subject; one line, kept short
    const subject = String(d.subject || 'Message from my-exam.in').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!msg) return reply(false, 'Empty message');
    if (msg.length > MAX_LEN) return reply(false, 'Message too long');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(false, 'Bad email address');
    if (!underLimit()) return reply(false, 'Too many messages, try later');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(['Received', 'Email', 'Page', 'Message', 'Emailed']);
    // a leading ' stops the Sheet treating text such as =HYPERLINK(...) as a formula
    sheet.appendRow([new Date(), safe(email), safe(page), safe(msg), '']);
    const row = sheet.getLastRow();

    let mailed = 'yes';
    try {
      const opts = { to: TO, subject, body: `${msg}\n\nFrom: ${email || '(no email given)'}\nPage: ${page}` };
      if (email) opts.replyTo = email;
      MailApp.sendEmail(opts);
    } catch (err) { mailed = 'no: ' + err.message; } // the message is still saved in the Sheet
    sheet.getRange(row, 5).setValue(mailed);
    return reply(true, 'Saved');
  } catch (err) {
    return reply(false, 'Could not save: ' + err.message);
  }
}

// once a day: email a list of messages that were saved but could not be emailed (for example over the daily mail
// quota); each is listed once, and column F records when
function dailyCheck() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const rows = sheet.getDataRange().getValues();
  const missed = [];
  for (let r = 1; r < rows.length; r++) {
    const [when, email, , msg, mailed, listed] = rows[r];
    if (msg && mailed !== 'yes' && !listed) missed.push({ row: r + 1, when, email, msg: String(msg) });
  }
  if (!missed.length) return;
  const list = missed.map(m => `Row ${m.row}, ${m.when}${m.email ? ', from ' + m.email : ''}:\n${m.msg.slice(0, 300)}`).join('\n\n');
  MailApp.sendEmail({ to: TO, subject: `my-exam.in: ${missed.length} message(s) saved but not emailed`,
    body: `These messages are in the Sheet but could not be emailed when they arrived:\n\n${list}\n\n${SpreadsheetApp.getActiveSpreadsheet().getUrl()}` });
  if (!sheet.getRange(1, 6).getValue()) sheet.getRange(1, 6).setValue('Listed in daily check');
  missed.forEach(m => sheet.getRange(m.row, 6).setValue(new Date()));
}

// run once from the editor: makes dailyCheck run every morning (and removes any older copy of that schedule)
function setupDailyCheck() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyCheck').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(8).create();
}

function underLimit() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get('count') || 0);
    if (n >= MAX_PER_HOUR) return false;
    cache.put('count', String(n + 1), 3600);
    return true;
  } finally { lock.releaseLock(); }
}

const safe = s => /^[=+\-@]/.test(s) ? "'" + s : s;
const reply = (ok, message) => ContentService.createTextOutput(JSON.stringify({ success: String(ok), message }))
  .setMimeType(ContentService.MimeType.JSON);
