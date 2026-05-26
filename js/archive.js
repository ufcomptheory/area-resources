// ═══════════════════════════════════════════════════════
// CALENDAR ARCHIVE MODULE
// ═══════════════════════════════════════════════════════

let _archiveSemesters = [];
let _archiveCurrentSem = '';

window.renderArchive = async function() {
  loadArchiveSettings();
  await refreshArchiveSemesters();
};

function loadArchiveSettings() {
  const calSel = document.getElementById('archive-cal-sel');
  if (!calSel) return;
  const cals = (STORE.settings.signups || {}).namedCals || [];
  const cur = (STORE.settings.archive || {}).calendarId || '';
  calSel.innerHTML = cals.length
    ? cals.map(c => `<option value="${c.id}"${c.id===cur?' selected':''}>${c.nick}</option>`).join('')
    : '<option value="">— Add calendars in Sign-Up Sheets → Settings —</option>';
  if (cur) calSel.value = cur;
}

async function refreshArchiveSemesters() {
  const url = (STORE.settings.signups || {}).appsScriptUrl;
  if (!url) return;
  try {
    const resp = await fetch(url + '?action=getArchivedEvents');
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    _archiveSemesters = (data.semesters || []).sort((a,b) => semKey(b).localeCompare(semKey(a)));
    const sel = document.getElementById('archive-sem-sel');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Select semester —</option>' +
        _archiveSemesters.map(s => `<option value="${s}"${s===cur?' selected':''}>${s}</option>`).join('');
      if (cur) sel.value = cur;
    }
  } catch(e) {
    // Silently fail — no archive yet
  }
}

async function loadArchiveEvents(semester) {
  _archiveCurrentSem = semester;
  const url = (STORE.settings.signups || {}).appsScriptUrl;
  const el = document.getElementById('archive-event-list');
  const exportBtn = document.getElementById('btn-archive-export');
  if (!url || !semester) {
    el.innerHTML = '<div class="text-muted">Select a semester and click Load.</div>';
    if (exportBtn) exportBtn.disabled = true;
    return;
  }
  el.innerHTML = '<div class="text-muted">Loading…</div>';
  try {
    const resp = await fetch(url + '?action=getArchivedEvents&semester=' + encodeURIComponent(semester));
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    const events = data.events || [];
    if (!events.length) {
      el.innerHTML = `<div class="text-muted">No events archived for ${semester}.</div>`;
      if (exportBtn) exportBtn.disabled = true;
      return;
    }
    if (exportBtn) exportBtn.disabled = false;
    el.innerHTML = `
      <div style="font-size:13px;color:var(--gray-400);margin-bottom:12px">${events.length} event${events.length!==1?'s':''} archived for ${semester}</div>
      ${events.map(ev => archiveEventCard(ev)).join('')}`;
  } catch(e) {
    el.innerHTML = `<div class="text-muted" style="color:var(--red)">Error: ${e.message}</div>`;
    if (exportBtn) exportBtn.disabled = true;
  }
}

function archiveEventCard(ev) {
  const timeStr = ev.startTime ? ev.startTime + (ev.endTime ? ' – ' + ev.endTime : '') : '';
  const sourceColor = ev.source === 'Sign-Up Sheet' ? 'pill-gold'
    : ev.source === 'Submission' ? 'pill-blue' : 'pill-gray';
  return `<div class="card mb-8" style="padding:14px 18px">
    <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:700;margin-bottom:3px">${escA(ev.name)}</div>
        <div style="font-size:13px;color:var(--gray-600)">${fmtDateA(ev.date)}${timeStr?' · '+timeStr:''}${ev.location?' · '+escA(ev.location):''}</div>
        ${ev.description?`<div style="font-size:12px;color:var(--gray-600);margin-top:5px;line-height:1.5">${escA(ev.description).replace(/\n/g,'<br>')}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
        <span class="pill ${sourceColor}" style="font-size:10px">${escA(ev.source)}</span>
        ${ev.category?`<span class="pill pill-gray" style="font-size:10px">${escA(ev.category)}</span>`:''}
      </div>
    </div>
  </div>`;
}

async function exportArchive(semester) {
  const url = (STORE.settings.signups || {}).appsScriptUrl;
  if (!url || !semester) return;
  showToast('Generating export…', 'info');
  try {
    const fullUrl = url + '?action=getArchiveExportHtml&payload=' +
      encodeURIComponent(JSON.stringify({semester}));
    const resp = await fetch(fullUrl);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    // Open printable HTML in new tab
    const blob = new Blob([data.html], {type:'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = semester.replace(' ','_') + '_Events.html';
    a.click();
    showToast('Export downloaded.', 'success');
  } catch(e) { showToast('Export failed: '+e.message, 'error'); }
}

function fmtDateA(d) {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  const dt = new Date(Date.UTC(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3])));
  return dt.toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
}
function escA(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Setup handlers ──
function setupArchiveHandlers() {
  const btnLoad = document.getElementById('btn-archive-load');
  if (btnLoad) btnLoad.addEventListener('click', () => {
    const sem = document.getElementById('archive-sem-sel').value;
    if (sem) loadArchiveEvents(sem);
  });

  const btnExport = document.getElementById('btn-archive-export');
  if (btnExport) btnExport.addEventListener('click', () => {
    if (_archiveCurrentSem) exportArchive(_archiveCurrentSem);
  });

  const btnRefreshSems = document.getElementById('btn-archive-refresh-sems');
  if (btnRefreshSems) btnRefreshSems.addEventListener('click', refreshArchiveSemesters);

  const btnSaveCal = document.getElementById('btn-archive-save-cal');
  if (btnSaveCal) btnSaveCal.addEventListener('click', () => {
    if (!STORE.settings.archive) STORE.settings.archive = {};
    STORE.settings.archive.calendarId = document.getElementById('archive-cal-sel').value;
    save(); showToast('Archive calendar saved.', 'success');
  });

  const btnManual = document.getElementById('btn-archive-manual');
  if (btnManual) btnManual.addEventListener('click', async () => {
    const label = document.getElementById('archive-manual-label').value.trim();
    const start = document.getElementById('archive-manual-start').value;
    const end   = document.getElementById('archive-manual-end').value;
    const calendarId = (STORE.settings.archive || {}).calendarId || 'primary';
    const url = (STORE.settings.signups || {}).appsScriptUrl;
    if (!label || !start || !end) { showToast('Label, start date, and end date required.','error'); return; }
    if (!url) { showToast('Configure Apps Script URL in Sign-Up Sheets → Settings.','error'); return; }
    const statusEl = document.getElementById('archive-manual-status');
    statusEl.textContent = 'Archiving…';
    btnManual.disabled = true;
    try {
      const result = await asGet(url, 'archiveCustomPeriod', {calendarId, startDate:start, endDate:end, semesterLabel:label});
      statusEl.textContent = `✅ Archived ${result.count} event${result.count!==1?'s':''} for "${label}".`;
      await refreshArchiveSemesters();
      showToast(`Archived ${result.count} events for ${label}.`, 'success');
    } catch(e) {
      statusEl.textContent = 'Error: ' + e.message;
      showToast('Archive failed: '+e.message, 'error');
    }
    btnManual.disabled = false;
  });

  // Double-click semester selector to auto-load
  const semSel = document.getElementById('archive-sem-sel');
  if (semSel) semSel.addEventListener('change', () => {
    const sem = semSel.value;
    if (sem) loadArchiveEvents(sem);
  });
}
