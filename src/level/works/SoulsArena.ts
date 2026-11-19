/**
 * [INPUT]: depends on FloorBuild (group, phys, B, mats) from ./WorksShell; girder from ./WorksKit; lathe/v2 from ../harbor/HarborKit;
 *          addOutline from render/Materials;
 *          RAPIER colliders via PhysicsWorld; WORKS/FY from ./WorksLayout
 * [OUTPUT]: exports SoulsArena (the wet-ink curtain ring with its gate: seal(), unseal(), dissolve(), crossedIn(), update()) and
 *           dressArena() (the props round the ring: correction scaffolds, a giant ink bottle, cross-out banners)
 * [POS]: the souls-like fight's stage on the Limp Works roof, built by Roof.ts. A ring of dripping red ink 5 m tall stands round
 *        the arena (radius WORKS.arenaR) with one way in, the GATE facing the roof checkpoint: WAI pushes through the hanging
 *        ink there and the fight starts (SoulsFight); the gate then seals behind him. After the Pen is won over the curtain
 *        dissolves and the gate's frame (posts + ruler lintel) sinks into the roof (it stood in front of the result card's
 *        camera). Colliders are tagged 'barrier' (WAI cannot pass; the follow camera can).
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { RAPIER } from '../../core/PhysicsWorld';
import { lathe, v2 } from '../harbor/HarborKit';
import { girder } from './WorksKit';
import { WORKS } from './WorksLayout';
import { addOutline } from '../../render/Materials';
import type { FloorBuild } from './WorksShell';

const H = 5.2;
const GAP = 3.4;

/** A canvas of red ink running down in streaks (alpha in the texture: drips are thicker at the top). */
function dripTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(120,10,34,0.95)');
  grad.addColorStop(0.18, 'rgba(120,10,34,0.5)');
  grad.addColorStop(1, 'rgba(120,10,34,0.06)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 256, w = 3 + rnd() * 9, len = 60 + rnd() * 196;
    g.fillStyle = `rgba(${90 + rnd() * 50},${6 + rnd() * 14},${30 + rnd() * 20},${0.55 + rnd() * 0.4})`;
    g.fillRect(x, 0, w, len);
    g.beginPath();
    g.arc(x + w / 2, len, w * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SoulsArena {
  readonly center: THREE.Vector3;
  readonly R: number;
  /** Yaw of the gate as seen from the centre. */
  readonly gateAng: number;
  readonly gatePos: THREE.Vector3;
  sealed = false;
  private walls: RAPIER.Collider[] = [];
  private gateCol: RAPIER.Collider | null = null;
  private curtain: THREE.Mesh;
  private gateSheet: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private gateMat: THREE.MeshBasicMaterial;
  private fade = 1;
  private gateParts = new THREE.Group();
  private gone = false;

  constructor(private f: FloorBuild) {
    this.center = WORKS.arena.clone();
    this.R = WORKS.arenaR + 0.4;
    this.gatePos = WORKS.gate.clone();
    this.gateAng = Math.atan2(this.gatePos.x - this.center.x, this.gatePos.z - this.center.z);
    const y = f.y;
    const tex = dripTexture();
    tex.repeat.set(16, 1);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, fog: false });
    // the ring, open at the gate (thetaStart/length round the Y axis: CylinderGeometry θ = 0 points at +Z)
    const half = GAP / 2 / this.R;
    const geo = new THREE.CylinderGeometry(this.R, this.R, H, 120, 1, true, this.gateAng + half, Math.PI * 2 - half * 2);
    this.curtain = new THREE.Mesh(geo, this.mat);
    this.curtain.position.set(this.center.x, y + H / 2, this.center.z);
    this.curtain.userData.noPaint = true;
    this.curtain.renderOrder = 3;
    f.group.add(this.curtain);
    // the gate: a hanging sheet of wet ink across the gap (brighter, rippling)
    const gt = tex.clone();
    gt.repeat.set(1.2, 1);
    gt.needsUpdate = true;
    this.gateMat = new THREE.MeshBasicMaterial({ map: gt, color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.gateSheet = new THREE.Mesh(new THREE.PlaneGeometry(GAP + 0.3, H, 8, 6), this.gateMat);
    this.gateSheet.position.set(this.center.x + Math.sin(this.gateAng) * this.R, y + H / 2, this.center.z + Math.cos(this.gateAng) * this.R);
    this.gateSheet.rotation.y = this.gateAng;
    this.gateSheet.userData.noPaint = true;
    this.gateSheet.renderOrder = 3;
    f.group.add(this.gateSheet);
    // two posts and a ruler lintel: the gate's frame (a group of its own: it goes with the ink when the Pen draws)
    f.group.add(this.gateParts);
    for (const s of [-1, 1]) {
      const a = this.gateAng + s * (half + 0.03);
      const px = this.center.x + Math.sin(a) * this.R, pz = this.center.z + Math.cos(a) * this.R;
      const post = [v2(0.3, 0), v2(0.32, 0.2), v2(0.18, 0.35), v2(0.16, H), v2(0.34, H + 0.15), v2(0.001, H + 0.5)];
      const pm = new THREE.Mesh(lathe(post, 10, 0).translate(px, y, pz), f.mats.steelDark);
      addOutline(pm, 0.03);
      pm.castShadow = true;
      this.gateParts.add(pm);
      this.walls.push(f.phys.addStaticCylinder(new THREE.Vector3(px, y + H / 2, pz), H / 2, 0.3));
    }
    // a giant ruler laid across the posts: the gate's lintel
    {
      const rt = f.ctx.assets.tex('w3_ruler').clone();
      rt.repeat.set(2, 1);
      rt.needsUpdate = true;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(GAP + 1.4, 0.55, 0.3), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.8 }));
      lintel.position.copy(this.gateSheet.position).setY(y + H + 0.2);
      lintel.rotation.set(0, this.gateAng, -0.05);
      lintel.castShadow = true;
      lintel.userData.noPaint = true;
      this.gateParts.add(lintel);
    }
    // the ring's walls (WAI cannot pass; the gap stays open until seal())
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const d = Math.atan2(Math.sin(a - this.gateAng), Math.cos(a - this.gateAng));
      if (Math.abs(d) < half + Math.PI / n) continue;
      const hw = Math.tan(Math.PI / n) * this.R + 0.05;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.walls.push(f.phys.addStaticBox(new THREE.Vector3(this.center.x + Math.sin(a) * this.R, y + 2.5, this.center.z + Math.cos(a) * this.R), new THREE.Vector3(hw, 2.5, 0.12), q, 'barrier'));
    }
  }

  /** WAI is through: close the gap behind him. */
  seal(): void {
    if (this.sealed || this.gone) return;
    this.sealed = true;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.gateAng);
    this.gateCol = this.f.phys.addStaticBox(this.gateSheet.position.clone().setY(this.f.y + 2.5), new THREE.Vector3(GAP / 2 + 0.2, 2.5, 0.15), q, 'barrier');
  }

  /** Open the gap again (WAI was smudged: the run back starts outside). */
  unseal(): void {
    if (!this.gateCol) return;
    this.f.phys.untag(this.gateCol);
    this.f.phys.world.removeCollider(this.gateCol, false);
    this.gateCol = null;
    this.sealed = false;
  }

  /** The Pen is won over: the ink runs off and the ring is gone. */
  dissolve(): void {
    this.unseal();
    this.gone = true;
    for (const c of this.walls) {
      this.f.phys.untag(c);
      this.f.phys.world.removeCollider(c, false);
    }
    this.walls.length = 0;
  }

  /** Distance of `p` from the ring's centre. */
  radial(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.center.x, p.z - this.center.z);
  }

  /** Did WAI step through the gate this step (outside → inside, through the gap)? */
  crossedIn(prev: THREE.Vector3, now: THREE.Vector3): boolean {
    if (this.sealed || this.gone) return false;
    return this.radial(prev) >= this.R - 0.6 && this.radial(now) < this.R - 0.6 && now.distanceTo(this.gatePos) < GAP + 1.5 && Math.abs(now.y - this.f.y) < 1.5;
  }

  /** How close WAI is to the gate (0..1, for the prompt and the glow). */
  near(p: THREE.Vector3): number {
    if (this.sealed || this.gone) return 0;
    return Math.max(0, 1 - p.distanceTo(this.gatePos) / 5);
  }

  update(dt: number, time: number, waiPos: THREE.Vector3, camPos: THREE.Vector3): void {
    if (this.gone) this.fade = Math.max(0, this.fade - dt * 0.6);
    this.curtain.visible = this.gateSheet.visible = this.fade > 0.01;
    // the frame sinks into the roof as the ink runs off (it must not stand in front of the ending's camera)
    if (this.gone) {
      this.gateParts.position.y = -(1 - this.fade) * (H + 1);
      this.gateParts.visible = this.fade > 0.02;
    }
    if (!this.curtain.visible) return;
    this.mat.map!.offset.y = -time * 0.12;
    // the camera backed out past the curtain (WAI at the rim): see through it
    const outside = this.radial(camPos) > this.R - 0.4;
    this.mat.opacity = (outside ? 0.16 : 0.5) * this.fade;
    const g = this.gateMat;
    g.map!.offset.y = -time * 0.2;
    const k = this.near(waiPos);
    g.opacity = (this.sealed ? 0.95 : 0.86 + 0.1 * k + 0.04 * Math.sin(time * 5)) * this.fade;
    g.color.set(this.sealed ? '#8a0a1c' : '#c8102a');
    // the sheet bulges as WAI leans into it
    const pos = this.gateSheet.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), yy = pos.getY(i);
      pos.setZ(i, Math.sin(time * 2.2 + x * 1.7 + yy * 0.9) * 0.08 - k * 0.5 * Math.cos((x / (GAP + 0.3)) * Math.PI) * (1 - Math.abs(yy) / H));
    }
    pos.needsUpdate = true;
  }
}

/** The props round the ring: two correction scaffolds with cross-out banners and a giant red ink bottle (outside the ring). */
export function dressArena(f: FloorBuild): THREE.Mesh[] {
  const y = f.y;
  const { B, mats, phys } = f;
  const banners: THREE.Mesh[] = [];
  const bannerTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff3dc';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#d8283a';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(22, 40);
    g.lineTo(106, 150);
    g.moveTo(106, 40);
    g.lineTo(22, 150);
    g.stroke();
    g.fillStyle = '#d8283a';
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.fillText('REDO', 64, 210);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const [sx, sz] of [[-10, -19.0], [10, -19.0], [-19.6, -10], [19.6, -11]] as [number, number][]) {
    const h = 9;
    for (const [dx, dz] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]]) girder(B, new THREE.Vector3(sx + dx, y, sz + dz), new THREE.Vector3(sx + dx * 0.9, y + h, sz + dz * 0.9), 0.16, 0.14, mats.steelDark);
    for (const hh of [3, 6, 9]) {
      B.add(new THREE.BoxGeometry(2.4, 0.12, 2.0).translate(sx, y + hh, sz), mats.wood, 0.02);
    }
    // diagonal braces
    girder(B, new THREE.Vector3(sx - 1, y + 0.2, sz - 0.8), new THREE.Vector3(sx + 1, y + 3, sz - 0.8), 0.1, 0.1, mats.steel);
    girder(B, new THREE.Vector3(sx + 1, y + 3.2, sz - 0.8), new THREE.Vector3(sx - 1, y + 6, sz - 0.8), 0.1, 0.1, mats.steel);
    phys.addStaticBox(new THREE.Vector3(sx, y + h / 2, sz), new THREE.Vector3(1.2, h / 2, 1.0));
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.6, 4, 8), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.9 }));
    const toC = Math.atan2(WORKS.arena.x - sx, WORKS.arena.z - sz);
    banner.position.set(sx + Math.sin(toC) * 1.3, y + 7.1, sz + Math.cos(toC) * 1.3);
    banner.rotation.y = toC;
    banner.castShadow = true;
    banner.userData.noPaint = true;
    f.group.add(banner);
    banners.push(banner);
  }
  // a giant bottle of correction ink by the west parapet
  {
    const bx = -19.4, bz = 5;
    const bottle = [v2(0.001, 0), v2(1.5, 0), v2(1.6, 0.2), v2(1.6, 2.6), v2(1.2, 3.1), v2(0.6, 3.3), v2(0.62, 3.9), v2(0.75, 4.0), v2(0.001, 4.05)];
    B.add(lathe(bottle, 20, 0.02).translate(bx, y, bz), mats.red, 0.05);
    B.add(new THREE.CylinderGeometry(1.62, 1.62, 1.0, 20, 1, true).translate(bx, y + 1.4, bz), mats.steel, 0.02);
    phys.addStaticCylinder(new THREE.Vector3(bx, y + 2, bz), 2, 1.6);
  }
  return banners;
}
