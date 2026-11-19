/**
 * [INPUT]: depends on StaticBatch and the lathe/loft builders from ./HarborKit; toon from render/Materials;
 *          DoodleEyes from render/DoodleEye (the dial's eyes)
 * [OUTPUT]: exports buildClockTower() → ClockTowerBuilt (bell, dial face, hands, eyes, setLit)
 * [POS]: Mute Harbor's Guardian 2 set piece; MuteHarbor places it, owns its collider and calls setLit(true) when it rings
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../../core/AssetManager';
import { toon } from '../../render/Materials';
import { DoodleEyes, EYE_STYLES } from '../../render/DoodleEye';
import { DUSK } from './HarborTerrain';
import { StaticBatch, archWall, block, crownGeos, lathe, latheHull, loft, loftHull, ring, v2, worldUV } from './HarborKit';

/**
 * Clock Square's tower (Guardian 2): a battered stone plinth with corner buttresses, a plaster
 * shaft with arched windows and a porch, a projecting clock stage with quoins and a brass-rimmed
 * dial (a sleepy face: its hands are its brows), an arcaded belfry with the big bell on its
 * headstock, and a flared tile spire with dormers, a crown and a weather vane.
 *
 * The whole thing leans a little, like everything drawn in this town. Static parts are merged per
 * material (+ one ink hull); only the dial's face parts and the bell are separate, for the story.
 * Local space: origin at the tower's centre on the ground. The tower's collider (a 6 × 6 box) is
 * the level's business — nothing here reaches more than a hand's width outside it at walking height.
 */
export interface ClockTowerBuilt {
  /** Pivot at the headstock: swing it with rotation.x. */
  bigBell: THREE.Group;
  /** Has children named 'clock-smear' and 'clock-mouth'. */
  clockFace: THREE.Group;
  handH: THREE.Group;
  handM: THREE.Group;
  /** The dial's eyes: sleepy and grey until setLit(true). */
  eyes: DoodleEyes;
  /** Lights in the windows once the clock is awake. */
  setLit(on: boolean): void;
}

const sq = (h: number): [number, number][] => [[h, h], [-h, h], [-h, -h], [h, -h]];
/** The tower's lean (metres sideways at height y). */
const lean = (y: number) => (y > 0 ? 0.0011 * y * y : 0);

export function buildClockTower(
  root: THREE.Object3D,
  assets: AssetManager,
  o: { x: number; z: number; base: number; bellPos: THREE.Vector3; facePos: THREE.Vector3 },
): ClockTowerBuilt {
  const T = (n: string) => assets.tex(n);
  const wall = toon({ map: T('stone_purple'), color: '#d8c8ff' });
  const stone = toon({ map: T('stone_cream'), color: '#c8b8ff' });
  const trim = toon({ map: T('h2_p_cream') });
  const roofM = toon({ map: T('roof'), color: DUSK.neon });
  const brass = toon({ map: T('h2_p_brass') });
  const timber = toon({ map: T('wood'), color: '#a77a8a' });
  const ink = toon({ map: T('h2_p_ink') });
  const glass = toon({ map: T('h2_window') }) as unknown as THREE.MeshStandardMaterial;
  glass.alphaTest = 0.5;
  glass.emissiveMap = T('h2_window_lit');
  const door = toon({ map: T('h2_door') });
  const dark = new THREE.MeshBasicMaterial({ color: '#1c1650' });

  const B = new StaticBatch();
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  /** The four sides of the tower: [yaw, outward normal]. */
  const SIDES: [number, number, number][] = [[0, 0, 1], [Math.PI / 2, 1, 0], [Math.PI, 0, -1], [-Math.PI / 2, -1, 0]];

  // ── plinth: battered stone, sunk into the square ──
  {
    const rings = [ring(sq(3.14), -0.9), ring(sq(3.1), 0.4), ring(sq(3.0), 1.55)];
    B.add(worldUV(loft(rings), 3), stone, 0, loftHull(rings, 0.06));
    B.add(at(block(6.25, 0.3, 6.25, 0.02, 3, 2), 0, 1.68, 0), trim, 0.04);
  }
  // ── shaft ──
  B.add(at(block(5.2, 5.8, 5.2, 0.03, 91, 4, 3), 0, 4.7, 0), wall, 0.06);
  // corner buttresses with sloped caps
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      B.add(at(block(0.98, 3.9, 0.98, 0.03, 11 + sx * 3 + sz, 3, 2), sx * 2.56, 3.75, sz * 2.56), stone, 0.05);
      const cap = [ring(sq(0.52), 5.7, 1, 1, sx * 2.56, sz * 2.56), ring(sq(0.3), 6.9, 1, 1, sx * 2.42, sz * 2.42), ring(sq(0.05), 7.25, 1, 1, sx * 2.36, sz * 2.36)];
      B.add(worldUV(loft(cap), 2), trim, 0, loftHull(cap, 0.04));
    }
  // string course + dentils under the clock stage
  B.add(at(block(5.95, 0.36, 5.95, 0.02, 5, 2), 0, 7.72, 0), trim, 0.04);
  for (const [yaw] of SIDES)
    for (let i = 0; i < 7; i++) {
      const g = new THREE.BoxGeometry(0.3, 0.26, 0.3);
      g.translate(-2.4 + i * 0.8, 7.42, 2.72);
      g.rotateY(yaw);
      B.add(g, trim, 0.02);
    }
  // ── the clock stage: a projecting storey with corner quoins ──
  B.add(at(block(5.7, 6.0, 5.7, 0.025, 37, 4, 3), 0, 10.9, 0), wall, 0.06);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (let i = 0; i < 9; i++) {
        const long = i % 2 === 0;
        const g = new THREE.BoxGeometry(long ? 0.95 : 0.6, 0.5, long ? 0.6 : 0.95);
        g.translate(sx * (2.9 - (long ? 0.475 : 0.3) + 0.06), 8.25 + i * 0.64, sz * (2.9 - (long ? 0.3 : 0.475) + 0.06));
        B.add(worldUV(g, 1.5, i * 0.3, i * 0.17), i % 3 === 1 ? stone : trim, 0.02);
      }
  // cornice
  B.add(at(block(6.15, 0.3, 6.15, 0.02, 7, 2), 0, 14.05, 0), trim, 0.03);
  B.add(at(block(6.65, 0.3, 6.65, 0.025, 8, 2), 0, 14.35, 0), trim, 0.05);

  // ── windows ──
  const windowAt = (yaw: number, u: number, y: number, dist: number, w = 1.0) => {
    const h = w * (320 / 192);
    const pane = new THREE.PlaneGeometry(w, h);
    pane.translate(u, y, dist + 0.045);
    pane.rotateY(yaw);
    B.add(pane, glass, 0);
    const sill = block(w + 0.36, 0.14, 0.34, 0.01, 3, 1);
    sill.translate(u, y - h / 2 - 0.05, dist + 0.1);
    sill.rotateY(yaw);
    B.add(sill, trim, 0.025);
  };
  for (const [yaw] of SIDES.slice(1)) windowAt(yaw, 0, 4.9, 2.6, 1.1);
  windowAt(0, 0, 5.75, 2.6, 0.8);
  // round windows on the clock stage's other three faces (the dial is on the south)
  for (const [yaw] of SIDES.slice(1)) {
    const rim = new THREE.TorusGeometry(1.25, 0.17, 6, 24);
    rim.translate(0, 10.9, 2.86);
    rim.rotateY(yaw);
    B.add(rim, trim, 0.03);
    const pane = new THREE.CircleGeometry(1.2, 24);
    pane.translate(0, 10.9, 2.9);
    pane.rotateY(yaw);
    B.add(pane, dark, 0);
    for (const rot of [0, Math.PI / 2]) {
      const bar = new THREE.BoxGeometry(2.4, 0.1, 0.06);
      bar.rotateZ(rot + 0.08);
      bar.translate(0, 10.9, 2.93);
      bar.rotateY(yaw);
      B.add(bar, ink, 0);
    }
  }
  // ── the porch on the square's side: a painted door under a little gabled hood ──
  {
    B.add(at(block(2.3, 3.0, 0.5, 0.02, 13, 2), 0, 1.5, 2.97), trim, 0.04);
    const d = new THREE.PlaneGeometry(1.5, 2.5);
    d.translate(0, 1.33, 3.235);
    B.add(d, door, 0);
    const hood = [
      [new THREE.Vector3(-1.45, 3.0, 2.7), new THREE.Vector3(1.45, 3.0, 2.7), new THREE.Vector3(0, 3.85, 2.7)],
      [new THREE.Vector3(-1.45, 3.0, 3.4), new THREE.Vector3(1.45, 3.0, 3.4), new THREE.Vector3(0, 3.85, 3.4)],
    ];
    B.add(worldUV(loft(hood, true, true), 1.5), roofM, 0, loft(hood.map((r, i) => r.map((p) => new THREE.Vector3(p.x * 1.05, 3.0 + (p.y - 3.0) * 1.1 - 0.05, p.z + (i ? 0.05 : -0.05)))), true, true, 0));
  }

  // ── belfry: corner piers, an arcade on each side, a balustrade, the bell's beam ──
  const FLOOR = 14.5;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) B.add(at(block(0.86, 3.7, 0.86, 0.02, 21 + sx + sz * 2, 2, 2), sx * 2.5, FLOOR + 1.85, sz * 2.5), stone, 0.04);
  for (const [yaw] of SIDES) {
    const arc = archWall(4.2, 1.9, 3.3, 1.5, 0.6);
    arc.translate(0, FLOOR + 1.8, 2.5);
    arc.rotateY(yaw);
    B.add(worldUV(arc, 2), trim, 0.03);
    const key = block(0.5, 0.6, 0.72, 0.01, 2, 1);
    key.translate(0, FLOOR + 3.42, 2.5);
    key.rotateY(yaw);
    B.add(key, stone, 0.02);
    const rail = block(4.2, 0.16, 0.32, 0.01, 4, 1);
    rail.translate(0, FLOOR + 0.95, 2.55);
    rail.rotateY(yaw);
    B.add(rail, trim, 0.025);
    for (let i = 0; i < 6; i++) {
      const prof = [v2(0.1, 0), v2(0.13, 0.12), v2(0.07, 0.3), v2(0.15, 0.55), v2(0.07, 0.78), v2(0.11, 0.88)];
      const bal = lathe(prof, 6, 0, 1);
      bal.translate(-1.5 + i * 0.6, FLOOR, 2.55);
      bal.rotateY(yaw);
      B.add(bal, trim, 0.02);
    }
  }
  B.add(at(block(5.1, 0.3, 0.36, 0.01, 6, 1.5), 0, FLOOR + 3.52, 0), timber, 0.03);
  B.add(at(block(6.3, 0.36, 6.3, 0.02, 9, 2), 0, FLOOR + 3.88, 0), trim, 0.04);

  // ── the spire: flared tiles, a dormer on each face, crown + weather vane ──
  const R0 = FLOOR + 4.06;
  {
    const rings = [
      ring(sq(3.5), R0),
      ring(sq(3.42), R0 + 0.22),
      ring(sq(2.4), R0 + 1.05),
      ring(sq(1.55), R0 + 2.3),
      ring(sq(0.9), R0 + 3.8),
      ring(sq(0.42), R0 + 5.3),
      ring(sq(0.16), R0 + 6.2),
    ];
    B.add(worldUV(loft(rings, true, true, 0.75), 2.2, 0, 0, true), roofM, 0, loftHull(rings, 0.08));
    for (const [yaw] of SIDES) {
      const y0 = R0 + 1.0;
      const box = block(0.95, 0.9, 1.1, 0.01, 5, 1.5);
      box.translate(0, y0 + 0.45, 2.15);
      box.rotateY(yaw);
      B.add(box, trim, 0.03);
      const pane = new THREE.PlaneGeometry(0.5, 0.62);
      pane.translate(0, y0 + 0.42, 2.71);
      pane.rotateY(yaw);
      B.add(pane, dark, 0);
      const gab = [
        [new THREE.Vector3(-0.68, y0 + 0.85, 1.5), new THREE.Vector3(0.68, y0 + 0.85, 1.5), new THREE.Vector3(0, y0 + 1.55, 1.5)],
        [new THREE.Vector3(-0.68, y0 + 0.85, 2.85), new THREE.Vector3(0.68, y0 + 0.85, 2.85), new THREE.Vector3(0, y0 + 1.55, 2.85)],
      ];
      const gg = worldUV(loft(gab, true, true), 1.2);
      gg.rotateY(yaw);
      const gh = loft(gab.map((r, i) => r.map((p) => new THREE.Vector3(p.x * 1.07, y0 + 0.8 + (p.y - y0 - 0.85) * 1.1, p.z + (i ? 0.05 : -0.05)))), true, true, 0);
      gh.rotateY(yaw);
      B.add(gg, roofM, 0, gh);
    }
    const tip = R0 + 6.2;
    for (const g of crownGeos(1.25)) B.add(at(g, 0, tip + 0.1, 0), brass, 0.03);
    B.add(at(new THREE.SphereGeometry(0.36, 12, 9), 0, tip + 0.3, 0), brass, 0.03);
    B.add(at(new THREE.CylinderGeometry(0.045, 0.06, 1.7, 6), 0, tip + 1.1, 0), ink, 0.012);
    // the vane: an arrow that points where the wind used to sing
    const shaft = new THREE.BoxGeometry(1.7, 0.07, 0.05).translate(0, tip + 1.55, 0);
    const head = new THREE.ConeGeometry(0.17, 0.42, 4).rotateZ(-Math.PI / 2).translate(1.0, tip + 1.55, 0);
    const tail = new THREE.BoxGeometry(0.46, 0.4, 0.04).translate(-0.72, tip + 1.55, 0);
    for (const g of [shaft, head, tail]) B.add(g.rotateY(0.6), brass, 0.02);
    B.add(at(new THREE.SphereGeometry(0.13, 8, 6), 0, tip + 2.0, 0), brass, 0.02);
  }

  // the lean (everything so far), then one mesh per material
  B.warp((g) => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + lean(pos.getY(i)));
    pos.needsUpdate = true;
  });
  const body = new THREE.Group();
  body.name = 'clock-tower';
  body.position.set(o.x, o.base, o.z);
  B.flush(body, 'clock-tower-part');
  root.add(body);

  // ── the dial (south side): a sleepy face ──
  const clockFace = new THREE.Group();
  const handH = new THREE.Group();
  const handM = new THREE.Group();
  const eyes = new DoodleEyes({ ...EYE_STYLES.SLEEPY, size: 0.46, spacing: 1.5, oval: 0.9, iris: '#e0a236', lid: '#9d8cf0', selfLit: 0.4, bulge: 0.4 });
  {
    const F = new StaticBatch();
    // brass bezel (a moulded ring) from the wall out past the dial
    const prof = [v2(2.24, -0.2), v2(2.62, -0.2), v2(2.68, -0.02), v2(2.56, 0.14), v2(2.4, 0.22), v2(2.27, 0.1)];
    const bz = lathe(prof, 40, 0.008, 2).rotateX(Math.PI / 2);
    F.add(bz, brass, 0, latheHull(prof, 40, 0.008, 0.06).rotateX(Math.PI / 2));
    // little bolts round the bezel
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      F.add(new THREE.SphereGeometry(0.075, 6, 5).translate(Math.sin(a) * 2.5, Math.cos(a) * 2.5, 0.2), ink, 0);
    }
    F.flush(clockFace, 'clock-bezel');
    const dial = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), toon({ map: T('h2_dial'), relief: 0.5 }));
    dial.position.z = 0.1;
    dial.receiveShadow = true;
    clockFace.add(dial);
    const inkFlat = new THREE.MeshBasicMaterial({ color: '#1a1420' });
    // shared doodle eyes (render/DoodleEye): heavy indigo lids while the clock is silenced, open once it rings
    eyes.group.position.set(0, 0.35, 0.13);
    eyes.grey = 0.7;
    eyes.settle();
    clockFace.add(eyes.group);
    // its mouth: rubbed out (a grey eraser smear) until the bell rings
    const smear = new THREE.Mesh(new THREE.CircleGeometry(0.75, 18), new THREE.MeshBasicMaterial({ color: '#cfc8e2' }));
    smear.scale.set(1.3, 0.45, 1);
    smear.position.set(0, -0.8, 0.12);
    smear.name = 'clock-smear';
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 6, 16, Math.PI), inkFlat);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.6, 0.13);
    mouth.visible = false;
    mouth.name = 'clock-mouth';
    clockFace.add(smear, mouth);
    // hands: inked spades with an open ring near the tip, on a brass hub
    const hand = (len: number, w: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w * 0.5, -0.28);
      s.lineTo(w * 0.5, -0.28);
      s.lineTo(w * 0.42, len * 0.55);
      s.quadraticCurveTo(w * 1.7, len * 0.7, w * 0.3, len * 0.9);
      s.lineTo(0, len);
      s.lineTo(-w * 0.3, len * 0.9);
      s.quadraticCurveTo(-w * 1.7, len * 0.7, -w * 0.42, len * 0.55);
      s.closePath();
      const hole = new THREE.Path();
      hole.absellipse(0, len * 0.72, w * 0.5, len * 0.07, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 6 }), inkFlat);
      m.userData.noPaint = true;
      return m;
    };
    handH.add(hand(1.2, 0.2));
    handM.add(hand(1.72, 0.14));
    handH.position.z = 0.2;
    handM.position.z = 0.27;
    handH.rotation.z = 1.2;
    handM.rotation.z = -0.6;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), brass);
    hub.scale.z = 0.6;
    hub.position.z = 0.34;
    clockFace.add(handH, handM, hub);
    clockFace.position.copy(o.facePos);
    clockFace.position.x += lean(o.facePos.y - o.base);
    root.add(clockFace);
  }

  // ── the big bell: hangs from its headstock on the belfry beam ──
  const bigBell = new THREE.Group();
  {
    const drop = 1.42; // pivot above the bell's old centre
    const Bb = new StaticBatch();
    const prof = [
      v2(0.001, -0.42), v2(0.3, -0.42), v2(0.5, -0.52), v2(0.62, -0.75), v2(0.7, -1.25), v2(0.86, -1.85), v2(1.18, -2.3), v2(1.5, -2.52), v2(1.56, -2.62),
      v2(1.38, -2.62), v2(1.08, -2.25), v2(0.74, -1.7), v2(0.58, -1.1), v2(0.45, -0.7), v2(0.001, -0.6),
    ];
    Bb.add(lathe(prof, 24, 0.012, 2), brass, 0, latheHull(prof.slice(0, 9), 24, 0.012, 0.06));
    // painted bands round the waist and the lip
    for (const [r, y] of [[0.74, -1.35], [1.3, -2.38]] as [number, number][]) Bb.add(new THREE.TorusGeometry(r, 0.05, 5, 24).rotateX(Math.PI / 2).translate(0, y, 0), ink, 0);
    // crown staple + headstock with iron straps
    Bb.add(new THREE.TorusGeometry(0.2, 0.07, 6, 12).translate(0, -0.3, 0), ink, 0);
    Bb.add(block(2.5, 0.46, 0.56, 0.015, 4, 1.5), timber, 0.03);
    for (const sx of [-0.8, 0.8]) Bb.add(new THREE.BoxGeometry(0.14, 0.54, 0.64).translate(sx, 0, 0), ink, 0);
    // clapper
    Bb.add(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6).translate(0, -1.5, 0), ink, 0);
    Bb.add(new THREE.SphereGeometry(0.27, 10, 8).translate(0, -2.4, 0), ink, 0);
    Bb.flush(bigBell, 'clock-bell');
    bigBell.position.copy(o.bellPos);
    bigBell.position.y += drop;
    bigBell.position.x += lean(o.bellPos.y + drop - o.base);
    root.add(bigBell);
  }

  return {
    bigBell,
    clockFace,
    handH,
    handM,
    eyes,
    setLit(on: boolean) {
      glass.emissive.set(on ? '#ffffff' : '#000000');
      glass.emissiveIntensity = on ? 0.9 : 0;
      glass.needsUpdate = true;
      eyes.open = on ? 0.9 : 0.42;
      eyes.grey = on ? 0 : 0.7;
      if (on) eyes.flash('#ffe08a');
    },
  };
}
