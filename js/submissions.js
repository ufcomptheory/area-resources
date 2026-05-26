// ═══════════════════════════════════════════════════════
// EVENT SUBMISSIONS MODULE
// ═══════════════════════════════════════════════════════

let _subCache = { pending:[], approved:[], rejected:[] };
let _subEditId = null;

// ── Render submissions page ──
window.renderSubmissions = async function() {
  loadSubSettings();
  await refreshSubmissions();
};

function loadSubSettings() {
  const s = STORE.settings.submissions || {};
  const el = id => document.getElementById(id);
  if (el('sub-public-url'))   el('sub-public-url').value   = s.publicUrl   || '';
  if (el('sub-notify-email')) el('sub-notify-email').value = s.notifyEmail || '';
  if (el('sub-passphrase'))   el('sub-passphrase').value   = s.passphrase  || '';
  // Populate calendar dropdown from named cals
  const calSel = el('sub-cal-id');
  if (calSel) {
    const cals = (STORE.settings.signups || {}).namedCals || [];
    const cur = s.calendarId || '';
    calSel.innerHTML = cals.length
      ? cals.map(c => `<option value="${c.id}"${c.id===cur?' selected':''}>${c.nick}</option>`).join('')
      : '<option value="">— Add calendars in Sign-Up Sheets → Settings —</option>';
    if (cur) calSel.value = cur;
  }
  // Update public link
  const link = el('sub-public-link');
  if (link && s.publicUrl) {
    const asUrl = (STORE.settings.signups || {}).appsScriptUrl || '';
    link.href = s.publicUrl + (asUrl ? '?as=' + encodeURIComponent(asUrl) : '');
  }
}

async function refreshSubmissions() {
  const url = (STORE.settings.signups || {}).appsScriptUrl;
  if (!url) {
    document.getElementById('sub-pending-list').innerHTML =
      '<div class="text-muted">Configure the Apps Script URL in Sign-Up Sheets → Settings first.</div>';
    return;
  }
  try {
    const data = await fetch(url + '?action=getSubmissions').then(r => r.json());
    const all = data.submissions || [];
    _subCache.pending  = all.filter(s => s.status === 'pending');
    _subCache.approved = all.filter(s => s.status === 'approved');
    _subCache.rejected = all.filter(s => s.status === 'rejected');
    renderSubList('pending');
    renderSubList('approved');
    renderSubList('rejected');
    document.getElementById('sub-pending-count').textContent = _subCache.pending.length;
  } catch(e) {
    document.getElementById('sub-pending-list').innerHTML =
      `<div class="text-muted" style="color:var(--red)">Could not load submissions: ${e.message}</div>`;
  }
}

function renderSubList(status) {
  const el = document.getElementById('sub-' + status + '-list');
  if (!el) return;
  const list = _subCache[status] || [];
  if (!list.length) {
    el.innerHTML = `<div class="text-muted mt-8">No ${status} submissions.</div>`;
    return;
  }
  el.innerHTML = list.map(s => subCard(s)).join('');
}

function subCard(s) {
  const dateStr = s.date ? fmtDateShort(s.date) : '—';
  const timeStr = s.startTime ? s.startTime + (s.endTime ? ' – ' + s.endTime : '') : '';
  const statusPill = s.status === 'approved'
    ? '<span class="pill pill-green">Approved</span>'
    : s.status === 'rejected'
    ? '<span class="pill pill-red">Rejected</span>'
    : '<span class="pill pill-gold">Pending</span>';
  return `<div class="card mb-8">
    <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:700;margin-bottom:4px">${esc(s.name)}</div>
        <div style="font-size:13px;color:var(--gray-600)">${dateStr}${timeStr ? ' · ' + timeStr : ''}${s.location ? ' · ' + esc(s.location) : ''}</div>
        ${s.category ? `<div class="mt-4"><span class="pill pill-gray">${esc(s.category)}</span></div>` : ''}
        ${s.description ? `<div style="font-size:12px;color:var(--gray-600);margin-top:6px;line-height:1.5">${esc(s.description).replace(/\n/g,'<br>')}</div>` : ''}
        <div style="margin-top:8px;font-size:12px;color:var(--gray-400)">
          Submitted by <strong>${esc(s.submittedBy)}</strong>${s.submitterRole ? ' · ' + esc(s.submitterRole) : ''}
          ${s.submitterEmail ? ' · <a href="mailto:'+esc(s.submitterEmail)+'" style="color:var(--blue)">'+esc(s.submitterEmail)+'</a>' : ''}
        </div>
        ${s.reviewNotes ? `<div style="font-size:12px;background:var(--gold-pale);padding:6px 10px;border-radius:4px;margin-top:6px"><strong>Notes:</strong> ${esc(s.reviewNotes)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
        ${statusPill}
        ${s.status === 'pending' ? `
          <button class="btn btn-outline btn-xs" onclick="openSubEdit('${s.id}')">✎ Edit</button>
          <button class="btn btn-gold btn-xs" onclick="quickApprove('${s.id}')">✓ Approve</button>
          <button class="btn btn-danger btn-xs" onclick="quickReject('${s.id}')">✕ Reject</button>
        ` : s.status === 'approved' ? `
          <span style="font-size:11px;color:var(--green)">Added to calendar</span>
        ` : ''}
      </div>
    </div>
  </div>`;
}

function fmtDateShort(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  const dt = new Date(Date.UTC(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3])));
  return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}

// ── Edit modal ──
window.openSubEdit = function(id) {
  const s = [..._subCache.pending, ..._subCache.approved, ..._subCache.rejected].find(s=>s.id===id);
  if (!s) return;
  _subEditId = id;
  document.getElementById('sub-edit-id').value = id;
  document.getElementById('sub-edit-name').value        = s.name || '';
  document.getElementById('sub-edit-date').value        = s.date || '';
  document.getElementById('sub-edit-date-end').value    = s.dateEnd || '';
  // Convert "2:00 PM" style back to HH:MM for <input type="time">
  document.getElementById('sub-edit-start-time').value  = toHHMM(s.startTime);
  document.getElementById('sub-edit-end-time').value    = toHHMM(s.endTime);
  document.getElementById('sub-edit-location').value    = s.location || '';
  document.getElementById('sub-edit-category').value    = s.category || '';
  document.getElementById('sub-edit-description').value = s.description || '';
  document.getElementById('sub-edit-notes').value       = s.reviewNotes || '';
  openModal('modal-submission');
};

function toHHMM(timeStr) {
  if (!timeStr) return '';
  // Already HH:MM
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return '';
  let h = parseInt(m[1]), mn = parseInt(m[2]);
  const ap = (m[3]||'').toUpperCase();
  if (ap==='PM'&&h<12) h+=12;
  if (ap==='AM'&&h===12) h=0;
  return String(h).padStart(2,'0')+':'+String(mn).padStart(2,'0');
}

// ── Quick approve/reject (no modal) ──
window.quickApprove = async function(id) {
  const calendarId = (STORE.settings.submissions||{}).calendarId || 'primary';
  await doSubAction('approveSubmission', {id, calendarId});
};
window.quickReject = async function(id) {
  await doSubAction('rejectSubmission', {id, reviewNotes:''});
};

async function doSubAction(action, payload) {
  const url = (STORE.settings.signups||{}).appsScriptUrl;
  if (!url) { showToast('Apps Script URL not configured.','error'); return; }
  try {
    await asGet(url, action, payload);
    await refreshSubmissions();
    showToast(action === 'approveSubmission' ? '✅ Approved and added to calendar.' : 'Submission rejected.','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Setup handlers ──
function setupSubmissionHandlers() {
  document.getElementById('btn-sub-refresh')?.addEventListener('click', refreshSubmissions);

  document.getElementById('btn-sub-save-settings')?.addEventListener('click', () => {
    if (!STORE.settings.submissions) STORE.settings.submissions = {};
    const s = STORE.settings.submissions;
    s.publicUrl   = document.getElementById('sub-public-url').value.trim();
    s.notifyEmail = document.getElementById('sub-notify-email').value.trim();
    s.passphrase  = document.getElementById('sub-passphrase').value.trim();
    s.calendarId  = document.getElementById('sub-cal-id').value;
    save();
    loadSubSettings();
    showToast('Submission settings saved.','success');
  });

  document.getElementById('btn-sub-save-edit')?.addEventListener('click', async () => {
    const id = document.getElementById('sub-edit-id').value;
    const url = (STORE.settings.signups||{}).appsScriptUrl;
    if (!url || !id) return;
    const fields = {
      name:        document.getElementById('sub-edit-name').value.trim(),
      date:        document.getElementById('sub-edit-date').value,
      dateEnd:     document.getElementById('sub-edit-date-end').value,
      startTime:   document.getElementById('sub-edit-start-time').value,
      endTime:     document.getElementById('sub-edit-end-time').value,
      location:    document.getElementById('sub-edit-location').value.trim(),
      category:    document.getElementById('sub-edit-category').value,
      description: document.getElementById('sub-edit-description').value.trim(),
      reviewNotes: document.getElementById('sub-edit-notes').value.trim(),
    };
    try {
      await asGet(url, 'updateSubmission', {id, fields});
      closeModal('modal-submission');
      await refreshSubmissions();
      showToast('Submission updated.','success');
    } catch(e) { showToast('Error: '+e.message,'error'); }
  });

  document.getElementById('btn-sub-approve')?.addEventListener('click', async () => {
    const id = document.getElementById('sub-edit-id').value;
    const calendarId = (STORE.settings.submissions||{}).calendarId || 'primary';
    // Save edits first, then approve
    document.getElementById('btn-sub-save-edit').click();
    await new Promise(r => setTimeout(r, 800));
    await doSubAction('approveSubmission', {id, calendarId});
    closeModal('modal-submission');
  });

  document.getElementById('btn-sub-reject')?.addEventListener('click', async () => {
    const id = document.getElementById('sub-edit-id').value;
    const notes = document.getElementById('sub-edit-notes').value.trim();
    await doSubAction('rejectSubmission', {id, reviewNotes: notes});
    closeModal('modal-submission');
  });
}
