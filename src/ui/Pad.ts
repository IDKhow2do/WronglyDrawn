/**
 * [INPUT]: depends on navigator.getGamepads (the browser Gamepad API, standard mapping)
 * [OUTPUT]: exports PadButton and PadReader (presses(): the buttons pressed since the last call, edge-detected)
 * [POS]: the only gamepad code in the game. Menus outside play read it: ui/SetupScreen (move, pick, go, back) and
 *        story/StoryBook's skip control (A turns the page, B / Start skip). A button already held when a reader is
 *        made never counts: a press must start after the screen appeared. Gameplay itself has no gamepad input.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export type PadButton = 'a' | 'b' | 'start' | 'up' | 'down' | 'left' | 'right';

/** Standard-mapping button indices. */
const BUTTONS: [PadButton, number][] = [['a', 0], ['b', 1], ['start', 9], ['up', 12], ['down', 13], ['left', 14], ['right', 15]];
/** Left stick past this counts as a d-pad press. */
const STICK = 0.6;

function held(): Set<PadButton> {
  const out = new Set<PadButton>();
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    for (const [name, i] of BUTTONS) if (p.buttons[i]?.pressed) out.add(name);
    const [x = 0, y = 0] = p.axes;
    if (x < -STICK) out.add('left');
    if (x > STICK) out.add('right');
    if (y < -STICK) out.add('up');
    if (y > STICK) out.add('down');
  }
  return out;
}

export class PadReader {
  /** Seeded with what is held now: those buttons must be released before they count. */
  private last = held();

  /** Buttons that went down since the previous call. Call once per frame. */
  presses(): Set<PadButton> {
    const now = held();
    const out = new Set<PadButton>();
    for (const b of now) if (!this.last.has(b)) out.add(b);
    this.last = now;
    return out;
  }
}
