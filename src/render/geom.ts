import type * as THREE from 'three';

/** Non-indexed copy of `g` (or `g` itself if it already is) — no "already non-indexed" console spam. */
export function ni<T extends THREE.BufferGeometry>(g: T): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}
