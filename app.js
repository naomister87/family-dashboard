/* Assembled app.js - do not edit by hand; edit .build/parts instead. */

/* =====================================================================
   Our Family Dashboard — 01 · Core data, helpers & sync engine
   ===================================================================== */
'use strict';

var STORE_VERSION = 1;
var WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

var AVATAR_FILES = {
  cheetah: './assets/arya.png',
  kitten: './assets/delia.png',
  puppy: './assets/dada.png',
  bunny: './assets/mom.png'
};

/* Built-in family cloud (our-family-dashboard-3998f).
   Settings can override or disconnect it at any time. */
var DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB9g5h8RBSsiG8Qlq4KIzsqI9DeZUnqh1Y',
  authDomain: 'our-family-dashboard-3998f.firebaseapp.com',
  databaseURL: 'https://our-family-dashboard-3998f-default-rtdb.firebaseio.com',
  projectId: 'our-family-dashboard-3998f',
  storageBucket: 'our-family-dashboard-3998f.firebasestorage.app',
  messagingSenderId: '11535575068',
  appId: '1:11535575068:web:2ea5020a3ff0cc741c17d9'
};
var DEFAULT_ROOM = 'our-family';

/* ---------- small helpers ---------- */

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* ---------- the family clock: Port Monmouth, NJ ---------- */

var FAMILY_TZ = 'America/New_York';
var FAMILY_TZ_LABEL = 'ET';

var _nyPartsFmt = null;

/* New York wall-clock parts for an instant (defaults to now). */
function nyParts(ts) {
  var d = (ts === undefined || ts === null) ? new Date() : (typeof ts === 'number' ? new Date(ts) : ts);
  if (!_nyPartsFmt) {
    _nyPartsFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: FAMILY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
  var parts = {};
  _nyPartsFmt.formatToParts(d).forEach(function (p) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, /* some engines report midnight as 24 */
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/* New York's calendar day as a plain local Date at midnight (for week math). */
function nyToday(ts) {
  var p = nyParts(ts);
  return new Date(p.year, p.month - 1, p.day);
}

/* The New York calendar day an instant falls on. */
function nyCalendarDate(ts) { return nyToday(ts); }

/* "5:16 PM" */
function clockLabel(hour24, minute) {
  var h = hour24 % 12;
  if (h === 0) h = 12;
  return h + ':' + pad2(minute) + ' ' + (hour24 < 12 ? 'AM' : 'PM');
}

/* New York clock for a timestamp. */
function nyClock(ts) {
  var p = nyParts(ts);
  return clockLabel(p.hour, p.minute);
}

/* A calendar Date rendered in UTC noon so no time zone can shift the day. */
function calendarStamp(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
}

function dateKey(d) {
  if (!d) {
    var p = nyParts();
    return p.year + '-' + pad2(p.month) + '-' + pad2(p.day);
  }
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function parseKey(key) {
  var p = String(key || '').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2] || 1));
}

function addDays(d, n) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function weekStartDate(d) {
  d = d || nyToday();
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  return x;
}

function weekDates(d) {
  var start = weekStartDate(d);
  var out = [];
  for (var i = 0; i < 7; i++) out.push(addDays(start, i));
  return out;
}

function shortDate(d) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(calendarStamp(d));
}

function longDate(d) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(calendarStamp(d));
}

function timeLabel(ts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: FAMILY_TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

function timeLabelET(ts) {
  return timeLabel(ts) + ' ' + FAMILY_TZ_LABEL;
}

function uid(prefix) {
  return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function money(n) {
  var v = Number(n) || 0;
  var neg = v < 0;
  v = Math.abs(v);
  var whole = Math.floor(v);
  var cents = Math.round((v - whole) * 100);
  if (cents === 100) { whole += 1; cents = 0; }
  var txt = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (cents) txt += '.' + pad2(cents);
  return (neg ? '-$' : '$') + txt;
}

function mmss(totalSeconds) {
  var s = Math.max(0, Math.round(totalSeconds));
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + ':' + pad2(m) + ':' + pad2(sec);
  return pad2(m) + ':' + pad2(sec);
}

function byId(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

/* ---------- default (seed) state ---------- */

function makeChores(prefix, titles) {
  return titles.map(function (t, i) {
    return { id: prefix + '-c' + (i + 1), title: t };
  });
}

function makeStudy(prefix, items) {
  return items.map(function (it, i) {
    return {
      id: prefix + '-s' + (i + 1),
      title: it.title,
      tag: it.tag || '',
      timer: it.timer || 0,
      pinned: !!it.pinned
    };
  });
}

function defaultState() {
  return {
    version: STORE_VERSION,
    rev: 1,
    updatedAt: Date.now(),
    settings: {
      weather: {
        label: 'Port Monmouth, NJ (07758)',
        lat: 40.43011,
        lon: -74.09847,
        timezone: 'America/New_York',
        query: '07758',
        unit: 'fahrenheit'
      },
      pin: { enabled: false, code: '1234' },
      firebase: { configText: '', room: 'our-family' }
    },
    members: [
      { id: 'arya', name: 'Arya', subtitle: 'With Cheetah', avatar: 'cheetah', tint: 'peach', kid: true, allowance: 7, starting: 0 },
      { id: 'delia', name: 'Delia', subtitle: 'With Kitten', avatar: 'kitten', tint: 'blue', kid: true, allowance: 5, starting: 0 },
      { id: 'dada', name: 'Dada', subtitle: 'With Puppy', avatar: 'puppy', tint: 'mint', kid: false },
      { id: 'mom', name: '엄마', subtitle: 'With Bunny', avatar: 'bunny', tint: 'pink', kid: false }
    ],
    chores: {
      arya: makeChores('arya', [
        'Empty lunch bag & put in dishwasher',
        'Clear dishes after eating',
        'Take out the trash',
        'Move the trash bins',
        'Help with laundry',
        'Clean cat litter box',
        'Clean room'
      ]),
      delia: makeChores('delia', [
        'Empty lunch bag & put in dishwasher',
        'Clear dishes after eating',
        'Take out recycling',
        'Move the trash bins',
        'Help with laundry',
        "Change cat's water",
        'Clean room'
      ]),
      dada: makeChores('dada', [
        'Water the plants',
        'Fix something around the house',
        'Bedtime story with the kids'
      ]),
      mom: makeChores('mom', [
        'Plan the week\u2019s meals',
        'Check school notices',
        'Pack tomorrow\u2019s lunches'
      ])
    },
    choreLog: {},
    study: {
      arya: makeStudy('arya', [
        { title: 'School homework', tag: 'Homework', pinned: true },
        { title: "Mom's worksheet (1 page)", tag: '1 page' },
        { title: 'Read a book (30 min)', tag: '30 min', timer: 30, pinned: true },
        { title: 'Book club', tag: 'Club' }
      ]),
      delia: makeStudy('delia', [
        { title: 'School homework', tag: 'Homework', pinned: true },
        { title: 'Kumon Worksheet A (1 page)', tag: '1 page' },
        { title: 'Kumon Worksheet B (1 page)', tag: '1 page' },
        { title: 'Read a book (30 min)', tag: '30 min', timer: 30, pinned: true },
        { title: 'Book club', tag: 'Club' }
      ]),
      dada: [],
      mom: []
    },
    studyLog: {},
    missions: {
      pool: [
        { id: 'm-dinner', emoji: '\uD83E\uDD55', text: 'Help prepare dinner together' },
        { id: 'm-board', emoji: '\uD83C\uDFB2', text: 'Play one board game together' },
        { id: 'm-walk', emoji: '\uD83D\uDEB6', text: 'Take a 10-minute family walk' },
        { id: 'm-story', emoji: '\uD83D\uDCD6', text: 'Read a story out loud together' },
        { id: 'm-tidy', emoji: '\uD83E\uDDF9', text: '5-minute tidy-up race' },
        { id: 'm-dance', emoji: '\uD83C\uDFB5', text: 'Dance to one song together' },
        { id: 'm-bake', emoji: '\uD83C\uDF6A', text: 'Bake something sweet together' },
        { id: 'm-cat', emoji: '\uD83D\uDC31', text: 'Brush the cat together' },
        { id: 'm-plants', emoji: '\uD83C\uDF3F', text: 'Water the plants together' },
        { id: 'm-trip', emoji: '\uD83D\uDE97', text: 'Plan a weekend adventure' }
      ],
      current: null,
      completedCount: 0,
      history: []
    },
    stamps: {},
    ledger: { arya: [], delia: [] },
    highFives: {},
    allowances: {},
    chat: {
      messages: [
        { id: 'seed-1', member: 'mom', text: 'Welcome to our family chat, my loves \uD83D\uDC9B', type: 'text', ts: Date.now() - 3600000, heart: false },
        { id: 'seed-2', member: 'arya', text: 'Hi 엄마!! \uD83D\uDE4C', type: 'text', ts: Date.now() - 3000000, heart: false }
      ]
    },
    calendar: { events: [] },
    tablet: { enabled: false, mode: 'clock', clock: '20:30', minutes: 30 }
  };
}

/* ---------- state normalisation (import / sync safety) ---------- */

function normalizeState(raw) {
  var base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  var out = Object.assign({}, base, raw);
  out.version = STORE_VERSION;

  out.settings = Object.assign({}, base.settings, raw.settings || {});
  out.settings.weather = Object.assign({}, base.settings.weather, (raw.settings || {}).weather || {});
  out.settings.pin = Object.assign({}, base.settings.pin, (raw.settings || {}).pin || {});
  out.settings.firebase = Object.assign({}, base.settings.firebase, (raw.settings || {}).firebase || {});

  /* members: keep the four family slots, merge saved fields by id */
  var members = [];
  base.members.forEach(function (slot) {
    var found = null;
    if (Array.isArray(raw.members)) {
      for (var i = 0; i < raw.members.length; i++) {
        if (raw.members[i] && raw.members[i].id === slot.id) { found = raw.members[i]; break; }
      }
    }
    members.push(Object.assign({}, slot, found || {}));
  });
  out.members = members;

  out.chores = {};
  out.study = {};
  base.members.forEach(function (m) {
    var savedChores = (raw.chores || {})[m.id];
    var savedStudy = (raw.study || {})[m.id];
    out.chores[m.id] = Array.isArray(savedChores) ? savedChores : base.chores[m.id];
    out.study[m.id] = Array.isArray(savedStudy) ? savedStudy : base.study[m.id];
  });

  out.choreLog = (raw.choreLog && typeof raw.choreLog === 'object') ? raw.choreLog : {};
  out.studyLog = (raw.studyLog && typeof raw.studyLog === 'object') ? raw.studyLog : {};
  out.stamps = (raw.stamps && typeof raw.stamps === 'object') ? raw.stamps : {};
  out.highFives = (raw.highFives && typeof raw.highFives === 'object') ? raw.highFives : {};
  out.allowances = (raw.allowances && typeof raw.allowances === 'object') ? raw.allowances : {};
  out.ledger = Object.assign({ arya: [], delia: [] }, raw.ledger || {});

  out.missions = Object.assign({}, base.missions, raw.missions || {});
  if (!Array.isArray(out.missions.pool)) out.missions.pool = base.missions.pool;
  if (!Array.isArray(out.missions.history)) out.missions.history = [];
  if (typeof out.missions.completedCount !== 'number') out.missions.completedCount = 0;

  out.chat = Object.assign({}, base.chat, raw.chat || {});
  if (!Array.isArray(out.chat.messages)) out.chat.messages = [];

  /* family calendar: a real list of events, never seeded with samples */
  var rawCal = (raw.calendar && typeof raw.calendar === 'object') ? raw.calendar : {};
  out.calendar = {
    events: Array.isArray(rawCal.events)
      ? rawCal.events.map(normalizeCalendarEvent).filter(function (ev) { return !!ev; })
      : []
  };

  out.tablet = Object.assign({}, base.tablet, raw.tablet || {});

  return out;
}

/* ---------- derived data ---------- */

function memberById(id) {
  if (!state || !Array.isArray(state.members)) return null;
  return byId(state.members, id);
}

function kidMembers() {
  return state.members.filter(function (m) { return m.kid; });
}

function avatarSrc(m) {
  if (!m) return '';
  if (typeof m.avatar === 'string' && m.avatar.indexOf('data:') === 0) return m.avatar;
  if (typeof m.avatar === 'string' && m.avatar.indexOf('http') === 0) return m.avatar;
  if (typeof m.avatar === 'string' && m.avatar.indexOf('assets/') === 0) return m.avatar;
  var assets = window.AVATAR_ASSETS || AVATAR_FILES;
  return assets[m.avatar] || assets.cheetah || AVATAR_FILES.cheetah;
}

function choresFor(memberId) { return (state.chores && state.chores[memberId]) || []; }

function choreDoneMap(date, memberId) {
  var day = state.choreLog[date];
  var map = day && day[memberId];
  return map || {};
}

function choreStats(memberId, date) {
  date = date || dateKey();
  var list = choresFor(memberId);
  var done = choreDoneMap(date, memberId);
  var count = 0;
  list.forEach(function (it) { if (done[it.id]) count++; });
  return { done: count, total: list.length };
}

function allChoresDone(memberId, date) {
  var s = choreStats(memberId, date);
  return s.total > 0 && s.done === s.total;
}

function studyFor(memberId) { return (state.study && state.study[memberId]) || []; }

function studyDoneMap(date, memberId) {
  var day = state.studyLog[date];
  var map = day && day[memberId];
  return map || {};
}

function studyStats(memberId, date) {
  date = date || dateKey();
  var list = studyFor(memberId);
  var done = studyDoneMap(date, memberId);
  var count = 0;
  list.forEach(function (it) { if (done[it.id]) count++; });
  return { done: count, total: list.length };
}

function ledgerFor(memberId) { return (state.ledger && state.ledger[memberId]) || []; }

function balanceOf(memberId) {
  var m = memberById(memberId);
  var total = Number(m && m.starting) || 0;
  ledgerFor(memberId).forEach(function (t) {
    var amt = Math.abs(Number(t.amount) || 0);
    total += (t.type === 'spend') ? -amt : amt;
  });
  return total;
}

function earnedOf(memberId, type) {
  var sum = 0;
  ledgerFor(memberId).forEach(function (t) {
    if (type && t.type !== type) return;
    sum += Math.abs(Number(t.amount) || 0);
  });
  return sum;
}

function allowanceOf(memberId) {
  var m = memberById(memberId);
  return Number(m && m.allowance) || 0;
}

/* ---------- stamps ---------- */

function stampFor(date) { return state.stamps[date] || null; }

function addStamp(date, source, label) {
  var s = state.stamps[date];
  if (!s) {
    s = { sources: [], at: Date.now(), label: label || '' };
    state.stamps[date] = s;
  }
  if (!Array.isArray(s.sources)) s.sources = [];
  if (s.sources.indexOf(source) === -1) s.sources.push(source);
  s.at = Date.now();
  if (label) s.label = label;
  return s;
}

function stampStreak() {
  var cursor = nyToday();
  if (!stampFor(dateKey(cursor))) cursor = addDays(cursor, -1);
  var count = 0;
  while (stampFor(dateKey(cursor))) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function monthStampCount(now) {
  var p = nyParts(now || null);
  var count = 0;
  Object.keys(state.stamps).forEach(function (k) {
    var d = parseKey(k);
    if (d.getFullYear() === p.year && d.getMonth() === p.month - 1) count++;
  });
  return count;
}

/* ---------- weekly allowance bookkeeping ---------- */

function allowanceWeekKey(d) { return dateKey(weekStartDate(d)); }

function allowanceEntry(memberId, weekKey) {
  var week = state.allowances[weekKey];
  return week ? week[memberId] : null;
}

function weeklyChoreDots(memberId, d) {
  return weekDates(d).map(function (day) {
    var key = dateKey(day);
    return { key: key, date: day, done: allChoresDone(memberId, key), today: key === dateKey() };
  });
}

/* ---------- mission ---------- */

function ensureTodayMission() {
  var today = dateKey();
  var cur = state.missions.current;
  if (cur && cur.date === today && byId(state.missions.pool, cur.id)) return cur;
  if (!state.missions.pool.length) { state.missions.current = null; return null; }
  var lastId = cur ? cur.id : null;
  var options = state.missions.pool.filter(function (p) { return p.id !== lastId; });
  if (!options.length) options = state.missions.pool;
  var pick = options[Math.floor(Math.random() * options.length)];
  state.missions.current = {
    date: today, id: pick.id, text: pick.text, emoji: pick.emoji, done: false
  };
  return state.missions.current;
}

function shuffleMission() {
  var pool = state.missions.pool;
  if (!pool.length) return null;
  var lastId = state.missions.current ? state.missions.current.id : null;
  var options = pool.filter(function (p) { return p.id !== lastId; });
  if (!options.length) options = pool;
  var pick = options[Math.floor(Math.random() * options.length)];
  state.missions.current = {
    date: dateKey(), id: pick.id, text: pick.text, emoji: pick.emoji, done: false
  };
  return state.missions.current;
}

/* ---------- family calendar ---------- */

var CAL_MEMBER_LOOK = {
  all:   { label: 'Family', emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66', bg: '#FCE5CD', dot: '#E07A5F', ink: '#8C4A2F' },
  arya:  { label: 'Arya',   emoji: '\uD83D\uDC06', bg: '#FFE3C7', dot: '#E2A05A', ink: '#8A5A17' },
  delia: { label: 'Delia',  emoji: '\uD83D\uDC31', bg: '#DCEBFB', dot: '#6BA6DD', ink: '#2F5E8A' },
  dada:  { label: 'Dada',   emoji: '\uD83D\uDC36', bg: '#D6F3D8', dot: '#4CAF50', ink: '#1E6B2B' },
  mom:   { label: '\uC5C4\uB9C8',   emoji: '\uD83D\uDC30', bg: '#FBDDE5', dot: '#DE8AA6', ink: '#8E4460' }
};

var CAL_REPEATS = ['none', 'daily', 'weekly', 'monthly'];
var CAL_REPEAT_LABELS = { none: 'One time', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
var CAL_EMOJIS = ['\uD83D\uDCC5', '\uD83C\uDFEB', '\u26BD', '\uD83C\uDFB5', '\uD83D\uDCDA', '\uD83E\uDE7A', '\uD83C\uDF89', '\uD83D\uDE97', '\uD83C\uDF7D\uFE0F'];

function calendarEvents() {
  if (!state || !state.calendar || !Array.isArray(state.calendar.events)) return [];
  return state.calendar.events;
}

function calMembers(ev) {
  var list = (ev && Array.isArray(ev.members)) ? ev.members.filter(function (id) { return id === 'all' || !!CAL_MEMBER_LOOK[id]; }) : [];
  if (list.indexOf('all') !== -1) return ['all'];
  var seen = [];
  list.forEach(function (id) { if (seen.indexOf(id) === -1) seen.push(id); });
  return seen.length ? seen : ['all'];
}

function calColorKey(ev) {
  var members = calMembers(ev);
  if (members.indexOf('all') !== -1) return 'all';
  return CAL_MEMBER_LOOK[members[0]] ? members[0] : 'all';
}

function calLook(ev) { return CAL_MEMBER_LOOK[calColorKey(ev)] || CAL_MEMBER_LOOK.all; }

function calMatchesMember(ev, filter) {
  if (!filter || filter === 'all') return true;
  var members = calMembers(ev);
  return members.indexOf('all') !== -1 || members.indexOf(filter) !== -1;
}

/* Does this event fall on that New York calendar day, honouring its repeat? */
function calEventOnDate(ev, key) {
  if (!ev || !ev.date || !key) return false;
  if (ev.date === key) return true;
  var start = parseKey(ev.date);
  var day = parseKey(key);
  if (day.getTime() < start.getTime()) return false;
  var repeat = ev.repeat || 'none';
  if (repeat === 'daily') return true;
  if (repeat === 'weekly') return day.getDay() === start.getDay();
  if (repeat === 'monthly') return day.getDate() === start.getDate();
  return false;
}

/* Every event on a day, all-day first then by start time. */
function eventsForDate(key, memberFilter) {
  var out = calendarEvents().filter(function (ev) {
    return calEventOnDate(ev, key) && calMatchesMember(ev, memberFilter);
  });
  out.sort(function (a, b) {
    if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });
  return out;
}

/* Days inside a range that have at least one event. */
function calDaysWithEvents(startDate, days, memberFilter) {
  var out = [];
  for (var i = 0; i < days; i++) {
    var d = addDays(startDate, i);
    var key = dateKey(d);
    var list = eventsForDate(key, memberFilter);
    if (list.length) out.push({ key: key, date: d, events: list });
  }
  return out;
}

/* "4:00 PM" or "4:00 PM \u2013 5:30 PM" or "All day" */
function calTimeText(ev) {
  if (!ev) return '';
  if (ev.allDay || !ev.startTime) return 'All day';
  var txt = calClock(ev.startTime);
  if (ev.endTime) txt += ' \u2013 ' + calClock(ev.endTime);
  return txt;
}

function calClock(hhmm) {
  var p = String(hhmm || '').split(':');
  var h = Number(p[0]);
  var m = Number(p[1] || 0);
  if (isNaN(h)) return '';
  return clockLabel(h, m);
}

function normalizeCalendarEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var repeat = String(raw.repeat || 'none');
  if (CAL_REPEATS.indexOf(repeat) === -1) repeat = 'none';
  var members = calMembers(raw);
  var date = String(raw.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  var toTime = function (v) {
    var s = String(v || '');
    if (!/^\d{1,2}:\d{2}$/.test(s)) return '';
    var p = s.split(':');
    return pad2(Number(p[0]) % 24) + ':' + p[1];
  };
  return {
    id: String(raw.id || uid('ev')),
    title: String(raw.title || 'Family event').slice(0, 120),
    date: date,
    allDay: !!raw.allDay,
    startTime: toTime(raw.startTime),
    endTime: toTime(raw.endTime),
    members: members,
    repeat: repeat,
    emoji: String(raw.emoji || '\uD83D\uDCC5'),
    location: String(raw.location || '').slice(0, 160),
    notes: String(raw.notes || '').slice(0, 500),
    createdAt: Number(raw.createdAt) || Date.now()
  };
}

function addCalendarEvent(data) {
  if (!state.calendar || !Array.isArray(state.calendar.events)) state.calendar = { events: [] };
  var ev = normalizeCalendarEvent(Object.assign({}, data || {}, { id: (data && data.id) || uid('ev'), createdAt: Date.now() }));
  if (!ev) return null;
  state.calendar.events.push(ev);
  return ev;
}

function updateCalendarEvent(id, data) {
  var list = calendarEvents();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id !== id) continue;
    var merged = Object.assign({}, list[i], data || {}, { id: id, createdAt: list[i].createdAt });
    var ev = normalizeCalendarEvent(merged);
    if (!ev) return null;
    list[i] = ev;
    return ev;
  }
  return null;
}

function deleteCalendarEvent(id) {
  var list = calendarEvents();
  var kept = list.filter(function (ev) { return ev.id !== id; });
  if (kept.length === list.length) return false;
  state.calendar.events = kept;
  return true;
}

/* ---------- device-local preferences ---------- */

var DEVICE_KEY = 'familyDashboard.device.v1';
var device = { chatMember: 'arya', chatLocked: false, chatSound: true };

function loadDevice() {
  try {
    var raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') {
      if (saved.chatMember) device.chatMember = saved.chatMember;
      if (typeof saved.chatLocked === 'boolean') device.chatLocked = saved.chatLocked;
      if (typeof saved.chatSound === 'boolean') device.chatSound = saved.chatSound;
    }
  } catch (e) { /* ignore */ }
}

function saveDevice() {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(device)); } catch (e) { /* ignore */ }
}

/* ---------- SyncEngine ---------- */

var SyncEngine = {
  room: 'our-family',
  channel: null,
  status: 'local',
  fb: null,
  fbRef: null,
  fbUnsub: null,
  fbUser: null,
  authUnsub: null,
  listeners: [],
  lastRemoteAt: 0,

  key: function () { return 'familyDashboard.state.v1.' + this.room; },

  setRoom: function (room) {
    var next = (room || 'our-family').trim() || 'our-family';
    if (next === this.room && this.channel) return;
    this.room = next;
    this.openChannel();
  },

  openChannel: function () {
    if (this.channel && typeof this.channel.close === 'function') {
      try { this.channel.close(); } catch (e) { /* ignore */ }
    }
    this.channel = null;
    if (typeof BroadcastChannel === 'function') {
      try {
        var self = this;
        this.channel = new BroadcastChannel('family-dashboard-' + this.room);
        this.channel.onmessage = function (ev) { self.receive(ev.data); };
      } catch (e) { this.channel = null; }
    }
    this.setStatus(this.fb ? 'live' : 'local');
  },

  read: function () {
    try {
      var raw = localStorage.getItem(this.key());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  save: function (next) {
    var stamp = Date.now();
    if (!next.rev || next.rev < stamp) next.rev = stamp;
    next.updatedAt = stamp;
    try { localStorage.setItem(this.key(), JSON.stringify(next)); } catch (e) { /* quota */ }
    if (this.channel) {
      try { this.channel.postMessage({ type: 'state', state: next }); } catch (e) { /* ignore */ }
    }
    this.pushFirebase(next);
  },

  receive: function (msg) {
    if (!msg || msg.type !== 'state' || !msg.state) return;
    this.applyRemote(msg.state, 'another tab');
  },

  applyRemote: function (remote, where) {
    if (!remote || Number(remote.version) !== STORE_VERSION) return;
    if (Number(remote.rev || 0) <= Number(state.rev || 0)) return;
    this.lastRemoteAt = Date.now();
    state = normalizeState(remote);
    try { localStorage.setItem(this.key(), JSON.stringify(state)); } catch (e) { /* ignore */ }
    renderAll();
    toast('Synced from ' + (where || 'another device') + ' \u2728');
  },

  setStatus: function (s) {
    this.status = s;
    this.listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* ignore */ } });
    var badge = document.getElementById('syncBadge');
    if (badge) {
      badge.setAttribute('data-status', s);
      badge.textContent = s === 'live' ? '\uD83D\uDFE2 Live sync' : (s === 'error' ? '\uD83D\uDFE0 Sync error' : '\u26AA This device');
    }
  },

  onStatus: function (fn) { if (typeof fn === 'function') this.listeners.push(fn); },

  /* ---- Firebase (v10 compat SDK loaded from index.html, email/password sign-in) ---- */
  connectFirebase: function (config, room) {
    var self = this;
    room = (room || this.room || DEFAULT_ROOM).trim();
    this.room = room;
    this.paused = false;
    this.openChannel();
    if (!config || (!config.databaseURL && !config.databaseUrl)) {
      this.setStatus('local');
      return Promise.reject(new Error('A databaseURL is required in the Firebase config.'));
    }
    var url = config.databaseURL || config.databaseUrl;
    var cfg = Object.assign({}, config, { databaseURL: url });

    if (!window.firebase || !window.firebase.initializeApp) {
      this.setStatus('error');
      return Promise.reject(new Error('The Firebase SDK could not load. Check the internet connection.'));
    }

    try {
      var appName = 'family-dashboard';
      var app = null;
      window.firebase.apps.forEach(function (a) {
        if (a.name === appName) app = a;
      });
      if (!app) app = window.firebase.initializeApp(cfg, appName);

      var auth = window.firebase.auth(app);
      var db = window.firebase.database(app);
      this.fb = { app: app, auth: auth, db: db };
      this.fbUser = null;

      try {
        auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
          .catch(function () { /* private mode */ });
      } catch (e) { /* ignore */ }

      auth.onAuthStateChanged(function (user) {
        self.fbUser = user;
        if (user) {
          self.attachDatabase();
          if (typeof hideAuthGate === 'function') hideAuthGate();
          self.setStatus('live');
        } else {
          self.detachDatabase();
          self.setStatus('local');
          if (!self.paused && typeof showAuthGate === 'function') showAuthGate('login');
        }
      });
      return Promise.resolve(true);
    } catch (err) {
      this.setStatus('error');
      if (typeof showAuthGate === 'function') showAuthGate('offline', (err && err.message) || '');
      return Promise.reject(err);
    }
  },

  attachDatabase: function () {
    if (!this.fb || this.fbRef) return;
    var self = this;
    this.fbRef = this.fb.db.ref('rooms/' + this.room + '/state');
    this.fbRef.on('value', function (snap) {
      var val = snap.val();
      if (val && val.rev) self.applyRemote(val, 'the cloud');
    });
    this.fbRef.set(state).catch(function () {
      toast('Cloud access was refused — check the database rules.', 'warn');
    });
  },

  detachDatabase: function () {
    if (this.fbRef) { try { this.fbRef.off(); } catch (e) { /* ignore */ } }
    this.fbUnsub = null;
    this.fbRef = null;
  },

  signIn: function (email, password) {
    if (!this.fb || !this.fb.auth) return Promise.reject(new Error('Firebase is not connected yet.'));
    return this.fb.auth.signInWithEmailAndPassword(String(email || '').trim(), String(password || ''));
  },

  createAccount: function (email, password) {
    if (!this.fb || !this.fb.auth) return Promise.reject(new Error('Firebase is not connected yet.'));
    return this.fb.auth.createUserWithEmailAndPassword(String(email || '').trim(), String(password || ''));
  },

  signOut: function () {
    if (!this.fb || !this.fb.auth) return Promise.resolve();
    return this.fb.auth.signOut();
  },

  pushFirebase: function (next) {
    if (!this.fbRef) return;
    try {
      this.fbRef.set(next).catch(function () { /* offline or rules */ });
    } catch (e) { /* ignore */ }
  },

  disconnectFirebase: function () {
    this.detachDatabase();
    if (this.authUnsub) { try { this.authUnsub(); } catch (e) { /* ignore */ } }
    this.authUnsub = null;
    if (this.fb && this.fb.auth) {
      try { this.fb.auth.signOut().catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    }
    if (this.fb && this.fb.app) {
      try { this.fb.app.delete().catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    }
    this.fb = null;
    this.fbUser = null;
    this.setStatus('local');
  }
};


/* =====================================================================
   Our Family Dashboard — 02 · App shell, sound, overlays
   ===================================================================== */

var state = null;

var weather = { status: 'idle', data: null, error: '', updatedAt: 0 };
var timer = {
  mode: 'countdown',
  total: 30 * 60,
  remaining: 30 * 60,
  elapsed: 0,
  running: false,
  endsAt: 0,
  startedAt: 0
};
var tabletRuntime = { countdownLeft: 0, endsAt: 0, running: false };
var lastAlarmKey = '';
var stickerOpen = false;
var allowanceMember = 'arya';
var calCursor = null;
var pendingPinAction = null;
var currentTab = 'home';

/* family calendar view state (month cursor, week cursor, selected day, filter) */
var calendarView = 'month';
var calendarMonth = null;
var calendarWeek = null;
var calendarDay = null;
var calendarFilter = 'all';

/* ---------- tiny DOM helpers ---------- */

function $(sel, root) { return (root || document).querySelector(sel); }

function $$(sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
}

function toast(message, kind) {
  var wrap = $('#toastWrap');
  if (!wrap) return;
  var node = document.createElement('div');
  node.className = 'toast' + (kind ? ' toast-' + kind : '');
  node.textContent = message;
  wrap.appendChild(node);
  requestAnimationFrame(function () { node.classList.add('show'); });
  setTimeout(function () {
    node.classList.remove('show');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
  }, 2600);
}

/* ---------- modal ---------- */

function openModal(html, opts) {
  opts = opts || {};
  var backdrop = $('#modalBackdrop');
  var card = $('#modalCard');
  card.className = 'modal-card' + (opts.wide ? ' wide' : '');
  card.innerHTML = html;
  backdrop.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(function () { backdrop.classList.add('open'); });
  var focusTarget = card.querySelector('[data-autofocus]');
  if (focusTarget) setTimeout(function () { try { focusTarget.focus(); } catch (e) { /* ignore */ } }, 60);
}

function closeModal() {
  var backdrop = $('#modalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(function () {
    if (!backdrop.classList.contains('open')) {
      backdrop.hidden = true;
      $('#modalCard').innerHTML = '';
    }
  }, 220);
  pendingPinAction = null;
}

/* ---------- sound ---------- */

var audioCtx = null;
var alarmHandle = null;

function audioEngine() {
  try {
    if (!audioCtx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

function tone(ctx, freq, at, dur, type, vol) {
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
  gain.gain.setValueAtTime(0, ctx.currentTime + at);
  gain.gain.linearRampToValueAtTime(vol == null ? 0.16 : vol, ctx.currentTime + at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur + 0.05);
}

function playChime() {
  var ctx = audioEngine();
  if (!ctx) return;
  try {
    tone(ctx, 659.25, 0, 0.55, 'sine', 0.18);
    tone(ctx, 783.99, 0.18, 0.55, 'sine', 0.16);
    tone(ctx, 1046.5, 0.36, 0.9, 'sine', 0.14);
  } catch (e) { /* ignore */ }
}

function playPop() {
  if (!device.chatSound) return;
  var ctx = audioEngine();
  if (!ctx) return;
  try { tone(ctx, 880, 0, 0.12, 'triangle', 0.08); } catch (e) { /* ignore */ }
}

function playSparkle() {
  var ctx = audioEngine();
  if (!ctx) return;
  try {
    tone(ctx, 1046.5, 0, 0.25, 'sine', 0.12);
    tone(ctx, 1318.5, 0.09, 0.3, 'sine', 0.1);
  } catch (e) { /* ignore */ }
}

function startAlarm() {
  stopAlarm();
  var ctx = audioEngine();
  if (!ctx) return;
  var step = 0;
  alarmHandle = setInterval(function () {
    var base = (step % 2 === 0) ? 880 : 660;
    try {
      tone(ctx, base, 0, 0.16, 'sine', 0.16);
      tone(ctx, base * 1.5, 0.18, 0.2, 'sine', 0.12);
    } catch (e) { /* ignore */ }
    step++;
    if (step > 24) stopAlarm();
  }, 620);
}

function stopAlarm() {
  if (alarmHandle) { clearInterval(alarmHandle); alarmHandle = null; }
}

/* ---------- celebration overlays ---------- */

function showCelebration(opts) {
  opts = opts || {};
  var layer = $('#celebration');
  if (!layer) return;
  var confetti = '';
  var emojis = opts.confetti || ['\u2764\uFE0F', '\u2B50', '\uD83C\uDF89', '\uD83C\uDF38'];
  for (var i = 0; i < 22; i++) {
    confetti += '<span class="confetti-bit" style="left:' + (Math.random() * 100).toFixed(1) + '%;' +
      'animation-delay:' + (Math.random() * 1.2).toFixed(2) + 's;' +
      'font-size:' + (12 + Math.random() * 16).toFixed(0) + 'px">' +
      emojis[i % emojis.length] + '</span>';
  }
  layer.innerHTML =
    '<div class="celebration-confetti">' + confetti + '</div>' +
    '<div class="celebration-card ' + (opts.tone || '') + '" role="dialog" aria-live="polite">' +
    (opts.avatar ? '<img class="celebration-avatar" src="' + esc(opts.avatar) + '" alt="">' : '') +
    '<div class="celebration-emoji">' + (opts.emoji || '\uD83D\uDE4C') + '</div>' +
    '<h2>' + esc(opts.title || 'High-Five!') + '</h2>' +
    '<p>' + esc(opts.message || '') + '</p>' +
    (opts.badge ? '<span class="celebration-badge">' + esc(opts.badge) + '</span>' : '') +
    '<button class="btn primary" data-action="close-celebration">Yay!</button>' +
    '</div>';
  layer.hidden = false;
  requestAnimationFrame(function () { layer.classList.add('open'); });
  playSparkle();
  if (opts.timeout !== 0) {
    clearTimeout(showCelebration._t);
    showCelebration._t = setTimeout(closeCelebration, opts.timeout || 4200);
  }
}

function closeCelebration() {
  var layer = $('#celebration');
  if (!layer) return;
  clearTimeout(showCelebration._t);
  layer.classList.remove('open');
  setTimeout(function () { if (!layer.classList.contains('open')) { layer.hidden = true; layer.innerHTML = ''; } }, 260);
}

function moneyBurst(anchor) {
  var layer = document.createElement('div');
  layer.className = 'money-layer';
  var emojis = ['\uD83D\uDCB0', '\uD83D\uDCB5', '\u2728', '\uD83D\uDC37'];
  for (var i = 0; i < 18; i++) {
    var span = document.createElement('span');
    span.className = 'money-bit';
    span.textContent = emojis[i % emojis.length];
    span.style.left = (6 + Math.random() * 88).toFixed(1) + '%';
    span.style.animationDelay = (Math.random() * 0.7).toFixed(2) + 's';
    span.style.fontSize = (18 + Math.random() * 26).toFixed(0) + 'px';
    layer.appendChild(span);
  }
  document.body.appendChild(layer);
  setTimeout(function () {
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  }, 2800);
  playSparkle();
}

/* ---------- header / navigation ---------- */

function renderHeader() {
  /* the dashboard always shows the family's own clock in New Jersey */
  var p = nyParts();
  var dateEl = $('#headerDate');
  if (dateEl) dateEl.textContent = longDate(nyToday()) + ' \u00B7 ' + clockLabel(p.hour, p.minute) + ' ' + FAMILY_TZ_LABEL;
  var subEl = $('#headerSub');
  if (subEl) {
    var hour = p.hour;
    var greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
    subEl.textContent = greeting + ' \u00B7 Our Cozy Family Day';
  }
  var mascot = $('#brandMascot');
  if (mascot) {
    var mom = memberById('mom') || state.members[0];
    mascot.src = avatarSrc(mom);
  }
  var fsBtn = $('#fullscreenBtn');
  if (fsBtn) {
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    fsBtn.textContent = isFs ? '\u2715' : '\u26F6';
    fsBtn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Fullscreen');
    fsBtn.title = isFs ? 'Exit fullscreen' : 'Fullscreen';
  }
}

function renderNav() {
  var today = dateKey();
  var remaining = 0;
  kidMembers().forEach(function (m) {
    var s = choreStats(m.id, today);
    remaining += Math.max(0, s.total - s.done);
  });
  $$('.nav-btn').forEach(function (btn) {
    var tab = btn.getAttribute('data-tab');
    btn.classList.toggle('active', tab === currentTab);
    btn.setAttribute('aria-current', tab === currentTab ? 'page' : 'false');
    if (tab === 'chores') {
      var badge = btn.querySelector('.nav-badge');
      if (badge) {
        if (remaining > 0) { badge.textContent = String(remaining); badge.hidden = false; }
        else { badge.hidden = true; }
      }
    }
  });
}

function switchTab(tab) {
  if (!tab) return;
  currentTab = tab;
  $$('.tab-panel').forEach(function (panel) {
    panel.hidden = panel.getAttribute('data-tab') !== tab;
  });
  renderNav();
  renderActive();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderActive() {
  if (currentTab === 'home') renderHome();
  else if (currentTab === 'chores') renderChores();
  else if (currentTab === 'missions') renderMissions();
  else if (currentTab === 'study') renderStudy();
  else if (currentTab === 'calendar') renderCalendar();
  else if (currentTab === 'allowance') renderAllowance();
  else if (currentTab === 'chat') renderChat();
}

function renderAll() {
  renderHeader();
  renderNav();
  renderActive();
  var badge = $('#syncBadge');
  if (badge && SyncEngine.status) SyncEngine.setStatus(SyncEngine.status);
}

/* ---------- saving ---------- */

function commit(message) {
  state.rev = Math.max(Number(state.rev) + 1, Date.now());
  SyncEngine.save(state);
  renderAll();
  if (message) toast(message);
}


/* =====================================================================
   Our Family Dashboard — 03 · Home tab & live weather
   ===================================================================== */

var WEATHER_CODES = {
  0: ['\u2600\uFE0F', 'Clear'],
  1: ['\uD83C\uDF24\uFE0F', 'Mostly clear'],
  2: ['\u26C5', 'Partly cloudy'],
  3: ['\u2601\uFE0F', 'Overcast'],
  45: ['\uD83C\uDF2B\uFE0F', 'Fog'],
  48: ['\uD83C\uDF2B\uFE0F', 'Freezing fog'],
  51: ['\uD83C\uDF26\uFE0F', 'Light drizzle'],
  53: ['\uD83C\uDF26\uFE0F', 'Drizzle'],
  55: ['\uD83C\uDF26\uFE0F', 'Heavy drizzle'],
  56: ['\uD83C\uDF27\uFE0F', 'Freezing drizzle'],
  57: ['\uD83C\uDF27\uFE0F', 'Freezing drizzle'],
  61: ['\uD83C\uDF27\uFE0F', 'Light rain'],
  63: ['\uD83C\uDF27\uFE0F', 'Rain'],
  65: ['\uD83C\uDF27\uFE0F', 'Heavy rain'],
  66: ['\uD83C\uDF27\uFE0F', 'Freezing rain'],
  67: ['\uD83C\uDF27\uFE0F', 'Freezing rain'],
  71: ['\uD83C\uDF28\uFE0F', 'Light snow'],
  73: ['\uD83C\uDF28\uFE0F', 'Snow'],
  75: ['\uD83C\uDF28\uFE0F', 'Heavy snow'],
  77: ['\uD83C\uDF28\uFE0F', 'Snow grains'],
  80: ['\uD83C\uDF26\uFE0F', 'Rain showers'],
  81: ['\uD83C\uDF26\uFE0F', 'Rain showers'],
  82: ['\u26C8\uFE0F', 'Heavy showers'],
  85: ['\uD83C\uDF28\uFE0F', 'Snow showers'],
  86: ['\uD83C\uDF28\uFE0F', 'Snow showers'],
  95: ['\u26C8\uFE0F', 'Thunderstorm'],
  96: ['\u26C8\uFE0F', 'Thunderstorm'],
  99: ['\u26C8\uFE0F', 'Thunderstorm']
};

function weatherLook(code) {
  return WEATHER_CODES[Number(code)] || ['\uD83C\uDF21\uFE0F', 'Weather'];
}

function tempUnit() {
  return (state.settings.weather.unit === 'celsius') ? '\u00B0C' : '\u00B0F';
}

function fetchWeather(force) {
  var w = state.settings.weather;
  if (!force && weather.status === 'ready' && (Date.now() - weather.updatedAt) < 15 * 60 * 1000) {
    renderHome();
    return;
  }
  weather.status = 'loading';
  weather.error = '';
  renderHome();

  var unit = (w.unit === 'celsius') ? 'celsius' : 'fahrenheit';
  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + encodeURIComponent(w.lat) +
    '&longitude=' + encodeURIComponent(w.lon) +
    '&current=temperature_2m,apparent_temperature,weather_code,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&temperature_unit=' + unit +
    '&timezone=' + encodeURIComponent(w.timezone || 'auto') +
    '&forecast_days=1';

  fetch(url, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('Weather service returned ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.current) throw new Error('No weather data');
      weather.data = data;
      weather.status = 'ready';
      weather.updatedAt = Date.now();
      if (currentTab === 'home') renderHome();
    })
    .catch(function (err) {
      weather.status = 'error';
      weather.error = (err && err.message) ? err.message : 'Weather is unavailable right now.';
      if (currentTab === 'home') renderHome();
    });
}

function geocodePlace(query) {
  var q = String(query || '').trim();
  if (!q) return Promise.reject(new Error('Please type a city or ZIP code.'));
  var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
    encodeURIComponent(q) + '&count=1&language=en&format=json';
  return fetch(url, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('City search failed (' + res.status + ')');
      return res.json();
    })
    .then(function (data) {
      var hit = data && data.results && data.results[0];
      if (!hit) throw new Error('I could not find "' + q + '". Try a ZIP code or a nearby city.');
      var parts = [hit.name];
      if (hit.admin1) parts.push(hit.admin1);
      var label = parts.join(', ');
      if (hit.postcode) label += ' (' + hit.postcode + ')';
      return {
        label: label,
        lat: hit.latitude,
        lon: hit.longitude,
        timezone: hit.timezone || 'auto',
        query: q
      };
    });
}

function weatherInner() {
  var w = state.settings.weather;
  if (weather.status === 'loading' || weather.status === 'idle') {
    return '<div class="weather-row">' +
      '<span class="weather-emoji loading">\uD83C\uDF24\uFE0F</span>' +
      '<div class="weather-copy"><p class="weather-place">' + esc(w.label) + '</p>' +
      '<p class="weather-note">Looking out the window\u2026</p></div>' +
      '<span class="skeleton-pill"></span></div>';
  }
  if (weather.status === 'error' || !weather.data) {
    return '<div class="weather-row">' +
      '<span class="weather-emoji">\uD83C\uDF25\uFE0F</span>' +
      '<div class="weather-copy"><p class="weather-place">' + esc(w.label) + '</p>' +
      '<p class="weather-note">Weather is unavailable right now \u00B7 ' + esc(weather.error || 'offline') + '</p></div>' +
      '<button class="ghost-btn" data-action="refresh-weather">Retry</button></div>';
  }

  var cur = weather.data.current || {};
  var daily = weather.data.daily || {};
  var look = weatherLook(cur.weather_code);
  var temp = Math.round(Number(cur.temperature_2m));
  var feels = Math.round(Number(cur.apparent_temperature));
  var hi = daily.temperature_2m_max ? Math.round(Number(daily.temperature_2m_max[0])) : null;
  var lo = daily.temperature_2m_min ? Math.round(Number(daily.temperature_2m_min[0])) : null;
  var updated = timeLabel(weather.updatedAt);

  return '<div class="weather-row">' +
    '<span class="weather-emoji">' + look[0] + '</span>' +
    '<div class="weather-copy">' +
    '<p class="weather-place">' + esc(w.label) + '</p>' +
    '<p class="weather-line"><strong class="weather-temp">' + temp + '\u00B0</strong>' +
    '<span class="weather-cond">' + esc(look[1]) + '</span>' +
    (hi != null && lo != null ? '<span class="weather-hilo">High ' + hi + '\u00B0 \u00B7 Low ' + lo + '\u00B0</span>' : '') +
    '</p>' +
    '<p class="weather-note">Feels like ' + feels + '\u00B0' + tempUnit().slice(1) + ' \u00B7 Updated ' + esc(updated) + '</p>' +
    '</div>' +
    '<button class="ghost-btn" data-action="refresh-weather" title="Refresh weather">\u21BB</button>' +
    '</div>';
}

function memberCardHTML(m, date) {
  var chores = choreStats(m.id, date);
  var study = studyStats(m.id, date);
  var right;
  if (m.kid) {
    right = '<div class="piggy"><span class="piggy-ico">\uD83D\uDC37</span>' +
      '<strong>' + money(balanceOf(m.id)) + '</strong><small>Piggy Bank</small></div>';
  } else {
    right = '<div class="piggy stars"><span class="piggy-ico">\u2B50</span>' +
      '<strong>' + monthStampCount() + '</strong><small>Family Stars</small></div>';
  }
  var highFive = m.kid && state.highFives[date] && state.highFives[date][m.id];
  return '<article class="member-card tint-' + esc(m.tint || 'mint') + '" data-action="open-member-chores" data-member="' + esc(m.id) + '">' +
    '<div class="avatar-ring"><img src="' + esc(avatarSrc(m)) + '" alt="' + esc(m.name) + ' mascot"></div>' +
    '<div class="member-main">' +
    '<h3 class="member-name">' + esc(m.name) + '</h3>' +
    '<p class="member-sub">' + esc(m.subtitle || '') + '</p>' +
    '<div class="member-stats">' +
    '<span class="mini-stat" data-action="go-tab" data-tab="chores" role="button" tabindex="0"><span>\u2705</span>' + chores.done + '/' + chores.total + ' chores</span>' +
    '<span class="mini-stat" data-action="go-tab" data-tab="study" role="button" tabindex="0"><span>\uD83D\uDCDA</span>' + (study.total ? (study.done + '/' + study.total + ' study') : '\u2014 study') + '</span>' +
    '</div></div>' +
    '<div class="member-right">' + right +
    (highFive ? '<span class="hf-badge">\uD83D\uDE4C High-Five!</span>' : '') +
    '</div></article>';
}

function renderHome() {
  var panel = $('#tab-home');
  if (!panel) return;
  var today = dateKey();
  var mission = state.missions.current && state.missions.current.date === today ? state.missions.current : null;
  var streak = stampStreak();
  var monthCount = monthStampCount();

  var missionPreview;
  if (mission) {
    missionPreview = '<section class="card mission-preview tap-card' + (mission.done ? ' done' : '') + '" data-action="go-tab" data-tab="missions">' +
      '<header class="card-head"><h2>\uD83C\uDFB2 Today\u2019s Family Mission</h2>' +
      '<span class="pill">' + (mission.done ? 'Done \u2713' : 'Together') + '</span></header>' +
      '<p class="mission-preview-emoji">' + esc(mission.emoji || '\uD83C\uDFB2') + '</p>' +
      '<p class="mission-preview-text">' + esc(mission.text) + '</p>' +
      '<button class="btn soft" data-action="go-tab" data-tab="missions">Open missions \u2192</button>' +
      '</section>';
  } else {
    missionPreview = '<section class="card mission-preview tap-card" data-action="go-tab" data-tab="missions">' +
      '<header class="card-head"><h2>\uD83C\uDFB2 Today\u2019s Family Mission</h2></header>' +
      '<p class="mission-preview-text">No mission picked yet today.</p>' +
      '<button class="btn soft" data-action="go-tab" data-tab="missions">Pick a mission \u2192</button>' +
      '</section>';
  }

  var days = weekDates(nyToday());
  var dots = '';
  days.forEach(function (d) {
    var key = dateKey(d);
    var stamp = stampFor(key);
    dots += '<span class="dot' + (stamp ? ' filled' : '') + (key === today ? ' today' : '') + '" title="' + esc(shortDate(d)) + '">' +
      (stamp ? '\u2B50' : '') + '</span>';
  });

  var stampPreview = '<section class="card stamp-preview tap-card" data-action="go-tab" data-tab="missions">' +
    '<header class="card-head"><h2>\uD83C\uDF1F Weekly Stamps</h2>' +
    '<span class="pill warm">\uD83D\uDD25 ' + streak + '-day streak</span></header>' +
    '<div class="dots">' + dots + '</div>' +
    '<p class="muted-line">' + monthCount + ' stamp' + (monthCount === 1 ? '' : 's') + ' this month</p>' +
    '<button class="btn soft" data-action="go-tab" data-tab="missions">Stamp board \u2192</button>' +
    '</section>';

  panel.innerHTML =
    '<section class="card weather-card">' + weatherInner() + '</section>' +
    '<section class="shell mint">' +
    '<div class="shell-head">' +
    '<h2>\uD83C\uDFE1 Our Family Today</h2>' +
    '<p>Tap a card to open their chores</p>' +
    '</div>' +
    '<div class="family-grid">' +
    state.members.map(function (m) { return memberCardHTML(m, today); }).join('') +
    '</div></section>' +
    homeScheduleHTML() +
    '<div class="quick-grid">' + missionPreview + stampPreview + '</div>';

  if (weather.status === 'idle') fetchWeather(false);
}

/* ---------- Home: upcoming schedule preview ---------- */

function homeScheduleHTML() {
  var today = nyToday();
  var rows = '';
  var shown = 0;
  var groups = calDaysWithEvents(today, 4, calendarFilter);

  groups.forEach(function (g) {
    if (shown >= 5) return;
    var label = g.key === dateKey(today) ? 'Today'
      : (g.key === dateKey(addDays(today, 1)) ? 'Tomorrow' : shortDate(g.date));
    g.events.slice(0, 5 - shown).forEach(function (ev) {
      if (shown >= 5) return;
      shown++;
      var look = calLook(ev);
      rows += '<li class="home-ev" style="--ev-dot:' + look.dot + '">' +
        '<span class="home-ev-day">' + esc(label) + '</span>' +
        '<span class="home-ev-dot"></span>' +
        '<span class="home-ev-ico">' + esc(ev.emoji || '\uD83D\uDCC5') + '</span>' +
        '<span class="home-ev-title">' + esc(ev.title) + '</span>' +
        '<span class="home-ev-time">' + (ev.allDay ? 'All day' : esc(calClock(ev.startTime))) + '</span>' +
        '</li>';
    });
  });

  var body = rows
    ? '<ul class="home-ev-list">' + rows + '</ul>' +
      '<p class="muted-line">' + (calendarFilter === 'all' ? 'Everyone\u2019s plans' : calLook({ members: [calendarFilter] }).label + '\u2019s plans') + ' \u00B7 ' + FAMILY_TZ_LABEL + '</p>'
    : '<div class="home-ev-empty">' +
      '<span class="home-ev-empty-ico">\uD83C\uDF3C</span>' +
      '<p>No plans in the next few days. A practice, a playdate, a movie night \u2014 add it here and everyone sees it.</p>' +
      '</div>';

  return '<section class="card home-schedule tap-card" data-action="go-tab" data-tab="calendar">' +
    '<header class="card-head">' +
    '<div><h2>\uD83D\uDCC5 Upcoming Schedule</h2><p class="muted">Next 4 days \u00B7 ' + FAMILY_TZ_LABEL + '</p></div>' +
    '<span class="pill warm">' + calendarEvents().length + ' event' + (calendarEvents().length === 1 ? '' : 's') + '</span>' +
    '</header>' +
    body +
    '<button class="btn soft" data-action="cal-add-event">+ Add Event</button>' +
    '</section>';
}


/* =====================================================================
   Our Family Dashboard — 04 · Chores, high-five & Sunday allowance
   ===================================================================== */

function askConfirm(title, message, yesLabel, onYes) {
  openModal(
    '<div class="modal-head"><h2>' + esc(title) + '</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<p class="modal-text">' + esc(message) + '</p>' +
    '<div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn danger" data-action="confirm-yes">' + esc(yesLabel || 'Yes') + '</button></div>'
  );
  window.__confirmYes = onYes;
}

function choreRowHTML(member, chore, done) {
  return '<li class="row' + (done ? ' done' : '') + '">' +
    '<button class="check" data-action="toggle-chore" data-member="' + esc(member.id) + '" data-chore="' + esc(chore.id) + '"' +
    ' aria-pressed="' + (done ? 'true' : 'false') + '" aria-label="' + (done ? 'Mark not done' : 'Mark done') + '">' +
    '<span class="check-mark">\u2713</span></button>' +
    '<span class="row-title">' + esc(chore.title) + '</span>' +
    '<span class="row-actions">' +
    '<button class="icon-btn" data-action="edit-chore" data-member="' + esc(member.id) + '" data-chore="' + esc(chore.id) + '" aria-label="Edit chore">\u270F\uFE0F</button>' +
    '<button class="icon-btn danger" data-action="delete-chore" data-member="' + esc(member.id) + '" data-chore="' + esc(chore.id) + '" aria-label="Delete chore">\u2715</button>' +
    '</span></li>';
}

function weekDotsHTML(memberId, d) {
  var dots = weeklyChoreDots(memberId, d);
  var html = '<div class="week-dots">';
  weekDates(d).forEach(function (day, i) {
    var info = dots[i];
    html += '<div class="week-dot' + (info.done ? ' done' : '') + (info.today ? ' today' : '') + '" title="' + esc(shortDate(day)) + '">' +
      '<span class="wd-label">' + WEEK_LABELS[i] + '</span>' +
      '<span class="wd-circle">' + (info.done ? '\u2713' : '') + '</span>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

function renderChores() {
  var panel = $('#tab-chores');
  if (!panel) return;
  var today = dateKey();
  var isSunday = nyToday().getDay() === 0;

  var cards = state.members.map(function (m) {
    var list = choresFor(m.id);
    var stats = choreStats(m.id, today);
    var pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    var allDone = stats.total > 0 && stats.done === stats.total;
    var hf = m.kid && state.highFives[today] && state.highFives[today][m.id];

    var rows = list.map(function (c) {
      return choreRowHTML(m, c, !!choreDoneMap(today, m.id)[c.id]);
    }).join('');

    if (!list.length) {
      rows = '<li class="empty-row">No chores yet \u2014 add the first one below.</li>';
    }

    return '<section class="card chore-card tint-' + esc(m.tint || 'mint') + '">' +
      '<header class="chore-head">' +
      '<img class="avatar sm" src="' + esc(avatarSrc(m)) + '" alt="">' +
      '<div class="chore-who"><h3>' + esc(m.name) + '</h3>' +
      '<p class="muted">' + stats.done + '/' + stats.total + ' done today' + (hf ? ' \u00B7 \uD83D\uDE4C High-Five!' : '') + '</p></div>' +
      '<span class="pill ' + (allDone ? 'good' : '') + '">' + (allDone && stats.total ? 'All done!' : pct + '%') + '</span>' +
      '</header>' +
      '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
      '<ul class="list">' + rows + '</ul>' +
      '<button class="add-row" data-action="add-chore" data-member="' + esc(m.id) + '">+ Add ' + esc(m.name) + ' chore</button>' +
      '</section>';
  }).join('');

  var weekStartD = weekStartDate(nyToday());
  var weekLabel = 'Week of ' + shortDate(weekStartD) + ' \u2013 ' + shortDate(addDays(weekStartD, 6));
  var weekKey = dateKey(weekStartD);

  var allowances = kidMembers().map(function (m) {
    var amount = allowanceOf(m.id);
    var entry = allowanceEntry(m.id, weekKey);
    var dotsDone = weeklyChoreDots(m.id, nyToday()).filter(function (x) { return x.done; }).length;
    return '<div class="allow-kid" data-allowance-kid="' + esc(m.id) + '">' +
      '<div class="allow-head">' +
      '<img class="avatar sm" src="' + esc(avatarSrc(m)) + '" alt="">' +
      '<div><h3>' + esc(m.name) + '</h3><p class="muted">' + money(amount) + ' / week \u00B7 ' + dotsDone + '/7 days</p></div>' +
      '<span class="piggy-pill">\uD83D\uDC37 ' + money(balanceOf(m.id)) + '</span>' +
      '</div>' +
      weekDotsHTML(m.id, nyToday()) +
      (entry
        ? '<div class="allow-actions"><button class="btn good" disabled>Approved \u2713 +' + money(entry.amount || amount) + '</button>' +
        '<button class="link-btn" data-action="undo-allowance" data-member="' + esc(m.id) + '">Undo</button></div>'
        : '<div class="allow-actions"><button class="btn primary" data-action="approve-allowance" data-member="' + esc(m.id) + '">Approve &amp; Add ' + money(amount) + '</button></div>') +
      '</div>';
  }).join('');

  panel.innerHTML =
    '<section class="card section-intro">' +
    '<header class="card-head"><div><h2>\u2705 Today\u2019s Chores</h2>' +
    '<p class="muted">Everyone checks off their own list \u2014 finishing all of them earns a High-Five.</p></div>' +
    '<button class="btn primary small" data-action="add-chore" data-member="">+ Add Chore</button></header>' +
    '</section>' +
    cards +
    '<section class="card allowance-card' + (isSunday ? ' sunday' : '') + '">' +
    '<header class="card-head">' +
    '<div><h2>\uD83D\uDC37 Sunday Allowance Check <span class="tag">Parent</span></h2>' +
    '<p class="muted">' + weekLabel + ' \u00B7 Mom or Dada approves the weekly allowance.' +
    (isSunday ? ' <strong>\uD83C\uDF1E It\u2019s Sunday \u2014 allowance day!</strong>' : '') + '</p></div>' +
    '</header>' +
    '<div class="allow-list">' + allowances + '</div>' +
    '<p class="hint">Every deposit pops money into the piggy bank and lands in the Allowance ledger.</p>' +
    '</section>';
}

/* ---------- chore editing ---------- */

function openChoreModal(memberId, choreId) {
  var existing = choreId ? byId(choresFor(memberId), choreId) : null;
  var options = state.members.map(function (m) {
    return '<option value="' + esc(m.id) + '"' + (m.id === memberId ? ' selected' : '') + '>' + esc(m.name) + '</option>';
  }).join('');

  openModal(
    '<div class="modal-head"><h2>' + (existing ? 'Edit chore' : 'Add a chore') + '</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<label class="field"><span>Chore</span>' +
    '<input id="choreTitle" type="text" maxlength="80" placeholder="e.g. Feed the cat" value="' + esc(existing ? existing.title : '') + '" data-autofocus></label>' +
    '<label class="field"><span>Who is it for?</span>' +
    '<select id="choreMember">' + options + '</select></label>' +
    '<div class="modal-actions">' +
    '<button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" data-action="save-chore" data-member="' + esc(memberId) + '" data-chore="' + esc(choreId || '') + '">Save chore</button>' +
    '</div>'
  );
}

function saveChore(btn) {
  var originalMember = btn.getAttribute('data-member');
  var choreId = btn.getAttribute('data-chore');
  var titleEl = $('#choreTitle');
  var memberEl = $('#choreMember');
  if (!titleEl || !memberEl) return;
  var title = String(titleEl.value || '').trim();
  var target = memberEl.value;
  if (!title) { toast('Please give the chore a name.'); return; }
  if (!state.chores[target]) state.chores[target] = [];

  if (choreId) {
    var item = byId(choresFor(originalMember), choreId);
    if (!item) { closeModal(); return; }
    item.title = title;
    if (target !== originalMember) {
      state.chores[originalMember] = choresFor(originalMember).filter(function (c) { return c.id !== choreId; });
      state.chores[target].push(item);
    }
  } else {
    state.chores[target].push({ id: uid(target + '-c'), title: title });
  }
  closeModal();
  commit('Chore saved \u2705');
}

function deleteChore(memberId, choreId) {
  var item = byId(choresFor(memberId), choreId);
  if (!item) return;
  askConfirm('Delete this chore?', '\u201C' + item.title + '\u201D will be removed from ' + (memberById(memberId) || {}).name + '\u2019s list.', 'Delete', function () {
    state.chores[memberId] = choresFor(memberId).filter(function (c) { return c.id !== choreId; });
    closeModal();
    commit('Chore deleted');
  });
}

function toggleChore(memberId, choreId) {
  var today = dateKey();
  if (!state.choreLog[today]) state.choreLog[today] = {};
  if (!state.choreLog[today][memberId]) state.choreLog[today][memberId] = {};
  var map = state.choreLog[today][memberId];
  var nowDone = !map[choreId];
  if (nowDone) map[choreId] = true; else delete map[choreId];

  var member = memberById(memberId);
  var fireHighFive = false;
  if (nowDone && member && member.kid && allChoresDone(memberId, today)) {
    if (!state.highFives[today]) state.highFives[today] = {};
    if (!state.highFives[today][memberId]) {
      state.highFives[today][memberId] = true;
      addStamp(today, 'chores', member.name + ' finished every chore');
      fireHighFive = true;
    }
  }

  commit();
  if (nowDone) playPop();
  if (fireHighFive) showHighFive(member);
}

function showHighFive(member) {
  showCelebration({
    avatar: avatarSrc(member),
    emoji: '\uD83D\uDE4C',
    title: 'High-Five!',
    message: member.name + ' finished every single chore today. So proud of you!',
    badge: '\uD83C\uDF1F Day complete',
    confetti: ['\uD83D\uDE4C', '\u2B50', '\uD83C\uDF89', '\uD83D\uDC96'],
    timeout: 6000
  });
}

/* ---------- parent PIN ---------- */

function withParentPin(action) {
  if (!state.settings.pin || !state.settings.pin.enabled) { action(); return; }
  pendingPinAction = action;
  openModal(
    '<div class="modal-head"><h2>\uD83D\uDD12 Parent check</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<p class="modal-text">Enter the 4-digit parent PIN to continue.</p>' +
    '<input id="pinInput" class="pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*" placeholder="\u2022 \u2022 \u2022 \u2022" data-autofocus>' +
    '<p class="pin-error" id="pinError" hidden>That PIN does not match. Try again.</p>' +
    '<div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" data-action="pin-submit">Unlock</button></div>'
  );
}

function submitPin() {
  var input = $('#pinInput');
  if (!input) return;
  var code = String(input.value || '').trim();
  var expected = String((state.settings.pin && state.settings.pin.code) || '');
  if (code !== expected) {
    var err = $('#pinError');
    if (err) err.hidden = false;
    input.value = '';
    input.focus();
    return;
  }
  var action = pendingPinAction;
  pendingPinAction = null;
  closeModal();
  if (typeof action === 'function') action();
}

/* ---------- Sunday allowance ---------- */

function approveAllowance(memberId) {
  var amount = allowanceOf(memberId);
  var weekKey = allowanceWeekKey(nyToday());
  if (allowanceEntry(memberId, weekKey)) { toast('Already approved for this week.'); return; }
  if (!state.ledger[memberId]) state.ledger[memberId] = [];

  state.ledger[memberId].push({
    id: uid('tx'),
    type: 'allowance',
    amount: amount,
    ts: Date.now(),
    weekKey: weekKey,
    note: 'Weekly chore allowance (' + shortDate(weekStartDate(nyToday())) + ' \u2013 ' + shortDate(addDays(weekStartDate(nyToday()), 6)) + ')'
  });
  if (!state.allowances[weekKey]) state.allowances[weekKey] = {};
  state.allowances[weekKey][memberId] = { amount: amount, at: Date.now() };

  commit('Allowance approved \uD83D\uDCB0');
  var anchor = document.querySelector('[data-allowance-kid="' + memberId + '"]');
  moneyBurst(anchor);
  var m = memberById(memberId);
  showCelebration({
    avatar: avatarSrc(m),
    emoji: '\uD83D\uDCB8',
    title: 'Allowance added!',
    message: m.name + ' earned ' + money(amount) + ' this week. Piggy bank updated.',
    badge: '\uD83D\uDC37 ' + money(balanceOf(memberId)),
    confetti: ['\uD83D\uDCB0', '\uD83D\uDCB5', '\u2728', '\uD83D\uDC37'],
    timeout: 3600
  });
}

function undoAllowance(memberId) {
  var weekKey = allowanceWeekKey(nyToday());
  askConfirm('Undo this allowance?', 'The ' + money(allowanceOf(memberId)) + ' allowance entry will be removed from ' + (memberById(memberId) || {}).name + '\u2019s ledger.', 'Undo', function () {
    state.ledger[memberId] = ledgerFor(memberId).filter(function (t) {
      return !(t.type === 'allowance' && t.weekKey === weekKey);
    });
    if (state.allowances[weekKey]) delete state.allowances[weekKey][memberId];
    closeModal();
    commit('Allowance entry removed');
  });
}

function requestAllowanceApproval(memberId) {
  withParentPin(function () { approveAllowance(memberId); });
}


/* =====================================================================
   Our Family Dashboard — 05 · Family missions & stamp board
   ===================================================================== */

function stampDotsHTML() {
  var today = dateKey();
  var days = weekDates(nyToday());
  var html = '<div class="stamp-dots">';
  days.forEach(function (d, i) {
    var key = dateKey(d);
    var stamp = stampFor(key);
    html += '<div class="stamp-day' + (stamp ? ' stamped' : '') + (key === today ? ' today' : '') + '">' +
      '<span class="stamp-label">' + WEEK_LABELS[i] + '</span>' +
      '<span class="stamp-circle">' +
      (stamp ? '<span class="stamp-star">\u2B50</span>' : '') +
      '</span>' +
      '<span class="stamp-mini">' + (stamp ? sourceBadges(stamp) : '') + '</span>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

function sourceBadges(stamp) {
  var icons = { mission: '\uD83C\uDFB2', chores: '\u2705', study: '\uD83D\uDCDA' };
  var out = '';
  (stamp.sources || []).forEach(function (s) {
    out += '<span title="' + esc(s) + '">' + (icons[s] || '\u2B50') + '</span>';
  });
  return out;
}

function renderMissions() {
  var panel = $('#tab-missions');
  if (!panel) return;
  var today = dateKey();
  var mission = state.missions.current && state.missions.current.date === today ? state.missions.current : null;
  var streak = stampStreak();
  var monthCount = monthStampCount();
  var stamp = stampFor(today);

  var missionCard;
  if (mission) {
    missionCard = '<section class="card mission-card' + (mission.done ? ' done' : '') + '">' +
      '<header class="card-head"><div><h2>\uD83C\uDFB2 Today\u2019s Family Mission</h2>' +
      '<p class="muted">One little adventure for the whole family.</p></div>' +
      '<span class="pill">Together ' + state.missions.completedCount + '\u00D7</span></header>' +
      '<div class="mission-body">' +
      '<span class="mission-emoji">' + esc(mission.emoji || '\uD83C\uDFB2') + '</span>' +
      '<p class="mission-text">' + esc(mission.text) + '</p>' +
      (mission.done ? '<span class="done-flag">\u2705 Done together today</span>' : '') +
      '</div>' +
      '<div class="mission-actions">' +
      '<button class="btn good big" data-action="mission-done"' + (mission.done ? ' disabled' : '') + '>' +
      (mission.done ? '\u2705 We Did It Together!' : '\u2705 We Did It Together!') + '</button>' +
      '<button class="btn big" data-action="mission-shuffle">\uD83D\uDD04 Pick Another Mission</button>' +
      '</div>' +
      '<p class="hint">A family mission is meant to be done together \u2014 once a day is plenty.</p>' +
      '</section>';
  } else {
    missionCard = '<section class="card mission-card">' +
      '<header class="card-head"><h2>\uD83C\uDFB2 Today\u2019s Family Mission</h2></header>' +
      '<p class="modal-text">Add a mission to the jar to get started.</p>' +
      '<div class="mission-actions"><button class="btn primary" data-action="mission-shuffle">\uD83C\uDFB2 Pick a mission</button></div>' +
      '</section>';
  }

  var poolRows = state.missions.pool.map(function (m) {
    var active = mission && mission.id === m.id;
    return '<li class="row mission-row' + (active ? ' active' : '') + '">' +
      '<span class="mission-row-emoji">' + esc(m.emoji || '\u2728') + '</span>' +
      '<span class="row-title">' + esc(m.text) + '</span>' +
      '<span class="row-actions">' +
      '<button class="icon-btn danger" data-action="delete-mission" data-mission="' + esc(m.id) + '" aria-label="Remove mission">\u2715</button>' +
      '</span></li>';
  }).join('');

  panel.innerHTML =
    '<section class="card stamp-card">' +
    '<header class="card-head"><div><h2>\uD83C\uDFA8 Our Stamp Board</h2>' +
    '<p class="muted">A mission or a fully finished day earns a stamp.</p></div>' +
    '<span class="pill warm">\uD83D\uDD25 ' + streak + '-day streak</span></header>' +
    stampDotsHTML() +
    '<div class="stamp-footer">' +
    '<span class="pill soft">This month: ' + monthCount + ' stamp' + (monthCount === 1 ? '' : 's') + (stamp ? ' \u00B7 Today stamped' : ' \u00B7 Today not yet') + '</span>' +
    '<button class="btn soft" data-action="open-stamp-calendar">\uD83D\uDCC5 View Stamp Calendar</button>' +
    '</div>' +
    '</section>' +
    missionCard +
    '<section class="card jar-card">' +
    '<header class="card-head"><div><h2>\uD83E\uDDFA Mission Jar</h2>' +
    '<p class="muted">Add or remove ideas any time.</p></div>' +
    '<button class="btn small" data-action="add-mission">+ Add Mission</button></header>' +
    '<ul class="list">' + (poolRows || '<li class="empty-row">The jar is empty. Add a mission!</li>') + '</ul>' +
    '</section>';
}

function markMissionDone() {
  var today = dateKey();
  var mission = state.missions.current;
  if (!mission || mission.date !== today) { toast('Pick a mission first \uD83C\uDFB2'); return; }
  if (mission.done) { toast('This mission is already done today \uD83D\uDC96'); return; }
  mission.done = true;
  state.missions.completedCount = Number(state.missions.completedCount || 0) + 1;
  state.missions.history = state.missions.history || [];
  state.missions.history.push({ date: today, id: mission.id, text: mission.text, emoji: mission.emoji });
  addStamp(today, 'mission', mission.text);
  commit('Family stamp earned \u2B50');
  showCelebration({
    emoji: mission.emoji || '\u2B50',
    title: 'We did it together!',
    message: '\u201C' + mission.text + '\u201D \u00B7 a new stamp on the board.',
    badge: '\u2B50 ' + monthStampCount() + ' stamp' + (monthStampCount() === 1 ? '' : 's') + ' this month',
    confetti: ['\u2B50', '\uD83C\uDF89', '\uD83D\uDC96', '\u2728'],
    timeout: 4200
  });
}

function shuffleMissionAndRender() {
  var pick = shuffleMission();
  if (!pick) { toast('Add a mission to the jar first.'); return; }
  commit('New mission picked \uD83C\uDFB2');
}

function openMissionModal() {
  openModal(
    '<div class="modal-head"><h2>Add a family mission</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<label class="field"><span>What will the family do together?</span>' +
    '<input id="missionText" type="text" maxlength="80" placeholder="e.g. Build a pillow fort" data-autofocus></label>' +
    '<label class="field"><span>Pick a little icon</span>' +
    '<div class="emoji-picker" id="missionEmoji">' +
    ['\u2728', '\uD83C\uDFB2', '\uD83E\uDD55', '\uD83C\uDF6A', '\uD83C\uDFB5', '\uD83D\uDEB6', '\uD83D\uDCD6', '\uD83D\uDC31', '\uD83C\uDF3F', '\uD83E\uDDF9', '\uD83C\uDFA8', '\uD83D\uDE97']
      .map(function (e, i) {
        return '<button type="button" class="emoji-chip' + (i === 0 ? ' selected' : '') + '" data-action="pick-mission-emoji" data-emoji="' + e + '">' + e + '</button>';
      }).join('') +
    '</div></label>' +
    '<div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" data-action="save-mission">Add to jar</button></div>'
  );
  window.__missionEmoji = '\u2728';
}

function saveMission() {
  var input = $('#missionText');
  if (!input) return;
  var text = String(input.value || '').trim();
  if (!text) { toast('Write the mission first.'); return; }
  state.missions.pool.push({ id: uid('m'), text: text, emoji: window.__missionEmoji || '\u2728' });
  closeModal();
  commit('Mission added to the jar');
}

function deleteMission(missionId) {
  var item = byId(state.missions.pool, missionId);
  if (!item) return;
  askConfirm('Remove this mission?', '\u201C' + item.text + '\u201D will leave the jar.', 'Remove', function () {
    state.missions.pool = state.missions.pool.filter(function (m) { return m.id !== missionId; });
    if (state.missions.current && state.missions.current.id === missionId) state.missions.current = null;
    closeModal();
    commit('Mission removed');
  });
}

/* ---------- stamp calendar ---------- */

function openStampCalendar() {
  var nowNY = nyParts();
  calCursor = { y: nowNY.year, m: nowNY.month - 1 };
  openModal(
    '<div class="modal-head"><h2>\uD83D\uDCC5 Stamp Calendar</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<div id="calBody">' + calendarHTML() + '</div>'
  );
}

function calendarHTML() {
  var y = calCursor.y;
  var m = calCursor.m;
  var first = new Date(y, m, 1);
  var monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(first);
  var lead = (first.getDay() + 6) % 7;
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var todayKey = dateKey();

  var cells = '';
  for (var i = 0; i < lead; i++) cells += '<span class="cal-cell empty"></span>';
  for (var d = 1; d <= daysInMonth; d++) {
    var key = y + '-' + pad2(m + 1) + '-' + pad2(d);
    var stamp = stampFor(key);
    cells += '<span class="cal-cell' + (stamp ? ' stamped' : '') + (key === todayKey ? ' today' : '') + '">' +
      '<span class="cal-day">' + d + '</span>' +
      (stamp ? '<span class="cal-star">\u2B50</span>' : '') +
      (stamp ? '<span class="cal-sources">' + sourceBadges(stamp) + '</span>' : '') +
      '</span>';
  }

  var monthTotal = 0;
  for (var d2 = 1; d2 <= daysInMonth; d2++) {
    if (stampFor(y + '-' + pad2(m + 1) + '-' + pad2(d2))) monthTotal++;
  }

  return '<div class="cal-head">' +
    '<button class="icon-btn" data-action="cal-prev" aria-label="Previous month">\u2039</button>' +
    '<strong>' + monthLabel + '</strong>' +
    '<button class="icon-btn" data-action="cal-next" aria-label="Next month">\u203A</button>' +
    '</div>' +
    '<div class="cal-week">' + WEEK_LABELS.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>' +
    '<div class="cal-grid">' + cells + '</div>' +
    '<p class="cal-summary">' + monthTotal + ' stamp' + (monthTotal === 1 ? '' : 's') + ' this month \u00B7 \uD83D\uDD25 ' + stampStreak() + '-day streak</p>';
}

function calStep(delta) {
  if (!calCursor) return;
  var d = new Date(calCursor.y, calCursor.m + delta, 1);
  calCursor = { y: d.getFullYear(), m: d.getMonth() };
  var body = $('#calBody');
  if (body) body.innerHTML = calendarHTML();
}


/* =====================================================================
   Our Family Dashboard — 06 · Study lists, study timer & tablet-off alarm
   ===================================================================== */

function sortedStudy(memberId) {
  var list = studyFor(memberId).slice();
  list.sort(function (a, b) {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return 0;
  });
  return list;
}

function studyRowHTML(member, item, done) {
  return '<li class="row study-row' + (done ? ' done' : '') + (item.pinned ? ' pinned' : '') + '">' +
    '<button class="check round" data-action="toggle-study" data-member="' + esc(member.id) + '" data-item="' + esc(item.id) + '"' +
    ' aria-pressed="' + (done ? 'true' : 'false') + '" aria-label="' + (done ? 'Mark not done' : 'Mark done') + '">' +
    '<span class="check-mark">\u2713</span></button>' +
    '<span class="row-title">' + esc(item.title) + '</span>' +
    (item.tag ? '<span class="tag-pill">' + esc(item.tag) + '</span>' : '') +
    (item.timer ? '<button class="timer-chip" data-action="start-reading-timer" data-min="' + Number(item.timer) + '">\u25B6 ' + Number(item.timer) + ':00 Timer</button>' : '') +
    '<span class="row-actions">' +
    '<button class="icon-btn pin' + (item.pinned ? ' on' : '') + '" data-action="toggle-pin" data-member="' + esc(member.id) + '" data-item="' + esc(item.id) + '" aria-label="Pin item" title="Pin to the top">\uD83D\uDCCC</button>' +
    '<button class="icon-btn" data-action="edit-study" data-member="' + esc(member.id) + '" data-item="' + esc(item.id) + '" aria-label="Edit item">\u270F\uFE0F</button>' +
    '<button class="icon-btn danger" data-action="delete-study" data-member="' + esc(member.id) + '" data-item="' + esc(item.id) + '" aria-label="Delete item">\u2715</button>' +
    '</span></li>';
}

function renderStudy() {
  var panel = $('#tab-study');
  if (!panel) return;
  var today = dateKey();

  var kidCards = kidMembers().map(function (m) {
    var list = sortedStudy(m.id);
    var stats = studyStats(m.id, today);
    var pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    var rows = list.map(function (item) {
      return studyRowHTML(m, item, !!studyDoneMap(today, m.id)[item.id]);
    }).join('');
    if (!list.length) rows = '<li class="empty-row">No study items yet \u2014 add the first one below.</li>';

    return '<section class="card study-card tint-' + esc(m.tint || 'blue') + '">' +
      '<header class="chore-head">' +
      '<img class="avatar sm" src="' + esc(avatarSrc(m)) + '" alt="">' +
      '<div class="chore-who"><h3>' + esc(m.name) + '</h3>' +
      '<p class="muted">' + stats.done + '/' + stats.total + ' done today</p></div>' +
      '<button class="btn small" data-action="add-study" data-member="' + esc(m.id) + '">+ Add Study Item</button>' +
      '</header>' +
      '<div class="progress blue"><span style="width:' + pct + '%"></span></div>' +
      '<ul class="list">' + rows + '</ul>' +
      '</section>';
  }).join('');

  var t = state.tablet;
  var isClock = t.mode === 'clock';
  var tabletStatus;
  if (tabletRuntime.running) {
    tabletStatus = 'Countdown running \u00B7 ' + mmss(tabletRuntime.countdownLeft) + ' left';
  } else if (isClock) {
    tabletStatus = t.enabled ? 'Rings every day at ' + esc(t.clock) : 'Turn the switch on to use the bedtime alarm.';
  } else {
    tabletStatus = t.enabled ? ('Set for ' + Number(t.minutes) + ' minutes') : 'Turn the switch on to use the countdown.';
  }

  panel.innerHTML =
    '<section class="card section-intro">' +
    '<header class="card-head"><div><h2>\uD83D\uDCDA Today\u2019s Study Plan</h2>' +
    '<p class="muted">Arya and Delia each check off their own study. Pinned items come back every morning.</p></div></header>' +
    '</section>' +
    kidCards +
    '<section class="card timer-card">' +
    '<div class="segmented">' +
    '<button class="seg' + (timer.mode === 'countdown' ? ' active' : '') + '" data-action="timer-mode" data-mode="countdown">\u23F3 Countdown</button>' +
    '<button class="seg' + (timer.mode === 'stopwatch' ? ' active' : '') + '" data-action="timer-mode" data-mode="stopwatch">\u23F1\uFE0F Stopwatch</button>' +
    '</div>' +
    '<p class="timer-hint" id="timerHint">' + (timer.running ? 'Reading time in progress\u2026' : 'Press start when you are ready.') + '</p>' +
    '<div class="timer-display" id="timerDisplay">' + timerDisplayText() + '</div>' +
    '<div class="timer-actions">' +
    '<button class="btn good big" id="timerToggle" data-action="timer-toggle">' + (timer.running ? '\u23F8 Pause' : '\u25B6 Start') + '</button>' +
    '<button class="btn big" data-action="timer-reset">\u21BA Reset</button>' +
    '</div>' +
    '<div class="presets">' +
    [10, 20, 30].map(function (min) {
      return '<button class="preset' + (timer.mode === 'countdown' && timer.total === min * 60 ? ' active' : '') + '" data-action="timer-preset" data-min="' + min + '">' + min + ' min</button>';
    }).join('') +
    '</div>' +
    '<div class="custom-row">' +
    '<input id="customMinutes" type="number" min="1" max="180" inputmode="numeric" placeholder="Custom minutes">' +
    '<button class="btn small" data-action="timer-custom">Set minutes</button>' +
    '</div>' +
    '<p class="hint">A gentle chime rings when the countdown reaches zero.</p>' +
    '</section>' +
    '<section class="card tablet-card">' +
    '<header class="card-head"><div><h2>\uD83C\uDF19 Tablet-Off Alarm</h2>' +
    '<p class="muted">A cozy reminder covers the screen when it is time to stop.</p></div>' +
    '<label class="switch"><input type="checkbox" data-change="tablet-toggle"' + (t.enabled ? ' checked' : '') + '>' +
    '<span class="switch-track"><span class="switch-thumb"></span></span></label></header>' +
    '<div class="segmented small">' +
    '<button class="seg' + (isClock ? ' active' : '') + '" data-action="tablet-mode" data-mode="clock">\uD83D\uDD52 Clock time</button>' +
    '<button class="seg' + (!isClock ? ' active' : '') + '" data-action="tablet-mode" data-mode="countdown">\u23F3 Countdown</button>' +
    '</div>' +
    (isClock
      ? '<label class="field inline"><span>Bedtime</span><input type="time" value="' + esc(t.clock) + '" data-change="tablet-clock"></label>'
      : '<div class="custom-row"><input id="tabletMinutes" type="number" min="1" max="240" inputmode="numeric" value="' + Number(t.minutes) + '" data-change="tablet-minutes"><button class="btn small" data-action="tablet-start">Start countdown</button></div>' +
      (tabletRuntime.running ? '<button class="btn small" data-action="tablet-stop">Stop countdown</button>' : '')) +
    '<p class="tablet-status" id="tabletStatus">' + tabletStatus + '</p>' +
    '<button class="btn soft small" data-action="tablet-test">\uD83D\uDD14 Test the alarm</button>' +
    '</section>';
}

function timerDisplayText() {
  if (timer.mode === 'stopwatch') return mmss(timer.elapsed);
  return mmss(timer.remaining);
}

function paintTimer() {
  var display = $('#timerDisplay');
  if (display) display.textContent = timerDisplayText();
  var toggle = $('#timerToggle');
  if (toggle) toggle.textContent = timer.running ? '\u23F8 Pause' : '\u25B6 Start';
  var hint = $('#timerHint');
  if (hint) {
    hint.textContent = timer.running
      ? (timer.mode === 'countdown' ? 'Reading time in progress\u2026' : 'Stopwatch running\u2026')
      : 'Press start when you are ready.';
  }
  $$('.preset').forEach(function (btn) {
    var min = Number(btn.getAttribute('data-min'));
    btn.classList.toggle('active', timer.mode === 'countdown' && timer.total === min * 60 && !timer.running);
  });
}

function setTimerMode(mode) {
  if (timer.mode === mode) return;
  timer.mode = mode;
  timer.running = false;
  timer.remaining = timer.total;
  timer.elapsed = 0;
  renderStudy();
  paintTimer();
}

function startTimer() {
  audioEngine();
  if (timer.mode === 'countdown') {
    if (timer.remaining <= 0) timer.remaining = timer.total;
    timer.endsAt = Date.now() + timer.remaining * 1000;
  } else {
    timer.startedAt = Date.now() - timer.elapsed * 1000;
  }
  timer.running = true;
  paintTimer();
}

function pauseTimer() {
  timer.running = false;
  paintTimer();
}

function toggleTimer() {
  if (timer.running) pauseTimer(); else startTimer();
}

function resetTimer() {
  timer.running = false;
  timer.remaining = timer.total;
  timer.elapsed = 0;
  paintTimer();
}

function setTimerMinutes(minutes) {
  var m = clamp(Math.round(Number(minutes) || 0), 1, 180);
  timer.mode = 'countdown';
  timer.total = m * 60;
  timer.remaining = m * 60;
  timer.running = false;
  renderStudy();
  paintTimer();
  toast(m + '-minute timer ready \u23F3');
}

function startReadingTimer(minutes) {
  setTimerMinutes(minutes);
  startTimer();
  var card = $('.timer-card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function finishTimer() {
  timer.running = false;
  timer.remaining = 0;
  paintTimer();
  playChime();
  toast('Time is up \u2014 nice reading! \uD83D\uDCD6');
  showCelebration({
    emoji: '\uD83D\uDCD6',
    title: 'Reading time is done!',
    message: 'You focused for ' + Math.round(timer.total / 60) + ' minutes. Beautiful work.',
    confetti: ['\u2B50', '\uD83D\uDCDA', '\u2728', '\uD83D\uDC96'],
    timeout: 4200
  });
}

/* ---------- study editing ---------- */

function openStudyModal(memberId, itemId) {
  var item = itemId ? byId(studyFor(memberId), itemId) : null;
  openModal(
    '<div class="modal-head"><h2>' + (item ? 'Edit study item' : 'Add a study item') + '</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<label class="field"><span>Study item</span>' +
    '<input id="studyTitle" type="text" maxlength="80" placeholder="e.g. Math practice (1 page)" value="' + esc(item ? item.title : '') + '" data-autofocus></label>' +
    '<label class="field"><span>Small badge (optional)</span>' +
    '<input id="studyTag" type="text" maxlength="16" placeholder="e.g. 1 page" value="' + esc(item ? (item.tag || '') : '') + '"></label>' +
    '<label class="field"><span>Reading timer minutes (optional)</span>' +
    '<input id="studyTimer" type="number" min="0" max="180" inputmode="numeric" placeholder="0" value="' + (item && item.timer ? Number(item.timer) : '') + '"></label>' +
    '<label class="check-line"><input id="studyPinned" type="checkbox"' + (item && item.pinned ? ' checked' : '') + '> Pin to the top of the list</label>' +
    '<div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" data-action="save-study" data-member="' + esc(memberId) + '" data-item="' + esc(itemId || '') + '">Save item</button></div>'
  );
}

function saveStudyItem(btn) {
  var memberId = btn.getAttribute('data-member');
  var itemId = btn.getAttribute('data-item');
  var titleEl = $('#studyTitle');
  if (!titleEl) return;
  var title = String(titleEl.value || '').trim();
  if (!title) { toast('Please write the study item.'); return; }
  var tag = String(($('#studyTag') || {}).value || '').trim();
  var minutes = Number((($('#studyTimer') || {}).value || 0)) || 0;
  var pinned = !!($('#studyPinned') && $('#studyPinned').checked);

  if (!state.study[memberId]) state.study[memberId] = [];
  if (itemId) {
    var item = byId(state.study[memberId], itemId);
    if (item) {
      item.title = title;
      item.tag = tag;
      item.timer = minutes > 0 ? minutes : 0;
      item.pinned = pinned;
    }
  } else {
    state.study[memberId].push({
      id: uid(memberId + '-s'),
      title: title,
      tag: tag,
      timer: minutes > 0 ? minutes : 0,
      pinned: pinned
    });
  }
  closeModal();
  commit('Study list updated');
}

function deleteStudyItem(memberId, itemId) {
  var item = byId(studyFor(memberId), itemId);
  if (!item) return;
  askConfirm('Delete this study item?', '\u201C' + item.title + '\u201D will be removed.', 'Delete', function () {
    state.study[memberId] = studyFor(memberId).filter(function (s) { return s.id !== itemId; });
    closeModal();
    commit('Study item deleted');
  });
}

function togglePin(memberId, itemId) {
  var item = byId(studyFor(memberId), itemId);
  if (!item) return;
  item.pinned = !item.pinned;
  commit(item.pinned ? 'Pinned to the top \uD83D\uDCCC' : 'Unpinned');
}

function toggleStudy(memberId, itemId) {
  var today = dateKey();
  if (!state.studyLog[today]) state.studyLog[today] = {};
  if (!state.studyLog[today][memberId]) state.studyLog[today][memberId] = {};
  var map = state.studyLog[today][memberId];
  var nowDone = !map[itemId];
  if (nowDone) map[itemId] = true; else delete map[itemId];

  var allDone = false;
  var study = studyStats(memberId, today);
  if (nowDone && study.total > 0 && study.done === study.total) {
    allDone = true;
    addStamp(today, 'study', (memberById(memberId) || {}).name + ' finished all study');
  }
  commit();
  if (nowDone) playPop();
  if (allDone) {
    toast('All study done \u2014 stamp earned \u2B50');
    playSparkle();
  }
}

/* ---------- tablet-off alarm ---------- */

function paintTablet() {
  var el = $('#tabletStatus');
  if (!el) return;
  var t = state.tablet;
  if (tabletRuntime.running) {
    el.textContent = 'Countdown running \u00B7 ' + mmss(tabletRuntime.countdownLeft) + ' left';
  } else if (t.mode === 'clock') {
    el.textContent = t.enabled ? 'Rings every day at ' + t.clock : 'Turn the switch on to use the bedtime alarm.';
  } else {
    el.textContent = t.enabled ? ('Set for ' + Number(t.minutes) + ' minutes') : 'Turn the switch on to use the countdown.';
  }
}

function setTabletEnabled(enabled) {
  state.tablet.enabled = !!enabled;
  if (!enabled) {
    tabletRuntime.running = false;
    tabletRuntime.countdownLeft = 0;
  } else if (state.tablet.mode === 'countdown') {
    startTabletCountdown();
  }
  commit(enabled ? 'Tablet-off alarm on \uD83C\uDF19' : 'Tablet-off alarm off');
  paintTablet();
}

function setTabletMode(mode) {
  state.tablet.mode = (mode === 'countdown') ? 'countdown' : 'clock';
  tabletRuntime.running = false;
  commit();
  paintTablet();
}

function setTabletClock(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value))) return;
  state.tablet.clock = value;
  commit();
  paintTablet();
}

function setTabletMinutes(value) {
  var m = clamp(Math.round(Number(value) || 0), 1, 240);
  state.tablet.minutes = m;
  commit();
  paintTablet();
}

function startTabletCountdown() {
  var mins = Number(state.tablet.minutes) || 30;
  tabletRuntime.endsAt = Date.now() + mins * 60 * 1000;
  tabletRuntime.countdownLeft = mins * 60;
  tabletRuntime.running = true;
  paintTablet();
}

function stopTabletCountdown() {
  tabletRuntime.running = false;
  tabletRuntime.countdownLeft = 0;
  paintTablet();
}

function checkTabletAlarm() {
  var t = state.tablet;
  if (!t.enabled) return;

  if (t.mode === 'countdown' && tabletRuntime.running) {
    var left = Math.max(0, Math.round((tabletRuntime.endsAt - Date.now()) / 1000));
    tabletRuntime.countdownLeft = left;
    paintTablet();
    if (left <= 0) {
      tabletRuntime.running = false;
      triggerTabletAlarm('countdown');
    }
    return;
  }

  if (t.mode === 'clock') {
    var nowNY = nyParts();
    var hh = pad2(nowNY.hour);
    var mm = pad2(nowNY.minute);
    var key = dateKey() + ' ' + hh + ':' + mm;
    if ((hh + ':' + mm) === String(t.clock) && lastAlarmKey !== key) {
      lastAlarmKey = key;
      triggerTabletAlarm('clock');
    }
  }
}

function triggerTabletAlarm(reason) {
  showTabletLock(reason);
  startAlarm();
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); } catch (e) { /* ignore */ }
}

function showTabletLock(reason) {
  var layer = $('#tabletLock');
  if (!layer) return;
  var mom = memberById('mom') || state.members[0];
  layer.innerHTML =
    '<div class="tablet-sky"><span class="tablet-star s1">\u2B50</span><span class="tablet-star s2">\u2728</span>' +
    '<span class="tablet-star s3">\u2B50</span><span class="tablet-star s4">\u2728</span></div>' +
    '<div class="tablet-inner">' +
    '<div class="tablet-moon">\uD83C\uDF19</div>' +
    '<h2>Time to Turn Off Your Tablet!</h2>' +
    '<p>' + (reason === 'clock' ? 'The bedtime alarm is ringing. Screens off, dreams on.' : 'Your cozy timer is done. Screens off, dreams on.') + '</p>' +
    '<img class="tablet-mascot" src="' + esc(avatarSrc(mom)) + '" alt="">' +
    '<button class="btn primary big" data-action="dismiss-tablet">Okay, I\u2019ll stop now \uD83C\uDF19</button>' +
    '<p class="tablet-note">Sleep well, our little star \u2B50</p>' +
    '</div>';
  layer.hidden = false;
  requestAnimationFrame(function () { layer.classList.add('open'); });
}

function dismissTabletLock() {
  var layer = $('#tabletLock');
  if (layer) {
    layer.classList.remove('open');
    setTimeout(function () { if (!layer.classList.contains('open')) { layer.hidden = true; layer.innerHTML = ''; } }, 300);
  }
  stopAlarm();
}

function tick() {
  if (timer.running) {
    if (timer.mode === 'countdown') {
      timer.remaining = Math.max(0, (timer.endsAt - Date.now()) / 1000);
      if (timer.remaining <= 0) { timer.remaining = 0; finishTimer(); }
      else paintTimer();
    } else {
      timer.elapsed = Math.max(0, (Date.now() - timer.startedAt) / 1000);
      paintTimer();
    }
  }
  checkTabletAlarm();
}


/* =====================================================================
   Our Family Dashboard — 07 · Allowance ledger
   ===================================================================== */

function renderAllowance() {
  var panel = $('#tab-allowance');
  if (!panel) return;
  var kids = kidMembers();
  if (!byId(kids, allowanceMember)) allowanceMember = kids.length ? kids[0].id : 'arya';
  var m = memberById(allowanceMember) || kids[0];
  if (!m) { panel.innerHTML = '<section class="card"><p class="modal-text">No kids in the family yet.</p></section>'; return; }

  var bal = balanceOf(m.id);
  var start = Number(m.starting) || 0;
  var allowance = earnedOf(m.id, 'allowance');
  var deposits = earnedOf(m.id, 'deposit');
  var spent = earnedOf(m.id, 'spend');
  var weekKey = allowanceWeekKey(nyToday());
  var approved = allowanceEntry(m.id, weekKey);

  var switcher = kids.map(function (k) {
    return '<button class="kid-switch' + (k.id === m.id ? ' active' : '') + '" data-action="allowance-child" data-member="' + esc(k.id) + '">' +
      '<img class="avatar xs" src="' + esc(avatarSrc(k)) + '" alt="">' + esc(k.name) + '</button>';
  }).join('');

  var entries = ledgerFor(m.id).slice().sort(function (a, b) { return b.ts - a.ts; });
  var rows = entries.map(function (t) {
    var isSpend = t.type === 'spend';
    var isAllowance = t.type === 'allowance';
    var icon = isSpend ? '\uD83D\uDED2' : (isAllowance ? '\uD83D\uDCB0' : '\uD83D\uDCB5');
    var label = t.note || (isSpend ? 'Spending' : (isAllowance ? 'Weekly allowance' : 'Extra deposit'));
    return '<li class="ledger-row ' + (isSpend ? 'spend' : 'gain') + '">' +
      '<span class="ledger-ico">' + icon + '</span>' +
      '<div class="ledger-main"><strong>' + esc(label) + '</strong>' +
      '<small>' + esc(shortDate(nyCalendarDate(t.ts))) + ' \u00B7 ' + esc(timeLabel(t.ts)) + '</small></div>' +
      '<span class="ledger-amt">' + (isSpend ? '-' : '+') + money(Math.abs(Number(t.amount) || 0)) + '</span>' +
      (isAllowance
        ? '<span class="ledger-lock" title="Weekly allowance">\uD83D\uDD12</span>'
        : '<button class="icon-btn danger tiny" data-action="delete-entry" data-member="' + esc(m.id) + '" data-entry="' + esc(t.id) + '" aria-label="Delete entry">\u2715</button>') +
      '</li>';
  }).join('');

  if (!rows) rows = '<li class="empty-row">No transactions yet \u2014 approve a Sunday allowance to start.</li>';

  panel.innerHTML =
    '<section class="card section-intro">' +
    '<div class="kid-switcher">' + switcher + '</div>' +
    '</section>' +
    '<section class="card balance-card tint-' + esc(m.tint || 'peach') + '">' +
    '<p class="balance-label">' + esc(m.name) + '\u2019s Piggy Bank</p>' +
    '<div class="balance-amount">' + money(bal) + '</div>' +
    '<div class="chips">' +
    '<span class="chip">Starting ' + money(start) + '</span>' +
    '<span class="chip">Allowance +' + money(allowance) + '</span>' +
    '<span class="chip">Deposits +' + money(deposits) + '</span>' +
    '<span class="chip">Spent -' + money(spent) + '</span>' +
    '</div>' +
    '<label class="field"><span>Starting balance (money already saved)</span>' +
    '<input type="number" inputmode="decimal" step="0.01" value="' + start + '" data-change="starting-balance" data-member="' + esc(m.id) + '"></label>' +
    '<p class="hint">' + (approved
      ? 'This week\u2019s allowance was approved \u00B7 ' + money(approved.amount || allowanceOf(m.id))
      : 'This week\u2019s allowance is waiting for a parent check-in.') + '</p>' +
    '</section>' +
    '<section class="card actions-card">' +
    '<header class="card-head"><h2>\uD83D\uDCB8 Money in &amp; out</h2></header>' +
    '<div class="two-buttons">' +
    '<button class="btn good big" data-action="money-in" data-member="' + esc(m.id) + '">\u2795 Extra Deposit</button>' +
    '<button class="btn big" data-action="money-out" data-member="' + esc(m.id) + '">\u2796 Record Spend</button>' +
    '</div>' +
    '</section>' +
    '<section class="card ledger-card">' +
    '<header class="card-head"><div><h2>\uD83E\uDDFE Ledger</h2>' +
    '<p class="muted">Newest first \u00B7 shared across every device</p></div></header>' +
    '<ul class="list ledger-list">' + rows + '</ul>' +
    '</section>';
}

function setAllowanceChild(memberId) {
  allowanceMember = memberId;
  renderAllowance();
}

function setStartingBalance(memberId, value) {
  var m = memberById(memberId);
  if (!m) return;
  m.starting = Number(value) || 0;
  commit();
}

function openMoneyModal(memberId, type) {
  var m = memberById(memberId);
  var isSpend = type === 'spend';
  openModal(
    '<div class="modal-head"><h2>' + (isSpend ? '\u2796 Record a spend' : '\u2795 Extra deposit') + '</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<p class="modal-text">' + (isSpend
      ? 'What did ' + esc(m.name) + ' spend money on?'
      : 'Adding money into ' + esc(m.name) + '\u2019s piggy bank.') + '</p>' +
    '<label class="field"><span>Amount ($)</span>' +
    '<input id="moneyAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="5" data-autofocus></label>' +
    '<label class="field"><span>Note (optional)</span>' +
    '<input id="moneyNote" type="text" maxlength="60" placeholder="' + (isSpend ? 'e.g. Sticker shop' : 'e.g. Birthday money') + '"></label>' +
    '<div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" data-action="save-money" data-member="' + esc(memberId) + '" data-type="' + (isSpend ? 'spend' : 'deposit') + '">' +
    (isSpend ? 'Record spend' : 'Add deposit') + '</button></div>'
  );
}

function saveMoneyEntry(btn) {
  var memberId = btn.getAttribute('data-member');
  var type = btn.getAttribute('data-type');
  var amountEl = $('#moneyAmount');
  var noteEl = $('#moneyNote');
  var amount = Math.abs(Number(amountEl && amountEl.value) || 0);
  if (!amount) { toast('Please enter an amount.'); return; }
  if (!state.ledger[memberId]) state.ledger[memberId] = [];
  state.ledger[memberId].push({
    id: uid('tx'),
    type: type,
    amount: amount,
    ts: Date.now(),
    note: String((noteEl && noteEl.value) || '').trim() || (type === 'spend' ? 'Spending' : 'Extra deposit')
  });
  closeModal();
  commit(type === 'spend' ? 'Spending recorded' : 'Deposit added \uD83D\uDCB5');
  if (type === 'deposit') moneyBurst(document.querySelector('.balance-card'));
}

function deleteLedgerEntry(memberId, entryId) {
  var entry = byId(ledgerFor(memberId), entryId);
  if (!entry) return;
  askConfirm('Delete this entry?', (entry.note || 'This transaction') + ' \u00B7 ' + money(entry.amount) + ' will be removed from the ledger.', 'Delete', function () {
    state.ledger[memberId] = ledgerFor(memberId).filter(function (t) { return t.id !== entryId; });
    closeModal();
    commit('Entry deleted');
  });
}


/* =====================================================================
   Our Family Dashboard — 08 · Family chat
   ===================================================================== */

var STICKERS = [
  '\uD83D\uDE0A', '\uD83D\uDE0D', '\uD83E\uDD70', '\uD83D\uDE02', '\uD83D\uDE0E', '\uD83E\uDD73',
  '\uD83D\uDC96', '\uD83D\uDC9B', '\uD83C\uDF1F', '\uD83C\uDF38', '\uD83C\uDF08', '\u2600\uFE0F',
  '\uD83C\uDF6A', '\uD83C\uDF69', '\uD83E\uDD55', '\uD83C\uDF4E', '\uD83D\uDC31', '\uD83D\uDC36',
  '\uD83D\uDC30', '\uD83D\uDC3B', '\uD83D\uDE4C', '\uD83D\uDC4F', '\uD83E\uDD17', '\uD83D\uDE34'
];

function chatName(memberId) {
  var m = memberById(memberId);
  return m ? m.name : 'Someone';
}

function renderChat() {
  var panel = $('#tab-chat');
  if (!panel) return;
  if (!byId(state.members, device.chatMember)) device.chatMember = state.members[0].id;
  var me = memberById(device.chatMember);
  var messages = (state.chat.messages || []).slice().sort(function (a, b) { return a.ts - b.ts; });

  var switcher = state.members.map(function (m) {
    var active = m.id === device.chatMember;
    return '<button class="person' + (active ? ' active' : '') + '" data-action="chat-member" data-member="' + esc(m.id) + '"' +
      (device.chatLocked ? ' disabled' : '') + '>' +
      '<img class="avatar xs" src="' + esc(avatarSrc(m)) + '" alt="">' +
      '<span>' + esc(m.name) + '</span>' + (active ? '<span class="lock-dot">\uD83D\uDD12</span>' : '') + '</button>';
  }).join('');

  var rows = messages.map(function (msg) {
    var mine = msg.member === device.chatMember;
    var member = memberById(msg.member);
    var isSticker = msg.type === 'sticker';
    return '<div class="msg' + (mine ? ' mine' : '') + '">' +
      '<img class="avatar xs" src="' + esc(avatarSrc(member || me)) + '" alt="">' +
      '<div class="msg-body">' +
      '<div class="msg-meta"><strong>' + esc(chatName(msg.member)) + '</strong><span>' + esc(timeLabel(msg.ts)) + '</span></div>' +
      '<div class="bubble' + (isSticker ? ' sticker-bubble' : '') + '">' + esc(msg.text) + '</div>' +
      '<div class="msg-actions">' +
      '<button class="heart-btn' + (msg.heart ? ' on' : '') + '" data-action="msg-heart" data-msg="' + esc(msg.id) + '" aria-label="Love this message">' +
      '\u2764\uFE0F</button>' +
      '<button class="del-btn" data-action="msg-delete" data-msg="' + esc(msg.id) + '" aria-label="Delete message">\u2715</button>' +
      '</div></div></div>';
  }).join('');
  if (!rows) rows = '<p class="empty-chat">Say hello to the family \uD83D\uDC96</p>';

  var stickerButtons = STICKERS.map(function (s) {
    return '<button class="sticker" data-action="send-sticker" data-sticker="' + s + '">' + s + '</button>';
  }).join('');

  panel.innerHTML =
    '<section class="card chat-card">' +
    '<header class="card-head">' +
    '<div><h2>\uD83D\uDCAC Our Family Chat</h2>' +
    '<p class="muted">Messages show up on every phone and tablet. Pick who you are once.</p></div>' +
    '<div class="chat-tools">' +
    '<span class="sync-badge" id="syncBadge" data-status="local">\u26AA This device</span>' +
    '<button class="ghost-btn" data-action="chat-sound" title="Sound">' + (device.chatSound ? '\uD83D\uDD14' : '\uD83D\uDD15') + '</button>' +
    '</div></header>' +
    '<div class="people">' + switcher + '</div>' +
    '<div class="lock-line">' +
    '<label class="switch small"><input type="checkbox" data-change="chat-lock"' + (device.chatLocked ? ' checked' : '') + '>' +
    '<span class="switch-track"><span class="switch-thumb"></span></span></label>' +
    '<span>\uD83D\uDD12 Lock This Device</span>' +
    '<small>' + (device.chatLocked
      ? 'Locked to ' + esc(chatName(device.chatMember)) + ' on this device.'
      : 'Turn on to keep ' + esc(chatName(device.chatMember)) + ' on this device.') + '</small>' +
    '</div>' +
    '<div class="messages" id="messages">' + rows + '</div>' +
    '<div class="sticker-drawer' + (stickerOpen ? ' open' : '') + '">' + stickerButtons + '</div>' +
    '<div class="composer">' +
    '<button class="ghost-btn big" data-action="toggle-stickers" aria-label="Stickers">\uD83D\uDE0A</button>' +
    '<input id="chatInput" type="text" maxlength="200" placeholder="Write a message to the family\u2026" autocomplete="off">' +
    '<button class="btn primary send" data-action="chat-send">Send</button>' +
    '</div>' +
    '<p class="hint">Tap \u2764\uFE0F to send some love. Sync status shows where messages are stored.</p>' +
    '</section>';

  var box = $('#messages');
  if (box) box.scrollTop = box.scrollHeight;
  SyncEngine.setStatus(SyncEngine.status);
}

function setChatMember(memberId) {
  if (device.chatLocked) { toast('This device is locked. Unlock it to switch.'); return; }
  device.chatMember = memberId;
  saveDevice();
  renderChat();
}

function setChatLocked(locked) {
  device.chatLocked = !!locked;
  saveDevice();
  renderChat();
  toast(locked ? 'Locked to ' + chatName(device.chatMember) + ' on this device \uD83D\uDD12' : 'Device unlocked');
}

function toggleChatSound() {
  device.chatSound = !device.chatSound;
  saveDevice();
  renderChat();
  if (device.chatSound) playPop();
  toast(device.chatSound ? 'Sounds on \uD83D\uDD14' : 'Sounds off \uD83D\uDD15');
}

function toggleStickers() {
  stickerOpen = !stickerOpen;
  var drawer = $('.sticker-drawer');
  if (drawer) drawer.classList.toggle('open', stickerOpen);
}

function sendChat(text, type) {
  var body = String(text || '').trim();
  if (!body) return;
  if (!state.chat.messages) state.chat.messages = [];
  state.chat.messages.push({
    id: uid('msg'),
    member: device.chatMember,
    text: body,
    type: type === 'sticker' ? 'sticker' : 'text',
    ts: Date.now(),
    heart: false
  });
  if (state.chat.messages.length > 400) state.chat.messages = state.chat.messages.slice(-400);
  commit();
  renderChat();
  playPop();
  var input = $('#chatInput');
  if (input) { input.value = ''; input.focus(); }
}

function sendFromInput() {
  var input = $('#chatInput');
  if (!input) return;
  var text = input.value;
  if (!String(text || '').trim()) return;
  sendChat(text, 'text');
}

function sendSticker(sticker) {
  sendChat(sticker, 'sticker');
  stickerOpen = false;
  var drawer = $('.sticker-drawer');
  if (drawer) drawer.classList.remove('open');
}

function toggleHeart(messageId) {
  var msg = byId(state.chat.messages || [], messageId);
  if (!msg) return;
  msg.heart = !msg.heart;
  commit();
  renderChat();
  if (msg.heart) playPop();
}

function deleteMessage(messageId) {
  var msg = byId(state.chat.messages || [], messageId);
  if (!msg) return;
  askConfirm('Delete this message?', '\u201C' + msg.text + '\u201D will be removed for everyone.', 'Delete', function () {
    state.chat.messages = (state.chat.messages || []).filter(function (m) { return m.id !== messageId; });
    closeModal();
    commit('Message deleted');
  });
}


/* =====================================================================
   Our Family Dashboard — 085 · Family calendar (Month / Week / Agenda)
   ===================================================================== */

var CAL_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Sunday-first week start, matching the calendar grid the family knows. */
function sunWeekStart(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function monthTitle(d) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(calendarStamp(d));
}

function weekRangeLabel(start) {
  var end = addDays(start, 6);
  return shortDate(start) + ' \u2013 ' + shortDate(end) + ', ' + end.getFullYear();
}

function calSelectedKey() { return calendarDay || dateKey(); }

/* ---------- the tab ---------- */

function renderCalendar() {
  var panel = $('#tab-calendar');
  if (!panel) return;
  var today = nyToday();
  if (!calendarMonth) calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!calendarWeek) calendarWeek = today;
  if (!calendarDay) calendarDay = dateKey(today);

  var body;
  if (calendarView === 'week') body = calendarWeekHTML();
  else if (calendarView === 'agenda') body = calendarAgendaHTML();
  else body = calendarMonthHTML();

  panel.innerHTML = calendarToolbarHTML() + body;
}

function calendarToolbarHTML() {
  var views = [['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']];
  var seg = views.map(function (v) {
    return '<button class="seg' + (calendarView === v[0] ? ' active' : '') + '"' +
      ' data-action="cal-view" data-view="' + v[0] + '">' + v[1] + '</button>';
  }).join('');

  return '<section class="card cal-toolbar">' +
    '<header class="card-head">' +
    '<div><h2>\uD83D\uDCC5 Family Calendar</h2>' +
    '<p class="muted">Every practice, appointment and movie night in one cozy place</p></div>' +
    '<span class="pill">America/New_York (ET)</span>' +
    '</header>' +
    '<div class="cal-tools">' +
    '<div class="segmented cal-views">' + seg + '</div>' +
    '<button class="btn primary small" data-action="cal-add-event">+ Add Event</button>' +
    '</div>' +
    '<div class="cal-filters">' + calendarFilterChipsHTML() + '</div>' +
    '</section>';
}

function calendarFilterChipsHTML() {
  var ids = ['all', 'arya', 'delia', 'dada', 'mom'];
  return ids.map(function (id) {
    var look = CAL_MEMBER_LOOK[id];
    var on = calendarFilter === id;
    var ico = id === 'all'
      ? '<span class="cal-chip-dot" style="background:' + look.dot + '"></span>'
      : '<span class="cal-chip-ico">' + look.emoji + '</span>';
    return '<button class="cal-chip' + (on ? ' active' : '') + '" data-action="cal-filter"' +
      ' data-member="' + id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      ico + esc(id === 'all' ? 'All' : look.label) + '</button>';
  }).join('');
}

/* ---------- Month view ---------- */

function calPillHTML(ev) {
  var look = calLook(ev);
  return '<span class="cal-pill" style="--ev-bg:' + look.bg + ';--ev-dot:' + look.dot + ';--ev-ink:' + look.ink + '">' +
    '<span class="cal-pill-dot"></span>' +
    '<span class="cal-pill-text">' + esc(ev.title) + '</span></span>';
}

function calendarMonthHTML() {
  var today = nyToday();
  var first = calendarMonth || new Date(today.getFullYear(), today.getMonth(), 1);
  var gridStart = sunWeekStart(first);
  var todayKey = dateKey(today);
  var sel = calSelectedKey();

  var dow = CAL_DOW.map(function (n) { return '<span>' + n + '</span>'; }).join('');

  var cells = '';
  for (var i = 0; i < 42; i++) {
    var d = addDays(gridStart, i);
    var key = dateKey(d);
    var list = eventsForDate(key, calendarFilter);
    var cls = 'cal-day';
    if (d.getMonth() !== first.getMonth()) cls += ' other-month';
    if (key === todayKey) cls += ' today';
    if (key === sel) cls += ' selected';

    var pills = '';
    list.slice(0, 3).forEach(function (ev) { pills += calPillHTML(ev); });
    var more = list.length > 3 ? '<span class="cal-more">+' + (list.length - 3) + ' more</span>' : '';

    cells += '<div class="' + cls + '" data-action="cal-select-day" data-date="' + key + '"' +
      ' role="button" tabindex="0" aria-label="' + esc(longDate(d) + ', ' + list.length + ' events') + '">' +
      '<span class="cal-daynum">' + d.getDate() + '</span>' +
      '<div class="cal-pills">' + pills + '</div>' + more + '</div>';
  }

  var nav = '<div class="cal-nav">' +
    '<button class="cal-nav-btn" data-action="cal-prev" aria-label="Previous month">\u2039</button>' +
    '<span class="cal-nav-title">' + monthTitle(first) + '</span>' +
    '<button class="cal-nav-btn today" data-action="cal-today">Today</button>' +
    '<button class="cal-nav-btn" data-action="cal-next" aria-label="Next month">\u203A</button>' +
    '</div>';

  return '<section class="card cal-month">' + nav +
    '<div class="cal-weekdays">' + dow + '</div>' +
    '<div class="cal-grid">' + cells + '</div>' +
    '<p class="cal-hint">Tap a day to see that day\u2019s schedule below.</p>' +
    '</section>' +
    calendarDayCardHTML(sel);
}

/* ---------- selected day / agenda event cards ---------- */

function calEventCardHTML(ev) {
  var look = calLook(ev);
  var who = calMembers(ev).map(function (id) {
    if (id === 'all') return 'Everyone';
    return (CAL_MEMBER_LOOK[id] || CAL_MEMBER_LOOK.all).label;
  }).join(', ');
  var repeat = (ev.repeat && ev.repeat !== 'none')
    ? '<span class="cal-badge">\uD83D\uDD01 ' + CAL_REPEAT_LABELS[ev.repeat] + '</span>' : '';
  var loc = ev.location ? '<span class="cal-badge">\uD83D\uDCCD ' + esc(ev.location) + '</span>' : '';
  var notes = ev.notes ? '<p class="cal-notes">' + esc(ev.notes) + '</p>' : '';

  return '<article class="cal-event" style="--ev-bg:' + look.bg + ';--ev-dot:' + look.dot + ';--ev-ink:' + look.ink + '">' +
    '<div class="cal-event-when">' +
    '<span class="cal-event-emoji">' + esc(ev.emoji || '\uD83D\uDCC5') + '</span>' +
    '<strong>' + (ev.allDay ? 'All day' : esc(calClock(ev.startTime))) + '</strong>' +
    (ev.allDay || !ev.endTime ? '' : '<small>' + esc(calClock(ev.endTime)) + '</small>') +
    '</div>' +
    '<div class="cal-event-main">' +
    '<h3>' + esc(ev.title) + '</h3>' +
    '<p class="cal-event-meta"><span class="cal-dot"></span>' + esc(who) + '</p>' +
    (repeat || loc ? '<div class="cal-badges">' + repeat + loc + '</div>' : '') +
    notes +
    '</div>' +
    '<div class="cal-event-actions">' +
    '<button class="icon-btn" data-action="cal-edit-event" data-event="' + esc(ev.id) + '" aria-label="Edit event">\u270F\uFE0F</button>' +
    '<button class="icon-btn danger" data-action="cal-delete-event" data-event="' + esc(ev.id) + '" aria-label="Delete event">\u2715</button>' +
    '</div></article>';
}

function calendarDayCardHTML(key) {
  var d = parseKey(key);
  var todayKey = dateKey();
  var list = eventsForDate(key, calendarFilter);
  var count = list.length
    ? list.length + ' event' + (list.length === 1 ? '' : 's')
    : 'Nothing planned';

  var body = list.length
    ? list.map(calEventCardHTML).join('')
    : '<div class="cal-empty"><span>\uD83C\uDF3F</span><p>A free day \u2014 nothing on the calendar yet.</p></div>';

  return '<section class="card cal-day-card">' +
    '<header class="card-head">' +
    '<div><h2>' + longDate(d) + '</h2>' +
    '<p class="muted">' + count + ' \u00B7 ' + FAMILY_TZ_LABEL + '</p></div>' +
    '<span class="pill' + (key === todayKey ? ' warm' : ' soft') + '">' +
    (key === todayKey ? 'Today' : shortDate(d)) + '</span>' +
    '</header>' +
    '<div class="cal-event-stack">' + body + '</div>' +
    '<button class="add-row" data-action="cal-add-event" data-date="' + key + '">+ Add on this day</button>' +
    '</section>';
}

/* ---------- Week view ---------- */

function calWeekEventHTML(ev) {
  var look = calLook(ev);
  return '<button class="cal-week-ev" data-action="cal-edit-event" data-event="' + esc(ev.id) + '"' +
    ' style="--ev-bg:' + look.bg + ';--ev-dot:' + look.dot + ';--ev-ink:' + look.ink + '">' +
    '<span class="cal-week-ev-time">' + (ev.allDay ? 'All day' : esc(calClock(ev.startTime))) + '</span>' +
    '<span class="cal-week-ev-title">' + esc(ev.emoji || '') + ' ' + esc(ev.title) + '</span></button>';
}

function calendarWeekHTML() {
  var anchor = calendarWeek || nyToday();
  var start = sunWeekStart(anchor);
  var todayKey = dateKey();

  var days = '';
  for (var i = 0; i < 7; i++) {
    var d = addDays(start, i);
    var key = dateKey(d);
    var list = eventsForDate(key, calendarFilter);
    var body = list.length
      ? list.map(calWeekEventHTML).join('')
      : '<p class="cal-week-none">No plans</p>';
    days += '<div class="cal-week-day' + (key === todayKey ? ' today' : '') + '">' +
      '<div class="cal-week-head">' +
      '<span class="cal-week-dow">' + CAL_DOW[i] + '</span>' +
      '<span class="cal-week-date">' + d.getDate() + '</span>' +
      '<button class="cal-week-add" data-action="cal-add-event" data-date="' + key + '"' +
      ' aria-label="Add event on ' + esc(shortDate(d)) + '">+</button>' +
      '</div>' + body + '</div>';
  }

  var nav = '<div class="cal-nav">' +
    '<button class="cal-nav-btn" data-action="cal-prev" aria-label="Previous week">\u2039</button>' +
    '<span class="cal-nav-title">' + weekRangeLabel(start) + '</span>' +
    '<button class="cal-nav-btn today" data-action="cal-today">Today</button>' +
    '<button class="cal-nav-btn" data-action="cal-next" aria-label="Next week">\u203A</button>' +
    '</div>';

  return '<section class="card cal-week">' + nav +
    '<div class="cal-week-days">' + days + '</div></section>';
}

/* ---------- Agenda view ---------- */

function calendarAgendaHTML() {
  var today = nyToday();
  var groups = calDaysWithEvents(today, 21, calendarFilter);
  var total = groups.reduce(function (n, g) { return n + g.events.length; }, 0);

  var body;
  if (!groups.length) {
    body = '<div class="cal-empty"><span>\uD83C\uDF3C</span>' +
      '<p>Nothing on the calendar for the next three weeks.</p>' +
      '<button class="btn small" data-action="cal-add-event">+ Add Event</button></div>';
  } else {
    body = groups.map(function (g) {
      var label = g.key === dateKey(today) ? 'Today'
        : (g.key === dateKey(addDays(today, 1)) ? 'Tomorrow' : longDate(g.date));
      return '<div class="cal-agenda-group">' +
        '<div class="cal-agenda-day">' +
        '<span class="cal-agenda-date">' + esc(label) + '</span>' +
        '<span class="cal-agenda-count">' + g.events.length + '</span>' +
        '</div>' +
        g.events.map(calEventCardHTML).join('') +
        '</div>';
    }).join('');
  }

  return '<section class="card cal-agenda">' +
    '<header class="card-head">' +
    '<div><h2>\uD83D\uDCC6 Next 21 Days</h2>' +
    '<p class="muted">From ' + longDate(today) + ' \u00B7 ' + FAMILY_TZ_LABEL + '</p></div>' +
    '<span class="pill">' + total + ' event' + (total === 1 ? '' : 's') + '</span>' +
    '</header>' + body + '</section>';
}

/* ---------- view actions ---------- */

function setCalendarView(view) {
  if (['month', 'week', 'agenda'].indexOf(view) === -1) return;
  calendarView = view;
  renderCalendar();
}

function calendarStep(delta) {
  if (calendarView === 'week') {
    calendarWeek = addDays(calendarWeek || nyToday(), 7 * delta);
  } else {
    var base = calendarMonth || new Date(nyToday().getFullYear(), nyToday().getMonth(), 1);
    var next = new Date(base.getFullYear(), base.getMonth() + delta, 1);
    calendarMonth = next;
    var sel = parseKey(calSelectedKey());
    if (sel.getFullYear() !== next.getFullYear() || sel.getMonth() !== next.getMonth()) {
      calendarDay = dateKey(next);
    }
  }
  renderCalendar();
}

function calendarGoToday() {
  var t = nyToday();
  calendarMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  calendarWeek = t;
  calendarDay = dateKey(t);
  renderCalendar();
}

function calendarSelectDay(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return;
  calendarDay = key;
  var d = parseKey(key);
  calendarMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar();
}

function setCalendarFilter(member) {
  calendarFilter = (member && CAL_MEMBER_LOOK[member]) ? member : 'all';
  if (currentTab === 'calendar') renderCalendar();
  if (currentTab === 'home') renderHome();
}

/* ---------- add / edit modal ---------- */

function calendarModalMemberChips() {
  var picked = window.__calMembers || ['all'];
  return ['all', 'arya', 'delia', 'dada', 'mom'].map(function (id) {
    var look = CAL_MEMBER_LOOK[id];
    var on = picked.indexOf(id) !== -1;
    var label = id === 'all' ? '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66 Everyone' : look.emoji + ' ' + look.label;
    return '<button class="cal-chip' + (on ? ' active' : '') + '" data-action="cal-modal-member"' +
      ' data-member="' + id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
  }).join('');
}

function openCalendarEventModal(eventId, dateStr) {
  var existing = eventId ? byId(calendarEvents(), eventId) : null;
  var date = (existing && existing.date) || dateStr || calSelectedKey() || dateKey();
  var allDay = existing ? !!existing.allDay : false;
  var startTime = (existing && existing.startTime) || '16:00';
  var endTime = (existing && existing.endTime) || '17:00';
  window.__calEmoji = (existing && existing.emoji) || '\uD83D\uDCC5';
  window.__calMembers = existing ? calMembers(existing).slice() : ['all'];

  var emojiChips = CAL_EMOJIS.map(function (e) {
    return '<button class="emoji-chip' + (e === window.__calEmoji ? ' selected' : '') + '"' +
      ' data-action="cal-emoji" data-emoji="' + e + '">' + e + '</button>';
  }).join('');

  var repeatOptions = CAL_REPEATS.map(function (r) {
    return '<option value="' + r + '"' + (existing && existing.repeat === r ? ' selected' : '') + '>' +
      CAL_REPEAT_LABELS[r] + '</option>';
  }).join('');

  openModal(
    '<div class="modal-head"><h2>' + (existing ? '\u270F\uFE0F Edit event' : '\uD83D\uDCC5 New family event') + '</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<label class="field"><span>What is it?</span>' +
    '<input id="calTitle" type="text" maxlength="80" placeholder="e.g. Arya Soccer Practice"' +
    ' value="' + esc(existing ? existing.title : '') + '" data-autofocus></label>' +
    '<div class="field"><span>Icon</span><div class="emoji-picker">' + emojiChips + '</div></div>' +
    '<label class="field"><span>Date</span>' +
    '<input id="calDate" type="date" value="' + esc(date) + '"></label>' +
    '<label class="check-line"><input id="calAllDay" type="checkbox" data-change="cal-allday"' +
    (allDay ? ' checked' : '') + '> All-day event</label>' +
    '<div class="cal-time-row" id="calTimeRow"' + (allDay ? ' hidden' : '') + '>' +
    '<label class="field inline"><span>From</span><input id="calStart" type="time" value="' + esc(startTime) + '"></label>' +
    '<label class="field inline"><span>To</span><input id="calEnd" type="time" value="' + esc(endTime) + '"></label>' +
    '</div>' +
    '<label class="field"><span>Repeats</span><select id="calRepeat">' + repeatOptions + '</select></label>' +
    '<div class="field"><span>Who is it for?</span>' +
    '<div class="cal-modal-members" id="calMemberChips">' + calendarModalMemberChips() + '</div></div>' +
    '<label class="field"><span>Place (optional)</span>' +
    '<input id="calLocation" type="text" maxlength="80" placeholder="e.g. Field 2, Middletown"' +
    ' value="' + esc(existing ? existing.location : '') + '"></label>' +
    '<label class="field"><span>Notes (optional)</span>' +
    '<textarea id="calNotes" rows="3" placeholder="Bring the blue water bottle \uD83E\uDDCA">' +
    esc(existing ? existing.notes : '') + '</textarea></label>' +
    '<div class="modal-actions">' +
    (existing ? '<button class="btn danger" data-action="cal-delete-event" data-event="' + esc(existing.id) + '">Delete</button>' : '') +
    '<button class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" data-action="cal-save-event" data-event="' + esc(existing ? existing.id : '') + '">Save event</button>' +
    '</div>'
  );
}

function calPickEmoji(emoji) {
  window.__calEmoji = emoji || '\uD83D\uDCC5';
  $$('.emoji-chip').forEach(function (chip) {
    chip.classList.toggle('selected', chip.getAttribute('data-emoji') === window.__calEmoji);
  });
}

function calToggleModalMember(id) {
  var picked = (window.__calMembers || ['all']).slice();
  if (id === 'all') {
    picked = ['all'];
  } else if (CAL_MEMBER_LOOK[id]) {
    picked = picked.filter(function (x) { return x !== 'all'; });
    var idx = picked.indexOf(id);
    if (idx === -1) picked.push(id); else picked.splice(idx, 1);
    if (!picked.length) picked = ['all'];
  }
  window.__calMembers = picked;
  var wrap = $('#calMemberChips');
  if (wrap) wrap.innerHTML = calendarModalMemberChips();
}

function calToggleAllDay(on) {
  var row = $('#calTimeRow');
  if (row) row.hidden = !!on;
}

function saveCalendarEventFromModal(btn) {
  var id = btn.getAttribute('data-event') || '';
  var titleEl = $('#calTitle');
  var dateEl = $('#calDate');
  if (!titleEl || !dateEl) return;

  var title = String(titleEl.value || '').trim();
  var date = String(dateEl.value || '').trim();
  if (!title) { toast('Please give the event a name.'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Please pick a date for the event.'); return; }

  var allDayEl = $('#calAllDay');
  var startEl = $('#calStart');
  var endEl = $('#calEnd');
  var repeatEl = $('#calRepeat');
  var locEl = $('#calLocation');
  var notesEl = $('#calNotes');
  var allDay = !!(allDayEl && allDayEl.checked);

  var data = {
    title: title,
    date: date,
    allDay: allDay,
    startTime: allDay ? '' : (startEl ? startEl.value : ''),
    endTime: allDay ? '' : (endEl ? endEl.value : ''),
    members: (window.__calMembers && window.__calMembers.length) ? window.__calMembers : ['all'],
    repeat: repeatEl ? repeatEl.value : 'none',
    emoji: window.__calEmoji || '\uD83D\uDCC5',
    location: locEl ? locEl.value : '',
    notes: notesEl ? notesEl.value : ''
  };

  if (!allDay && data.startTime && data.endTime && data.endTime < data.startTime) {
    var swap = data.startTime;
    data.startTime = data.endTime;
    data.endTime = swap;
  }

  var saved = id ? updateCalendarEvent(id, data) : addCalendarEvent(data);
  closeModal();
  if (!saved) { toast('That event could not be saved.'); return; }

  calendarDay = saved.date;
  var d = parseKey(saved.date);
  calendarMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  calendarWeek = d;
  commit(id ? 'Event updated \uD83D\uDCC5' : 'Event saved \uD83D\uDCC5');
}

function deleteCalendarEventById(id) {
  var ev = byId(calendarEvents(), id);
  if (!ev) return;
  askConfirm('Delete this event?', '\u201C' + ev.title + '\u201D will disappear from the whole family calendar.', 'Delete', function () {
    deleteCalendarEvent(id);
    closeModal();
    commit('Event deleted');
  });
}


/* =====================================================================
   Our Family Dashboard — 09 · Settings, backup & cloud sign-in gate
   ===================================================================== */

var CLOUD_KEY = 'familyDashboard.cloud.v1';
var AVATAR_DEFAULT = { arya: 'cheetah', delia: 'kitten', dada: 'puppy', mom: 'bunny' };

function loadCloudConfig() {
  try {
    var raw = localStorage.getItem(CLOUD_KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        if (saved.disabled) return null;           /* family chose local-only */
        return {
          configText: saved.configText || JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2),
          room: saved.room || DEFAULT_ROOM
        };
      }
    }
  } catch (e) { /* fall through to built-in */ }
  /* Built-in family cloud: no paste needed on first open. */
  return { configText: JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2), room: DEFAULT_ROOM };
}

function saveCloudConfig(cfg) {
  try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
}

function clearCloudConfig() {
  /* keep the built-in config but remember the family wants local-only */
  try { localStorage.setItem(CLOUD_KEY, JSON.stringify({ disabled: true })); } catch (e) { /* ignore */ }
}

function parseFirebaseConfig(text) {
  var raw = String(text || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return { databaseURL: raw };
  var start = raw.indexOf('{');
  var end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (e) { return null; }
}

/* ---------- auth gate ---------- */

function authGateHTML(mode, detail) {
  var mom = memberById('mom') || state.members[0];
  var head = '<img class="auth-mascot" src="' + esc(avatarSrc(mom)) + '" alt="">' +
    '<h1>Our Family Dashboard</h1>';

  if (mode === 'connecting') {
    return '<div class="auth-card">' + head +
      '<p class="auth-copy">Connecting to the family cloud\u2026</p>' +
      '<div class="auth-loading"><span></span><span></span><span></span></div>' +
      '</div>';
  }

  if (mode === 'offline') {
    return '<div class="auth-card">' + head +
      '<p class="auth-copy">The family cloud could not be reached.</p>' +
      '<p class="auth-error">' + esc(detail || 'Check the connection, or keep using this device on its own.') + '</p>' +
      '<button class="btn primary big" data-action="auth-offline">Continue on this device</button>' +
      '<button class="link-btn" data-action="auth-retry">Try the cloud again</button>' +
      '</div>';
  }

  return '<div class="auth-card">' + head +
    '<p class="auth-copy">Sign in with the family account so every phone and tablet shares the same day.</p>' +
    '<label class="field"><span>Email</span><input id="authEmail" type="email" autocomplete="username" placeholder="family@example.com" data-autofocus></label>' +
    '<label class="field"><span>Password</span><input id="authPassword" type="password" autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"></label>' +
    '<p class="auth-error" id="authError" hidden></p>' +
    '<button class="btn primary big" id="authSubmit" data-action="auth-signin">Sign in</button>' +
    '<button class="btn demo-btn" data-action="auth-offline">Try Demo Offline (Local Only)</button>' +
    '<button class="link-btn muted-link" data-action="auth-retry">Reconnect to the family cloud</button>' +
    '<p class="auth-foot">\uD83D\uDD12 Secured with Firebase Auth \u00B7 Family accounts are created in the Firebase console \u00B7 Room: ' + esc(SyncEngine.room) + '</p>' +
    '</div>';
}

function showAuthGate(mode, detail) {
  var gate = $('#authGate');
  if (!gate) return;
  gate.innerHTML = authGateHTML(mode || 'login', detail);
  gate.hidden = false;
  requestAnimationFrame(function () { gate.classList.add('open'); });
}

function hideAuthGate() {
  var gate = $('#authGate');
  if (!gate) return;
  gate.classList.remove('open');
  gate.hidden = true;
  gate.innerHTML = '';
}

function authError(message) {
  var el = $('#authError');
  if (el) { el.textContent = message; el.hidden = false; }
}

function authErrorMessage(err) {
  var code = (err && err.code) || '';
  var map = {
    'auth/invalid-email': 'That email address doesn\u2019t look right.',
    'auth/user-not-found': 'No family account uses that email yet.',
    'auth/wrong-password': 'That password doesn\u2019t match.',
    'auth/invalid-credential': 'Email or password doesn\u2019t match.',
    'auth/invalid-login-credentials': 'Email or password doesn\u2019t match.',
    'auth/missing-password': 'Please type the password.',
    'auth/too-many-requests': 'Too many tries \u2014 please wait a minute.',
    'auth/network-request-failed': 'Network problem \u2014 check the connection.',
    'auth/weak-password': 'Please use at least 6 characters.',
    'auth/email-already-in-use': 'This email already has an account \u2014 try signing in.',
    'auth/operation-not-allowed': 'Email sign-in is turned off in the Firebase console.',
    'auth/unauthorized-domain': 'This page\u2019s address is not in the Firebase authorized domains.'
  };
  return map[code] || (err && err.message) || 'Sign-in failed. Please try again.';
}

function submitAuth(create) {
  var emailEl = $('#authEmail');
  var passEl = $('#authPassword');
  if (!emailEl || !passEl) return;
  var email = String(emailEl.value || '').trim();
  var password = String(passEl.value || '');
  if (!email || !password) { authError('Please fill in both the email and the password.'); return; }
  var btn = $('#authSubmit');
  if (btn) { btn.disabled = true; btn.textContent = create ? 'Creating\u2026' : 'Signing in\u2026'; }
  var call = create ? SyncEngine.createAccount(email, password) : SyncEngine.signIn(email, password);
  call.then(function () {
    hideAuthGate();
    toast(create ? 'Family account created \u2728' : 'Welcome back \uD83D\uDC96');
  }).catch(function (err) {
    authError(authErrorMessage(err));
    if (btn) {
      btn.disabled = false;
      btn.textContent = create ? 'Create the family account' : 'Sign in';
    }
  });
}

function continueOffline() {
  hideAuthGate();
  SyncEngine.paused = true;
  toast('Using this device only \u2014 sync stays off');
}

/* ---------- settings modal ---------- */

function settingsHTML() {
  var w = state.settings.weather;
  var pin = state.settings.pin || { enabled: false, code: '1234' };
  var fb = state.settings.firebase || { configText: '', room: 'our-family' };
  var cloud = loadCloudConfig();

  var memberRows = state.members.map(function (m) {
    return '<div class="set-member">' +
      '<img class="avatar sm" src="' + esc(avatarSrc(m)) + '" alt="" data-avatar-preview="' + esc(m.id) + '">' +
      '<div class="set-member-fields">' +
      '<input type="text" maxlength="20" value="' + esc(m.name) + '" data-change="member-name" data-member="' + esc(m.id) + '" aria-label="Name">' +
      '<input type="text" maxlength="28" value="' + esc(m.subtitle || '') + '" data-change="member-subtitle" data-member="' + esc(m.id) + '" aria-label="Subtitle" placeholder="With \u2026">' +
      '</div>' +
      '<div class="set-member-btns">' +
      '<label class="file-btn">Photo<input type="file" accept="image/*" data-change="member-photo" data-member="' + esc(m.id) + '"></label>' +
      '<button class="link-btn" data-action="reset-photo" data-member="' + esc(m.id) + '">Reset</button>' +
      '</div></div>';
  }).join('');

  var allowanceRows = kidMembers().map(function (m) {
    return '<label class="field inline"><span>' + esc(m.name) + '</span>' +
      '<input type="number" min="0" max="200" step="1" value="' + Number(m.allowance || 0) + '" data-change="allowance-amount" data-member="' + esc(m.id) + '"></label>';
  }).join('');

  return '<div class="modal-head"><h2>\u2699\uFE0F Settings</h2>' +
    '<button class="icon-btn" data-action="close-modal" aria-label="Close">\u2715</button></div>' +
    '<div class="settings-body">' +

    '<section class="set-group">' +
    '<h3>\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66 Family members</h3>' +
    '<p class="muted">Names, subtitles and photos are yours to change.</p>' +
    memberRows +
    '</section>' +

    '<section class="set-group">' +
    '<h3>\uD83C\uDF24\uFE0F Weather</h3>' +
    '<p class="muted">Now showing <strong>' + esc(w.label) + '</strong>.</p>' +
    '<div class="inline-row">' +
    '<input id="weatherQuery" type="text" placeholder="City or ZIP code" value="' + esc(w.query || '') + '">' +
    '<button class="btn small" data-action="weather-lookup">Look up</button>' +
    '</div>' +
    '<p class="set-note" id="weatherNote">Default is Port Monmouth, NJ (07758).</p>' +
    '<div class="unit-row"><span>Units</span>' +
    '<button class="seg' + (w.unit !== 'celsius' ? ' active' : '') + '" data-action="weather-unit" data-unit="fahrenheit">\u00B0F</button>' +
    '<button class="seg' + (w.unit === 'celsius' ? ' active' : '') + '" data-action="weather-unit" data-unit="celsius">\u00B0C</button>' +
    '</div>' +
    '</section>' +

    '<section class="set-group">' +
    '<h3>\uD83D\uDC37 Weekly allowance</h3>' +
    allowanceRows +
    '<p class="set-note">Arya earns $7 a week, Delia earns $5 a week. Parents approve it on the Chores tab.</p>' +
    '</section>' +

    '<section class="set-group">' +
    '<h3>\uD83D\uDD12 Parent PIN</h3>' +
    '<label class="check-line"><input type="checkbox" id="pinEnabled" data-change="pin-enabled"' + (pin.enabled ? ' checked' : '') + '> Ask for a 4-digit PIN when a parent approves money</label>' +
    '<label class="field inline"><span>PIN</span>' +
    '<input id="pinCode" type="text" inputmode="numeric" maxlength="4" value="' + esc(pin.code || '1234') + '" data-change="pin-code"></label>' +
    '<p class="set-note">Default PIN is 1234. Off by default \u2014 turn it on whenever you like.</p>' +
    '</section>' +

    '<section class="set-group">' +
    '<h3>\u2601\uFE0F Live sync (Firebase)</h3>' +
    '<p class="set-note">Status: <strong id="cloudStatus">' +
    (SyncEngine.status === 'live' ? 'Connected \u00B7 ' + esc((SyncEngine.fbUser && SyncEngine.fbUser.email) || 'signed in') : (cloud ? 'Saved on this device \u00B7 waiting for sign-in' : 'Local only \u2014 data stays on this device')) +
    '</strong></p>' +
    '<p class="set-note">Built-in family cloud: <strong>our-family-dashboard-3998f</strong>. Paste a different config below to switch projects.</p>' +
    '<label class="field"><span>Firebase config (paste the object from the console)</span>' +
    '<textarea id="fbConfig" rows="4" placeholder="{ &quot;apiKey&quot;: &quot;\u2026&quot;, &quot;authDomain&quot;: &quot;\u2026&quot;, &quot;databaseURL&quot;: &quot;https://\u2026.firebaseio.com&quot;, &quot;projectId&quot;: &quot;\u2026&quot; }">' +
    esc((cloud && cloud.configText) || fb.configText || JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2)) + '</textarea></label>' +
    '<label class="field inline"><span>Room ID</span>' +
    '<input id="fbRoom" type="text" maxlength="30" value="' + esc((cloud && cloud.room) || fb.room || DEFAULT_ROOM) + '"></label>' +
    '<div class="set-actions">' +
    '<button class="btn primary small" data-action="cloud-connect">Connect &amp; sign in</button>' +
    '<button class="btn small" data-action="cloud-signout">Sign out</button>' +
    '<button class="btn small danger" data-action="cloud-disconnect">Disconnect</button>' +
    '</div>' +
    '<details class="rules">' +
    '<summary>Security rules guide (auth != null)</summary>' +
    '<pre>{\n  "rules": {\n    "rooms": {\n      "$room": {\n        ".read": "auth != null",\n        ".write": "auth != null"\n      }\n    }\n  }\n}</pre>' +
    '<p class="set-note">These rules are already live on the built-in project: only signed-in family devices can read or write, and outside sign-up is turned off. New family accounts are added in Firebase Console \u2192 Authentication.</p>' +
    '</details>' +
    '</section>' +

    '<section class="set-group">' +
    '<h3>\uD83D\uDCBE Backup</h3>' +
    '<div class="set-actions">' +
    '<button class="btn small" data-action="export-json">\u2B07\uFE0F Export JSON</button>' +
    '<label class="file-btn">\u2B06\uFE0F Import JSON<input type="file" accept="application/json,.json" data-change="import-json"></label>' +
    '<button class="btn small danger" data-action="reset-app">Reset everything</button>' +
    '</div>' +
    '<p class="set-note">Export keeps a full copy of chores, study, stamps, ledger and chat.</p>' +
    '</section>' +

    '<section class="set-group about">' +
    '<p class="set-note">Our Family Dashboard \u00B7 v1 \u00B7 Made for Arya, Delia, Dada and \uC5C4\uB9C8 \uD83D\uDC96</p>' +
    '</section>' +

    '</div>';
}

function openSettings() {
  openModal(settingsHTML(), { wide: true });
}

function updateMemberField(memberId, field, value) {
  var m = memberById(memberId);
  if (!m) return;
  m[field] = String(value || '').trim();
  commit();
}

function setAllowanceAmount(memberId, value) {
  var m = memberById(memberId);
  if (!m) return;
  m.allowance = clamp(Number(value) || 0, 0, 200);
  commit();
}

function setPinEnabled(enabled) {
  state.settings.pin.enabled = !!enabled;
  commit(enabled ? 'Parent PIN on \uD83D\uDD12' : 'Parent PIN off');
}

function setPinCode(value) {
  var digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length !== 4) { toast('The PIN needs 4 digits.'); return; }
  state.settings.pin.code = digits;
  commit('PIN updated');
}

function setWeatherUnit(unit) {
  state.settings.weather.unit = unit === 'celsius' ? 'celsius' : 'fahrenheit';
  weather.status = 'idle';
  commit();
  openSettings();
  fetchWeather(true);
}

function lookupWeatherFromSettings() {
  var input = $('#weatherQuery');
  var note = $('#weatherNote');
  if (!input) return;
  var q = String(input.value || '').trim();
  if (!q) { if (note) note.textContent = 'Type a city or ZIP code first.'; return; }
  if (note) note.textContent = 'Looking up \u201C' + q + '\u201D\u2026';
  geocodePlace(q).then(function (place) {
    state.settings.weather = Object.assign({}, state.settings.weather, place);
    weather.status = 'idle';
    commit('Weather set to ' + place.label);
    if (note) note.textContent = 'Saved: ' + place.label;
    fetchWeather(true);
  }).catch(function (err) {
    if (note) note.textContent = (err && err.message) || 'That place was not found.';
  });
}

/* ---------- member photos ---------- */

function readMemberPhoto(input) {
  var memberId = input.getAttribute('data-member');
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      try {
        var size = 256;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFDF6';
        ctx.fillRect(0, 0, size, size);
        var scale = Math.min(size / img.width, size / img.height);
        var dw = img.width * scale;
        var dh = img.height * scale;
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
        var m = memberById(memberId);
        if (!m) return;
        m.avatar = canvas.toDataURL('image/jpeg', 0.9);
        commit('Photo updated');
        var preview = document.querySelector('[data-avatar-preview="' + memberId + '"]');
        if (preview) preview.src = m.avatar;
        var headerMascot = $('#brandMascot');
        if (headerMascot && memberId === 'mom') headerMascot.src = m.avatar;
      } catch (e) {
        toast('That photo could not be used.');
      }
    };
    img.onerror = function () { toast('That file is not an image.'); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function resetMemberPhoto(memberId) {
  var m = memberById(memberId);
  if (!m) return;
  m.avatar = AVATAR_DEFAULT[memberId] || 'bunny';
  commit('Photo reset');
  var preview = document.querySelector('[data-avatar-preview="' + memberId + '"]');
  if (preview) preview.src = avatarSrc(m);
}

/* ---------- cloud actions ---------- */

function connectCloudFromSettings() {
  var configEl = $('#fbConfig');
  var roomEl = $('#fbRoom');
  if (!configEl) return;
  var text = String(configEl.value || '').trim();
  var room = String((roomEl && roomEl.value) || 'our-family').trim() || 'our-family';
  var cfg = parseFirebaseConfig(text);
  if (!text) { toast('Paste the Firebase config first.'); return; }
  if (!cfg || !(cfg.databaseURL || cfg.databaseUrl)) {
    toast('That config needs a "databaseURL" entry.');
    return;
  }
  state.settings.firebase = { configText: text, room: room };
  saveCloudConfig({ configText: text, room: room });
  commit('Firebase saved \u2014 sign in to sync');
  showAuthGate('connecting');
  SyncEngine.connectFirebase(cfg, room).catch(function (err) {
    toast('Cloud connection failed: ' + ((err && err.message) || 'unknown error'));
  });
}

function signOutCloud() {
  SyncEngine.signOut().then(function () {
    showAuthGate('login');
    toast('Signed out of the family cloud');
  }).catch(function () {
    toast('Sign-out failed.');
  });
}

function disconnectCloud() {
  askConfirm('Disconnect live sync?', 'This device will stop syncing with the family cloud. Your local copy stays.', 'Disconnect', function () {
    SyncEngine.disconnectFirebase();
    clearCloudConfig();
    state.settings.firebase = { configText: '', room: state.settings.firebase.room || 'our-family' };
    closeModal();
    commit('Cloud sync disconnected');
  });
}

/* ---------- backup ---------- */

function exportJson() {
  var payload = JSON.stringify(state, null, 2);
  var blob = new Blob([payload], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'our-family-dashboard-' + dateKey() + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 800);
  toast('Backup exported \u2B07\uFE0F');
}

function importJson(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var parsed = JSON.parse(reader.result);
      var next = normalizeState(parsed);
      state = next;
      state.rev = Date.now();
      SyncEngine.save(state);
      closeModal();
      renderAll();
      toast('Backup imported \u2728');
    } catch (e) {
      toast('That file is not a valid dashboard backup.');
    }
  };
  reader.readAsText(file);
}

function resetApp() {
  askConfirm('Reset everything?', 'Chores, study lists, stamps, ledger and chat will go back to the cozy starting point. Photos and sync settings stay.', 'Reset', function () {
    var keepSettings = deepCopy(state.settings);
    state = defaultState();
    state.settings = keepSettings;
    state.rev = Date.now();
    SyncEngine.save(state);
    closeModal();
    renderAll();
    toast('Fresh start \u2728');
  });
}


/* =====================================================================
   Our Family Dashboard — 10 · Events & boot
   ===================================================================== */

function toggleFullscreen() {
  try {
    var doc = document;
    var el = doc.documentElement;
    var isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (isFs) {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) exit.call(doc);
    } else {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        var p = req.call(el);
        if (p && p.catch) p.catch(function () { toast('Fullscreen is not available here.'); });
      } else {
        toast('Fullscreen is not available here.');
      }
    }
  } catch (e) {
    toast('Fullscreen is not available here.');
  }
  setTimeout(renderHeader, 250);
}

function runAction(action, el) {
  if (!action) return;
  switch (action) {
    /* shell */
    case 'go-tab': switchTab(el.getAttribute('data-tab')); break;
    case 'open-settings': openSettings(); break;
    case 'close-modal': closeModal(); break;
    case 'confirm-yes': {
      var fn = window.__confirmYes;
      window.__confirmYes = null;
      closeModal();
      if (typeof fn === 'function') fn();
      break;
    }
    case 'toggle-fullscreen': toggleFullscreen(); break;
    case 'close-celebration': closeCelebration(); break;
    case 'refresh-weather': fetchWeather(true); break;

    /* home */
    case 'open-member-chores': switchTab('chores'); break;

    /* chores */
    case 'add-chore': openChoreModal(el.getAttribute('data-member') || 'arya', null); break;
    case 'edit-chore': openChoreModal(el.getAttribute('data-member'), el.getAttribute('data-chore')); break;
    case 'delete-chore': deleteChore(el.getAttribute('data-member'), el.getAttribute('data-chore')); break;
    case 'save-chore': saveChore(el); break;
    case 'toggle-chore': toggleChore(el.getAttribute('data-member'), el.getAttribute('data-chore')); break;
    case 'approve-allowance': requestAllowanceApproval(el.getAttribute('data-member')); break;
    case 'undo-allowance': undoAllowance(el.getAttribute('data-member')); break;
    case 'pin-submit': submitPin(); break;

    /* missions */
    case 'mission-done': markMissionDone(); break;
    case 'mission-shuffle': shuffleMissionAndRender(); break;
    case 'add-mission': openMissionModal(); break;
    case 'pick-mission-emoji': {
      window.__missionEmoji = el.getAttribute('data-emoji');
      $$('.emoji-chip').forEach(function (c) { c.classList.toggle('selected', c === el); });
      break;
    }
    case 'save-mission': saveMission(); break;
    case 'delete-mission': deleteMission(el.getAttribute('data-mission')); break;
    case 'open-stamp-calendar': openStampCalendar(); break;
    case 'cal-prev': calStep(-1); break;
    case 'cal-next': calStep(1); break;

    /* study */
    case 'add-study': openStudyModal(el.getAttribute('data-member'), null); break;
    case 'edit-study': openStudyModal(el.getAttribute('data-member'), el.getAttribute('data-item')); break;
    case 'delete-study': deleteStudyItem(el.getAttribute('data-member'), el.getAttribute('data-item')); break;
    case 'save-study': saveStudyItem(el); break;
    case 'toggle-pin': togglePin(el.getAttribute('data-member'), el.getAttribute('data-item')); break;
    case 'toggle-study': toggleStudy(el.getAttribute('data-member'), el.getAttribute('data-item')); break;
    case 'start-reading-timer': startReadingTimer(Number(el.getAttribute('data-min')) || 30); break;
    case 'timer-mode': setTimerMode(el.getAttribute('data-mode')); break;
    case 'timer-toggle': toggleTimer(); break;
    case 'timer-reset': resetTimer(); break;
    case 'timer-preset': setTimerMinutes(Number(el.getAttribute('data-min'))); break;
    case 'timer-custom': {
      var custom = $('#customMinutes');
      var mins = Number(custom && custom.value);
      if (!mins) { toast('Type how many minutes first.'); break; }
      setTimerMinutes(mins);
      break;
    }
    case 'tablet-mode': setTabletMode(el.getAttribute('data-mode')); break;
    case 'tablet-start': startTabletCountdown(); toast('Countdown started \u23F3'); break;
    case 'tablet-stop': stopTabletCountdown(); break;
    case 'tablet-test': triggerTabletAlarm('countdown'); break;
    case 'dismiss-tablet': dismissTabletLock(); break;

    /* family calendar */
    case 'cal-view': setCalendarView(el.getAttribute('data-view')); break;
    case 'cal-prev': calendarStep(-1); break;
    case 'cal-next': calendarStep(1); break;
    case 'cal-today': calendarGoToday(); break;
    case 'cal-select-day': calendarSelectDay(el.getAttribute('data-date')); break;
    case 'cal-filter': setCalendarFilter(el.getAttribute('data-member')); break;
    case 'cal-add-event': openCalendarEventModal(null, el.getAttribute('data-date') || ''); break;
    case 'cal-edit-event': openCalendarEventModal(el.getAttribute('data-event'), ''); break;
    case 'cal-delete-event': deleteCalendarEventById(el.getAttribute('data-event')); break;
    case 'cal-save-event': saveCalendarEventFromModal(el); break;
    case 'cal-emoji': calPickEmoji(el.getAttribute('data-emoji')); break;
    case 'cal-modal-member': calToggleModalMember(el.getAttribute('data-member')); break;

    /* allowance */
    case 'allowance-child': setAllowanceChild(el.getAttribute('data-member')); break;
    case 'money-in': openMoneyModal(el.getAttribute('data-member'), 'deposit'); break;
    case 'money-out': openMoneyModal(el.getAttribute('data-member'), 'spend'); break;
    case 'save-money': saveMoneyEntry(el); break;
    case 'delete-entry': deleteLedgerEntry(el.getAttribute('data-member'), el.getAttribute('data-entry')); break;

    /* chat */
    case 'chat-member': setChatMember(el.getAttribute('data-member')); break;
    case 'chat-sound': toggleChatSound(); break;
    case 'toggle-stickers': toggleStickers(); break;
    case 'send-sticker': sendSticker(el.getAttribute('data-sticker')); break;
    case 'chat-send': sendFromInput(); break;
    case 'msg-heart': toggleHeart(el.getAttribute('data-msg')); break;
    case 'msg-delete': deleteMessage(el.getAttribute('data-msg')); break;

    /* auth */
    case 'auth-signin': submitAuth(false); break;
    case 'auth-create': submitAuth(true); break;
    case 'auth-offline': continueOffline(); break;
    case 'auth-retry': retryCloud(); break;

    /* settings */
    case 'weather-lookup': lookupWeatherFromSettings(); break;
    case 'weather-unit': setWeatherUnit(el.getAttribute('data-unit')); break;
    case 'reset-photo': resetMemberPhoto(el.getAttribute('data-member')); break;
    case 'cloud-connect': connectCloudFromSettings(); break;
    case 'cloud-signout': signOutCloud(); break;
    case 'cloud-disconnect': disconnectCloud(); break;
    case 'export-json': exportJson(); break;
    case 'reset-app': resetApp(); break;

    default: break;
  }
}

function onDocumentKeydownActivate(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  var target = ev.target;
  if (!target || !target.classList || !target.classList.contains('mini-stat')) return;
  ev.preventDefault();
  switchTab(target.getAttribute('data-tab'));
}

function onDocumentClick(ev) {
  var target = ev.target;
  if (!target || !target.closest) return;
  var el = target.closest('[data-action]');
  if (!el) {
    if (target.classList && target.classList.contains('modal-backdrop')) closeModal();
    return;
  }
  ev.preventDefault();
  runAction(el.getAttribute('data-action'), el);
}

function onDocumentChange(ev) {
  var el = ev.target;
  if (!el || !el.closest) return;
  var node = el.closest('[data-change]');
  if (!node) return;
  var kind = node.getAttribute('data-change');
  var memberId = node.getAttribute('data-member');

  switch (kind) {
    case 'tablet-toggle': setTabletEnabled(node.checked); break;
    case 'tablet-clock': setTabletClock(node.value); break;
    case 'tablet-minutes': setTabletMinutes(node.value); break;
    case 'chat-lock': setChatLocked(node.checked); break;
    case 'starting-balance': setStartingBalance(memberId, node.value); break;
    case 'member-name': updateMemberField(memberId, 'name', node.value); break;
    case 'member-subtitle': updateMemberField(memberId, 'subtitle', node.value); break;
    case 'member-photo': readMemberPhoto(node); break;
    case 'pin-enabled': setPinEnabled(node.checked); break;
    case 'pin-code': setPinCode(node.value); break;
    case 'allowance-amount': setAllowanceAmount(memberId, node.value); break;
    case 'import-json': importJson(node); break;
    case 'cal-allday': calToggleAllDay(node.checked); break;
    default: break;
  }
}

function onDocumentKeydown(ev) {
  if (ev.key === 'Escape') {
    var celebration = $('#celebration');
    if (celebration && !celebration.hidden) { closeCelebration(); return; }
    closeModal();
    return;
  }
  if (ev.key !== 'Enter') return;
  var id = ev.target && ev.target.id;
  if (id === 'chatInput') { ev.preventDefault(); sendFromInput(); }
  else if (id === 'pinInput') { ev.preventDefault(); submitPin(); }
  else if (id === 'missionText') { ev.preventDefault(); saveMission(); }
  else if (id === 'authEmail' || id === 'authPassword') { ev.preventDefault(); submitAuth(false); }
}

function retryCloud() {
  var cloud = loadCloudConfig();
  if (!cloud || !cloud.configText) {
    showAuthGate('login');
    return;
  }
  showAuthGate('connecting');
  SyncEngine.paused = false;
  SyncEngine.connectFirebase(parseFirebaseConfig(cloud.configText), cloud.room).catch(function () {
    toast('Still cannot reach the family cloud.');
  });
}

/* ---------- day rollover ---------- */
var lastDayKey = dateKey();

function dayWatch() {
  var now = dateKey();
  if (now === lastDayKey) return;
  lastDayKey = now;
  ensureTodayMission();
  if (timer.running && timer.mode === 'countdown') {
    /* a timer keeps running; nothing to reset */
  }
  commit();
}

/* ---------- boot ---------- */

function preloadAvatars() {
  var list = state.members.map(function (m) { return avatarSrc(m); });
  list.forEach(function (src) {
    try { var img = new Image(); img.src = src; } catch (e) { /* ignore */ }
  });
}

function boot() {
  loadDevice();

  var cloud = loadCloudConfig();
  var room = (cloud && cloud.room) || (window.FIREBASE_ROOM || 'our-family');
  SyncEngine.setRoom(room);

  var saved = SyncEngine.read();
  state = normalizeState(saved || defaultState());
  if (cloud && cloud.configText) {
    state.settings.firebase = { configText: cloud.configText, room: room };
  }

  var createdMission = false;
  if (!state.missions.current || state.missions.current.date !== dateKey()) {
    ensureTodayMission();
    createdMission = true;
  }

  preloadAvatars();
  renderHeader();
  renderNav();
  switchTab('home');

  if (createdMission) SyncEngine.save(state);

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('change', onDocumentChange);
  document.addEventListener('keydown', onDocumentKeydown);
  document.addEventListener('keydown', onDocumentKeydownActivate);
  document.addEventListener('fullscreenchange', renderHeader);
  document.addEventListener('webkitfullscreenchange', renderHeader);

  /* bottom navigation: every tab button switches its panel */
  $$('.nav-btn').forEach(function (btn) {
    var tab = btn.getAttribute('data-tab');
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      switchTab(tab);
    });
  });

  var settingsBtn = $('#settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', function (ev) { ev.preventDefault(); openSettings(); });
  var fsBtn = $('#fullscreenBtn');
  if (fsBtn) fsBtn.addEventListener('click', function (ev) { ev.preventDefault(); toggleFullscreen(); });

  setInterval(tick, 1000);
  setInterval(dayWatch, 60000);
  setInterval(function () { if (!document.hidden) renderHeader(); }, 20000);

  /* cloud auth gate: only when Firebase has been configured for this family */
  var cfg = parseFirebaseConfig(cloud && cloud.configText);
  if (!cfg && window.FIREBASE_CONFIG) {
    cfg = window.FIREBASE_CONFIG;
    room = window.FIREBASE_ROOM || room;
    SyncEngine.setRoom(room);
    saveCloudConfig({ configText: JSON.stringify(cfg), room: room });
  }
  if (cfg && (cfg.databaseURL || cfg.databaseUrl)) {
    showAuthGate('connecting');
    SyncEngine.connectFirebase(cfg, room).catch(function (err) {
      showAuthGate('offline', (err && err.message) || 'The family cloud could not be reached.');
    });
  } else {
    hideAuthGate();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
