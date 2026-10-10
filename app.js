(() => {
'use strict';
const KEY = 'badani.journal.v1';
const DAYN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const PCOL = ['--p0','--p3','--p1','--p2','--p4'];   // phase 0 = orange (Strength), phase 1 = teal (Agility)

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked') e.checked = !!v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  if (value !== undefined) e.value = value;
  return e;
}
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dowOf = d => (d.getDay() + 6) % 7;
// first day of the user's week (0 = Mon … 6 = Sun); guarded because defaults() runs before S exists
const wstart = () => (typeof S !== 'undefined' && S && typeof S.weekStart === 'number') ? S.weekStart : 0;
const sowOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((dowOf(d) - wstart() + 7) % 7));
const fmt = n => (Number.isInteger(n) ? n : +(+n).toFixed(2));
const uid = () => Math.random().toString(36).slice(2, 9);
const shortDate = d => `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
const longDate = d => d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------- templates & defaults ---------- */
const TPL = {
  'Heavy 8-set (1+ top set)': [[75,5],[85,3],[95,1,1],[90,3],[85,3],[80,3],[75,5],[70,5]],
  'Volume 8-set (last set +)': [[65,8],[75,6],[85,4],[85,4],[85,4],[80,5],[75,6],[70,7,1]],
  '7-set': [[70,5],[80,3],[90,1,1],[85,3],[80,4],[75,5],[70,6,1]],
  '5 × 5': [[80,5],[80,5],[80,5],[80,5],[80,5]],
  'Light 4 × 10': [[80,10],[80,10],[80,10],[80,10]],
  '4 × 10': [[100,10],[100,10],[100,10],[100,10]],
};
const TPL_BW = {
  '5 × 10 (last set max)': [[100,10],[100,10],[100,10],[100,10],[100,10,1]],
  '4 × max': [[100,10,1],[100,10,1],[100,10,1],[100,10,1]],
  '3 × 15': [[100,15],[100,15],[100,15]],
};
const mkSets = a => a.map(([pct, reps, am]) => ({ pct, reps, amrap: !!am }));
// lift = key into S.tms ('' = custom fixed weight in ex.base); scale = % of that training max this exercise works from
const mkEx = (name, label, lift, scale, tpl, bw = false) =>
  ({ id: uid(), name, label, bw, lift, scale, base: 0, sets: mkSets((bw ? TPL_BW : TPL)[tpl]), video: '' });
// fixed-weight dumbbell move (equipment: a pair of 5kg dumbbells)
const mkDB = (name, label, tpl = '4 × 10') => { const e = mkEx(name, label, '', 100, tpl); e.base = 5; return e; };
// Agility block: pull-up bar + bodyweight + 2 × 5kg dumbbells; focus = muscle, coordination, mobility
function agilitySlots() {
  return [
    [mkEx('Pull-ups', '', '', 100, '4 × max', true), mkEx('Push-ups', '', '', 100, '5 × 10 (last set max)', true), mkDB('Lateral Raises', '5kg DB')],
    [mkDB('Dumbbell Squats', '5kg ×2'), mkEx('Pike Push-ups', '', '', 100, '4 × max', true), mkEx('Bench Dips', '', '', 100, '4 × max', true)],
    [mkEx('Pull-ups', '', '', 100, '4 × max', true), mkDB('Dumbbell Deadlift', '5kg ×2'), mkEx('Diamond Push-ups', '', '', 100, '4 × max', true)],
  ];
}

function defaults() {
  return {
    v: 4,
    startDate: iso(sowOf(new Date())),
    weekStart: 1,               // weeks run Tue–Mon (workout days Tue, Thu, Sat)
    days: [1, 3, 5],            // Tue, Thu, Sat
    unit: 'kg',
    round: 2.5,
    restSec: 180, warnSec: 120,
    tms: { Bench: 125, OHP: 75, Squat: 50, Deadlift: 40 },
    applied: [],
    phases: [
      { id: uid(), name: 'Strength', weeks: 2, progress: true, slots: [
        [mkEx('Bench Press', 'Heavy', 'Bench', 100, 'Heavy 8-set (1+ top set)'), mkEx('Shoulder Press', 'Heavy', 'OHP', 100, '7-set')],
        [mkEx('Shoulder Press', 'PR', 'OHP', 100, 'Heavy 8-set (1+ top set)'), mkEx('Incline Bench Press', '', 'Bench', 75, 'Volume 8-set (last set +)')],
        [mkEx('Bench Press', 'PR', 'Bench', 100, 'Heavy 8-set (1+ top set)'), mkEx('Close Grip Barbell Triceps', '', 'Bench', 80, '7-set')],
      ]},
      { id: uid(), name: 'Agility', weeks: 2, progress: false, slots: agilitySlots() },
    ],
    logs: {},
  };
}

/* ---------- state ---------- */
let S;
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { S = defaults(); }
  if (!S.v || S.v < 2) {   // v1 had no training maxes: keep logs/schedule, take the new programme
    const o = S; S = defaults();
    S.logs = o.logs || {}; S.days = o.days || S.days; S.startDate = o.startDate || S.startDate;
    S.unit = o.unit || 'kg'; S.round = o.round || 2.5;
  }
  if (S.v < 4) {   // v4: renamed phases, agility rebuilt for 5kg-DB + pull-up bar, weeks can start any day
    S.weekStart = 1;             // this user's cycle starts Tuesday
    for (const p of S.phases || []) {
      if (p.name === 'Weights') p.name = 'Strength';
      if (p.name === 'Bodyweight') p.name = 'Agility';
      if (p.name === 'Agility') p.slots = agilitySlots();
    }
    // keep week 1 anchored where it was: move the start FORWARD to the first new week-day
    // (a backward snap would shift the whole cycle one week earlier)
    const d = parse(S.startDate);
    while (dowOf(d) !== S.weekStart) d.setDate(d.getDate() + 1);
    S.startDate = iso(d);
    S.v = 4;
  }
  normalize();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function normalize() {
  if (typeof S.weekStart !== 'number') S.weekStart = 0;
  S.days = [...new Set(S.days)].sort((a, b) => a - b);
  if (!S.days.length) S.days = [0];
  S.startDate = iso(sowOf(parse(S.startDate)));
  for (const p of S.phases) while (p.slots.length < S.days.length) p.slots.push([]);
}

/* ---------- plan logic ---------- */
const totalWeeks = () => S.phases.reduce((a, p) => a + p.weeks, 0) || 1;
const weekIdx = d => Math.round((sowOf(d) - parse(S.startDate)) / (7 * 864e5));
function phaseFor(wi) {
  const tot = totalWeeks();
  let w = ((wi % tot) + tot) % tot;
  for (let i = 0; i < S.phases.length; i++) {
    const p = S.phases[i];
    if (w < p.weeks) return { phase: p, i, wk: w + 1 };
    w -= p.weeks;
  }
  return { phase: S.phases[0], i: 0, wk: 1 };
}
const slotFor = d => S.days.indexOf(dowOf(d));
function weightFor(ex, set) {
  if (ex.bw) return 0;
  const tm = ex.lift ? (S.tms[ex.lift] || 0) : (ex.base || 0);
  return fmt(Math.round((tm * (ex.scale ?? 100) / 100 * set.pct / 100) / S.round) * S.round);
}
function exName(e) { return e.label ? `${e.name} (${e.label})` : e.name; }
function planFor(d) {
  const { phase, i, wk } = phaseFor(weekIdx(d));
  const slot = slotFor(d);
  return { phase, pi: i, wk, slot, exs: slot >= 0 ? (phase.slots[slot] || []) : [] };
}
function buildSession(d) {
  const pl = planFor(d);
  return {
    phase: pl.phase.name, slot: pl.slot, note: '', bodyweight: '',
    exercises: pl.exs.map(ex => ({
      name: ex.name, label: ex.label || '', bw: ex.bw, lift: ex.lift || '',
      sets: ex.sets.map(s => {
        const w = weightFor(ex, s);
        return { tw: w, tr: s.reps, amrap: !!s.amrap, w, r: '', done: false };
      }),
    })),
  };
}
const hasDone = log => log && log.exercises.some(e => e.sets.some(s => s.done));

/* ---------- routing ---------- */
let calOff = 0, pTab = 0, statEx = null;
function route() { return (location.hash.replace(/^#\/?/, '') || '').split('/'); }
function render() {
  const r = route(), app = $('#app');
  app.replaceChildren();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on',
    a.dataset.r === (r[0] === 'day' || r[0] === '' ? 'cal' : r[0])));
  if (r[0] === 'day') app.append(viewDay(r[1]));
  else if (r[0] === 'programme') app.append(viewProgramme());
  else if (r[0] === 'stats') app.append(viewStats());
  else if (r[0] === 'settings') app.append(viewSettings());
  else app.append(viewCalendar());
  window.scrollTo(0, 0);
}
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
window.addEventListener('hashchange', render);

/* ---------- calendar ---------- */
function viewCalendar() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const root = h('div');
  const tp = planFor(today);
  const tlog = S.logs[iso(today)];
  root.append(h('h1', null, 'Badani Journal'));

  const tcard = h('div', { class: 'card' });
  const tvids = dayVideos(tp.exs);   // [{name, provider, src}]
  if (tp.slot >= 0 || tlog) {
    tcard.append(
      h('div', { class: 'mute small' }, `Today · ${tp.phase.name} week ${tp.wk}/${tp.phase.weeks}`),
      h('h3', null, tp.slot >= 0 ? `Day ${tp.slot + 1}` : 'Extra session'),
      h('div', { class: 'row', style: 'margin:4px 0 10px' },
        h('span', { class: 'mute grow' }, tp.exs.map(exName).join(' · ') || 'Nothing planned'),
        tvids.length > 0 && h('button', { class: 'ghost', style: 'padding:2px 10px', onclick: () => toggleVids(iso(today), tvids) },
          vidFloat && vidFloat.key === iso(today) ? '✕ Close video' : '▶ Video')),
      h('button', { class: 'pri', onclick: () => location.hash = `#/day/${iso(today)}` },
        hasDone(tlog) ? 'Continue workout' : 'Start workout'));
  } else {
    tcard.append(h('div', { class: 'mute small' }, `Today · ${tp.phase.name} week ${tp.wk}/${tp.phase.weeks}`),
      h('h3', null, 'Rest day'), h('div', { class: 'mute' }, 'Tap any day below to log something extra.'));
  }
  const pend = pendingTM();
  if (pend) root.append(tmPrompt(pend));
  root.append(tcard);

  root.append(h('div', { class: 'row between', style: 'margin-bottom:8px' },
    h('button', { onclick: () => { calOff -= 4; rerender(); } }, '◀ Earlier'),
    h('button', { class: 'ghost', onclick: () => { calOff = 0; rerender(); } }, 'Today'),
    h('button', { onclick: () => { calOff += 4; rerender(); } }, 'Later ▶')));

  const first = addDays(sowOf(today), -7 + calOff * 7);
  const colOrder = [0, 1, 2, 3, 4, 5, 6].map(i => (S.weekStart + i) % 7);   // grid columns follow the user's week start
  root.append(h('div', { class: 'dows', style: 'margin-bottom:4px' }, colOrder.map(i => h('div', null, DAYN[i]))));
  for (let w = 0; w < 6; w++) {
    const ws = addDays(first, w * 7);
    const wi = weekIdx(ws);
    const { phase, i, wk } = phaseFor(wi);
    const col = `var(${PCOL[i % PCOL.length]})`;
    const before = wi < 0;
    const week = h('div', { class: 'week', style: `--pc:${col}` },
      h('div', { class: 'weekhead' },
        h('b', { style: `color:${col}` }, before ? 'Before start' : `Week ${wi + 1} · ${phase.name} ${wk}/${phase.weeks}`),
        h('span', { class: 'mute' }, shortDate(ws))));
    const grid = h('div', { class: 'days' });
    for (const ci of colOrder) {
      const date = addDays(ws, ci), key = iso(date);
      const slot = slotFor(date), log = S.logs[key];
      const planned = slot >= 0 && !before;
      grid.append(h('div', {
        class: 'cell' + (planned ? ' plan' : '') + (key === iso(today) ? ' today' : '') + (before ? ' dim' : ''),
        onclick: () => location.hash = `#/day/${key}`,
      },
        h('span', { class: 'n' }, date.getDate()),
        planned && h('span', { class: 'lab' }, `D${slot + 1}`),
        !planned && log && h('span', { class: 'lab' }, 'Extra'),
        hasDone(log) && h('span', { class: 'ck' }, '✓')));
    }
    week.append(grid);
    root.append(week);
  }
  return root;
}

/* ---------- day / session ---------- */
function viewDay(key) {
  const date = parse(key);
  const pl = planFor(date);
  let log = S.logs[key];
  let isDraft = false;
  if (!log) { log = buildSession(date); isDraft = true; }
  const commit = () => { if (isDraft) { S.logs[key] = log; isDraft = false; } save(); };

  const root = h('div');
  root.append(
    h('div', { class: 'row between' },
      h('button', { class: 'ghost', onclick: () => location.hash = '#/' }, '← Calendar'),
      h('span', { class: 'tag' }, `${pl.phase.name} · wk ${pl.wk}/${pl.phase.weeks}`)),
    h('h1', null, longDate(date)),
    h('div', { class: 'mute', style: 'margin:-6px 0 12px' },
      log.slot >= 0 ? `Day ${log.slot + 1}` : 'Extra session'));

  const body = h('div');
  root.append(body);

  function draw() {
    body.replaceChildren();
    if (!log.exercises.length)
      body.append(h('div', { class: 'card mute' }, 'No exercises planned. Add one below, or plan this day in Programme.'));
    log.exercises.forEach((ex, ei) => body.append(exCard(ex, ei)));

    const names = allNames();
    const dl = h('datalist', { id: 'names' }, names.map(n => h('option', { value: n })));
    const nm = h('input', { placeholder: 'Add exercise…', list: 'names' });
    const bwc = h('input', { type: 'checkbox' });
    body.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, nm, h('label', { class: 'row small mute' }, bwc, 'BW'),
        h('button', { onclick: () => {
          if (!nm.value.trim()) return;
          const bw = bwc.checked;
          log.exercises.push({ name: nm.value.trim(), label: '', bw, sets: [1, 2, 3].map(() => ({ tw: 0, tr: 10, amrap: false, w: 0, r: '', done: false })) });
          commit(); draw();
        } }, 'Add')), dl));

    body.append(h('div', { class: 'card' },
      h('div', { class: 'fields' },
        h('div', null, h('div', { class: 'lbl' }, 'Notes'),
          h('textarea', { rows: 2, value: log.note || '', oninput: e => { log.note = e.target.value; commit(); } })),
        h('div', null, h('div', { class: 'lbl' }, `Body weight (${S.unit})`),
          h('input', { type: 'number', step: '0.1', inputmode: 'decimal', value: log.bodyweight, oninput: e => { log.bodyweight = e.target.value; commit(); } })))));

    body.append(h('div', { class: 'row wrap' },
      h('button', { onclick: () => { if (confirm('Reset this day to the planned sets? Logged reps will be lost.')) { delete S.logs[key]; save(); rerender(); } } }, 'Reset to plan'),
      S.logs[key] && h('button', { class: 'danger', onclick: () => { if (confirm('Delete this session log?')) { delete S.logs[key]; save(); location.hash = '#/'; } } }, 'Delete log')));
  }

  function exCard(ex, ei) {
    const card = h('div', { class: 'card' });
    card.append(h('div', { class: 'row between', style: 'margin-bottom:6px' },
      h('h3', null, exName(ex)),
      h('button', { class: 'ghost', title: 'Remove exercise', onclick: () => {
        if (confirm(`Remove ${exName(ex)} from this day?`)) { log.exercises.splice(ei, 1); commit(); draw(); }
      } }, '✕')));
    ex.sets.forEach((s, si) => {
      const tgt = ex.bw ? `${s.tr}${s.amrap ? '+' : ''} reps` : `${fmt(s.tw)} × ${s.tr}${s.amrap ? '+' : ''}`;
      const row = h('div', { class: 'srow' + (s.done ? ' done' : '') },
        h('span', { class: 'mute small' }, si + 1),
        h('span', { class: 'tg' + (s.amrap ? ' amrap' : '') }, tgt),
        h('input', { type: 'number', step: S.round, inputmode: 'decimal', placeholder: ex.bw ? '+kg' : S.unit, value: ex.bw && !+s.w ? '' : s.w,
          oninput: e => { s.w = e.target.value === '' ? 0 : +e.target.value; commit(); } }),
        h('input', { type: 'number', inputmode: 'numeric', placeholder: String(s.tr), value: s.r,
          oninput: e => { s.r = e.target.value === '' ? '' : +e.target.value; if (s.r !== '' && !s.done) { s.done = true; row.classList.add('done'); chk.textContent = '✓'; } commit(); } }));
      const rin = row.children[3];
      const chk = h('button', { class: 'chk', onclick: () => {
        s.done = !s.done;
        if (s.done && s.r === '') { s.r = s.tr; rin.value = s.tr; }
        row.classList.toggle('done', s.done); chk.textContent = s.done ? '✓' : '○';
        commit();
        if (s.done) startTimer();
      } }, s.done ? '✓' : '○');
      row.append(chk);
      card.append(row);
    });
    card.append(h('div', { class: 'row', style: 'margin-top:6px' },
      h('button', { class: 'ghost', onclick: () => {
        const l = ex.sets[ex.sets.length - 1] || { tw: 0, tr: 10 };
        ex.sets.push({ tw: l.tw, tr: l.tr, amrap: false, w: l.tw, r: '', done: false }); commit(); draw();
      } }, '+ set'),
      ex.sets.length > 1 && h('button', { class: 'ghost', onclick: () => { ex.sets.pop(); commit(); draw(); } }, '− set')));
    return card;
  }
  draw();
  return root;
}
function allNames() {
  const set = new Set();
  S.phases.forEach(p => p.slots.forEach(sl => sl.forEach(e => set.add(e.name))));
  Object.values(S.logs).forEach(l => l.exercises.forEach(e => set.add(e.name)));
  return [...set].sort();
}

/* ---------- programme editor ---------- */
function viewProgramme() {
  normalize();
  if (pTab >= S.phases.length) pTab = 0;
  const p = S.phases[pTab];
  const root = h('div');
  root.append(h('h1', null, 'Programme'),
    h('p', { class: 'mute small', style: 'margin-top:-6px' },
      `Cycle: ${S.phases.map(x => `${x.name} ${x.weeks}w`).join(' → ')} → repeat. Schedule: ${S.days.map(d => DAYN[d]).join(', ')}.`));

  root.append(tmCard());
  root.append(h('div', { class: 'tabs' },
    S.phases.map((x, i) => h('button', { class: 'tab' + (i === pTab ? ' on' : ''), onclick: () => { pTab = i; rerender(); } }, x.name)),
    h('button', { class: 'tab', onclick: () => {
      S.phases.push({ id: uid(), name: 'Phase ' + (S.phases.length + 1), weeks: 2, slots: S.days.map(() => []) });
      pTab = S.phases.length - 1; normalize(); save(); rerender();
    } }, '+ Phase')));

  root.append(h('div', { class: 'card' },
    h('div', { class: 'fields' },
      h('div', null, h('div', { class: 'lbl' }, 'Phase name'),
        h('input', { value: p.name, onchange: e => { p.name = e.target.value || 'Phase'; save(); rerender(); } })),
      h('div', null, h('div', { class: 'lbl' }, 'Weeks'),
        h('input', { type: 'number', min: 1, max: 12, value: p.weeks, onchange: e => { p.weeks = Math.max(1, Math.min(12, +e.target.value || 1)); save(); rerender(); } }))),
    h('label', { class: 'row small', style: 'margin-bottom:8px' },
      h('input', { type: 'checkbox', checked: p.progress !== false, onchange: e => { p.progress = e.target.checked; save(); } }),
      'Raise training maxes after each week of this phase'),
    h('div', { class: 'row wrap', style: 'margin-bottom:8px' },
      h('button', { class: 'ghost', disabled: pTab === 0, onclick: () => {
        [S.phases[pTab - 1], S.phases[pTab]] = [S.phases[pTab], S.phases[pTab - 1]];
        pTab--; save(); rerender();
      } }, '◀ Earlier in cycle'),
      h('button', { class: 'ghost', disabled: pTab === S.phases.length - 1, onclick: () => {
        [S.phases[pTab + 1], S.phases[pTab]] = [S.phases[pTab], S.phases[pTab + 1]];
        pTab++; save(); rerender();
      } }, 'Later in cycle ▶'),
      h('span', { class: 'grow' }),
      h('button', { class: 'ghost', onclick: () => {
        if (!confirm(`Restart the cycle so "${p.name}" becomes week 1, starting this week? Your logs are kept.`)) return;
        S.phases = S.phases.slice(pTab).concat(S.phases.slice(0, pTab));
        pTab = 0;
        S.startDate = iso(sowOf(new Date()));
        S.applied = [];
        save(); rerender();
      } }, 'Start cycle at this phase')),
    S.phases.length > 1 && h('button', { class: 'danger', onclick: () => {
      if (confirm(`Delete phase "${p.name}"?`)) { S.phases.splice(pTab, 1); pTab = 0; save(); rerender(); }
    } }, 'Delete phase')));

  const dl = h('datalist', { id: 'names' }, allNames().map(n => h('option', { value: n })));
  root.append(dl);

  S.days.forEach((dow, si) => {
    const list = p.slots[si];
    const sec = h('div', { class: 'card' });
    sec.append(h('div', { class: 'row between' }, h('h3', null, `Day ${si + 1} · ${DAYN[dow]}`),
      h('span', { class: 'mute small' }, `${list.length} exercise${list.length === 1 ? '' : 's'}`)));
    list.forEach((ex, ei) => sec.append(exEditor(list, ex, ei)));
    sec.append(h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { onclick: () => { list.push(mkEx('New exercise', '', Object.keys(S.tms)[0] || '', 100, '5 × 5')); save(); rerender(); } }, '+ Weighted exercise'),
      h('button', { onclick: () => { list.push(mkEx('New bodyweight', '', '', 100, '4 × max', true)); save(); rerender(); } }, '+ Bodyweight')));
    root.append(sec);
  });
  return root;
}

function exEditor(list, ex, ei) {
  const card = h('div', { class: 'ex-card' });
  const wlabels = [];
  const refresh = () => ex.sets.forEach((s, i) => { if (wlabels[i]) wlabels[i].textContent = ex.bw ? 'BW' : `${fmt(weightFor(ex, s))} ${S.unit}`; });

  card.append(h('div', { class: 'fields' },
    h('div', null, h('div', { class: 'lbl' }, 'Exercise'),
      h('input', { list: 'names', value: ex.name, onchange: e => { ex.name = e.target.value.trim() || ex.name; save(); } })),
    h('div', null, h('div', { class: 'lbl' }, 'Label (Heavy / PR…)'),
      h('input', { value: ex.label || '', onchange: e => { ex.label = e.target.value.trim(); save(); } }))));

  const baseRow = h('div', { class: 'row wrap', style: 'margin-bottom:6px' });
  if (!ex.bw) {
    baseRow.append(
      h('div', { style: 'width:120px' }, h('div', { class: 'lbl' }, 'Training max'),
        h('select', { value: ex.lift || '', onchange: e => { ex.lift = e.target.value; save(); rerender(); } },
          Object.keys(S.tms).map(k => h('option', { value: k }, `${k} (${fmt(S.tms[k])})`)), h('option', { value: '' }, 'Custom weight'))));
    if (ex.lift) baseRow.append(h('div', { style: 'width:80px' }, h('div', { class: 'lbl' }, '% of TM'),
      h('input', { type: 'number', inputmode: 'decimal', value: ex.scale ?? 100, oninput: e => { ex.scale = +e.target.value || 0; save(); refresh(); } })));
    else baseRow.append(h('div', { style: 'width:100px' }, h('div', { class: 'lbl' }, `Weight (${S.unit})`),
      h('input', { type: 'number', step: S.round, inputmode: 'decimal', value: ex.base, oninput: e => { ex.base = +e.target.value || 0; save(); refresh(); } })));
  }
  baseRow.append(
    h('div', { class: 'grow' }, h('div', { class: 'lbl' }, 'Set template'),
      h('select', { onchange: e => {
        const t = (ex.bw ? TPL_BW : TPL)[e.target.value];
        if (t) { ex.sets = mkSets(t); save(); rerender(); }
      } }, h('option', { value: '' }, 'Apply…'), Object.keys(ex.bw ? TPL_BW : TPL).map(k => h('option', { value: k }, k)))));
  card.append(baseRow);

  const vemb = ex.video ? videoEmbed(ex.video) : null;
  card.append(h('div', { class: 'row', style: 'margin-bottom:6px' },
    h('div', { class: 'grow' },
      h('div', { class: 'lbl' }, 'Video link (YouTube / TikTok / Instagram)'),
      h('input', { value: ex.video || '', placeholder: 'Paste a link — it embeds in Calendar', onchange: e => { ex.video = e.target.value.trim(); save(); rerender(); } })),
    ex.video && h('span', { class: 'tag', style: vemb ? '' : 'color:var(--bad)' }, vemb ? vemb.provider : 'unrecognized')));

  card.append(h('div', { class: 'setrow' + (ex.bw ? ' bw' : '') },
    h('span'), !ex.bw && h('span', { class: 'lbl' }, '% of max'), h('span', { class: 'lbl' }, 'Reps'),
    h('span', { class: 'lbl' }, 'Max+'), h('span'), !ex.bw && h('span', { class: 'lbl' }, 'Weight')));
  ex.sets.forEach((s, i) => {
    const wl = h('span', { class: 'small mute' });
    wlabels[i] = wl;
    card.append(h('div', { class: 'setrow' + (ex.bw ? ' bw' : '') },
      h('span', { class: 'mute small' }, i + 1),
      !ex.bw && h('input', { type: 'number', inputmode: 'decimal', value: s.pct, oninput: e => { s.pct = +e.target.value || 0; save(); refresh(); } }),
      h('input', { type: 'number', inputmode: 'numeric', value: s.reps, oninput: e => { s.reps = +e.target.value || 0; save(); } }),
      h('input', { type: 'checkbox', checked: s.amrap, onchange: e => { s.amrap = e.target.checked; save(); } }),
      h('button', { class: 'ghost', onclick: () => { ex.sets.splice(i, 1); save(); rerender(); } }, '✕'),
      !ex.bw && wl));
  });
  refresh();

  card.append(h('div', { class: 'row wrap', style: 'margin-top:6px' },
    h('button', { onclick: () => {
      const l = ex.sets[ex.sets.length - 1] || { pct: 100, reps: 5, amrap: false };
      ex.sets.push({ ...l, amrap: false }); save(); rerender();
    } }, '+ Set'),
    h('label', { class: 'row small mute' }, h('input', { type: 'checkbox', checked: ex.bw, onchange: e => { ex.bw = e.target.checked; save(); rerender(); } }), 'Bodyweight'),
    h('span', { class: 'grow' }),
    h('button', { class: 'ghost', onclick: () => { if (ei > 0) { [list[ei - 1], list[ei]] = [list[ei], list[ei - 1]]; save(); rerender(); } } }, '↑'),
    h('button', { class: 'ghost', onclick: () => { if (ei < list.length - 1) { [list[ei + 1], list[ei]] = [list[ei], list[ei + 1]]; save(); rerender(); } } }, '↓'),
    h('button', { class: 'danger ghost', onclick: () => { if (confirm(`Delete ${exName(ex)}?`)) { list.splice(ei, 1); save(); rerender(); } } }, 'Delete')));
  return card;
}

/* ---------- training maxes ---------- */
function tmCard() {
  const card = h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, `Training maxes (${S.unit})`));
  Object.keys(S.tms).forEach(k => card.append(h('div', { class: 'row', style: 'margin:5px 0' },
    h('span', { class: 'grow' }, k),
    h('input', { type: 'number', step: S.round, inputmode: 'decimal', style: 'width:100px', value: S.tms[k],
      onchange: e => { S.tms[k] = +e.target.value || 0; save(); } }),
    h('button', { class: 'ghost danger', title: 'Remove', onclick: () => {
      if (!confirm(`Remove ${k}? Exercises using it switch to a custom weight.`)) return;
      delete S.tms[k];
      S.phases.forEach(p => p.slots.forEach(sl => sl.forEach(e => { if (e.lift === k) { e.base = 0; e.lift = ''; } })));
      save(); rerender();
    } }, '✕'))));
  const nm = h('input', { placeholder: 'New lift (e.g. Row)' });
  card.append(h('div', { class: 'row', style: 'margin-top:8px' }, nm,
    h('button', { onclick: () => { const n = nm.value.trim(); if (n && !(n in S.tms)) { S.tms[n] = 0; save(); rerender(); } } }, 'Add')),
    h('p', { class: 'mute small', style: 'margin-bottom:0' }, 'Set weights are a % of these. After each week of a phase with progress enabled you get a prompt on the Calendar to raise them.'));
  return card;
}
// Earliest finished, progress-enabled week with logged lifts whose maxes haven't been reviewed yet.
function pendingTM() {
  const cur = weekIdx(new Date());
  const weeks = {};
  for (const [key, log] of Object.entries(S.logs)) {
    const wi = weekIdx(parse(key));
    if (wi < 0 || wi >= cur || S.applied.includes(wi) || phaseFor(wi).phase.progress === false) continue;
    for (const ex of log.exercises) {
      if (!ex.lift || !(ex.lift in S.tms)) continue;
      for (const s of ex.sets) {
        if (!s.done || !(+s.r > 0)) continue;
        const l = ((weeks[wi] ||= {})[ex.lift] ||= { top: 0, amrap: false });
        if (s.amrap) { l.amrap = true; l.top = Math.max(l.top, s.r - s.tr + 1); }
      }
    }
  }
  const wi = Object.keys(weeks).map(Number).sort((a, b) => a - b)[0];
  return wi === undefined ? null : { wi, lifts: weeks[wi] };
}
// nSuns-style: reps on the + set decide the bump
function suggest(l) {
  const m = S.unit === 'lb' ? 2 : 1;
  if (!l.amrap) return 0;
  return (l.top >= 6 ? 7.5 : l.top >= 4 ? 5 : l.top >= 2 ? 2.5 : 0) * m;
}
function tmPrompt(pend) {
  const inc = {};
  const card = h('div', { class: 'card', style: 'border-color:var(--accent)' },
    h('h3', null, `Week ${pend.wi + 1} done — update training maxes`),
    h('p', { class: 'mute small' }, 'Suggested from the reps you hit on your + sets (0–1 → no change, 2–3 → +2.5, 4–5 → +5, 6+ → +7.5). Edit any value.'));
  for (const [lift, l] of Object.entries(pend.lifts)) {
    inc[lift] = suggest(l);
    const to = h('span', { class: 'mute' });
    const upd = () => { to.textContent = `→ ${fmt(S.tms[lift] + inc[lift])}`; };
    card.append(h('div', { class: 'row', style: 'margin:6px 0' },
      h('span', { class: 'grow' }, `${lift} ${fmt(S.tms[lift])}`),
      h('span', { class: 'mute small' }, l.amrap ? `+ set: ${l.top} reps` : 'no + set'),
      h('input', { type: 'number', step: S.round, inputmode: 'decimal', style: 'width:76px', value: inc[lift],
        oninput: e => { inc[lift] = +e.target.value || 0; upd(); } }), to));
    upd();
  }
  card.append(h('div', { class: 'row', style: 'margin-top:8px' },
    h('button', { class: 'pri', onclick: () => {
      for (const l in inc) S.tms[l] = fmt(S.tms[l] + inc[l]);
      S.applied.push(pend.wi); save(); rerender();
    } }, 'Apply'),
    h('button', { class: 'ghost', onclick: () => { S.applied.push(pend.wi); save(); rerender(); } }, 'Skip this week')));
  return card;
}

/* ---------- rest timer ---------- */
let timer = null, actx = null;
const tbar = h('div', { id: 'timer', hidden: true });
document.body.append(tbar);
function beep(n) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < n; i++) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + i * 0.25; o.start(t); o.stop(t + 0.15);
    }
  } catch {}
  try { navigator.vibrate && navigator.vibrate(n === 1 ? 150 : [200, 100, 200]); } catch {}
}
function startTimer() {
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
  timer = { start: Date.now(), warned: false, done: false };
  tick();
}
const mmss = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
function tick() {
  if (!timer) { tbar.hidden = true; return; }
  const el = (Date.now() - timer.start) / 1000;
  const rest = S.restSec || 180, warn = Math.min(S.warnSec || 120, rest);
  if (!timer.warned && el >= warn) { timer.warned = true; if (warn < rest) beep(1); }
  if (!timer.done && el >= rest) { timer.done = true; beep(2); }
  const st = el >= rest ? 'ok' : el >= warn ? 'warn' : 'run';
  tbar.hidden = false;
  tbar.className = st;
  tbar.replaceChildren(
    h('div', { class: 'fill', style: `width:${Math.min(100, el / rest * 100)}%` }),
    h('div', { class: 'tin' },
      h('b', null, mmss(el)),
      h('span', null, st === 'ok' ? 'Ready — next set' : st === 'warn' ? `OK to go if short on time · full rest at ${mmss(rest)}` : `Resting · orange at ${mmss(warn)}, ready at ${mmss(rest)}`),
      h('button', { class: 'ghost', onclick: () => { timer = null; tick(); } }, '✕')));
}
setInterval(tick, 250);

/* ---------- video links (YouTube / TikTok / Instagram embeds) ---------- */
// Accept a pasted video URL and return an in-app embed source, or null if unrecognized.
function videoEmbed(url) {
  if (!url) return null;
  url = String(url).trim();
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/)))
    return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  if ((m = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/)))
    return { provider: 'TikTok', src: `https://www.tiktok.com/embed/${m[1]}` };
  if ((m = url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/)))
    return { provider: 'Instagram', src: `https://www.instagram.com/p/${m[1]}/embed` };
  return null;
}
const dayVideos = exs => exs.flatMap(ex => {
  const v = videoEmbed(ex.video);
  return v ? [{ name: exName(ex), ...v }] : [];
});

let vidFloat = null;   // { key, items, i }
const vbar = h('div', { id: 'vidfloat', hidden: true });
document.body.append(vbar);
function toggleVids(key, items) {
  if (vidFloat && vidFloat.key === key) vidFloat = null;   // play button doubles as close
  else vidFloat = { key, items, i: 0 };
  drawVid();
  rerender();   // flip the calendar button label between ▶ Video and ✕ Close video
}
function drawVid() {
  if (!vidFloat || !vidFloat.items.length) { vbar.hidden = true; vbar.replaceChildren(); return; }
  const it = vidFloat.items[vidFloat.i], n = vidFloat.items.length;
  vbar.hidden = false;
  vbar.replaceChildren(
    h('div', { class: 'tin' },
      h('b', null, '▶'),
      h('span', { class: 'grow' }, it.name, h('div', { class: 'mute' }, `${it.provider} · ${vidFloat.i + 1}/${n}`)),
      n > 1 && h('button', { class: 'ghost', onclick: () => { vidFloat.i = (vidFloat.i + n - 1) % n; drawVid(); } }, '◀'),
      n > 1 && h('button', { class: 'ghost', onclick: () => { vidFloat.i = (vidFloat.i + 1) % n; drawVid(); } }, '▶'),
      h('button', { class: 'ghost', onclick: () => { vidFloat = null; drawVid(); rerender(); } }, '✕')),
    h('div', { class: 'vwrap' },
      h('iframe', { src: it.src, allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true })));
}

/* ---------- stats ---------- */
function collect() {
  // name -> weekIdx -> weightKey -> {reps, sets}
  const out = {};
  for (const [key, log] of Object.entries(S.logs)) {
    const wi = weekIdx(parse(key));
    for (const ex of log.exercises) {
      for (const s of ex.sets) {
        const r = +s.r;
        if (!s.done || !(r > 0)) continue;
        const w = +s.w || 0;
        const o = ((out[ex.name] ||= {})[wi] ||= {});
        const c = (o[w] ||= { reps: 0, sets: 0, best: 0 });
        c.reps += r; c.sets++; c.best = Math.max(c.best, r);
      }
    }
  }
  return out;
}
function viewStats() {
  const data = collect();
  const names = Object.keys(data).sort();
  const root = h('div', null, h('h1', null, 'Weekly performance'));
  if (!names.length) {
    root.append(h('div', { class: 'card mute' }, 'Nothing logged yet. Complete some sets from the calendar and your reps per weight will show up here.'));
    return root;
  }
  if (!statEx || !data[statEx]) statEx = names[0];
  root.append(h('select', { style: 'margin-bottom:12px', value: statEx, onchange: e => { statEx = e.target.value; rerender(); } },
    names.map(n => h('option', { value: n }, n))));

  const byWeek = data[statEx];
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b).slice(-8);
  const weights = [...new Set(weeks.flatMap(w => Object.keys(byWeek[w]).map(Number)))].sort((a, b) => b - a);
  const isBW = weights.length === 1 && weights[0] === 0;

  const tbl = h('table', { class: 'tbl' });
  tbl.append(h('thead', null, h('tr', null, h('th', null, isBW ? '' : S.unit),
    weeks.map(w => h('th', null, `W${w + 1}`, h('div', { class: 'mute small' }, shortDate(addDays(parse(S.startDate), w * 7))))))));
  const tb = h('tbody');
  weights.forEach(wt => tb.append(h('tr', null,
    h('td', null, wt === 0 ? 'BW' : fmt(wt)),
    weeks.map((w, i) => {
      const c = byWeek[w][wt];
      if (!c) return h('td', { class: 'mute' }, '·');
      const prev = i > 0 && byWeek[weeks[i - 1]][wt];
      return h('td', { class: prev && c.reps > prev.reps ? 'hit' : '' }, `${c.reps}`, h('div', { class: 'mute small' }, `${c.sets}×`));
    }))));
  const vol = w => Object.entries(byWeek[w]).reduce((a, [wt, c]) => a + (isBW ? c.reps : wt * c.reps), 0);
  tb.append(h('tr', null, h('td', null, h('b', null, isBW ? 'Total reps' : 'Volume')), weeks.map(w => h('td', null, h('b', null, fmt(vol(w)))))));
  tbl.append(tb);
  root.append(h('div', { class: 'card scroll' },
    h('div', { class: 'small mute', style: 'margin-bottom:6px' }, 'Total reps hit at each weight (sets below). Green = up on last week.'), tbl));

  // chart: best e1RM (or best single-set reps for BW)
  const pts = weeks.map(w => {
    let best = 0;
    for (const [wt, c] of Object.entries(byWeek[w])) {
      best = Math.max(best, isBW ? c.best : (+wt) * (1 + c.best / 30));
    }
    return best;
  });
  root.append(h('div', { class: 'card' },
    h('div', { class: 'small mute' }, isBW ? 'Best set (reps) per week' : `Estimated 1RM per week (${S.unit}, Epley)`),
    chart(pts, weeks.map(w => `W${w + 1}`))));
  return root;
}
function chart(pts, labels) {
  const W = 320, H = 130, px = 28, py = 18;
  const min = Math.min(...pts) * 0.95, max = Math.max(...pts) * 1.05 || 1;
  const x = i => px + (pts.length === 1 ? (W - 2 * px) / 2 : i * (W - 2 * px) / (pts.length - 1));
  const y = v => H - py - ((v - min) / (max - min || 1)) * (H - 2 * py);
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${line}"/>
    ${pts.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="var(--accent)"/>
      <text x="${x(i).toFixed(1)}" y="${(y(v) - 8).toFixed(1)}" fill="var(--text)" font-size="10" text-anchor="middle">${fmt(Math.round(v * 10) / 10)}</text>
      <text x="${x(i).toFixed(1)}" y="${H - 3}" fill="var(--mute)" font-size="9" text-anchor="middle">${labels[i]}</text>`).join('')}
  </svg>`;
  const d = document.createElement('div'); d.innerHTML = svg; return d;
}

/* ---------- settings ---------- */
function viewSettings() {
  const root = h('div', null, h('h1', null, 'Settings'));

  const chips = h('div', { class: 'chips' });
  DAYN.forEach((n, i) => chips.append(h('button', { class: 'chip' + (S.days.includes(i) ? ' on' : ''), onclick: () => {
    if (S.days.includes(i)) { if (S.days.length > 1) S.days = S.days.filter(d => d !== i); }
    else S.days.push(i);
    normalize(); save(); rerender();
  } }, n)));
  root.append(h('div', { class: 'card' },
    h('h3', null, 'Workout days'),
    h('p', { class: 'mute small' }, 'Pick 1–7 days. The first selected day each week is Day 1, the next is Day 2, and so on.'),
    chips));

  const tp = planFor(new Date());
  const wchips = h('div', { class: 'chips', style: 'margin-bottom:8px' });
  DAYN.forEach((n, i) => wchips.append(h('button', { class: 'chip' + (S.weekStart === i ? ' on' : ''), onclick: () => {
    S.weekStart = i; normalize(); save(); rerender();
  } }, n)));
  root.append(h('div', { class: 'card' },
    h('h3', { style: 'margin-bottom:8px' }, 'Cycle'),
    h('div', { class: 'lbl' }, 'Weeks start on'),
    wchips,
    h('div', { class: 'lbl' }, `Week 1 starts (any date; snaps to that ${DAYN[S.weekStart]})`),
    h('input', { type: 'date', value: S.startDate, onchange: e => { if (e.target.value) { S.startDate = e.target.value; normalize(); save(); rerender(); } } }),
    h('div', { class: 'row', style: 'margin:10px 0' },
      h('button', { class: 'ghost', onclick: () => { S.startDate = iso(addDays(parse(S.startDate), -7)); save(); rerender(); } }, '◀ 1 wk'),
      h('span', { class: 'grow small', style: 'text-align:center' },
        h('b', null, `Today = ${tp.phase.name} · week ${tp.wk}/${tp.phase.weeks}`),
        h('div', { class: 'mute' }, '(of the current cycle)')),
      h('button', { class: 'ghost', onclick: () => { S.startDate = iso(addDays(parse(S.startDate), 7)); save(); rerender(); } }, '1 wk ▶')),
    h('p', { class: 'mute small' }, 'Phase lengths and order are set in Programme — including "Start cycle at this phase" to make any phase week 1.')));

  root.append(h('div', { class: 'card' },
    h('div', { class: 'fields', style: 'grid-template-columns:1fr 1fr' },
      h('div', null, h('div', { class: 'lbl' }, 'Unit'),
        h('select', { value: S.unit, onchange: e => { S.unit = e.target.value; save(); } }, ['kg', 'lb'].map(u => h('option', { value: u }, u)))),
      h('div', null, h('div', { class: 'lbl' }, 'Round weights to'),
        h('input', { type: 'number', step: '0.25', value: S.round, onchange: e => { S.round = +e.target.value > 0 ? +e.target.value : 2.5; save(); } })))));

  root.append(h('div', { class: 'card' },
    h('h3', { style: 'margin-bottom:8px' }, 'Rest timer (seconds)'),
    h('div', { class: 'fields', style: 'grid-template-columns:1fr 1fr' },
      h('div', null, h('div', { class: 'lbl' }, 'Full rest (green)'),
        h('input', { type: 'number', value: S.restSec, onchange: e => { S.restSec = Math.max(10, +e.target.value || 180); save(); } })),
      h('div', null, h('div', { class: 'lbl' }, 'Short-on-time (orange)'),
        h('input', { type: 'number', value: S.warnSec, onchange: e => { S.warnSec = Math.max(5, +e.target.value || 120); save(); } })))));

  const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      try {
        const d = JSON.parse(t);
        if (!d.phases || !d.logs) throw 0;
        if (!confirm('Replace everything with this backup?')) return;
        S = d; save(); location.reload();
      } catch { alert('That file is not a valid backup.'); }
    });
  } });
  root.append(h('div', { class: 'card' },
    h('h3', null, 'Backup'),
    h('p', { class: 'mute small' }, 'Data lives only in this browser. Export regularly, and use import to move to another device.'),
    h('div', { class: 'row wrap' },
      h('button', { onclick: () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' })), download: `badani-backup-${iso(new Date())}.json` });
        a.click(); URL.revokeObjectURL(a.href);
      } }, 'Export'),
      h('button', { onclick: () => file.click() }, 'Import'),
      h('button', { class: 'danger', onclick: () => { if (confirm('Erase ALL data and reset to defaults?')) { S = defaults(); normalize(); save(); rerender(); } } }, 'Reset all')),
    file));
  return root;
}

load();
render();
})();
