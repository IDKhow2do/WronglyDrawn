/**
 * [INPUT]: depends on FloorBuild from ./WorksShell; StaticBatch/block/lathe/latheHull/tube/v2 from ../harbor/HarborKit;
 *          girder/sign from ./WorksKit; WORKS/FY from ./WorksLayout; HostDef/OrganHost from hosts/OrganHost;
 *          Shoutable from ../harbor/Shout; RAPIER (the lift cage's body: fixed while it stands, kinematic for the climb)
 * [OUTPUT]: exports buildLift() → FreightLift, buildInspector() → Inspector, buildArchivist() → Archivist
 * [POS]: the three frozen machines of Limp Works and their wake mechanics. The FREIGHT LIFT (F1) wants the Legs and
 *        then carries WAI up its shaft (its lattice gate fills the front to the roof frame, folds up when it wakes); the INSPECTOR (F2) wants the Eye and looks the pencil stair into being; the
 *        ARCHIVIST (F3) wants the Eye AND a shout into its horn while it reads. Each is an OrganHost "face" (no
 *        collider) on a batched model with box colliders. WorksDirector decides when they wake.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { RAPIER } from '../../core/PhysicsWorld';
import type { GameContext } from '../../core/Context';
import type { HostDef, OrganHost } from '../../hosts/OrganHost';
import type { PlayerController } from '../../player/PlayerController';
import { StaticBatch, block, lathe, latheHull, tube, v2 } from '../harbor/HarborKit';
import type { Shoutable } from '../harbor/Shout';
import { girder, sign } from './WorksKit';
import { FY, WORKS } from './WorksLayout';
import type { FloorBuild } from './WorksShell';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

type AddHost = (def: HostDef) => OrganHost;

/** A red X of two crossed bars (the Red Pen's mark on a Guardian's face); hidden when it wakes. */
function crossMark(size: number, depth = 0.05): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#d8283a' });
  for (const r of [0.78, -0.78]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 1.25, size * 0.2, depth), m);
    bar.rotation.z = r;
    g.add(bar);
  }
  g.userData.noPaint = true;
  return g;
}

// ═════════════ GUARDIAN 1 · THE FREIGHT LIFT ═════════════
export interface FreightLift {
  host: OrganHost;
  readonly awake: boolean;
  readonly atTop: boolean;
  readonly riding: boolean;
  /** Is a point inside the cage (on its floor)? */
  inside(p: THREE.Vector3): boolean;
  /** The Legs woke it: the gate opens, its legs unfold. */
  wake(): void;
  /** Start the climb (WAI stands inside). */
  ride(): void;
  /** Dev warps: the cage is simply up. */
  snapTop(): void;
  /** Keep WAI on the cage floor while it moves (call after physics). */
  carry(p: PlayerController): void;
  update(dt: number): void;
}

/** The cage's lattice gate: from the floor plate (0.3 m) to just under the roof frame (4.6 m). */
const GATE_H = 4.3;

export function buildLift(ctx: GameContext, f: FloorBuild, addHost: AddHost): FreightLift {
  const mats = f.mats;
  const c0 = WORKS.cage.clone();
  const hx = WORKS.cageHalf;
  const cage = new THREE.Group();
  cage.name = 'works-lift-cage';
  ctx.root.add(cage);
  const B = new StaticBatch();
  // floor plate (checker steel, hazard edge), four corner posts, lattice sides, a roof frame with the hoist motor
  B.add(block(hx * 2, 0.3, hx * 2, 0.005, 5, 1.5).translate(0, 0.15, 0), mats.steel, 0.03);
  B.add(new THREE.BoxGeometry(hx * 2 - 0.2, 0.06, 0.24).translate(0, 0.33, hx - 0.14), mats.hazard, 0);
  for (const [x, z] of [[-hx, -hx], [hx, -hx], [-hx, hx], [hx, hx]]) girder(B, V(x * 0.97, 0, z * 0.97), V(x * 0.97, 4.6, z * 0.97), 0.3, 0.26, mats.steelDark);
  const lattice = (a: THREE.Vector3, b: THREE.Vector3) => {
    for (const y of [0.9, 2.2, 3.5, 4.5]) B.add(tube([a.clone().setY(y), b.clone().setY(y)], 0.05, 2, 6), mats.red, 0.015);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / n), q = a.clone().lerp(b, (i + 1) / n);
      B.add(tube([p.setY(0.4), q.setY(3.4)], 0.03, 2, 5), mats.steelDark, 0.012);
    }
  };
  lattice(V(-hx, 0, -hx), V(hx, 0, -hx));
  lattice(V(-hx, 0, -hx), V(-hx, 0, hx));
  lattice(V(hx, 0, -hx), V(hx, 0, hx));
  B.add(block(hx * 2 + 0.2, 0.3, hx * 2 + 0.2, 0.005, 6, 2).translate(0, 4.75, 0), mats.steelDark, 0.03);
  const motor = [v2(0.001, 0), v2(0.9, 0), v2(1.0, 0.2), v2(1.0, 1.2), v2(0.8, 1.4), v2(0.001, 1.45)];
  B.add(lathe(motor, 16, 0.01).rotateZ(Math.PI / 2).translate(0.7, 5.6, 0), mats.steel, 0, latheHull(motor, 16, 0.01, 0.03).rotateZ(Math.PI / 2).translate(0.7, 5.6, 0));
  B.add(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 14).rotateX(Math.PI / 2).translate(-1.0, 5.4, 0), mats.brass, 0.03);
  // the control box with the lift's face (eyes crossed out) on the front-left post
  B.add(block(1.6, 1.4, 0.5, 0.01, 9, 1).translate(-hx + 1.0, 2.2, hx + 0.05), mats.cream, 0.03);
  B.add(lathe([v2(0.001, 0), v2(0.3, 0), v2(0.32, 0.08), v2(0.001, 0.1)], 14, 0).rotateX(Math.PI / 2).translate(-hx + 1.0, 1.85, hx + 0.32), mats.red, 0.02);
  for (const m of B.flush(cage, 'works-lift')) m.castShadow = true;
  const marks = new THREE.Group();
  for (const x of [-hx + 0.7, -hx + 1.3]) {
    const xm = crossMark(0.32);
    xm.position.set(x, 2.55, hx + 0.32);
    marks.add(xm);
  }
  cage.add(marks);
  // the folding lattice gate (front): drawn shut until it wakes
  const gate = new THREE.Group();
  {
    const gm = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2 - 0.6, GATE_H, 0.06),
      new THREE.MeshStandardMaterial({ color: '#d8283a', roughness: 0.7 }),
    );
    gm.geometry.translate(0, 0.3 + GATE_H / 2, 0);
    gm.castShadow = true;
    gate.add(gm);
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, GATE_H + 0.1, 0.1), mats.steelDark);
      bar.position.set(-hx + 0.4 + i * ((hx * 2 - 0.8) / 8), 0.3 + GATE_H / 2, 0.05);
      gate.add(bar);
    }
    (gm.material as THREE.MeshStandardMaterial).transparent = true;
    (gm.material as THREE.MeshStandardMaterial).opacity = 0.55;
    gate.position.set(0, 0, hx - 0.02);
    gate.userData.noPaint = true;
    cage.add(gate);
  }
  // open = the lattice concertinas up under the roof frame (its top edge stays put)
  const gateTop = 0.3 + GATE_H;
  const foldGate = (k: number) => {
    const sc = 1 - 0.92 * (1 - (1 - k) ** 2);
    gate.scale.y = sc;
    gate.position.y = gateTop * (1 - sc);
  };
  cage.position.copy(c0);
  // one body: floor, three sides, the gate (removed when it opens). FIXED while the cage stands, kinematic only
  // for the climb: the character controller wedges WAI on a kinematic floor within a few steps (he could only
  // jump out of the cage on F2), on a fixed floor he walks off it.
  const w = ctx.physics.world;
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c0.x, c0.y, c0.z));
  /** The cage stands at `y`: put it there exactly and make it part of the building. */
  const park = () => {
    body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    body.setTranslation({ x: c0.x, y, z: c0.z }, true);
  };
  const col = (cx: number, cy: number, cz: number, ex: number, ey: number, ez: number) => {
    const c = w.createCollider(RAPIER.ColliderDesc.cuboid(ex, ey, ez).setTranslation(cx, cy, cz), body);
    ctx.physics.tag(c, 'static');
    return c;
  };
  col(0, 0.15, 0, hx, 0.15, hx);
  col(0, 2.3, -hx, hx, 2.0, 0.08);
  col(-hx, 2.3, 0, 0.08, 2.0, hx);
  col(hx, 2.3, 0, 0.08, 2.0, hx);
  col(0, 4.75, 0, hx, 0.15, hx);
  // the gate reaches the roof frame: no Long-Legs hop over it into a sleeping cage
  let gateCol: RAPIER.Collider | null = col(0, 0.3 + GATE_H / 2, hx, hx, GATE_H / 2, 0.08);

  const host = addHost({
    id: 'freight-lift',
    name: 'Freight Lift',
    size: 'large',
    anchored: true,
    noCollider: true,
    pos: V(c0.x - hx + 1.0, c0.y + 0.6, c0.z + hx + 0.3),
    half: V(1.3, 1.4, 0.3),
    yaw: 0,
    sockets: { LEG: V(0, -1.1, 0.1), EYE: V(0, 0.45, 0.15), MOUTH: V(0, 0, 0.15) },
    lines: {
      LEG: 'The Freight Lift wobbles up on its new legs…',
      EYE: 'The Freight Lift blinks. It can see fine — the Red Pen crossed out its LEGS. Lend it your Legs!',
      MOUTH: 'The Freight Lift hums along. It needs LEGS to climb its shaft, not a voice.',
    },
    refuses: {
      EYE: 'The Freight Lift needs your LEGS, not your Eye',
      MOUTH: 'The Freight Lift needs your LEGS, not your Mouth',
    },
  });

  let awake = false;
  let gateT = 0;
  let rideT = -1;
  let atTop = false;
  let y = c0.y;
  let dy = 0;
  const top = FY[1];
  const place = () => {
    cage.position.y = y;
    if (body.isKinematic()) body.setNextKinematicTranslation({ x: c0.x, y, z: c0.z });
    host.pos.y = y + 0.6;
  };
  return {
    host,
    get awake() {
      return awake;
    },
    get atTop() {
      return atTop;
    },
    get riding() {
      return rideT >= 0 && !atTop;
    },
    inside(p) {
      return Math.abs(p.x - c0.x) < hx - 0.3 && Math.abs(p.z - c0.z) < hx - 0.3 && p.y > y - 0.3 && p.y < y + 3;
    },
    wake() {
      if (awake) return;
      awake = true;
      marks.visible = false;
      if (gateCol) {
        ctx.physics.untag(gateCol);
        w.removeCollider(gateCol, false);
        gateCol = null;
      }
      ctx.audio.play('gateOpen', { pos: c0, vol: 0.9 });
    },
    ride() {
      if (rideT >= 0) return;
      rideT = 0;
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      ctx.audio.play('spinWind', { pos: c0, pitch: 0.5, vol: 0.9 });
    },
    snapTop() {
      awake = true;
      marks.visible = false;
      gateT = 1;
      foldGate(1);
      if (gateCol) {
        ctx.physics.untag(gateCol);
        w.removeCollider(gateCol, false);
        gateCol = null;
      }
      rideT = 99;
      atTop = true;
      y = top;
      place();
      park();
    },
    carry(p) {
      if (dy !== 0 && Math.abs(p.pos.x - c0.x) < hx && Math.abs(p.pos.z - c0.z) < hx && p.pos.y > y - 1.2 && p.pos.y < y + 3.2) {
        p.enforceAbove(y + 0.3);
      }
    },
    update(dt) {
      if (awake && gateT < 1) {
        gateT = Math.min(1, gateT + dt * 0.6);
        foldGate(gateT);
      }
      dy = 0;
      if (rideT >= 0 && !atTop) {
        rideT += dt;
        const k = THREE.MathUtils.smoothstep(rideT, 0.8, 7.2);
        const ny = THREE.MathUtils.lerp(c0.y, top, k);
        dy = ny - y;
        y = ny;
        place();
        if (rideT > 7.4) {
          atTop = true;
          park();
          ctx.audio.play('bigStep', { pos: cage.position, vol: 0.9 });
          ctx.camera.shake = Math.max(ctx.camera.shake, 0.3);
        }
      }
      // the hoist motor hums while it climbs (a little shake)
      cage.position.x = c0.x + (dy !== 0 ? Math.sin(rideT * 40) * 0.01 : 0);
    },
  };
}

// ═════════════ GUARDIAN 2 · THE INSPECTOR ═════════════
export interface Inspector {
  host: OrganHost;
  readonly awake: boolean;
  wake(): void;
  update(dt: number, time: number): void;
}

/** A quality-control machine: a cabinet, a neck, a head with a brass magnifier (its eye), a PASSED stamp arm. */
export function buildInspector(ctx: GameContext, f: FloorBuild, addHost: AddHost): Inspector {
  const { B, mats, phys } = f;
  const at = WORKS.inspector;
  const yaw = WORKS.inspectorYaw;
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0.04, hull?: THREE.BufferGeometry) => {
    g.applyQuaternion(q).translate(at.x, at.y, at.z);
    hull?.applyQuaternion(q).translate(at.x, at.y, at.z);
    B.add(g, m, ink, hull);
  };
  put(block(3.4, 2.4, 2.6, 0.02, 41, 2).translate(0, 1.2, 0), mats.steel);
  put(block(3.6, 0.2, 2.8, 0.01, 42, 1).translate(0, 2.5, 0), mats.steelDark, 0.03);
  put(new THREE.BoxGeometry(2.6, 0.5, 0.06).translate(0, 1.6, 1.31), mats.ruler, 0);
  const neck = [v2(0.5, 0), v2(0.45, 0.2), v2(0.35, 0.4), v2(0.35, 1.6), v2(0.5, 1.8), v2(0.001, 1.85)];
  put(lathe(neck, 14, 0.01).translate(0, 2.6, -0.2), mats.steelDark, 0, latheHull(neck, 14, 0.01, 0.03).translate(0, 2.6, -0.2));
  put(block(2.6, 1.9, 1.7, 0.02, 43, 1.5).translate(0, 5.3, 0), mats.cream);
  // the magnifier: a brass rim round a pale lens on the head's front (the EYE socket)
  const rim = new THREE.TorusGeometry(0.72, 0.14, 10, 28);
  put(rim.translate(0, 5.35, 0.92), mats.brass, 0.03);
  put(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 28).rotateX(Math.PI / 2).translate(0, 5.35, 0.9), mats.glow, 0);
  // a lamp-shade hat, the stamp arm (PASSED) on the right
  const hat = [v2(0.2, 0), v2(1.2, 0), v2(1.3, 0.12), v2(0.6, 0.6), v2(0.25, 0.9), v2(0.001, 0.95)];
  put(lathe(hat, 18, 0.01).translate(0, 6.25, 0), mats.red, 0, latheHull(hat, 18, 0.01, 0.035).translate(0, 6.25, 0));
  put(girder2(1.9, 0.18).translate(1.9, 4.6, 0.2), mats.steelDark, 0.03);
  put(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 16).translate(2.8, 3.6, 0.2), mats.red, 0.03);
  put(new THREE.BoxGeometry(0.9, 0.12, 0.9).translate(2.8, 3.3, 0.2), mats.rubber, 0.02);
  phys.addStaticBox(at.clone().setY(at.y + 1.3), V(1.7, 1.3, 1.3), yaw);
  phys.addStaticBox(at.clone().setY(at.y + 5.2), V(1.3, 1.1, 0.85), yaw);
  const crossed = crossMark(1.1, 0.04);
  crossed.position.set(0, 5.35, 1.0).applyQuaternion(q).add(at);
  crossed.quaternion.copy(q);
  f.group.add(crossed);
  const plate = sign('INSPECTOR', 2.2, 0.5, '#f3ead6', '#d8283a');
  plate.position.set(0, 4.0, 1.32).applyQuaternion(q).add(at);
  plate.quaternion.copy(q);
  f.group.add(plate);
  const host = addHost({
    id: 'inspector',
    name: 'Inspector',
    size: 'large',
    anchored: true,
    noCollider: true,
    pos: at.clone().add(V(Math.sin(yaw) * 0.95, 4.35, Math.cos(yaw) * 0.95)),
    half: V(1.3, 1.0, 0.15),
    yaw,
    sockets: { EYE: V(0, 0, 0.1), MOUTH: V(0, -0.6, 0.1), LEG: V(0, -1.0, 0.1) },
    gaze: { range: 32, halfAngleDeg: 55, pitch: 0.18 },
    lines: {
      EYE: 'The Inspector squints through its lens… and LOOKS.',
      MOUTH: 'The Inspector clears its throat. It wants to SEE what it checks — lend it your Eye.',
      LEG: 'The Inspector taps a foot. It needs an EYE to inspect anything.',
    },
    refuses: {
      MOUTH: 'The Inspector needs your EYE, not your Mouth',
      LEG: 'The Inspector needs your EYE, not your Legs',
    },
  });
  let awake = false;
  return {
    host,
    get awake() {
      return awake;
    },
    wake() {
      awake = true;
      crossed.visible = false;
    },
    update() {},
  };
}

/** A short I-beam (len along +x). */
function girder2(len: number, h: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(len, h, h * 0.8);
}

// ═════════════ GUARDIAN 3 · THE ARCHIVIST ═════════════
export interface Archivist {
  host: OrganHost;
  horn: THREE.Vector3;
  readonly awake: boolean;
  /** WAI's Eye is on it: it reads (and wants a shout into its horn). */
  readonly reading: boolean;
  shoutable: Shoutable;
  /** Hook: a shout reached the horn while it reads. */
  onShout: (() => void) | null;
  onQuiet: (() => void) | null;
  wake(): void;
  update(dt: number, time: number): void;
}

/** A giant old typewriter: an enamel body, three rows of keys, a carriage roller with a drawing in it, a speaking horn. */
export function buildArchivist(ctx: GameContext, f: FloorBuild, addHost: AddHost): Archivist {
  const { B, mats, phys } = f;
  const at = WORKS.archivist;
  const yaw = WORKS.archivistYaw;
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0.04, hull?: THREE.BufferGeometry) => {
    g.applyQuaternion(q).translate(at.x, at.y, at.z);
    hull?.applyQuaternion(q).translate(at.x, at.y, at.z);
    B.add(g, m, ink, hull);
  };
  const enamel = mats.steelDark;
  // body: a sloped front (keys) and a tall back (the type basket and the carriage)
  const prof = new THREE.Shape();
  prof.moveTo(-2.2, 0);
  prof.lineTo(2.2, 0);
  prof.lineTo(2.2, 1.2);
  prof.lineTo(-0.6, 2.6);
  prof.lineTo(-2.2, 2.6);
  prof.closePath();
  const body = new THREE.ExtrudeGeometry(prof, { depth: 5.2, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  body.translate(0, 0, -2.6).rotateY(-Math.PI / 2);
  put(body, enamel, 0.05);
  // keys: three rows of round caps on stems, stepping up the slope
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 9; k++) {
      const x = -1.9 + k * 0.48, z = 1.85 - row * 0.62, yy = 1.32 + row * 0.42;
      put(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 5).translate(x, yy - 0.16, z), mats.steelDark, 0);
      put(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12).translate(x, yy, z), (row + k) % 4 === 0 ? mats.red : mats.cream, 0.015);
    }
  }
  put(block(3.4, 0.16, 0.5, 0.005, 51, 1).translate(0, 1.25, 2.35), mats.cream, 0.02);
  // the carriage: a long rubber roller with brass knobs and a crossed-out drawing standing in it
  put(new THREE.CylinderGeometry(0.42, 0.42, 5.2, 18).rotateZ(Math.PI / 2).translate(0, 3.05, -1.1), mats.rubber, 0.03);
  for (const x of [-2.75, 2.75]) put(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16).rotateZ(Math.PI / 2).translate(x, 3.05, -1.1), mats.brass, 0.03);
  const sheet = new THREE.BoxGeometry(2.4, 2.4, 0.03);
  {
    const uv = sheet.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  }
  put(sheet.translate(0, 4.4, -1.15), mats.paper, 0);
  // the speaking horn (it reads aloud, once it can see and someone gives it a voice): a brass lathe flare
  const hornP = [v2(0.14, 0), v2(0.16, 0.6), v2(0.24, 1.2), v2(0.45, 1.7), v2(0.85, 2.0), v2(0.95, 2.05)];
  const hornG = lathe(hornP, 18, 0.01).rotateZ(-0.9).translate(-2.0, 2.6, -0.4);
  put(hornG, mats.brass, 0);
  // the monocle (its EYE socket) on the face plate above the keys
  put(block(2.0, 1.0, 0.25, 0.01, 52, 1).translate(0, 2.25, 0.85).rotateX(-0.45), mats.cream, 0.03);
  put(new THREE.TorusGeometry(0.42, 0.08, 8, 22).translate(0.4, 2.42, 1.06), mats.brass, 0.02);
  phys.addStaticBox(at.clone().setY(at.y + 1.3), V(2.6, 1.3, 2.3), yaw);
  phys.addStaticBox(at.clone().setY(at.y + 3.3), V(2.6, 1.6, 0.6), yaw);
  // the horn's mouth: the lathe's +y axis turned by rotateZ(−0.9) points up and to +x
  const hornW = V(-2.0 + Math.sin(0.9) * 2.0, 2.6 + Math.cos(0.9) * 2.0, -0.4).applyQuaternion(q).add(at);
  const crossEye = crossMark(0.7, 0.04);
  crossEye.position.set(0.4, 2.42, 1.12).applyQuaternion(q).add(at);
  crossEye.quaternion.copy(q);
  const crossHorn = crossMark(1.0, 0.04);
  crossHorn.position.copy(hornW);
  crossHorn.lookAt(hornW.clone().add(V(Math.sin(0.9), Math.cos(0.9), 0).applyQuaternion(q)));
  f.group.add(crossEye, crossHorn);
  const plate = sign('ARCHIVIST', 2.4, 0.5, '#f3ead6', '#2a4be0');
  plate.position.set(0, 0.7, 2.55).applyQuaternion(q).add(at);
  plate.quaternion.copy(q);
  f.group.add(plate);
  // a glow ring in the horn's mouth (shows when it wants a shout)
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: '#ff4fa3', transparent: true, opacity: 0, depthWrite: false }));
  glow.position.copy(hornW);
  glow.quaternion.copy(crossHorn.quaternion);
  glow.userData.noPaint = true;
  f.group.add(glow);

  const host = addHost({
    id: 'archivist',
    name: 'Archivist',
    size: 'large',
    anchored: true,
    noCollider: true,
    pos: V(0, 1.4, 1.3).applyQuaternion(q).add(at),
    half: V(1.4, 1.0, 0.4),
    yaw,
    sockets: { EYE: V(0.4, 0.02, -0.15), MOUTH: V(-0.4, -0.4, -0.1), LEG: V(0, -1.0, 0) },
    lines: {
      EYE: 'The Archivist peers through its monocle… it can READ again. Now give it a voice: SHOUT into its horn!',
      MOUTH: 'The Archivist has a horn for a voice — SHOUT into it. But first it needs to SEE: lend it your Eye.',
      LEG: 'The Archivist rattles its keys. It needs an EYE to read and a SHOUT to speak.',
    },
    refuses: {
      MOUTH: 'It has a horn: keep your Mouth and SHOUT into it',
      LEG: 'The Archivist needs your EYE (and a SHOUT), not your Legs',
    },
  });
  let awake = false;
  const self: Archivist = {
    host,
    horn: hornW,
    get awake() {
      return awake;
    },
    get reading() {
      return !!host.lent('EYE') && !awake;
    },
    onShout: null,
    onQuiet: null,
    shoutable: {
      pos: hornW,
      radius: 1.4,
      enabled: () => !awake,
      onShout: () => {
        if (awake) return false;
        if (!host.lent('EYE')) {
          self.onQuiet?.();
          return true;
        }
        self.onShout?.();
        return true;
      },
    },
    wake() {
      awake = true;
      crossEye.visible = false;
      crossHorn.visible = false;
      glow.visible = false;
    },
    update(_dt, time) {
      const m = glow.material as THREE.MeshBasicMaterial;
      m.opacity = self.reading ? 0.45 + Math.sin(time * 6) * 0.3 : 0;
      glow.visible = m.opacity > 0.01;
    },
  };
  return self;
}
