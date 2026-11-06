/* my-exam.in contact form: receives "Send us a message", keeps a copy in this Google Sheet and emails it to us.
   Set-up (once, signed in to any Google account we use; messages are still sent to contact@my-exam.in from that account):
   1. Create a Google Sheet called "my-exam.in messages", then Extensions > Apps Script.
   2. Replace the code there with this file and save.
   3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy, allow access.
   4. Copy the web app URL (ends in /exec) into CONTACT_ROUTES in index.html.
   After changing this code: Deploy > Manage deployments > edit > Version: New version (the URL stays the same). */

const TO = 'contact@my-exam.in';
const MAX_LEN = 5000;      // longest message we accept
const MAX_PER_HOUR = 30;   // all senders together; stops a flood filling the Sheet or the mail quota

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const msg = String(d.message || '').trim();
    const email = String(d.email || '').trim();
    const page = String(d.page || '').slice(0, 500);
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
      const opts = { to: TO, subject: 'Message from my-exam.in', body: `${msg}\n\nFrom: ${email || '(no email given)'}\nPage: ${page}` };
      if (email) opts.replyTo = email;
      MailApp.sendEmail(opts);
    } catch (err) { mailed = 'no: ' + err.message; } // the message is still saved in the Sheet
    sheet.getRange(row, 5).setValue(mailed);
    return reply(true, 'Saved');
  } catch (err) {
    return reply(false, 'Could not save: ' + err.message);
  }
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
