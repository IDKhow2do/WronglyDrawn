/**
 * [INPUT]: depends on toon/paintedMesh from render/Materials; PAL from render/PaintTextures; CrookedLeg from
 *          ./MutantModel; t() from i18n (the stamp's word)
 * [OUTPUT]: exports buildPressLook() (the walking bench press model + its animated handles), PRESS (model
 *           dimensions the brain needs) and the canvas textures for floor marks (CORRECT print, landing
 *           outline, happy flower/heart prints)
 * [POS]: the model half of the Stamp Press (level 3, Limp Works). StampPress.ts owns the brain and animates
 *        the handles returned here; nothing else imports this file.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { t } from '../i18n';
import { paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { CrookedLeg } from './MutantModel';

// ───────────── dimensions (metres, local frame: +Z forward, feet at y = 0) ─────────────
export const PRESS = {
  /** Underside of the crown: the bellows hang from here. */
  crownY: 2.0,
  /** Ram top (boss) above the stamp face. */
  ramTop: 0.42,
  /** Stamp face (rubber) footprint, half extents. */
  faceHX: 0.5,
  faceHZ: 0.36,
  /** The ink pad on its back (weak spot), local. */
  inkPad: new THREE.Vector3(0, 1.74, -0.64),
  hipY: 0.97,
};

/** The animated handles of the model. */
export interface PressLook {
  /** Everything (lifts on hops). */
  rig: THREE.Group;
  /** Ram assembly, origin at the stamp face: its y is the face height. */
  ram: THREE.Group;
  /** Rubber bellows between crown and ram (origin at its bottom, height 1: scale.y = length). */
  bellows: THREE.Object3D;
  /** Hand-wheel + screw (spins about Y). */
  wheel: THREE.Group;
  /** Gauge needles (the pupils), pivot at the dial centre; and the brows above them. */
  needles: THREE.Object3D[];
  brows: THREE.Object3D[];
  /** Ink-pad lid (hinged at its back edge) and the ink itself. */
  inkLid: THREE.Group;
  inkMat: THREE.MeshToonMaterial;
  frameMat: THREE.MeshToonMaterial;
  legs: CrookedLeg[];
}

// ───────────── geometry helpers ─────────────
function roundRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** A cast-looking slab: rounded rectangle (w × h in XY) extruded d along Z with a soft bevel, centred. */
function slab(w: number, h: number, d: number, r = 0.06, bevel = 0.03): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(roundRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.005, r - bevel)), {
    depth: Math.max(0.002, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.center();
  return g;
}

/** A horizontal pad (w along X, d along Z, h tall) with a rounded outline, bottom at y = 0. */
function pad(w: number, d: number, h: number, r = 0.06, bevel = 0.025): THREE.BufferGeometry {
  const g = slab(w, d, h, r, bevel).rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  return g;
}

/** Trapezoid column (bottom width wb, top width wt, height h in XY) extruded d, bottom at y = 0. */
function column(wb: number, wt: number, h: number, d: number, bevel = 0.04): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const r = 0.07;
  const b = wb / 2 - bevel, tt = wt / 2 - bevel, hh = h - bevel * 2;
  s.moveTo(-b + r, 0);
  s.lineTo(b - r, 0);
  s.quadraticCurveTo(b, 0, b - 0.01, r);
  s.lineTo(tt, hh - r);
  s.quadraticCurveTo(tt, hh, tt - r, hh);
  s.lineTo(-tt + r, hh);
  s.quadraticCurveTo(-tt, hh, -tt, hh - r);
  s.lineTo(-b + 0.01, r);
  s.quadraticCurveTo(-b, 0, -b + r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, bevel, -(d - bevel * 2) / 2);
  return g;
}

/** The crown: flat underside, a low arched back (front view), extruded d. Bottom at y = 0. */
function crownGeo(w: number, h: number, d: number, bevel = 0.04): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const hw = w / 2 - bevel, sh = 0.16, top = h - bevel * 2;
  s.moveTo(-hw + 0.06, 0);
  s.lineTo(hw - 0.06, 0);
  s.quadraticCurveTo(hw, 0, hw, 0.06);
  s.lineTo(hw, sh);
  s.bezierCurveTo(hw, top * 0.9, hw * 0.45, top, 0, top);
  s.bezierCurveTo(-hw * 0.45, top, -hw, top * 0.9, -hw, sh);
  s.lineTo(-hw, 0.06);
  s.quadraticCurveTo(-hw, 0, -hw + 0.06, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, bevel, -(d - bevel * 2) / 2);
  return g;
}

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Merged rivet heads (one draw call) at the given points, domes facing `axis`. */
function rivets(points: [number, number, number][], r: number, axis: 'z' | '-z' | 'x' | '-x' = 'z'): THREE.BufferGeometry {
  const gs = points.map(([x, y, z]) => {
    const g = new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    else if (axis === '-z') g.rotateX(-Math.PI / 2);
    else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    else g.rotateZ(Math.PI / 2);
    return g.translate(x, y, z);
  });
  return mergeGeometries(gs)!;
}

// ───────────── the model ─────────────
export function buildPressLook(): PressLook {
  const frameMat = toon({ color: '#7f8ca6' }); // cast iron, blue-grey (plain: a busy texture read as paint)
  const steel = toon({ color: '#58637a' });
  const darkSteel = toon({ color: '#353b4c' });
  const red = toon({ color: PAL.red });
  const rubber = toon({ color: '#c82a36' });
  const cream = toon({ color: PAL.cream });
  const bellowsMat = toon({ color: '#3b3446' });
  const inkMat = toon({ color: '#c42a92', emissive: '#3c0630' }); // vivid wet ink: the weak spot must read from behind
  (inkMat as unknown as THREE.MeshStandardMaterial).roughness = 0.3; // wet ink shines
  const tinMat = toon({ color: '#6a3150' });
  const black = new THREE.MeshBasicMaterial({ color: '#141014' });
  const rig = new THREE.Group();

  // ── gantry: two tapered cast columns, the arched crown across them ──
  const colG = column(0.44, 0.32, 1.12, 0.58);
  for (const x of [-0.82, 0.82]) {
    const c = paintedMesh(colG, frameMat, 0.03);
    c.position.set(x, PRESS.hipY - 0.06, 0);
    rig.add(c);
    // a sunk panel down the column front and back (cast ribs, not a plain block)
    for (const z of [0.3, -0.3]) {
      const panel = paintedMesh(slab(0.2, 0.62, 0.03, 0.05, 0.01), steel, 0.01, false);
      panel.position.set(x, 1.45, z);
      rig.add(panel);
    }
    // foot rail: the legs hang off its ends
    const rail = paintedMesh(new THREE.CapsuleGeometry(0.1, 1.1, 4, 10).rotateX(Math.PI / 2), steel, 0.025);
    rail.position.set(x, PRESS.hipY, 0);
    rig.add(rail);
  }
  const crown = paintedMesh(crownGeo(2.1, 0.46, 0.68), frameMat, 0.035);
  crown.position.y = PRESS.crownY;
  rig.add(crown);
  // a red riveted band across the crown front: the Red Pen's mark (and a grim mouth line)
  const band = paintedMesh(slab(1.3, 0.09, 0.04, 0.03, 0.012), red, 0.012, false);
  band.position.set(0, PRESS.crownY + 0.09, 0.355);
  rig.add(band);
  // rivets: down each column front and along the crown's lower edge
  const rv: [number, number, number][] = [];
  for (const x of [-0.82, 0.82]) for (const y of [1.04, 1.87]) rv.push([x, y, 0.29]);
  for (let i = 0; i < 9; i++) if (i !== 4) rv.push([-0.92 + i * 0.23, PRESS.crownY + 0.05, 0.345]);
  for (const x of [-0.82, 0.82]) for (const y of [1.04, 1.87]) rv.push([x, y, -0.29]);
  rig.add(new THREE.Mesh(rivets(rv.filter((p) => p[2] > 0), 0.03, 'z'), darkSteel));
  rig.add(new THREE.Mesh(rivets(rv.filter((p) => p[2] < 0), 0.03, '-z'), darkSteel));
  const sideRv: [number, number, number][] = [];
  for (const y of [1.2, 1.6]) for (const z of [-0.16, 0.16]) sideRv.push([1.04, y, z]);
  rig.add(new THREE.Mesh(rivets(sideRv, 0.028, 'x'), darkSteel));
  rig.add(new THREE.Mesh(rivets(sideRv.map(([x, y, z]) => [-x, y, z]), 0.028, '-x'), darkSteel));

  // ── the eyes: two pressure gauges on the crown front, angry riveted brows ──
  const needles: THREE.Object3D[] = [];
  const brows: THREE.Object3D[] = [];
  const bezelG = new THREE.LatheGeometry([v2(0.1, 0), v2(0.155, 0), v2(0.17, 0.03), v2(0.16, 0.06), v2(0.13, 0.07), v2(0.12, 0.05)], 20).rotateX(Math.PI / 2);
  const dialMat = toon({ color: PAL.white });
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.46, PRESS.crownY + 0.25, 0.36);
    g.add(paintedMesh(bezelG, steel, 0.015, false));
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20), dialMat);
    dial.position.z = 0.035;
    g.add(dial);
    // a red danger arc on the dial
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 12, 1, -0.3, 1.1), new THREE.MeshBasicMaterial({ color: PAL.red }));
    arc.position.z = 0.037;
    g.add(arc);
    const needle = new THREE.Group();
    const nm = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.11, 4).translate(0, 0.05, 0), black);
    needle.add(nm);
    needle.position.z = 0.045;
    g.add(needle);
    needles.push(needle);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), red);
    cap.position.z = 0.05;
    g.add(cap);
    const brow = new THREE.Group();
    const bar = paintedMesh(new THREE.CapsuleGeometry(0.035, 0.24, 3, 8).rotateZ(Math.PI / 2), darkSteel, 0.015, false);
    brow.add(bar);
    brow.position.set(s * 0.46, PRESS.crownY + 0.44, 0.37);
    brows.push(brow);
    rig.add(g, brow);
  }

  // ── screw + hand-wheel on top (spins in the tell) ──
  const nut = paintedMesh(new THREE.LatheGeometry([v2(0.001, 0), v2(0.17, 0), v2(0.17, 0.1), v2(0.12, 0.13), v2(0.001, 0.13)], 6), darkSteel, 0.02);
  nut.position.y = PRESS.crownY + 0.44;
  rig.add(nut);
  const wheel = new THREE.Group();
  wheel.position.y = PRESS.crownY + 0.52;
  const shaft = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10).translate(0, 0.15, 0);
  const thread: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2 * 4;
    thread.push(new THREE.Vector3(Math.cos(a) * 0.075, 0.02 + (i / 60) * 0.24, Math.sin(a) * 0.075));
  }
  const threadG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(thread), 80, 0.014, 4, false);
  wheel.add(paintedMesh(mergeGeometries([shaft.toNonIndexed(), threadG.toNonIndexed()])!, steel, 0.015, false));
  const hub = paintedMesh(new THREE.LatheGeometry([v2(0.001, -0.05), v2(0.09, -0.05), v2(0.1, 0), v2(0.09, 0.05), v2(0.001, 0.06)], 12), red, 0.015);
  hub.position.y = 0.26;
  wheel.add(hub);
  const rim = paintedMesh(new THREE.TorusGeometry(0.4, 0.04, 8, 30).rotateX(Math.PI / 2), red, 0.018);
  rim.position.y = 0.26;
  wheel.add(rim);
  const spokes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spokes.push(new THREE.CylinderGeometry(0.022, 0.03, 0.32, 6).translate(0, 0.25, 0).rotateZ(-Math.PI / 2).rotateY(a).translate(0, 0.26, 0).toNonIndexed());
  }
  wheel.add(paintedMesh(mergeGeometries(spokes)!, red, 0.012, false));
  const knob = paintedMesh(new THREE.LatheGeometry([v2(0.001, 0), v2(0.035, 0), v2(0.03, 0.1), v2(0.05, 0.13), v2(0.04, 0.17), v2(0.001, 0.18)], 10), cream, 0.012, false);
  knob.position.set(0.4, 0.28, 0);
  wheel.add(knob);
  rig.add(wheel);

  // ── the ram: steel die-holder, red rubber stamp, a cream CORRECT label plate, a domed boss ──
  const ram = new THREE.Group();
  const rubberM = paintedMesh(pad(PRESS.faceHX * 2, PRESS.faceHZ * 2, 0.08, 0.06, 0.02), rubber, 0.02);
  ram.add(rubberM);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(PRESS.faceHX * 2 - 0.06, PRESS.faceHZ * 2 - 0.06).rotateX(-Math.PI / 2),
    // the floor-print layout seen from below: the relief reads mirrored, as a real stamp does
    toon({ map: stampFaceTexture(), color: '#ffffff' }),
  );
  (face.material as THREE.Material).side = THREE.BackSide;
  face.position.y = -0.003;
  ram.add(face);
  const holder = paintedMesh(pad(1.08, 0.8, 0.2, 0.08, 0.035), frameMat, 0.03);
  holder.position.y = 0.075;
  ram.add(holder);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.13), new THREE.MeshBasicMaterial({ map: labelTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  label.position.set(0, 0.175, 0.403);
  ram.add(label);
  ram.add(new THREE.Mesh(rivets([[-0.36, 0.175, 0.4], [0.36, 0.175, 0.4]], 0.022, 'z'), darkSteel));
  const boss = paintedMesh(new THREE.LatheGeometry([v2(0.001, 0), v2(0.33, 0), v2(0.33, 0.04), v2(0.26, 0.08), v2(0.2, 0.13), v2(0.18, PRESS.ramTop - 0.27), v2(0.001, PRESS.ramTop - 0.27)], 18), steel, 0.025);
  boss.position.y = 0.27;
  ram.add(boss);
  // side grips (the stamp's handle lugs)
  for (const s of [-1, 1]) {
    const lug = paintedMesh(new THREE.CapsuleGeometry(0.05, 0.12, 3, 8).rotateX(Math.PI / 2), darkSteel, 0.015, false);
    lug.position.set(s * 0.58, 0.18, 0);
    ram.add(lug);
  }
  rig.add(ram);

  // ── rubber bellows from the crown down to the ram (a concertina boot, scaled to the gap) ──
  const folds: THREE.Vector2[] = [v2(0.001, 0), v2(0.2, 0)];
  const N = 7;
  for (let i = 0; i < N; i++) {
    folds.push(v2(0.27, (i + 0.5) / N));
    folds.push(v2(0.19, (i + 1) / N));
  }
  folds.push(v2(0.001, 1));
  const bellows = paintedMesh(new THREE.LatheGeometry(folds, 16), bellowsMat, 0.02, false);
  rig.add(bellows);

  // ── the ink pad on its back: a tin on a bracket, lid flipped up, wet purple-red ink (the weak spot) ──
  const bracket = paintedMesh(slab(0.5, 0.1, 0.24, 0.04, 0.02), darkSteel, 0.015, false);
  bracket.position.set(0, PRESS.crownY - 0.1, -0.44);
  rig.add(bracket);
  const ink = new THREE.Group();
  ink.position.copy(PRESS.inkPad);
  ink.rotation.x = -0.55; // tipped back: the ink faces WAI once he is behind it
  const tin = paintedMesh(pad(0.76, 0.46, 0.15, 0.06, 0.02), tinMat, 0.02);
  tin.position.y = -0.075;
  const inkSurf = paintedMesh(pad(0.64, 0.34, 0.03, 0.05, 0.012), inkMat, 0, false);
  inkSurf.position.y = 0.05;
  const lid = new THREE.Group();
  lid.position.set(0, 0.075, 0.23); // hinged at the front edge: flipped up against the crown, the ink open to the back
  const lidM = paintedMesh(pad(0.78, 0.48, 0.03, 0.06, 0.012), tinMat, 0.012, false);
  lidM.position.z = -0.24;
  lid.add(lidM);
  lid.rotation.x = 2.3;
  // ink drips over the lip
  const drips = mergeGeometries([0, 1, 2].map((i) => new THREE.SphereGeometry(0.035 + i * 0.008, 8, 6).scale(1, 1.5, 1).translate(-0.2 + i * 0.19, 0.04 - i * 0.02, 0.23)))!;
  ink.add(tin, inkSurf, lid, new THREE.Mesh(drips, inkMat));
  rig.add(ink);

  // ── four stocky crooked legs (the Red Pen's servants all walk wrong), red feet ──
  const legMat = toon({ color: '#3c4458' });
  const legs: CrookedLeg[] = [];
  for (const [x, z] of [[-0.82, 0.62], [0.82, 0.62], [-0.82, -0.62], [0.82, -0.62]]) {
    const l = new CrookedLeg(0.5, 0.5, legMat, red, 0.17);
    l.hip.position.set(x, PRESS.hipY, z);
    legs.push(l);
    rig.add(l.hip);
  }
  // knuckle bolts on the hips
  for (const l of legs) {
    const b = paintedMesh(new THREE.SphereGeometry(0.16, 10, 8), darkSteel, 0.015, false);
    l.hip.add(b);
  }
  return { rig, ram, bellows, wheel, needles, brows, inkLid: lid, inkMat, frameMat, legs };
}

// ───────────── textures (canvas, cached per language string) ─────────────
const STAMP_FONT = '"Arial Black", "Impact", "PingFang SC", sans-serif';
let markTex: THREE.CanvasTexture | null = null;
let faceTex: THREE.CanvasTexture | null = null;
let labelTex: THREE.CanvasTexture | null = null;
let landTex: THREE.CanvasTexture | null = null;
let happyTex: THREE.CanvasTexture[] | null = null;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const x = new THREE.CanvasTexture(c);
  x.colorSpace = THREE.SRGBColorSpace;
  x.anisotropy = 4;
  return x;
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The stamp's word, sized to fit `maxW`. */
function word(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, px: number): void {
  g.font = `900 ${px}px ${STAMP_FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = `900 ${Math.floor((px * maxW) / w)}px ${STAMP_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy);
}

/** Layout of the print: double border + the word (shared by the floor print and the rubber face). */
function drawPrint(g: CanvasRenderingContext2D, W: number, H: number): void {
  g.lineJoin = 'round';
  g.lineWidth = 22;
  rrect(g, 16, 16, W - 32, H - 32, 30);
  g.stroke();
  g.lineWidth = 9;
  rrect(g, 48, 48, W - 96, H - 96, 18);
  g.stroke();
  word(g, t('CORRECT'), W / 2, H / 2 + 8, W - 110, 150);
}

/** Red-ink CORRECT print left on the floor (slightly smudged, speckled where the ink skipped). */
export function correctMarkTexture(): THREE.CanvasTexture {
  if (markTex) return markTex;
  const W = 512, H = 360;
  const [c, g] = canvas(W, H);
  g.strokeStyle = g.fillStyle = '#e3101e';
  // smudge passes: offset ghosts, then the crisp print
  for (const [dx, dy, a] of [[6, 4, 0.18], [-4, 3, 0.14], [3, -5, 0.12]] as const) {
    g.globalAlpha = a;
    g.save();
    g.translate(dx, dy);
    drawPrint(g, W, H);
    g.restore();
  }
  g.globalAlpha = 1;
  drawPrint(g, W, H);
  // ink skips: speckles knocked out (deterministic)
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 1;
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 1 + rnd() * 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // a dry streak where the stamp dragged
  g.globalAlpha = 0.3;
  g.fillRect(0, H * 0.64, W, 7);
  g.globalCompositeOperation = 'source-over';
  return (markTex = tex(c));
}

/** The rubber face: dark raised letters with a highlight lip, on red rubber (same layout as the print). */
function stampFaceTexture(): THREE.CanvasTexture {
  if (faceTex) return faceTex;
  const W = 512, H = 360;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#c42a34';
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(-3, -3);
  g.strokeStyle = g.fillStyle = '#ff7a7a';
  drawPrint(g, W, H);
  g.restore();
  g.strokeStyle = g.fillStyle = '#6e0c16';
  drawPrint(g, W, H);
  return (faceTex = tex(c));
}

/** The cream label plate on the die-holder front (reads the right way round). */
function labelTexture(): THREE.CanvasTexture {
  if (labelTex) return labelTex;
  const W = 512, H = 108;
  const [c, g] = canvas(W, H);
  g.fillStyle = PAL.cream;
  rrect(g, 2, 2, W - 4, H - 4, 18);
  g.fill();
  g.strokeStyle = '#8a7a60';
  g.lineWidth = 5;
  rrect(g, 10, 10, W - 20, H - 20, 12);
  g.stroke();
  g.fillStyle = PAL.red;
  word(g, t('CORRECT'), W / 2, H / 2 + 3, W - 110, 64);
  return (labelTex = tex(c));
}

/** The landing telegraph: a bold red outline with corner brackets and a ghost of the word. */
export function landMarkTexture(): THREE.CanvasTexture {
  if (landTex) return landTex;
  const W = 512, H = 400;
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgba(255, 42, 58, 0.2)';
  rrect(g, 14, 14, W - 28, H - 28, 26);
  g.fill();
  g.strokeStyle = '#ff2a3a';
  g.lineWidth = 18;
  g.setLineDash([42, 22]);
  rrect(g, 14, 14, W - 28, H - 28, 26);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 22;
  g.lineCap = 'round';
  for (const [x, y, sx, sy] of [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]]) {
    g.beginPath();
    g.moveTo(x, y + sy * 80);
    g.lineTo(x, y);
    g.lineTo(x + sx * 80, y);
    g.stroke();
  }
  g.globalAlpha = 0.35;
  g.fillStyle = '#ff2a3a';
  word(g, t('CORRECT'), W / 2, H / 2 + 6, W - 140, 110);
  return (landTex = tex(c));
}

/** The calm press's prints: hearts and flowers in the vivid paints. */
export function happyMarkTextures(): THREE.CanvasTexture[] {
  if (happyTex) return happyTex;
  const out: THREE.CanvasTexture[] = [];
  const cols = [PAL.pink, PAL.yellow, PAL.turq, PAL.cobalt, PAL.orange];
  for (let i = 0; i < 4; i++) {
    const [c, g] = canvas(256, 256);
    g.translate(128, 128);
    if (i % 2 === 0) {
      // heart
      g.fillStyle = cols[i];
      g.beginPath();
      g.moveTo(0, 70);
      g.bezierCurveTo(-110, -10, -60, -100, 0, -45);
      g.bezierCurveTo(60, -100, 110, -10, 0, 70);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(-35, -35, 14, 9, -0.6, 0, Math.PI * 2);
      g.fill();
    } else {
      // flower: five petals round a yellow middle
      g.fillStyle = cols[(i + 1) % cols.length];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.ellipse(Math.cos(a) * 52, Math.sin(a) * 52, 42, 30, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = i === 3 ? PAL.pink : PAL.yellow;
      g.beginPath();
      g.arc(0, 0, 32, 0, Math.PI * 2);
      g.fill();
    }
    out.push(tex(c));
  }
  return (happyTex = out);
}

