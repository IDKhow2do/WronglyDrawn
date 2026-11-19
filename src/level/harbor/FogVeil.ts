/**
 * [INPUT]: depends on FogJelly (pos, fog, seen) and FOG_R from enemy/FogJelly; Gazer (True-Sight cones) from hosts/OrganHost
 * [OUTPUT]: exports FogVeil (add(), see(gazers)) — the hiding rule of the Fog Jellies
 * [POS]: Bandstand Pier's "things hidden in the fog": the zigzag walkway, the paint drops over it, the fog crown.
 *        Each step PierDirector hands it the frame's gazers (WAI aiming with the Eye, hosts holding an Eye):
 *        a jelly someone looks at is `seen` (paint lands), a hidden thing inside a jelly's fog shows only while seen.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { Gazer } from '../../hosts/OrganHost';
import { FOG_R, type FogJelly } from '../../enemy/FogJelly';

interface Hidden {
  pos: THREE.Vector3;
  /** Show or hide it (called only when the answer changes). */
  show: (on: boolean) => void;
  /** Still in the world? (collected drops drop out) */
  alive: () => boolean;
  shown: boolean;
}

const _to = new THREE.Vector3();
const _c = new THREE.Vector3();

const sees = (g: Gazer, p: THREE.Vector3): boolean => {
  _to.copy(p).sub(g.origin);
  const d = _to.length();
  return d < g.range && (d < 0.5 || _to.dot(g.dir) / d > g.cosHalf);
};

export class FogVeil {
  private items: Hidden[] = [];
  /** Something hidden is showing only because someone sees it (the director's first-time praise). */
  revealed = false;

  constructor(private jellies: () => readonly FogJelly[]) {}

  add(pos: THREE.Vector3, show: (on: boolean) => void, alive: () => boolean = () => true): void {
    this.items.push({ pos, show, alive, shown: true });
  }

  /** Is a point inside a live jelly's fog? */
  fogged(p: THREE.Vector3): boolean {
    for (const j of this.jellies()) {
      if (j.disposed || j.fog < 0.3) continue;
      if (Math.hypot(p.x - j.pos.x, p.z - j.pos.z) < FOG_R && Math.abs(p.y - j.pos.y) < 5) return true;
    }
    return false;
  }

  see(gazers: readonly Gazer[]): void {
    for (const j of this.jellies()) {
      if (j.disposed) continue;
      _c.copy(j.pos).setY(j.pos.y + 1);
      let s = false;
      for (const g of gazers) if (sees(g, _c)) s = true;
      j.seen = s;
    }
    this.revealed = false;
    for (const it of this.items) {
      if (!it.alive()) continue;
      let on = true;
      if (this.fogged(it.pos)) {
        on = false;
        for (const g of gazers) if (sees(g, it.pos)) on = true;
        if (on) this.revealed = true;
      }
      if (on !== it.shown) {
        it.shown = on;
        it.show(on);
      }
    }
  }
}
