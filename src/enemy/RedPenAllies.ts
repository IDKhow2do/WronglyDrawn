/**
 * [INPUT]: depends on GameContext (assets.instantiateModel 'eraserBoss' / 'hushBell', effects, audio); toon/addOutline from render/Materials;
 *          PenMarks / Mark from ./RedPenMarks (the Hush muffles one); PenHazards from ./RedPenHazards (the Eraser rubs pools and ink lines)
 * [OUTPUT]: exports Ally (base, onJoin), EraserAlly (rub(), help()) and HushAlly (wrap(), help(), busy) — the two old bosses, repainted,
 *           who come back to help on the roof; EraserHelp (what the Eraser needs from the boss each step)
 * [POS]: level-3 boss helpers, owned by RedPenBoss, sized beside the 14 m souls-fight Pen (Eraser 3.4 m, Hush 4.2 m). Not enemies: no
 *        collider, no damage, never targeted. Each helps in character, on its own cooldown, and never plays the fight for WAI:
 *        the HUSH (phase 2) catches WAI's shout and drapes its dust over the flying Pen so it sinks; every 9 s it also flies
 *        over ONE correction mark near WAI (never the one he stands in, never the only one) and smothers it before it lands ("SHH!").
 *        The ERASER (phase 3) rubs the X off WAI's Legs; every 5 s it hops to the red ink pool or line nearest WAI and rubs it
 *        out ("RUB RUB!"); every 15 s, while the Pen walks between moves, it rubs the Pen's nib and the NIB opens for a moment
 *        (paint only, no TAG). Each one is a small model + a tiny state machine; the boss calls help() every step.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { addOutline, toon } from '../render/Materials';
import type { Mark, PenMarks } from './RedPenMarks';
import type { PenHazards } from './RedPenHazards';
import { t } from '../i18n';

const _v = new THREE.Vector3();

/** What the Eraser reads from the boss each step. */
export interface EraserHelp {
  hz: PenHazards;
  wai: THREE.Vector3;
  /** Where the Pen stands (WAI keeps the Eraser on his far side from it). */
  away: THREE.Vector3;
  floorY: number;
  /** The nib's floor spot while the Pen is walking between moves with nothing open (null = not now). */
  nib: THREE.Vector3 | null;
  /** The rub landed: the boss opens the nib for a moment. */
  rubPen: () => void;
}

/** A model scaled to `h` metres tall, pivot at the bottom (with a procedural stand-in if the GLB is missing). */
function fitModel(ctx: GameContext, slot: 'eraserBoss' | 'hushBell', h: number, fallback: () => THREE.Object3D, tint: string): THREE.Object3D {
  const m = ctx.assets.instantiateModel(slot, { pivot: 'bottom' }) ?? fallback();
  const box = new THREE.Box3().setFromObject(m);
  const s = h / Math.max(0.01, box.max.y - box.min.y);
  m.scale.setScalar(s);
  // repainted: a bright tint over its own colours
  const col = new THREE.Color(tint);
  m.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || me.userData.isOutline) return;
    me.castShadow = true;
    const mat = me.material as THREE.MeshStandardMaterial;
    if (mat && mat.color) {
      const c = mat.clone();
      c.color.lerp(col, 0.35);
      me.material = c;
    }
  });
  const g = new THREE.Group();
  g.add(m);
  g.userData.noPaint = true;
  return g;
}

export class Ally {
  readonly root = new THREE.Group();
  readonly pos = new THREE.Vector3();
  protected target = new THREE.Vector3();
  protected t = 0;
  protected hop = 0;
  shown = false;
  /** Called once each time it arrives (the boss shows its one line). */
  onJoin: (() => void) | null = null;

  constructor(protected ctx: GameContext) {
    this.root.visible = false;
    ctx.root.add(this.root);
  }

  /** Arrive at `at` from `from` (a big hop in). */
  enter(from: THREE.Vector3, at: THREE.Vector3): void {
    this.shown = true;
    this.root.visible = true;
    this.pos.copy(from);
    this.target.copy(at);
    this.ctx.effects.burst(from.clone().setY(from.y + 1), '#ffd23a', 16, 4);
    this.onJoin?.();
  }

  goTo(at: THREE.Vector3): void {
    this.target.copy(at);
  }

  hide(): void {
    this.shown = false;
    this.root.visible = false;
  }

  protected glide(dt: number, speed: number, floorY: number, bounce: number): void {
    _v.copy(this.target).sub(this.pos);
    const d = Math.hypot(_v.x, _v.z);
    const step = Math.min(d, speed * dt);
    if (d > 0.01) {
      this.pos.x += (_v.x / d) * step;
      this.pos.z += (_v.z / d) * step;
      this.root.rotation.y = Math.atan2(_v.x, _v.z);
    }
    this.pos.y += (this.target.y - this.pos.y) * Math.min(1, dt * 3);
    this.hop += dt * (d > 0.2 ? 9 : 3);
    this.root.position.set(this.pos.x, Math.max(floorY, this.pos.y) + Math.abs(Math.sin(this.hop)) * bounce, this.pos.z);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

/** THE ERASER, repainted: a little pink pencil eraser on springy hops. It rubs red marks away. */
export class EraserAlly extends Ally {
  private body: THREE.Object3D;
  private rubT = 0;
  constructor(ctx: GameContext) {
    super(ctx);
    this.body = fitModel(
      ctx,
      'eraserBoss',
      3.4,
      () => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1), toon({ color: '#ff9ec4' }));
        m.position.y = 0.5;
        addOutline(m, 0.04);
        return m;
      },
      '#ff9ec4',
    );
    this.root.add(this.body);
  }

  /** A quick rubbing wiggle on the spot (the X comes off). */
  rub(): void {
    this.rubT = 1.2;
    this.ctx.audio.play('erase', { pos: this.pos, vol: 0.9 });
  }

  private floorCd = 3;
  private penCd = 7;
  private job: 'none' | 'floor' | 'pen' = 'none';
  private jobT = 0;
  private spot = new THREE.Vector3();

  /**
   * Its own judgement each step: rub out the red ink nearest WAI, or (now and then) the Pen's nib while it walks. Between
   * jobs it hops along beside WAI.
   */
  help(dt: number, h: EraserHelp): void {
    if (!this.shown) return;
    this.floorCd -= dt;
    this.penCd -= dt;
    if (this.job === 'none') {
      if (this.penCd <= 0 && h.nib) {
        this.job = 'pen';
        this.jobT = 0;
      } else if (this.floorCd <= 0 && h.hz.nearestRed(h.wai, 8, this.spot)) {
        this.job = 'floor';
        this.jobT = 0;
      } else {
        // at WAI's side, a step toward the Pen: out of his line of fire and never between him and the camera behind him
        _v.set(h.wai.x - h.away.x, 0, h.wai.z - h.away.z);
        if (_v.lengthSq() < 0.01) _v.set(1, 0, 0);
        _v.normalize();
        this.goTo(this.target.set(h.wai.x - _v.z * 4.5 - _v.x, h.floorY, h.wai.z + _v.x * 4.5 - _v.z));
        return;
      }
    }
    this.jobT += dt;
    if (this.job === 'pen') {
      // the nib moves with the Pen's hop walk: keep chasing it; give up after 4 s or once the Pen starts a move
      if (!h.nib || this.jobT > 4) return this.done('pen', 6);
      this.goTo(this.spot.copy(h.nib).setY(h.floorY));
      if (Math.hypot(this.pos.x - h.nib.x, this.pos.z - h.nib.z) < 2.6) {
        this.rub();
        h.rubPen();
        this.ctx.effects.comic(this.pos.clone().setY(h.floorY + 4.2), t('RUB RUB!'), '#ff9ec4', 1.1);
        this.done('pen', 15);
      }
      return;
    }
    // floor: hop to the red spot and rub it out
    this.goTo(this.target.copy(this.spot).setY(h.floorY));
    if (this.jobT > 4) return this.done('floor', 2);
    if (Math.hypot(this.pos.x - this.spot.x, this.pos.z - this.spot.z) < 1.4) {
      this.rub();
      if (h.hz.rubOut(this.spot, 2.4)) {
        this.ctx.effects.burst(this.spot.clone().setY(h.floorY + 0.3), '#ffc6dc', 18, 4, 0.12);
        this.ctx.effects.comic(this.pos.clone().setY(h.floorY + 4.2), t('RUB RUB!'), '#ff9ec4', 1);
      }
      this.done('floor', 5);
    }
  }

  private done(job: 'floor' | 'pen', cd: number): void {
    if (job === 'floor') this.floorCd = cd;
    else this.penCd = cd;
    this.job = 'none';
  }

  /** A fresh act (phase 3 starts again): cooldowns from the top. */
  resetHelp(): void {
    this.floorCd = 3;
    this.penCd = 7;
    this.job = 'none';
  }

  update(dt: number, floorY: number): void {
    if (!this.shown) return;
    this.t += dt;
    this.glide(dt, 6, floorY, this.rubT > 0 ? 0.05 : 0.35);
    if (this.rubT > 0) {
      this.rubT -= dt;
      this.root.rotation.z = Math.sin(this.t * 30) * 0.18;
      if (Math.floor(this.t * 10) !== Math.floor((this.t - dt) * 10)) this.ctx.effects.burst(this.pos.clone().setY(floorY + 0.2), '#ffc6dc', 4, 2);
    } else this.root.rotation.z = 0;
  }
}

/** THE HUSH, repainted: a little glowing jelly lantern. It catches WAI's shout and wraps the Pen in dust. */
export class HushAlly extends Ally {
  private body: THREE.Object3D;
  private shroud: THREE.Mesh;
  private wrapT = 0;
  private wrapAt = new THREE.Vector3();
  constructor(ctx: GameContext) {
    super(ctx);
    this.body = fitModel(
      ctx,
      'hushBell',
      4.2,
      () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#cfc8ff' }));
        addOutline(m, 0.04);
        return m;
      },
      '#e8c8ff',
    );
    this.root.add(this.body);
    this.shroud = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshStandardMaterial({ color: '#cfc8e2', transparent: true, opacity: 0, roughness: 1, depthWrite: false }),
    );
    this.shroud.userData.noPaint = true;
    this.shroud.visible = false;
    ctx.root.add(this.shroud);
  }

  /** Fly to the Pen and drape the dust over it for `sec` seconds. */
  wrap(at: THREE.Vector3, sec: number): void {
    this.wrapT = sec;
    this.wrapAt.copy(at);
    this.goTo(at.clone().setY(at.y + 3));
    this.ctx.audio.play('hush', { pos: at, vol: 0.9, pitch: 1.2 });
  }

  get wrapping(): boolean {
    return this.wrapT > 0;
  }

  private muffleCd = 4;
  private muffling: Mark | null = null;
  private muffleT = 0;

  /** Flying over a mark to smother it (the boss's flight path leaves it alone meanwhile). */
  get busy(): boolean {
    return !!this.muffling;
  }

  /**
   * Every 9 s: one pending correction mark near WAI that he is NOT standing in, when two or more are pending (it opens
   * ground, it never saves him from the mark under his feet). It flies over it and smothers it before it lands.
   */
  help(dt: number, marks: PenMarks, wai: THREE.Vector3): void {
    if (!this.shown || this.wrapT > 0) return;
    this.muffleCd -= dt;
    const m = this.muffling;
    if (m) {
      this.muffleT += dt;
      if (!m.on || m.landed || m.cancelled || this.muffleT > 3) {
        this.muffling = null;
        return;
      }
      this.goTo(this.target.set(m.at.x, m.at.y + 3.2, m.at.z));
      if (Math.hypot(this.pos.x - m.at.x, this.pos.z - m.at.z) < 1.6) {
        marks.cancel(m);
        this.ctx.audio.play('hush', { pos: m.at, vol: 0.8, pitch: 1.4 });
        this.ctx.effects.burst(m.at.clone().setY(m.at.y + 0.6), '#cfc8ff', 22, 3.5, 0.14, 2);
        this.ctx.effects.ring(m.at.clone().setY(m.at.y + 0.08), '#b49cff', 3.2);
        this.ctx.effects.comic(m.at.clone().setY(m.at.y + 2.6), t('SHH!'), '#b49cff', 1.1);
        this.muffling = null;
        this.muffleCd = 9;
      }
      return;
    }
    if (this.muffleCd > 0) return;
    // only where the floor is crowded: never the only mark on the roof
    const pending = marks.pending();
    if (pending.length < 2) return;
    let best: Mark | null = null;
    let bestD = 7;
    for (const c of pending) {
      if (marks.inMark(c, wai, 0.3)) continue;
      const d = Math.hypot(c.at.x - wai.x, c.at.z - wai.z);
      // it must get there first (it flies ≈ 9 m/s)
      const reach = Math.hypot(c.at.x - this.pos.x, c.at.z - this.pos.z) / 9 + 0.25;
      if (d < bestD && c.tell - c.t > reach) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return;
    this.muffling = best;
    this.muffleT = 0;
  }

  /** A fresh act (phase 2 starts again): cooldown from the top. */
  resetHelp(): void {
    this.muffleCd = 4;
    this.muffling = null;
  }

  /** Follow the wrapped Pen (the boss calls this while it sinks). */
  follow(at: THREE.Vector3): void {
    this.wrapAt.copy(at);
    if (this.wrapT > 0) this.target.set(at.x, at.y + 6.5, at.z);
  }

  update(dt: number, floorY: number): void {
    if (!this.shown) return;
    this.t += dt;
    this.glide(dt, 9, floorY + 5, 0.25);
    this.body.rotation.y += dt * 0.6;
    const m = this.shroud.material as THREE.MeshStandardMaterial;
    if (this.wrapT > 0) {
      this.wrapT -= dt;
      this.shroud.visible = true;
      m.opacity = Math.min(0.55, m.opacity + dt * 1.5) * Math.min(1, this.wrapT * 2);
      this.shroud.position.copy(this.wrapAt).setY(this.wrapAt.y + 2.2);
      // big enough to drape the 14 m Pen lying on the roof
      this.shroud.scale.set(7.5, 3.2 + Math.sin(this.t * 3) * 0.15, 7.5);
    } else if (this.shroud.visible) {
      m.opacity = Math.max(0, m.opacity - dt * 2);
      if (m.opacity <= 0.01) this.shroud.visible = false;
    }
  }

  override dispose(): void {
    super.dispose();
    this.shroud.removeFromParent();
  }
}
