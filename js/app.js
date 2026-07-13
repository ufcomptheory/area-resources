// ═══════════════════════════════════════════════════════
// MAIN APP v3
// ═══════════════════════════════════════════════════════

function initApp() {
  setupNav();
  setupModals();
  setupCalendarNav();
  populateSettings();
  setupEventHandlers();
  setupSignupHandlers();
  setupSubmissionHandlers();
  setupArchiveHandlers();
  renderPage('dashboard');
}

// ── Navigation ──
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('page-' + el.dataset.page).classList.add('active');
      renderPage(el.dataset.page);
    });
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabs = btn.closest('.tabs');
      const page = btn.closest('.page') || document.body;
      tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      page.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}
window.navTo = function(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const ni = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (ni) ni.classList.add('active');
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
  renderPage(page);
};

function renderPage(page) {
  const map = {
    dashboard: renderDashboard, tasks: renderTasks,
    meetings: renderMeetings, rotations: renderRotations, gta: renderGTA,
    studio: renderStudio, students: renderStudents, faculty: renderFaculty,
    presentations: renderPresentations, admissions: renderAdmissions, settings: renderSettings, signups: renderSignups, submissions: renderSubmissions, archive: renderArchive
  };
  if (map[page]) map[page]();
}

// ── Modals ──
function setupModals() {
  window.closeModal = id => document.getElementById(id).classList.remove('open');
  window.openModal  = id => document.getElementById(id).classList.add('open');
  // Only close modal when BOTH mousedown and mouseup occur on the overlay itself.
  // This prevents the modal closing when user clicks inside and drags outside.
  document.querySelectorAll('.modal-overlay').forEach(m => {
    let _downOnOverlay = false;
    m.addEventListener('mousedown', e => { _downOnOverlay = (e.target === m); });
    m.addEventListener('mouseup',   e => {
      if (_downOnOverlay && e.target === m) m.classList.remove('open');
      _downOnOverlay = false;
    });
  });
}
function setupCalendarNav() {
  document.getElementById('cal-prev').addEventListener('click', () => { calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth()-1, 1); renderFullCal(); });
  document.getElementById('cal-next').addEventListener('click', () => { calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth()+1, 1); renderFullCal(); });
}
function esc(s) { return String(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function semOpts() {
  const s = [];
  for (let y=2023; y<=2032; y++) s.push('Fall '+y, 'Spring '+(y+1), 'Summer '+(y+1));
  return s;
}

// ── Semester sort key: Spring YYYY → YYYY-1, Summer YYYY → YYYY-2, Fall YYYY → YYYY-3
function semKey(s) {
  const m = String(s).match(/(Spring|Summer|Fall)\s+(\d{4})/i);
  if (!m) return s;
  const order = {spring:'1',summer:'2',fall:'3'};
  return m[2] + '-' + (order[m[1].toLowerCase()]||'9');
}
function sortBySem(arr, field='semester') {
  return [...arr].sort((a,b)=>semKey(a[field]).localeCompare(semKey(b[field])));
}
// Sort by last name (assumes "First Last" or "First Middle Last")
function lastName(name) {
  const parts = String(name||'').trim().split(/\s+/);
  return parts[parts.length-1].toLowerCase();
}

function compFaculty() { return STORE.people.filter(p => p.type==='faculty' && p.active!==false && Array.isArray(p.areas) && p.areas.includes('Composition')); }
function allFaculty() { return STORE.people.filter(p => p.type==='faculty'); }
function students() { return STORE.people.filter(p => p.type==='student' && p.active !== false); }
function allStudents() { return STORE.people.filter(p => p.type==='student'); }

// ── Header ──
function updateHeader() {
  document.getElementById('sem-badge').textContent = STORE.settings.currentSemester;
  document.getElementById('today-badge').textContent = new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
}

// ═══════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════
function renderDashboard() {
  updateHeader();
  const n = today();
  const _h=new Date().getHours();
  const _greet=_h<12?'Good morning':_h<17?'Good afternoon':'Good evening';
  document.getElementById('page-dashboard').querySelector('.page-title').textContent=_greet;
  document.getElementById('dash-date-sub').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const upcoming = STORE.events.filter(e=>e.date>=n).length + STORE.meetings.filter(m=>m.date>=n).length;
  const dueRem = STORE.tasks.filter(t=>!t.done && t.due && t.due<=n).length;
  const activeAg = STORE.agendaItems.filter(a=>!a.done).length;
  const dueTasks=STORE.tasks.filter(t=>!t.done&&t.due&&t.due<=n);
  const dueTasksHtml=dueTasks.length?dueTasks.map(t=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--gray-100)">${t.due?`<span style="color:var(--red);font-size:10px;font-weight:700">${fmtDate(t.due)}</span> `:''}<span>${t.title}</span></div>`).join(''):'<div class="text-muted">None overdue.</div>';
  document.getElementById('stat-row').innerHTML = `
    <div class="stat-box" style="cursor:pointer" onclick="navTo('students')" title="Go to Students">
      <div class="sv">${students().length}</div><div class="sl">Active Students</div>
      <div style="font-size:10px;color:var(--gray-400);margin-top:2px">${allStudents().length-students().length} alumni</div>
    </div>
    <div class="stat-box gold" style="cursor:pointer" onclick="navTo('calendar')" title="Go to Calendar">
      <div class="sv">${upcoming}</div><div class="sl">Upcoming Events</div>
    </div>
    <div class="stat-box red" style="cursor:pointer" onclick="navTo('tasks')" title="View due tasks">
      <div class="sv">${dueTasks.length}</div><div class="sl">Overdue Tasks</div>
      <div style="margin-top:6px">${dueTasksHtml}</div>
    </div>
    <div class="stat-box green" style="cursor:pointer" onclick="navTo('meetings')" title="Go to Meetings">
      <div class="sv">${activeAg}</div><div class="sl">Agenda Items</div>
    </div>`;

  const mtgName=STORE.settings.meetingName||'Comp/Theory Area Meeting';
  const allUpcoming = [
    ...STORE.events.filter(e=>e.date>=n).map(e=>({title:e.title,date:e.date,label:'Event'})),
    ...STORE.meetings.filter(m=>m.date>=n).map(m=>({title:mtgName,date:m.date,label:'Meeting',time:m.time})),
    ...STORE.tasks.filter(t=>!t.done&&t.due&&t.due>=n).map(t=>({title:'🔔 '+t.title,date:t.due,label:'Task'})),
  ].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
  const evEl = document.getElementById('upcoming-events-list');
  evEl.innerHTML = allUpcoming.length ? allUpcoming.map(e=>{
    const dt = new Date(e.date+'T00:00:00');
    return `<div class="event-item">
      <div class="event-date-block"><div class="eday">${dt.getDate()}</div><div class="emon">${dt.toLocaleString('en-US',{month:'short'})}</div></div>
      <div class="event-info"><div class="etitle">${e.title}</div><div class="emeta">${e.time||''} <span class="pill pill-gray" style="font-size:9px">${e.label}</span></div></div></div>`;
  }).join('') : '<div class="text-muted">No upcoming events.</div>';
  document.getElementById('badge-events').textContent = allUpcoming.length;

  const dueList = STORE.tasks.filter(t=>!t.done).sort((a,b)=>(a.due||'').localeCompare(b.due||'')).slice(0,6);
  const remEl = document.getElementById('upcoming-reminders-list');
  remEl.innerHTML = dueList.length ? dueList.map(t=>`
    <div class="reminder-item">
      <div class="reminder-urgency urg-${t.urg||'low'}"></div>
      <div style="flex:1"><div style="font-size:13px;font-weight:500">${t.title}</div><div class="text-muted">${t.due?fmtDate(t.due):''} · ${t.freq}</div></div>
    </div>`).join('') : '<div class="text-muted">All clear.</div>';
  document.getElementById('badge-reminders').textContent = dueList.length;

  const agItems = STORE.agendaItems.filter(a=>!a.done).slice(0,5);
  document.getElementById('badge-agenda').textContent = STORE.agendaItems.filter(a=>!a.done).length;
  document.getElementById('dash-agenda-preview').innerHTML = agItems.length ? agItems.map(a=>`
    <div class="agenda-item-row">
      <div class="ai-text">${a.text}<div class="ai-submitter">${a.submitter?'— '+a.submitter:''}</div></div>
      <span class="pill ${a.priority==='High'?'pill-red':a.priority==='Informational'?'pill-blue':'pill-gray'}">${a.priority}</span>
    </div>`).join('') : '<div class="text-muted">No active agenda items.</div>';
  renderMiniCal();
}

// ═══════════════════════════════════
// CALENDAR
// ═══════════════════════════════════
function renderCalendar() { renderFullCal(); renderEventsTable(); }
// Calendar uses internal data (events + meetings + tasks). 
// Google Calendar sync pushes TO Google; it does not pull FROM Google.

// ═══════════════════════════════════
// TASKS & REMINDERS (unified)
// ═══════════════════════════════════
function renderTasks() {
  const filter = document.getElementById('tasks-filter').value;
  let list = [...STORE.tasks];
  if (filter === 'pending') list = list.filter(t=>!t.done);
  else if (filter === 'done') list = list.filter(t=>t.done);
  else if (['Semester','Annual','Once'].includes(filter)) list = list.filter(t=>t.freq===filter);
  list.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  document.getElementById('tasks-tbody').innerHTML = list.map(t=>`<tr class="${t.done?'completed':''}">
    <td>${t.due?fmtDate(t.due):'—'}</td>
    <td>
      <strong>${t.title}</strong>
      ${t.notes?`<div class="text-muted" style="font-size:11px">${t.notes}</div>`:''}
      ${t.emailTemplate?`
        <div style="margin-top:6px">
          <button class="btn btn-outline btn-xs" onclick="toggleEmailTemplate('${t.id}')">✉ Email Template</button>
          <div id="email-tpl-${t.id}" style="display:none;margin-top:6px">
            <textarea rows="5" style="width:100%;font-size:12px;font-family:'Source Code Pro',monospace"
              onchange="updateTaskEmailTemplate('${t.id}',this.value)">${t.emailTemplate.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
            <button class="btn btn-outline btn-xs" style="margin-top:4px" onclick="copyEmailTemplate('${t.id}')">📋 Copy to Clipboard</button>
          </div>
        </div>` : ''}
    </td>
    <td><span class="pill pill-gray">${t.freq}</span></td>
    <td><span class="pill ${t.urg==='high'?'pill-red':t.urg==='med'?'pill-gold':'pill-green'}">${t.urg||'low'}</span></td>
    <td>${t.done?'<span class="pill pill-green">Done</span>':'<span class="pill pill-gold">Pending</span>'}</td>
    <td>${t.due?(t.gcalId?'<span class="pill pill-green" style="font-size:10px">✓ Synced</span>':`<button class="btn-gcal btn-xs" onclick="syncTaskToGcal('${t.id}')">Sync</button>`):'—'}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-outline btn-xs" onclick="editTask('${t.id}')">✎</button>
      <button class="btn btn-outline btn-xs" onclick="toggleTask('${t.id}')">${t.done?'↩':'✓'}</button>
      <button class="btn btn-danger btn-xs" onclick="delTask('${t.id}')">✕</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="7" class="text-muted" style="padding:16px">No tasks.</td></tr>';
}
window.toggleEmailTemplate = function(id) {
  const el = document.getElementById('email-tpl-'+id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};
window.copyEmailTemplate = function(id) {
  const t = STORE.tasks.find(t=>t.id===id);
  if (!t || !t.emailTemplate) return;
  navigator.clipboard.writeText(t.emailTemplate)
    .then(()=>showToast('Email template copied to clipboard','success'))
    .catch(()=>showToast('Could not copy — try selecting the text manually','error'));
};
window.updateTaskEmailTemplate = function(id, val) {
  const t = STORE.tasks.find(t=>t.id===id); if(!t) return;
  t.emailTemplate = val; save();
};
window.toggleTask = function(id) {
  const t = STORE.tasks.find(t=>t.id===id); if(!t) return;
  t.done = !t.done;
  // Auto-generate next instance when a recurring task is marked done
  if (t.done && t.freq !== 'Once') {
    const next = generateNextTask(t);
    if (next) STORE.tasks.push(next);
  }
  save(); renderTasks();
};

function nextSemesterDate(dueDateStr, freq) {
  // Given a due date string, calculate the next due date for the next semester/year.
  // For Semester: Fall → Spring (add ~5 months), Spring → Fall (add ~7 months). Skip Summer.
  // For Annual: add exactly 12 months.
  if (!dueDateStr) return null;
  const d = new Date(dueDateStr + 'T00:00:00');
  if (freq === 'Annual') {
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0,10);
  }
  if (freq === 'Semester') {
    const m = d.getMonth(); // 0-based
    if (m >= 7) {
      // Fall (Aug–Dec) → Spring of next year: add ~5 months (set to same day, month+5)
      d.setMonth(m - 3); // roughly Oct→Mar, Nov→Apr etc
      d.setFullYear(d.getFullYear() + 1);
    } else {
      // Spring (Jan–Jul) → Fall of same year: add ~6 months
      d.setMonth(m + 6);
    }
    return d.toISOString().slice(0,10);
  }
  return null;
}

function generateNextTask(t) {
  const nextDue = nextSemesterDate(t.due, t.freq);
  if (!nextDue) return null;
  // Don't duplicate — check if a pending instance already exists
  const exists = STORE.tasks.find(x => x.title === t.title && !x.done && x.id !== t.id);
  if (exists) return null;
  return { id: uid(), title: t.title, due: nextDue, urg: t.urg||'med', freq: t.freq, notes: t.notes||'', done: false, gcalId: null };
}
window.delTask = async function(id) {
  const t=STORE.tasks.find(t=>t.id===id);
  if(t&&t.gcalId) await calDeleteEvent(t.gcalId);
  STORE.tasks=STORE.tasks.filter(t=>t.id!==id); save(); renderTasks();
};
window.syncTaskToGcal = async function(id) {
  const t=STORE.tasks.find(t=>t.id===id); if(!t||!t.due) return;
  if(t.gcalId) await calDeleteEvent(t.gcalId);
  const gcalId = await calCreateReminder(t.title, t.due, t.notes, t.urg||'med');
  if(gcalId){t.gcalId=gcalId; save(); renderTasks();}
};
let _editTaskId = null;
window.editTask = function(id) {
  _editTaskId = id;
  const t = STORE.tasks.find(t=>t.id===id); if(!t) return;
  document.getElementById('modal-task-title').textContent = 'Edit Task';
  document.getElementById('task-title').value = t.title;
  document.getElementById('task-due').value = t.due||'';
  document.getElementById('task-urg').value = t.urg||'med';
  document.getElementById('task-freq').value = t.freq||'Once';
  document.getElementById('task-notes').value = t.notes||'';
  document.getElementById('task-email-tpl').value = t.emailTemplate||'';
  openModal('modal-task');
};

// ═══════════════════════════════════
// MEETINGS
// ═══════════════════════════════════
function renderMeetings() { renderMeetingsSchedule(); renderAgendaItems(); renderMeetingsArchive(); }
function renderMeetingsSchedule() {
  const mtgName=STORE.settings.meetingName||'Comp/Theory Area Meeting';
  const upcoming = STORE.meetings.filter(m=>m.date>=today()).sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById('meetings-tbody').innerHTML = upcoming.map(m=>`<tr>
    <td>${fmtDate(m.date)}</td><td>${m.time||'—'}${m.timeEnd?' – '+m.timeEnd:''}</td>
    <td>${m.location||'—'}</td>
    <td>${m.remindDays} days before</td>
    <td>${m.generated?'<span class="pill pill-gray">Recurring</span>':'<span class="pill pill-blue">One-off</span>'}</td>
    <td>${m.gcalId?'<span class="pill pill-green" style="font-size:10px">✓ Synced</span>':`<button class="btn-gcal btn-xs" onclick="syncMeetingToGcal('${m.id}')">Sync</button>`}</td>
    <td style="display:flex;gap:4px;flex-wrap:wrap">
      <button class="btn btn-outline btn-xs" onclick="editMeeting('${m.id}')">✎ Edit</button>
      <button class="btn btn-outline btn-xs" onclick="downloadMeetingICS('${m.id}')" title="Download .ics for Outlook invitation">📅 .ics</button>
      <button class="btn btn-outline btn-xs" onclick="copyMeetingInvite('${m.id}')" title="Copy invitation email text">✉ Copy Invite</button>
      <button class="btn btn-danger btn-xs" onclick="delMeeting('${m.id}')">✕</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="7" class="text-muted" style="padding:16px">No upcoming meetings.</td></tr>';
}
// ── ICS generation helpers ──
function parseTimeToDate(dateStr, timeStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (!timeStr) return d;
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return d;
  let h = parseInt(m[1]), mn = parseInt(m[2]);
  const ap = (m[3]||'').toUpperCase();
  if (ap==='PM' && h<12) h+=12;
  if (ap==='AM' && h===12) h=0;
  d.setHours(h, mn, 0, 0);
  return d;
}

function toICSDate(dt) {
  // Format as YYYYMMDDTHHMMSSZ (UTC)
  return dt.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}

function generateICS(meeting, mtgName, attendees) {
  const start = parseTimeToDate(meeting.date, meeting.time);
  const end = meeting.timeEnd
    ? parseTimeToDate(meeting.date, meeting.timeEnd)
    : new Date(start.getTime() + 60*60000); // default 1 hour
  const now = new Date();
  const uid = meeting.id + '@area-head-dashboard';
  const location = meeting.location || '';
  const description = meeting.notes || '';
  const attendeeLines = (attendees||[])
    .map(email => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${email}`)
    .join('\r\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Area Head Dashboard//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(now)}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${mtgName}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description.replace(/\n/g,'\\n')}` : '',
    `ORGANIZER;CN=Area Head:mailto:scott.lee@ufl.edu`,
    attendeeLines,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${mtgName}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(l => l !== '').join('\r\n');

  return lines;
}

window.downloadMeetingICS = function(id) {
  const m = STORE.meetings.find(m=>m.id===id); if (!m) return;
  const mtgName = STORE.settings.meetingName||'Comp/Theory Area Meeting';
  const attendees = (STORE.settings.facultyInviteList||[]).map(a=>a.email).filter(Boolean);
  const ics = generateICS(m, mtgName, attendees);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = mtgName.replace(/[^a-z0-9]/gi,'_') + '_' + m.date + '.ics';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📅 .ics downloaded — attach to email in Outlook to send invitations.', 'success');
};

window.copyMeetingInvite = function(id) {
  const m = STORE.meetings.find(m=>m.id===id); if (!m) return;
  const mtgName = STORE.settings.meetingName||'Comp/Theory Area Meeting';
  const attendees = (STORE.settings.facultyInviteList||[]);
  const toLine = attendees.map(a=>a.name?`${a.name} <${a.email}>`:a.email).join(', ');
  const timeStr = m.time ? m.time + (m.timeEnd ? ' – ' + m.timeEnd : '') : 'Time TBD';
  const text = [
    `To: ${toLine||'[faculty list]'}`,
    `Subject: ${mtgName} — ${fmtDate(m.date)}`,
    '',
    `Dear colleagues,`,
    '',
    `This is an invitation to the ${mtgName}.`,
    '',
    `Date: ${fmtDate(m.date)}`,
    `Time: ${timeStr}`,
    m.location ? `Location: ${m.location}` : '',
    m.notes ? `\n${m.notes}` : '',
    '',
    'A calendar invitation (.ics file) is attached. Please accept to add this to your calendar.',
    '',
    'Best,',
    ((_userInfo&&_userInfo.name)||'Scott Lee'),
  ].filter(l => l !== null).join('\n');

  navigator.clipboard.writeText(text)
    .then(() => showToast('✉ Invitation email copied to clipboard — paste into Outlook and attach the .ics file.', 'success'))
    .catch(() => showToast('Could not copy — try selecting the text manually.', 'error'));
};

window.editMeeting = function(id) {
  const m=STORE.meetings.find(m=>m.id===id); if(!m) return;
  document.getElementById('modal-meeting-title').textContent = 'Edit Meeting';
  document.getElementById('mtg-edit-id').value = id;
  document.getElementById('mtg-date').value = m.date||'';
  document.getElementById('mtg-time').value = m.time||'';
  document.getElementById('mtg-time-end').value = m.timeEnd||'';
  document.getElementById('mtg-location').value = m.location||'';
  document.getElementById('mtg-remind-days').value = m.remindDays||7;
  document.getElementById('mtg-notes').value = m.notes||'';
  openModal('modal-meeting');
};
window.syncMeetingToGcal = async function(id) {
  const m=STORE.meetings.find(m=>m.id===id); if(!m) return;
  const mtgName=STORE.settings.meetingName||'Comp/Theory Area Meeting';
  const gcalId = await calSyncEvent(m.gcalId||null, mtgName, m.date, m.time, m.timeEnd, m.notes||m.location, 'Meeting');
  if(gcalId){m.gcalId=gcalId; save(); renderMeetingsSchedule();}
};
// Find the agenda-solicitation task associated with a meeting date
function findMeetingTask(meetingDate, meetingName) {
  const name = meetingName || STORE.settings.meetingName || 'Comp/Theory Area Meeting';
  return STORE.tasks.find(t =>
    !t.done &&
    t.freq === 'Once' &&
    t.title && t.title.includes('Solicit agenda items') &&
    t.title.includes(fmtDate(meetingDate))
  );
}

async function deleteMeetingTask(meetingDate, meetingName) {
  const task = findMeetingTask(meetingDate, meetingName);
  if (!task) return;
  if (task.gcalId) await calDeleteEvent(task.gcalId);
  STORE.tasks = STORE.tasks.filter(t => t.id !== task.id);
}

window.delMeeting = async function(id) {
  const m=STORE.meetings.find(m=>m.id===id);
  if(m) {
    // Delete the associated agenda-solicitation task and its calendar event
    await deleteMeetingTask(m.date);
    // Delete meeting from all synced calendars (primary + named only)
    const namedCals=(STORE.settings.signups&&STORE.settings.signups.namedCals)||[];
    if(m.gcalIds) {
      for(const [label, gcalId] of Object.entries(m.gcalIds)) {
        if(!gcalId) continue;
        const calId = label==='Primary Calendar' ? CONFIG.CALENDAR_ID
          : (namedCals.find(c=>c.nick===label)||{}).id||CONFIG.CALENDAR_ID;
        await calDeleteOnTarget(calId, gcalId, _accessToken);
      }
    } else if(m.gcalId) {
      await calDeleteEvent(m.gcalId);
    }
  }
  STORE.meetings=STORE.meetings.filter(m=>m.id!==id); save(); renderMeetingsSchedule();
};
function renderAgendaItems() {
  const active = STORE.agendaItems.filter(a=>!a.done);
  const done = STORE.agendaItems.filter(a=>a.done);
  const row = (a,idx,arr)=>`<div class="agenda-item-row" data-id="${a.id}" draggable="true" ondragstart="agendaDragStart(event,'${a.id}')" ondragover="agendaDragOver(event)" ondrop="agendaDrop(event,'${a.id}')">
    <span style="cursor:grab;color:var(--gray-400);font-size:16px;margin-right:2px;user-select:none">⠿</span>
    <input type="checkbox" ${a.done?'checked':''} onchange="toggleAgendaItem('${a.id}')">
    <div class="ai-text">${a.text}<div class="ai-submitter">${a.submitter?'— '+a.submitter:''}</div></div>
    <span class="pill ${a.priority==='High'?'pill-red':a.priority==='Informational'?'pill-blue':'pill-gray'}">${a.priority}</span>
    <button class="btn btn-danger btn-xs" onclick="delAgendaItem('${a.id}')">✕</button>
  </div>`;
  document.getElementById('agenda-active-list').innerHTML = active.length ? active.map(row).join('') : '<div class="text-muted">No active items.</div>';
  document.getElementById('agenda-completed-list').innerHTML = done.length ? done.map(row).join('') : '<div class="text-muted">None yet.</div>';
}
let _dragId=null;
window.agendaDragStart=function(e,id){_dragId=id;e.dataTransfer.effectAllowed='move';};
window.agendaDragOver=function(e){e.preventDefault();e.dataTransfer.dropEffect='move';};
window.agendaDrop=function(e,targetId){
  e.preventDefault();
  if(!_dragId||_dragId===targetId) return;
  const active=STORE.agendaItems.filter(a=>!a.done);
  const fromIdx=active.findIndex(a=>a.id===_dragId);
  const toIdx=active.findIndex(a=>a.id===targetId);
  if(fromIdx<0||toIdx<0) return;
  const moved=active.splice(fromIdx,1)[0];
  active.splice(toIdx,0,moved);
  // Rebuild full array preserving done items
  const done=STORE.agendaItems.filter(a=>a.done);
  STORE.agendaItems=[...active,...done];
  _dragId=null; save(); renderAgendaItems();
};
window.toggleAgendaItem = function(id){const a=STORE.agendaItems.find(a=>a.id===id); if(a) a.done=!a.done; save(); renderAgendaItems();};
window.delAgendaItem = function(id){STORE.agendaItems=STORE.agendaItems.filter(a=>a.id!==id); save(); renderAgendaItems();};
function renderMeetingsArchive() {
  const past = STORE.meetings.filter(m=>m.date<today()).sort((a,b)=>b.date.localeCompare(a.date));
  const mtgName=STORE.settings.meetingName||'Comp/Theory Area Meeting';
  document.getElementById('meetings-archive-list').innerHTML = past.length ? past.map(m=>`
    <div style="padding:12px 0;border-bottom:1px solid var(--gray-100)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <strong>${fmtDate(m.date)}</strong>
        <span style="color:var(--gray-600)">${m.time||''}</span>
        <span style="color:var(--gray-400);font-size:12px">${m.location||''}</span>
        <div style="flex:1"></div>
        <label class="btn btn-outline btn-xs" style="cursor:pointer">
          📎 Import Minutes
          <input type="file" accept=".txt,.md,.doc,.docx" style="display:none" onchange="importMinutes('${m.id}',this)">
        </label>
        <button class="btn btn-danger btn-xs" onclick="delMeetingArchive('${m.id}')">Delete</button>
      </div>
      ${m.minutes?`<div style="margin-top:8px;font-size:12px;background:var(--gray-100);padding:10px;border-radius:4px;white-space:pre-wrap;max-height:200px;overflow-y:auto">${m.minutes}</div>`:'<div class="text-muted" style="font-size:12px;margin-top:4px">No minutes attached. Use Import Minutes to attach a text file.</div>'}
    </div>`).join('') : '<div class="text-muted">No past meetings yet.</div>';
}
window.importMinutes=function(id,input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const m=STORE.meetings.find(m=>m.id===id);
    if(m){m.minutes=e.target.result;save();renderMeetingsArchive();showToast('Minutes imported','success');}
  };
  reader.readAsText(file);
};
window.delMeetingArchive=function(id){
  if(!confirm('Delete this meeting record?')) return;
  const m=STORE.meetings.find(m=>m.id===id);
  if(m){
    if(m.gcalId) calDeleteEvent(m.gcalId);
    // Also clean up associated agenda task
    deleteMeetingTask(m.date);
  }
  STORE.meetings=STORE.meetings.filter(m=>m.id!==id);save();renderMeetingsArchive();
};

// ═══════════════════════════════════
// ROTATIONS
// ═══════════════════════════════════
const ROT_2627=[
  {course:'MUC 1211 Comp Skills 1',fall:'Richards',spring:''},{course:'MUC 1212 Comp Skills 2',fall:'',spring:'Weiss'},
  {course:'MUC 2101 Comp Skills 3',fall:'Lee',spring:''},{course:'MUC 2102 Comp Skills 4',fall:'',spring:'TBD'},
  {course:'MUC 4313 Intro to Elec Music',fall:'Tovar-Henao',spring:''},{course:'MUC 4401 Comp of Elec Music',fall:'',spring:'Tovar-Henao'},
  {course:'MUC 5315 Intro to Elec Music (grad)',fall:'Tovar-Henao',spring:''},{course:'MUC 6444 Comp of Elec Music (grad)',fall:'',spring:'Tovar-Henao'},
  {course:'MUT 1001 Rudiments',fall:'GTA',spring:''},{course:'MUT 1111 Theory 1',fall:'Weiss',spring:''},{course:'MUT 1112 Theory 2',fall:'',spring:'Weiss'},
  {course:'MUT 1121 Theory 1 (spring)',fall:'',spring:'GTA'},{course:'MUT 1241L Aural Skills 1 (×4)',fall:'Lowe (×4)',spring:'GTA'},{course:'MUT 1242L Aural Skills 2 (×4)',fall:'',spring:'Lowe (×4)'},
  {course:'MUT 2116 Theory 3',fall:'Adams',spring:''},{course:'MUT 2117 Theory 4',fall:'',spring:'Adams'},{course:'MUT 2246L Aural Skills 3 (×3)',fall:'Hart (×3)',spring:''},{course:'MUT 2247L Aural Skills 4 (×3)',fall:'',spring:'Hart (×3)'},
  {course:'MUT 2641 Jazz Improvisation',fall:'Wilson',spring:''},{course:'MUT 2213L Commercial Aural 1',fall:'Pellegrin',spring:''},{course:'MUT 2215L Commercial Aural 2',fall:'',spring:'Pellegrin'},
  {course:'MUT 3321 Inst & Vocal Arr',fall:'Lee',spring:''},{course:'MUT 3611 Form & Analysis 1',fall:'Pellegrin',spring:''},{course:'MUT 3612 Form & Analysis 2',fall:'',spring:'Pellegrin'},
  {course:'MUT 4401 Counterpoint 1',fall:'Richards',spring:''},{course:'MUT 4402 Counterpoint 2',fall:'',spring:'Richards'},{course:'MUT 6051 Grad Theory Rev',fall:'Adams',spring:''},
  {course:'MUT 6445 Advanced Counterpoint',fall:'',spring:'Richards'},{course:'MUT 6565 19th/20th Styles',fall:'Weiss',spring:''},{course:'MUT 6576 Contemporary Styles',fall:'',spring:'Lee'},
  {course:'MUT 6629 Analytical Techniques',fall:'',spring:'Adams'},{course:'MUT 6936 Theory Seminar (fall)',fall:'Adams',spring:''},{course:'MUT 6936 Theory Seminar (spring)',fall:'',spring:'Pellegrin'},
  {course:'MUS 1360 Intro to Mus Tech',fall:'GTA',spring:'GTA (×2)'},
];
const ROT_2728=[
  {course:'MUC 1211 Comp Skills 1',fall:'Richards',spring:''},{course:'MUC 1212 Comp Skills 2',fall:'',spring:'Weiss'},
  {course:'MUC 2101 Comp Skills 3',fall:'Lee',spring:''},{course:'MUC 2102 Comp Skills 4',fall:'',spring:'TBD'},
  {course:'MUC 6445 Comp of EA/Dig 1',fall:'Tovar-Henao',spring:''},{course:'MUC 6446 Comp of EA/Dig 2',fall:'',spring:'Tovar-Henao'},
  {course:'MUT 1001 Rudiments',fall:'GTA',spring:''},{course:'MUT 1111 Theory 1',fall:'Weiss',spring:''},{course:'MUT 1112 Theory 2',fall:'',spring:'Weiss'},
  {course:'MUT 1121 Theory 1 (spring)',fall:'',spring:'GTA'},{course:'MUT 1241L Aural Skills 1 (×4)',fall:'Lowe (×4)',spring:'GTA'},{course:'MUT 1242L Aural Skills 2 (×4)',fall:'',spring:'Lowe (×4)'},
  {course:'MUT 2116 Theory 3',fall:'Adams',spring:''},{course:'MUT 2117 Theory 4',fall:'',spring:'Adams'},{course:'MUT 2246L Aural Skills 3 (×3)',fall:'Hart (×3)',spring:''},{course:'MUT 2247L Aural Skills 4 (×3)',fall:'',spring:'Hart (×3)'},
  {course:'MUT 2641 Jazz Improvisation',fall:'Wilson',spring:''},{course:'MUT 2213L Commercial Aural 1',fall:'Pellegrin',spring:''},{course:'MUT 2215L Commercial Aural 2',fall:'',spring:'Pellegrin'},
  {course:'MUT 3321 Inst & Vocal Arr',fall:'Lee',spring:''},{course:'MUT 3322 Scoring for Band & Orch',fall:'',spring:'Lee'},{course:'MUT 3611 Form & Analysis 1',fall:'Pellegrin',spring:''},{course:'MUT 3612 Form & Analysis 2',fall:'',spring:'Pellegrin'},
  {course:'MUT 4401 Counterpoint 1',fall:'Richards',spring:''},{course:'MUT 4402 Counterpoint 2',fall:'',spring:'Richards'},{course:'MUT 6051 Grad Theory Rev',fall:'Weiss',spring:''},
  {course:'MUT 6445 Advanced Counterpoint',fall:'',spring:'Richards'},{course:'MUT 6629 Analytical Techniques',fall:'',spring:'Adams'},{course:'MUT 6751 Pedagogy of Theory',fall:'Adams',spring:''},
  {course:'MUT 6936 Theory Seminar (fall)',fall:'Pellegrin',spring:''},{course:'MUT 6936 Theory Seminar (spring)',fall:'',spring:'Lee'},{course:'MUS 1360 Intro to Mus Tech (×2)',fall:'GTA (×2)',spring:'GTA (×2)'},
];
function rotRow(r){return `<tr><td><strong>${r.course}</strong></td>
  <td>${r.fall?`<span class="pill ${r.fall.includes('GTA')?'pill-gold':'pill-navy'}">${r.fall}</span>`:''}</td>
  <td>${r.spring?`<span class="pill ${r.spring.includes('GTA')?'pill-gold':'pill-navy'}">${r.spring}</span>`:''}</td></tr>`;}
function renderRotations() {
  if(!STORE.rot2627||!STORE.rot2627.length) STORE.rot2627=ROT_2627.map(r=>({...r,summer:'',note:''}));
  if(!STORE.rot2728||!STORE.rot2728.length) STORE.rot2728=ROT_2728.map(r=>({...r,summer:'',note:''}));
  renderRotTable('rot-2627-tbody',STORE.rot2627,'rot2627');
  renderRotTable('rot-2728-tbody',STORE.rot2728,'rot2728');
  renderScenarios();
}
window.exportRotation = function(key) {
  const data = key==='rot2627' ? STORE.rot2627 : STORE.rot2728;
  const label = key==='rot2627' ? '26/27' : '27/28';
  const prefixes = ['MUC','MUT','MUS'];
  let txt = 'COMPOSITION, THEORY & TECHNOLOGY\nCourse Rotations — ' + label + '\n\n';
  prefixes.forEach(prefix => {
    const rows = data.filter(r=>r.course.startsWith(prefix));
    if (!rows.length) return;
    txt += prefix + '\n';
    txt += [' Course'.padEnd(40), 'Fall'.padEnd(25), 'Spring'].join('\t') + '\n';
    txt += '-'.repeat(80) + '\n';
    rows.forEach(r => {
      const note = r.note ? ' *' : '';
      txt += [(r.course+note).padEnd(40), (r.fall||'').padEnd(25), r.spring||''].join('\t') + '\n';
    });
    // Summer courses for this prefix
    const summerRows = rows.filter(r=>r.summer);
    if (summerRows.length) {
      txt += '\nSummer:\n';
      summerRows.forEach(r=>{ txt += '  '+r.course+': '+r.summer+'\n'; });
    }
    // Notes/footnotes
    const noteRows = rows.filter(r=>r.note);
    if (noteRows.length) {
      txt += '\n';
      noteRows.forEach(r=>{ txt += '* '+r.note+'\n'; });
    }
    txt += '\n';
  });
  txt += '\nNote: Subject to change based upon faculty loads and the needs of the area.\n';
  const blob = new Blob([txt],{type:'text/plain'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='CourseRotations_'+key+'_'+today()+'.txt'; a.click();
};
function renderRotTable(tbodyId,data,key) {
  document.getElementById(tbodyId).innerHTML=data.map((r,i)=>`<tr>
    <td><span style="font-weight:600">${r.course}${r.note?'<sup style="color:var(--gold);font-weight:700"> *</sup>':''}</span></td>
    <td>${r.fall?`<span class="pill ${r.fall.includes('GTA')?'pill-gold':'pill-navy'}">${r.fall}</span>`:''}</td>
    <td>${r.spring?`<span class="pill ${r.spring.includes('GTA')?'pill-gold':'pill-navy'}">${r.spring}</span>`:''}</td>
    <td>${r.summer?`<span class="pill pill-blue">${r.summer}</span>`:''}</td>
    <td style="font-size:11px;color:var(--gray-400);max-width:160px">${r.note||''}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-outline btn-xs" onclick="editRotCourse('${key}',${i})">✎</button>
      <button class="btn btn-danger btn-xs" onclick="delRotCourse('${key}',${i})">✕</button>
    </td>
  </tr>`).join('');
}
window.editRotCourse=function(key,idx){
  const data=key==='rot2627'?STORE.rot2627:STORE.rot2728;
  const r=data[idx];
  const course=prompt('Course name:',r.course); if(course===null) return; r.course=course;
  const fall=prompt('Fall instructor (blank = none):',r.fall||''); r.fall=fall;
  const spring=prompt('Spring instructor (blank = none):',r.spring||''); r.spring=spring;
  const summer=prompt('Summer instructor (blank = none):',r.summer||''); r.summer=summer;
  const note=prompt('Footnote/asterisk note (blank = none):',r.note||''); r.note=note||'';
  save(); renderRotations();
};
window.delRotCourse=function(key,idx){
  if(!confirm('Remove this course from the rotation?')) return;
  if(key==='rot2627') STORE.rot2627.splice(idx,1);
  else STORE.rot2728.splice(idx,1);
  save(); renderRotations();
};
window.addRotCourse=function(key){
  const course=prompt('Course name (e.g. MUT 1234 New Course):'); if(!course) return;
  const fall=prompt('Fall instructor (blank = none):');
  const spring=prompt('Spring instructor (blank = none):');
  const summer=prompt('Summer instructor (blank = none):');
  const row={course,fall:fall||'',spring:spring||'',summer:summer||''};
  if(key==='rot2627') STORE.rot2627.push(row);
  else STORE.rot2728.push(row);
  save(); renderRotations();
};
function renderScenarios() {
  const el = document.getElementById('scenarios-list');
  if(!STORE.rotationScenarios.length){el.innerHTML='<div class="text-muted">No scenarios yet.</div>';return;}
  el.innerHTML=STORE.rotationScenarios.map(sc=>`
    <div class="card"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:600">${sc.name}</div>
      <span class="text-muted">created ${fmtDate(sc.created)}</span><div class="spacer"></div>
      <button class="btn btn-danger btn-xs" onclick="delScenario('${sc.id}')">Delete</button>
    </div>${sc.notes?`<div class="text-muted mb-8">${sc.notes}</div>`:''}
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Course</th><th>Fall</th><th>Spring</th></tr></thead>
    <tbody>${sc.courses.map((r,i)=>`<tr><td><strong>${r.course}</strong></td>
      <td><input type="text" value="${esc(r.fall||'')}" style="width:140px;font-size:12px" onchange="updateScenarioCourse('${sc.id}',${i},'fall',this.value)"></td>
      <td><input type="text" value="${esc(r.spring||'')}" style="width:140px;font-size:12px" onchange="updateScenarioCourse('${sc.id}',${i},'spring',this.value)"></td>
    </tr>`).join('')}</tbody></table></div></div>`).join('');
}
window.delScenario=function(id){STORE.rotationScenarios=STORE.rotationScenarios.filter(s=>s.id!==id);save();renderScenarios();};
window.updateScenarioCourse=function(scId,idx,field,val){const sc=STORE.rotationScenarios.find(s=>s.id===scId);if(sc&&sc.courses[idx]){sc.courses[idx][field]=val;save();}};

// ═══════════════════════════════════
// GTA
// ═══════════════════════════════════

// ═══════════════════════════════════
// GTA DUTIES
// ═══════════════════════════════════
function renderGTADuties() {
  const el = document.getElementById('gta-duties-list');
  if (!el) return;
  const duties = STORE.settings.gtaDuties || getDefaultGTADuties();
  if (!STORE.settings.gtaDuties) STORE.settings.gtaDuties = duties;
  el.innerHTML = duties.map((d, i) => `
    <div style="margin-bottom:16px;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden">
      <div style="background:var(--navy);color:var(--white);padding:8px 14px;display:flex;align-items:center;gap:10px">
        <input type="text" value="${esc(d.role)}" style="flex:1;background:transparent;border:none;color:var(--white);font-size:13px;font-weight:600;" onchange="updateDutyRole(${i},'role',this.value)">
        <button class="btn btn-danger btn-xs" onclick="delDutyRole(${i})">✕</button>
      </div>
      <textarea rows="6" style="width:100%;padding:10px 14px;border:none;font-size:12px;font-family:'Source Code Pro',monospace;resize:vertical" onchange="updateDutyRole(${i},'text',this.value)">${esc(d.text)}</textarea>
    </div>`).join('');
}
window.updateDutyRole = function(idx, field, val) {
  if (!STORE.settings.gtaDuties) STORE.settings.gtaDuties = getDefaultGTADuties();
  if (STORE.settings.gtaDuties[idx]) { STORE.settings.gtaDuties[idx][field] = val; save(); }
};
window.delDutyRole = function(idx) {
  if (!confirm('Delete this duties section?')) return;
  STORE.settings.gtaDuties.splice(idx, 1); save(); renderGTADuties();
};

function renderGTA() {
  renderGTADuties();
  const sems=semOpts(), sel=document.getElementById('gta-sem-select');
  const cur=sel.value||STORE.settings.currentSemester;
  sel.innerHTML=sems.map(s=>`<option${s===cur?' selected':''}>${s}</option>`).join('');
  renderGTATable(); renderGTAHistory();
}
function renderGTATable() {
  const sem=document.getElementById('gta-sem-select').value||STORE.settings.currentSemester;
  const asgns=STORE.gtaAssignments.filter(a=>a.semester===sem).sort((a,b)=>a.gta.localeCompare(b.gta));
  // Hours check: total assigned vs available per GTA
  const hoursMap={};
  asgns.forEach(a=>{ hoursMap[a.gta]=(hoursMap[a.gta]||0)+Number(a.hours); });
  const gtaRoster=studentsActiveDuringSemester(sem).filter(p=>p.hours>0);
  const hoursHtml=gtaRoster.map(g=>{
    const assigned=hoursMap[g.name]||0;
    const avail=g.hours||0;
    const color=assigned>avail?'var(--red)':assigned===avail?'var(--green)':'var(--gold)';
    return `<div style="display:inline-flex;align-items:center;gap:8px;background:var(--gray-100);border-radius:6px;padding:5px 10px;margin:3px">
      <strong style="font-size:12px">${g.name}</strong>
      <span style="font-size:12px;color:${color};font-weight:700">${assigned}/${avail}h</span>
    </div>`;
  }).join('');
  document.getElementById('gta-hours-check').innerHTML=`<div class="card-title">Hours Check — ${sem}</div><div>${hoursHtml||'<span class="text-muted">No GTA students configured (set GTA hours on student record).</span>'}</div>`;
  document.getElementById('gta-tbody').innerHTML=asgns.map(a=>`<tr>
    <td><strong>${a.gta}</strong></td><td>${a.course}</td><td>${a.hours}</td><td>${a.supervisor}</td>
    <td>${a.tor?'<span class="pill pill-gold">ToR</span>':''}</td>
    <td><button class="btn btn-danger btn-xs" onclick="delGTA('${a.id}')">✕</button></td>
  </tr>`).join('')||'<tr><td colspan="6" class="text-muted" style="padding:16px">No assignments.</td></tr>';
}
window.exportGTA = function() {
  const sem=document.getElementById('gta-sem-select').value||STORE.settings.currentSemester;
  const asgns=STORE.gtaAssignments.filter(a=>a.semester===sem).sort((a,b)=>a.gta.localeCompare(b.gta));
  // Group by GTA
  const byGTA = {};
  asgns.forEach(a=>{
    if(!byGTA[a.gta]) byGTA[a.gta]=[];
    byGTA[a.gta].push(a);
  });
  let txt = `GTA Assignments ${sem}\n`;
  txt += 'Bold print indicates teacher of record | Supervising faculty in parentheses\n\n';
  Object.entries(byGTA).forEach(([name, tasks])=>{
    const person = STORE.people.find(p=>p.name===name&&p.type==='student');
    const hrs = person?person.hours:0;
    const fellow = person&&person.fellow?' – Fellowship':'';
    txt += `${name} (${hrs} hours${fellow})\n`;
    tasks.forEach(t=>{
      const label = t.tor ? `**${t.course}** (${t.supervisor})` : `${t.hours} hours ${t.course} (${t.supervisor})`;
      txt += `  - ${label}\n`;
    });
    txt += '\n';
  });
  // Append duties sections
  const duties = STORE.settings.gtaDuties || getDefaultGTADuties();
  if (duties.length) {
    txt += '\n' + '='.repeat(50) + '\n';
    duties.forEach(d=>{ txt += `\nDuties for ${d.role}:\n${d.text}\n`; });
  }
  const blob=new Blob([txt],{type:'text/plain'});
  const l=document.createElement('a');l.href=URL.createObjectURL(blob);
  l.download=`GTA_Assignments_${sem.replace(' ','_')}.txt`;l.click();
};

function getDefaultGTADuties() {
  return [
    { role:'Written Theory TAs', text:'- Attend all lectures and assist with classroom instruction\n- Grade homework and return it in a timely manner\n- Post grades in a timely manner\n- Proctor exams, as assigned\n- Hold office hours to assist students, as assigned by Supervisory Teacher\n- Attend scheduled meetings with Supervisory Teacher\n- Inform the Supervisory Teacher of absences\n- Check email and phone/text messages daily\n- Monitor Recital Attendance, as assigned' },
    { role:'Aural Skills TAs', text:'- Attend all lectures and assist with classroom instruction, including conducting aural skills drills and exercises\n- Grade homework and return it in a timely manner\n- Post grades in a timely manner\n- Proctor exams, as assigned\n- Hold office hours to assist students, as assigned by Supervisory Teacher\n- Attend scheduled meetings with Supervisory Teacher\n- Inform the Supervisory Teacher of absences\n- Check email and phone/text messages daily\n- Monitor Recital Attendance, as assigned' },
    { role:'Electronic Studios TAs', text:'- Assist in developing promotional materials for the electroacoustic music studios and composition program\n- Maintain composition area website\n- Attend scheduled meetings with Supervisory Teacher\n- Inform the Supervisory Teacher of absences\n- Check email and phone/text messages daily\n- Monitor Recital Attendance, as assigned\n- Maintain, update, and organize studio equipment\n- Supervise the computer lab, including hiring and scheduling student workers and maintaining equipment\n- Assist with instruction, as assigned by Supervisory Teacher' },
    { role:'Rudiments/Theory 1 teacher of record', text:'- Teach Rudiments of Music (fall); Written Theory 1 (spring), which includes planning and class preparation\n- Grade homework and return it in a timely manner\n- Post grades in a timely manner\n- Hold office hours to assist students\n- Attend scheduled meetings with theory area faculty\n- Check email and phone/text messages daily\n- Monitor Recital Attendance, as assigned' },
    { role:'Introduction to Music Technology TAs', text:'- Assist in the teaching of Introduction to Music Technology\n- Grade homework and return it in a timely manner\n- Post grades in a timely manner\n- Hold office hours to assist students\n- Attend scheduled meetings with electroacoustic music area faculty\n- Check email and phone/text messages daily\n- Monitor Recital Attendance, as assigned' },
  ];
}
// Returns students who were active (enrolled) during a given semester
// Uses entryYear/entryTerm and exitYear to bound the range
function studentsActiveDuringSemester(sem) {
  if (!sem) return students();
  const semMatch = sem.match(/(Spring|Summer|Fall)\s+(\d{4})/i);
  if (!semMatch) return students();
  const semSeason = semMatch[1].toLowerCase();
  const semYear   = parseInt(semMatch[2]);
  // Convert semester to a numeric key for comparison: YYYY.1=Spring, YYYY.2=Summer, YYYY.3=Fall
  const semOrder = { spring: 1, summer: 2, fall: 3 };
  const semKey = semYear + semOrder[semSeason] / 10;

  return STORE.people.filter(p => {
    if (p.type !== 'student') return false;
    // Parse entry
    const entryYear = parseInt(p.entryYear) || 0;
    const entryTerm = (p.entryTerm || 'fall').toLowerCase();
    const entryKey  = entryYear + (semOrder[entryTerm] || 3) / 10;
    // Parse exit (if graduated/deactivated)
    let exitKey = 9999;
    if (p.active === false && p.exitYear) {
      const ey = parseInt(p.exitYear);
      // Assume they were active through the end of the semester they exited
      // exitYear alone — assume they finished at end of that academic year (Spring)
      exitKey = ey + 1 / 10; // Spring of exit year
    }
    return semKey >= entryKey && semKey <= exitKey;
  });
}
function renderGTAHistory() {
  const sel=document.getElementById('gta-hist-filter');
  const names=[...new Set(STORE.gtaAssignments.map(a=>a.gta))].sort();
  const cur=sel.value;
  sel.innerHTML='<option value="">All</option>'+names.map(n=>`<option${n===cur?' selected':''}>${n}</option>`).join('');
  const list=sortBySem(sel.value?STORE.gtaAssignments.filter(a=>a.gta===sel.value):[...STORE.gtaAssignments]);
  document.getElementById('gta-hist-tbody').innerHTML=list.map(a=>`<tr>
    <td>${a.semester}</td><td><strong>${a.gta}</strong></td><td>${a.course}</td>
    <td>${a.hours}</td><td>${a.supervisor}</td><td>${a.tor?'<span class="pill pill-gold">ToR</span>':''}</td>
  </tr>`).join('')||'<tr><td colspan="6" class="text-muted" style="padding:16px">No history.</td></tr>';
}

// ═══════════════════════════════════
// STUDIO
// ═══════════════════════════════════
function renderStudio() {
  const sems=semOpts(),sel=document.getElementById('studio-sem-select');
  const cur=sel.value||STORE.settings.currentSemester;
  sel.innerHTML=sems.map(s=>`<option${s===cur?' selected':''}>${s}</option>`).join('');
  renderStudioTable(); renderStudioHistory();
}
function renderStudioTable() {
  const sem=document.getElementById('studio-sem-select').value||STORE.settings.currentSemester;
  const asgns=STORE.studioAssignments.filter(a=>a.semester===sem);
  const cf=compFaculty();
  const loadMap={};
  cf.forEach(f=>loadMap[f.name]={count:0,min:f.min||0,max:f.max||0});
  asgns.forEach(a=>{if(loadMap[a.faculty])loadMap[a.faculty].count++;});
  const loadHtml=cf.map(f=>{
    const v=loadMap[f.name]||{count:0,min:0,max:0};
    const color=v.max&&v.count>v.max?'var(--red)':v.count>=v.min?'var(--green)':'var(--gold)';
    return `<div style="display:inline-flex;align-items:center;gap:8px;background:var(--gray-100);border-radius:6px;padding:6px 12px;margin:4px">
      <strong style="font-size:13px">${f.name}</strong><span style="font-size:12px;color:${color};font-weight:600">${v.count}/${v.max||'?'}</span></div>`;
  }).join('');
  document.getElementById('studio-load-summary').innerHTML=`<div class="card-title">Faculty Load — ${sem}</div><div>${loadHtml||'<span class="text-muted">No composition faculty configured.</span>'}</div>`;
  // Coverage check
  const assignedNames=new Set(asgns.map(a=>a.student));
  const allActive=students();
  const unassigned=allActive.filter(s=>!assignedNames.has(s.name));
  const coverageColor=unassigned.length===0?'var(--green)':'var(--red)';
  const unassignedHtml=unassigned.length?`<div style="margin-top:8px;font-size:12px"><strong style="color:var(--red)">Unassigned:</strong> ${unassigned.map(s=>s.name).sort((a,b)=>lastName(a).localeCompare(lastName(b))).join(', ')}</div>`:'';
  document.getElementById('studio-coverage').innerHTML=`<div style="font-size:13px;font-weight:600;color:${coverageColor}">${assignedNames.size} / ${allActive.length} students assigned</div>${unassignedHtml}`;
  // Sort by last name
  const sorted=[...asgns].sort((a,b)=>lastName(a.student).localeCompare(lastName(b.student)));
  document.getElementById('studio-tbody').innerHTML=sorted.map(a=>`<tr>
    <td><strong>${a.student}</strong></td>
    <td>${getStuDegree(a.student)}</td>
    <td>${a.faculty}</td><td>${a.isChair?'<span class="pill pill-gold">Chair</span>':''}</td>
    <td style="font-size:12px">${a.notes||''}</td>
    <td><button class="btn btn-danger btn-xs" onclick="delStudio('${a.id}')">✕</button></td>
  </tr>`).join('')||'<tr><td colspan="6" class="text-muted" style="padding:16px">No assignments.</td></tr>';
}
window.exportStudio = function() {
  const sem=document.getElementById('studio-sem-select').value||STORE.settings.currentSemester;
  const asgns=[...STORE.studioAssignments.filter(a=>a.semester===sem)].sort((a,b)=>lastName(a.student).localeCompare(lastName(b.student)));
  let txt=`STUDIO ASSIGNMENTS — ${sem}\n${'='.repeat(50)}\n`;
  txt+=asgns.map(a=>`${a.student}\t${getStuDegree(a.student)}\t${a.faculty}${a.isChair?' (Chair)':''}`).join('\n');
  navigator.clipboard.writeText(txt).then(()=>showToast('Studio table copied to clipboard','success')).catch(()=>{
    const b=new Blob([txt],{type:'text/plain'});const l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=`Studio_${sem.replace(' ','_')}.txt`;l.click();
  });
};
function getStuDegree(name){const s=STORE.people.find(p=>p.name===name&&p.type==='student');return s?s.degree:'';}
window.delStudio=function(id){STORE.studioAssignments=STORE.studioAssignments.filter(a=>a.id!==id);save();renderStudioTable();};
function renderStudioHistory() {
  const sel=document.getElementById('studio-hist-filter');
  const names=[...new Set(STORE.studioAssignments.map(a=>a.student))].sort();
  const cur=sel.value;
  sel.innerHTML='<option value="">All</option>'+names.map(n=>`<option${n===cur?' selected':''}>${n}</option>`).join('');
  const list=sortBySem(sel.value?STORE.studioAssignments.filter(a=>a.student===sel.value):[...STORE.studioAssignments]);
  document.getElementById('studio-hist-tbody').innerHTML=list.map(a=>`<tr>
    <td>${a.semester}</td><td><strong>${a.student}</strong></td><td>${a.faculty}</td>
    <td>${a.isChair?'<span class="pill pill-gold">Chair</span>':''}</td>
  </tr>`).join('')||'<tr><td colspan="4" class="text-muted" style="padding:16px">No history.</td></tr>';
}

// ═══════════════════════════════════
// STUDENTS
// ═══════════════════════════════════
function renderStudents() {
  // Active roster
  const degs = STORE.degrees;
  document.getElementById('stu-deg-filter').innerHTML='<option value="">All degrees</option>'+degs.map(d=>`<option>${d}</option>`).join('');
  const search=(document.getElementById('stu-search').value||'').toLowerCase();
  const degF=document.getElementById('stu-deg-filter').value;
  const list=students().filter(s=>(!search||s.name.toLowerCase().includes(search))&&(!degF||s.degree===degF));
  document.getElementById('students-tbody').innerHTML=list.map(s=>`<tr class="person-row" onclick="openPersonModal('${s.id}')">
    <td><strong>${s.name}</strong></td><td><span class="pill pill-navy">${s.degree||''}</span></td>
    <td>${s.entry||'—'}</td><td>${s.grad||'—'}</td><td>${s.chair||'—'}</td>
    <td>${s.status?`<span class="pill pill-blue" style="font-size:10px">${s.status}</span>`:''}</td>
    <td>${s.hours>0?s.hours:''}</td>
    <td><button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openPersonModal('${s.id}')">✎ Edit</button></td>
  </tr>`).join('')||'<tr><td colspan="8" class="text-muted" style="padding:16px">No active students.</td></tr>';
  // Alumni roster
  renderAlumni();
}

function renderAlumni() {
  const degs = STORE.degrees;
  document.getElementById('alumni-deg-filter').innerHTML='<option value="">All degrees</option>'+degs.map(d=>`<option>${d}</option>`).join('');
  const search=(document.getElementById('alumni-search').value||'').toLowerCase();
  const degF=document.getElementById('alumni-deg-filter').value;
  const exitF=document.getElementById('alumni-exit-filter').value;
  const list=allStudents().filter(s=>s.active===false)
    .filter(s=>(!search||s.name.toLowerCase().includes(search))&&(!degF||s.degree===degF)&&(!exitF||s.exitType===exitF))
    .sort((a,b)=>(b.exitYear||'').localeCompare(a.exitYear||''));
  document.getElementById('alumni-tbody').innerHTML=list.map(s=>`<tr class="person-row" onclick="openPersonModal('${s.id}')">
    <td><strong>${s.name}</strong></td>
    <td><span class="pill pill-gray">${s.degree||''}</span></td>
    <td>${s.entry||'—'}</td>
    <td>${s.exitYear||'—'}</td>
    <td>${s.exitType?`<span class="pill ${s.exitType==='Graduated'?'pill-green':s.exitType==='Left Program'?'pill-red':'pill-gray'}">${s.exitType}</span>`:'—'}</td>
    <td>${s.chair||'—'}</td>
    <td><button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openPersonModal('${s.id}')">✎ Edit</button></td>
  </tr>`).join('')||'<tr><td colspan="7" class="text-muted" style="padding:16px">No alumni records.</td></tr>';
}

// ═══════════════════════════════════
// FACULTY
// ═══════════════════════════════════
function renderFaculty() {
  const areaF=document.getElementById('fac-area-filter').value;
  const showAlumni=document.getElementById('fac-show-alumni')&&document.getElementById('fac-show-alumni').checked;
  const list=STORE.people.filter(p=>p.type==='faculty'
    &&(showAlumni?p.active===false:p.active!==false)
    &&(!areaF||(Array.isArray(p.areas)&&p.areas.includes(areaF))));
  document.getElementById('faculty-tbody').innerHTML=list.map(f=>{
    const areas=(f.areas||[]).map(a=>`<span class="area-tag area-${a==='Composition'?'comp':a==='Theory'?'theory':'aural'}">${a}</span>`).join('');
    const currentLoad=STORE.studioAssignments.filter(a=>a.faculty===f.name&&a.semester===STORE.settings.currentSemester).length;
    const archivedBadge = f.active===false ? '<span class="pill pill-gray" style="font-size:10px">Archived</span> ' : '';
    return `<tr class="person-row" onclick="openPersonModal('${f.id}')">
      <td><strong>${f.name}</strong> ${archivedBadge}</td><td>${f.title||''}</td><td>${areas}</td>
      <td>${f.areas&&f.areas.includes('Composition')&&f.active!==false?`<span style="font-size:12px">${currentLoad}/${f.max||'?'} (${STORE.settings.currentSemester})</span>`:''}</td>
      <td style="font-size:12px;max-width:200px">${f.notes||''}</td>
      <td><button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openPersonModal('${f.id}')">✎ Edit</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="6" class="text-muted" style="padding:16px">No faculty.</td></tr>';
}

// ═══════════════════════════════════
// PERSON MODAL (shared student/faculty)
// ═══════════════════════════════════
window.openPersonModal = function(id) {
  const p = id ? STORE.people.find(p=>p.id===id) : null;
  const type = p ? p.type : (id === 'new-student' ? 'student' : 'faculty');
  const isActive = !p || p.active !== false;
  document.getElementById('person-id').value = p ? p.id : '';
  document.getElementById('person-type').value = type;
  const alumniTag = p&&p.active===false ? ' 🎓 Alumni' : '';
  document.getElementById('modal-person-title').textContent = p ? `Edit ${p.name}${alumniTag}` : (type==='student'?'Add Student':'Add Faculty');
  document.getElementById('btn-delete-person').style.display = p ? 'inline-flex' : 'none';
  document.getElementById('person-student-fields').style.display = type==='student' ? 'block' : 'none';
  document.getElementById('person-faculty-fields').style.display = type==='faculty' ? 'block' : 'none';

  // Active/inactive toggle button (students and faculty)
  const toggleBtn = document.getElementById('btn-toggle-active');
  if (p && type==='student') {
    toggleBtn.style.display = 'inline-flex';
    if (isActive) {
      toggleBtn.textContent = '🎓 Graduate / Deactivate';
      toggleBtn.className = 'btn btn-outline btn-sm';
    } else {
      toggleBtn.textContent = '↩ Reactivate';
      toggleBtn.className = 'btn btn-gold btn-sm';
    }
  } else if (p && type==='faculty') {
    toggleBtn.style.display = 'inline-flex';
    if (isActive) {
      toggleBtn.textContent = '📦 Archive Faculty';
      toggleBtn.className = 'btn btn-outline btn-sm';
    } else {
      toggleBtn.textContent = '↩ Reactivate';
      toggleBtn.className = 'btn btn-gold btn-sm';
    }
  } else {
    toggleBtn.style.display = 'none';
  }

  // Exit fields (alumni only)
  const exitFields = document.getElementById('person-exit-fields');
  exitFields.style.display = (p && type==='student' && !isActive) ? 'block' : 'none';

  // populate degree select
  document.getElementById('person-degree').innerHTML = STORE.degrees.map(d=>`<option${p&&p.degree===d?' selected':''}>${d}</option>`).join('');
  if (type==='student') {
    document.getElementById('person-name').value = p?p.name:'';
    document.getElementById('person-entry').value = p?p.entry||'':'';
    document.getElementById('person-grad').value = p?p.grad||'':'';
    document.getElementById('person-status').value = p?p.status||'':'';
    document.getElementById('person-chair').value = p?p.chair||'':'';
    document.getElementById('person-hours').value = p?p.hours||0:0;
    document.getElementById('person-fellow').value = p&&p.fellow?'1':'0';
    document.getElementById('person-notes').value = p?p.notes||'':'';
    document.getElementById('person-exit-year').value = p?p.exitYear||'':'';
    document.getElementById('person-exit-type').value = p?p.exitType||'Graduated':'Graduated';
  } else {
    document.getElementById('fac-name-p').value = p?p.name:'';
    document.getElementById('fac-title-p').value = p?p.title||'':'';
    document.getElementById('fac-area-comp').checked = p&&p.areas&&p.areas.includes('Composition');
    document.getElementById('fac-area-theory').checked = p&&p.areas&&p.areas.includes('Theory');
    document.getElementById('fac-area-aural').checked = p&&p.areas&&p.areas.includes('Aural Skills');
    document.getElementById('fac-min-p').value = p?p.min||0:0;
    document.getElementById('fac-max-p').value = p?p.max||8:8;
    document.getElementById('person-notes').value = p?p.notes||'':'';
  }
  openModal('modal-person');
};

// ═══════════════════════════════════
// PRESENTATIONS
// ═══════════════════════════════════
function renderPresentations() {
  const fromSel = document.getElementById('pres-from-filter');
  const toSel   = document.getElementById('pres-to-filter');
  const stuSel  = document.getElementById('pres-stu-filter');
  if (!fromSel) return;

  const curSem = STORE.settings.currentSemester;
  const existingSems = [...new Set(STORE.presentations.map(p=>p.semester))];
  const allSems = [...new Set([...existingSems, curSem])]
    .sort((a,b) => semKey(a).localeCompare(semKey(b))); // chronological

  const prevFrom = fromSel.value, prevTo = toSel.value, prevStu = stuSel.value;
  const semOpts = allSems.map(s => `<option value="${s}">${s}</option>`).join('');
  fromSel.innerHTML = '<option value="">Earliest</option>' + semOpts;
  toSel.innerHTML   = '<option value="">Latest</option>'   + semOpts;
  stuSel.innerHTML  = '<option value="">All students</option>' +
    allStudents().map(s=>`<option>${s.name}</option>`).join('');

  // Restore previous selections
  if (prevFrom) fromSel.value = prevFrom;
  if (prevTo)   toSel.value   = prevTo;
  if (prevStu)  stuSel.value  = prevStu;

  // Default to-filter to current semester if nothing set
  if (!toSel.value && allSems.includes(curSem)) toSel.value = curSem;

  // Filter presentations
  let list = [...STORE.presentations];
  const fromKey = fromSel.value ? semKey(fromSel.value) : null;
  const toKey   = toSel.value   ? semKey(toSel.value)   : null;
  if (fromKey) list = list.filter(p => semKey(p.semester) >= fromKey);
  if (toKey)   list = list.filter(p => semKey(p.semester) <= toKey);
  if (stuSel.value) list = list.filter(p => p.student === stuSel.value);
  list.sort((a,b) => b.date.localeCompare(a.date));

  // Coverage — semesters in current filter range
  const inRangeSems = allSems.filter(s => {
    const k = semKey(s);
    return (!fromKey || k >= fromKey) && (!toKey || k <= toKey);
  });
  const presentedInRange = new Set(
    STORE.presentations
      .filter(p => inRangeSems.includes(p.semester))
      .map(p=>p.student)
  );
  const activeStudents = students().sort((a,b)=>lastName(a.name).localeCompare(lastName(b.name)));
  const hasPresented = activeStudents.filter(s=>presentedInRange.has(s.name));
  const notYet       = activeStudents.filter(s=>!presentedInRange.has(s.name));

  const rangeLabel = fromSel.value && toSel.value && fromSel.value !== toSel.value
    ? `${fromSel.value} – ${toSel.value}`
    : toSel.value || fromSel.value || 'All time';

  const coverageHtml = `
    <div style="margin-bottom:10px;font-size:13px;font-weight:600">${rangeLabel}: ${presentedInRange.size}/${activeStudents.length} active students have presented</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      ${hasPresented.length ? `<div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--green);margin-bottom:4px">✓ Presented (${hasPresented.length})</div>
        ${hasPresented.map(s=>`<span style="display:inline-block;background:#d4edda;color:var(--green);border-radius:4px;padding:2px 8px;font-size:12px;margin:2px">${s.name}</span>`).join('')}
      </div>` : ''}
      ${notYet.length ? `<div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--red);margin-bottom:4px">✗ Not Yet (${notYet.length})</div>
        ${notYet.map(s=>`<span style="display:inline-block;background:#fde8e6;color:var(--red);border-radius:4px;padding:2px 8px;font-size:12px;margin:2px">${s.name}</span>`).join('')}
      </div>` : ''}
    </div>`;
  document.getElementById('pres-coverage').innerHTML = coverageHtml;

  document.getElementById('pres-tbody').innerHTML = list.map(p=>`<tr>
    <td>${fmtDate(p.date)}</td><td>${p.semester}</td><td><strong>${p.student}</strong></td>
    <td style="font-size:12px">${p.notes||''}</td>
    <td><button class="btn btn-danger btn-xs" onclick="delPres('${p.id}')">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="5" class="text-muted" style="padding:16px">No presentations in this range.</td></tr>';
}
window.delPres=function(id){STORE.presentations=STORE.presentations.filter(p=>p.id!==id);save();renderPresentations();};

// ═══════════════════════════════════
// ADMISSIONS
// ═══════════════════════════════════
const ADM_STAGES=['Under Review','Shortlisted','Interview Scheduled','Interviewed','DMA Form Needed','Offer Extended','Admitted','Declined'];
function renderAdmissions() {
  document.getElementById('app-degree').innerHTML=STORE.degrees.map(d=>`<option>${d}</option>`).join('');
  const cycSel=document.getElementById('adm-cycle-sel');
  cycSel.innerHTML=STORE.admCycles.map(c=>`<option value="${c.id}"${c.id===STORE.settings.currentAdmCycle?' selected':''}>${c.name}</option>`).join('');
  renderAdmKanban(); renderAdmTable();
  // DMA form visibility
  updateDMAVisibility();
}
function updateDMAVisibility() {
  const deg=document.getElementById('app-degree').value;
  document.getElementById('dma-form-row').style.display=deg==='DMA'?'flex':'none';
}
function renderAdmKanban() {
  const apps=STORE.applicants.filter(a=>a.cycle===STORE.settings.currentAdmCycle);
  document.getElementById('adm-kanban').innerHTML=ADM_STAGES.map(stage=>{
    const inStage=apps.filter(a=>a.stage===stage);
    return `<div style="min-width:140px;flex-shrink:0">
      <div style="background:var(--navy);color:var(--white);font-size:10px;font-weight:600;letter-spacing:.5px;padding:5px 8px;border-radius:4px 4px 0 0;text-align:center">${stage}</div>
      <div style="background:var(--gray-100);border:1px solid var(--gray-200);border-top:none;min-height:60px;padding:5px;border-radius:0 0 4px 4px">
        ${inStage.map(a=>`<div style="background:var(--white);border:1px solid var(--gray-200);border-radius:4px;padding:5px 7px;margin-bottom:5px;cursor:pointer" onclick="editApplicant('${a.id}')">
          <div style="font-size:12px;font-weight:600">${a.name}</div><div style="font-size:10px;color:var(--gray-400)">${a.degree}</div></div>`).join('')}
      </div></div>`;
  }).join('');
}
function renderAdmTable() {
  const apps=STORE.applicants.filter(a=>a.cycle===STORE.settings.currentAdmCycle);
  document.getElementById('adm-tbody').innerHTML=apps.map(a=>`<tr>
    <td><strong>${a.name}</strong></td><td><span class="pill pill-navy">${a.degree}</span></td>
    <td><select style="font-size:12px" onchange="updateApplicantStage('${a.id}',this.value)">
      ${ADM_STAGES.map(s=>`<option${s===a.stage?' selected':''}>${s}</option>`).join('')}</select></td>
    <td>${a.focus||''}</td>
    <td>${a.degree==='DMA'&&a.dma?`<span class="pill pill-gold">${a.dma}</span>`:''}</td>
    <td style="max-width:200px"><div style="font-size:12px">${a.notes||''}</div></td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-outline btn-xs" onclick="editApplicant('${a.id}')">✎</button>
      <button class="btn btn-danger btn-xs" onclick="delApplicant('${a.id}')">✕</button>
    </td>
  </tr>`).join('')||'<tr><td colspan="7" class="text-muted" style="padding:16px">No applicants in this cycle.</td></tr>';
}
window.updateApplicantStage=function(id,stage){const a=STORE.applicants.find(a=>a.id===id);if(a){a.stage=stage;save();renderAdmissions();}};
window.delApplicant=function(id){STORE.applicants=STORE.applicants.filter(a=>a.id!==id);save();renderAdmissions();};
window.editApplicant=function(id) {
  const a=STORE.applicants.find(a=>a.id===id); if(!a) return;
  document.getElementById('modal-app-title').textContent='Edit Applicant';
  document.getElementById('app-id').value=a.id;
  document.getElementById('app-degree').innerHTML=STORE.degrees.map(d=>`<option${d===a.degree?' selected':''}>${d}</option>`).join('');
  document.getElementById('app-name').value=a.name;
  document.getElementById('app-focus').value=a.focus||'';
  document.getElementById('app-stage').value=a.stage;
  document.getElementById('app-dma').value=a.dma||'';
  document.getElementById('app-notes').value=a.notes||'';
  updateDMAVisibility();
  openModal('modal-applicant');
};

// ═══════════════════════════════════
// SETTINGS
// ═══════════════════════════════════
function renderSettings() {
  const sems=semOpts();
  const semSel=document.getElementById('setting-current-sem');
  semSel.innerHTML=sems.map(s=>`<option${s===STORE.settings.currentSemester?' selected':''}>${s}</option>`).join('');
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const startSel=document.getElementById('setting-ay-start');
  const endSel=document.getElementById('setting-ay-end');
  startSel.innerHTML=months.map((m,i)=>`<option value="${i+1}"${i+1===STORE.settings.academicYearStart?' selected':''}>${m}</option>`).join('');
  endSel.innerHTML=months.map((m,i)=>`<option value="${i+1}"${i+1===STORE.settings.academicYearEnd?' selected':''}>${m}</option>`).join('');
  document.getElementById('setting-meeting-name').value=STORE.settings.meetingName||'Comp/Theory Area Meeting';
  const mr=STORE.settings.meetingRecurrence;
  document.getElementById('setting-mr-enabled').value=mr.enabled?'1':'0';

  // Meeting calendar targets
  const mc = STORE.settings.meetingCalendars || {};
  const primaryCk = document.getElementById('mtg-cal-primary');
  if (primaryCk) primaryCk.checked = mc.primary !== false;
  // Named calendar checkboxes for meeting targets
  const namedCals = (STORE.settings.signups && STORE.settings.signups.namedCals) || [];
  const namedChecksEl = document.getElementById('mtg-named-cal-checks');
  if (namedChecksEl && namedCals.length) {
    namedChecksEl.innerHTML = '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gray-600);margin-bottom:8px">Named Calendars</div>' +
      namedCals.map(c => `<label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" class="mtg-named-cal-ck" data-id="${c.id}" ${(mc.named||[]).includes(c.id)?'checked':''} style="width:16px;height:16px;accent-color:var(--navy)">
        <div><strong>${c.nick}</strong></div>
      </label>`).join('');
  }
  // Faculty invite list
  renderFacultyInviteList();
  document.getElementById('setting-mr-dow').value=mr.dayOfWeek;
  document.getElementById('setting-mr-occ').value=mr.weekOccurrence;
  document.getElementById('setting-mr-time').value=mr.time||'';
  document.getElementById('setting-mr-timeend').value=mr.timeEnd||'';
  document.getElementById('setting-mr-loc').value=mr.location||'';
  document.getElementById('setting-mr-remdays').value=mr.agendaReminderDays||7;
  renderDegreesList();
  updateHeader();
}
function renderDegreesList() {
  document.getElementById('degrees-list').innerHTML=STORE.degrees.map((d,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100)">
      <span class="pill pill-navy">${d}</span><div class="spacer"></div>
      ${i>=6?`<button class="btn btn-danger btn-xs" onclick="removeDegree(${i})">✕</button>`:''}
    </div>`).join('');
}
window.removeDegree=function(i){STORE.degrees.splice(i,1);save();renderDegreesList();};

function renderFacultyInviteList() {
  const el = document.getElementById('faculty-invite-list');
  if (!el) return;
  const list = STORE.settings.facultyInviteList || [];
  if (!list.length) { el.innerHTML = '<div class="text-muted mb-8">No emails added yet.</div>'; return; }
  el.innerHTML = list.map((item, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 12px;background:var(--gray-100);border-radius:6px;margin-bottom:6px">
      <div style="flex:1;font-size:13px">${item.name ? `<strong>${item.name}</strong> · ` : ''}<span style="font-family:'Source Code Pro',monospace;font-size:12px">${item.email}</span></div>
      <button class="btn btn-danger btn-xs" onclick="removeInviteEmail(${i})">✕</button>
    </div>`).join('');
}
window.removeInviteEmail = function(i) {
  if (!STORE.settings.facultyInviteList) return;
  STORE.settings.facultyInviteList.splice(i, 1);
  save(); renderFacultyInviteList();
};

// ═══════════════════════════════════
// SETTINGS POPULATION
// ═══════════════════════════════════
function populateSettings() { updateHeader(); }

// ═══════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════
function setupEventHandlers() {

  // Calendar events
  document.getElementById('btn-add-event').addEventListener('click',()=>openModal('modal-event'));
  document.getElementById('btn-save-event').addEventListener('click',async()=>{
    const title=document.getElementById('ev-title').value.trim();
    const date=document.getElementById('ev-date').value;
    if(!title||!date) return showToast('Title and date required.','error');
    const time=document.getElementById('ev-time').value, timeEnd=document.getElementById('ev-time-end').value;
    const cat=document.getElementById('ev-cat').value, notes=document.getElementById('ev-notes').value;
    const gcalId=await calCreateEvent(title,date,time,timeEnd,notes,cat);
    STORE.events.push({id:uid(),title,date,time,timeEnd,cat,notes,gcalId});
    save(); closeModal('modal-event');
    ['ev-title','ev-date','ev-time','ev-time-end','ev-notes'].forEach(f=>document.getElementById(f).value='');
    renderCalendar();
  });
  window.delEvent=async function(id){
    const e=STORE.events.find(e=>e.id===id);
    if(e&&e.gcalId) await calDeleteEvent(e.gcalId);
    STORE.events=STORE.events.filter(e=>e.id!==id);save();renderCalendar();
  };

  // Tasks
  document.getElementById('btn-add-task').addEventListener('click',()=>{
    _editTaskId=null;
    document.getElementById('modal-task-title').textContent='Add Task / Reminder';
    ['task-title','task-due','task-notes'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('task-urg').value='med';
    document.getElementById('task-freq').value='Once';
    openModal('modal-task');
  });
  document.getElementById('btn-save-task').addEventListener('click',async()=>{
    const title=document.getElementById('task-title').value.trim();
    if(!title) return showToast('Title required.','error');
    const due=document.getElementById('task-due').value;
    const urg=document.getElementById('task-urg').value;
    const freq=document.getElementById('task-freq').value;
    const notes=document.getElementById('task-notes').value;
    const emailTemplate=(document.getElementById('task-email-tpl')||{value:''}).value.trim();
    if(_editTaskId) {
      const t=STORE.tasks.find(t=>t.id===_editTaskId);
      if(t){
        const dueDateChanged=t.due!==due, titleChanged=t.title!==title;
        Object.assign(t,{title,due,urg,freq,notes,emailTemplate:emailTemplate||t.emailTemplate||''});
        // Sync to Google Calendar when title or due date changed
        if(due && (dueDateChanged||titleChanged)) {
          if(t.gcalId) await calDeleteEvent(t.gcalId);
          t.gcalId = await calCreateReminder(title,due,notes,urg);
        } else if(!due && t.gcalId) {
          await calDeleteEvent(t.gcalId);
          t.gcalId=null;
        }
      }
    } else {
      const gcalId=due?await calCreateReminder(title,due,notes,urg):null;
      STORE.tasks.push({id:uid(),title,due,urg,freq,notes,emailTemplate:emailTemplate||'',done:false,gcalId});
    }
    save(); closeModal('modal-task'); _editTaskId=null; renderTasks();
  });
  document.getElementById('tasks-filter').addEventListener('change',renderTasks);
  document.getElementById('btn-reset-tasks').addEventListener('click',()=>{
    if(confirm('Reset ALL recurring tasks to Pending?\n\nNote: normally tasks auto-generate the next instance when marked done. Use this only if you need a manual reset.')) {
      STORE.tasks.filter(t=>t.freq!=='Once').forEach(t=>{t.done=false;}); save(); renderTasks();
    }
  });

  // Meetings
  document.getElementById('btn-add-meeting').addEventListener('click',()=>{
    // Clear edit state for a fresh add
    document.getElementById('modal-meeting-title').textContent='Add One-Off Meeting';
    document.getElementById('mtg-edit-id').value='';
    ['mtg-date','mtg-time','mtg-time-end','mtg-location','mtg-notes'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('mtg-remind-days').value='7';
    openModal('modal-meeting');
  });
  document.getElementById('btn-save-meeting').addEventListener('click',async()=>{
    const date=document.getElementById('mtg-date').value;
    if(!date) return showToast('Date required.','error');
    const time=document.getElementById('mtg-time').value;
    const timeEnd=document.getElementById('mtg-time-end').value;
    const location=document.getElementById('mtg-location').value;
    const remindDays=parseInt(document.getElementById('mtg-remind-days').value)||7;
    const notes=document.getElementById('mtg-notes').value;
    const mtgName=STORE.settings.meetingName||'Comp/Theory Area Meeting';
    const editId=document.getElementById('mtg-edit-id').value;
    const targets=buildMeetingTargets();

    if(editId) {
      const m=STORE.meetings.find(m=>m.id===editId);
      if(!m) return;
      const oldDate = m.date;
      m.date=date; m.time=time; m.timeEnd=timeEnd;
      m.location=location; m.remindDays=remindDays; m.notes=notes;
      const res=await calSyncMulti(m.gcalIds||{}, mtgName, date, time, timeEnd, notes||location, 'Meeting', targets);
      m.gcalIds={}; res.forEach(r=>{ if(r.gcalId) m.gcalIds[r.label]=r.gcalId; });
      m.gcalId=m.gcalIds['Primary Calendar']||null;
      // If the date changed, update the agenda-solicitation task too
      if(oldDate !== date) {
        const task = findMeetingTask(oldDate, mtgName);
        if(task) {
          // Delete old calendar reminder
          if(task.gcalId) await calDeleteEvent(task.gcalId);
          // Compute new reminder date
          const newRemDate=new Date(date+'T00:00:00');
          newRemDate.setDate(newRemDate.getDate()-remindDays);
          const newRemDateStr=newRemDate.toISOString().slice(0,10);
          // Update task
          task.title=`Solicit agenda items for ${mtgName} on `+fmtDate(date);
          task.due=newRemDateStr;
          task.gcalId=null;
          // Re-sync to calendar
          const newRemGcalId=await calCreateReminder(task.title, newRemDateStr,'','med');
          task.gcalId=newRemGcalId;
        }
      }
      save(); closeModal('modal-meeting'); renderMeetings();
    } else {
      const res=await calCreateMulti(mtgName, date, time, timeEnd, notes||location, 'Meeting', targets);
      const gcalIds={}; res.forEach(r=>{ if(r.gcalId) gcalIds[r.label]=r.gcalId; });
      STORE.meetings.push({id:uid(),date,time,timeEnd,location,remindDays,notes,
        gcalId:gcalIds['Primary Calendar']||null, gcalIds, generated:false, minutes:''});
      const remDate=new Date(date+'T00:00:00'); remDate.setDate(remDate.getDate()-remindDays);
      const remDateStr=remDate.toISOString().slice(0,10);
      const remGcalId=await calCreateReminder(`Solicit agenda items for ${mtgName} on `+fmtDate(date),remDateStr,'','med');
      STORE.tasks.push({id:uid(),title:`Solicit agenda items for ${mtgName} on `+fmtDate(date),due:remDateStr,urg:'med',freq:'Once',notes:'',done:false,gcalId:remGcalId});
      save(); closeModal('modal-meeting'); renderMeetings(); renderTasks();
    }
  });
  document.getElementById('btn-generate-meetings').addEventListener('click',async()=>{
    const yearStr=prompt('Generate meetings for academic year starting in (enter year, e.g. 2026):','2026');
    const year=parseInt(yearStr);
    if(!year||isNaN(year)) return;
    const before=STORE.meetings.length;
    autoGenerateMeetings(year, false);
    const added=STORE.meetings.length-before;
    const mr=STORE.settings.meetingRecurrence;
    const mtgName=STORE.settings.meetingName||'Comp/Theory Area Meeting';
    // For each newly generated meeting, create agenda-solicitation task
    const newMeetings=STORE.meetings.slice(before);
    for(const m of newMeetings){
      const remDate=new Date(m.date+'T00:00:00');
      remDate.setDate(remDate.getDate()-(mr.agendaReminderDays||7));
      const remDateStr=remDate.toISOString().slice(0,10);
      const taskTitle=`Solicit agenda items for ${mtgName} on ${fmtDate(m.date)}`;
      if(!STORE.tasks.find(t=>t.title===taskTitle)){
        const gcalId=await calCreateReminder(taskTitle,remDateStr,'','med');
        STORE.tasks.push({id:uid(),title:taskTitle,due:remDateStr,urg:'med',freq:'Once',notes:'',done:false,gcalId});
      }
    }
    save(); renderMeetings();
    showToast(`${added} meetings generated, agenda reminders created.`,'success');
  });

  // Agenda
  document.getElementById('btn-add-agenda-item').addEventListener('click',()=>openModal('modal-agenda'));
  document.getElementById('btn-save-agenda').addEventListener('click',()=>{
    const text=document.getElementById('ai-text').value.trim();
    if(!text) return showToast('Description required.','error');
    STORE.agendaItems.push({id:uid(),text,submitter:document.getElementById('ai-submitter').value,priority:document.getElementById('ai-priority').value,done:false,date:today()});
    save(); closeModal('modal-agenda');
    ['ai-text','ai-submitter'].forEach(f=>document.getElementById(f).value='');
    renderAgendaItems();
  });
  document.getElementById('btn-export-agenda').addEventListener('click',()=>{
    const active=STORE.agendaItems.filter(a=>!a.done);
    const high=active.filter(a=>a.priority==='High'),normal=active.filter(a=>a.priority==='Normal'),info=active.filter(a=>a.priority==='Informational');
    let text='UF COMPOSITION & THEORY AREA — FACULTY MEETING AGENDA\nDate: ___________________\n\n';
    if(high.length){text+='HIGH PRIORITY\n';high.forEach((a,i)=>{text+=`${i+1}. ${a.text}`;text+='\n';});text+='\n';}
    if(normal.length){text+='AGENDA ITEMS\n';normal.forEach((a,i)=>{text+=`${i+1}. ${a.text}`;text+='\n';});text+='\n';}
    if(info.length){text+='FOR INFORMATION\n';info.forEach((a,i)=>{text+=`${i+1}. ${a.text}`;text+='\n';});}
    const blob=new Blob([text],{type:'text/plain'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Agenda_'+today()+'.txt';a.click();
  });

  // Rotations
  document.getElementById('btn-new-scenario').addEventListener('click',()=>openModal('modal-scenario'));
  document.getElementById('btn-save-scenario').addEventListener('click',()=>{
    const name=document.getElementById('sc-name').value.trim();
    if(!name) return showToast('Name required.','error');
    const base=document.getElementById('sc-base').value;
    const courses=(base==='26/27'?ROT_2627:base==='27/28'?ROT_2728:[]).map(r=>({...r}));
    STORE.rotationScenarios.push({id:uid(),name,notes:document.getElementById('sc-notes').value,courses,created:today()});
    save(); closeModal('modal-scenario'); renderScenarios();
  });

  // GTA
  document.getElementById('gta-sem-select').addEventListener('change',renderGTATable);
  const btnAddDuty=document.getElementById('btn-add-duty-role');
  if(btnAddDuty) btnAddDuty.addEventListener('click',()=>{
    if(!STORE.settings.gtaDuties) STORE.settings.gtaDuties=getDefaultGTADuties();
    STORE.settings.gtaDuties.push({role:'New Duty Section',text:'- '});
    save(); renderGTADuties();
  });
  document.getElementById('gta-hist-filter').addEventListener('change',renderGTAHistory);
  document.getElementById('btn-add-gta').addEventListener('click',()=>{
    const sel=document.getElementById('gta-name-sel');
    const sem=document.getElementById('gta-sem-select').value||STORE.settings.currentSemester;
    // Only show students who were active during this semester and have GTA hours configured
    const activeThen=studentsActiveDuringSemester(sem).filter(s=>s.hours>0);
    sel.innerHTML=activeThen.map(s=>`<option>${s.name}</option>`).join('');
    if(!activeThen.length) sel.innerHTML='<option value="">No GTA students for this semester</option>';
    document.getElementById('gta-sem-inp').value=sem;
    openModal('modal-gta');
  });
  document.getElementById('btn-save-gta').addEventListener('click',()=>{
    const course=document.getElementById('gta-course').value.trim();
    if(!course) return showToast('Course required.','error');
    STORE.gtaAssignments.push({id:uid(),gta:document.getElementById('gta-name-sel').value,semester:document.getElementById('gta-sem-inp').value,course,hours:parseInt(document.getElementById('gta-hours').value)||0,supervisor:document.getElementById('gta-super').value,tor:document.getElementById('gta-tor').value==='1'});
    save(); closeModal('modal-gta');
    ['gta-course','gta-super'].forEach(f=>document.getElementById(f).value='');
    renderGTATable();
  });

  // Studio
  document.getElementById('studio-sem-select').addEventListener('change',renderStudioTable);
  document.getElementById('studio-hist-filter').addEventListener('change',renderStudioHistory);
  document.getElementById('btn-add-studio').addEventListener('click',()=>{
    document.getElementById('stu-sel-studio').innerHTML=students().map(s=>`<option>${s.name}</option>`).join('');
    document.getElementById('fac-sel-studio').innerHTML=compFaculty().map(f=>`<option>${f.name}</option>`).join('');
    document.getElementById('studio-sem-inp').value=document.getElementById('studio-sem-select').value||STORE.settings.currentSemester;
    openModal('modal-studio');
  });
  document.getElementById('btn-save-studio').addEventListener('click',()=>{
    const student=document.getElementById('stu-sel-studio').value;
    const faculty=document.getElementById('fac-sel-studio').value;
    const sem=document.getElementById('studio-sem-inp').value;
    const isChair=document.getElementById('studio-chair-sel').value==='1';
    STORE.studioAssignments.push({id:uid(),student,faculty,semester:sem,isChair,notes:document.getElementById('studio-notes').value});
    if(isChair){const stu=STORE.people.find(p=>p.name===student&&p.type==='student');if(stu)stu.chair=faculty;}
    save(); closeModal('modal-studio'); document.getElementById('studio-notes').value=''; renderStudioTable();
  });

  // Students
  document.getElementById('stu-search').addEventListener('input',renderStudents);
  document.getElementById('stu-deg-filter').addEventListener('change',renderStudents);
  document.getElementById('alumni-search').addEventListener('input',renderAlumni);
  document.getElementById('alumni-deg-filter').addEventListener('change',renderAlumni);
  document.getElementById('alumni-exit-filter').addEventListener('change',renderAlumni);
  document.getElementById('btn-add-student').addEventListener('click',()=>openPersonModal('new-student'));

  // Faculty
  document.getElementById('fac-area-filter').addEventListener('change',renderFaculty);
  document.getElementById('btn-add-faculty').addEventListener('click',()=>openPersonModal('new-faculty'));

  // Person modal — graduate/deactivate/reactivate toggle
  document.getElementById('btn-toggle-active').addEventListener('click',()=>{
    const id=document.getElementById('person-id').value;
    if(!id) return;
    const p=STORE.people.find(p=>p.id===id);
    if(!p) return;
    const isActive = p.active !== false;
    const type = p.type;
    if(isActive) {
      if(type==='student'){
        const exitType=document.getElementById('person-exit-type').value||'Graduated';
        const exitYear=document.getElementById('person-exit-year').value||new Date().getFullYear().toString();
        p.active=false; p.exitType=exitType; p.exitYear=exitYear;
        p.notes=document.getElementById('person-notes').value;
        save(); closeModal('modal-person'); renderStudents();
        showToast(`${p.name} moved to Alumni.`,'success');
      } else {
        p.active=false;
        p.notes=document.getElementById('person-notes').value;
        save(); closeModal('modal-person'); renderFaculty();
        showToast(`${p.name} archived.`,'success');
      }
    } else {
      p.active=true;
      if(type==='student'){p.exitType=''; p.exitYear='';}
      save(); closeModal('modal-person');
      type==='student'?renderStudents():renderFaculty();
      showToast(`${p.name} reactivated.`,'success');
    }
  });

  // Person modal save
  document.getElementById('btn-save-person').addEventListener('click',()=>{
    const id=document.getElementById('person-id').value;
    const type=document.getElementById('person-type').value;
    let p=id?STORE.people.find(p=>p.id===id):null;
    if(!p){p={id:uid(),type,active:true};STORE.people.push(p);}
    if(type==='student'){
      p.name=document.getElementById('person-name').value.trim();
      p.degree=document.getElementById('person-degree').value;
      p.entry=document.getElementById('person-entry').value;
      p.grad=document.getElementById('person-grad').value;
      p.status=document.getElementById('person-status').value;
      p.chair=document.getElementById('person-chair').value;
      p.hours=parseInt(document.getElementById('person-hours').value)||0;
      p.fellow=document.getElementById('person-fellow').value==='1';
      // Preserve exit info if already set
      if(p.active===false){
        p.exitYear=document.getElementById('person-exit-year').value;
        p.exitType=document.getElementById('person-exit-type').value;
      }
    } else {
      p.name=document.getElementById('fac-name-p').value.trim();
      p.title=document.getElementById('fac-title-p').value;
      p.areas=[];
      if(document.getElementById('fac-area-comp').checked) p.areas.push('Composition');
      if(document.getElementById('fac-area-theory').checked) p.areas.push('Theory');
      if(document.getElementById('fac-area-aural').checked) p.areas.push('Aural Skills');
      p.min=parseInt(document.getElementById('fac-min-p').value)||0;
      p.max=parseInt(document.getElementById('fac-max-p').value)||0;
    }
    p.notes=document.getElementById('person-notes').value;
    if(!p.name){showToast('Name required.','error');return;}
    save(); closeModal('modal-person');
    type==='student'?renderStudents():renderFaculty();
  });
  document.getElementById('btn-delete-person').addEventListener('click',()=>{
    const id=document.getElementById('person-id').value;
    if(!id||!confirm('Permanently delete this person? All their data will be lost.\n\nConsider using "Graduate / Deactivate" instead to preserve their history.')) return;
    STORE.people=STORE.people.filter(p=>p.id!==id);
    save(); closeModal('modal-person');
    const type=document.getElementById('person-type').value;
    type==='student'?renderStudents():renderFaculty();
  });

  // Presentations
  ['pres-from-filter','pres-to-filter','pres-stu-filter'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.addEventListener('change',renderPresentations);
  });
  const btnPresClear=document.getElementById('btn-pres-clear-filter');
  if(btnPresClear) btnPresClear.addEventListener('click',()=>{
    ['pres-from-filter','pres-to-filter','pres-stu-filter'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    renderPresentations();
  });
  document.getElementById('pres-stu-filter').addEventListener('change',renderPresentations);
  document.getElementById('btn-add-pres').addEventListener('click',()=>{
    document.getElementById('pres-student').innerHTML=students().map(s=>`<option>${s.name}</option>`).join('');
    document.getElementById('pres-date').value=today();
    openModal('modal-pres');
  });
  document.getElementById('btn-save-pres').addEventListener('click',()=>{
    const date=document.getElementById('pres-date').value;
    const sem=document.getElementById('pres-sem').value.trim();
    if(!date||!sem) return showToast('Date and semester required.','error');
    STORE.presentations.push({id:uid(),student:document.getElementById('pres-student').value,date,semester:sem,notes:document.getElementById('pres-notes').value});
    save(); closeModal('modal-pres');
    ['pres-sem','pres-notes'].forEach(f=>document.getElementById(f).value='');
    renderPresentations();
  });

  // Admissions
  document.getElementById('adm-cycle-sel').addEventListener('change',function(){STORE.settings.currentAdmCycle=this.value;save();renderAdmissions();});
  document.getElementById('btn-add-adm-cycle').addEventListener('click',()=>{
    const name=prompt('New admissions cycle name (e.g. 2027-28 Admissions):');
    if(!name) return;
    const id=uid(); STORE.admCycles.push({id,name,notes:''});
    STORE.settings.currentAdmCycle=id; save(); renderAdmissions();
  });
  document.getElementById('btn-add-applicant').addEventListener('click',()=>{
    document.getElementById('modal-app-title').textContent='Add Applicant';
    document.getElementById('app-id').value='';
    document.getElementById('app-degree').innerHTML=STORE.degrees.map(d=>`<option>${d}</option>`).join('');
    ['app-name','app-focus','app-notes'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('app-dma').value='';
    updateDMAVisibility();
    openModal('modal-applicant');
  });
  document.getElementById('app-degree').addEventListener('change',updateDMAVisibility);
  document.getElementById('btn-save-applicant').addEventListener('click',()=>{
    const name=document.getElementById('app-name').value.trim();
    if(!name) return showToast('Name required.','error');
    const id=document.getElementById('app-id').value;
    const degree=document.getElementById('app-degree').value;
    const data={name,degree,stage:document.getElementById('app-stage').value,focus:document.getElementById('app-focus').value,dma:degree==='DMA'?document.getElementById('app-dma').value:'',notes:document.getElementById('app-notes').value,cycle:STORE.settings.currentAdmCycle};
    if(id){const a=STORE.applicants.find(a=>a.id===id);if(a)Object.assign(a,data);}
    else STORE.applicants.push({id:uid(),...data});
    save(); closeModal('modal-applicant'); renderAdmissions();
  });

  // Settings
  document.getElementById('btn-save-semester').addEventListener('click',()=>{
    STORE.settings.currentSemester=document.getElementById('setting-current-sem').value;
    save(); updateHeader(); showToast('Current semester updated.','success');
  });
  document.getElementById('btn-save-ay').addEventListener('click',()=>{
    STORE.settings.academicYearStart=parseInt(document.getElementById('setting-ay-start').value);
    STORE.settings.academicYearEnd=parseInt(document.getElementById('setting-ay-end').value);
    save(); showToast('Academic year bounds saved.','success');
  });

  // Meeting calendar targets save
  const btnSaveMtgCals = document.getElementById('btn-save-mtg-cals');
  if (btnSaveMtgCals) btnSaveMtgCals.addEventListener('click', () => {
    if (!STORE.settings.meetingCalendars) STORE.settings.meetingCalendars = {};
    const mc = STORE.settings.meetingCalendars;
    mc.primary = document.getElementById('mtg-cal-primary').checked;
    mc.ufl = false; // UFL uses Exchange — invitations handled via .ics file
    mc.sendInvites = false;
    mc.named = [...document.querySelectorAll('.mtg-named-cal-ck:checked')].map(el => el.dataset.id);
    save(); showToast('Meeting calendar targets saved.', 'success');
  });
  // Faculty invite list
  const btnAddInvite = document.getElementById('btn-add-invite');
  if (btnAddInvite) btnAddInvite.addEventListener('click', () => {
    const email = document.getElementById('new-invite-email').value.trim();
    const name  = document.getElementById('new-invite-name').value.trim();
    if (!email || !email.includes('@')) { showToast('Valid email required.', 'error'); return; }
    if (!STORE.settings.facultyInviteList) STORE.settings.facultyInviteList = [];
    if (STORE.settings.facultyInviteList.find(e => e.email === email)) { showToast('Already in list.', 'info'); return; }
    STORE.settings.facultyInviteList.push({ email, name });
    document.getElementById('new-invite-email').value = '';
    document.getElementById('new-invite-name').value = '';
    save(); renderFacultyInviteList();
  });
  const btnPullFaculty = document.getElementById('btn-pull-faculty-emails');
  if (btnPullFaculty) btnPullFaculty.addEventListener('click', () => {
    if (!STORE.settings.facultyInviteList) STORE.settings.facultyInviteList = [];
    // Pull email addresses from faculty records (stored in notes or a dedicated field)
    // Since faculty records don't have a dedicated email field yet, check notes for @ signs
    let added = 0;
    STORE.people.filter(p => p.type==='faculty' && p.active!==false).forEach(f => {
      // Check if email-like string in notes
      const emailMatch = (f.notes||'').match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      if (emailMatch) {
        const email = emailMatch[0];
        if (!STORE.settings.facultyInviteList.find(e => e.email === email)) {
          STORE.settings.facultyInviteList.push({ email, name: f.name });
          added++;
        }
      }
    });
    save(); renderFacultyInviteList();
    showToast(added ? `Added ${added} email${added!==1?'s':''} from faculty roster.` : 'No new emails found. Add email addresses to faculty notes fields first.', 'info');
  });
  document.getElementById('btn-save-meeting-name').addEventListener('click',()=>{
    STORE.settings.meetingName=document.getElementById('setting-meeting-name').value.trim()||'Comp/Theory Area Meeting';
    save(); showToast('Meeting name saved.','success');
  });
  document.getElementById('btn-save-mr').addEventListener('click',()=>{
    const mr=STORE.settings.meetingRecurrence;
    mr.enabled=document.getElementById('setting-mr-enabled').value==='1';
    mr.dayOfWeek=parseInt(document.getElementById('setting-mr-dow').value);
    mr.weekOccurrence=parseInt(document.getElementById('setting-mr-occ').value);
    mr.time=document.getElementById('setting-mr-time').value;
    mr.timeEnd=document.getElementById('setting-mr-timeend').value;
    mr.location=document.getElementById('setting-mr-loc').value;
    mr.agendaReminderDays=parseInt(document.getElementById('setting-mr-remdays').value)||7;
    save(); showToast('Recurrence rule saved. Go to Meetings → Generate from Recurrence Rule to apply.','success');
  });
  document.getElementById('btn-add-degree').addEventListener('click',()=>{
    const val=document.getElementById('new-degree').value.trim();
    if(!val||STORE.degrees.includes(val)) return;
    STORE.degrees.push(val); save(); document.getElementById('new-degree').value=''; renderDegreesList();
  });

  // ── DATA MANAGEMENT ──
  document.getElementById('btn-download-backup').addEventListener('click', () => {
    const json = JSON.stringify(STORE, null, 2);
    const dateStr = new Date().toISOString().slice(0,10);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `area_head_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Backup downloaded.', 'success');
  });

  document.getElementById('input-load-backup').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset the input so re-selecting the same file fires the event again
    e.target.value = '';
    if (!confirm(
      `Load backup from "${file.name}"?\n\n` +
      `This will REPLACE all current data — students, meetings, tasks, assignments, everything.\n\n` +
      `Make sure you've downloaded a backup of your current data first.\n\n` +
      `Click OK to continue.`
    )) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Basic validation — check it looks like our data
        if (typeof data !== 'object' || (!data.people && !data.students && !data.events)) {
          showToast('This file does not look like a valid dashboard backup.', 'error');
          return;
        }
        Object.assign(STORE, data);
        ensureStoreArrays();
        save();
        showToast('Backup loaded successfully. Refreshing…', 'success');
        setTimeout(() => renderPage('dashboard'), 800);
      } catch (err) {
        showToast('Could not read file — make sure it is a valid JSON backup.', 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-clear-data').addEventListener('click', () => {
    if (!confirm(
      'CLEAR ALL DATA?\n\n' +
      'This will permanently delete every student, faculty member, meeting, task, rotation, assignment, and all other records.\n\n' +
      'Download a backup first if you want to preserve your current data.\n\n' +
      'Click OK to clear all data.'
    )) return;
    // Second confirmation — belt and braces
    if (!confirm('Are you sure? This cannot be undone.\n\nClick OK to permanently clear all data.')) return;
    // Reset all arrays and settings to empty defaults
    STORE.people = [];
    STORE.gtaAssignments = [];
    STORE.studioAssignments = [];
    STORE.presentations = [];
    STORE.rotationScenarios = [];
    STORE.rot2627 = [];
    STORE.rot2728 = [];
    STORE.tasks = [];
    STORE.events = [];
    STORE.meetings = [];
    STORE.agendaItems = [];
    STORE.admCycles = [];
    STORE.applicants = [];
    STORE.degrees = ['Minor','BA','BM','MM','DMA','PhD'];
    STORE.settings = {
      currentSemester: 'Fall 2026',
      academicYearStart: 8,
      academicYearEnd: 4,
      meetingName: 'Comp/Theory Area Meeting',
      meetingRecurrence: {
        enabled: true, dayOfWeek: 5, weekOccurrence: 4,
        time: '3:00 PM', timeEnd: '4:00 PM',
        location: '', agendaReminderDays: 7,
      },
      meetingCalendars: { primary: true, named: [] },
      facultyInviteList: [],
      gtaDuties: null,
      currentAdmCycle: '',
      signups: {
        appsScriptUrl: '', adminKey: '', publicUrl: '',
        remindDays1: 7, remindDays2: 1,
        namedCals: [], cachedSessions: []
      },
      submissions: {},
      archive: {},
    };
    STORE._seeded = false;
    localStorage.removeItem('uf_area_head_v3');
    localStorage.removeItem('uf_area_head_backup');
    save();
    showToast('All data cleared.', 'success');
    renderPage('dashboard');
    renderSettings();
  });
}

// ═══════════════════════════════════
// MOBILE NAV
// ═══════════════════════════════════
window.toggleSidebar = function() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const isOpen = sb.classList.contains('open');
  sb.classList.toggle('open', !isOpen);
  ov.classList.toggle('open', !isOpen);
  document.body.style.overflow = !isOpen ? 'hidden' : '';
};
window.closeSidebar = function() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
};

window.bnavTo = function(page) {
  closeSidebar();
  document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.bnav-item[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  navTo(page);
};

// Keep bottom nav in sync when sidebar nav is used
const _origNavTo = window.navTo;
window.navTo = function(page) {
  _origNavTo(page);
  document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.bnav-item[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  closeSidebar();
};
