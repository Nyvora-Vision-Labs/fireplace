import * as S from './session.js';
import {
  VIEW_W,
  OPENING,
  BED_Y,
  SHARED_DEFS,
  PILES,
  interiorSVG,
  surroundSVG,
  grateSVG,
  logTraits,
  sideLog,
  sideLogSVG,
  endGrain,
  randomSeed,
} from './art.js';
import { FireRenderer } from './fire.js';
import { Sparks } from './sparks.js';
import { FireSound } from './sound.js';
import { read, write, today } from './store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ?log=0.25 makes every log burn for 15 seconds, handy for trying things out.
const logMinutes = parseFloat(params.get('log'));
const config = logMinutes > 0 && logMinutes <= 240 ? { logMs: logMinutes * 60000, breakMs: (logMinutes * 60000) / 3 } : {};

const els = {
  body: document.body,
  fireplace: $('fireplace'),
  flames: $('fp-flames'),
  sparks: $('fp-sparks'),
  backGlow: $('fp-backglow'),
  light: $('fp-light'),
  shade: $('shade'),
  wallLight: $('wall-light'),
  hearthLogs: $('hearth-logs'),
  woodpile: $('woodpile'),
  woodpileSvg: $('woodpile-svg'),
  woodLight: $('wood-light'),
  label: $('clock-label'),
  time: $('time'),
  status: $('status'),
  pauseBtn: $('pause-btn'),
  stopBtn: $('stop-btn'),
  skipBtn: $('skip-btn'),
  soundBtn: $('sound-btn'),
  notifyBtn: $('notify-btn'),
  helpBtn: $('help-btn'),
  help: $('help'),
  stats: $('stats'),
  toast: $('toast'),
  announcer: $('announcer'),
};

$('shared-defs').innerHTML = SHARED_DEFS;
$('fp-interior').innerHTML = interiorSVG();
$('fp-surround').innerHTML = surroundSVG();
$('fp-grate').innerHTML = grateSVG();
const grateGlow = document.querySelector('.grate-glow');

/* --------------------------------------------------------------- state */

const prefs = { sound: true, notify: false, fed: false, ...read('prefs', {}) };
const savePrefs = () => write('prefs', prefs);

let stats = read('stats', null);
if (!stats || stats.day !== today() || !Number.isFinite(stats.logs) || !Number.isFinite(stats.minutes)) stats = { day: today(), logs: 0, minutes: 0 };

let session = read('session', null);
if (!S.isSession(session) || session.phase === 'cold') session = S.createSession(config);
const save = () => write('session', session);

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ?logs=4 starts with four logs on the fire (if it isn't already lit).
const startLogs = parseInt(params.get('logs'), 10);
if (startLogs > 0 && session.phase === 'cold') {
  const now = Date.now();
  for (let i = 0; i < Math.min(startLogs, S.MAX_LOGS); i++) session = S.addLog(session, now, { id: newId(), seed: randomSeed() });
  save();
}
if (params.has('logs')) {
  params.delete('logs');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

let fire = null;
try {
  fire = new FireRenderer(els.flames);
} catch (err) {
  els.body.classList.add('no-webgl');
  console.warn('Fireplace: falling back to a glow without flames.', err);
}
const sparks = new Sparks(els.sparks);
const sound = new FireSound();
sound.on = prefs.sound;

/* -------------------------------------------------------------- hearth */

// Where logs rest on the grate, in fireplace units. A log needs the logs
// listed in `on` underneath it; when one burns away, the logs above drop.
const SLOTS = [
  { x: 284, y: 521, rot: -3, on: [] },
  { x: 364, y: 522, rot: 4, on: [] },
  { x: 325, y: 494, rot: 1, on: [0, 1] },
  { x: 236, y: 500, rot: -14, on: [0] },
  { x: 412, y: 501, rot: 13, on: [1] },
  { x: 283, y: 468, rot: -6, on: [2, 3] },
  { x: 368, y: 467, rot: 7, on: [2, 4] },
  { x: 326, y: 441, rot: -2, on: [5, 6] },
];

class Hearth {
  constructor(layer) {
    this.layer = layer;
    this.items = new Map();
  }

  live() {
    return [...this.items.values()].filter((item) => !item.gone);
  }

  freeSlot() {
    const used = new Set(this.live().map((item) => item.slot));
    return SLOTS.findIndex((s, i) => !used.has(i) && s.on.every((j) => used.has(j)));
  }

  // Matches the drawn logs to the logs on the fire. Returns the ones that burned away.
  sync(logs, hidden) {
    const ids = new Set(logs.map((l) => l.id));
    const burned = this.live().filter((item) => !ids.has(item.id));
    for (const item of burned) this.burnAway(item);
    if (burned.length) this.settle();
    for (const log of logs) if (!this.items.has(log.id)) this.place(log, log.id === hidden);
    return burned;
  }

  place(log, hidden) {
    const slot = this.freeSlot();
    if (slot < 0) return;
    const traits = logTraits(log.seed);
    const el = document.createElementNS(SVG_NS, 'g');
    el.setAttribute('class', hidden ? 'log is-arriving' : 'log');
    el.innerHTML = `<g class="log-inner">${sideLog(traits)}</g>`;
    const item = {
      id: log.id,
      el,
      traits,
      slot,
      addedAt: log.addedAt,
      gone: false,
      phase: Math.random() * 6.28,
      inner: el.firstElementChild,
      char: el.querySelector('.lg-char'),
      cracks: el.querySelector('.lg-cracks'),
      under: el.querySelector('.lg-under'),
      rim: el.querySelector('.lg-rim'),
      shown: {},
    };
    this.items.set(log.id, item);
    this.position(item);
    const above = this.live()
      .filter((other) => other !== item && other.slot > slot)
      .sort((a, b) => a.slot - b.slot)[0];
    this.layer.insertBefore(el, above ? above.el : null);
  }

  position(item) {
    const s = SLOTS[item.slot];
    item.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`;
  }

  reveal(id) {
    this.items.get(id)?.el.classList.remove('is-arriving');
  }

  burnAway(item) {
    item.gone = true;
    item.el.classList.add('is-gone');
    setTimeout(() => {
      item.el.remove();
      this.items.delete(item.id);
    }, 2200);
  }

  // Logs that lost their support drop into the gap, cascading upwards.
  settle() {
    for (let moved = true; moved; ) {
      moved = false;
      const bySlot = new Map(this.live().map((item) => [item.slot, item]));
      for (const item of [...bySlot.values()].sort((a, b) => a.slot - b.slot)) {
        const gap = SLOTS[item.slot].on.find((j) => !bySlot.has(j));
        if (gap === undefined) continue;
        bySlot.delete(item.slot);
        item.slot = gap;
        bySlot.set(gap, item);
        moved = true;
      }
    }
    for (const item of this.live()) this.position(item);
    // Fix the paint order once the logs have finished moving.
    clearTimeout(this.restackTimer);
    this.restackTimer = setTimeout(() => this.restack(), 1600);
  }

  restack() {
    const order = this.live().sort((a, b) => a.slot - b.slot);
    const drawn = [...this.layer.children].filter((el) => order.some((item) => item.el === el));
    if (order.some((item, i) => drawn[i] !== item.el)) for (const item of order) this.layer.appendChild(item.el);
  }

  // Extent of the log pile in fireplace units, or null when the grate is empty.
  extent() {
    const live = this.live();
    if (!live.length) return null;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    for (const item of live) {
      const s = SLOTS[item.slot];
      const a = (s.rot * Math.PI) / 180;
      const half = item.traits.length / 2;
      left = Math.min(left, s.x - half * Math.cos(a));
      right = Math.max(right, s.x + half * Math.cos(a));
      top = Math.min(top, s.y - item.traits.thick / 2 - Math.abs(Math.sin(a)) * half * 0.5);
    }
    return { left, right, top };
  }

  // Char, glowing cracks and firelight on each log, every frame.
  update(now, s, level, ember, t) {
    const live = this.live().sort((a, b) => a.addedAt - b.addedAt);
    const lit = s.phase === 'burning' || s.phase === 'paused';
    const progress = lit ? 1 - S.currentLogLeft(s, now) : 0;
    const glow = Math.max(level, ember * 0.45);
    for (const item of live) {
      const age = Math.max(0, now - item.addedAt);
      const caught = smooth(0, 6000, age);
      const current = lit && item === live[0];
      // Logs on the fire are backlit, so even a fresh one sits in shadow.
      const char = current ? 0.55 + 0.4 * progress : Math.min(0.62, 0.34 + (age / s.logMs) * 0.5);
      const wobble = 0.62 + 0.38 * Math.sin(t * 2.3 + item.phase) * Math.sin(t * 1.3 + item.phase * 1.7);
      this.set(item, 'char', char * caught);
      this.set(item, 'cracks', smooth(0.25, 0.8, char) * caught * wobble * clamp(glow * 1.4, 0, 1));
      this.set(item, 'under', caught * (0.25 + 0.75 * glow) * (0.85 + 0.15 * wobble));
      this.set(item, 'rim', caught * level * (0.65 + 0.35 * wobble));
      const shrink = current ? smooth(0.45, 1, progress) : 0;
      const tf = shrink > 0.002 ? `scale(${(1 - 0.1 * shrink).toFixed(3)}, ${(1 - 0.32 * shrink).toFixed(3)})` : '';
      if (item.shown.tf !== tf) {
        item.inner.style.transform = tf;
        item.shown.tf = tf;
      }
    }
  }

  set(item, part, value) {
    const v = clamp(value, 0, 1).toFixed(2);
    if (item.shown[part] !== v) {
      item[part].setAttribute('opacity', v);
      item.shown[part] = v;
    }
  }
}

const hearth = new Hearth(els.hearthLogs);

/* ------------------------------------------------------------ woodpile */

const narrow = matchMedia('(max-width: 820px) and (min-height: 541px), (max-aspect-ratio: 4/5)');
const pile = { layout: PILES.tall, seeds: Array.from({ length: 10 }, randomSeed), els: [] };

function pileLogMarkup(i) {
  const spot = pile.layout.spots[i];
  return `<g transform="rotate(${spot.rot})">${endGrain(logTraits(pile.seeds[i]), spot.r)}</g>`;
}

function renderWoodpile() {
  pile.layout = narrow.matches ? PILES.wide : PILES.tall;
  const { w, h, spots, back, front } = pile.layout;
  const logs = spots
    .map(
      (spot, i) =>
        `<g class="pile-log${i === spots.length - 1 ? ' is-top' : ''}" data-i="${i}" transform="translate(${spot.x} ${spot.y})"><g class="pile-log-inner">${pileLogMarkup(i)}</g></g>`
    )
    .join('');
  els.woodpileSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  els.woodpileSvg.innerHTML = back + logs + front;
  pile.els = [...els.woodpileSvg.querySelectorAll('.pile-log')];
}

narrow.addEventListener('change', () => {
  if (!drag) renderWoodpile();
});

// The woodpile never runs out: a fresh log rolls into the gap.
function restock(i) {
  pile.seeds[i] = randomSeed();
  const el = pile.els[i];
  if (!el) return; // the pile was redrawn for a new layout meanwhile
  el.firstElementChild.innerHTML = pileLogMarkup(i);
  el.classList.remove('is-taken');
  el.classList.add('is-new');
  setTimeout(() => el.classList.remove('is-new'), 700);
}

/* ------------------------------------------------------ screen geometry */

let scale = 1; // CSS px per fireplace unit

function slotOnScreen(slot) {
  const r = els.fireplace.getBoundingClientRect();
  const k = r.width / VIEW_W;
  const s = SLOTS[slot];
  return { x: r.left + s.x * k, y: r.top + s.y * k, rot: s.rot, scale: 1 };
}

function pileOnScreen(i) {
  const r = els.woodpileSvg.getBoundingClientRect();
  const k = r.width / pile.layout.w;
  const spot = pile.layout.spots[i];
  return { x: r.left + spot.x * k, y: r.top + spot.y * k, rot: 80, scale: 0.9, squash: 0.24 };
}

function overFire(x, y) {
  const r = els.fireplace.getBoundingClientRect();
  return x > r.left && x < r.right && y > r.top + r.height * 0.05 && y < r.bottom + 16;
}

function layout() {
  const r = els.fireplace.getBoundingClientRect();
  if (!r.width) return;
  scale = r.width / VIEW_W;
  const cw = OPENING.w * scale;
  const ch = OPENING.h * scale;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const q = Math.min(1, 680 / (cw * dpr)); // cap the shader's resolution
  fire?.resize(Math.max(1, Math.round(cw * dpr * q)), Math.max(1, Math.round(ch * dpr * q)));
  sparks.resize(cw, ch, dpr, scale);
}

/* ----------------------------------------------------- dragging a log */

function ghostTransform({ x, y, rot, scale: s, squash = 1 }) {
  return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${rot.toFixed(1)}deg) scale(${(s * squash).toFixed(3)}, ${s.toFixed(3)})`;
}

function makeGhost(traits) {
  const { w, h, svg } = sideLogSVG(traits);
  const el = document.createElement('div');
  el.className = 'ghost';
  el.style.width = `${w * scale}px`;
  el.style.height = `${h * scale}px`;
  el.innerHTML = svg;
  document.body.appendChild(el);
  return el;
}

// Keyframes along a curved throw from a to b.
function arc(a, b) {
  const lift = 110 * scale;
  const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  const frames = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    const u = 1 - k;
    frames.push({
      transform: ghostTransform({
        x: u * u * a.x + 2 * u * k * mid.x + k * k * b.x,
        y: u * u * a.y + 2 * u * k * mid.y + k * k * b.y,
        rot: a.rot + (b.rot - a.rot) * k,
        scale: a.scale + (b.scale - a.scale) * k + Math.sin(k * Math.PI) * 0.15,
        squash: (a.squash ?? 1) + (1 - (a.squash ?? 1)) * smooth(0, 0.35, k),
      }),
    });
  }
  return frames;
}

let drag = null;
let dragEndedAt = 0;

// The log under the pointer, or the nearest one when grabbing between logs.
function pileIndexAt(x, y) {
  let best = -1;
  let bestDist = Infinity;
  pile.els.forEach((el, i) => {
    if (el.classList.contains('is-taken')) return;
    const r = el.getBoundingClientRect();
    const dist = Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

els.woodpile.addEventListener('pointerdown', (e) => {
  if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const i = pileIndexAt(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  sound.unlock();
  const traits = logTraits(pile.seeds[i]);
  const ghost = makeGhost(traits);
  const held = { x: e.clientX, y: e.clientY, rot: -6, scale: 1.12 };
  drag = { i, traits, ghost, held, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, over: false };
  pile.els[i].classList.add('is-taken');
  ghost.style.transform = ghostTransform(held);
  ghost.animate([{ transform: ghostTransform(pileOnScreen(i)) }, { transform: ghostTransform(held) }], {
    duration: 200,
    easing: 'cubic-bezier(.2,.8,.2,1)',
  });
  try {
    els.woodpile.setPointerCapture(e.pointerId);
  } catch {
    // Capture is a nicety; window listeners still see the moves.
  }
  els.body.classList.add('is-dragging');
});

window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const h = drag.held;
  const dx = e.clientX - h.x;
  h.x = e.clientX;
  h.y = e.clientY;
  if (!drag.moved && Math.hypot(h.x - drag.x0, h.y - drag.y0) > 6) drag.moved = true;
  h.rot = clamp(h.rot * 0.85 + (-6 + dx * 0.6) * 0.15, -24, 14);
  drag.ghost.style.transform = ghostTransform(h);
  const over = overFire(h.x, h.y);
  if (over !== drag.over) {
    drag.over = over;
    els.fireplace.classList.toggle('is-target', over);
  }
});

window.addEventListener('pointerup', (e) => {
  if (drag && e.pointerId === drag.id) endDrag(true);
});
window.addEventListener('pointercancel', (e) => {
  if (drag && e.pointerId === drag.id) endDrag(false);
});

function endDrag(released) {
  const d = drag;
  drag = null;
  dragEndedAt = performance.now();
  els.fireplace.classList.remove('is-target');
  els.body.classList.remove('is-dragging');
  const tapped = !d.moved && performance.now() - d.t0 < 450;
  if (released && (d.over || tapped)) feed(d.traits, d.ghost, d.i, tapped ? 'toss' : 'drop', { ...d.held });
  else sendBack(d.ghost, d.i, d.held);
}

function sendBack(ghost, i, from) {
  const to = pileOnScreen(i);
  ghost.style.transform = ghostTransform(to);
  ghost
    .animate([{ transform: ghostTransform(from) }, { transform: ghostTransform(to) }], { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)' })
    .finished.catch(() => {})
    .then(() => {
      ghost.remove();
      pile.els[i]?.classList.remove('is-taken');
    });
}

// Keyboard, shortcut and tap: throw the top free log from the pile.
function toss() {
  if (drag) return;
  sound.unlock();
  let i = pile.els.length - 1;
  while (i >= 0 && pile.els[i].classList.contains('is-taken')) i--;
  if (i < 0) return;
  const traits = logTraits(pile.seeds[i]);
  const ghost = makeGhost(traits);
  pile.els[i].classList.add('is-taken');
  feed(traits, ghost, i, 'toss', pileOnScreen(i));
}

function feed(traits, ghost, pileIndex, how, from) {
  const now = Date.now();
  step(now);
  if (!S.canAddLog(session, now)) {
    toast(`The hearth is full: ${S.MAX_LOGS} logs is ${spoken(S.MAX_LOGS * session.logMs)} of fire.`);
    ghost
      .animate(
        [0, -8, 8, -5, 5, 0].map((dx) => ({ transform: ghostTransform({ ...from, x: from.x + dx }) })),
        { duration: 320 }
      )
      .finished.catch(() => {})
      .then(() => sendBack(ghost, pileIndex, from));
    return;
  }
  const before = displayMs(now);
  const relit = session.phase === 'cold' || session.phase === 'break';
  const log = { id: newId(), seed: traits.seed };
  session = S.addLog(session, now, log);
  save();
  updatePhase();
  hearth.sync(S.activeLogs(session, now), log.id);
  const item = hearth.items.get(log.id);
  if (!item) {
    ghost.remove();
    return;
  }
  const to = slotOnScreen(item.slot);
  ghost.style.transform = ghostTransform(to);
  ghost
    .animate(how === 'toss' ? arc(from, to) : [{ transform: ghostTransform(from) }, { transform: ghostTransform(to) }], {
      duration: how === 'toss' ? 640 : 260,
      easing: how === 'toss' ? 'cubic-bezier(.3,.1,.5,1)' : 'cubic-bezier(.4,0,.6,1)',
    })
    .finished.catch(() => {})
    .then(() => {
      ghost.remove();
      hearth.reveal(log.id);
      landed(item);
    });
  bumpClock(before);
  setTimeout(() => restock(pileIndex), 380);
  if (!prefs.fed) {
    prefs.fed = true;
    savePrefs();
    els.body.classList.remove('is-new');
  }
  const left = spoken(S.timeLeft(session, now));
  announce(relit ? `The fire is lit. ${left} of focus.` : `Log added. ${left} on the fire.`);
}

function sparkPoint(slot, dy = 0) {
  const s = SLOTS[slot];
  return { x: (s.x - OPENING.x) * scale, y: (s.y - OPENING.y + dy) * scale };
}

function landed(item) {
  const p = sparkPoint(item.slot, -8);
  sparks.burst(p.x, p.y, 28, 70, 1.3);
  sparks.puff(p.x, p.y, 3, 60);
  sound.thunk();
  flare = Math.min(0.32, flare + 0.2);
}

function collapse(item, doused) {
  const p = sparkPoint(item.slot);
  if (doused) sparks.puff(p.x, p.y - 10 * scale, 4, 80);
  else {
    sparks.burst(p.x, p.y, 40, 90, 1.5);
    sparks.puff(p.x, p.y, 2, 60);
  }
}

/* --------------------------------------------------------------- events */

let booting = true;

function step(now) {
  const { state, events } = S.tick(session, now);
  if (!events.length) return;
  session = state;
  save();
  for (const ev of events) handle(ev, now);
  for (const item of hearth.sync(S.activeLogs(session, now))) collapse(item);
  updatePhase();
}

function handle(ev, now) {
  const fresh = !booting && now - ev.at < 60000;
  if (ev.type === 'burned') {
    if (today(new Date(ev.at)) === today()) credit(ev.count, session.logMs);
    if (fresh && ev.left > 0) {
      sound.settle();
      sound.chime('log');
      announce(`A log burned down. ${ev.left} left on the fire.`);
      if (ev.left === 1) notify('One log left', `The last log is burning: ${spoken(session.logMs)} to go. Add another to keep the fire going.`);
    }
  } else if (ev.type === 'out') {
    if (fresh) {
      sound.chime('out');
      sparks.puff(els.sparks.clientWidth / 2, els.sparks.clientHeight * 0.8, 8, 140);
      announce('The fire burned out. Time for a break.');
      notify('The fire burned out', `Nice work. Take a ${spoken(session.breakMs)} break by the embers.`);
    }
  } else if (ev.type === 'rested' && fresh) {
    sound.chime('rested');
    announce('Break is over.');
    notify('Break is over', 'Drag a log onto the fire when you are ready.');
  }
}

function credit(count, logMs) {
  if (stats.day !== today()) stats = { day: today(), logs: 0, minutes: 0 };
  stats.logs += count;
  stats.minutes += (count * logMs) / 60000;
  write('stats', stats);
  renderStats();
}

async function notify(title, body) {
  if (!prefs.notify || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'fireplace' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, options));
  } catch {
    // Fall through to a page notification.
  }
  try {
    new Notification(title, options);
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}

/* ------------------------------------------------------------- controls */

function togglePause() {
  const now = Date.now();
  step(now);
  if (session.phase === 'burning') session = S.pause(session, now);
  else if (session.phase === 'paused') session = S.resume(session, now);
  else return;
  save();
  updatePhase();
  announce(session.phase === 'paused' ? 'Paused.' : 'Resumed.');
}

let stopArmed = 0;
function disarmStop() {
  stopArmed = 0;
  els.stopBtn.textContent = 'Put out';
  els.stopBtn.classList.remove('is-armed');
}

function extinguish() {
  session = S.extinguish(session);
  save();
  for (const item of hearth.sync([])) collapse(item, true);
  sound.settle();
  updatePhase();
  announce('The fire is out.');
}

els.pauseBtn.addEventListener('click', togglePause);
els.stopBtn.addEventListener('click', () => {
  if (Date.now() - stopArmed < 3000) {
    disarmStop();
    extinguish();
    return;
  }
  stopArmed = Date.now();
  els.stopBtn.textContent = 'Put it out?';
  els.stopBtn.classList.add('is-armed');
  setTimeout(() => Date.now() - stopArmed >= 2900 && disarmStop(), 3000);
});
els.skipBtn.addEventListener('click', () => {
  session = S.skipBreak(session);
  save();
  updatePhase();
});

// Clicks that didn't come from a pointer drag (screen readers) throw a log
// onto the fire. Every drag also ends in a click, which is ignored.
els.woodpile.addEventListener('click', () => {
  if (!drag && performance.now() - dragEndedAt > 500) toss();
});

els.woodpile.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    toss();
  }
});

function renderSoundBtn() {
  els.soundBtn.setAttribute('aria-pressed', String(prefs.sound));
  els.soundBtn.title = prefs.sound ? 'Sound is on (M)' : 'Sound is off (M)';
}

function toggleSound() {
  prefs.sound = !prefs.sound;
  savePrefs();
  sound.setOn(prefs.sound);
  if (prefs.sound) sound.unlock();
  renderSoundBtn();
  toast(prefs.sound ? 'Sound on' : 'Sound off');
}
els.soundBtn.addEventListener('click', toggleSound);

function renderNotifyBtn() {
  const on = prefs.notify && 'Notification' in window && Notification.permission === 'granted';
  els.notifyBtn.setAttribute('aria-pressed', String(on));
  els.notifyBtn.title = on ? 'Notifications are on' : 'Notify me when the fire needs a log';
}

if (!('Notification' in window)) els.notifyBtn.hidden = true;
els.notifyBtn.addEventListener('click', async () => {
  if (prefs.notify) {
    prefs.notify = false;
    toast('Notifications off');
  } else {
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission === 'granted') {
      prefs.notify = true;
      toast("Notifications on. You'll hear when the last log is burning and when the fire goes out.");
    } else toast('Notifications are blocked for this site in your browser settings');
  }
  savePrefs();
  renderNotifyBtn();
});

els.helpBtn.addEventListener('click', () => els.help.showModal());
els.help.addEventListener('click', (e) => {
  if (e.target === els.help) els.help.close();
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || els.help.open) return;
  const onControl = e.target instanceof Element && e.target.closest('button, a, input, textarea, select, [role="button"]');
  if (e.key === 'l' || e.key === 'L' || e.key === '+' || e.key === '=') {
    e.preventDefault();
    toss();
  } else if (e.key === ' ' && !onControl) {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === '?') els.help.showModal();
});

// Audio can only start after the visitor interacts with the page.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => sound.unlock(), { once: true, capture: true });

/* ------------------------------------------------------------------- UI */

function fmt(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function spoken(ms) {
  if (ms < 59500) return `${Math.round(ms / 1000)} seconds`;
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  return parts.join(' ');
}

function displayMs(now) {
  if (session.phase === 'burning' || session.phase === 'paused') return S.timeLeft(session, now);
  if (session.phase === 'break') return S.breakLeft(session, now);
  return 0;
}

let clockText = '';
let bump = null;

function bumpClock(fromMs) {
  bump = { from: fromMs, t0: performance.now() };
  els.time.classList.remove('is-bumped');
  void els.time.offsetWidth;
  els.time.classList.add('is-bumped');
}

function renderClock(now) {
  let ms = displayMs(now);
  if (bump) {
    const k = (performance.now() - bump.t0) / 650;
    if (k >= 1) bump = null;
    else ms = bump.from + (ms - bump.from) * (1 - Math.pow(1 - k, 3));
  }
  const text = fmt(ms);
  if (text === clockText) return;
  clockText = text;
  els.time.innerHTML = [...text].map((c) => `<span class="${c === ':' ? 'sep' : 'dg'}">${c}</span>`).join('');
}

let statusText = '';
function renderStatus(now) {
  let text;
  const per = spoken(session.logMs);
  if (drag) text = drag.over ? `Let go to add ${per}` : 'Drop it on the fire';
  else if (session.phase === 'cold') text = `Drag a log onto the fire to start ${per} of focus`;
  else if (session.phase === 'paused') text = 'Paused. The fire is banked until you come back';
  else if (session.phase === 'break') text = 'The fire burned out. Rest by the embers';
  else {
    const n = S.logsLeft(session, now);
    const current = fmt(S.timeLeft(session, now) - (n - 1) * session.logMs);
    text = n === 1 ? `Last log · burns down in ${current} · add another to keep going` : `${n} logs on the fire · the next one burns down in ${current}`;
  }
  if (text !== statusText) els.status.textContent = statusText = text;
}

function renderTitle(now) {
  const p = session.phase;
  const title =
    p === 'burning'
      ? `${fmt(S.timeLeft(session, now))} · Fireplace`
      : p === 'paused'
        ? 'Paused · Fireplace'
        : p === 'break'
          ? `Break ${fmt(S.breakLeft(session, now))} · Fireplace`
          : 'Fireplace';
  if (document.title !== title) document.title = title;
}

let phaseShown = '';
function updatePhase() {
  const p = session.phase;
  if (p === phaseShown) return;
  phaseShown = p;
  els.body.dataset.phase = p;
  els.label.textContent = { cold: 'Cold hearth', burning: 'Focus', paused: 'Paused', break: 'Break' }[p];
  const lit = p === 'burning' || p === 'paused';
  els.pauseBtn.hidden = !lit;
  els.stopBtn.hidden = !lit;
  els.skipBtn.hidden = p !== 'break';
  els.pauseBtn.textContent = p === 'paused' ? 'Resume' : 'Pause';
  if (!lit) disarmStop();
}

function renderStats() {
  const { logs } = stats;
  const minutes = Math.round(stats.minutes);
  if (!logs) {
    els.stats.textContent = 'No logs burned today yet';
    return;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const time = h ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`;
  els.stats.textContent = `Today · ${logs} log${logs === 1 ? '' : 's'} burned · ${time} of focus`;
}

let toastTimer = 0;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-shown'), 2800);
}

function announce(message) {
  if (booting) return;
  els.announcer.textContent = '';
  setTimeout(() => (els.announcer.textContent = message), 60);
}

/* ------------------------------------------------------------ lighting */

function emberTarget(now) {
  switch (session.phase) {
    case 'burning':
      return 0.85;
    case 'paused':
      return 0.7;
    case 'break':
      return 0.08 + 0.8 * Math.pow(S.breakLeft(session, now) / session.breakMs, 0.7);
    default:
      return 0.07;
  }
}

function flicker(t) {
  const amp = reducedMotion.matches ? 0.35 : 1;
  return 1 + amp * (0.07 * Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1.1) + 0.05 * Math.sin(t * 12.7 + Math.sin(t * 3.1)) + 0.025 * (Math.random() - 0.5));
}

const shown = {};
function setOpacity(el, key, value) {
  const v = clamp(value, 0, 1).toFixed(3);
  if (shown[key] !== v) {
    el.style.opacity = v;
    shown[key] = v;
  }
}

function lights(level, ember, flick) {
  const lit = level * flick;
  setOpacity(els.backGlow, 'back', 0.04 + ember * 0.22 + lit * 0.85);
  setOpacity(els.light, 'light', lit * 0.95 + ember * 0.06);
  setOpacity(els.wallLight, 'wall', 0.05 + lit * 0.95 + ember * 0.08);
  setOpacity(els.woodLight, 'wood', lit * 0.85);
  setOpacity(grateGlow, 'grate', lit * 0.75 + ember * 0.1);
  setOpacity(els.shade, 'shade', 0.86 - lit * 0.5 - ember * 0.06);
  const g = clamp(lit, 0, 1).toFixed(2);
  if (shown.glow !== g) {
    els.time.style.setProperty('--fire', g);
    shown.glow = g;
  }
}

/* ----------------------------------------------------------- main loop */

const BED = (566 - BED_Y) / OPENING.h;

function pileTarget() {
  const e = hearth.extent();
  if (!e) return { x: 0, halfWidth: 0.24, height: 0, bed: BED };
  return {
    x: ((e.left + e.right) / 2 - VIEW_W / 2) / OPENING.h,
    halfWidth: (e.right - e.left) / 2 / OPENING.h,
    height: Math.max(0, BED_Y - e.top) / OPENING.h,
    bed: BED,
  };
}

function sparkSource() {
  const e = hearth.extent() || { left: 250, right: 390, top: BED_Y };
  return { x: ((e.left + e.right) / 2 - OPENING.x) * scale, y: (e.top - OPENING.y) * scale, w: (e.right - e.left) * 0.55 * scale };
}

let level = 0;
let ember = 0;
let flare = 0;
let pileGeo = pileTarget();
let last = performance.now();
let frameCount = 0;

function frame(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
  last = ts;
  const now = Date.now();
  step(now);

  const target = S.fireLevel(session, now) + (drag && drag.over ? 0.05 : 0);
  level += (target - level) * (1 - Math.exp(-dt / (target > level ? 2.2 : 1.2)));
  ember += (emberTarget(now) - ember) * (1 - Math.exp(-dt / 1.5));
  flare *= Math.exp(-dt / 0.7);
  const t = ts / 1000;
  const flick = flicker(t);
  const shownLevel = Math.max(0, level + flare * Math.min(1, level * 3));

  const pt = pileTarget();
  const k = 1 - Math.exp(-dt / 0.8);
  pileGeo = {
    x: pileGeo.x + (pt.x - pileGeo.x) * k,
    halfWidth: pileGeo.halfWidth + (pt.halfWidth - pileGeo.halfWidth) * k,
    height: pileGeo.height + (pt.height - pileGeo.height) * k,
    bed: BED,
  };

  // A cold hearth barely changes, so redraw it less often to save battery.
  const idle = shownLevel < 0.01 && !sparks.busy;
  if (fire && (!idle || frameCount++ % 4 === 0)) fire.render(t * (reducedMotion.matches ? 0.6 : 1), shownLevel, ember * (0.92 + 0.08 * flick), pileGeo);
  sparks.update(dt, shownLevel, sparkSource(), reducedMotion.matches);
  sparks.draw();
  hearth.update(now, session, shownLevel, ember, t);
  lights(shownLevel, ember, flick);
  sound.setFire(shownLevel, ember);
  renderClock(now);
  renderStatus(now);
  renderTitle(now);
  requestAnimationFrame(frame);
}

// Keeps the timer, title and sounds going while the tab is in the background.
setInterval(() => {
  const now = Date.now();
  step(now);
  renderTitle(now);
  if (document.hidden) sound.setFire(S.fireLevel(session, now), emberTarget(now));
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    last = performance.now();
    step(Date.now());
  }
});

/* ---------------------------------------------------------------- boot */

renderWoodpile();
{
  const now = Date.now();
  step(now);
  hearth.sync(S.activeLogs(session, now));
  level = S.fireLevel(session, now);
  ember = emberTarget(now);
  pileGeo = pileTarget();
}
updatePhase();
renderStats();
$('per-log').textContent = `+${session.logMs % 60000 ? spoken(session.logMs) : `${session.logMs / 60000} min`} each`;
renderSoundBtn();
renderNotifyBtn();
if (!prefs.fed) els.body.classList.add('is-new');
layout();
new ResizeObserver(layout).observe(els.fireplace);
booting = false;
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
