/**
 * [INPUT]: depends on three (InstancedBufferGeometry, ShaderMaterial, CanvasTexture)
 * [OUTPUT]: exports SoundFx (hand-drawn sound: wobbly arcs, rings, bands, strokes and scribbled glyphs) and SOUND_GLYPH
 * [POS]: render-side of every sound in the game. Effects owns one (ctx.effects.sound) and steps it.
 *        WAI's SHOUT (harbor/Shout.ts) and the creatures' sound attacks (enemy/SoundWave.ts) draw with it,
 *        so theirs and ours share one visual language: ours cyan / pink / yellow, theirs red-pen red and grey.
 *        Two draw calls in all (arcs, glyphs). Gameplay code either spawns self-animating items (spawnArc,
 *        spawnGlyph) or draws an exact shape this frame (arc), e.g. a wave whose radius IS its hit radius.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';

// ───────────── shapes ─────────────
/** Arc modes: a flat annulus sector in the (u, v) plane; a band on the cylinder round u×v; a straight stroke. */
export const ARC_MODE = { flat: 0, band: 1, stroke: 2 } as const;

/** Glyph cells in the atlas (4 × 2). */
export const SOUND_GLYPH = { bang2: 0, bang: 1, note: 2, notes: 3, burst: 4, swirl: 5, dots: 6, splat: 7 } as const;

export interface ArcSpec {
  /** Centre of the circle (for a stroke: its start). */
  c: THREE.Vector3;
  /** Unit axis at angle 0 (for a stroke: its direction). */
  u: THREE.Vector3;
  /** Unit axis at angle π/2. Ignored by strokes. */
  v: THREE.Vector3;
  /** Radius (for a stroke: its length). */
  r: number;
  /** Half width of the brush (for a band: half its height). */
  w: number;
  a0?: number;
  a1?: number;
  color: THREE.Color;
  alpha?: number;
  mode?: number;
  /** Seed of the wobble and the brush grain. */
  seed?: number;
  /** Wobble, as a fraction of the radius. */
  wob?: number;
}

/** A self-animating arc: radius r0 → r1 over dur (ease out), it fades in fast and out slowly. */
export interface ArcSpawn extends Omit<ArcSpec, 'r'> {
  r0: number;
  r1: number;
  dur: number;
  delay?: number;
  /** For strokes: the start point travels with this velocity (m/s). */
  vel?: THREE.Vector3;
  /** Brush width at the end (default: w × 0.5). */
  w1?: number;
}

export interface GlyphSpawn {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  glyph: number;
  size: number;
  color: THREE.Color;
  dur: number;
  delay?: number;
  spin?: number;
}

interface LiveArc extends ArcSpawn {
  t: number;
}
interface LiveGlyph extends GlyphSpawn {
  t: number;
  p: THREE.Vector3;
  rot: number;
}

const ARC_STRIDE = 20; // c r | u w | v a0 | col a1 | alpha mode seed wob
const GLYPH_STRIDE = 12; // pos size | col alpha | glyph rot pad pad
const SEGS = 40;
const INK = '#1a1420';

// ───────────── the glyph atlas: marker strokes on a transparent sheet (R = paint, G = ink rim) ─────────────
function glyphAtlas(): THREE.CanvasTexture {
  const C = 128;
  const cv = document.createElement('canvas');
  cv.width = C * 4;
  cv.height = C * 2;
  const g = cv.getContext('2d')!;
  // two passes per cell: a fat ink outline (green), then the paint stroke (red) on top
  const cells: ((g: CanvasRenderingContext2D) => void)[] = [
    (g) => {
      for (const x of [-22, 22]) {
        g.beginPath(); g.moveTo(x - 4, -44); g.lineTo(x + 4, 14); g.stroke();
        g.beginPath(); g.arc(x + 5, 38, 2, 0, Math.PI * 2); g.stroke();
      }
    },
    (g) => {
      g.beginPath(); g.moveTo(-6, -46); g.lineTo(4, 16); g.stroke();
      g.beginPath(); g.arc(6, 40, 2, 0, Math.PI * 2); g.stroke();
    },
    (g) => {
      g.beginPath(); g.ellipse(-12, 30, 16, 11, -0.4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(3, 26); g.lineTo(5, -44); g.quadraticCurveTo(26, -30, 30, -10); g.stroke();
    },
    (g) => {
      g.beginPath(); g.ellipse(-28, 32, 13, 9, -0.4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(20, 22, 13, 9, -0.4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-16, 28); g.lineTo(-14, -36); g.lineTo(32, -46); g.lineTo(32, 18); g.stroke();
    },
    (g) => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        const r0 = 18 + (i % 2) * 8, r1 = 44 + (i % 3) * 6;
        g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
      }
    },
    (g) => {
      g.beginPath();
      for (let k = 0; k <= 60; k++) {
        const a = k * 0.32, r = 4 + k * 0.7;
        const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.85;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    },
    (g) => {
      for (const [x, y, r] of [[-26, 10, 9], [0, -14, 12], [26, 12, 8], [-6, 30, 6], [24, -30, 5]]) {
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    },
    (g) => {
      g.beginPath();
      for (let k = 0; k <= 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        const r = k % 2 ? 22 + ((k * 7) % 5) * 3 : 44 + ((k * 5) % 7) * 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
      g.stroke();
    },
  ];
  cells.forEach((draw, i) => {
    g.save();
    g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
    g.rotate(-0.12);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle = '#00ff00';
    g.lineWidth = 19;
    draw(g);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = g.fillStyle = '#ff0000';
    g.lineWidth = 9;
    draw(g);
    g.restore();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ───────────── shaders ─────────────
const ARC_VS = /* glsl */ `
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD; attribute vec4 iE;
  uniform float boil;
  varying vec2 vUv; varying vec3 vCol; varying float vAlpha; varying float vSeed; varying float vLen;
  void main() {
    vec3 c = iA.xyz; float r = iA.w; vec3 u = iB.xyz; float w = iB.w; vec3 v = iC.xyz;
    float a0 = iC.w; float a1 = iD.w; float mode = iE.y; float seed = iE.z; float wob = iE.w;
    float px = position.x; float py = position.y;
    // hand-drawn boil: the wobble re-rolls a few times a second, like a flip-book
    float s = seed * 17.0 + boil * 3.7;
    vec3 p; float facing = 1.0;
    vec3 eye = cameraPosition;
    if (mode < 1.5) {
      float ang = mix(a0, a1, px);
      float rr = r * (1.0 + wob * (0.55 * sin(ang * 5.0 + s) + 0.3 * sin(ang * 11.0 - s * 1.3) + 0.15 * sin(ang * 23.0 + s * 2.1)));
      vec3 d = u * cos(ang) + v * sin(ang);
      vec3 n = normalize(cross(u, v));
      // open arcs taper to a point at both ends, like a brush lifted off the page
      float open = step(abs(a1 - a0), 6.27);
      float taper = mix(1.0, pow(max(0.0, sin(3.14159 * px)), 0.45), open);
      float ww = w * taper * (0.8 + 0.2 * sin(ang * 7.0 + s * 0.7));
      if (mode < 0.5) {
        p = c + d * (rr + py * ww);
        // a flat ring seen edge-on is a line: fade it out as it turns away
        facing = smoothstep(0.08, 0.35, abs(dot(n, normalize(eye - (c + d * rr)))));
      } else {
        p = c + d * rr + n * (py * ww);
      }
      vLen = rr * abs(a1 - a0) / max(w, 1e-3);
    } else {
      // a straight stroke along u, turned to face the camera
      vec3 mid = c + u * (r * 0.5);
      vec3 side = normalize(cross(u, normalize(eye - mid)) + vec3(1e-4));
      float taper = pow(max(0.0, sin(3.14159 * px)), 0.6);
      p = c + u * (px * r) + side * (py * w * taper);
      vLen = r / max(w, 1e-3);
    }
    vUv = vec2(px, py);
    vCol = iD.xyz;
    vAlpha = iE.x * facing;
    vSeed = seed;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const ARC_FS = /* glsl */ `
  varying vec2 vUv; varying vec3 vCol; varying float vAlpha; varying float vSeed; varying float vLen;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float y = abs(vUv.y);
    // marker grain: streaks along the stroke, a dry ragged edge
    float along = vUv.x * vLen;
    float streak = h(vec2(floor(vUv.y * 7.0 + 7.0), vSeed));
    float edge = 0.86 + 0.12 * h(vec2(floor(along * 2.0), vSeed + 3.0));
    float a = smoothstep(edge, edge - 0.14, y);
    a *= 0.78 + 0.22 * streak;
    // the ink rim: a dark outline on both edges so it reads on bright walls and dark water alike
    // dark paint (red-pen red) gets a paper-white rim, light paint a dark ink rim: both read on any ground
    float lum = dot(vCol, vec3(0.299, 0.587, 0.114));
    vec3 ink = lum < 0.42 ? vec3(1.0, 0.95, 0.88) : vec3(0.10, 0.08, 0.13);
    float rim = smoothstep(0.42, 0.66, y);
    vec3 col = mix(vCol, ink, rim * 0.85);
    // a lighter wet core
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.22, y)) * 0.18);
    a *= vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

const GLYPH_VS = /* glsl */ `
  attribute vec4 gA; attribute vec4 gB; attribute vec4 gC;
  varying vec2 vUv; varying vec3 vCol; varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(gA.xyz, 1.0);
    float rot = gC.y; float cs = cos(rot), sn = sin(rot);
    vec2 q = position.xy;
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs) * gA.w;
    mv.xy += q;
    float cell = gC.x;
    vec2 base = vec2(mod(cell, 4.0), 1.0 - floor(cell / 4.0)) * vec2(0.25, 0.5);
    vUv = base + (position.xy * 0.5 + 0.5) * vec2(0.25, 0.5);
    vCol = gB.xyz;
    vAlpha = gB.w;
    gl_Position = projectionMatrix * mv;
  }`;

const GLYPH_FS = /* glsl */ `
  uniform sampler2D atlas;
  varying vec2 vUv; varying vec3 vCol; varying float vAlpha;
  void main() {
    vec4 t = texture2D(atlas, vUv);
    float a = max(t.r, t.g) * vAlpha;
    if (a < 0.03) discard;
    vec3 col = mix(vec3(0.10, 0.08, 0.13), vCol, smoothstep(0.3, 0.7, t.r));
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

/** Ease out (cubic). */
const out3 = (k: number) => 1 - Math.pow(1 - k, 3);

export class SoundFx {
  readonly group = new THREE.Group();
  private arcData: Float32Array;
  private arcBuf: THREE.InstancedInterleavedBuffer;
  private arcGeo: THREE.InstancedBufferGeometry;
  private glyphData: Float32Array;
  private glyphBuf: THREE.InstancedInterleavedBuffer;
  private glyphGeo: THREE.InstancedBufferGeometry;
  private nArc = 0;
  private nGlyph = 0;
  private live: LiveArc[] = [];
  private liveG: LiveGlyph[] = [];
  private uBoil = { value: 0 };
  private time = 0;
  /** Game frames stepped / the frame the buffers were last uploaded for (render passes share one upload). */
  private tick = 0;
  private uploaded = -1;
  private tmp = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(
    readonly arcCap = 640,
    readonly glyphCap = 96,
  ) {
    this.group.name = 'sound-fx';
    this.group.userData.noPaint = true;
    // arcs: a strip of SEGS quads, bent on the GPU
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEGS; i++) pos.push(i / SEGS, -1, 0, i / SEGS, 1, 0);
    for (let i = 0; i < SEGS; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.arcGeo = new THREE.InstancedBufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.arcGeo.setIndex(idx);
    this.arcData = new Float32Array(arcCap * ARC_STRIDE);
    this.arcBuf = new THREE.InstancedInterleavedBuffer(this.arcData, ARC_STRIDE).setUsage(THREE.DynamicDrawUsage);
    ['iA', 'iB', 'iC', 'iD', 'iE'].forEach((n, i) => this.arcGeo.setAttribute(n, new THREE.InterleavedBufferAttribute(this.arcBuf, 4, i * 4)));
    this.arcGeo.instanceCount = 0;
    const arcs = new THREE.Mesh(
      this.arcGeo,
      new THREE.ShaderMaterial({ uniforms: { boil: this.uBoil }, vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    // glyphs: one camera-facing quad each, cut from the atlas
    this.glyphGeo = new THREE.InstancedBufferGeometry();
    this.glyphGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.glyphGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.glyphData = new Float32Array(glyphCap * GLYPH_STRIDE);
    this.glyphBuf = new THREE.InstancedInterleavedBuffer(this.glyphData, GLYPH_STRIDE).setUsage(THREE.DynamicDrawUsage);
    ['gA', 'gB', 'gC'].forEach((n, i) => this.glyphGeo.setAttribute(n, new THREE.InterleavedBufferAttribute(this.glyphBuf, 4, i * 4)));
    this.glyphGeo.instanceCount = 0;
    const glyphs = new THREE.Mesh(
      this.glyphGeo,
      new THREE.ShaderMaterial({ uniforms: { atlas: { value: glyphAtlas() } }, vertexShader: GLYPH_VS, fragmentShader: GLYPH_FS, transparent: true, depthWrite: false }),
    );
    for (const m of [arcs, glyphs]) {
      m.frustumCulled = false;
      m.renderOrder = 9;
      m.userData.noPaint = true;
      m.raycast = () => {};
      this.group.add(m);
    }
    // the self-animating items are written right before the first render of each frame, after the
    // gameplay code has drawn its exact shapes (whatever order the session updates things in)
    arcs.onBeforeRender = glyphs.onBeforeRender = () => this.upload();
  }

  // ───────────── immediate: draw this shape this frame ─────────────
  arc(s: ArcSpec): void {
    if (this.nArc >= this.arcCap) return;
    const d = this.arcData;
    let o = this.nArc++ * ARC_STRIDE;
    d[o++] = s.c.x; d[o++] = s.c.y; d[o++] = s.c.z; d[o++] = s.r;
    d[o++] = s.u.x; d[o++] = s.u.y; d[o++] = s.u.z; d[o++] = s.w;
    d[o++] = s.v.x; d[o++] = s.v.y; d[o++] = s.v.z; d[o++] = s.a0 ?? 0;
    d[o++] = s.color.r; d[o++] = s.color.g; d[o++] = s.color.b; d[o++] = s.a1 ?? Math.PI * 2;
    d[o++] = s.alpha ?? 1; d[o++] = s.mode ?? ARC_MODE.flat; d[o++] = s.seed ?? 0; d[o] = s.wob ?? 0.04;
  }

  glyph(pos: THREE.Vector3, glyph: number, size: number, color: THREE.Color, alpha = 1, rot = 0): void {
    if (this.nGlyph >= this.glyphCap) return;
    const d = this.glyphData;
    let o = this.nGlyph++ * GLYPH_STRIDE;
    d[o++] = pos.x; d[o++] = pos.y; d[o++] = pos.z; d[o++] = size;
    d[o++] = color.r; d[o++] = color.g; d[o++] = color.b; d[o++] = alpha;
    d[o++] = glyph; d[o] = rot;
  }

  // ───────────── spawned: animates itself ─────────────
  spawnArc(s: ArcSpawn): void {
    if (this.live.length > this.arcCap / 2) this.live.shift();
    this.live.push({ ...s, c: s.c.clone(), u: s.u.clone(), v: s.v.clone(), color: s.color.clone(), vel: s.vel?.clone(), t: -(s.delay ?? 0) });
  }

  spawnGlyph(s: GlyphSpawn): void {
    if (this.liveG.length > this.glyphCap / 2) this.liveG.shift();
    this.liveG.push({ ...s, color: s.color.clone(), vel: s.vel?.clone(), t: -(s.delay ?? 0), p: s.pos.clone(), rot: (Math.random() - 0.5) * 0.4 });
  }

  /** A full-screen ring pulse (BIG SHOUT): concentric marker rings flash out from the centre. */
  pulse(color: string, strength = 1): void {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:40;mix-blend-mode:screen;' +
      `background:repeating-radial-gradient(circle at 50% 55%, transparent 0 34px, ${color} 36px 41px, transparent 43px 78px);` +
      'mask-image:radial-gradient(circle at 50% 55%, transparent 18%, #000 45%, transparent 78%);' +
      '-webkit-mask-image:radial-gradient(circle at 50% 55%, transparent 18%, #000 45%, transparent 78%);';
    document.body.appendChild(el);
    const a = el.animate(
      [
        { opacity: 0.0, transform: 'scale(0.55)' },
        { opacity: 0.55 * strength, transform: 'scale(0.8)', offset: 0.18 },
        { opacity: 0, transform: 'scale(1.35)' },
      ],
      { duration: 520, easing: 'ease-out' },
    );
    a.onfinish = () => el.remove();
  }

  update(dt: number): void {
    this.time += dt;
    this.tick++;
    this.uBoil.value = Math.floor(this.time * 7);
    for (const a of this.live) a.t += dt;
    for (const g of this.liveG) {
      g.t += dt;
      if (g.t > 0 && g.vel) {
        g.p.addScaledVector(g.vel, dt);
        g.vel.multiplyScalar(Math.exp(-3 * dt));
      }
      g.rot += (g.spin ?? 0) * dt;
    }
    this.live = this.live.filter((a) => a.t < a.dur);
    this.liveG = this.liveG.filter((g) => g.t < g.dur);
  }

  private upload(): void {
    if (this.tick === this.uploaded) return;
    this.uploaded = this.tick;
    for (const a of this.live) {
      if (a.t < 0) continue;
      const k = a.t / a.dur;
      const e = out3(k);
      const fade = Math.min(1, k * 8) * (1 - k * k);
      if (a.vel) this.tmp.copy(a.c).addScaledVector(a.vel, a.t);
      else this.tmp.copy(a.c);
      this.arc({
        ...a,
        c: this.tmp,
        r: a.r0 + (a.r1 - a.r0) * e,
        w: a.w + ((a.w1 ?? a.w * 0.5) - a.w) * e,
        alpha: (a.alpha ?? 1) * fade,
      });
    }
    for (const g of this.liveG) {
      if (g.t < 0) continue;
      const k = g.t / g.dur;
      // stamp in with an overshoot, hold, shrink away
      const pop = k < 0.15 ? (k / 0.15) * 1.3 : k < 0.28 ? 1.3 - ((k - 0.15) / 0.13) * 0.3 : 1 - Math.max(0, (k - 0.7) / 0.3) * 0.5;
      this.glyph(g.p, g.glyph, g.size * pop, g.color, k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1, g.rot);
    }
    this.arcGeo.instanceCount = this.nArc;
    this.glyphGeo.instanceCount = this.nGlyph;
    if (this.nArc) {
      this.arcBuf.clearUpdateRanges();
      this.arcBuf.addUpdateRange(0, this.nArc * ARC_STRIDE);
      this.arcBuf.needsUpdate = true;
    }
    if (this.nGlyph) {
      this.glyphBuf.clearUpdateRanges();
      this.glyphBuf.addUpdateRange(0, this.nGlyph * GLYPH_STRIDE);
      this.glyphBuf.needsUpdate = true;
    }
    // the next frame's immediate shapes start from zero
    this.nArc = 0;
    this.nGlyph = 0;
  }

  /** A colour from CSS, reused (no allocation per call). */
  c(css: string): THREE.Color {
    return this.col.set(css);
  }

  clear(): void {
    this.live = [];
    this.liveG = [];
    this.nArc = this.nGlyph = 0;
    this.arcGeo.instanceCount = this.glyphGeo.instanceCount = 0;
  }
}

export { INK as SOUND_INK };
