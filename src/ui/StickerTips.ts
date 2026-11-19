/**
 * [INPUT]: depends on ORGAN_DEFS / Organ from organs/Organ, OrganHost (type + movable/drivable/mode/canRecall) from
 *          hosts/OrganHost, t() from i18n
 * [OUTPUT]: exports stickerTip() and the StickerTip view type
 * [POS]: text half of the HUD sticker tooltips. UI.ts owns the DOM (hover, tap, pop on state change); this file
 *        only turns one sticker slot's state into words. Every line restates what OrganSystem / OrganHost /
 *        PlayerController really do, so a gameplay change there must be mirrored here.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { ORGAN_DEFS, type Organ, type OrganType } from '../organs/Organ';
import type { OrganHost } from '../hosts/OrganHost';
import { t } from '../i18n';

export type StickerTipKind = 'missing' | 'corrupted' | 'crossed' | 'lent' | 'worn';

export interface StickerTip {
  kind: StickerTipKind;
  title: string;
  state: string;
  lines: string[];
  color: string;
}

/** What the worn sticker gives WAI (key, then effect). */
const WORN_LINE: Record<OrganType, string> = {
  EYE: 'True Sight: aim (right-click / Z) and undrawn things turn real.',
  MOUTH: 'V: chomp. Bite creatures, eat rubble and paint, swallow a grub, then click to SPIT it.',
  LEG: 'Long Legs: a huge jump and a faster run (Shift).',
};

/** Short name of the power WAI loses while the sticker is lent. */
const POWER: Record<OrganType, string> = { EYE: 'True Sight', MOUTH: 'Chomp', LEG: 'Long Legs' };

/** What a host does with a lent sticker (OrganHost behaviours are derived from size / anchored / organs). */
function hostLine(type: OrganType, host: OrganHost): string {
  const p = { host: t(host.def.name) };
  if (type === 'EYE') return t('The {host} looks around: its gaze keeps undrawn things real.', p);
  if (type === 'MOUTH') return t('The {host} eats rubble, grubs and anything in front of it.', p);
  if (host.movable) {
    if (host.mode === 'stay') return t('The {host} sits and stays. F, then E next to it: follow.', p);
    return host.drivable ? t('The {host} follows you. Stand on it to ride and steer · F, then E next to it: stay.', p) : t('The {host} follows you like a puppy · F, then E next to it: stay.', p);
  }
  if (host.def.canTurn) return t('The {host} turns to watch where you go.', p);
  return t('The {host} kicks its little legs, far too heavy to walk.', p);
}

/**
 * The tooltip for one sticker slot, in the current language.
 * State order matches the HUD card: not found → corrupted → crossed out → lent → worn.
 */
export function stickerTip(type: OrganType, organ: Organ | null, o: { host?: OrganHost; crossed: boolean; selected: boolean; touch: boolean; shout: boolean }): StickerTip {
  const def = ORGAN_DEFS[type];
  const name = t(def.name);
  const key = o.touch ? t(type === 'LEG' ? 'LEGS' : type) : def.keyLabel;
  if (!organ) return { kind: 'missing', title: name, state: t('not found'), lines: [t('No {organ} yet — some mutant must have it…', { organ: name })], color: def.color };
  if (organ.corrupted) {
    return {
      kind: 'corrupted',
      title: t(def.corruptedName),
      state: t('corrupted'),
      lines: [t('Hold {key} with both feet on the ground to purify it.', { key }), t('Then it gives you: {ability}', { ability: t(def.wornAbility) })],
      color: def.color,
    };
  }
  if (o.crossed) return { kind: 'crossed', title: name, state: t('crossed out!'), lines: [t('The Red Pen crossed it out: its power is off until it is restored.')], color: def.color };
  if (organ.lent) {
    const lines: string[] = [];
    if (o.host) lines.push(hostLine(type, o.host));
    lines.push(o.host?.canRecall(type) ?? t('Hold {key} to take it back: {power} comes back to you.', { key, power: t(POWER[type]) }));
    return { kind: 'lent', title: name, state: t('on {host}', { host: t(o.host?.def.name ?? 'something') }), lines, color: def.color };
  }
  const touchAbility: Record<OrganType, string> = {
    EYE: 'True Sight: tap Aim to reveal undrawn things.',
    MOUTH: 'Tap Chomp to bite or swallow a grub. Tap Spray to spit it.',
    LEG: 'Long Legs: jump higher and push the joystick farther to run.',
  };
  const lines = [t(o.touch ? touchAbility[type] : WORN_LINE[type])];
  if (type === 'MOUTH' && o.shout) lines.push(t('X: SHOUT (hold it for a BIG SHOUT).'));
  lines.push(
    o.touch
      ? t('Select {key}, face a target, then tap Apply to lend the sticker and its power.', { key })
      : o.selected
      ? t('Selected: E sticks it on what you aim at or stand next to. Its power goes with it.')
      : t('{key} selects it, then E sticks it on what you aim at or stand next to. Its power goes with it.', { key }),
  );
  return { kind: 'worn', title: name, state: t('worn'), lines, color: def.color };
}
