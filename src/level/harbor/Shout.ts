/**
 * [INPUT]: depends on GameContext (input, camera, effects.sound, physics, audio) from core/Context; PlayerController;
 *          EnemyBase (knock / interruptBy); SoundShapes (coneFront, groundRipple, the OURS palette); i18n t()
 * [OUTPUT]: exports SHOUT (tuning), Shoutable / ShoutReactive (what hears it) and ShoutSystem
 * [POS]: WAI's voice in levels 2 and 3 (HarborSession, WorksSession own one). Hits are decided at once in fire();
 *        the drawing is hand-drawn sound (render/SoundFx): cone fronts that grow to exactly the hit range and
 *        opening, speed strokes, "!!" marks, a ground ripple, a screen pulse for the big shout, and, from a high
 *        place (the lighthouse gallery), rings that roll out over the ground below.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { EnemyBase } from '../../enemy/EnemyBase';
import { t } from '../../i18n';
import { ARC_MODE, SOUND_GLYPH } from '../../render/SoundFx';
import { SOUND_INK_OURS, coneFront, groundRipple } from '../../render/SoundShapes';

/**
 * SHOUT (Mute Harbor) — WAI's Mouth Sticker, worn, gives him a voice.
 *
 *   X (tap)          SHOUT: a visible sound-wave cone (≈9 m, ±36°) where the camera looks
 *   X (hold ≥ 0.55 s) BIG SHOUT: ≈15 m, ±42°, knocks creatures back harder, bursts dust cocoons
 *
 * What it does (each target decides):
 *   · bells ring (gates open, bridges drop) · tuning forks hum · echo shells shout back
 *   · Hush creatures' dust veils shatter (paint works again) · other creatures stagger back
 * The Hush can MUFFLE WAI (its moths, its silence dome): no voice for a moment.
 */
export const SHOUT = {
  range: 9,
  bigRange: 15,
  halfAngle: (36 * Math.PI) / 180,
  bigHalfAngle: (42 * Math.PI) / 180,
  chargeTime: 0.55,
  cooldown: 0.75,
};

/** Something in the world that reacts to WAI's voice. Return true if it reacted (for the HUD/tutorial). */
export interface Shoutable {
  readonly pos: THREE.Vector3;
  /** Size of the target (cone hits count from its edge). */
  readonly radius: number;
  /** Only BIG shouts reach it? */
  readonly needsBig?: boolean;
  enabled(): boolean;
  onShout(big: boolean, from: THREE.Vector3): boolean;
}

/** Creatures with their own reaction (Hush moths, the Hush). */
export interface ShoutReactive {
  onShout(big: boolean, from: THREE.Vector3): void;
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);

const isReactive = (e: unknown): e is ShoutReactive => typeof (e as ShoutReactive).onShout === 'function';

interface Wave {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  half: number;
  big: boolean;
  t: number;
  dur: number;
  range: number;
  seed: number;
  active: boolean;
}

/** Fronts per shout (each a cone cap that grows to the hit range). */
const FRONTS = 4;
const BIG_FRONTS = 6;
/** A big shout from this high above the ground below rolls rings out over it (the lighthouse gallery). */
const HIGH_DROP = 7;

export class ShoutSystem {
  readonly targets: Shoutable[] = [];
  /** Seconds WAI can't shout (muffled by the Hush). */
  muteT = 0;
  holdT = 0;
  private cd = 0;
  private holding = false;
  private waves: Wave[] = [];
  private hintCd = 0;
  private chargeSpin = 0;
  /** Shouts fired (stats / tutorial). */
  count = 0;
  /** Session hooks. */
  onShout: ((big: boolean, reacted: number) => void) | null = null;
  private dir = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(
    private ctx: GameContext,
    private enemies: () => EnemyBase[],
  ) {
    for (let i = 0; i < 3; i++)
      this.waves.push({ origin: new THREE.Vector3(), dir: new THREE.Vector3(), half: 0, big: false, t: 0, dur: 0.5, range: 9, seed: 0, active: false });
  }

  /** Where WAI shouts: from his mouth, along the camera's look (slightly lifted so bells above count). */
  aim(player: PlayerController): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const cam = this.ctx.camera;
    this.origin.copy(player.pos).add(this.tmp.set(0, 0.95, 0));
    const ray = cam.aimRay();
    this.dir.copy(ray.dir);
    // in follow cam the look is pitched down at WAI: level it out a bit
    if (cam.aimT < 0.5) this.dir.y = Math.max(this.dir.y + 0.18, -0.25);
    this.dir.normalize();
    return { origin: this.origin, dir: this.dir };
  }

  step(dt: number, player: PlayerController, allowed: boolean, mouthWorn: boolean, mouth: 'corrupted' | 'lent' | 'idle' | null): void {
    const input = this.ctx.input;
    this.cd = Math.max(0, this.cd - dt);
    this.muteT = Math.max(0, this.muteT - dt);
    this.hintCd = Math.max(0, this.hintCd - dt);
    const down = allowed && input.isDown('KeyX');
    const pressed = allowed && input.consumePressed('KeyX');
    if (pressed && !mouthWorn) {
      if (this.hintCd <= 0) {
        this.hintCd = 1.4;
        this.ctx.events.emit('toast', { text: t(mouth === 'corrupted' ? 'Purify your Mouth Sticker first (hold R) — then SHOUT' : mouth === 'lent' ? 'Your Mouth Sticker is lent out — hold R to recall it, then SHOUT' : mouth === 'idle' ? 'Wear your Mouth Sticker (press R) to SHOUT' : 'You need a Mouth Sticker to SHOUT'), kind: 'warn' });
        this.ctx.audio.play('denied');
      }
    } else if (pressed && this.muteT > 0) {
      if (this.hintCd <= 0) {
        this.hintCd = 0.8;
        this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), t('MUFFLED!'), '#b49cff', 0.7);
        this.ctx.audio.play('denied', { pitch: 0.7 });
      }
    } else if (pressed && mouthWorn) {
      this.holding = true;
      this.holdT = 0;
    }
    if (this.holding) {
      if (down && mouthWorn && this.muteT <= 0) {
        this.holdT += dt;
        const k = Math.min(1, this.holdT / SHOUT.chargeTime);
        if (this.holdT > 0.12) this.drawCharge(player, k, dt);
        if (k >= 1 && this.holdT - dt < SHOUT.chargeTime) this.ctx.audio.play('lockOn', { pitch: 1.4, vol: 0.5 });
      } else {
        // released (or lost the mouth mid-charge)
        this.holding = false;
        if (mouthWorn && this.muteT <= 0 && this.cd <= 0) this.fire(player, this.holdT >= SHOUT.chargeTime);
      }
    }
    // waves fly: each front is drawn at the radius it has reached (the last one ends at the hit range)
    const fx = this.ctx.effects.sound;
    for (const w of this.waves) {
      if (!w.active) continue;
      w.t += dt;
      const k = w.t / w.dur;
      if (k >= 1) {
        w.active = false;
        continue;
      }
      const n = w.big ? BIG_FRONTS : FRONTS;
      for (let i = 0; i < n; i++) {
        const kk = THREE.MathUtils.clamp(k * 1.3 - i * 0.09, 0, 1);
        if (kk <= 0 || kk >= 1) continue;
        const R = 0.35 + (1 - Math.pow(1 - kk, 2.2)) * w.range;
        const fade = Math.min(1, kk * 6) * (1 - kk * kk);
        const col = i === 0 ? (w.big ? SOUND_INK_OURS.c : SOUND_INK_OURS.a) : i % 2 ? SOUND_INK_OURS.b : SOUND_INK_OURS.a;
        coneFront(fx, w.origin, w.dir, R, w.half, col, fade, (w.big ? 0.17 : 0.12) * (1 - kk * 0.5) + R * 0.012, w.seed + i * 1.7);
      }
    }
  }

  /** The charge: arcs spiral in round WAI's chest and tighten; at full charge they go yellow and a "!" bobs. */
  private drawCharge(player: PlayerController, k: number, dt: number): void {
    const fx = this.ctx.effects.sound;
    this.chargeSpin += dt * (3 + k * 6);
    const c = this.tmp.copy(player.renderPos).add(this.origin.set(0, 1.0, 0));
    const full = k >= 1;
    const col = full ? SOUND_INK_OURS.c : SOUND_INK_OURS.b;
    for (let i = 0; i < 3; i++) {
      const a = this.chargeSpin + (i * Math.PI * 2) / 3;
      const r = 1.3 - k * 0.55 + (full ? Math.sin(performance.now() / 45 + i) * 0.05 : 0);
      fx.arc({ c, u: X, v: Z, r, w: 0.05 + k * 0.05, a0: a, a1: a + 1.3, color: col, alpha: 0.35 + k * 0.6, seed: i * 2.3 });
    }
    if (full) fx.glyph(c.clone().add(this.origin.set(0, 1.0 + Math.sin(performance.now() / 90) * 0.06, 0)), SOUND_GLYPH.bang, 0.32, SOUND_INK_OURS.c, 1, 0);
  }

  /** Shout now (also used by the dev panel / the agent through the X key). */
  fire(player: PlayerController, big: boolean): number {
    const { origin, dir } = this.aim(player);
    this.cd = SHOUT.cooldown;
    this.count++;
    const range = big ? SHOUT.bigRange : SHOUT.range;
    const half = big ? SHOUT.bigHalfAngle : SHOUT.halfAngle;
    // visual: the fronts (drawn in step), strokes, marks, a ripple at his feet
    const w = this.waves.find((x) => !x.active) ?? this.waves[0];
    w.active = true;
    w.t = 0;
    w.dur = big ? 0.7 : 0.5;
    w.range = range;
    w.half = half;
    w.big = big;
    w.seed = Math.random() * 20;
    w.origin.copy(origin);
    w.dir.copy(dir);
    this.drawBurst(player, origin, dir, half, range, big);
    player.playAction('chomp', 0.35);
    player.faceDir(new THREE.Vector3(dir.x, 0, dir.z));
    const words = big ? ['HEEEY!!', 'OI!!!', 'HOOOO!!'] : ['HEY!', 'OI!', 'HA!', 'YO!'];
    this.ctx.effects.comic(origin.clone().addScaledVector(dir, 1.6).add(this.tmp.set(0, 0.5, 0)), t(words[Math.floor(Math.random() * words.length)]), big ? '#ffe08a' : '#5ff4e6', big ? 1.15 : 0.8);
    this.ctx.audio.play('shout', { pitch: big ? 0.8 : 1.1, vol: big ? 1 : 0.85 });
    this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, big ? 5 : 2.5);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, big ? 0.35 : 0.12);
    // what hears it
    let reacted = 0;
    const inCone = (p: THREE.Vector3, r: number, need: number) => {
      this.tmp.copy(p).sub(origin);
      const d = this.tmp.length();
      if (d - r > need) return false;
      if (d < r + 1.6) return true;
      const cos = this.tmp.dot(dir) / d;
      const ang = Math.acos(THREE.MathUtils.clamp(cos, -1, 1));
      // the target's size widens the cone a little
      return ang < half + Math.atan2(r, d);
    };
    for (const s of this.targets) {
      if (!s.enabled()) continue;
      if (s.needsBig && !big) {
        if (inCone(s.pos, s.radius, range)) {
          if (s.onShout(false, origin)) reacted++;
        }
        continue;
      }
      if (inCone(s.pos, s.radius, range) && s.onShout(big, origin)) reacted++;
    }
    for (const e of this.enemies()) {
      if (e.disposed || e.harmless) continue;
      const c = e.pos.clone().add(this.tmp.set(0, Math.min(1.6, e.bigness * 2 + 0.5), 0));
      if (!inCone(c, e.bodyRadius + 0.4, range)) continue;
      reacted++;
      if (isReactive(e)) e.onShout(big, origin);
      else {
        // everything else: a sonic shove (attack interrupted, no damage)
        const push = c.clone().sub(origin).setY(0);
        if (push.lengthSq() > 1e-4) e.knock(push.normalize(), (big ? 9 : 5) * (1 - e.bigness * 0.7));
        e.interruptBy(true);
      }
    }
    this.onShout?.(big, reacted);
    return reacted;
  }

  /** The one-off parts of a shout: speed strokes along the cone, flying "!!", a ground ripple, the big extras. */
  private drawBurst(player: PlayerController, origin: THREE.Vector3, dir: THREE.Vector3, half: number, range: number, big: boolean): void {
    const fx = this.ctx.effects.sound;
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.95 ? X : Y).normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    const n = big ? 9 : 6;
    for (let i = 0; i < n; i++) {
      // strokes fan out inside the cone, from just past the mouth
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const off = half * (0.55 + Math.random() * 0.4);
      const d = dir.clone().multiplyScalar(Math.cos(off)).addScaledVector(side, Math.sin(off) * Math.cos(a)).addScaledVector(up, Math.sin(off) * Math.sin(a)).normalize();
      fx.spawnArc({
        c: origin.clone().addScaledVector(d, 0.7), u: d, v: up, r0: 0.5, r1: big ? 1.8 : 1.2, w: big ? 0.07 : 0.05,
        color: i % 3 === 0 ? SOUND_INK_OURS.b : SOUND_INK_OURS.a, mode: ARC_MODE.stroke, vel: d.clone().multiplyScalar(range * 1.4),
        dur: big ? 0.5 : 0.38, delay: Math.random() * 0.06, seed: i,
      });
    }
    const marks = big ? 3 : 2;
    for (let i = 0; i < marks; i++) {
      const v = dir.clone().multiplyScalar(5 + Math.random() * 3).addScaledVector(side, (Math.random() - 0.5) * 5).addScaledVector(up, 1.5 + Math.random() * 2);
      fx.spawnGlyph({
        pos: origin.clone().addScaledVector(dir, 1.1), vel: v, glyph: i === 0 ? SOUND_GLYPH.bang2 : SOUND_GLYPH.bang,
        size: big ? 0.55 : 0.4, color: big ? SOUND_INK_OURS.c : i ? SOUND_INK_OURS.b : SOUND_INK_OURS.a, dur: 0.7, delay: i * 0.06, spin: (Math.random() - 0.5) * 3,
      });
    }
    groundRipple(fx, player.pos, big ? 4.2 : 2.4, big ? SOUND_INK_OURS.c : SOUND_INK_OURS.a, big ? 0.65 : 0.5);
    if (!big) return;
    fx.pulse('rgba(255,224,138,0.9)', 1);
    // up high (the lighthouse gallery): the shout rolls out over the town below in big rings
    const below = this.dropBelow(player.pos);
    if (below === null) return;
    const c = player.pos.clone().setY(below + 0.25);
    for (let i = 0; i < 5; i++) {
      fx.spawnArc({ c, u: X, v: Z, r0: 2 + i, r1: 38 + i * 8, w: 1.2 - i * 0.12, w1: 0.25, color: i % 2 ? SOUND_INK_OURS.b : SOUND_INK_OURS.c, dur: 2.6 + i * 0.3, delay: i * 0.28, seed: i * 5.1, wob: 0.025 });
    }
    // in the air, at the gallery: standing bands that roll away from the tower (seen from the side as ")))")
    const air = player.pos.clone().setY(player.pos.y + 0.8);
    for (let i = 0; i < 3; i++) {
      fx.spawnArc({ c: air, u: X, v: Z, r0: 3, r1: 26 + i * 6, w: 0.75 - i * 0.15, w1: 0.2, color: i % 2 ? SOUND_INK_OURS.a : SOUND_INK_OURS.c, mode: ARC_MODE.band, dur: 1.9 + i * 0.3, delay: 0.1 + i * 0.3, seed: 9 + i, wob: 0.03 });
    }
    fx.spawnArc({ c: player.pos.clone().setY(player.pos.y + 0.1), u: X, v: Z, r0: 1, r1: 12, w: 0.35, w1: 0.08, color: SOUND_INK_OURS.a, dur: 1.1, seed: 3.3, wob: 0.04 });
  }

  /** How far the ground lies below WAI's surroundings, if he stands high over open air (else null). */
  private dropBelow(p: THREE.Vector3): number | null {
    const phys = this.ctx.physics;
    const ys: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const o = this.tmp.set(p.x + Math.cos(a) * 7, p.y + 0.5, p.z + Math.sin(a) * 7);
      const hit = phys.raycast(o, DOWN, 60);
      ys.push(hit ? hit.point.y : p.y - 60);
    }
    const low = ys.filter((y) => p.y - y > HIGH_DROP);
    if (low.length < 5) return null;
    low.sort((a, b) => a - b);
    return Math.max(low[Math.floor(low.length / 2)], p.y - 40);
  }

  clear(): void {
    for (const w of this.waves) w.active = false;
  }
}
