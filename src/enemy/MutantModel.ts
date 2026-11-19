import * as THREE from 'three';
import { PAL, labelCanvas } from '../render/PaintTextures';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';
import type { AssetManager } from '../core/AssetManager';

/**
 * Crooked-leg leg rig, shared by the mutant and the living box.
 * Thigh → knee → shin → foot, all procedural.
 */
export class CrookedLeg {
  readonly hip = new THREE.Group();
  readonly knee = new THREE.Group();
  readonly foot: THREE.Object3D;

  /**
   * @param parts optional sculpted parts (Tripo): each with its pivot at the top,
   *              extending down −Y; they are stretched to the requested lengths.
   */
  constructor(
    thighLen: number,
    shinLen: number,
    mat: THREE.Material,
    footMat: THREE.Material,
    thickness = 0.09,
    parts?: { thigh: THREE.Object3D; shin: THREE.Object3D; foot: THREE.Object3D; partLen: number },
  ) {
    this.knee.position.y = -thighLen;
    this.hip.add(this.knee);
    const kneeBall = paintedMesh(new THREE.SphereGeometry(thickness * 1.25, 8, 6), footMat, 0.015);
    this.knee.add(kneeBall);
    if (parts) {
      // sculpted parts: stretch to length, and bulk them up (the legs should feel oversized)
      parts.thigh.scale.set(1.7, thighLen / parts.partLen, 1.7);
      parts.shin.scale.set(1.6, shinLen / parts.partLen, 1.6);
      parts.foot.scale.setScalar(1.5);
      this.hip.add(parts.thigh);
      this.knee.add(parts.shin);
      this.foot = parts.foot;
      this.foot.position.set(0, -shinLen, 0);
      this.knee.add(this.foot);
      return;
    }
    const thigh = paintedMesh(new THREE.CylinderGeometry(thickness, thickness * 0.8, thighLen, 7), mat, 0.02);
    thigh.position.y = -thighLen / 2;
    this.hip.add(thigh);
    const shin = paintedMesh(new THREE.CylinderGeometry(thickness * 0.8, thickness * 0.6, shinLen, 7), mat, 0.02);
    shin.position.y = -shinLen / 2;
    this.knee.add(shin);
    this.foot = paintedMesh(wonkyBox(thickness * 2.6, thickness * 1.1, thickness * 3.4, 0.15, 9), footMat, 0.015);
    this.foot.position.set(0, -shinLen, thickness * 0.8);
    this.knee.add(this.foot);
  }

  pose(hipX: number, kneeX: number, hipZ = 0): void {
    this.hip.rotation.set(hipX, 0, hipZ);
    this.knee.rotation.x = kneeX;
    this.foot.rotation.x = -(hipX + kneeX) * 0.8;
  }
}

/** Visual for the Crooked-Leg Mutant: a graffiti trash bin on two wrong legs. */
export class MutantModel {
  readonly root = new THREE.Group();
  readonly bodyPivot = new THREE.Group();
  readonly legsGroup = new THREE.Group();
  readonly legL: CrookedLeg;
  readonly legR: CrookedLeg;
  readonly binMat: THREE.MeshToonMaterial;
  private calmMat: THREE.MeshToonMaterial;
  private bin: THREE.Mesh;
  private eyeIris: THREE.Mesh;
  private lid: THREE.Group;
  private bar: THREE.Sprite;
  private barCanvas: HTMLCanvasElement;
  private barTex: THREE.CanvasTexture;
  private alert: THREE.Sprite;
  private zzz: THREE.Sprite;
  phase = 0;
  private time = 0;
  private flash = 0;
  private telegraph = 0;
  /** Standing hip height (0 when legless). */
  hipHeight = 1.1;
  private currentHip = 1.1;

  constructor(assets: AssetManager) {
    this.root.name = 'CrookedLegMutant';
    this.binMat = toon({ map: assets.tex('mutant'), emissive: 0x000000 });
    this.calmMat = toon({ map: assets.tex('mutant_calm') });
    this.root.add(this.bodyPivot);

    const override = assets.instantiateModel('mutant');

    // --- bin body ---
    const binGeo = new THREE.CylinderGeometry(0.46, 0.4, 0.9, 10, 2);
    const pos = binGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const dent = Math.sin(pos.getX(i) * 9 + y * 5) * 0.03;
      pos.setX(i, pos.getX(i) * (1 + dent) + (y > 0 ? 0.05 : 0));
    }
    binGeo.computeVertexNormals();
    this.bin = paintedMesh(binGeo, this.binMat, 0.035);
    this.bin.position.y = 0.45;
    this.bodyPivot.add(this.bin);

    this.lid = new THREE.Group();
    const lidMesh = paintedMesh(new THREE.CylinderGeometry(0.52, 0.5, 0.1, 10), toon({ color: '#2c2433' }), 0.03);
    this.lid.add(lidMesh);
    const handle = paintedMesh(new THREE.TorusGeometry(0.12, 0.03, 6, 10, Math.PI), toon({ color: PAL.orange }), 0.01);
    handle.position.y = 0.05;
    this.lid.add(handle);
    this.lid.position.set(0.05, 0.95, 0);
    this.lid.rotation.z = 0.3;
    this.bodyPivot.add(this.lid);

    // corrupted eye bulging from the bin
    const eyeWhite = paintedMesh(new THREE.SphereGeometry(0.22, 16, 12), toon({ color: '#f3e6ff' }), 0.025);
    eyeWhite.position.set(-0.05, 0.62, 0.36);
    eyeWhite.scale.set(1.1, 0.9, 0.6);
    this.bodyPivot.add(eyeWhite);
    this.eyeIris = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), toon({ color: '#b23cff', emissive: '#6a00a8' }));
    this.eyeIris.position.set(-0.05, 0.62, 0.46);
    this.eyeIris.scale.set(1, 1, 0.4);
    this.bodyPivot.add(this.eyeIris);

    // jagged mouth
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.16), new THREE.MeshBasicMaterial({ color: PAL.black, side: THREE.DoubleSide }));
    mouth.position.set(0.02, 0.3, 0.43);
    mouth.rotation.x = -0.12;
    this.bodyPivot.add(mouth);
    const toothMat = toon({ color: PAL.cream });
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 3), toothMat);
      t.position.set(-0.22 + i * 0.09, 0.35, 0.44);
      t.rotation.z = Math.PI;
      this.bodyPivot.add(t);
    }

    if (override) {
      this.bodyPivot.children.forEach((c) => (c.visible = false));
      this.bodyPivot.add(override);
    }

    // --- crooked legs (the corrupted organ) ---
    const legMat = toon({ color: '#3a1d52', emissive: '#2a0040' });
    const footMat = toon({ color: '#ff3cf0', emissive: '#550055' });
    const parts = () => {
      const thigh = assets.instantiateModel('mutantThigh', { pivot: 'top' });
      const shin = assets.instantiateModel('mutantShin', { pivot: 'top' });
      const foot = assets.instantiateModel('mutantFoot', { pivot: 'top' });
      return thigh && shin && foot ? { thigh, shin, foot, partLen: 0.62 } : undefined;
    };
    this.legL = new CrookedLeg(0.62, 0.62, legMat, footMat, 0.09, parts());
    this.legR = new CrookedLeg(0.5, 0.6, legMat, footMat, 0.1, parts());
    this.legL.hip.position.set(-0.22, 0, 0);
    this.legR.hip.position.set(0.24, 0, 0.02);
    this.legsGroup.add(this.legL.hip, this.legR.hip);
    this.root.add(this.legsGroup);

    // --- corruption meter (billboard) ---
    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = 256;
    this.barCanvas.height = 48;
    this.barTex = new THREE.CanvasTexture(this.barCanvas);
    this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, depthTest: false, transparent: true }));
    this.bar.scale.set(1.4, 0.26, 1);
    this.bar.renderOrder = 10;
    this.bar.visible = false; // HUD boss bar is used instead
    this.root.add(this.bar);
    this.setMeter(1);

    const alertTex = new THREE.CanvasTexture(labelCanvas('!', PAL.red, PAL.white, 64, 64));
    alertTex.colorSpace = THREE.SRGBColorSpace;
    this.alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTex, depthTest: false, transparent: true }));
    this.alert.scale.set(0.45, 0.45, 1);
    this.alert.visible = false;
    this.root.add(this.alert);

    const zTex = new THREE.CanvasTexture(labelCanvas('z z', PAL.turq, PAL.black, 128, 64));
    zTex.colorSpace = THREE.SRGBColorSpace;
    this.zzz = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true }));
    this.zzz.scale.set(0.7, 0.35, 1);
    this.zzz.visible = false;
    this.root.add(this.zzz);
  }

  setMeter(frac: number, stunned = false): void {
    const ctx = this.barCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 48);
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 6, 256, 36);
    ctx.fillStyle = stunned ? PAL.yellow : '#b23cff';
    ctx.fillRect(6, 12, Math.max(0, 244 * frac), 24);
    ctx.fillStyle = PAL.white;
    ctx.font = 'bold 18px "Marker Felt", "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(stunned ? 'STUNNED' : 'CORRUPTION', 128, 31);
    this.barTex.needsUpdate = true;
  }

  hit(): void {
    this.flash = 0.07;
  }

  setTelegraph(v: number): void {
    this.telegraph = v;
    this.alert.visible = v > 0;
  }

  /** Legs fall off: hide them (the dropped organ takes over visually). */
  detachLegs(): void {
    this.legsGroup.visible = false;
    this.hipHeight = 0;
    this.alert.visible = false;
  }

  calm(): void {
    this.bin.material = this.calmMat;
    (this.eyeIris.material as THREE.MeshToonMaterial).color.set(PAL.turq);
    (this.eyeIris.material as THREE.MeshToonMaterial).emissive.set('#000000');
    this.eyeIris.scale.set(1, 0.25, 0.4); // sleepy, half-closed
    this.zzz.visible = true;
  }

  /**
   * @param speed horizontal speed (m/s)
   * @param mode visual mode
   */
  update(dt: number, speed: number, mode: 'walk' | 'telegraph' | 'attack' | 'stunned' | 'calm'): void {
    this.time += dt;
    const t = this.time;
    // irregular gait: phase speed wobbles, legs are mismatched
    const wobble = 1 + Math.sin(t * 1.7) * 0.35 + Math.sin(t * 4.3) * 0.15;
    this.phase += dt * (2.5 + speed * 3.2) * wobble;
    const p = this.phase;
    const amp = Math.min(1, speed / 2) * 0.8 + 0.08;

    this.currentHip += (this.hipHeight - this.currentHip) * Math.min(1, dt * (this.hipHeight === 0 ? 10 : 4));
    let hip = this.currentHip;
    let pitch = 0;
    let roll = Math.sin(p) * 0.12 + Math.sin(t * 2.9) * 0.05;

    if (mode === 'telegraph') {
      hip -= 0.25 * this.telegraph;
      pitch = -0.25 * this.telegraph;
      roll = Math.sin(t * 40) * 0.06;
    } else if (mode === 'attack') {
      pitch = 0.45;
    } else if (mode === 'stunned') {
      roll = Math.sin(t * 3) * 0.15;
      pitch = 0.2;
    } else if (mode === 'calm') {
      roll = Math.sin(t * 1.2) * 0.04;
      pitch = 0;
    }

    // legs: bird-like backward knees, mismatched timing
    this.legL.pose(Math.sin(p) * amp + (mode === 'telegraph' ? 0.5 : 0), -0.6 - Math.max(0, Math.cos(p)) * amp * 1.2 - (mode === 'telegraph' ? 0.8 : 0), -0.12);
    this.legR.pose(Math.sin(p + Math.PI * 1.15) * amp * 1.2 + (mode === 'telegraph' ? 0.5 : 0), -0.5 - Math.max(0, Math.cos(p + Math.PI)) * amp * 1.3 - (mode === 'telegraph' ? 0.8 : 0), 0.15);
    this.legsGroup.position.y = hip + Math.abs(Math.sin(p)) * 0.06 * amp;
    this.bodyPivot.position.y = this.legsGroup.position.y * (this.hipHeight > 0 ? 1 : 0) + (this.hipHeight > 0 ? 0 : Math.max(0, this.currentHip));
    this.bodyPivot.rotation.set(pitch, 0, roll);
    this.lid.rotation.z = 0.3 + Math.sin(t * 6) * (mode === 'calm' ? 0.02 : 0.15);

    // hit flash (white-hot pink)
    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0 ? 1 : mode === 'telegraph' ? (Math.sin(t * 30) > 0 ? 0.6 : 0) : 0;
    this.binMat.emissive.setRGB(f, f * 0.2, f * 0.5);

    const top = this.bodyPivot.position.y + 1.35;
    this.bar.position.set(0, top, 0);
    this.alert.position.set(0, top + 0.35, 0);
    this.zzz.position.set(0.3, 1.3 + Math.sin(t * 2) * 0.08, 0);
  }
}
