import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import type { Gazer } from './OrganHost';
import { toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';

/**
 * "Undrawn" geometry: parts of the painting nobody ever drew. Shown as a faint
 * pencil sketch; it becomes solid painted geometry only while something LOOKS
 * at it (WAI's True Sight, an eye on a host, an awakened face). When nobody
 * looks, it fades back to a sketch — with a grace period and a warning shake
 * if WAI is standing on it.
 */
export class UndrawnSolid {
  readonly collider: RAPIER.Collider;
  readonly root = new THREE.Group();
  private solidMesh: THREE.Mesh;
  private sketch: THREE.LineSegments;
  private solidMat: THREE.MeshToonMaterial;
  private sketchMat: THREE.LineDashedMaterial;
  seenTimer = 0;
  solid = false;
  private fade = 0;
  permanent = false;
  /** Who keeps it visible (for "the wall's gaze" permanence). */
  seenBy: string | null = null;
  private warn = 0;
  readonly samplePoints: THREE.Vector3[];

  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly center: THREE.Vector3,
    readonly half: THREE.Vector3,
    readonly yaw = 0,
    color: string = PAL.turq,
  ) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.collider = ctx.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setEnabled(false),
    );
    ctx.physics.tag(this.collider, 'undrawn', this);
    const geo = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2);
    this.solidMat = toon({ map: ctx.assets.tex('terrace'), color, transparent: true });
    this.solidMat.opacity = 0;
    this.solidMesh = new THREE.Mesh(geo, this.solidMat);
    this.solidMesh.castShadow = true;
    this.solidMesh.receiveShadow = true;
    this.solidMesh.visible = false;
    // wobbly pencil sketch outline
    const edges = new THREE.EdgesGeometry(geo);
    const pos = edges.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + (Math.random() - 0.5) * 0.06, pos.getY(i) + (Math.random() - 0.5) * 0.06, pos.getZ(i) + (Math.random() - 0.5) * 0.06);
    this.sketchMat = new THREE.LineDashedMaterial({ color: '#3a2f55', dashSize: 0.25, gapSize: 0.12, transparent: true, opacity: 0.55 });
    this.sketch = new THREE.LineSegments(edges, this.sketchMat);
    this.sketch.computeLineDistances();
    this.root.add(this.solidMesh, this.sketch);
    this.root.position.copy(center);
    this.root.rotation.y = yaw;
    ctx.root.add(this.root);
    // sample points used for visibility: centre + top corners
    this.samplePoints = [new THREE.Vector3(0, 0, 0), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * half.x * 0.8, half.y, sz * half.z * 0.8)))].map((p) =>
      p.applyQuaternion(q).add(center),
    );
  }

  /** Mark as seen for `grace` seconds. */
  see(by: string, grace: number): void {
    this.seenTimer = Math.max(this.seenTimer, grace);
    this.seenBy = by;
  }

  /** @param playerOverlap feet AABB overlap (don't solidify inside WAI) @param playerOnIt WAI stands on it */
  update(dt: number, playerOverlapping: boolean, playerOnIt: boolean): void {
    if (this.permanent) this.seenTimer = 1;
    this.seenTimer = Math.max(0, this.seenTimer - dt);
    const wantSolid = this.seenTimer > 0;
    if (wantSolid && !this.solid && !playerOverlapping) {
      this.solid = true;
      this.collider.setEnabled(true);
      this.ctx.audio.play('reveal', { pos: this.center, vol: 0.5 });
    } else if (!wantSolid && this.solid) {
      if (playerOnIt && this.warn < 0.9) {
        this.warn += dt; // grace: shake, then vanish
      } else {
        this.solid = false;
        this.warn = 0;
        this.collider.setEnabled(false);
        this.ctx.audio.play('unreveal', { pos: this.center, vol: 0.4 });
      }
    } else if (wantSolid) this.warn = 0;
    this.fade += ((this.solid ? 1 : 0) - this.fade) * Math.min(1, dt * 8);
    this.solidMat.opacity = this.fade;
    this.solidMesh.visible = this.fade > 0.02;
    this.sketchMat.opacity = 0.55 * (1 - this.fade) + 0.1;
    const shake = this.warn > 0 ? (Math.random() - 0.5) * 0.08 : 0;
    this.root.position.set(this.center.x + shake, this.center.y, this.center.z + shake);
  }

  contains(p: THREE.Vector3, pad = 0): boolean {
    const local = p.clone().sub(this.center).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    return Math.abs(local.x) < this.half.x + pad && Math.abs(local.y) < this.half.y + pad && Math.abs(local.z) < this.half.z + pad;
  }
}

/** Resolves every gazer against every undrawn solid (with line of sight). */
export class GazeSystem {
  readonly solids: UndrawnSolid[] = [];
  private tick = 0;

  constructor(private ctx: GameContext) {}

  add(u: UndrawnSolid): void {
    this.solids.push(u);
  }

  update(dt: number, gazers: Gazer[], playerFeet: THREE.Vector3, playerGround: RAPIER.Collider | null): void {
    this.tick++;
    if (this.tick % 2 === 0) {
      for (const u of this.solids) {
        if (u.permanent) continue;
        for (const g of gazers) {
          if (this.sees(g, u)) {
            u.see(g.sourceId, g.sourceId === 'wai' ? 1.2 : 0.4);
            break;
          }
        }
      }
    }
    const feetCenter = playerFeet.clone().add(new THREE.Vector3(0, 0.53, 0));
    for (const u of this.solids) {
      const overlapping = u.contains(feetCenter, 0.33) || u.contains(playerFeet.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.3);
      const onIt = !!playerGround && playerGround.handle === u.collider.handle;
      u.update(dt, overlapping && !onIt, onIt);
    }
  }

  private sees(g: Gazer, u: UndrawnSolid): boolean {
    for (const p of u.samplePoints) {
      const to = p.clone().sub(g.origin);
      const d = to.length();
      if (d > g.range || d < 0.01) continue;
      to.divideScalar(d);
      if (to.dot(g.dir) < g.cosHalf) continue;
      const hit = this.ctx.physics.raycast(g.origin, to, d - 0.05, (c) => {
        const tag = this.ctx.physics.tagOf(c);
        return tag === 'static' || tag === 'gate';
      });
      if (!hit) return true;
    }
    return false;
  }
}
