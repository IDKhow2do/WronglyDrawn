/**
 * [INPUT]: depends on harborMats from ./HarborModels; StaticBatch, lathe, latheHull, block, v2 from ./HarborKit;
 *          DoodleEyes / EYE_STYLES from render/DoodleEye; addOutline from render/Materials
 * [OUTPUT]: exports buildLantern() and the Lantern type (root, eyes, wake(), update())
 * [POS]: the lighthouse Guardian's lamp room interior and face, built for MuteHarbor: painted timber glazing
 *        bars with ink (no glass volume: clear panes with drawn glints), a faceted Fresnel lens on a turned
 *        brass stand, and the sleepy doodle eyes. MuteHarbor keeps the drum, roof and horn (HarborModels,
 *        HarborArt) and calls wake() when the lighthouse sings; the lens and eyes animate themselves.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../../core/AssetManager';
import { addOutline } from '../../render/Materials';
import { DoodleEyes, EYE_STYLES } from '../../render/DoodleEye';
import { harborMats } from './HarborModels';
import { StaticBatch, block, lathe, latheHull, v2 } from './HarborKit';

export interface Lantern {
  /** Glazing, glints, lens and stand (world space). */
  root: THREE.Group;
  /** The face's eyes: the caller mounts the group on its lamp face (+Z outward). */
  eyes: DoodleEyes;
  /** Silenced → singing: the lens glows and turns, the eyes open and take colour. */
  wake(): void;
  /** `watch`: a point the eyes follow while it is near the gallery (the camera, i.e. WAI's shoulder). */
  update(dt: number, watch: THREE.Vector3): void;
}

/** Lens half height; the stand fills the gap down to the drum floor. */
const LENS_H = 0.98;
const LENS_R = 0.92;
const SILENT = new THREE.Color('#b4b0cc');
const GLOW = new THREE.Color('#ffb547');

// ───────────── the lens's painted facets (one shared canvas) ─────────────
let lensTex: THREE.CanvasTexture | null = null;
function lensTexture(): THREE.CanvasTexture {
  if (lensTex) return lensTex;
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // amber glass, lighter in the middle of each facet
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, '#e8892c');
  bg.addColorStop(0.5, '#ffd77a');
  bg.addColorStop(1, '#e8892c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.lineCap = 'round';
  // prism rings above and below the belt
  for (let y = 10; y < H; y += 17) {
    if (Math.abs(y - H / 2) < 40) continue;
    g.strokeStyle = 'rgba(150,70,20,0.85)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(W / 2, y + (y < H / 2 ? 5 : -5), W, y);
    g.stroke();
    g.strokeStyle = 'rgba(255,248,210,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(8, y + 5);
    g.quadraticCurveTo(W / 2, y + (y < H / 2 ? 10 : 0), W - 8, y + 5);
    g.stroke();
  }
  // the bullseye in the belt
  g.fillStyle = '#fff4bf';
  g.beginPath();
  g.arc(W / 2, H / 2, 34, 0, Math.PI * 2);
  g.fill();
  for (const r of [12, 22, 32]) {
    g.strokeStyle = 'rgba(170,80,20,0.9)';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // brass frame between facets
  g.fillStyle = '#6e3f17';
  g.fillRect(0, 0, 5, H);
  g.fillRect(W - 5, 0, 5, H);
  // a white glint stroke
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(26, 40);
  g.lineTo(18, 92);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(30, 104);
  g.lineTo(27, 120);
  g.stroke();
  lensTex = new THREE.CanvasTexture(c);
  lensTex.colorSpace = THREE.SRGBColorSpace;
  lensTex.wrapS = THREE.RepeatWrapping;
  lensTex.repeat.set(10, 1);
  lensTex.anisotropy = 4;
  lensTex.userData.keep = true;
  return lensTex;
}

/** Barrel lens profile: smooth belt, saw-toothed prism rings above and below (y from −LENS_H to LENS_H). */
function lensProfile(): THREE.Vector2[] {
  const R = (y: number) => LENS_R * Math.sqrt(Math.max(0.05, 1 - (y / (LENS_H * 1.22)) ** 2));
  const pts: THREE.Vector2[] = [v2(0.001, -LENS_H), v2(R(-LENS_H) * 0.7, -LENS_H)];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const y = -LENS_H + (i / N) * (LENS_H - 0.3);
    pts.push(v2(R(y) - 0.07, y + 0.01), v2(R(y + 0.1), y + (LENS_H - 0.3) / N - 0.005));
  }
  pts.push(v2(R(-0.3), -0.28), v2(R(0), 0), v2(R(0.3), 0.28));
  for (let i = N - 1; i >= 0; i--) {
    const y = LENS_H - ((i + 1) / N) * (LENS_H - 0.3);
    pts.push(v2(R(y + 0.1), y + 0.005), v2(R(y + (LENS_H - 0.3) / N) - 0.07, y + (LENS_H - 0.3) / N - 0.01));
  }
  pts.push(v2(R(LENS_H) * 0.7, LENS_H), v2(0.001, LENS_H));
  return pts;
}

/**
 * Build the lamp room's inside around `lampAt` (the lens centre). `galleryY` = the drum's foot; `faceAngle` = the
 * bearing the face looks along (no bars there, so the eyes and horn sit on a clear pane).
 */
export function buildLantern(assets: AssetManager, o: { lampAt: THREE.Vector3; galleryY: number; faceAngle: number }): Lantern {
  const M = harborMats(assets);
  const root = new THREE.Group();
  root.name = 'lantern-room';
  const { x, z } = o.lampAt;
  const y0 = o.galleryY;
  const B = new StaticBatch();
  const onRing = (g: THREE.BufferGeometry, th: number, r: number, y: number) => g.translate(0, 0, r).rotateY(Math.PI / 2 - th).translate(x, y, z);

  // ───── glazing: square painted timber bars with ink, three rings ─────
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    const d = Math.atan2(Math.sin(th - o.faceAngle), Math.cos(th - o.faceAngle));
    if (Math.abs(d) < 0.62) continue;
    B.add(onRing(block(0.17, 2.78, 0.15, 0.04, 30 + i, 1.2), th, 2.04, y0 + 2.2), M.teal, 0.03);
  }
  for (const [yy, r, t] of [[0.86, 2.08, 0.1], [2.2, 2.05, 0.07], [3.54, 2.08, 0.1]] as [number, number, number][]) {
    const seg = 40;
    const arc = yy === 2.2 ? Math.PI * 2 - 1.3 : Math.PI * 2;
    const g = new THREE.TorusGeometry(r, t, 6, seg, arc).rotateX(Math.PI / 2);
    if (yy === 2.2) g.rotateY(-(o.faceAngle + 0.65));
    B.add(g.translate(x, y0 + yy, z), M.cream, 0.025);
  }
  // drawn glints on the panes: two white strokes on every other pane (no glass volume, nothing to sort)
  const glint = new THREE.MeshBasicMaterial({ color: '#fdfaff', side: THREE.DoubleSide });
  for (let i = 0; i < 12; i += 2) {
    const th = ((i + 0.5) / 12) * Math.PI * 2;
    const d = Math.atan2(Math.sin(th - o.faceAngle), Math.cos(th - o.faceAngle));
    if (Math.abs(d) < 0.9) continue;
    for (const [dx, len, w] of [[-0.12, 0.85, 0.07], [0.1, 0.4, 0.05]]) {
      const g = new THREE.PlaneGeometry(w, len).rotateZ(-0.45).translate(dx, 0.55 + (i % 4) * 0.12, 0);
      B.add(onRing(g, th, 2.035, y0 + 2.2), glint, 0);
    }
  }

  // ───── the turned brass stand ─────
  const foot = y0 + 0.8;
  const top = o.lampAt.y - LENS_H;
  const h = top - foot;
  const standP = [v2(0.62, 0), v2(0.64, 0.06), v2(0.5, 0.1), v2(0.28, h * 0.35), v2(0.22, h * 0.55), v2(0.3, h * 0.7), v2(0.56, h * 0.92), v2(0.58, h), v2(0.001, h)];
  B.add(lathe(standP, 18, 0.006, 1).translate(x, foot, z), M.brass, 0, latheHull(standP.slice(0, 8), 18, 0.006, 0.025).translate(x, foot, z));
  // brass caps top and bottom of the lens, with a little vent on top
  const capP = [v2(0.001, 0), v2(0.7, 0), v2(0.74, 0.07), v2(0.55, 0.16), v2(0.2, 0.22), v2(0.2, 0.34), v2(0.3, 0.38), v2(0.001, 0.4)];
  B.add(lathe(capP, 18, 0.006, 1).translate(x, o.lampAt.y + LENS_H - 0.02, z), M.brass, 0, latheHull(capP.slice(1, 7), 18, 0.006, 0.025).translate(x, o.lampAt.y + LENS_H - 0.02, z));
  B.flush(root, 'lantern-room');
  root.traverse((m) => (m.userData.noPaint = true));

  // ───── the lens: faceted amber glass, dull while silenced, glowing and turning once it sings ─────
  const tex = lensTexture();
  const lensMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, color: SILENT, emissive: '#000000', roughness: 0.35, metalness: 0.05 });
  const lens = new THREE.Mesh(new THREE.LatheGeometry(lensProfile(), 30), lensMat);
  lens.name = 'lantern-lens';
  lens.position.copy(o.lampAt);
  addOutline(lens, 0.03);
  lens.userData.noPaint = true;
  root.add(lens);

  // ───── the face's eyes: sleepy, greyed, lashes hanging while silenced ─────
  const eyes = new DoodleEyes({ ...EYE_STYLES.SLEEPY, open: 0.46, size: 0.5, spacing: 1.72, iris: '#2fa7c9', lid: '#ff8a7a', selfLit: 0.4, bulge: 0.42 });
  eyes.group.position.set(0, 0.6, 0.06);
  eyes.grey = 0.75;
  eyes.settle();

  let woken = false;
  let t = 0;
  return {
    root,
    eyes,
    wake() {
      if (woken) return;
      woken = true;
      lensMat.color.set('#ffffff');
      eyes.open = 0.92;
      eyes.grey = 0;
      eyes.wide = 1;
      eyes.blink();
      for (const e of eyes.eyes) {
        e.autoBlink = true;
        e.flash('#ffe08a');
      }
    },
    update(dt, watch) {
      t += dt;
      // the eyes watch whoever is up on the gallery; otherwise they drift over the sea
      const near = watch.distanceToSquared(o.lampAt) < 14 * 14;
      eyes.follow = near ? watch : null;
      if (!near) eyes.lookAt(Math.sin(t * 0.23) * 0.5, -0.15 + Math.sin(t * 0.17) * 0.15);
      if (woken) {
        // surprise fades into a steady, happy open
        for (const e of eyes.eyes) e.wide = Math.max(0, e.wide - dt * 0.4);
        lens.rotation.y += dt * 0.6;
        lensMat.emissive.copy(GLOW).multiplyScalar(0.85 + 0.15 * Math.sin(t * 3));
      }
    },
  };
}
