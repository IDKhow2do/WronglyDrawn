/**
 * [INPUT]: depends on PenRig / Threat from ./RedPenMoves; HushAlly / EraserAlly from ./RedPenAllies; RedPenLook (sketch, X);
 *          PenMarks (via hz.marks); soulsTuning (inkMarks) from meta/Difficulty; OrganType; PlayerController (pos); t from i18n
 * [OUTPUT]: exports SkyRig, SKY_STATES, PenSky (phase 2 moves, the phase-change acts CROSS / SELFX, the Hush drag-down)
 * [POS]: the Red Pen's phase-2 game and its act changes, owned by RedPenBoss (RedPenMoves holds the ground moves):
 *          MARKS   comes down to 5.2 m and sprays correction marks: X crosses + strike-through lines → walk off each outline before its stroke is drawn
 *                  (the main sky attack, every other move; SOULS.inkMarks + 1, one more past the middle of the act); half-way through
 *                  it also lobs three blots at WAI (two attacks at once: the act's pressure)
 *          SWOOP   flies to the rim, a dotted line (3.4 m wide) through WAI, drags its nib across the roof in 1 s → step off the line → SKID: nib + grip open
 *          BLOT    six ink blots over a 9 m patch (one where WAI is, one where he is running to) → walk out of the rings
 *          TILES   a plus of five crossed-out tiles under WAI                                → two steps to get off
 *          SHOUT   (WAI, only while it attacks: cruising at 8.5 m it is out of reach) the Hush wraps it, it sinks, DAZED → eyes + grip open.
 *                  After a drag-down the Hush RESTS (HUSH_REST s, counted from the Pen's rise): shouts do nothing until then,
 *                  so one shout per attack no longer chains the Pen to the roof.
 *          Order:   marks, swoop, marks, blots, marks, swoop, marks, tiles (the counter runs through a RISE: it used to reset there,
 *                  so only marks and swoops ever came and every second move ended with the Pen stuck)
 *          Cadence: tell(0.6) + 0..0.3 s between sky moves (was tell(1.4) + 0..0.5: the author found the act had no pressure).
 *          CROSS   (66 %, 33 %) two giant strokes of an X across the roof → roll off each line; then the sticker is crossed out
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { PlayerController } from '../player/PlayerController';
import type { OrganType } from '../organs/Organ';
import type { EraserAlly, HushAlly } from './RedPenAllies';
import type { RedPenLook } from './RedPenLook';
import type { PenRig, Threat } from './RedPenMoves';
import { t } from '../i18n';
import { soulsTuning } from '../meta/Difficulty';

export interface SkyRig extends PenRig {
  readonly hush: HushAlly;
  readonly eraser: EraserAlly;
  readonly look: RedPenLook;
  /** Advance the act (2 or 3); the boss tells the session. */
  nextPhase(): void;
  crossOut(type: OrganType): void;
  restore(type: OrganType): void;
  phaseBeat(n: number): void;
  readonly hp: number;
  readonly maxHp: number;
}

export const SKY_STATES = ['FLY', 'MARKS', 'BLOT', 'TILE_TELL', 'SWOOP_TELL', 'SWOOP', 'SKID', 'SINK', 'DAZED', 'RISE', 'CROSS', 'SELFX'] as const;

/** Cruising height (out of a shout's reach) and the lower height it sprays marks from (in reach). */
const FLY_H = 8.5;
const SPRAY_H = 5.2;
/** Seconds the Hush rests after a drag-down, from the moment the Pen is back in the sky (÷ SOULS.punish: shorter on Gentle). */
const HUSH_REST = 9;
/** Seconds between two sky moves (× SOULS.tell), plus up to GAP_JITTER. */
const SKY_GAP = 0.6;
const GAP_JITTER = 0.3;
/** The swoop: the dotted band's width (m) and the seconds the nib takes to cross the roof. */
const SWOOP_W = 3.4;
const SWOOP_DUR = 1.0;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class PenSky {
  private flyA = 0;
  private attackCd = 2.5;
  private n = 0;
  private a = new THREE.Vector3();
  private b2 = new THREE.Vector3();
  private crossType: OrganType = 'LEG';
  private struck = false;
  private strokes: THREE.Mesh[] = [];
  private lineDir = new THREE.Vector3();
  /** The Hush's rest after a drag-down (s left); a shout only works at 0. */
  private hushCd = 0;
  private comboDone = false;

  /** Seconds until the Hush can drag the Pen down again (0 = ready). */
  get hushRest(): number {
    return this.hushCd;
  }

  /** The Pen attacks (within a shout's reach) but the Hush is still resting. */
  get resting(): boolean {
    return this.hushCd > 0 && this.attacking;
  }

  private get attacking(): boolean {
    const s = this.b.state;
    return this.b.phase === 2 && (s === 'MARKS' || s === 'BLOT' || s === 'TILE_TELL' || s === 'SWOOP_TELL');
  }

  constructor(private b: SkyRig) {
    // the X it strikes over WAI when it crosses out a sticker (two brushed bars that grow)
    const xm = new THREE.MeshBasicMaterial({ color: '#ff2a3a' });
    for (const r of [0.75, -0.75]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1, 0.22), xm);
      s.rotation.z = r;
      s.visible = false;
      s.userData.noPaint = true;
      b.game.root.add(s);
      this.strokes.push(s);
    }
  }

  private threat(id: string, stage: Threat['stage'], answer: Threat['answer'], eta: number, at?: THREE.Vector3, r = 0): void {
    const th = this.b.threat;
    th.id = id;
    th.stage = stage;
    th.answer = answer;
    th.eta = eta;
    if (at) th.at.copy(at);
    th.r = r;
    th.spin = 0;
  }

  /**
   * Can a SHOUT reach it (and the Hush drag it down)? Only while it attacks: cruising (FLY) it hangs too high. So the
   * moment to shout is while it sprays marks, drops blots, crosses tiles or lines up a swoop — dodge first, then shout.
   */
  get shoutable(): boolean {
    return this.attacking && this.hushCd <= 0;
  }

  step(dt: number, p: PlayerController, valid: boolean): void {
    const s = this.b.state;
    if (this.hushCd > 0 && s !== 'SINK' && s !== 'DAZED' && s !== 'RISE') {
      this.hushCd -= dt;
      if (this.hushCd <= 0 && this.b.phase === 2 && this.b.hush.shown) {
        // the Hush is ready again: say so where the player looks for it
        this.b.game.effects.comic(_a.copy(p.pos).add(_c.set(-2.5, 3.4, 2.5)), t('HUSH IS READY!'), '#b49cff', 1.2);
        this.b.game.audio.play('hush', { pos: p.pos, vol: 0.6, pitch: 1.5 });
      }
    }
    if (s === 'CROSS') return this.cross(dt, p);
    if (s === 'SELFX') return this.selfX(dt);
    if (s === 'SINK' || s === 'DAZED' || s === 'RISE') return this.sink(dt);
    if (s === 'SWOOP_TELL' || s === 'SWOOP' || s === 'SKID') return this.swoop(dt, p);
    if (s === 'MARKS') return this.sprayMarks(dt, p);
    this.fly(dt, p, valid);
  }

  // ───────────── phase 2: flying ─────────────
  private fly(dt: number, p: PlayerController, valid: boolean): void {
    const b = this.b, pose = b.penBody.pose;
    this.flyA += dt * 0.3;
    const r = 9;
    _a.set(b.arena.x + Math.cos(this.flyA) * r, b.floorY + FLY_H + Math.sin(b.stateT * 1.5) * 0.5, b.arena.z + Math.sin(this.flyA) * r);
    const k = Math.min(1, dt * 1.4);
    const vx = (_a.x - pose.pivot.x) * k, vz = (_a.z - pose.pivot.z) * k;
    pose.pivot.x += vx;
    pose.pivot.y += (_a.y - pose.pivot.y) * k;
    pose.pivot.z += vz;
    // it flies nib-first: the cap trails behind, the face turns to WAI
    if (vx * vx + vz * vz > 1e-6) pose.leanYaw += wrap(Math.atan2(-vx, -vz) - pose.leanYaw) * Math.min(1, dt * 2);
    pose.tilt += (0.55 - pose.tilt) * Math.min(1, dt * 2);
    pose.turn('face', p.pos, dt, 3);
    if (b.hush.shown && !b.hush.wrapping && !b.hush.busy) b.hush.goTo(_b.copy(p.pos).add(_c.set(-2.5, 2.6, 2.5)));
    this.threat('fly', 'none', 'none', 0);
    if ((b.state === 'BLOT' || b.state === 'TILE_TELL') && b.stateT > 1.4) b.go('FLY');
    this.attackCd -= dt;
    if (this.attackCd > 0 || !valid || b.state !== 'FLY') return;
    this.n++;
    this.attackCd = b.tell(SKY_GAP) + Math.random() * GAP_JITTER;
    // marks every other move; between them a swoop, then blots or tiles
    const pick = this.n % 4;
    if (pick === 1 || pick === 3) return this.startMarks(p);
    if (pick === 2) return this.startSwoop(p);
    if ((this.n >> 2) % 2 === 0) {
      b.go('BLOT');
      for (let i = 0; i < 6; i++) {
        _b.copy(p.pos).add(_c.set((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9)).setY(b.floorY + 0.05);
        if (i === 0) _b.copy(p.pos).setY(b.floorY + 0.05);
        // the second one leads him: where he will be if he keeps running
        if (i === 1) _b.copy(p.pos).addScaledVector(_c.set(p.vel.x, 0, p.vel.z), 1.1).setY(b.floorY + 0.05);
        b.clampToArena(_b, 1);
        b.hz.blots.launch(pose.point(0.6, 0, _c), _b.clone(), 1.15 + i * 0.12);
      }
      b.game.audio.play('spit', { pos: pose.pivot, pitch: 0.6 });
      this.threat('blot', 'tell', 'leave', 1.15, p.pos, 1.7);
    } else {
      b.go('TILE_TELL');
      b.hz.crossTiles(p.pos, (v, m) => b.clampToArena(v, m));
      this.threat('tiles', 'tell', 'leave', 1.2, p.pos, 3.9);
    }
  }

  /** Called by the boss when a shout lands while it flies: the Hush wraps it, it sinks. */
  wrapped(big: boolean): void {
    const b = this.b;
    b.go('SINK');
    b.hz.markRing(null);
    b.hush.wrap(b.penBody.pose.pivot, 6.4);
    this.hushCd = HUSH_REST / soulsTuning().punish;
    b.game.effects.comic(b.penBody.pose.point(6, 0, _a), t(big ? 'HUSH… DOWN YOU GO!' : 'HUSH!'), '#b49cff', 1.2);
    b.say('shoutDown', 0.7);
    b.game.audio.play('shout', { pos: b.penBody.pose.pivot, pitch: 0.8 });
  }

  // ── SWOOP: a dotted line through WAI, then it drags its nib across the roof along it; the nib sticks at the end ──
  private startSwoop(p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose;
    // the line runs through WAI, roughly from where the Pen is
    this.lineDir.set(p.pos.x - pose.pivot.x, 0, p.pos.z - pose.pivot.z);
    if (this.lineDir.lengthSq() < 0.01) this.lineDir.set(1, 0, 0);
    this.lineDir.normalize();
    const R = b.arenaR - 1.6;
    const ends = this.chord(p.pos, this.lineDir, R);
    this.a.copy(ends[0]);
    this.b2.copy(ends[1]);
    b.go('SWOOP_TELL');
    this.struck = false;
    const tell = b.tell(1.35);
    b.hz.line(this.a, this.b2, SWOOP_W, tell + SWOOP_DUR, 5, false);
    b.game.audio.play('telegraph', { pos: pose.pivot, pitch: 0.6 });
  }

  // ── MARKS: it hangs high over WAI and sprays red correction marks onto the roof (walk off each outline) ──
  private markEnd = 0;
  private startMarks(p: PlayerController): void {
    const b = this.b;
    // denser past the middle of the act (66 → 33 %) and on harder levels
    const f = b.hp / b.maxHp;
    const n = soulsTuning().inkMarks + 1 + (f < 0.5 ? 1 : 0);
    const tell = b.tell(1.6);
    const placed = b.hz.marks.volley(p.pos, n, tell, b.tell(0.35));
    if (!placed.length) return;
    this.markEnd = tell + (placed.length - 1) * b.tell(0.35) + 0.5;
    b.go('MARKS');
    this.comboDone = false;
    b.game.audio.play('spit', { pos: b.penBody.pose.pivot, pitch: 0.45, vol: 1 });
    b.say('marks', 0.6);
  }

  private sprayMarks(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, T = b.stateT;
    // it comes down to spray (within reach of a shout), over the ring between WAI and the middle, nib down and shaking
    _a.copy(p.pos).lerp(b.arena, 0.35).setY(b.floorY + SPRAY_H);
    const k = Math.min(1, dt * 1.6);
    pose.pivot.x += (_a.x - pose.pivot.x) * k;
    pose.pivot.y += (_a.y - pose.pivot.y) * k;
    pose.pivot.z += (_a.z - pose.pivot.z) * k;
    pose.tilt += (0.18 + Math.sin(T * 30) * 0.06 - pose.tilt) * Math.min(1, dt * 6);
    pose.turn('face', p.pos, dt, 3);
    if (b.hush.shown && !b.hush.wrapping && !b.hush.busy) b.hush.goTo(_b.copy(p.pos).add(_c.set(-2.5, 2.6, 2.5)));
    // the spray: ink streams from the nib down to each outline still being drawn
    if (Math.floor(T * 14) !== Math.floor((T - dt) * 14)) {
      const nib = pose.point(0.2, 0, _b);
      for (const m of b.hz.marks.pending()) b.game.effects.burst(nib, '#d8283a', 2, 10, 0.1, 14, _c.subVectors(m.at, nib).normalize());
    }
    // half-way through the volley it also lobs three blots: at WAI, ahead of him, behind him
    if (!this.comboDone && T > this.markEnd * 0.5) {
      this.comboDone = true;
      for (let i = 0; i < 3; i++) {
        _b.copy(p.pos).addScaledVector(_c.set(p.vel.x, 0, p.vel.z), (i - 1) * 1.1).setY(b.floorY + 0.05);
        b.clampToArena(_b, 1);
        b.hz.blots.launch(pose.point(0.6, 0, _c), _b.clone(), 1.15 + i * 0.12);
      }
      b.game.audio.play('spit', { pos: pose.pivot, pitch: 0.6 });
    }
    const eta = b.hz.marks.eta(p.pos);
    this.threat('marks', 'tell', eta < Infinity ? 'leave' : 'none', eta < Infinity ? eta : 0, p.pos, 0);
    if (T > this.markEnd) {
      this.threat('fly', 'none', 'none', 0);
      b.go('FLY');
    }
  }

  /** Where a line through `p` along `d` meets the circle of radius R round the arena (start, end). */
  private chord(p: THREE.Vector3, d: THREE.Vector3, R: number): [THREE.Vector3, THREE.Vector3] {
    const c = this.b.arena;
    const ox = p.x - c.x, oz = p.z - c.z;
    const bq = ox * d.x + oz * d.z;
    const cq = ox * ox + oz * oz - R * R;
    const disc = Math.max(0, bq * bq - cq);
    const s0 = -bq - Math.sqrt(disc), s1 = -bq + Math.sqrt(disc);
    return [new THREE.Vector3(p.x + d.x * s0, this.b.floorY, p.z + d.z * s0), new THREE.Vector3(p.x + d.x * s1, this.b.floorY, p.z + d.z * s1)];
  }

  private swoop(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT;
    const dur = SWOOP_DUR;
    if (b.state === 'SWOOP_TELL') {
      const tell = b.tell(1.35);
      // up to the start of the line, nib down, leaning back
      const k = Math.min(1, dt * 3);
      pose.pivot.x += (this.a.x - pose.pivot.x) * k;
      pose.pivot.z += (this.a.z - pose.pivot.z) * k;
      pose.pivot.y += (f + 5 - pose.pivot.y) * k;
      pose.leanYaw += wrap(Math.atan2(-this.lineDir.x, -this.lineDir.z) - pose.leanYaw) * Math.min(1, dt * 4);
      pose.tilt += (0.7 - pose.tilt) * Math.min(1, dt * 3);
      pose.turn('face', p.pos, dt, 3);
      this.threat('swoop', 'tell', this.onLine(p) ? 'roll' : 'none', tell - T + this.swoopEta(p, dur), this.a, 1.2);
      if (T > tell) {
        b.go('SWOOP');
        b.penBody.ghost = true;
        b.game.audio.play('whoosh', { pos: pose.pivot, pitch: 0.5, vol: 1 });
      }
      return;
    }
    if (b.state === 'SWOOP') {
      const k = Math.min(1, T / dur);
      pose.pivot.lerpVectors(this.a, this.b2, k).setY(f + 0.15 + Math.sin(k * Math.PI) * 0.3);
      pose.tilt += (1.05 - pose.tilt) * Math.min(1, dt * 8);
      if (Math.floor(T * 14) !== Math.floor((T - dt) * 14)) b.game.effects.burst(_a.copy(pose.pivot).setY(f + 0.2), '#d8283a', 4, 4, 0.1);
      this.threat('swoop', 'live', this.onLine(p) ? 'roll' : 'none', Math.max(0, this.swoopEta(p, dur) - T), pose.pivot, 1.2);
      if (!this.struck && b.penBody.gap(p.pos, 0, 8) < 0.1) {
        this.struck = true;
        b.hit(true, pose.pivot, 13, 'UNDERLINED!');
      }
      if (k >= 1) {
        b.penBody.ghost = false;
        b.go('SKID');
        b.thud(0.9, pose.pivot);
        b.open(['nib', 'grip'], b.punish(2.3));
        b.game.effects.comic(pose.point(5, 0, _a), t('STUCK!'), '#22c4c0', 1.4);
      }
      return;
    }
    // SKID: nib dug into the roof at the end of its line, leaning back
    pose.pivot.y += (f - 0.3 - pose.pivot.y) * Math.min(1, dt * 8); // the nib half buried: its tip still above the roof to paint
    pose.tilt += (0.6 - pose.tilt) * Math.min(1, dt * 4);
    this.threat('swoop', 'open', 'none', 0);
    if (T > b.punish(2.3)) {
      b.go('RISE');
      b.game.audio.play('pop', { pos: pose.pivot, pitch: 0.5 });
    }
  }

  private onLine(p: PlayerController): boolean {
    const dx = this.b2.x - this.a.x, dz = this.b2.z - this.a.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = Math.abs((p.pos.x - this.a.x) * dz - (p.pos.z - this.a.z) * dx) / len;
    return side < SWOOP_W;
  }

  /** Seconds from the start of the swoop until the nib passes WAI. */
  private swoopEta(p: PlayerController, dur: number): number {
    const dx = this.b2.x - this.a.x, dz = this.b2.z - this.a.z;
    const len2 = dx * dx + dz * dz || 1;
    const k = THREE.MathUtils.clamp(((p.pos.x - this.a.x) * dx + (p.pos.z - this.a.z) * dz) / len2, 0, 1);
    return k * dur;
  }

  // ── the Hush dragged it down: it lies on the roof, DAZED (eyes + grip open), then rises ──
  private sink(dt: number): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT;
    if (b.state === 'SINK') {
      const k = Math.min(1, T / 1.2);
      pose.pivot.y += (f + 1.2 - pose.pivot.y) * Math.min(1, dt * 3);
      pose.tilt += (Math.PI / 2 - pose.tilt) * Math.min(1, dt * 3);
      pose.face += wrap(pose.leanYaw + Math.PI - pose.face) * Math.min(1, dt * 4);
      b.hush.follow(pose.point(9, 0, _a));
      if (k >= 1) {
        b.go('DAZED');
        b.thud(0.6, pose.point(8, 0, _a));
        b.open(['eyes', 'grip'], b.punish(4.6));
        b.game.audio.play('crash', { pos: pose.pivot, vol: 0.8 });
      }
      this.threat('sink', 'open', 'none', 0);
      return;
    }
    if (b.state === 'DAZED') {
      pose.tilt = Math.PI / 2;
      b.hush.follow(pose.point(9, 0, _a));
      this.threat('dazed', 'open', 'none', 0);
      if (T > b.punish(4.6)) b.go('RISE');
      return;
    }
    // RISE: back up into the sky
    const k = Math.min(1, T / 1.2);
    pose.pivot.y += (f + FLY_H - pose.pivot.y) * Math.min(1, dt * 2.2);
    pose.tilt += (0.55 - pose.tilt) * Math.min(1, dt * 3);
    if (k >= 1) {
      // back up: straight into its next move (no idle hang). The move counter keeps running: resetting it here made
      // the whole act "marks, swoop, stuck" on a loop (every swoop ends in a RISE), and blots / tiles never came
      this.attackCd = 0.5;
      b.go('FLY');
    }
  }

  // ───────────── act changes ─────────────
  startCross(type: OrganType): void {
    const b = this.b;
    this.crossType = type;
    b.hz.clear();
    b.penBody.ghost = false;
    b.go('CROSS');
    b.game.audio.play('phaseSting', { pos: b.penBody.pose.pivot });
    b.game.audio.play('roar', { pos: b.penBody.pose.pivot, pitch: 1.1, vol: 1 });
  }

  /** Two giant strokes of an X across the roof (roll off each line), then the sticker over WAI's head is crossed out. */
  private cross(dt: number, p: PlayerController): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT, prev = T - dt;
    // it hangs high over the middle of the roof and draws
    _a.copy(b.arena).setY(f + 7.5);
    pose.pivot.lerp(_a, Math.min(1, dt * 2));
    pose.turn('leanYaw', p.pos, dt, 4, Math.PI);
    pose.tilt += (0.45 + Math.sin(T * 6) * 0.08 - pose.tilt) * Math.min(1, dt * 3);
    pose.turn('face', p.pos, dt, 4);
    const t1 = b.tell(0.95), t2 = t1 + 0.5 + b.tell(0.8);
    const R = b.arenaR - 0.5;
    const stroke = (rot: number, tell: number) => {
      const d = _b.set(p.pos.x - b.arena.x, 0, p.pos.z - b.arena.z);
      if (d.lengthSq() < 0.01) d.set(1, 0, 0);
      d.normalize().applyAxisAngle(_c.set(0, 1, 0), rot);
      const [a, e] = this.chord(p.pos, d, R);
      b.hz.line(a, e, 2.2, tell, 2.2, true);
      b.game.audio.play('stampSlip', { pos: p.pos, vol: 0.9 });
    };
    if (prev <= 0.02 && T > 0.02) stroke(Math.PI / 4, t1);
    if (prev <= t1 + 0.5 && T > t1 + 0.5) stroke(-Math.PI / 4, b.tell(0.8));
    this.threat('cross', T < t2 ? 'tell' : 'live', b.hz.dangerAt(p.pos) ? 'roll' : 'none', T < t1 ? t1 - T : Math.max(0, t2 - T), p.pos, 1.1);
    // the sticker's own X over WAI's head (after the strokes)
    const x0 = t2 + 0.6;
    const head = _c.copy(p.pos).setY(p.pos.y + 1.6);
    for (let i = 0; i < 2; i++) {
      const s = this.strokes[i];
      const k = THREE.MathUtils.clamp((T - x0 - i * 0.5) / 0.45, 0, 1);
      s.visible = k > 0 && T < x0 + 2.0;
      s.position.copy(head);
      s.scale.set(1, Math.max(0.01, k * 1.8), 1);
      s.lookAt(b.game.camera.camera.position);
      s.rotateZ(i === 0 ? 0.75 : -0.75);
    }
    const at = x0 + 1.25;
    if (T > at && prev <= at) {
      b.game.audio.play('stampHit', { pos: head, vol: 1 });
      b.game.effects.comic(head.clone().setY(head.y + 0.8), t('CROSSED OUT!'), '#ff2a3a', 1.1);
      b.game.camera.shake = Math.max(b.game.camera.shake, 0.5);
      b.crossOut(this.crossType);
      b.say(this.crossType === 'LEG' ? 'phase2' : 'phase3');
    }
    if (T > x0 + 2.3) {
      for (const s of this.strokes) s.visible = false;
      if (b.phase === 1) {
        // the Hush flies in first, so the act's camera beat finds it
        b.hush.enter(b.arena.clone().add(_a.set(-b.arenaR - 6, 8, -4)), b.arena.clone().add(_b.set(-b.arenaR + 3, 3, -3)));
        b.nextPhase();
        this.attackCd = b.tell(2.5);
        b.go('FLY');
        b.say('sky');
      } else {
        b.nextPhase();
        b.go('SELFX');
      }
    }
  }

  /** Phase 3 starts: it strikes itself out and fades to a sketch; the Eraser bounces in with the Legs. */
  private selfX(dt: number): void {
    const b = this.b, pose = b.penBody.pose, f = b.floorY, T = b.stateT, prev = T - dt;
    pose.pivot.lerp(_a.copy(b.arena).setY(f), Math.min(1, dt * 2));
    pose.tilt += (0.05 - pose.tilt) * Math.min(1, dt * 3);
    b.look.setCrossed(T > 0.6 && T < 2.2);
    if (T > 0.6 && prev <= 0.6) {
      b.game.audio.play('stampHit', { pos: pose.pivot, vol: 1, pitch: 0.7 });
      b.say('selfx');
    }
    b.look.setSketch(THREE.MathUtils.clamp((T - 1.6) / 1.2, 0, 1));
    this.threat('selfx', 'none', 'none', 0);
    if (T > 2.2 && prev <= 2.2) {
      b.phaseBeat(3);
      b.eraser.enter(b.arena.clone().add(_a.set(b.arenaR + 4, 0, b.arenaR + 4)), b.arena.clone().add(_b.set(6, 0, 7)));
    }
    if (T > 4.0 && prev <= 4.0) {
      b.eraser.rub();
      b.restore('LEG');
    }
    if (T > 4.6) {
      b.hush.hide();
      b.idle(1.5);
    }
  }

  reset(): void {
    this.attackCd = 2.5;
    this.hushCd = 0;
    this.n = 0;
    for (const s of this.strokes) s.visible = false;
  }

  dispose(): void {
    for (const s of this.strokes) s.removeFromParent();
  }
}
