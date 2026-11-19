/**
 * [INPUT]: depends on GameContext (root, assets 'w3_ruler' / 'w3_marks', effects, audio); Lobbed from ./Lobbed; PenMarks (the sky
 *          phase's correction marks) from ./RedPenMarks; PlayerController (pos, takeHit); t from i18n
 * [OUTPUT]: exports PenHazards (ruler sweep, floor marks: ring / sector / dashed lines, ink lines and pools that stay, crossed-out tiles,
 *           ink blots, correction marks; rubOut() for the Eraser) and the HitFn type
 * [POS]: everything the giant Red Pen leaves on the roof, owned by RedPenBoss and driven by its moves (RedPenMoves, RedPenSky).
 *        Tells are drawn here (a red ring, a swept sector, a dotted line) so each attack has ONE readable floor mark; the
 *        hazards hurt WAI through `hit` (the boss's light/heavy rule). The ruler mesh lies along the swept line it
 *        hurts with (square to `ruler.n`). Nothing here allocates per frame.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import { Lobbed } from './Lobbed';
import { PenMarks } from './RedPenMarks';
import { t } from '../i18n';

/** The boss's damage rule: heavy hits knock WAI down. Returns true if it landed. */
export type HitFn = (heavy: boolean, from: THREE.Vector3, knock: number, word: string) => boolean;

const TILE = 2.6;
const RED = '#d8283a';

interface Tile {
  mesh: THREE.Mesh;
  fill: THREE.Mesh;
  at: THREE.Vector3;
  t: number;
  on: boolean;
  tick: number;
}

/** A straight band on the roof: dotted while it is a tell, wet red ink once live. */
interface Line {
  mesh: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  w: number;
  /** seconds: tell until `tell`, then live until `tell + life`, then fades */
  t: number;
  tell: number;
  life: number;
  heavy: boolean;
  struck: boolean;
  tick: number;
  on: boolean;
}

interface Pool {
  mesh: THREE.Mesh;
  at: THREE.Vector3;
  r: number;
  t: number;
  life: number;
  on: boolean;
}

/** The ruler sweep's knock (m/s at the hit; decays fast): about 3 m of flight and a pop of 7 m/s upward. */
const RULER_KNOCK = 26;

export class PenHazards {
  /** Ruler sweep (bots read it): active, its normal and offset from the arena centre, speed. */
  readonly ruler = { active: false, n: new THREE.Vector3(1, 0, 0), off: 0, speed: 9 };
  readonly tiles: Tile[] = [];
  readonly lines: Line[] = [];
  readonly pools: Pool[] = [];
  readonly blots: Lobbed;
  /** Phase 2: the X crosses and strike-through lines it sprays from the sky. */
  readonly marks: PenMarks;
  readonly rulerMesh: THREE.Mesh;
  private ring: THREE.Mesh;
  private sector: THREE.Mesh;
  private sectorKey = '';
  private lineMat: THREE.MeshBasicMaterial;
  private poolMat: THREE.MeshBasicMaterial;
  private _a = new THREE.Vector3();

  constructor(
    private ctx: GameContext,
    private floorY: number,
    private arena: THREE.Vector3,
    private arenaR: () => number,
    private hit: HitFn,
  ) {
    const rt = ctx.assets.tex('w3_ruler').clone();
    rt.repeat.set(14, 1);
    rt.needsUpdate = true;
    this.rulerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.36), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.8, emissive: '#3a0808' }));
    this.rulerMesh.castShadow = true;
    this.rulerMesh.visible = false;
    this.rulerMesh.userData.noPaint = true;
    ctx.root.add(this.rulerMesh);
    const mark = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 }));
      m.visible = false;
      m.userData.noPaint = true;
      m.renderOrder = 2;
      ctx.root.add(m);
      return m;
    };
    this.ring = mark(new THREE.RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2));
    this.sector = mark(new THREE.RingGeometry(0.06, 1, 40, 1, 0, 1).rotateX(-Math.PI / 2));
    this.lineMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 });
    this.poolMat = new THREE.MeshBasicMaterial({ color: '#9a0f22', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.marks = new PenMarks(ctx, floorY, arena, arenaR, hit);
    this.blots = new Lobbed(ctx, { color: RED, size: 0.62, splash: 1.7, damage: 1, ring: true, onLand: (at) => this.pool(at, 1.9, 7) });
    // crossed-out roof tiles (phase 2)
    const marks = ctx.assets.tex('w3_marks');
    for (let i = 0; i < 6; i++) {
      const g = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5 + uv.getX(k) * 0.5, 0.5 + uv.getY(k) * 0.5);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: marks, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }));
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      for (const m of [mesh, fill]) {
        m.visible = false;
        m.userData.noPaint = true;
        ctx.root.add(m);
      }
      this.tiles.push({ mesh, fill, at: new THREE.Vector3(), t: 0, on: false, tick: 0 });
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.lineMat.clone());
      m.visible = false;
      m.userData.noPaint = true;
      ctx.root.add(m);
      this.lines.push({ mesh: m, a: new THREE.Vector3(), b: new THREE.Vector3(), w: 1, t: 0, tell: 1, life: 1, heavy: false, struck: false, tick: 0, on: false });
    }
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), this.poolMat.clone());
      m.visible = false;
      m.userData.noPaint = true;
      ctx.root.add(m);
      this.pools.push({ mesh: m, at: new THREE.Vector3(), r: 1, t: 0, life: 1, on: false });
    }
  }

  // ───────────── floor tells ─────────────
  /** A red ring on the roof (k = 0..1 pulse strength; 0 hides). */
  markRing(at: THREE.Vector3 | null, r = 1, k = 0): void {
    const m = this.ring;
    m.visible = !!at && k > 0;
    if (!at || !m.visible) return;
    m.position.set(at.x, this.floorY + 0.05, at.z);
    m.scale.set(r, 1, r);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.6 * k;
  }

  /** A swept sector round `pivot` from yaw a0 to a1 (rad, a1 > a0), radius r. */
  markSector(pivot: THREE.Vector3 | null, r = 1, a0 = 0, a1 = 1, k = 0): void {
    const m = this.sector;
    m.visible = !!pivot && k > 0;
    if (!pivot || !m.visible) return;
    const key = `${a0.toFixed(3)}|${a1.toFixed(3)}`;
    if (key !== this.sectorKey) {
      this.sectorKey = key;
      m.geometry.dispose();
      // RingGeometry lies in XY; after rotateX(−π/2) the angle θ points to yaw θ + π/2
      m.geometry = new THREE.RingGeometry(0.06, 1, 40, 1, a0 - Math.PI / 2, a1 - a0).rotateX(-Math.PI / 2);
    }
    m.position.set(pivot.x, this.floorY + 0.04, pivot.z);
    m.scale.set(r, 1, r);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.3 * k;
  }

  /** A band from a to b, w wide: dotted for `tell` s, then live ink for `life` s (heavy = the strike hurts hard). */
  line(a: THREE.Vector3, b: THREE.Vector3, w: number, tell: number, life: number, heavy: boolean): void {
    const l = this.lines.find((x) => !x.on) ?? this.lines[0];
    l.a.copy(a).setY(this.floorY);
    l.b.copy(b).setY(this.floorY);
    l.w = w;
    l.t = 0;
    l.tell = tell;
    l.life = life;
    l.heavy = heavy;
    l.struck = false;
    l.tick = 0;
    l.on = true;
    const m = l.mesh;
    const len = l.a.distanceTo(l.b);
    m.position.copy(l.a).lerp(l.b, 0.5).setY(this.floorY + 0.035);
    m.rotation.set(0, Math.atan2(l.b.x - l.a.x, l.b.z - l.a.z), 0);
    m.scale.set(w, 1, len);
    m.visible = true;
  }

  /** A wet ink pool that stays `life` s (hurts a little while WAI stands in it). */
  pool(at: THREE.Vector3, r: number, life: number): void {
    const pl = this.pools.find((x) => !x.on) ?? this.pools.reduce((a, b) => (a.t > b.t ? a : b));
    pl.at.copy(at).setY(this.floorY);
    pl.r = r;
    pl.t = 0;
    pl.life = life;
    pl.on = true;
    pl.mesh.position.set(at.x, this.floorY + 0.03, at.z);
    pl.mesh.rotation.y = Math.random() * 6;
    pl.mesh.scale.set(r * (0.9 + Math.random() * 0.2), 1, r);
    pl.mesh.visible = true;
  }

  // ───────────── the ruler ─────────────
  startRuler(n: THREE.Vector3, speed: number): void {
    const R = this.arenaR();
    this.ruler.n.copy(n).setY(0).normalize();
    this.ruler.off = -R - 0.8;
    this.ruler.speed = speed;
    this.ruler.active = false;
    this.rulerMesh.scale.set(R * 2.2, 1, 1);
    // the box's long axis is its local x: yaw atan2(n) turns x square to n, so the ruler lies along the swept line
    // (with + π/2 it lay along n and slid lengthwise, 90° off the line that hits WAI)
    this.rulerMesh.rotation.y = Math.atan2(n.x, n.z);
    this.placeRuler();
    this.rulerMesh.visible = true;
  }

  /** Tell glow 0..1 while the ruler waits. */
  rulerGlow(k: number): void {
    (this.rulerMesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.25 + 0.55 * k, 0.04, 0.04);
  }

  goRuler(): void {
    this.ruler.active = true;
    this.rulerGlow(0);
    this.ctx.audio.play('whoosh', { pos: this.rulerMesh.position, pitch: 0.55 });
  }

  /** Is the sweep finished (it left the far side)? */
  get rulerDone(): boolean {
    return !this.rulerMesh.visible;
  }

  stopRuler(): void {
    this.ruler.active = false;
    this.rulerMesh.visible = false;
  }

  private placeRuler(): void {
    const n = this.ruler.n;
    this.rulerMesh.position.set(this.arena.x + n.x * this.ruler.off, this.floorY + 0.36, this.arena.z + n.z * this.ruler.off);
  }

  private stepRuler(dt: number, p: PlayerController): void {
    if (!this.ruler.active) return;
    const prev = this.ruler.off;
    this.ruler.off += this.ruler.speed * dt;
    this.placeRuler();
    const n = this.ruler.n;
    const d = (p.pos.x - this.arena.x) * n.x + (p.pos.z - this.arena.z) * n.z;
    const crossed = (d - prev) * (d - this.ruler.off) <= 0 || Math.abs(d - this.ruler.off) < 0.4;
    // it sends WAI flying: thrown ahead of the ruler and up over it, so the ruler passes under him instead of through him
    if (crossed && p.pos.y < this.floorY + 0.8) this.hit(false, this._a.copy(p.pos).addScaledVector(n, -1), RULER_KNOCK, 'RULED OUT!');
    if (this.ruler.off > this.arenaR() + 0.8) this.stopRuler();
  }

  // ───────────── crossed-out tiles (phase 2) ─────────────
  /** `count` tiles: the one under WAI, then its neighbours in a plus (5 = the whole plus: one step does not clear it). */
  crossTiles(p: THREE.Vector3, clamp: (v: THREE.Vector3, m: number) => void, count = 5): void {
    const PLUS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    let n = 0;
    for (const tl of this.tiles) {
      if (tl.on || n >= Math.min(count, PLUS.length)) continue;
      const ox = PLUS[n][0] * TILE, oz = PLUS[n][1] * TILE;
      tl.at.set(Math.round((p.x + ox) / TILE) * TILE, this.floorY, Math.round((p.z + oz) / TILE) * TILE);
      clamp(tl.at, 1.4);
      tl.on = true;
      tl.t = 0;
      tl.tick = 0;
      tl.mesh.position.copy(tl.at).setY(this.floorY + 0.03);
      tl.fill.position.copy(tl.at).setY(this.floorY + 0.025);
      tl.mesh.visible = tl.fill.visible = true;
      n++;
    }
    this.ctx.audio.play('stampTick', { pos: p, vol: 0.8 });
  }

  // ───────────── per step ─────────────
  update(dt: number, p: PlayerController): void {
    this.blots.update(dt, p);
    this.marks.update(dt, p);
    this.stepRuler(dt, p);
    const feet = p.pos;
    const low = feet.y < this.floorY + 0.5;
    for (const tl of this.tiles) {
      if (!tl.on) continue;
      tl.t += dt;
      const fm = tl.fill.material as THREE.MeshBasicMaterial;
      const mm = tl.mesh.material as THREE.MeshBasicMaterial;
      if (tl.t < 1.2) {
        fm.opacity = 0.12 + 0.3 * (tl.t / 1.2) + 0.1 * Math.sin(tl.t * 20);
        mm.opacity = tl.t / 1.2;
      } else if (tl.t < 5.2) {
        fm.opacity = 0.45;
        mm.opacity = 1;
        if (tl.t - dt < 1.2) this.ctx.audio.play('stampHit', { pos: tl.at, vol: 0.4, pitch: 1.4 });
        tl.tick -= dt;
        const inside = Math.abs(feet.x - tl.at.x) < TILE / 2 && Math.abs(feet.z - tl.at.z) < TILE / 2 && low;
        if (inside && tl.tick <= 0 && this.hit(false, tl.at, 5, 'CROSSED OUT!')) tl.tick = 1;
      } else {
        fm.opacity = Math.max(0, fm.opacity - dt * 2);
        mm.opacity = Math.max(0, mm.opacity - dt * 2);
        if (mm.opacity <= 0) {
          tl.on = false;
          tl.mesh.visible = tl.fill.visible = false;
        }
      }
    }
    for (const l of this.lines) {
      if (!l.on) continue;
      l.t += dt;
      const m = l.mesh.material as THREE.MeshBasicMaterial;
      if (l.t < l.tell) {
        // the tell: a dotted, flickering band
        m.opacity = 0.18 + 0.35 * (l.t / l.tell) + 0.15 * Math.sin(l.t * 24);
        continue;
      }
      const on = this.distToLine(l, feet) < l.w / 2 + 0.3 && low;
      if (!l.struck) {
        l.struck = true;
        this.ctx.audio.play('stampHit', { pos: l.a.clone().lerp(l.b, 0.5), vol: 0.9, pitch: 0.7 });
        this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.35);
        if (on && l.heavy) this.hit(true, this.closestOnLine(l, feet, this._a), 11, 'CROSSED OUT!');
        l.tick = 1;
      }
      if (l.t < l.tell + l.life) {
        m.opacity = 0.82;
        l.tick -= dt;
        if (on && l.tick <= 0 && this.hit(false, this.closestOnLine(l, feet, this._a), 4, 'WET INK!')) l.tick = 1;
      } else {
        m.opacity = Math.max(0, m.opacity - dt * 1.5);
        if (m.opacity <= 0) {
          l.on = false;
          l.mesh.visible = false;
        }
      }
    }
    for (const pl of this.pools) {
      if (!pl.on) continue;
      pl.t += dt;
      const m = pl.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = pl.t < pl.life ? 0.85 : Math.max(0, 0.85 - (pl.t - pl.life) * 1.5);
      if (pl.t > pl.life + 0.6) {
        pl.on = false;
        pl.mesh.visible = false;
        continue;
      }
      if (pl.t < pl.life && low && Math.hypot(feet.x - pl.at.x, feet.z - pl.at.z) < pl.r * 0.85) {
        // standing in wet ink: a light hit now and then (invulnerability after a hit spaces them out)
        this.hit(false, pl.at, 3, 'WET INK!');
      }
    }
  }

  private distToLine(l: Line, p: THREE.Vector3): number {
    return this.closestOnLine(l, p, this._a).setY(p.y).distanceTo(p);
  }

  private closestOnLine(l: Line, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const dx = l.b.x - l.a.x, dz = l.b.z - l.a.z;
    const len2 = dx * dx + dz * dz || 1;
    const k = THREE.MathUtils.clamp(((p.x - l.a.x) * dx + (p.z - l.a.z) * dz) / len2, 0, 1);
    return out.set(l.a.x + dx * k, this.floorY, l.a.z + dz * k);
  }

  /** Bots: is `p` standing on a live or upcoming ink band / pool / tile? */
  dangerAt(p: THREE.Vector3): boolean {
    if (this.marks.dangerAt(p)) return true;
    for (const l of this.lines) if (l.on && this.distToLine(l, p) < l.w / 2 + 0.6) return true;
    for (const pl of this.pools) if (pl.on && pl.t < pl.life && Math.hypot(p.x - pl.at.x, p.z - pl.at.z) < pl.r + 0.4) return true;
    for (const tl of this.tiles) if (tl.on && Math.abs(p.x - tl.at.x) < TILE / 2 + 0.3 && Math.abs(p.z - tl.at.z) < TILE / 2 + 0.3) return true;
    return false;
  }

  /**
   * The Eraser rubs the red off the roof round `at` (radius r): wet pools and live ink bands there go. Returns how many
   * it rubbed out (0 = nothing red there).
   */
  rubOut(at: THREE.Vector3, r: number): number {
    let n = 0;
    for (const pl of this.pools) {
      if (!pl.on || pl.t >= pl.life || Math.hypot(at.x - pl.at.x, at.z - pl.at.z) > r + pl.r) continue;
      pl.t = pl.life;
      n++;
    }
    for (const l of this.lines) {
      if (!l.on || l.t < l.tell || l.t >= l.tell + l.life || this.distToLine(l, at) > r) continue;
      l.t = l.tell + l.life;
      n++;
    }
    return n;
  }

  /** The red thing on the roof nearest `p` within `r` m that the Eraser could rub out (null = none). */
  nearestRed(p: THREE.Vector3, r: number, out: THREE.Vector3): THREE.Vector3 | null {
    let best = r;
    let found = false;
    for (const pl of this.pools) {
      if (!pl.on || pl.t >= pl.life - 0.8) continue;
      const d = Math.hypot(p.x - pl.at.x, p.z - pl.at.z);
      if (d < best) {
        best = d;
        out.copy(pl.at);
        found = true;
      }
    }
    for (const l of this.lines) {
      if (!l.on || l.t < l.tell || l.t >= l.tell + l.life - 0.8) continue;
      const c = this.closestOnLine(l, p, this._a);
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < best) {
        best = d;
        out.copy(c);
        found = true;
      }
    }
    return found ? out : null;
  }

  /** Remove every mark (phase change, smudge reset, the end). */
  clear(): void {
    this.marks.clear();
    this.stopRuler();
    this.markRing(null);
    this.markSector(null);
    this.blots.clear();
    for (const tl of this.tiles) {
      tl.on = false;
      tl.mesh.visible = tl.fill.visible = false;
    }
    for (const l of this.lines) {
      l.on = false;
      l.mesh.visible = false;
    }
    for (const pl of this.pools) {
      pl.on = false;
      pl.mesh.visible = false;
    }
  }

  /** The comic word for a hit (shared helper for the moves). */
  word(at: THREE.Vector3, text: string): void {
    this.ctx.effects.comic(at.clone().setY(at.y + 1.8), t(text), RED, 0.85);
  }

  dispose(): void {
    this.clear();
    this.marks.dispose();
    for (const m of [this.rulerMesh, this.ring, this.sector]) m.removeFromParent();
    for (const tl of this.tiles) {
      tl.mesh.removeFromParent();
      tl.fill.removeFromParent();
    }
    for (const l of this.lines) l.mesh.removeFromParent();
    for (const pl of this.pools) pl.mesh.removeFromParent();
  }
}
