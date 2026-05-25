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
    if (action === 'getSheet')    return jsonResponse(getSheet(e.parameter.sheetId));
    if (action === 'listSheets')  return jsonResponse(listSheets());
    if (['claim','cancel','createSheet','deleteSheet'].includes(action)) {
      const data = JSON.parse(decodeURIComponent(e.parameter.payload || '{}'));
      data.action = action;
      if (action === 'claim')       return jsonResponse(claimSlot(data));
      if (action === 'cancel')      return jsonResponse(cancelSlot(data));
      if (action === 'createSheet') return jsonResponse(createSheet(data));
      if (action === 'deleteSheet') return jsonResponse(deleteSheet(data));
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
      slotsSheet.getRange(i+1, COL.NAME+1).setValue('');
      slotsSheet.getRange(i+1, COL.EMAIL+1).setValue('');
      slotsSheet.getRange(i+1, COL.ROLE+1).setValue('');
      slotsSheet.getRange(i+1, COL.CANCELLED+1).setValue('true');
      if (studentEmail) sendCancellation(studentName, studentEmail,
        slotDate, normalizeTime(rows[i][COL.START]), normalizeTime(rows[i][COL.END]||''));
      // Re-read and sync calendar
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

// ── Create a sheet and optionally seed calendar events ──
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

  // Seed Google Calendar events (one per unique date)
  if (syncCalendar) {
    try {
      const sheetMeta = { title, calendarId: calendarId||'primary', syncCalendar: true };
      const allRows = slotsSheet.getDataRange().getValues();
      const uniqueDates = [...new Set(slots.map(s=>s.date))];
      uniqueDates.forEach(date => {
        syncSessionCalendarEvent(slotsSheet, allRows, sheetId, date, sheetMeta);
      });
    } catch(e) { Logger.log('Calendar seed error: '+e.message); }
  }

  return { ok: true, sheetId };
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

// Build the correct event title for a given date's slots:
// — Not all filled: return sheet title (generic)
// — All filled: return formatted presenter list
function buildEventTitle(slots, sheetTitle) {
  const active = slots.filter(s => !s.cancelled);
  if (!active.length) return sheetTitle;
  const allFilled = active.every(s => s.studentName && s.studentName.trim() !== '');
  if (!allFilled) return sheetTitle;
  // All slots filled — format as: "Last, Role Presentation — Title; Last2, Role2 Presentation — Title"
  return active.map(s => {
    const last = s.studentName.trim().split(/\s+/).pop();
    const role = s.role ? s.role.trim() : '';
    return last + ', ' + role + ' Presentation — ' + sheetTitle;
  }).join('; ');
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
// ═══════════════════════════════════════════════════════════════

function sendConfirmation(name, email, date, startTime, endTime) {
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  MailApp.sendEmail({
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
  MailApp.sendEmail({
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
      MailApp.sendEmail({
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
      MailApp.sendEmail({
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
