// ═══════════════════════════════════════════════════════
// SIGN-UP SHEETS MODULE
// ═══════════════════════════════════════════════════════

// ── State ──
let _suBlocks = [];      // current builder blocks
let _suSheets = [];      // loaded from server
let _suEditBlockId = null;


// ── Apps Script fetch helper — all calls use GET to avoid CORS preflight ──
async function asGet(url, action, payload) {
  let fullUrl = url + '?action=' + encodeURIComponent(action);
  if (payload) fullUrl += '&payload=' + encodeURIComponent(JSON.stringify(payload));
  const resp = await fetch(fullUrl);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Levenshtein distance for fuzzy name matching ──
function editDistance(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i?j?0:i:j));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
function fuzzyMatchStudent(inputName) {
  const roster = STORE.people.filter(p=>p.type==='student'&&p.active!==false);
  let best = null, bestDist = 999;
  roster.forEach(s => {
    const d = editDistance(inputName, s.name);
    if(d < bestDist){ bestDist=d; best=s; }
  });
  if(!best) return null;
  // Accept if within 3 edits or if last name matches exactly
  const inputLast = inputName.trim().split(/\s+/).pop().toLowerCase();
  const rosterLast = best.name.trim().split(/\s+/).pop().toLowerCase();
  if(bestDist <= 3 || inputLast === rosterLast) return { student: best, distance: bestDist, exact: bestDist===0 };
  return null;
}

// ── Time helpers ──
function parseTime(str) {
  // Returns {h, m} from "2:00 PM" or "14:00"
  const m = String(str).match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if(!m) return null;
  let h=parseInt(m[1]),mn=parseInt(m[2]);
  const ap=(m[3]||'').toUpperCase();
  if(ap==='PM'&&h<12) h+=12;
  if(ap==='AM'&&h===12) h=0;
  return {h,m:mn};
}
function fmtTime(h,m) {
  const ap=h>=12?'PM':'AM', hh=h%12||12;
  return hh+':'+(m<10?'0':'')+m+' '+ap;
}
function addMinutes(timeStr, mins) {
  const t=parseTime(timeStr); if(!t) return timeStr;
  const total = t.h*60+t.m+mins;
  return fmtTime(Math.floor(total/60)%24, total%60);
}

// ── Generate slot list from a block definition ──
function generateSlotsFromBlock(block) {
  const slots = [];
  const dates = getBlockDates(block);
  dates.forEach((date, dateIdx) => {
    let curTime = block.startTime;
    for(let i=0; i<block.slotCount; i++) {
      const endTime = addMinutes(curTime, block.duration);
      slots.push({
        id: uid(),
        blockId: block.id,
        blockHeading: block.heading||'',
        isRecurring: dates.length > 1,
        date,
        startTime: curTime,
        endTime,
        dateIdx,
        slotIdx: i
      });
      curTime = addMinutes(endTime, block.gap||0);
    }
  });
  return slots;
}

function getBlockDates(block) {
  const dates = [block.date];
  if(block.recur === 'none' || !block.recur) return dates;
  const interval = block.recur === 'biweekly' ? 14 : 7;
  const until = block.until ? new Date(block.until+'T00:00:00') : null;
  if(!until) return dates;
  let cur = new Date(block.date+'T00:00:00');
  while(true) {
    cur.setDate(cur.getDate()+interval);
    if(until && cur > until) break;
    dates.push(cur.toISOString().slice(0,10));
    if(dates.length > 60) break; // safety
  }
  return dates;
}

// ── Render sign-up sheets page ──

// Returns true if this named calendar should use the dashboard's primary OAuth token
// rather than the Apps Script
function isCalPrimary(calId) {
  const cals = (STORE.settings.signups || {}).namedCals || [];
  const cal = cals.find(c => c.id === calId);
  return cal && cal.account === 'primary';
}

// Create/update blocked-off events on a primary account calendar via Google Calendar API
// Stores gcalIds back to Apps Script to prevent duplicates and enable deletion
async function seedCalendarViaDashboard(sheetId, calendarId) {
  const url = (STORE.settings.signups || {}).appsScriptUrl;
  if (!url) return { created: [], errors: [] };
  // Get sheet data including any existing primaryGcalIds
  const resp = await fetch(url + '?action=getSheet&sheetId=' + encodeURIComponent(sheetId));
  if (!resp.ok) throw new Error('Could not load sheet slots');
  const data = await resp.json();
  const slots = data.slots || [];
  const existingIds = data.primaryGcalIds || {}; // { date: gcalId }
  // Group by unique session date, find session span
  const sessions = {};
  slots.forEach(s => {
    if (!s.date) return;
    if (!sessions[s.date]) sessions[s.date] = { startTime: s.startTime, endTime: s.endTime, title: data.title };
    else if (s.endTime > sessions[s.date].endTime) sessions[s.date].endTime = s.endTime;
  });
  const created = [], errors = [], newIds = { ...existingIds };
  for (const [date, sess] of Object.entries(sessions)) {
    try {
      const existing = existingIds[date];
      if (existing) {
        // Try to update existing event
        const body = {
          summary: sess.title,
          start: { dateTime: parseDateTimeForApi(date, sess.startTime), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end:   { dateTime: parseDateTimeForApi(date, sess.endTime),   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        };
        const ok = await calUpdateOnTarget(calendarId, existing, _accessToken, body);
        if (ok) { created.push(date); continue; }
        // Event was deleted externally — fall through to create
        await calDeleteOnTarget(calendarId, existing, _accessToken).catch(()=>{});
      }
      const gcalId = await calCreateEvent(sess.title, date, sess.startTime, sess.endTime, '', 'Sign-Up');
      if (gcalId) { newIds[date] = gcalId; created.push(date); }
    } catch(e) { errors.push(date + ': ' + e.message); }
  }
  // Save gcalIds back to Apps Script so we can find them later for deletion/update
  if (Object.keys(newIds).length) {
    try { await asGet(url, 'storePrimaryGcalIds', { sheetId, ids: newIds }); } catch(e) {}
  }
  return { created, errors };
}

function parseDateTimeForApi(dateStr, timeStr) {
  if (!timeStr) return dateStr;
  const dt = new Date(dateStr + 'T00:00:00');
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (m) {
    let h = parseInt(m[1]), mn = parseInt(m[2]);
    const ap = (m[3]||'').toUpperCase();
    if (ap==='PM'&&h<12) h+=12;
    if (ap==='AM'&&h===12) h=0;
    dt.setHours(h, mn, 0, 0);
  }
  return dt.toISOString();
}

window.renderSignups = function() {
  loadSuSettings();
  renderSuSheetsList();
  renderSuBuilder();
};

function loadSuSettings() {
  const s = STORE.settings.signups || {};
  document.getElementById('su-apps-script-url').value = s.appsScriptUrl||'';
  document.getElementById('su-admin-key').value = s.adminKey||'';
  document.getElementById('su-public-url').value = s.publicUrl||'';
  document.getElementById('su-remind-days-1').value = s.remindDays1||7;
  document.getElementById('su-remind-days-2').value = s.remindDays2||1;
  renderNamedCalsList();
  populateCalDropdown();
}

function renderNamedCalsList() {
  const cals = (STORE.settings.signups||{}).namedCals || [];
  const el = document.getElementById('su-named-cals-list');
  if (!el) return;
  if (!cals.length) {
    el.innerHTML = '<div class="text-muted mb-8">No calendars saved yet.</div>';
    return;
  }
  el.innerHTML = cals.map((c, i) => {
    const acctBadge = c.account==='primary'
      ? '<span class="pill pill-blue" style="font-size:10px">scottleemusic.net</span>'
      : '<span class="pill pill-gold" style="font-size:10px">ufcomposers</span>';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--gray-100);border-radius:6px;margin-bottom:6px">
      <div style="flex:1">
        <span style="font-weight:600;font-size:13px">${esc(c.nick)}</span>
        <span class="text-muted" style="margin-left:8px;font-size:12px;font-family:'Source Code Pro',monospace">${esc(c.id)}</span>
        <span style="margin-left:8px">${acctBadge}</span>
      </div>
      <button class="btn btn-danger btn-xs" onclick="delNamedCal(${i})">✕</button>
    </div>`;
  }).join('');
}

function populateCalDropdown() {
  const sel = document.getElementById('su-cal-id');
  if (!sel) return;
  const cals = (STORE.settings.signups||{}).namedCals || [];
  const cur = sel.value;
  sel.innerHTML = cals.length
    ? cals.map(c => `<option value="${esc(c.id)}"${c.id===cur?' selected':''}>${esc(c.nick)}</option>`).join('')
    : '<option value="">— Add calendars in Settings tab —</option>';
}

window.delNamedCal = function(idx) {
  const s = STORE.settings.signups;
  if (!s || !s.namedCals) return;
  s.namedCals.splice(idx, 1);
  save(); renderNamedCalsList(); populateCalDropdown();
};

// ── Sheets list ──
async function renderSuSheetsList() {
  const el = document.getElementById('su-sheets-list');
  const url = (STORE.settings.signups||{}).appsScriptUrl;
  if(!url) {
    el.innerHTML = '<div class="text-muted">Configure your Apps Script URL in the Settings tab to get started.</div>';
    return;
  }
  el.innerHTML = '<div class="text-muted">Loading sheets…</div>';
  try {
    const data = await asGet(url, 'listSheets');
    _suSheets = data.sheets||[];
    if(!_suSheets.length) {
      el.innerHTML = '<div class="text-muted">No sign-up sheets yet. Use the Builder tab to create one.</div>';
      return;
    }
    el.innerHTML = _suSheets.map(s => suSheetCard(s)).join('');
    // Cache session dates for dashboard calendar (runs in background)
    cacheSuSessionDates(_suSheets, url);
  } catch(e) {
    el.innerHTML = `<div class="text-muted" style="color:var(--red)">Could not connect to Apps Script: ${e.message}</div>`;
  }
}

// Fetch slot data for each sheet and cache unique session dates for the dashboard calendar
async function cacheSuSessionDates(sheets, url) {
  const sessions = [];
  for (const sheet of sheets) {
    try {
      const resp = await fetch(url + '?action=getSheet&sheetId=' + encodeURIComponent(sheet.id));
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.error || !data.slots) continue;
      // Get unique dates with their first start time
      const byDate = {};
      data.slots.forEach(s => {
        if (!s.date) return;
        if (!byDate[s.date] || s.startTime < byDate[s.date].startTime) {
          byDate[s.date] = { date: s.date, title: sheet.title, startTime: s.startTime };
        }
      });
      Object.values(byDate).forEach(d => sessions.push(d));
    } catch(e) { /* skip failed sheet */ }
  }
  if (!STORE.settings.signups) STORE.settings.signups = {};
  STORE.settings.signups.cachedSessions = sessions;
  save();
  // Refresh calendar views if currently visible
  if (document.getElementById('page-calendar') && document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
  if (document.getElementById('mini-cal')) renderMiniCal();
}

function suSheetCard(s) {
  const settings = STORE.settings.signups||{};
  const publicUrl = settings.publicUrl
    ? settings.publicUrl + '?sheet=' + s.id + '&as=' + encodeURIComponent(settings.appsScriptUrl||'')
    : '#';
  return `<div class="card mb-8">
    <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1">
        <div style="font-family:'Playfair Display',serif;font-size:16px;font-weight:700">${esc(s.title)}</div>
        ${s.subtitle?`<div class="text-muted">${esc(s.subtitle)}</div>`:''}
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <a href="${publicUrl}" target="_blank" class="btn btn-primary btn-xs">🔗 Open Sign-Up Page</a>
          <button class="btn btn-outline btn-xs" onclick="copySuLink('${esc(publicUrl)}')">📋 Copy Link</button>
          <button class="btn btn-outline btn-xs" onclick="loadSuSlots('${s.id}')">👁 View Slots</button>
          <button class="btn btn-outline btn-xs" onclick="seedSuCalendar('${s.id}')">📅 Sync Calendar</button>
          <button class="btn btn-outline btn-xs" onclick="importSuPresentations('${s.id}')">⬇ Import to Presentations</button>
          <button class="btn btn-danger btn-xs" onclick="deleteSuSheet('${s.id}')">Delete</button>
        </div>
      </div>
    </div>
    <div id="su-slots-${s.id}" style="display:none;margin-top:14px"></div>
  </div>`;
}

window.copySuLink = function(url) {
  navigator.clipboard.writeText(url).then(()=>showToast('Link copied to clipboard','success')).catch(()=>{});
};

window.seedSuCalendar = async function(sheetId) {
  const url = (STORE.settings.signups||{}).appsScriptUrl;
  if (!url) { showToast('Apps Script URL not configured.','error'); return; }
  // Find which calendar this sheet uses
  const sheetsData = _suSheets.find(s=>s.id===sheetId);
  const calendarId = sheetsData ? (sheetsData.calendarId||'primary') : 'primary';
  showToast('Syncing calendar events…','info');
  try {
    if (isCalPrimary(calendarId)) {
      // Route through dashboard Google Calendar API
      const result = await seedCalendarViaDashboard(sheetId, calendarId);
      if (result.errors && result.errors.length) {
        showToast('Created ' + result.created.length + ' event(s). Errors: ' + result.errors.join('; '),'info');
      } else {
        showToast('✅ ' + result.created.length + ' calendar event(s) created on primary calendar.','success');
      }
    } else {
      // Route through Apps Script (ufcomposers calendars)
      const result = await asGet(url, 'seedCalendar', { sheetId });
      if (result.skipped) { showToast('Calendar sync is not enabled for this sheet.','info'); return; }
      if (result.errors && result.errors.length) {
        showToast('Created ' + result.created.length + ' event(s). Errors: ' + result.errors.join('; '),'info');
      } else {
        showToast('✅ ' + (result.created||[]).length + ' calendar event(s) created or updated.','success');
      }
    }
  } catch(e) { showToast('Calendar sync failed: '+e.message,'error'); }
};

window.loadSuSlots = async function(sheetId) {
  const el = document.getElementById('su-slots-'+sheetId);
  if(el.style.display!=='none'){ el.style.display='none'; return; }
  el.style.display='block';
  el.innerHTML = '<div class="text-muted">Loading…</div>';
  const url = (STORE.settings.signups||{}).appsScriptUrl;
  try {
    const resp = await fetch(url+'?action=getSheet&sheetId='+encodeURIComponent(sheetId));
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const data = await resp.json();
    if(data.error) throw new Error(data.error);
    const slots = data.slots||[];
    if(!slots.length){ el.innerHTML='<div class="text-muted">No slots.</div>'; return; }
    // Group by blockId then date
    const groups = {};
    const groupOrder = [];
    slots.forEach(s => {
      const key = s.blockId+'__'+s.date;
      if(!groups[key]){ groups[key]={heading:s.blockHeading,date:s.date,slots:[]}; groupOrder.push(key); }
      groups[key].slots.push(s);
    });
    const settings = STORE.settings.signups||{};
    let html = '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Date</th><th>Time</th><th>Student</th><th>Role</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>';
    let lastHeading = null;
    groupOrder.forEach(key => {
      const g = groups[key];
      if(g.heading && g.heading !== lastHeading) {
        html += `<tr><td colspan="7" style="background:var(--gold-pale);font-weight:700;font-size:12px;letter-spacing:.5px">${esc(g.heading)}</td></tr>`;
        lastHeading = g.heading;
      }
      g.slots.forEach(s => {
        const taken = s.studentName && !s.cancelled;
        const status = s.cancelled ? '<span class="pill pill-red">Cancelled</span>' : taken ? '<span class="pill pill-green">Signed Up</span>' : '<span class="pill pill-gray">Open</span>';
        html += `<tr>
          <td>${fmtDateShort(s.date)}</td>
          <td>${s.startTime}${s.endTime?' – '+s.endTime:''}</td>
          <td>${taken?esc(s.studentName):''}</td>
          <td style="font-size:12px">${taken&&s.role?esc(s.role):''}</td>
          <td style="font-size:11px">${taken?esc(s.studentEmail):''}</td>
          <td>${status}</td>
          <td>${taken&&!s.cancelled?`<button class="btn btn-danger btn-xs" onclick="cancelSuSlot('${sheetId}','${s.id}')">Cancel</button>`:''}</td>
        </tr>`;
      });
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="text-muted" style="color:var(--red)">Error: ${e.message}</div>`;
  }
};

window.cancelSuSlot = async function(sheetId, slotId) {
  if(!confirm('Cancel this student\'s sign-up? They will be notified by email.')) return;
  const settings = STORE.settings.signups||{};
  const url = settings.appsScriptUrl;
  const adminKey = settings.adminKey||'changeme';
  try {
    await asGet(url, 'cancel', {sheetId, slotId, adminKey});
    showToast('Slot cancelled. Student notified.','success');
    loadSuSlots(sheetId);
  } catch(e) { showToast('Error: '+e.message,'error'); }
};

window.deleteSuSheet = async function(sheetId) {
  if(!confirm('Delete this sign-up sheet? This cannot be undone.')) return;
  const url = (STORE.settings.signups||{}).appsScriptUrl;
  try {
    // First get sheet data to find any primary calendar events to delete
    try {
      const resp = await fetch(url + '?action=getSheet&sheetId=' + encodeURIComponent(sheetId));
      if (resp.ok) {
        const data = await resp.json();
        const primaryIds = data.primaryGcalIds || {};
        for (const [date, gcalId] of Object.entries(primaryIds)) {
          if (gcalId) await calDeleteOnTarget(CONFIG.CALENDAR_ID, gcalId, _accessToken).catch(()=>{});
        }
      }
    } catch(e) {} // Don't block deletion if calendar cleanup fails
    // Delete the sheet from Apps Script (also handles ufcomposers calendar events)
    await asGet(url, 'deleteSheet', {sheetId});
    showToast('Sheet deleted.','success');
    renderSuSheetsList();
  } catch(e) { showToast('Error: '+e.message,'error'); }
};

// ── Import presentations ──
window.importSuPresentations = async function(sheetId) {
  const url = (STORE.settings.signups||{}).appsScriptUrl;
  try {
    const resp = await fetch(url+'?action=getSheet&sheetId='+encodeURIComponent(sheetId));
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const data = await resp.json();
    if(data.error) throw new Error(data.error);
    const slots = (data.slots||[]).filter(s=>s.studentName&&!s.cancelled);
    let added=0, fuzzy=0, unmatched=[];
    slots.forEach(s => {
      // Check not already logged
      const alreadyLogged = STORE.presentations.some(p=>
        p.date===s.date && p.student.toLowerCase()===s.studentName.toLowerCase()
      );
      if(alreadyLogged) return;
      // Fuzzy match to roster
      const match = fuzzyMatchStudent(s.studentName);
      const semLabel = dateToSemester(s.date);
      if(match) {
        STORE.presentations.push({id:uid(),student:match.student.name,date:s.date,semester:semLabel,
          notes:'Imported from sign-up sheet'+(match.exact?'':' (name matched: '+s.studentName+')')
                +(s.role?' · '+s.role:'')});
        added++;
        if(!match.exact) fuzzy++;
      } else {
        unmatched.push(s.studentName);
        STORE.presentations.push({id:uid(),student:s.studentName,date:s.date,semester:semLabel,
          notes:'Imported — not matched to roster'+(s.role?' · '+s.role:'')});
        added++;
      }
    });
    save();
    let msg = `Imported ${added} presentation${added!==1?'s':''}.`;
    if(fuzzy>0) msg += ` ${fuzzy} used fuzzy name matching.`;
    if(unmatched.length) msg += ` Not matched to roster: ${unmatched.join(', ')}.`;
    showToast(msg, unmatched.length?'info':'success');
    if(added>0) renderPage('presentations');
  } catch(e) { showToast('Import error: '+e.message,'error'); }
};

function dateToSemester(dateStr) {
  const d = new Date(dateStr+'T00:00:00');
  const m = d.getMonth()+1, y = d.getFullYear();
  if(m>=8) return 'Fall '+y;
  if(m>=5) return 'Summer '+y;
  return 'Spring '+y;
}

// ── Builder ──
function renderSuBuilder() {
  renderSuBlocksList();
  renderSuPreview();
}

function renderSuBlocksList() {
  const el = document.getElementById('su-blocks-list');
  if(!_suBlocks.length) {
    el.innerHTML='<div class="text-muted" style="padding:12px 0">No blocks yet. Click "+ Add Block" to define your first time block.</div>';
    return;
  }
  el.innerHTML=_suBlocks.map((b,i)=>{
    const dates = getBlockDates(b);
    const totalSlots = dates.length * b.slotCount;
    const recurLabel = b.recur==='none'||!b.recur ? 'One-time' : b.recur==='weekly'?`Weekly × ${dates.length}`:` Every 2 wks × ${dates.length}`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--gray-100);border-radius:7px;margin-bottom:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        ${b.heading?`<div style="font-weight:700;font-size:13px">${esc(b.heading)}</div>`:''}
        <div style="font-size:13px">${fmtDateShort(b.date)} · ${b.startTime} · ${b.duration} min × ${b.slotCount} slot${b.slotCount!==1?'s':''}${b.gap>0?' ('+b.gap+' min gap)':''}</div>
        <div class="text-muted" style="font-size:11px">${recurLabel} · ${totalSlots} total slot${totalSlots!==1?'s':''}</div>
      </div>
      <button class="btn btn-outline btn-xs" onclick="editSuBlock('${b.id}')">✎ Edit</button>
      <button class="btn btn-danger btn-xs" onclick="delSuBlock('${b.id}')">✕</button>
    </div>`;
  }).join('');
}

function renderSuPreview() {
  const card = document.getElementById('su-preview-card');
  const el = document.getElementById('su-preview');
  if(!_suBlocks.length){ card.style.display='none'; return; }
  card.style.display='block';
  // Generate all slots
  const allSlots = [];
  _suBlocks.forEach(b => allSlots.push(...generateSlotsFromBlock(b)));
  document.getElementById('su-slot-count').textContent = allSlots.length+' slot'+(allSlots.length!==1?'s':'');
  // Group by blockId > date
  const blockOrder=[], blockMap={};
  allSlots.forEach(s=>{
    if(!blockMap[s.blockId]){blockMap[s.blockId]={heading:s.blockHeading,dates:{}};blockOrder.push(s.blockId);}
    if(!blockMap[s.blockId].dates[s.date]) blockMap[s.blockId].dates[s.date]=[];
    blockMap[s.blockId].dates[s.date].push(s);
  });
  let html='';
  blockOrder.forEach((blockId,bIdx)=>{
    const block=blockMap[blockId];
    const dates=Object.keys(block.dates).sort();
    if(block.heading) html+=`<div style="font-family:'Playfair Display',serif;font-size:14px;font-weight:600;padding:8px 0 4px;border-bottom:2px solid var(--gold);margin-bottom:8px">${esc(block.heading)}</div>`;
    dates.forEach((date,dIdx)=>{
      html+=`<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);padding:6px 0 3px">${fmtDateShort(date)}</div>`;
      block.dates[date].forEach(s=>{
        html+=`<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;border:1px solid var(--gray-200);border-radius:5px;margin-bottom:5px;background:var(--white)">
          <span style="font-size:13px;font-weight:600;min-width:130px">${s.startTime} – ${s.endTime}</span>
          <span style="font-size:12px;color:var(--gray-400);font-style:italic">Open</span>
        </div>`;
      });
    });
  });
  el.innerHTML=html;
}

// ── Block modal ──
window.openSuBlockModal = function(editId) {
  _suEditBlockId = editId||null;
  const b = editId ? _suBlocks.find(b=>b.id===editId) : null;
  document.getElementById('modal-block-title').textContent = b ? 'Edit Block' : 'Add Time Block';
  document.getElementById('su-block-heading').value = b?b.heading||'':'';
  document.getElementById('su-block-date').value = b?b.date:'';
  document.getElementById('su-block-start').value = b?b.startTime:'';
  document.getElementById('su-block-duration').value = b?b.duration:25;
  document.getElementById('su-block-count').value = b?b.slotCount:2;
  document.getElementById('su-block-gap').value = b?b.gap||0:0;
  document.getElementById('su-block-recur').value = b?b.recur||'none':'none';
  document.getElementById('su-block-until').value = b?b.until||'':'';
  document.getElementById('su-block-dow').value = b&&b.dow!=null?b.dow:'5';
  updateRecurFields();
  openModal('modal-su-block');
};
window.editSuBlock = function(id){ openSuBlockModal(id); };
window.delSuBlock = function(id){ _suBlocks=_suBlocks.filter(b=>b.id!==id); renderSuBuilder(); };

function updateRecurFields(){
  const val=document.getElementById('su-block-recur').value;
  document.getElementById('su-recur-until-group').style.display=val!=='none'?'flex':'none';
  document.getElementById('su-recur-days-group').style.display=val!=='none'?'flex':'none';
}

// ── Publish sheet ──
window.publishSuSheet = async function() {
  const title = document.getElementById('su-title').value.trim();
  if(!title){ showToast('Please enter a sheet title.','error'); return; }
  if(!_suBlocks.length){ showToast('Please add at least one time block.','error'); return; }
  const settings = STORE.settings.signups||{};
  if(!settings.appsScriptUrl){ showToast('Configure Apps Script URL in the Settings tab first.','error'); suSwitchTab('su-settings'); return; }
  const allSlots=[];
  _suBlocks.forEach(b=>allSlots.push(...generateSlotsFromBlock(b)));
  if(!allSlots.length){ showToast('No slots generated.','error'); return; }
  const sheetId = uid();
  const syncCalendar = document.getElementById('su-sync-cal').checked;
  const calSel = document.getElementById('su-cal-id');
  const calendarId = (calSel && calSel.value) ? calSel.value : 'primary';
  // Get nickname for the toast message
  const cals = (STORE.settings.signups||{}).namedCals||[];
  const calNick = (cals.find(c=>c.id===calendarId)||{}).nick || calendarId;
  const payloadData = {
    sheetId, title,
    subtitle: document.getElementById('su-subtitle').value.trim(),
    slots: allSlots,
    syncCalendar,
    calendarId
  };
  document.getElementById('btn-su-publish').textContent='Publishing…';
  document.getElementById('btn-su-publish').disabled=true;
  try {
    let result;
    try {
      result = await asGet(settings.appsScriptUrl, 'createSheet', payloadData);
    } catch(fetchErr) {
      // Apps Script sometimes returns a non-JSON redirect or timeout even on success.
      // Verify by trying to load the sheet we just attempted to create.
      await new Promise(r => setTimeout(r, 2000));
      try {
        const verifyResp = await fetch(settings.appsScriptUrl + '?action=getSheet&sheetId=' + encodeURIComponent(sheetId));
        const verifyData = await verifyResp.json();
        if (verifyData && !verifyData.error) {
          result = { ok: true };
        } else {
          throw fetchErr;
        }
      } catch(e2) {
        throw fetchErr;
      }
    }
    showToast('Sheet published! ' + (syncCalendar ? `Creating events on "${calNick}"…` : 'Switching to Sheets tab.'), 'success');

    // If calendar sync requested, make a second separate call to seed events
    // (split to avoid Apps Script 30-second timeout)
    if (syncCalendar) {
      try {
        let calResult;
        if (isCalPrimary(calendarId)) {
          // Primary account calendar — use dashboard Google Calendar API
          calResult = await seedCalendarViaDashboard(sheetId, calendarId);
        } else {
          // Apps Script calendar (ufcomposers)
          calResult = await asGet(settings.appsScriptUrl, 'seedCalendar', { sheetId });
        }
        if (calResult.errors && calResult.errors.length) {
          showToast('Calendar: ' + calResult.created.length + ' events created. Errors: ' + calResult.errors.join('; '), 'info');
        } else {
          const n = (calResult.created||[]).length;
          showToast('✅ ' + n + ' calendar event' + (n !== 1 ? 's' : '') + ' created on "' + calNick + '".', 'success');
        }
      } catch(calErr) {
        showToast('Sheet published but calendar sync failed: ' + calErr.message + '. Try re-seeding from the Sheets tab.', 'info');
      }
    }

    _suBlocks=[];
    document.getElementById('su-title').value='';
    document.getElementById('su-subtitle').value='';
    document.getElementById('su-sync-cal').checked=false;
    document.getElementById('su-cal-id-row').style.display='none';
    renderSuBuilder();
    suSwitchTab('su-sheets');
    renderSuSheetsList();
  } catch(e) { showToast('Publish failed: '+e.message,'error'); }
  document.getElementById('btn-su-publish').textContent='🚀 Publish Sheet';
  document.getElementById('btn-su-publish').disabled=false;
};

// ── Tab helper ──
window.suSwitchTab = function(tabId) {
  document.querySelectorAll('#page-signups .tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#page-signups .tab-panel').forEach(p=>p.classList.remove('active'));
  const btn=document.querySelector(`#page-signups [data-tab="${tabId}"]`);
  if(btn) btn.classList.add('active');
  const panel=document.getElementById('tab-'+tabId);
  if(panel) panel.classList.add('active');
};

function fmtDateShort(d){
  if(!d) return '';
  const dt=new Date(d+'T00:00:00');
  return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Setup event handlers (called from app.js initApp) ──
function setupSignupHandlers() {
  document.getElementById('btn-add-block').addEventListener('click',()=>openSuBlockModal(null));
  document.getElementById('btn-su-refresh').addEventListener('click',()=>renderSuSheetsList());
  // Calendar sync checkbox — show/hide calendar dropdown
  document.getElementById('su-sync-cal').addEventListener('change', function() {
    document.getElementById('su-cal-id-row').style.display = this.checked ? 'block' : 'none';
    if (this.checked) populateCalDropdown();
  });
  document.getElementById('btn-su-clear-builder').addEventListener('click',()=>{
    if(_suBlocks.length&&!confirm('Clear all blocks?')) return;
    _suBlocks=[]; document.getElementById('su-title').value=''; document.getElementById('su-subtitle').value='';
    renderSuBuilder();
  });
  document.getElementById('btn-su-publish').addEventListener('click',publishSuSheet);
  document.getElementById('su-block-recur').addEventListener('change',updateRecurFields);
  document.getElementById('btn-save-block').addEventListener('click',()=>{
    const date=document.getElementById('su-block-date').value;
    const startTime=document.getElementById('su-block-start').value.trim();
    const duration=parseInt(document.getElementById('su-block-duration').value)||25;
    const slotCount=parseInt(document.getElementById('su-block-count').value)||1;
    if(!date||!startTime){ showToast('Date and start time required.','error'); return; }
    const block={
      id: _suEditBlockId||uid(),
      heading: document.getElementById('su-block-heading').value.trim(),
      date, startTime, duration, slotCount,
      gap: parseInt(document.getElementById('su-block-gap').value)||0,
      recur: document.getElementById('su-block-recur').value,
      until: document.getElementById('su-block-until').value,
      dow: parseInt(document.getElementById('su-block-dow').value),
    };
    if(_suEditBlockId) { const idx=_suBlocks.findIndex(b=>b.id===_suEditBlockId); if(idx>=0) _suBlocks[idx]=block; }
    else _suBlocks.push(block);
    closeModal('modal-su-block');
    renderSuBuilder();
  });
  document.getElementById('btn-su-save-settings').addEventListener('click',()=>{
    if(!STORE.settings.signups) STORE.settings.signups={};
    const s=STORE.settings.signups;
    s.appsScriptUrl=document.getElementById('su-apps-script-url').value.trim();
    s.adminKey=document.getElementById('su-admin-key').value.trim();
    s.publicUrl=document.getElementById('su-public-url').value.trim();
    s.remindDays1=parseInt(document.getElementById('su-remind-days-1').value)||7;
    s.remindDays2=parseInt(document.getElementById('su-remind-days-2').value)||1;
    save(); showToast('Sign-up settings saved.','success');
  });

  document.getElementById('btn-add-named-cal').addEventListener('click',()=>{
    const nick = document.getElementById('su-cal-nick').value.trim();
    const id   = document.getElementById('su-cal-id-input').value.trim();
    if (!nick || !id) { showToast('Please enter both a nickname and a Calendar ID.','error'); return; }
    if (!STORE.settings.signups) STORE.settings.signups = {};
    if (!STORE.settings.signups.namedCals) STORE.settings.signups.namedCals = [];
    // Prevent duplicates by ID
    if (STORE.settings.signups.namedCals.find(c => c.id === id)) {
      showToast('That Calendar ID is already saved.','error'); return;
    }
    const account = document.getElementById('su-cal-account').value || 'appsscript';
    STORE.settings.signups.namedCals.push({ nick, id, account });
    document.getElementById('su-cal-nick').value = '';
    document.getElementById('su-cal-id-input').value = '';
    save();
    renderNamedCalsList();
    populateCalDropdown();
    showToast('Calendar "' + nick + '" saved.','success');
  });
}
