/**
 * [INPUT]: depends on three; GameContext (root, physics.sphereCast for the ground) from ../core/Context; LevelId from
 *          ../level/Session; t / onLangChange from ../i18n
 * [OUTPUT]: exports MarginNotes (one set per session; dispose) and NOTE_SPOTS (where each level's notes hang)
 * [POS]: the Red Pen's voice in the world, before the player meets it: the outside standard's marks in red marker,
 *        written as a standard, not a person ("Windows: 4 per row.", "Volume: over limit.", "Legs: not to spec."), each
 *        with WAI's pencil answer under it: "why?".
 *        Each note is a correction slip on a little stake, stuck in the ground on the main path (so it needs no wall:
 *        the ground height comes from a physics ray). Drawing only (no collider, no paint), redrawn when the language
 *        flips. StoryFlow.decorate places one set per session; level 3 (already full of the Pen's stamps) gets one.
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { LevelId } from '../level/Session';
import { onLangChange, t } from '../i18n';

export interface NoteSpot {
  /** Where the stake stands: x, a height above the ground there (the ray starts 3 m over it), z. */
  pos: [number, number, number];
  /** Which way the slip faces (0 = toward +z: a player walking toward −z reads it). */
  yaw: number;
  /** English source of the Pen's line. */
  text: string;
  /** Width in metres. */
  w?: number;
  rot?: number;
}

/** Where the notes hang, per level (picked in the browser: walls on the main path, at eye height). */
export const NOTE_SPOTS: Record<LevelId, NoteSpot[]> = {
  plaza: [
    { pos: [2.6, 0.2, 41.5], yaw: -0.35, text: 'Windows: 4 per row.' },
    { pos: [-7.5, 2.2, 27], yaw: 0.5, text: 'Eyes: 2. See the rules.' },
  ],
  harbor: [
    { pos: [5.2, 0.7, 42.5], yaw: -0.3, text: 'Volume: over limit.' },
    { pos: [-3.5, 0.7, 36], yaw: 0.4, text: 'Not to scale.' },
  ],
  works: [{ pos: [-6.5, 0.2, 13.5], yaw: 0.3, text: 'Legs: not to spec.' }],
};

function drawNote(text: string, rot: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 636;
  const g = c.getContext('2d')!;
  // the slip: a torn-off piece of ruled exercise paper with its red margin
  g.fillStyle = '#fbf3e2';
  g.beginPath();
  g.moveTo(14, 18);
  for (let x = 14; x <= 1010; x += 34) g.lineTo(x, 12 + ((x * 7) % 13));
  g.lineTo(1010, 620);
  g.lineTo(14, 624);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(92, 142, 214, .45)';
  g.lineWidth = 3;
  for (let y = 120; y < 620; y += 74) {
    g.beginPath();
    g.moveTo(14, y);
    g.lineTo(1010, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(224, 38, 47, .5)';
  g.beginPath();
  g.moveTo(96, 14);
  g.lineTo(96, 624);
  g.stroke();
  g.translate(540, 250);
  g.rotate(rot);
  const hand = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "WD Hand", "Wawati SC", "HanziPen SC", "KaiTi", sans-serif';
  let size = 120;
  g.font = `900 ${size}px ${hand}`;
  while (g.measureText(text).width > 820 && size > 50) {
    size -= 6;
    g.font = `900 ${size}px ${hand}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // the Pen's marker: a darker underlay for the bleed, then the red
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(140, 10, 20, .55)';
  g.lineWidth = 10;
  g.strokeText(text, 0, 0);
  g.fillStyle = '#e0262f';
  g.fillText(text, 0, 0);
  const w = Math.min(820, g.measureText(text).width);
  g.strokeStyle = '#e0262f';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-w / 2, size * 0.62);
  g.quadraticCurveTo(0, size * 0.72, w / 2, size * 0.55);
  g.stroke();
  // WAI's answer, in pencil
  g.rotate(-rot * 1.6 + 0.06);
  g.font = `700 ${Math.round(size * 0.62)}px ${hand}`;
  g.fillStyle = 'rgba(43, 39, 48, .92)';
  g.fillText(t('why?'), w * 0.22, size * 1.55);
  return c;
}

export class MarginNotes {
  private meshes: { mesh: THREE.Mesh; spot: NoteSpot; group: THREE.Group }[] = [];
  private off: () => void;

  constructor(ctx: GameContext, level: LevelId) {
    const stakeMat = new THREE.MeshBasicMaterial({ color: '#8a5a3c', fog: true });
    const backMat = new THREE.MeshBasicMaterial({ color: '#efe4cc', fog: true });
    const down = new THREE.Vector3(0, -1, 0);
    for (const spot of NOTE_SPOTS[level]) {
      const w = spot.w ?? 1.5;
      // stand on whatever is drawn there: a ray from 3 m above the hint straight down
      const from = new THREE.Vector3(spot.pos[0], spot.pos[1] + 3, spot.pos[2]);
      const d = ctx.physics.sphereCast(from, down, 12, 0.05);
      const ground = Number.isFinite(d) && d < 12 ? from.y - d : spot.pos[1];
      const g = new THREE.Group();
      g.position.set(spot.pos[0], ground, spot.pos[2]);
      g.rotation.y = spot.yaw;
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.04), stakeMat);
      stake.position.y = 0.65;
      const mat = new THREE.MeshBasicMaterial({ transparent: true, fog: true, alphaTest: 0.02 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), mat);
      mesh.position.set(0, 1.25 + w * 0.2, 0.03);
      mesh.rotation.set(-0.08, 0, (spot.rot ?? -0.05) * 0.5);
      mesh.renderOrder = 3;
      // the back of the slip is plain paper (a double-sided text plane read mirrored from behind)
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.97, w * 0.6), backMat);
      back.position.set(0, 1.25 + w * 0.2, 0.02);
      back.rotation.set(-0.08, Math.PI, -(spot.rot ?? -0.05) * 0.5);
      g.add(stake, mesh, back);
      g.traverse((o) => {
        o.userData.noPaint = true;
        o.userData.noFade = true;
      });
      ctx.root.add(g);
      this.meshes.push({ mesh, spot, group: g });
    }
    this.paint();
    this.off = onLangChange(() => this.paint());
  }

  private paint(): void {
    for (const { mesh, spot } of this.meshes) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      const tex = new THREE.CanvasTexture(drawNote(t(spot.text), spot.rot ?? -0.05));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  dispose(): void {
    this.off();
    for (const { mesh, group } of this.meshes) {
      group.parent?.remove(group);
      (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.geometry.dispose();
    }
    this.meshes = [];
  }
}
