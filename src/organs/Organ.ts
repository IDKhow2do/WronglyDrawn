/**
 * Organ data model (pure gameplay state; no Three.js objects).
 *
 *   WORLD_CORRUPTED ─collect→ CARRIED_CORRUPTED ─purify→ WORN ⇄ LENT (attached to a host)
 *
 * A purified organ in WAI's pocket is *worn*: it grants WAI its ability.
 * Lending it to an object gives that object the organ's behaviour instead.
 */
export type OrganType = 'EYE' | 'MOUTH' | 'LEG';
export type OrganState = 'WORLD_CORRUPTED' | 'CARRIED_CORRUPTED' | 'WORN' | 'LENT';

export interface OrganDef {
  type: OrganType;
  name: string;
  corruptedName: string;
  key: 'KeyQ' | 'KeyR' | 'KeyF';
  keyLabel: 'Q' | 'R' | 'F';
  wornAbility: string;
  lentBehaviour: string;
  purifyTime: number;
  color: string;
}

export const ORGAN_DEFS: Record<OrganType, OrganDef> = {
  EYE: {
    type: 'EYE',
    name: 'Eye Sticker',
    corruptedName: 'Corrupted Eye',
    key: 'KeyQ',
    keyLabel: 'Q',
    wornAbility: 'True Sight — aim to make undrawn things real',
    lentBehaviour: 'looks: its gaze keeps undrawn things real',
    purifyTime: 1.3,
    color: '#ffd23a',
  },
  MOUTH: {
    type: 'MOUTH',
    name: 'Mouth Sticker',
    corruptedName: 'Corrupted Mouth',
    key: 'KeyR',
    keyLabel: 'R',
    wornAbility: 'Chomp (V) — bite, swallow, spit',
    lentBehaviour: 'eats rubble, grubs and anything in front of it',
    purifyTime: 1.3,
    color: '#ff4fa3',
  },
  LEG: {
    type: 'LEG',
    name: 'Leg Sticker',
    corruptedName: 'Corrupted Crooked Legs',
    key: 'KeyF',
    keyLabel: 'F',
    wornAbility: 'Long Legs — huge jump, faster run',
    lentBehaviour: 'walks: follows you, or ride it and steer',
    purifyTime: 1.3,
    color: '#ff7a1a',
  },
};

export const ORGAN_ORDER: OrganType[] = ['EYE', 'MOUTH', 'LEG'];

let nextId = 1;

export class Organ {
  readonly id: string;
  state: OrganState = 'WORLD_CORRUPTED';
  /** Host id while LENT. */
  hostId: string | null = null;

  constructor(
    readonly type: OrganType,
    readonly sourceId: string | null = null,
  ) {
    this.id = `organ-${type.toLowerCase()}-${nextId++}`;
  }

  get def(): OrganDef {
    return ORGAN_DEFS[this.type];
  }
  get corrupted(): boolean {
    return this.state === 'WORLD_CORRUPTED' || this.state === 'CARRIED_CORRUPTED';
  }
  get worn(): boolean {
    return this.state === 'WORN';
  }
  get lent(): boolean {
    return this.state === 'LENT';
  }
  displayName(): string {
    return this.corrupted ? this.def.corruptedName : this.def.name;
  }

  private to(from: OrganState[], next: OrganState): void {
    if (!from.includes(this.state)) throw new Error(`Organ ${this.id}: illegal ${this.state} → ${next}`);
    this.state = next;
  }
  collect(): void {
    this.to(['WORLD_CORRUPTED'], 'CARRIED_CORRUPTED');
  }
  purify(): void {
    this.to(['CARRIED_CORRUPTED'], 'WORN');
  }
  lend(hostId: string): void {
    this.to(['WORN'], 'LENT');
    this.hostId = hostId;
  }
  recall(): void {
    this.to(['LENT'], 'WORN');
    this.hostId = null;
  }
}
