/**
 * [INPUT]: depends on AssetManager.instantiateModel (Tripo slots lighthouseHorn, paperBoat) from core/AssetManager;
 *          PhysicsWorld.addStaticBox from core/PhysicsWorld
 * [OUTPUT]: exports lighthouseHorn() (the lamp room's brass foghorn), paperBoatModel() and paperBoatColliders()
 *           (the exit boat's drawn shape and the solids that match it), PAPER_BOAT (its measured heights)
 * [POS]: art-pass dressing for Mute Harbor's two Tripo props. MuteHarbor builds the lamp face and the exit boat group
 *        and asks here for what goes inside; it keeps its code-built fallbacks when a model is missing.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../../core/AssetManager';
import type { PhysicsWorld, RAPIER } from '../../core/PhysicsWorld';

/** The paper boat, measured on the model (local to the boat group, bow on +Z): where feet go. */
export const PAPER_BOAT = {
  /** Width stretch: Tripo folded it narrow (2.5 m); the boat holds WAI and the jetty is 3.2 m. */
  widen: 1.3,
  /** Inner floor height above the keel. */
  floor: 1.15,
  /** Gunwale height (amidships). */
  rim: 1.8,
  /** Walkable floor: half width (after widening) and half length. */
  halfW: 1.05,
  halfL: 1.7,
};

/**
 * The lighthouse's foghorn: a riveted brass gramophone horn whose bell faces the lamp face's +Z (outward),
 * centred on the face's mouth. Null when the model is missing (the caller keeps its cone).
 */
export function lighthouseHorn(assets: AssetManager): THREE.Object3D | null {
  const m = assets.instantiateModel('lighthouseHorn', { pivot: 'center' });
  if (!m) return null;
  // Tripo's bell opens toward -Z after the manifest fit, its neck curling down to a wall bracket: turn the bell to +Z (outward) and
  // centre the bell, not the bounding box, under the eyes (the neck hangs below, into the glass)
  m.rotation.y = Math.PI;
  m.scale.setScalar(1.4);
  const g = new THREE.Group();
  g.name = 'lighthouse-horn';
  m.position.set(-0.4, -0.25, 0.1);
  g.add(m);
  g.traverse((o) => (o.userData.noPaint = true));
  return g;
}

/** The exit paper boat's drawing: a doodled origami boat with a pencil for a mast. Keel at y 0, bow +Z. */
export function paperBoatModel(assets: AssetManager): THREE.Object3D | null {
  const m = assets.instantiateModel('paperBoat', { pivot: 'bottom' });
  if (!m) return null;
  m.scale.x = PAPER_BOAT.widen;
  return m;
}

/**
 * Solids for the docked boat, matching the drawing: its inner floor, both gunwales and the pencil mast with its sail.
 * `at` is the boat group's rest position (rotation 0). They start disabled; the caller enables them on docking.
 */
export function paperBoatColliders(physics: PhysicsWorld, at: THREE.Vector3): RAPIER.Collider[] {
  const B = PAPER_BOAT;
  const y0 = at.y + B.floor;
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
    const c = physics.addStaticBox(new THREE.Vector3(at.x + x, y, at.z + z), new THREE.Vector3(hx, hy, hz));
    c.setEnabled(false);
    return c;
  };
  const rimH = (B.rim - B.floor) / 2;
  return [
    box(0, y0 - 0.12, 0, B.halfW, 0.12, B.halfL),
    box(-(B.halfW + 0.1), y0 + rimH, 0, 0.1, rimH, B.halfL),
    box(B.halfW + 0.1, y0 + rimH, 0, 0.1, rimH, B.halfL),
    // the pencil and its sail stand amidships, a thin wall along the keel
    box(0, y0 + 1.6, -0.3, 0.18, 1.6, 0.9),
  ];
}
