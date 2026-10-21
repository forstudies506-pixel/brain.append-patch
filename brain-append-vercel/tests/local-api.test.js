// Unit tests for the data layer: node --test tests/*.test.js   (no installs needed)
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../static/js/local-api.js');

const NOON = Date.UTC(2026, 9, 21, 12, 0);   // Wed 21 Oct 2026, 12:00 UTC
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const d = (n) => iso(NOON - n * DAY);          // n days before "today"

function fakeStorage(seed) {
  const m = new Map(seed ? Object.entries(seed) : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
function make(opts = {}) {
  const storage = opts.storage || fakeStorage(), clock = { t: opts.now || NOON };
  const api = create({ storage, now: () => clock.t, tz: opts.tz === undefined ? 0 : opts.tz });
  return { api, storage, clock, call: api.call, add: async (date, minutes = 30, subject = 'Maths') => {
    const s = JSON.parse(storage.getItem('brain.append.v2') || '{"sessions":[],"nextId":1,"active":null,"freezes":[]}');
    s.sessions.push({ id: s.nextId++, subject, date, start: '09:00', minutes }); storage.setItem('brain.append.v2', JSON.stringify(s));
  }, addFreeze: async (date) => {
    const s = JSON.parse(storage.getItem('brain.append.v2') || '{"sessions":[],"nextId":1,"active":null,"freezes":[]}');
    s.freezes.push(date); storage.setItem('brain.append.v2', JSON.stringify(s));
  } };
}
const rejects = (p, re) => assert.rejects(p, re);

test('1. check in starts the clock, check out saves subject, date, time and minutes', async () => {
  const t = make();
  assert.equal((await t.call('GET', '/active')).active, null);
  await t.call('POST', '/checkin', { subject: '  Physics ', tz: 0 });
  await rejects(t.call('POST', '/checkin', { subject: 'Again' }), /already checked in/);
  t.clock.t += 25 * 60000;
  assert.equal((await t.call('GET', '/active')).active.subject, 'Physics');
  const { session } = await t.call('POST', '/checkout');
  assert.deepEqual(session, { id: 1, subject: 'Physics', date: '2026-10-21', start: '12:00', minutes: 25 });
  await rejects(t.call('POST', '/checkout'), /not checked in/);
  assert.equal((await t.call('GET', '/active')).active, null);
});

test('start date and time follow the visitor\'s time zone, including across midnight', async () => {
  for (const [utcHour, date, start] of [[18, '2026-10-14', '23:30'], [20, '2026-10-15', '01:30']]) {
    const t = make({ now: Date.UTC(2026, 9, 14, utcHour, 0) });
    await t.call('POST', '/checkin', { subject: 'X', tz: -330 });           // India is UTC+5:30
    t.clock.t += 20 * 60000;
    const s = (await t.call('POST', '/checkout')).session;
    assert.deepEqual([s.date, s.start], [date, start]);
  }
});

test('a session left running is capped at 24 hours, and a quick one counts as 1 minute', async () => {
  let t = make(); await t.call('POST', '/checkin', { subject: 'Oops' }); t.clock.t += 5 * DAY;
  assert.equal((await t.call('POST', '/checkout')).session.minutes, 1440);
  t = make(); await t.call('POST', '/checkin', { subject: 'Quick' }); t.clock.t += 5000;
  assert.equal((await t.call('POST', '/checkout')).session.minutes, 1);
});

test('bad subjects are refused', async () => {
  const t = make();
  for (const subject of ['', '   ', null, 5, 'x'.repeat(61)]) await rejects(t.call('POST', '/checkin', { subject }), /Subject is required/);
});

test('2. edit and delete', async () => {
  const t = make(); await t.add(d(0), 20);
  const id = (await t.call('GET', '/sessions')).sessions[0].id;
  const r = await t.call('PUT', '/sessions/' + id, { subject: 'Chem', date: d(1), start: '10:15', minutes: 45 });
  assert.deepEqual(r.session, { id, subject: 'Chem', date: d(1), start: '10:15', minutes: 45 });
  await t.call('DELETE', '/sessions/' + id);
  await rejects(t.call('DELETE', '/sessions/' + id), /not found/);
  assert.deepEqual((await t.call('GET', '/sessions')).sessions, []);
});

test('edit validation', async () => {
  const t = make(); await t.add(d(0));
  const ok = { subject: 'S', date: d(0), start: '09:00', minutes: 10 };
  for (const bad of [{ date: '2026-13-40' }, { date: '20261021' }, { date: 'tomorrow' }, { date: '2026-02-30' }, { start: '25:99' }, { minutes: 0 },
    { minutes: 1441 }, { minutes: 'abc' }, { minutes: 1.5 }, { minutes: true }, { subject: '' }])
    await rejects(t.call('PUT', '/sessions/1', { ...ok, ...bad }), /Dates|Start time|Minutes|Subject/);
  await rejects(t.call('PUT', '/sessions/99', ok), /not found/);
});

test('sessions are listed newest first', async () => {
  const t = make(); for (const n of [3, 0, 2]) await t.add(d(n));
  assert.deepEqual((await t.call('GET', '/sessions')).sessions.map((s) => s.date), [d(0), d(2), d(3)]);
});

test('3 + 4. streaks (current, longest, shortest) and total time', async () => {
  const t = make(); for (const n of [9, 8, 7, 5, 1, 0]) await t.add(d(n), 20);
  const st = await t.call('GET', '/stats?today=' + d(0));
  assert.equal(st.total_minutes, 120); assert.equal(st.session_count, 6);
  assert.deepEqual(st.streaks, { current: 2, longest: 3, shortest: 1 });
});

test('several sessions on one day count once; an empty day today does not break the streak', async () => {
  let t = make(); await t.add(d(0), 10); await t.add(d(0), 10);
  assert.equal((await t.call('GET', '/stats?today=' + d(0))).streaks.current, 1);
  t = make(); for (const n of [3, 2, 1]) await t.add(d(n));
  assert.equal((await t.call('GET', '/stats?today=' + d(0))).streaks.current, 3);
  assert.equal((await t.call('GET', '/stats?today=' + d(-1))).streaks.current, 0);   // tomorrow: yesterday was missed
});

test('a freeze day bridges a gap without adding a day', async () => {
  const t = make(); for (const n of [3, 1, 0]) await t.add(d(n));
  assert.deepEqual((await t.call('GET', '/stats?today=' + d(0))).streaks, { current: 2, longest: 2, shortest: 1 });
  await t.addFreeze(d(2));
  assert.equal((await t.call('GET', '/stats?today=' + d(0))).streaks.current, 3);
});

test('empty account', async () => {
  const st = await make().call('GET', '/stats');
  assert.equal(st.total_minutes, 0); assert.deepEqual(st.streaks, { current: 0, longest: 0, shortest: 0 });
});

test('6. one freeze day per week (Monday to Sunday), only for today', async () => {
  const t = make();                                      // 21 Oct 2026 is a Wednesday
  assert.equal((await t.call('GET', '/stats')).freeze.available, true);
  await t.call('POST', '/freeze', { date: d(0) });
  await rejects(t.call('POST', '/freeze', { date: d(0) }), /already used/);
  assert.equal((await t.call('GET', '/stats')).freeze.available, false);
  await rejects(t.call('POST', '/freeze', { date: d(10) }), /only be used for today/);
  const t2 = make(); await t2.addFreeze('2026-10-19');   // Monday of the same week
  await rejects(t2.call('POST', '/freeze', { date: d(0) }), /already used/);
  const t3 = make(); await t3.addFreeze('2026-10-18');   // the Sunday before: a different week
  assert.equal((await t3.call('GET', '/stats')).freeze.available, true);
  await t3.call('POST', '/freeze', { date: d(0) });
});

test('7. CSV export: header, order, quoting and formula safety', () => {
  const t = make();
  return (async () => {
    await t.add(d(0), 25, 'Maths'); await t.add(d(1), 40, '=HYPERLINK("x")'); await t.add(d(2), 5, 'Art, crafts');
    const lines = t.api.csv().split('\r\n');
    assert.equal(lines[0], 'Date,Start time,Subject,Minutes');
    assert.equal(lines[1], `${d(0)},09:00,Maths,25`);
    assert.equal(lines[2], `${d(1)},09:00,"'=HYPERLINK(""x"")",40`);
    assert.equal(lines[3], `${d(2)},09:00,"Art, crafts",5`);
    assert.equal(lines[4], '');
  })();
});

test('8. chart data for 7, 14 and 30 days', async () => {
  const t = make(); await t.add(d(0), 40); await t.add(d(3), 20);
  for (const n of [7, 14, 30]) {
    const ch = await t.call('GET', `/chart?days=${n}&today=${d(0)}`);
    assert.equal(ch.days.length, n); assert.deepEqual(ch.days[n - 1], { date: d(0), minutes: 40 }); assert.equal(ch.total, 60);
  }
  await rejects(t.call('GET', '/chart?days=5'), /7, 14 or 30/);
});

test('9. time per subject, ignoring capital letters', async () => {
  const t = make(); await t.add(d(0), 30, 'Maths'); await t.add(d(1), 30, 'maths'); await t.add(d(2), 60, 'History');
  const { subjects } = await t.call('GET', '/subjects');
  assert.equal(subjects.length, 2);
  assert.deepEqual(subjects.map((s) => [s.minutes, s.percent]), [[60, 50], [60, 50]]);
  assert.deepEqual(subjects.map((s) => s.subject.toLowerCase()).sort(), ['history', 'maths']);
  assert.deepEqual((await make().call('GET', '/subjects')).subjects, []);
});

test('5. data persists: a new page load sees sessions, freeze days and a running check-in', async () => {
  const storage = fakeStorage(), a = make({ storage });
  await a.call('POST', '/checkin', { subject: 'Persist' }); await a.add(d(0), 33); await a.call('POST', '/freeze', { date: d(0) });
  const b = make({ storage });                                              // "reload"
  assert.equal((await b.call('GET', '/sessions')).sessions[0].minutes, 33);
  assert.equal((await b.call('GET', '/active')).active.subject, 'Persist');
  assert.equal((await b.call('GET', '/stats?today=' + d(0))).freeze.used_on, d(0));
});

test('corrupted or blocked storage never breaks the app', async () => {
  const bad = make({ storage: fakeStorage({ 'brain.append.v2': '{not json' }) });
  assert.deepEqual((await bad.call('GET', '/sessions')).sessions, []);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const t = make({ storage: blocked });
  await t.call('POST', '/checkin', { subject: 'Memory' }); t.clock.t += 600000;
  assert.equal((await t.call('POST', '/checkout')).session.minutes, 10);
  assert.equal(t.api.persistent(), false);
  assert.equal((await t.call('GET', '/sessions')).sessions.length, 1);       // still works for this tab
});

test('a visitor can store at most 5000 sessions', async () => {
  const t = make(); await t.add(d(0));
  const s = JSON.parse(t.storage.getItem('brain.append.v2')); s.sessions = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, subject: 'x', date: d(0), start: '09:00', minutes: 1 }));
  s.nextId = 5001; t.storage.setItem('brain.append.v2', JSON.stringify(s));
  await t.call('POST', '/checkin', { subject: 'Over' });
  await rejects(t.call('POST', '/checkout'), /limit/);
});

test('unknown routes are refused', async () => {
  await rejects(make().call('GET', '/nope'), /Not found/);
});
