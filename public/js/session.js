// The fire's timer, as pure functions over a plain state object.
// Every function takes the current time in ms, so the timer is derived from
// timestamps and stays correct across reloads, sleep and background tabs.

export const LOG_MS = 15 * 60 * 1000;
export const BREAK_MS = 5 * 60 * 1000;
export const MAX_LOGS = 8;

// How strongly the fire burns with n logs on it. When a log burns out at a
// 15-minute mark the fire drops one step.
const LEVELS = [0, 0.42, 0.58, 0.7, 0.79, 0.86, 0.92, 0.96, 1];

export function createSession({ logMs = LOG_MS, breakMs = BREAK_MS } = {}) {
  return {
    phase: 'cold', // cold | burning | paused | break
    logMs,
    breakMs,
    endsAt: 0, // when the fire goes out (burning)
    pausedLeft: 0, // time left when paused
    breakEndsAt: 0,
    logs: [], // every log added since the fire was lit, oldest first
    credited: 0, // how many of those have been counted as burned
  };
}

export function timeLeft(s, now) {
  if (s.phase === 'burning') return Math.max(0, s.endsAt - now);
  if (s.phase === 'paused') return s.pausedLeft;
  return 0;
}

export function breakLeft(s, now) {
  return s.phase === 'break' ? Math.max(0, s.breakEndsAt - now) : 0;
}

export function logsLeft(s, now) {
  return Math.ceil(timeLeft(s, now) / s.logMs);
}

// The logs still on the fire, oldest (the one burning down) first.
export function activeLogs(s, now) {
  const n = logsLeft(s, now);
  return n > 0 ? s.logs.slice(-n) : [];
}

// How much of the oldest log is left, from 1 (fresh) to 0 (gone).
export function currentLogLeft(s, now) {
  const left = timeLeft(s, now);
  if (left <= 0) return 0;
  return (left - (Math.ceil(left / s.logMs) - 1) * s.logMs) / s.logMs;
}

export function canAddLog(s, now) {
  return Math.ceil((timeLeft(s, now) + s.logMs) / s.logMs) <= MAX_LOGS;
}

export function addLog(s, now, log) {
  if (!canAddLog(s, now)) return s;
  const entry = { ...log, addedAt: now };
  if (s.phase === 'paused') {
    return { ...s, pausedLeft: s.pausedLeft + s.logMs, logs: [...s.logs, entry] };
  }
  if (s.phase === 'burning' && s.endsAt > now) {
    return { ...s, endsAt: s.endsAt + s.logMs, logs: [...s.logs, entry] };
  }
  // Cold hearth or embers: light a new fire.
  return {
    ...s,
    phase: 'burning',
    endsAt: now + s.logMs,
    pausedLeft: 0,
    breakEndsAt: 0,
    logs: [entry],
    credited: 0,
  };
}

export function pause(s, now) {
  if (s.phase !== 'burning' || s.endsAt <= now) return s;
  return { ...s, phase: 'paused', pausedLeft: s.endsAt - now };
}

export function resume(s, now) {
  if (s.phase !== 'paused') return s;
  return { ...s, phase: 'burning', endsAt: now + s.pausedLeft, pausedLeft: 0 };
}

export function extinguish(s) {
  return createSession({ logMs: s.logMs, breakMs: s.breakMs });
}

export function skipBreak(s) {
  return s.phase === 'break' ? { ...s, phase: 'cold' } : s;
}

// Advances the state to `now` and reports what happened on the way:
//   burned  - `count` logs burned down (a 15-minute mark passed)
//   out     - the last log burned out, the break started
//   rested  - the break ended
// `at` is when the event really happened, which lets the caller stay quiet
// about events that passed while the page was closed.
export function tick(s, now) {
  const events = [];
  if (s.phase === 'burning') {
    const left = logsLeft(s, now);
    const burned = s.logs.length - left;
    if (burned > s.credited) {
      events.push({ type: 'burned', count: burned - s.credited, left, at: Math.min(now, s.endsAt - left * s.logMs) });
      s = { ...s, credited: burned };
    }
    if (now >= s.endsAt) {
      events.push({ type: 'out', at: s.endsAt });
      s = { ...s, phase: 'break', breakEndsAt: s.endsAt + s.breakMs };
    }
  }
  if (s.phase === 'break' && now >= s.breakEndsAt) {
    events.push({ type: 'rested', at: s.breakEndsAt });
    s = { ...s, phase: 'cold' };
  }
  return { state: s, events };
}

// Target flame strength, 0..1. Within a log the fire eases down a little;
// at each 15-minute mark it drops a step; the last log dies down to embers.
export function fireLevel(s, now) {
  if (s.phase === 'paused') return 0.24;
  const left = timeLeft(s, now);
  if (s.phase !== 'burning' || left <= 0) return 0;
  const n = Math.min(Math.ceil(left / s.logMs), LEVELS.length - 1);
  const fresh = currentLogLeft(s, now);
  let level = LEVELS[n - 1] + (LEVELS[n] - LEVELS[n - 1]) * (0.65 + 0.35 * fresh);
  const dying = Math.min(s.logMs * 0.2, 3 * 60 * 1000);
  if (left < dying) level *= Math.sqrt(left / dying);
  return level;
}

// Guards against corrupted or outdated saved state.
export function isSession(s) {
  return (
    !!s &&
    typeof s === 'object' &&
    ['cold', 'burning', 'paused', 'break'].includes(s.phase) &&
    [s.logMs, s.breakMs, s.endsAt, s.pausedLeft, s.breakEndsAt, s.credited].every(Number.isFinite) &&
    s.logMs > 0 &&
    Array.isArray(s.logs) &&
    s.logs.every((l) => l && typeof l.id === 'string' && Number.isFinite(l.seed) && Number.isFinite(l.addedAt))
  );
}
