/**
 * [INPUT]: depends on addOutline from render/Materials; penSkin (matcap lacquer / rubber / chrome / foil / eye
 *          materials) from ./RedPenSkin; fitPenModel (the sculpted body fitted to the rig) from ./RedPenModel;
 *          mergeGeometries from three's BufferGeometryUtils; three Lathe/Edges geometry
 * [OUTPUT]: exports buildRedPen(sculpt?) → RedPenLook (root, the nib tip, eyelids/brows/pupils to pose, the drawn clip
 *           to wiggle, setSketch(), setCrossed(), the four weak-point halos + setOpen(), setFade(), addSplat() (paint
 *           blobs stuck on it), radiusAt() (its surface, for splats)), PEN_H, PenWeak (the weak-point names)
 * [POS]: the Red Pen's look for the level-3 boss (RedPenBoss): the outside world's standard of judgement:
 *        exact, manufactured, out of place in the drawn city. Two bodies, one rig. With `sculpt` (the Tripo GLB, slot
 *        `redPen`): an armoured crimson fountain pen with a steel crown, a riveted collar, a sword-blade clip on its
 *        side, a ruled steel band, a ribbed black grip and a lance nib; RedPenModel fits it. Without it (file missing,
 *        or `?pen=drawn`): the body drawn here from primitives (lathe barrel, ribbed grip, chrome collars and nib, foil
 *        band, cap, clip; static parts of one material merged). Everything that moves or reports is this file's code
 *        on either body: two narrow, unimpressed eyes (outlined whites, aperture irises, lacquer lids, marker brows)
 *        behind half-moon reading glasses, placed on the cap's surface wherever the body puts it; the hanging ink
 *        drop; the sketch lines; the red X; the splats. Pivot: the nib tip at y = 0 (it stands on its nib). The
 *        souls-like roof fight scales it ×2.2 (≈14 m to the cap's top, RedPenBody, whose weak-point table matches the
 *        places here; the sculpted crown stands 2.4 m above that, outside every collider): each named weak point (nib,
 *        grip, clip, eyes) has a turquoise halo a hand's width off the surface that pulses only while that point is
 *        open, so the open spot reads at 30 m.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutline } from '../render/Materials';
import { penSkin } from './RedPenSkin';
import { fitPenModel } from './RedPenModel';

export interface RedPenLook {
  root: THREE.Group;
  /** Everything but the sketch overlay (scaled / hidden as one). */
  body: THREE.Group;
  /** World-space nib tip helper (child at the ball). */
  tip: THREE.Object3D;
  /** Grip ring (the weak spot while the nib is stuck). */
  grip: THREE.Object3D;
  lids: THREE.Mesh[];
  pupils: THREE.Mesh[];
  brows: THREE.Mesh[];
  /** The pocket clip as its own mesh (the drawn pen only: the sculpted clip is part of the body). */
  clip: THREE.Mesh | null;
  /** The pen's paint-able materials (repaint colours, flash). */
  mats: THREE.MeshStandardMaterial[];
  /** 0 = inked solid, 1 = a faint pencil sketch (phase 3: it crossed itself out). */
  setSketch(k: number): void;
  /** A red X struck across its own barrel (the moment it crosses itself out). */
  setCrossed(on: boolean): void;
  /** Stick a splat of WAI's paint on the body (world point + outward normal; a pool of 60, oldest reused). */
  addSplat(at: THREE.Vector3, normal: THREE.Vector3, color: string, size: number): void;
  /** 0..1 see-through when the camera is right against the body (souls fight); multiplies the sketch fade. */
  setFade(a: number): void;
  /** Weak-point halos: 0 = hidden, 1 = fully open (pulsing turquoise). */
  setOpen(id: PenWeak, k: number): void;
  /** Turn both apertures toward a world point (WAI): they track, they never blink. */
  gaze(at: THREE.Vector3): void;
  /** Won over: the crayon star shows in its eyes. */
  setDrawn(on: boolean): void;
  /** Surface radius at height y above the nib tip (m, both at scale 1): where a splat sticks. */
  radiusAt(y: number): number;
}

/** The Red Pen's named weak points (souls fight): where paint really lands. */
export type PenWeak = 'nib' | 'grip' | 'clip' | 'eyes';

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Height of the pen standing on its nib (m, at scale 1). */
export const PEN_H = 6.4;

/** A crooked crayon star (the ending's highlight in its eye): the one hand-drawn thing it ever wears. */
function doodleStar(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffd23a';
  g.fillStyle = 'rgba(255,210,58,0.85)';
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = (i % 2 ? 11 : 27) + Math.sin(i * 2.7) * 3;
    g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
  }
  g.fill();
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Height of the eyes above the nib tip (m, at scale 1); the cap of the drawn pen is 0.56 m in radius there. */
const EYE_Y = 6.02;
const DRAWN_CAP_R = 0.56;

/**
 * `sculpt`: a clone of the Tripo GLB (slot `redPen`). With it the body is the sculpted pen; without it (file missing)
 * the body is drawn from primitives as before. The face, halos, sketch, X and splats are the same code either way.
 */
export function buildRedPen(sculpt: THREE.Object3D | null = null): RedPenLook {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = penSkin();
  const red = skin.lacquer as unknown as THREE.MeshStandardMaterial;
  const dark = skin.knurl as unknown as THREE.MeshStandardMaterial;
  const silver = skin.chrome as unknown as THREE.MeshStandardMaterial;
  const band = skin.band as unknown as THREE.MeshStandardMaterial;
  const white = skin.eyeWhite as unknown as THREE.MeshStandardMaterial;
  const drop = skin.inkDrop as unknown as THREE.MeshStandardMaterial;
  const ink = new THREE.MeshBasicMaterial({ color: '#141014', transparent: true, fog: false });
  const mats = [red, dark, silver, band, white, drop];
  const y0 = 3.72; // the sky pen's ball sat at y = −3.72: lift everything so the ball is the pivot
  const add = (m: THREE.Mesh, outline = 0.05) => {
    m.castShadow = true;
    m.receiveShadow = true;
    if (outline > 0) addOutline(m, outline);
    body.add(m);
    return m;
  };
  /** Several static parts in one mesh (one draw call; the outline hull follows the merged shape). */
  const merged = (parts: THREE.BufferGeometry[], mat: THREE.Material, outline = 0) => add(new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()))!, mat), outline);
  const torus = (r: number, tube: number, y: number) => new THREE.TorusGeometry(r, tube, 8, 32).rotateX(Math.PI / 2).translate(0, y0 + y, 0);
  // ── the drawn body (fallback): lathe barrel, ribbed grip, chrome collars and nib, foil band, cap, clip ──
  const drawnShell = (): { clip: THREE.Mesh; sketch: THREE.BufferGeometry[] } => {
  // barrel + cone in one lathe: a slight taper toward the grip, a waist bevel, a shoulder before the cap
  const prof = [v2(0.001, -3.6), v2(0.12, -3.45), v2(0.32, -3.0), v2(0.42, -2.7), v2(0.47, -2.0), v2(0.49, -0.6), v2(0.52, -0.52), v2(0.5, -0.42), v2(0.5, 2.3), v2(0.485, 2.42), v2(0.46, 2.6), v2(0.001, 2.65)];
  add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32).translate(0, y0, 0), red), 0.03);
  // the ribbed rubber grip: a sleeve with ridges (texture) and real ribs (one merged mesh)
  const sleeve = new THREE.CylinderGeometry(0.535, 0.515, 1.4, 32, 1, true).translate(0, y0 - 1.3, 0);
  const sleeveMesh = add(new THREE.Mesh(sleeve, dark), 0.02);
  ((sleeveMesh.material as THREE.MeshMatcapMaterial).map as THREE.Texture).repeat.set(24, 8);
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) ribs.push(torus(0.535, 0.028, -1.95 + i * 0.16));
  merged(ribs, dark);
  // polished collars at every join (bevels): grip top + bottom, cone base, cap mouth, cap seam, top button
  merged(
    [
      torus(0.545, 0.045, -0.58),
      torus(0.53, 0.045, -2.02),
      torus(0.43, 0.04, -2.72),
      torus(0.575, 0.06, 1.22),
      torus(0.53, 0.022, 2.8),
      new THREE.CylinderGeometry(0.16, 0.2, 0.12, 20).translate(0, y0 + 3.4, 0),
      new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, y0 + 3.46, 0),
    ],
    silver,
  );
  // the nib: a chrome cone with a slit and a breather hole, a red ball with a drop of ink hanging off it
  add(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 24).rotateX(Math.PI).translate(0, y0 - 3.25, 0), silver), 0.02);
  // a printed / stamped foil band round the barrel: CORRECT ✓
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.507, 0.507, 0.42, 32, 1, true).translate(0, y0 + 0.4, 0), band), 0);
  // the cap (its back end) with a domed top
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.6, 32).translate(0, y0 + 2.0, 0), red), 0.025);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.56, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, y0 + 2.8, 0), red), 0.025);
  // the pocket clip, on the cap's SIDE (+X): the face stays clear. A rivet at the top, a rounded ball at the end.
  // Built along +Z, then turned a quarter round; it hangs from the rivet (the wiggle pivots there).
  const clipShape = new THREE.Shape();
  clipShape.moveTo(-0.08, 0);
  clipShape.lineTo(0.08, 0);
  clipShape.lineTo(0.09, 1.5);
  clipShape.quadraticCurveTo(0, 1.68, -0.09, 1.5);
  clipShape.closePath();
  const clipLocal = (g: THREE.BufferGeometry) => g.translate(0, -1.47, 0.6).rotateY(Math.PI / 2);
  const clipG = clipLocal(new THREE.ExtrudeGeometry(clipShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 }));
  const clipBall = clipLocal(new THREE.SphereGeometry(0.12, 12, 8).translate(0, 0.04, 0.06));
  const rivet = clipLocal(new THREE.SphereGeometry(0.075, 10, 6).translate(0, 1.47, 0.07));
  const clip = new THREE.Mesh(mergeGeometries([clipG.toNonIndexed(), clipBall.toNonIndexed(), rivet.toNonIndexed()])!, silver);
  clip.position.set(0, y0 + 2.62, 0);
  clip.castShadow = true;
  addOutline(clip, 0.015);
  body.add(clip);
    return { clip, sketch: [new THREE.LatheGeometry(prof, 10).translate(0, y0, 0), new THREE.CylinderGeometry(0.56, 0.56, 1.6, 10).translate(0, y0 + 2.0, 0)] };
  };
  // ── the body: the sculpted pen fitted to the rig, or the drawn one ──
  const pen = sculpt ? fitPenModel(sculpt) : null;
  if (pen) {
    body.add(pen.root);
    mats.push(...(pen.mats as unknown as THREE.MeshStandardMaterial[]));
  }
  const shell = pen ? { clip: null, sketch: [pen.lathe(10)] } : drawnShell();
  const clip = shell.clip;
  // a red ball at the very tip with a drop of ink hanging off it
  body.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), drop));
  const dropG = new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1.5, 1).translate(0.05, -0.12, 0.04);
  body.add(new THREE.Mesh(dropG, drop));
  // the drawn pen's radii: nib cone to 1.09 m, grip sleeve to 3.18 m, barrel to 4.91 m, then the cap
  const surf: (y: number) => number = pen ? pen.radiusAt : (y) => (y < 1.09 ? 0.045 + (y / 1.09) * 0.386 : y < 3.18 ? 0.532 : y < 4.91 ? 0.5 : DRAWN_CAP_R);
  // the face rides on the cap's surface: on a sculpted cap it moves in or out to where that surface is
  const face = new THREE.Group();
  face.position.z = surf(EYE_Y) - DRAWN_CAP_R;
  body.add(face);
  // the face: not doodle eyes but two instruments that judge. Clean white lenses, an iris like a camera aperture
  // (chrome bezel, blades, a black stop) that tracks WAI and never blinks, lacquer lids that narrow it, a ruler-straight
  // brow; exact half-moon reading glasses low on the face
  const lids: THREE.Mesh[] = [];
  const pupils: THREE.Mesh[] = [];
  const brows: THREE.Mesh[] = [];
  const glassParts: THREE.BufferGeometry[] = [];
  const apertureTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5a0e14';
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    // six blades, an exact hexagonal stop
    g.strokeStyle = '#2a0408';
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22);
      g.lineTo(64 + Math.cos(a + 1.2) * 62, 64 + Math.sin(a + 1.2) * 62);
      g.stroke();
    }
    g.fillStyle = '#0a0608';
    g.beginPath();
    for (let i = 0; i < 6; i++) g.lineTo(64 + Math.cos((i / 6) * Math.PI * 2) * 24, 64 + Math.sin((i / 6) * Math.PI * 2) * 24);
    g.fill();
    // a gauge ring of ticks
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54);
      g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const apertureMat = new THREE.MeshBasicMaterial({ map: apertureTex, transparent: true, fog: false });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, fog: false });
  const doodleMat = new THREE.MeshBasicMaterial({ map: doodleStar(), transparent: true, depthWrite: false, fog: false });
  mats.push(apertureMat as unknown as THREE.MeshStandardMaterial, glintMat as unknown as THREE.MeshStandardMaterial, doodleMat as unknown as THREE.MeshStandardMaterial);
  const stars: THREE.Mesh[] = [];
  const irisHome: THREE.Vector3[] = [];
  for (const x of [-0.25, 0.25]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 14), white);
    e.scale.set(1, 0.66, 0.5);
    e.position.set(x, y0 + 2.3, 0.5);
    addOutline(e, 0.012);
    face.add(e);
    // the iris assembly moves as one (RedPenBoss turns it toward WAI through `pupils`)
    const iris = new THREE.Group();
    iris.position.set(x, y0 + 2.28, 0.612);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.1, 32), apertureMat);
    iris.add(disc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 32), silver);
    iris.add(bezel);
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), glintMat);
    glint.position.set(-0.04, 0.04, 0.005);
    iris.add(glint);
    // won over: a wobbly crayon star appears in its eye (the world's first mark on it from the inside)
    const star = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), doodleMat);
    star.position.set(0.035, 0.03, 0.008);
    star.rotation.z = x;
    star.visible = false;
    iris.add(star);
    stars.push(star);
    irisHome.push(iris.position.clone());
    face.add(iris);
    pupils.push(iris as unknown as THREE.Mesh);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.218, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
    lid.scale.set(1, 0.66, 0.54);
    lid.position.set(x, y0 + 2.3, 0.5);
    lid.rotation.x = 0.35;
    face.add(lid);
    lids.push(lid);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.05), ink);
    brow.position.set(x, y0 + 2.52, 0.6);
    brow.rotation.z = x > 0 ? 0.3 : -0.3;
    face.add(brow);
    brows.push(brow);
    // the glasses: an exact half-moon rim and a short arm back toward the (clip-free) temple
    glassParts.push(new THREE.TorusGeometry(0.21, 0.016, 6, 32, Math.PI).rotateZ(Math.PI).translate(x, y0 + 2.24, 0.66));
    glassParts.push(new THREE.BoxGeometry(0.016, 0.016, 0.36).rotateY(x > 0 ? 0.35 : -0.35).translate(x * 1.9, y0 + 2.24, 0.47));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.21, 32, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.25, depthWrite: false, fog: false }));
    lens.position.set(x, y0 + 2.24, 0.66);
    lens.userData.noPaint = true;
    face.add(lens);
  }
  glassParts.push(new THREE.BoxGeometry(0.12, 0.022, 0.022).translate(0, y0 + 2.25, 0.67));
  face.add(new THREE.Mesh(mergeGeometries(glassParts.map((g) => g.toNonIndexed()))!, silver));
  const tip = new THREE.Object3D();
  root.add(tip);
  const gripMark = new THREE.Object3D();
  gripMark.position.y = y0 - 1.3;
  root.add(gripMark);

  // ── weak-point halos (souls fight): turquoise rings + a glow shell, shown only while that point is open ──
  const haloMat = (c: string) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halos = new Map<PenWeak, { g: THREE.Group; mats: THREE.MeshBasicMaterial[] }>();
  const mkHalo = (id: PenWeak, parts: [THREE.BufferGeometry, string][]) => {
    const g = new THREE.Group();
    const ms: THREE.MeshBasicMaterial[] = [];
    for (const [geo, c] of parts) {
      const m = haloMat(c);
      ms.push(m);
      g.add(new THREE.Mesh(geo, m));
    }
    g.visible = false;
    g.traverse((o) => (o.userData.noPaint = true));
    root.add(g);
    halos.set(id, { g, mats: ms });
  };
  const ring = (r: number, y: number, tube = 0.07) => new THREE.TorusGeometry(r, tube, 6, 32).rotateX(Math.PI / 2).translate(0, y, 0);
  // each halo stands a hand's width off the surface it marks (0.3 / 0.53 / 0.56 m on the drawn pen)
  const nibR = surf(y0 - 3.0) + 0.12, gripR = surf(y0 - 1.3) + 0.11, capR = surf(y0 + 1.95) + 0.1;
  mkHalo('nib', [[ring(nibR, y0 - 3.0), '#22c4c0'], [ring(nibR - 0.12, y0 - 3.3), '#22c4c0'], [new THREE.ConeGeometry(nibR, 1.0, 16, 1, true).rotateX(Math.PI).translate(0, y0 - 3.22, 0), '#0f6f6c']]);
  mkHalo('grip', [[ring(gripR, y0 - 1.95), '#22c4c0'], [ring(gripR, y0 - 1.3), '#22c4c0'], [ring(gripR, y0 - 0.65), '#22c4c0'], [new THREE.CylinderGeometry(gripR - 0.04, gripR - 0.04, 1.5, 24, 1, true).translate(0, y0 - 1.3, 0), '#0f6f6c']]);
  // the clip's halo: a glow capsule round it (at its place on the cap's side) and the cap-mouth ring
  const clipHalo = new THREE.CapsuleGeometry(0.2, 1.4, 4, 12).translate(capR + 0.04, y0 + 1.95, 0);
  mkHalo('clip', [[clipHalo, '#ffd23a'], [ring(capR, y0 + 1.22, 0.06), '#22c4c0']]);
  mkHalo('eyes', [[new THREE.TorusGeometry(0.29, 0.04, 6, 24).translate(-0.25, y0 + 2.3, 0.64 + face.position.z), '#22c4c0'], [new THREE.TorusGeometry(0.29, 0.04, 6, 24).translate(0.25, y0 + 2.3, 0.64 + face.position.z), '#22c4c0'], [new THREE.TorusGeometry(0.4, 0.03, 6, 28).scale(1.4, 0.7, 1).translate(0, y0 + 2.3, 0.6 + face.position.z), '#ffd23a']]);

  // ── the sketch overlay (phase 3): dashed pencil edges of the barrel and the cap ──
  const sketchMat = new THREE.LineDashedMaterial({ color: '#d8283a', dashSize: 0.22, gapSize: 0.1, transparent: true, opacity: 0 });
  const sketch = new THREE.Group();
  for (const g of shell.sketch) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), sketchMat);
    l.computeLineDistances();
    sketch.add(l);
  }
  sketch.visible = false;
  root.add(sketch);
  // ── the red X it strikes over itself ──
  const xMark = new THREE.Group();
  const xm = new THREE.MeshBasicMaterial({ color: '#ff2a3a' });
  for (const r of [0.6, -0.6]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), xm);
    bar.rotation.z = r;
    bar.position.set(0, y0 + 0.6, 0.62);
    xMark.add(bar);
  }
  xMark.visible = false;
  root.add(xMark);
  for (const g of [sketch, xMark]) g.traverse((o) => (o.userData.noPaint = true));

  // ── WAI's paint on the Pen: flat blob decals stuck to the body (the Pen stays red underneath; this is the progress) ──
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(32, 30, 17, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + i;
      const r = 18 + (i % 3) * 5;
      g.beginPath();
      g.arc(32 + Math.cos(a) * r, 30 + Math.sin(a) * r, 3 + (i % 2) * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(29, 30, 6, 30);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const splatGeo = new THREE.PlaneGeometry(1, 1);
  const splats: THREE.Mesh[] = [];
  let splatNext = 0;
  const _n = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _g = new THREE.Vector3();
  const _h = new THREE.Vector3();
  const addSplat = (at: THREE.Vector3, normal: THREE.Vector3, color: string, size: number) => {
    let m = splats[splatNext];
    if (!m) {
      m = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.userData.noPaint = true;
      m.renderOrder = 2;
      body.add(m);
      splats.push(m);
    }
    splatNext = (splatNext + 1) % 60;
    body.updateWorldMatrix(true, false);
    const sc = root.getWorldScale(_n).x || 1;
    m.position.copy(body.worldToLocal(at.clone().addScaledVector(normal, 0.03)));
    body.getWorldQuaternion(_q).invert();
    _n.copy(normal).applyQuaternion(_q);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size / sc);
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    m.visible = true;
  };

  // opacity = the sketch (phase 3) × the near-camera fade, on top of each material's own opacity
  let sketchK = 0;
  let fade = 1;
  const baseOp = new Map(mats.map((m) => [m, m.opacity] as const));
  const apply = () => {
    const solid = (1 - sketchK) * fade;
    for (const m of mats) {
      m.opacity = Math.max(0, solid * (baseOp.get(m) ?? 1));
      m.depthWrite = solid > 0.6;
    }
    ink.opacity = solid;
    for (const sp of splats) (sp.material as THREE.MeshBasicMaterial).opacity = solid;
    // every ink line on it, found now: EnemyBase adds the sculpted body's ink shell after this look is built
    body.traverse((o) => {
      if (o.userData.isOutline) o.visible = solid > 0.5;
    });
    body.visible = solid > 0.02;
  };

  return {
    root,
    body,
    tip,
    grip: gripMark,
    lids,
    pupils,
    brows,
    clip,
    mats: mats as THREE.MeshStandardMaterial[],
    setSketch(k) {
      sketchK = k;
      apply();
      sketch.visible = k > 0.02;
      sketchMat.opacity = 0.85 * k;
    },
    addSplat,
    setFade(a) {
      if (Math.abs(a - fade) < 0.01) return;
      fade = a;
      apply();
    },
    setCrossed(on) {
      xMark.visible = on;
    },
    gaze(at) {
      face.updateWorldMatrix(true, false);
      const l = face.worldToLocal(_g.copy(at));
      for (let i = 0; i < pupils.length; i++) {
        const h = irisHome[i];
        const d = _h.subVectors(l, h);
        const n = Math.max(1e-3, d.length());
        pupils[i].position.set(h.x + THREE.MathUtils.clamp((d.x / n) * 0.07, -0.06, 0.06), h.y + THREE.MathUtils.clamp((d.y / n) * 0.05, -0.035, 0.035), h.z);
      }
    },
    setDrawn(on) {
      for (const st of stars) st.visible = on;
    },
    radiusAt: surf,
    setOpen(id, k) {
      const h = halos.get(id)!;
      h.g.visible = k > 0.01;
      if (!h.g.visible) return;
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 110);
      h.mats.forEach((m, i) => (m.opacity = k * (i === h.mats.length - 1 && id !== 'eyes' ? 0.5 : 1) * (0.4 + 0.6 * pulse)));
      const s = 1 + 0.06 * Math.sin(performance.now() / 90);
      h.g.scale.set(s, 1, s);
    },
  };
}
