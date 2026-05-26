// ═══════════════════════════════════════════════════════
// CALENDAR RENDERING v4
// All data is internal (events, meetings, tasks).
// Google Calendar sync pushes TO Google; does not pull FROM it.
// ═══════════════════════════════════════════════════════

let miniCalDate = new Date();
let calViewDate = new Date();

// Aggregate all dated internal items for a given month prefix
function getItemsForMonth(y, m) {
  const prefix = `${y}-${String(m+1).padStart(2,'0')}`;
  const mtgName = (typeof STORE!=='undefined'&&STORE.settings&&STORE.settings.meetingName)||'Comp/Theory Area Meeting';
  const all = [
    ...(STORE.events||[]).filter(e=>e.date&&e.date.startsWith(prefix)).map(e=>({date:e.date,title:e.title,type:'event',time:e.time})),
    ...(STORE.meetings||[]).filter(m=>m.date&&m.date.startsWith(prefix)).map(m=>({date:m.date,title:mtgName,type:'meeting',time:m.time})),
    ...(STORE.tasks||[]).filter(t=>!t.done&&t.due&&t.due.startsWith(prefix)).map(t=>({date:t.due,title:'🔔 '+t.title,type:'task'})),
    // Sign-up sheet sessions cached from the Apps Script backend
    ...((STORE.settings&&STORE.settings.signups&&STORE.settings.signups.cachedSessions)||[])
      .filter(s=>s.date&&s.date.startsWith(prefix))
      .map(s=>({date:s.date,title:s.title,type:'signup',time:s.startTime})),
  ];
  return all;
}

function getEventDaysForMonth(y, m) {
  return new Set(getItemsForMonth(y, m).map(e => parseInt(e.date.slice(8))));
}

// ── MINI CALENDAR ──
function renderMiniCal() {
  const el = document.getElementById('mini-cal');
  if (!el) return;
  const y = miniCalDate.getFullYear(), m = miniCalDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = today();
  const eventDays = getEventDaysForMonth(y, m);

  // Build day→items map for tooltips
  const itemsByDay = {};
  getItemsForMonth(y, m).forEach(e => {
    const d = parseInt(e.date.slice(8));
    if (!itemsByDay[d]) itemsByDay[d] = [];
    itemsByDay[d].push(e);
  });

  const monthName = miniCalDate.toLocaleString('en-US', { month:'long', year:'numeric' });
  let html = `<div class="mini-cal-header">
    <button class="btn btn-outline btn-xs" onclick="miniCalNav(-1)">‹</button>
    <span>${monthName}</span>
    <button class="btn btn-outline btn-xs" onclick="miniCalNav(1)">›</button>
  </div><div class="mini-cal-grid">`;

  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => html += `<div class="day-label">${d}</div>`);
  for (let i = 0; i < firstDay; i++) html += `<div class="day other-month"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = ds === todayStr;
    const items = itemsByDay[d] || [];
    const tip = items.map(e=>e.title).join(', ');
    let cls = isToday ? 'today' : '';
    if (items.length) cls += ' has-event';
    // Show dots for different types
    const dots = [...new Set(items.map(e=>e.type))].map(t=>
      `<span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:${t==='meeting'?'var(--gold)':t==='task'?'var(--red)':t==='signup'?'#2d7a4f':'var(--blue)'};margin:0 1px"></span>`
    ).join('');
    html += `<div class="day ${cls}" title="${tip}">${d}${dots?`<div style="line-height:1">${dots}</div>`:''}</div>`;
  }
  html += '</div>';
  // Legend
  html += `<div style="display:flex;gap:10px;margin-top:8px;font-size:10px;color:var(--gray-600)">
    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);margin-right:3px"></span>Meeting</span>
    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--red);margin-right:3px"></span>Task</span>
    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--blue);margin-right:3px"></span>Event</span>
    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#2d7a4f;margin-right:3px"></span>Sign-Up</span>
  </div>`;
  el.innerHTML = html;
}

window.miniCalNav = function(dir) {
  miniCalDate = new Date(miniCalDate.getFullYear(), miniCalDate.getMonth() + dir, 1);
  renderMiniCal();
};

// ── FULL CALENDAR ──
function renderFullCal() {
  const y = calViewDate.getFullYear(), m = calViewDate.getMonth();
  document.getElementById('cal-month-label').textContent =
    calViewDate.toLocaleString('en-US', { month:'long', year:'numeric' });

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = today();
  const allItems = getItemsForMonth(y, m);

  const byDay = {};
  allItems.forEach(e => {
    const d = parseInt(e.date.slice(8));
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(e);
  });

  const typeColor = { event:'var(--blue)', meeting:'var(--gold)', task:'var(--red)', signup:'#2d7a4f' };

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d =>
    html += `<div style="background:var(--navy);color:var(--white);padding:6px;text-align:center;font-size:11px;font-weight:600">${d}</div>`
  );
  for (let i = 0; i < firstDay; i++)
    html += `<div style="background:var(--gray-100);min-height:80px;border:1px solid var(--gray-200)"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` === todayStr;
    const evs = byDay[d] || [];
    html += `<div style="min-height:80px;border:1px solid var(--gray-200);padding:5px;background:${isToday?'var(--gold-pale)':'var(--white)'}">
      <div style="font-size:12px;font-weight:${isToday?'700':'400'};color:${isToday?'var(--navy)':'var(--gray-600)'}">${d}</div>
      ${evs.slice(0,4).map(e=>`<div style="font-size:10px;background:${typeColor[e.type]||'var(--navy)'};color:var(--white);border-radius:3px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${e.title}">${e.time?e.time+' ':''}${e.title}</div>`).join('')}
      ${evs.length>4?`<div style="font-size:9px;color:var(--gray-400)">+${evs.length-4} more</div>`:''}
    </div>`;
  }
  html += '</div>';
  document.getElementById('full-cal-grid').innerHTML = html;
}

function renderEventsTable() {
  const sorted = [...(STORE.events||[])].sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('events-tbody').innerHTML = sorted.map(e => `<tr>
    <td>${fmtDate(e.date)}</td>
    <td><strong>${e.title}</strong>${e.time ? ' <span class="text-muted">'+e.time+'</span>' : ''}</td>
    <td><span class="pill pill-gray">${e.cat||''}</span></td>
    <td>${e.gcalId
      ? `<span class="pill pill-green" style="font-size:10px">✓ Synced</span>`
      : `<button class="btn-gcal btn-xs" onclick="syncEventToGcal('${e.id}')">Sync to GCal</button>`
    }</td>
    <td><button class="btn btn-danger btn-xs" onclick="delEvent('${e.id}')">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="5" class="text-muted" style="padding:16px">No manual events yet. Meetings and tasks appear on the calendar above automatically.</td></tr>';
}

window.syncEventToGcal = async function(id) {
  const e = (STORE.events||[]).find(e => e.id === id);
  if (!e) return;
  const gcalId = await calCreateEvent(e.title, e.date, e.time, e.timeEnd, e.notes, e.cat);
  if (gcalId) { e.gcalId = gcalId; save(); renderEventsTable(); }
};
