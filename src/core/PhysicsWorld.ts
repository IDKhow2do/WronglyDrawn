/**
 * [INPUT]: depends on @dimforge/rapier3d-compat (world, colliders, ray casts) and three (vectors, quaternions)
 * [OUTPUT]: exports PhysicsWorld (static box / slab / nosing-ramp / cylinder / hull colliders, isNosingRamp, gameplay tags,
 *           typed ray casts, the wall test isWall / wallAhead), ColliderTag, initRapier, RAPIER
 * [POS]: the one physics world of a level session. Levels add static geometry through it; creatures and WAI own
 *        their character controllers on its world. Tags tell gameplay what a collider is (paint, camera, gates).
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export type ColliderTag =
  | 'static'
  | 'player'
  | 'enemy'
  | 'box'
  | 'gate'
  | 'prop'
  | 'host'
  | 'undrawn'
  | 'water'
  /** invisible movement blockers (arena locks): not camera blockers, not paintable */
  | 'barrier';

let rapierReady: Promise<void> | null = null;

/** Initialise the Rapier WASM module once. */
export function initRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export { RAPIER };

/**
 * Thin wrapper around a Rapier world. Owns all bodies of one level session,
 * keeps a collider → gameplay tag map, and offers typed ray queries.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private tags = new Map<number, { tag: ColliderTag; owner?: unknown }>();
  /** Handles of the nosing-ramp slabs (tagged 'static'; the player's model sinks from them onto the drawn tread). */
  private ramps = new Set<number>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
  }

  tag(collider: RAPIER.Collider, tag: ColliderTag, owner?: unknown): void {
    this.tags.set(collider.handle, { tag, owner });
  }

  untag(collider: RAPIER.Collider): void {
    this.tags.delete(collider.handle);
  }

  tagOf(collider: RAPIER.Collider): ColliderTag | undefined {
    return this.tags.get(collider.handle)?.tag;
  }

  ownerOf<T>(collider: RAPIER.Collider): T | undefined {
    return this.tags.get(collider.handle)?.owner as T | undefined;
  }

  /** Static box collider (Y rotation, or a full quaternion). */
  addStaticBox(center: THREE.Vector3, half: THREE.Vector3, rotY: number | THREE.Quaternion = 0, tag: ColliderTag = 'static', owner?: unknown): RAPIER.Collider {
    const q = typeof rotY === 'number' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY) : rotY;
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8);
    const c = this.world.createCollider(desc);
    this.tag(c, tag, owner);
    return c;
  }

  /**
   * Static slab whose top face runs along a→b (a ramp: stairs get one over their nosings, because stepped risers
   * stall the controllers' auto-step at a slow walk). Roll-free: its up stays as near world up as it can.
   * `overrun` lengthens it past both ends (m).
   */
  addStaticSlab(a: THREE.Vector3, b: THREE.Vector3, halfWidth: number, thick = 0.1, tag: ColliderTag = 'static', overrun = 0.04): RAPIER.Collider {
    const fwd = b.clone().sub(a);
    const len = fwd.length();
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    const up = new THREE.Vector3().crossVectors(fwd, right);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(up, -thick / 2);
    return this.addStaticBox(mid, new THREE.Vector3(halfWidth, thick / 2, len / 2 + overrun), q, tag);
  }

  /**
   * Invisible nosing ramp: one slab per leg of the polyline `pts`, tagged 'static' like the steps under it.
   * Every stepped stair of every level gets one. Rapier's auto-step stalls on a riser at a slow walk; a ramp
   * does not. Lay the points a few cm over the nosings. End the top leg a few cm over the landing: a flush end
   * stalls on the landing's lip. Inner joints meet without overrun: at a convex bend an overrun pokes a lip of
   * ~2 cm over the next slab, and that lip stalled a slow walk at the top of a stair.
   */
  addNosingRamp(pts: THREE.Vector3[], halfWidth: number): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    const last = pts.length - 1;
    for (let k = 0; k < last; k++) {
      const a = pts[k].clone(), b = pts[k + 1].clone();
      const d = b.clone().sub(a).normalize().multiplyScalar(0.04);
      if (k === 0) a.sub(d);
      if (k === last - 1) b.add(d);
      const c = this.addStaticSlab(a, b, halfWidth, 0.1, 'static', 0);
      this.ramps.add(c.handle);
      out.push(c);
    }
    return out;
  }

  /** Is this collider an invisible nosing ramp (addNosingRamp)? */
  isNosingRamp(c: RAPIER.Collider): boolean {
    return this.ramps.has(c.handle);
  }

  addStaticCylinder(center: THREE.Vector3, halfHeight: number, radius: number, tag: ColliderTag = 'static'): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(center.x, center.y, center.z);
    const c = this.world.createCollider(desc);
    this.tag(c, tag);
    return c;
  }

  /** Static convex hull around a mesh's world-space vertices (rocks: the collider matches what you see). */
  addStaticHull(mesh: THREE.Mesh, tag: ColliderTag = 'static'): RAPIER.Collider | null {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.getAttribute('position');
    const pts = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      pts[i * 3] = v.x;
      pts[i * 3 + 1] = v.y;
      pts[i * 3 + 2] = v.z;
    }
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (!desc) return null;
    const c = this.world.createCollider(desc.setFriction(0.8));
    this.tag(c, tag);
    return c;
  }

  /** Ray cast returning point/normal/collider, with optional predicate. */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    predicate?: (c: RAPIER.Collider) => boolean,
  ): { point: THREE.Vector3; normal: THREE.Vector3; collider: RAPIER.Collider; dist: number } | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      predicate,
    );
    if (!hit) return null;
    const point = origin.clone().addScaledVector(dir, hit.timeOfImpact);
    return {
      point,
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      collider: hit.collider,
      dist: hit.timeOfImpact,
    };
  }

  /** Does this collider stop a walker for good (level walls, gates, arena locks, undrawn blocks)? Creatures and hosts do not. */
  isWall(c: RAPIER.Collider): boolean {
    const tg = this.tagOf(c);
    return tg === 'static' || tg === 'gate' || tg === 'barrier' || tg === 'undrawn';
  }

  /** Distance (m) along `dir` (unit) from `from` to the first wall (isWall), or null if none within `maxDist`. */
  wallAhead(from: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number | null {
    return this.raycast(from, dir, maxDist, (c) => this.isWall(c))?.dist ?? null;
  }

  /**
   * Sphere sweep (used by the camera so the near plane never pokes through walls).
   * Returns the free distance along dir.
   */
  sphereCast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number, predicate?: (c: RAPIER.Collider) => boolean): number {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dir.x, y: dir.y, z: dir.z },
      shape,
      0,
      maxDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      predicate,
    );
    return hit ? hit.time_of_impact : maxDist;
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.tags.clear();
    this.ramps.clear();
    this.world.free();
  }
}
