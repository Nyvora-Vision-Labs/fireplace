import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOG_MS,
  BREAK_MS,
  MAX_LOGS,
  createSession,
  timeLeft,
  breakLeft,
  logsLeft,
  activeLogs,
  currentLogLeft,
  canAddLog,
  addLog,
  pause,
  resume,
  extinguish,
  skipBreak,
  tick,
  fireLevel,
  isSession,
} from '../public/js/session.js';

const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;
let n = 0;
const log = () => ({ id: `log-${++n}`, seed: n });

test('a new hearth is cold with no time on it', () => {
  const s = createSession();
  assert.equal(s.phase, 'cold');
  assert.equal(timeLeft(s, T0), 0);
  assert.equal(logsLeft(s, T0), 0);
  assert.equal(fireLevel(s, T0), 0);
});

test('the first log lights a 15 minute fire', () => {
  const s = addLog(createSession(), T0, log());
  assert.equal(s.phase, 'burning');
  assert.equal(timeLeft(s, T0), 15 * MIN);
  assert.equal(timeLeft(s, T0 + 5 * MIN), 10 * MIN);
  assert.equal(logsLeft(s, T0 + 5 * MIN), 1);
});

test('each extra log adds 15 minutes without resetting the one burning', () => {
  let s = addLog(createSession(), T0, log());
  s = addLog(s, T0 + 4 * MIN, log());
  assert.equal(timeLeft(s, T0 + 4 * MIN), 26 * MIN);
  assert.equal(logsLeft(s, T0 + 4 * MIN), 2);
  // The first log still has 11 of its 15 minutes.
  assert.ok(Math.abs(currentLogLeft(s, T0 + 4 * MIN) - 11 / 15) < 1e-9);
});

test('logs burn down one per 15 minute mark, oldest first', () => {
  const a = log();
  const b = log();
  const c = log();
  let s = addLog(createSession(), T0, a);
  s = addLog(s, T0, b);
  s = addLog(s, T0, c);
  assert.deepEqual(activeLogs(s, T0).map((l) => l.id), [a.id, b.id, c.id]);

  let r = tick(s, T0 + 15 * MIN - 1);
  assert.deepEqual(r.events, []);

  r = tick(r.state, T0 + 15 * MIN);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].type, 'burned');
  assert.equal(r.events[0].count, 1);
  assert.equal(r.events[0].left, 2);
  assert.equal(r.events[0].at, T0 + 15 * MIN);
  assert.deepEqual(activeLogs(r.state, T0 + 15 * MIN).map((l) => l.id), [b.id, c.id]);

  // Ticking again in the same window reports nothing new.
  r = tick(r.state, T0 + 20 * MIN);
  assert.deepEqual(r.events, []);
});

test('the fire goes out, then a 5 minute break, then the hearth is cold', () => {
  let s = addLog(createSession(), T0, log());
  let r = tick(s, T0 + 15 * MIN);
  assert.deepEqual(r.events.map((e) => e.type), ['burned', 'out']);
  assert.equal(r.state.phase, 'break');
  assert.equal(breakLeft(r.state, T0 + 16 * MIN), BREAK_MS - MIN);

  r = tick(r.state, T0 + 15 * MIN + BREAK_MS);
  assert.deepEqual(r.events.map((e) => e.type), ['rested']);
  assert.equal(r.state.phase, 'cold');
});

test('coming back long after the fire went out catches up in one tick', () => {
  let s = addLog(createSession(), T0, log());
  s = addLog(s, T0, log());
  const r = tick(s, T0 + 6 * 60 * MIN);
  assert.deepEqual(r.events.map((e) => e.type), ['burned', 'out', 'rested']);
  assert.equal(r.events[0].count, 2);
  assert.equal(r.events[1].at, T0 + 30 * MIN);
  assert.equal(r.state.phase, 'cold');
  assert.equal(r.state.credited, 2);
});

test('a log added during the break relights the fire', () => {
  let s = addLog(createSession(), T0, log());
  s = tick(s, T0 + 15 * MIN).state;
  assert.equal(s.phase, 'break');
  s = addLog(s, T0 + 16 * MIN, log());
  assert.equal(s.phase, 'burning');
  assert.equal(s.logs.length, 1);
  assert.equal(s.credited, 0);
  assert.equal(timeLeft(s, T0 + 16 * MIN), 15 * MIN);
});

test('the hearth holds at most 8 logs', () => {
  let s = createSession();
  for (let i = 0; i < MAX_LOGS; i++) s = addLog(s, T0, log());
  assert.equal(logsLeft(s, T0), MAX_LOGS);
  assert.equal(canAddLog(s, T0), false);
  assert.equal(addLog(s, T0, log()), s);
  // Once a full log's worth has burned there is room again.
  assert.equal(canAddLog(s, T0 + LOG_MS), true);
  assert.equal(canAddLog(s, T0 + 1), false);
});

test('pausing freezes the timer and resuming continues it', () => {
  let s = addLog(createSession(), T0, log());
  s = pause(s, T0 + 5 * MIN);
  assert.equal(s.phase, 'paused');
  assert.equal(timeLeft(s, T0 + 50 * MIN), 10 * MIN);
  assert.deepEqual(tick(s, T0 + 50 * MIN).events, []);

  s = addLog(s, T0 + 50 * MIN, log());
  assert.equal(s.phase, 'paused');
  assert.equal(timeLeft(s, T0 + 50 * MIN), 25 * MIN);

  s = resume(s, T0 + 60 * MIN);
  assert.equal(s.phase, 'burning');
  assert.equal(timeLeft(s, T0 + 70 * MIN), 15 * MIN);
});

test('putting the fire out returns to a cold hearth and keeps the log length', () => {
  let s = addLog(createSession({ logMs: 2000, breakMs: 1000 }), T0, log());
  s = extinguish(s);
  assert.equal(s.phase, 'cold');
  assert.equal(s.logMs, 2000);
  assert.equal(s.logs.length, 0);
});

test('skipping the break goes straight to cold', () => {
  let s = addLog(createSession(), T0, log());
  s = tick(s, T0 + 15 * MIN).state;
  assert.equal(skipBreak(s).phase, 'cold');
  assert.equal(skipBreak(createSession()).phase, 'cold');
});

test('the fire burns a step lower after each 15 minute mark', () => {
  let s = createSession();
  for (let i = 0; i < 3; i++) s = addLog(s, T0, log());
  const before = fireLevel(s, T0 + 15 * MIN - 1000);
  const after = fireLevel(s, T0 + 15 * MIN + 1000);
  assert.ok(before - after > 0.05, `expected a visible drop, got ${before} -> ${after}`);
  // More logs make a bigger fire, and it eases down within a log.
  assert.ok(fireLevel(s, T0) > fireLevel(s, T0 + 15 * MIN));
  assert.ok(fireLevel(s, T0) > fireLevel(s, T0 + 10 * MIN));
  assert.ok(fireLevel(s, T0 + 44 * MIN) > fireLevel(s, T0 + 44.9 * MIN));
  assert.equal(fireLevel(s, T0 + 45 * MIN), 0);
});

test('saved state is validated before use', () => {
  const s = addLog(createSession(), T0, log());
  assert.equal(isSession(s), true);
  assert.equal(isSession(JSON.parse(JSON.stringify(s))), true);
  assert.equal(isSession(null), false);
  assert.equal(isSession({ ...s, phase: 'smouldering' }), false);
  assert.equal(isSession({ ...s, endsAt: 'soon' }), false);
  assert.equal(isSession({ ...s, logs: [{ id: 1 }] }), false);
});
