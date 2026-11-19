/**
 * [INPUT]: depends on three; PlaySession / LevelId from ../level/Session; LEVEL (the tower door box) from ../level/BlindPlaza;
 *          HarborSession (its paper boat: level.exitBoat) from ../level/HarborSession; CineShot from ../render/CameraController;
 *          HoldToSkip from ./StoryBook; Celebration from ./Celebration; t from ../i18n
 * [OUTPUT]: exports LevelOutro (play → resolves when the result card may show; step, pose, stop, running)
 * [POS]: the in-engine end of every level, between the level's last story beat and the result card. First the
 *        CELEBRATION (WAI's victory hop, the partner joins), then the DEPARTURE: level 1, WAI hops into the tower door;
 *        level 2, the paper boat glides out of the harbour mouth toward the tower on the horizon with WAI aboard;
 *        level 3, the celebration only, the drawn skyline eased to full colour (the END book follows, StoryFlow). WAI moves by teleport each fixed step, so
 *        his capsule, cape and clips follow; the camera plays one continuous story cine (the HUD hides, WAI is frozen).
 *        SKIP (HoldToSkip; the cursor is freed at the start so the button is clickable) runs finish(): the same exit as
 *        the last beat. Nothing persists: a reload mid-outro drops it (the level is not yet recorded as finished).
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import * as THREE from 'three';
import type { LevelId, PlaySession } from '../level/Session';
import type { CineShot } from '../render/CameraController';
import { LEVEL } from '../level/BlindPlaza';
import { t } from '../i18n';
import { HoldToSkip } from './StoryBook';
import { Celebration } from './Celebration';

type Beat = { at: number; fn: () => void; done?: boolean };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const shot = (pos: THREE.Vector3, look: THREE.Vector3, dur: number, o: Partial<CineShot> = {}): CineShot => ({ pos, look, dur, fov: 48, toFov: 44, handheld: 0.02, ...o });
/** Facing yaw that turns WAI from `from` toward `to` (the model's forward is +z at yaw 0). */
const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

/** What a harbour session exposes for the departure (MuteHarbor's built level). */
type HarborLike = PlaySession & { level: { exitBoat?: THREE.Object3D } };

export class LevelOutro {
  running = false;
  private t = 0;
  private beats: Beat[] = [];
  private resolve: (() => void) | null = null;
  private skipper: HoldToSkip | null = null;
  private movers: ((dt: number) => boolean)[] = [];
  private cel: Celebration;
  private props: THREE.Object3D[] = [];

  constructor(
    private s: PlaySession,
    private level: LevelId,
    private root: HTMLElement,
  ) {
    this.cel = new Celebration(s);
  }

  private caption(text: string | null): void {
    this.s.events.emit('story:caption', { text: text ? t(text) : null, big: true } as never);
  }

  play(): Promise<void> {
    this.running = true;
    this.t = 0;
    // the level is complete and the result card follows: free the cursor now, so the SKIP button can be clicked
    if (document.pointerLockElement) document.exitPointerLock();
    this.skipper = new HoldToSkip(this.root);
    this.skipper.el.classList.add('in-game');
    this.skipper.onSkip = () => this.finish();
    if (this.level === 'plaza') this.plaza();
    else if (this.level === 'harbor') this.harbor();
    else this.works();
    return new Promise((r) => (this.resolve = r));
  }

  // ───────────── the celebration (every level) ─────────────
  /** Frame WAI from the front (camera on `camSide` of him), hop + spin + can raised + spray flourish. */
  private celebrate(at: number, camFrom: THREE.Vector3, o: { dist?: number; height?: number; hold?: number } = {}): number {
    const p = this.s.player;
    const base = p.pos.clone();
    const face = yawTo(base, camFrom);
    const dir = camFrom.clone().sub(base).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const dist = o.dist ?? 3.6;
    const cam = base.clone().addScaledVector(dir, dist).addScaledVector(side, 0.9).setY(base.y + (o.height ?? 1.25));
    const look = base.clone().setY(base.y + 1.05);
    this.beats.push({
      at,
      fn: () => {
        this.s.ctx.camera.playCine([shot(cam, look, o.hold ?? 3.2, { toPos: cam.clone().addScaledVector(dir, -0.5).setY(cam.y + 0.25), fov: 46, toFov: 42 })]);
        this.cel.start(base, face);
      },
    });
    return at + this.cel.duration;
  }

  // ───────────── level 1: into the tower door ─────────────
  private plaza(): void {
    const p = this.s.player;
    const box = LEVEL.completeTrigger;
    const door = box.getCenter(new THREE.Vector3());
    const floorY = p.pos.y;
    // the camera stands south of the door (the summit side) for the cheer
    const south = V(door.x + 0.6, floorY, door.z + 8);
    const t1 = this.celebrate(0, south);
    const inside = V(door.x, floorY, box.min.z - 0.6);
    this.beats.push(
      {
        at: t1,
        fn: () => {
          this.caption('Behind the door, something smells of salt…');
          const from = p.pos.clone();
          // over his shoulder: the arch frames him as he hops away into it
          this.s.ctx.camera.playCine([shot(V(door.x + 1.4, floorY + 1.9, from.z + 4.2), V(door.x, floorY + 1.3, inside.z - 2), 5.2, { toPos: V(door.x + 1.0, floorY + 1.7, from.z + 3.2), fov: 50, toFov: 46 })]);
          // two hops into the dark doorway, shrinking a little as the door swallows him
          let k = 0;
          const yaw = yawTo(from, inside);
          this.movers.push((dt) => {
            k = Math.min(1, k + dt / 2.2);
            const hop = Math.abs(Math.sin(k * Math.PI * 2)) * 0.55;
            const pos = from.clone().lerp(inside, THREE.MathUtils.smoothstep(k, 0, 1));
            pos.y = floorY + hop;
            p.teleport(pos, yaw);
            if (k > 0.75) p.model.root.scale.setScalar(Math.max(0.001, 1 - (k - 0.75) * 4));
            if (k >= 1) {
              // through the arch: a pop of the four colours where the next piece of canvas begins
              const at = inside.clone().setY(floorY + 0.8);
              for (const c of ['#ff4fa3', '#ffd23a', '#22c4c0', '#2a4be0']) this.s.ctx.effects.burst(at, c, 8, 3.5, 0.07);
              this.s.ctx.effects.ring(at, '#fff6e6', 1.6, V(0, 0, 1));
              this.s.ctx.audio.play('stickerBurst', { vol: 0.6, pitch: 1.3 });
            }
            return k >= 1;
          });
          this.s.ctx.audio.play('jump', { pitch: 1.2 });
          this.later(1.1, () => this.s.ctx.audio.play('jump', { pitch: 1.3 }));
        },
      },
      { at: t1 + 2.6, fn: () => this.s.ctx.audio.play('gateOpen', { pitch: 0.8, vol: 0.6 }) },
      { at: t1 + 4.0, fn: () => this.finish() },
    );
  }

  // ───────────── level 2: the paper boat glides away ─────────────
  private harbor(): void {
    const p = this.s.player;
    const boat = (this.s as HarborLike).level.exitBoat;
    if (!boat) {
      this.beats.push({ at: this.celebrate(0, p.pos.clone().add(V(4, 0, 4))) + 0.2, fn: () => this.finish() });
      return;
    }
    const b0 = boat.position.clone();
    const deck = p.pos.clone();
    // WAI's offset from the boat's origin, in the boat's frame (he rides where he stands)
    const local = deck.clone().sub(b0).applyAxisAngle(V(0, 1, 0), -boat.rotation.y);
    // out of the harbour mouth (north-east), the way the channel runs
    const dir = V(40, 0, -54).normalize();
    const side = V(-dir.z, 0, dir.x);
    const rot0 = boat.rotation.y;
    const rot1 = Math.atan2(-dir.z, dir.x);
    // the tower on the horizon (drawing only, removed after the outro)
    const tower = makeHorizonTower();
    tower.position.copy(b0).addScaledVector(dir, 240).setY(b0.y - 20);
    this.s.ctx.root.add(tower);
    this.props.push(tower);
    // cheer on deck: the camera looks along the boat's long axis (the sail stands edge-on, never between)
    const bow = V(Math.cos(rot0), 0, -Math.sin(rot0));
    const bowSide = bow.dot(deck.clone().sub(b0)) >= 0 ? 1 : -1;
    const t1 = this.celebrate(0, deck.clone().addScaledVector(bow, 5 * bowSide), { height: 1.7 });
    let sail = -1;
    let dist = 0;
    this.movers.push((dt) => {
      if (sail < 0) return false;
      sail += dt;
      // eases away from the jetty, then glides
      const v = Math.min(9, 0.4 + sail * 1.6);
      dist += v * dt;
      const turn = THREE.MathUtils.smoothstep(sail, 0, 3);
      boat.rotation.y = rot0 + (rot1 - rot0) * turn;
      boat.position.copy(b0).addScaledVector(dir, dist);
      boat.position.y = b0.y + Math.sin(sail * 1.4) * 0.08;
      boat.rotation.z = Math.sin(sail * 1.1) * 0.03;
      const feet = local.clone().applyAxisAngle(V(0, 1, 0), boat.rotation.y).add(boat.position);
      feet.y = deck.y + (boat.position.y - b0.y);
      p.teleport(feet, rot1 + Math.PI / 2 + 0.6);
      return false;
    });
    const head = V(b0.x, b0.y, b0.z).addScaledVector(dir, -2);
    this.beats.push(
      {
        at: t1,
        fn: () => {
          sail = 0;
          this.caption('The whole harbour sings them off.');
          this.s.ctx.audio.play('foghorn', { vol: 0.8, pitch: 1.1 });
          this.later(0.9, () => this.s.ctx.audio.play('bigBell', { vol: 0.6 }));
          this.later(1.8, () => this.s.ctx.audio.play('gull', { vol: 0.7 }));
          // from the jetty: the boat pulls away; then high on the headland, the long glide to the horizon
          // from behind, over the stern: the boat pulls away; then high behind it, the long glide toward the tower
          const y0 = deck.y;
          this.s.ctx.camera.playCine([
            shot(head.clone().addScaledVector(dir, -3).addScaledVector(side, 2.4).setY(y0 + 2.2), b0.clone().addScaledVector(dir, 8).setY(y0 + 1.2), 3.0, { toLook: b0.clone().addScaledVector(dir, 14).setY(y0 + 1.2), fov: 52, toFov: 48 }),
            shot(b0.clone().addScaledVector(dir, -12).addScaledVector(side, 3).setY(y0 + 7), b0.clone().addScaledVector(dir, 40).setY(y0 + 2), 6.8, { toLook: b0.clone().addScaledVector(dir, 90).setY(y0 + 8), fov: 46, toFov: 34, handheld: 0.01 }),
          ]);
        },
      },
      { at: t1 + 4.8, fn: () => this.caption('Next stop: the Red Pen’s tower.') },
      { at: t1 + 9.6, fn: () => this.finish() },
    );
  }

  // ───────────── level 3: a cheer beside the Red Pen (the END follows) ─────────────
  private works(): void {
    const p = this.s.player;
    const boss = this.s.boss;
    // the drawn city around the tower comes back at full colour (art's DrawnSkyline, if the level has one)
    const sky = this.s.ctx.scene.getObjectByName('works-skyline')?.userData.skyline as { setColour(k: number): void } | undefined;
    sky?.setColour(1);
    // the camera on the far side of WAI from the Pen: the cheer with the drawing Pen behind him
    const away = p.pos.clone().sub(boss.pos).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();
    // the shot holds on (hold) while the END book fades in over it: no gameplay HUD flashes between them
    const t1 = this.celebrate(0, p.pos.clone().addScaledVector(away, 5), { dist: 4.4, height: 1.6, hold: 40 });
    this.beats.push({ at: t1 + 0.3, fn: () => this.finish() });
  }

  private later(sec: number, fn: () => void): void {
    this.beats.push({ at: this.t + sec, fn });
  }

  /** Fixed step: beats, movers (teleports), the celebration. */
  step(dt: number): void {
    if (!this.running) return;
    this.t += dt;
    for (const b of this.beats)
      if (!b.done && this.t >= b.at) {
        b.done = true;
        b.fn();
        if (!this.running) return;
      }
    this.movers = this.movers.filter((m) => !m(dt));
    this.cel.step(dt);
  }

  /** After the session's render: the celebration's bone pose. */
  pose(): void {
    if (this.running) this.cel.pose();
  }

  private finish(): void {
    if (!this.running) return;
    this.running = false;
    this.cel.stop();
    this.skipper?.dispose();
    this.skipper = null;
    this.caption(null);
    this.s.player.model.root.scale.setScalar(1);
    for (const pr of this.props) pr.parent?.remove(pr);
    this.props = [];
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  /** The session is going away: drop everything without resolving into a result card. */
  stop(): void {
    this.resolve = null;
    this.finish();
  }
}

/** A far silhouette of the Correction Tower: a dusky shaft with a red nib, seen over the sea. */
function makeHorizonTower(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#5a4a86', fog: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 90, 10), mat);
  shaft.position.y = 45;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 4, 12), mat);
  ring.position.y = 62;
  const nib = new THREE.Mesh(new THREE.ConeGeometry(11, 30, 10), new THREE.MeshBasicMaterial({ color: '#c8323a', fog: true }));
  nib.position.y = 105;
  g.add(shaft, ring, nib);
  g.traverse((o) => (o.userData.noPaint = true));
  return g;
}
