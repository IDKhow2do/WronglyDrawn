/**
 * [INPUT]: depends on the shared play systems (PlayerController, WeaponSystem, CombatDirector, ThrowSystem, OrganSystem,
 *          GazeSystem, ShoutSystem from ./harbor/Shout); buildMuteHarbor/HARBOR from ./harbor/MuteHarbor; PierDirector;
 *          HushBoss, HushMoth, EraserGrub, swarmSpots; bossMood from ./BossMood; FightReset from ./FightReset; ArenaGuard;
 *          NotYet (the Hush hit before its fight answers)
 * [OUTPUT]: exports HarborSession (PlaySession for level 'harbor')
 * [POS]: one playthrough of MUTE HARBOR (level 2), sibling of GameSession and WorksSession. Owns the Hush fight and its
 *        brood (repainted with it, and when a smudge restarts its fight on Hard); PierDirector runs the pier.
 *        Mid-fight, ArenaGuard puts a WAI knocked off the headland plaza back at ARENA_ENTRY, with no heart cost.
 *        The painted springs (Ambient) throw the co-op partner too (`coop.bodies`); springPads() lists them for her brain.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
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
import type { MusicMood } from '../audio/Music';
import { bossMood } from './BossMood';
import { FightReset } from './FightReset';
import { ArenaGuard } from './ArenaGuard';
import { NotYet } from './NotYet';
import { OrganInventory } from '../organs/OrganInventory';
import { Organ, ORGAN_DEFS, type OrganType } from '../organs/Organ';
import { OrganSystem } from '../organs/OrganSystem';
import { PlayerController, PLAYER } from '../player/PlayerController';
import { CombatDirector } from '../combat/CombatDirector';
import { ThrowSystem } from '../weapon/ThrowSystem';
import { SPRAY, WeaponSystem } from '../weapon/WeaponSystem';
import { PaintDrop } from './Collectibles';
import { EdibleRegistry } from '../hosts/Edible';
import { OrganHost, type HostDef, type Gazer } from '../hosts/OrganHost';
import { GazeSystem, UndrawnSolid } from '../hosts/Undrawn';
import { EnemyBase } from '../enemy/EnemyBase';
import { ChomperBin } from '../enemy/ChomperBin';
import { PeepingLamp } from '../enemy/PeepingLamp';
import { EraserGrub } from '../enemy/EraserGrub';
import { swarmSpots } from '../enemy/Swarm';
import { HushMoth } from '../enemy/HushMoth';
import { HushBoss } from '../enemy/HushBoss';
import { Ambient, type SpringSpot } from './Ambient';
import { HarborStory } from '../story/HarborStory';
import { HARBOR, buildMuteHarbor, type HarborBuilt, type LevelApi } from './harbor/MuteHarbor';
import { buildPier, PIER, type BuiltPier } from './harbor/BandstandPier';
import { PierDirector } from './harbor/PierDirector';
import { HARBOR_ISLAND, HY, harborHeight, isWater, LIGHTHOUSE } from './harbor/HarborTerrain';
import { ShoutSystem } from './harbor/Shout';
import { HarborGuide } from './harbor/HarborGuide';
import type { SessionStats } from './GameSession';
import type { DevLevelInfo, PlaySession, PromptView } from './Session';
import { t } from '../i18n';
import { touchIcon } from '../ui/TouchIcons';

type GuardianId = 'ferry' | 'clock' | 'lighthouse';

/**
 * One playthrough of MUTE HARBOR (level 2). Same building blocks as Blind Plaza's GameSession
 * (player, spray, throws, organs/hosts, combat/encore, checkpoints, crowns, drops, Pip, the guide)
 * — composed here around the level's own story: the SHOUT mechanic, three sound Guardians and THE
 * HUSH. Restart = dispose() + new HarborSession().
 */
export class HarborSession implements PlaySession {
  readonly levelId = 'harbor' as const;
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
  readonly level: HarborBuilt;
  /** Bandstand Pier, the second district (level-2 expansion). */
  readonly pierBuilt: BuiltPier;
  readonly pier: PierDirector;
  readonly shout: ShoutSystem;
  readonly story: HarborStory;
  readonly guide: HarborGuide;
  readonly hush: HushBoss;
  readonly chomper: ChomperBin;
  readonly lamp: PeepingLamp;
  readonly woken = new Set<GuardianId>();
  readonly arena = { center: HARBOR.arena.clone(), radius: HARBOR.arenaR };
  readonly killY = HARBOR.killY;
  private root = new THREE.Group();
  /** (read by App's loading prewarm) */
  readonly effects: Effects;
  private ambient3: Ambient;
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
  coop: import('../coop/Coop').CoopPartner | null = null;
  /** The lighthouse called the Hush in (it's over the headland). */
  hushRisen = false;
  /** WAI hit the Hush from the plaza's edge before the fight: it starts at once (NotYet's answer). */
  private hushPoked = false;
  private timers: { t: number; fn: () => void }[] = [];
  private checkpoint: { pos: THREE.Vector3; yaw: number };
  private smudgeTimer = 0;
  /** Hard: a smudge restarts the boss fight WAI lost. */
  private fightReset = new FightReset();
  /** Knocked out of the headland plaza mid-fight: back in (src/level/ArenaGuard.ts). */
  readonly arenaGuard: ArenaGuard;
  /** Answers a hit on the Hush before its fight. */
  readonly notYet: NotYet;
  private victoryT = 0;
  private region = '';
  private riding: OrganHost | null = null;
  private quietUntil = new Map<string, number>();
  private dropChain = 0;
  private dropChainT = 0;
  private littleT = -1;
  private mothGroups = new Map<string, Set<string>>();
  private mothN = 0;
  private grubN = 0;
  private gullT = 6;
  private mailSpat = false;
  private chordDone = false;
  private shoutTaught = false;
  private seenMoth = false;
  private bigShoutTaught = false;
  private absorbTipCd = 0;
  sawLesson = false;

  get allHosts(): OrganHost[] {
    return this.hosts;
  }
  get boss(): HushBoss {
    return this.hush;
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
    this.player = new PlayerController(this.ctx, HARBOR.spawn, HARBOR.spawnYaw);
    this.checkpoint = { pos: HARBOR.spawn.clone(), yaw: HARBOR.spawnYaw };
    this.weapon = new WeaponSystem(this.ctx);
    this.combat = new CombatDirector(this.ctx, () => this.enemies, this.player);
    this.throws = new ThrowSystem(this.ctx, this.weapon);
    this.throws.hostsProvider = () => this.hosts;
    this.ctx.combat = this.combat;
    this.events.on('player:perfect', ({ from }) => this.combat.perfectDodge(from));
    this.events.on('weapon:refill', () => (this.weapon.tank = SPRAY.tank));
    this.organs = new OrganSystem(this.ctx, () => this.hosts, this.edibles, (p, r) => this.damageablesNear(p, r).map((d) => d.target));

    const levelApi: LevelApi = {
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
    };
    this.level = buildMuteHarbor(this.ctx, levelApi);
    this.pierBuilt = buildPier(this.ctx, levelApi, this.level);
    this.story = new HarborStory(this.ctx, this.player, this.level);
    this.story.onCaption = (text, big) => this.events.emit('story:caption', { text, big });
    this.guide = new HarborGuide(this, this.root, this.ctx.camera.camera);
    this.shout = new ShoutSystem(this.ctx, () => this.enemies);
    for (const s of this.level.shoutables) this.shout.targets.push(s);
    this.stats = { time: 0, shots: 0, hits: 0, damageTaken: 0, smudges: 0, crowns: 0, totalCrowns: this.level.crowns.length, paint: 0 };

    // paint drops: heal, chain pitch, new colours every 15
    for (const d of this.level.drops) d.onTake = this.onDrop;
    this.player.onJet = (dt) => this.weapon.drainForJet(dt);
    this.player.onSlam = (at, drop) => this.weapon.paintSlam(at, drop);
    let payoutN = 0;
    this.combat.onPayout = (from, n) => {
      const p = this.player.pos;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        const r = 1.4 + Math.random() * 1.4;
        this.spawnDrop(new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 0.7 + Math.random() * 0.5, p.z + Math.sin(a) * r), Effects.splatColor(i % 5), `h2-encore-${payoutN++}`);
      }
      this.effects.burst(from, '#ffd23a', 10 + n * 2, 6, 0.09);
    };

    // ---- creatures ----
    const sp = this.level.spawns;
    this.chomper = this.addEnemy(new ChomperBin(this.ctx, 'chomper', sp.chomper));
    this.lamp = this.addEnemy(new PeepingLamp(this.ctx, 'lamp', sp.lamp, { tutorial: true, drops: 'EYE' }));
    for (const m of sp.moths) this.spawnMothSwarm(m.pos, m.group, m.alt);
    for (const g of sp.grubs) for (const q of swarmSpots(this.ctx, g)) this.spawnGrub(q, 9);
    this.hush = this.addEnemy(new HushBoss(this.ctx, 'hush', HARBOR.hushAtSea));
    this.hush.arena.copy(HARBOR.arena);
    this.hush.arenaR = HARBOR.arenaR;
    // hit before its fight (paint, a shout): it answers at once, with what is missing (src/level/NotYet.ts)
    this.notYet = new NotYet(this.ctx, (text, kind, params) => this.toast(text, kind, params), () => this.stats.time);
    this.notYet.watch(this.hush, { word: 'SHHH…', color: '#b49cff' }, () => {
      if (this.woken.size < 3) return { text: 'The Hush is not listening yet. Wake the three sound Guardians first ({n}/3).', params: { n: this.woken.size } };
      if (!this.hushRisen) return null; // the lighthouse beat is bringing it over the headland
      // hit from the plaza's edge (outside the 7.3 m start circle): that is a challenge, the fight starts now
      const p = this.player.pos;
      this.hushPoked = Math.hypot(p.x - HARBOR.arena.x, p.z - HARBOR.arena.z) < HARBOR.arenaR - 0.6 && p.y > HARBOR.arena.y - 0.6;
      return this.hushPoked ? null : { text: 'The Hush only fights on the headland plaza. Step onto it to face THE HUSH.' };
    });
    this.arenaGuard = new ArenaGuard(this.ctx, { center: HARBOR.arena, radius: HARBOR.arenaR, back: { pos: ARENA_ENTRY, yaw: Math.PI / 2 }, hold: true });
    this.hush.onSummon = (p) => this.spawnMothSwarm(p, 'brood', 2.4, 7);
    this.hush.onBombLanded = (p) => this.throws.spawnRock(p);
    this.hush.onMuffle = (sec) => this.muffle(sec);
    this.hush.mothCount = () => this.mothGroups.get('brood')?.size ?? 0;
    this.hush.onFightReset = () => this.repaintBrood();
    this.pier = new PierDirector({
      ctx: this.ctx,
      player: this.player,
      level: this.level,
      pier: this.pierBuilt,
      story: this.story,
      inventory: this.inventory,
      woken: this.woken,
      shoutTargets: this.shout.targets,
      addEnemy: (e) => this.addEnemy(e),
      giveEye: (at, from) => this.organs.drop(new Organ('EYE', 'lost-found'), at, from),
      toast: (text, kind, params) => this.toast(text, kind, params),
      stuck: () => this.guide.stuck,
      after: (sec, fn) => this.after(sec, fn),
      muffle: (sec) => this.muffle(sec),
      muted: () => this.shout.muteT > 0,
      respawn: () => this.respawn(),
      springDone: (pos) => !!this.ambient3.springDone(pos),
    });

    this.ambient3 = new Ambient(this.ctx, this.level.eyeSpots, this.level.perches, this.level.springSpots);
    this.events.on('city:awake', () => this.ambient3.wakeAll());
    this.events.on('face:woken', ({ count }) => this.ambient3.wake(count));
    this.player.paintUnder = () => this.effects.coverage(this.player.pos, 0.9);

    // ---- Guardian 1: the Foghorn Ferry (lend it your Mouth) ----
    const ferry = this.level.hosts.ferry;
    ferry.def.onOrgans = (h) => {
      if (h.lent('MOUTH') && !this.woken.has('ferry')) this.wakeFerry(h);
    };
    const mailbox = this.level.hosts.mailbox;
    mailbox.def.onOrgans = (h) => {
      if (h.has('MOUTH') && !this.mailSpat) {
        this.mailSpat = true;
        this.after(1.2, () => {
          this.reveal(this.level.special.mail);
          this.ctx.audio.play('spit', { pos: mailbox.pos });
          this.toast('The Mailbox coughs up a crown — it had been stuck in its throat!', 'good');
        });
      }
    };
    // ---- Guardian 2: the Clock Tower (three tuning forks humming at once ring its bell) ----
    this.events.on('harbor:fork', ({ n }) => {
      if (this.chordDone) return;
      if ((n ?? 0) >= 3) this.wakeClock();
      else this.toast('Tuning forks humming: {n}/3 — quick, SHOUT at the next one!', 'info', { n: n ?? 0 });
    });
    this.events.on('harbor:bellMuffled', () => {
      if (!this.chordDone) this.toast('The bell is wrapped in Hush dust. Make all three tuning forks hum at once!', 'warn');
    });
    // ---- Guardian 3: the Lighthouse (BIG SHOUT into its horn) ----
    this.events.on('harbor:lamp', () => {
      if (!this.woken.has('lighthouse')) this.wakeLighthouse();
    });
    this.events.on('harbor:lampQuiet', () => this.toast('Too quiet for a lighthouse — HOLD X to charge a BIG SHOUT!', 'warn'));
    this.events.on('harbor:lampFar', () => this.toast('The lighthouse can’t hear you from down here — climb the stair to its gallery.', 'warn'));
    this.events.on('harbor:cocoonQuiet', () => this.toast('The dust cocoon swallows small shouts. HOLD X, then let go: BIG SHOUT!', 'warn'));
    this.events.on('harbor:cocoon', () => this.toast('BIG SHOUT! The dust cocoon bursts — the lighthouse stair is open.', 'good'));
    this.events.on('harbor:gate', () => {
      this.toast('DING! The bell rings and the market gate rises. Shouting works on anything that makes a sound!', 'good');
      this.after(0.4, () => this.ctx.camera.pullToward(this.level.spots.gateBell, 0.6));
    });
    this.events.on('harbor:boatsDocked', () => {
      this.toast('The lost boats are home, moored side by side across the channel. Hop from deck to deck to the old town!', 'good');
    });
    this.events.on('hush:absorbed', () => {
      if (this.absorbTipCd > 0) return;
      this.absorbTipCd = 8;
      this.toast(this.inventory.worn('MOUTH') ? 'Its dust veil soaks up paint. SHOUT at it first (X)!' : 'Its dust veil soaks up paint. You need your Mouth to SHOUT the veil off.', 'warn');
    });
    this.events.on('organ:purified', ({ organ }) => {
      const e = this.enemies.find((x) => x.id === organ.sourceId) as (EnemyBase & { calm?: () => void }) | undefined;
      e?.calm?.();
      if (organ.type === 'MOUTH' && !this.shoutTaught) {
        this.shoutTaught = true;
        this.after(0.6, () => this.toast('Your Mouth Sticker is clean — wear it and you can SHOUT! Press X (hold it for a BIG SHOUT).', 'good'));
      }
    });
    this.events.on('player:damaged', ({ hp }) => {
      if (hp < PLAYER.maxHp) this.stats.damageTaken++;
    });
    this.events.on('host:reaction', ({ hostId, text }) => {
      const h = this.organs.hostById(hostId);
      if ((this.quietUntil.get(hostId) ?? 0) > performance.now()) return;
      if (!h || h.pos.distanceTo(this.player.pos) < 14) this.toast(text);
    });
    this.mountTouchShout();
    this.physics.step();
  }

  /** Touch screens: a SHOUT button beside CHOMP (hold it for a BIG SHOUT). */
  private touchBtn: HTMLButtonElement | null = null;
  private mountTouchShout(): void {
    const touchRoot = document.querySelector('.touch');
    if (!touchRoot) return;
    const b = document.createElement('button');
    b.className = 't-btn t-shout';
    b.type = 'button';
    b.innerHTML = touchIcon('shout');
    b.setAttribute('aria-label', t('SHOUT'));
    const input = this.ctx.input;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('down');
      input.virtualDown('KeyX');
    }, { passive: false });
    const up = (e: Event) => {
      e.preventDefault();
      b.classList.remove('down');
      input.virtualUp('KeyX');
    };
    b.addEventListener('touchend', up);
    b.addEventListener('touchcancel', up);
    touchRoot.appendChild(b);
    this.touchBtn = b;
  }

  // ───────────── spawning ─────────────
  private addEnemy<T extends EnemyBase>(e: T): T {
    this.enemies.push(e);
    e.onFinished = (en) => this.onEnemyFinished(en);
    return e;
  }

  /**
   * Moths at one spawn point: extras on Normal / Hard. The stair guards stay as drawn (their hover rules are per step);
   * extras never join the nest's crown count, and brood extras count toward the Hush's brood cap.
   */
  private spawnMothSwarm(p: THREE.Vector3, group: string, alt?: number, leash?: number): void {
    const spots = group === 'spiral' ? [p] : swarmSpots(this.ctx, p);
    spots.forEach((q, i) => this.spawnMoth(q, i === 0 || group === 'brood' ? group : 'extra', alt, leash));
  }

  private spawnMoth(p: THREE.Vector3, group: string, alt?: number, leash?: number): HushMoth {
    const m = new HushMoth(this.ctx, `moth-${group}-${this.mothN++}`, p.clone(), { leash: leash ?? (group === 'spiral' ? 5 : 8) });
    const homeY = p.y;
    if (group === 'spiral') {
      // stair moths hover beside the step they guard (outside the railing), never inside the tower
      m.groundAt = () => homeY;
      (m as unknown as { alt: number }).alt = alt ?? 2.4;
      m.ringLow = 2.0;
      m.patience = 1.8;
      m.obstacles.push({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: LIGHTHOUSE.r0 + 0.9, top: LIGHTHOUSE.top + 4.5 });
    } else m.groundAt = (x, z) => this.level.groundAt(x, z);
    if (alt !== undefined && group !== 'spiral') (m as unknown as { alt: number }).alt = alt;
    m.onMuffle = (sec) => this.muffle(sec);
    this.addEnemy(m);
    let set = this.mothGroups.get(group);
    if (!set) this.mothGroups.set(group, (set = new Set()));
    set.add(m.id);
    if (group === 'brood') this.effects.burst(p.clone().add(new THREE.Vector3(0, 1.5, 0)), '#cfc8e2', 10, 3);
    return m;
  }

  private spawnGrub(p: THREE.Vector3, leash: number): EraserGrub {
    const g = new EraserGrub(this.ctx, `h2-grub-${this.grubN++}`, p.clone(), leash);
    this.addEnemy(g);
    this.edibles.add(g);
    g.onPop = (gg, eaten) => {
      if (!eaten && Math.random() < 0.5) this.spawnDrop(gg.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), '#ff9ec4');
    };
    return g;
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
    const d = new PaintDrop(this.ctx, id ?? `h2-loot-${this.dropN++}`, at, color);
    d.onTake = this.onDrop;
    this.level.drops.push(d);
    this.edibles.add(d);
  }

  private muffle(sec: number): void {
    this.shout.muteT = Math.max(this.shout.muteT, sec);
    this.effects.comic(this.player.pos.clone().add(new THREE.Vector3(0, 2.1, 0)), t('MUFFLED!'), '#b49cff', 0.7);
  }

  /** The Hush's brood stops correcting with it: repainted (the Hush won over, or its fight restarted). */
  private repaintBrood(): void {
    for (const m of this.enemies) if (m instanceof HushMoth && !m.harmless && m.id.startsWith('moth-brood')) m.debugRepaint();
  }

  private onEnemyFinished(e: EnemyBase): void {
    if (e === this.hush) {
      this.bossDone = true;
      this.level.lockArena(false);
      this.victoryT = 30;
      this.littleT = 0;
      this.repaintBrood();
      this.story.finale(this.hush, () => {
        this.events.emit('city:awake');
        this.level.wakeTown();
        this.level.bringExitBoat();
        this.ctx.audio.play('bigBell', { vol: 0.8 });
        this.after(1.4, () => this.ctx.audio.play('foghorn', { vol: 0.7 }));
        this.after(2.2, () => this.ctx.audio.play('gull', { vol: 0.8 }));
      });
      return;
    }
    if (e instanceof HushMoth) {
      // a little glow moth: drops a paint blob as thanks
      this.spawnDrop(e.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), ['#5ff4e6', '#ff3fa4', '#ffe08a'][this.dropN % 3]);
      for (const [g, set] of this.mothGroups) {
        if (!set.delete(e.id)) continue;
        if (g === 'nest' && set.size === 0) {
          this.reveal(this.level.special.nest);
          this.toast('Moth nest cleared! A crown drops out of the dust.', 'good');
        }
      }
      if (!this.seenMoth) this.seenMoth = true;
      return;
    }
    if (!e.drops) return;
    const organ = new Organ(e.drops, e.id);
    // land it where WAI can reach it: same floor as the creature, on the player's side
    const toP = this.player.pos.clone().sub(e.pos).setY(0);
    const towardP = toP.lengthSq() > 0.01 ? toP.normalize() : e.forward();
    let at = e.pos.clone();
    for (const c of [towardP.clone().multiplyScalar(2), towardP.clone().multiplyScalar(1.2), e.forward().multiplyScalar(2), new THREE.Vector3()]) {
      const cand = e.pos.clone().add(c);
      const hit = this.physics.raycast(cand.clone().setY(e.pos.y + 1.2), new THREE.Vector3(0, -1, 0), 3, (col) => this.physics.tagOf(col) === 'static');
      const clear = !this.physics.raycast(e.pos.clone().setY(e.pos.y + 0.6), c.lengthSq() > 0 ? c.clone().normalize() : new THREE.Vector3(0, -1, 0), Math.max(0.01, c.length()), (col) => this.physics.tagOf(col) === 'static');
      if (hit && clear && Math.abs(hit.point.y - e.pos.y) < 0.8 && !isWater(cand.x, cand.z)) {
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

  private damageablesNear(p: THREE.Vector3, r: number): { target: import('../combat/Damage').Damageable; point: THREE.Vector3 }[] {
    const out: { target: import('../combat/Damage').Damageable; point: THREE.Vector3 }[] = [];
    for (const e of this.enemies) {
      if (e.disposed || e.harmless) continue;
      const c = e.pos.clone().add(new THREE.Vector3(0, Math.min(1.5, e.bigness * 2 + 0.3), 0));
      const flat = Math.hypot(c.x - p.x, c.z - p.z);
      if (flat < r + e.bigness * 1.2 && Math.abs(c.y - p.y) < r + 2.5 * e.bigness + 0.6) out.push({ target: e, point: c });
    }
    return out;
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  private toast(text: string, kind: 'info' | 'warn' | 'good' = 'info', params?: Record<string, string | number>): void {
    this.events.emit('toast', { text: t(text, params), kind });
  }

  private reveal(c: import('./Collectibles').Crown): void {
    if (!c.hidden) return;
    c.hidden = false;
    this.effects.burst(c.pos, '#ffd23a', 16, 3);
  }

  // ───────────── the three sound Guardians ─────────────
  private guardianWoken(id: GuardianId, at: THREE.Vector3): number {
    this.woken.add(id);
    const n = this.woken.size;
    this.ctx.audio.play('wake');
    this.ctx.audio.duck(0.25, 2.5);
    this.ctx.audio.music.brightness = n;
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4);
    this.effects.burst(at, '#ffd23a', 40, 7, 0.12);
    this.effects.ring(at, '#ffd23a', 8);
    this.events.emit('face:woken', { id: id as never, count: n });
    this.victoryT = 5;
    return n;
  }

  private wakeFerry(host: OrganHost): void {
    const n = this.guardianWoken('ferry', host.socketWorld('MOUTH'));
    this.quietUntil.set(host.id, performance.now() + 9000);
    host.grantPermanent('MOUTH');
    this.ctx.audio.play('foghorn', { pos: host.pos, vol: 1 });
    // the horn's own shot follows the Mouth close-up (OrganHost.closeUp, 1.5 s) instead of cutting it short;
    // it starts 0.1 s early so no gameplay frame flashes between the two
    this.after(1.4, () => this.story.ferryBeat());
    this.after(1.0, () => this.level.bringBoats());
    this.after(2.8, () => this.ctx.audio.play('foghorn', { pos: host.pos, vol: 0.7, pitch: 1.05 }));
    this.level.lightUp('market');
    this.reveal(this.level.special.ferry);
    this.toast('THE FOGHORN FERRY BLOWS! BWAAAH — the fog parts and the lost boats sail home.', 'good');
    this.after(2.6, () => {
      const o = host.lent('MOUTH');
      if (o) {
        this.organs.recall(o, this.player, false);
        this.toast('"I can toot on my own now — thanks!" Your {organ} flies back.', 'info', { organ: t(o.def.name) });
      }
    });
    this.after(7, () => this.toast('Guardian {n}/3 awake. Cross the boats to the old town — its clock tower has lost its BONG.', 'good', { n }));
  }

  private wakeClock(): void {
    if (this.chordDone) return;
    this.chordDone = true;
    this.level.ringClockBell();
    const n = this.guardianWoken('clock', this.level.spots.clockFace);
    this.story.clockBeat();
    this.level.lightUp('old');
    this.toast('THE CLOCK TOWER RINGS! BONG… BONG… the whole square shivers.', 'good');
    // the Red Pen strikes the Bell Bridge out; the pier gate opens (level-2 expansion: PierDirector)
    this.pier.clockRang(n);
  }

  private wakeLighthouse(): void {
    if (this.woken.has('lighthouse')) return;
    this.level.lightLighthouse();
    this.guardianWoken('lighthouse', this.level.spots.lamp);
    this.level.lightUp('head');
    this.toast('THE LIGHTHOUSE SINGS! Its beam sweeps the sea — the ships can see their way home…', 'good');
    this.story.lighthouseBeat(this.hush, () => {
      this.hushRisen = true;
      this.after(4.5, () => this.toast('All three Guardians are singing — and THE HUSH has come to silence them. Face it on the headland plaza!', 'warn'));
    });
  }

  // ───────────── dev tools (story warps) ─────────────
  readonly debugStages = ['start', 'mouth', 'ferry', 'clock', 'pier', 'gramophone', 'lighthouse', 'boss', 'exit'] as const;

  stopCine(): void {
    this.ctx.camera.stopCine();
  }

  private flushTimers(): void {
    for (let guard = 0; guard < 20 && this.timers.length; guard++) {
      const due = this.timers.splice(0, this.timers.length);
      for (const tm of due) tm.fn();
    }
  }

  private debugTake(type: OrganType): void {
    for (const wo of this.organs.worldOrgans) {
      if (wo.disposed || wo.organ.type !== type) continue;
      wo.organ.collect();
      this.inventory.add(wo.organ);
      wo.dispose();
    }
    const o = this.inventory.get(type);
    if (o?.corrupted) o.purify();
    this.inventory.changed();
  }

  /** Fast-forward the story to `stage` (runs the real story steps, forwards only). */
  debugWarp(stage: string): void {
    const order = this.debugStages as readonly string[];
    const want = order.indexOf(stage);
    if (want < 0) return;
    if (want >= 1) {
      if (!this.chomper.harmless) this.chomper.debugRepaint();
      if (!this.inventory.get('MOUTH')) this.debugTake('MOUTH');
      else for (const wo of this.organs.worldOrgans) if (!wo.disposed && wo.organ.type === 'MOUTH') wo.dispose();
      const m = this.inventory.get('MOUTH');
      if (m?.corrupted) m.purify();
      this.inventory.changed();
      if (!this.level.gateOpen) this.level.openGate();
    }
    if (want >= 2 && !this.woken.has('ferry')) {
      const ferry = this.level.hosts.ferry;
      this.wakeFerry(ferry);
    }
    if (want >= 3 && !this.woken.has('clock')) {
      for (const f of this.level.forks) f.humT = 10;
      this.wakeClock();
    }
    if (want >= 3) this.pier.debugClockDone();
    if (want >= 6) this.pier.debugClear();
    if (want >= 6 && !this.woken.has('lighthouse')) {
      this.level.burstCocoon();
      this.wakeLighthouse();
    }
    if (want >= 8 && !this.bossDone) {
      this.hushRisen = true;
      this.hush.idleSpot.copy(HARBOR.hushOverHead);
      if (!this.hush.awake) this.hush.engage();
      this.hush.debugRepaint();
    }
    this.flushTimers();
    // finish the story's own timers (the Hush rising) right away
    for (let i = 0; i < 4; i++) this.story.update(1.2);
    this.ctx.camera.stopCine();
    if (this.story.locked) this.story.skip();
    if (this.woken.has('ferry')) this.level.bringBoats();
    const at: Record<string, [number, number, number, number]> = {
      start: [HARBOR.spawn.x, HARBOR.spawn.y + 0.2, HARBOR.spawn.z, HARBOR.spawnYaw],
      mouth: [2, HY.quay + 0.2, 34, Math.PI],
      ferry: [-8, HY.quay + 0.2, 16, -Math.PI / 2],
      clock: [-30, HY.square + 0.2, -16, Math.PI],
      pier: [PIER.gate.x, PIER.y + 0.3, PIER.gate.z + 1.5, Math.PI],
      gramophone: [PIER.rampTop.x + 1, PIER.bandY + 0.3, PIER.rampTop.z, Math.PI / 2],
      lighthouse: [6, HY.headland + 0.2, -30, Math.PI],
      boss: [ARENA_ENTRY.x - 3, ARENA_ENTRY.y, ARENA_ENTRY.z, Math.PI / 2],
      exit: [16, HY.headland + 0.2, -37, Math.PI / 2],
    };
    const [x, y, z, yaw] = at[stage];
    this.player.teleport(new THREE.Vector3(x, y, z), yaw);
    this.ctx.camera.yaw = yaw;
    this.player.hp = PLAYER.maxHp;
    this.events.emit('player:healed', { hp: this.player.hp });
    // a warp past the boats' sailing: dock them now
    if (this.woken.has('ferry')) for (let i = 0; i < 12 && !this.level.pontoonReady; i++) this.level.update(0.6, this.player.pos);
    if (this.woken.has('clock')) for (let i = 0; i < 8 && !this.level.bridgeDown; i++) this.level.update(0.4, this.player.pos);
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
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    this.absorbTipCd = Math.max(0, this.absorbTipCd - dt);
    // cutscene beats never cost a heart (the camera is busy showing a Guardian)
    if (cam.inCine || this.story.locked) p.invuln = Math.max(p.invuln, 0.25);
    cam.aiming = allowed && (input.isDown('Mouse2') || input.isDown('KeyZ'));
    p.aiming = cam.aimT > 0.25;

    // 1) hosts (moving platforms)
    const riding = this.riding;
    for (const h of this.hosts) {
      h.playerOnTop = h === riding;
      if (h === riding) h.driveWish.copy(p.driveWish);
      else h.driveWish.set(0, 0, 0);
      h.preStep(dt, (pt, r) => this.damageablesNear(pt, r).map((d) => d.target));
    }
    // 2) player
    const carry = riding ? riding.carryFor(p.pos) : new THREE.Vector3();
    if (riding && Math.abs(riding.deltaYaw) > 0) p.facing += riding.deltaYaw;
    p.step(dt, carry, !!riding, !!riding && riding.drivable);
    if (this.coop && !this.frozen) this.coop.step(dt);

    // 3) combat, story, creatures, weapon, organs, voice
    this.combat.step(dt);
    this.story.update(dt);
    if (this.story.locked && (input.consumePressed('Space') || input.consumePressed('Mouse0'))) this.story.skip();
    // the fight starts once WAI is well onto the plaza, or at once when he hits the Hush from its edge (hushPoked, set by the NotYet answer)
    const flatH = Math.hypot(p.pos.x - HARBOR.arena.x, p.pos.z - HARBOR.arena.z);
    if (!this.hush.awake && !this.bossDone && this.woken.size === 3 && this.hushRisen && (flatH < HARBOR.arenaR - 2.2 || (this.hushPoked && flatH < HARBOR.arenaR - 0.6)) && p.pos.y > HARBOR.arena.y - 0.6) {
      this.hush.engage();
      // never lock with WAI on the wrong side of the ring: pull him a step in first (as on the Eraser's summit)
      if (flatH > HARBOR.arenaR - 1.6) {
        const k = (HARBOR.arenaR - 1.8) / flatH;
        p.nudgeTo(new THREE.Vector3(HARBOR.arena.x + (p.pos.x - HARBOR.arena.x) * k, p.pos.y, HARBOR.arena.z + (p.pos.z - HARBOR.arena.z) * k));
      }
      this.level.lockArena(true);
      this.story.bossIntro(this.hush);
    }
    this.dropChainT = Math.max(0, this.dropChainT - dt);
    if (this.littleT >= 0 && this.littleT < 6) {
      // the repainted Hush shrinks into a little jelly lantern and floats up to the lighthouse lamp
      this.littleT += dt;
      const k = THREE.MathUtils.smoothstep(this.littleT, 0.6, 2.2);
      this.hush.sizeMul = THREE.MathUtils.lerp(1, 0.22, k);
      if (k > 0.3) this.hush.dropCollider();
      if (this.littleT > 2.4) {
        const to = this.level.spots.lamp.clone().add(new THREE.Vector3(0, 1.4, 0));
        this.hush.pos.lerp(to, Math.min(1, dt * 0.8));
        (this.hush as unknown as { prevPos: THREE.Vector3 }).prevPos.copy(this.hush.pos);
      }
    }
    const edt = dt * this.combat.enemyScale;
    if (!this.frozen) for (const e of this.enemies) if (!e.disposed) e.step(edt, this.coop ? this.coop.targetFor(e) : p);
    // creatures that turned or lunged into WAI push him out (no standing inside the Eraser)
    for (const e of this.enemies) {
      if (e.disposed || e.bigness < 0.55) continue;
      const out = e.pushOut(p.pos, PLAYER.radius);
      if (out) p.nudgeTo(out);
    }
    // mid-fight WAI never leaves the headland plaza, whatever shoves him: ArenaGuard
    if (this.hush.awake && !this.bossDone) this.arenaGuard.step(dt, p);
    if (allowed && !this.combat.busy) {
      const tgt = this.combat.finisherTarget();
      if (tgt && input.consumePressed('KeyE')) this.combat.tag(tgt);
    }
    const canFire = allowed && !p.holdingPurify && p.lockTimer <= 0 && !p.dodging;
    this.weapon.step(dt, p, canFire);
    this.throws.step(dt, p, canFire && !cam.inCine, cam.aimRay());
    this.stompCheck(p);
    this.organs.step(dt, p, allowed);
    this.shout.step(dt, p, allowed && !this.story.locked && !cam.inCine, this.inventory.worn('MOUTH'), this.inventory.get('MOUTH') ? (this.inventory.get('MOUTH')!.corrupted ? 'corrupted' : this.inventory.get('MOUTH')!.lent ? 'lent' : 'idle') : null);

    // 4) physics
    this.physics.step();

    // 5) ground probe → riding host
    p.probeGround();
    this.riding = null;
    if (p.groundCollider && this.physics.tagOf(p.groundCollider) === 'host') {
      const h = this.physics.ownerOf<OrganHost>(p.groundCollider);
      if (h && h.isOverTop(p.pos) && p.pos.y > h.top - 0.3) {
        this.riding = h;
        p.enforceAbove(h.top);
      }
    }
    if (p.grounded && p.groundCollider && this.physics.tagOf(p.groundCollider) === 'static' && p.pos.y > HY.water + 0.4) p.lastSafe.copy(p.pos);

    // 6) gaze & undrawn (True Sight on the sea-stack steps)
    const gazers: Gazer[] = [...this.level.paintedGazers];
    const wai = this.organs.waiGazer();
    if (wai) gazers.push(wai);
    for (const h of this.hosts) {
      const g = h.gazer();
      if (g) gazers.push(g);
    }
    this.gaze.update(dt, gazers, p.pos, p.groundCollider);
    this.pier.see(gazers);
    if (!this.sawLesson && this.gaze.solids.some((u) => u.solid && u.seenBy === 'wai')) {
      this.sawLesson = true;
      this.toast('TRUE SIGHT: things nobody drew exist while you look at them. Lend your Eye to something and it keeps looking for you.', 'good');
    }

    // 7) world, collectibles, checkpoints
    const camPos = cam.aimRay().origin;
    this.level.update(dt, camPos);
    this.pier.step(dt);
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
        this.checkpoint = { pos: cp.pos.clone().add(new THREE.Vector3(0, 0, 1.2)), yaw: cp.yaw };
        if (hit === 'first') {
          p.heal(PLAYER.maxHp);
          this.events.emit('checkpoint', { id: cp.id });
          this.toast('Checkpoint! Spray can tagged.', 'good');
        }
      }
    }
    // the first moth meeting: teach the counter
    if (!this.seenMoth && this.enemies.some((e) => e instanceof HushMoth && e.alerted && e.pos.distanceTo(p.pos) < 10)) {
      this.seenMoth = true;
      this.toast('A HUSH MOTH! Its dust veil soaks up paint — SHOUT at it (X) to shake the veil off, then paint it while it’s ringing.', 'warn');
    }
    if (!this.bigShoutTaught && this.woken.has('clock') && !this.level.cocoonBurst && p.pos.distanceTo(this.level.spots.cocoon) < 9) {
      this.bigShoutTaught = true;
      this.toast('Hush dust blocks the lighthouse stair. Small shouts won’t do: HOLD X until the ring glows, then let go — BIG SHOUT!', 'warn');
    }
    // gulls find their voices district by district
    this.gullT -= dt;
    if (this.gullT <= 0) {
      this.gullT = 5 + Math.random() * 7;
      if (this.woken.size > 0 || this.bossDone) this.ctx.audio.play('gull', { pos: p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 8, (Math.random() - 0.5) * 30)), vol: 0.7 });
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].disposed) this.enemies.splice(i, 1);

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
      if (e === this.hush && !this.hush.awake) continue;
      const d = e.pos.distanceTo(p.pos);
      if (e.engaged && d < 24) fighting = true;
      presence = Math.max(presence, e.bigness * Math.max(0, 1 - d / 16) * (e.engaged ? 1 : 0.35));
    }
    this.presence += (presence - this.presence) * Math.min(1, dt * 3);
    this.victoryT = Math.max(0, this.victoryT - dt);
    // a live boss or mid-boss fight holds 'boss' from its intro to the repaint (src/level/BossMood.ts)
    const boss = bossMood(this.enemies, p.pos);
    this.mood = this.completed ? 'victory' : boss ?? (this.victoryT > 0 ? 'victory' : fighting ? 'combat' : presence > 0.15 ? 'danger' : 'explore');

    // completion: aboard the paper boat
    if (!this.completed && this.bossDone && this.littleT > 4 && HARBOR.completeTrigger.containsPoint(p.pos.clone().setY(p.pos.y + 0.5))) {
      this.completed = true;
      this.stats.shots = this.weapon.shots;
      this.stats.hits = this.weapon.hits;
      this.ctx.audio.play('foghorn', { vol: 0.8, pitch: 1.2 });
      this.story.hush();
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
    if (p.pos.y < HARBOR.killY) {
      this.ctx.audio.play('whoosh', { pitch: 0.7 });
      this.respawn();
      p.hp = Math.max(1, p.hp - 1);
      this.events.emit('player:damaged', { hp: p.hp });
      this.toast('WAI fell off the canvas — re-drawn at the last spray can.', 'warn');
    } else if (p.pos.y < HY.water - 0.2 && isWater(p.pos.x, p.pos.z)) {
      p.teleport(p.lastSafe.clone().add(new THREE.Vector3(0, 0.1, 0)));
      this.ctx.audio.play('splat', { vol: 1, pitch: 0.6 });
      if (!p.takeHit(p.pos.clone().add(new THREE.Vector3(0, -1, 0)), 1, 0)) this.events.emit('player:damaged', { hp: p.hp });
      this.toast('Splash! The harbour spat you back out.', 'warn');
    }
  }

  /** Mario-style: land on a small creature's head to squash it (and bounce). */
  private stompCheck(p: PlayerController): void {
    const onEnemy = !!p.groundCollider && this.physics.tagOf(p.groundCollider) === 'enemy';
    if (p.vy > -2.5 && !onEnemy) return;
    for (const e of this.enemies) {
      if (e.disposed || e.harmless || e === this.hush) continue;
      const top = e.topY;
      const flat = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (flat > e.bodyRadius + 0.75 || p.pos.y < top - 0.45 || p.pos.y > top + 0.4) continue;
      const small = e.bigness < 0.6;
      e.applyDamage({ amount: small ? 70 : 25, point: new THREE.Vector3(e.pos.x, top, e.pos.z), dir: new THREE.Vector3(0, -1, 0), collider: null, kind: 'stomp', color: '#ffd23a' });
      p.vy = small ? 10 : 12;
      p.grounded = false;
      this.effects.comic(new THREE.Vector3(e.pos.x, top + 0.6, e.pos.z), t('STOMP!'), '#ffd23a', 0.7);
      this.events.emit('enemy:stomped', { id: e.id });
      if (this.splashBoots) this.weapon.bombImpact(new THREE.Vector3(e.pos.x, top, e.pos.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), this.weapon.color);
      this.effects.ring(new THREE.Vector3(e.pos.x, top, e.pos.z), '#ffffff', 2.5);
      this.ctx.audio.play('stomp', { pos: e.pos, pitch: 1.5, vol: 0.7 });
      this.ctx.time.hitstop(0.06);
      break;
    }
  }

  startStory(): void {
    this.story.intro(this.hush);
  }

  respawn(): void {
    const p = this.player;
    const inArena = this.hush.awake && !this.bossDone;
    const at = inArena ? ARENA_ENTRY.clone() : this.checkpoint.pos;
    const yaw = inArena ? Math.PI / 2 : this.checkpoint.yaw;
    p.teleport(at, yaw);
    p.hp = PLAYER.maxHp;
    p.smudged = false;
    p.invuln = 2;
    this.shout.muteT = 0;
    this.ctx.camera.yaw = yaw;
    this.events.emit('player:healed', { hp: p.hp });
    for (const e of this.enemies) if (e.engaged && e !== this.hush && e.pos.distanceTo(p.pos) > 12) e.alerted = false;
    this.fightReset.respawn();
  }

  springPads(): readonly SpringSpot[] {
    return this.ambient3.readySprings();
  }

  inWater(p: THREE.Vector3): boolean {
    return p.y < HY.water - 0.2 && isWater(p.x, p.z);
  }

  // ───────────── HUD ─────────────
  /** Where the guide arrow points (the next real step). */
  guideGoal(): THREE.Vector3 | null {
    const inv = this.inventory;
    const sp = this.level.spots;
    if (this.completed) return null;
    if (this.bossDone) return this.littleT > 4 ? sp.boat.clone().add(new THREE.Vector3(0, 0.6, 0)) : null;
    if (this.woken.size === 3) return this.hush.awake ? null : this.hushRisen ? HARBOR.arena.clone().add(new THREE.Vector3(0, 0.5, 0)) : null;
    const mouth = inv.get('MOUTH');
    if (!mouth) {
      const d = this.organs.worldOrgans.find((w) => !w.disposed && w.organ.type === 'MOUTH');
      if (d) return d.at.clone().setY(d.at.y + 0.8);
      return this.chomper.harmless ? null : this.chomper.pos.clone().setY(this.chomper.pos.y + 2.2);
    }
    if (mouth.corrupted) return null;
    if (mouth.lent && mouth.hostId !== 'ferry') return null; // hint: hold R to recall
    if (!this.level.gateOpen) return sp.gateBell.clone().setY(HY.quay + 2.2);
    if (!this.woken.has('ferry')) return this.level.hosts.ferry.socketWorld('MOUTH').clone();
    if (!this.woken.has('clock')) {
      if (!this.level.pontoonReady) return null;
      // the fork that isn't humming yet, nearest first
      let best: THREE.Vector3 | null = null;
      let bd = Infinity;
      for (const f of this.level.forks) {
        if (f.humT > 0) continue;
        const d = f.pos.distanceTo(this.player.pos);
        if (d < bd) {
          bd = d;
          best = f.pos;
        }
      }
      return best ? best.clone().setY(best.y - 1.2) : null;
    }
    if (!this.woken.has('lighthouse')) {
      if (!this.level.bridgeDown) return this.pier.guideGoal();
      if (!this.level.cocoonBurst) return sp.spiralStart.clone();
      return this.level.spiralAt(1).clone();
    }
    return null;
  }

  /**
   * Objective panel text. Same rule as level 1: the title always, the "where to go" line only once the
   * stuck rule (src/ui/Guide.ts) says the player has stopped making progress. Control lines (purify,
   * recall, the boss's counter) always show.
   */
  objective(): { title: string; hint: string } {
    const n = this.woken.size;
    const title = n < 3 ? t('Wake the sound Guardians {n}/3', { n }) : this.completed ? t('Mute Harbor complete!') : this.bossDone ? t('Board the paper boat') : t('Repaint THE HUSH');
    const inv = this.inventory;
    const mouth = inv.get('MOUTH');
    const eye = inv.get('EYE');
    let hint = '';
    // a control or a fight's counter is not guidance: it shows whatever the stuck rule says
    const now = (text: string) => ({ title, hint: (this.hintFull = t(text)) });
    if (n === 3 && !this.bossDone && this.hush.awake) return now(this.hush.counterHint);
    if (eye?.corrupted) return now('Hold Q to purify the eye');
    if (mouth?.corrupted) return now('Hold R to purify the mouth');
    if (mouth?.lent && mouth.hostId !== 'ferry') return now('Hold R to recall your Mouth — you need it to SHOUT');
    if (n === 3) hint = this.bossDone ? (this.littleT > 4 ? 'A paper boat waits at the jetty below the plaza (east stairs) — climb aboard' : 'Listen…') : this.hushRisen ? 'THE HUSH hangs over the headland plaza by the lighthouse — go and face it' : 'The lighthouse is singing…';
    else if (!mouth) hint = this.organs.worldOrgans.some((w) => !w.disposed && w.organ.type === 'MOUTH') ? 'Walk over the Mouth Sticker to pick it up' : 'That bin on the landing has gobbled a Mouth. Spray its back, not its jaws!';
    else if (!this.level.gateOpen) hint = 'Your Mouth works! Look up at the little bell on the gate and SHOUT (X)';
    else if (!this.woken.has('ferry')) hint = 'The Foghorn Ferry at the quay has lost its voice — face it and press E to lend it your Mouth';
    else if (!this.woken.has('clock')) {
      const hum = this.level.forks.filter((f) => f.humT > 0).length;
      if (!this.level.pontoonReady) hint = 'The lost boats are sailing home…';
      else if (this.player.pos.y < 3.2) hint = 'Hop across the boats’ decks to the old town, then climb the grand stair to the Clock Square';
      else hint = hum > 0 ? t('Tuning forks humming: {n}/3 — quick, SHOUT at the next one!', { n: hum }) : 'The clock’s bell is wrapped in dust. SHOUT at the three tuning forks (X) — make all three hum at once!';
    } else if (!this.woken.has('lighthouse')) {
      if (!this.level.bridgeDown) hint = this.pier.hint() ?? 'The Bell Bridge is coming down…';
      else if (!this.level.cocoonBurst) hint = 'Cross the Bell Bridge to the lighthouse. Dust blocks its stair — HOLD X for a BIG SHOUT';
      else hint = 'Climb the lighthouse stair. At the top, HOLD X and BIG SHOUT into its brass horn';
    }
    const remaining = n < 3 ? [
      !this.woken.has('ferry') ? t('Foghorn Ferry') : '',
      !this.woken.has('clock') ? t('Clock Bell') : '',
      !this.woken.has('lighthouse') ? t('Lighthouse') : '',
    ].filter(Boolean).join(' · ') : '';
    const base = hint ? t(hint) : '';
    this.hintFull = remaining && base ? `${base}\n${t('Remaining: {list}', { list: remaining })}` : base;
    return { title, hint: this.hintFull };
  }

  prompt(): PromptView | null {
    const p = this.player;
    const inv = this.inventory;
    const sel = inv.get(inv.selected);
    if (sel?.corrupted) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Hold to purify {organ}', { organ: t(sel.def.corruptedName) }), enabled: true };
    const coopPrompt = this.coop?.prompt();
    if (coopPrompt) return coopPrompt;
    const enc = this.combat.encorePrompt;
    if (enc) return { ...enc, enabled: true };
    if (this.combat.finisherTarget()) return { key: 'E', action: 'Tag', text: t('TAG IT!'), enabled: true };
    if (this.throws.held) return { key: 'G', text: t('Hold G to charge · release to throw the {thing}', { thing: t(this.throws.held.def.name) }), enabled: true };
    // SHOUT: something that wants your voice is in front of you
    if (inv.worn('MOUTH') && this.organs.focusedHost == null) {
      const { origin, dir } = this.shout.aim(p);
      const want = this.level.shoutables.find((s) => {
        if (!s.enabled()) return false;
        const to = s.pos.clone().sub(origin);
        const d = to.length();
        return d < (s.needsBig ? 14 : 8.5) && to.normalize().dot(dir) > 0.6;
      });
      if (want) return { key: 'X', text: this.shout.muteT > 0 ? t('MUFFLED…') : want.needsBig ? t('Hold X: BIG SHOUT') : t('SHOUT!'), enabled: this.shout.muteT <= 0 };
      const moth = this.enemies.find((e) => e instanceof HushMoth && !e.harmless && e.veiled && e.pos.distanceTo(p.pos) < 7);
      if (moth) return { key: 'X', text: t('SHOUT the veil off'), enabled: this.shout.muteT <= 0 };
      if (this.hush.awake && this.hush.veiled) {
        // honest range: a tap reaches ~10 m, a BIG shout ~15 m
        const d = this.hush.pos.distanceTo(p.pos);
        if (d < 10) return { key: 'X', text: t('SHOUT the veil off'), enabled: this.shout.muteT <= 0 };
        if (d < 15.5) return { key: 'X', text: t('Too far — hold X: BIG SHOUT'), enabled: this.shout.muteT <= 0 };
        if (d < 22) return { key: 'X', text: t('Get closer to SHOUT'), enabled: false };
      }
    }
    const liftable = this.throws.canLiftNear(p);
    if (liftable && !this.organs.focusedHost) return { key: 'G', text: t('Pick up the {thing}', { thing: t(liftable.def.name) }), enabled: true };
    const host = this.organs.focusedHost;
    if (!host) {
      if (this.riding?.drivable) return { key: 'WASD', text: t('Steer the {host} · Space to hop off', { host: t(this.riding.def.name) }), enabled: true };
      return null;
    }
    if (sel && sel.type === 'LEG' && host.lent('LEG') === sel && host.movable) return { key: 'E', action: host.mode === 'follow' ? 'Stay' : 'Call', text: t(host.mode === 'follow' ? 'Tell the {host} to stay' : 'Call the {host}', { host: t(host.def.name) }), enabled: true };
    if (!sel) return { key: 'E', text: t(host.def.name), enabled: false };
    // (a Guardian that hands the sticker back by itself: no 'recall' prompt in the meantime)
    if (sel.lent && (host.permanent.has(sel.type) || this.story.locked || this.ctx.camera.inCine)) return null;
    if (sel.lent) return { key: ORGAN_DEFS[sel.type].keyLabel, text: t('Hold to recall {organ}', { organ: t(sel.def.name) }), enabled: true };
    const reason = host.canAccept(sel);
    if (reason) return { key: 'E', text: reason, enabled: false };
    return { key: 'E', action: 'Apply', text: t('Stick {organ} on the {host}', { organ: t(sel.def.name), host: t(host.def.name) }), enabled: true };
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
    this.player.render(alpha, frameDt);
    this.player.model.setWorn({ eye: this.inventory.worn('EYE'), mouth: this.inventory.worn('MOUTH'), leg: this.inventory.worn('LEG') });
    for (const e of this.enemies) if (!e.disposed) e.render(alpha, frameDt);
    for (const h of this.hosts) h.render(alpha, frameDt);
    this.weapon.render(alpha);
    this.guide.update(frameDt, this.frozen || this.story.locked || this.ctx.camera.inCine);
    this.coop?.render(alpha, frameDt);
  }

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

  // ───────────── dev panel ─────────────
  get devInfo(): DevLevelInfo {
    return {
      stages: [
        { id: 'start', label: '0 开局', note: '什么都没做 · 在栈桥上' },
        { id: 'mouth', label: '1 拿到嘴巴', note: '垃圾桶已上色 · 门已打开' },
        { id: 'ferry', label: '2 雾笛渡轮醒了', note: '小船回港，并排泊在水道上' },
        { id: 'clock', label: '3 钟楼响了', note: '红笔划掉钟桥 · 在钟楼广场' },
        { id: 'pier', label: '3½ 乐台栈桥', note: '栈桥大门开了 · 站在门口' },
        { id: 'gramophone', label: '3¾ 红色留声机', note: '在乐台上 · 中Boss前' },
        { id: 'lighthouse', label: '4 灯塔唱歌', note: '留声机已上色 · 钟桥放下 · 在海岬' },
        { id: 'boss', label: '5 Boss 战前', note: '站在海岬广场入口' },
        { id: 'exit', label: '6 Boss 已上色', note: '纸船靠岸 · 站在码头台阶上' },
      ],
      bounds: [-92, 62, -104, 54],
      outline: HARBOR_ISLAND,
      height: (x, z) => harborHeight(x, z),
      zoneColors: {
        cobble: [220, 200, 255], quay: [255, 200, 190], road: [255, 220, 170], stone: [200, 210, 255], grass: [120, 210, 180], board: [255, 190, 160], plank: [255, 210, 170], bed: [30, 150, 175],
      },
      zoneNames: { cobble: '石板地', quay: '码头', road: '路', stone: '石台', grass: '草地', board: '木栈道', plank: '木板', bed: '水' },
      labels: [
        ['栈桥', 0, 52], ['登岸处', 10, 40], ['集市码头', 2, 20], ['潟湖', -4, -6], ['老城码头', -42, 20], ['钟楼广场', -36, -24], ['钟桥', -12, -32], ['海岬', 4, -36], ['灯塔', 10, -54], ['木栈道', 34, 6], ['渔网棚', 40, -24], ['售票场', -48, -66], ['雾中栈道', -69, -66], ['旋转木马', -80, -89], ['乐台', -54, -88], ['回声廊', -81, -53],
      ],
      guardians: ['ferry'],
      cines: [
        { id: 'intro', label: '开场（走出塔门）', run: () => this.story.intro(this.hush) },
        { id: 'ferry', label: '雾笛渡轮醒来', run: () => this.story.ferryBeat() },
        { id: 'clock', label: '钟楼敲响', run: () => this.story.clockBeat() },
        { id: 'lighthouse', label: '灯塔唱歌 / 寂静升起', run: () => this.story.lighthouseBeat(this.hush, () => (this.hushRisen = true)) },
        { id: 'pencil', label: '铅笔画桥', run: () => this.story.pencilDraw(this.level.spots.bridge.clone()) },
        { id: 'boss', label: 'Boss 登场', run: () => this.story.bossIntro(this.hush) },
        { id: 'finale', label: 'Boss 结局', run: () => this.story.finale(this.hush, () => {}) },
      ],
    };
  }

  dispose(): void {
    this.touchBtn?.remove();
    this.guide.dispose();
    this.pier.dispose();
    this.coop?.dispose();
    this.coop = null;
    this.story.dispose();
    this.shout.clear();
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

/** Where WAI re-enters the arena (west gap, facing the middle). */
const ARENA_ENTRY = new THREE.Vector3(HARBOR.arena.x - HARBOR.arenaR + 2.2, HARBOR.arena.y + 0.2, HARBOR.arena.z);
