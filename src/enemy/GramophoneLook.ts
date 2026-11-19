/**
 * [INPUT]: depends on toon/paintedMesh from render/Materials; AssetManager textures ('wood', 'h2_p_brass', 'metal_dark')
 * [OUTPUT]: exports buildGramophone() → the Red Gramophone's model and the parts it animates (GramophoneParts)
 * [POS]: the look of the level-2 mid-boss, kept apart from its brain (RedGramophone.ts) so each file stays small.
 *        A cabinet gramophone with a face, claw feet, a spinning platter, a petalled horn on a crooked neck,
 *        a crank, and the long sweep arm it swings round the arena floor.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { paintedMesh, toon } from '../render/Materials';

export interface GramophoneParts {
  root: THREE.Group;
  /** Neck pivot: the horn tilts and turns on it. */
  hornPivot: THREE.Group;
  hornMat: THREE.MeshToonMaterial;
  throatMat: THREE.MeshBasicMaterial;
  platter: THREE.Group;
  crank: THREE.Group;
  /** The long arm swept round the floor (pivots at the cabinet's centre, at knee height). */
  sweep: THREE.Group;
  sweepNeedle: THREE.Mesh;
  brows: THREE.Mesh[];
  lids: THREE.Mesh[];
  cabinetMat: THREE.MeshToonMaterial;
  /** World height (model space) of the horn's mouth centre. */
  mouthY: number;
}

/** Sweep arm reach (model space, from the centre). */
export const SWEEP_R = 9.0;

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

export function buildGramophone(assets: AssetManager): GramophoneParts {
  const T = (n: string) => assets.tex(n);
  const root = new THREE.Group();
  const cabinetMat = toon({ map: T('wood'), color: '#c8665a' });
  const brass = toon({ map: T('h2_p_brass'), color: '#fff0c0' });
  const dark = toon({ color: '#2a1630' });
  const black = new THREE.MeshBasicMaterial({ color: '#141014' });
  const white = toon({ color: '#ffffff' });

  // ── the cabinet: a squat box with a bevelled lid, brass corners and a fretwork grille (its mouth) ──
  const cab = paintedMesh(new THREE.BoxGeometry(2.6, 1.5, 2.2, 2, 2, 2), cabinetMat, 0.06);
  cab.position.y = 1.15;
  const lid = paintedMesh(new THREE.BoxGeometry(2.8, 0.18, 2.4), cabinetMat, 0.04);
  lid.position.y = 1.99;
  const plinth = paintedMesh(new THREE.BoxGeometry(2.8, 0.2, 2.4), toon({ map: T('wood'), color: '#7a3040' }), 0.04);
  plinth.position.y = 0.42;
  root.add(cab, lid, plinth);
  for (const x of [-1.3, 1.3])
    for (const z of [-1.1, 1.1])
      for (const y of [0.55, 1.8]) {
        const c = paintedMesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), brass, 0.015, false);
        c.position.set(x, y, z);
        root.add(c);
      }
  // claw feet
  const footProf = [v2(0.001, 0), v2(0.2, 0.02), v2(0.24, 0.12), v2(0.16, 0.26), v2(0.12, 0.34), v2(0.001, 0.34)];
  for (const x of [-1.15, 1.15])
    for (const z of [-0.95, 0.95]) {
      const f = paintedMesh(new THREE.LatheGeometry(footProf, 10), brass, 0.02);
      f.position.set(x, 0, z);
      root.add(f);
    }
  // the face: grille mouth (a dark slot with brass bars), two eyes and angry brows above it
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.06), dark);
  grille.position.set(0, 0.85, 1.12);
  root.add(grille);
  for (let i = 0; i < 6; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), brass);
    bar.position.set(-0.65 + i * 0.26, 0.85, 1.16);
    root.add(bar);
  }
  const brows: THREE.Mesh[] = [];
  const lids: THREE.Mesh[] = [];
  for (const x of [-0.6, 0.6]) {
    const eye = paintedMesh(new THREE.SphereGeometry(0.3, 14, 12), white, 0.03);
    eye.scale.set(1, 1, 0.45);
    eye.position.set(x, 1.45, 1.1);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), black);
    pupil.position.set(x * 0.92, 1.42, 1.23);
    const lidM = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cabinetMat);
    lidM.scale.set(1, 1, 0.5);
    lidM.position.set(x, 1.45, 1.11);
    lidM.rotation.x = 0.6;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.08), black);
    brow.position.set(x, 1.76, 1.2);
    brow.rotation.z = x > 0 ? 0.35 : -0.35;
    root.add(eye, pupil, lidM, brow);
    brows.push(brow);
    lids.push(lidM);
  }

  // ── the platter on top, with the Red Pen's red record and a little tonearm ──
  const platter = new THREE.Group();
  platter.position.y = 2.1;
  const plate = paintedMesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 32), brass, 0.02);
  const recTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#b81c2c';
    g.beginPath();
    g.arc(64, 64, 63, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let r = 22; r < 62; r += 5) {
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#fff1dc';
    g.beginPath();
    g.arc(64, 64, 16, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.03, 32), [toon({ color: '#7a0d1a' }), toon({ map: recTex }), toon({ map: recTex })]);
  disc.position.y = 0.055;
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), brass);
  spindle.position.y = 0.12;
  platter.add(plate, disc, spindle);
  root.add(platter);
  const toneBase = paintedMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 10), brass, 0.02);
  toneBase.position.set(1.05, 2.25, -0.85);
  const toneArm = paintedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6).rotateZ(Math.PI / 2).rotateY(-0.7).translate(-0.45, 0.2, 0.38), brass, 0.012);
  toneArm.position.copy(toneBase.position);
  root.add(toneBase, toneArm);

  // ── the crank on its right side ──
  const crank = new THREE.Group();
  crank.position.set(1.35, 1.15, 0);
  const shaft = paintedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8).rotateZ(Math.PI / 2).translate(0.15, 0, 0), brass, 0.015);
  const arm = paintedMesh(new THREE.BoxGeometry(0.08, 0.6, 0.08).translate(0.3, 0.3, 0), brass, 0.015);
  const knob = paintedMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 8).rotateZ(Math.PI / 2).translate(0.42, 0.58, 0), dark, 0.015);
  crank.add(shaft, arm, knob);
  root.add(crank);

  // ── the horn: a crooked neck from the cabinet's back, a petalled bell facing forward ──
  const hornPivot = new THREE.Group();
  hornPivot.position.set(0, 2.05, -0.9);
  const hornMat = toon({ map: T('h2_p_brass'), color: '#ff8a7a' });
  const neckPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.9, -0.25), new THREE.Vector3(0, 1.8, -0.05), new THREE.Vector3(0, 2.3, 0.45)];
  const neck = paintedMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neckPts), 16, 0.22, 10, false), brass, 0.03);
  hornPivot.add(neck);
  // the bell: a lathe flare, its rim pinched into 8 petals, bell mouth along +Z
  const prof = [v2(0.22, 0), v2(0.26, 0.4), v2(0.38, 0.85), v2(0.62, 1.3), v2(1.0, 1.65), v2(1.5, 1.9), v2(1.75, 1.98)];
  const bellG = new THREE.LatheGeometry(prof, 40);
  const bp = bellG.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const k = Math.max(0, (y - 0.9) / 1.1);
    const a = Math.atan2(z, x);
    const petal = 1 - k * 0.14 * (1 - Math.abs(Math.cos(a * 4)));
    bp.setXYZ(i, x * petal, y, z * petal);
  }
  bellG.computeVertexNormals();
  bellG.rotateX(Math.PI / 2);
  const bell = paintedMesh(bellG, hornMat, 0); // open shell: no hull (its inside would turn black); the rim carries the ink
  (bell.material as THREE.Material).side = THREE.DoubleSide;
  bell.position.set(0, 2.35, 0.4);
  // ribs along the petals' seams
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const pts = prof.slice(2).map((p) => new THREE.Vector3(Math.cos(a) * p.x * 1.01, Math.sin(a) * p.x * 1.01, p.y));
    const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.035, 5, false), brass);
    bell.add(rib);
  }
  const rim = paintedMesh(new THREE.TorusGeometry(1.72, 0.07, 6, 40), brass, 0.02);
  rim.position.z = 1.98;
  bell.add(rim);
  // the throat deep inside: dark, glowing lilac while it inhales
  const throatMat = new THREE.MeshBasicMaterial({ color: '#2a1630' });
  const throat = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), throatMat);
  throat.position.z = 1.0;
  bell.add(throat);
  hornPivot.add(bell);
  root.add(hornPivot);

  // ── the sweep arm: a long brass tonearm with a needle head, swung round the floor at knee height ──
  const sweep = new THREE.Group();
  sweep.position.y = 0.45;
  const beam = paintedMesh(new THREE.CylinderGeometry(0.09, 0.12, SWEEP_R - 1.2, 8).rotateZ(Math.PI / 2).translate(1.2 + (SWEEP_R - 1.2) / 2, 0, 0), brass, 0.025);
  const head = paintedMesh(new THREE.BoxGeometry(0.6, 0.3, 0.42).translate(SWEEP_R, 0, 0), toon({ color: '#2a1630' }), 0.025);
  const sweepNeedle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 6).rotateX(Math.PI).translate(SWEEP_R + 0.1, -0.25, 0), new THREE.MeshBasicMaterial({ color: '#e8323c' }));
  sweep.add(beam, head, sweepNeedle);
  sweep.visible = false;
  root.add(sweep);

  return { root, hornPivot, hornMat, throatMat, platter, crank, sweep, sweepNeedle, brows, lids, cabinetMat, mouthY: 2.05 + 2.35 };
}
