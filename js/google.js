// ═══════════════════════════════════════════════════════
// GOOGLE INTEGRATION
// Handles: OAuth sign-in, Drive save/load, Calendar sync
// ═══════════════════════════════════════════════════════

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'profile',
  'email'
].join(' ');

let _accessToken = null;
let _driveFileId = null;
let _saveTimer = null;
let _userInfo = null;

// ── Load Google Identity Services script ──
function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

// ── Check config on page load ──
window.addEventListener('DOMContentLoaded', async () => {
  if (!CONFIG.GOOGLE_CLIENT_ID || CONFIG.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    document.getElementById('auth-config-warning').style.display = 'block';
    document.getElementById('btn-google-signin').disabled = true;
    document.getElementById('btn-google-signin').style.opacity = '0.4';
    return;
  }
  await loadGoogleScript();

  // Try silent token refresh (user already signed in before)
  tryAutoSignIn();
});

// ── Silent sign-in attempt ──
function tryAutoSignIn() {
  google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.access_token) {
        _accessToken = resp.access_token;
        onSignedIn();
      }
    }
  }).requestAccessToken({ prompt: '' }); // '' = silent, no prompt if already authorized
}

// ── Manual sign-in button ──
window.googleSignIn = function () {
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

// ── Sign out ──
window.googleSignOut = function () {
  google.accounts.oauth2.revoke(_accessToken, () => {});
  _accessToken = null;
  _driveFileId = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  showToast('Signed out.', 'info');
};

// ── After successful sign-in ──
async function onSignedIn() {
  // Get user profile
  try {
    const resp = await gFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    _userInfo = resp;
    document.getElementById('user-name').textContent = resp.given_name || resp.name || '';
    if (resp.picture) {
      const av = document.getElementById('user-avatar');
      av.src = resp.picture; av.style.display = 'block';
    }
  } catch(e) {}

  // Show app, hide auth
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('today-badge').textContent =
    new Date().toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});

  // Load data from Drive
  setSyncStatus('saving', 'Loading…');
  await driveLoad();
  setSyncStatus('ok', 'Synced');

  // Init app
  initApp();
}

// ── DRIVE: Authenticated fetch helper ──
async function gFetch(url, options = {}) {
  const headers = {
    'Authorization': 'Bearer ' + _accessToken,
    ...(options.headers || {})
  };
  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google API error ${resp.status}: ${err}`);
  }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text();
}

// ── DRIVE: Find or create the data file ──
async function driveGetFileId() {
  if (_driveFileId) return _driveFileId;
  // Search for existing file
  const q = encodeURIComponent(`name='${CONFIG.DRIVE_FILE_NAME}' and trashed=false`);
  const result = await gFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (result.files && result.files.length > 0) {
    _driveFileId = result.files[0].id;
    return _driveFileId;
  }
  return null; // File doesn't exist yet
}

// ── DRIVE: Load data ──
async function driveLoad() {
  try {
    const fileId = await driveGetFileId();
    if (!fileId) {
      // First time — use seeded defaults
      load(); seedDefaults();
      await driveSaveNow(); // Create the file
      return;
    }
    const text = await gFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    Object.assign(STORE, data);
    // Ensure array fields exist
    ensureStoreArrays();
    showToast('Data loaded from Google Drive', 'success');
  } catch(e) {
    showToast('Could not load from Drive — using local data.', 'error');
    load(); seedDefaults();
  }
}

// ── DRIVE: Save data (debounced) ──
function driveSave() {
  setSyncStatus('saving', 'Saving…');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(driveSaveNow, 1500);
}

async function driveSaveNow() {
  try {
    const json = JSON.stringify(STORE, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const fileId = await driveGetFileId();

    if (fileId) {
      // Update existing file
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + _accessToken, 'Content-Type': 'application/json' },
        body: json
      });
    } else {
      // Create new file
      const meta = { name: CONFIG.DRIVE_FILE_NAME, mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', blob);
      const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _accessToken },
        body: form
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

// ── CALENDAR: Create event ──
async function calCreateEvent(title, dateStr, timeStr, endTimeStr, description, category) {
  if (!_accessToken) return null;
  try {
    let start, end;
    if (timeStr) {
      // Timed event
      const startDt = parseDateTimeLocal(dateStr, timeStr);
      const endDt = endTimeStr ? parseDateTimeLocal(dateStr, endTimeStr) : new Date(startDt.getTime() + 60 * 60000);
      start = { dateTime: startDt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      end = { dateTime: endDt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    } else {
      // All-day event
      start = { date: dateStr };
      end = { date: dateStr };
    }
    const body = {
      summary: title,
      description: description || '',
      start, end,
      colorId: CONFIG.CALENDAR_COLOR_ID,
      extendedProperties: { private: { source: 'uf_area_head', category: category || '' } }
    };
    const result = await gFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.CALENDAR_ID)}/events`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    showToast('✅ Added to Google Calendar', 'success');
    return result.id;
  } catch(e) {
    showToast('Calendar sync failed: ' + e.message, 'error');
    return null;
  }
}

// ── CALENDAR: Update existing event ──
async function calUpdateEvent(gcalId, title, dateStr, timeStr, endTimeStr, description, category) {
  if (!_accessToken || !gcalId) return false;
  try {
    let start, end;
    if (timeStr) {
      const startDt = parseDateTimeLocal(dateStr, timeStr);
      const endDt = endTimeStr ? parseDateTimeLocal(dateStr, endTimeStr) : new Date(startDt.getTime() + 60 * 60000);
      start = { dateTime: startDt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      end = { dateTime: endDt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    } else {
      start = { date: dateStr };
      end = { date: dateStr };
    }
    const body = {
      summary: title,
      description: description || '',
      start, end,
      colorId: CONFIG.CALENDAR_COLOR_ID,
      extendedProperties: { private: { source: 'uf_area_head', category: category || '' } }
    };
    await gFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.CALENDAR_ID)}/events/${gcalId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    showToast('✅ Google Calendar updated', 'success');
    return true;
  } catch(e) {
    // If the event was deleted from Google Calendar's side, recreate it
    showToast('Could not update GCal event — will recreate it.', 'info');
    return false;
  }
}

// ── CALENDAR: Update or recreate event (handles deleted/missing events) ──
async function calSyncEvent(gcalId, title, dateStr, timeStr, endTimeStr, description, category) {
  if (gcalId) {
    const updated = await calUpdateEvent(gcalId, title, dateStr, timeStr, endTimeStr, description, category);
    if (updated) return gcalId;
    // Update failed — fall through to recreate
  }
  return await calCreateEvent(title, dateStr, timeStr, endTimeStr, description, category);
}

// ── CALENDAR: Delete event ──
async function calDeleteEvent(gcalId) {
  if (!_accessToken || !gcalId) return;
  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.CALENDAR_ID)}/events/${gcalId}`,
      { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + _accessToken } }
    );
  } catch(e) {}
}

// ── CALENDAR: Create reminder (all-day event with alarm) ──
async function calCreateReminder(title, dateStr, notes, urgency) {
  if (!_accessToken) return null;
  try {
    const body = {
      summary: '🔔 ' + title,
      description: notes || '',
      start: { date: dateStr },
      end: { date: dateStr },
      colorId: urgency === 'high' ? '11' : urgency === 'med' ? '5' : '2',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 480 }] },
      extendedProperties: { private: { source: 'uf_area_head', type: 'reminder' } }
    };
    const result = await gFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.CALENDAR_ID)}/events`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    showToast('✅ Reminder added to Google Calendar', 'success');
    return result.id;
  } catch(e) {
    showToast('Calendar sync failed: ' + e.message, 'error');
    return null;
  }
}

// ── HELPERS ──
function parseDateTimeLocal(dateStr, timeStr) {
  // Parse "2:00 PM" style time
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
  const div = document.createElement('div');
  div.className = 'toast-item ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
