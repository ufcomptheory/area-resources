// ═══════════════════════════════════════════════════════════════
// AREA HEAD SIGN-UP SHEETS — Google Apps Script backend v4
// Deploy as: Web app, Execute as: Me, Who has access: Anyone
//
// All actions go through doGet to avoid CORS preflight issues.
// Data payloads passed as URL-encoded JSON "payload" parameter.
// ═══════════════════════════════════════════════════════════════

const MASTER_SHEET_NAME = 'SignUpSheets';
const SLOTS_SHEET_PREFIX = 'Slots_';
const LOG_SHEET = 'EmailLog';
// Column indices (0-based) in the slots sheet
const COL = { ID:0, BLOCK_ID:1, BLOCK_HEADING:2, IS_RECURRING:3, DATE:4,
              START:5, END:6, NAME:7, EMAIL:8, CANCELLED:9, ROLE:10,
              GCAL_SESSION_ID:11 };

// ── Routing ──
function doGet(e) {
  const action = e.parameter.action || '';
  try {
    if (action === 'getSheet')       return jsonResponse(getSheet(e.parameter.sheetId));
    if (action === 'listSheets')     return jsonResponse(listSheets());
    if (action === 'getSubmitConfig')return jsonResponse(getSubmitConfig());
    if (action === 'getSubmissions') return jsonResponse(getSubmissions(e.parameter.status ? {status:e.parameter.status} : {}));
    if (action === 'getArchivedEvents') return jsonResponse(getArchivedEvents(e.parameter.semester ? {semester:e.parameter.semester} : {}));
    if (['claim','cancel','createSheet','deleteSheet','seedCalendar',
         'submitEvent','updateSubmission','approveSubmission','rejectSubmission',
         'archiveCustomPeriod','getArchiveExportHtml'].includes(action)) {
      const data = JSON.parse(decodeURIComponent(e.parameter.payload || '{}'));
      data.action = action;
      if (action === 'claim')               return jsonResponse(claimSlot(data));
      if (action === 'cancel')              return jsonResponse(cancelSlot(data));
      if (action === 'createSheet')         return jsonResponse(createSheet(data));
      if (action === 'deleteSheet')         return jsonResponse(deleteSheet(data));
      if (action === 'seedCalendar')        return jsonResponse(seedCalendar(data));
      if (action === 'submitEvent')         return jsonResponse(submitEvent(data));
      if (action === 'updateSubmission')    return jsonResponse(updateSubmission(data));
      if (action === 'approveSubmission')   return jsonResponse(approveSubmission(data));
      if (action === 'rejectSubmission')    return jsonResponse(rejectSubmission(data));
      if (action === 'archiveCustomPeriod') return jsonResponse(archiveCustomPeriod(data));
      if (action === 'getArchiveExportHtml')return jsonResponse(getArchiveExportHtml(data));
    }
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch(err) { return jsonResponse({ error: err.message }); }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || '';
    if (action === 'claim')       return jsonResponse(claimSlot(data));
    if (action === 'cancel')      return jsonResponse(cancelSlot(data));
    if (action === 'createSheet') return jsonResponse(createSheet(data));
    if (action === 'deleteSheet') return jsonResponse(deleteSheet(data));
    return jsonResponse({ error: 'Unknown action' });
  } catch(err) { return jsonResponse({ error: err.message }); }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── List all sheets ──
function listSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) return { sheets: [] };
  const rows = master.getDataRange().getValues();
  const sheets = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) sheets.push({
      id: String(rows[i][0]), title: rows[i][1],
      subtitle: rows[i][2], createdAt: rows[i][3],
      syncCalendar: rows[i][4] === 'true' || rows[i][4] === true,
      calendarId: String(rows[i][5]||'primary')
    });
  }
  return { sheets };
}

// ── Get a sheet with all slots ──
function getSheet(sheetId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  const masterRows = master ? master.getDataRange().getValues() : [];
  let meta = { title: 'Sign-Up Sheet', subtitle: '', syncCalendar: false, calendarId: 'primary' };
  for (let i = 1; i < masterRows.length; i++) {
    if (String(masterRows[i][0]) === String(sheetId)) {
      meta = { title: masterRows[i][1], subtitle: masterRows[i][2],
               syncCalendar: masterRows[i][4]==='true'||masterRows[i][4]===true,
               calendarId: String(masterRows[i][5]||'primary') };
      break;
    }
  }
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) return { ...meta, slots: [] };
  const rows = slotsSheet.getDataRange().getValues();
  const slots = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][COL.ID]) continue;
    slots.push({
      id:           String(rows[i][COL.ID]),
      blockId:      String(rows[i][COL.BLOCK_ID]),
      blockHeading: String(rows[i][COL.BLOCK_HEADING]||''),
      isRecurring:  rows[i][COL.IS_RECURRING]==='true'||rows[i][COL.IS_RECURRING]===true,
      date:         normalizeDate(rows[i][COL.DATE]),
      startTime:    normalizeTime(rows[i][COL.START]),
      endTime:      normalizeTime(rows[i][COL.END]||''),
      studentName:  String(rows[i][COL.NAME]||''),
      studentEmail: String(rows[i][COL.EMAIL]||''),
      cancelled:    rows[i][COL.CANCELLED]==='true'||rows[i][COL.CANCELLED]===true,
      role:         String(rows[i][COL.ROLE]||''),
      gcalSessionId: String(rows[i][COL.GCAL_SESSION_ID]||'')
    });
  }
  return { ...meta, slots };
}

// ── Claim a slot ──
function claimSlot(data) {
  const { sheetId, slotId, name, email, role } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) throw new Error('Sheet not found');
  const rows = slotsSheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.ID]) === String(slotId)) {
      if (rows[i][COL.NAME]) throw new Error('This slot has already been claimed. Please refresh and try another.');
      if (rows[i][COL.CANCELLED]==='true'||rows[i][COL.CANCELLED]===true) throw new Error('This slot has been cancelled.');
      targetRow = i;
      break;
    }
  }
  if (targetRow < 0) throw new Error('Slot not found');

  // Write name, email, role
  slotsSheet.getRange(targetRow+1, COL.NAME+1).setValue(name);
  slotsSheet.getRange(targetRow+1, COL.EMAIL+1).setValue(email);
  slotsSheet.getRange(targetRow+1, COL.ROLE+1).setValue(role||'');

  // Re-read rows for calendar update check
  const updatedRows = slotsSheet.getDataRange().getValues();
  const slotDate = normalizeDate(updatedRows[targetRow][COL.DATE]);

  // Get sheet metadata (title, calendarId, syncCalendar)
  const sheetMeta = getSheetMeta(sheetId);

  // Try to update calendar if sync enabled
  if (sheetMeta.syncCalendar) {
    try { syncSessionCalendarEvent(slotsSheet, updatedRows, sheetId, slotDate, sheetMeta); }
    catch(e) { Logger.log('Calendar sync error on claim: '+e.message); }
  }

  sendConfirmation(name, email, slotDate,
    normalizeTime(updatedRows[targetRow][COL.START]),
    normalizeTime(updatedRows[targetRow][COL.END]||''));
  scheduleReminder(slotId, sheetId, name, email, slotDate,
    normalizeTime(updatedRows[targetRow][COL.START]),
    normalizeTime(updatedRows[targetRow][COL.END]||''));
  return { ok: true };
}

// ── Cancel a slot (admin) ──
function cancelSlot(data) {
  const { sheetId, slotId, adminKey } = data;
  const props = PropertiesService.getScriptProperties();
  if (adminKey !== (props.getProperty('ADMIN_KEY') || 'changeme')) throw new Error('Unauthorized');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) throw new Error('Sheet not found');
  const rows = slotsSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.ID]) === String(slotId)) {
      const studentEmail = String(rows[i][COL.EMAIL]||'');
      const studentName  = String(rows[i][COL.NAME]||'');
      const slotDate     = normalizeDate(rows[i][COL.DATE]);
      // Clear name, email, role — reset to open (cancelled stays false so slot is re-claimable)
      slotsSheet.getRange(i+1, COL.NAME+1).setValue('');
      slotsSheet.getRange(i+1, COL.EMAIL+1).setValue('');
      slotsSheet.getRange(i+1, COL.ROLE+1).setValue('');
      slotsSheet.getRange(i+1, COL.CANCELLED+1).setValue('false');
      if (studentEmail) sendCancellation(studentName, studentEmail,
        slotDate, normalizeTime(rows[i][COL.START]), normalizeTime(rows[i][COL.END]||''));
      // Re-read and sync calendar (slot now open, title reverts to generic)
      const sheetMeta = getSheetMeta(sheetId);
      if (sheetMeta.syncCalendar) {
        try {
          const updatedRows = slotsSheet.getDataRange().getValues();
          syncSessionCalendarEvent(slotsSheet, updatedRows, sheetId, slotDate, sheetMeta);
        } catch(e) { Logger.log('Calendar sync error on cancel: '+e.message); }
      }
      return { ok: true };
    }
  }
  throw new Error('Slot not found');
}

// ── Create a sheet (writes rows only — calendar seeded separately) ──
function createSheet(data) {
  const { title, subtitle, slots, sheetId, syncCalendar, calendarId } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Master sheet
  let master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) {
    master = ss.insertSheet(MASTER_SHEET_NAME);
    master.appendRow(['id','title','subtitle','createdAt','syncCalendar','calendarId']);
    master.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1a2744').setFontColor('#ffffff');
  }
  master.appendRow([sheetId, title, subtitle||'', new Date().toISOString(),
    syncCalendar ? 'true' : 'false', calendarId||'primary']);

  // Slots sheet
  let slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (slotsSheet) ss.deleteSheet(slotsSheet);
  slotsSheet = ss.insertSheet(SLOTS_SHEET_PREFIX + sheetId);
  const headers = ['id','blockId','blockHeading','isRecurring','date','startTime','endTime',
                   'studentName','studentEmail','cancelled','role','gcalSessionId'];
  slotsSheet.appendRow(headers);
  slotsSheet.getRange(1,1,1,headers.length).setFontWeight('bold')
    .setBackground('#1a2744').setFontColor('#ffffff');
  // Force date and time columns to plain text
  slotsSheet.getRange(1, COL.DATE+1, slots.length+1, 3).setNumberFormat('@STRING@');
  slots.forEach(s => slotsSheet.appendRow([
    String(s.id), String(s.blockId), String(s.blockHeading||''),
    s.isRecurring ? 'true' : 'false',
    String(s.date), String(s.startTime), String(s.endTime||''),
    '', '', 'false', '', ''
  ]));
  slotsSheet.autoResizeColumns(1, headers.length);
  return { ok: true, sheetId };
}

// ── Seed calendar events for a sheet (called separately after createSheet) ──
// Creates one event per unique session date spanning the full session duration.
function seedCalendar(data) {
  const { sheetId } = data;
  const sheetMeta = getSheetMeta(sheetId);
  if (!sheetMeta.syncCalendar) return { ok: true, skipped: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (!slotsSheet) throw new Error('Slots sheet not found for id: ' + sheetId);
  const allRows = slotsSheet.getDataRange().getValues();
  // Get unique dates
  const uniqueDates = [];
  const seen = new Set();
  for (let i = 1; i < allRows.length; i++) {
    const d = normalizeDate(allRows[i][COL.DATE]);
    if (d && !seen.has(d)) { seen.add(d); uniqueDates.push(d); }
  }
  const created = [];
  const errors = [];
  uniqueDates.forEach(date => {
    try {
      syncSessionCalendarEvent(slotsSheet, allRows, sheetId, date, sheetMeta);
      created.push(date);
    } catch(e) {
      errors.push(date + ': ' + e.message);
      Logger.log('seedCalendar error for ' + date + ': ' + e.message);
    }
  });
  return { ok: true, created, errors };
}

// ── Delete a sheet and its calendar events ──
function deleteSheet(data) {
  const { sheetId } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMeta = getSheetMeta(sheetId);
  // Delete calendar events stored in the sheet
  if (sheetMeta.syncCalendar) {
    try {
      const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
      if (slotsSheet) {
        const rows = slotsSheet.getDataRange().getValues();
        const deletedIds = new Set();
        for (let i = 1; i < rows.length; i++) {
          const gcalId = String(rows[i][COL.GCAL_SESSION_ID]||'');
          if (gcalId && !deletedIds.has(gcalId)) {
            try {
              const cal = CalendarApp.getCalendarById(sheetMeta.calendarId) || CalendarApp.getDefaultCalendar();
              const ev = cal.getEventById(gcalId);
              if (ev) ev.deleteEvent();
              deletedIds.add(gcalId);
            } catch(e2) { Logger.log('Could not delete event '+gcalId+': '+e2.message); }
          }
        }
      }
    } catch(e) { Logger.log('Calendar cleanup error: '+e.message); }
  }
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (master) {
    const rows = master.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(sheetId)) { master.deleteRow(i+1); break; }
    }
  }
  const s = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
  if (s) ss.deleteSheet(s);
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR SYNC
// ═══════════════════════════════════════════════════════════════

// Build the correct event title for a given date's slots.
// Rules:
//   — Not all filled: return sheet title (generic)
//   — All filled by the same person: "Full Name, Role Presentation — Title"
//   — All filled, same role: "Name1, Name2, Role Presentation — Title"
//   — All filled, different roles: "Name1, Role1 Presentation; Name2, Role2 Presentation — Title"
function buildEventTitle(slots, sheetTitle) {
  const active = slots.filter(s => !s.cancelled);
  if (!active.length) return sheetTitle;
  const allFilled = active.every(s => s.studentName && s.studentName.trim() !== '');
  if (!allFilled) return sheetTitle;

  // Deduplicate by name (same person signed up for multiple adjacent slots)
  const seen = new Set();
  const unique = [];
  active.forEach(s => {
    const key = s.studentName.trim().toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
  });

  // Helper: full name
  const fullName = s => s.studentName.trim();
  const role = s => (s.role || '').trim();

  if (unique.length === 1) {
    // Single presenter (or same person repeated)
    return fullName(unique[0]) + ', ' + role(unique[0]) + ' Presentation — ' + sheetTitle;
  }

  // Multiple presenters — check if they share the same role
  const roles = unique.map(s => role(s));
  const allSameRole = roles.every(r => r === roles[0]);

  if (allSameRole) {
    // "Name1, Name2, Role Presentation — Title"
    const names = unique.map(s => fullName(s)).join(', ');
    return names + ', ' + roles[0] + ' Presentation — ' + sheetTitle;
  }

  // Different roles — "Name1, Role1 Presentation; Name2, Role2 Presentation — Title"
  const parts = unique.map(s => fullName(s) + ', ' + role(s) + ' Presentation');
  return parts.join('; ') + ' — ' + sheetTitle;
}

// Create or update the single calendar event for a given session date
function syncSessionCalendarEvent(slotsSheet, allRows, sheetId, sessionDate, sheetMeta) {
  // Gather all active (non-cancelled) slots for this date
  const dateSlots = [];
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row[COL.ID]) continue;
    if (normalizeDate(row[COL.DATE]) !== sessionDate) continue;
    dateSlots.push({
      rowIdx:      i,
      startTime:   normalizeTime(row[COL.START]),
      endTime:     normalizeTime(row[COL.END]||''),
      studentName: String(row[COL.NAME]||''),
      role:        String(row[COL.ROLE]||''),
      cancelled:   row[COL.CANCELLED]==='true'||row[COL.CANCELLED]===true,
      gcalId:      String(row[COL.GCAL_SESSION_ID]||'')
    });
  }
  if (!dateSlots.length) return;

  // Session spans from earliest start to latest end
  const firstSlot = dateSlots.reduce((a,b)=>timeToMins(a.startTime)<=timeToMins(b.startTime)?a:b);
  const lastSlot  = dateSlots.reduce((a,b)=>timeToMins(a.endTime)>=timeToMins(b.endTime)?a:b);
  const startDt   = buildDateTime(sessionDate, firstSlot.startTime);
  const endDt     = buildDateTime(sessionDate, lastSlot.endTime || addMins(lastSlot.startTime, 30));

  const newTitle  = buildEventTitle(dateSlots, sheetMeta.title);
  const cal       = CalendarApp.getCalendarById(sheetMeta.calendarId) || CalendarApp.getDefaultCalendar();

  // Find existing gcalSessionId (any non-empty value across the date's rows)
  const existingGcalId = dateSlots.map(s=>s.gcalId).find(id=>id&&id!=='');

  if (existingGcalId) {
    // Update existing event
    try {
      const ev = cal.getEventById(existingGcalId);
      if (ev) {
        ev.setTitle(newTitle);
        ev.setTime(startDt, endDt);
        return; // done
      }
    } catch(e) { Logger.log('Event not found, recreating: '+e.message); }
  }

  // Create new event
  const ev = cal.createEvent(newTitle, startDt, endDt);
  const newGcalId = ev.getId();

  // Write gcalSessionId back to every row for this date
  dateSlots.forEach(s => {
    slotsSheet.getRange(s.rowIdx+1, COL.GCAL_SESSION_ID+1).setValue(newGcalId);
  });
}

// ═══════════════════════════════════════════════════════════════
// EMAIL
// Uses GmailApp (sends as your real Gmail account, avoids spam)
// with MailApp as a fallback if GmailApp isn't authorized yet.
// ═══════════════════════════════════════════════════════════════

function sendMail(opts) {
  // opts: { to, subject, body, replyTo }
  try {
    // GmailApp sends as the real authenticated user — much less likely to hit spam
    GmailApp.sendEmail(opts.to, opts.subject, opts.body, {
      replyTo: opts.replyTo || ''
    });
  } catch(e) {
    // Fallback to MailApp if GmailApp not authorized
    Logger.log('GmailApp failed, falling back to MailApp: ' + e.message);
    sendMail({
      to: opts.to, subject: opts.subject, body: opts.body,
      replyTo: opts.replyTo || ''
    });
  }
}

function sendConfirmation(name, email, date, startTime, endTime) {
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  sendMail({
    to: email,
    subject: 'Sign-Up Confirmed: ' + formatDate(date) + ' at ' + startTime,
    body: 'Hi ' + name + ',\n\nYou are confirmed for:\n\nDate: ' + formatDate(date) +
          '\nTime: ' + startTime + (endTime?' – '+endTime:'') +
          '\n\nIf you need to cancel, please contact ' + adminEmail + ' as soon as possible.' +
          '\n\nThis is an automated confirmation — please do not reply.',
    replyTo: adminEmail
  });
}

function sendCancellation(name, email, date, startTime, endTime) {
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  sendMail({
    to: email,
    subject: 'Sign-Up Cancelled: ' + formatDate(date) + ' at ' + startTime,
    body: 'Hi ' + name + ',\n\nYour sign-up for ' + formatDate(date) + ' at ' + startTime +
          (endTime?' – '+endTime:'') + ' has been cancelled by the administrator.' +
          '\n\nPlease contact ' + adminEmail + ' if you have questions.',
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
    const remDate = new Date(slotDate);
    remDate.setDate(remDate.getDate() - days);
    if (remDate > new Date()) {
      log.appendRow([slotId, sheetId, name, email, date, startTime, endTime||'',
        remDate.toISOString().slice(0,10), false]);
    }
  });
}

// Run daily via time-based trigger
function sendPendingReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(LOG_SHEET);
  if (!log) return;
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  const todayStr = new Date().toISOString().slice(0,10);
  const rows = log.getDataRange().getValues();
  const sentCombos = new Set(); // deduplicate by email+date
  for (let i = 1; i < rows.length; i++) {
    const [slotId, sheetId, name, email, date, startTime, endTime, reminderDate, sent] = rows[i];
    if (sent || String(reminderDate).slice(0,10) !== todayStr) continue;
    const slotsSheet = ss.getSheetByName(SLOTS_SHEET_PREFIX + sheetId);
    if (slotsSheet) {
      const slotRows = slotsSheet.getDataRange().getValues();
      const slot = slotRows.find(r => String(r[COL.ID]) === String(slotId));
      if (!slot || slot[COL.CANCELLED]==='true' || !slot[COL.NAME]) {
        log.getRange(i+1,9).setValue(true); continue;
      }
    }
    const comboKey = String(email).toLowerCase() + '::' + String(date);
    if (sentCombos.has(comboKey)) { log.getRange(i+1,9).setValue(true); continue; }
    sentCombos.add(comboKey);
    const daysUntil = Math.round((new Date(String(date)+'T00:00:00') - new Date()) / 86400000);
    const label = daysUntil === 1 ? 'Tomorrow' : 'in ' + daysUntil + ' Days';
    try {
      sendMail({
        to: String(email),
        subject: 'Reminder: Presentation ' + label + ' — ' + formatDate(date) + ' at ' + startTime,
        body: 'Hi ' + name + ',\n\nThis is a reminder that you are scheduled to present:\n\n' +
              'Date: ' + formatDate(date) + '\nTime: ' + startTime + (endTime?' – '+endTime:'') +
              '\n\nIf you need to cancel, please contact ' + adminEmail + ' as soon as possible.' +
              '\n\nThis is an automated reminder.',
        replyTo: adminEmail
      });
      log.getRange(i+1, 9).setValue(true);
    } catch(e) { Logger.log('Reminder failed for ' + email + ': ' + e.message); }
  }
}

// Test function — run manually to verify reminders fire correctly
function testReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(LOG_SHEET);
  if (!log) { Logger.log('No EmailLog sheet — sign up for a slot first.'); return; }
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  const rows = log.getDataRange().getValues();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 8);
  const sentCombos = new Set();
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const [slotId, sheetId, name, email, date, startTime, endTime, reminderDate, sent] = rows[i];
    if (sent) continue;
    const remDt = new Date(String(reminderDate).slice(0,10)+'T00:00:00');
    if (remDt > cutoff) continue;
    const comboKey = String(email).toLowerCase() + '::' + String(date);
    if (sentCombos.has(comboKey)) { log.getRange(i+1,9).setValue(true); continue; }
    sentCombos.add(comboKey);
    try {
      sendMail({
        to: String(email),
        subject: '[TEST REMINDER] ' + formatDate(date) + ' at ' + startTime,
        body: '[THIS IS A TEST — not a real reminder]\n\nHi ' + name +
              ',\n\nTest reminder for:\nDate: ' + formatDate(date) +
              '\nTime: ' + startTime + (endTime?' – '+endTime:'') +
              '\n\nIf you received this, the reminder system is working.',
        replyTo: adminEmail
      });
      log.getRange(i+1, 9).setValue(true);
      count++;
      Logger.log('Test reminder sent to ' + email + ' for ' + date);
    } catch(e) { Logger.log('Failed: '+e.message); }
  }
  Logger.log('Done. Sent ' + count + ' test reminder(s).');
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getSheetMeta(sheetId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) return { title:'', syncCalendar:false, calendarId:'primary' };
  const rows = master.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(sheetId)) {
      return { title: String(rows[i][1]||''),
               syncCalendar: rows[i][4]==='true'||rows[i][4]===true,
               calendarId: String(rows[i][5]||'primary') };
    }
  }
  return { title:'', syncCalendar:false, calendarId:'primary' };
}

function buildDateTime(dateStr, timeStr) {
  const dm = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dm) throw new Error('Bad date: '+dateStr);
  const tm = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!tm) throw new Error('Bad time: '+timeStr);
  let h = parseInt(tm[1]), m = parseInt(tm[2]);
  const ap = (tm[3]||'').toUpperCase();
  if (ap==='PM'&&h<12) h+=12;
  if (ap==='AM'&&h===12) h=0;
  return new Date(parseInt(dm[1]), parseInt(dm[2])-1, parseInt(dm[3]), h, m, 0);
}

function timeToMins(timeStr) {
  const m = String(timeStr||'').match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return 0;
  let h = parseInt(m[1]), mn = parseInt(m[2]);
  const ap = (m[3]||'').toUpperCase();
  if (ap==='PM'&&h<12) h+=12;
  if (ap==='AM'&&h===12) h=0;
  return h*60+mn;
}

function addMins(timeStr, mins) {
  const total = timeToMins(timeStr) + mins;
  const h = Math.floor(total/60)%24, m = total%60;
  const ap = h>=12?'PM':'AM', hh=h%12||12;
  return hh+':'+(m<10?'0':'')+m+' '+ap;
}

function normalizeDate(val) {
  if (!val && val !== 0) return '';
  if (typeof val==='string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim();
  if (val instanceof Date) {
    return val.getFullYear()+'-'+String(val.getMonth()+1).padStart(2,'0')+'-'+String(val.getDate()).padStart(2,'0');
  }
  if (typeof val==='number') {
    const ms=(val-25569)*86400000;
    const dt=new Date(ms);
    return dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0')+'-'+String(dt.getUTCDate()).padStart(2,'0');
  }
  return String(val);
}

function normalizeTime(val) {
  if (!val && val!==0) return '';
  if (typeof val==='string'&&val.trim()!=='') return val.trim();
  if (typeof val==='number') {
    const totalMins=Math.round(val*24*60), h=Math.floor(totalMins/60)%24, m=totalMins%60;
    const ap=h>=12?'PM':'AM', hh=h%12||12;
    return hh+':'+(m<10?'0':'')+m+' '+ap;
  }
  if (val instanceof Date) {
    const h=val.getHours(), m=val.getMinutes();
    const ap=h>=12?'PM':'AM', hh=h%12||12;
    return hh+':'+(m<10?'0':'')+m+' '+ap;
  }
  return String(val);
}

function formatDate(dateStr) {
  const m=String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr);
  const d=new Date(Date.UTC(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3])));
  return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
}

// ═══════════════════════════════════════════════════════════════
// EVENT SUBMISSIONS
// ═══════════════════════════════════════════════════════════════

const SUBMISSIONS_SHEET = 'EventSubmissions';

// Called by doGet routing — add these to the action dispatcher:
// 'getSubmitConfig', 'submitEvent', 'getSubmissions'

function getSubmitConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    passphrase: props.getProperty('SUBMIT_PASSPHRASE') || '',
    pageTitle: props.getProperty('SUBMIT_PAGE_TITLE') || 'Submit an Event'
  };
}

function submitEvent(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUBMISSIONS_SHEET);
    const headers = ['id','status','name','date','dateEnd','startTime','endTime',
                     'location','description','category','submittedBy','submitterRole',
                     'submitterEmail','submittedAt','gcalEventId','reviewNotes'];
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold')
      .setBackground('#1a2744').setFontColor('#ffffff');
    // Force date columns to text
    sheet.getRange(1,3,1000,2).setNumberFormat('@STRING@');
  }
  const id = Utilities.getUuid();
  sheet.appendRow([
    id, 'pending',
    String(data.name||''), String(data.date||''), String(data.dateEnd||''),
    String(data.startTime||''), String(data.endTime||''),
    String(data.location||''), String(data.description||''),
    String(data.category||''), String(data.submittedBy||''),
    String(data.submitterRole||''), String(data.submitterEmail||''),
    String(data.submittedAt||new Date().toISOString()), '', ''
  ]);
  // Email notification to admin
  const props = PropertiesService.getScriptProperties();
  const notifyEmail = props.getProperty('SUBMIT_NOTIFY_EMAIL') || '';
  const adminEmail  = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  if (notifyEmail) {
    try {
      sendMail({
        to: notifyEmail,
        subject: 'New Event Submission: ' + data.name,
        body: 'A new event has been submitted for your review.\n\n' +
              'Event: ' + data.name + '\n' +
              'Date: ' + formatDate(data.date) + (data.startTime?' at '+data.startTime:'') + '\n' +
              'Location: ' + (data.location||'Not specified') + '\n' +
              'Category: ' + (data.category||'Not specified') + '\n' +
              'Submitted by: ' + data.submittedBy + (data.submitterRole?' ('+data.submitterRole+')':'') + '\n' +
              (data.submitterEmail?'Submitter email: '+data.submitterEmail+'\n':'') +
              '\nDescription:\n' + (data.description||'None provided') +
              '\n\nLog in to the dashboard to review and approve.',
        replyTo: data.submitterEmail || adminEmail
      });
    } catch(e) { Logger.log('Notification email failed: '+e.message); }
  }
  return { ok: true, id };
}

function getSubmissions(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) return { submissions: [] };
  const rows = sheet.getDataRange().getValues();
  const submissions = [];
  for (let i = 1; i < rows.length; i++) {
    const [id,status,name,date,dateEnd,startTime,endTime,location,description,
           category,submittedBy,submitterRole,submitterEmail,submittedAt,gcalEventId,reviewNotes] = rows[i];
    if (!id) continue;
    const statusFilter = data && data.status;
    if (statusFilter && String(status) !== statusFilter) continue;
    submissions.push({
      id:String(id), status:String(status||'pending'), name:String(name||''),
      date:normalizeDate(date), dateEnd:normalizeDate(dateEnd||''),
      startTime:normalizeTime(startTime||''), endTime:normalizeTime(endTime||''),
      location:String(location||''), description:String(description||''),
      category:String(category||''), submittedBy:String(submittedBy||''),
      submitterRole:String(submitterRole||''), submitterEmail:String(submitterEmail||''),
      submittedAt:String(submittedAt||''), gcalEventId:String(gcalEventId||''),
      reviewNotes:String(reviewNotes||'')
    });
  }
  return { submissions };
}

function updateSubmission(data) {
  // Update fields on a submission row (for editing before approval)
  const { id, fields } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) throw new Error('Submissions sheet not found');
  const rows = sheet.getDataRange().getValues();
  const colMap = {status:2,name:3,date:4,dateEnd:5,startTime:6,endTime:7,
                  location:8,description:9,category:10,reviewNotes:16};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      Object.entries(fields).forEach(([key, val]) => {
        const col = colMap[key];
        if (col) sheet.getRange(i+1, col).setValue(String(val));
      });
      return { ok: true };
    }
  }
  throw new Error('Submission not found');
}

function approveSubmission(data) {
  const { id, calendarId } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) throw new Error('Submissions sheet not found');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    const [,status,name,date,dateEnd,startTime,endTime,location,description] = rows[i];
    // Create calendar event
    const cal = CalendarApp.getCalendarById(calendarId||'primary') || CalendarApp.getDefaultCalendar();
    const startDt = buildDateTime(normalizeDate(date), normalizeTime(startTime||'')||'00:00');
    let endDt;
    if (endTime) {
      endDt = buildDateTime(normalizeDate(date), normalizeTime(endTime));
    } else if (dateEnd && normalizeDate(dateEnd) !== normalizeDate(date)) {
      endDt = buildDateTime(normalizeDate(dateEnd), '23:59');
    } else {
      endDt = new Date(startDt.getTime() + 2*60*60000); // default 2hr
    }
    const ev = cal.createEvent(String(name), startDt, endDt, {
      location: String(location||''),
      description: String(description||'')
    });
    // Mark approved, store gcalEventId
    sheet.getRange(i+1, 2).setValue('approved');
    sheet.getRange(i+1, 15).setValue(ev.getId());
    return { ok: true, gcalEventId: ev.getId() };
  }
  throw new Error('Submission not found');
}

function rejectSubmission(data) {
  const { id, reviewNotes } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) throw new Error('Submissions sheet not found');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.getRange(i+1, 2).setValue('rejected');
      if (reviewNotes) sheet.getRange(i+1, 16).setValue(String(reviewNotes));
      return { ok: true };
    }
  }
  throw new Error('Submission not found');
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR EVENT ARCHIVE
// ═══════════════════════════════════════════════════════════════

const ARCHIVE_SHEET = 'EventArchive';

// ── Determine source tag for a calendar event ──
function getEventSource(ev) {
  try {
    const ext = ev.getExtendedProperty('source') || '';
    if (ext === 'uf_area_head') return 'Sign-Up Sheet';
  } catch(e) {}
  // Check if it was an approved submission by looking up gcalEventId in submissions
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const subSheet = ss.getSheetByName(SUBMISSIONS_SHEET);
    if (subSheet) {
      const rows = subSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][14]) === ev.getId()) return 'Submission';
      }
    }
  } catch(e) {}
  return 'Manual';
}

// ── Core archive function: fetch events from GCal and write to archive sheet ──
function archivePeriod(calendarId, startDate, endDate, semesterLabel) {
  const cal = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  const events = cal.getEvents(startDate, endDate);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ARCHIVE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ARCHIVE_SHEET);
    const headers = ['id','semester','name','date','dateEnd','startTime','endTime',
                     'location','description','category','source','gcalEventId','archivedAt'];
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold')
      .setBackground('#1a2744').setFontColor('#ffffff');
    sheet.getRange(1, 4, 5000, 2).setNumberFormat('@STRING@');
  }
  // Remove existing entries for this semester (clean re-archive)
  const existingRows = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = existingRows.length - 1; i >= 1; i--) {
    if (String(existingRows[i][1]) === semesterLabel) rowsToDelete.push(i + 1);
  }
  rowsToDelete.forEach(r => sheet.deleteRow(r));

  // Write new entries
  const now = new Date().toISOString();
  let count = 0;
  events.forEach(ev => {
    try {
      const start = ev.getStartTime();
      const end   = ev.getEndTime();
      const allDay = ev.isAllDayEvent();
      const dateStr    = start.toISOString().slice(0,10);
      const dateEndStr = end.toISOString().slice(0,10);
      const startStr   = allDay ? '' : formatTimeFromDate(start);
      const endStr     = allDay ? '' : formatTimeFromDate(end);
      const source = getEventSource(ev);
      sheet.appendRow([
        Utilities.getUuid(), semesterLabel,
        ev.getTitle(), dateStr,
        dateStr !== dateEndStr ? dateEndStr : '',
        startStr, endStr,
        ev.getLocation() || '',
        ev.getDescription() || '',
        '', // category not stored in gcal
        source,
        ev.getId(),
        now
      ]);
      count++;
    } catch(e) { Logger.log('Error archiving event: ' + e.message); }
  });
  Logger.log('Archived ' + count + ' events for ' + semesterLabel);
  return { ok: true, count, semesterLabel };
}

function formatTimeFromDate(dt) {
  const h = dt.getHours(), m = dt.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return hh + ':' + String(m).padStart(2,'0') + ' ' + ap;
}

// ── Scheduled: run on Month timer (day 1) — only executes in January ──
function archiveFallSemester() {
  const now = new Date();
  if (now.getMonth() !== 0) return; // Only run in January (month 0)
  const props = PropertiesService.getScriptProperties();
  const calendarId = props.getProperty('ARCHIVE_CALENDAR_ID') || 'primary';
  const year = now.getFullYear() - 1; // previous year's fall
  const start = new Date(year, 7, 1);  // Aug 1
  const end   = new Date(year, 11, 31, 23, 59, 59); // Dec 31
  return archivePeriod(calendarId, start, end, 'Fall ' + year);
}

// ── Scheduled: run on Month timer (day 1) — only executes in August ──
function archiveSpringAndSummer() {
  const now = new Date();
  if (now.getMonth() !== 7) return; // Only run in August (month 7)
  const props = PropertiesService.getScriptProperties();
  const calendarId = props.getProperty('ARCHIVE_CALENDAR_ID') || 'primary';
  const year = now.getFullYear(); // current year's spring/summer
  const start = new Date(year, 0, 1);  // Jan 1
  const end   = new Date(year, 6, 31, 23, 59, 59); // Jul 31
  return archivePeriod(calendarId, start, end, 'Spring ' + year);
}

// ── Manual: archive any arbitrary period from dashboard ──
function archiveCustomPeriod(data) {
  const { calendarId, startDate, endDate, semesterLabel } = data;
  const start = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T23:59:59');
  return archivePeriod(calendarId, start, end, semesterLabel);
}

// ── Read archived events (optionally filtered by semester) ──
function getArchivedEvents(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ARCHIVE_SHEET);
  if (!sheet) return { events: [], semesters: [] };
  const rows = sheet.getDataRange().getValues();
  const events = [];
  const semSet = new Set();
  const semFilter = data && data.semester ? data.semester : null;
  for (let i = 1; i < rows.length; i++) {
    const [id,semester,name,date,dateEnd,startTime,endTime,
           location,description,category,source,gcalEventId,archivedAt] = rows[i];
    if (!id) continue;
    semSet.add(String(semester));
    if (semFilter && String(semester) !== semFilter) continue;
    events.push({
      id: String(id), semester: String(semester),
      name: String(name||''),
      date: normalizeDate(date), dateEnd: normalizeDate(dateEnd||''),
      startTime: normalizeTime(startTime||''), endTime: normalizeTime(endTime||''),
      location: String(location||''), description: String(description||''),
      category: String(category||''), source: String(source||''),
      gcalEventId: String(gcalEventId||''), archivedAt: String(archivedAt||'')
    });
  }
  // Sort events by date
  events.sort((a,b) => a.date.localeCompare(b.date));
  return { events, semesters: [...semSet].sort() };
}

// ── Export as printable HTML ──
function getArchiveExportHtml(data) {
  const { semester } = data;
  const result = getArchivedEvents({ semester });
  const events = result.events;
  if (!events.length) return { html: '<p>No events archived for this semester.</p>' };
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${semester} — Composition Area Events</title>
<style>
  body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#1a2744;padding:0 20px;}
  h1{font-size:24px;border-bottom:3px solid #c9a84c;padding-bottom:10px;margin-bottom:24px;}
  .event{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #ddd8cc;}
  .event:last-child{border-bottom:none;}
  .ev-name{font-size:16px;font-weight:bold;margin-bottom:4px;}
  .ev-meta{font-size:13px;color:#5a5649;margin-bottom:4px;}
  .ev-desc{font-size:13px;margin-top:6px;line-height:1.6;}
  .ev-source{font-size:11px;color:#9e9788;margin-top:4px;}
  @media print{body{margin:20px;}.ev-source{display:none;}}
</style></head><body>
<h1>Composition &amp; Theory Area — ${semester}</h1>`;
  events.forEach(ev => {
    const timeStr = ev.startTime ? ev.startTime + (ev.endTime ? '–' + ev.endTime : '') : '';
    html += `<div class="event">
  <div class="ev-name">${escHtml(ev.name)}</div>
  <div class="ev-meta">${formatDate(ev.date)}${timeStr?' · '+timeStr:''}${ev.location?' · '+escHtml(ev.location):''}</div>
  ${ev.description ? `<div class="ev-desc">${escHtml(ev.description).replace(/\n/g,'<br>')}</div>` : ''}
  <div class="ev-source">Source: ${escHtml(ev.source)}</div>
</div>`;
  });
  html += '</body></html>';
  return { html };
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
