import type * as THREE from 'three';

export type Eater = 'wai' | 'small' | 'medium' | 'large';

/** Something a mouth can eat (eraser rubble, grubs, paint drops, crusts…). */
export interface Edible {
  readonly id: string;
  position(): THREE.Vector3;
  radius: number;
  /** Which mouths are big enough to eat this. */
  eatableBy: Eater[];
  /** Called when eaten. Return true if it was consumed. */
  eat(by: Eater): boolean;
  disposed?: boolean;
  /** Swallowable items give WAI a mouthful (spit ammo). */
  swallowable?: boolean;
}

export class EdibleRegistry {
  private items: Edible[] = [];
  add(e: Edible): void {
    this.items.push(e);
  }
  near(p: THREE.Vector3, r: number, by: Eater): Edible[] {
    this.items = this.items.filter((e) => !e.disposed);
    return this.items.filter((e) => e.eatableBy.includes(by) && e.position().distanceTo(p) < r + e.radius);
  }
  all(): Edible[] {
    this.items = this.items.filter((e) => !e.disposed);
    return this.items;
  }
}
