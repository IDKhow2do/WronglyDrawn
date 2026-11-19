/**
 * [INPUT]: depends on GameContext (root, effects, audio, camera shake); HitFn from ./RedPenHazards (the boss's light/heavy rule);
 *          PlayerController (pos)
 * [OUTPUT]: exports PenMarks (volley(), update(), cancel(), inMark(), dangerAt(), safeSpot(), eta(), pending(), clear(), dispose()) and the Mark type
 * [POS]: the Red Pen's sky attack in phase 2: correction marks sprayed onto the roof — big X crosses and long strike-through
 *        lines. Owned by PenHazards (one hazard system: clear() / dangerAt() cover it), started by RedPenSky's MARKS move,
 *        cancelled one at a time by the Hush (RedPenAllies). Each mark is ONE readable tell: an exact red outline on the
 *        roof whose fill is drawn along it like a pen stroke; when the stroke reaches the end it lands (area damage, light).
 *        A volley never closes every way out: a mark that would leave WAI fewer than three clear escape bearings is dropped.
 *        Meshes are pooled; geometry is rebuilt only when a mark is placed, never per frame.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { HitFn } from './RedPenHazards';

const RED = '#d8283a';
/** Seconds a landed mark still hurts someone who walks into it, then seconds it takes to fade. */
const LIVE = 0.3;
const FADE = 0.9;
const X_LEN = 6.6;
const X_W = 1.5;
const LINE_W = 1.8;
/** Edge of the outline (m). */
const EDGE = 0.12;

interface Bar {
  group: THREE.Group;
  outline: THREE.Mesh;
  fill: THREE.Mesh;
  c: THREE.Vector3;
  yaw: number;
  len: number;
  w: number;
}

export interface Mark {
  kind: 'x' | 'line';
  bars: Bar[];
  at: THREE.Vector3;
  t: number;
  tell: number;
  on: boolean;
  landed: boolean;
  cancelled: boolean;
}

const _a = new THREE.Vector3();

export class PenMarks {
  readonly marks: Mark[] = [];
  private bars: Bar[] = [];
  private aimLine = false;

  constructor(
    private ctx: GameContext,
    private floorY: number,
    private arena: THREE.Vector3,
    private arenaR: () => number,
    private hit: HitFn,
  ) {
    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      const outline = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
      // the fill grows from the bar's start (local z = 0 → 1)
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }));
      outline.position.y = 0.04;
      fill.position.y = 0.03;
      for (const m of [outline, fill]) {
        m.userData.noPaint = true;
        m.renderOrder = 2;
      }
      group.add(outline, fill);
      group.visible = false;
      group.userData.noPaint = true;
      ctx.root.add(group);
      this.bars.push({ group, outline, fill, c: new THREE.Vector3(), yaw: 0, len: 1, w: 1 });
    }
  }

  // ───────────── placing ─────────────
  /**
   * A volley of `n` marks round WAI, each telegraphed `tell` s (the first one lands under him; the rest stagger by
   * `stagger` s). Returns the marks placed (some are dropped to keep a way out).
   */
  volley(p: THREE.Vector3, n: number, tell: number, stagger: number): Mark[] {
    const out: Mark[] = [];
    for (let i = 0; i < n; i++) {
      const kind: Mark['kind'] = i === 0 ? (this.aimLine ? 'line' : 'x') : Math.random() < 0.6 ? 'x' : 'line';
      const at = new THREE.Vector3();
      if (i === 0) at.copy(p);
      else {
        const a = Math.random() * Math.PI * 2, r = 3.5 + Math.random() * 6;
        at.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
      }
      this.clampIn(at, kind === 'x' ? 2.5 : 3);
      at.y = this.floorY;
      const m = this.place(kind, at, Math.random() * Math.PI, tell + i * stagger);
      if (!m) break;
      // a way out: at least three clear bearings within reach of WAI, else this mark goes
      if (this.exits(p) < 3) {
        this.drop(m);
        continue;
      }
      out.push(m);
    }
    this.aimLine = !this.aimLine;
    if (out.length) this.ctx.audio.play('stampTick', { pos: p, vol: 0.8, pitch: 0.8 });
    return out;
  }

  private place(kind: Mark['kind'], at: THREE.Vector3, yaw: number, tell: number): Mark | null {
    const need = kind === 'x' ? 2 : 1;
    const free = this.bars.filter((b) => !b.group.visible);
    if (free.length < need) return null;
    const bars: Bar[] = [];
    if (kind === 'x') {
      bars.push(this.bar(free[0], at, yaw + Math.PI / 4, X_LEN, X_W));
      bars.push(this.bar(free[1], at, yaw - Math.PI / 4, X_LEN, X_W));
    } else {
      // a strike-through: the whole chord of the ring through `at`
      const R = this.arenaR() - 1;
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      const ox = at.x - this.arena.x, oz = at.z - this.arena.z;
      const bq = ox * dx + oz * dz;
      const disc = Math.max(0, bq * bq - (ox * ox + oz * oz - R * R));
      const s0 = -bq - Math.sqrt(disc), s1 = -bq + Math.sqrt(disc);
      const mid = _a.set(at.x + dx * (s0 + s1) * 0.5, this.floorY, at.z + dz * (s0 + s1) * 0.5);
      bars.push(this.bar(free[0], mid, yaw, Math.max(4, s1 - s0), LINE_W));
    }
    let m = this.marks.find((x) => !x.on);
    if (!m) {
      m = { kind, bars, at: new THREE.Vector3(), t: 0, tell, on: true, landed: false, cancelled: false };
      this.marks.push(m);
    }
    Object.assign(m, { kind, bars, t: 0, tell, on: true, landed: false, cancelled: false });
    m.at.copy(at).setY(this.floorY);
    return m;
  }

  private bar(b: Bar, c: THREE.Vector3, yaw: number, len: number, w: number): Bar {
    b.c.copy(c).setY(this.floorY);
    b.yaw = yaw;
    b.len = len;
    b.w = w;
    b.group.position.copy(b.c);
    b.group.rotation.set(0, yaw, 0);
    // an exact outline: a rectangle with a rectangular hole, lying on the roof
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -len / 2).lineTo(w / 2, -len / 2).lineTo(w / 2, len / 2).lineTo(-w / 2, len / 2).closePath();
    const h = new THREE.Path();
    const iw = w / 2 - EDGE, il = len / 2 - EDGE;
    h.moveTo(-iw, -il).lineTo(-iw, il).lineTo(iw, il).lineTo(iw, -il).closePath();
    s.holes.push(h);
    b.outline.geometry.dispose();
    b.outline.geometry = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
    b.fill.position.z = -len / 2;
    b.fill.scale.set(w - EDGE * 2, 1, 0.001);
    (b.outline.material as THREE.MeshBasicMaterial).opacity = 0;
    (b.fill.material as THREE.MeshBasicMaterial).opacity = 0;
    (b.fill.material as THREE.MeshBasicMaterial).color.set(RED);
    b.group.visible = true;
    return b;
  }

  private drop(m: Mark): void {
    m.on = false;
    for (const b of m.bars) b.group.visible = false;
  }

  private clampIn(v: THREE.Vector3, margin: number): void {
    const dx = v.x - this.arena.x, dz = v.z - this.arena.z;
    const d = Math.hypot(dx, dz), lim = this.arenaR() - margin;
    if (d > lim) {
      v.x = this.arena.x + (dx / d) * lim;
      v.z = this.arena.z + (dz / d) * lim;
    }
  }

  // ───────────── reading the floor ─────────────
  private inBar(b: Bar, p: THREE.Vector3, pad: number): boolean {
    const dx = p.x - b.c.x, dz = p.z - b.c.z;
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    const along = dx * s + dz * c, side = dx * c - dz * s;
    return Math.abs(along) < b.len / 2 + pad && Math.abs(side) < b.w / 2 + pad;
  }

  private threatening(m: Mark): boolean {
    return m.on && !m.cancelled && m.t < m.tell + LIVE;
  }

  /** Does mark `m` cover `p` (with `pad` m to spare)? */
  inMark(m: Mark, p: THREE.Vector3, pad: number): boolean {
    for (const b of m.bars) if (this.inBar(b, p, pad)) return true;
    return false;
  }

  /** Is `p` inside a mark that has not landed yet or is still live? */
  dangerAt(p: THREE.Vector3, pad = 0.6): boolean {
    for (const m of this.marks) if (this.threatening(m) && this.inMark(m, p, pad)) return true;
    return false;
  }

  /** Seconds until the first mark over `p` lands (Infinity if none). */
  eta(p: THREE.Vector3): number {
    let best = Infinity;
    for (const m of this.marks) if (this.threatening(m) && this.inMark(m, p, 0.4)) best = Math.min(best, Math.max(0, m.tell - m.t));
    return best;
  }

  /** Marks still to land (the Hush picks from these). */
  pending(): Mark[] {
    return this.marks.filter((m) => m.on && !m.cancelled && !m.landed);
  }

  /** How many of 16 bearings round `p` have a clear spot within 1.8–4.5 m (inside the ring). */
  private exits(p: THREE.Vector3): number {
    let n = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (const r of [1.8, 3, 4.5]) {
        _a.set(p.x + Math.cos(a) * r, this.floorY, p.z + Math.sin(a) * r);
        if (Math.hypot(_a.x - this.arena.x, _a.z - this.arena.z) > this.arenaR() - 1.5) continue;
        if (!this.dangerAt(_a, 0.5)) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  /** The nearest clear spot round `p` (bots; null when `p` is already clear). */
  safeSpot(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.dangerAt(p, 0.5)) return null;
    for (const r of [1.6, 2.4, 3.2, 4.2, 5.5, 7]) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        _a.set(p.x + Math.cos(a) * r, this.floorY, p.z + Math.sin(a) * r);
        if (Math.hypot(_a.x - this.arena.x, _a.z - this.arena.z) > this.arenaR() - 1.5 || this.dangerAt(_a, 0.7)) continue;
        // prefer the bearing toward the ring's middle (room to keep moving)
        const d = Math.hypot(_a.x - this.arena.x, _a.z - this.arena.z);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      if (best >= 0) return out.set(p.x + Math.cos(best) * r, this.floorY, p.z + Math.sin(best) * r);
    }
    return null;
  }

  /** An ally smothers / rubs out a mark before it lands: it fizzles and never hurts. */
  cancel(m: Mark): void {
    if (!m.on || m.landed) return;
    m.cancelled = true;
    m.t = Math.max(m.t, 0);
  }

  // ───────────── per step ─────────────
  update(dt: number, p: PlayerController): void {
    for (const m of this.marks) {
      if (!m.on) continue;
      m.t += dt;
      if (m.cancelled) {
        // fizzling: the outline and the half-drawn fill fade out fast
        let left = 0;
        for (const b of m.bars) {
          for (const mesh of [b.outline, b.fill]) {
            const mat = mesh.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, mat.opacity - dt * 2.5);
            left = Math.max(left, mat.opacity);
          }
        }
        if (left <= 0) this.drop(m);
        continue;
      }
      const k = Math.min(1, m.t / m.tell);
      if (m.t < m.tell) {
        // the tell: the outline pulses in, the fill is drawn along the bar like a pen stroke
        const pulse = 0.55 + 0.35 * k + 0.1 * Math.sin(m.t * 22);
        for (const b of m.bars) {
          (b.outline.material as THREE.MeshBasicMaterial).opacity = Math.min(1, pulse);
          (b.fill.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.2 * k;
          b.fill.scale.z = Math.max(0.001, b.len * k);
        }
        continue;
      }
      if (!m.landed) {
        m.landed = true;
        for (const b of m.bars) {
          (b.fill.material as THREE.MeshBasicMaterial).opacity = 0.9;
          b.fill.scale.z = b.len;
          for (const s of [-0.35, 0, 0.35]) this.ctx.effects.burst(_a.set(b.c.x + Math.sin(b.yaw) * b.len * s, this.floorY + 0.2, b.c.z + Math.cos(b.yaw) * b.len * s), RED, 5, 3.5, 0.11);
        }
        this.ctx.audio.play('stampHit', { pos: m.at, vol: 0.85, pitch: m.kind === 'x' ? 0.8 : 0.65 });
        this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.22);
      }
      if (m.t < m.tell + LIVE) {
        if (p.pos.y < this.floorY + 2.5 && this.inMark(m, p.pos, 0.25)) this.hit(false, m.at, 7, m.kind === 'x' ? 'CORRECTED!' : 'STRUCK THROUGH!');
        continue;
      }
      const f = 1 - (m.t - m.tell - LIVE) / FADE;
      for (const b of m.bars) {
        (b.fill.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * f);
        (b.outline.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f);
      }
      if (f <= 0) this.drop(m);
    }
  }

  clear(): void {
    for (const m of this.marks) m.on = false;
    for (const b of this.bars) b.group.visible = false;
  }

  dispose(): void {
    this.clear();
    for (const b of this.bars) {
      b.outline.geometry.dispose();
      b.group.removeFromParent();
    }
  }
}
