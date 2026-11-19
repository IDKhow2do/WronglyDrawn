import * as THREE from 'three';
import { PAL } from '../render/PaintTextures';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';
import type { AssetManager } from '../core/AssetManager';

/**
 * The Spray Can Blaster. Built with its barrel along +Z, grip down (−Y).
 * `muzzle` marks where paint leaves the nozzle. A Tripo GLB (manifest slot
 * "sprayGun") replaces the procedural mesh when available.
 */
export function buildSprayGun(assets: AssetManager, scale = 1): { root: THREE.Group; muzzle: THREE.Object3D; tank: THREE.Mesh | null } {
  const root = new THREE.Group();
  root.name = 'SprayGun';
  const muzzle = new THREE.Object3D();
  const override = assets.instantiateModel('sprayGun');
  if (override) {
    // manifest models face +Z with feet at y=0; centre it on the grip
    const box = new THREE.Box3().setFromObject(override);
    const size = box.getSize(new THREE.Vector3());
    override.position.y -= size.y * 0.5;
    root.add(override);
    muzzle.position.set(0, size.y * 0.15, size.z * 0.55);
    root.add(muzzle);
    root.scale.setScalar(scale);
    return { root, muzzle, tank: null };
  }
  const can = toon({ color: PAL.hotpink });
  const label = toon({ color: PAL.yellow });
  const dark = toon({ color: '#2a2230' });
  // can body (lying along Z)
  const body = paintedMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 14), can, 0.012);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.05, 0.02);
  root.add(body);
  const band = paintedMesh(new THREE.CylinderGeometry(0.078, 0.078, 0.09, 14), label, 0.006);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 0.05, 0.0);
  root.add(band);
  // shoulder + cap + nozzle
  const shoulder = paintedMesh(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), can, 0.01);
  shoulder.rotation.x = Math.PI / 2;
  shoulder.position.set(0, 0.05, 0.15);
  root.add(shoulder);
  const cap = paintedMesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), toon({ color: PAL.white }), 0.006);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(0, 0.05, 0.235);
  root.add(cap);
  const nozzle = paintedMesh(new THREE.CylinderGeometry(0.014, 0.018, 0.035, 8), toon({ color: PAL.cobalt }), 0.004);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.05, 0.27);
  root.add(nozzle);
  muzzle.position.set(0, 0.05, 0.3);
  root.add(muzzle);
  // pistol grip + trigger guard
  const grip = paintedMesh(wonkyBox(0.05, 0.13, 0.07, 0.08, 4), dark, 0.01);
  grip.position.set(0, -0.06, -0.03);
  grip.rotation.x = -0.25;
  root.add(grip);
  const guard = paintedMesh(new THREE.TorusGeometry(0.035, 0.009, 6, 10, Math.PI), dark, 0.004);
  guard.position.set(0, -0.025, 0.04);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  root.add(guard);
  // paint tank window (fill level shows remaining paint)
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.12), new THREE.MeshBasicMaterial({ color: PAL.turq }));
  tank.position.set(0.078, 0.05, 0.0);
  root.add(tank);
  // crown sticker
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 4), toon({ color: PAL.yellow }));
  crown.position.set(-0.07, 0.1, 0.05);
  crown.rotation.z = 0.4;
  root.add(crown);
  // drips
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.03 + i * 0.01, 3, 6), toon({ color: [PAL.cobalt, PAL.turq, PAL.orange][i] }));
    d.position.set(-0.03 + i * 0.03, -0.02, 0.1 - i * 0.05);
    root.add(d);
  }
  root.scale.setScalar(scale);
  return { root, muzzle, tank };
}
