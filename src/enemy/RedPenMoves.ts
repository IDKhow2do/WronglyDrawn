/**
 * [INPUT]: depends on PenRig (the boss's narrow surface, defined here), RedPenBody (pose + its eased turn(), gap), PenHazards (floor marks, ruler,
 *          pools, blots); VoiceEvent from ./RedPenVoice (its lines); PlayerController (pos)
 * [OUTPUT]: exports PenRig, Threat, GroundMove ids, GROUND_STATES, PenGround (start(id), step(state)), the IDLE hop walk
 * [POS]: the Red Pen's ground moveset in the souls-like roof fight (phases 1 and 3), owned by RedPenBoss. Each move is
 *        ONE tell → ONE answer → ONE punish window (see docs/level3/SOULS.md, moveset table):
 *          STAB    rises over WAI, red ring, dives nib-first      → roll out          → STUCK: grip open
 *          RULE    a giant ruler sweeps the whole roof            → jump it           → LEAN: grip open
 *          SWEEP   tips sideways and sweeps its 14 m body round   → roll through it   → SPRAWL: clip + eyes open
 *          SPLAT   shakes its nib, ink blots land as pools        → walk out of rings → DRY: nib open
 *          CRUSH   (WAI hugs its nib) rises and slams a shockwave → jump it           → STUCK: grip open
 *        Phase 3 adds the delays that punish panic rolls: STAB holds before it drops, SWEEP swings back after a pause.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { RedPenBody } from './RedPenBody';
import type { PenHazards } from './RedPenHazards';
import type { PenWeak } from './RedPenLook';
import { t } from '../i18n';
import type { VoiceEvent } from './RedPenVoice';

/** What the Pen is doing to WAI right now (the HUD hint, bots, the lock-on cue). */
export interface Threat {
  id: string;
  stage: 'none' | 'tell' | 'live' | 'open';
  /** The one correct answer. */
  answer: 'none' | 'roll' | 'jump' | 'leave';
  /** Seconds until the hit can land (tell), else 0. */
  eta: number;
  /** Floor centre + radius of the danger (ring attacks). */
  at: THREE.Vector3;
  r: number;
  /** Sweeps: current yaw, signed angular speed (rad/s), reach. */
  yaw: number;
  spin: number;
}

/** The boss's surface the moves use (RedPenBoss implements it). */
export interface PenRig {
  readonly game: GameContext;
  readonly penBody: RedPenBody;
  readonly hz: PenHazards;
  readonly floorY: number;
  readonly arena: THREE.Vector3;
  readonly arenaR: number;
  readonly phase: number;
  readonly state: string;
  readonly stateT: number;
  readonly threat: Threat;
  go(state: string): void;
  /** Wind-up seconds for this difficulty (× SOULS.tell, phase 3 a little quicker). */
  tell(sec: number): number;
  /** Punish-window seconds for this difficulty (× SOULS.punish). */
  punish(sec: number): number;
  /** Open weak points for `sec` seconds (also one TAG). */
  open(points: PenWeak[], sec: number): void;
  hit(heavy: boolean, from: THREE.Vector3, knock: number, word: string): boolean;
  /** A line in its voice (RedPenVoice: rate-limited, one at a time); `chance` 0..1 skips some. */
  say(ev: VoiceEvent, chance?: number): void;
  /** Back to the hop walk; the next attack after `cd` s (Normal; × SOULS.tell, so Gentle waits longer, Hard less). */
  idle(cd: number): void;
  clampToArena(v: THREE.Vector3, margin: number): void;
  thud(strength: number, at: THREE.Vector3): void;
}

export type GroundMove = 'stab' | 'rule' | 'sweep' | 'splat' | 'crush';

export const GROUND_STATES = ['IDLE', 'STAB_TELL', 'STAB_HOLD', 'STAB', 'STUCK', 'PULL', 'RULE_TELL', 'RULE', 'LEAN', 'SWEEP_TELL', 'SWEEP', 'SWEEP_HOLD', 'SWEEP_BACK', 'SPRAWL', 'GETUP', 'SPLAT_TELL', 'SPLAT', 'DRY', 'CRUSH_TELL', 'CRUSH', 'CRUSH_STUCK'] as const;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

/** Sweep geometry: the arc it swings through (yaw from a0 by `span`, sign `dir`). */
interface Sweep {
  a0: number;
  span: number;
  dir: number;
  back: boolean;
}

export class PenGround {
  private target = new THREE.Vector3();
  private hopT = 0;
  private sw: Sweep = { a0: 0, span: 2.6, dir: 1, back: false };
  private struck = false;
  private delayed = false;

  constructor(private b: PenRig) {}

  // ───────────── the hop walk (between attacks) ─────────────
  /** Hop toward a spot `keep` m from WAI, upright, facing him. Each landing is a thud. */
  walk(dt: number, p: PlayerController, keep: number): void {
    const pose = this.b.penBody.pose;
    const f = this.b.floorY;
    const d = Math.hypot(pose.pivot.x - p.pos.x, pose.pivot.z - p.pos.z);
    const period = 1.15;
    const prev = this.hopT;
    this.hopT += dt / period;
    if (Math.floor(this.hopT) !== Math.floor(prev)) {
      // a new hop: pick where it lands (a step of ≤ 3.2 m toward its preferred distance, sliding round WAI)
      _a.set(pose.pivot.x - p.pos.x, 0, pose.pivot.z - p.pos.z);
      if (_a.lengthSq() < 0.01) _a.set(1, 0, 0);
      _a.normalize();
      const ang = Math.atan2(_a.z, _a.x) + 0.25;
      const want = THREE.MathUtils.clamp(d + THREE.MathUtils.clamp(keep - d, -3.2, 3.2), 4, keep + 2);
      this.target.set(p.pos.x + Math.cos(ang) * want, f, p.pos.z + Math.sin(ang) * want);
      this.b.clampToArena(this.target, 3);
      this.b.thud(0.22, pose.pivot);
    }
    const k = this.hopT % 1;
    pose.pivot.x += (this.target.x - pose.pivot.x) * Math.min(1, dt * 2.4);
    pose.pivot.z += (this.target.z - pose.pivot.z) * Math.min(1, dt * 2.4);
    pose.pivot.y = f + Math.sin(k * Math.PI) * 1.1;
    // a slight forward sway toward WAI: it leans over him
    pose.turn('leanYaw', p.pos, dt, 3);
    pose.tilt += (0.1 + Math.sin(k * Math.PI) * 0.04 - pose.tilt) * Math.min(1, dt * 4);
    this.turnFace(p.pos, dt, 2.5);
  }

  private turnFace(at: THREE.Vector3, dt: number, rate: number): void {
    this.b.penBody.pose.turn('face', at, dt, rate);
  }

  // ───────────── start ─────────────
  start(id: GroundMove, p: PlayerController): void {
    const b = this.b;
    const pose = b.penBody.pose;
    this.struck = false;
    switch (id) {
      case 'stab':
        this.target.copy(p.pos).setY(b.floorY);
        this.delayed = b.phase === 3 && Math.random() < 0.55;
        b.go('STAB_TELL');
        b.game.audio.play('telegraph', { pos: pose.pivot, pitch: 0.7 });
        b.say('stab', 0.5);
        return;
      case 'rule':
        b.hz.startRuler(_a.copy(p.pos).sub(pose.pivot).setY(0).lengthSq() > 0.01 ? _a.normalize() : _a.set(0, 0, 1), b.phase === 3 ? 12 : 9);
        b.go('RULE_TELL');
        b.game.audio.play('spinWind', { pos: pose.pivot, pitch: 1.0, vol: 0.9 });
        b.say('rule', 0.5);
        return;
      case 'sweep': {
        const to = yawTo(pose.pivot, p.pos);
        const dir = Math.random() < 0.5 ? 1 : -1;
        // the arc starts well to one side of WAI and ends well past him
        this.sw = { a0: to - dir * 1.25, span: 2.5, dir, back: b.phase === 3 || Math.random() < 0.25 };
        b.go('SWEEP_TELL');
        b.game.audio.play('roar', { pos: pose.pivot, pitch: 0.7, vol: 0.7 });
        b.say('sweep', 0.5);
        return;
      }
      case 'splat':
        b.go('SPLAT_TELL');
        b.game.audio.play('squeak', { pos: pose.pivot, pitch: 0.5 });
        return;
      case 'crush':
        b.go('CRUSH_TELL');
        b.game.audio.play('telegraph', { pos: pose.pivot, pitch: 0.5 });
        return;
    }
  }

  // ───────────── step ─────────────
  step(dt: number, p: PlayerController): void {
    const b = this.b;
    const s = b.state;
    if (s.startsWith('STAB') || s === 'STUCK' || s === 'PULL') return this.stab(dt, p);
    if (s.startsWith('RULE') || s === 'LEAN') return this.rule(dt, p);
    if (s.startsWith('SWEEP') || s === 'SPRAWL' || s === 'GETUP') return this.sweep(dt, p);
    if (s.startsWith('SPLAT') || s === 'DRY') return this.splat(dt, p);
    if (s.startsWith('CRUSH')) return this.crush(dt, p);
  }

  private threat(stage: Threat['stage'], answer: Threat['answer'], eta: number, at?: THREE.Vector3, r = 0): void {
    const th = this.b.threat;
    th.stage = stage;
    th.answer = answer;
    th.eta = eta;
    if (at) th.at.copy(at);
    th.r = r;
    th.spin = 0;
  }

  // ── STAB: up over WAI, a ring that locks on, a nib-first dive; a miss sticks it in the roof ──
  private stab(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT;
    const tell = b.tell(1.15);
    const R = 2.7;
    b.threat.id = 'stab';
    if (b.state === 'STAB_TELL') {
      // tracks WAI until 0.4 s before the drop, then the ring locks (that is the moment to roll)
      if (T < tell - 0.4) this.target.copy(p.pos).setY(f);
      b.clampToArena(this.target, 2);
      const k = ease(Math.min(1, T / (tell * 0.7)));
      pose.pivot.x += (this.target.x - pose.pivot.x) * Math.min(1, dt * 5);
      pose.pivot.z += (this.target.z - pose.pivot.z) * Math.min(1, dt * 5);
      pose.pivot.y = f + 6.5 * k;
      pose.tilt += (0 - pose.tilt) * Math.min(1, dt * 6);
      this.turnFace(p.pos, dt, 4);
      const locked = T >= tell - 0.4;
      b.hz.markRing(this.target, R, locked ? 0.6 + 0.4 * Math.abs(Math.sin(T * 30)) : 0.35);
      this.threat('tell', 'roll', Math.max(0, tell - T) + (this.delayed ? b.tell(0.75) : 0) + 0.12, this.target, R);
      if (T > tell) b.go(this.delayed ? 'STAB_HOLD' : 'STAB');
      return;
    }
    if (b.state === 'STAB_HOLD') {
      // phase 3: it hangs there, trembling, "hmm… hmm…" — an early roll is spent before it drops
      const hold = b.tell(0.75);
      pose.pivot.y = f + 6.5 + Math.sin(T * 40) * 0.08;
      b.hz.markRing(this.target, R, 0.5 + 0.5 * Math.abs(Math.sin(T * 9)));
      this.threat('tell', 'roll', Math.max(0, hold - T) + 0.12, this.target, R);
      if (T > hold) b.go('STAB');
      return;
    }
    if (b.state === 'STAB') {
      const k = Math.min(1, T / 0.16);
      pose.pivot.y = f + 6.5 * (1 - k * k) - 1.1 * k;
      this.threat('live', 'roll', 0, this.target, R);
      if (k >= 1) {
        b.hz.markRing(null);
        b.thud(0.9, this.target);
        b.game.effects.ring(this.target.clone().setY(f + 0.06), '#d8283a', 5);
        const flat = Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z);
        if (flat < R && p.pos.y < f + 2) b.hit(true, this.target, 12, 'CORRECTED!');
        b.go('STUCK');
        b.open(['grip'], b.punish(2.8));
        b.game.effects.comic(pose.point(5.5, 0, _a), t('STUCK!'), '#22c4c0', 1.4);
      }
      return;
    }
    if (b.state === 'STUCK') {
      pose.pivot.y = f - 1.1;
      pose.tilt = 0.28 + Math.sin(T * 15) * 0.025;
      this.threat('open', 'none', 0);
      if (T > b.punish(2.8)) {
        b.go('PULL');
        b.game.audio.play('pop', { pos: pose.pivot, pitch: 0.5 });
      }
      return;
    }
    // PULL: it yanks the nib out and straightens
    pose.pivot.y += (f - pose.pivot.y) * Math.min(1, dt * 6);
    pose.tilt += (0.1 - pose.tilt) * Math.min(1, dt * 5);
    if (T > 0.6) b.idle(b.phase === 3 ? 0.8 : 1.1);
  }

  // ── RULE: the ruler sweeps the whole roof (jump it); then it leans over its line, grip low ──
  private rule(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT;
    b.threat.id = 'rule';
    if (b.state === 'RULE_TELL') {
      const tell = b.tell(1.1);
      // it rears back and taps the ruler (the ruler glows)
      pose.pivot.y += (f - pose.pivot.y) * Math.min(1, dt * 6);
      pose.tilt += (-0.18 - pose.tilt) * Math.min(1, dt * 3);
      this.turnFace(p.pos, dt, 3);
      b.hz.rulerGlow(0.5 + 0.5 * Math.sin(T * 18));
      if (Math.floor(T * 3) !== Math.floor((T - dt) * 3)) b.game.audio.play('stampTick', { pos: pose.pivot, pitch: 0.7 });
      this.threat('tell', 'jump', tell - T + this.rulerEta(p), b.arena, 0);
      if (T > tell) {
        b.hz.goRuler();
        b.go('RULE');
      }
      return;
    }
    if (b.state === 'RULE') {
      pose.tilt += (0.05 - pose.tilt) * Math.min(1, dt * 3);
      this.threat('live', 'jump', this.rulerEta(p), b.arena, 0);
      if (b.hz.rulerDone) {
        b.go('LEAN');
        b.open(['grip'], b.punish(1.9));
        b.game.audio.play('sigh', { pos: pose.pivot, pitch: 0.6 });
      }
      return;
    }
    // LEAN: it bends over the ruled line to admire it — the grip comes down to WAI's height
    pose.tilt += (0.62 - pose.tilt) * Math.min(1, dt * 2.5);
    this.threat('open', 'none', 0);
    if (T > b.punish(1.9)) b.idle(b.phase === 3 ? 0.7 : 1.0);
  }

  /** Seconds until the ruler reaches WAI (Infinity once it passed). */
  private rulerEta(p: PlayerController): number {
    const r = this.b.hz.ruler;
    const d = (p.pos.x - this.b.arena.x) * r.n.x + (p.pos.z - this.b.arena.z) * r.n.z;
    const ahead = d - r.off;
    return ahead < -0.5 ? Infinity : Math.max(0, ahead) / r.speed;
  }

  // ── SWEEP: tips over sideways and swings its whole body round its nib (roll through); then sprawls ──
  private sweep(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT, sw = this.sw;
    b.threat.id = 'sweep';
    const lowTilt = 1.5;
    const dur = 0.95;
    const lift = (tilt: number) => f + 0.95 * Math.pow(Math.sin(Math.min(Math.PI / 2, Math.max(0, tilt))), 6);
    if (b.state === 'SWEEP_TELL') {
      const tell = b.tell(1.35);
      const k = ease(Math.min(1, T / tell));
      pose.leanYaw = sw.a0 - sw.dir * 0.12 * k; // a little wind-up back
      pose.tilt = 1.05 * k;
      pose.face = pose.leanYaw + Math.PI;
      pose.pivot.y = lift(pose.tilt);
      b.hz.markSector(pose.pivot, 14.3, Math.min(sw.a0, sw.a0 + sw.dir * sw.span), Math.max(sw.a0, sw.a0 + sw.dir * sw.span), 0.5 + 0.5 * k);
      if (Math.floor(T * 4) !== Math.floor((T - dt) * 4)) b.game.audio.play('crateStep', { pos: pose.pivot, pitch: 0.4, vol: 0.8 });
      this.sweepThreat('tell', p, tell - T);
      if (T > tell) {
        b.go('SWEEP');
        b.penBody.ghost = true;
        b.game.audio.play('whoosh', { pos: pose.pivot, pitch: 0.4, vol: 1 });
      }
      return;
    }
    if (b.state === 'SWEEP' || b.state === 'SWEEP_BACK') {
      const k = ease(Math.min(1, T / dur));
      const back = b.state === 'SWEEP_BACK';
      const from = back ? sw.a0 + sw.dir * sw.span : sw.a0;
      const dir = back ? -sw.dir : sw.dir;
      pose.leanYaw = from + dir * sw.span * k;
      pose.tilt += (lowTilt - pose.tilt) * Math.min(1, dt * 10);
      pose.face = pose.leanYaw + Math.PI;
      pose.pivot.y = lift(pose.tilt);
      b.threat.yaw = pose.leanYaw;
      this.sweepThreat('live', p, 0);
      b.threat.spin = dir * sw.span * 2 / dur;
      if (!this.struck && b.penBody.gap(p.pos) < 0) {
        this.struck = true;
        b.hit(true, pose.pivot, 14, 'SWEPT ASIDE!');
      }
      if (T >= dur) {
        b.hz.markSector(null);
        if (sw.back && !back) {
          b.go('SWEEP_HOLD');
          this.struck = false;
        } else {
          b.penBody.ghost = false;
          b.go('SPRAWL');
          b.thud(0.8, pose.point(10, 0, _a));
          b.open(['clip', 'eyes'], b.punish(2.5));
          b.game.effects.comic(pose.point(11, 0, _a), t('TIPPED OVER!'), '#22c4c0', 1.3);
        }
      }
      return;
    }
    if (b.state === 'SWEEP_HOLD') {
      // a pause at the end of the arc — "missed a bit" — then it swings back (the early roll is wasted)
      const hold = b.tell(0.6);
      pose.tilt = lowTilt + Math.sin(T * 30) * 0.01;
      b.penBody.ghost = false;
      const a1 = sw.a0 + sw.dir * sw.span;
      b.hz.markSector(pose.pivot, 14.3, Math.min(sw.a0, a1), Math.max(sw.a0, a1), 0.4 + 0.6 * Math.abs(Math.sin(T * 12)));
      this.sweepThreat('tell', p, hold - T);
      if (T > hold) {
        b.go('SWEEP_BACK');
        b.penBody.ghost = true;
        b.game.audio.play('whoosh', { pos: pose.pivot, pitch: 0.45, vol: 1 });
      }
      return;
    }
    if (b.state === 'SPRAWL') {
      // lying flat, eyes up, cap on the roof: the clip and the eyes are within reach
      pose.tilt += (Math.PI / 2 - pose.tilt) * Math.min(1, dt * 6);
      pose.pivot.y = f + 1.2 * Math.sin(pose.tilt);
      this.threat('open', 'none', 0);
      if (T > b.punish(2.5)) {
        b.go('GETUP');
        b.game.audio.play('crateStep', { pos: pose.pivot, pitch: 0.5 });
      }
      return;
    }
    // GETUP: it rights itself (slowly — not an attack)
    const k = Math.min(1, T / 1.1);
    pose.tilt = (Math.PI / 2) * (1 - ease(k)) + 0.1 * ease(k);
    pose.pivot.y = f + 1.2 * Math.sin(pose.tilt) * (1 - k);
    if (k >= 1) {
      pose.face = pose.leanYaw;
      b.idle(b.phase === 3 ? 0.8 : 1.2);
    }
  }

  /** Sweep threat: eta = when the swinging body reaches WAI's bearing (bots and the hint). */
  private sweepThreat(stage: Threat['stage'], p: PlayerController, wait: number): void {
    const b = this.b, sw = this.sw, pose = b.penBody.pose;
    const back = b.state === 'SWEEP_BACK' || b.state === 'SWEEP_HOLD';
    const from = back ? sw.a0 + sw.dir * sw.span : sw.a0;
    const dir = back ? -sw.dir : sw.dir;
    const rel = wrap(yawTo(pose.pivot, p.pos) - from) * dir;
    const d = Math.hypot(p.pos.x - pose.pivot.x, p.pos.z - pose.pivot.z);
    const inArc = rel > -0.2 && rel < sw.span + 0.2 && d < 15.6;
    // ease(k) ≈ k at the middle: approximate the arrival time along the arc
    const k = THREE.MathUtils.clamp(rel / sw.span, 0, 1);
    const tk = k < 0.5 ? Math.sqrt(k / 2) : 1 - Math.sqrt((1 - k) / 2);
    const passed = stage === 'live' && b.stateT > tk * 0.95 + 0.06;
    this.threat(stage, inArc && !passed ? 'roll' : 'none', Math.max(0, wait) + (stage === 'tell' ? tk * 0.95 : Math.max(0, tk * 0.95 - b.stateT)), pose.pivot, 14.3);
    b.threat.yaw = pose.leanYaw;
  }

  // ── SPLAT: it shakes its nib, ink blots fly and stay as pools; then it blows on its nib (nib open) ──
  private splat(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT;
    b.threat.id = 'splat';
    if (b.state === 'SPLAT_TELL') {
      const tell = b.tell(1.0);
      pose.turn('leanYaw', p.pos, dt, 6);
      pose.tilt = 0.12 + Math.sin(T * 26) * 0.12 * Math.min(1, T / 0.3);
      pose.pivot.y = f + Math.min(1, T / tell) * 1.6;
      this.turnFace(p.pos, dt, 5);
      if (Math.floor(T * 8) !== Math.floor((T - dt) * 8)) b.game.effects.burst(pose.point(0.5, 0, _a), '#d8283a', 3, 2, 0.08);
      this.threat('tell', 'leave', tell - T + 1.1, p.pos, 1.7);
      if (T > tell) {
        b.go('SPLAT');
        const n = b.phase === 3 ? 6 : 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random();
          const r = i === 0 ? 0 : 2.8 + Math.random() * 3.5;
          _b.set(p.pos.x + Math.cos(a) * r, f + 0.05, p.pos.z + Math.sin(a) * r);
          b.clampToArena(_b, 1.2);
          b.hz.blots.launch(pose.point(1.2, 0, _a), _b.clone(), 1.05 + i * 0.1);
        }
        b.game.audio.play('spit', { pos: pose.pivot, pitch: 0.5, vol: 1 });
      }
      return;
    }
    if (b.state === 'SPLAT') {
      pose.pivot.y += (f - pose.pivot.y) * Math.min(1, dt * 5);
      pose.tilt += (0.1 - pose.tilt) * Math.min(1, dt * 6);
      this.threat('live', 'leave', Math.max(0, 1.1 - T), p.pos, 1.7);
      if (T > 0.6 && b.hz.blots.active === 0) {
        b.go('DRY');
        b.thud(0.3, pose.pivot);
        b.open(['nib'], b.punish(2.0));
      }
      return;
    }
    // DRY: it leans back and blows on its wet nib (the nib is open, low)
    pose.tilt += (-0.22 - pose.tilt) * Math.min(1, dt * 3);
    if (Math.floor(T * 5) !== Math.floor((T - dt) * 5)) b.game.effects.burst(pose.point(0.4, 0, _a), '#ffffff', 3, 1.5, 0.12, -2);
    this.threat('open', 'none', 0);
    if (T > b.punish(2.0)) b.idle(b.phase === 3 ? 0.7 : 1.0);
  }

  // ── CRUSH: WAI hugs its nib → it rises and slams a shockwave round itself (jump it); the nib sticks ──
  private crush(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT;
    const R = 6.2;
    b.threat.id = 'crush';
    if (b.state === 'CRUSH_TELL') {
      const tell = b.tell(0.9);
      const k = ease(Math.min(1, T / tell));
      pose.pivot.y = f + 2.6 * k;
      pose.tilt += (0 - pose.tilt) * Math.min(1, dt * 6);
      this.target.copy(pose.pivot).setY(f);
      b.hz.markRing(this.target, R * (1.15 - 0.15 * k), 0.4 + 0.6 * k);
      this.threat('tell', 'jump', tell - T + 0.12, this.target, R);
      if (T > tell) b.go('CRUSH');
      return;
    }
    if (b.state === 'CRUSH') {
      const k = Math.min(1, T / 0.13);
      pose.pivot.y = f + 2.6 * (1 - k) - 0.8 * k;
      this.threat('live', 'jump', 0, this.target, R);
      if (k >= 1) {
        b.hz.markRing(null);
        b.thud(1, this.target);
        b.game.effects.ring(this.target.clone().setY(f + 0.08), '#ffffff', R * 1.3);
        b.game.effects.ring(this.target.clone().setY(f + 0.06), '#d8283a', R);
        const flat = Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z);
        if (flat < R && p.pos.y < f + 0.45) b.hit(true, this.target, 13, 'MARGIN!');
        b.go('CRUSH_STUCK');
        b.open(['grip'], b.punish(1.7));
      }
      return;
    }
    pose.pivot.y = f - 0.8;
    pose.tilt = 0.2 + Math.sin(T * 12) * 0.02;
    this.threat('open', 'none', 0);
    if (T > b.punish(1.7)) b.go('PULL');
  }
}
