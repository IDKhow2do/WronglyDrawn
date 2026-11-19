/**
 * [INPUT]: a touch action name; no imports
 * [OUTPUT]: exports touchIcon(name) (inline SVG markup) and the TouchIconName type
 * [POS]: the one icon set of the touch HUD. TouchControls, UI (objective toggle) and HarborSession (shout) draw
 *        their buttons with it. Buttons carry the localized name as aria-label; the picture carries no text.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/**
 * STYLE. The icons are sticker art, like the rest of the HUD: a white body with a black marker outline, one
 * accent patch, round joins. Each reads at 24 px on any button colour, because the outline and the white body
 * carry their own contrast. Three paint classes, coloured in ui/ios-touch.css:
 *   .gf = body (white)   .ga = accent patch (the button's --glyph-accent)   .gk = solid ink
 * Motion (arrows, sound, spray mist) is ink line only. Things (can, sticker, rock, mouth) have a body.
 */
const shapes = {
  // a spray can with its mist: the main verb of the game
  spray:
    '<path class="gf" d="M6.5 11.6c0-1.5 1-2.6 2.5-2.9h4c1.5.3 2.5 1.4 2.5 2.9V19.6c0 1-.8 1.9-1.9 1.9H8.4c-1.1 0-1.9-.9-1.9-1.9Z"/>' +
    '<path class="ga" d="M6.5 13.4h9v3.6h-9z"/>' +
    '<path d="M6.5 13.4h9M6.5 17h9"/>' +
    '<path class="gf" d="M8.8 8.7V6.4c0-.5.4-.9.9-.9h2.6c.5 0 .9.4.9.9v2.3"/>' +
    '<path class="gk" d="M17.3 5.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm3-2.4a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm.4 4.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z"/>',
  // up, off the ground line
  jump: '<path class="gf" d="M12 2.8 19.2 10.6h-4v6.2H8.8v-6.2h-4Z"/><path d="M6.5 20.8h11"/>',
  // in the air the jump button holds the paint jet: the same arrow riding a puff
  hover: '<path class="gf" d="M12 2.8 18.6 9.8h-3.7v4.4H9.1V9.8H5.4Z"/><path class="ga" d="M9.3 16.6h5.4l1.5 4.4H7.8Z"/><path d="M9.3 16.6h5.4l1.5 4.4H7.8ZM5 18.5l-1.5 2M19 18.5l1.5 2"/>',
  // a tumble: one turn and where it ends
  roll: '<path d="M18.9 9.2A7.2 7.2 0 1 0 19.2 14"/><path class="gf" d="M20.6 3.8v6h-6Z"/>',
  // in the air the roll button is the paint slam: down, into a splash
  slam: '<path class="gf" d="M12 17.6 4.8 9.8h4V3.4h6.4v6.4h4Z"/><path d="M3 21h4M10 21h4M17 21h4"/>',
  // the Eye sticker's true sight: an eye that is a reticle
  aim:
    '<path class="gf" d="M2.4 12c2.6-4.1 5.8-6.2 9.6-6.2s7 2.1 9.6 6.2c-2.6 4.1-5.8 6.2-9.6 6.2S5 16.1 2.4 12Z"/>' +
    '<circle class="ga" cx="12" cy="12" r="3.6"/><circle class="gk" cx="12" cy="12" r="1.5"/>' +
    '<path d="M12 1.8v2.2M12 20v2.2"/>',
  // a sticker with its corner peeling: stick it, wake it, use it
  interact:
    '<path class="gf" d="M4.8 6.8c0-1.1.9-2 2-2h10.4c1.1 0 2 .9 2 2v6.2l-6.2 6.2H6.8c-1.1 0-2-.9-2-2Z"/>' +
    '<path class="ga" d="M19.2 13h-4.2c-1.1 0-2 .9-2 2v4.2Z"/><path d="M19.2 13h-4.2c-1.1 0-2 .9-2 2v4.2"/>' +
    '<path class="gk" d="m10.3 7.4.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3Z"/>',
  // a rock leaving the hand on an arc
  throw: '<circle class="gf" cx="16.4" cy="7.6" r="3.7"/><path d="M3.5 20.5c.6-5.4 3.3-9 7.8-10.8"/><path d="m7.6 20.5 2.6-3.8"/>',
  // a mouth mid-bite: two rows of teeth around the dark
  chomp:
    '<path class="gk" d="M3 12c2.4-4.2 5.4-6.3 9-6.3s6.6 2.1 9 6.3c-2.4 4.2-5.4 6.3-9 6.3S5.4 16.2 3 12Z"/>' +
    '<path class="gf" d="M5 9.4 7.1 12.1 9.1 9.7 11 12.1h2l1.9-2.4 2 2.4L19 9.4C17 7 14.7 5.7 12 5.7S7 7 5 9.4Z"/>' +
    '<path class="gf" d="M5 14.6 7.1 13.4 9.1 15l1.9-1.6h2l1.9 1.6 2-1.6 2.1 1.2c-2 2.4-4.3 3.7-7 3.7s-5-1.3-7-3.7Z"/>',
  // a drop of paint: the next colour
  color: '<path class="gf" d="M12 2.6c3.4 4.3 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.6-6.7 6-11Z"/><path d="M9 14.2c.2 1.5 1.1 2.5 2.5 2.9"/>',
  // a megaphone with two rings of sound
  shout: '<path class="gf" d="M3.2 9.8v4.4h3.2l6.8 4.3V5.5L6.4 9.8Z"/><path d="M16.2 9.3c.9.7 1.4 1.6 1.4 2.7s-.5 2-1.4 2.7M18.8 6.6c1.7 1.4 2.6 3.2 2.6 5.4s-.9 4-2.6 5.4"/>',
  // the Red Pen in a ring: swing the view onto it
  findpen: '<circle cx="12" cy="12" r="9.2"/><path class="gf" d="m7.2 16.8 1-3.9 6.5-6.5 2.9 2.9-6.5 6.5Z"/><path class="ga" d="m7.2 16.8 1-3.9 2.9 2.9Z"/><path d="m13.2 7.9 2.9 2.9"/>',
  pause: '<rect class="gf" x="5.8" y="4.5" width="4.4" height="15" rx="1.2"/><rect class="gf" x="13.8" y="4.5" width="4.4" height="15" rx="1.2"/>',
  // the tool drawer: closed, and open (a cross closes it)
  more: '<circle class="gf" cx="5.2" cy="12" r="2.2"/><circle class="gf" cx="12" cy="12" r="2.2"/><circle class="gf" cx="18.8" cy="12" r="2.2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18" stroke-width="3.2"/>',
  list: '<path d="M6 7h.01m0 5h.01m0 5h.01M10 7h8m-8 5h8m-8 5h8"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};

export type TouchIconName = keyof typeof shapes;

export function touchIcon(name: TouchIconName): string {
  return `<svg class="touch-glyph" data-glyph="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name]}</svg>`;
}
