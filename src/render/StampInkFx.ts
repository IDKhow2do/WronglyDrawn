/**
 * [INPUT]: depends on three (InstancedBufferGeometry, InstancedInterleavedBuffer, ShaderMaterial, CanvasTexture)
 * [OUTPUT]: exports StampInkFx (one pooled, instanced quad batch for everything a stamp slam leaves) and StampLook
 * [POS]: render-side of the TAG / ENCORE stamp. combat/StampFx owns one, calls print() on contact and watch() with the
 *        view camera and a level-geometry ray test (prints behind walls hide).
 *        It draws the printed tag mark (WAI's crown seal in wet ink, stuck to the creature), the ink droplets,
 *        the ink splat ring, the dust puff and the gold flash. One draw call, no per-frame allocation,
 *        the same pattern as SprayFx and SoundFx.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';

/** What a print looks like. `gold` = the Golden Stamp; `perfect` / `frenzy` make the contact bigger and flash gold. */
export interface StampLook {
  gold?: boolean;
  perfect?: boolean;
  frenzy?: boolean;
}

// ───────────────────────── layout ─────────────────────────
// centre(3) u(3) v(3) colour(3) alpha shape seed wet
const STRIDE = 16;
const SHAPE = { mark: 0, drop: 1, dust: 2, flash: 3, ring: 4 } as const;
const MAX_MARKS = 6;

/** Ink colours: WAI's pink (a plain TAG) and the Golden Stamp's gold. Rims are the pooled, darker ink. */
const INK = { pink: new THREE.Color('#e8237a'), gold: new THREE.Color('#ffc21a'), dust: new THREE.Color('#f4ead2'), flash: new THREE.Color('#fff2a8') };

/** How long a printed mark stays wet, holds, and fades (seconds). */
const MARK = { wet: 0.9, hold: 2.6, fade: 1.2 };

interface Mark {
  anchor: THREE.Object3D;
  /** centre and the two half-axes, in the anchor's local space (the print rides on the creature) */
  local: THREE.Vector3;
  lu: THREE.Vector3;
  lv: THREE.Vector3;
  col: THREE.Color;
  seed: number;
  t: number;
  /** 1 = the camera sees it, 0 = a wall stands between (checked a few times a second, eased) */
  seen: number;
  vis: number;
}

interface Bit {
  shape: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** planar shapes: the plane's two unit axes */
  ax: THREE.Vector3;
  ay: THREE.Vector3;
  size: number;
  grow: number;
  col: THREE.Color;
  seed: number;
  t: number;
  max: number;
  gravity: number;
}

/** The printed seal: a wobbly double ring, WAI's crown, "WAI", a few flecks. White on clear; the shader inks it. */
function sealCanvas(): HTMLCanvasElement {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.strokeStyle = g.fillStyle = '#fff';
  g.lineJoin = g.lineCap = 'round';
  // a hand-cut rubber: rings are never quite round
  const ring = (r: number, w: number, wob: number, ph: number) => {
    g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const rr = r + Math.sin(a * 3 + ph) * wob + Math.sin(a * 7 + ph * 2) * wob * 0.5;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.stroke();
  };
  ring(104, 13, 2.4, 0.3);
  ring(86, 5, 1.6, 1.7);
  // the crown: three points with balls, a fat band
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(-46, -6);
  g.lineTo(-52, -52);
  g.lineTo(-24, -26);
  g.lineTo(0, -62);
  g.lineTo(24, -26);
  g.lineTo(50, -50);
  g.lineTo(44, -6);
  g.closePath();
  g.fill();
  g.stroke();
  for (const [x, y] of [[-52, -54], [0, -66], [50, -52]]) {
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fill();
  }
  // "WAI" under the crown, chunky and a little tilted
  g.save();
  g.rotate(-0.06);
  g.font = '900 54px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('WAI', 0, 38);
  g.restore();
  // flecks where the rubber was over-inked
  const fleck = [[118, -40, 5], [-121, 30, 4], [96, 82, 3.5], [-70, -104, 3], [12, 120, 4.5], [124, 14, 2.5]];
  for (const [x, y, r] of fleck) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return cv;
}

export class StampInkFx {
  readonly mesh: THREE.Mesh;
  private data: Float32Array;
  private buf: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private marks: Mark[] = [];
  private bits: Bit[] = [];
  private free: Bit[] = [];
  private tex: THREE.CanvasTexture;
  private v = new THREE.Vector3();
  private u = new THREE.Vector3();
  private w = new THREE.Vector3();
  private n = new THREE.Vector3();
  private eye: THREE.Camera | null = null;
  private blocked: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;
  private checkT = 0;
  private eyeAt = new THREE.Vector3();

  /**
   * The batch draws without a depth test; `blocked(eye, print)` (level geometry only) hides a print behind a wall.
   * Checked every 0.15 s per print, not per frame.
   */
  watch(eye: THREE.Camera, blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean): void {
    this.eye = eye;
    this.blocked = blocked;
  }

  constructor(private capacity = 192) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(capacity * STRIDE);
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('ictr', new THREE.InterleavedBufferAttribute(this.buf, 3, 0));
    geo.setAttribute('iu', new THREE.InterleavedBufferAttribute(this.buf, 3, 3));
    geo.setAttribute('iv', new THREE.InterleavedBufferAttribute(this.buf, 3, 6));
    geo.setAttribute('icol', new THREE.InterleavedBufferAttribute(this.buf, 3, 9));
    geo.setAttribute('look', new THREE.InterleavedBufferAttribute(this.buf, 4, 12));
    geo.instanceCount = 0;
    this.geo = geo;
    this.tex = new THREE.CanvasTexture(sealCanvas());
    this.tex.anisotropy = 4;
    // No depth test: a flat print on a round creature whose shaders push its surface out (paint relief, squash)
    // was swallowed at any sane depth bias. The batch draws over the scene instead; a print turned away from the eye
    // fades out (so it never shows through the creature's own body), and every piece lives under 3 s.
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      uniforms: { seal: { value: this.tex } },
      vertexShader: /* glsl */ `
        attribute vec3 ictr; attribute vec3 iu; attribute vec3 iv; attribute vec3 icol; attribute vec4 look;
        varying vec2 vUv; varying vec3 vCol; varying vec4 vLook; varying float vFace;
        void main() {
          vUv = position.xy; vCol = icol; vLook = look; vFace = 1.0;
          float shape = look.y;
          vec4 mv;
          if (shape > 1.5 && shape < 3.5) {
            // dust and flash face the camera; |iu| is the radius, the seed turns them
            float r = length(iu); float a = look.z * 6.2832;
            vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy * r;
            mv = modelViewMatrix * vec4(ictr, 1.0); mv.xy += p;
          } else {
            vec3 w = ictr + iu * position.x + iv * position.y;
            mv = modelViewMatrix * vec4(w, 1.0);
            // the print's outward side is iu × iv: turned away from the eye = on the far side of the body
            if (shape < 0.5) {
              vec3 wp = (modelMatrix * vec4(w, 1.0)).xyz;
              vFace = smoothstep(0.05, 0.3, dot(normalize(cross(iu, iv)), normalize(cameraPosition - wp)));
            }
          }
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D seal;
        varying vec2 vUv; varying vec3 vCol; varying vec4 vLook; varying float vFace;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float alpha = vLook.x; float shape = vLook.y; float seed = vLook.z; float wet = vLook.w;
          float r = length(vUv); float ang = atan(vUv.y, vUv.x);
          vec3 col = vCol; float a = 0.0;
          if (shape < 0.5) {
            // the print: ink where the rubber was, thin where it starved, a dark pooled rim on every stroke edge
            vec2 uv = vUv * 0.5 + 0.5;
            float ink = texture2D(seal, uv).a;
            float d = 0.012;
            float near = min(min(texture2D(seal, uv + vec2(d, 0.0)).a, texture2D(seal, uv - vec2(d, 0.0)).a),
                             min(texture2D(seal, uv + vec2(0.0, d)).a, texture2D(seal, uv - vec2(0.0, d)).a));
            float rim = clamp(ink - near, 0.0, 1.0);
            float starve = smoothstep(0.25, 0.7, vn(uv * 7.0 + seed * 31.0) * 0.65 + vn(uv * 30.0 + seed * 7.0) * 0.5);
            a = ink * mix(0.12, 1.0, starve);
            col = mix(col, col * 0.42, max(rim * 1.6, (1.0 - starve) * 0.25));
            // wet: a glossy streak that dries off
            col += wet * 0.45 * smoothstep(0.75, 1.0, vn(uv * 5.0 + vec2(seed * 3.0, 0.0))) * ink;
          } else if (shape < 1.5) {
            // ink droplet: a ragged blob
            float edge = 0.78 + 0.18 * sin(ang * 5.0 + seed * 20.0) + 0.08 * sin(ang * 11.0 + seed * 9.0);
            a = 1.0 - smoothstep(edge - 0.08, edge, r);
            col = mix(col * 0.45, col, smoothstep(edge - 0.06, edge - 0.3, r));
          } else if (shape < 2.5) {
            // dust: a soft cloud with a scalloped edge
            float edge = 0.72 + 0.14 * sin(ang * 6.0 + seed * 13.0);
            a = (1.0 - smoothstep(edge - 0.3, edge, r)) * (0.55 + 0.45 * vn(vUv * 3.0 + seed * 5.0));
          } else if (shape < 3.5) {
            // gold flash: an eight-point star
            float star = 0.28 + 0.72 * pow(abs(cos(ang * 4.0)), 6.0);
            a = 1.0 - smoothstep(star * 0.85, star, r);
            col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, 0.35, r));
          } else {
            // the splat ring: a ragged ink band
            float wob = 0.06 * sin(ang * 9.0 + seed * 17.0) + 0.04 * sin(ang * 23.0 + seed * 3.0);
            a = smoothstep(0.62 + wob, 0.72 + wob, r) * (1.0 - smoothstep(0.86 + wob, 0.98, r));
          }
          a *= alpha * vFace;
          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.noPaint = true;
    this.mesh.name = 'stamp-ink';
  }

  // ───────────────────────── spawning ─────────────────────────

  private bit(shape: number, pos: THREE.Vector3, size: number, col: THREE.Color, max: number): Bit | null {
    if (this.bits.length + this.marks.length >= this.capacity) return null;
    const b = this.free.pop() ?? { shape: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), ax: new THREE.Vector3(), ay: new THREE.Vector3(), size: 0, grow: 0, col: new THREE.Color(), seed: 0, t: 0, max: 1, gravity: 0 };
    b.shape = shape;
    b.pos.copy(pos);
    b.vel.set(0, 0, 0);
    b.size = size;
    b.grow = 0;
    b.col.copy(col);
    b.seed = Math.random();
    b.t = 0;
    b.max = max;
    b.gravity = 0;
    this.bits.push(b);
    return b;
  }

  /**
   * The die hits: print the seal on `anchor` (centre `at`, surface normal `normal`, die half-width `half`, die
   * yaw `yaw`; the seal itself is `markHalf`, no wider than the body it lands on), throw ink droplets, roll out the splat ring and a dust puff; PERFECT / FRENZY add a gold flash.
   */
  print(anchor: THREE.Object3D | null, at: THREE.Vector3, normal: THREE.Vector3, half: number, yaw: number, look: StampLook, markHalf = half): void {
    const big = look.perfect || look.frenzy;
    const ink = look.gold ? INK.gold : INK.pink;
    // the plane of the die face: n up out of the surface, u/v along the die's edges (turned with the stamp)
    const n = this.n.copy(normal).normalize();
    const u = this.u.set(Math.cos(yaw), 0, -Math.sin(yaw));
    u.addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0).addScaledVector(n, -n.x);
    u.normalize();
    const v = this.v.crossVectors(n, u).normalize();
    // a rubber stamp never prints square: a few degrees off
    const tilt = (Math.random() - 0.5) * 0.35;
    const cu = Math.cos(tilt);
    const su = Math.sin(tilt);
    const pu = this.w.copy(u).multiplyScalar(cu).addScaledVector(v, su);
    const pv = v.clone().multiplyScalar(cu).addScaledVector(u, -su);
    // 1 · the seal, stuck to the creature (or the world)
    if (this.marks.length >= MAX_MARKS) this.marks.shift();
    const a = anchor ?? null;
    const m: Mark = {
      anchor: a ?? this.mesh,
      local: at.clone().addScaledVector(n, 0.02 + markHalf * 0.02),
      lu: pu.clone().multiplyScalar(markHalf),
      lv: pv.clone().multiplyScalar(markHalf),
      col: ink.clone(),
      seed: Math.random(),
      t: 0,
      seen: 1,
      vis: 1,
    };
    if (a) {
      a.updateWorldMatrix(true, false);
      const inv = a.matrixWorld.clone().invert();
      const end = m.local.clone().add(m.lu).applyMatrix4(inv);
      const endV = m.local.clone().add(m.lv).applyMatrix4(inv);
      m.local.applyMatrix4(inv);
      m.lu.copy(end).sub(m.local);
      m.lv.copy(endV).sub(m.local);
    }
    this.marks.push(m);
    // 2 · droplets squirted out from under the die's edge, in the die plane, then falling
    const drops = big ? 22 : 14;
    for (let i = 0; i < drops; i++) {
      const ang = (i / drops) * Math.PI * 2 + Math.random() * 0.4;
      const dir = this.w.copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
      const p = at.clone().addScaledVector(dir, half * 0.95).addScaledVector(n, 0.05);
      const b = this.bit(SHAPE.drop, p, half * (0.05 + Math.random() * 0.07) * (big ? 1.3 : 1), i % 5 === 0 ? INK.dust : ink, 0.45 + Math.random() * 0.25);
      if (!b) break;
      b.vel.copy(dir).multiplyScalar((3 + Math.random() * 4) * Math.sqrt(half)).addScaledVector(n, 1 + Math.random() * 2.5);
      b.gravity = 14;
      // droplets are flat blobs in the die plane, stretched along their flight later
      b.ax.copy(dir);
      b.ay.crossVectors(n, dir);
    }
    // 3 · the splat ring, rolling out in the die plane
    const ring = this.bit(SHAPE.ring, at.clone().addScaledVector(n, 0.03), half * 1.1, ink, big ? 0.42 : 0.32);
    if (ring) {
      ring.ax.copy(u);
      ring.ay.copy(v);
      ring.grow = half * (big ? 4.2 : 2.6);
    }
    // 4 · dust puffs pushed out sideways from under the die
    const puffs = big ? 7 : 5;
    for (let i = 0; i < puffs; i++) {
      const ang = (i / puffs) * Math.PI * 2 + Math.random();
      const dir = this.w.copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
      const b = this.bit(SHAPE.dust, at.clone().addScaledVector(dir, half * 0.9), half * 0.25, INK.dust, 0.5 + Math.random() * 0.2);
      if (!b) break;
      b.vel.copy(dir).multiplyScalar(2.2 * Math.sqrt(half)).addScaledVector(n, 0.8);
      b.grow = half * 0.45;
      b.gravity = -0.6;
    }
    // 5 · PERFECT / FRENZY: a gold star flash over the contact, then a second, wider gold ring
    if (big) {
      const f = this.bit(SHAPE.flash, at.clone().addScaledVector(n, half * 0.4), half * 1.2, INK.flash, 0.2);
      if (f) f.grow = half * 2.6;
      const r2 = this.bit(SHAPE.ring, at.clone().addScaledVector(n, 0.05), half * 0.8, INK.gold, 0.55);
      if (r2) {
        r2.ax.copy(u);
        r2.ay.copy(v);
        r2.grow = half * 3.4;
      }
    }
  }

  /** A slipped stamp only scuffs: a few dull droplets and dust, no print. */
  scuff(at: THREE.Vector3, half: number): void {
    for (let i = 0; i < 4; i++) {
      const b = this.bit(SHAPE.dust, at.clone().add(this.w.set((Math.random() - 0.5) * half, 0, (Math.random() - 0.5) * half)), half * 0.3, INK.dust, 0.45);
      if (!b) break;
      b.vel.set((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2);
      b.grow = half * 0.6;
    }
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number): void {
    const d = this.data;
    let k = 0;
    const put = (c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, col: THREE.Color, alpha: number, shape: number, seed: number, wet: number) => {
      const o = k * STRIDE;
      d[o] = c.x; d[o + 1] = c.y; d[o + 2] = c.z;
      d[o + 3] = u.x; d[o + 4] = u.y; d[o + 5] = u.z;
      d[o + 6] = v.x; d[o + 7] = v.y; d[o + 8] = v.z;
      d[o + 9] = col.r; d[o + 10] = col.g; d[o + 11] = col.b;
      d[o + 12] = alpha; d[o + 13] = shape; d[o + 14] = seed; d[o + 15] = wet;
      k++;
    };
    // marks first (bits draw over them)
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t += dt;
      const end = MARK.hold + MARK.fade;
      if (m.t >= end || !m.anchor.parent) {
        this.marks.splice(i, 1);
        continue;
      }
    }
    this.checkT -= dt;
    const check = this.checkT <= 0 && !!this.eye && !!this.blocked;
    if (check) {
      this.checkT = 0.15;
      this.eye!.getWorldPosition(this.eyeAt);
    }
    for (const m of this.marks) {
      const mw = m.anchor === this.mesh ? null : m.anchor.matrixWorld;
      const c = this.v.copy(m.local);
      const u = this.u.copy(m.lu);
      const v = this.w.copy(m.lv);
      if (mw) {
        c.applyMatrix4(mw);
        u.add(m.local).applyMatrix4(mw).sub(c);
        v.add(m.local).applyMatrix4(mw).sub(c);
      }
      // slap-in: the print blooms a touch bigger than the die in the first frames (the ink squeezes out)
      const bloom = 1 + 0.12 * Math.exp(-m.t * 18);
      u.multiplyScalar(bloom);
      v.multiplyScalar(bloom);
      if (check) m.seen = this.blocked!(this.eyeAt, c) ? 0 : 1;
      m.vis += (m.seen - m.vis) * Math.min(1, dt * 12);
      const fade = m.t < MARK.hold ? 1 : 1 - (m.t - MARK.hold) / MARK.fade;
      const wet = Math.max(0, 1 - m.t / MARK.wet);
      put(c, u, v, m.col, Math.min(1, m.t * 30) * fade * m.vis, SHAPE.mark, m.seed, wet);
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      if (b.t >= b.max) {
        this.bits.splice(i, 1);
        this.free.push(b);
        continue;
      }
      b.vel.y -= b.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (b.shape === SHAPE.dust) b.vel.multiplyScalar(Math.exp(-4 * dt));
    }
    for (const b of this.bits) {
      const t = b.t / b.max;
      if (b.shape === SHAPE.drop) {
        // stretched along its flight, shrinking as it goes
        const sp = b.vel.length();
        const s = b.size * (1 - t * 0.6);
        this.u.copy(b.vel).normalize().multiplyScalar(s * (1 + Math.min(2.2, sp * 0.18)));
        this.n.copy(this.u).normalize();
        this.w.copy(b.ay).addScaledVector(this.n, -b.ay.dot(this.n)).normalize().multiplyScalar(s);
        put(b.pos, this.u, this.w, b.col, 1, SHAPE.drop, b.seed, 0);
      } else if (b.shape === SHAPE.ring) {
        const e = 1 - (1 - t) * (1 - t);
        const s = b.size + b.grow * e;
        this.u.copy(b.ax).multiplyScalar(s);
        this.w.copy(b.ay).multiplyScalar(s);
        put(b.pos, this.u, this.w, b.col, 1 - t * t, SHAPE.ring, b.seed, 0);
      } else {
        // dust / flash: billboards; |u| = radius
        const s = b.size + b.grow * (1 - (1 - t) * (1 - t));
        this.u.set(s, 0, 0);
        const alpha = b.shape === SHAPE.flash ? 1 - t : (1 - t) * 0.55;
        put(b.pos, this.u, this.u, b.col, alpha, b.shape, b.seed, 0);
      }
    }
    this.geo.instanceCount = k;
    this.mesh.visible = k > 0;
    if (k > 0) this.buf.addUpdateRange(0, k * STRIDE);
    this.buf.needsUpdate = k > 0;
  }

  clear(): void {
    this.marks.length = 0;
    this.free.push(...this.bits);
    this.bits.length = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}
