/**
 * [INPUT]: none (plain timing + the line table); t() is applied by the HUD that shows the line
 * [OUTPUT]: exports PenVoice (say(), ally(), step(), clear(), waver, onLine), VoiceEvent, Speaker, PEN_LINES, ALLY_LINES
 * [POS]: what the Red Pen says during the roof fight, owned by RedPenBoss (events) and drained by SoulsFight (which shows each
 *        line in SoulsHud as a correction slip above the boss bar). Its voice is the outside standard: short, exact, cold —
 *        never a teacher. Near the end (phase 3, paint on it) the lines waver: it is being won over.
 *        Rate rule: one line on screen at a time, 3.2 s each, ordinary lines at least 6 s apart; act lines (phase changes,
 *        the allies joining, the fall) queue (three slots, oldest dropped) and show as soon as the screen is free. A held voice (a story
 *        caption is up) drops ordinary lines and keeps the queued act lines.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */

export type Speaker = 'pen' | 'hush' | 'eraser';

export type VoiceEvent =
  | 'start' | 'eye' | 'legs' | 'mouth' | 'standard'
  | 'hitWai' | 'hurt' | 'phase2' | 'sky' | 'marks' | 'shoutDown' | 'phase3' | 'selfx'
  | 'stab' | 'rule' | 'sweep'
  | 'lateHurt' | 'lateHit' | 'final';

/** Every line the Pen speaks in the fight (English source = the i18n key; Chinese in i18n/zhWorks.ts). */
export const PEN_LINES: Record<VoiceEvent, string[]> = {
  start: ['Deviation detected. Beginning correction.'],
  eye: ['An eye does not go there.', 'That eye is borrowed. And crooked.'],
  legs: ['Legs? On a spray can? Incorrect.'],
  mouth: ['A mouth. On a can. Not to standard.'],
  standard: ['Not to standard.'],
  hitWai: ['Corrected.', 'Marked wrong.', 'Error removed.'],
  hurt: ['Paint. On me?', 'That is not my colour.'],
  phase2: ['Legs: not to spec. Removed.'],
  sky: ['From up here, every error is visible.'],
  marks: ['Strike through.', 'X. And X. And X.'],
  shoutDown: ['Lower your voice.'],
  phase3: ['Volume: over limit. Removed.'],
  selfx: ['If I cannot be seen, I cannot be marked.'],
  stab: ['Hold still.'],
  rule: ['Straight. As specified.'],
  sweep: ['Clearing the page.'],
  lateHurt: ['This colour is… not… incorrect?', 'My lines are… b-bending.', 'Is wobbly… permitted?'],
  lateHit: ['Cor… rected. Probably.'],
  final: ['I have no rule for this.'],
};

/** One line each, when they join (phase 2: the Hush; phase 3: the Eraser). */
export const ALLY_LINES: Record<Exclude<Speaker, 'pen'>, string> = {
  hush: 'Shh… I’ll keep its ink quiet.',
  eraser: 'I only rub out RED now!',
};

/** Act lines: they wait for a free screen instead of being dropped. */
const ACT = new Set<VoiceEvent>(['start', 'phase2', 'sky', 'phase3', 'selfx', 'final']);
const SHOW = 3.2;
const GAP = 6;
const ACT_GAP = 0.5;

interface Line {
  who: Speaker;
  text: string;
}

export class PenVoice {
  /** 0..1: how much its voice wavers (the boss sets it: phase 3, by the paint on it). */
  waver = 0;
  /** Show (text) / hide (null) a line; SoulsFight wires it to the HUD. */
  onLine: ((who: Speaker, text: string | null, waver: number) => void) | null = null;
  private showing = 0;
  private sinceStart = 99;
  private queued: Line[] = [];
  private turn = new Map<VoiceEvent, number>();

  /** The Pen reacts to `ev`. Ordinary lines are dropped while the screen is busy or too soon after the last one. */
  say(ev: VoiceEvent, chance = 1): void {
    if (Math.random() > chance) return;
    const list = PEN_LINES[ev];
    const i = this.turn.get(ev) ?? Math.floor(Math.random() * list.length);
    this.turn.set(ev, (i + 1) % list.length);
    const line = { who: 'pen' as const, text: list[i % list.length] };
    if (ACT.has(ev)) this.enqueue(line);
    else if (this.showing <= 0 && this.sinceStart > GAP) this.show(line);
  }

  /** An ally's one line as it joins (queued like an act line). */
  ally(who: Exclude<Speaker, 'pen'>): void {
    this.enqueue({ who, text: ALLY_LINES[who] });
  }

  private enqueue(l: Line): void {
    this.queued.push(l);
    if (this.queued.length > 3) this.queued.shift();
  }

  /** Real seconds (not the creature clock); `held` = a story caption is on screen. */
  step(dt: number, held: boolean): void {
    this.sinceStart += dt;
    if (this.showing > 0) {
      this.showing -= dt;
      if (held || this.showing <= 0) {
        this.showing = 0;
        this.onLine?.('pen', null, 0);
      }
      return;
    }
    if (held || !this.queued.length || this.sinceStart < SHOW + ACT_GAP) return;
    this.show(this.queued.shift()!);
  }

  private show(l: Line): void {
    this.showing = SHOW;
    this.sinceStart = 0;
    this.onLine?.(l.who, l.text, l.who === 'pen' ? this.waver : 0);
  }

  /** Fight reset / end: nothing on screen, nothing waiting. */
  clear(): void {
    this.queued.length = 0;
    if (this.showing > 0) this.onLine?.('pen', null, 0);
    this.showing = 0;
    this.sinceStart = 99;
    this.waver = 0;
  }
}
