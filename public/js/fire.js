// WebGL flames and coal bed, drawn into a canvas that covers the firebox.
// Black means "no light": the canvas is screen-blended over the firebox.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;  // flame strength, 0..~1.2
uniform float uEmber;  // coal glow, 0..1
uniform vec4 uPile;    // x: centre, y: half width, z: height of the logs, w: bed (canvas-height units)
uniform float uSeed;

// 2D simplex noise by Ian McEwan and Stefan Gustavson (MIT).
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    f += a * snoise(p);
    p = p * 2.03 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return f;
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance to the nearest cell edge: 0 on the cracks between coals.
float cellEdge(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash2(n + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

// Black body-ish ramp: deep red, orange, yellow, near white.
vec3 ramp(float k) {
  k = clamp(k, 0.0, 1.0);
  vec3 c = mix(vec3(0.0), vec3(0.55, 0.05, 0.01), smoothstep(0.0, 0.2, k));
  c = mix(c, vec3(1.0, 0.3, 0.03), smoothstep(0.15, 0.45, k));
  c = mix(c, vec3(1.0, 0.58, 0.1), smoothstep(0.4, 0.68, k));
  c = mix(c, vec3(1.0, 0.83, 0.42), smoothstep(0.64, 0.88, k));
  c = mix(c, vec3(1.0, 0.96, 0.84), smoothstep(0.86, 1.0, k));
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y);
  float t = uTime;
  float L = uLevel;
  float bed = uPile.w;
  vec3 col = vec3(0.0);

  // Flames.
  if (L > 0.002) {
    float y = p.y - bed;
    float yy = max(y, 0.0);
    float halfW = max(uPile.y, 0.1) * (0.72 + 0.26 * L);
    float H = uPile.z * 0.9 + mix(0.06, 0.6, L);

    float sway = snoise(vec2(yy * 1.6 - t * 0.85, 1.7 + uSeed)) * 0.055
               + snoise(vec2(yy * 3.8 - t * 2.1, 5.3 + uSeed)) * 0.022;
    float x = p.x - uPile.x + sway * smoothstep(0.0, 0.45, yy);

    float xn = x / halfW;
    float dome = sqrt(max(0.0, 1.0 - xn * xn));
    float tongues = 0.6 + 0.32 * snoise(vec2(x * 5.5 + uSeed, t * 0.75))
                        + 0.16 * snoise(vec2(x * 12.0 - uSeed, t * 1.9));
    float h = H * dome * tongues;

    float n = fbm(vec2(x * 6.0, yy * 3.0 - t * 2.4) + uSeed * 3.1);
    float n2 = snoise(vec2(x * 15.0, yy * 8.0 - t * 5.2));
    // Hottest in the middle of the pile, fading out towards its ends.
    float d = (1.0 - yy / max(h, 0.02)) * (0.45 + 0.55 * dome) + 0.5 * n + 0.12 * n2;
    d *= smoothstep(-0.03, 0.02, y) * (1.0 - smoothstep(0.85, 1.1, abs(xn)));

    float heat = clamp(d, 0.0, 1.5);
    float a = smoothstep(0.02, 0.32, heat);
    float k = heat * (0.62 + 0.42 * L) - 0.22 * clamp(yy / H, 0.0, 1.0) + 0.08;
    col += ramp(k) * a;

    float halo = smoothstep(-0.5, 0.25, d) * (1.0 - smoothstep(0.0, H * 1.3, yy)) * (1.0 - smoothstep(0.7, 1.4, abs(xn)));
    col += vec3(1.0, 0.36, 0.07) * 0.1 * L * halo;
  }

  // Coals: a low mound of glowing chunks along the bed.
  if (uEmber > 0.002) {
    float cx = (p.x - uPile.x * 0.5) / 0.36;
    float top = bed + 0.028 * max(0.0, 1.0 - cx * cx) + 0.006 * snoise(vec2(p.x * 30.0, 2.0 + uSeed));
    float inBed = smoothstep(top + 0.006, top - 0.006, p.y)
                * smoothstep(bed - 0.075, bed - 0.035, p.y)
                * (1.0 - smoothstep(0.82, 1.05, abs(cx)));
    float crack = 1.0 - smoothstep(0.0, 0.2, cellEdge(vec2(p.x * 30.0, p.y * 42.0) + uSeed * 7.0));
    float pulse = 0.55 + 0.45 * snoise(vec2(p.x * 7.0 + t * 0.12, p.y * 9.0 - t * 0.21 + uSeed));
    float glow = uEmber * inBed * pulse * (0.16 + 0.95 * crack);
    col += ramp(0.2 + 0.62 * glow) * glow;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader error');
  return sh;
}

export class FireRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
    this.gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!this.gl) throw new Error('WebGL is not available');
    this.seed = Math.random() * 50;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.init();
      this.lost = false;
    });
    this.init();
  }

  init() {
    const gl = this.gl;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const precision = hp && hp.precision > 0 ? 'highp' : 'mediump';
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, `precision ${precision} float;\n${FRAG}`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const name of ['uRes', 'uTime', 'uLevel', 'uEmber', 'uPile', 'uSeed']) this.u[name] = gl.getUniformLocation(prog, name);
    gl.uniform1f(this.u.uSeed, this.seed);
    this.resize(this.canvas.width, this.canvas.height);
  }

  resize(w, h) {
    const c = this.canvas;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  // pile: { x, halfWidth, height, bed } in canvas-height units.
  render(time, level, ember, pile) {
    if (this.lost) return;
    const gl = this.gl;
    const u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, time % 1000);
    gl.uniform1f(u.uLevel, level);
    gl.uniform1f(u.uEmber, ember);
    gl.uniform4f(u.uPile, pile.x, pile.halfWidth, pile.height, pile.bed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
