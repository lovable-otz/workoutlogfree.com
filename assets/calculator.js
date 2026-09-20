/* calculator.js — workoutlogfree.com
 * Tools (custom render): "tracker" (log sets/reps/weight, history, estimated 1RM & volume, CSV export) and
 * "planner" (weekly split builder). Data lives in the user's browser (localStorage) — no account, no server.
 * Say that plainly on the page: clearing browser data deletes the log; export CSV to keep a copy.
 *
 * 1RM uses the Epley formula (weight × (1 + reps / 30)) — a standard estimate, labelled "estimated" in the UI.
 * No medical or injury advice in content; training content cites reputable sources (e.g. ACSM, NHS, CDC).
 */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C; else root.CALCS = C;
})(typeof self !== 'undefined' ? self : this, function () {
  // ── pure logic (tested) ──────────────────────────────────────────────────
  const r1 = n => Math.round(n * 10) / 10;
  const e1rm = (weight, reps) => (!weight || !reps) ? 0 : reps === 1 ? weight : weight * (1 + reps / 30);
  const volume = sets => sets.reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  function progress(sessions, exercise) {   // best estimated 1RM per session date for one exercise, oldest first
    return sessions.filter(s => s.sets.some(x => x.exercise === exercise))
      .map(s => ({ date: s.date, best: r1(Math.max(...s.sets.filter(x => x.exercise === exercise).map(x => e1rm(+x.weight, +x.reps)))) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  const toCsv = sessions => ['date,exercise,set,reps,weight,unit'].concat(sessions.flatMap(s => s.sets.map((x, i) =>
    [s.date, `"${String(x.exercise).replace(/"/g, '""')}"`, i + 1, x.reps, x.weight, s.unit || 'kg'].join(',')))).join('\n');

  const SPLITS = {
    fullbody3: { label: 'Full body · 3 days', days: { Mon: ['Squat', 'Bench press', 'Row'], Wed: ['Deadlift', 'Overhead press', 'Pull-up'], Fri: ['Squat', 'Incline press', 'Row'] } },
    upperlower4: { label: 'Upper / lower · 4 days', days: { Mon: ['Bench press', 'Row', 'Overhead press'], Tue: ['Squat', 'Romanian deadlift', 'Leg curl'], Thu: ['Incline press', 'Pull-up', 'Lateral raise'], Fri: ['Deadlift', 'Leg press', 'Calf raise'] } },
    ppl6: { label: 'Push / pull / legs · 6 days', days: { Mon: ['Bench press', 'Overhead press', 'Triceps'], Tue: ['Deadlift', 'Pull-up', 'Biceps'], Wed: ['Squat', 'Leg curl', 'Calf raise'], Thu: ['Incline press', 'Lateral raise', 'Dips'], Fri: ['Row', 'Lat pulldown', 'Face pull'], Sat: ['Front squat', 'Romanian deadlift', 'Lunge'] } },
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const h = (tag, attrs = {}, kids = []) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v); } for (const c of [].concat(kids)) if (c != null && c !== '') n.append(c); return n; };
  const today = () => new Date().toISOString().slice(0, 10);

  const tracker = {
    title: 'Free workout tracker',
    render(root) {
      const KEY = 'workout-log-v1';
      const db = store.get(KEY, { unit: 'kg', sessions: [] });
      let current = { date: today(), unit: db.unit, sets: [{ exercise: 'Squat', reps: 5, weight: 60 }] };
      const view = h('div');
      const save = () => store.set(KEY, db);
      function draw() {
        view.innerHTML = '';
        view.append(h('div', { class: 'calc-form' }, [
          h('div', { class: 'calc-field' }, [h('label', { for: 'w-d', text: 'Date' }), h('div', { class: 'calc-input' }, h('input', { id: 'w-d', type: 'date', value: current.date, onchange: e => { current.date = e.target.value; } }))]),
          h('div', { class: 'calc-field' }, [h('label', { for: 'w-u', text: 'Unit' }), (() => { const s = h('select', { id: 'w-u', onchange: e => { current.unit = db.unit = e.target.value; save(); draw(); } }); for (const u of ['kg', 'lb']) s.append(h('option', { value: u, selected: u === current.unit ? '' : null, text: u })); return s; })()]),
        ]));
        const sets = h('div', { class: 'calc-repeater' });
        current.sets.forEach((st, i) => sets.append(h('div', { class: 'calc-row' }, [
          h('input', { value: st.exercise, 'aria-label': 'Exercise', list: 'w-ex', oninput: e => { st.exercise = e.target.value; } }),
          h('input', { type: 'number', value: st.reps, 'aria-label': 'Reps', min: '0', oninput: e => { st.reps = +e.target.value; stats(); } }),
          h('input', { type: 'number', value: st.weight, 'aria-label': `Weight (${current.unit})`, min: '0', step: 'any', oninput: e => { st.weight = +e.target.value; stats(); } }),
          h('button', { type: 'button', class: 'calc-remove', 'aria-label': 'Remove set', onclick: () => { current.sets.splice(i, 1); draw(); } }, '×')])));
        const names = [...new Set(db.sessions.flatMap(s => s.sets.map(x => x.exercise)).concat(['Squat', 'Bench press', 'Deadlift', 'Overhead press', 'Row', 'Pull-up']))];
        view.append(h('h2', { text: 'Sets' }), h('datalist', { id: 'w-ex' }, names.map(n => h('option', { value: n }))), sets,
          h('div', { class: 'calc-actions' }, [
            h('button', { type: 'button', class: 'calc-add', onclick: () => { const last = current.sets[current.sets.length - 1] || { exercise: 'Squat', reps: 5, weight: 0 }; current.sets.push({ ...last }); draw(); } }, '+ Add set (copies last)'),
            h('button', { type: 'button', onclick: () => { if (!current.sets.length) return; db.sessions.push(current); save(); current = { date: today(), unit: db.unit, sets: [] }; draw(); } }, 'Save workout')]));
        const statBox = h('div', { class: 'calc-summary' }); view.append(h('div', { class: 'calc-result' }, statBox));
        function stats() {
          statBox.innerHTML = '';
          const best = Math.max(0, ...current.sets.map(s => e1rm(+s.weight, +s.reps)));
          [['Session volume', `${Math.round(volume(current.sets))} ${current.unit}`, true], ['Best estimated 1RM this session', `${r1(best)} ${current.unit}`], ['Workouts logged', String(db.sessions.length)]]
            .forEach(([k, v, strong]) => statBox.append(h('div', { class: `calc-stat${strong ? ' strong' : ''}` }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: v })])));
        }
        stats();
        if (db.sessions.length) {
          view.append(h('h2', { text: 'History' }));
          const t = h('table', { class: 'calc-table' }, h('tbody', {}, db.sessions.slice().reverse().slice(0, 20).map(s => h('tr', {}, [h('th', { scope: 'row', text: s.date }), h('td', { text: `${s.sets.length} sets · ${Math.round(volume(s.sets))} ${s.unit}` })]))));
          view.append(h('div', { class: 'calc-table-wrap' }, t), h('div', { class: 'calc-actions' }, [
            h('button', { type: 'button', onclick: () => { const b = new Blob([toCsv(db.sessions)], { type: 'text/csv' }); const a = h('a', { href: URL.createObjectURL(b), download: 'workout-log.csv' }); document.body.append(a); a.click(); a.remove(); } }, 'Export CSV'),
          ]));
        }
      }
      root.append(view); draw();
    },
  };

  const planner = {
    title: 'Workout planner',
    render(root) {
      const KEY = 'workout-plan-v1';
      let plan = store.get(KEY, { split: 'fullbody3', days: JSON.parse(JSON.stringify(SPLITS.fullbody3.days)) });
      const view = h('div');
      const draw = () => {
        view.innerHTML = '';
        const sel = h('select', { id: 'p-s', onchange: e => { plan = { split: e.target.value, days: JSON.parse(JSON.stringify(SPLITS[e.target.value].days)) }; store.set(KEY, plan); draw(); } });
        for (const [k, s] of Object.entries(SPLITS)) sel.append(h('option', { value: k, selected: k === plan.split ? '' : null, text: s.label }));
        view.append(h('div', { class: 'calc-field' }, [h('label', { for: 'p-s', text: 'Training split' }), sel]));
        for (const [day, exs] of Object.entries(plan.days)) {
          view.append(h('h3', { text: day }));
          exs.forEach((ex, i) => view.append(h('div', { class: 'calc-row' }, [h('input', { value: ex, 'aria-label': `${day} exercise ${i + 1}`, oninput: e => { exs[i] = e.target.value; store.set(KEY, plan); } }),
            h('button', { type: 'button', class: 'calc-remove', 'aria-label': 'Remove', onclick: () => { exs.splice(i, 1); store.set(KEY, plan); draw(); } }, '×')])));
          view.append(h('button', { type: 'button', class: 'calc-add', onclick: () => { exs.push('New exercise'); store.set(KEY, plan); draw(); } }, `+ Add to ${day}`));
        }
        view.append(h('div', { class: 'calc-actions' }, [h('button', { type: 'button', onclick: () => window.print() }, 'Print plan')]));
      };
      root.append(view); draw();
    },
  };

  return {
    tracker, planner,
    __pure: { e1rm, volume, progress, toCsv },
    __tests: [
      { pure: 'e1rm', name: '100 × 5 → 116.7 (Epley)', run: P => ({ v: r1(P.e1rm(100, 5)) }), expect: { v: 116.7 } },
      { pure: 'e1rm', name: 'a single rep is the 1RM', run: P => ({ v: P.e1rm(140, 1) }), expect: { v: 140 } },
      { pure: 'volume', name: '3 × 5 × 60 + 1 × 8 × 50 = 1300', run: P => ({ v: P.volume([{ reps: 5, weight: 60 }, { reps: 5, weight: 60 }, { reps: 5, weight: 60 }, { reps: 8, weight: 50 }]) }), expect: { v: 1300 } },
      { pure: 'progress', name: 'best e1RM per session, sorted by date',
        run: P => { const p = P.progress([{ date: '2026-09-10', sets: [{ exercise: 'Squat', reps: 5, weight: 100 }] }, { date: '2026-09-03', sets: [{ exercise: 'Squat', reps: 3, weight: 100 }, { exercise: 'Row', reps: 10, weight: 50 }] }], 'Squat'); return { first: p[0].best, last: p[1].best, n: p.length }; },
        expect: { first: 110, last: 116.7, n: 2 } },
      { pure: 'toCsv', name: 'CSV escapes quotes', run: P => ({ v: P.toCsv([{ date: '2026-09-01', unit: 'kg', sets: [{ exercise: 'Curl "EZ"', reps: 10, weight: 20 }] }]).split('\n')[1] }), expect: { v: '2026-09-01,"Curl ""EZ""",1,10,20,kg' } },
    ],
  };
});
