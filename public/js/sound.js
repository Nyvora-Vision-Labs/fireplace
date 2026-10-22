// Fire sounds synthesized with the Web Audio API: a low roar, random crackles
// and pops, a thunk when a log lands and soft bells at the 15-minute marks.

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99 };

function noiseBuffer(ctx, seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  // Cross-fade the tail into the head so the loop has no click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

export class FireSound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.level = 0;
    this.ember = 0;
    this.next = 0;
  }

  // The first call has to come from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.on) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.white = noiseBuffer(ctx, 3, false);

    const roar = ctx.createBufferSource();
    roar.buffer = noiseBuffer(ctx, 5, true);
    roar.loop = true;
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'lowpass';
    this.roarFilter.frequency.value = 300;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    roar.connect(this.roarFilter).connect(this.roarGain).connect(this.master);
    roar.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.white;
    hiss.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2600;
    band.Q.value = 0.7;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hiss.connect(band).connect(this.hissGain).connect(this.master);
    hiss.start(0, 1.3);

    this.crackles = ctx.createGain();
    this.crackles.gain.value = 0.7;
    this.crackles.connect(this.master);

    this.timer = setInterval(() => this.schedule(), 60);
  }

  get ready() {
    return !!this.ctx && this.on && this.ctx.state === 'running';
  }

  setOn(on) {
    this.on = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.85 : 0, t, 0.08);
    if (on) this.ctx.resume();
    else setTimeout(() => !this.on && this.ctx.suspend(), 400);
  }

  // level: flame strength 0..1, ember: coal glow 0..1.
  setFire(level, ember) {
    this.level = level;
    this.ember = ember;
  }

  schedule() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const lv = this.level;
    this.roarGain.gain.setTargetAtTime(lv * 0.32 + this.ember * 0.015, now, 0.4);
    this.roarFilter.frequency.setTargetAtTime(220 + lv * 900 + Math.random() * 120, now, 0.25);
    this.hissGain.gain.setTargetAtTime(lv * lv * 0.025, now, 0.4);

    // Crackles arrive at random (Poisson) times; embers still tick now and then.
    const rate = lv > 0.01 ? 0.6 + lv * 12 : this.ember * 0.6;
    const gap = () => Math.min(1.2, -Math.log(1 - Math.random()) / Math.max(rate, 0.05));
    const horizon = now + (document.hidden ? 1.3 : 0.16);
    if (this.next < now) this.next = now + gap();
    while (this.next < horizon) {
      if (rate > 0.05) this.crackle(this.next, lv > 0.01 && Math.random() < 0.06, lv > 0.01 ? 1 : 0.35);
      this.next += gap();
    }
  }

  crackle(t, pop = false, gain = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = pop ? 350 + Math.random() * 700 : 1300 + Math.random() * 5200;
    filter.Q.value = pop ? 1.2 : 0.8 + Math.random() * 3;
    const g = ctx.createGain();
    const amp = (pop ? 0.45 + Math.random() * 0.4 : Math.pow(Math.random(), 2.4) * 0.5) * gain;
    const dur = pop ? 0.03 + Math.random() * 0.05 : 0.004 + Math.random() * 0.024;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = src.connect(filter).connect(g);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 1.1;
      out = out.connect(pan);
    }
    out.connect(this.crackles);
    src.start(t, Math.random() * 2.5, dur + 0.03);
    if (pop) for (let i = 0; i < 3; i++) this.crackle(t + 0.02 + Math.random() * 0.12, false, gain * 0.7);
  }

  // A log landing on the grate.
  thunk() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
    this.rumble(t, 0.12, 900, 0.35);
    for (let i = 0; i < 16; i++) this.crackle(t + 0.12 + Math.random() * 1.8);
  }

  // A log collapsing into the coals at a 15-minute mark.
  settle() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    this.rumble(t, 0.9, 600, 0.3);
    for (let i = 0; i < 10; i++) this.crackle(t + Math.random() * 1.2, i < 2);
  }

  rumble(t, dur, freq, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 0.4, t);
    filter.frequency.linearRampToValueAtTime(freq, t + dur * 0.3);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.3, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, dur + 0.05);
  }

  bell(freq, t, vol) {
    const ctx = this.ctx;
    const partials = [
      [1, 1, 2.8],
      [2, 0.32, 1.7],
      [2.76, 0.2, 1.2],
      [4.07, 0.07, 0.8],
    ];
    for (const [ratio, amp, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }

  // kind: 'log' (a log burned down), 'out' (time for a break), 'rested' (break over)
  chime(kind) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.05;
    const seq = { log: ['E5'], out: ['G5', 'E5', 'C5'], rested: ['C5', 'E5', 'G5'] }[kind] || [];
    seq.forEach((n, i) => this.bell(NOTES[n], t + i * 0.34, kind === 'log' ? 0.13 : 0.17));
  }
}
