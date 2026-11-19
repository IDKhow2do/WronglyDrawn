/**
 * [INPUT]: depends on EnemyBase (damage routing, TAG reel, bloom) from ./EnemyBase; buildRedPen / PenWeak from ./RedPenLook (given the
 *          Tripo body from ctx.assets slot `redPen`; `?pen=drawn` keeps the body drawn from primitives); RedPenBody
 *          (pose, capsules) from ./RedPenBody; PenHazards from ./RedPenHazards; PenGround (ground moves) from ./RedPenMoves; PenSky
 *          (phase 2, act changes) from ./RedPenSky; EraserAlly/HushAlly from ./RedPenAllies; PenVoice (its lines) from ./RedPenVoice;
 *          soulsTuning from meta/Difficulty; PlayerController (takeHit); OrganType; t from i18n
 * [OUTPUT]: exports RedPenBoss (kind 'redpen'): awake/engage()/counterHint (BossLike), phase, seen, onShout (ShoutReactive), hooks
 *           onCrossOut / onRestore / onPhase / onTip, threat + openPoints() + ruler/tiles (HUD marker, the Y view swing, bots), nearAlpha, restartAt()（重新准备当前阶段并可保留血量比例）,
 *           voice (PenVoice: SoulsFight shows its lines)
 * [POS]: THE RED PEN, level 3's final boss on the Correction Tower's roof — a 14 m souls-like boss (docs/level3/SOULS.md). This file
 *        is the brain's spine: the act gates (66 / 33 / 4 %), the damage rule (armoured everywhere but the weak point a move
 *        leaves open; it stays RED: progress is WAI's paint splatted on it, never the game-wide repaint tint; never shoved), the attack picker, the hop walk, the TAG anchor, the won-over ending (it DRAWS), what it says when (voice events: the
 *        stickers WAI borrowed, hits both ways, act changes, a wavering voice as paint gets on it), and the allies' help each step. The moves live in
 *        RedPenMoves (ground) and RedPenSky (phase 2 + act changes); the body in RedPenBody; marks and hazards in RedPenHazards.
 *        WorksSession / SoulsFight wire the hooks (stickers, story, the gate, the HUD); WorksStory plays the intro and the finale.
 *        Paint on it before the fight reaches onIgnored (SoulsFight's NotYet says what is missing).
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import type { OrganType } from '../organs/Organ';
import { t } from '../i18n';
import { soulsTuning } from '../meta/Difficulty';
import { buildRedPen, type PenWeak, type RedPenLook } from './RedPenLook';
import { PEN_SCALE, RedPenBody } from './RedPenBody';
import { PenHazards } from './RedPenHazards';
import { PenGround, type GroundMove, type PenRig, type Threat } from './RedPenMoves';
import { PenSky, type SkyRig } from './RedPenSky';
import { EraserAlly, HushAlly } from './RedPenAllies';
import { PenVoice, type VoiceEvent } from './RedPenVoice';

const GATES = [0.66, 0.33, 0.04];
const BASE_HP = 6500;
/** Damage share of a hit that misses every open weak point: no window / a window. */
const ARMOUR = 0.18;
const WINDOW_BODY = 0.5;
const WEAK_MUL: Record<PenWeak, number> = { nib: 2.6, grip: 2.6, clip: 3, eyes: 3 };
const ALL_WEAK: PenWeak[] = ['nib', 'grip', 'clip', 'eyes'];
/** Phase 1 teaches its moves in this order, then picks. */
const LESSON: GroundMove[] = ['rule', 'stab', 'sweep', 'splat'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** Seconds the won-over Pen spends drawing its loop before it steps back to admire it (done before the result card:
 * the game stops stepping there, and the Pen stays where it stands). */
const DRAW_LOOP = 5.2;
const DOWN = new THREE.Vector3(0, -1, 0);

export class RedPenBoss extends EnemyBase implements PenRig, SkyRig {
  readonly kind = 'redpen';
  readonly displayName = 'THE RED PEN';
  readonly bigness = 1;
  awake = false;
  phase = 1;
  /** Set every step by the session in phase 3: WAI's True Sight is on it. */
  seen = false;
  /** Arena centre (roof) + radius (the session sets both). */
  readonly arena = new THREE.Vector3();
  arenaR = 17;
  readonly floorY: number;
  readonly look: RedPenLook;
  readonly hush: HushAlly;
  readonly eraser: EraserAlly;
  readonly penBody: RedPenBody;
  readonly hz: PenHazards;
  /** What it says (rate-limited; SoulsFight shows the lines). */
  readonly voice = new PenVoice();
  readonly threat: Threat = { id: 'none', stage: 'none', answer: 'none', eta: 0, at: new THREE.Vector3(), r: 0, yaw: 0, spin: 0 };
  onCrossOut: ((type: OrganType) => void) | null = null;
  onRestore: ((type: OrganType) => void) | null = null;
  /** Phase change (2, 3) and the final fall (4): captions / camera. */
  onPhase: ((n: number) => void) | null = null;
  onTip: ((key: string, text: string) => void) | null = null;
  /** A hit on WAI landed (heavy = knock-down): the fight's HUD / gate listen. */
  onWaiHit: ((heavy: boolean) => void) | null = null;
  private ground: PenGround;
  private sky: PenSky;
  /** Open weak points → seconds left. */
  private opened = new Map<PenWeak, number>();
  private attackCd = 3;
  private lesson = 0;
  private lastMove: GroundMove | null = null;
  private hugT = 0;
  private tipCd = 0;
  /** Seconds until it remarks on the stickers WAI borrowed; WAI's True Sight already remarked on (phase 3). */
  private remarkCd = 9;
  private remarkN = 0;
  private sawSeen = false;
  private wai: PlayerController | null = null;
  private prevQ = new THREE.Quaternion();
  private prevPivot = new THREE.Vector3();
  private alpha = 1;
  private drawT = 0;
  /** Yaw it waits facing (toward the ink gate; the session sets it). */
  waitFace = Math.PI * 0.75;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, BASE_HP, 1.1, 1.3);
    this.floorY = start.y;
    this.arena.copy(start);
    // the default capsule goes: the Pen's body is four capsules that follow its pose (RedPenBody)
    ctx.physics.untag(this.collider);
    ctx.physics.world.removeCollider(this.collider, false);
    this.penBody = new RedPenBody(ctx, this.body, this);
    this.collider = this.penBody.colliders[2];
    // the sculpted body (Tripo slot `redPen`); `?pen=drawn` or a missing file → the body drawn from primitives
    const drawn = new URLSearchParams(location.search).get('pen') === 'drawn';
    this.look = buildRedPen(drawn ? null : ctx.assets.instantiateModel('redPen', { pivot: 'raw' }));
    this.look.root.scale.setScalar(PEN_SCALE);
    this.root.add(this.look.root);
    this.paintAnchor = this.look.body;
    this.hz = new PenHazards(ctx, this.floorY, this.arena, () => this.arenaR, (heavy, from, knock, word) => this.hit(heavy, from, knock, word));
    this.hush = new HushAlly(ctx);
    this.eraser = new EraserAlly(ctx);
    this.hush.onJoin = () => this.voice.ally('hush');
    this.eraser.onJoin = () => this.voice.ally('eraser');
    this.ground = new PenGround(this);
    this.sky = new PenSky(this);
    this.restartAt(1);
  }

  // ───────────── PenRig ─────────────
  get game(): GameContext {
    return this.ctx;
  }
  go(state: string): void {
    this.setState(state);
  }
  tell(sec: number): number {
    return sec * soulsTuning().tell * (this.phase === 3 ? 0.88 : 1);
  }
  punish(sec: number): number {
    return sec * soulsTuning().punish;
  }
  /** Open weak points for `sec` s; `tag` = this window also allows one TAG (the Eraser's quick rub does not). */
  open(points: PenWeak[], sec: number, tag = true): void {
    this.opened.clear();
    for (const id of points) this.opened.set(id, sec);
    this.tagSpent = !tag;
    this.ctx.audio.play('reveal', { pos: this.penBody.weakPos(points[0], _a), pitch: 0.7, vol: 0.8 });
    this.tip(`open-${points.join('-')}`, points.includes('grip') ? 'Its GRIP is open (the glowing rings)! Paint it — then TAG IT (E).' : points.includes('clip') ? 'It tipped over! Its CLIP and EYES are on the roof — paint them!' : points.includes('eyes') ? 'It’s lying DAZED — paint its EYES, then TAG IT!' : 'Its wet NIB is open — paint it!');
  }
  hit(heavy: boolean, from: THREE.Vector3, knock: number, word: string): boolean {
    const p = this.wai;
    if (!p || p.smudged) return false;
    const ok = p.takeHit(from, heavy ? soulsTuning().heavy : 1, knock);
    if (ok) {
      this.ctx.effects.comic(p.pos.clone().setY(p.pos.y + 1.9), t(word), '#d8283a', heavy ? 1 : 0.75);
      this.onWaiHit?.(heavy);
      this.say(this.voice.waver > 0.5 ? 'lateHit' : 'hitWai', heavy ? 0.8 : 0.45);
    }
    return ok;
  }
  say(ev: VoiceEvent, chance = 1): void {
    this.voice.say(ev, chance);
  }
  idle(cd: number): void {
    this.setState('IDLE');
    this.attackCd = cd * soulsTuning().tell;
    this.opened.clear();
    this.threat.stage = 'none';
    this.threat.answer = 'none';
  }
  clampToArena(v: THREE.Vector3, margin: number): void {
    const dx = v.x - this.arena.x, dz = v.z - this.arena.z;
    const d = Math.hypot(dx, dz);
    const lim = this.arenaR - margin;
    if (d > lim) {
      v.x = this.arena.x + (dx / d) * lim;
      v.z = this.arena.z + (dz / d) * lim;
    }
  }
  thud(strength: number, at: THREE.Vector3): void {
    const d = this.wai ? this.wai.pos.distanceTo(at) : 10;
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, strength * Math.max(0.25, 1 - d / 30));
    this.ctx.audio.play(strength > 0.6 ? 'slamLand' : 'bigStep', { pos: at, vol: Math.min(1, 0.5 + strength), pitch: 0.6 });
    this.ctx.effects.burst(_b.copy(at).setY(this.floorY + 0.2), '#f6e8d0', Math.round(6 + strength * 14), 3 + strength * 4, 0.12, 8);
    // a heavy landing leaves a correction-red ink mark on the roof
    if (strength >= 0.6) this.ctx.effects.splat(_b.copy(at).setY(this.floorY + 0.02), UP, '#b0142a', 1.1 + strength * 0.9, DOWN);
  }
  // SkyRig
  nextPhase(): void {
    this.phase++;
    this.onPhase?.(this.phase);
  }
  crossOut(type: OrganType): void {
    this.onCrossOut?.(type);
  }
  restore(type: OrganType): void {
    this.onRestore?.(type);
  }
  phaseBeat(n: number): void {
    if (n === 3) this.onPhase?.(3);
  }

  // ───────────── reset / start ─────────────
  protected override hpMultiplier(): number {
    return super.hpMultiplier() * soulsTuning().penHp;
  }

  /** 在指定阶段等候开战。重试时沿用上次交战的血量比例。 */
  restartAt(phase: number, remainingHp = phase === 1 ? 1 : GATES[phase - 2]): void {
    this.awake = false;
    this.alerted = false;
    this.tagSpent = false;
    this.syncToughness();
    this.phase = phase;
    this.hp = remainingHp * this.maxHp;
    this.opened.clear();
    this.hz.clear();
    this.sky.reset();
    this.lesson = phase === 1 ? 0 : LESSON.length;
    this.lastMove = null;
    this.hugT = 0;
    this.drawT = 0;
    this.penBody.ghost = false;
    this.look.setCrossed(false);
    this.look.setSketch(phase === 3 ? 1 : 0);
    this.hush.hide();
    this.eraser.hide();
    this.hush.resetHelp();
    this.eraser.resetHelp();
    this.voice.clear();
    this.remarkCd = 9;
    this.sawSeen = false;
    const pose = this.penBody.pose;
    pose.pivot.copy(this.home);
    pose.tilt = 0;
    // it waits facing the way in (the gate is where the session's arena centre points to WORKS.gate)
    pose.leanYaw = pose.face = this.waitFace;
    this.penBody.snap();
    this.prevQ.copy(pose.q);
    this.prevPivot.copy(pose.pivot);
    this.pos.copy(pose.pivot);
    this.prevPos.copy(this.pos);
    this.setState('WAIT');
    this.threat.id = 'none';
    this.threat.stage = 'none';
    this.threat.answer = 'none';
  }

  engage(): void {
    this.awake = true;
    this.alerted = true;
    this.attackCd = this.phase === 1 ? 2.4 : 1.5;
    if (this.phase === 1) this.say('start');
    if (this.phase === 1) this.setState('IDLE');
    else if (this.phase === 2) {
      this.hush.enter(this.arena.clone().add(_a.set(-this.arenaR - 6, 8, -4)), this.arena.clone().add(_b.set(-this.arenaR + 3, 3, -3)));
      this.setState('RISE');
    } else {
      this.eraser.enter(this.arena.clone().add(_a.set(this.arenaR + 4, 0, this.arenaR + 4)), this.arena.clone().add(_b.set(6, 0, 7)));
      this.setState('IDLE');
    }
  }

  get counterHint(): string {
    const s = this.state;
    const th = this.threat;
    if (s === 'FINAL') return 'It’s stuck nib-first, trembling — TAG IT to lend it your paint! (E)';
    if (this.opened.size) {
      const ids = [...this.opened.keys()];
      return ids.includes('clip') ? 'It tipped over — paint its CLIP and EYES on the roof, then TAG IT!' : ids.includes('eyes') ? 'DAZED on the roof — paint its EYES, then TAG IT!' : ids.includes('nib') && ids.length === 1 ? 'Its wet NIB is open — paint it!' : 'Its GRIP is open (glowing rings) — paint it, then TAG IT!';
    }
    if (s === 'CROSS') return 'It draws a giant X — ROLL off each red line!';
    if (s === 'SELFX') return 'It’s crossing ITSELF out…';
    if (th.id === 'marks' && th.stage === 'tell') return 'Correction marks! WALK off each red outline before its stroke is drawn to the end.';
    if (th.stage === 'tell' || th.stage === 'live') {
      if (th.id === 'stab') return 'It rears up over you — ROLL out of the red ring when it locks!';
      if (th.id === 'rule') return 'A giant ruler sweeps the roof — JUMP it!';
      if (th.id === 'sweep') return 'It tips sideways — ROLL THROUGH its body as it swings!';
      if (th.id === 'splat') return 'Ink blots! WALK out of the red rings (and the pools they leave).';
      if (th.id === 'crush') return 'You’re too close — JUMP the shockwave!';
      if (th.id === 'swoop') return 'It aims along the dotted line — get OFF it (roll as it comes)!';
    }
    if (this.phase === 2 && this.sky.hushRest > 0) return 'The Hush is catching its breath. DODGE — it cannot drag the Pen down again yet!';
    if (this.phase === 2) return this.sky.shoutable ? 'It came down to attack — SHOUT at it now (X)! The Hush will drag it down.' : 'It cruises out of reach. Dodge its next attack — it comes down to make it: then SHOUT (X)!';
    if (this.phase === 3) return this.seen ? 'You can see it — but only its open spots take paint. Read its moves!' : 'It crossed itself out: AIM with your Eye (right-click / Z) to see it';
    return 'Read its wind-ups, answer, then paint the spot it leaves open';
  }

  get engaged(): boolean {
    return this.awake && !this.harmless;
  }

  /** Is the boss solid to paint right now (phase 3: only while seen, or while a weak point is open)? */
  get visibleToPaint(): boolean {
    return this.phase !== 3 || this.seen || this.state === 'FINAL' || this.opened.size > 0;
  }

  /** Open weak points (world position, radius) — the HUD marker, the Y view swing, bots. */
  openPoints(): { id: PenWeak; pos: THREE.Vector3; r: number; left: number }[] {
    const out: { id: PenWeak; pos: THREE.Vector3; r: number; left: number }[] = [];
    for (const [id, left] of this.opened) out.push({ id, pos: this.penBody.weakPos(id), r: this.penBody.weakRadius(id), left });
    return out;
  }

  /** The point the Y view swing goes to when nothing is open (the barrel's middle). */
  bodyPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return this.penBody.pose.point(this.phase === 2 ? 5 : 7.5, 0, out);
  }

  get ruler(): PenHazards['ruler'] {
    return this.hz.ruler;
  }
  get tiles(): PenHazards['tiles'] {
    return this.hz.tiles;
  }

  // ───────────── damage rules ─────────────
  protected override hpFloor(): number {
    return (GATES[this.phase - 1] ?? 0) * this.maxHp;
  }

  protected override weakPoints(): WeakPoint[] {
    const out: WeakPoint[] = [];
    for (const id of this.opened.keys()) out.push({ pos: this.penBody.weakPos(id), radius: this.penBody.weakRadius(id), mul: WEAK_MUL[id] });
    return out;
  }

  override get canBeTagged(): boolean {
    return (this.opened.size > 0 || this.state === 'FINAL') && !this.tagSpent && !this.harmless && this.awake;
  }

  /** Reels are scripted (punish windows): paint thresholds never stagger the Pen. */
  protected override stagger(): void {}

  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (!this.awake) {
      // behind its ink curtain before the fight: the session says why (NotYet)
      this.onIgnored?.(info.point, 'paint', info.color);
      return { weak: false, absorbed: true };
    }
    if (this.state === 'FINAL') {
      // only the TAG finishes it (the combat director marks the target spent when the TAG starts)
      if (this.tagSpent && info.kind === 'spit') {
        this.hp = 0;
        this.finish();
        return { weak: true, finished: true };
      }
      this.tip('final', 'Spraying won’t reach it now — TAG IT and lend it your paint! (E)');
      return { weak: false, absorbed: true };
    }
    if (this.state === 'CROSS' || this.state === 'SELFX') return { weak: false, absorbed: true };
    if (!this.visibleToPaint) {
      this.tip('sketch', 'Your paint goes right through a sketch! AIM with your Eye (right-click / Z) — what you look at is real.');
      return { weak: false, absorbed: true };
    }
    // the TAG's slap (5 % of the bar for every boss) lands at half weight on the giant, whole while a window is open
    if (info.kind === 'spit' && this.tagSpent && this.opened.size) {
      info.amount *= 0.5;
      return null;
    }
    if (!this.opened.size) {
      info.amount *= ARMOUR;
      this.tip(`armour${this.phase}`, this.phase === 2 ? 'Up there it shrugs paint off. SHOUT at it — the Hush is waiting to wrap it.' : 'Red ink corrects your paint away! Answer its move — the spot it leaves open (glowing) takes real paint.');
    } else {
      let onWeak = false;
      for (const id of this.opened.keys()) if (info.point.distanceTo(this.penBody.weakPos(id, _a)) < this.penBody.weakRadius(id)) onWeak = true;
      if (!onWeak) info.amount *= WINDOW_BODY;
    }
    return null;
  }

  private tip(key: string, text: string): void {
    if (this.tipCd > 0) return;
    this.tipCd = 5;
    this.onTip?.(key, text);
  }

  protected override onHit(info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'hitWeak' : 'hit', { pos: this.pos, pitch: 0.7, vol: 0.6 });
    // paint on it: cold at first, then (phase 3, the more paint, the more) its voice wavers
    if (weak && this.state !== 'FINAL') this.say(this.voice.waver > 0.5 ? 'lateHurt' : 'hurt', this.voice.waver > 0.5 ? 0.5 : 0.25);
    // progress shows as WAI's paint stuck on a red pen (the Pen itself stays red: see keepRed())
    const now = performance.now();
    if (now - this.splatAt > (weak ? 90 : 160)) {
      this.splatAt = now;
      this.splatOnBody(info.point, info.color ?? '#2a4be0', weak ? 1.7 : 1.2);
    }
  }
  private splatAt = 0;

  /** A paint splat on the Pen's surface at `at` (normal = away from its axis). */
  private splatOnBody(at: THREE.Vector3, color: string, size: number): void {
    const pose = this.penBody.pose;
    const ax = pose.axis(_b);
    const along = THREE.MathUtils.clamp(_a.subVectors(at, pose.pivot).dot(ax), 0, 14);
    const n = _a.copy(at).sub(pose.point(along, 0, _c)).normalize();
    if (n.lengthSq() < 0.5) return;
    // on the surface it shows (the capsules are a little fatter)
    const r = this.look.radiusAt(along / PEN_SCALE) * PEN_SCALE;
    this.look.addSplat(_c.copy(pose.point(along, 0, _c)).addScaledVector(n, r), n, color, Math.min(size, r * 2));
  }

  /** Splats of every colour down its body (won over: a red pen with paint on it). */
  private paintAll(): void {
    const pose = this.penBody.pose;
    const cols = ['#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a', '#2a4be0'];
    for (let i = 0; i < 16; i++) {
      const along = 1.5 + (i / 16) * 11.5;
      const ang = i * 2.4;
      const r = along < 2.4 ? 0.6 : along > 10.8 ? 1.26 : 1.15;
      // a point on the surface: the local ring offset, turned by the pose
      _a.set(Math.cos(ang) * r, along, Math.sin(ang) * r).applyQuaternion(pose.q).add(pose.pivot);
      this.splatOnBody(_a, cols[i % 5], 2.2);
    }
  }

  /** The Red Pen stays RED in this fight: undo the game-wide repaint tint every frame (after EnemyBase applied it), no fog. */
  private redBase: { m: THREE.MeshStandardMaterial; c: THREE.Color }[] | null = null;
  private keepRed(): void {
    if (!this.redBase) {
      this.redBase = [];
      for (const m of this.look.mats) if (m.color) this.redBase.push({ m, c: m.color.clone() });
      // and no roof haze on it: 15–20 m away the dusk fog washed the red body to pink / lilac
      this.look.root.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const m of Array.isArray(mm) ? mm : mm ? [mm] : []) if ('fog' in m && (m as THREE.MeshBasicMaterial).fog) {
          (m as THREE.MeshBasicMaterial).fog = false;
          m.needsUpdate = true;
        }
      });
    }
    for (const r of this.redBase) r.m.color.copy(r.c);
  }

  /** 0..1 how solid the Pen is drawn (SoulsFight fades it when the camera is right against it). */
  nearAlpha = 1;

  /** Bosses are not shoved: no knock-backs, ever (WAI's slaps and jumps never move the Pen). */
  override knock(): void {}

  /** ShoutReactive: phase 2 — the Hush catches the shout and drapes the flying Pen. */
  onShout(big: boolean, _from: THREE.Vector3): void {
    if (this.phase === 2 && this.hush.shown && this.sky.resting) {
      // a shout that does nothing must say why (the Hush rests after a drag-down)
      this.ctx.effects.comic(this.penBody.pose.point(6, 0, new THREE.Vector3()), t('THE HUSH NEEDS A BREATH!'), '#b49cff', 1.1);
      this.ctx.audio.play('denied', { vol: 0.5 });
      return;
    }
    if (this.phase !== 2 || !this.hush.shown || !this.sky.shoutable) return;
    this.hz.markRing(null);
    this.sky.wrapped(big);
  }

  /** Dev tools: jump straight to a phase (1..3) or the final TAG (4). */
  debugPhase(n: number): void {
    if (!this.awake) this.engage();
    if (n >= 2 && this.phase < 2) {
      this.onCrossOut?.('LEG');
      this.restartAt(2);
      this.engage();
    }
    if (n >= 3 && this.phase < 3) {
      this.onCrossOut?.('MOUTH');
      this.restartAt(3);
      this.engage();
      this.onRestore?.('LEG');
    }
    if (n >= 4) {
      this.hp = GATES[2] * this.maxHp;
      this.startFinal();
    }
  }

  // ───────────── brain ─────────────
  override step(dt: number, player: PlayerController): void {
    this.prevQ.copy(this.penBody.pose.q);
    this.prevPivot.copy(this.penBody.pose.pivot);
    super.step(dt, player);
    // the logical position: the TAG anchor (the open weak point nearest WAI, at its height) or the nib
    const pose = this.penBody.pose;
    let anchor = pose.pivot;
    let best = Infinity;
    for (const id of this.opened.keys()) {
      const w = this.penBody.weakPos(id, _b);
      const d = w.distanceTo(player.pos);
      if (d < best) {
        best = d;
        anchor = _a.copy(w).setY(Math.max(this.floorY, Math.min(w.y - 1.2, this.floorY + 0.5)));
      }
    }
    this.pos.copy(anchor);
    this.facing = pose.face;
    this.penBody.sync();
  }

  protected ai(dt: number, player: PlayerController): void {
    this.wai = player;
    this.tipCd = Math.max(0, this.tipCd - dt);
    this.hz.update(dt, player);
    this.hush.update(dt, this.floorY);
    this.eraser.update(dt, this.floorY);
    if (this.awake && !this.harmless && this.state !== 'FINAL') this.helpers(dt, player);
    for (const [id, left] of this.opened) {
      if (left - dt <= 0) this.opened.delete(id);
      else this.opened.set(id, left - dt);
    }
    if (this.state === 'STUNNED' || this.state === 'CALM') {
      this.hz.clear();
      this.stepDrawing(dt);
      return;
    }
    if (!this.awake) {
      // waiting on the roof: a slow, bored sway (it is correcting the sky)
      const pose = this.penBody.pose;
      pose.pivot.copy(this.home);
      pose.tilt = 0.06 + Math.sin(this.stateT * 0.7) * 0.03;
      pose.leanYaw = this.waitFace + Math.sin(this.stateT * 0.3) * 0.5;
      // it watches WAI once he is on the roof
      const want = Math.abs(player.pos.y - this.floorY) < 3 ? Math.atan2(player.pos.x - pose.pivot.x, player.pos.z - pose.pivot.z) : this.waitFace;
      pose.face += Math.atan2(Math.sin(want - pose.face), Math.cos(want - pose.face)) * Math.min(1, dt * 1.5);
      return;
    }
    // act gates: the floor reached → the next act (never in the middle of a swing)
    if (this.hp <= this.hpFloor() + 0.5 && this.state !== 'CROSS' && this.state !== 'SELFX' && this.state !== 'FINAL' && !this.penBody.ghost) {
      this.opened.clear();
      if (this.phase === 3) return this.startFinal();
      this.sky.startCross(this.phase === 1 ? 'LEG' : 'MOUTH');
      return;
    }
    if (this.state === 'FINAL') return;
    const valid = !player.smudged;
    const s = this.state;
    if (this.phase === 2 || s === 'CROSS' || s === 'SELFX') return this.sky.step(dt, player, valid);
    if (s === 'IDLE') return this.stepIdle(dt, player, valid);
    this.ground.step(dt, player);
  }

  /** The allies' own help (cooldowns inside them), the voice's waver, its remarks on the stickers WAI borrowed. */
  private helpers(dt: number, p: PlayerController): void {
    if (this.phase === 2) this.hush.help(dt, this.hz.marks, p.pos);
    if (this.phase === 3 && this.state !== 'SELFX') {
      const walking = this.state === 'IDLE' && !this.opened.size;
      this.eraser.help(dt, {
        hz: this.hz,
        wai: p.pos,
        away: this.penBody.pose.pivot,
        floorY: this.floorY,
        nib: walking ? this.penBody.pose.pivot : null,
        rubPen: () => this.open(['nib'], this.punish(1.6), false),
      });
    }
    const f = this.hp / this.maxHp;
    this.voice.waver = this.phase === 3 ? THREE.MathUtils.clamp((0.33 - f) / 0.29, 0, 1) : 0;
    if (this.phase === 3 && this.seen && !this.sawSeen) {
      this.sawSeen = true;
      this.say('eye');
    }
    // now and then it remarks on the stickers WAI wears (the ones not crossed out in this act)
    this.remarkCd -= dt;
    if (this.remarkCd <= 0 && this.state !== 'CROSS' && this.state !== 'SELFX') {
      this.remarkCd = 13;
      const worn: VoiceEvent[][] = [[], ['legs', 'eye', 'mouth', 'standard'], ['mouth', 'eye', 'standard'], ['legs', 'eye', 'standard']];
      const pool = worn[this.phase];
      this.say(pool[this.remarkN++ % pool.length]);
    }
  }

  private stepIdle(dt: number, p: PlayerController, valid: boolean): void {
    this.threat.id = 'none';
    this.threat.stage = 'none';
    this.threat.answer = 'none';
    const pose = this.penBody.pose;
    const d = Math.hypot(pose.pivot.x - p.pos.x, pose.pivot.z - p.pos.z);
    this.ground.walk(dt, p, this.phase === 3 ? 7.5 : 8.5);
    // hugging its nib is not a hiding place
    this.hugT = d < 5.5 ? this.hugT + dt : Math.max(0, this.hugT - dt * 0.5);
    this.attackCd -= dt;
    if (!valid) return;
    if (this.hugT > 1.5) {
      this.hugT = 0;
      this.lastMove = 'crush';
      return this.ground.start('crush', p);
    }
    if (this.attackCd > 0) return;
    let m: GroundMove;
    if (this.lesson < LESSON.length) m = LESSON[this.lesson++];
    else {
      const pool: GroundMove[] = d > 11 ? ['rule', 'splat', 'stab', 'stab'] : d < 6.5 ? ['sweep', 'stab', 'sweep', 'splat'] : ['stab', 'sweep', 'splat', 'rule', 'sweep'];
      const left = pool.filter((x) => x !== this.lastMove);
      m = left[Math.floor(Math.random() * left.length)];
    }
    this.lastMove = m;
    this.ground.start(m, p);
  }

  private startFinal(): void {
    this.hz.clear();
    this.penBody.ghost = false;
    this.opened.clear();
    this.setState('FINAL');
    this.look.setSketch(0);
    const pose = this.penBody.pose;
    pose.pivot.y = this.floorY - 1.1;
    pose.tilt = 0.42;
    this.tagSpent = false;
    this.holdStagger(1.5);
    this.ctx.audio.play('crash', { pos: pose.pivot, vol: 1, pitch: 0.5 });
    this.ctx.camera.shake = 0.9;
    this.ctx.effects.comic(pose.point(6, 0, _a), t('NIB-FIRST!'), '#ffd23a', 1.6);
    this.eraser.goTo(pose.pivot.clone().add(_a.set(3, 0, 3)).setY(this.floorY));
    this.onPhase?.(4);
    this.say('final');
  }

  protected override finish(): void {
    this.hz.clear();
    this.opened.clear();
    this.penBody.ghost = false;
    this.look.setSketch(0);
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  /**
   * Won over: WAI's last TAG lent it paint. It stands up straight-ish, and for the first time it DRAWS — a wobbly,
   * colourful loop round the roof, splat by splat. No breaking, no shrinking: it just draws.
   */
  private stepDrawing(dt: number): void {
    this.drawT += dt;
    const pose = this.penBody.pose;
    if (this.drawT - dt <= 0) {
      this.paintAll();
      this.look.setDrawn(true);
    }
    if (this.drawT < 1.4) {
      pose.pivot.y += (this.floorY - pose.pivot.y) * Math.min(1, dt * 3);
      pose.tilt += (0.05 - pose.tilt) * Math.min(1, dt * 3);
      return;
    }
    const k = this.drawT - 1.4;
    if (k > DRAW_LOOP) {
      // the loop is drawn: it steps back to the ring's far side and admires it (it stays clear of the result card's
      // postcard view, levels.ts works.victoryPose, which looks across the ring from the south-east)
      _b.set(this.arena.x - 6, this.floorY, this.arena.z - 4); // between the title and the result card in that view
      pose.pivot.x += (_b.x - pose.pivot.x) * Math.min(1, dt * 3);
      pose.pivot.z += (_b.z - pose.pivot.z) * Math.min(1, dt * 3);
      pose.pivot.y = this.floorY + Math.abs(Math.sin(k * 2)) * 0.08;
      pose.tilt += (0.1 - pose.tilt) * Math.min(1, dt * 2);
      const want = Math.atan2(14 - pose.pivot.x, 18 - pose.pivot.z);
      pose.face += Math.atan2(Math.sin(want - pose.face), Math.cos(want - pose.face)) * Math.min(1, dt * 1.5);
      pose.leanYaw = pose.face + Math.PI;
      return;
    }
    // a wobbly loop (never a circle: a wobble on the radius, a wobble on the speed)
    const a = k * 1.2 + Math.sin(k * 1.1) * 0.3;
    const r = 6.5 + Math.sin(k * 1.9) * 1.6;
    const x = this.arena.x + Math.cos(a) * r, z = this.arena.z + Math.sin(a) * r;
    const vx = x - pose.pivot.x, vz = z - pose.pivot.z;
    pose.pivot.set(x, this.floorY + Math.abs(Math.sin(k * 3)) * 0.15, z);
    if (vx * vx + vz * vz > 1e-7) pose.leanYaw = Math.atan2(-vx, -vz);
    pose.tilt = 0.22 + Math.sin(k * 2.3) * 0.05;
    pose.face = pose.leanYaw + Math.PI;
    if (Math.floor(k * 6) !== Math.floor((k - dt) * 6) && k < 40) {
      const cols = ['#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a', '#2a4be0'];
      _a.copy(pose.pivot).setY(this.floorY + 0.05);
      this.ctx.effects.splat(_a, UP, cols[Math.floor(k * 6) % 5], 1.0, DOWN);
    }
    if (k > 1 && k - dt <= 1) this.ctx.effects.comic(pose.point(14, 0, _a), t('Oh! It’s… wobbly. I like it.'), '#ffd23a', 1.3);
  }

  // ───────────── look ─────────────
  override render(alpha: number, frameDt: number): void {
    this.alpha = alpha;
    super.render(alpha, frameDt);
  }

  protected animate(dt: number): void {
    const L = this.look;
    const s = this.state;
    const pose = this.penBody.pose;
    // the drawn Pen follows its pose (interpolated between steps), not the logical TAG anchor
    this.root.position.lerpVectors(this.prevPivot, pose.pivot, this.alpha);
    this.root.quaternion.slerpQuaternions(this.prevQ, pose.q, this.alpha);
    if (this.harmless) this.root.rotateZ(Math.sin(performance.now() / 260) * 0.05);
    // eyes: two cold apertures; the lids frame them: wide and fixed on a tell, squeezed when stuck, half down when knocked over
    const tell = this.threat.stage === 'tell';
    // (lid rotation: −0.35 wide open … 0.9 shut) — wide and fixed on a tell, a cold half-lid when knocked down
    const open = s === 'DAZED' || s === 'SINK' || s === 'SPRAWL' ? 0.3 : tell || s === 'CROSS' ? -0.35 : s === 'STUCK' || s === 'FINAL' || s === 'SKID' ? 0.55 : -0.2;
    for (const lid of L.lids) lid.rotation.x += (open - lid.rotation.x) * Math.min(1, dt * 10);
    for (let i = 0; i < 2; i++) {
      const b = L.brows[i];
      const want = (i ? 1 : -1) * (tell || s === 'CROSS' ? -0.45 : s === 'STUCK' || s === 'FINAL' ? 0.55 : 0.3);
      b.rotation.z += (want - b.rotation.z) * Math.min(1, dt * 8);
    }
    if (L.clip) L.clip.rotation.x = Math.sin(performance.now() / 300) * 0.04;
    // the apertures track WAI (never a blink): the standard is always watching
    if (this.wai) L.gaze(_c.copy(this.wai.renderPos).setY(this.wai.renderPos.y + 1));
    for (const id of ALL_WEAK) L.setOpen(id, this.harmless ? 0 : Math.min(1, (this.opened.get(id) ?? 0) * 3));
    // phase 3: a sketch unless WAI looks at it (or it is open)
    if (this.phase === 3 && s !== 'SELFX' && s !== 'FINAL' && !this.harmless) {
      const want = this.seen || this.opened.size ? 0.12 : 1;
      this.sketchK += (want - this.sketchK) * Math.min(1, dt * 6);
      L.setSketch(this.sketchK);
    }
    for (const m of L.mats) m.emissive?.setRGB(this.flash > 0 ? 0.22 : 0, this.flash > 0 ? 0.18 : 0, this.flash > 0 ? 0.2 : 0);
    this.keepRed();
    L.setFade(this.nearAlpha);
    // no jelly squash for a 14 m body (EnemyBase's hit wobble): it stands as drawn
    this.root.scale.setScalar(this.sizeMul);
  }
  private sketchK = 0;

  /** The drawn body is ≈14 m: the contact blob stays a spot under the nib; the shout cone counts from 1.2 m. */
  override get bodyRadius(): number {
    return 1.2;
  }

  /** Up in the air where a SHOUT reaches it (phase 2: the Hush drags it down). */
  get shoutable(): boolean {
    return this.sky.shoutable && this.hush.shown;
  }

  override dispose(): void {
    this.hz.dispose();
    this.sky.dispose();
    this.penBody.dispose();
    this.hush.dispose();
    this.eraser.dispose();
    super.dispose();
  }
}
