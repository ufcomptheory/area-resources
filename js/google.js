// ═══════════════════════════════════════════════════════
// GOOGLE INTEGRATION
// ═══════════════════════════════════════════════════════

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'profile', 'email'
].join(' ');

let _accessToken = null;
let _driveFileId = null;
let _saveTimer   = null;
let _userInfo    = null;

// ── Load Google Identity Services ──
function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    document.getElementById('auth-config-warning').style.display = 'block';
    document.getElementById('btn-google-signin').disabled = true;
    document.getElementById('btn-google-signin').style.opacity = '0.4';
    return;
  }
  await loadGoogleScript();
  tryAutoSignIn();
});

// ── Silent sign-in on load ──
function tryAutoSignIn() {
  google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.access_token) { _accessToken = resp.access_token; onSignedIn(); }
    }
  }).requestAccessToken({ prompt: '' });
}

window.googleSignIn = function() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) { showToast('Sign-in failed: ' + resp.error, 'error'); return; }
      _accessToken = resp.access_token;
      await onSignedIn();
    }
  });
  client.requestAccessToken({ prompt: 'consent' });
};

window.googleSignOut = function() {
  google.accounts.oauth2.revoke(_accessToken, () => {});
  _accessToken = null; _driveFileId = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  showToast('Signed out.', 'info');
};

async function onSignedIn() {
  try {
    const resp = await gFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    _userInfo = resp;
    document.getElementById('user-name').textContent = resp.given_name || resp.name || '';
    const av = document.getElementById('user-avatar');
    if (resp.picture) { av.src = resp.picture; av.style.display = 'block'; }
  } catch(e) {}

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('today-badge').textContent =
    new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});

  setSyncStatus('saving', 'Loading…');
  await driveLoad();
  setSyncStatus('ok', 'Synced');
  initApp();
}

// ═══════════════════════════════════════
// DRIVE
// ═══════════════════════════════════════

async function gFetch(url, options = {}) {
  const headers = { 'Authorization': 'Bearer ' + _accessToken, ...(options.headers || {}) };
  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) { const err = await resp.text(); throw new Error(`Google API ${resp.status}: ${err}`); }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text();
}

async function driveGetFileId() {
  if (_driveFileId) return _driveFileId;
  const q = encodeURIComponent(`name='${CONFIG.DRIVE_FILE_NAME}' and trashed=false`);
  const result = await gFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (result.files && result.files.length > 0) { _driveFileId = result.files[0].id; return _driveFileId; }
  return null;
}

async function driveLoad() {
  let loadedFromDrive = false;
  try {
    const fileId = await driveGetFileId();
    if (!fileId) {
      load(); seedDefaults();
      await driveSaveNow();
      showToast('Welcome — new data file created in Google Drive.', 'success');
      return;
    }
    const text = await gFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    let data;
    try { data = typeof text === 'string' ? JSON.parse(text) : text; }
    catch(e) { load(); seedDefaults(); showToast('Drive file could not be parsed.', 'error'); return; }
    Object.assign(STORE, data);
    loadedFromDrive = true;
    ensureStoreArrays();
    showToast('Data loaded from Google Drive', 'success');
  } catch(e) {
    if (!loadedFromDrive) {
      // Genuine load failure — fall back to local
      showToast('Could not load from Drive — using local data.', 'error');
      load(); seedDefaults();
    }
    // If loadedFromDrive is true, data is already in STORE — ensureStoreArrays threw
    // but data is fine, just silently ensure arrays
    try { ensureStoreArrays(); } catch(ee) {}
  }
}

function driveSave() {
  setSyncStatus('saving', 'Saving…');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(driveSaveNow, 1500);
}

async function driveSaveNow() {
  try {
    const json = JSON.stringify(STORE, null, 2);
    const fileId = await driveGetFileId();
    if (fileId) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + _accessToken, 'Content-Type': 'application/json' },
        body: json
      });
    } else {
      const meta = { name: CONFIG.DRIVE_FILE_NAME, mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([json], { type: 'application/json' }));
      const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + _accessToken }, body: form
      });
      const result = await resp.json();
      _driveFileId = result.id;
    }
    setSyncStatus('ok', 'Saved');
  } catch(e) {
    setSyncStatus('error', 'Save failed');
    showToast('Drive save failed: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════

function buildCalBody(title, dateStr, timeStr, endTimeStr, description, category, attendees, colorId) {
  let start, end;
  if (timeStr) {
    const startDt = parseDateTimeLocal(dateStr, timeStr);
    const endDt = endTimeStr ? parseDateTimeLocal(dateStr, endTimeStr) : new Date(startDt.getTime() + 60*60000);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    start = { dateTime: startDt.toISOString(), timeZone: tz };
    end   = { dateTime: endDt.toISOString(),   timeZone: tz };
  } else {
    start = { date: dateStr };
    end   = { date: dateStr };
  }
  const body = {
    summary: title, description: description || '', start, end,
    colorId: colorId || CONFIG.CALENDAR_COLOR_ID,
    extendedProperties: { private: { source: 'uf_area_head', category: category || '' } }
  };
  if (attendees && attendees.length) {
    body.attendees = attendees.map(email => ({ email }));
    body.guestsCanSeeOtherGuests = true;
  }
  return body;
}

async function calCreateOnTarget(calendarId, token, body) {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!resp.ok) { const err = await resp.text(); throw new Error(resp.status + ': ' + err); }
  return (await resp.json()).id;
}

// Returns true on success, false if not found (404) or failed
async function calUpdateOnTarget(calendarId, eventId, token, body) {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (resp.status === 404) return false;
    return resp.ok;
  } catch(e) { return false; }
}

async function calDeleteOnTarget(calendarId, eventId, token) {
  if (!token || !eventId) return;
  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } }
    );
  } catch(e) {}
}

// ── Create event on multiple targets ──
async function calCreateMulti(title, dateStr, timeStr, endTimeStr, description, category, targets) {
  const results = [];
  for (const t of targets) {
    try {
      const body = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
      const id = await calCreateOnTarget(t.calendarId, t.token, body);
      results.push({ label: t.label, gcalId: id });
      showToast('✅ Added to ' + t.label, 'success');
    } catch(e) {
      showToast('Calendar sync failed (' + t.label + '): ' + e.message, 'error');
      results.push({ label: t.label, gcalId: null });
    }
  }
  return results;
}

// ── Update or recreate on multiple targets ──
async function calSyncMulti(existingIds, title, dateStr, timeStr, endTimeStr, description, category, targets) {
  const results = [];
  for (const t of targets) {
    const existing = existingIds && existingIds[t.label];
    const body = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
    if (existing) {
      const ok = await calUpdateOnTarget(t.calendarId, existing, t.token, body);
      if (ok) { results.push({ label: t.label, gcalId: existing }); showToast('✅ Updated ' + t.label, 'success'); continue; }
      // PATCH failed — delete stale and recreate
      await calDeleteOnTarget(t.calendarId, existing, t.token).catch(()=>{});
    }
    try {
      const body2 = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
      const id = await calCreateOnTarget(t.calendarId, t.token, body2);
      results.push({ label: t.label, gcalId: id });
      showToast('✅ Added to ' + t.label, 'success');
    } catch(e) {
      showToast('Calendar sync failed (' + t.label + '): ' + e.message, 'error');
      results.push({ label: t.label, gcalId: null });
    }
  }
  return results;
}

// ── Single-target wrappers (backwards compatible) ──
async function calCreateEvent(title, dateStr, timeStr, endTimeStr, description, category) {
  if (!_accessToken) return null;
  try {
    const body = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
    const id = await calCreateOnTarget(CONFIG.CALENDAR_ID, _accessToken, body);
    showToast('✅ Added to Google Calendar', 'success');
    return id;
  } catch(e) { showToast('Calendar sync failed: ' + e.message, 'error'); return null; }
}

async function calSyncEvent(gcalId, title, dateStr, timeStr, endTimeStr, description, category) {
  if (!_accessToken) return null;
  const body = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
  if (gcalId) {
    const ok = await calUpdateOnTarget(CONFIG.CALENDAR_ID, gcalId, _accessToken, body);
    if (ok) { showToast('✅ Google Calendar updated', 'success'); return gcalId; }
  }
  return calCreateEvent(title, dateStr, timeStr, endTimeStr, description, category);
}

async function calDeleteEvent(gcalId) {
  await calDeleteOnTarget(CONFIG.CALENDAR_ID, gcalId, _accessToken);
}

async function calCreateReminder(title, dateStr, notes, urgency) {
  if (!_accessToken) return null;
  try {
    const body = {
      summary: '🔔 ' + title, description: notes || '',
      start: { date: dateStr }, end: { date: dateStr },
      colorId: urgency === 'high' ? '11' : urgency === 'med' ? '5' : '2',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 480 }] },
      extendedProperties: { private: { source: 'uf_area_head', type: 'reminder' } }
    };
    const id = await calCreateOnTarget(CONFIG.CALENDAR_ID, _accessToken, body);
    showToast('✅ Reminder added to Google Calendar', 'success');
    return id;
  } catch(e) { showToast('Calendar sync failed: ' + e.message, 'error'); return null; }
}

// ── Build meeting targets from settings ──
function buildMeetingTargets() {
  const targets = [];
  const ms = STORE.settings.meetingCalendars || {};
  if (ms.primary !== false && _accessToken) {
    targets.push({ calendarId: CONFIG.CALENDAR_ID, token: _accessToken, label: 'Primary Calendar' });
  }
  const namedCals = (STORE.settings.signups && STORE.settings.signups.namedCals) || [];
  (ms.named || []).forEach(calId => {
    const cal = namedCals.find(c => c.id === calId);
    if (cal) targets.push({ calendarId: calId, token: _accessToken, label: cal.nick });
  });
  return targets;
}

function getFacultyAttendees() {
  return ((STORE.settings.facultyInviteList || [])).map(a => a.email).filter(Boolean);
}

// ── Helpers ──
function parseDateTimeLocal(dateStr, timeStr) {
  const dt = new Date(dateStr + 'T00:00:00');
  const match = timeStr && timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    let h = parseInt(match[1]), m = parseInt(match[2]);
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    dt.setHours(h, m, 0, 0);
  }
  return dt;
}

function setSyncStatus(state, label) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-badge sync-' + state;
  document.getElementById('sync-label').textContent = label;
  document.getElementById('sync-icon').textContent = state==='saving'?'↻':state==='ok'?'✓':state==='error'?'✕':'☁';
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'toast-item ' + (type==='error'?'error':type==='success'?'success':'');
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
