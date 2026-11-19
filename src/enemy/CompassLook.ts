/**
 * [INPUT]: depends on toon/paintedMesh from render/Materials; PAL from render/PaintTextures; AssetManager texture 'h2_p_brass';
 *          SoundFx / ARC_MODE / SOUND_GLYPH (marker arcs and glyphs) from render/SoundFx
 * [OUTPUT]: exports buildCompass() → the Compass Spinner's model and the parts it poses (CompassParts), the leg
 *           constants (LEG, UPPER, PENCIL), the pooled floor-line helpers (makeLine, fillRing), makeFlower() and
 *           closeFx() (the closing circle: red fill, ruled hatching, a ring snapping out — at the exact hit radius)
 * [POS]: the look of the level-3 Compass Spinner, kept apart from its brain (CompassSpinner.ts) so each file stays
 *        small. A drafting compass: a hinged drum head with a knurled grip, two stern eyes and a moustache wing
 *        nut; a steel needle leg and a telescoping pencil leg with a knee clamp. The brain poses the parts each frame.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { ARC_MODE, SOUND_GLYPH, type SoundFx } from '../render/SoundFx';

// ───────────── leg geometry (metres) ─────────────
/** Needle leg: hinge centre → needle point (rigid). */
export const LEG = 1.65;
/** Pencil leg: fixed upper arm, hinge centre → extension sleeve. */
export const UPPER = 0.7;
/** Knee joint → red lead tip. */
export const PENCIL = 0.56;

export interface CompassParts {
  /** Everything (the brain tips this over when it topples, twirls it when calm). */
  rig: THREE.Group;
  /** At the hinge centre; local XY is the legs' plane, the face looks along +Z. */
  head: THREE.Group;
  /** At the hinge centre, pointing down its local -Y. */
  needleLeg: THREE.Group;
  pencilLeg: THREE.Group;
  /** Unit-length rod under the pencil leg's sleeve: scale.y = extension length. */
  extension: THREE.Mesh;
  /** Inner (thinner) rod: the far half of the extension. */
  extensionInner: THREE.Mesh;
  /** At the knee joint, pointing down its local -Y to the lead tip. */
  knee: THREE.Group;
  brows: THREE.Mesh[];
  pupils: THREE.Mesh[];
  /** Body materials flashed on hit. */
  flashMats: THREE.MeshToonMaterial[];
}

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Ridged profile segment: a knurled band from y0 down to y1 (y0 > y1). */
function knurl(r: number, y0: number, y1: number, n: number, depth = 0.008): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= n * 2; i++) out.push(v2(r - (i % 2 ? depth : 0), y0 + ((y1 - y0) * i) / (n * 2)));
  return out;
}

/** Lathe from top (largest y) to bottom; closes the ends on the axis. */
function lathe(pts: THREE.Vector2[], seg = 16): THREE.BufferGeometry {
  // LatheGeometry wants the profile bottom → top for outward normals
  const p = [...pts].sort((a, b) => a.y - b.y);
  return new THREE.LatheGeometry([v2(0, p[0].y), ...p, v2(0, p[p.length - 1].y)], seg);
}

export function buildCompass(assets: AssetManager): CompassParts {
  const T = (n: string) => assets.tex(n);
  const steel = toon({ color: '#b9c3dc' });
  const polished = toon({ color: '#f4f7ff' });
  const brass = toon({ map: T('h2_p_brass'), color: '#fff0c0' });
  const darkSteel = toon({ color: '#4c4a66' });
  const red = toon({ color: PAL.red });
  const wood = toon({ color: '#f3cf98' });
  const lead = toon({ color: '#b3101c' });
  const white = toon({ color: '#ffffff' });
  const black = new THREE.MeshBasicMaterial({ color: '#141014' });
  const rig = new THREE.Group();

  // ── the head: a hinge drum (axis = face normal), brass rims, a moustache wing nut, eyes, a knurled grip ──
  const head = new THREE.Group();
  const drumProf = [v2(0.17, 0.1), v2(0.205, 0.085), v2(0.215, 0.05), v2(0.215, -0.05), v2(0.205, -0.085), v2(0.17, -0.1)];
  const drum = paintedMesh(lathe(drumProf, 24).rotateX(Math.PI / 2), steel, 0.022);
  head.add(drum);
  for (const z of [-0.102, 0.102]) {
    const rim = paintedMesh(new THREE.TorusGeometry(0.17, 0.018, 6, 24).translate(0, 0, z), brass, 0, false);
    head.add(rim);
  }
  // the wing nut on the hinge pin: a brass dome with two curled wings — the compass's moustache
  const dome = paintedMesh(new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.7).translate(0, -0.04, 0.1), brass, 0.012, false);
  head.add(dome);
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.03, -0.045, 0.125),
      new THREE.Vector3(s * 0.09, -0.06, 0.125),
      new THREE.Vector3(s * 0.15, -0.035, 0.124),
      new THREE.Vector3(s * 0.165, 0.0, 0.122),
      new THREE.Vector3(s * 0.14, 0.012, 0.121),
    ]);
    const wing = paintedMesh(new THREE.TubeGeometry(curve, 12, 0.017, 6, false), darkSteel, 0.01, false);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), darkSteel);
    tip.position.set(s * 0.14, 0.012, 0.121);
    head.add(wing, tip);
  }
  // two small stern eyes above the nut, brows pinched inward
  const brows: THREE.Mesh[] = [];
  const pupils: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = paintedMesh(new THREE.SphereGeometry(0.045, 12, 10).scale(1, 0.9, 0.45), white, 0.01, false);
    eye.position.set(s * 0.07, 0.055, 0.106);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6).scale(1, 1, 0.5), black);
    pupil.position.set(s * 0.065, 0.05, 0.126);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6).rotateZ(Math.PI / 2), black);
    brow.position.set(s * 0.07, 0.11, 0.122);
    brow.rotation.z = s * 0.45;
    brows.push(brow);
    pupils.push(pupil);
    head.add(eye, pupil, brow);
  }
  // the neck and the knurled finger grip on top
  const gripProf = [v2(0.03, 0.42), v2(0.065, 0.415), v2(0.075, 0.39), ...knurl(0.075, 0.37, 0.27, 6), v2(0.075, 0.25), v2(0.06, 0.235), v2(0.035, 0.225), v2(0.03, 0.18), v2(0.06, 0.17)];
  const grip = paintedMesh(lathe(gripProf, 18), steel, 0.016);
  const cap = paintedMesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.418, 0), brass, 0.01, false);
  head.add(grip, cap);
  rig.add(head);

  // ── the needle leg: tapered steel shank, a knurled brass collar with a clamp screw, a polished needle ──
  const needleLeg = new THREE.Group();
  const shankProf = [v2(0.075, -0.02), v2(0.07, -0.25), v2(0.058, -0.8), v2(0.046, -1.22), v2(0.04, -1.26)];
  needleLeg.add(paintedMesh(lathe(shankProf, 12), steel, 0.016));
  const collarProf = [v2(0.05, -1.22), ...knurl(0.062, -1.24, -1.34, 3), v2(0.05, -1.37), v2(0.03, -1.385)];
  needleLeg.add(paintedMesh(lathe(collarProf, 14), brass, 0.012, false));
  const screw = paintedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 8).rotateZ(Math.PI / 2).translate(0.085, -1.29, 0), brass, 0.008, false);
  needleLeg.add(screw);
  const needleProf = [v2(0.022, -1.38), v2(0.02, -1.5), v2(0.012, -1.58), v2(0.002, -LEG)];
  needleLeg.add(paintedMesh(lathe(needleProf, 10), polished, 0.008, false));
  // a fork cheek where the leg enters the drum
  needleLeg.add(paintedMesh(lathe([v2(0.09, -0.12), v2(0.1, -0.17), v2(0.085, -0.24), v2(0.07, -0.26)], 14), darkSteel, 0.012, false));
  rig.add(needleLeg);

  // ── the pencil leg: upper arm, a knurled sleeve, a telescoping rod (two diameters) ──
  const pencilLeg = new THREE.Group();
  const armProf = [v2(0.075, -0.02), v2(0.068, -0.25), v2(0.056, -0.62), v2(0.052, -0.66)];
  pencilLeg.add(paintedMesh(lathe(armProf, 12), steel, 0.016));
  pencilLeg.add(paintedMesh(lathe([v2(0.09, -0.12), v2(0.1, -0.17), v2(0.085, -0.24), v2(0.07, -0.26)], 14), darkSteel, 0.012, false));
  const sleeveProf = [v2(0.05, -0.6), ...knurl(0.068, -0.62, -0.7, 3), v2(0.05, -0.72)];
  pencilLeg.add(paintedMesh(lathe(sleeveProf, 14), brass, 0.012, false));
  const extension = paintedMesh(new THREE.CylinderGeometry(0.036, 0.036, 1, 10).translate(0, -0.5, 0), steel, 0.012);
  extension.position.y = -UPPER;
  const extensionInner = paintedMesh(new THREE.CylinderGeometry(0.026, 0.026, 1, 8).translate(0, -0.5, 0), polished, 0.01, false);
  pencilLeg.add(extension, extensionInner);
  rig.add(pencilLeg);

  // ── the knee: a brass joint ball, a red clamp ring with a screw, a stubby red pencil (hexagonal), sharpened ──
  const knee = new THREE.Group();
  knee.add(paintedMesh(new THREE.SphereGeometry(0.065, 12, 10), brass, 0.012, false));
  const clampProf = [v2(0.07, -0.05), v2(0.075, -0.08), v2(0.075, -0.17), v2(0.068, -0.2)];
  knee.add(paintedMesh(lathe(clampProf, 14), red, 0.012, false));
  const clampScrew = paintedMesh(new THREE.CylinderGeometry(0.02, 0.026, 0.07, 8).rotateZ(Math.PI / 2).translate(0.1, -0.125, 0), brass, 0.008, false);
  knee.add(clampScrew);
  const pencil = paintedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6).translate(0, -0.29, 0), red, 0.012, false);
  const bevel = paintedMesh(new THREE.ConeGeometry(0.05, 0.11, 6, 1, true).rotateX(Math.PI).translate(0, -0.475, 0), wood, 0.008, false);
  (bevel.material as THREE.Material).side = THREE.DoubleSide;
  const tipG = new THREE.ConeGeometry(0.016, 0.034, 8).rotateX(Math.PI).translate(0, -PENCIL + 0.017, 0);
  knee.add(pencil, bevel, new THREE.Mesh(tipG, lead));
  rig.add(knee);

  return { rig, head, needleLeg, pencilLeg, extension, extensionInner, knee, brows, pupils, flashMats: [steel, brass, red] };
}

// ───────────── pooled floor lines (no new geometry after construction) ─────────────

/** A flat strip of `segs` quads (indexed), positions filled in later by fillRing(). */
export function makeLine(segs: number, color: string, opacity: number, lift: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 2 * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.userData.noPaint = true;
  m.userData.segs = segs;
  m.renderOrder = 2;
  m.position.y = lift;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

/** Lay the strip out as a circle of radius r (centred on the mesh), starting at yaw a0, turning by sign dir. */
export function fillRing(m: THREE.Mesh, r: number, a0: number, dir: number, width: number): void {
  const segs = m.userData.segs as number;
  const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const ri = r - width / 2, ro = r + width / 2;
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (dir * i * Math.PI * 2) / segs;
    const s = Math.sin(a), c = Math.cos(a);
    const o = i * 6;
    arr[o] = s * ri; arr[o + 1] = 0; arr[o + 2] = c * ri;
    arr[o + 3] = s * ro; arr[o + 4] = 0; arr[o + 5] = c * ro;
  }
  pos.needsUpdate = true;
}

// ───────────── the circle closes (marker strokes on ctx.effects.sound) ─────────────
/** Inside of the closed circle at centre c, radius r: a red fill, ruled hatching across it, a ring snapping out, a bang. */
export function closeFx(fx: SoundFx, c: THREE.Vector3, r: number): void {
  const red = fx.c('#e8253a'), dark = fx.c('#9b1b2a');
  const u = new THREE.Vector3(1, 0, 0), v = new THREE.Vector3(0, 0, 1);
  const at = c.clone().setY(c.y + 0.045);
  fx.spawnArc({ c: at, u, v, r0: r * 0.5, r1: r * 0.5, w: r * 0.5, w1: r * 0.5, color: red, alpha: 0.42, dur: 0.55, seed: 3, wob: 0.01 });
  fx.spawnArc({ c: at, u, v, r0: r, r1: r + 0.9, w: 0.22, w1: 0.05, color: red, dur: 0.45, seed: 5, wob: 0.02 });
  // ruled hatching: parallel strokes clipped to the circle, drawn one after another like a pen going over it
  const dir = new THREE.Vector3(Math.cos(0.7), 0, Math.sin(0.7)), side = new THREE.Vector3(-dir.z, 0, dir.x);
  for (let i = -3; i <= 3; i++) {
    const o = (i / 3.6) * r;
    const half = Math.sqrt(Math.max(0, r * r - o * o)) - 0.15;
    if (half < 0.3) continue;
    const start = at.clone().addScaledVector(side, o).addScaledVector(dir, -half).setY(at.y + 0.005);
    fx.spawnArc({ c: start, u: dir, v: side, r0: half * 2, r1: half * 2, w: 0.08, color: dark, dur: 0.5, delay: (i + 3) * 0.025, mode: ARC_MODE.stroke, seed: i });
  }
  fx.spawnGlyph({ pos: c.clone().setY(c.y + 1.6), glyph: SOUND_GLYPH.bang, size: 0.9, color: red, dur: 0.5 });
}

// ───────────── the calm flower: a rainbow petalled spiral ─────────────
export const FLOWER_SEGS = 260;
const FLOWER_TURNS = 3;
/** Spiral radius at parameter k (0..1): grows outward, five soft petals. */
export function flowerAt(k: number, out: THREE.Vector3): THREE.Vector3 {
  const th = k * FLOWER_TURNS * Math.PI * 2;
  const r = (0.28 + 1.05 * k) * (1 + 0.3 * Math.sin(th * 2.5) ** 2);
  return out.set(Math.sin(th) * r, 0, Math.cos(th) * r);
}

export function makeFlower(lift: number): THREE.Mesh {
  const n = FLOWER_SEGS;
  const pos = new Float32Array((n + 1) * 6);
  const col = new Float32Array((n + 1) * 6);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    flowerAt(i / n, p);
    flowerAt(Math.min(1, (i + 1) / n), q);
    if (i === n) flowerAt((n - 1) / n, q).sub(p).negate().add(p);
    const tx = q.x - p.x, tz = q.z - p.z;
    const l = Math.hypot(tx, tz) || 1;
    const nx = (-tz / l) * 0.065, nz = (tx / l) * 0.065;
    pos.set([p.x - nx, 0, p.z - nz, p.x + nx, 0, p.z + nz], i * 6);
    c.setHSL((i / n) * 0.85, 1, 0.5);
    col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.userData.noPaint = true;
  m.renderOrder = 2;
  m.position.y = lift;
  m.visible = false;
  return m;
}
