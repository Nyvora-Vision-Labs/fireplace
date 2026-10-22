// Procedural SVG artwork: the fireplace, the logs and the woodpile.
// The fireplace is drawn in a 640×620 unit space shared by all its layers.

export const VIEW_W = 640;
export const VIEW_H = 620;
// Bounding box of the firebox opening; the flame and spark canvases cover it.
export const OPENING = { x: 150, y: 214, w: 340, h: 352 };
const OPENING_PATH = 'M150 566V272A170 58 0 0 1 490 272V566Z';
// Top of the bed of coals under the logs.
export const BED_Y = 538;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return (Math.random() * 2 ** 32) >>> 0;
}

const f = (n) => Math.round(n * 10) / 10;
const pick = (r, list) => list[Math.floor(r() * list.length)];

// Smooth closed path through points (Catmull-Rom as cubic Béziers).
function closedCurve(pts) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// Gradients shared by every SVG on the page (url(#id) resolves document-wide).
export const SHARED_DEFS = `
<linearGradient id="bark-0" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#22160e"/><stop offset=".2" stop-color="#4a3120"/><stop offset=".48" stop-color="#6b4a31"/><stop offset=".75" stop-color="#4a3221"/><stop offset="1" stop-color="#1c120b"/>
</linearGradient>
<linearGradient id="bark-1" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#26170f"/><stop offset=".2" stop-color="#553222"/><stop offset=".48" stop-color="#76503a"/><stop offset=".75" stop-color="#4f3223"/><stop offset="1" stop-color="#1f130c"/>
</linearGradient>
<linearGradient id="bark-2" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#211c16"/><stop offset=".2" stop-color="#463c31"/><stop offset=".48" stop-color="#655748"/><stop offset=".75" stop-color="#433a30"/><stop offset="1" stop-color="#1b1712"/>
</linearGradient>
<linearGradient id="bark-birch" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7f776c"/><stop offset=".22" stop-color="#c9c1b2"/><stop offset=".5" stop-color="#dcd5c8"/><stop offset=".78" stop-color="#b7ae9f"/><stop offset="1" stop-color="#6a6258"/>
</linearGradient>
<radialGradient id="wood-face" cx=".45" cy=".42" r=".66">
  <stop offset="0" stop-color="#e8c38e"/><stop offset=".7" stop-color="#c9975e"/><stop offset="1" stop-color="#a5713f"/>
</radialGradient>
<linearGradient id="log-under" x1="0" y1="0" x2="0" y2="1">
  <stop offset=".3" stop-color="#ff5a14" stop-opacity="0"/><stop offset="1" stop-color="#ff6f22" stop-opacity=".95"/>
</linearGradient>
<radialGradient id="end-shade" cx=".36" cy=".3" r=".9">
  <stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/>
</radialGradient>
<linearGradient id="stone-shade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffe6cc" stop-opacity=".08"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/>
</linearGradient>
<linearGradient id="mantel-wood" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5d3b24"/><stop offset=".4" stop-color="#4a2e1b"/><stop offset="1" stop-color="#2c1a0f"/>
</linearGradient>
<linearGradient id="iron" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#3a3430"/><stop offset=".4" stop-color="#191614"/><stop offset="1" stop-color="#0e0c0b"/>
</linearGradient>
<filter id="grit" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" stitchTiles="stitch"/>
  <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.3 0 0 0 -.45"/>
</filter>`;

/* ---------------------------------------------------------------- logs */

// Stable look of a log from its seed: size, species and markings.
export function logTraits(seed) {
  const r = rng(seed);
  return {
    seed,
    birch: r() < 0.22,
    length: Math.round(136 + r() * 36),
    thick: Math.round(25 + r() * 8),
    bark: Math.floor(r() * 3),
    capLeft: r() < 0.5,
  };
}

// A log seen from the side, centred on 0,0. Includes the layers the hearth
// animates as it burns: under-glow, char, glowing cracks and a rim of light.
export function sideLog(t) {
  const r = rng(t.seed ^ 0x9e3779b9);
  const L = t.length;
  const T = t.thick;
  const hl = L / 2;
  const ht = T / 2;
  const cap = T * 0.2;
  const N = 10;
  const top = [];
  const bot = [];
  for (let i = 0; i <= N; i++) {
    const x = -hl + (L * i) / N;
    top.push([x, -ht + (r() - 0.5) * 1.8]);
    bot.push([x, ht + (r() - 0.5) * 1.8]);
  }
  const line = (pts) => pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
  const body =
    `M${line(top)}A${f(cap)} ${f(ht)} 0 0 1 ${f(bot[N][0])} ${f(bot[N][1])}` +
    `L${line([...bot].reverse())}A${f(cap)} ${f(ht)} 0 0 1 ${f(top[0][0])} ${f(top[0][1])}Z`;

  let marks = '';
  if (t.birch) {
    for (let i = 0; i < 18; i++) {
      const x = -hl + 4 + r() * (L - 14);
      const y = (r() - 0.5) * T * 0.8;
      marks += `<path d="M${f(x)} ${f(y)}h${f(3 + r() * 9)}" stroke="#2a2522" stroke-width="${f(0.8 + r() * 1.3)}" stroke-opacity="${f(0.5 + r() * 0.45)}" stroke-linecap="round"/>`;
    }
    for (let i = 0; i < 3; i++) {
      marks += `<ellipse cx="${f(-hl + 8 + r() * (L - 16))}" cy="${f((r() - 0.5) * T * 0.5)}" rx="${f(2 + r() * 6)}" ry="${f(1.5 + r() * 3.5)}" fill="#1f1b18" fill-opacity=".75"/>`;
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const y0 = (r() - 0.5) * T * 0.82;
      const x0 = -hl + 3 + r() * L * 0.5;
      const x1 = Math.min(hl - 4, x0 + L * (0.25 + r() * 0.55));
      marks += `<path d="M${f(x0)} ${f(y0)}Q${f((x0 + x1) / 2)} ${f(y0 + (r() - 0.5) * 3)} ${f(x1)} ${f(y0 + (r() - 0.5) * 2)}" stroke="#1a110a" stroke-opacity="${f(0.35 + r() * 0.4)}" stroke-width="${f(0.6 + r() * 1.3)}" fill="none"/>`;
    }
    for (let i = 0; i < 4; i++) {
      const y0 = -ht * 0.5 + r() * T * 0.3;
      const x0 = -hl + 6 + r() * L * 0.6;
      marks += `<path d="M${f(x0)} ${f(y0)}h${f(14 + r() * 30)}" stroke="#a37c56" stroke-opacity=".22" stroke-width=".7"/>`;
    }
    const knots = r() < 0.6 ? 1 : 2;
    for (let i = 0; i < knots; i++) {
      const kx = -hl + 16 + r() * (L - 32);
      const ky = (r() - 0.5) * T * 0.4;
      marks += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(3 + r() * 2.5)}" ry="${f(1.8 + r() * 1.2)}" fill="#20140c" stroke="#7a5638" stroke-opacity=".5" stroke-width=".6"/>`;
    }
  }

  // The cut end with growth rings.
  const cx = t.capLeft ? -hl : hl;
  let rings = '';
  for (let k = 1; k <= 4; k++) {
    const s = 1 - k * 0.2;
    rings += `<ellipse cx="${f(cx + (r() - 0.5) * cap * 0.2)}" cy="${f((r() - 0.5) * ht * 0.12)}" rx="${f(cap * 0.8 * s)}" ry="${f(ht * 0.84 * s)}"/>`;
  }
  const endCap =
    `<ellipse cx="${f(cx)}" cy="0" rx="${f(cap)}" ry="${f(ht)}" fill="${t.birch ? '#e6dfd1' : '#3a271a'}"/>` +
    `<ellipse cx="${f(cx)}" cy="0" rx="${f(cap * 0.8)}" ry="${f(ht * 0.84)}" fill="url(#wood-face)"/>` +
    `<g fill="none" stroke="#97663a" stroke-opacity=".5" stroke-width=".6">${rings}</g>` +
    `<path d="M${f(cx)} ${f((r() - 0.5) * 2)}L${f(cx + (r() - 0.5) * cap)} ${f((r() < 0.5 ? -1 : 1) * ht * 0.75)}" stroke="#5a3a1e" stroke-width=".8"/>`;

  // Alligator cracks that glow once the log is charred.
  let cracks = '';
  const rows = 3;
  const span = T * 0.84;
  for (let row = 0; row < rows; row++) {
    const y0 = -span / 2 + (span * row) / rows;
    const y1 = y0 + span / rows;
    let x = -hl + 5 + r() * 8 + (row % 2) * 5;
    while (x < hl - 7) {
      cracks += `M${f(x)} ${f(y0)}L${f(x + (r() - 0.5) * 2.5)} ${f((y0 + y1) / 2)}L${f(x + (r() - 0.5) * 2.5)} ${f(y1)}`;
      x += 7 + r() * 8;
    }
    if (row > 0) {
      let xx = -hl + 6;
      while (xx < hl - 9) {
        const seg = 8 + r() * 22;
        if (r() < 0.7) cracks += `M${f(xx)} ${f(y0 + (r() - 0.5))}L${f(Math.min(hl - 7, xx + seg))} ${f(y0 + (r() - 0.5) * 1.5)}`;
        xx += seg + 2 + r() * 6;
      }
    }
  }

  return (
    `<path d="${body}" fill="url(#${t.birch ? 'bark-birch' : `bark-${t.bark}`})"/>` +
    marks +
    endCap +
    `<path class="lg-under" d="${body}" fill="url(#log-under)" opacity="0"/>` +
    `<path class="lg-char" d="${body}" fill="#0c0806" opacity="0"/>` +
    `<g class="lg-cracks" opacity="0" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${cracks}" stroke="#ff4a0c" stroke-width="2.8" stroke-opacity=".38"/>` +
    `<path d="${cracks}" stroke="#ffbc5e" stroke-width=".9"/></g>` +
    `<path class="lg-rim" d="M${line(top)}" stroke="#ffb066" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0"/>`
  );
}

// Standalone SVG of a side-view log, for the one being dragged.
export function sideLogSVG(t, pad = 6) {
  const w = t.length + t.thick * 0.4 + pad * 2;
  const h = t.thick + pad * 2;
  return {
    w,
    h,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(-w / 2)} ${f(-h / 2)} ${f(w)} ${f(h)}" width="100%" height="100%" aria-hidden="true">${sideLog(t)}</svg>`,
  };
}

// A log seen end-on, as stacked in the woodpile. Centred on 0,0.
export function endGrain(t, R) {
  const r = rng(t.seed ^ 0x51ed27);
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = R * (1 + (r() - 0.5) * 0.07);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const outline = closedCurve(pts);
  const face = closedCurve(pts.map(([x, y]) => [x * 0.84, y * 0.84]));
  const ox = (r() - 0.5) * R * 0.2;
  const oy = (r() - 0.5) * R * 0.2;
  let rings = '';
  for (let k = 1; k <= 5; k++) {
    const s = k / 5.7;
    rings += `<ellipse cx="${f(ox * (1 - s))}" cy="${f(oy * (1 - s))}" rx="${f(R * 0.84 * s)}" ry="${f(R * 0.84 * s * (0.93 + r() * 0.08))}"/>`;
  }
  let cracks = '';
  const nCracks = 1 + Math.floor(r() * 2);
  for (let i = 0; i < nCracks; i++) {
    const a = r() * Math.PI * 2;
    cracks += `M${f(ox)} ${f(oy)}L${f(ox + Math.cos(a) * R * 0.45)} ${f(oy + Math.sin(a) * R * 0.45 + (r() - 0.5) * 2)}L${f(ox + Math.cos(a) * R * 0.8)} ${f(oy + Math.sin(a) * R * 0.8)}`;
  }
  let marks = '';
  if (t.birch) {
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      marks += `<path d="M${f(Math.cos(a) * R * 0.92)} ${f(Math.sin(a) * R * 0.92)}l${f(Math.cos(a + 1.6) * 4)} ${f(Math.sin(a + 1.6) * 4)}" stroke="#2a2522" stroke-width="1.6" stroke-linecap="round"/>`;
    }
  }
  const barkFill = t.birch ? '#e6dfd1' : ['#3a281b', '#45291c', '#373026'][t.bark];
  return (
    `<path d="${outline}" fill="${barkFill}"/>` +
    marks +
    `<path d="${face}" fill="url(#wood-face)"/>` +
    `<g fill="none" stroke="#a5743f" stroke-opacity=".45" stroke-width=".8">${rings}</g>` +
    `<path d="${cracks}" stroke="#5b3a1d" stroke-width="1.1" stroke-linecap="round" fill="none"/>` +
    `<path d="${outline}" fill="url(#end-shade)"/>`
  );
}

/* ----------------------------------------------------------- fireplace */

function stoneColor(r) {
  const h = 20 + r() * 16;
  const s = 8 + r() * 10;
  const l = 15 + r() * 10;
  return `hsl(${f(h)} ${f(s)}% ${f(l)}%)`;
}

function block(x, y, w, h, rx, fill) {
  return (
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}"/>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="url(#stone-shade)"/>`
  );
}

// Inside of the firebox: sooty firebrick, side walls and the ash bed.
export function interiorSVG(seed = 11) {
  const r = rng(seed);
  let bricks = '';
  const rowH = 13;
  for (let y = 214, row = 0; y < 534; y += rowH, row++) {
    let x = 196 - (row % 2 ? 20 : 0) - r() * 4;
    while (x < 444) {
      const w = 36 + r() * 6;
      const l = 9 + r() * 6;
      bricks += `<rect x="${f(x + 1)}" y="${f(y + 1)}" width="${f(w - 2)}" height="${rowH - 2}" rx="1.5" fill="hsl(${f(10 + r() * 8)} ${f(30 + r() * 15)}% ${f(l)}%)"/>`;
      x += w;
    }
  }
  let ash = '';
  for (let i = 0; i < 70; i++) {
    const x = 214 + r() * 212;
    const y = 536 + r() * 26;
    ash += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.6 + r() * 1.8)}" fill="${pick(r, ['#3a332e', '#2a2420', '#4a423c', '#1c1714'])}"/>`;
  }
  for (let i = 0; i < 16; i++) {
    const x = 236 + r() * 168;
    const y = 540 + r() * 16;
    const w = 4 + r() * 8;
    ash += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(2.5 + r() * 3)}" rx="1" fill="#120d0b" transform="rotate(${f((r() - 0.5) * 50)} ${f(x)} ${f(y)})"/>`;
  }
  return `
  <defs>
    <clipPath id="opening-clip"><path d="${OPENING_PATH}"/></clipPath>
    <linearGradient id="soot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".96"/><stop offset=".5" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="firebox-sides" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".9"/><stop offset=".2" stop-color="#000" stop-opacity=".3"/><stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset=".8" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".9"/>
    </linearGradient>
    <radialGradient id="ash-mound" cx=".5" cy=".7" r=".6">
      <stop offset="0" stop-color="#3b332d"/><stop offset=".7" stop-color="#2a231f"/><stop offset="1" stop-color="#2a231f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g clip-path="url(#opening-clip)">
    <rect x="150" y="200" width="340" height="370" fill="#0b0605"/>
    <rect x="196" y="214" width="248" height="320" fill="#0d0605"/>
    ${bricks}
    <path d="M150 200H196V534L150 566Z" fill="#0e0807"/>
    <path d="M490 200H444V534L490 566Z" fill="#0e0807"/>
    <path d="M150 566L196 534H444L490 566Z" fill="#17110e"/>
    <ellipse cx="320" cy="548" rx="128" ry="22" fill="url(#ash-mound)"/>
    ${ash}
    <rect x="150" y="200" width="340" height="370" fill="url(#firebox-sides)"/>
    <rect x="150" y="200" width="340" height="220" fill="url(#soot)"/>
  </g>`;
}

// Stone surround, arch, mantel and hearth. Everything outside the opening.
export function surroundSVG(seed = 5) {
  const r = rng(seed);
  let stones = '';
  for (let y = 80; y < 566; ) {
    const h = Math.min(30 + r() * 14, 566 - y);
    let x = 44 - r() * 50;
    while (x < 596) {
      const w = 46 + r() * 64;
      stones += block(x + 1.5, y + 1.5, w - 3, h - 3, 4 + r() * 5, stoneColor(r));
      x += w;
    }
    y += h;
  }

  // Jamb stones either side of the opening, alternating long and short.
  let jambs = '';
  for (let y = 566, i = 0; y > 262; i++) {
    const h = 40 + r() * 6;
    const w = i % 2 ? 28 : 42;
    const top = Math.max(262, y - h);
    jambs += block(150 - w + 1.5, top + 1.5, w - 3, y - top - 3, 4, stoneColor(r));
    jambs += block(490 + 1.5, top + 1.5, w - 3, y - top - 3, 4, stoneColor(r));
    y = top;
  }

  // Voussoirs around the arch, with a keystone at the top.
  let arch = '';
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (Math.PI * i) / n;
    const a1 = Math.PI - (Math.PI * (i + 1)) / n;
    const out = i === (n - 1) / 2 ? 1.22 : 1;
    const p = (a, rx, ry) => [320 + Math.cos(a) * rx, 272 - Math.sin(a) * ry];
    const g = 0.012;
    const [x0, y0] = p(a0 - g, 170, 58);
    const [x1, y1] = p(a1 + g, 170, 58);
    const [x2, y2] = p(a1 + g, 204, 92 * out);
    const [x3, y3] = p(a0 - g, 204, 92 * out);
    const fill = stoneColor(r);
    const d = `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z`;
    arch += `<path d="${d}" fill="${fill}" stroke="#110d0b" stroke-width="3" stroke-linejoin="round"/><path d="${d}" fill="url(#stone-shade)"/>`;
  }

  let grain = '';
  for (let i = 0; i < 7; i++) {
    const y = 58 + r() * 26;
    const x0 = 24 + r() * 200;
    grain += `<path d="M${f(x0)} ${f(y)}q${f(80 + r() * 60)} ${f((r() - 0.5) * 4)} ${f(170 + r() * 220)} ${f((r() - 0.5) * 3)}" stroke="#1d1209" stroke-opacity=".55" stroke-width="${f(0.6 + r())}" fill="none"/>`;
  }

  let slabs = '';
  for (const x of [168, 320, 472]) slabs += `<path d="M${x} 566L${f(x + (x - 320) * 0.05)} 590" stroke="#141110" stroke-width="2"/>`;

  return `
  <defs>
    <clipPath id="surround-clip"><path clip-rule="evenodd" d="M44 80H596V566H44ZM150 566V272A170 58 0 0 1 490 272V566Z"/></clipPath>
    <linearGradient id="mantel-shadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="hearth-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2420"/><stop offset="1" stop-color="#3a322c"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#surround-clip)">
    <rect x="44" y="80" width="552" height="486" fill="#110d0b"/>
    ${stones}
    ${jambs}
    ${arch}
    <rect x="44" y="80" width="552" height="486" filter="url(#grit)" opacity=".55"/>
    <path d="${OPENING_PATH}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="10"/>
    <rect x="44" y="84" width="552" height="22" fill="url(#mantel-shadow)"/>
  </g>
  <path d="M60 84h34l-6 34h-22z M546 84h34l-6 34h-22z" fill="#3a2414"/>
  <rect x="22" y="50" width="596" height="36" rx="3" fill="url(#mantel-wood)"/>
  ${grain}
  <rect x="12" y="42" width="616" height="12" rx="3" fill="#5f3d26"/>
  <rect x="12" y="42" width="616" height="2.5" rx="1" fill="#8a6040" opacity=".55"/>
  <path d="M16 566H624L640 590H0Z" fill="url(#hearth-top)"/>
  ${slabs}
  <rect x="0" y="590" width="640" height="26" fill="#1b1613"/>
  <rect x="0" y="590" width="640" height="1.5" fill="#6b625a" opacity=".35"/>`;
}

// The iron grate in front of the logs. The `grate-glow` group catches firelight.
export function grateSVG() {
  let bars = '';
  for (let x = 214; x <= 426; x += 23) bars += `<rect x="${x}" y="526" width="4" height="30" rx="1.5"/>`;
  const edges = 'M196 541H444 M206 503V560 M434 503V560';
  return `
  <g fill="url(#iron)">
    ${bars}
    <rect x="194" y="538" width="252" height="7" rx="2"/>
    <rect x="194" y="552" width="252" height="5" rx="2"/>
    <rect x="202" y="500" width="8" height="62" rx="2.5"/>
    <rect x="430" y="500" width="8" height="62" rx="2.5"/>
    <circle cx="206" cy="497" r="7.5"/>
    <circle cx="434" cy="497" r="7.5"/>
    <path d="M198 560h16l-3 6h-10z M426 560h16l-3 6h-10z"/>
  </g>
  <g class="grate-glow" opacity="0" fill="none" stroke="#ff9a4a" stroke-width="1.3" stroke-linecap="round">
    <path d="${edges}"/>
    <path d="M200 494a7 7 0 0 1 12 0 M428 494a7 7 0 0 1 12 0"/>
  </g>`;
}

/* ------------------------------------------------------------ woodpile */

// Two stacks: a tall one beside the fireplace, a wide low one under it on phones.
function stack(rows, cx, bottom, seed) {
  const r = rng(seed);
  const spots = [];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      spots.push({
        x: f(cx + (i - (count - 1) / 2) * 49 + (r() - 0.5) * 3),
        y: f(bottom - row * 42 + (r() - 0.5) * 2),
        r: f(22.5 + r() * 2.5),
        rot: f(r() * 360),
      });
    }
  });
  return spots;
}

function rack(w, top, base) {
  return {
    back: `
      <ellipse cx="${w / 2}" cy="${base + 7}" rx="${w / 2 - 4}" ry="8" fill="#000" opacity=".5"/>
      <path d="M14 ${base + 8}V${top} M${w - 14} ${base + 8}V${top}" stroke="#171412" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="14" cy="${top - 6}" r="6.5" fill="#1d1916"/>
      <circle cx="${w - 14}" cy="${top - 6}" r="6.5" fill="#1d1916"/>`,
    front: `
      <path d="M10 ${base}Q${w / 2} ${base + 16} ${w - 10} ${base}" stroke="#1d1916" stroke-width="5.5" stroke-linecap="round" fill="none"/>
      <path d="M10 ${base - 2}Q${w / 2} ${base + 14} ${w - 10} ${base - 2}" stroke="#4a403a" stroke-width="1" stroke-linecap="round" fill="none" opacity=".6"/>`,
  };
}

export const PILES = {
  tall: { w: 240, h: 250, spots: stack([4, 3, 2, 1], 120, 214, 99), ...rack(240, 104, 236) },
  wide: { w: 300, h: 132, spots: stack([5, 4], 150, 96, 42), ...rack(300, 44, 118) },
};
