/**
 * [INPUT]: depends on the shared play systems (PlayerController, WeaponSystem, CombatDirector, ThrowSystem, OrganSystem,
 *          GazeSystem, ShoutSystem from ../harbor/Shout, Effects, Ambient); buildLimpWorks/LIMP from ./LimpWorks; WorksDirector,
 *          WorksStory, WorksGuide; RedPenBoss; SoulsFight (the roof fight's souls-like rules); WORKS/FY from ./WorksLayout;
 *          PlaySession/DevLevelInfo from ../Session; bossMood from ../BossMood; FightReset (smudge → boss restart) from ../FightReset
 * [OUTPUT]: exports WorksSession (PlaySession for level 'works')
 * [POS]: one playthrough of LIMP WORKS (level 3). Same building blocks as HarborSession — composed round the Legs chapter:
 *        WAI arrives with the Eye and the Mouth, finds the Legs, wakes three Guardian machines floor by floor, and
 *        faces THE RED PEN on the roof, which crosses his stickers out (OrganInventory.crossed) one at a time. Through
 *        the ink gate the fight turns souls-like (SoulsFight: stamina, free aim + a one-shot Y view swing, honest rolls, SMUDGED → run back).
 *        Music: the souls fight (intro / on) reports 'boss_final'; the SMUDGED beat drops it.
 *        Restart = dispose() + new WorksSession().
 *        beltCarry() is the belts' one rule for WAI and the co-op partner; inWater() = the shredder pit (she is fished
 *        out of it); WorksHost.partners hands her body to the stamp presses.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../../core/AssetManager';
import type { GameContext, TimeFx } from '../../core/Context';
import { EventBus } from '../../core/Events';
import type { InputManager } from '../../core/InputManager';
import { PhysicsWorld } from '../../core/PhysicsWorld';
import type { CameraController } from '../../render/CameraController';
import { Effects } from '../../render/Effects';
import { disposeTree } from '../../render/Materials';
import type { AudioEngine } from '../../audio/AudioEngine';
import type { MusicMood } from '../../audio/Music';
import { bossMood } from '../BossMood';
import { FightReset } from '../FightReset';
import { OrganInventory } from '../../organs/OrganInventory';
import { Organ, ORGAN_DEFS, type OrganType } from '../../organs/Organ';
import { OrganSystem } from '../../organs/OrganSystem';
import { PlayerController, PLAYER } from '../../player/PlayerController';
import { CombatDirector } from '../../combat/CombatDirector';
import { ThrowSystem } from '../../weapon/ThrowSystem';
import { SPRAY, WeaponSystem } from '../../weapon/WeaponSystem';
import { PaintDrop } from '../Collectibles';
import { EdibleRegistry } from '../../hosts/Edible';
import { OrganHost, type Gazer } from '../../hosts/OrganHost';
import { GazeSystem, UndrawnSolid } from '../../hosts/Undrawn';
import type { EnemyBase } from '../../enemy/EnemyBase';
import { RedPenBoss } from '../../enemy/RedPenBoss';
import { ShoutSystem } from '../harbor/Shout';
import type { SessionStats } from '../GameSession';
import type { DevLevelInfo, PlaySession, PromptView } from '../Session';
import { t } from '../../i18n';
import { buildLimpWorks, LIMP, type WorksBuilt } from './LimpWorks';
import { WorksDirector, type GuardianId } from './WorksDirector';
import { WorksStory } from './WorksStory';
import { WorksGuide } from './WorksGuide';
import { FY, IN, WORKS } from './WorksLayout';
import { worksDevInfo, worksPrompt, type WorksSessionView } from './WorksHud';
import { SoulsFight } from './SoulsFight';

const _carry = new THREE.Vector3();
const _zero = new THREE.Vector3();

export class WorksSession implements PlaySession, WorksSessionView {
  readonly levelId = 'works' as const;
  readonly ctx: GameContext;
  readonly events = new EventBus();
  readonly physics = new PhysicsWorld();
  readonly inventory = new OrganInventory();
  readonly edibles = new EdibleRegistry();
  readonly gaze: GazeSystem;
  readonly hosts: OrganHost[] = [];
  readonly enemies: EnemyBase[] = [];
  readonly player: PlayerController;
  readonly weapon: WeaponSystem;
  readonly organs: OrganSystem;
  readonly combat: CombatDirector;
  readonly throws: ThrowSystem;
  readonly built: WorksBuilt;
  readonly story: WorksStory;
  readonly guide: WorksGuide;
  readonly director: WorksDirector;
  readonly shout: ShoutSystem;
  readonly pen: RedPenBoss;
  /** The souls-like rules of the roof fight (stamina, the camera rules, the ink gate): off everywhere else. */
  readonly souls: SoulsFight;
  readonly woken = new Set<GuardianId>();
  readonly arena = { center: LIMP.arena.clone(), radius: LIMP.arenaR };
  readonly killY = LIMP.killY;
  readonly effects: Effects;
  private root = new THREE.Group();
  splashBoots = false;
  bossDone = false;
  completed = false;
  frozen = true;
  allowUnlockedFire = false;
  stats: SessionStats;
  /** The objective hint before the stuck rule hides it (src/agent/AgentBridge.ts, the test bots). */
  hintFull = '';
  presence = 0;
  mood: MusicMood = 'explore';
  coop: import('../../coop/Coop').CoopPartner | null = null;
  private timers: { t: number; fn: () => void }[] = [];
  private checkpoint: { pos: THREE.Vector3; yaw: number };
  private smudgeTimer = 0;
  /** Hard: a smudge restarts the boss fight WAI lost (not the Red Pen's: SoulsFight restarts that one). */
  private fightReset = new FightReset();
  private victoryT = 0;
  private region = '';
  private riding: OrganHost | null = null;
  private quietUntil = new Map<string, number>();
  private dropChain = 0;
  private dropChainT = 0;
  private time = 0;
  private penTips = new Set<string>();
  private sawLesson = false;

  get allHosts(): OrganHost[] {
    return this.hosts;
  }
  /** Crowns, checkpoints, drops (the shared HUD / Pip / bridge read them here). */
  get level(): WorksBuilt {
    return this.built;
  }
  get boss(): RedPenBoss {
    return this.pen;
  }
  get camYaw(): number {
    return this.ctx.camera.yaw;
  }
  set camYaw(v: number) {
    this.ctx.camera.yaw = v;
  }

  constructor(scene: THREE.Scene, assets: AssetManager, input: InputManager, camera: CameraController, audio: AudioEngine, time: TimeFx) {
    this.root.name = 'level-root';
    scene.add(this.root);
    this.effects = new Effects(assets);
    this.root.add(this.effects.group);
    this.ctx = {
      scene,
      physics: this.physics,
      assets,
      events: this.events,
      input,
      camera,
      inventory: this.inventory,
      effects: this.effects,
      audio,
      time,
      combat: { paintMul: 1, impact: () => {} },
      root: this.root,
      damageablesNear: (p, r) => this.damageablesNear(p, r),
    };
    this.gaze = new GazeSystem(this.ctx);
    // stacked floors: the cine solver must not take the ceiling for the ground under a shot
    camera.cineProbeUp = 1.5;
    this.player = new PlayerController(this.ctx, LIMP.spawn, LIMP.spawnYaw);
    this.checkpoint = { pos: LIMP.spawn.clone(), yaw: LIMP.spawnYaw };
    this.weapon = new WeaponSystem(this.ctx);
    this.combat = new CombatDirector(this.ctx, () => this.enemies, this.player);
    this.throws = new ThrowSystem(this.ctx, this.weapon);
    this.throws.hostsProvider = () => this.hosts;
    this.ctx.combat = this.combat;
    this.events.on('player:perfect', ({ from }) => this.combat.perfectDodge(from));
    this.events.on('weapon:refill', () => (this.weapon.tank = SPRAY.tank));
    this.organs = new OrganSystem(this.ctx, () => this.hosts, this.edibles, (p, r) => this.damageablesNear(p, r).map((d) => d.target));

    this.built = buildLimpWorks(this.ctx, {
      addHost: (def) => {
        const h = new OrganHost(this.ctx, def, this.player, this.edibles);
        this.hosts.push(h);
        return h;
      },
      addUndrawn: (id, c, h) => {
        const u = new UndrawnSolid(this.ctx, id, c, h, 0, '#9fb0e0');
        this.gaze.add(u);
        return u;
      },
    });
    this.story = new WorksStory(this.ctx, this.player, this.built.hall);
    this.story.onCaption = (text, big) => this.events.emit('story:caption', { text, big });
    this.guide = new WorksGuide(this, this.root, this.ctx.camera.camera, {
      liftUp: () => this.built.lift.awake,
      stair2: () => this.built.stamping.stairReal,
      catalogue: () => this.built.archive.gate.open,
      grille: () => this.built.archive.grille.open,
    });
    this.shout = new ShoutSystem(this.ctx, () => this.enemies);
    for (const s of this.built.shoutables) this.shout.targets.push(s);
    this.stats = { time: 0, shots: 0, hits: 0, damageTaken: 0, smudges: 0, crowns: 0, totalCrowns: this.built.crowns.length, paint: 0 };
    for (const d of this.built.drops) d.onTake = this.onDrop;
    this.player.onJet = (dt) => this.weapon.drainForJet(dt);
    this.player.onSlam = (at, drop) => this.weapon.paintSlam(at, drop);
    let payoutN = 0;
    this.combat.onPayout = (from, n) => {
      const p = this.player.pos;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const r = 1.4 + Math.random() * 1.4;
        this.spawnDrop(new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 0.7 + Math.random() * 0.5, p.z + Math.sin(a) * r), Effects.splatColor(i % 5), `w3-encore-${payoutN++}`);
      }
      this.effects.burst(from, '#ffd23a', 10 + n * 2, 6, 0.09);
    };

    // WAI arrives with the Eye and the Mouth (the plaza and the harbour can keep their own now)
    for (const ty of ['EYE', 'MOUTH'] as const) {
      const o = new Organ(ty, 'start');
      o.collect();
      o.purify();
      this.inventory.add(o);
    }
    this.inventory.select('EYE');

    // ── the Red Pen ──
    this.pen = this.addEnemy(new RedPenBoss(this.ctx, 'redpen', WORKS.spawns.pen));
    this.pen.arena.copy(LIMP.arena);
    this.pen.arenaR = LIMP.arenaR;
    this.pen.waitFace = Math.atan2(WORKS.gate.x - WORKS.spawns.pen.x, WORKS.gate.z - WORKS.spawns.pen.z);
    this.pen.onCrossOut = (ty) => this.crossOut(ty);
    this.pen.onRestore = (ty) => this.restore(ty);
    this.pen.onPhase = (n) => this.story.phaseBeat(n, this.pen);
    this.pen.onTip = (key, text) => {
      if (this.penTips.has(key)) return;
      this.penTips.add(key);
      this.toast(text, 'warn');
    };
    this.souls = new SoulsFight({
      ctx: this.ctx,
      player: this.player,
      pen: this.pen,
      ring: this.built.roof.ring,
      story: this.story,
      ready: () => this.woken.size === 3 && !this.bossDone,
      awakeGuardians: () => this.woken.size,
      spraying: () => this.ctx.input.isDown('Mouse0') && this.weapon.tankFrac > 0.01,
      stickersFor: (ph) => this.stickersFor(ph),
      checkpoint: () => ({ pos: this.built.roof.checkpointAt.clone().add(new THREE.Vector3(-0.8, 0, -1.2)), yaw: Math.atan2(WORKS.gate.x - this.built.roof.checkpointAt.x, WORKS.gate.z - this.built.roof.checkpointAt.z) }),
      toast: (text, kind, params) => this.toast(text, kind, params),
    });
    this.director = new WorksDirector({
      ctx: this.ctx,
      player: this.player,
      built: this.built,
      story: this.story,
      inventory: this.inventory,
      woken: this.woken as Set<string>,
      addEnemy: (e) => this.addEnemy(e),
      guardianWoken: (id, at) => this.guardianWoken(id, at),
      recall: (ty) => {
        const o = this.inventory.get(ty);
        if (o?.lent) this.organs.recall(o, this.player, false);
      },
      toast: (text, kind, params) => this.toast(text, kind, params),
      after: (sec, fn) => this.after(sec, fn),
      respawn: () => this.respawn(),
      stuck: () => this.guide.stuck,
      partners: () => this.coop?.bodies ?? [],
    });

    this.events.on('organ:purified', ({ organ }) => {
      const e = this.enemies.find((x) => x.id === organ.sourceId) as (EnemyBase & { calm?: () => void }) | undefined;
      e?.calm?.();
    });
    this.events.on('player:damaged', ({ hp }) => {
      if (hp < PLAYER.maxHp) this.stats.damageTaken++;
    });
    this.events.on('host:reaction', ({ hostId, text }) => {
      const h = this.organs.hostById(hostId);
      if ((this.quietUntil.get(hostId) ?? 0) > performance.now()) return;
      if (!h || h.pos.distanceTo(this.player.pos) < 16) this.toast(text);
    });
    this.player.paintUnder = () => this.effects.coverage(this.player.pos, 0.9);
    this.physics.step();
  }

  // ───────────── spawning, drops ─────────────
  private addEnemy<T extends EnemyBase>(e: T): T {
    this.enemies.push(e);
    e.onFinished = (en) => this.onEnemyFinished(en);
    return e;
  }

  private onDrop = (d: PaintDrop): void => {
    this.stats.paint++;
    this.player.heal(1);
    this.dropChain = this.dropChainT > 0 ? this.dropChain + 1 : 0;
    this.dropChainT = 1.2;
    this.ctx.audio.play('paintDrop', { pos: d.position(), vol: 0.7, pitch: 1 + Math.min(10, this.dropChain) * 0.09 });
    this.events.emit('paint:collected', { count: this.stats.paint });
    const names = ['', '', 'Sunny Yellow', 'Turquoise', 'Tangerine'];
    const want = Math.min(5, 2 + Math.floor(this.stats.paint / 15));
    if (want > this.weapon.unlocked) {
      this.weapon.unlocked = want;
      this.ctx.audio.play('crown', { vol: 0.7 });
      this.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('NEW COLOUR!'), Effects.splatColor(want - 1), 0.8);
      this.toast('New spray colour: {name}! Press T to switch.', 'good', { name: t(names[want - 1]) });
    }
  };

  private dropN = 0;
  private spawnDrop(at: THREE.Vector3, color: string, id?: string): void {
    const d = new PaintDrop(this.ctx, id ?? `w3-loot-${this.dropN++}`, at, color);
    d.onTake = this.onDrop;
    this.built.drops.push(d);
    this.edibles.add(d);
  }

  private onEnemyFinished(e: EnemyBase): void {
    if (e === this.pen) return this.penDone();
    // every repainted servant leaves a little paint behind
    this.spawnDrop(e.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), Effects.splatColor(this.dropN % 5));
    if (!e.drops) return;
    const organ = new Organ(e.drops, e.id);
    const toP = this.player.pos.clone().sub(e.pos).setY(0);
    const at = e.pos.clone().addScaledVector(toP.lengthSq() > 0.01 ? toP.normalize() : e.forward(), 1.6);
    this.organs.drop(organ, at, e.pos.clone().setY(e.pos.y + 1.5));
    this.toast('THE LIMP is repainted! Your LEGS squeezed out — walk over them, then hold F to purify.', 'good');
  }

  private damageablesNear(p: THREE.Vector3, r: number): { target: import('../../combat/Damage').Damageable; point: THREE.Vector3 }[] {
    const out: { target: import('../../combat/Damage').Damageable; point: THREE.Vector3 }[] = [];
    for (const e of this.enemies) {
      if (e.disposed || e.harmless) continue;
      if (e === this.pen && !this.pen.visibleToPaint) continue;
      const c = e.pos.clone().add(new THREE.Vector3(0, Math.min(1.5, e.bigness * 2 + 0.3), 0));
      const flat = Math.hypot(c.x - p.x, c.z - p.z);
      if (flat < r + e.bigness * 1.2 && Math.abs(c.y - p.y) < r + 2.5 * e.bigness + 0.6) out.push({ target: e, point: c });
    }
    return out;
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info', params?: Record<string, string | number>): void {
    this.events.emit('toast', { text: t(text, params), kind });
  }

  // ───────────── stickers crossed out by the Red Pen ─────────────
  private crossOut(ty: OrganType): void {
    const o = this.inventory.get(ty);
    if (o?.lent) this.organs.recall(o, this.player, true);
    this.inventory.crossed.add(ty);
    this.inventory.changed();
    this.toast(ty === 'LEG' ? 'The Red Pen CROSSED OUT your LEGS — no long jumps, no fast sprint!' : 'The Red Pen CROSSED OUT your MOUTH — no more shouting!', 'warn');
  }

  /** The stickers as the Pen leaves them at the start of act `ph` (the souls fight's restarts). */
  private stickersFor(ph: number): void {
    this.inventory.crossed.clear();
    if (ph === 2) this.inventory.crossed.add('LEG');
    if (ph === 3) this.inventory.crossed.add('MOUTH');
    this.inventory.changed();
  }

  private restore(ty: OrganType): void {
    if (!this.inventory.crossed.delete(ty)) return;
    this.inventory.changed();
    this.effects.burst(this.player.pos.clone().setY(this.player.pos.y + 1.4), '#ffc6dc', 20, 4);
    this.toast('THE ERASER rubs the X off your {organ}! It’s yours again.', 'good', { organ: t(ORGAN_DEFS[ty].name) });
  }

  // ───────────── Guardians, the boss's end ─────────────
  private guardianWoken(id: GuardianId, at: THREE.Vector3): number {
    this.woken.add(id);
    const n = this.woken.size;
    this.ctx.audio.play('wake');
    this.ctx.audio.duck(0.25, 2.5);
    this.ctx.audio.music.brightness = n;
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
    this.effects.burst(at, '#ffd23a', 40, 7, 0.12);
    this.effects.ring(at, '#ffd23a', 8);
    this.events.emit('face:woken', { id, count: n });
    this.victoryT = 5;
    return n;
  }

  private penDone(): void {
    this.bossDone = true;
    this.souls.finish();
    this.victoryT = 30;
    this.inventory.crossed.clear();
    this.inventory.changed();
    const c = this.built.roof.crownPen;
    c.hidden = false;
    this.effects.burst(c.pos, '#ffd23a', 18, 3);
    for (const f of this.built.floors) f.washer.start();
    this.pen.eraser.goTo(this.pen.pos.clone().add(new THREE.Vector3(2.4, 0, 2)));
    this.events.emit('city:awake');
    this.story.finale(this.pen, () => this.complete());
  }

  private complete(): void {
    if (this.completed) return;
    this.completed = true;
    this.stats.shots = this.weapon.shots;
    this.stats.hits = this.weapon.hits;
    this.story.hush();
    this.events.emit('level:complete');
  }

  // ───────────── dev tools (story warps) ─────────────
  readonly debugStages = ['start', 'legs', 'belts', 'lift', 'stamp', 'pit', 'inspector', 'archive', 'index', 'roof', 'boss', 'phase2', 'phase3', 'final', 'exit'] as const;

  stopCine(): void {
    this.ctx.camera.stopCine();
  }

  private debugTakeLegs(): void {
    if (this.inventory.get('LEG')) {
      const o = this.inventory.get('LEG')!;
      if (o.corrupted) o.purify();
      this.inventory.changed();
      return;
    }
    if (!this.director.mutant.harmless) this.director.mutant.debugRepaint();
    for (const wo of this.organs.worldOrgans) if (!wo.disposed && wo.organ.type === 'LEG') wo.dispose();
    const o = new Organ('LEG', 'limp');
    o.collect();
    o.purify();
    this.inventory.add(o);
  }

  /** Fast-forward to `stage` (forwards only; runs the real wake steps, quietly). */
  debugWarp(stage: string): void {
    const order = this.debugStages as readonly string[];
    const want = order.indexOf(stage);
    if (want < 0) return;
    if (this.story.locked) this.story.skip();
    if (want >= 1) this.debugTakeLegs();
    const map = [0, 0, 1, 2, 2, 2, 3, 4, 6, 7, 7, 7, 7, 7, 7];
    this.director.debugTo(map[want]);
    if (want >= 10 && !this.pen.awake && !this.bossDone) this.souls.warpIn();
    if (want >= 11 && !this.bossDone) this.pen.debugPhase(want - 9);
    if (want >= 14 && !this.bossDone) this.pen.debugRepaint();
    for (let guard = 0; guard < 20 && this.timers.length; guard++) for (const tm of this.timers.splice(0, this.timers.length)) tm.fn();
    for (let i = 0; i < 4; i++) this.story.update(1.2);
    this.ctx.camera.stopCine();
    if (this.story.locked) this.story.skip();
    const A = LIMP.arena;
    const at: Record<string, [number, number, number, number]> = {
      start: [WORKS.spawn.x, WORKS.spawn.y + 0.2, WORKS.spawn.z, Math.PI],
      legs: [0, FY[0] + 0.2, 15, Math.PI],
      belts: [-3, FY[0] + 0.2, 6.6, Math.PI],
      lift: [WORKS.cage.x - 1, FY[1] + 0.5, WORKS.cage.z + 1, Math.PI],
      stamp: [12.5, FY[1] + 0.2, -9, Math.PI / 2],
      pit: [10.2, FY[1] + 0.2, -1, -Math.PI / 2],
      inspector: [-11, FY[1] + 0.2, 5.5, Math.PI],
      archive: [WORKS.arrive3.x, FY[2] + 0.2, WORKS.arrive3.z, Math.PI],
      index: [12.6, FY[2] + 0.2, 9.5, Math.PI],
      roof: [WORKS.roofArrive.x, FY[3] + 0.2, WORKS.roofArrive.z, Math.PI],
      boss: [A.x + 2, FY[3] + 0.2, A.z + LIMP.arenaR - 2.5, Math.PI],
      phase2: [A.x + 2, FY[3] + 0.2, A.z + 6, Math.PI],
      phase3: [A.x + 2, FY[3] + 0.2, A.z + 6, Math.PI],
      final: [A.x + 2, FY[3] + 0.2, A.z + 6, Math.PI],
      exit: [A.x + 2, FY[3] + 0.2, A.z + 6, Math.PI],
    };
    const [x, y, z, yaw] = at[stage];
    this.player.teleport(new THREE.Vector3(x, y, z), yaw);
    this.ctx.camera.yaw = yaw;
    this.player.hp = PLAYER.maxHp;
    this.events.emit('player:healed', { hp: this.player.hp });
    const cps = this.built.checkpoints;
    const cp = cps.find((c) => Math.abs(c.pos.y - y) < 2 && c.pos.distanceTo(new THREE.Vector3(x, y, z)) < 30);
    if (cp) this.checkpoint = { pos: cp.pos.clone().add(new THREE.Vector3(0, 0, 1.2)), yaw: cp.yaw };
  }

  // ───────────── main step ─────────────
  step(dt: number): void {
    const input = this.ctx.input;
    const p = this.player;
    const cam = this.ctx.camera;
    const cineLock = this.story.locked || cam.storyCine;
    p.frozen = this.frozen || cineLock;
    const allowed = !this.frozen && !cineLock && !p.smudged && !this.completed;
    if (allowed) this.stats.time += dt;
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    if (cam.inCine || this.story.locked) p.invuln = Math.max(p.invuln, 0.25);
    cam.aiming = allowed && (input.isDown('Mouse2') || input.isDown('KeyZ'));
    p.aiming = cam.aimT > 0.25;

    // 1) hosts, 2) player (belts carry him)
    const riding = this.riding;
    for (const h of this.hosts) {
      h.playerOnTop = h === riding;
      if (h === riding) h.driveWish.copy(p.driveWish);
      else h.driveWish.set(0, 0, 0);
      h.preStep(dt, (pt, r) => this.damageablesNear(pt, r).map((d) => d.target));
    }
    const belt = p.grounded ? this.beltCarry(p.pos, _carry) : null;
    const carry = riding ? riding.carryFor(p.pos) : belt ? belt.multiplyScalar(dt) : _zero;
    p.step(dt, carry, !!riding || !!belt, !!riding && riding.drivable);
    if (this.coop && !this.frozen) this.coop.step(dt);

    // 3) combat, story, creatures, weapon, organs, voice
    this.combat.step(dt);
    this.story.update(dt);
    if (this.story.locked && (input.consumePressed('Space') || input.consumePressed('Mouse0'))) this.story.skip();
    this.souls.step(dt);
    this.dropChainT = Math.max(0, this.dropChainT - dt);
    const edt = dt * this.combat.enemyScale;
    // (held while WAI arrives through the tower door: nothing charges at him in the opening shots)
    if (!this.frozen && !this.story.arriving) for (const e of this.enemies) if (!e.disposed) e.step(edt, this.coop ? this.coop.targetFor(e) : p);
    for (const e of this.enemies) {
      if (e.disposed || e.bigness < 0.55 || e === this.pen) continue;
      const out = e.pushOut(p.pos, PLAYER.radius);
      if (out) p.nudgeTo(out);
    }
    if (allowed && !this.combat.busy) {
      const tgt = this.combat.finisherTarget();
      if (tgt && input.consumePressed('KeyE')) this.combat.tag(tgt);
    }
    const canFire = allowed && !p.holdingPurify && p.lockTimer <= 0 && !p.dodging;
    this.weapon.step(dt, p, canFire);
    this.throws.step(dt, p, canFire && !cam.inCine, cam.aimRay());
    this.stompCheck(p);
    this.organs.step(dt, p, allowed);
    const mouth = this.inventory.get('MOUTH');
    this.shout.step(dt, p, allowed && !cam.inCine, this.inventory.worn('MOUTH'), mouth ? (mouth.corrupted ? 'corrupted' : mouth.lent ? 'lent' : 'idle') : null);

    // 4) physics, 5) ground → riding host / the lift
    this.physics.step();
    p.probeGround();
    this.souls.settle(dt);
    this.built.lift.carry(p);
    this.riding = null;
    if (p.groundCollider && this.physics.tagOf(p.groundCollider) === 'host') {
      const h = this.physics.ownerOf<OrganHost>(p.groundCollider);
      if (h && h.isOverTop(p.pos) && p.pos.y > h.top - 0.3) {
        this.riding = h;
        p.enforceAbove(h.top);
      }
    }
    if (p.grounded && p.groundCollider && this.physics.tagOf(p.groundCollider) === 'static' && !this.built.stamping.inPit(p.pos)) p.lastSafe.copy(p.pos);

    // 6) gaze & undrawn (the pencil stair); phase 3: does WAI's True Sight see the Pen?
    const gazers: Gazer[] = [];
    const wai = this.organs.waiGazer();
    if (wai) gazers.push(wai);
    for (const h of this.hosts) {
      const g = h.gazer();
      if (g) gazers.push(g);
    }
    this.gaze.update(dt, gazers, p.pos, p.groundCollider);
    this.pen.seen = !!wai && this.seesPen(wai);
    if (!this.sawLesson && this.gaze.solids.some((u) => u.solid && u.seenBy === 'wai')) {
      this.sawLesson = true;
      this.toast('TRUE SIGHT: a pencil sketch is real while you look at it. But a whole stair? The Inspector should look at it for you.', 'good');
    }

    // 7) world, collectibles, checkpoints
    const camPos = cam.camera.position;
    this.built.update(dt, p.pos, camPos);
    this.director.step(dt, this.time);
    this.effects.update(dt);
    for (const c of this.built.crowns) {
      if (c.tryCollect(p.pos)) {
        this.stats.crowns++;
        this.events.emit('crown:collected', { id: c.id, count: this.stats.crowns });
        this.toast('Crown {n}/{total} — {hint}', 'good', { n: this.stats.crowns, total: this.stats.totalCrowns, hint: t(c.hint) });
      }
    }
    for (const d of this.built.drops) d.update(dt, p.pos);
    for (const cp of this.built.checkpoints) {
      const hit = cp.update(dt, p.pos);
      if (hit) {
        this.checkpoint = { pos: cp.pos.clone().add(new THREE.Vector3(0, 0, 1.2)), yaw: cp.yaw };
        if (hit === 'first') {
          p.heal(PLAYER.maxHp);
          this.events.emit('checkpoint', { id: cp.id });
          this.toast('Checkpoint! Spray can tagged.', 'good');
        }
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].disposed) this.enemies.splice(i, 1);
    const reg = this.built.regions.find((r) => r.box.containsPoint(p.pos));
    if (reg && reg.name !== this.region) {
      this.region = reg.name;
      this.events.emit('region:entered', { name: reg.name });
    }

    // presence + music
    let presence = 0;
    let fighting = false;
    for (const e of this.enemies) {
      if (e.disposed || e.harmless) continue;
      // the Pen's music is the souls fight's (below); asleep or in the SMUDGED beat it is no fight at all
      if (e === this.pen && (!this.pen.awake || this.souls.mode === 'down')) continue;
      const d = e.pos.distanceTo(p.pos);
      if (e.engaged && d < 24) fighting = true;
      presence = Math.max(presence, e.bigness * Math.max(0, 1 - d / 16) * (e.engaged ? 1 : 0.35));
    }
    this.presence += (presence - this.presence) * Math.min(1, dt * 3);
    this.victoryT = Math.max(0, this.victoryT - dt);
    // the Red Pen's souls fight holds 'boss_final' from the gate's intro to the win or the smudge; any other
    // boss-sized creature gets 'boss' (src/level/BossMood.ts)
    const boss = this.souls.mode === 'intro' || this.souls.mode === 'on' ? 'boss_final' : bossMood(this.enemies, p.pos, this.pen);
    this.mood = this.completed ? 'victory' : boss ?? (this.victoryT > 0 ? 'victory' : fighting ? 'combat' : presence > 0.15 ? 'danger' : 'explore');

    // failure states (non-lethal)
    if (p.hp <= 0 && !p.smudged) {
      p.smudged = true;
      this.smudgeTimer = this.souls.active ? this.souls.smudged() : 1.6;
      this.stats.smudges++;
      this.fightReset.smudged(this.enemies, p.pos, this.pen);
      this.ctx.audio.play('smudged');
      this.events.emit('player:smudged');
      if (!this.souls.active) this.toast('WAI got smudged! Re-drawing at the last spray can…', 'warn');
    }
    if (p.smudged) {
      this.smudgeTimer -= dt;
      if (this.smudgeTimer <= 0) this.respawn();
    }
    if (p.pos.y < LIMP.killY || Math.abs(p.pos.x) > IN + 3 || Math.abs(p.pos.z) > IN + 3) {
      this.ctx.audio.play('whoosh', { pitch: 0.7 });
      this.respawn();
      p.hp = Math.max(1, p.hp - 1);
      this.events.emit('player:damaged', { hp: p.hp });
      this.toast('WAI fell off the canvas — re-drawn at the last spray can.', 'warn');
    }
  }

  /** WAI's aimed True Sight cone covers the Pen (and nothing solid is in between). */
  private seesPen(g: Gazer): boolean {
    if (this.pen.phase !== 3 || !this.pen.awake) return false;
    for (const k of [1.0, 2.6, 4.0]) {
      const c = this.pen.pos.clone().setY(this.pen.pos.y + k);
      const to = c.sub(g.origin);
      const d = to.length();
      if (d > g.range + 6 || d < 0.01) continue;
      to.divideScalar(d);
      if (to.dot(g.dir) > Math.cos((30 * Math.PI) / 180)) return true;
    }
    return false;
  }

  private stompCheck(p: PlayerController): void {
    const onEnemy = !!p.groundCollider && this.physics.tagOf(p.groundCollider) === 'enemy';
    if (p.vy > -2.5 && !onEnemy) return;
    for (const e of this.enemies) {
      if (e.disposed || e.harmless || e === this.pen) continue;
      const top = e.topY;
      const flat = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (flat > e.bodyRadius + 0.75 || p.pos.y < top - 0.45 || p.pos.y > top + 0.4) continue;
      const small = e.bigness < 0.6;
      e.applyDamage({ amount: small ? 70 : 25, point: new THREE.Vector3(e.pos.x, top, e.pos.z), dir: new THREE.Vector3(0, -1, 0), collider: null, kind: 'stomp', color: '#ffd23a' });
      p.vy = small ? 10 : 12;
      p.grounded = false;
      this.effects.comic(new THREE.Vector3(e.pos.x, top + 0.6, e.pos.z), t('STOMP!'), '#ffd23a', 0.7);
      this.events.emit('enemy:stomped', { id: e.id });
      this.effects.ring(new THREE.Vector3(e.pos.x, top, e.pos.z), '#ffffff', 2.5);
      this.ctx.audio.play('stomp', { pos: e.pos, pitch: 1.5, vol: 0.7 });
      this.ctx.time.hitstop(0.06);
      break;
    }
  }

  startStory(): void {
    this.story.intro(this.pen, this.director.mutant.pos.clone());
  }

  respawn(): void {
    const p = this.player;
    if (this.souls.active) this.souls.respawn();
    else p.teleport(this.checkpoint.pos, this.checkpoint.yaw);
    const yaw = p.facing;
    p.hp = PLAYER.maxHp;
    p.smudged = false;
    p.invuln = 2;
    this.shout.muteT = 0;
    this.ctx.camera.yaw = yaw;
    this.events.emit('player:healed', { hp: p.hp });
    for (const e of this.enemies) if (e.engaged && e !== this.pen && e.pos.distanceTo(p.pos) > 12) e.alerted = false;
    this.fightReset.respawn();
  }

  /** No water here; the shredder pit is where the partner gets fished out (WAI's pit fall is WorksDirector's). */
  inWater(p: THREE.Vector3): boolean {
    return this.built.stamping.inPit(p);
  }

  beltCarry(feet: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    return this.built.hall.carry(feet, out);
  }

  // ───────────── HUD ─────────────
  guideGoal(): THREE.Vector3 | null {
    if (this.completed || this.bossDone) return null;
    if (this.woken.size === 3) return this.souls.active ? null : WORKS.gate.clone().setY(FY[3] + 0.6);
    const inv = this.inventory;
    const d = this.organs.worldOrgans.find((w) => !w.disposed && w.organ.type === 'LEG');
    if (!inv.get('LEG') && d) return d.at.clone().setY(d.at.y + 0.8);
    for (const ty of ['EYE', 'MOUTH'] as OrganType[]) {
      const o = inv.get(ty);
      if (o?.lent && !['freight-lift', 'inspector', 'archivist'].includes(o.hostId ?? '')) return null;
    }
    return this.director.guideGoal();
  }

  /**
   * Objective panel text. Same rule as levels 1 and 2: the title always, the director's "where to go" line
   * only once the stuck rule (src/ui/Guide.ts) says the player has stopped making progress. The boss fight's
   * own lines and the recall controls always show.
   */
  objective(): { title: string; hint: string } {
    const n = this.woken.size;
    const title = n < 3 ? t('Wake the Guardian machines {n}/3', { n }) : this.completed ? t('Limp Works complete!') : this.bossDone ? t('The Red Pen draws!') : t('Repaint THE RED PEN');
    let hint = '';
    if (n === 3) hint = this.bossDone ? 'The city stays drawn wrong — and that is fine.' : this.pen.awake ? this.pen.counterHint : this.souls.hint ?? 'Climb to the roof and push through the curtain of wet red ink: THE RED PEN is waiting';
    else {
      for (const ty of ['EYE', 'MOUTH'] as OrganType[]) {
        const o = this.inventory.get(ty);
        if (o?.lent && !['freight-lift', 'inspector', 'archivist'].includes(o.hostId ?? '')) hint = ty === 'EYE' ? 'Hold Q to recall your Eye' : 'Hold R to recall your Mouth';
      }
      if (hint) {
        this.hintFull = t(hint);
        return { title, hint: this.hintFull };
      }
      const remaining = [
        !this.woken.has('lift') ? t('Freight Lift') : '',
        !this.woken.has('inspector') ? t('Inspector') : '',
        !this.woken.has('archivist') ? t('Archivist') : '',
      ].filter(Boolean).join(' · ');
      const base = this.director.hint() ?? '';
      this.hintFull = remaining && base ? `${base}\n${t('Remaining: {list}', { list: remaining })}` : base;
      return { title, hint: this.hintFull };
    }
    this.hintFull = hint ? t(hint) : '';
    return { title, hint: this.hintFull };
  }

  prompt(): PromptView | null {
    return worksPrompt(this);
  }

  bossTarget(): EnemyBase | null {
    let best: EnemyBase | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.disposed || e.harmless || !e.engaged || e.bigness < 0.5) continue;
      const d = e.pos.distanceTo(this.player.pos);
      if (d < 30 && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  render(alpha: number, frameDt: number): void {
    this.souls.frame(frameDt);
    this.player.render(alpha, frameDt);
    this.player.model.setWorn({ eye: this.inventory.worn('EYE'), mouth: this.inventory.worn('MOUTH'), leg: this.inventory.worn('LEG') });
    for (const e of this.enemies) if (!e.disposed && e.root.visible) e.render(alpha, frameDt);
    for (const h of this.hosts) h.render(alpha, frameDt);
    this.weapon.render(alpha);
    this.guide.update(frameDt, this.frozen || this.story.locked || this.ctx.camera.inCine);
    this.coop?.render(alpha, frameDt);
  }

  cameraBlocker = (c: import('@dimforge/rapier3d-compat').Collider): boolean => {
    const tag = this.physics.tagOf(c);
    if (tag === 'enemy') {
      const e = this.physics.ownerOf<{ bigness: number; harmless?: boolean }>(c);
      return !!e && e.bigness >= 0.55 && !e.harmless;
    }
    if (tag === 'static') {
      const he = (c.shape as { halfExtents?: { x: number; y: number; z: number } }).halfExtents;
      if (he && Math.min(he.x, he.y, he.z) < 0.09 && Math.max(he.x, he.y, he.z) < 1.2) return false;
    }
    return tag === 'static' || tag === 'gate' || tag === 'undrawn' || tag === 'host';
  };

  get devInfo(): DevLevelInfo {
    return worksDevInfo(this);
  }

  dispose(): void {
    this.ctx.camera.cineProbeUp = 40;
    this.souls.dispose();
    this.guide.dispose();
    this.coop?.dispose();
    this.coop = null;
    this.story.dispose();
    this.shout.clear();
    this.weapon.clear();
    this.organs.clear();
    this.effects.clear();
    for (const e of this.enemies) {
      disposeTree(e.root);
      e.dispose();
    }
    this.events.clear();
    this.ctx.audio.stopAllLoops();
    this.root.parent?.remove(this.root);
    disposeTree(this.root);
    this.ctx.scene.fog = null;
    this.physics.dispose();
  }
}
