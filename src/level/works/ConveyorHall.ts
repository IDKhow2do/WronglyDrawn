/**
 * [INPUT]: depends on FloorBuild/floorShell/finishFloor/dropTrail/floorCrown/region/WorksLists from ./WorksShell; crate/girder/
 *          paperStack/railing/screen/sign/pipe from ./WorksKit; StaticBatch/block/lathe/v2/worldUV from ../harbor/HarborKit;
 *          paperBoatModel from ../harbor/HarborArt; WORKS/FY/IN from ./WorksLayout; Checkpoint from ../Collectibles
 * [OUTPUT]: exports buildConveyorHall() → BuiltHall (the floor, its belts + carry(), the tower door + doorK, the lift tape lock, update)
 * [POS]: F1 of Limp Works: the entry yard by the tower door (a real arched doorway; open in the intro it shows the landing
 *        outside, the moored paper boat, the water), THE LIMP and the Legs, the Loading Dock ledge (the first
 *        Long-Legs jump), the belt floor (two moving conveyor beds that carry WAI, the stamp-press aisle) and the north
 *        strip with the freight-lift shaft (Guardians.ts builds the cage), shut by a CORRECT tape on a wire shutter up to
 *        the ceiling (solid until the belt floor is quiet; then it rolls up). The hopper under F2's shredder pit hangs here.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { RAPIER } from '../../core/PhysicsWorld';
import { Checkpoint } from '../Collectibles';
import { StaticBatch, block, lathe, v2, worldUV } from '../harbor/HarborKit';
import { paperBoatModel } from '../harbor/HarborArt';
import { crate, girder, paperStack, pipe, railing, screen, sign } from './WorksKit';
import { FY, IN, WORKS } from './WorksLayout';
import { dropTrail, floorCrown, floorShell, newFloor, region, type FloorBuild, type WorksLists } from './WorksShell';

export interface Belt {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  /** carry velocity along x (m/s) */
  vx: number;
  tex: THREE.Texture;
  trays: THREE.InstancedMesh[];
}

export interface Lock {
  readonly open: boolean;
  unlock(): void;
}

export interface BuiltHall {
  f: FloorBuild;
  belts: Belt[];
  /** Belt carry for a point on a belt's top (null = not on a belt). */
  carry(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null;
  tape: Lock;
  /** The tower door's two leaves (0 shut … 1 open), for the intro; open, it shows the landing outside. */
  setDoor(k: number): void;
  /** How far the door is open (0 shut): LimpWorks shows the sky and the drawn city while it is. */
  readonly doorK: number;
  checkpointAt: THREE.Vector3;
  update(dt: number, time: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

export function buildConveyorHall(ctx: GameContext, L: WorksLists): BuiltHall {
  const f = newFloor(ctx, 0);
  const { B, mats, phys } = f;
  const y = FY[0];
  const W = WORKS;
  const hop = { x0: -8.3, x1: 8.3, z0: -IN, z1: IN };
  floorShell(f, {
    ground: true,
    ceilHoles: [W.shaft, { x0: -8, x1: 8, z0: -IN, z1: IN }],
    noWindows: [{ x0: -3, x1: 3, z0: 20, z1: 24 }, { x0: 13, x1: 24, z0: -24, z1: -13 }],
    lamps: [[-14, 16], [14, 16], [-14, -1.2], [14, -1.2], [-14, -10.5], [12, -10.5], [-13, -18]],
    door: { x: 0, halfW: 1.7, spring: 3.4 },
  });

  // ───────────── the tower door (south wall, inside) ─────────────
  const doorZ = IN;
  const leaves: THREE.Group[] = [];
  {
    // an arched iron frame round the opening, two plank leaves with iron straps
    const arch = new THREE.Shape();
    arch.moveTo(-2.1, 0);
    arch.lineTo(-2.1, 3.4);
    arch.absarc(0, 3.4, 2.1, Math.PI, 0, true);
    arch.lineTo(2.1, 0);
    arch.lineTo(1.7, 0);
    arch.lineTo(1.7, 3.4);
    arch.absarc(0, 3.4, 1.7, 0, Math.PI, false);
    arch.lineTo(-1.7, 0);
    arch.closePath();
    const g = new THREE.ExtrudeGeometry(arch, { depth: 0.3, bevelEnabled: false, curveSegments: 16 });
    B.add(g.translate(0, y, doorZ - 0.32), mats.steelDark, 0.03);
    const plate = sign('LIMP WORKS', 3.6, 0.8, '#f3ead6', '#d8283a');
    plate.position.set(0, y + 6.2, doorZ - 0.06);
    // the fanlight: a glazed half-moon over the leaves (3.3 m) up to the round head, a transom bar and three spokes
    const fan = new THREE.Shape();
    fan.moveTo(-1.7, 3.3);
    fan.lineTo(1.7, 3.3);
    fan.lineTo(1.7, 3.4);
    fan.absarc(0, 3.4, 1.7, 0, Math.PI, false);
    fan.closePath();
    const fg = new THREE.ShapeGeometry(fan, 16);
    const fuv = fg.attributes.uv as THREE.BufferAttribute, fpos = fg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fpos.getX(i) + 1.7) / 3.4, 0.45 + ((fpos.getY(i) - 3.3) / 1.8) * 0.55);
    B.add(fg.rotateY(Math.PI).translate(0, y, doorZ - 0.12), mats.glow, 0);
    B.add(new THREE.BoxGeometry(3.4, 0.14, 0.12).translate(0, y + 3.32, doorZ - 0.14), mats.steelDark, 0.02);
    for (const a of [Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75]) {
      const bar = new THREE.BoxGeometry(0.07, 1.7, 0.08).translate(0, 0.85, 0).rotateZ(a - Math.PI / 2);
      B.add(bar.translate(0, y + 3.4, doorZ - 0.14), mats.steelDark, 0.015);
    }
    plate.rotation.y = Math.PI;
    f.group.add(plate);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      const plank = new THREE.Mesh(block(1.68, 3.3, 0.14, 0.01, s + 3, 1.2).translate((-s * 1.68) / 2, 1.65, 0), mats.wood);
      plank.castShadow = plank.receiveShadow = true;
      leaf.add(plank);
      for (const yy of [0.6, 1.7, 2.8]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.04).translate((-s * 1.6) / 2, yy, -0.09), mats.steelDark);
        leaf.add(strap);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 14).translate(-s * 1.35, 1.6, -0.12), mats.brass);
      leaf.add(ring);
      leaf.position.set(s * 1.68, y, doorZ - 0.2);
      leaf.userData.noPaint = true;
      f.group.add(leaf);
      leaves.push(leaf);
    }
  }

  // ───────────── outside the door: the landing where the paper boat moored (seen only while the door is open) ─────────────
  const outside = new THREE.Group();
  outside.name = 'works-outside';
  outside.visible = false;
  outside.userData.noPaint = true;
  f.group.add(outside);
  let boat: THREE.Object3D | null = null;
  {
    const deck = new THREE.Mesh(worldUV(new THREE.BoxGeometry(5.6, 0.6, 4.2).translate(0, y - 0.3, IN + 0.8 + 2.1), 2), mats.steelDark);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 140).rotateX(-Math.PI / 2).translate(0, y - 1.0, IN + 70), new THREE.MeshStandardMaterial({ color: '#79c3df', roughness: 0.3 }));
    outside.add(deck, water);
    for (const sx of [-2.5, 2.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10).translate(sx, y + 0.35, IN + 4.6), mats.red);
      outside.add(post);
    }
    boat = paperBoatModel(ctx.assets);
    if (boat) {
      boat.position.set(3.9, y - 1.05, IN + 5.4);
      boat.rotation.y = Math.PI / 2;
      outside.add(boat);
    }
  }

  // ───────────── entry yard: the Mending Bay ─────────────
  // crate stacks (the east one wears a crown), paper stacks, a mending bench of crossed-out drawings
  crate(B, phys, V(16.6, y, 16.4), 1.3, 0.1, mats, 1);
  crate(B, phys, V(16.7, y + 1.3, 16.5), 1.3, -0.15, mats, 2);
  crate(B, phys, V(18.6, y, 16.0), 1.2, 0.3, mats, 3);
  crate(B, phys, V(-18.6, y, 19.4), 1.4, 0.2, mats, 4);
  crate(B, phys, V(-16.9, y, 19.8), 1.1, -0.2, mats, 5);
  floorCrown(f, L, 'crown-w3-crates', V(16.7, y + 2.6 + 0.9, 16.5), 'On top of the crate stack by the tower door');
  for (const [x, z, n] of [[-12.5, 19.6, 7], [-11.6, 19.8, 4], [8.4, 19.6, 6], [10, 19.9, 9]] as [number, number, number][]) paperStack(B, V(x, y, z), n, mats, x * 3 + z);
  {
    // the mending bench (a long steel table with crossed-out sheets on it)
    const bx = -14, bz = 13.4;
    B.add(block(5, 0.12, 1.2, 0.005, 7, 1).translate(bx, y + 0.95, bz), mats.steel, 0.03);
    for (const sx of [-2.3, 2.3]) for (const sz of [-0.5, 0.5]) B.add(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8).translate(bx + sx, y + 0.45, bz + sz), mats.steelDark, 0.02);
    for (let i = 0; i < 4; i++) paperStack(B, V(bx - 1.8 + i * 1.2, y + 1.01, bz), 2 + (i % 3), mats, i + 40);
    phys.addStaticBox(V(bx, y + 0.5, bz), V(2.5, 0.5, 0.6));
  }
  f.marks.add(0, V(-6, y + 0.01, 15.5), V(0, 1, 0), 2.6, 0.3);
  f.marks.add(1, V(9, y + 0.01, 14.2), V(0, 1, 0), 2.2, -0.4);

  // ───────────── the Loading Dock: a 2.6 m ledge across the hall (only Long Legs jump it) ─────────────
  {
    const d = W.dock, top = W.dockY;
    const cz = (d.z0 + d.z1) / 2, hz = (d.z1 - d.z0) / 2;
    B.add(block(IN * 2, top, hz * 2, 0.0, 11, 2).translate(0, y + top / 2, cz), mats.steelDark, 0);
    // the front face: a giant painted ruler (CORRECT HEIGHT ONLY) and a hazard nosing on top
    B.add(new THREE.BoxGeometry(IN * 2, 0.5, 0.06).translate(0, y + top - 0.6, d.z1 + 0.03), mats.ruler, 0);
    B.add(new THREE.BoxGeometry(IN * 2, 0.14, 0.2).translate(0, y + top - 0.07, d.z1 - 0.06), mats.hazard, 0.02);
    B.add(new THREE.BoxGeometry(IN * 2, 0.14, 0.2).translate(0, y + top - 0.07, d.z0 + 0.06), mats.hazard, 0.02);
    phys.addStaticBox(V(0, y + top / 2, cz), V(IN, top / 2, hz));
    const s1 = sign('LONG LEGS ONLY', 3.2, 0.7);
    s1.position.set(-4, y + 1.2, d.z1 + 0.07);
    s1.rotation.y = 0;
    f.group.add(s1);
    // bollards and a crate on the dock top
    for (const x of [-10, -2, 6, 14]) {
      const prof = [v2(0.22, 0), v2(0.24, 0.1), v2(0.2, 0.14), v2(0.18, 0.7), v2(0.24, 0.76), v2(0.2, 0.86), v2(0.001, 0.9)];
      B.add(lathe(prof, 12, 0.01).translate(x, y + top, d.z0 + 0.5), mats.hazard, 0.03);
    }
    crate(B, phys, V(-19.4, y + top, 9.4), 1.2, 0.25, mats, 6);
    floorCrown(f, L, 'crown-w3-dock', V(-19.4, y + top + 1.2 + 0.9, 9.4), 'On a crate at the west end of the Loading Dock');
    f.marks.add(2, V(-4, y + top + 0.01, 10), V(0, 1, 0), 2.4, 0.2);
  }

  // ───────────── the belt floor: two conveyor beds + the machines at their ends ─────────────
  const belts: Belt[] = [];
  const beltTex = ctx.assets.tex('w3_belt');
  const trayGeo = (() => {
    const g = new THREE.BoxGeometry(1.4, 0.08, 1.7);
    return g;
  })();
  const sheetGeo = (() => {
    const g = new THREE.BoxGeometry(1.1, 0.02, 1.4);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, 0.5 + uv.getY(i) * 0.5);
    return g;
  })();
  for (const bd of W.belts) {
    const z0 = bd.z - bd.half, z1 = bd.z + bd.half;
    const len = bd.x1 - bd.x0;
    const cx = (bd.x0 + bd.x1) / 2;
    // the bed: a steel frame, legs, end rollers, a hazard lip on each side
    B.add(block(len, bd.top - 0.1, bd.half * 2, 0.0, bd.z, 2).translate(cx, y + (bd.top - 0.1) / 2, bd.z), mats.steelDark, 0.04);
    for (const zz of [z0 - 0.06, z1 + 0.06]) B.add(new THREE.BoxGeometry(len, 0.12, 0.12).translate(cx, y + bd.top - 0.02, zz), mats.hazard, 0.02);
    for (const xx of [bd.x0, bd.x1]) B.add(new THREE.CylinderGeometry(0.46, 0.46, bd.half * 2 - 0.1, 16).rotateX(Math.PI / 2).translate(xx, y + bd.top - 0.46, bd.z), mats.steel, 0.03);
    for (let x = bd.x0 + 2; x < bd.x1 - 1; x += 4) B.add(new THREE.CylinderGeometry(0.12, 0.12, bd.half * 2 + 0.2, 8).rotateX(Math.PI / 2).translate(x, y + 0.35, bd.z), mats.brass, 0.02);
    phys.addStaticBox(V(cx, y + bd.top / 2, bd.z), V(len / 2 + 0.4, bd.top / 2, bd.half));
    // the moving belt surface: its own mesh (the texture scrolls)
    const tex = beltTex.clone();
    tex.repeat.set(len / 2, 1);
    tex.needsUpdate = true;
    const surf = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, bd.half * 2 - 0.16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    surf.position.set(cx, y + bd.top - 0.02, bd.z);
    surf.receiveShadow = true;
    surf.userData.noPaint = true;
    f.group.add(surf);
    // machines at the ends: the INTAKE (trays come out) and the CORRECTOR (trays go in, a red stamp pounds)
    const endIn = bd.dir > 0 ? bd.x0 : bd.x1;
    const endOut = bd.dir > 0 ? bd.x1 : bd.x0;
    for (const [ex, name] of [[endIn, 'INTAKE'], [endOut, 'CORRECTOR']] as [number, string][]) {
      const sx = Math.sign(ex);
      const hx = (IN - Math.abs(ex)) / 2;
      const mx = ex + sx * hx;
      B.add(block(hx * 2, 3.0, bd.half * 2 + 0.8, 0.02, ex, 2).translate(mx, y + 1.5, bd.z), mats.steel, 0.05);
      B.add(block(hx * 2 + 0.2, 0.25, bd.half * 2 + 1.0, 0.01, ex + 1, 1).translate(mx, y + 3.12, bd.z), mats.steelDark, 0.03);
      // the mouth: rubber flaps over the belt's end
      for (let k = -2; k <= 2; k++) B.add(new THREE.BoxGeometry(0.06, 0.9, 0.42).translate(ex + sx * 0.05, y + bd.top + 0.5, bd.z + k * 0.46), mats.rubber, 0);
      phys.addStaticBox(V(mx, y + 1.5, bd.z), V(hx, 1.5, bd.half + 0.4));
      const s2 = sign(name, 2.2, 0.5, name === 'CORRECTOR' ? '#d8283a' : '#f3ead6', name === 'CORRECTOR' ? '#ffffff' : '#1a1420');
      s2.position.set(ex + sx * 0.04, y + 2.3, bd.z);
      s2.rotation.y = -sx * Math.PI / 2;
      f.group.add(s2);
      if (name === 'CORRECTOR') f.marks.add(0, V(ex + sx * 0.09, y + 1.6, bd.z + 0.9), V(-sx, 0, 0), 0.9, 0);
    }
    // trays of crossed-out drawings riding the belt (instanced: two draw calls per belt)
    const n = 6;
    const trays = new THREE.InstancedMesh(trayGeo, mats.steel, n);
    const sheets = new THREE.InstancedMesh(sheetGeo, mats.paper, n);
    for (const im of [trays, sheets]) {
      im.userData.noPaint = true;
      im.castShadow = true;
      im.frustumCulled = false;
      f.group.add(im);
    }
    belts.push({ x0: bd.x0, x1: bd.x1, z0, z1, top: y + bd.top, vx: bd.speed * bd.dir, tex, trays: [trays, sheets] });
  }
  const s3 = sign('CONVEYOR HALL', 3.4, 0.75, '#2a4be0', '#ffffff');
  s3.position.set(0, y + 6.6, 8.05);
  s3.rotation.y = Math.PI;
  f.group.add(s3);
  f.marks.add(1, V(-12, y + 0.01, -1.2), V(0, 1, 0), 2.4, 0.5);
  f.marks.add(2, V(11, y + 0.01, -10.6), V(0, 1, 0), 2.2, 0);

  // ───────────── the shredder hopper under F2's pit (hangs from the ceiling) ─────────────
  {
    const hy0 = W.hopperY, hy1 = FY[1] - 0.62;
    const cx = (hop.x0 + hop.x1) / 2;
    B.add(block(hop.x1 - hop.x0, hy1 - hy0, hop.z1 - hop.z0, 0.0, 21, 2).translate(cx, (hy0 + hy1) / 2, 0), mats.steel, 0);
    for (const x of [hop.x0 - 0.05, hop.x1 + 0.05]) B.add(new THREE.BoxGeometry(0.1, 0.3, hop.z1 - hop.z0).translate(x, hy0 + 0.2, 0), mats.hazard, 0);
    for (let z = -18; z <= 18; z += 6) for (const x of [hop.x0 + 0.6, hop.x1 - 0.6]) B.add(new THREE.CylinderGeometry(0.4, 0.55, 0.9, 10).translate(x, hy0 - 0.4, z), mats.steelDark, 0.03);
    // hollow: a bottom plate and two side walls (the shredder pit above sits inside it — never a floor at 8.4 m)
    phys.addStaticBox(V(cx, hy0 + 0.2, 0), V((hop.x1 - hop.x0) / 2, 0.2, IN));
    for (const x of [hop.x0 + 0.08, hop.x1 - 0.08]) phys.addStaticBox(V(x, (hy0 + hy1) / 2, 0), V(0.08, (hy1 - hy0) / 2, IN));
    for (const z of [12.2, -14.2]) {
      const s4 = sign('SHREDDER ABOVE', 3.0, 0.6, '#ffd23a');
      s4.position.set(0, hy0 + 1.1, z);
      s4.rotation.y = z > 0 ? 0 : Math.PI;
      f.group.add(s4);
    }
  }

  // ───────────── the north strip: lift shaft frame, the tape lock ─────────────
  {
    const s = W.shaft;
    for (const [x, z] of [[s.x0, s.z1], [s.x0, s.z0 + 0.3]] as [number, number][]) girder(B, V(x, y, z), V(x, FY[1] - 0.6, z), 0.42, 0.36, mats.steelDark);
    // the shaft's west side: a riveted steel screen (the lift is only entered from the south)
    B.add(block(0.16, 8.2, s.z1 - s.z0 - 0.4, 0.0, 31, 2).translate(s.x0 - 0.1, y + 4.1, (s.z0 + s.z1) / 2), mats.steel, 0.03);
    phys.addStaticBox(V(s.x0 - 0.1, y + 4.1, (s.z0 + s.z1) / 2), V(0.1, 4.1, (s.z1 - s.z0) / 2));
    pipe(B, [V(13.4, y + 7.6, -21.2), V(13.4, y + 7.6, -14.2), V(-6, y + 7.6, -14.2)], 0.18, mats.red, mats.steelDark);
    const s5 = sign('FREIGHT LIFT', 2.8, 0.6, '#f3ead6', '#2a4be0');
    s5.position.set(W.cage.x, y + 7.5, s.z1 + 0.25);
    s5.rotation.y = 0;
    f.group.add(s5);
  }
  const tapeG = new THREE.Group();
  let tapeCol: RAPIER.Collider | null = null;
  {
    const x0 = W.shaft.x0 - 0.3, x1 = IN - 0.1, z = W.tapeZ;
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const me = new THREE.Mesh(g, m);
      me.castShadow = true;
      tapeG.add(me);
    };
    for (const x of [x0, (x0 + x1) / 2, x1]) {
      mk(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 8).translate(x, y + 0.6, z), mats.steelDark);
      mk(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 10).translate(x, y + 0.05, z), mats.steelDark);
    }
    const stripe = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 32;
      const g = c.getContext('2d')!;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#d8283a';
        g.fillRect(i * 32, 0, 32, 32);
      }
      g.fillStyle = '#1a1420';
      g.font = 'bold 18px sans-serif';
      g.fillText('CORRECT', 90, 23);
      return c;
    })());
    stripe.colorSpace = THREE.SRGBColorSpace;
    stripe.wrapS = THREE.RepeatWrapping;
    stripe.repeat.set((x1 - x0) / 2, 1);
    const tapeMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 });
    for (const yy of [0.55, 1.05]) mk(new THREE.BoxGeometry(x1 - x0, 0.14, 0.03).translate((x0 + x1) / 2, y + yy, z), tapeMat);
    // a wire shutter behind the tape, up to the ceiling: Long Legs jump 4 m, a waist-high tape alone would not stop him
    const top = FY[1] - 0.62;
    const sB = new StaticBatch();
    screen(sB, null, V(x0, y, z - 0.08), V(x1, y, z - 0.08), y, top, mats);
    sB.flush(tapeG, 'works-lift-shutter');
    tapeG.userData.noPaint = true;
    f.group.add(tapeG);
    tapeCol = phys.addStaticBox(V((x0 + x1) / 2, (y + top) / 2, z), V((x1 - x0) / 2, (top - y) / 2, 0.12));
  }
  let tapeOpen = false;
  let tapeT = -1;
  const tape: Lock = {
    get open() {
      return tapeOpen;
    },
    unlock() {
      if (tapeOpen) return;
      tapeOpen = true;
      tapeT = 0;
      if (tapeCol) {
        phys.untag(tapeCol);
        phys.world.removeCollider(tapeCol, false);
        tapeCol = null;
      }
      ctx.audio.play('gateOpen', { pos: W.cage, vol: 0.7 });
    },
  };

  // ───────────── railings, checkpoints, collectibles, regions ─────────────
  railing(B, phys, V(-IN + 0.2, y + W.dockY, W.dock.z0 + 0.15), V(-8.6, y + W.dockY, W.dock.z0 + 0.15), mats);
  const cpAt = V(-15, y, 6.6);
  L.checkpoints.push(new Checkpoint(ctx, 'cp-hall', V(5, y, 14.8), Math.PI), new Checkpoint(ctx, 'cp-belts', cpAt, Math.PI));
  for (const c of L.checkpoints.slice(-2)) f.group.attach(c.root);
  dropTrail(f, L, 'drop-w3-entry', [V(0, y, 14.4), V(0, y, 12.6)], 0.9);
  dropTrail(f, L, 'drop-w3-dock', [V(-6, y + W.dockY, 10), V(6, y + W.dockY, 10)], 1.7);
  dropTrail(f, L, 'drop-w3-beltA', [V(-12, y + 1, 3.8), V(12, y + 1, 3.8)], 2.4);
  dropTrail(f, L, 'drop-w3-aisle', [V(-14, y, -1.2), V(14, y, -1.2)], 2.2);
  dropTrail(f, L, 'drop-w3-north', [V(0, y, -10.6), V(11, y, -10.6), V(11, y, -16.5)], 1.8);
  floorCrown(f, L, 'crown-w3-corrector', V(19.3, y + 3.25 + 0.9, W.belts[0].z), 'On the roof of the CORRECTOR at the end of the first belt');
  region(L, 'The Freight Lift', 6, y - 1, -IN, IN, y + 8, -12);
  region(L, 'The Conveyor Hall', -IN, y - 1, -IN, IN, y + 8, 8);
  region(L, 'Limp Works', -IN, y - 1, 8, IN, y + 8, IN);

  // (LimpWorks flushes the floor once the Guardians have added their models: finishFloor)
  // the wash: grey steel → the colours WAI paints in
  f.washer.add(mats.steel, '#ffd9a8');
  f.washer.add(mats.steelDark, '#7f86ff');
  f.washer.add(mats.brick, '#ffd0e4');
  f.washer.add(mats.red, '#ffd23a');
  f.washer.add(mats.grid, '#fff6e0');

  const carry = (p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null => {
    for (const b of belts) {
      if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && Math.abs(p.y - b.top) < 0.18) return out.set(b.vx, 0, 0);
    }
    return null;
  };

  let doorK = 0;
  return {
    f,
    belts,
    carry,
    tape,
    checkpointAt: cpAt,
    setDoor(k) {
      leaves[0].rotation.y = -k * 1.4;
      leaves[1].rotation.y = k * 1.4;
      doorK = k;
      outside.visible = k > 0.001;
    },
    get doorK() {
      return doorK;
    },
    update(dt, time) {
      if (boat && outside.visible) {
        boat.position.y = y - 1.05 + Math.sin(time * 1.3) * 0.06;
        boat.rotation.z = Math.sin(time * 0.9) * 0.04;
      }
      for (const b of belts) {
        b.tex.offset.x = (b.tex.offset.x - (b.vx * dt) / 2) % 1;
        const len = b.x1 - b.x0;
        const n = b.trays[0].count;
        for (let i = 0; i < n; i++) {
          const u = (((time * b.vx + (i * len) / n) % len) + len) % len;
          _p.set(b.x0 + u, b.top + 0.04, (b.z0 + b.z1) / 2);
          // trays dip into the machines at both ends (hidden inside the housings)
          const edge = Math.min(u, len - u);
          if (edge < 0.8) _p.y -= (0.8 - edge) * 2;
          _m.compose(_p, _q, _s);
          b.trays[0].setMatrixAt(i, _m);
          _p.y += 0.05;
          _m.compose(_p, _q, _s);
          b.trays[1].setMatrixAt(i, _m);
        }
        b.trays[0].instanceMatrix.needsUpdate = true;
        b.trays[1].instanceMatrix.needsUpdate = true;
      }
      if (tapeT >= 0 && tapeT < 1) {
        // the shutter rolls up into the ceiling (eased), the tape with it
        tapeT = Math.min(1, tapeT + dt * 0.7);
        tapeG.position.y = (1 - (1 - tapeT) ** 3) * (FY[1] - 0.6);
        tapeG.visible = tapeT < 1;
      }
      f.washer.update(dt);
    },
  };
}
