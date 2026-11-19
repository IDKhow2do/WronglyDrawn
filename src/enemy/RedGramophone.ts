/**
 * [INPUT]: depends on EnemyBase (stagger/TAG, hpFloor phase gate) from ./EnemyBase; SoundWaves (blare, hush blast) from ./SoundWave;
 *          buildGramophone (model + animated parts) from ./GramophoneLook; ShoutSystem calls onShout() (ShoutReactive)
 * [OUTPUT]: exports the RedGramophone mid-boss (kind 'gramophone') with `counterHint`, `phase`, `sweepAngle`, onWake/onHelper/onQuiet/onRoar
 * [POS]: the level-2 MID-BOSS on the Bandstand (Bandstand Pier). It plays the Hush's lullaby for the Red Pen; repainting
 *        it washes the pier's red marks and lifts the Red Pen's X off the Bell Bridge (PierDirector does that).
 *        It teaches the COUNTER-SHOUT: BIG SHOUT into its horn while it inhales. The Hush's silence dome wants it later.
 *        Its phase-2 helper (returned by onHelper) is repainted with it, and when the fight restarts (restartFight:
 *        a smudge on Hard → phase 1; PierDirector's onFightReset wipes the record's X; no intro replay).
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import { SoundWaves, type WaveOpts } from './SoundWave';
import { buildGramophone, SWEEP_R, type GramophoneParts } from './GramophoneLook';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';

// ───────────── tuning (phase 1 → phase 2) ─────────────
const HP = 1400; // ≥ 1000: a TAG lands the boss-sized 5 %
const P = [
  { inhaleEvery: 10, inhale: 2.8, sweeps: 1, sweepT: 1.8, tell: 1.0, cd: [1.6, 2.4] },
  { inhaleEvery: 8, inhale: 2.3, sweeps: 2, sweepT: 1.5, tell: 0.85, cd: [1.2, 1.9] },
];
const DAZED = 4.2;
const OFF_MUL = 0.3; // the music shakes paint off unless it is dazed
const PULL_R = 9;
const BLARE: WaveOpts = { color: '#ff6fae', half: 0.36, speed: 12, range: 14, damage: 1, muffle: 1.5, height: 2.4 };
const HUSH: WaveOpts = { color: '#b49cff', half: Math.PI, speed: 8, range: 11, damage: 1, muffle: 3, height: 0.7, ink: 'hush' };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * THE RED GRAMOPHONE: a cabinet gramophone on the bandstand, playing the Hush's lullaby off a red record.
 *   BLARE  — the horn swings onto WAI and blasts a wall of noise (step aside / roll)
 *   SWEEP  — its long tonearm swings round the record at knee height (JUMP it); twice in phase 2
 *   INHALE — the horn tips up and draws a long breath: a lilac circle fills the floor and pulls WAI in.
 *            A BIG SHOUT into the horn scratches the record: DAZED (×2.5, TAG IT). A small shout is swallowed.
 *            Left alone, it lets out a HUSH: a ring rolls out over the floor (jump it) that muffles WAI.
 * The rest of the time the music shakes paint off (×0.3). At half paint the Red Pen scratches an X into
 * its record (ROAR) and a Megaphone Crab joins in (session hook onHelper).
 */
export class RedGramophone extends EnemyBase {
  readonly kind = 'gramophone';
  readonly displayName = 'The Red Gramophone';
  readonly bigness = 0.8;
  phase = 0;
  onWake: (() => void) | null = null;
  /** Phase 2: the session sends in a helper creature (returned: it is repainted with the Gramophone). */
  onHelper: (() => EnemyBase | void) | null = null;
  private helper: EnemyBase | null = null;
  /** A shout too small for the inhale (the director's tip). */
  onQuiet: (() => void) | null = null;
  /** The half-way roar (the Red Pen scratches the record: the director shows the X). */
  onRoar: (() => void) | null = null;
  /** Can WAI shout right now (not muffled)? Set by the director; an inhale waits until he can. */
  canAnswer: () => boolean = () => true;
  readonly waves: SoundWaves;
  /** Current sweep-arm angle (world yaw, rad) while sweeping (the bot reads it). */
  sweepAngle = 0;
  private look: GramophoneParts;
  private attackCd = 3;
  private inhaleT = 6;
  private aim = new THREE.Vector3();
  private woke = false;
  private dazedFlag = false;
  private sweepDir = 1;
  private sweepFrom = 0;
  private sweepHit = false;
  private sweepN = 0;
  private quietCd = 0;
  private ring: THREE.Mesh;
  private fill: THREE.Mesh;
  private cone: THREE.Mesh;
  private crankA = 0;
  private wob = 0;
  private lastKind: DamageInfo['kind'] = 'paint';

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, HP, 1.5, 0.45);
    this.look = buildGramophone(ctx.assets);
    this.root.add(this.look.root);
    this.paintAnchor = this.look.root;
    this.waves = new SoundWaves(ctx);
    // telegraphs on the floor: the sweep's red ring, the inhale's lilac fill, the blare's pink cone
    const flat = (g: THREE.BufferGeometry, color: string) => {
      const m = new THREE.Mesh(g.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 }));
      m.userData.noPaint = true;
      m.visible = false;
      ctx.root.add(m);
      return m;
    };
    this.ring = flat(new THREE.RingGeometry(1.4, SWEEP_R + 0.4, 64), '#e8323c');
    this.fill = flat(new THREE.CircleGeometry(1, 48), '#b49cff');
    this.cone = flat(new THREE.CircleGeometry(12, 24, Math.PI / 2 - 0.36, 0.72), '#ff6fae');
  }

  // ───────────── read-outs ─────────────
  get dazed(): boolean {
    return this.dazedFlag && this.staggerT > 0;
  }

  get inhaling(): boolean {
    return this.state === 'INHALE';
  }

  get counterHint(): string {
    if (this.dazed) return 'The record’s scratched — it’s DAZED! Spray it, then TAG IT! (E)';
    switch (this.state) {
      case 'INHALE':
        return 'It’s breathing in — HOLD X and BIG SHOUT into its horn!';
      case 'SWEEP_TELL':
      case 'SWEEP':
        return 'The tonearm sweeps the floor — JUMP it!';
      case 'BLARE_TELL':
        return 'The horn’s on you — step out of the pink cone';
      case 'HUSH':
        return 'A ring rolls over the floor — JUMP it!';
      case 'ROAR':
        return 'The Red Pen scratches its record — get ready';
    }
    return 'The music shakes your paint off. Wait for it to breathe in, then BIG SHOUT into the horn';
  }

  // ───────────── voice ─────────────
  onShout(big: boolean, from: THREE.Vector3): void {
    if (this.harmless || this.disposed) return;
    // only a shout from the bandstand itself wakes it (not one aimed at a crab on the deck below)
    if (Math.abs(from.y - 1 - this.pos.y) > 2.5) return;
    if (!this.alerted) this.alert();
    if (this.state !== 'INHALE') return;
    if (!big) {
      if (this.quietCd <= 0) {
        this.quietCd = 1;
        this.ctx.effects.comic(this.mouth(), t('TOO QUIET!'), '#b49cff', 0.9);
        this.onQuiet?.();
      }
      return;
    }
    // the shout goes down its throat: the needle skips, the record scratches
    this.fill.visible = false;
    this.dazedFlag = true;
    this.setState('DAZED');
    this.holdStagger(DAZED);
    this.tagSpent = false;
    this.inhaleT = P[this.phase].inhaleEvery;
    this.ctx.effects.comic(this.mouth(), t('SKRRRTCH!'), '#ffd23a', 1.3);
    this.ctx.effects.burst(this.mouth(), '#ffd23a', 20, 6, 0.1);
    this.ctx.audio.play('crash', { pos: this.pos, pitch: 1.8, vol: 0.9 });
    this.ctx.audio.play('dizzy', { pos: this.pos });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5);
  }

  private mouth(): THREE.Vector3 {
    return _w.copy(this.forward()).multiplyScalar(1.5).add(this.pos).setY(this.pos.y + this.look.mouthY + 0.6).clone();
  }

  // ───────────── damage rules ─────────────
  protected override hpFloor(): number {
    return this.phase === 0 ? this.maxHp * 0.5 : 0;
  }

  override get canBeTagged(): boolean {
    return super.canBeTagged && !(this.phase === 0 && this.hp <= this.maxHp * 0.5 + 0.5);
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    this.lastKind = info.kind;
    if (this.state === 'ROAR' || this.state === 'IDLE') {
      if (!this.alerted) this.alert();
      return this.state === 'ROAR' ? { weak: false, absorbed: true } : null;
    }
    if (this.dazed) return null;
    if (info.kind === 'paint') {
      info.amount *= OFF_MUL;
      if (Math.random() < 0.04) this.ctx.effects.comic(info.point.clone().setY(info.point.y + 0.6), t('SHAKEN OFF!'), '#ff8a7a', 0.6);
    }
    return null;
  }

  protected override weakPoints(): WeakPoint[] {
    if (this.dazed && this.lastKind === 'paint') return [{ pos: this.pos.clone().setY(this.pos.y + 2), radius: 4, mul: 2.5 }];
    return [];
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'hitWeak' : 'hit', { pos: this.pos, pitch: 0.75, vol: 0.55 });
  }

  protected override interrupt(): void {
    if (this.state === 'BLARE_TELL' || this.state === 'SWEEP_TELL' || this.state === 'INHALE') this.endAttack(1.2);
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('FIGHT');
    // the wake cut-in plays once per fight (stepping off the bandstand and back never replays it)
    if (!this.woke) {
      this.woke = true;
      this.onWake?.();
    }
  }

  protected override finish(): void {
    this.hideTells();
    this.waves.clear();
    this.dazedFlag = false;
    this.ctx.audio.play('stunSting');
    // its servant stops correcting with it (repainted, not deleted)
    if (this.helper && !this.helper.harmless && !this.helper.disposed) this.helper.debugRepaint();
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
  }

  /** WAI was smudged (Hard): phase 1, no tells or waves, the helper repainted; it waits in IDLE. */
  protected override restartFight(): void {
    this.hideTells();
    this.waves.clear();
    this.phase = 0;
    this.dazedFlag = false;
    if (this.helper && !this.helper.harmless && !this.helper.disposed) this.helper.debugRepaint();
    this.helper = null;
    this.attackCd = 3;
    this.inhaleT = 6;
    this.alerted = false;
    this.setState('IDLE');
  }

  private hideTells(): void {
    this.ring.visible = this.fill.visible = this.cone.visible = false;
    this.look.sweep.visible = false;
  }

  private endAttack(extra = 0): void {
    this.hideTells();
    const cd = P[this.phase].cd;
    this.attackCd = cd[0] + Math.random() * (cd[1] - cd[0]) + extra;
    this.setState('FIGHT');
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    this.waves.update(dt, player);
    this.quietCd = Math.max(0, this.quietCd - dt);
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.5) this.calm();
      return;
    }
    if (this.harmless) return;
    if (this.dazedFlag && this.staggerT <= 0) {
      // the stagger ran out: the needle finds its groove again
      this.dazedFlag = false;
      this.endAttack(0.6);
    }
    _v.copy(player.pos).sub(this.pos).setY(0);
    const d = _v.length();
    const valid = !player.smudged && d < 22 && Math.abs(player.pos.y - this.pos.y) < 3;
    if (this.state === 'IDLE') {
      if (valid && d < 13 && this.canSee(player.pos, 2.2)) this.alert();
      this.move(0, 0, dt);
      return;
    }
    if (!valid) {
      // WAI left the bandstand: it waits (the fight resumes fresh when he's back)
      this.hideTells();
      this.alerted = false;
      this.setState('IDLE');
      return;
    }
    const ph = P[this.phase];
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.inhaleT -= dt;
    if (this.state !== 'SWEEP' && this.state !== 'SWEEP_TELL') this.faceToward(player.pos, dt, this.state === 'BLARE_TELL' ? 4 : 1.8);
    switch (this.state) {
      case 'FIGHT': {
        if (this.phase === 0 && this.hp <= this.maxHp * 0.5 + 0.5) {
          this.setState('ROAR');
          this.ctx.audio.play('phaseSting');
          this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.1 });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.7);
          this.ctx.effects.comic(this.pos.clone().setY(this.pos.y + 6), t('LOUDER!'), '#e8323c', 1.3);
          this.onRoar?.();
          break;
        }
        if (this.attackCd > 0) break;
        // never breathe in while WAI can't answer for a moment (muffled, a cut-in on screen): it waits for him
        if (this.inhaleT <= 0 && this.canAnswer() && !this.ctx.camera.inCine) {
          this.setState('INHALE');
          this.ctx.audio.play('hush', { pos: this.pos, pitch: 0.5, vol: 1 });
          break;
        }
        if (Math.random() < 0.5 && d < 13) {
          this.setState('BLARE_TELL');
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 0.8 });
        } else {
          this.setState('SWEEP_TELL');
          this.sweepN = 0;
          this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 0.8 });
        }
        break;
      }
      case 'BLARE_TELL': {
        if (this.stateT < ph.tell - 0.3) this.aim.copy(_v).normalize();
        this.cone.visible = true;
        this.cone.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
        this.cone.rotation.y = Math.atan2(this.aim.x, this.aim.z) - Math.PI;
        (this.cone.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.3 * Math.abs(Math.sin(this.stateT * (8 + this.stateT * 14)));
        if (this.stateT > ph.tell) {
          this.cone.visible = false;
          _w.copy(this.pos).setY(this.pos.y + 0.1).addScaledVector(this.aim, 1.6);
          this.waves.blare(_w, this.aim, BLARE);
          this.ctx.audio.play('shout', { pos: this.pos, pitch: 0.45, vol: 1 });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.3);
          this.endAttack();
        }
        break;
      }
      case 'SWEEP_TELL': {
        // the arm swings out, the red ring flashes faster and faster
        this.look.sweep.visible = true;
        this.ring.visible = true;
        this.ring.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
        (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.22 * Math.abs(Math.sin(this.stateT * (7 + this.stateT * 12)));
        if (this.stateT > ph.tell) {
          this.ring.visible = false;
          this.sweepFrom = Math.atan2(_v.x, _v.z) + Math.PI; // start behind it, so WAI sees it coming
          this.sweepDir = this.sweepN % 2 ? -1 : 1;
          this.sweepHit = false;
          this.setState('SWEEP');
          this.ctx.audio.play('whoosh', { pos: this.pos, pitch: 0.6 });
        }
        break;
      }
      case 'SWEEP': {
        const k = THREE.MathUtils.clamp(this.stateT / ph.sweepT, 0, 1);
        const prev = this.sweepAngle;
        this.sweepAngle = this.sweepFrom + this.sweepDir * k * Math.PI * 2;
        // the arm passes WAI's bearing: low to the floor, so a jump clears it
        const pa = Math.atan2(_v.x, _v.z);
        const crossed = angleBetween(pa, prev, this.sweepAngle);
        if (!this.sweepHit && crossed && d > 1.2 && d < SWEEP_R + 0.6 && player.pos.y - this.pos.y < 0.8) {
          this.sweepHit = true;
          if (player.takeHit(this.pos, 1, 7)) this.ctx.effects.comic(player.pos.clone().setY(player.pos.y + 1.8), t('SCRATCH!'), '#e8323c', 0.8);
        }
        if (k >= 1) {
          this.sweepN++;
          if (this.sweepN < ph.sweeps) {
            this.sweepFrom = this.sweepAngle;
            this.sweepDir = -this.sweepDir;
            this.sweepHit = false;
            this.stateT = -0.25; // a breath between the two
          } else this.endAttack();
        }
        break;
      }
      case 'INHALE': {
        // a cut-in (a TAG, a story beat) blocks the shout: the breath waits for it
        if (this.ctx.camera.inCine) this.stateT = Math.max(0, this.stateT - dt);
        // the lilac circle fills; WAI is pulled toward the horn
        const k = Math.min(1, this.stateT / ph.inhale);
        this.fill.visible = true;
        this.fill.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
        this.fill.scale.setScalar(1 + k * 6);
        (this.fill.material as THREE.MeshBasicMaterial).opacity = 0.15 + k * 0.3;
        if (d < PULL_R && d > 2.6 && !player.dodging) {
          _w.copy(player.pos).addScaledVector(_v, (-2.0 * dt) / Math.max(d, 0.01));
          player.nudgeTo(_w);
        }
        if (this.stateT > ph.inhale) {
          // nobody shouted: HUSH
          this.fill.visible = false;
          this.waves.blast(this.pos.clone().setY(this.pos.y + 0.05), HUSH);
          this.ctx.effects.comic(this.mouth(), t('SHHHHHH!'), '#b49cff', 1.2);
          this.ctx.audio.play('hush', { pos: this.pos, pitch: 0.7, vol: 1 });
          this.inhaleT = ph.inhaleEvery;
          this.setState('HUSH');
        }
        break;
      }
      case 'HUSH':
        if (this.stateT > 1.2) this.endAttack();
        break;
      case 'ROAR':
        if (this.stateT > 1.8) {
          this.phase = 1;
          this.inhaleT = 3;
          this.helper = this.onHelper?.() ?? null;
          this.endAttack();
        }
        break;
    }
    this.move(0, 0, dt);
  }

  // ───────────── animation ─────────────
  protected animate(dt: number): void {
    const L = this.look;
    this.wob += dt;
    const inhale = this.state === 'INHALE' ? Math.min(1, this.stateT / P[this.phase].inhale) : 0;
    const dazed = this.dazed;
    // the horn: bobs to the beat, tips up to breathe in, droops when the record's scratched
    const beat = Math.sin(this.wob * 6) * 0.04;
    const tell = this.state === 'BLARE_TELL' ? 0.2 : 0;
    L.hornPivot.rotation.x = THREE.MathUtils.lerp(L.hornPivot.rotation.x, dazed ? 0.55 : -inhale * 0.55 + tell + beat, Math.min(1, dt * 6));
    L.hornPivot.rotation.z = dazed ? Math.sin(this.wob * 9) * 0.12 : this.state === 'ROAR' ? Math.sin(this.wob * 30) * 0.08 : 0;
    L.hornPivot.scale.setScalar(1 + inhale * 0.12 + (this.state === 'BLARE_TELL' ? Math.sin(this.stateT * 30) * 0.03 : 0));
    const glow = this.state === 'INHALE' ? 0.5 + inhale * 0.5 : this.state === 'BLARE_TELL' ? 0.6 : 0;
    L.throatMat.color.setRGB(0.16 + glow * 0.55, 0.09 + glow * 0.5, 0.19 + glow * 0.8);
    // the platter spins (stops when dazed), the crank turns
    const spin = dazed || this.harmless ? (this.state === 'CALM' ? 2 : 0) : 4;
    L.platter.rotation.y += dt * spin;
    this.crankA += dt * (dazed ? 0 : 3);
    L.crank.rotation.x = this.crankA;
    // the sweep arm (world yaw → model space)
    if (this.state === 'SWEEP') L.sweep.rotation.y = this.sweepAngle - this.facing - Math.PI / 2;
    else if (this.state === 'SWEEP_TELL') L.sweep.rotation.y = Math.PI / 2 + Math.sin(this.stateT * 20) * 0.05;
    L.sweep.scale.x = this.state === 'SWEEP_TELL' ? Math.min(1, this.stateT * 2.5) : 1;
    // the face
    const angry = this.state === 'ROAR' || this.state.endsWith('_TELL') ? 1 : 0;
    L.brows.forEach((b, i) => {
      b.rotation.z = (i ? 1 : -1) * (0.35 + angry * 0.2) + (dazed ? (i ? -0.7 : 0.7) : 0);
      b.position.y = 1.76 - angry * 0.06;
    });
    for (const l of L.lids) l.rotation.x = dazed ? 1.4 + Math.sin(this.wob * 5) * 0.2 : this.state === 'CALM' ? 1.2 : 0.6;
    L.cabinetMat.emissive.setRGB(this.flash > 0 ? 0.6 : 0, this.flash > 0 ? 0.6 : 0, this.flash > 0 ? 0.6 : 0);
    L.root.rotation.z = dazed ? Math.sin(this.wob * 4) * 0.06 : 0;
    L.root.position.y = this.state === 'FIGHT' ? Math.abs(Math.sin(this.wob * 6)) * 0.06 : 0;
  }

  override dispose(): void {
    this.waves.dispose();
    for (const m of [this.ring, this.fill, this.cone]) m.removeFromParent();
    super.dispose();
  }
}

/** Did a sweep from angle a to b (either way, < 2π) pass over bearing p? */
function angleBetween(p: number, a: number, b: number): boolean {
  const norm = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
  const da = norm(b - a);
  const dp = norm(p - a);
  return da >= 0 ? dp >= 0 && dp <= da : dp <= 0 && dp >= da;
}
