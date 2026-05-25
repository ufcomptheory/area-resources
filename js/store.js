// ═══════════════════════════════════════════════════════
// DATA STORE v3
// ═══════════════════════════════════════════════════════

const STORE = {
  // People (unified students + faculty)
  people: [],          // { id, type:'student'|'faculty', name, ...fields }

  // Academic
  gtaAssignments: [],
  studioAssignments: [],
  presentations: [],
  rotationScenarios: [],

  // Calendar / tasks
  tasks: [],           // unified reminders + recurring tasks
  events: [],          // one-off calendar events
  meetings: [],        // scheduled meetings (generated + one-off)

  // Agenda
  agendaItems: [],

  // Admissions
  admCycles: [],
  applicants: [],

  // Lookups
  degrees: ['Minor','BA','BM','MM','DMA','PhD'],

  // Global settings
  settings: {
    currentSemester: 'Fall 2026',
    academicYearStart: 8,   // August (month index 1-12)
    academicYearEnd: 4,     // April
    meetingRecurrence: {
      enabled: true,
      dayOfWeek: 5,         // 0=Sun … 5=Fri
      weekOccurrence: 4,    // 1st,2nd,3rd,4th,-1=last
      time: '3:00 PM',
      timeEnd: '4:00 PM',
      location: '',
      agendaReminderDays: 7,
    },
    currentAdmCycle: '',
  },

  _seeded: false,
};

function save() {
  localStorage.setItem('uf_area_head_v3', JSON.stringify(STORE));
  if (typeof _accessToken !== 'undefined' && _accessToken) driveSave();
}

function load() {
  // migrate from v2 key if present
  const raw = localStorage.getItem('uf_area_head_v3') || localStorage.getItem('uf_area_head_backup');
  if (raw) { try { const d = JSON.parse(raw); Object.assign(STORE, d); } catch(e){} }
  ensureStoreArrays();
}

function ensureStoreArrays() {
  ['people','gtaAssignments','studioAssignments','presentations',
   'rotationScenarios','tasks','events','meetings','agendaItems',
   'admCycles','applicants','degrees'].forEach(k => {
    if (!Array.isArray(STORE[k])) STORE[k] = [];
  });
  if (!STORE.settings) STORE.settings = {};
  if (!STORE.settings.meetingRecurrence) STORE.settings.meetingRecurrence = {};
  // defaults
  const ds = STORE.settings;
  if (!ds.currentSemester) ds.currentSemester = 'Fall 2026';
  if (!ds.academicYearStart) ds.academicYearStart = 8;
  if (!ds.academicYearEnd) ds.academicYearEnd = 4;
  if (!ds.currentAdmCycle) ds.currentAdmCycle = '';
  const mr = ds.meetingRecurrence;
  if (mr.enabled === undefined) mr.enabled = true;
  if (!mr.dayOfWeek && mr.dayOfWeek !== 0) mr.dayOfWeek = 5;
  if (!mr.weekOccurrence) mr.weekOccurrence = 4;
  if (!mr.time) mr.time = '3:00 PM';
  if (!mr.timeEnd) mr.timeEnd = '4:00 PM';
  if (!mr.location) mr.location = '';
  if (!mr.agendaReminderDays) mr.agendaReminderDays = 7;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
}
function today() { return new Date().toISOString().slice(0,10); }

// ── Helper: get Nth weekday of a month ──
// weekOccurrence: 1-4 or -1 (last)
function getNthWeekdayOfMonth(year, month, dayOfWeek, occurrence) {
  if (occurrence === -1) {
    // last occurrence
    const last = new Date(year, month + 1, 0);
    let d = last.getDate() - ((last.getDay() - dayOfWeek + 7) % 7);
    return new Date(year, month, d);
  }
  const first = new Date(year, month, 1);
  let d = ((dayOfWeek - first.getDay() + 7) % 7) + 1 + (occurrence - 1) * 7;
  return new Date(year, month, d);
}

// ── Generate recurring meeting dates for an academic year ──
function generateMeetingDates(yearStart) {
  const mr = STORE.settings.meetingRecurrence;
  if (!mr.enabled) return [];
  const startMonth = STORE.settings.academicYearStart - 1; // 0-indexed
  const endMonth = STORE.settings.academicYearEnd - 1;
  const dates = [];

  // Build list of months in the academic year
  // e.g. Aug(7) through Apr(3) of next year
  let months = [];
  let m = startMonth;
  while (true) {
    months.push({ year: m >= startMonth ? yearStart : yearStart + 1, month: m });
    if (m === endMonth) break;
    m = (m + 1) % 12;
    if (months.length > 12) break;
  }

  months.forEach(({ year, month }) => {
    const dt = getNthWeekdayOfMonth(year, month, mr.dayOfWeek, mr.weekOccurrence);
    if (dt) dates.push(dt.toISOString().slice(0,10));
  });
  return dates;
}

// ── Seed default data ──
function seedDefaults() {
  if (STORE._seeded) return;
  STORE._seeded = true;

  // Faculty (with areas)
  const facultyData = [
    { name:'Richards', areas:['Composition','Theory'], min:4, max:8, notes:'', title:'Professor' },
    { name:'Weiss', areas:['Composition','Theory'], min:4, max:8, notes:'', title:'Professor' },
    { name:'Lee', areas:['Composition'], min:4, max:8, notes:'', title:'Professor' },
    { name:'Tovar-Henao', areas:['Composition'], min:2, max:6, notes:'Electronic music', title:'Associate Professor' },
    { name:'Adams', areas:['Theory'], min:0, max:0, notes:'', title:'Professor' },
    { name:'Pellegrin', areas:['Theory','Composition'], min:0, max:4, notes:'', title:'Associate Professor' },
    { name:'Hart', areas:['Aural Skills'], min:0, max:0, notes:'', title:'Lecturer' },
    { name:'Lowe', areas:['Aural Skills'], min:0, max:0, notes:'', title:'Lecturer' },
    { name:'Wilson', areas:['Theory'], min:0, max:0, notes:'', title:'Lecturer' },
    { name:'Sain', areas:['Composition'], min:2, max:6, notes:'', title:'Assistant Professor' },
  ];
  facultyData.forEach(f => STORE.people.push({ id:uid(), type:'faculty', ...f }));

  // GTA Roster as people
  const gtaData = [
    { name:'Rafael Abdalla', degree:'PhD', entry:'2022', grad:'2027', chair:'Lee', status:'', notes:'', hours:20, fellow:true },
    { name:'Xiaowei Cao', degree:'PhD', entry:'2022', grad:'2027', chair:'Richards', status:'', notes:'', hours:20, fellow:true },
    { name:'Gabe Gekoskie', degree:'MM', entry:'2023', grad:'2025', chair:'', status:'', notes:'', hours:20, fellow:true },
    { name:'Anna Higgins', degree:'DMA', entry:'2022', grad:'2027', chair:'Richards', status:'', notes:'', hours:20, fellow:false },
    { name:'Ethan Kaminsky', degree:'MM', entry:'2025', grad:'2027', chair:'', status:'', notes:'new MM', hours:13, fellow:false },
    { name:'Jane Kozhevnikova', degree:'PhD', entry:'2022', grad:'2027', chair:'Richards', status:'', notes:'', hours:20, fellow:false },
    { name:'Yimian Mi', degree:'DMA', entry:'2022', grad:'2027', chair:'Richards', status:'', notes:'', hours:20, fellow:false },
    { name:'Hoang Duc Pho', degree:'PhD', entry:'2022', grad:'2028', chair:'Sain', status:'', notes:'', hours:20, fellow:true },
    { name:'Frank Sang', degree:'DMA', entry:'2022', grad:'2027', chair:'Richards', status:'', notes:'', hours:13, fellow:false },
    { name:'Yunmeng Su', degree:'DMA', entry:'2022', grad:'2027', chair:'Lee', status:'', notes:'', hours:20, fellow:false },
    { name:'Didi Gu', degree:'PhD', entry:'2025', grad:'2029', chair:'', status:'', notes:'new PhD; Quest', hours:20, fellow:false },
    { name:'Brandon Markson', degree:'DMA', entry:'2021', grad:'2026', chair:'Lee', status:'', notes:'Combined .25/.50', hours:13, fellow:false },
    { name:'Josh Beacom', degree:'PhD', entry:'2026', grad:'2030', chair:'Lee', status:'', notes:'new F26', hours:20, fellow:false },
    { name:'Nicolas Chalice', degree:'BM', entry:'2026', grad:'2030', chair:'Lee', status:'', notes:'new UG F26', hours:0, fellow:false },
    { name:'Nailah Clarke', degree:'BM', entry:'2026', grad:'2030', chair:'Weiss', status:'', notes:'new UG F26', hours:0, fellow:false },
    { name:'Michael Crumpton', degree:'BM', entry:'2026', grad:'2028', chair:'Lee', status:'transfer', notes:'', hours:0, fellow:false },
    { name:'Owen Nestor', degree:'BM', entry:'2026', grad:'2030', chair:'Weiss', status:'', notes:'new UG F26', hours:0, fellow:false },
    { name:'Noah Thomas', degree:'BM', entry:'2024', grad:'2028', chair:'Weiss', status:'', notes:'Comp 1', hours:0, fellow:false },
    { name:'Keith Wecker', degree:'PhD', entry:'2026', grad:'2031', chair:'', status:'', notes:'new PhD F26', hours:0, fellow:false },
    { name:'Xinrui Zhang', degree:'DMA', entry:'2026', grad:'2030', chair:'Weiss', status:'', notes:'new DMA F26', hours:0, fellow:false },
    { name:'Yang Wen', degree:'DMA', entry:'2026', grad:'2030', chair:'', status:'', notes:'new DMA F26', hours:0, fellow:false },
  ];
  gtaData.forEach(s => STORE.people.push({ id:uid(), type:'student', ...s }));

  // Admissions cycle
  const cycleId = uid();
  STORE.admCycles.push({ id:cycleId, name:'2026-27 Admissions', notes:'' });
  STORE.settings.currentAdmCycle = cycleId;

  // Unified tasks
  const tasksData = [
    { title:'Solicit Theory Seminar descriptions for next semester', freq:'Semester', due:'2026-10-01', notes:'Distribute to listserv when received', urg:'med' },
    { title:'Review GTA assignments for next semester', freq:'Semester', due:'2026-11-01', notes:'Due ~6 weeks before semester start', urg:'high' },
    { title:'Finalize course rotations for upcoming semester', freq:'Semester', due:'2026-11-15', notes:'Needs to be done ~1.5 semesters in advance', urg:'high' },
    { title:'Review studio assignments for incoming students', freq:'Semester', due:'2026-07-15', notes:'Coordinate with faculty', urg:'med' },
    { title:'Launch admissions advertising campaign', freq:'Annual', due:'2026-09-01', notes:'Target: early fall for fall admits', urg:'med' },
    { title:'Send colleague email to begin applicant evaluation', freq:'Annual', due:'2027-01-15', notes:'', urg:'med' },
    { title:'Compile interview shortlist', freq:'Annual', due:'2027-02-01', notes:'', urg:'high' },
    { title:'Conduct DMA prospective student interviews', freq:'Annual', due:'2027-02-15', notes:'', urg:'high' },
    { title:'GTA assignments due – Spring 2027', freq:'Once', due:'2026-11-01', notes:'', urg:'high' },
    { title:'Finalize course rotations – Spring 2027', freq:'Once', due:'2026-11-15', notes:'', urg:'high' },
  ];
  tasksData.forEach(t => STORE.tasks.push({ id:uid(), ...t, done:false, gcalId:null }));

  // Generate recurring meeting dates for 2026-27 academic year
  autoGenerateMeetings(2026, false);

  save();
}

// ── Auto-generate meetings from recurrence rule ──
function autoGenerateMeetings(yearStart, confirmOverwrite) {
  const dates = generateMeetingDates(yearStart);
  const mr = STORE.settings.meetingRecurrence;
  // Only add dates not already in meetings
  const existing = new Set(STORE.meetings.map(m => m.date));
  dates.forEach(date => {
    if (!existing.has(date)) {
      STORE.meetings.push({
        id: uid(), date,
        time: mr.time, timeEnd: mr.timeEnd,
        location: mr.location,
        remindDays: mr.agendaReminderDays,
        notes: '', gcalId: null, generated: true, minutes: ''
      });
    }
  });
  STORE.meetings.sort((a,b) => a.date.localeCompare(b.date));
}
