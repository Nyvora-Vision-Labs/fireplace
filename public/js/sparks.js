// Sparks and smoke on a 2D canvas over the logs. Coordinates are CSS pixels.

const MAX_SPARKS = 260;
const MAX_SMOKE = 40;

function smokeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(150,140,132,0.55)');
  grad.addColorStop(0.5, 'rgba(120,112,106,0.22)');
  grad.addColorStop(1, 'rgba(100,95,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export class Sparks {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sparks = [];
    this.smoke = [];
    this.debt = 0;
    this.w = 1;
    this.h = 1;
    this.scale = 1;
    this.sprite = smokeSprite();
  }

  resize(w, h, dpr, scale) {
    this.w = w;
    this.h = h;
    this.scale = scale; // CSS px per fireplace unit
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  spark(x, y, power = 1) {
    if (this.sparks.length >= MAX_SPARKS) return;
    const s = this.scale;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
    const v = (60 + Math.random() * 140) * power * s;
    this.sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0,
      max: 0.6 + Math.random() * 1.8,
      size: (0.6 + Math.random() * 1.3) * Math.max(0.7, s),
      wob: Math.random() * 10,
    });
  }

  // Burst of sparks around a point (a log landing or collapsing).
  burst(x, y, n, spread = 40, power = 1.2) {
    for (let i = 0; i < n; i++) this.spark(x + (Math.random() - 0.5) * spread * this.scale, y, power * (0.6 + Math.random() * 0.8));
  }

  puff(x, y, n, spread = 60) {
    for (let i = 0; i < n && this.smoke.length < MAX_SMOKE; i++) {
      this.smoke.push({
        x: x + (Math.random() - 0.5) * spread * this.scale,
        y: y - Math.random() * 10 * this.scale,
        vx: (Math.random() - 0.5) * 8 * this.scale,
        vy: -(14 + Math.random() * 18) * this.scale,
        r: (14 + Math.random() * 16) * this.scale,
        life: 0,
        max: 3 + Math.random() * 3,
        spin: Math.random() * 6,
      });
    }
  }

  // src: where sparks rise from, { x, y, w } in CSS px.
  update(dt, level, src, quiet = false) {
    const rate = quiet ? 0 : level * level * 10;
    this.debt += rate * dt;
    while (this.debt >= 1) {
      this.debt -= 1;
      this.spark(src.x + (Math.random() - 0.5) * src.w, src.y + Math.random() * 10 * this.scale, 0.55 + level * 0.6);
    }
    const t = performance.now() / 1000;
    const s = this.scale;
    for (const p of this.sparks) {
      p.life += dt;
      p.vy -= 30 * s * dt; // hot air keeps them rising
      p.vx += Math.sin(t * 6 + p.wob) * 120 * s * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 0.9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.sparks = this.sparks.filter((p) => p.life < p.max && p.y > -10);
    for (const m of this.smoke) {
      m.life += dt;
      m.x += (m.vx + Math.sin(t * 0.7 + m.spin) * 6 * s) * dt;
      m.y += m.vy * dt;
      m.r += 9 * s * dt;
    }
    this.smoke = this.smoke.filter((m) => m.life < m.max);
  }

  draw() {
    const g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    if (this.smoke.length) {
      g.globalCompositeOperation = 'source-over';
      for (const m of this.smoke) {
        const k = m.life / m.max;
        g.globalAlpha = Math.min(1, k * 6) * (1 - k) * 0.5;
        g.drawImage(this.sprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
    }
    if (this.sparks.length) {
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const p of this.sparks) {
        const k = p.life / p.max;
        const fade = 1 - k;
        const hot = Math.max(0, 1 - k * 1.6);
        const r = 255;
        const gr = Math.round(110 + 130 * hot);
        const b = Math.round(30 + 150 * hot * hot);
        g.globalAlpha = fade * 0.9;
        g.strokeStyle = `rgb(${r},${gr},${b})`;
        g.lineWidth = p.size * (0.6 + 0.4 * fade);
        g.beginPath();
        // A short streak behind the spark, independent of frame rate.
        g.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        g.lineTo(p.x, p.y);
        g.stroke();
        g.globalAlpha = fade * 0.18;
        g.lineWidth = p.size * 4;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  get busy() {
    return this.sparks.length > 0 || this.smoke.length > 0;
  }
}
