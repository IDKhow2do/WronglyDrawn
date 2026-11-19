import type { PromptView } from './Session';
/**
 * [INPUT]: depends on PhysicsWorld, EventBus, the player/organ/weapon/combat systems; buildBlindPlaza (LEVEL, BuiltLevel)
 *          from ./BlindPlaza; EnemyBase and the level-1 creatures (EraserBoss, EraserGrub, PeepingLamp, ChomperBin,
 *          CrookedLegMutant), swarmSpots from enemy/Swarm; QuarterDirector from ./plaza/QuarterDirector; StoryDirector;
 *          bossMood from ./BossMood; FightReset (smudge → boss restart) from ./FightReset; ArenaGuard (back into the summit);
 *          NotYet (a boss hit before its fight answers)
 * [OUTPUT]: exports GameSession (one playthrough of level 1, Blind Plaza) and SessionStats
 * [POS]: level 1's session: owns the world and every system, spawns the creatures, runs the three faces, the
 *        Eraser finale and the dev warps. A boss's or mid-boss's summons are repainted with it (no orphan biters),
 *        and when a smudge restarts its fight on Hard. 面向被封住的雕像时提示红墨水瓶。Mid-fight, ArenaGuard puts a WAI knocked out of
 *        the summit back at SUMMIT_ENTRY (the in-arena respawn spot), with no heart cost.
 *        HarborSession (level 2) and WorksSession (level 3) are its siblings; QuarterDirector runs the second district.
 *        The painted springs (Ambient) throw the co-op partner too (`coop.bodies`); springPads() lists them for her brain.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Guide } from '../ui/Guide';
import { ArenaGuard } from './ArenaGuard';
import { NotYet } from './NotYet';
import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { GameContext, TimeFx } from '../core/Context';
import { EventBus } from '../core/Events';
import type { InputManager } from '../core/InputManager';
import { PhysicsWorld } from '../core/PhysicsWorld';
import type { CameraController } from '../render/CameraController';
import { Effects } from '../render/Effects';
import { disposeTree } from '../render/Materials';
import type { AudioEngine } from '../audio/AudioEngine';
import { OrganInventory } from '../organs/OrganInventory';
import { Organ, ORGAN_DEFS, type OrganType } from '../organs/Organ';
import { OrganSystem } from '../organs/OrganSystem';
import { PlayerController, PLAYER } from '../player/PlayerController';
import { CombatDirector } from '../combat/CombatDirector';
import { ThrowSystem } from '../weapon/ThrowSystem';
import { EraserBoss } from '../enemy/EraserBoss';
import { StoryDirector } from '../story/StoryDirector';
import { Ambient, type SpringSpot } from './Ambient';
import { SPRAY, WeaponSystem } from '../weapon/WeaponSystem';
import { PaintDrop } from './Collectibles';
import { EdibleRegistry } from '../hosts/Edible';
import { OrganHost, type HostDef, type Gazer } from '../hosts/OrganHost';
import { GazeSystem, UndrawnSolid } from '../hosts/Undrawn';
import type { Damageable } from '../combat/Damage';
import { EnemyBase } from '../enemy/EnemyBase';
import { CrookedLegMutant } from '../enemy/CrookedLegMutant';
import { EraserGrub } from '../enemy/EraserGrub';
import { swarmSpots } from '../enemy/Swarm';
import { ChomperBin } from '../enemy/ChomperBin';
import { PeepingLamp } from '../enemy/PeepingLamp';
import { gorgeX } from './Terrain';
import { LEVEL, buildBlindPlaza, type BuiltLevel } from './BlindPlaza';
import type { MusicMood } from '../audio/Music';
import { bossMood } from './BossMood';
import { FightReset } from './FightReset';
import { t } from '../i18n';
import { QuarterDirector } from './plaza/QuarterDirector';

export interface SessionStats {
  time: number;
  shots: number;
  hits: number;
  damageTaken: number;
  smudges: number;
  crowns: number;
  totalCrowns: number;
  paint: number;
}

type FaceId = 'sleepyWall' | 'gatehouse' | 'statue';

/**
 * One playthrough of Blind Plaza. Owns physics, entities and every system.
 * Restart = dispose() + new GameSession() (no stale state).
 */
export class GameSession {
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
  readonly level: BuiltLevel;
  private root = new THREE.Group();
  readonly combat: CombatDirector;
  readonly throws: ThrowSystem;
  /** Reward: stomps burst paint. */
  splashBoots = false;
  /** All organ hosts (read-only view for the AI bridge). */
  get allHosts(): OrganHost[] {
    return this.hosts;
  }
  readonly story: StoryDirector;
  ambient3!: Ambient;
  eraser!: EraserBoss;
  bossDone = false;
  /** seconds since the repainted Eraser started shrinking (-1 = not yet) */
  private littleT = -1;
  /** hosts whose idle chatter is muted until this time (ms) */
  private quietUntil = new Map<string, number>();
  private effects: Effects;
  readonly woken = new Set<FaceId>();
  private timers: { t: number; fn: () => void }[] = [];
  private checkpoint: { pos: THREE.Vector3; yaw: number };
  private smudgeTimer = 0;
  /** 困难模式下，被抹花后重开当前头目战。 */
  private fightReset = new FightReset();
  /** Knocked out of the summit mid-fight (behind the tower door, over the rim): back in (src/level/ArenaGuard.ts). */
  readonly arenaGuard: ArenaGuard;
  /** Answers a boss hit before its fight (the Eraser, the Red Inkwell over its barricades). */
  readonly notYet: NotYet;
  /** WAI hit the Eraser from the summit's edge before the fight: it starts at once. */
  private eraserPoked = false;

  /** Is WAI on the summit floor, `margin` m inside its wall ring? */
  private onSummit(margin: number): boolean {
    const p = this.player.pos;
    return Math.hypot(p.x - LEVEL.summit.x, p.z - LEVEL.summit.z) < LEVEL.summitRadius - margin && p.y > LEVEL.summit.y - 0.6;
  }
  completed = false;
  /** objective marker (where to go next) */
  readonly guide: Guide;
  frozen = true;
  allowUnlockedFire = false;
  stats: SessionStats;
  /** The objective hint before the stuck rule hides it (src/agent/AgentBridge.ts, the test bots). */
  hintFull = '';
  private nestTriggered = false;
  private nestGrubs = new Set<string>();
  private grubCount = 0;
  private region = '';
  presence = 0;
  mood: MusicMood = 'explore';
  private victoryT = 0;
  private benchHome: THREE.Vector3;
  private mailboxSpat = false;
  /** Who WAI is riding (set after the physics step, used next step). */
  private riding: OrganHost | null = null;
  private scaffoldProxy: Damageable;
  readonly mutant: CrookedLegMutant;
  readonly lamp: PeepingLamp;
  readonly starterLamp: PeepingLamp;
  readonly chomper: ChomperBin;
  /** The Crossed-Out Quarter (second district + the Red Inkwell mid-boss): src/level/plaza. */
  readonly quarter: QuarterDirector;
  /** AI co-op partner (src/coop), spawned by main when enabled. */
  coop: import('../coop/Coop').CoopPartner | null = null;

  constructor(
    scene: THREE.Scene,
    assets: AssetManager,
    input: InputManager,
    camera: CameraController,
    audio: AudioEngine,
    time: TimeFx,
  ) {
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
    this.player = new PlayerController(this.ctx, LEVEL.spawn, LEVEL.spawnYaw);
    this.checkpoint = { pos: LEVEL.spawn.clone(), yaw: LEVEL.spawnYaw };
    this.weapon = new WeaponSystem(this.ctx);
    this.combat = new CombatDirector(this.ctx, () => this.enemies, this.player);
    this.throws = new ThrowSystem(this.ctx, this.weapon);
    this.throws.hostsProvider = () => this.hosts;
    this.ctx.combat = this.combat;
    this.events.on('player:perfect', ({ from }) => this.combat.perfectDodge(from));
    this.story = new StoryDirector(this.ctx, this.player);
    this.guide = new Guide(this, this.ctx.root, this.ctx.camera.camera);
    this.story.onCaption = (text, big) => this.events.emit('story:caption', { text, big });
    this.events.on('weapon:refill', () => (this.weapon.tank = SPRAY.tank));
    this.organs = new OrganSystem(
      this.ctx,
      () => this.hosts,
      this.edibles,
      (p, r) => this.damageablesNear(p, r).map((d) => d.target),
    );

    this.level = buildBlindPlaza(this.ctx, {
      addHost: (def: HostDef) => {
        const h = new OrganHost(this.ctx, def, this.player, this.edibles);
        this.hosts.push(h);
        return h;
      },
      addUndrawn: (id, c, h, yaw, color) => {
        const u = new UndrawnSolid(this.ctx, id, c, h, yaw, color);
        this.gaze.add(u);
        return u;
      },
      addEdible: (e) => this.edibles.add(e),
    });
    this.stats = { time: 0, shots: 0, hits: 0, damageTaken: 0, smudges: 0, crowns: 0, totalCrowns: this.level.crowns.length, paint: 0 };
    this.benchHome = this.level.hosts['bench-hub'].pos.clone();
    const onDrop = (d: PaintDrop) => {
        this.stats.paint++;
        this.player.heal(1);
        // quick pickups chain into a rising scale (like coins)
        this.dropChain = this.dropChainT > 0 ? this.dropChain + 1 : 0;
        this.dropChainT = 1.2;
        this.ctx.audio.play('paintDrop', { pos: d.position(), vol: 0.7, pitch: 1 + Math.min(10, this.dropChain) * 0.09 });
        this.events.emit('paint:collected', { count: this.stats.paint });
        // every 15 drops: a new spray colour
        const names = ['', '', 'Sunny Yellow', 'Turquoise', 'Tangerine'];
        const want = Math.min(5, 2 + Math.floor(this.stats.paint / 15));
        if (want > this.weapon.unlocked) {
          this.weapon.unlocked = want;
          this.ctx.audio.play('crown', { vol: 0.7 });
          this.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('NEW COLOUR!'), Effects.splatColor(want - 1), 0.8);
          this.toast('New spray colour: {name}! Press T to switch.', 'good', { name: t(names[want - 1]) });
        }
      };
    for (const d of this.level.drops) d.onTake = onDrop;
    // combat hooks: JET HOVER drinks from the can, PAINT SLAM splashes, ENCORE pays paint drops
    this.player.onJet = (dt) => this.weapon.drainForJet(dt);
    this.player.onSlam = (at, drop) => this.weapon.paintSlam(at, drop);
    let payoutN = 0;
    this.combat.onPayout = (from, n) => {
      const p = this.player.pos;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const r = 1.4 + Math.random() * 1.4;
        const d = new PaintDrop(this.ctx, `drop-encore-${payoutN++}`, new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 0.7 + Math.random() * 0.5, p.z + Math.sin(a) * r), Effects.splatColor(i % 5));
        d.onTake = onDrop;
        this.level.drops.push(d);
        this.edibles.add(d);
      }
      this.effects.burst(from, '#ffd23a', 10 + n * 2, 6, 0.09);
    };

    // ---- enemies ----
    const sp = this.level.spawns;
    this.mutant = this.addEnemy(new CrookedLegMutant(this.ctx, 'mutant', sp.mutant));
    this.mutant.onFootstep = (p) => this.bigFootstep(p);
    this.mutant.onChargeImpact = (p) => this.chargeImpact(p);
    // the Eye comes first: a gentle Peeping Lamp right by the spawn point
    this.starterLamp = this.addEnemy(new PeepingLamp(this.ctx, 'starter-lamp', sp.starterLamp, { tutorial: true, drops: 'EYE' }));
    // the rooftop lamp is now an optional mini-boss guarding a crown
    this.lamp = this.addEnemy(new PeepingLamp(this.ctx, 'lamp', sp.lamp, { drops: null }));
    this.lamp.onSummon = (p) => this.summoned(this.lamp, this.spawnSwarm(p, 7));
    this.chomper = this.addEnemy(new ChomperBin(this.ctx, 'chomper', sp.chomper));
    for (const g of sp.grubs) this.spawnSwarm(g, 10);
    this.ambient3 = new Ambient(this.ctx, this.level.eyeSpots, this.level.perches, this.level.springSpots);
    this.events.on('city:awake', () => this.ambient3.wakeAll());
    this.events.on('face:woken', ({ count }) => this.ambient3.wake(count));
    this.player.paintUnder = () => this.effects.coverage(this.player.pos, 0.9);
    // the villain waits on the summit from the very start (you can see it from everywhere)
    this.eraser = this.addEnemy(new EraserBoss(this.ctx, 'eraser', sp.eraser));
    this.arenaGuard = new ArenaGuard(this.ctx, { center: LEVEL.summit, radius: LEVEL.summitRadius, back: SUMMIT_ENTRY, hold: true });
    this.eraser.arena.copy(LEVEL.summit);
    this.eraser.arenaR = LEVEL.summitRadius;
    this.eraser.onSummon = (p) => this.summoned(this.eraser, this.spawnSwarm(p, 6));
    this.eraser.onFightReset = (e) => this.repaintSummons(e);
    // its crumbs land as rocks — throw them back at its face!
    this.eraser.onCrumbLanded = (p) => this.throws.spawnRock(p);
    // the second district: its creatures, its mid-boss, and the red cross over the statue's eye
    this.quarter = new QuarterDirector({
      ctx: this.ctx,
      player: this.player,
      quarter: this.level.quarter,
      statue: this.level.hosts.statue,
      woken: this.woken,
      story: this.story,
      addEnemy: (e) => this.addEnemy(e),
      spawnGrub: (p, leash) => this.spawnSwarm(p, leash),
      toast: (text, kind, params) => this.toast(text, kind, params),
      after: (sec, fn) => this.after(sec, fn),
      springDone: (pos) => this.ambient3.springDone(pos) ?? true,
      stuck: () => this.guide.stuck,
    });
    // a boss hit before its fight answers at once, with what is missing (src/level/NotYet.ts)
    this.notYet = new NotYet(this.ctx, (text, kind, params) => this.toast(text, kind, params), () => this.stats.time);
    this.notYet.watch(this.eraser, { word: 'NOT YET!', color: '#ff9ec4' }, () => {
      if (this.woken.size < 3) return { text: 'The Eraser is not fighting yet. Wake the three Guardians first ({n}/3).', params: { n: this.woken.size } };
      // hit from the summit's edge (outside the start circle): that is a challenge, the fight starts now
      this.eraserPoked = this.onSummit(0.6);
      return this.eraserPoked ? null : { text: 'Step onto the summit to face the Eraser.' };
    });
    this.notYet.watch(this.quarter.inkwell, { word: 'RUNS OFF!', color: '#e8e2f0' }, () => ({
      text: 'Your paint runs off its glass from out here. Get past the red barricades into Inkwell Square first.',
    }));


    // the scaffold reacts to heavy hits (spit / charge)
    const scaffoldPos = this.level.scaffoldPos.clone().setY(2);
    this.scaffoldProxy = {
      damageable: true,
      applyDamage: (info) => {
        if (info.kind === 'spit' || info.kind === 'crash') this.level.collapseScaffold();
        return { weak: false };
      },
    };
    void scaffoldPos;

    // ---- the three faces ----
    const wall = this.level.hosts.sleepyWall;
    wall.def.onOrgans = (h) => {
      const eye = h.lent('EYE');
      if (eye && !this.woken.has('sleepyWall')) this.wake('sleepyWall', h, 'EYE');
    };
    const gate = this.level.hosts.gatehouse;
    gate.def.onOrgans = (h) => {
      if (h.lent('MOUTH') && !this.woken.has('gatehouse')) this.wake('gatehouse', h, 'MOUTH');
    };
    const statue = this.level.hosts.statue;
    statue.def.onOrgans = (h) => {
      if (h.lent('EYE') && !this.woken.has('statue')) this.wake('statue', h, 'EYE');
    };
    let statueAwakeT = 0;
    statue.def.onStep = (h, dt) => {
      // once awake (and not being told to turn by legs) it gazes at the arch —
      // after its close-up, so the turn plays in the follow-up shot
      if (this.woken.has('statue')) statueAwakeT += dt;
      if (this.woken.has('statue') && !h.has('LEG') && statueAwakeT > 2.5) {
        const want = Math.atan2(LEVEL.summit.x - h.pos.x, LEVEL.summit.z - h.pos.z);
        let d = want - h.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        h.yaw += THREE.MathUtils.clamp(d, -0.9 * dt, 0.9 * dt);
      }
    };
    const mailbox = this.level.hosts.mailbox;
    mailbox.def.onOrgans = (h) => {
      if (h.has('MOUTH') && !this.mailboxSpat) {
        this.mailboxSpat = true;
        this.after(1.2, () => {
          const c = this.level.crowns.find((x) => x.id === 'crown-mailbox')!;
          c.hidden = false;
          this.ctx.audio.play('spit', { pos: c.pos });
          this.effects.burst(c.pos, '#ffd23a', 16, 3);
          this.toast('The Mailbox coughs up something shiny!', 'good');
        });
      }
    };

    // ---- events ----
    this.events.on('organ:purified', ({ organ }) => {
      const e = this.enemies.find((x) => x.id === organ.sourceId) as (EnemyBase & { calm?: () => void }) | undefined;
      e?.calm?.();
    });
    this.events.on('player:damaged', ({ hp }) => {
      if (hp < PLAYER.maxHp) this.stats.damageTaken++;
    });
    // a host's little remarks only make sense when you're there to hear them
    this.events.on('host:reaction', ({ hostId, text }) => {
      const h = this.organs.hostById(hostId);
      // …and not while a Guardian is having its big wake-up moment
      if ((this.quietUntil.get(hostId) ?? 0) > performance.now()) return;
      if (!h || h.pos.distanceTo(this.player.pos) < 14) this.toast(text);
    });

    this.physics.step();
  }

  // ───────────── spawning ─────────────
  private addEnemy<T extends EnemyBase>(e: T): T {
    this.enemies.push(e);
    e.onFinished = (en) => this.onEnemyFinished(en);
    return e;
  }

  /** 每个点刷一只墨虫。困难会多刷，虫巢波次按原定数量。 */
  private spawnSwarm(p: THREE.Vector3, leash: number): EraserGrub[] {
    return swarmSpots(this.ctx, p).map((q) => this.spawnGrub(q, leash));
  }

  /** Each summoner's summons (the Eraser's and the rooftop lamp's grubs). */
  private summons = new Map<EnemyBase, EnemyBase[]>();
  private summoned(by: EnemyBase, list: EnemyBase[]): void {
    this.summons.set(by, [...(this.summons.get(by) ?? []), ...list]);
  }

  /** The summoner is won over: its servants stop correcting too (repainted through their own finish, never deleted). */
  private repaintSummons(by: EnemyBase): void {
    for (const e of this.summons.get(by) ?? []) if (!e.harmless && !e.disposed) e.debugRepaint();
    this.summons.delete(by);
  }

  private spawnGrub(p: THREE.Vector3, leash: number, wave = false): EraserGrub {
    const g = new EraserGrub(this.ctx, `grub-${this.grubCount++}`, p.clone(), leash);
    this.addEnemy(g);
    this.edibles.add(g);
    if (wave) this.nestGrubs.add(g.id);
    g.onPop = (gg, eaten) => {
      if (this.nestGrubs.delete(gg.id) && this.nestTriggered && this.nestGrubs.size === 0) {
        const c = this.level.crowns.find((x) => x.id === 'crown-nest')!;
        c.hidden = false;
        this.effects.burst(c.pos, '#ffd23a', 18, 3);
        this.toast('Nest cleared! A crown pops out of the crumbs.', 'good');
      }
      if (Math.random() < 0.35) this.effects.burst(gg.pos, '#ffb3d1', 4, 2);
      if (!eaten) this.releaseCleanGrub(gg.pos);
    };
    this.effects.burst(p.clone().add(new THREE.Vector3(0, 0.4, 0)), '#ff9ec4', 8, 2.5);
    return g;
  }

  /** A repainted grub: a clean pastel eraser that hops away happily (nobody dies). */
  private dropChain = 0;
  private dropChainT = 0;
  /** Has the player made undrawn geometry real at least once? */
  sawLesson = false;
  private ambient: { obj: THREE.Object3D; t: number; vel: THREE.Vector3; baseY: number }[] = [];
  private releaseCleanGrub(at: THREE.Vector3): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), new THREE.MeshStandardMaterial({ color: ['#bff3ff', '#fff2a8', '#d8ffd0'][Math.floor(Math.random() * 3)], roughness: 0.8 }));
    body.position.y = 0.12;
    const eyeM = new THREE.MeshBasicMaterial({ color: '#141014' });
    for (const z of [-0.06, 0.06]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeM);
      e.position.set(0.21, 0.17, z);
      g.add(e);
    }
    g.add(body);
    g.position.copy(at);
    const away = at.clone().sub(this.player.pos).setY(0).normalize().multiplyScalar(2.2);
    g.rotation.y = Math.atan2(away.x, away.z) - Math.PI / 2;
    this.root.add(g);
    this.ambient.push({ obj: g, t: 0, vel: away, baseY: at.y });
  }

  /** Mario-style: land on a small creature's head to squash it (and bounce). */
  private stompCheck(p: PlayerController): void {
    const onEnemy = !!p.groundCollider && this.physics.tagOf(p.groundCollider) === 'enemy';
    if (p.vy > -2.5 && !onEnemy) return;
    for (const e of this.enemies) {
      if (e.disposed || e.harmless) continue;
      const top = e.topY;
      const flat = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (flat > e.bodyRadius + 0.75 || p.pos.y < top - 0.45 || p.pos.y > top + 0.4) continue;
      const small = e.bigness < 0.6;
      e.applyDamage({ amount: small ? 70 : 25, point: new THREE.Vector3(e.pos.x, top, e.pos.z), dir: new THREE.Vector3(0, -1, 0), collider: null, kind: 'stomp', color: '#ffd23a' });
      p.vy = small ? 10 : 12;
      p.grounded = false;
      this.effects.comic(new THREE.Vector3(e.pos.x, top + 0.6, e.pos.z), t('STOMP!'), '#ffd23a', 0.7);
      this.events.emit('enemy:stomped', { id: e.id });
      // Splash Boots: every stomp bursts paint around
      if (this.splashBoots) this.weapon.bombImpact(new THREE.Vector3(e.pos.x, top, e.pos.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), this.weapon.color);
      this.effects.ring(new THREE.Vector3(e.pos.x, top, e.pos.z), '#ffffff', 2.5);
      this.ctx.audio.play('stomp', { pos: e.pos, pitch: 1.5, vol: 0.7 });
      this.ctx.time.hitstop(0.06);
      break;
    }
  }

  /** Called once the gameplay camera takes over (after the title push-in). */
  startStory(): void {
    this.story.intro(LEVEL.spawn, this.eraser);
  }

  private onEnemyFinished(e: EnemyBase): void {
    this.repaintSummons(e);
    if (e === this.eraser) {
      this.bossDone = true;
      this.level.lockArena(false);
      this.victoryT = 30;
      // repainted, it shrinks back into a little pink pencil eraser and hops out of the doorway
      this.littleT = 0;
      this.story.finale(this.eraser, () => {
        this.level.openArchDoor();
        // every sleepy face in town opens its eyes
        this.events.emit('city:awake');
      });
      return;
    }
    if (e.id === 'lamp') {
      this.reveal('crown-lamp');
      this.toast('The rooftop lamp is repainted — it was guarding a crown!', 'good');
    }
    if (!e.drops) return;
    const organ = new Organ(e.drops, e.id);
    // land it somewhere WAI can actually reach: same floor as the creature, on the player's side
    // (never on top of a wall or roof — that was a softlock)
    const toP = this.player.pos.clone().sub(e.pos).setY(0);
    const towardP = toP.lengthSq() > 0.01 ? toP.normalize() : e.forward();
    let at = e.pos.clone();
    for (const c of [towardP.clone().multiplyScalar(2), towardP.clone().multiplyScalar(1.2), e.forward().multiplyScalar(2), new THREE.Vector3()]) {
      const cand = e.pos.clone().add(c);
      const hit = this.physics.raycast(cand.clone().setY(e.pos.y + 1.2), new THREE.Vector3(0, -1, 0), 3, (col) => this.physics.tagOf(col) === 'static');
      const clear = !this.physics.raycast(e.pos.clone().setY(e.pos.y + 0.6), c.lengthSq() > 0 ? c.clone().normalize() : new THREE.Vector3(0, -1, 0), Math.max(0.01, c.length()), (col) => this.physics.tagOf(col) === 'static');
      if (hit && clear && Math.abs(hit.point.y - e.pos.y) < 0.8) {
        at = cand.setY(hit.point.y);
        break;
      }
    }
    const from = e.drops === 'EYE' ? e.pos.clone().setY(e.pos.y + 4.7) : e.pos.clone().setY(e.pos.y + 1.5);
    this.organs.drop(organ, at, from);
    this.toast('The {enemy} is repainted! Its corruption squeezed out into the {organ} — walk over it.', 'good', {
      enemy: t(e.displayName),
      organ: t(ORGAN_DEFS[e.drops].corruptedName),
    });
  }

  private damageablesNear(p: THREE.Vector3, r: number): { target: Damageable; point: THREE.Vector3 }[] {
    const out: { target: Damageable; point: THREE.Vector3 }[] = [];
    for (const e of this.enemies) {
      if (e.disposed || e.harmless) continue;
      const c = e.pos.clone().add(new THREE.Vector3(0, Math.min(1.5, e.bigness * 2 + 0.3), 0));
      const flat = Math.hypot(c.x - p.x, c.z - p.z);
      if (flat < r + e.bigness * 1.2 && Math.abs(c.y - p.y) < r + 2.5 * e.bigness + 0.6) out.push({ target: e, point: c });
    }
    if (this.level.scaffoldPos.distanceTo(p) < r + 1.5) out.push({ target: this.scaffoldProxy, point: this.level.scaffoldPos.clone() });
    return out;
  }

  private after(t: number, fn: () => void): void {
    this.timers.push({ t, fn });
  }

  // ───────────── dev tools (story warps) ─────────────
  // Every warp runs the game's own story steps in order (repaint → organ → purify → wake),
  // so the world ends up exactly as if you had played there: bridges, roads, crowns, hints.

  /** Dev tools: the follow camera's heading. */
  get camYaw(): number {
    return this.ctx.camera.yaw;
  }
  set camYaw(v: number) {
    this.ctx.camera.yaw = v;
  }

  stopCine(): void {
    this.ctx.camera.stopCine();
  }

  /** Run every pending story timer now (skips the waits between beats). */
  private flushTimers(): void {
    for (let guard = 0; guard < 20 && this.timers.length; guard++) {
      const due = this.timers.splice(0, this.timers.length);
      for (const tm of due) tm.fn();
    }
  }

  /** Take a dropped organ (or the one this enemy would drop) straight into the inventory, purified. */
  private debugTake(type: OrganType): void {
    for (const wo of this.organs.worldOrgans) {
      if (wo.disposed || wo.organ.type !== type) continue;
      wo.organ.collect();
      this.inventory.add(wo.organ);
      wo.dispose();
    }
    const o = this.inventory.get(type);
    if (o?.corrupted) o.purify();
    this.inventory.changed(); // the HUD cards redraw (they showed "hold to purify" on a clean sticker)
  }

  /** A repainted creature dropped a second copy of a sticker you already own: tidy it away. */
  private debugDropStray(type: OrganType): void {
    for (const wo of this.organs.worldOrgans) if (!wo.disposed && wo.organ.type === type) wo.dispose();
  }

  readonly debugStages = ['start', 'eye', 'cliff', 'gate', 'quarter', 'inkwell', 'statue', 'summit', 'door'] as const;

  /** Guide arrow: the quarter's next point while it is the next step (src/ui/Guide.ts asks). */
  quarterGoal(): THREE.Vector3 | null {
    return this.quarter.guideGoal();
  }

  /** Fast-forward the story to `stage` (only forwards; restart the level to go back). */
  debugWarp(stage: (typeof this.debugStages)[number]): void {
    const order = this.debugStages;
    const want = order.indexOf(stage);
    const idx = (s: (typeof this.debugStages)[number]) => order.indexOf(s);
    const enemy = (id: string) => this.enemies.find((e) => e.id === id);
    const hosts = this.level.hosts;
    // the chapter means "you played up to here": its creatures are repainted even if you already hold the sticker
    if (want >= 1) {
      enemy('starter-lamp')?.debugRepaint();
      if (!this.inventory.get('EYE')) this.debugTake('EYE');
      else this.debugDropStray('EYE');
    }
    if (want >= 2 && !this.woken.has('sleepyWall')) this.wake('sleepyWall', hosts.sleepyWall, 'EYE');
    if (want >= 3 && !this.woken.has('gatehouse')) {
      enemy('chomper')?.debugRepaint();
      if (!this.inventory.get('MOUTH')) this.debugTake('MOUTH');
      else this.debugDropStray('MOUTH');
      this.wake('gatehouse', hosts.gatehouse, 'MOUTH');
    }
    if (want >= idx('statue')) this.quarter.debugClear();
    if (want >= idx('statue') && !this.woken.has('statue')) this.wake('statue', hosts.statue, 'EYE');
    if (want >= idx('door') && !this.bossDone) {
      if (!this.eraser.awake) this.eraser.engage();
      this.eraser.debugRepaint();
    }
    this.flushTimers();
    this.ctx.camera.stopCine();
    if (this.story.locked) this.story.skip();
    // where each stage is played from
    const at: Record<string, [number, number, number, number]> = {
      start: [LEVEL.spawn.x, LEVEL.spawn.y + 0.2, LEVEL.spawn.z, LEVEL.spawnYaw],
      eye: [-11, 1.7, -10, Math.PI],
      cliff: [-36, 1.8, 12, -Math.PI / 2],
      gate: [-15, 1.8, 11, -Math.PI / 2],
      quarter: [29.3, 13.2, -31.2, Math.PI / 2],
      inkwell: [50.5, 13.2, -21.5, -0.64],
      statue: [12, 1.8, -16, Math.PI],
      summit: [0, 12.4, -28, Math.PI],
      door: [0, 14.2, -44, Math.PI],
    };
    const [x, y, z, yaw] = at[stage];
    this.player.teleport(new THREE.Vector3(x, y, z), yaw);
    this.ctx.camera.yaw = yaw;
    this.player.hp = PLAYER.maxHp;
    this.events.emit('player:healed', { hp: this.player.hp });
  }

  /** `text` is the English source (i18n key); `params` fill its {placeholders}. */
  private toast(text: string, kind: 'info' | 'warn' | 'good' = 'info', params?: Record<string, string | number>): void {
    this.events.emit('toast', { text: t(text, params), kind });
  }

  // ───────────── waking faces ─────────────
  private wake(id: FaceId, host: OrganHost, organType: OrganType): void {
    this.woken.add(id);
    this.quietUntil.set(host.id, performance.now() + 8000);
    host.grantPermanent(organType);
    const n = this.woken.size;
    this.ctx.audio.play('wake');
    this.ctx.audio.duck(0.25, 2.5);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
    this.effects.burst(host.socketWorld(organType), '#ffd23a', 40, 7, 0.12);
    this.effects.ring(host.socketWorld(organType), '#ffd23a', 8, host.forward());
    this.ctx.audio.music.brightness = n;
    // after the face's own close-up: show what waking it changed
    const shot = (pos: number[], look: number[], toPos: number[], dur: number) => ({
      pos: new THREE.Vector3(...(pos as [number, number, number])),
      look: new THREE.Vector3(...(look as [number, number, number])),
      toPos: new THREE.Vector3(...(toPos as [number, number, number])),
      dur,
      fov: 48,
      toFov: 44,
      handheld: 0.02,
    });
    // …and the stretch of hill road it redraws (the pencil sketches it back in)
    const gapIdx = id === 'sleepyWall' ? 0 : id === 'gatehouse' ? 1 : 2;
    const gc = this.level.roadGapCenter(gapIdx);
    if (id === 'sleepyWall') this.ctx.camera.queueCine([shot([-20, 6, 18], [-34, 0, 12], [-24, 4.5, 15], 2.0)]);
    // aim above the bastion (a look point inside the wall made the camera sweep start in the wall)
    else if (id === 'gatehouse') this.ctx.camera.queueCine([shot([-26, 9, 6], [-38, 4, -4], [-29, 7.5, 2.5], 2.2)]);
    this.after(id === 'statue' ? 2.6 : 4.6, () => {
      this.ctx.camera.playCine([shot([gc.x - 9, gc.y + 7, gc.z + 10], [gc.x, gc.y, gc.z], [gc.x - 6, gc.y + 5, gc.z + 7], 2.3)]);
      this.after(0.6, () => {
        this.level.redrawRoad(gapIdx);
        this.story.pencilDraw(gc);
        this.toast(n < 3 ? 'A stretch of the hill road is redrawn! ({n}/3)' : 'The whole road to the summit is drawn again!', 'good', { n });
      });
    });
    if (id === 'sleepyWall') {
      this.level.wakeWallFacade();
      for (const b of this.level.bridge) b.permanent = true;
      this.reveal('crown-wall');
      this.toast('THE SLEEPY WALL WAKES UP! Its gaze paints a bridge across the canal to the west.', 'good');
    } else if (id === 'gatehouse') {
      this.level.lowerDrawbridge();
      this.reveal('crown-gate');
      this.toast('THE GATEHOUSE SHOUTS! The drawbridge comes down.', 'good');
    } else {
      const smear = host.bodyGroup.getObjectByName('blind-smear');
      if (smear) smear.visible = false;
      this.toast('THE BLIND STATUE CAN SEE! It turns to look up at the tower on the summit…', 'good');
    }
    this.events.emit('face:woken', { id, count: n });
    // the face paints its own organ — your sticker comes home
    this.after(2.4, () => {
      const o = host.lent(organType);
      if (o) {
        this.organs.recall(o, this.player, false);
        this.toast('"I can draw my own now — thanks!" Your {organ} flies back.', 'info', { organ: t(o.def.name) });
      }
    });
    if (n === 3)
      this.after(7.5, () => {
        this.victoryT = 6;
        this.toast('All three Guardians are awake! The road is whole — climb to the summit and face the Eraser.', 'good');
      });
  }

  private reveal(crownId: string): void {
    const c = this.level.crowns.find((x) => x.id === crownId);
    if (c) {
      c.hidden = false;
      this.effects.burst(c.pos, '#ffd23a', 16, 3);
    }
  }

  // ───────────── mutant hooks ─────────────
  private bigFootstep(p: THREE.Vector3): void {
    const d = p.distanceTo(this.player.pos);
    this.ctx.audio.play('bigStep', { pos: p, vol: 1 });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5 * Math.max(0, 1 - d / 20));
  }

  private chargeImpact(p: THREE.Vector3): boolean {
    let any = false;
    for (const r of this.level.rubble) if (!r.disposed && r.center.distanceTo(p) < 2.4) {
      r.smash();
      any = true;
    }
    if (this.level.scaffoldPos.distanceTo(p.clone().setY(0)) < 2.8) any = this.level.collapseScaffold() || any;
    return any;
  }

  // ───────────── main step ─────────────
  step(dt: number): void {
    const input = this.ctx.input;
    const p = this.player;
    const cam = this.ctx.camera;
    // story beats / Guardian cutscenes: WAI holds still (no walking off-camera, no stray shots)
    const cineLock = this.story.locked || cam.storyCine;
    p.frozen = this.frozen || cineLock;
    const allowed = !this.frozen && !cineLock && !p.smudged && !this.completed;
    if (allowed) this.stats.time += dt;

    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.t += dt;
      a.obj.position.addScaledVector(a.vel, dt);
      a.obj.position.y = a.baseY + Math.abs(Math.sin(a.t * 9)) * 0.35;
      a.obj.scale.setScalar(Math.max(0.01, 1 - Math.max(0, a.t - 2.2) * 2));
      if (a.t > 2.7) {
        this.root.remove(a.obj);
        this.ambient.splice(i, 1);
      }
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }

    // aim
    cam.aiming = allowed && (input.isDown('Mouse2') || input.isDown('KeyZ'));
    p.aiming = cam.aimT > 0.25;

    // 1) hosts move first (moving platforms)
    const riding = this.riding;
    for (const h of this.hosts) {
      h.playerOnTop = h === riding;
      if (h === riding) h.driveWish.copy(p.driveWish);
      else h.driveWish.set(0, 0, 0);
      h.preStep(dt, (pt, r) => this.damageablesNear(pt, r).map((d) => d.target));
    }

    // 2) player (carried by its host)
    const carry = riding ? riding.carryFor(p.pos) : new THREE.Vector3();
    if (riding && Math.abs(riding.deltaYaw) > 0) p.facing += riding.deltaYaw;
    p.step(dt, carry, !!riding, !!riding && riding.drivable);
    if (this.coop && !this.frozen) this.coop.step(dt);

    // 3) enemies, weapon, organs
    this.combat.step(dt);
    this.story.update(dt);
    if (this.story.locked && (input.consumePressed('Space') || input.consumePressed('Mouse0'))) this.story.skip();
    // the Eraser lobs crumbs at WAI while he climbs toward it; on the summit the fight starts
    const onRoad = p.pos.z < -16 && p.pos.x > 7 && p.pos.x < 28;
    // (not into the Crossed-Out Quarter, east of the road: that district has its own fights)
    this.eraser.bombard = !this.eraser.awake && (onRoad || p.pos.y > 10) && p.pos.x < 27.5;
    // the fight starts only once WAI is clearly ON the summit (the wall ring stands at r − 0.3; triggering
    // at the very edge used to lock him outside it, unable to reach the Eraser or be reached)
    const flat = Math.hypot(p.pos.x - LEVEL.summit.x, p.pos.z - LEVEL.summit.z);
    // (or at once when he hits the Eraser from the summit's edge: NotYet's answer sets eraserPoked)
    if (!this.eraser.awake && !this.bossDone && this.woken.size === 3 && (flat < LEVEL.summitRadius - 2.2 || (this.eraserPoked && flat < LEVEL.summitRadius - 0.6)) && p.pos.y > LEVEL.summit.y - 0.6) {
      this.eraser.engage();
      // never lock with WAI on the wrong side of the ring: pull him a step in first
      if (flat > LEVEL.summitRadius - 1.6) {
        const k = (LEVEL.summitRadius - 1.8) / flat;
        p.body.setTranslation({ x: LEVEL.summit.x + (p.pos.x - LEVEL.summit.x) * k, y: p.pos.y + 0.05, z: LEVEL.summit.z + (p.pos.z - LEVEL.summit.z) * k }, true);
      }
      this.level.lockArena(true);
      this.story.bossIntro(this.eraser);
    }
    this.dropChainT = Math.max(0, this.dropChainT - dt);
    if (this.littleT >= 0 && this.littleT < 4) {
      this.littleT += dt;
      const k = THREE.MathUtils.smoothstep(this.littleT, 0.8, 2.4);
      this.eraser.sizeMul = THREE.MathUtils.lerp(1, 0.16, k);
      if (k > 0.35) this.eraser.dropCollider(); // small enough: nothing blocks the door any more
      // a few happy hops to the side of the doorway
      const side = new THREE.Vector3(LEVEL.summit.x + 3.2, this.eraser.pos.y, LEVEL.summit.z - 3);
      if (k > 0.5) this.eraser.pos.lerp(side, Math.min(1, dt * 2.5));
    }
    const edt = dt * this.combat.enemyScale; // Paint Time: only the creatures slow down
    if (!this.frozen) for (const e of this.enemies) if (!e.disposed) e.step(edt, this.coop ? this.coop.targetFor(e) : p);
    // creatures that turned or lunged into WAI push him out (no standing inside the Eraser)
    for (const e of this.enemies) {
      if (e.disposed || e.bigness < 0.55) continue;
      const out = e.pushOut(p.pos, PLAYER.radius);
      if (out) p.nudgeTo(out);
    }
    // mid-fight WAI can never leave the summit, whatever shoves him (dash, shockwave, push-out): ArenaGuard
    if (this.eraser.awake && !this.bossDone) this.arenaGuard.step(dt, p);
    // TAG IT!: E on a reeling creature beats every other use of E
    if (allowed && !this.combat.busy) {
      const tgt = this.combat.finisherTarget();
      if (tgt && input.consumePressed('KeyE')) this.combat.tag(tgt);
    }
    const canFire = allowed && !p.holdingPurify && p.lockTimer <= 0 && !p.dodging;
    this.weapon.step(dt, p, canFire);
    this.throws.step(dt, p, canFire && !this.ctx.camera.inCine, this.ctx.camera.aimRay());
    this.stompCheck(p);
    this.organs.step(dt, p, allowed);

    // 4) physics
    this.physics.step();

    // 5) ground probe → riding host for the next step
    p.probeGround();
    this.riding = null;
    if (p.groundCollider && this.physics.tagOf(p.groundCollider) === 'host') {
      const h = this.physics.ownerOf<OrganHost>(p.groundCollider);
      if (h && h.isOverTop(p.pos) && p.pos.y > h.top - 0.3) {
        this.riding = h;
        p.enforceAbove(h.top);
      }
    }
    // safe ground for canal respawns (real ground only, not temporary platforms)
    if (p.grounded && p.groundCollider && this.physics.tagOf(p.groundCollider) === 'static' && p.pos.y > -2.8) p.lastSafe.copy(p.pos);

    // 6) gaze & undrawn
    const gazers: Gazer[] = [...this.level.paintedGazers];
    const wai = this.organs.waiGazer();
    if (wai) gazers.push(wai);
    for (const h of this.hosts) {
      const g = h.gazer();
      if (g) gazers.push(g);
    }
    this.gaze.update(dt, gazers, p.pos, p.groundCollider);
    if (!this.sawLesson && this.gaze.solids.some((u) => u.solid && u.seenBy === 'wai')) {
      this.sawLesson = true;
      this.toast('TRUE SIGHT: things nobody drew exist while you look at them. Lend your Eye to something and it keeps looking for you.', 'good');
    }

    // 7) collectibles & world
    const camPos = cam.aimRay().origin;
    this.level.update(dt, camPos);
    this.ambient3.update(dt, p, this.coop?.bodies);
    this.effects.update(dt);
    for (const c of this.level.crowns) {
      if (c.tryCollect(p.pos)) {
        this.stats.crowns++;
        this.events.emit('crown:collected', { id: c.id, count: this.stats.crowns });
        this.toast('Crown {n}/{total} — {hint}', 'good', { n: this.stats.crowns, total: this.stats.totalCrowns, hint: t(c.hint) });
      }
    }
    for (const d of this.level.drops) d.update(dt, p.pos);
    for (const cp of this.level.checkpoints) {
      const hit = cp.update(dt, p.pos);
      if (hit) {
        // the last spray can you walked past is always where you get redrawn
        this.checkpoint = { pos: cp.pos.clone().add(new THREE.Vector3(0, 0, 1.2)), yaw: cp.yaw };
        if (hit === 'first') {
          p.heal(PLAYER.maxHp);
          this.events.emit('checkpoint', { id: cp.id });
          this.toast('Checkpoint! Spray can tagged.', 'good');
        }
      }
    }
    // bench crown: revealed when the bench walks away
    const bench = this.level.hosts['bench-hub'];
    if (this.level.benchCrown.hidden && bench.pos.distanceTo(this.benchHome) > 1.8) {
      this.level.benchCrown.hidden = false;
      this.toast('Something shiny was hiding under the bench!', 'good');
    }
    // grub nest wave
    if (!this.nestTriggered && this.woken.size >= 1 && p.pos.distanceTo(this.level.spawns.nest) < 9) {
      this.nestTriggered = true;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        this.spawnGrub(this.level.spawns.nest.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)), 12, true);
      }
      this.ctx.audio.play('squeak', { pos: this.level.spawns.nest });
      this.toast('An Eraser Grub nest! Clear all five.', 'warn');
    }
    // remove dead enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].disposed) this.enemies.splice(i, 1);
    this.quarter.step(dt);

    // regions
    const reg = this.level.regions.find((r) => r.box.containsPoint(p.pos));
    if (reg && reg.name !== this.region) {
      this.region = reg.name;
      this.events.emit('region:entered', { name: reg.name });
    }

    // presence + music
    let presence = 0;
    let fighting = false;
    for (const e of this.enemies) {
      if (e.disposed || e.harmless) continue;
      const d = e.pos.distanceTo(p.pos);
      if (e.engaged && d < 24) fighting = true;
      presence = Math.max(presence, e.bigness * Math.max(0, 1 - d / 16) * (e.engaged ? 1 : 0.35));
    }
    this.presence += (presence - this.presence) * Math.min(1, dt * 3);
    this.victoryT = Math.max(0, this.victoryT - dt);
    // a live boss or mid-boss fight holds 'boss' from its intro to the repaint (src/level/BossMood.ts)
    const boss = bossMood(this.enemies, p.pos);
    this.mood = this.completed ? 'victory' : boss ?? (this.victoryT > 0 ? 'victory' : fighting ? 'combat' : presence > 0.15 ? 'danger' : 'explore');

    // completion
    if (!this.completed && this.bossDone && LEVEL.completeTrigger.containsPoint(p.pos.clone().setY(p.pos.y + 0.5))) {
      this.completed = true;
      this.stats.shots = this.weapon.shots;
      this.stats.hits = this.weapon.hits;
      this.events.emit('level:complete');
    }

    // failure states (non-lethal)
    if (p.hp <= 0 && !p.smudged) {
      p.smudged = true;
      this.smudgeTimer = 1.6;
      this.stats.smudges++;
      this.fightReset.smudged(this.enemies, p.pos);
      this.ctx.audio.play('smudged');
      this.events.emit('player:smudged');
      this.toast('WAI got smudged! Re-drawing at the last spray can…', 'warn');
    }
    if (p.smudged) {
      this.smudgeTimer -= dt;
      if (this.smudgeTimer <= 0) this.respawn();
    }
    if (p.pos.y < LEVEL.killY) {
      // fell off the island: redrawn at the last spray can
      this.ctx.audio.play('whoosh', { pitch: 0.7 });
      this.respawn();
      p.hp = Math.max(1, p.hp - 1);
      this.events.emit('player:damaged', { hp: p.hp });
      this.toast('WAI fell off the canvas — re-drawn at the last spray can.', 'warn');
    } else if (p.pos.y < -3.7 && Math.abs(p.pos.x - gorgeX(p.pos.z)) < 6) {
      // fell into the ink canal
      p.teleport(p.lastSafe.clone().add(new THREE.Vector3(0, 0.1, 0)));
      this.ctx.audio.play('splat', { vol: 1, pitch: 0.6 });
      if (!p.takeHit(p.pos.clone().add(new THREE.Vector3(0, -1, 0)), 1, 0)) this.events.emit('player:damaged', { hp: p.hp });
      this.toast('Splash! The ink spat you back out.', 'warn');
    }
  }

  respawn(): void {
    const p = this.player;
    // mid-boss-fight: redrawn just inside the locked arena (facing the Eraser), not outside it
    const inArena = this.eraser.awake && !this.bossDone;
    const at = inArena ? SUMMIT_ENTRY.pos.clone() : this.checkpoint.pos;
    const yaw = inArena ? SUMMIT_ENTRY.yaw : this.checkpoint.yaw;
    p.teleport(at, yaw);
    p.hp = PLAYER.maxHp;
    p.smudged = false;
    p.invuln = 2;
    this.ctx.camera.yaw = yaw;
    this.events.emit('player:healed', { hp: p.hp });
    // calm down enemies that were chasing
    for (const e of this.enemies) if (e.engaged && e.pos.distanceTo(p.pos) > 12) e.alerted = false;
    this.fightReset.respawn();
  }

  /**
   * Objective panel text. The title is always there; the "where to go" line waits for the stuck rule
   * (src/ui/Guide.ts), so a player who is exploring is never told where to walk. What a control does
   * (purify, the boss's counter) is not guidance and always shows.
   */
  objective(): { title: string; hint: string } {
    const inv = this.inventory;
    const n = this.woken.size;
    const title = n < 3 ? t('Wake the Guardians {n}/3', { n }) : this.completed ? t('Blind Plaza complete!') : this.bossDone ? t('Enter the tower') : t('Repaint the Eraser');
    const leg = inv.get('LEG');
    const eye = inv.get('EYE');
    const mouth = inv.get('MOUTH');
    const remaining = n < 3 ? [
      !this.woken.has('sleepyWall') ? t('Sleepy Cliff (Eye)') : '',
      !this.woken.has('gatehouse') ? t('Gatehouse (Mouth)') : '',
      !this.woken.has('statue') ? t('Blind Statue (Eye)') : '',
    ].filter(Boolean).join(' · ') : '';
    let hint = '';
    // a control or a fight's counter is not guidance: it shows whatever the stuck rule says
    const now = (text: string) => ({ title, hint: (this.hintFull = t(text)) });
    if (n === 3 && !this.bossDone && this.eraser.awake) return now(this.eraser.counterHint);
    if (n === 3) hint = this.bossDone ? 'Walk through the open tower door' : 'The road is whole again — climb the switchbacks to the summit';
    else if (leg?.corrupted) return now('Hold F to purify the crooked legs');
    else if (eye?.corrupted) return now('Hold Q to purify the eye');
    else if (mouth?.corrupted) return now('Hold R to purify the mouth');
    else if (!eye) hint = 'That street lamp has a corrupted eye and it’s staring at you. Spray its pupil!';
    // always the next step on the main path (the workyard's Legs are an optional extra)
    else if (!this.woken.has('sleepyWall')) hint = eye.lent ? 'Recall your Eye (hold Q), then give it to the Sleepy Cliff north of the plaza (press E)' : 'Give your Eye to the Sleepy Cliff — the giant sleeping face north of the plaza. Face it and press E';
    else if (!this.woken.has('gatehouse') && !mouth) hint = 'Cross the new bridge west: the Chomper Bin on the quay has a Mouth. Spray its back, not its mouth!';
    else if (!this.woken.has('gatehouse')) hint = mouth?.lent ? 'Recall your Mouth (hold R), then give it to the Gatehouse on the west bastion (press E)' : 'The Gatehouse on the west bastion has no voice — face it and press E to give it your Mouth';
    else if (!this.woken.has('statue')) hint = this.quarter.hint() ?? (eye.lent ? 'Recall your Eye (hold Q), then give it to the Blind Statue in the plaza (press E)' : 'Your Eye came back to you. The Blind Statue in the plaza still can’t see — face it and press E');
    const base = hint ? t(hint) : '';
    this.hintFull = remaining && base ? `${base}\n${t('Remaining: {list}', { list: remaining })}` : base;
    return { title, hint: this.hintFull };
  }

  /** Context prompt for the HUD. */
  prompt(): PromptView | null {
    const p = this.player;
    const inv = this.inventory;
    const sel = inv.get(inv.selected);
    if (sel?.corrupted) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Hold to purify {organ}', { organ: t(sel.def.corruptedName) }), enabled: true };
    const coopPrompt = this.coop?.prompt();
    if (coopPrompt) return coopPrompt;
    const host = this.organs.focusedHost;
    const seal = host === this.level.hosts.statue ? host.def.refuses?.EYE : undefined;
    if (seal) return { key: '', text: seal, enabled: false };
    // graffiti outlines nearby: show how much is filled in
    for (const tg of this.level.tags) {
      if (tg.done) continue;
      if (tg.center.distanceTo(p.pos) < 7) return { key: 'SPRAY', text: tg.progress > 0 ? t('Graffiti {pct}% — keep spraying the outline', { pct: Math.round(tg.progress * 100) }) : t('A graffiti outline… spray it full to make it real'), enabled: true };
    }
    const enc = this.combat.encorePrompt;
    if (enc) return { ...enc, enabled: true };
    if (this.combat.finisherTarget()) return { key: 'E', action: 'Tag', text: t('TAG IT!'), enabled: true };
    if (this.throws.held) return { key: 'G', text: t('Hold G to charge · release to throw the {thing}', { thing: t(this.throws.held.def.name) }), enabled: true };
    const liftable = this.throws.canLiftNear(p);
    if (liftable && !this.organs.focusedHost) return { key: 'G', text: t('Pick up the {thing}', { thing: t(liftable.def.name) }), enabled: true };
    if (!host) {
      if (this.riding?.drivable) return { key: 'WASD', text: t('Steer the {host} · Space to hop off', { host: t(this.riding.def.name) }), enabled: true };
      return null;
    }
    if (sel && sel.type === 'LEG' && host.lent('LEG') === sel && host.movable) return { key: 'E', action: host.mode === 'follow' ? 'Stay' : 'Call', text: t(host.mode === 'follow' ? 'Tell the {host} to stay' : 'Call the {host}', { host: t(host.def.name) }), enabled: true };
    if (!sel) return { key: 'E', text: t(host.def.name), enabled: false };
    if (sel.lent) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Hold to recall {organ}', { organ: t(sel.def.name) }), enabled: true };
    const reason = host.canAccept(sel);
    if (reason) return { key: 'E', text: reason, enabled: false };
    void p;
    return { key: 'E', action: 'Apply', text: t('Stick {organ} on the {host}', { organ: t(sel.def.name), host: t(host.def.name) }), enabled: true };
  }

  /** Nearest engaged big enemy for the boss bar. */
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
    this.player.render(alpha, frameDt);
    this.player.model.setWorn({ eye: this.inventory.worn('EYE'), mouth: this.inventory.worn('MOUTH'), leg: this.inventory.worn('LEG') });
    for (const e of this.enemies) if (!e.disposed) e.render(alpha, frameDt);
    for (const h of this.hosts) h.render(alpha, frameDt);
    this.weapon.render(alpha);
    this.guide.update(frameDt, this.frozen || this.story.locked || this.ctx.camera.inCine);
    this.coop?.render(alpha, frameDt);
  }

  /** Camera ray/sphere filter: only solid level geometry blocks the camera. */
  cameraBlocker = (c: import('@dimforge/rapier3d-compat').Collider): boolean => {
    const tag = this.physics.tagOf(c);
    if (tag === 'enemy') {
      // big creatures and bosses are solid to the camera (it must never sink into a face)
      const e = this.physics.ownerOf<{ bigness: number; harmless?: boolean }>(c);
      return !!e && e.bigness >= 0.55 && !e.harmless;
    }
    // thin panels and posts (railings, balustrades) don't shove the camera into WAI's head:
    // it passes them and the occlusion fader ghosts them out
    if (tag === 'static') {
      const he = (c.shape as { halfExtents?: { x: number; y: number; z: number } }).halfExtents;
      if (he && Math.min(he.x, he.y, he.z) < 0.09 && Math.max(he.x, he.y, he.z) < 1.2) return false;
    }
    return tag === 'static' || tag === 'gate' || tag === 'undrawn' || tag === 'host';
  };

  // ───────────── shared session surface (src/level/Session.ts: HUD, Pip, WD_AGENT, dev panel) ─────────────
  readonly levelId = 'plaza' as const;
  get boss(): EraserBoss {
    return this.eraser;
  }
  readonly arena = { center: LEVEL.summit, radius: LEVEL.summitRadius };
  readonly killY = LEVEL.killY;
  springPads(): readonly SpringSpot[] {
    return this.ambient3.readySprings();
  }

  /** The ink canal (Pip gets fished out of it). */
  inWater(p: THREE.Vector3): boolean {
    return p.y < -3.4 && Math.abs(p.x - gorgeX(p.z)) < 6;
  }

  dispose(): void {
    this.guide.dispose();
    this.coop?.dispose();
    this.coop = null;
    this.weapon.clear();
    this.organs.clear();
    this.effects.clear();
    for (const e of this.enemies) {
      disposeTree(e.root); // enemies only detach themselves; free their GPU buffers on teardown
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

/** Just inside the summit's south gap, facing the Eraser: the in-arena respawn spot and ArenaGuard's way back in. */
const SUMMIT_ENTRY = { pos: new THREE.Vector3(LEVEL.summit.x, LEVEL.summit.y + 0.2, LEVEL.summit.z + 6.5), yaw: Math.PI };
