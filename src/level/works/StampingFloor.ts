/**
 * [INPUT]: depends on FloorBuild/floorShell/finishFloor/dropTrail/floorCrown/region/holeRailing/WorksLists from ./WorksShell;
 *          crate/railing/screen/sign/stairs/stairRamp/girder/pipe from ./WorksKit; block/tube/StaticBatch from ../harbor/HarborKit;
 *          WORKS/FY/IN/stairStep from ./WorksLayout; Straightenable from enemy/RulerSnake; UndrawnSolid (via addUndrawn);
 *          PlayBody from player/PlayBody (the presses stamp every body in the lane: WAI and the co-op partner)
 * [OUTPUT]: exports buildStampingFloor() → BuiltStamping (pit + crooked platforms, the STAMP RUN, the pencil stair,
 *           the QC barrier, the gangway, inPit(), update) and the CrookedPlatform class
 * [POS]: F2 of Limp Works. The lift arrives in the NE corner; the shredder pit splits the floor and is crossed on
 *        hanging crooked platforms that Ruler Snakes straighten (they fall); the Inspector's yard and the pencil
 *        stair to F3 are west, shut by the QC barrier (an arm + a wire shutter to the ceiling; both lift when the Inspector looks).
 *        drawStair() makes the pencil stair permanent and lays its nosing ramp. The STAMP RUN (the level's optional challenge) runs along the east wall.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../core/Context';
import type { RAPIER } from '../../core/PhysicsWorld';
import type { UndrawnSolid } from '../../hosts/Undrawn';
import type { PlayerController } from '../../player/PlayerController';
import type { PlayBody } from '../../player/PlayBody';
import type { Straightenable } from '../../enemy/RulerSnake';
import { t } from '../../i18n';
import { Checkpoint, type Crown } from '../Collectibles';
import { StaticBatch, block, tube } from '../harbor/HarborKit';
import { crate, girder, pipe, railing, screen, sign, stairRamp, stairs, type WorksMats } from './WorksKit';
import { FY, IN, WORKS, inRect, stairStep } from './WorksLayout';
import { dropTrail, floorCrown, floorShell, holeRailing, newFloor, region, type FloorBuild, type WorksLists } from './WorksShell';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ───────────── a hanging crooked platform (a Ruler Snake's target) ─────────────
export class CrookedPlatform implements Straightenable {
  readonly anchor: THREE.Vector3;
  readonly center: THREE.Vector3;
  readonly group = new THREE.Group();
  private deck = new THREE.Group();
  private chains: THREE.Mesh;
  private ticks: THREE.Mesh;
  private col: RAPIER.Collider | null = null;
  private state: 'crooked' | 'measure' | 'snap' | 'fall' | 'gone' | 'rise' = 'crooked';
  private t = 0;
  private tilt: THREE.Euler;
  private q = new THREE.Quaternion();
  /** A crown rides on this one (shown/hidden with it). */
  crown: Crown | null = null;

  constructor(
    private ctx: GameContext,
    c: THREE.Vector3,
    anchor: THREE.Vector3,
    private half: number,
    mats: WorksMats,
    seed: number,
  ) {
    this.center = c.clone();
    this.anchor = anchor.clone();
    this.tilt = new THREE.Euler(Math.sin(seed * 1.7) * 0.07, seed * 0.3, Math.cos(seed * 2.3) * 0.08);
    const B = new StaticBatch();
    B.add(block(half * 2, 0.24, half * 2, 0.05, seed, 1.2).translate(0, -0.12, 0), mats.wood, 0.04);
    for (const s of [-1, 1]) {
      B.add(new THREE.BoxGeometry(half * 2 + 0.1, 0.18, 0.16).translate(0, -0.3, s * (half - 0.1)), mats.steelDark, 0.02);
      B.add(new THREE.BoxGeometry(0.16, 0.18, half * 2).translate(s * (half - 0.1), -0.3, 0), mats.steelDark, 0.02);
    }
    // a pencil-drawn bend: a crooked brace under the deck
    B.add(tube([V(-half + 0.2, -0.36, -half + 0.3), V(0.2, -0.75, 0.1), V(half - 0.2, -0.36, half - 0.3)], 0.06, 10, 6), mats.red, 0.02);
    for (const m of B.flush(this.deck, 'works-platform')) m.castShadow = true;
    this.group.add(this.deck);
    // four chains to the ceiling (one merged tube mesh)
    const top = FY[2] - 0.6 - c.y;
    const cg: THREE.BufferGeometry[] = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cg.push(new THREE.CylinderGeometry(0.035, 0.035, top, 5).translate(x * (half - 0.25), top / 2, z * (half - 0.25)));
    this.chains = new THREE.Mesh(mergeGeometries(cg)!, mats.steelDark);
    this.group.add(this.chains);
    // red ruler ticks across the deck while it is being measured
    const tickTex = ctx.assets.tex('w3_ruler');
    this.ticks = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tickTex, color: '#ff5060', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.ticks.position.y = 0.02;
    this.ticks.userData.noPaint = true;
    this.deck.add(this.ticks);
    this.group.position.copy(c);
    this.applyTilt(1);
    this.addCollider();
  }

  get crooked(): boolean {
    return this.state === 'crooked';
  }
  get present(): boolean {
    return this.state === 'crooked' || this.state === 'measure' || this.state === 'snap';
  }

  private applyTilt(k: number): void {
    this.deck.rotation.set(this.tilt.x * k, this.tilt.y, this.tilt.z * k);
  }

  private addCollider(): void {
    this.q.setFromEuler(this.deck.rotation);
    this.col = this.ctx.physics.addStaticBox(this.center.clone().setY(this.center.y - 0.12), new THREE.Vector3(this.half, 0.12, this.half), this.q.clone());
  }

  private dropCollider(): void {
    if (!this.col) return;
    this.ctx.physics.untag(this.col);
    this.ctx.physics.world.removeCollider(this.col, false);
    this.col = null;
  }

  beginMeasure(_sec: number): void {
    if (this.state !== 'crooked') return;
    this.state = 'measure';
    this.t = 0;
  }
  cancelMeasure(): void {
    if (this.state === 'measure') this.state = 'crooked';
  }
  straighten(): void {
    if (this.state !== 'measure' && this.state !== 'crooked') return;
    this.state = 'snap';
    this.t = 0;
    this.ctx.audio.play('stampSlip', { pos: this.center, pitch: 0.7 });
    this.ctx.effects.comic(this.center.clone().setY(this.center.y + 1.2), t('STRAIGHT!'), '#d8283a', 0.7);
  }

  /** Is WAI standing on it? */
  holds(p: THREE.Vector3): boolean {
    return this.present && Math.abs(p.x - this.center.x) < this.half + 0.2 && Math.abs(p.z - this.center.z) < this.half + 0.2 && p.y > this.center.y - 0.6 && p.y < this.center.y + 2.5;
  }

  update(dt: number, player: PlayerController): void {
    this.t += dt;
    const tm = this.ticks.material as THREE.MeshBasicMaterial;
    tm.opacity = this.state === 'measure' ? 0.55 + Math.sin(this.t * 14) * 0.3 : Math.max(0, tm.opacity - dt * 3);
    this.ticks.visible = tm.opacity > 0.01;
    if (this.crown) this.crown.hidden = !this.present;
    switch (this.state) {
      case 'measure':
        // it shivers as it is being measured
        this.deck.position.x = Math.sin(this.t * 40) * 0.015;
        break;
      case 'snap': {
        const k = Math.max(0, 1 - this.t / 0.25);
        this.applyTilt(k);
        if (this.t > 0.32) {
          this.state = 'fall';
          this.t = 0;
          this.dropCollider();
          this.chains.visible = false;
          this.ctx.audio.play('crash', { pos: this.center, vol: 0.7, pitch: 1.3 });
        }
        break;
      }
      case 'fall':
        this.group.position.y = this.center.y - 6 * this.t * this.t;
        if (this.t > 1.0) {
          this.state = 'gone';
          this.t = 0;
          this.group.visible = false;
        }
        break;
      case 'gone':
        if (this.t > 5.5) {
          this.state = 'rise';
          this.t = 0;
          this.group.visible = true;
          this.applyTilt(1);
        }
        break;
      case 'rise': {
        const k = Math.min(1, this.t / 1.4);
        this.group.position.y = this.center.y - 4 * (1 - k) * (1 - k);
        // back in place (and never inside WAI)
        if (k >= 1 && !this.holds(player.pos)) {
          this.state = 'crooked';
          this.chains.visible = true;
          this.group.position.y = this.center.y;
          this.addCollider();
          this.ctx.audio.play('reveal', { pos: this.center, vol: 0.5 });
        }
        break;
      }
    }
  }

  /** Dev / cleanup: back in place, crooked. */
  reset(): void {
    this.state = 'crooked';
    this.group.visible = true;
    this.chains.visible = true;
    this.group.position.copy(this.center);
    this.applyTilt(1);
    if (!this.col) this.addCollider();
  }
}

// ───────────── the floor ─────────────
export interface BuiltStamping {
  f: FloorBuild;
  platforms: CrookedPlatform[];
  stairSteps: UndrawnSolid[];
  /** WAI fell into the shredder pit (below the rim, inside it). */
  inPit(p: THREE.Vector3): boolean;
  readonly stairReal: boolean;
  /** The Inspector looked: the stair is drawn for good, the QC barrier lifts, the gangway drops. */
  drawStair(instant?: boolean): void;
  /** The STAMP RUN's state for the director / bots. */
  run: { active: boolean; won: boolean; t: number; startPad: THREE.Vector3; endPad: THREE.Vector3; crown: Crown };
  checkpointAt: THREE.Vector3;
  /** `partners`: other bodies the presses stamp the same way (the STAMP RUN stays WAI's). */
  update(dt: number, time: number, player: PlayerController, toast: (text: string, kind?: 'info' | 'warn' | 'good', params?: Record<string, string | number>) => void, partners?: readonly PlayBody[]): void;
}

const RUN = { period: 1.6, down: 0.38, limit: 9 };

export function buildStampingFloor(ctx: GameContext, L: WorksLists, addUndrawn: (id: string, c: THREE.Vector3, h: THREE.Vector3) => UndrawnSolid): BuiltStamping {
  const f = newFloor(ctx, 1);
  const { B, mats, phys } = f;
  const y = FY[1];
  const W = WORKS;
  floorShell(f, {
    holes: [W.shaft, W.pit],
    ceilHoles: [W.hole2],
    noWindows: [{ x0: 13, x1: 24, z0: -24, z1: -13 }],
    lamps: [[-15, -6], [-15, 12], [13, -5], [12, 9], [-14, -18], [12.5, 16]],
  });

  // ───────────── the shredder pit ─────────────
  const pit = W.pit;
  const pb = W.pitBottom;
  for (const s of [-1, 1]) {
    const x = s * (pit.x1 + 0.15);
    B.add(block(0.3, y - pb, IN * 2, 0.0, 60 + s, 2).translate(x, (y + pb) / 2 - 0.3, 0), mats.steelDark, 0);
    B.add(new THREE.BoxGeometry(0.34, 0.12, IN * 2).translate(x - s * 0.04, y - 0.06, 0), mats.hazard, 0);
    phys.addStaticBox(V(x, (y + pb) / 2, 0), V(0.15, (y - pb) / 2, IN));
  }
  // the shredder: rows of toothed rollers (spinning) on the pit floor — instanced, two draw calls
  const rollerX: number[] = [];
  for (let x = pit.x0 + 1.1; x < pit.x1; x += 1.6) rollerX.push(x);
  const teeth: THREE.BufferGeometry[] = [];
  for (let z = -IN + 0.6; z < IN; z += 1.2) for (let a = 0; a < 6; a++) teeth.push(new THREE.BoxGeometry(0.16, 0.3, 0.12).translate(0, 0.62, 0).rotateZ((a / 6) * Math.PI * 2).translate(0, 0, z));
  const rollers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, IN * 2, 14).rotateX(Math.PI / 2), mats.steel, rollerX.length);
  const rollerTeeth = new THREE.InstancedMesh(mergeGeometries(teeth.map((g) => g.toNonIndexed()))!, mats.steelDark, rollerX.length);
  for (const im of [rollers, rollerTeeth]) {
    im.userData.noPaint = true;
    im.frustumCulled = false;
    f.group.add(im);
  }
  phys.addStaticBox(V(0, pb - 0.1, 0), V(pit.x1, 0.3, IN));
  for (const z of [-20, 20]) {
    const s1 = sign('SHREDDER', 2.6, 0.6, '#d8283a', '#ffffff');
    s1.position.set(pit.x1 + 0.32, y - 1.4, z * 0.5);
    s1.rotation.y = -Math.PI / 2;
    f.group.add(s1);
  }

  // hanging crooked platforms
  const platforms: CrookedPlatform[] = [];
  W.platforms.forEach((pd, i) => {
    const cp = new CrookedPlatform(ctx, pd.c, pd.anchor, pd.half, mats, i + 3);
    f.group.add(cp.group);
    platforms.push(cp);
    if (pd.crown) cp.crown = floorCrown(f, L, 'crown-w3-platform', pd.c.clone().setY(pd.c.y + 1.3), 'On the crooked platform hanging over the north end of the pit');
  });
  // the rim posts the snakes measure from (a ruler post with a red cap)
  for (const pd of W.platforms) {
    const a = pd.anchor;
    B.add(new THREE.BoxGeometry(0.24, 1.6, 0.06).translate(a.x + Math.sign(a.x) * 0.3, y + 0.8, a.z), mats.ruler, 0.02);
  }

  // ───────────── the gangway (Inspector's shortcut back east) ─────────────
  const gang = new THREE.Group();
  {
    const gB = new StaticBatch();
    gB.add(block(pit.x1 * 2 + 0.6, 0.2, 2.2, 0.01, 71, 1.5).translate(0, -0.1, 0), mats.steel, 0.03);
    for (const s of [-1, 1]) gB.add(tube([V(-pit.x1, 1.05, s * 1.05), V(pit.x1, 1.05, s * 1.05)], 0.05, 2, 8), mats.red, 0.02);
    for (const m of gB.flush(gang, 'works-gangway')) m.castShadow = true;
    // hinged at the west rim, raised upright until the Inspector wakes
    gang.position.set(pit.x0, y, W.gangwayZ);
    for (const c of [...gang.children]) c.position.x += pit.x1;
    gang.rotation.z = Math.PI / 2 - 0.02;
    gang.userData.noPaint = true;
    f.group.add(gang);
  }
  let gangT = -1;
  const gangCols: RAPIER.Collider[] = [];

  // ───────────── the STAMP RUN (east wall lane) ─────────────
  const lane = W.stampRun;
  const presses: { z: number; phase: number }[] = [];
  for (let i = 0; i < 6; i++) presses.push({ z: lane.z0 + 2.4 + i * 4.3, phase: i * 0.27 });
  const lx = (lane.x0 + lane.x1) / 2;
  for (const p of presses) {
    for (const x of [lane.x0 + 0.3, lane.x1 - 0.3]) {
      girder(B, V(x, y, p.z), V(x, y + 5, p.z), 0.36, 0.3, mats.steelDark);
      phys.addStaticBox(V(x, y + 2.5, p.z), V(0.2, 2.5, 0.2));
    }
    girder(B, V(lane.x0 + 0.1, y + 5, p.z), V(lane.x1 - 0.1, y + 5, p.z), 0.5, 0.36, mats.steelDark);
    f.marks.add(0, V(lx, y + 0.005, p.z), V(0, 1, 0), 2.2, Math.PI / 2);
  }
  const ramG = new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16);
  const faceG = new THREE.BoxGeometry(2.4, 0.3, 2.4);
  const rams = new THREE.InstancedMesh(ramG, mats.steel, presses.length);
  const faces = new THREE.InstancedMesh(faceG, mats.red, presses.length);
  for (const im of [rams, faces]) {
    im.castShadow = true;
    im.frustumCulled = false;
    im.userData.noPaint = true;
    f.group.add(im);
  }
  railing(B, phys, V(lane.x0 - 0.1, y, lane.z0 + 1.2), V(lane.x0 - 0.1, y, lane.z1 - 1.2), mats);
  const sRun = sign('STAMP RUN', 2.8, 0.6, '#ffd23a');
  sRun.position.set(lx, y + 6.2, lane.z0 - 0.2);
  sRun.rotation.y = Math.PI;
  f.group.add(sRun);
  const padMat = new THREE.MeshBasicMaterial({ color: '#22c4c0', transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  for (const at of [W.stampRunStart, W.stampRunEnd]) {
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 28).rotateX(-Math.PI / 2), padMat);
    pad.position.copy(at).setY(y + 0.03);
    pad.userData.noPaint = true;
    f.group.add(pad);
  }
  const runCrown = floorCrown(f, L, 'crown-w3-stamprun', W.stampRunEnd.clone().setY(y + 1.3), 'Win the STAMP RUN: sprint the press lane in time without being stamped');
  runCrown.hidden = true;
  const run = { active: false, won: false, t: 0, startPad: W.stampRunStart, endPad: W.stampRunEnd, crown: runCrown };

  // ───────────── the pencil stair (undrawn until the Inspector looks) + the QC barrier ─────────────
  const st = W.stair2;
  const steps: UndrawnSolid[] = [];
  for (let k = 0; k < st.n; k++) {
    const p = stairStep(st, k);
    const u = addUndrawn(`w3-stair-${k}`, p.clone().setY(p.y - 0.25), V(st.hw, 0.25, 0.5));
    f.group.attach(u.root);
    steps.push(u);
  }
  const realStair = new THREE.Group();
  {
    const sB = new StaticBatch();
    stairs(sB, null, st, mats, 0, 12);
    for (let k = 2; k < 12; k++) {
      const a = stairStep(st, k), b = stairStep(st, k + 1);
      sB.add(tube([a.clone().add(V(st.hw, 1.0, 0)), b.clone().add(V(st.hw, 1.0, 0))], 0.04, 2, 6), mats.red, 0.015);
      sB.add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6).translate(a.x + st.hw, a.y + 0.5, a.z), mats.steelDark, 0);
    }
    for (const m of sB.flush(realStair, 'works-stair2')) m.castShadow = true;
    realStair.visible = false;
    f.group.add(realStair);
  }
  // the stair's cage: a wire screen on its open side, so the climb starts only at the foot (past the QC barrier)
  screen(B, phys, V(st.foot.x + st.hw + 0.25, y, st.foot.z + 0.75), V(st.foot.x + st.hw + 0.25, y, -10.2), y, FY[2] - 0.62, mats);
  const qc = new THREE.Group();
  const qcShutter = new THREE.Group();
  let qcCol: RAPIER.Collider | null = null;
  {
    const z = st.foot.z + 0.6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.3, 10).translate(-18.1, y + 0.65, z), mats.steelDark);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.12).translate(-1.7, 0, 0), mats.hazard);
    arm.position.set(-18.1, y + 1.15, z);
    arm.name = 'arm';
    post.castShadow = arm.castShadow = true;
    qc.add(post, arm);
    const s2 = sign('INSPECTION REQUIRED', 2.8, 0.5, '#f3ead6', '#d8283a');
    s2.position.set(-19.9, y + 2.2, z + 0.1);
    qc.add(s2);
    qc.userData.noPaint = true;
    f.group.add(qc);
    // a wire shutter behind the arm, floor to ceiling (Long Legs would hop a waist-high arm); it rolls up with the arm
    const sB = new StaticBatch();
    screen(sB, null, V(-IN + 0.05, y, z - 0.18), V(-18.0, y, z - 0.18), y, FY[2] - 0.62, mats);
    sB.flush(qcShutter, 'works-qc-shutter');
    qcShutter.userData.noPaint = true;
    f.group.add(qcShutter);
    qcCol = phys.addStaticBox(V(-19.8, (y + FY[2] - 0.62) / 2, z), V(1.8, (FY[2] - 0.62 - y) / 2, 0.2));
  }
  let qcT = -1;
  let stairReal = false;

  // ───────────── dressing, checkpoints, collectibles, regions ─────────────
  crate(B, phys, V(-18.6, y, -19.4), 1.3, 0.2, mats, 7);
  crate(B, phys, V(-18.5, y + 1.3, -19.4), 1.3, -0.25, mats, 8);
  floorCrown(f, L, 'crown-w3-gangway', V(-18.5, y + 2.6 + 0.9, -19.4), 'On the crates in the Inspector’s corner, by the gangway');
  floorCrown(f, L, 'crown-w3-inspector', W.inspector.clone().setY(y + 2.6 + 0.9).add(V(-0.8, 0, -0.8)), 'On the Inspector’s cabinet top');
  pipe(B, [V(IN - 0.4, y + 7.2, -12), V(9, y + 7.2, -12), V(9, y + 7.2, 20)], 0.2, mats.red, mats.steelDark);
  f.marks.add(1, V(14, y + 0.01, 4), V(0, 1, 0), 2.4, 0.3);
  f.marks.add(2, V(-14, y + 0.01, 2), V(0, 1, 0), 2.6, 0);
  f.marks.add(1, V(-IN + 0.02, y + 4.5, -15), V(1, 0, 0), 2.8, 0.1);
  holeRailing(f, { x0: W.shaft.x0, x1: IN, z0: -IN, z1: W.shaft.z1 }, ['w']);
  const cpAt = V(12.5, y, -10.5);
  L.checkpoints.push(new Checkpoint(ctx, 'cp-stamp', cpAt, Math.PI / 2), new Checkpoint(ctx, 'cp-pit', V(-12, y, 6.5), Math.PI / 2));
  for (const c of L.checkpoints.slice(-2)) f.group.attach(c.root);
  dropTrail(f, L, 'drop-w3-lift2', [V(15.5, y, -12.5), V(11, y, -6), V(9.6, y, -1)], 1.7);
  for (const pd of W.platforms.slice(0, 2)) dropTrail(f, L, `drop-w3-plat${pd.c.x}`, [pd.c.clone().add(V(-0.8, 0, 0)), pd.c.clone().add(V(0.8, 0, 0))], 1.6);
  dropTrail(f, L, 'drop-w3-west2', [V(-10, y, 3), V(-12, y, -6), V(-14, y, -10)], 1.8);
  dropTrail(f, L, 'drop-w3-runlane', [V(19, y, -7), V(19, y, 15)], 2.2);
  region(L, 'The Stamp Run', lane.x0, y - 1, lane.z0, lane.x1, y + 8, lane.z1);
  region(L, 'The Shredder Pit', pit.x0 - 1.5, y - 4, pit.z0, pit.x1 + 1.5, y + 8, pit.z1);
  region(L, 'The Stamping Floor', -IN, y - 1, -IN, IN, y + 8, IN);

  // (LimpWorks flushes the floor once the Guardians have added their models: finishFloor)
  f.washer.add(mats.steel, '#bfffe4');
  f.washer.add(mats.steelDark, '#ff8fc8');
  f.washer.add(mats.brick, '#cfe0ff');
  f.washer.add(mats.red, '#ffd23a');
  f.washer.add(mats.grid, '#f2fff4');

  const drawStair = (instant = false) => {
    if (stairReal) return;
    stairReal = true;
    for (const u of steps) {
      u.permanent = true;
      u.root.visible = false;
    }
    realStair.visible = true;
    // a half step at the foot (the 0.5 m first rise is a tall autostep from the floor)
    phys.addStaticBox(V(st.foot.x, y + 0.125, st.foot.z + 0.3), V(st.hw, 0.125, 0.3));
    // the nosing ramp over all 18 steps (the undrawn steps are its colliders; 0.5 m risers stall a walk)
    stairRamp(phys, st);
    // the railing on the stair's open side (colliders now that the stair is real)
    for (let k = 2; k < 12; k++) {
      const a = stairStep(st, k);
      phys.addStaticBox(V(a.x + st.hw + 0.05, a.y + 0.55, a.z), V(0.05, 0.55, 0.5));
    }
    if (qcCol) {
      phys.untag(qcCol);
      phys.world.removeCollider(qcCol, false);
      qcCol = null;
    }
    qcT = instant ? 1 : 0;
    gangT = instant ? 1 : 0;
    // the gangway is down: a deck collider over the pit + its two rails
    gangCols.push(phys.addStaticBox(V(0, y - 0.1, W.gangwayZ), V(pit.x1 + 0.3, 0.1, 1.1)));
    for (const s of [-1, 1]) gangCols.push(phys.addStaticBox(V(0, y + 0.6, W.gangwayZ + s * 1.05), V(pit.x1, 0.6, 0.05)));
  };

  let lastPhase = new Array(presses.length).fill(false);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _Z = new THREE.Vector3(0, 0, 1);

  return {
    f,
    platforms,
    stairSteps: steps,
    inPit: (p) => inRect(pit, p.x, p.z, -0.2) && p.y < y - 1.4 && p.y > W.pitBottom - 2,
    get stairReal() {
      return stairReal;
    },
    drawStair,
    run,
    checkpointAt: cpAt,
    update(dt, time, player, toast, partners = []) {
      for (let i = 0; i < rollerX.length; i++) {
        _p.set(rollerX[i], pb + 0.2, 0);
        _q.setFromAxisAngle(_Z, time * 2.6 * (rollerX[i] > 0 ? 1 : -1));
        _m.compose(_p, _q, _s);
        rollers.setMatrixAt(i, _m);
        rollerTeeth.setMatrixAt(i, _m);
      }
      rollers.instanceMatrix.needsUpdate = true;
      rollerTeeth.instanceMatrix.needsUpdate = true;
      _q.identity();
      for (const p of platforms) p.update(dt, player);
      // the six presses: a travelling wave of slams; a ram coming down on WAI stamps him
      const wp = player.pos;
      for (let i = 0; i < presses.length; i++) {
        const pr = presses[i];
        const ph = ((time + pr.phase) % RUN.period) / RUN.period;
        const down = ph < RUN.down / RUN.period;
        const h = down ? 0.35 : 0.35 + Math.min(1, (ph - RUN.down / RUN.period) * 6) * 2.4;
        _p.set(lx, y + h + 0.95, pr.z);
        _m.compose(_p, _q, _s);
        rams.setMatrixAt(i, _m);
        _p.y = y + h + 0.15;
        _m.compose(_p, _q, _s);
        faces.setMatrixAt(i, _m);
        if (down && !lastPhase[i]) {
          ctx.audio.play('stampHit', { pos: _p, vol: 0.5 });
          if (inRect(lane, wp.x, wp.z) && Math.abs(wp.z - pr.z) < 1.25 && wp.y < y + 1.2 && player.takeHit(_p.clone().setX(lx + 3), 1, 7)) {
            ctx.effects.comic(wp.clone().setY(wp.y + 1.8), t('CORRECTED!'), '#d8283a', 0.8);
            if (run.active) {
              run.active = false;
              toast('STAMPED! The run is off — step back on the start pad to try again.', 'warn');
            }
          }
          for (const b of partners) {
            const bp = b.pos;
            if (!b.smudged && inRect(lane, bp.x, bp.z) && Math.abs(bp.z - pr.z) < 1.25 && bp.y < y + 1.2 && b.takeHit(_p.clone().setX(lx + 3), 1, 7)) ctx.effects.comic(bp.clone().setY(bp.y + 1.8), t('CORRECTED!'), '#d8283a', 0.8);
          }
        }
        lastPhase[i] = down;
      }
      rams.instanceMatrix.needsUpdate = true;
      faces.instanceMatrix.needsUpdate = true;
      // the challenge
      if (!run.won) {
        const onStart = Math.hypot(wp.x - run.startPad.x, wp.z - run.startPad.z) < 1.1 && Math.abs(wp.y - y) < 0.6;
        if (onStart && !run.active) {
          run.active = true;
          run.t = 0;
          toast('STAMP RUN! Sprint the press lane to the far pad in {s} s without getting stamped. Long Legs help!', 'info', { s: RUN.limit });
          ctx.audio.play('telegraph', { pos: wp });
        }
        if (run.active) {
          run.t += dt;
          if (!inRect(lane, wp.x, wp.z, 0.6) && !onStart) {
            run.active = false;
            toast('You left the lane — the STAMP RUN is off.', 'warn');
          } else if (run.t > RUN.limit) {
            run.active = false;
            toast('Too slow! Step on the start pad to run it again.', 'warn');
          } else if (Math.hypot(wp.x - run.endPad.x, wp.z - run.endPad.z) < 1.2) {
            run.active = false;
            run.won = true;
            runCrown.hidden = false;
            ctx.effects.burst(runCrown.pos, '#ffd23a', 20, 3);
            ctx.audio.play('fanfare', { vol: 0.6 });
            toast('STAMP RUN won in {t} s — not a single CORRECT on you! A crown pops up.', 'good', { t: run.t.toFixed(1) });
          }
        }
      }
      // QC barrier arm lifts, gangway swings down
      if (qcT >= 0 && qcT < 1) {
        qcT = Math.min(1, qcT + dt * 0.8);
        const arm = qc.getObjectByName('arm');
        if (arm) arm.rotation.z = -qcT * 1.4;
        qcShutter.position.y = (1 - (1 - qcT) ** 3) * (FY[2] - 0.6 - y);
      } else if (qcT >= 1) {
        const arm = qc.getObjectByName('arm');
        if (arm) arm.rotation.z = -1.4;
        qcShutter.visible = false;
      }
      if (gangT >= 0) {
        gangT = Math.min(1, gangT + dt * 0.5);
        const e = 1 - (1 - gangT) * (1 - gangT);
        gang.rotation.z = (Math.PI / 2 - 0.02) * (1 - e);
        if (gangT >= 1 && gangT !== 2) {
          gangT = 2;
          ctx.audio.play('crash', { pos: gang.position, vol: 0.6, pitch: 0.8 });
        }
      }
      f.washer.update(dt);
    },
  };
}
