// ═══════════════════════════════════════════════════════════════
// AREA HEAD SIGN-UP SHEETS — Google Apps Script backend
// Deploy as: Web app, Execute as: Me, Who has access: Anyone
//
// NOTE: All actions go through doGet to avoid CORS preflight issues
// with cross-origin POST requests from browser-based apps.
// Data payloads are passed as a URL-encoded JSON "payload" parameter.
// ═══════════════════════════════════════════════════════════════

const MASTER_SHEET_NAME = 'SignUpSheets';
const SLOTS_SHEET_PREFIX = 'Slots_';
const LOG_SHEET = 'EmailLog';

function doGet(e) {
  const action = e.parameter.action || '';
  try {
    // Read actions — params come directly from URL
    if (action === 'getSheet') return jsonResponse(getSheet(e.parameter.sheetId));
    if (action === 'listSheets') return jsonResponse(listSheets());
    // Write actions — payload is JSON-encoded in the "payload" param
    if (action === 'claim' || action === 'cancel' || action === 'createSheet' || action === 'deleteSheet') {
      const data = JSON.parse(decodeURIComponent(e.parameter.payload || '{}'));
      data.action = action;
      if (action === 'claim') return jsonResponse(claimSlot(data));
      if (action === 'cancel') return jsonResponse(cancelSlot(data));
      if (action === 'createSheet') return jsonResponse(createSheet(data));
      if (action === 'deleteSheet') return jsonResponse(deleteSheet(data));
    }
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch(err) { return jsonResponse({ error: err.message }); }
}

// doPost kept for compatibility but all browser calls now use doGet
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || '';
    if (action === 'claim') return jsonResponse(claimSlot(data));
    if (action === 'cancel') return jsonResponse(cancelSlot(data));
    if (action === 'createSheet') return jsonResponse(createSheet(data));
    if (action === 'deleteSheet') return jsonResponse(deleteSheet(data));
    return jsonResponse({ error: 'Unknown action' });
  } catch(err) { return jsonResponse({ error: err.message }); }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function listSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) return { sheets: [] };
  const rows = master.getDataRange().getValues();
  const sheets = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) sheets.push({ id: String(rows[i][0]), title: rows[i][1], subtitle: rows[i][2], createdAt: rows[i][3] });
  }
  return { sheets };
}

function getSheet(sheetId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  const masterRows = master ? master.getDataRange().getValues() : [];
  let meta = { title: 'Sign-Up Sheet', subtitle: '' };
  for (let i = 1; i < masterRows.length; i++) {
    if (String(masterRows[i][0]) === String(sheetId)) { meta = { title: masterRows[i][1], subtitle: masterRows[i][2] }; break; }
  }
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) return { ...meta, slots: [] };
  const rows = slotsSheet.getDataRange().getValues();
  const slots = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    slots.push({ id: String(rows[i][0]), blockId: String(rows[i][1]), blockHeading: String(rows[i][2]||''),
      isRecurring: !!rows[i][3], date: String(rows[i][4]), startTime: String(rows[i][5]),
      endTime: String(rows[i][6]||''), studentName: String(rows[i][7]||''),
      studentEmail: String(rows[i][8]||''), cancelled: !!rows[i][9] });
  }
  return { ...meta, slots };
}

function claimSlot(data) {
  const { sheetId, slotId, name, email } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) throw new Error('Sheet not found');
  const rows = slotsSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(slotId)) {
      if (rows[i][7]) throw new Error('This slot has already been claimed. Please refresh and try another.');
      if (rows[i][9]) throw new Error('This slot has been cancelled.');
      slotsSheet.getRange(i+1, 8).setValue(name);
      slotsSheet.getRange(i+1, 9).setValue(email);
      sendConfirmation(name, email, rows[i][4], rows[i][5], rows[i][6]);
      scheduleReminder(slotId, sheetId, name, email, rows[i][4], rows[i][5], rows[i][6]);
      return { ok: true };
    }
  }
  throw new Error('Slot not found');
}

function cancelSlot(data) {
  const { sheetId, slotId, adminKey } = data;
  const props = PropertiesService.getScriptProperties();
  if (adminKey !== (props.getProperty('ADMIN_KEY') || 'changeme')) throw new Error('Unauthorized');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) throw new Error('Sheet not found');
  const rows = slotsSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(slotId)) {
      const studentEmail = String(rows[i][8]||''), studentName = String(rows[i][7]||'');
      slotsSheet.getRange(i+1, 8).setValue('');
      slotsSheet.getRange(i+1, 9).setValue('');
      slotsSheet.getRange(i+1, 10).setValue(true);
      if (studentEmail) sendCancellation(studentName, studentEmail, rows[i][4], rows[i][5], rows[i][6]);
      return { ok: true };
    }
  }
  throw new Error('Slot not found');
}

function createSheet(data) {
  const { title, subtitle, slots, sheetId } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) {
    master = ss.insertSheet(MASTER_SHEET_NAME);
    master.appendRow(['id','title','subtitle','createdAt']);
    master.getRange(1,1,1,4).setFontWeight('bold').setBackground('#1a2744').setFontColor('#ffffff');
  }
  master.appendRow([sheetId, title, subtitle||'', new Date().toISOString()]);
  let slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (slotsSheet) ss.deleteSheet(slotsSheet);
  slotsSheet = ss.insertSheet(SLOTS_SHEET_PREFIX + sheetId);
  const headers = ['id','blockId','blockHeading','isRecurring','date','startTime','endTime','studentName','studentEmail','cancelled'];
  slotsSheet.appendRow(headers);
  slotsSheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#1a2744').setFontColor('#ffffff');
  slots.forEach(s => slotsSheet.appendRow([s.id, s.blockId, s.blockHeading||'', s.isRecurring||false, s.date, s.startTime, s.endTime||'', '', '', false]));
  slotsSheet.autoResizeColumns(1, headers.length);
  return { ok: true, sheetId };
}

function deleteSheet(data) {
  const { sheetId } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (master) {
    const rows = master.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]) === String(sheetId)) { master.deleteRow(i+1); break; } }
  }
  const s = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (s) ss.deleteSheet(s);
  return { ok: true };
}

function sendConfirmation(name, email, date, startTime, endTime) {
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: email,
    subject: 'Sign-Up Confirmed: ' + formatDate(date) + ' at ' + startTime,
    body: 'Hi ' + name + ',\n\nYou are confirmed for:\n\nDate: ' + formatDate(date) + '\nTime: ' + startTime + (endTime ? ' – ' + endTime : '') + '\n\nIf you need to cancel, please contact ' + adminEmail + ' as soon as possible.\n\nThis is an automated confirmation — please do not reply.',
    replyTo: adminEmail
  });
}

function sendCancellation(name, email, date, startTime, endTime) {
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: email,
    subject: 'Sign-Up Cancelled: ' + formatDate(date) + ' at ' + startTime,
    body: 'Hi ' + name + ',\n\nYour sign-up for ' + formatDate(date) + ' at ' + startTime + (endTime ? ' – ' + endTime : '') + ' has been cancelled by the administrator.\n\nPlease contact ' + adminEmail + ' if you have questions.',
    replyTo: adminEmail
  });
}

function scheduleReminder(slotId, sheetId, name, email, date, startTime, endTime) {
  const props = PropertiesService.getScriptProperties();
  const days1 = parseInt(props.getProperty('REMINDER_DAYS_1') || '7');
  const days2 = parseInt(props.getProperty('REMINDER_DAYS_2') || '1');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.appendRow(['slotId','sheetId','name','email','date','startTime','endTime','reminderDate','sent']);
    log.getRange(1,1,1,9).setFontWeight('bold').setBackground('#1a2744').setFontColor('#ffffff');
  }
  const slotDate = new Date(String(date)+'T00:00:00');
  [days1, days2].forEach(days => {
    const remDate = new Date(slotDate); remDate.setDate(remDate.getDate() - days);
    if (remDate > new Date()) log.appendRow([slotId, sheetId, name, email, date, startTime, endTime||'', remDate.toISOString().slice(0,10), false]);
  });
}

// Run this daily via a time-based trigger (Triggers → Add Trigger → sendPendingReminders → Day timer)
function sendPendingReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(LOG_SHEET);
  if (!log) return;
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  const todayStr = new Date().toISOString().slice(0,10);
  const rows = log.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [slotId, sheetId, name, email, date, startTime, endTime, reminderDate, sent] = rows[i];
    if (sent || String(reminderDate).slice(0,10) !== todayStr) continue;
    const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
    if (slotsSheet) {
      const slotRows = slotsSheet.getDataRange().getValues();
      const slot = slotRows.find(r => String(r[0]) === String(slotId));
      if (!slot || slot[9] || !slot[7]) { log.getRange(i+1,9).setValue(true); continue; }
    }
    const daysUntil = Math.round((new Date(String(date)+'T00:00:00') - new Date()) / 86400000);
    const label = daysUntil === 1 ? 'Tomorrow' : 'in ' + daysUntil + ' Days';
    try {
      MailApp.sendEmail({
        to: String(email),
        subject: 'Reminder: Presentation ' + label + ' — ' + formatDate(date) + ' at ' + startTime,
        body: 'Hi ' + name + ',\n\nThis is a reminder that you are scheduled to present:\n\nDate: ' + formatDate(date) + '\nTime: ' + startTime + (endTime ? ' – ' + endTime : '') + '\n\nIf you need to cancel, please contact ' + adminEmail + ' as soon as possible.\n\nThis is an automated reminder.',
        replyTo: adminEmail
      });
      log.getRange(i+1, 9).setValue(true);
    } catch(e) { Logger.log('Reminder failed for ' + email + ': ' + e.message); }
  }
}

function formatDate(dateStr) {
  const d = new Date(String(dateStr)+'T00:00:00');
  return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}
