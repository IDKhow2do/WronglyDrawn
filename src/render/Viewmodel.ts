import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { buildSprayGun } from '../weapon/SprayGunModel';
import { PAL } from './PaintTextures';
import { toon } from './Materials';

/**
 * First-person weapon (rendered in its own pass, so it can never clip into
 * the world). Bobs with movement, kicks on each shot, sways with mouse look.
 * Also shows WAI's mitten holding the grip and the paint-tank level.
 */
export class Viewmodel {
  readonly root = new THREE.Group();
  private gun: THREE.Group;
  private tank: THREE.Mesh | null;
  readonly muzzle: THREE.Object3D;
  private kick = 0;
  private bob = 0;
  private sway = new THREE.Vector2();
  private flash: THREE.Mesh;
  private flashT = 0;

  constructor(assets: AssetManager, private viewCamera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const g = buildSprayGun(assets, 1.0);
    this.gun = g.root;
    this.tank = g.tank;
    this.muzzle = g.muzzle;
    // barrel along +Z → point it into the screen (−Z)
    this.gun.rotation.y = Math.PI;
    this.root.add(this.gun);
    const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), toon({ color: PAL.pink }));
    mitten.scale.set(1, 1.2, 1.1);
    mitten.position.set(0.01, -0.08, 0.03);
    this.root.add(mitten);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 10), toon({ color: PAL.orange }));
    sleeve.rotation.x = Math.PI / 2.4;
    sleeve.position.set(0.03, -0.17, 0.16);
    this.root.add(sleeve);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.yellow, transparent: true }));
    this.flash.visible = false;
    this.muzzle.add(this.flash);
    viewCamera.add(this.root);
    scene.add(viewCamera);
    this.root.position.set(0.26, -0.24, -0.55);
  }

  shot(heavy: boolean, color: string): void {
    this.kick = heavy ? 1 : Math.min(1, this.kick + 0.45);
    this.flashT = 0.05;
    (this.flash.material as THREE.MeshBasicMaterial).color.set(color);
  }

  update(dt: number, moveSpeed: number, mouseDX: number, mouseDY: number, tankFrac: number, aimT: number): void {
    this.kick = Math.max(0, this.kick - dt * 8);
    this.bob += dt * (4 + moveSpeed * 7);
    this.sway.x += (-mouseDX * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (mouseDY * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    const b = Math.min(1, moveSpeed) * 0.012;
    // slide in from below as the camera enters the eye
    const enter = 1 - THREE.MathUtils.smoothstep(aimT, 0.4, 1);
    this.root.position.set(0.26 + Math.cos(this.bob * 0.5) * b + this.sway.x, -0.24 + Math.abs(Math.sin(this.bob)) * b + this.sway.y - enter * 0.35, -0.55 + this.kick * 0.07);
    this.root.rotation.set(this.kick * 0.25 - this.sway.y * 2, this.sway.x * 2, -this.sway.x);
    if (this.tank) this.tank.scale.z = Math.max(0.05, tankFrac);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
    this.flash.scale.setScalar(1 + Math.random());
    void this.viewCamera;
  }
}
