/**
 * [INPUT]: depends on GameContext (camera cines, audio, effects), PlayerController, StoryDirector (the kid's pencil);
 *          WORKS/FY from ./WorksLayout; BuiltHall (the tower door) from ./ConveyorHall; RedPenBoss (positions only)
 * [OUTPUT]: exports WorksStory (StoryLike: locked, skip, update; `arriving`; intro, liftBeat, rideShots, inspectorBeat, archivistBeat,
 *           bossIntro, phaseBeat, finale, flash, hush, dispose)
 * [POS]: Limp Works' story layer: the arrival through the tower door, a camera beat for each Guardian machine, the
 *        Red Pen's entrance, a caption at each of its phases, and the closing beat on the roof ("the city stays drawn
 *        wrong, and that is fine"). Captions are English source strings (src/i18n/zhWorks.ts has the Chinese).
 *        Twin of story/HarborStory. A full ending and the cutscene pass across all three levels come later.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PlayerController } from '../../player/PlayerController';
import type { CineShot } from '../../render/CameraController';
import { StoryDirector } from '../../story/StoryDirector';
import { t } from '../../i18n';
import type { RedPenBoss } from '../../enemy/RedPenBoss';
import type { BuiltHall } from './ConveyorHall';
import { FY, WORKS } from './WorksLayout';

type Beat = { at: number; fn: () => void; done?: boolean };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shot = (pos: THREE.Vector3, look: THREE.Vector3, dur: number, o: Partial<CineShot> = {}): CineShot => ({ pos, look, dur, fov: 50, toFov: 46, handheld: 0.02, ...o });

export class WorksStory {
  private beats: Beat[] = [];
  private t = 0;
  private running = false;
  private skipTo = -1;
  private anims: ((dt: number) => boolean)[] = [];
  readonly pencil: StoryDirector;
  onCaption: ((text: string | null, big?: boolean) => void) | null = null;
  locked = false;
  /** The arrival is playing (WorksSession holds the creatures still until WAI is handed over). */
  arriving = false;
  private captionTimer: ReturnType<typeof setTimeout> | null = null;
  private timers: { t: number; fn: () => void }[] = [];

  constructor(
    private ctx: GameContext,
    private player: PlayerController,
    private hall: BuiltHall,
  ) {
    this.pencil = new StoryDirector(ctx, player);
  }

  later(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  private caption(text: string | null, big = false): void {
    this.onCaption?.(text ? t(text) : null, big);
  }

  flash(text: string, ms = 3600, big = true): void {
    this.caption(text, big);
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => this.caption(null), ms);
  }

  private run(beats: Beat[], skippableAt: number): void {
    this.beats = beats;
    this.t = 0;
    this.running = true;
    this.skipTo = skippableAt;
  }

  skip(): void {
    if (!this.running || this.skipTo < 0 || this.t < this.skipTo) return;
    for (const b of this.beats)
      if (!b.done) {
        b.done = true;
        b.fn();
      }
  }

  pencilDraw(at: THREE.Vector3, dur = 1.6): void {
    this.pencil.pencilDraw(at, dur);
  }

  // ───────────── 1. arrival ─────────────
  /**
   * The paper boat bumped the tower. Seen from inside the hall: the door swings open on the landing outside (the boat,
   * the water, the sky), WAI steps off onto the landing and hops in through the doorway; the door shuts behind him.
   * The camera never leaves the hall (the title push-in ends on WAI's shoulder, 5 m inside the door).
   */
  intro(pen: RedPenBoss, mutant: THREE.Vector3): void {
    const cam = this.ctx.camera;
    const p = this.player;
    this.locked = true;
    this.arriving = true;
    p.frozen = true;
    const model = p.model.root;
    model.scale.setScalar(0.001);
    const spawn = WORKS.spawn;
    const door = WORKS.door.clone().setZ(WORKS.door.z - 0.3);
    const out = WORKS.doorOut;
    let doorT = 0;
    let doorDir = 0;
    let showT = -1;
    let hopT = -1;
    this.anims.push((dt) => {
      if (doorDir !== 0) {
        doorT = THREE.MathUtils.clamp(doorT + doorDir * dt * 1.2, 0, 1);
        this.hall.setDoor(doorT);
      }
      if (showT >= 0 && hopT < 0) {
        showT = Math.min(1, showT + dt / 0.25); // steps off the boat onto the landing, waits there
        model.scale.setScalar(Math.max(0.001, showT));
        p.teleport(out, Math.PI);
      }
      if (hopT >= 0 && hopT < 1) {
        hopT = Math.min(1, hopT + dt / 1.0); // two hops: over the threshold, then into the hall
        model.scale.setScalar(1);
        const pos = out.clone().lerp(spawn, hopT);
        pos.y += Math.abs(Math.sin(hopT * Math.PI * 2)) * 0.6;
        p.teleport(pos, Math.PI);
      }
      return !this.running && doorDir <= 0 && doorT <= 0;
    });
    const pen0 = pen.pos.clone().add(V(0, 3.4, 0));
    this.run(
      [
        {
          at: 0,
          fn: () => {
            this.caption('The paper boat bumps against the CORRECTION TOWER. Its door creaks open…', true);
            cam.playCine([shot(V(door.x + 3.2, 1.7, door.z - 7.9), door.clone().setY(2.0), 2.8, { toPos: V(door.x + 2.4, 1.5, door.z - 6.9), fov: 50, toFov: 44 })]);
          },
        },
        { at: 0.4, fn: () => (doorDir = 1) },
        { at: 0.9, fn: () => (showT = 0) },
        {
          at: 1.5,
          fn: () => {
            hopT = 0;
            this.ctx.audio.play('jump', { pitch: 1.2 });
          },
        },
        { at: 2.0, fn: () => this.ctx.audio.play('jump', { pitch: 1.35 }) },
        {
          at: 2.5,
          fn: () => {
            this.ctx.audio.play('land');
            this.ctx.effects.comic(spawn.clone().add(V(0, 1.8, 0)), t('WAI!'), '#ff3fa4', 0.8);
            doorDir = -1;
            this.ctx.audio.play('gateOpen', { pitch: 0.7, vol: 0.6 });
          },
        },
        {
          at: 3.0,
          fn: () => {
            this.caption('LIMP WORKS — the Red Pen’s factory of corrections. Everything here gets ruled straight.', true);
            // over WAI's shoulder: the Loading Dock, the belts, the CORRECTOR at the end of the line
            cam.playCine([shot(V(spawn.x - 2.6, 4.4, spawn.z + 1.4), V(2, 2, 2), 3.2, { toPos: V(spawn.x - 1.4, 5.6, spawn.z - 0.6), toLook: V(10, 2.4, -6), fov: 58, toFov: 54 })]);
          },
        },
        {
          at: 6.3,
          fn: () => {
            this.caption('Up on the roof, the RED PEN measures the drawn city against its answer key, line by line. It cannot see anything but the error.', true);
            this.ctx.audio.play('stampSlip', { vol: 0.7, pitch: 0.7 });
            cam.playCine([shot(V(pen0.x + 7, FY[3] + 3.2, pen0.z + 8), pen0, 3.2, { toPos: V(pen0.x + 5, FY[3] + 2.6, pen0.z + 6), fov: 46, toFov: 40 })]);
          },
        },
        {
          at: 9.6,
          fn: () => {
            this.caption('You brought your Eye and your Mouth. Your LEGS are here somewhere — that limping thing has them!', true);
            cam.playCine([shot(V(mutant.x + 5, 2.4, mutant.z - 4.5), mutant.clone().setY(1.4), 3.4, { toPos: V(mutant.x + 4, 2.0, mutant.z - 3.6), fov: 48, toFov: 42 })]);
          },
        },
        { at: 13.1, fn: () => this.caption('Get your LEGS back · wake the 3 Guardian machines · climb to the RED PEN.', true) },
        { at: 15.0, fn: () => this.endIntro() },
      ],
      1.0,
    );
  }

  private endIntro(): void {
    const p = this.player;
    p.model.root.scale.setScalar(1);
    p.teleport(WORKS.spawn.clone(), WORKS.spawnYaw);
    p.frozen = false;
    this.locked = false;
    this.arriving = false;
    this.running = false;
    this.beats = [];
    this.caption(null);
    this.hall.setDoor(0);
    this.ctx.camera.stopCine();
    this.ctx.camera.yaw = WORKS.spawnYaw;
    this.ctx.events.emit('intro:done');
  }

  // ───────────── 2. Guardians ─────────────
  /** The Freight Lift's legs unfold; its gate rattles open. */
  liftBeat(face: THREE.Vector3): void {
    this.ctx.camera.playCine([
      shot(V(face.x - 3.5, face.y + 1.0, face.z + 6.5), face.clone().add(V(0.6, -0.4, 0)), 3.2, { toPos: V(face.x - 2.6, face.y + 0.6, face.z + 5.0), fov: 50, toFov: 42, handheld: 0.03 }),
    ]);
  }

  /** The ride: from the Stamping Floor, the cage climbs up out of the shaft. */
  rideShots(): void {
    const c = WORKS.cage;
    this.ctx.camera.playCine([
      shot(V(c.x - 8.5, FY[1] + 2.4, c.z + 8.5), V(c.x, FY[1] - 1, c.z), 3.4, { toLook: V(c.x, FY[1] + 1.6, c.z), fov: 52, toFov: 48 }),
      shot(V(c.x - 7.5, FY[1] + 2.0, c.z + 7.5), V(c.x, FY[1] + 1.6, c.z), 3.8, { toPos: V(c.x - 6, FY[1] + 1.8, c.z + 6), fov: 48, toFov: 44 }),
    ]);
  }

  /** The Inspector looks: the pencil stair inks itself in, step by step. */
  inspectorBeat(from: THREE.Vector3, stairMid: THREE.Vector3): void {
    this.ctx.camera.playCine([
      shot(from.clone().add(V(3, 1.2, 5)), from.clone().add(V(0, 0.2, 0)), 2.2, { fov: 46, toFov: 42, handheld: 0.03 }),
      shot(V(stairMid.x + 9, stairMid.y + 2.5, stairMid.z + 7), stairMid.clone(), 3.8, { toPos: V(stairMid.x + 8, stairMid.y + 3.2, stairMid.z + 5), fov: 56, toFov: 52 }),
    ]);
  }

  /** The Archivist types, reads aloud — and the roof stair's grille rattles up. */
  archivistBeat(face: THREE.Vector3, grille: THREE.Vector3): void {
    this.ctx.camera.playCine([
      shot(face.clone().add(V(-6, 1.6, 3.2)), face.clone(), 3.0, { toPos: face.clone().add(V(-4.6, 1.2, 2.4)), fov: 48, toFov: 42, handheld: 0.03 }),
      shot(V(grille.x - 5.5, grille.y + 2.6, grille.z - 4.2), grille.clone().add(V(1.5, 1.4, 0)), 3.0, { fov: 54, toFov: 50 }),
    ]);
  }

  // ───────────── 3. the Red Pen ─────────────
  /** Through the ink gate: from WAI's heels up the whole 14 m Pen, a wide shot of the two of them, its eyes. */
  bossIntro(pen: RedPenBoss): void {
    const p = this.player.pos;
    const pv = pen.penBody.pose.pivot.clone().setY(FY[3]);
    const to = pv.clone().sub(p).setY(0).normalize();
    const side = new THREE.Vector3(-to.z, 0, to.x);
    const mid = pen.penBody.pose.point(7, 0);
    const eyes = pen.penBody.weakPos('eyes');
    this.ctx.camera.playCine([
      shot(p.clone().addScaledVector(to, -2.6).addScaledVector(side, 0.9).setY(p.y + 0.5), mid.clone().setY(mid.y - 1), 1.7, { toLook: mid.clone().setY(mid.y + 4), fov: 64, toFov: 58, handheld: 0.04 }),
      shot(pv.clone().addScaledVector(side, 21).addScaledVector(to, -9).setY(FY[3] + 3.5), pv.clone().lerp(p, 0.4).setY(FY[3] + 6), 1.8, { toPos: pv.clone().addScaledVector(side, 19).addScaledVector(to, -8).setY(FY[3] + 4.2), fov: 52, toFov: 50 }),
      shot(eyes.clone().addScaledVector(to, -7.5).setY(eyes.y + 0.6), eyes.clone(), 1.2, { fov: 44, toFov: 40, handheld: 0.05 }),
    ]);
    this.ctx.audio.play('roar', { pos: pen.pos, pitch: 1.2, vol: 1 });
    this.ctx.camera.shake = 0.6;
  }

  /** A caption at each act (2: Legs crossed out + the Hush, 3: Mouth + itself + the Eraser, 4: nib-first). */
  phaseBeat(n: number, pen: RedPenBoss): void {
    if (n === 2) {
      this.flash('It CROSSED OUT your LEGS! …but THE HUSH has come back to help you.', 4600);
      // from behind WAI toward the Hush flying in over the parapet
      const h = pen.hush.pos;
      const p = this.player.pos;
      const d = h.clone().sub(p).setY(0).normalize();
      this.ctx.camera.playCine([shot(p.clone().addScaledVector(d, -4).setY(p.y + 2.4), h.clone(), 2.2, { toLook: pen.arena.clone().setY(FY[3] + 3), fov: 58, toFov: 52 })], { gameplay: true });
    } else if (n === 3) {
      this.flash('It crossed out your MOUTH — and then ITSELF! THE ERASER bursts in…', 4600);
    } else if (n === 4) this.flash('It wobbles, nib-first in the roof — TAG IT and lend it your paint! (E)', 3600);
  }

  /** Won over: the last TAG lent the Pen paint; it draws its first wobbly line. Then the closing beat over the city. */
  finale(pen: RedPenBoss, onDone: () => void): void {
    const a = WORKS.arena;
    this.locked = true;
    // high over the ring's south side, looking across it: the Pen's first wobbly loop fits in the frame
    this.ctx.camera.playCine([
      shot(V(a.x + 2, FY[3] + 13, a.z + 19), V(a.x, FY[3] + 3, a.z - 1), 4.2, { toPos: V(a.x + 1, FY[3] + 11, a.z + 17), fov: 66, toFov: 62 }),
      // the closing beat: from the parapet, out over the crooked city
      shot(V(a.x + 2, FY[3] + 2.4, a.z + 12), V(a.x - 10, FY[3] - 6, a.z + 60), 5.6, { toPos: V(a.x + 1, FY[3] + 3.4, a.z + 16), toLook: V(a.x - 16, FY[3] - 4, a.z + 90), fov: 58, toFov: 62 }),
    ]);
    this.caption('Your last TAG lends the Red Pen some paint…', true);
    this.later(2.6, () => this.caption('…and for the first time, it DRAWS instead of correcting. A wobbly line. It leaves it wobbly.', true));
    void pen;
    this.later(5.4, () => this.caption('The city stays drawn wrong.', true));
    this.later(7.4, () => this.caption('And that is fine.', true));
    this.later(9.2, () => {
      this.caption(null);
      this.locked = false;
      onDone();
    });
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
    this.timers = [];
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.caption(null);
  }

  dispose(): void {
    if (this.captionTimer) clearTimeout(this.captionTimer);
  }
}
