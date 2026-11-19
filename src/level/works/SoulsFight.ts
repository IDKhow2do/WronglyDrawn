/**
 * [INPUT]: depends on Stamina from combat/Stamina; LockOn (the aim assist) from render/LockOn; SoulsHud from ui/SoulsHud;
 *          Difficulty 与 soulsTuning from meta/Difficulty; PlayerGate from player/PlayerGate; RedPenBoss; SoulsArena (the ink ring + gate);
 *          SoulsCamera (the camera rules); WorksStory (bossIntro); GameContext; PlayerController; ArenaGuard (back into the ring);
 *          NotYet (paint on the Pen before the fight answers)
 * [OUTPUT]: exports SoulsFight (active, mode, step(), settle(), frame(), warpIn(), smudged(), respawn(), finish(), gatePrompt, hint) and SoulsHost
 * [POS]: the souls-like Red Pen fight as one switch, owned by WorksSession. Outside the fight nothing here runs: WAI's gate is
 *        null, no stamina, no camera guard, no HUD. Through the ink gate it turns on: seals the ring, plays the intro, wakes
 *        the Pen, gives WAI stamina (PlayerGate: rolls / jumps / sprint cost), honest i-frames shown as a white ghost, a
 *        recovery after each roll, staggers and knock-downs (with a protected get-up). AIM STAYS THE PLAYER'S: free camera,
 *        free crosshair; Y (FIND PEN on touch) only swings the view once onto an open weak point, and the HUD marks open
 *        points. SoulsCamera keeps every shot out of the Pen (and, in play, inside the ring) and gives the Pen's TAG
 *        its own framing. The Pen's voice (pen.voice) is drained here on real time and shown by SoulsHud as one slip
 *        above the boss bar; it holds while a story caption is up. Smudged: the SMUDGED sheet, back outside the gate. Won over:
 *        轻松和普通重试时保留红笔的阶段与血量比例。困难重开。
 *        everything switches off and the ring dissolves. settle() runs ArenaGuard while the fight is on.
 *        frame() fades the white ghost once the fight is off, so a roll into the last TAG does not leave WAI white.
 *        Before the fight, paint on the Pen gets NotYet's answer (the Guardians left, or the ink gate).
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { PlayerGate } from '../../player/PlayerGate';
import { Stamina } from '../../combat/Stamina';
import { LockOn } from '../../render/LockOn';
import { SoulsHud } from '../../ui/SoulsHud';
import { Difficulty, soulsTuning } from '../../meta/Difficulty';
import type { RedPenBoss } from '../../enemy/RedPenBoss';
import type { SoulsArena } from './SoulsArena';
import type { WorksStory } from './WorksStory';
import { SoulsCamera } from './SoulsCamera';
import { ArenaGuard } from '../ArenaGuard';
import { NotYet } from '../NotYet';

/** What the fight needs from the session. */
export interface SoulsHost {
  readonly ctx: GameContext;
  readonly player: PlayerController;
  readonly pen: RedPenBoss;
  readonly ring: SoulsArena;
  readonly story: WorksStory;
  /** May the fight start (all Guardians awake, the Pen not yet won over)? */
  ready(): boolean;
  /** How many of the three Guardian machines are awake (the "not yet" line counts them). */
  awakeGuardians(): number;
  /** Is WAI holding the spray right now (the stamina refill slows)? */
  spraying(): boolean;
  /** Set the stickers as the Pen left them at the start of act `phase` (1 = none crossed out). */
  stickersFor(phase: number): void;
  /** Where the run back starts (outside the gate) and which way it faces. */
  checkpoint(): { pos: THREE.Vector3; yaw: number };
  toast(text: string, kind?: 'info' | 'warn' | 'good', params?: Record<string, string | number>): void;
}

export type SoulsMode = 'off' | 'intro' | 'on' | 'down';

const LOCK_KEY = 'KeyY';
const NOTES = ['Nearly! Try again.', 'Neater next time!', 'Good effort. Again!', 'So close — one more go.'];

export class SoulsFight implements PlayerGate {
  mode: SoulsMode = 'off';
  readonly stamina = new Stamina();
  readonly lock: LockOn;
  private hud: SoulsHud | null = null;
  private introT = 0;
  private entries = 0;
  private resume = 1;
  private remainingHp: number | undefined;
  private prev = new THREE.Vector3();
  private minVy = 0;
  private ghostFx = 0;
  private cardT = 0;
  private lockTipped = false;
  /** The camera rules: never inside the Pen, inside the ring, the Pen's own TAG shots. */
  private readonly view: SoulsCamera;
  /** Seconds of the SMUDGED beat. */
  static readonly DOWN_SEC = 2.8;

  /** The shared "back into the arena" rule (src/level/ArenaGuard.ts): back in 3.8 m inside the gate, facing the centre. */
  readonly guard: ArenaGuard;
  /** Answers paint on the Pen before the fight (src/level/NotYet.ts); `clock` is its play-time clock. */
  private readonly notYet: NotYet;
  private clock = 0;

  constructor(private host: SoulsHost) {
    const r = host.ring, inward = new THREE.Vector3(r.center.x - r.gatePos.x, 0, r.center.z - r.gatePos.z).normalize();
    const back = r.gatePos.clone().addScaledVector(inward, 3.8).setY(r.center.y + 0.1);
    this.guard = new ArenaGuard(host.ctx, { center: r.center, radius: r.R, back: { pos: back, yaw: Math.atan2(inward.x, inward.z) } });
    // paint on the Pen before the fight (over the ink curtain): it answers at once, with what is missing
    this.notYet = new NotYet(host.ctx, (text, kind, params) => host.toast(text, kind, params), () => this.clock);
    this.notYet.watch(host.pen, { word: 'NOT YET.', color: '#d8283a' }, () =>
      host.awakeGuardians() < 3
        ? { text: 'The Red Pen is not fighting yet. Wake the three Guardian machines first ({n}/3).', params: { n: host.awakeGuardians() } }
        : { text: 'The Red Pen waits behind its wet ink. Push through the ink gate to face it.' },
    );
    this.lock = new LockOn(host.ctx.camera);
    this.view = new SoulsCamera(host.ctx.camera, host.pen, host.ring, host.player);
    this.prev.copy(host.player.pos);
  }

  get active(): boolean {
    return this.mode !== 'off';
  }

  // ───────────── PlayerGate ─────────────
  tryDodge(): boolean {
    return this.stamina.spend(soulsTuning().dodgeCost);
  }
  tryJump(): boolean {
    return this.stamina.spend(soulsTuning().jumpCost);
  }
  sprint(dt: number, moving: boolean): boolean {
    if (!moving) return true;
    return this.stamina.drain(soulsTuning().sprintCost, dt);
  }
  get iframes(): number {
    return soulsTuning().iframes;
  }
  get recovery(): number {
    return soulsTuning().recovery;
  }
  get speedMul(): number {
    return this.stamina.out > 0 ? 0.78 : 1;
  }
  get faceTarget(): THREE.Vector3 | null {
    // aim belongs to the player: WAI faces his movement / his aim, never a target the game picked
    return null;
  }
  passable(c: Collider): boolean {
    return this.host.pen.penBody.ghost && this.host.pen.penBody.owns(c);
  }
  onHit(_damage: number, knock: number): void {
    const p = this.host.player;
    if (knock >= 10) {
      // knocked flat: the get-up is protected (a swing-back must never land on a WAI who cannot move)
      p.playAction('knockdown', 1.15, 1.0);
      p.invuln = Math.max(p.invuln, 1.45);
    }
    else p.playAction('stagger', 0.5, 0.3);
  }

  // ───────────── the gate ─────────────
  /** Prompt by the gate (null = not near it). */
  get gatePrompt(): { key: string; text: string; enabled: boolean } | null {
    if (this.mode !== 'off' || !this.host.ready()) return null;
    return this.host.ring.near(this.host.player.pos) > 0.3 ? { key: '↑', text: 'Push through the wet ink', enabled: true } : null;
  }

  private enter(): void {
    const h = this.host;
    this.mode = 'intro';
    this.entries++;
    h.ring.seal();
    // pushed through: the ink lets go of WAI a few steps inside, dripping
    const c = h.ring.center;
    const inward = new THREE.Vector3(c.x - h.player.pos.x, 0, c.z - h.player.pos.z).normalize();
    h.player.teleport(h.player.pos.clone().addScaledVector(inward, 3.8), Math.atan2(inward.x, inward.z));
    h.ctx.camera.yaw = Math.atan2(inward.x, inward.z);
    h.ctx.effects.burst(h.player.pos.clone().setY(h.player.pos.y + 1), '#c0182c', 26, 4, 0.1);
    h.player.gate = this;
    this.stamina.refill();
    if (!this.hud) {
      const hud = (this.hud = new SoulsHud());
      h.pen.voice.onLine = (who, text, waver) => hud.say(who, text, waver);
    }
    this.hud.show(true);
    this.hud.boss(false, 1);
    const phase = Difficulty.s.bossReset ? 1 : this.resume;
    const remainingHp = Difficulty.s.bossReset ? undefined : this.remainingHp;
    h.pen.restartAt(phase, remainingHp);
    h.stickersFor(phase);
    h.ctx.audio.play('drip', { vol: 1 });
    h.ctx.audio.play('phaseSting', { vol: 0.8, pitch: 0.7 });
    if (this.entries === 1) {
      h.story.bossIntro(h.pen);
      this.introT = 4.6;
    } else this.introT = 1.6;
    this.cardT = this.introT + 1.2;
    this.hud.card(true, 'THE RED PEN', remainingHp !== undefined ? 'Head of Corrections — once more, from where you left off' : 'Head of Corrections');
  }

  private start(): void {
    const h = this.host;
    this.mode = 'on';
    h.pen.engage();
    this.hud?.boss(true, h.pen.hp / h.pen.maxHp);
    if (!this.lockTipped) {
      this.lockTipped = true;
      h.toast('Aim at the glowing spots it leaves open. Y swings your view onto the Pen once. Rolls and jumps cost stamina!', 'info');
    }
  }

  /** Dev warps: straight into the fight, no intro. */
  warpIn(): void {
    if (this.mode !== 'off') return;
    this.entries = Math.max(this.entries, 1);
    this.enter();
    this.host.ctx.camera.stopCine();
    this.cardT = 1;
    this.start();
  }

  // ───────────── per fixed step ─────────────
  step(dt: number): void {
    const h = this.host;
    const p = h.player;
    this.clock += dt;
    if (this.mode === 'off') {
      if (h.ready() && h.ring.crossedIn(this.prev, p.pos)) this.enter();
      this.prev.copy(p.pos);
      return;
    }
    this.prev.copy(p.pos);
    if (this.mode === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0 && !h.ctx.camera.storyCine) this.start();
    }
    this.cardT -= dt;
    if (this.cardT <= 0) this.hud?.card(false);
    this.stamina.update(dt, h.spraying());
    if (this.hud) h.pen.voice.step(dt, this.hud.storyBusy());
    if (h.ctx.input.consumePressed(LOCK_KEY) && this.mode === 'on') {
      // one swing of the view: the open weak point nearest the crosshair, else the Pen's body (capped near WAI's eye line)
      const open = h.pen.openPoints();
      const at = open.length ? (this.lock.label ? open.find((w) => w.id === this.lock.label)!.pos : open[0].pos) : h.pen.bodyPoint();
      if (!open.length) at.setY(Math.min(at.y, p.pos.y + 5));
      this.lock.snap(at);
      h.ctx.audio.play('lockOn', { vol: 0.6 });
    }
    // out of breath: a short pant (not while rolling or hurt)
    if (this.stamina.out > 0.5 && p.grounded && p.action === 'none') p.playAction('pant', 0.6);
    // heavy landings (a long drop, a knock-back)
    if (!p.grounded) this.minVy = Math.min(this.minVy, p.vy);
    else {
      if (p.justLanded && this.minVy < -11 && p.action === 'none') {
        p.playAction('land', 0.32, 0.16);
        h.ctx.camera.shake = Math.max(h.ctx.camera.shake, 0.3);
      }
      this.minVy = 0;
    }
  }

  /** After physics: the Pen's solid body never keeps WAI inside it (it can land on him or right itself over him). */
  settle(dt: number): void {
    const pen = this.host.pen;
    // the fight and its won-over ending (the Pen still moves while it draws)
    if (!this.active && !pen.harmless) return;
    const p = this.host.player;
    // never under the roof inside the ring: a TAG leap that ends against the 14 m body could squeeze WAI through
    // the slab (seen once: the result card then showed F3 under an undrawn roof)
    const f = pen.floorY;
    if (this.host.ring.radial(p.pos) < this.host.ring.R && p.pos.y < f - 0.05 && p.pos.y > f - 4) p.enforceAbove(f);
    if (!pen.penBody.ghost) {
      const out = pen.penBody.pushOut(p.pos);
      if (out) p.nudgeTo(out);
    }
    // knocked out of the sealed ring (never seen, even by the ruler's 26 m/s sweep): back in, no heart, no reset
    if ((this.mode === 'on' || this.mode === 'intro') && !pen.harmless) this.guard.step(dt, p);
  }

  // ───────────── the mood: a red dusk falls on the roof while the fight is on, and lifts when the Pen draws ──
  private mood = 0;
  private air: { sky: THREE.MeshBasicMaterial; sun: THREE.DirectionalLight; fog: THREE.Fog; sky0: THREE.Color; sun0: THREE.Color; fog0: THREE.Color } | null = null;
  private static readonly DUSK = { sky: new THREE.Color('#ffb4a0'), sun: new THREE.Color('#ff9a6a'), fog: new THREE.Color('#c98a98') };

  private stepMood(dt: number): void {
    const want = this.mode === 'off' ? 0 : 1;
    if (want === 0 && this.mood < 0.002) return;
    this.mood += (want - this.mood) * (1 - Math.exp(-dt * (want ? 0.8 : 0.5)));
    if (!this.air) {
      const root = this.host.ctx.root;
      const sky = root.getObjectByName('works-sky') as THREE.Mesh | undefined;
      let sun: THREE.DirectionalLight | null = null;
      root.traverse((o) => {
        if (!sun && (o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
      });
      const fog = this.host.ctx.scene.fog as THREE.Fog | null;
      if (!sky || !sun || !fog) return;
      const sm = sky.material as THREE.MeshBasicMaterial;
      const sn = sun as THREE.DirectionalLight;
      this.air = { sky: sm, sun: sn, fog, sky0: sm.color.clone(), sun0: sn.color.clone(), fog0: fog.color.clone() };
    }
    const a = this.air;
    const k = this.mood;
    a.sky.color.copy(a.sky0).lerp(SoulsFight.DUSK.sky, k);
    a.sun.color.copy(a.sun0).lerp(SoulsFight.DUSK.sun, k * 0.8);
    a.fog.color.copy(a.fog0).lerp(SoulsFight.DUSK.fog, k * 0.7);
  }

  // ───────────── per frame ─────────────
  frame(dt: number): void {
    const h = this.host;
    const pen = h.pen;
    const p = h.player;
    // the honest i-frames: WAI glows white exactly while a hit would pass through him. Set before the returns below:
    // the last TAG switches the fight off, and a glow left on then would stay on WAI through the whole ending
    const iframe = !!this.hud && this.mode !== 'off' && p.dodging && p.invuln > 0;
    p.model.ghost = iframe ? 1 : Math.max(0, p.model.ghost - dt * 8);
    h.ring.update(dt, performance.now() / 1000, p.renderPos, h.ctx.camera.camera.position);
    this.stepMood(dt);
    this.view.frame(this.active || pen.harmless, this.mode === 'on');
    if (this.mode === 'off' && h.ctx.camera.extraDistance < 0.01) return;
    if (pen.harmless || !pen.awake || this.mode !== 'on') this.lock.release();
    const targets = pen.openPoints().map((w) => ({ id: w.id, pos: w.pos }));
    // the follow camera stands back a little for a 14 m Pen (phase 2: it flies, a little more)
    this.lock.frame(dt, this.mode === 'on', p.renderPos, targets, { dist: pen.phase === 2 ? 3.2 : 2.4, height: pen.phase === 2 ? 1.3 : 0.8 });
    if (!this.hud || this.mode === 'off') return;
    const s = this.stamina;
    this.hud.stamina(s.frac, s.flash, s.out > 0);
    if (this.mode === 'on') this.hud.boss(pen.awake && !pen.harmless, pen.hp / pen.maxHp);
    const sc = this.lock.screen;
    this.hud.lock(sc.visible && (!!this.lock.label || this.lock.snapping), sc.x, sc.y, this.lock.label);
    if (iframe) {
      this.ghostFx -= dt;
      if (this.ghostFx <= 0) {
        this.ghostFx = 0.045;
        h.ctx.effects.burst(p.renderPos.clone().setY(p.renderPos.y + 0.55), '#dff8ff', 2, 0.6, 0.11, -1);
      }
    }
  }

  // ───────────── smudged, the run back, the end ─────────────
  /** WAI was smudged in the ring: show the sheet. Returns how long the beat lasts. */
  smudged(): number {
    this.mode = 'down';
    this.lock.release();
    this.hud?.down(true, NOTES[Math.floor(Math.random() * NOTES.length)]);
    this.hud?.boss(false, 1);
    this.host.pen.hz.clear();
    this.host.pen.voice.clear();
    return SoulsFight.DOWN_SEC;
  }

  /** 在墨水门外重画 WAI。轻松与普通保留红笔的阶段和血量。 */
  respawn(): void {
    const h = this.host;
    this.resume = Difficulty.s.bossReset ? 1 : Math.min(3, h.pen.phase);
    this.remainingHp = Difficulty.s.bossReset ? undefined : h.pen.hp / h.pen.maxHp;
    h.pen.restartAt(this.resume, this.remainingHp);
    h.stickersFor(1);
    h.ring.unseal();
    h.player.gate = null;
    this.mode = 'off';
    this.stamina.refill();
    const cp = h.checkpoint();
    h.player.teleport(cp.pos, cp.yaw);
    h.ctx.camera.yaw = cp.yaw;
    h.ctx.camera.pitch = 0.2;
    this.prev.copy(cp.pos);
    const hud = this.hud;
    if (hud) {
      setTimeout(() => {
        hud.down(false);
        if (this.mode === 'off') hud.show(false);
      }, 500);
    }
  }

  /** The Pen is won over: the fight's rules switch off for good. */
  finish(): void {
    this.mode = 'off';
    this.lock.release();
    this.host.player.gate = null;
    this.host.ring.dissolve();
    this.host.pen.voice.clear();
    this.hud?.show(false);
  }

  /** Objective hint while outside (after a smudge). */
  get hint(): string | null {
    if (this.mode !== 'off' || !this.host.ready() || this.entries === 0) return null;
    return 'Walk back through the wet ink at the gate — the Red Pen is waiting';
  }

  dispose(): void {
    this.host.player.gate = null;
    this.hud?.dispose();
    this.hud = null;
    const cam = this.host.ctx.camera;
    cam.extraDistance = cam.extraHeight = 0;
    this.view.off();
  }
}
