// A recorded wood fire, with a thunk when a log lands and soft bells at the
// 15-minute marks. Recording source and license: ../audio/LICENSE.txt.

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99 };
const FIRE_AUDIO = new URL('../audio/fireplace.wav', import.meta.url);

export class FireSound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.level = 0;
    this.ember = 0;
    this.fireSource = null;
    this.loading = false;
  }

  // The first call has to come from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.on) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx) this.loadFire();
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

    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    this.fireGain.connect(this.master);

    this.crackles = ctx.createGain();
    this.crackles.gain.value = 0.7;
    this.crackles.connect(this.master);

    this.timer = setInterval(() => this.schedule(), 60);
  }

  async loadFire() {
    if (this.fireSource || this.loading) return;
    this.loading = true;
    try {
      const response = await fetch(FIRE_AUDIO);
      if (!response.ok) throw new Error(`Fire recording: HTTP ${response.status}`);
      const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.fireGain);
      source.start();
      this.fireSource = source;
      this.schedule();
    } catch (err) {
      // A later user gesture can retry if the recording could not be loaded.
      console.warn('Fireplace: could not load the fire recording.', err);
    } finally {
      this.loading = false;
    }
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
    this.fireGain.gain.setTargetAtTime(this.level * 0.75 + this.ember * 0.025, now, 0.4);
  }

  crackle(t, pop = false, gain = 1) {
    const buffer = this.fireSource?.buffer;
    if (!buffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const amp = (pop ? 0.45 : 0.2) * gain;
    const dur = pop ? 0.25 + Math.random() * 0.1 : 0.1 + Math.random() * 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = src.connect(g);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 1.1;
      out = out.connect(pan);
    }
    out.connect(this.crackles);
    src.start(t, Math.random() * (buffer.duration - dur - 0.03), dur + 0.03);
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
    const buffer = this.fireSource?.buffer;
    if (!buffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
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
    src.start(t, Math.random() * (buffer.duration - dur - 0.05), dur + 0.05);
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
