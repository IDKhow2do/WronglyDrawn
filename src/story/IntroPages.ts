/**
 * [INPUT]: depends on Sketch / INK / ellipsePts / rectPts from ./Doodle; the cast from ./Figures; StoryPage from ./StoryBook;
 *          t from ../i18n (words drawn inside the pictures: the Red Pen's margin notes, WAI's "WHY?")
 * [OUTPUT]: exports introPages() — the seven pages of the new-game INTRO (≈54 s), and eraserGuy / hushCloud (the Pen's tools)
 * [POS]: the INTRO book of src/story, played by StoryFlow before level 1's first start and from the title's STORY sticker.
 *        Story beats: children drew a city → nothing in it was "right", everything was alive (it SEES, it WALKS, it SINGS)
 *        → the Red Pen came in from outside the page (nobody drew it: the answer key, drawn exact) → it measured
 *        everything against one standard and marked whatever did not match → its Eraser, its Hush and its rulers took
 *        the eyes, the voices, the legs; the city went grey → a doodle in the margin got WRONG! (歪！), asked WHY?, kept it
 *        as its name → it climbed off the page with a spray can. Captions are English source (zhStory.ts has the Chinese).
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import { t } from '../i18n';
import { INK, Sketch, ellipsePts, rectPts, type Pt } from './Doodle';
import { cloud, house, kid, lamp, marginNote, notes, redPen, redX, ruler, splat, sun, wai } from './Figures';
import type { StoryPage } from './StoryBook';

/** The Red Pen's Eraser: a pink block with stern brows. Origin: bottom centre. */
export function eraserGuy(s: Sketch, x: number, y: number, k = 1): void {
  s.group(`transform="translate(${x} ${y}) rotate(-8) scale(${k})"`, () => {
    const b: Pt[] = [[-90, -110], [90, -110], [90, 0], [-90, 0]];
    s.scribble(b, '#ff9ec4', { gap: 13 });
    s.shape(b, { w: 6 });
    s.line([[-90, -40], [90, -40]], { w: 4, color: '#5aa0d8' });
    s.line([[-46, -84], [-16, -74]], { w: 5 });
    s.line([[46, -84], [16, -74]], { w: 5 });
    s.dot(-28, -64, 6);
    s.dot(28, -64, 6);
    s.line([[-20, -22], [20, -22]], { w: 5 });
  });
}

/** The Hush: a grey cloud with a finger-to-lips "shh". */
export function hushCloud(s: Sketch, x: number, y: number, k = 1): void {
  s.group(`transform="translate(${x} ${y}) scale(${k})"`, () => {
    cloud(s, 0, 0, 1, '#cfc8e2');
    s.dot(-34, -16, 6);
    s.dot(30, -16, 6);
    s.line([[-6, 6], [-6, -34]], { w: 6, color: '#7a6aa8' });
    s.text(80, -60, 'shh…', { size: 42, color: '#7a6aa8', rot: -8 });
  });
}

/** The children's city in one row (pages 1, 4, 5 and the END reuse the same composition). */
function cityRow(s: Sketch, o: { fill?: boolean; base?: number } = {}): void {
  const y = o.base ?? 640;
  const fill = o.fill !== false;
  // ground
  const ground: Pt[] = [[120, y], [1480, y - 6], [1480, y + 40], [120, y + 44]];
  if (fill) s.scribble(ground, INK.green, { gap: 14, angle: 0.15 });
  s.line([[110, y + 2], [1490, y - 4]], { w: 5 });
  house(s, 360, y, 190, 230, { lean: -24, color: INK.orange, roof: INK.red, face: 'many', fill });
  house(s, 620, y, 150, 320, { lean: 30, color: INK.teal, roof: INK.yellow, face: 'eyes', fill, door: INK.pink });
  house(s, 880, y, 210, 200, { color: INK.pink, roof: INK.blue, face: 'shout', fill });
  house(s, 1140, y, 170, 270, { lean: -34, color: INK.yellow, roof: INK.purple, face: 'eyes', legs: true, fill });
  lamp(s, 1340, y, 210, { lean: 6, color: fill ? INK.yellow : 'none' });
}

export function introPages(): StoryPage[] {
  return [
    // 1 · the children drew a city
    {
      dur: 5.6,
      captions: [{ at: 0.4, text: 'Once, some children drew a city.' }],
      art: () => {
        const s = new Sketch(11);
        s.speed = 0.55;
        sun(s, 220, 170, 62);
        cloud(s, 640, 150, 0.9);
        cloud(s, 1180, 120, 0.7);
        s.speed = 0.38;
        cityRow(s);
        s.speed = 0.6;
        s.at(0.2);
        kid(s, 150, 890, 0.8, { hair: 'pig', color: INK.pink, crayon: INK.orange });
        s.at(0.5);
        kid(s, 1470, 890, 0.8, { hair: 'cap', color: INK.yellow, crayon: INK.teal, flip: true });
        return s.svg();
      },
    },
    // 2 · nothing in it was right — and everything was alive (it sees, it walks, it sings)
    {
      dur: 7,
      captions: [
        { at: 0.3, text: 'Nothing in it was right. The houses leaned. The lamps had eyes.' },
        { at: 3.6, text: 'And everything was alive.' },
      ],
      art: () => {
        const s = new Sketch(23);
        s.speed = 0.5;
        house(s, 330, 760, 240, 330, { lean: -56, color: INK.teal, roof: INK.orange, face: 'many' });
        lamp(s, 650, 760, 330, { lean: -10 });
        s.at(2.2);
        house(s, 960, 700, 220, 240, { color: INK.pink, roof: INK.yellow, face: 'eyes', legs: true });
        for (const dy of [0, 30, 60]) s.line([[810, 560 + dy], [760, 560 + dy]], { w: 4, dur: 0.1 });
        s.at(3.4);
        house(s, 1310, 760, 210, 290, { lean: 24, color: INK.yellow, roof: INK.purple, face: 'shout' });
        notes(s, 1350, 380);
        s.at(1.2);
        s.text(330, 840, t('it SEES'), { size: 40, color: INK.blue, rot: -3 });
        s.at(2.6);
        s.text(960, 840, t('it WALKS'), { size: 40, color: INK.pink, rot: 2 });
        s.at(3.8);
        s.text(1310, 840, t('it SINGS'), { size: 40, color: INK.purple, rot: -2 });
        return s.svg();
      },
    },
    // 3 · the Red Pen comes in from outside the page: not drawn by anyone, it is the answer key
    {
      dur: 7,
      captions: [
        { at: 0.3, text: 'Then something came in over the edge of the page: the Red Pen.' },
        { at: 3.2, text: 'Nobody drew it. It came with the right answers.' },
      ],
      art: () => {
        const s = new Sketch(37);
        s.speed = 0.5;
        // a child shows her drawing (a house with legs and five eyes)
        kid(s, 470, 880, 1.05, { hair: 'bob', color: INK.purple, sheet: true });
        const sheet = rectPts(320, 360, 300, 220, 0);
        s.wash(sheet, '#ffffff');
        s.shape(sheet, { w: 5 });
        s.speed = 0.35;
        house(s, 470, 530, 90, 100, { lean: -12, color: INK.teal, roof: INK.orange, face: 'many', legs: true });
        // the edge of the page: beyond it, the outside (ruled, grey, exact)
        s.speed = 0.6;
        s.at(1.0);
        s.wash([[1230, 0], [1600, 0], [1600, 900], [1230, 900]], '#d9dce1', { opacity: 0.9 });
        s.line([[1230, 0], [1230, 900]], { wob: 0, w: 4, color: '#6b7380' });
        for (let y = 40; y < 900; y += 60) s.line([[1230, y], [1600, y]], { wob: 0, w: 2, color: '#b4bac3', dur: 0.04, step: 0.3 });
        s.at(1.6);
        redPen(s, 1130, 760, 0.95, { rot: 28 });
        // it measures her drawing: a dimension line, a tilt, a number
        s.at(4.0);
        const ex = { wob: 0, w: 3, color: INK.red, cls: 'redmark' };
        s.line([[320, 330], [620, 330]], ex);
        s.line([[320, 318], [320, 342]], ex);
        s.line([[620, 318], [620, 342]], ex);
        s.line([[470, 600], [470, 420]], { ...ex, w: 2 });
        s.line([[470, 600], [520, 425]], ex);
        s.text(640, 300, t('Deviation: 12°'), { font: 'marker', size: 38, color: INK.red, anchor: 'start', cls: 'redmark' });
        return s.svg();
      },
    },
    // 4 · it measured everything against one standard
    {
      dur: 7,
      captions: [
        { at: 0.3, text: 'It measured everything with the same ruler.' },
        { at: 2.4, text: 'Whatever did not match, it marked.' },
      ],
      art: () => {
        const s = new Sketch(41);
        s.speed = 0.25;
        cityRow(s);
        s.speed = 0.7;
        s.at(1.6);
        redPen(s, 1500, 480, 0.42, { rot: 34 });
        s.at(2.3);
        redX(s, 345, 470, 70);
        marginNote(s, 200, 190, t('Eyes: 2.'), { size: 44 });
        s.at(3.4);
        redX(s, 880, 590, 56);
        marginNote(s, 790, 250, t('Volume: over limit.'), { size: 40, rot: 3 });
        s.at(4.5);
        redX(s, 1140, 670, 60);
        marginNote(s, 1000, 780, t('Legs: not to spec.'), { size: 40, rot: -4 });
        s.at(5.4);
        redX(s, 620, 420, 46);
        marginNote(s, 470, 100, t('Windows: 4 per row.'), { size: 38, rot: 3 });
        return s.svg();
      },
    },
    // 5 · its tools took the eyes, the voices, the legs: the city went grey
    {
      dur: 8.6,
      cls: 'grey-later',
      captions: [
        { at: 0.3, text: 'Its Eraser rubbed out the eyes. Its Hush ate the voices. Its rulers pinned the legs.' },
        { at: 4.6, text: 'The city stopped seeing. Then it went quiet. Then it stood still.' },
      ],
      art: () => {
        const city = new Sketch(41);
        city.speed = 0.01;
        cityRow(city);
        // the tools at work
        city.at(0.5);
        city.speed = 0.6;
        for (const [x, y] of [[300, 450], [370, 420], [360, 500], [420, 470]] as Pt[]) city.wash(ellipsePts(x, y, 40, 26, 12), '#f2d4e2', { opacity: 0.95, dur: 0.25 });
        eraserGuy(city, 250, 340, 0.75);
        city.at(1.7);
        hushCloud(city, 880, 360, 0.9);
        city.wash(ellipsePts(880, 590, 70, 44, 14), '#cfc8e2', { opacity: 0.95 });
        city.at(2.8);
        ruler(city, 1140, 690, 260, -8);
        ruler(city, 1100, 640, 200, 14);
        const kidLayer = new Sketch(52);
        kidLayer.speed = 0.6;
        kidLayer.at(4.4);
        // a child's drawing gets its red X too
        kid(kidLayer, 1440, 890, 0.62, { hair: 'curl', color: INK.orange, sheet: true, sad: true });
        const sh = rectPts(1340, 590, 200, 140, 0);
        kidLayer.wash(sh, '#ffffff');
        kidLayer.shape(sh, { w: 4 });
        kidLayer.speed = 0.3;
        sun(kidLayer, 1440, 660, 30);
        kidLayer.speed = 0.7;
        kidLayer.at(5.6);
        redX(kidLayer, 1440, 660, 56, { w: 10 });
        return city.svg('greying', '--g:4.4s') + kidLayer.svg();
      },
    },
    // 6 · WRONG! → WHY? → WAI
    {
      dur: 11.6,
      captions: [
        { at: 0.3, text: 'In the margin, one small doodle got a red X too, and a note: WRONG!' },
        { at: 4.2, text: 'The doodle looked at it and asked: WHY?' },
        { at: 7.6, text: 'It kept the question as its name: WAI. It sounds like WHY. And its crown really was crooked.' },
      ],
      art: () => {
        const bg = new Sketch(41);
        bg.speed = 0.01;
        bg.group('transform="translate(330 150) scale(0.8)"', () => cityRow(bg, { fill: false }));
        const s = new Sketch(61);
        s.speed = 0.55;
        // the margin line, re-inked
        s.line([[300, 20], [304, 880]], { color: INK.red, w: 4, opacity: 0.5, dur: 0.4 });
        wai(s, 170, 720, 1.25, { can: false });
        s.at(2.0);
        redX(s, 170, 580, 120, { w: 14 });
        s.at(2.6);
        s.text(390, 250, t('WRONG!'), { font: 'marker', size: 92, color: INK.red, rot: -10, anchor: 'start', cls: 'redmark' });
        s.line([[390, 275], [700, 225]], { color: INK.red, w: 7, dur: 0.25 });
        s.at(4.4);
        // the speech bubble: WHY?
        const bub = ellipsePts(520, 470, 150, 82, 18);
        s.wash(bub, '#ffffff');
        s.shape(bub, { w: 5 });
        s.line([[430, 530], [290, 590], [400, 548]], { w: 5 });
        s.text(520, 495, t('WHY?'), { size: 76, color: INK.pencil, weight: 900 });
        s.at(8.0);
        // the name, in pencil, with the question folded into it
        s.text(170, 860, 'WAI', { size: 96, color: INK.pencil, weight: 900, rot: -4 });
        s.text(390, 860, t('= why? = 歪'), { size: 46, color: INK.blue, rot: -4, anchor: 'start' });
        return bg.svg('', 'opacity:.3') + s.svg();
      },
    },
    // 7 · it climbed off the page with a spray can
    {
      dur: 8,
      captions: [
        { at: 0.3, text: 'Then it climbed off the page and picked up a spray can…' },
        { at: 3.6, text: '…and went to give the city back its colours.' },
      ],
      art: () => {
        const grey = new Sketch(41);
        grey.speed = 0.01;
        cityRow(grey, { fill: false });
        const colour = new Sketch(41);
        colour.speed = 0.01;
        cityRow(colour);
        const s = new Sketch(71);
        s.speed = 0.6;
        wai(s, 1420, 860, 1.05, { armUp: true, can: true });
        s.at(2.4);
        // the spray: a coloured mist arcing over the town
        const cols = [INK.pink, INK.yellow, INK.teal, INK.blue, INK.orange];
        for (let i = 0; i < 26; i++) {
          const k = i / 25;
          const x = 1470 - k * 1150 + s.rand(-30, 30);
          const y = 620 - Math.sin(k * Math.PI) * 420 + s.rand(-40, 40);
          s.dot(x, y, s.rand(8, 22), cols[i % cols.length]);
        }
        for (const [x, y, r, c] of [[360, 330, 40, INK.pink], [640, 280, 34, INK.yellow], [900, 330, 44, INK.teal], [1140, 300, 36, INK.orange]] as [number, number, number, string][]) splat(s, x, y, r, c);
        return grey.svg('', 'opacity:.6;filter:grayscale(1)') + colour.svg('late', '--g:3.4s') + s.svg();
      },
    },
  ];
}
