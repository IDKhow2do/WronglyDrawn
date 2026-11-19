/**
 * [INPUT]: depends on CameraController's playCine (CineShot) via GameContext; HarborBuilt (spots, hosts) and HARBOR
 *          from ../level/harbor/MuteHarbor; StoryDirector (the kid's pencil); HushBoss; t from ../i18n
 * [OUTPUT]: exports HarborStory (intro, ferryBeat, clockBeat, lighthouseBeat, bossIntro, finale, captions, timers)
 * [POS]: Mute Harbor's story layer, driven by HarborSession. Its shots look at points outside solid bodies
 *        (the ferry beat frames the horn's Mouth socket, not the deckhouse): a look point buried in a model
 *        leaves the shot planner no clear spot.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { CineShot } from '../render/CameraController';
import type { HushBoss } from '../enemy/HushBoss';
import type { HarborBuilt } from '../level/harbor/MuteHarbor';
import { HARBOR } from '../level/harbor/MuteHarbor';
import { StoryDirector } from './StoryDirector';
import { t } from '../i18n';

type Beat = { at: number; fn: () => void; done?: boolean };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shot = (pos: THREE.Vector3, look: THREE.Vector3, dur: number, o: Partial<CineShot> = {}): CineShot => ({ pos, look, dur, fov: 50, toFov: 46, handheld: 0.02, ...o });

/**
 * Mute Harbor's story layer: the arrival through Blind Plaza's tower door, a camera beat for each
 * sound Guardian, the Hush rising from the sea, its entrance and the finale. Captions are English
 * source strings (src/i18n/zh.ts has the Chinese). Reuses StoryDirector for the kid's pencil.
 */
export class HarborStory {
  private beats: Beat[] = [];
  private t = 0;
  private running = false;
  private skipTo = -1;
  private onEnd: (() => void) | null = null;
  private anims: ((dt: number) => boolean)[] = [];
  /** The kid's pencil (redraws planks and bridges). */
  readonly pencil: StoryDirector;
  onCaption: ((text: string | null, big?: boolean) => void) | null = null;
  /** True while a scripted sequence holds the controls. */
  locked = false;
  private captionTimer: ReturnType<typeof setTimeout> | null = null;
  private timers: { t: number; fn: () => void }[] = [];

  /** Run `fn` after `sec` seconds of game time. */
  later(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  constructor(
    private ctx: GameContext,
    private player: PlayerController,
    private level: HarborBuilt,
  ) {
    this.pencil = new StoryDirector(ctx, player);
  }

  private caption(text: string | null, big = false): void {
    this.onCaption?.(text ? t(text) : null, big);
  }

  /** A caption that clears itself (gameplay beats that don't lock the controls). */
  flash(text: string, ms = 3600, big = true): void {
    this.caption(text, big);
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => this.caption(null), ms);
  }

  private run(beats: Beat[], skippableAt: number, onEnd: () => void): void {
    this.beats = beats;
    this.t = 0;
    this.running = true;
    this.skipTo = skippableAt;
    this.onEnd = onEnd;
  }

  /** Skip the current sequence (click / space after a moment). */
  skip(): void {
    if (!this.running || this.skipTo < 0 || this.t < this.skipTo) return;
    for (const b of this.beats) if (!b.done) {
      b.done = true;
      b.fn();
    }
  }

  private end(): void {
    this.running = false;
    this.beats = [];
    const fn = this.onEnd;
    this.onEnd = null;
    fn?.();
  }

  pencilDraw(at: THREE.Vector3, dur = 1.6): void {
    this.pencil.pencilDraw(at, dur);
  }

  // ───────────── 1. arrival ─────────────
  /** WAI steps out of Blind Plaza's tower door onto a silent harbour at dusk. */
  intro(hush: HushBoss): void {
    const cam = this.ctx.camera;
    const p = this.player;
    this.locked = true;
    p.frozen = true;
    const model = p.model.root;
    model.scale.setScalar(0.001);
    const door = this.level.spots.door;
    const spawn = HARBOR.spawn;
    const lh = this.level.spots.lampOut;
    const hush0 = hush.pos.clone().add(V(0, 3, 0));
    let hopT = -1;
    this.anims.push((dt) => {
      if (hopT < 0) return false;
      hopT += dt;
      // a hop out of the doorway onto the pier
      const k = Math.min(1, hopT / 0.55);
      model.scale.setScalar(Math.max(0.001, Math.min(1, k * 1.4)));
      const from = door.clone().add(V(0, 0, -0.2));
      const pos = from.lerp(spawn, k);
      pos.y += Math.sin(k * Math.PI) * 0.7;
      p.teleport(pos, Math.PI);
      return k >= 1;
    });
    this.run(
      [
        {
          at: 0,
          fn: () => {
            this.caption('Beyond the tower door, the next torn piece of canvas…', true);
            cam.playCine([shot(V(spawn.x + 3.4, 1.6, spawn.z - 4.2), door.clone().add(V(0, 1.6, 0)), 2.6, { toPos: V(spawn.x + 2.6, 1.4, spawn.z - 3.4), fov: 46, toFov: 42 })]);
          },
        },
        { at: 0.5, fn: () => this.level.openArrivalDoor() },
        {
          at: 1.2,
          fn: () => {
            hopT = 0;
            this.ctx.audio.play('jump', { pitch: 1.2 });
          },
        },
        {
          at: 1.9,
          fn: () => {
            this.ctx.audio.play('land');
            this.ctx.effects.comic(spawn.clone().add(V(0, 1.8, 0)), t('WAI!'), '#ff3fa4', 0.8);
            this.level.closeArrivalDoor();
          },
        },
        {
          at: 2.8,
          fn: () => {
            this.caption('MUTE HARBOR. Not a bell, not a gull — not a single sound.', true);
            // over WAI's shoulder up the quay: the gate, the market roofs, the lighthouse far away
            cam.playCine([shot(V(spawn.x - 2.5, 4.2, spawn.z + 4.5), V(2, 4, 6), 3.0, { toPos: V(spawn.x - 1.5, 6.2, spawn.z + 2.5), toLook: V(6, 7, -30), fov: 56, toFov: 52 })]);
          },
        },
        {
          at: 5.9,
          fn: () => {
            this.caption('The Eraser’s crumbs drifted out to sea and grew into THE HUSH. It ate every sound in town.', true);
            this.ctx.audio.play('hush', { vol: 0.9, pitch: 0.7 });
            // from the headland over the sea: the Hush hangs in the fog, the dark lighthouse beside it
            cam.playCine([shot(V(8, 9, -30), hush0, 3.4, { toPos: V(10, 10.5, -36), fov: 44, toFov: 36 })]);
          },
        },
        {
          at: 9.4,
          fn: () => {
            this.caption('Without the foghorn, the bells and the lighthouse’s song, the ships can’t find their way home.', true);
            cam.playCine([shot(V(lh.x - 10, lh.y - 2, lh.z + 16), lh.clone(), 3.0, { toPos: V(lh.x - 7, lh.y - 0.5, lh.z + 12), fov: 50, toFov: 44 })]);
          },
        },
        {
          at: 12.5,
          fn: () => {
            // why the sticker cards are empty: WAI's stickers stayed home
            this.caption('Your stickers stayed behind, keeping Blind Plaza awake. Here you start empty-handed.', true);
            cam.playCine([shot(V(spawn.x + 1.6, 1.5, spawn.z - 2.6), spawn.clone().add(V(0, 0.9, 0)), 4.4, { toPos: V(spawn.x + 1.0, 1.35, spawn.z - 1.9), fov: 46, toFov: 40 })]);
          },
        },
        { at: 15.0, fn: () => this.caption('Find a MOUTH · learn to SHOUT · wake the 3 sound Guardians.', true) },
        { at: 16.9, fn: () => this.endIntro() },
      ],
      1.0,
      () => {},
    );
  }

  private endIntro(): void {
    const p = this.player;
    p.model.root.scale.setScalar(1);
    p.teleport(HARBOR.spawn.clone(), HARBOR.spawnYaw);
    p.frozen = false;
    this.locked = false;
    this.caption(null);
    this.anims = [];
    this.level.closeArrivalDoor();
    this.ctx.camera.stopCine();
    this.ctx.camera.yaw = HARBOR.spawnYaw;
    this.end();
    this.ctx.events.emit('intro:done');
  }

  // ───────────── 2. Guardians ─────────────
  /** The ferry's foghorn: the fog parts, the lost boats sail home. */
  ferryBeat(): void {
    const s = this.level.spots;
    const f = s.ferry;
    const pc = s.pontoon;
    // look at the horn wearing the Mouth (the quay side), not at spots.ferry: that point is inside the
    // deckhouse, so every sight line hit the ferry's own walls and the camera ended up inside the boat
    const horn = this.level.hosts.ferry.socketWorld('MOUTH').clone();
    this.ctx.camera.playCine([
      // from the quay: the ferry's horn bellows
      shot(V(f.x + 8, f.y + 4, f.z + 11), horn, 2.6, { toPos: V(f.x + 6, f.y + 3, f.z + 9), fov: 48, toFov: 42, handheld: 0.04 }),
      // over the west channel's mouth (from above the lagoon): the boats sail in out of the fog
      shot(V(pc.x + 2.5, 9, pc.z - 13), V(pc.x, 0, pc.z + 10), 3.8, { toPos: V(pc.x + 2, 7, pc.z - 9), toLook: V(pc.x, 0, pc.z + 2), fov: 54, toFov: 48 }),
    ]);
  }

  /** The bell rings: the clock's face wakes, then the Bell Bridge drops. */
  clockBeat(): void {
    const s = this.level.spots;
    const b = s.bell;
    this.ctx.camera.playCine([
      shot(V(b.x + 6, b.y - 6, b.z + 17), s.clockFace.clone().add(V(0, 1.8, 0)), 3.0, { toPos: V(b.x + 4, b.y - 5, b.z + 14), fov: 50, toFov: 42, handheld: 0.03 }),
      // from above the lagoon (open water: nothing between the camera and the bridge)
      shot(V(s.bridge.x + 3, s.bridge.y + 6, s.bridge.z + 15), s.bridge.clone(), 3.6, { toPos: V(s.bridge.x + 2, s.bridge.y + 4.5, s.bridge.z + 11), fov: 50, toFov: 44 }),
    ]);
  }

  /** The lighthouse sings — and the Hush rises out of the fog, furious. */
  lighthouseBeat(hush: HushBoss, onRisen: () => void): void {
    const s = this.level.spots;
    const l = s.lampOut;
    this.ctx.camera.playCine([
      shot(V(l.x + 9, l.y + 1, l.z + 11), l.clone().add(V(0, 0.6, 0)), 3.0, { toPos: V(l.x + 7, l.y + 2, l.z + 9), fov: 48, toFov: 40, handheld: 0.03 }),
      shot(V(HARBOR.arena.x - 2, HARBOR.arena.y + 4.5, HARBOR.arena.z + 9), hush.pos.clone().add(V(0, 3, 0)), 4.6, { toLook: HARBOR.hushOverHead.clone().add(V(0, 3, 0)), fov: 52, toFov: 46, handheld: 0.04 }),
    ]);
    this.later(3, () => {
      hush.idleSpot.copy(HARBOR.hushOverHead);
      this.ctx.audio.play('roar', { pitch: 1.5, vol: 0.9 });
      this.ctx.audio.play('hush', { vol: 1, pitch: 0.6 });
      this.flash('THE HUSH rises from the fog — it wants the quiet back!', 4200);
      onRisen();
    });
  }

  /** WAI steps onto the headland plaza: the fight begins. */
  bossIntro(hush: HushBoss): void {
    const b = hush.pos.clone().add(V(0, 3, 0));
    const p = this.player.pos;
    const side = new THREE.Vector3(-(b.z - p.z), 0, b.x - p.x).normalize();
    this.ctx.camera.playCine([shot(p.clone().add(V(0, 1.4, 0)).addScaledVector(side, 2).add(b.clone().sub(p).multiplyScalar(-0.15)), b, 1.5, { fov: 46, toFov: 38, handheld: 0.05 })]);
    this.ctx.audio.play('roar', { pos: hush.pos, pitch: 1.4, vol: 1 });
    this.ctx.camera.shake = 1;
    this.flash('THE HUSH', 2200);
  }

  /** Repainted: it shrinks into a little jelly lantern that floats up to keep the lighthouse company. */
  finale(hush: HushBoss, onDone: () => void): void {
    const b = hush.pos.clone().add(V(0, 2, 0));
    const lamp = this.level.spots.lampOut;
    this.ctx.camera.playCine([
      shot(b.clone().add(V(6, 2.5, 8)), b.clone(), 2.6, { toPos: b.clone().add(V(4.5, 2, 6)), fov: 44, toFov: 38 }),
      shot(V(lamp.x - 14, lamp.y + 2, lamp.z + 20), lamp.clone(), 3.2, { toPos: V(lamp.x - 18, lamp.y + 6, lamp.z + 30), fov: 52, toFov: 58 }),
    ]);
    this.caption('THE HUSH is repainted!', true);
    this.later(2.7, () => {
      this.caption('Mute Harbor can SING again. Listen — bells, gulls, the foghorn…', true);
      onDone();
    });
    this.later(6.2, () => this.caption('A paper boat sails in to the jetty below the plaza. Climb aboard!', true));
    this.later(10.5, () => this.caption(null));
  }

  update(dt: number): void {
    if (this.running) {
      this.t += dt;
      for (const b of this.beats)
        if (!b.done && this.t >= b.at) {
          b.done = true;
          b.fn();
        }
    }
    this.anims = this.anims.filter((a) => !a(dt));
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    this.pencil.update(dt);
  }

  /** Drop pending captions (the level is over). */
  hush(): void {
    this.timers = this.timers.filter(() => false);
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.caption(null);
  }

  dispose(): void {
    if (this.captionTimer) clearTimeout(this.captionTimer);
  }
}
