/**
 * [INPUT]: depends on the core loop / input / state / physics init, the render stack (Renderer, CameraController,
 *          OcclusionFader, Viewmodel, SceneOptimizer, StaticBatch), the level sessions (LEVELS), the UI, audio,
 *          agent / co-op bridges, PaintLoading, Quality 帧率上限和 meta progress
 * [OUTPUT]: the game App (no exports); window.__WD (test hooks: advance()), WD_AGENT, WD_COOP
 * [POS]: the entry point. Feedback captures the current run from the title or pause screen. One App owns one session at a time: it steps the session, then updates the one game camera
 *        (its softLimit = big creatures' drawn bodies + merged rock batches) and the OcclusionFader (props and big
 *        bodies between the camera and WAI), then draws. It builds the StaticBatch last in createSession and again
 *        after an art-style switch, because the batch bakes the materials as they are at that moment.
 *        iOS 销毁会话时释放旧场景的派生画风贴图。
 *        帧循环复用声音方向向量，视角变化时更新手部相机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import './style.css';
import * as THREE from 'three';
import { DevMenu } from './debug/DevMenu';
import { makeOrganVisual } from './organs/OrganVisuals';
import { IOS_APP, Quality } from './render/Quality';
import { AssetManager } from './core/AssetManager';
import { GameStateManager } from './core/GameStateManager';
import { InputManager } from './core/InputManager';
import { detectFeedbackDevice, type GameReport, type OrganReportEvent } from './core/FeedbackClient';
import { commitLoadingFrame } from './ui/PaintLoading';
import { FeedbackPanel } from './ui/FeedbackPanel';
import { Difficulty } from './meta/Difficulty';
import type { Organ } from './organs/Organ';
import { Loop } from './core/Loop';
import { initRapier } from './core/PhysicsWorld';
import { Renderer } from './render/Renderer';
import { OcclusionFader } from './render/OcclusionFader';
import { cullModels, singlePassFlats } from './render/SceneOptimizer';
import { StaticBatch } from './render/StaticBatch';
import { CameraController } from './render/CameraController';
import { Viewmodel } from './render/Viewmodel';
import { AudioEngine } from './audio/AudioEngine';
import type { LevelId, PlaySession } from './level/Session';
import { LEVELS, LevelUnlocks, isLevelId } from './level/levels';
import { LevelSelect } from './ui/LevelSelect';
import { setupDue, showSetup } from './ui/SetupScreen';
import { PLAYER } from './player/PlayerController';
import { buildSprayGun } from './weapon/SprayGunModel';
import { Effects } from './render/Effects';
import { PaintSystem } from './render/PaintSystem';
import { UI } from './ui/UI';
import { TouchControls } from './ui/TouchControls';
import { initLang, onLangChange, t } from './i18n';
import { AgentBridge } from './agent/AgentBridge';
import { CoopApp } from './coop/CoopApp';
import { loadOrganArt } from './render/OrganArt';
import { CHALLENGES, Progression, REWARDS } from './meta/Progression';
import { Arsenal, ITEMS, itemDef, BOONS, CHARM_SLOTS, type ItemId, type BoonDef } from './meta/Arsenal';
import { Gadgets } from './weapon/Gadgets';
import { rankRun, recordBest } from './meta/Rank';
import { ArtStyle, type StyleId } from './render/ArtStyle';
import { Look } from './render/Look';
import { LookPanel } from './ui/LookPanel';
import { itemArt } from './ui/ItemArt';
import { SPRAY } from './weapon/WeaponSystem';
import type { CapeSkin } from './player/Cape';
import { bossHeat, bossInFight } from './level/BossMood';
import { StoryFlow } from './story/StoryFlow';

const INTRO_DURATION = 2.6;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * BOOT (loads everything) → TITLE (the live plaza, drifting camera, sticker HUD)
 * → INTRO (camera pushes in from the title framing to WAI's shoulder) → PLAYING → COMPLETE
 */
type BootStage = 'graphics' | 'physics' | 'textures' | 'models' | 'scene' | 'first-frame' | 'ready';
const bootBridge = (window as Window & { webkit?: { messageHandlers?: {
  wdBoot?: { postMessage(stage: BootStage): void };
} } }).webkit?.messageHandlers?.wdBoot;

class App {
  readonly canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  readonly state = new GameStateManager();
  readonly input = new InputManager(this.canvas);
  readonly assets = new AssetManager();
  readonly renderer = new Renderer(this.canvas);
  readonly camera = new CameraController(this.renderer.camera);
  readonly audio = new AudioEngine();
  /** Intro / title cards / level outros / the END (src/story): off under ?test. */
  readonly story = new StoryFlow(document.getElementById('ui-root')!, (name, opts) => this.audio.play(name as never, opts));
  readonly ui = new UI();
  readonly touch = new TouchControls(this.input, document.getElementById('ui-root')!);
  readonly loop: Loop;
  /** AI player interface (window.WD_AGENT): observe() / act(cmd). See docs/AI_AGENT.md. */
  readonly agent = new AgentBridge(this.input, this.camera);
  /** AI co-op partner (Pip): pause-menu toggle + window.WD_COOP. See docs/AI_AGENT.md. */
  readonly coop = new CoopApp();
  /** Challenges & rewards (persist across runs). */
  readonly progress = new Progression();
  /** Equipment you choose (cap / gadget / charms) + this run's boons. */
  readonly arsenal = new Arsenal();
  gadgets: Gadgets | null = null;
  /** Boon picks waiting to be offered (one per Guardian woken, one at the start). */
  private boonQueue = 0;
  private boonOpen = false;
  /** The starting boon (after the intro) waits for WAI to move ~12 m or 30 s of play. */
  private firstBoon: { from: THREE.Vector3; t: number } | null = null;
  viewmodel: Viewmodel | null = null;
  /** Dev panel (` / F2): map teleport, story warps, cheats — dev server or ?dev only. */
  dev: DevMenu | null = null;
  session: PlaySession | null = null;
  /** Which level is loaded (title backdrop + what Start plays). */
  levelId: LevelId = 'plaza';
  private levelSelect: LevelSelect | null = null;
  paused = false;
  private cineHud = false;
  private lockFailed = false;
  private introT = 0;
  private completeTimer = -1;
  /** Rewards earned during this run (shown on the completion screen). */
  private runUnlocks: { img: string; name: string }[] = [];
  /** Completion hero shot: blends from the gameplay camera into the level's postcard view. */
  private completeCam: { from: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }; t: number } | null = null;
  private busy = false;
  private slowmoT = 0;
  private objTimer = 0;
  private readonly listenerRight = new THREE.Vector3();
  private lastMouse = { dx: 0, dy: 0 };
  private titleT = 0;
  /** Props between the camera and WAI ghost out (gameplay camera only). */
  private fader: OcclusionFader | null = null;
  /** One merged draw per material signature per map cell; the source meshes stay live (render/StaticBatch.ts). */
  private readonly batch = new StaticBatch();
  /** Title camera pose when Start was pressed (the intro departs from here). */
  private introFrom: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  /** The LOOK panel (art style + colour grade); the setup screen opens it for "More colours". */
  private look: LookPanel | null = null;

  private readonly recentOrganEvents: OrganReportEvent[] = [];
  // (the TapTap package ships without the feedback panel: the platform has its own channel)
  private readonly feedback = import.meta.env.MODE === 'taptap' ? null : new FeedbackPanel(
    this.ui.title, document.querySelector<HTMLElement>('.pause')!,
    () => this.captureFeedback(),
    () => detectFeedbackDevice(this.renderer.renderer.getContext(), `${Quality.pref} → ${Quality.tier}`, this.input.touchMode),
  );

  constructor() {
    this.arsenal.owns = (id) => !!itemDef(id).starter || this.progress.has(id as never);
    this.arsenal.onChange = () => this.onArsenalChange();
    PaintSystem.renderer = this.renderer.renderer;
    this.loop = new Loop(
      (dt) => this.step(dt),
      (a, fdt) => this.render(a, fdt),
      () => Quality.maxRenderFps,
    );
    // the very first new game goes through the setup screen (picture, colours, pen); later ones start at once
    this.ui.onStart = () => void this.setup().then((go) => {
      if (go) void this.startGame();
    });
    this.ui.onResume = () => this.resume();
    this.ui.onRestart = () => void this.restart();
    this.ui.onTitle = () => void this.toTitle();
    this.ui.onNext = () => {
      const next = LEVELS[this.levelId].next;
      if (next) void this.startLevel(next);
    };
    this.ui.onHover = () => this.audio.play('uiClick', { vol: 0.3, pitch: 1.5 });
    this.ui.onCelebrate = (beat) => {
      if (beat === 'burst') {
        this.audio.play('stickerBurst');
        this.audio.play('fanfare');
      } else if (beat === 'tick') this.audio.play('stampTick', { vol: 0.5, pitch: 1.2 });
      else if (beat === 'stamp') this.audio.play('stampHit');
      else this.audio.play('pop', { vol: 0.7, pitch: 1.1 });
    };
    // Pause → Art style: restyle the running level in place
    this.ui.showStyle(ArtStyle.id);
    // LOOK panel (title sticker / pause button / L): art style + the player's own colour grade
    const look = (this.look = new LookPanel(document.getElementById('ui-root')!, this.ui.title, document.querySelector('.pause')));
    look.currentStyle = () => ArtStyle.id;
    look.onStyle = (id) => {
      void this.switchStyle(id);
      this.ui.showStyle(id);
    };
    look.onOpen = () => {
      // in play: pause first (frees the cursor); the pause menu steps aside while the panel is up
      if (this.state.is('PLAYING') && !this.paused) this.setPaused(true);
    };
    // the colour grade runs in the renderer's final pass (no CSS filter / blend layers on the canvas:
    // the compositor re-filtered the whole screen every frame). 'none' also beats style.css's paint-time rule.
    Look.target = this.renderer.grade;
    this.canvas.style.filter = 'none';
    Look.onChange = () => {
      ArtStyle.refreshPaper();
      if (!this.state.is('PLAYING')) this.renderer.grade.setFilter(ArtStyle.css);
    };
    Look.apply();
    ArtStyle.exclude = () => (this.session ? [this.session.player.model.root] : []);
    ArtStyle.setInk = (on, color) => {
      this.renderer.inkOn = on;
      this.renderer.inkColor.set(color);
    };
    this.ui.onStyle = (id) => void this.switchStyle(id as StyleId);
    this.ui.onSettings = (s) => {
      this.audio.volumes.music = s.music;
      this.audio.volumes.sfx = s.sfx;
      this.audio.applyVolumes();
      this.camera.sensitivity = s.sens;
    };

    this.canvas.addEventListener('mousedown', () => {
      if (this.state.is('INTRO')) this.introT = Math.max(this.introT, INTRO_DURATION - 0.3);
    });
    // Losing the lock without Alt (Esc, alt-tab…) pauses. Alt frees the cursor on purpose.
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked) this.lockFailed = false;
      if (!locked && !this.input.cursorFree && this.state.is('PLAYING') && !this.paused && !this.boonOpen && !this.session?.completed) this.setPaused(true);
    });
    document.addEventListener('pointerlockerror', () => {
      // Never locked at all (automation, unsupported) → fall back to free-look.
      // After a successful lock, errors are transient (Chrome's re-lock cooldown): the click hint stays up.
      if (this.input.everLocked) return;
      this.lockFailed = true;
      if (this.session) this.session.allowUnlockedFire = true;
    });
    // first gesture anywhere wakes the audio so the title has music
    const wake = () => {
      this.audio.init();
      if (this.state.is('TITLE')) this.audio.setMood('title');
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    if (document.documentElement.classList.contains('wd-ios')) {
      window.addEventListener('touchend', () => {
        if (this.audio.ctx?.state !== 'running') wake();
      }, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state.is('PLAYING') && !this.boonOpen && !this.session?.completed) {
          this.setPaused(true);
        }
      });
    }
    window.addEventListener('keydown', (e) => {
      if (this.feedback?.open) return;
      if (e.code === 'Escape' && this.state.is('PLAYING') && !this.boonOpen && !this.session?.completed) this.setPaused(!this.paused);
      // Tab: the Sticker Book (challenges & rewards) — opens the pause screen
      if (e.code === 'Tab' && this.state.is('PLAYING') && !this.boonOpen && !this.session?.completed) {
        e.preventDefault();
        if (!this.paused) {
          this.input.releaseLock();
          this.setPaused(true);
        } else this.resume();
      }
    });
    window.addEventListener('blur', () => {
      if (this.state.is('PLAYING') && !this.session?.completed) this.setPaused(true);
    });
  }

  async boot(): Promise<void> {
    initLang();
    // the sticker book is rendered HTML: redraw it when the language flips (even while paused)
    onLangChange(() => this.refreshBook());
    if (DevMenu.enabled()) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      this.dev = new DevMenu({
        get session() {
          return self.session;
        },
        progress: this.progress,
        restart: () => this.restart(),
        releaseLock: () => this.input.releaseLock(),
        setTimeScale: (k) => (this.loop.timeScale = k),
        showHUD: (on) => this.ui.showHUD(on),
      });
    }
    // ?level=harbor boots straight into an unlocked level (dev builds: any level)
    const want = new URLSearchParams(location.search).get('level');
    if (isLevelId(want) && (LevelUnlocks.has(want) || DevMenu.enabled())) this.levelId = want;
    this.state.set('LOADING');
    this.ui.showLoading(this.loadSteps);
    document.getElementById('boot-paint')?.remove();
    const ok = await this.load();
    if (!ok) return;
    this.ui.hideLoading();
    this.levelSelect = new LevelSelect(this.ui.title);
    this.levelSelect.onHover = () => this.audio.play('uiClick', { vol: 0.3, pitch: 1.5 });
    this.story.mountTitle(this.ui.title, () => this.state.is('TITLE') && !this.busy);
    this.levelSelect.onPick = (id) =>
      void this.setup().then((go) => {
        if (!go || !this.state.is('TITLE')) return;
        if (id === this.levelId) void this.startGame();
        else void this.startLevel(id);
      });
    this.enterTitle();
    bootBridge?.postMessage('first-frame');
    this.render(1, 0);
    this.loop.start();
    await this.ui.wipeOut();
    bootBridge?.postMessage('ready');
  }

  /** The title IS the game: the live plaza behind the sticker HUD. */
  private enterTitle(): void {
    Quality.hold(2.5);
    this.ui.storyCaption(null); // story lines belong to the session that just ended
    if (this.session) this.session.frozen = true;
    this.titleT = 0;
    this.camera.aimT = 0;
    // WAI doesn't exist yet: the pencil draws him at the start of the intro
    if (this.session) this.session.player.model.root.scale.setScalar(0.001);
    this.renderer.viewmodelVisible = false;
    this.state.set('TITLE');
    this.renderer.grade.setFilter(ArtStyle.css);
    this.ui.showTitle(null, null);
    // no painted backdrop any more — the 3D scene shows through
    this.ui.title.classList.add('live');
    this.ui.title.querySelector('.title-art')?.classList.add('hidden');
    this.ui.title.querySelector('.title-missing')?.classList.add('hidden');
    this.ui.showHUD(false);
    if (this.audio.ctx) this.audio.setMood('title');
  }

  /** Slow hand-held drift on the composition of the original title painting. */
  private titlePose(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    // each level's own concept view (Blind Plaza: statue left, the sleeping face ahead, the road up to the tower)
    return LEVELS[this.levelId].titlePose(time);
  }

  /** Where the push-in to WAI starts: the title view, or the level's own start when its title is somewhere else. */
  private introPose(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const L = LEVELS[this.levelId];
    return (L.introPose ?? L.titlePose)(time);
  }

  // ───────────── title → setup → game ─────────────
  /**
   * The one screen between START and the game. It appears once per device (and never under `?test` or a
   * `?difficulty=` URL: the bots and the test URLs go straight in). `false` = the player went back to the title.
   */
  private setup(): Promise<boolean> {
    if (!setupDue()) return Promise.resolve(true);
    this.audio.init();
    return showSetup({ onHover: this.ui.onHover ?? undefined, onLook: () => this.look?.toggle(true) });
  }

  async startGame(): Promise<void> {
    Quality.hold(3);
    if (this.busy || !this.state.is('TITLE') || !this.session) return;
    this.busy = true;
    // the Start click is a user gesture: capture the mouse now (unless the storybook intro will show first)
    const introFirst = this.levelId === 'plaza' && this.story.introDue();
    if (!introFirst && !this.lockFailed) this.input.requestLock();
    this.audio.init();
    this.audio.play('uiClick');
    this.audio.play('stickerBurst');
    this.introFrom = this.introPose(this.titleT);
    this.levelSelect?.close();
    const burst = this.ui.burstTitle();
    this.audio.play('whoosh');
    // a new game: the storybook INTRO first (once; replayable from the title's STORY sticker)
    if (this.levelId === 'plaza' && this.story.introDue()) {
      await burst;
      await this.story.intro();
      this.introFrom = this.introPose(this.titleT);
      if (!this.lockFailed && (navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive) this.input.requestLock();
    }
    this.beginIntro();
    await burst;
    this.ui.hideTitle();
    this.ui.title.classList.remove('live');
    this.busy = false;
  }

  /** Pause → Art style: a paint wipe covers the one-off shader recompile of the new look. */
  private styleBusy = false;
  private async switchStyle(id: StyleId): Promise<void> {
    if (this.styleBusy || id === ArtStyle.id) return;
    this.styleBusy = true;
    this.audio.play('stickerBurst', { vol: 0.5, pitch: 1.3 });
    await this.withPaintWipe('Mixing the paint…', async () => {
      // 画风变更会重写材质，完成后重新合批。
      this.batch.clear();
      ArtStyle.set(id, this.renderer.scene, this.renderer.renderer);
      this.rebatch();
      if (ArtStyle.needsCompile) await this.renderer.precompile();
      this.renderer.render();
    });
    this.styleBusy = false;
  }

  private async withPaintWipe(phase: string, prepare: () => void | Promise<void>): Promise<void> {
    try {
      await this.ui.wipeIn(phase);
      await prepare();
      await this.ui.wipeProgress(100, 'Ready!');
    } catch (err) {
      console.error(err);
      this.loop.stop();
      this.input.releaseLock();
      this.ui.showLoading(this.loadSteps);
      this.ui.showLoadError(String((err as Error)?.message ?? err));
    } finally {
      await this.ui.wipeOut();
    }
  }

  /** Loader lines: one playful line per real step (the bar still measures the real work). */
  private readonly loadSteps = ['Waking up the ink…', 'Mixing the paint…', 'Sharpening the pencils…', 'Sketching the streets…', 'Letting the paint dry…'];

  /** Real loading with measured progress. */
  private async load(): Promise<boolean> {
    const N = this.loadSteps.length;
    const set = (i: number, f: number, _label?: string) => this.ui.setLoading(i, f, f >= 1 && i === N - 1 ? 'Ready!' : this.loadSteps[i], N);
    try {
      bootBridge?.postMessage('physics');
      await set(0, 0, t('Initialising physics…'));
      await initRapier();
      bootBridge?.postMessage('textures');
      await this.assets.buildTextures((label, f) => void set(1, f * 0.5, label));
      await this.assets.loadPaintedTextures((label, f) => void set(1, 0.5 + f * 0.5, label));
      await loadOrganArt();
      ArtStyle.bindTextures(this.assets.textures);
      bootBridge?.postMessage('models');
      await this.assets.loadOptionalModels((label, f) => void set(2, f, label));
      bootBridge?.postMessage('scene');
      await set(3, 0, t('Placing buildings, hosts, monsters…'));
      if (!this.viewmodel) this.viewmodel = new Viewmodel(this.assets, this.renderer.viewCamera, this.renderer.viewScene);
      this.createSession();
      this.session!.frozen = true;
      this.camera.override = this.titlePose(0);
      // iOS 先绘制正常场景。喷漆纹理随使用分配，避免启动时预分配大量显存。
      if (IOS_APP) {
        await set(4, 1, t('Ready!'));
        return true;
      }
      await set(4, 0, t('Compiling shaders…'));
      const fx = (this.session as unknown as { effects: { ensurePaint(): { prewarm(s: THREE.Scene): THREE.Object3D[]; fillPool(): void } | null } }).effects;
      const dummies = fx.ensurePaint()?.prewarm(this.renderer.scene) ?? [];
      fx.ensurePaint()?.fillPool();
      // things that only appear mid-game (dropped sticker organs…) need their SHADOW shaders too:
      // park one of each in front of the camera and draw a real frame (compileAsync skips the shadow pass)
      const pose = this.titlePose(0);
      const ahead = pose.look.clone().sub(pose.pos).normalize().multiplyScalar(6).add(pose.pos);
      for (const ty of ['EYE', 'MOUTH', 'LEG'] as const)
        for (const corrupted of [true, false]) {
          const v = makeOrganVisual(ty, corrupted);
          v.position.copy(ahead).add(new THREE.Vector3((dummies.length % 6) - 3, 0, 0));
          v.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
          this.renderer.scene.add(v);
          dummies.push(v);
        }
      await this.renderer.precompile();
      this.renderer.render();
      for (const d of dummies) d.parent?.remove(d);
      await set(4, 1, t('Ready!'));
      return true;
    } catch (err) {
      console.error(err);
      this.ui.showLoadError(String((err as Error)?.message ?? err));
      this.disposeSession();
      return false;
    }
  }

  /** Rebuild the tuning from the equipped arsenal + run boons (before the session is built, so tank/hearts start right). */
  private applyRewardsGlobal(): void {
    this.arsenal.applyStats();
  }

  /** Equipment / boons changed mid-run: re-tune and keep the live session consistent. */
  private onArsenalChange(): void {
    const prevMax = PLAYER.maxHp;
    this.arsenal.applyStats();
    const s = this.session;
    if (s) {
      s.splashBoots = REWARDS.splashBoots;
      s.weapon.tank = Math.min(s.weapon.tank, SPRAY.tank);
      if (PLAYER.maxHp > prevMax) s.player.hp += PLAYER.maxHp - prevMax;
      s.player.hp = Math.min(s.player.hp, PLAYER.maxHp);
      this.ui.setHearts(s.player.hp, PLAYER.maxHp);
      if (this.gadgets && this.gadgets.id !== this.arsenal.gadget) {
        this.gadgets.id = this.arsenal.gadget;
        this.gadgets.cd = 0;
      }
    }
    this.refreshArsenal();
  }

  private refreshArsenal(): void {
    const a = this.arsenal;
    this.ui.renderArsenal(
      ITEMS.map((d) => ({ id: d.id, slot: d.slot, name: d.name, desc: d.desc, owned: a.owns(d.id), on: a.equipped(d.id), how: CHALLENGES.find((c) => c.reward === (d.id as never))?.title ?? null })),
      { charms: a.charms.length, max: CHARM_SLOTS },
      [...a.boons].map(([id, n]) => ({ ...BOONS.find((b) => b.id === id)!, n })),
      (id) => {
        const r = a.toggle(id as ItemId);
        if (r === 'full') this.ui.toast(t('All {n} charm slots are full — take one off first', { n: CHARM_SLOTS }), 'warn');
        this.audio.play(r === 'on' ? 'stickerBurst' : 'select', { vol: 0.6, pitch: r === 'on' ? 1.2 : 0.9 });
      },
    );
  }

  /** Pick 1 of 3: the game holds still while the cards are up. Re-rolls follow the Arsenal's gold pity rule. */
  private offerBoon(rerolled = false): void {
    const s = this.session;
    if (!s) return;
    const { hand: opts, golden } = this.arsenal.rollBoons(3, rerolled);
    this.boonQueue--;
    if (!opts.length) return;
    const take = (b: BoonDef) => {
      this.arsenal.takeBoon(b.id);
      this.boonOpen = false;
      if (b.id === 'heart') s.player.hp = PLAYER.maxHp;
      this.ui.setHearts(s.player.hp, PLAYER.maxHp);
      this.ui.showBoons(null);
      s.frozen = false;
      this.audio.play('crown', { vol: 0.8 });
      this.ui.toast(t('Boon: {name}', { name: t(b.name) }), 'good');
      if (!this.lockFailed) this.input.requestLock();
    };
    // test harnesses (localStorage wd.boons = 'auto') never stop on the picker
    if (localStorage.getItem('wd.boons') === 'auto') return take(opts[0]);
    this.boonOpen = true;
    s.frozen = true;
    this.haltForMenu(s);
    this.input.reset();
    this.input.releaseLock();
    this.audio.stopAllLoops();
    this.audio.play('wake', { vol: 0.6, pitch: 1.2 });
    this.ui.showBoons(opts, take, this.arsenal.rerolls > 0 ? () => {
      this.arsenal.rerolls--;
      this.boonQueue++;
      this.ui.showBoons(null);
      this.boonOpen = false;
      this.offerBoon(true);
    } : null, this.arsenal.rerolls, golden, this.arsenal.rerollPromisesGold);
  }

  /**
   * The boon picker stops WAI dead: no velocity, no dodge / jet / slam carrying on, and the
   * follow camera's smoothing snapped onto him — nothing may keep drifting or sliding behind the
   * cards (render() also stops interpolating while the step is frozen).
   */
  private haltForMenu(s: PlaySession): void {
    const p = s.player;
    // teleport() is the controller's own clean stop (vel, vy, knock, dodge, slam, jet, prevPos);
    // it lifts the body by 2 cm, so hand it the feet 2 cm lower: the capsule stays exactly where it is
    const feetY = p.pos.y;
    p.teleport(p.pos.clone().setY(feetY - 0.02), p.facing);
    p.pos.y = p.renderPos.y = feetY;
    if (p.action === 'dodge') p.action = 'none';
    this.agent.act({ type: 'stop' });
    this.camera.snapTo(p.pos);
  }

  private refreshBook(): void {
    const p = this.progress;
    const skinName: Record<CapeSkin, string> = { red: 'Classic Red', gold: 'Golden Cape', cosmic: 'Cosmic Cape', rainbow: 'Rainbow Drip Cape' };
    this.ui.renderBook(
      CHALLENGES.map((c) => ({ title: c.title, progress: p.progress(c), goal: c.goal, reward: c.rewardName, icon: c.icon, done: p.has(c.reward), elsewhere: c.level && c.level !== this.levelId ? `LV. ${LEVELS[c.level].num}` : null }))
        .sort((a, b) => Number(!!a.elsewhere) - Number(!!b.elsewhere)),
      (['red', 'rainbow', 'cosmic', 'gold'] as CapeSkin[]).map((id) => ({ id, name: skinName[id], unlocked: id === 'red' || p.has(`skin_${id}` as never), active: p.skin === id })),
      (id) => {
        p.setSkin(id as CapeSkin);
        this.session?.player.cape.setSkin(p.skin);
        this.audio.play('select', { pitch: 1.3 });
        this.refreshBook();
      },
    );
  }

  private createSession(): void {
    this.disposeSession();
    this.arsenal.resetRun();
    this.applyRewardsGlobal();
    this.input.reset();
    this.ui.setLevelTag(LEVELS[this.levelId].tagHtml);
    document.body.dataset.level = this.levelId; // level-specific help lines (e.g. X shout only where it exists)
    const s = LEVELS[this.levelId].create(this.renderer.scene, this.assets, this.input, this.camera, this.audio, {
      hitstop: (sec) => (this.loop.hitstop = Math.max(this.loop.hitstop, sec)),
      slowmo: (scale, sec) => {
        this.loop.timeScale = scale;
        this.slowmoT = sec;
      },
    });
    s.allowUnlockedFire = this.lockFailed;
    this.session = s;
    this.recentOrganEvents.length = 0;
    s.player.model.root.userData.noFade = true;
    this.fader?.clear();
    this.fader = new OcclusionFader(this.renderer.scene);
    // the follow camera's soft limits (CameraController.softLimit): merged rock / bush batches (they can't fade) and
    // big creatures' drawn bodies (their colliders are much smaller; only big ones within 20 m; not the Red Pen). Every other frame the
    // last answer is reused, but only for the same boom (a stale answer for a moved boom made the camera flicker).
    {
      const ray = new THREE.Raycaster();
      const hits: THREE.Intersection[] = [];
      let frame = 0;
      const cached = { wall: Infinity, body: Infinity };
      const last = { from: new THREE.Vector3(), dir: new THREE.Vector3(), max: 0 };
      this.camera.softLimit = (from, dir, max) => {
        const same = from.distanceToSquared(last.from) < 1e-4 && dir.dot(last.dir) > 0.99995 && Math.abs(max - last.max) < 0.01;
        if (frame++ % 2 === 1 && same) return cached;
        last.from.copy(from);
        last.dir.copy(dir);
        last.max = max;
        const wall = this.fader ? this.fader.wallDistance(from, dir, max, 0.3) : Infinity;
        cached.wall = wall >= max ? Infinity : wall;
        cached.body = Infinity;
        for (const e of s.enemies) {
          // the Red Pen is framed by its own rules (level/works/SoulsCamera: unblock, push-out, near fade)
          if (e.disposed || e.harmless || e.bigness < 0.55 || e.kind === 'redpen') continue;
          if (e.pos.distanceToSquared(from) > 400) continue;
          ray.set(from, dir);
          ray.far = max;
          ray.camera = this.renderer.camera; // sprites need it
          hits.length = 0;
          ray.intersectObject(e.root, true, hits);
          for (const h of hits) {
            if ((h.object as THREE.Mesh).userData?.isOutline || !(h.object as THREE.Mesh).visible) continue;
            cached.body = Math.min(cached.body, h.distance);
            break;
          }
        }
        return cached;
      };
    }
    this.agent.attach(s);
    this.coop.attach(s);
    // rewards in this run
    this.progress.attach(s.events, this.levelId);
    s.splashBoots = REWARDS.splashBoots;
    // gadget + boons (roguelike layer)
    this.gadgets?.dispose();
    this.gadgets = new Gadgets(s, this.arsenal.gadget);
    this.boonQueue = 0;
    this.firstBoon = null;
    this.boonOpen = false;
    this.ui.showBoons(null);
    // the starting boon waits until WAI has had a moment to just move around
    s.events.on('intro:done', () => (this.firstBoon = { from: s.player.pos.clone(), t: 0 }));
    s.events.on('face:woken', () => this.boonQueue++);
    s.events.on('enemy:stunned', () => {
      if (REWARDS.leech) s.player.heal(1);
    });
    s.player.cape.setSkin(this.progress.skin);
    this.runUnlocks = [];
    this.completeCam = null;
    this.progress.onUnlock = (c) => {
      // gear is never forced on: it lands in the ARSENAL, you choose to equip it
      const gear = ITEMS.some((i) => i.id === (c.reward as string));
      this.runUnlocks.push({ img: gear ? itemArt(c.reward) : `${import.meta.env.BASE_URL}assets/stickers/${c.icon}.webp`, name: c.rewardName });
      const cur0 = this.session;
      if (cur0?.completed) {
        // finishing the level: the completion screen presents it (no popup over the celebration)
        if (c.reward.startsWith('skin_')) {
          this.progress.setSkin(c.reward.slice(5) as CapeSkin);
          cur0.player.cape.setSkin(this.progress.skin);
        }
        return;
      }
      const def = gear ? itemDef(c.reward as ItemId) : null;
      const equipHint = this.input.touchMode ? t('Equip it in the Pause Menu → Arsenal') : t('equip it in the ARSENAL (Tab)');
      this.ui.unlockPopup(c.icon, {
        iconSrc: gear ? itemArt(c.reward) : undefined,
        badge: t('UNLOCKED!'),
        title: def ? t(def.name) : t(c.rewardName),
        desc: def ? `${t(def.desc)} · ${equipHint}` : t('Equipped on your cape!'),
        reason: t('Unlocked by: {title}', { title: t(c.title) }),
      });
      this.audio.play('unlock');
      const cur = this.session;
      if (!cur) return;
      if (c.reward.startsWith('skin_')) {
        this.progress.setSkin(c.reward.slice(5) as CapeSkin);
        cur.player.cape.setSkin(this.progress.skin);
      }
    };
    // third-person gun in WAI's mitten + muzzle provider
    const tpGun = buildSprayGun(this.assets, 1.0);
    s.player.model.gunSocket.add(tpGun.root);
    const vm = this.viewmodel!;
    s.weapon.muzzleProvider = () => {
      if (this.camera.aimT > 0.5) {
        const cam = this.renderer.camera;
        const fwd = new THREE.Vector3();
        cam.getWorldDirection(fwd);
        const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
        return cam.position.clone().addScaledVector(fwd, 0.6).addScaledVector(right, 0.2).add(new THREE.Vector3(0, -0.18, 0));
      }
      return tpGun.muzzle.getWorldPosition(new THREE.Vector3());
    };
    s.throws.onCanOut = (out) => {
      tpGun.root.visible = !out;
      if (out) ui.toast(t('Can thrown! Follow the beam to pick it up — it comes back by itself if you cannot reach it.'), 'info');
    };
    s.weapon.onShot = (heavy) => vm.shot(heavy, heavy ? '#b23cff' : Effects.splatColor(Math.floor(Math.random() * 5)));

    // HUD wiring
    const ui = this.ui;
    const noteOrgan = (action: OrganReportEvent['action'], organ: Organ) => {
      this.recentOrganEvents.push({ action, type: organ.type, source: organ.sourceId, seconds: Math.round(s.stats.time) });
      if (this.recentOrganEvents.length > 6) this.recentOrganEvents.shift();
    };
    s.events.on('organ:dropped', ({ organ }) => noteOrgan('dropped', organ));
    s.events.on('organ:collected', ({ organ }) => {
      noteOrgan('collected', organ);
      const icon = organ.type === 'LEG' ? 'legs_corrupted' : `${organ.type.toLowerCase()}_corrupted`;
      const key = this.input.touchMode ? t(organ.type === 'LEG' ? 'LEGS' : organ.type) : organ.def.keyLabel;
      this.ui.unlockPopup(icon, {
        badge: t('NEW STICKER!'),
        title: t(organ.def.corruptedName),
        desc: t('Hold {key} to purify → {ability}', { key, ability: t(organ.def.wornAbility) }),
        reason: t('Dropped by a repainted mutant'),
      });
    });
    s.events.on('organ:purified', ({ organ }) => {
      const icon = organ.type === 'LEG' ? 'legs' : organ.type.toLowerCase();
      const key = this.input.touchMode ? t(organ.type === 'LEG' ? 'LEGS' : organ.type) : organ.def.keyLabel;
      this.ui.unlockPopup(icon, {
        badge: t('STICKER PURIFIED!'),
        title: t(organ.def.name),
        desc: `${t(organ.def.wornAbility)} · ${t('Lend ({key}): {lent}', { key, lent: t(organ.def.lentBehaviour) })}`,
        reason: t('Purified from {organ}', { organ: t(organ.def.corruptedName) }),
      });
    });
    s.events.on('toast', ({ text, kind, at, immediate }) => {
      if (at && at.distanceTo(s.player.pos) > 22) return; // a creature's tip only makes sense when you're there
      ui.toast(text, kind, immediate);
    });
    s.events.on('story:caption', ({ text, big }) => ui.storyCaption(text, big));
    s.events.on('player:damaged', ({ hp, from, heavy }) => {
      ui.setHearts(hp, PLAYER.maxHp);
      if (hp < PLAYER.maxHp) ui.flashDamage();
      if (from) {
        // which side of the screen the hit came from (camera space)
        // relative to WAI, in the camera's heading: 0 = ahead (top), ±π/2 = sides, π = behind (bottom)
        const d = from.clone().sub(s.player.pos).setY(0);
        const { forward, right } = this.camera.basis();
        ui.inkHit(Math.atan2(d.dot(right), d.dot(forward)), !!heavy);
      }
      ui.setLowHp(hp > 0 && hp <= 2);
    });
    s.events.on('player:healed', ({ hp }) => ui.setLowHp(hp > 0 && hp <= 2));
    s.events.on('player:healed', ({ hp }) => ui.setHearts(hp, PLAYER.maxHp));
    ui.setLowHp(false);
    s.events.on('hit:marker', ({ weak, finished }) => ui.hitMarker(weak, finished));
    s.events.on('encore:stamp', ({ stamps, mult }) => {
      ui.stampStreak(stamps, mult);
      if (stamps >= 2) this.audio.play('crown', { vol: 0.5 + Math.min(0.4, stamps * 0.06), pitch: 1 + stamps * 0.08 });
    });
    s.combat.onImpactFrame = (k) => ui.impactFrame(k);
    s.combat.onPaintTime = (on) => {
      ui.setPaintTime(on);
      this.audio.duck(on ? 0.35 : 1, on ? 2.4 : 0.2);
    };
    ui.setPaintTime(false);
    s.events.on('crown:collected', () => {
      ui.setCounters(s.stats.crowns, s.stats.totalCrowns, s.stats.paint);
      ui.bump('crowns');
    });
    s.events.on('paint:collected', () => {
      ui.setCounters(s.stats.crowns, s.stats.totalCrowns, s.stats.paint);
      ui.bump('paint');
    });
    s.events.on('region:entered', ({ name }) => {
      if (this.state.is('PLAYING') && !s.story.locked) ui.showRegion(name);
    });
    s.events.on('level:complete', () => {
      this.arsenal.saveCarried(); // gold boons travel to the next level
      this.audio.play('crown');
      if (!this.story.on) {
        this.completeTimer = 2.0;
        return;
      }
      // celebration + departure (level 3: + the END), then the result card
      this.completeTimer = -1;
      void this.story.levelOutro(s, this.levelId).then(() => {
        if (this.session === s && s.completed) this.completeTimer = 0.05;
      });
    });
    const cards = () => {
      ui.setCards(s.inventory, (id) => s.organs.hostById(id)?.def.name ?? 'something', (id) => s.organs.hostById(id));
      this.touch.setInventory(s.inventory);
    };
    s.inventory.onChange(cards);
    cards();
    ui.setHearts(PLAYER.maxHp, PLAYER.maxHp);
    ui.setCounters(0, s.stats.totalCrowns, 0);
    ui.resetHelp();
    ui.clearToasts();
    this.refreshArsenal(); // carried gold boons are already held: the ARSENAL's boon row shows them
    this.camera.yaw = LEVELS[this.levelId].spawnYaw;
    this.camera.pitch = 0.18;
    this.camera.aimT = 0;
    this.camera.snapTo(s.player.pos);
    ArtStyle.level = this.levelId;
    this.audio.music.level = this.levelId;
    ArtStyle.apply(this.renderer.scene, this.renderer.renderer);
    // the Red Pen's margin notes on the walls (drawing only)
    this.story.decorate(s, this.levelId);
    // rigid GLB props were never frustum-culled (main + shadow pass drew all of them every frame)
    cullModels(this.renderer.scene);
    // flat double-sided transparent sheets: one pass draws the same pixels as three's two (no per-frame program checks)
    singlePassFlats(this.renderer.scene);
    this.rebatch();
  }

  /** Merge the level's still, opaque meshes for drawing. Runs last: it bakes the materials as they are now. */
  private rebatch(): void {
    // `?batch=0` draws every mesh by itself, as before the batcher: the off switch for a device A/B and for a fault report
    if (new URLSearchParams(location.search).get('batch') === '0') return;
    const root = this.renderer.scene.getObjectByName('level-root');
    if (root) this.batch.build(this.renderer.scene, root);
    this.renderer.staticBatch = this.batch;
  }

  private disposeSession(): void {
    this.story.drop();
    this.fader?.clear();
    this.batch.clear();
    if (this.session) {
      this.session.dispose();
      this.session = null;
      if (IOS_APP) ArtStyle.releaseTextures();
    }
  }

  private beginIntro(): void {
    this.introT = 0;
    this.paused = false;
    this.completeTimer = -1;
    this.state.set('INTRO');
    this.ui.showHUD(false);
    this.ui.showPause(false);
    this.ui.showComplete(null);
    this.audio.setMood('explore');
    // the chapter card rides the camera push-in: SKIP ends the push-in exactly where it would have ended
    this.story.titleCard(this.levelId, {
      live: () => this.state.is('INTRO'),
      onSkip: () => {
        if (this.state.is('INTRO')) this.finishIntro();
      },
    });
  }

  /**
   * The intro starts at the painting's framing (zoomed — the title just pushed
   * in) and dolly-zooms out to the gameplay shoulder camera.
   */
  private placeIntroCamera(k: number): void {
    if (!this.session) return;
    const e = ease(k);
    const p = this.session.player.pos;
    const from = this.introFrom ?? this.introPose(0);
    const fromPos = from.pos;
    const fromLook = from.look;
    const toPos = this.camera.idealPosition(p);
    const toLook = toPos.clone().add(this.camera.lookDir());
    const pos = fromPos.clone().lerp(toPos, e);
    const look = fromLook.clone().lerp(toLook, e);
    this.camera.override = { pos, look, fov: THREE.MathUtils.lerp(from.fov, 62, e) };
  }

  private finishIntro(): void {
    this.camera.override = null;
    if (this.session) {
      this.camera.snapTo(this.session.player.pos);
      this.session.frozen = false;
    }
    this.state.set('PLAYING');
    // the pencil scene is a cutscene: no HUD, area titles or tips on top of the drawing —
    // they arrive together once the story hands WAI over to the player
    this.ui.showHUD(false);
    this.session?.events.on('intro:done', () => {
      this.ui.showHUD(true, true);
      // gold boons carried from the last level: told once the HUD is back (not behind the title or the pencil scene)
      const carried = this.arsenal.carriedNow;
      if (carried.length) this.ui.toast(t('Carried over from the last level: {names}', { names: carried.map((b) => t(b.name)).join(' · ') }), 'good');
      this.audio.play('stickerBurst', { vol: 0.6, pitch: 1.3 });
      this.ui.showRegion(t(LEVELS[this.levelId].firstRegion));
      // one thing at a time: the area title first, then the basic controls once it has faded
      const sess = this.session;
      setTimeout(() => {
        if (this.session !== sess || !this.state.is('PLAYING')) return;
        this.ui.toast(
          this.input.touchMode
            ? t('Left thumb: move · right thumb: look · SPRAY to paint · AIM for first person')
            : t('WASD move · mouse look · right-click aim · click spray · H all controls'),
          'info',
        );
      }, 2700);
    });
    this.session?.startStory();
  }

  setPaused(on: boolean): void {
    if (!this.state.is('PLAYING')) return;
    this.paused = on;
    if (on) {
      this.refreshBook();
      this.refreshArsenal();
    }
    this.ui.showPause(on);
    if (this.session) this.session.frozen = on;
    this.input.reset();
    if (on) this.input.releaseLock();
    this.audio.stopAllLoops();
  }

  resume(): void {
    this.setPaused(false);
    if (!this.lockFailed) this.input.requestLock();
  }

  /** 打开反馈时记录当前坐标。标题镜头没有玩家坐标。 */
  private captureFeedback(): GameReport | null {
    const state = this.state.state;
    if (this.busy || (state !== 'TITLE' && (state !== 'PLAYING' || !this.paused))) return null;
    const report: GameReport = { release: import.meta.env.VITE_RELEASE_ID ?? 'dev', state };
    const s = this.session;
    if (!s || state !== 'PLAYING') return report;
    const pos = s.player.pos;
    const round = (n: number) => Math.round(n * 100) / 100;
    report.run = {
      level: s.levelId,
      levelName: t(LEVELS[s.levelId].name),
      difficulty: Difficulty.id,
      objective: t(s.objective().title),
      artStyle: ArtStyle.id,
      xyz: [round(pos.x), round(pos.y), round(pos.z)],
      seconds: Math.round(s.stats.time),
      hp: round(s.player.hp),
      paint: Math.round(s.weapon.tankFrac * 100),
      crowns: s.stats.crowns,
      organs: this.recentOrganEvents.slice(),
    };
    return report;
  }

  async restart(): Promise<void> {
    if (this.busy) return;
    Quality.hold(3);
    this.ui.storyCaption(null);
    this.busy = true;
    this.input.releaseLock();
    this.ui.showPause(false);
    this.ui.showComplete(null);
    await this.withPaintWipe('Sketching the streets…', () => {
      this.createSession();
      this.beginIntro();
    });
    this.busy = false;
  }

  /** Start another level (title level select, or NEXT LEVEL on the completion screen): wipe, build it, play its intro. */
  async startLevel(id: LevelId): Promise<void> {
    if (this.busy) return;
    Quality.hold(3);
    this.busy = true;
    this.audio.init();
    this.audio.play('uiClick');
    // a click is a user gesture: capture the mouse now (like Start)
    if (!this.lockFailed) this.input.requestLock();
    this.ui.storyCaption(null);
    this.levelSelect?.close();
    await this.withPaintWipe('Sketching the streets…', async () => {
      this.ui.showPause(false);
      this.ui.showComplete(null);
      this.ui.hideTitle();
      this.ui.title.classList.remove('live');
      this.paused = false;
      this.levelId = id;
      this.createSession();
      this.camera.override = this.titlePose(0);
      await this.ui.wipeProgress(50, 'Letting the paint dry…');
      // iOS keeps the same allocation policy across level transitions.
      if (!IOS_APP) await this.renderer.precompile();
      this.introFrom = this.introPose(0);
      this.beginIntro();
    });
    this.busy = false;
  }

  async toTitle(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.input.releaseLock();
    await this.withPaintWipe('Sketching the streets…', () => {
      this.ui.showPause(false);
      this.ui.showComplete(null);
      this.paused = false;
      this.introFrom = null;
      this.createSession();
      this.enterTitle();
      this.camera.override = this.titlePose(0);
    });
    this.busy = false;
  }

  // ───────────── loop ─────────────
  private step(dt: number): void {
    if (this.ui.wipeCovered || this.feedback?.open) return;
    const s = this.session;
    if (!s) return;
    if (this.state.is('INTRO')) {
      this.introT += dt;
      s.frozen = true;
      s.step(dt);
      if (this.introT >= INTRO_DURATION) this.finishIntro();
      return;
    }
    if (this.state.is('PLAYING') && !this.paused && !this.boonOpen) {
      s.step(dt);
      this.story.step(dt);
      this.gadgets?.step(dt);
      // B: the equipped gadget
      if (this.input.consumePressed('KeyB')) this.gadgets?.use(!s.frozen && !s.story?.locked && !s.completed && !s.player.smudged);
      if (this.firstBoon) {
        this.firstBoon.t += dt;
        if (this.firstBoon.t > 30 || this.firstBoon.from.distanceTo(s.player.pos) > 12) {
          this.firstBoon = null;
          this.boonQueue++;
        }
      }
      // a boon pick waits for a calm moment (no cutscene, no story lock)
      if (this.boonQueue > 0 && !this.camera.inCine && !s.story?.locked && !s.completed && !s.player.smudged) this.offerBoon();
      if (this.completeTimer > 0) {
        this.completeTimer -= dt;
        if (this.completeTimer <= 0) {
          s.frozen = true;
          this.input.releaseLock();
          this.state.set('COMPLETE');
          const L = LEVELS[this.levelId];
          // finishing a level opens the next one (persisted)
          const unlocks = this.runUnlocks.slice();
          if (L.next && LevelUnlocks.unlock(L.next)) unlocks.unshift({ img: '', name: t('New level: {name}', { name: t(LEVELS[L.next].name) }) });
          const rank = rankRun(s.stats);
          const rec = recordBest(this.levelId, s.stats, rank.letter);
          const cam = this.renderer.camera;
          const dir = new THREE.Vector3();
          cam.getWorldDirection(dir);
          this.completeCam = { from: { pos: cam.position.clone(), look: cam.position.clone().addScaledVector(dir, 10), fov: cam.fov }, t: 0 };
          this.ui.showComplete(s.stats, { titleHtml: L.completeTitleHtml, sub: L.completeSub, next: !!L.next }, {
            rank: rank.letter,
            word: rank.word,
            newTime: rec.newTime,
            newRank: rec.newRank,
            newCrowns: rec.newCrowns,
            prevBest: rec.prev,
            unlocks,
          });
        }
      }
    }
  }

  private render(alpha: number, frameDt: number): void {
    if (this.ui.wipeCovered || this.feedback?.open) return;
    if (this.slowmoT > 0) {
      this.slowmoT -= frameDt;
      if (this.slowmoT <= 0) this.loop.timeScale = 1;
    }
    const s = this.session;
    const inGame = s && !this.state.is('BOOT');
    const live = !!s && this.state.is('PLAYING') && !this.paused && !this.boonOpen && !s.completed;
    // Interpolate between the last two fixed steps only while steps are really running. Paused, on
    // the boon picker, title or results the step is skipped but `alpha` keeps cycling 0→1 every
    // 1/60 s — WAI, the creatures and the camera then shook between their last two positions.
    const stepping = this.state.is('INTRO') || (this.state.is('PLAYING') && !this.paused && !this.boonOpen);
    if (!stepping) alpha = 1;
    this.input.lockable = live && !this.lockFailed && !this.input.touchMode;
    // free-look (no capture) only as a fallback where pointer lock is impossible
    this.input.freeLook = live && this.lockFailed && !this.input.touchMode;
    if (s && inGame) {
      if (this.state.is('TITLE')) {
        this.titleT += frameDt;
        this.camera.override = this.titlePose(this.titleT);
      } else if (this.state.is('COMPLETE') && this.completeCam) {
        // victory postcard: glide from where you finished to the level's hero view of the woken city
        const cc = this.completeCam;
        cc.t += frameDt;
        const k = ease(Math.min(1, cc.t / 2.2));
        const L = LEVELS[this.levelId];
        const to = (L.victoryPose ?? L.titlePose)(8 + cc.t * 0.5);
        this.camera.override = {
          pos: cc.from.pos.clone().lerp(to.pos, k),
          look: cc.from.look.clone().lerp(to.look, k),
          fov: THREE.MathUtils.lerp(cc.from.fov, to.fov, k),
        };
      } else if (this.state.is('INTRO')) this.placeIntroCamera(Math.min(1, this.introT / INTRO_DURATION));
      const wantTouch = this.input.touchMode && this.state.is('PLAYING') && !this.paused && !this.boonOpen && !s.completed;
      if (wantTouch !== this.touch.active) this.touch.show(wantTouch);
      const looking = this.state.is('PLAYING') && !this.paused && !this.boonOpen && (this.input.pointerLocked || this.input.freeLook || this.input.touchMode || this.lockFailed);
      if (looking) {
        const { dx, dy } = this.input.takeMouseDelta(frameDt);
        this.camera.applyMouse(dx, dy);
        this.lastMouse = { dx, dy };
      } else {
        this.input.takeMouseDelta();
        this.lastMouse = { dx: 0, dy: 0 };
      }
      if (this.state.is('PLAYING') && !this.paused && !this.boonOpen) this.agent.update(frameDt);
      s.render(alpha, frameDt);
      this.story.pose();
      // story cutscenes: the gameplay HUD (prompts, crosshair, cards, guide arrow) steps aside; toasts stay
      const cineNow = this.state.is('PLAYING') && (this.camera.storyCine || !!s.story?.locked);
      if (cineNow !== this.cineHud) {
        this.cineHud = cineNow;
        document.body.classList.toggle('in-cine', cineNow);
      }
      if (this.state.is('PLAYING') && !this.paused && !cineNow) this.ui.helpTick(frameDt);
      // paused: the cutscene clock stops too (it used to finish behind the pause menu)
      this.camera.update(s.player.renderPos, this.paused ? 0 : frameDt, s.physics, s.cameraBlocker);
      if (this.fader) {
        const rp = s.player.renderPos;
        const fadeOn = this.state.is('PLAYING') && !this.paused && !this.camera.storyCine && this.camera.aimT < 0.5;
        // big creatures' drawn bodies fade when the camera is in one (the Red Pen fades itself: SoulsCamera)
        const cp = this.renderer.camera.position;
        const bodies = fadeOn ? s.enemies.filter((e) => !e.disposed && e.bigness >= 0.5 && e.kind !== 'redpen' && e.pos.distanceToSquared(cp) < 400).map((e) => e.root) : [];
        this.fader.update(cp, [rp.clone().setY(rp.y + 1.3), rp.clone().setY(rp.y + 0.7)], frameDt, fadeOn, bodies);
      }
      // listener for positional audio
      const right = this.renderer.camera.getWorldDirection(this.listenerRight);
      right.set(-right.z, 0, right.x);
      this.audio.setListener(this.renderer.camera.position, right);
      // the title has its own music (the frozen session behind it would otherwise say "explore")
      this.audio.setMood(this.state.is('TITLE') ? 'title' : this.paused ? this.audio.music.mood : s.mood);
      // a boss fight's progress opens the boss music up (filter, overlay layers): src/level/BossMood.ts
      if (!this.paused) this.audio.music.setHeat(bossHeat(s.mood === 'boss_final' ? s.boss : bossInFight(s.enemies, s.player.pos)));
      // viewmodel pass
      const viewFov = this.renderer.camera.fov * 0.8;
      if (this.renderer.viewCamera.fov !== viewFov) {
        this.renderer.viewCamera.fov = viewFov;
        this.renderer.viewCamera.updateProjectionMatrix();
      }
      this.renderer.viewmodelVisible = this.camera.aimT > 0.4 && this.state.is('PLAYING');
      const moveSpeed = Math.hypot(s.player.vel.x, s.player.vel.z) / PLAYER.sprintSpeed;
      this.viewmodel?.update(frameDt, moveSpeed, this.lastMouse.dx, this.lastMouse.dy, s.weapon.tankFrac, this.camera.aimT);
      if (this.state.is('PLAYING')) this.updateHUD(s, frameDt);
      this.dev?.update();
      Quality.followShadow(s.player.renderPos);
      if (live && !cineNow || !document.documentElement.classList.contains('wd-ios')) Quality.frame(frameDt);
      this.renderer.render();
      this.coop.frame(this.renderer, this.ui, frameDt); // PIP-HOOK
    }
    this.input.endFrame();
  }

  private updateHUD(s: PlaySession, dt: number): void {
    const ui = this.ui;
    this.objTimer -= dt;
    if (this.objTimer <= 0) {
      this.objTimer = 0.25;
      const o = s.objective();
      ui.setObjective(o.title, o.hint);
    }
    const prompt = this.paused ? null : s.prompt();
    ui.setPrompt(prompt);
    if (this.input.touchMode) {
      this.touch.setInteraction(prompt);
      this.touch.setAirborne(!s.player.grounded);
    }
    ui.setHold(s.organs.hold);
    ui.setThrow(s.throws.rocks, s.throws.charge, s.weapon.canOut);
    const g = this.gadgets;
    ui.setGadget(g?.id ?? null, g?.frac ?? 0);
    this.touch.setGadget(g?.id ?? null, g?.frac ?? 0);
    ui.setEncore(s.combat.view);
    ui.setAimState(this.camera.aimT, s.weapon.tankFrac, s.player.mouthful, s.weapon.spreadNow, s.weapon.inRange, s.weapon.color);
    ui.setPresence(s.presence);
    // big monster close → comfortable "giant" camera
    this.camera.giant = Math.min(1, s.presence * 1.4);
    // health drains colour from the world: lower = greyer, last half-heart = black & white
    const hpF = s.player.hp / PLAYER.maxHp;
    const filter = s.combat.paintTime > 0
      ? 'saturate(1.8) contrast(1.12) brightness(1.05)'
      : s.player.hp <= 1
        ? 'grayscale(1) contrast(1.18)'
        : hpF >= 1
          ? ''
          : `saturate(${(0.3 + 0.7 * hpF).toFixed(2)})`;
    // the art style's grade sits under the health / Paint Time grade (eases like the old CSS transition)
    this.renderer.grade.setFilter(`${ArtStyle.css} ${filter}`.trim(), s.combat.paintTime > 0 ? 0.15 : 0.4);
    const boss = s.bossTarget();
    ui.setBoss(boss ? boss.displayName : null, boss ? boss.hp / boss.maxHp : 0);
    const hint = this.paused || s.completed || this.input.touchMode || this.lockFailed || this.input.pointerLocked
      ? null
      : this.input.cursorFree
        ? t('Cursor free — click the game or release Alt to return')
        : t('Click to take control');
    ui.setLockHint(hint);
  }
}

await commitLoadingFrame();
bootBridge?.postMessage('graphics');
const app = new App();
void app.boot();
if (location.search.includes('test')) void import('./debug/testHelpers').then((m) => m.installTestHelpers());

// AI player API: an LLM harness calls observe() every second or two and act() with high-level commands.
(window as unknown as { WD_AGENT: unknown }).WD_AGENT = {
  observe: () => app.agent.observe(),
  act: (cmd: import('./agent/AgentBridge').AgentCommand) => app.agent.act(cmd),
  schema: AgentBridge.SCHEMA,
};
// AI co-op partner API (same shape, drives the companion instead of WAI).
(window as unknown as { WD_COOP: unknown }).WD_COOP = app.coop.api();

// Debug / automated-test hooks.
(window as unknown as { __WD: unknown }).__WD = {
  app,
  get session() {
    return app.session;
  },
  get state() {
    return app.state.state;
  },
  /** Deterministic advance; camera/visuals update every step, GPU render only at the end. */
  advance(seconds: number) {
    const a = app as unknown as { step(dt: number): void; render(al: number, f: number): void };
    const n = Math.round(seconds * 60);
    const real = app.renderer.render.bind(app.renderer);
    app.renderer.render = () => {};
    for (let i = 0; i < n; i++) {
      a.step(1 / 60);
      a.render(1, 1 / 60);
    }
    app.renderer.render = real;
    real();
  },
};
