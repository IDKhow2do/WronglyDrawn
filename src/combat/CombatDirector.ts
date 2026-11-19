/**
 * [INPUT]: depends on EnemyBase (stagger/TAG state, applyDamage), PlayerController, REWARDS (Golden Stamp, luck),
 *          BOSS_HP from meta/Difficulty, StampFx
 * [OUTPUT]: exports CombatDirector (PAINT TIME, TAG IT!, ENCORE, impact frames), ENCORE odds/payouts, TAG_DMG, EncoreView
 * [POS]: the flashy layer over spraying, owned by each session. TAG_DMG is the one table for what a TAG and an
 *        ENCORE stamp deal; both pass `tag: true`, so EnemyBase skips weak points and never re-reels from them.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { EnemyBase } from '../enemy/EnemyBase';
import type { PlayerController } from '../player/PlayerController';
import { t } from '../i18n';
import { REWARDS } from '../meta/Progression';
import { BOSS_HP, Difficulty } from '../meta/Difficulty';

/**
 * What a TAG and an ENCORE stamp deal (share of the creature's paint + a flat bite). Trimmed in the difficulty
 * pass (docs/difficulty/NOTES.md): before, one reel on an ordinary creature chained TAG → reel → TAG to a finish.
 */
export const TAG_DMG = {
  creature: { share: 0.2, flat: 20 },
  boss: { share: 0.04, flat: 0 },
  stampCreature: { share: 0.03, flat: 8 },
  stampBoss: { share: 0.008, flat: 5 },
};
/** Gentle's allowance: the stamp keeps a little of its old weight there (the easiest level stays the easiest). */
const bite = (e: EnemyBase, b: { share: number; flat: number }) => (e.maxHp * b.share + b.flat) * Difficulty.s.tagMul;
import { StampFx } from './StampFx';

/**
 * ENCORE / 再盖一章 — the push-your-luck layer on TAG IT! (inspired by ForgeTax's forging):
 * after a TAG lands you may keep stamping (E). Each extra stamp raises the payout
 * multiplier but has a lower chance to stick. A slip loses the payout, gives the
 * creature some corruption back and it shoves you off (telegraphed — dodge it).
 * Stop pressing to cash out. 10 good stamps (across the run) charge FRENZY:
 * the next encore can't slip.
 */
export const ENCORE = {
  /** chance that stamp #n (1-based, after the TAG) sticks */
  odds: [0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.15],
  /** payout multiplier after n good stamps */
  mult: [1, 1.5, 2, 3, 4, 6, 8, 10],
  /** seconds to decide (press E again) before it cashes out on its own */
  window: 2.4,
  /** wind-up of each stamp before the roll resolves (readable beat: the stamp rises, then slams) */
  windup: 0.36,
  /** paint drops paid per ×1 */
  dropsPerMult: 2,
  maxDrops: 16,
  frenzyGoal: 10,
  luckyBonus: 0.05,
  /** PERFECT stamp: press E while the clock is in this part of the window (fractions of time left) */
  sweet: [0.55, 0.78] as [number, number],
  perfectBonus: 0.15,
};

export interface EncoreView {
  /** an encore chain is open right now */
  active: boolean;
  stamps: number;
  mult: number;
  nextMult: number;
  /** 0..1 chance the next stamp sticks */
  odds: number;
  /** 0..1 decision time left */
  window: number;
  /** a stamp is mid-air (the roll is about to resolve) */
  rolling: boolean;
  /** the gold zone on the clock (fractions of time left) and whether the stamp in the air was PERFECT */
  sweet: [number, number];
  perfect: boolean;
  frenzy: boolean;
  frenzyCharge: number;
  frenzyReady: boolean;
  /** last result to flash: 'cash' | 'slip' | '' and its age (s) */
  result: '' | 'cash' | 'slip';
  resultT: number;
  resultMult: number;
  drops: number;
}

interface Encore {
  e: EnemyBase;
  stamps: number;
  window: number;
  roll: number;
  perfect: boolean;
  perfects: number;
  frenzy: boolean;
  dealt: number;
  hpAtTag: number;
}

/**
 * The flashy layer on top of spraying:
 *  · PAINT TIME — dodge at the last instant (perfect dodge) and the world
 *    slows to a crawl for you alone, colours over-saturate, your paint hits
 *    twice as hard and the can refills.
 *  · TAG IT! — a reeling (staggered) creature can be finished with E: WAI
 *    leaps, the camera cuts in, and a giant crown tag is slapped on it.
 *  · impact frames — 2-frame inverted flashes on the biggest hits.
 */
export class CombatDirector {
  paintTime = 0;
  private finishing: { e: EnemyBase; t: number; hit: boolean; hpAtTag?: number; buffered?: boolean } | null = null;
  onImpactFrame: ((strength: number) => void) | null = null;
  onPaintTime: ((on: boolean) => void) | null = null;
  /** Session: pay `n` paint drops out of the creature at `at`. */
  onPayout: ((at: THREE.Vector3, n: number) => void) | null = null;
  private encore: Encore | null = null;
  /** a slipped creature's telegraphed shove: lands after `t` unless WAI got out of the way */
  private shove: { e: EnemyBase; t: number } | null = null;
  frenzyCharge = 0;
  frenzyReady = false;
  private result: { kind: 'cash' | 'slip'; t: number; mult: number } | null = null;
  private tickT = 0;
  readonly view: EncoreView = { active: false, stamps: 0, mult: 1, nextMult: 1.5, odds: 0.9, window: 0, rolling: false, sweet: ENCORE.sweet, perfect: false, frenzy: false, frenzyCharge: 0, frenzyReady: false, result: '', resultT: 0, resultMult: 1, drops: 2 };

  constructor(
    private ctx: GameContext,
    private enemies: () => EnemyBase[],
    private player: PlayerController,
  ) {
    // prints draw over the scene; a wall (level geometry) between the camera and a print hides it
    const wall = (from: THREE.Vector3, to: THREE.Vector3): boolean => {
      const d = to.clone().sub(from);
      const len = d.length();
      if (len < 0.5) return false;
      return !!ctx.physics.raycast(from, d.divideScalar(len), len - 0.4, (c) => ['static', 'gate', 'host'].includes(ctx.physics.tagOf(c) ?? ''));
    };
    this.stampFx = new StampFx(ctx.root, ctx.assets, ctx.camera.camera, wall);
  }

  /** The big rubber stamp that slams onto TAGs and ENCORE stamps. */
  private stampFx: StampFx;
  private stampSize(e: EnemyBase): number {
    return 0.5 + e.bigness * 1.1;
  }
  private faceYaw(at: THREE.Vector3): number {
    const d = this.player.pos.clone().sub(at);
    return Math.atan2(d.x, d.z);
  }

  /** Damage multiplier for the player's paint right now. */
  get paintMul(): number {
    return this.paintTime > 0 ? 2 : 1;
  }

  /** Enemies run on this time scale (Paint Time slows only them). */
  get enemyScale(): number {
    return this.paintTime > 0 ? 0.2 : 1;
  }

  impact(strength = 1): void {
    this.onImpactFrame?.(strength);
  }

  perfectDodge(from: THREE.Vector3): void {
    const was = this.paintTime > 0;
    this.paintTime = 2.6;
    const p = this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.ctx.effects.comic(p, t('PERFECT!'), '#22c4c0', 0.9);
    this.ctx.effects.ring(this.player.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), '#22c4c0', 7);
    this.ctx.audio.play('reveal', { pitch: 1.6, vol: 0.9 });
    this.ctx.audio.play('whoosh', { pitch: 0.6 });
    this.ctx.time.hitstop(0.12);
    this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 7);
    this.player.cape.gust.add(from.clone().sub(this.player.pos).setY(0).normalize().multiplyScalar(-30)).add(new THREE.Vector3(0, 12, 0));
    this.ctx.events.emit('weapon:refill', {});
    this.impact(0.6);
    if (!was) this.onPaintTime?.(true);
  }

  /** The staggered creature WAI could TAG right now. */
  finisherTarget(): EnemyBase | null {
    if (this.finishing || this.encore) return null;
    let best: EnemyBase | null = null;
    let bd = 4.2;
    const fwd = this.player.forward();
    for (const e of this.enemies()) {
      if (e.disposed || e.harmless || !e.canBeTagged) continue;
      const to = e.pos.clone().sub(this.player.pos).setY(0);
      const d = to.length() - e.bigness * 1.2;
      if (d > bd) continue;
      if (d > 1.2 && to.normalize().dot(fwd) < -0.2) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  get busy(): boolean {
    return !!this.finishing || !!this.encore;
  }

  /** Chance the next stamp sticks (FRENZY = sure thing). */
  private oddsFor(stamps: number, frenzy: boolean): number {
    if (frenzy) return 1;
    const base = ENCORE.odds[Math.min(stamps, ENCORE.odds.length - 1)];
    return Math.min(0.95, base + REWARDS.encoreBonus);
  }

  private multFor(stamps: number): number {
    return ENCORE.mult[Math.min(stamps, ENCORE.mult.length - 1)];
  }

  /** HUD prompt while an encore chain is open. */
  get encorePrompt(): { key: string; text: string; action: string } | null {
    const en = this.encore;
    if (!en || en.roll > 0) return null;
    const pct = Math.round(this.oddsFor(en.stamps, en.frenzy) * 100);
    return { key: 'E', action: 'Encore', text: t('ENCORE {pct}% → ×{mult}', { pct, mult: this.multFor(en.stamps + 1) }) };
  }

  private topOf(e: EnemyBase): THREE.Vector3 {
    return e.pos.clone().add(new THREE.Vector3(0, 1.0 + e.bigness * 1.4, 0));
  }

  private openEncore(e: EnemyBase, hpAtTag: number): void {
    const frenzy = this.frenzyReady;
    this.encore = { e, stamps: 0, window: ENCORE.window, roll: 0, perfect: false, perfects: 0, frenzy, dealt: 0, hpAtTag };
    if (frenzy) {
      this.frenzyReady = false;
      this.frenzyCharge = 0;
      this.ctx.audio.play('frenzy');
      this.ctx.effects.comic(this.topOf(e).add(new THREE.Vector3(0, 1.4, 0)), t('FRENZY! CAN’T SLIP!'), '#ffd23a', 1);
    }
    this.holdEncore();
    this.showOdds();
  }

  /** Keep the creature reeling and WAI safe while the chain is open. */
  private holdEncore(): void {
    const en = this.encore!;
    en.e.holdStagger(en.window + ENCORE.windup + 0.4);
    const p = this.player;
    p.lockTimer = Math.max(p.lockTimer, en.window + 0.1);
    p.invuln = Math.max(p.invuln, en.window + 0.3);
  }

  /** Diegetic odds: the % floats over the creature in ink. */
  private showOdds(): void {
    const en = this.encore!;
    const pct = Math.round(this.oddsFor(en.stamps, en.frenzy) * 100);
    const col = en.frenzy ? '#ffd23a' : pct >= 70 ? '#22c4c0' : pct >= 45 ? '#ffd23a' : '#ff2448';
    this.ctx.effects.comic(this.topOf(en.e).add(new THREE.Vector3(0, 1.1, 0)), `${pct}%`, col, 0.7);
  }

  private stepEncore(dt: number): void {
    const en = this.encore!;
    const e = en.e;
    // repainted, gone, or a boss pinned at its phase gate (the roar wins): pay out what's banked
    if (e.disposed || e.harmless || (!e.allowsEncore && en.roll <= 0)) {
      this.cashOut();
      return;
    }
    if (en.roll > 0) {
      en.roll -= dt;
      if (en.roll <= 0) this.resolveStamp();
      return;
    }
    en.window -= dt;
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = en.window < 0.8 ? 0.1 : 0.3;
      this.ctx.audio.play('stampTick', { pitch: 1 + (1 - en.window / ENCORE.window) * 0.5 });
    }
    if (this.ctx.input.consumePressed('KeyE')) {
      this.beginStamp();
      return;
    }
    if (en.window <= 0 || en.stamps >= ENCORE.mult.length - 1) this.cashOut();
  }

  /** Stamp again: a little hop and slap; the roll lands a beat later. */
  private beginStamp(): void {
    const en = this.encore;
    if (!en || en.roll > 0) return;
    en.roll = ENCORE.windup;
    // timing: in the gold zone = PERFECT (better odds, bigger slam)
    const f = en.window / ENCORE.window;
    en.perfect = f >= ENCORE.sweet[0] && f <= ENCORE.sweet[1];
    if (en.perfect) {
      this.ctx.audio.play('lockOn', { pitch: 1.5, vol: 0.8 });
      this.ctx.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 2.0, 0)), t('PERFECT!'), '#ffd23a', 0.7);
    }
    const p = this.player;
    p.playAction('throw', 0.35);
    p.vy = Math.max(p.vy, 4);
    p.lockTimer = Math.max(p.lockTimer, ENCORE.windup + 0.1);
    p.invuln = Math.max(p.invuln, ENCORE.windup + 0.5);
    en.e.holdStagger(ENCORE.windup + 0.6);
    const top = this.topOf(en.e);
    this.stampFx.windUp(top, this.stampSize(en.e), ENCORE.windup, this.faceYaw(top), { on: en.e.root, look: { gold: true, perfect: en.perfect, frenzy: en.frenzy } });
    this.ctx.audio.play('whoosh', { pitch: 1.5, vol: 0.6 });
  }

  private resolveStamp(): void {
    const en = this.encore!;
    const e = en.e;
    const top = this.topOf(e);
    const dir = top.clone().sub(this.player.pos).setY(0).normalize();
    const perfect = en.perfect;
    const odds = Math.min(0.97, this.oddsFor(en.stamps, en.frenzy) + (perfect ? ENCORE.perfectBonus : 0));
    if (Math.random() < odds) {
      if (perfect) en.perfects++;
      en.stamps++;
      this.stampFx.slam(true);
      this.ctx.events.emit('encore:stamp', { stamps: en.stamps, mult: this.multFor(en.stamps) });
      if (!en.frenzy && !this.frenzyReady) {
        this.frenzyCharge++;
        if (this.frenzyCharge >= ENCORE.frenzyGoal) {
          this.frenzyReady = true;
          this.ctx.audio.play('frenzy', { pitch: 1.2 });
          this.ctx.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), t('FRENZY READY!'), '#ffd23a', 0.9);
        }
      }
      const before = e.hp;
      e.applyDamage({ amount: bite(e, e.baseHp >= BOSS_HP ? TAG_DMG.stampBoss : TAG_DMG.stampCreature), point: top, dir, collider: null, kind: 'spit', color: '#ffd23a', tag: true });
      en.dealt += Math.max(0, before - e.hp);
      const m = this.multFor(en.stamps);
      const col = ['#ffd23a', '#ff4fa3', '#22c4c0', '#2a4be0'][en.stamps % 4];
      this.ctx.effects.splat(top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 0)), dir.clone().negate(), col, 0.9 + en.stamps * 0.12, dir, { drip: 1 });
      this.ctx.effects.burst(top, col, 10 + en.stamps * 3, 6, 0.09);
      this.ctx.effects.comic(top.clone().add(new THREE.Vector3(0, 0.7, 0)), `×${m}!`, col, 0.8 + en.stamps * 0.08);
      this.ctx.audio.play('stampHit', { pos: top, pitch: 1 + en.stamps * 0.12 });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5 + en.stamps * 0.1);
      this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 2 + en.stamps);
      // weight: a harder freeze each stamp, a slow-motion beat on big ones, a gold shock ring,
      // paint spraying out of the creature, and one drop paid on the spot (a PERFECT pays two)
      this.ctx.time.hitstop(0.08 + en.stamps * 0.018 + (perfect ? 0.04 : 0));
      if (en.stamps >= 3 || perfect) this.ctx.time.slowmo(0.35, 0.22 + en.stamps * 0.03);
      this.ctx.effects.ring(top, perfect ? '#ffd23a' : col, 3 + en.stamps * 0.9 + (perfect ? 1.5 : 0), dir.clone().negate());
      this.ctx.effects.ring(e.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), col, 4 + en.stamps);
      for (const c2 of ['#ffd23a', '#ff4fa3', '#22c4c0']) this.ctx.effects.burst(top, c2, 6 + en.stamps * 2 + (perfect ? 8 : 0), 7 + en.stamps, 0.09);
      this.onPayout?.(top, perfect ? 2 : 1);
      this.ctx.audio.play('crash', { pos: top, vol: 0.35 + en.stamps * 0.08, pitch: 1.2 - en.stamps * 0.05 });
      if (perfect) this.ctx.audio.play('crown', { vol: 0.6, pitch: 1.3 + en.stamps * 0.08 });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.7 + en.stamps * 0.12 + (perfect ? 0.3 : 0));
      this.impact(Math.min(1, 0.45 + en.stamps * 0.1 + (perfect ? 0.2 : 0)));
      if (e.harmless || e.hp <= 0) {
        this.cashOut();
        return;
      }
      en.window = ENCORE.window;
      this.holdEncore();
      if (en.stamps >= ENCORE.mult.length - 1) this.cashOut();
      else this.showOdds();
    } else {
      this.stampFx.slam(false);
      this.slip();
    }
  }

  /** The stamp slips: payout lost, some corruption comes back, and it shoves WAI off (after a tell). */
  private slip(): void {
    const en = this.encore!;
    const e = en.e;
    this.encore = null;
    const top = this.topOf(e);
    const back = Math.min(en.dealt * 0.6 + e.maxHp * 0.03, Math.max(0, en.hpAtTag - e.hp));
    e.hp = Math.min(e.maxHp, e.hp + back);
    this.ctx.effects.comic(top.clone().add(new THREE.Vector3(0, 0.8, 0)), t('SLIPPED!'), '#ff2448', 1);
    this.ctx.effects.burst(top, '#5a2a4a', 16, 5, 0.09);
    this.ctx.audio.play('stampSlip', { pos: top });
    this.ctx.audio.play('squeak', { pos: top, pitch: 0.6 });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
    // WAI is free again right away (so he can dodge the shove), the creature recovers
    const p = this.player;
    p.lockTimer = 0;
    p.invuln = 0;
    e.releaseStagger(0);
    this.shove = { e, t: 0.55 };
    this.ctx.effects.comic(e.pos.clone().add(new THREE.Vector3(0, 1.2 + e.bigness * 2.4, 0)), '!', '#ff2448', 1.3);
    this.result = { kind: 'slip', t: 0, mult: 0 };
  }

  private cashOut(): void {
    const en = this.encore!;
    this.encore = null;
    const e = en.e;
    const m = this.multFor(en.stamps);
    const n = Math.min(ENCORE.maxDrops, Math.round(ENCORE.dropsPerMult * m));
    const top = this.topOf(e);
    this.onPayout?.(top, n);
    // the chain is over: it shakes off the reel (no instant re-TAG from stamps that crossed a stagger mark)
    e.releaseStagger(0);
    this.player.lockTimer = Math.min(this.player.lockTimer, 0.05);
    this.player.invuln = Math.max(Math.min(this.player.invuln, 0.5), 0.3);
    if (en.stamps > 0) {
      this.ctx.effects.comic(top.clone().add(new THREE.Vector3(0, 1.0, 0)), t('CASHED OUT ×{mult}!', { mult: m }), '#ffd23a', 0.9 + Math.min(0.5, en.stamps * 0.1));
      this.ctx.audio.play('cashOut', { pos: top });
    }
    // big chains pay extra: Paint Time at ×3, a full can at ×4
    if (m >= 3) {
      const was = this.paintTime > 0;
      this.paintTime = Math.max(this.paintTime, 2.6);
      if (!was) this.onPaintTime?.(true);
      this.ctx.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)), t('PAINT TIME!'), '#22c4c0', 0.8);
    }
    if (m >= 4) this.ctx.events.emit('weapon:refill', {});
    this.ctx.events.emit('encore:cashout', { mult: m, stamps: en.stamps });
    this.result = { kind: 'cash', t: 0, mult: m };
  }

  private updateView(): void {
    const v = this.view;
    const en = this.encore;
    v.active = !!en;
    v.frenzyCharge = this.frenzyCharge;
    v.frenzyReady = this.frenzyReady;
    if (en) {
      v.stamps = en.stamps;
      v.mult = this.multFor(en.stamps);
      v.nextMult = this.multFor(en.stamps + 1);
      v.odds = this.oddsFor(en.stamps, en.frenzy);
      v.window = Math.max(0, en.window / ENCORE.window);
      v.rolling = en.roll > 0;
      v.perfect = en.roll > 0 && en.perfect;
      v.frenzy = en.frenzy;
      v.drops = Math.min(ENCORE.maxDrops, Math.round(ENCORE.dropsPerMult * v.mult));
    }
    v.result = this.result && this.result.t < 1.6 ? this.result.kind : '';
    v.resultT = this.result?.t ?? 0;
    v.resultMult = this.result?.mult ?? 0;
  }

  tag(e: EnemyBase): void {
    this.finishing = { e, t: 0, hit: false };
    e.tagSpent = true;
    e.holdStagger(1.3);
    const p = this.player;
    p.lockTimer = Math.max(p.lockTimer, 1.05);
    p.invuln = Math.max(p.invuln, 1.6);
    // leap: face the creature, hop toward it
    const to = e.pos.clone().sub(p.pos).setY(0);
    const dist = to.length();
    to.normalize();
    p.faceDir(to);
    p.leap(to, Math.max(0, dist - 1.4 - e.bigness), 7.5);
    p.playAction('throw', 0.6);
    this.ctx.audio.play('whoosh', { pitch: 1.2 });
    this.ctx.audio.play('bigJump');
    // camera: over WAI's shoulder on the leap, then a side punch-in on the slap — framed from OUTSIDE
    // the creature's real body (a boss is huge) and on whichever side isn't a wall
    const box = new THREE.Box3().setFromObject(e.root);
    const size = box.getSize(new THREE.Vector3());
    const bodyR = Math.max(0.6, Math.hypot(size.x, size.z) * 0.5);
    const top = e.pos.clone().setY(Math.min(box.max.y, e.pos.y + 1.2 + size.y * 0.6));
    const phys = this.ctx.physics;
    const room = (from: THREE.Vector3, dir: THREE.Vector3, want: number): number => {
      // the creature's own colliders never count as a wall (a boss's extra block put the camera inside its face)
      const hit = phys.raycast(from, dir, want, (c) => c.handle !== p.collider.handle && c.handle !== e.collider?.handle && c.parent()?.handle !== e.body?.handle);
      return hit ? Math.max(1.0, hit.dist - 0.5) : want;
    };
    const up = new THREE.Vector3(0, 1, 0);
    const sideA = new THREE.Vector3(-to.z, 0, to.x);
    const pick = (from: THREE.Vector3, dirOf: (s: THREE.Vector3) => THREE.Vector3, want: number) => {
      const da = dirOf(sideA);
      const db = dirOf(sideA.clone().negate());
      const ra = room(from, da, want);
      const rb = room(from, db, want);
      return ra >= rb ? { dir: da, d: ra } : { dir: db, d: rb };
    };
    // 1 · the leap: behind and a little beside WAI, looking up at the creature
    const eyeP = p.pos.clone().addScaledVector(up, 1.2);
    const s1 = pick(eyeP, (sd) => sd.clone().multiplyScalar(0.55).addScaledVector(to, -1).normalize(), 3 + bodyR * 0.6);
    const cam1 = eyeP.clone().addScaledVector(s1.dir, s1.d).addScaledVector(up, 0.6 + size.y * 0.25);
    // 2 · the slap: from the side, outside the body, aimed between WAI's landing spot and the face
    const land = e.pos.clone().addScaledVector(to, -(bodyR + 0.6));
    // the stamp (it finds where it lands on windUp): frame WAI's landing spot up to its handle at the slam (room allowing)
    const st = this.topOf(e);
    this.stampFx.windUp(st, this.stampSize(e), 0.55, this.faceYaw(st), { on: e.root, look: { gold: REWARDS.encore } });
    const stampTop = this.stampFx.handleY;
    const aim = land.clone().lerp(top, 0.55).setY((land.y + stampTop) / 2);
    const fit = (stampTop - land.y) / 2 / Math.tan(THREE.MathUtils.degToRad(20));
    const s2 = pick(e.pos.clone().setY(aim.y), (sd) => sd.clone().addScaledVector(to, -0.7).normalize(), Math.max(bodyR + 3.6, fit));
    const cam2 = e.pos.clone().setY(aim.y).addScaledVector(s2.dir, s2.d).addScaledVector(up, 0.7);
    // a wall held the camera in: open the lens instead (up to 70°) so the stamp still fits
    const fov2 = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((stampTop - land.y) / 2 / (s2.d * 0.9))), 40, 70);
    this.ctx.camera.playCine([
      { pos: cam1, look: e.pos.clone().lerp(top, 0.6), toLook: top.clone(), dur: 0.5, fov: 55, toFov: 50 },
      { pos: cam2, look: aim, dur: 0.55, fov: fov2 + 6, toFov: fov2, handheld: 0.06 },
    ], { gameplay: true });
  }

  step(dt: number): void {
    this.stampFx.step(dt);
    if (this.paintTime > 0) {
      this.paintTime -= dt;
      if (this.paintTime <= 0) this.onPaintTime?.(false);
    }
    if (this.result) this.result.t += dt;
    if (this.shove) {
      const sh = this.shove;
      sh.t -= dt;
      if (sh.t <= 0) {
        this.shove = null;
        const e = sh.e;
        if (!e.harmless && !e.disposed) {
          // BOINK: a rubbery shove (½ heart) if WAI is still close; dodging through it is a perfect dodge
          this.ctx.effects.ring(e.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), '#ff2448', 3.5 + e.bigness * 2);
          this.ctx.audio.play('kick', { pos: e.pos });
          const reach = 2.6 + e.bigness * 2.2;
          if (Math.hypot(this.player.pos.x - e.pos.x, this.player.pos.z - e.pos.z) < reach) {
            if (this.player.takeHit(e.pos, 1, 13)) this.ctx.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('BOINK!'), '#ff2448', 0.8);
          }
        }
      }
    }
    if (this.encore && !this.finishing) this.stepEncore(dt);
    this.updateView();
    const f = this.finishing;
    if (!f) return;
    f.t += dt;
    if (!f.hit && f.t > 0.55) {
      f.hit = true;
      this.stampFx.slam(true);
      const e = f.e;
      const top = e.pos.clone().add(new THREE.Vector3(0, 1.0 + e.bigness * 1.4, 0));
      const dir = top.clone().sub(this.player.pos).setY(0).normalize();
      f.hpAtTag = e.hp;
      // bosses: a smaller bite, so the TAG (and its ENCORE) never jumps straight onto a phase gate
      e.applyDamage({ amount: bite(e, e.baseHp >= BOSS_HP ? TAG_DMG.boss : TAG_DMG.creature), point: top, dir, collider: null, kind: 'spit', color: '#ffd23a', tag: true });
      // the tag itself: a big gold splat + crown burst wrapped on the body
      for (let i = 0; i < 4; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8);
        this.ctx.effects.splat(top.clone().add(off), dir.clone().negate(), i % 2 ? '#ffd23a' : '#ff4fa3', 1.2, dir, { drip: 1 });
      }
      for (const c of ['#ffd23a', '#ff4fa3', '#22c4c0']) this.ctx.effects.burst(top, c, 18, 7, 0.1);
      this.ctx.effects.ring(top, '#ffd23a', 5, dir.clone().negate());
      if (!e.harmless) this.ctx.effects.comic(top.clone().add(new THREE.Vector3(0, 0.8, 0)), t('TAGGED!'), '#ffd23a', 0.85);
      this.ctx.audio.play('crash', { pos: top, vol: 0.9 });
      this.ctx.audio.play('splat', { pos: top, vol: 1, pitch: 0.6 });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 1.1);
      this.ctx.time.hitstop(0.16);
      e.knock(dir, 4 + (1 - e.bigness) * 6);
      this.impact(1);
    }
    // E pressed while the TAG is landing = the first ENCORE stamp (buffered)
    if (f.hit && this.ctx.input.consumePressed('KeyE')) f.buffered = true;
    if (f.t > 1.15) {
      this.finishing = null;
      // ENCORE: still reeling and not repainted → keep stamping for more?
      // (only with the Golden Stamp — a legendary boon you have to find)
      if (REWARDS.encore && !f.e.harmless && !f.e.disposed && f.e.allowsEncore) {
        this.openEncore(f.e, f.hpAtTag ?? f.e.hp);
        if (f.buffered) this.beginStamp();
      }
      else this.onPayout?.(this.topOf(f.e), ENCORE.dropsPerMult);
      if (!this.encore) f.e.releaseStagger(0);
    }
  }
}
