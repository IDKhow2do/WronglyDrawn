import type { Organ, OrganType } from './Organ';

/**
 * One slot per organ type (WAI owns at most one Eye, one Mouth, one Leg pair).
 * A lent organ keeps its slot, so ownership is never lost.
 */
export class OrganInventory {
  readonly slots: Record<OrganType, Organ | null> = { EYE: null, MOUTH: null, LEG: null };
  selected: OrganType = 'LEG';
  /** Stickers the Red Pen crossed out (level 3): owned, but their ability is off until restored. */
  readonly crossed = new Set<OrganType>();
  private listeners: (() => void)[] = [];

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }
  changed(): void {
    for (const l of this.listeners) l();
  }

  add(o: Organ): boolean {
    if (this.slots[o.type]) return false;
    this.slots[o.type] = o;
    this.selected = o.type;
    this.changed();
    return true;
  }

  /** Dev tools: replace / empty a slot. */
  debugSet(t: OrganType, o: Organ | null): void {
    this.slots[t] = o;
    this.changed();
  }

  debugClear(): void {
    for (const t of ['EYE', 'MOUTH', 'LEG'] as OrganType[]) if (!this.slots[t]?.lent) this.slots[t] = null;
    this.changed();
  }

  get(t: OrganType): Organ | null {
    return this.slots[t];
  }

  /** Is the organ's ability active on WAI right now? */
  worn(t: OrganType): boolean {
    return !!this.slots[t]?.worn && !this.crossed.has(t);
  }

  select(t: OrganType): void {
    this.selected = t;
    this.changed();
  }

  all(): Organ[] {
    return Object.values(this.slots).filter((o): o is Organ => !!o);
  }
}
