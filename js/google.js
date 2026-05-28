// ═══════════════════════════════════════════════════════
// GOOGLE INTEGRATION v5
// Primary account: Drive + Calendar (scottleemusic.net)
// Secondary account: Calendar only (scott.lee@ufl.edu)
// ═══════════════════════════════════════════════════════

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'profile', 'email'
].join(' ');

const SCOPES_CAL_ONLY = [
  'https://www.googleapis.com/auth/calendar.events',
  'email', 'profile'
].join(' ');

let _accessToken  = null;   // primary account
let _uflToken     = null;   // UFL account (calendar only)
let _driveFileId  = null;
let _saveTimer    = null;
let _userInfo     = null;

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

// ── Primary sign-in (silent) ──
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
  _accessToken = null; _uflToken = null; _driveFileId = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  showToast('Signed out.', 'info');
};

// ── UFL secondary account — Calendar + identity ──
window.connectUFLCalendar = function() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES_CAL_ONLY,
    callback: async (resp) => {
      if (resp.error) { showToast('UFL sign-in failed: ' + resp.error, 'error'); return; }
      _uflToken = resp.access_token;
      // Verify which account this is
      let email = '';
      try {
        const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + _uflToken }
        }).then(r => r.json());
        email = info.email || info.name || 'UFL Account';
      } catch(e) {
        email = 'UFL Account'; // fallback if userinfo fails
      }
      showToast('✅ Connected: ' + email, 'success');
      updateUFLStatus(email, true);
    }
  });
  // Force account chooser so user can pick their UFL account
  client.requestAccessToken({ prompt: 'select_account' });
};

window.disconnectUFLCalendar = function() {
  if (_uflToken) google.accounts.oauth2.revoke(_uflToken, () => {});
  _uflToken = null;
  updateUFLStatus('', false);
  showToast('UFL Calendar disconnected.', 'info');
};

// Silent UFL token refresh attempt
function tryAutoUFLSignIn() {
  if (!(STORE.settings.uflCalendar && STORE.settings.uflCalendar.email)) return;
  google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES_CAL_ONLY,
    hint: STORE.settings.uflCalendar.email,
    callback: (resp) => {
      if (resp.access_token) {
        _uflToken = resp.access_token;
        updateUFLStatus(STORE.settings.uflCalendar.email, true);
      }
    }
  }).requestAccessToken({ prompt: '' });
}

function updateUFLStatus(email, connected) {
  const badge = document.getElementById('ufl-cal-badge');
  const btnConnect = document.getElementById('btn-connect-ufl');
  const btnDisconnect = document.getElementById('btn-disconnect-ufl');
  if (badge) badge.textContent = connected ? '✓ ' + email : 'Not connected';
  if (badge) badge.style.color = connected ? 'var(--green)' : 'var(--gray-400)';
  if (btnConnect) btnConnect.style.display = connected ? 'none' : 'inline-flex';
  if (btnDisconnect) btnDisconnect.style.display = connected ? 'inline-flex' : 'none';
  if (connected && email && STORE.settings) {
    if (!STORE.settings.uflCalendar) STORE.settings.uflCalendar = {};
    STORE.settings.uflCalendar.email = email;
    STORE.settings.uflCalendar.connected = true;
    save();
  }
}

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

  // Try to silently reconnect UFL token
  tryAutoUFLSignIn();

  initApp();
}

// ═══════════════════════════════════════
// DRIVE
// ═══════════════════════════════════════

async function gFetch(url, options = {}, token) {
  const tok = token || _accessToken;
  const headers = { 'Authorization': 'Bearer ' + tok, ...(options.headers || {}) };
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
  try {
    const fileId = await driveGetFileId();
    if (!fileId) { load(); seedDefaults(); await driveSaveNow(); return; }
    const text = await gFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    Object.assign(STORE, data);
    ensureStoreArrays();
    showToast('Data loaded from Google Drive', 'success');
  } catch(e) {
    showToast('Could not load from Drive — using local data.', 'error');
    load(); seedDefaults();
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
// CALENDAR — MULTI-TARGET
// ═══════════════════════════════════════

// Build a calendar event body
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

// Create event on a specific calendar with a specific token
async function calCreateOnTarget(calendarId, token, body) {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  if (!resp.ok) { const err = await resp.text(); throw new Error(resp.status + ': ' + err); }
  return (await resp.json()).id;
}

// Update event on a specific calendar with a specific token
// Returns true on success, false if event not found or update failed
async function calUpdateOnTarget(calendarId, eventId, token, body) {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    if (resp.status === 404) return false; // event was deleted from GCal
    return resp.ok;
  } catch(e) {
    return false;
  }
}

// Delete event on a specific calendar with a specific token
async function calDeleteOnTarget(calendarId, eventId, token) {
  if (!token || !eventId) return;
  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } }
    );
  } catch(e) {}
}

// ── Main public API — creates event on all selected targets ──
// targets: array of { calendarId, token, label, attendees? }
// Returns array of { label, gcalId }
async function calCreateMulti(title, dateStr, timeStr, endTimeStr, description, category, targets) {
  const results = [];
  const body = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
  for (const t of targets) {
    try {
      // Build body with attendees for this target if specified
      const tBody = t.attendees && t.attendees.length
        ? buildCalBody(title, dateStr, timeStr, endTimeStr, description, category, t.attendees)
        : body;
      const id = await calCreateOnTarget(t.calendarId, t.token, tBody);
      results.push({ label: t.label, gcalId: id });
      showToast(`✅ Added to ${t.label}`, 'success');
    } catch(e) {
      showToast(`Calendar sync failed (${t.label}): ${e.message}`, 'error');
      results.push({ label: t.label, gcalId: null });
    }
  }
  return results;
}

async function calSyncMulti(existingIds, title, dateStr, timeStr, endTimeStr, description, category, targets) {
  // existingIds: { [label]: gcalId }
  const results = [];
  for (const t of targets) {
    const existing = existingIds && existingIds[t.label];
    const tBody = t.attendees && t.attendees.length
      ? buildCalBody(title, dateStr, timeStr, endTimeStr, description, category, t.attendees)
      : buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);

    if (existing) {
      const ok = await calUpdateOnTarget(t.calendarId, existing, t.token, tBody);
      if (ok) {
        results.push({ label: t.label, gcalId: existing });
        showToast(`✅ Updated ${t.label}`, 'success');
        continue;
      }
      // PATCH failed (event was deleted externally) — delete the stale ID and recreate
      await calDeleteOnTarget(t.calendarId, existing, t.token).catch(()=>{});
    }

    // Create fresh (either no existing ID, or PATCH failed)
    try {
      const id = await calCreateOnTarget(t.calendarId, t.token, tBody);
      results.push({ label: t.label, gcalId: id });
      showToast(`✅ Added to ${t.label}`, 'success');
    } catch(e) {
      showToast(`Calendar sync failed (${t.label}): ${e.message}`, 'error');
      results.push({ label: t.label, gcalId: null });
    }
  }
  return results;
}

// ── Backwards-compatible wrappers (used by existing events/reminders/tasks) ──
async function calCreateEvent(title, dateStr, timeStr, endTimeStr, description, category) {
  if (!_accessToken) return null;
  const targets = [{ calendarId: CONFIG.CALENDAR_ID, token: _accessToken, label: 'Primary' }];
  const res = await calCreateMulti(title, dateStr, timeStr, endTimeStr, description, category, targets);
  return res[0] && res[0].gcalId;
}

async function calSyncEvent(gcalId, title, dateStr, timeStr, endTimeStr, description, category) {
  if (!_accessToken) return null;
  if (gcalId) {
    const body = buildCalBody(title, dateStr, timeStr, endTimeStr, description, category);
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
  } catch(e) {
    showToast('Calendar sync failed: ' + e.message, 'error');
    return null;
  }
}

// ── Build targets array from meeting settings ──
// Returns array of { calendarId, token, label, attendees? } for each enabled target
function buildMeetingTargets(meetingSettings) {
  const targets = [];
  const ms = meetingSettings || STORE.settings.meetingCalendars || {};

  // Primary calendar
  if (ms.primary !== false) {
    if (_accessToken) targets.push({ calendarId: CONFIG.CALENDAR_ID, token: _accessToken, label: 'Primary Calendar' });
  }

  // UFL calendar
  if (ms.ufl) {
    if (_uflToken) {
      const uflCalId = (STORE.settings.uflCalendar && STORE.settings.uflCalendar.calendarId) || 'primary';
      const attendees = ms.sendInvites ? getFacultyAttendees() : [];
      targets.push({ calendarId: uflCalId, token: _uflToken, label: 'UFL Calendar', attendees });
    } else {
      showToast('⚠ UFL Calendar selected but not connected — go to Settings to connect.', 'error');
    }
  }

  // Named calendars
  const namedCals = (STORE.settings.signups && STORE.settings.signups.namedCals) || [];
  (ms.named || []).forEach(calId => {
    const cal = namedCals.find(c => c.id === calId);
    if (cal) targets.push({ calendarId: calId, token: _accessToken, label: cal.nick });
  });

  return targets;
}

function getFacultyAttendees() {
  const list = (STORE.settings.facultyInviteList || []);
  // Also include faculty from People whose areas include Composition or Theory
  // combined with the manual list
  return [...new Set(list)].filter(e => e && e.includes('@'));
}

// ─────────────────────────────────────
// HELPERS
// ─────────────────────────────────────

function parseDateTimeLocal(dateStr, timeStr) {
  const [datePart] = dateStr.split('T');
  const dt = new Date(datePart + 'T00:00:00');
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
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
  const icon = document.getElementById('sync-icon');
  const lbl = document.getElementById('sync-label');
  if (!el) return;
  el.className = 'sync-badge sync-' + state;
  lbl.textContent = label;
  icon.textContent = state === 'saving' ? '↻' : state === 'ok' ? '✓' : state === 'error' ? '✕' : '☁';
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'toast-item ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
