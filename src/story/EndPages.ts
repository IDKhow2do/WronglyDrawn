/**
 * [INPUT]: depends on Sketch / INK / ellipsePts / rectPts from ./Doodle; the cast from ./Figures; cityRow-like houses;
 *          StoryPage / escapeHtml from ./StoryBook; t / getLang from ../i18n
 * [OUTPUT]: exports endPages(onLetter) — the END book (four epilogue pictures, the handwritten letter, the credits),
 *           AUTHOR (the maker's name, the ONE place it is written: the letter's signature, the credits and the title's
 *           corner credit all read it), LETTER_SIGNATURE and LETTER (the letter's English source paragraphs)
 * [POS]: the END of src/story, played by StoryFlow after level 3's celebration and from the title's THE END sticker.
 *        It picks up after the roof's last line ("…And that is fine."): the children come back; the Red Pen (the outside
 *        standard), splashed with WAI's paint, draws a crooked line and finds no box in its rubric to mark it wrong; the
 *        crossed-out drawings go back on the wall, each red X turned into a kite (a ruler for its spar) / star / bird,
 *        WAI is still asking why; then the one plain-spoken page, the letter from the author; then the credits.
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import { getLang, t } from '../i18n';
import { INK, Sketch, ellipsePts, rectPts, type Pt } from './Doodle';
import { bird, cloud, heart, house, kid, kite, lamp, notes, redPen, redX, ruler, splat, star, sun, wai } from './Figures';
import { escapeHtml, type StoryPage } from './StoryBook';

/**
 * The maker's name: the ONE place it is written. The letter's signature, the END credits and the title's corner credit
 * all read it, in both languages. A working name: change it here.
 */
export const AUTHOR = '巴特歪';

/** The signature under the letter. */
export const LETTER_SIGNATURE = AUTHOR;

/** The letter, paragraph by paragraph (English source; zhStory.ts has the Chinese). `gap` = a blank line before it. */
export const LETTER: { text: string; gap?: boolean }[] = [
  { text: 'Dear player,' },
  { text: 'Thank you for drawing this city with me.', gap: true },
  { text: 'When I was small, I drew a house with legs. It got a red X: houses do not have legs. The next day I drew it again.', gap: true },
  { text: 'Machines can make almost anything now. You ask them, and they build it. So the rare thing is not clever hands any more. The rare thing is the house with legs: the idea nobody else has, because it is yours.', gap: true },
  { text: 'A red pen can say “wrong”. It can never say what your idea could have become.', gap: true },
  { text: 'And when it comes out almost right, do not settle. Draw it again, and again, until it is the thing you saw in your head. Not settling, and your imagination: these are the two strongest things you will carry, wherever you go.', gap: true },
  { text: 'So be a little WAI. Keep your crown crooked. Keep asking why. Then go and make the thing you are thinking of. Start today.', gap: true },
  { text: 'I can’t wait to see what you make,', gap: true },
];

/** The city, coloured in and crooked again (the END's version of the intro's row). */
function brightCity(s: Sketch, y = 640): void {
  const ground: Pt[] = [[120, y], [1480, y - 6], [1480, y + 40], [120, y + 44]];
  s.scribble(ground, INK.green, { gap: 14, angle: 0.15 });
  s.line([[110, y + 2], [1490, y - 4]], { w: 5 });
  house(s, 360, y, 190, 230, { lean: -24, color: INK.orange, roof: INK.red, face: 'many' });
  house(s, 620, y, 150, 320, { lean: 30, color: INK.teal, roof: INK.yellow, face: 'eyes', door: INK.pink });
  house(s, 880, y, 210, 200, { color: INK.pink, roof: INK.blue, face: 'shout' });
  house(s, 1140, y, 170, 270, { lean: -34, color: INK.yellow, roof: INK.purple, face: 'eyes', legs: true });
  lamp(s, 1340, y, 210, { lean: 6 });
  notes(s, 900, 360);
}

/** A sheet pinned on the archive wall: a tiny drawing, then its red X. */
function pinned(s: Sketch, x: number, y: number, rot: number, draw: (s: Sketch) => void): void {
  s.group(`transform="translate(${x} ${y}) rotate(${rot})"`, () => {
    const sh = rectPts(-150, -120, 300, 240, 0);
    s.wash(sh, '#ffffff');
    s.shape(sh, { w: 5 });
    s.wash([[-36, -136], [36, -132], [34, -108], [-38, -112]], 'rgba(255,240,200,.9)');
    draw(s);
  });
}

/** One word (en) or one character (zh) per span: the letter writes itself in. */
function inkSpans(text: string, start: number, per: number): { html: string; end: number } {
  const zh = getLang() === 'zh';
  const parts = zh ? Array.from(text) : text.split(/(\s+)/);
  let d = start;
  let html = '';
  for (const p of parts) {
    if (/^\s+$/.test(p)) {
      html += p;
      continue;
    }
    html += `<span class="w" style="--d:${d.toFixed(2)}s">${escapeHtml(p)}</span>`;
    d += zh ? per * 0.55 : per;
    if (/[.,;:!?。，；：！？]$/.test(p)) d += per * 1.6;
  }
  return { html, end: d };
}

/** E5 · the letter: words ink in one by one; the page waits for a tap once the signature is down. */
function letterPage(onLetter: () => void): StoryPage {
  const page: StoryPage = {
    kind: 'sheet',
    cls: 'letter',
    dur: 16,
    wait: true,
    maxWait: 240,
    onShow: onLetter,
    art: () => {
      let d = 0.8;
      const per = getLang() === 'zh' ? 0.085 : 0.1;
      const paras = LETTER.map((p) => {
        const r = inkSpans(t(p.text), d, per);
        d = r.end + 0.5;
        return `<p class="${p.gap ? 'gap' : ''}">${r.html}</p>`;
      }).join('');
      const sign = `<p class="sign"><b class="w" style="--d:${(d + 0.2).toFixed(2)}s">${escapeHtml(LETTER_SIGNATURE)}</b></p>`;
      // a small WAI in the corner, drawn after the signature
      const s = new Sketch(151);
      s.speed = 0.5;
      s.at(d + 0.8);
      wai(s, 800, 860, 2.6, { armUp: true, can: true });
      // the page may turn once everything is written
      page.dur = d + 2.4;
      return `<div class="sb-letter">${paras}${sign}<div class="doodle">${s.svg()}</div></div>`;
    },
  };
  return page;
}

export function endPages(onLetter: () => void): StoryPage[] {
  return [
    // E1 · the children came back to their drawing
    {
      dur: 6,
      captions: [{ at: 0.4, text: 'The next morning, the children came back to their drawing.' }],
      art: () => {
        const s = new Sketch(111);
        s.speed = 0.3;
        sun(s, 200, 160, 60);
        cloud(s, 1180, 120, 0.7);
        brightCity(s);
        s.speed = 0.6;
        kite(s, 1000, 150, 46, INK.pink);
        s.at(0.3);
        kid(s, 150, 890, 0.8, { hair: 'pig', color: INK.pink, crayon: INK.orange });
        s.at(0.6);
        kid(s, 1470, 890, 0.8, { hair: 'cap', color: INK.yellow, crayon: INK.teal, flip: true });
        s.at(2.4);
        for (const [x, y, r, c] of [[520, 760, 26, INK.blue], [760, 790, 20, INK.pink], [1040, 770, 24, INK.yellow], [1260, 800, 18, INK.teal]] as [number, number, number, string][]) splat(s, x, y, r, c);
        return s.svg();
      },
    },
    // E2 · the standard, splashed with paint, draws a crooked line and finds no box to mark it wrong
    {
      dur: 8,
      captions: [
        { at: 0.3, text: 'WAI’s paint was the first crooked thing ever to touch the Red Pen.' },
        { at: 3.2, text: 'It drew a wobbly line, checked its rubric, and found no box to mark it wrong.' },
      ],
      art: () => {
        const s = new Sketch(121);
        s.speed = 0.55;
        // the paper they share
        const sheet = rectPts(420, 300, 760, 440, 0);
        s.wash(sheet, '#ffffff');
        s.shape(sheet, { w: 5 });
        // a child's half: a house with legs and a smiling sun
        s.speed = 0.4;
        house(s, 560, 640, 120, 150, { lean: -16, color: INK.teal, roof: INK.orange, face: 'many', legs: true });
        sun(s, 700, 400, 34);
        // the Pen's half: its first wobbly line — a lopsided flower, a spiral, a crooked heart
        s.speed = 0.9;
        s.at(2.6);
        const spiral: Pt[] = [];
        for (let i = 0; i < 40; i++) {
          const a = i * 0.42;
          spiral.push([960 + Math.cos(a) * (8 + i * 2.6), 470 + Math.sin(a) * (8 + i * 2.2)]);
        }
        s.line(spiral, { color: INK.red, w: 7, wob: 6, dur: 1.4 });
        s.line([[960, 560], [948, 640], [972, 700]], { color: INK.green, w: 7, wob: 5 });
        heart(s, 1080, 640, 34, INK.red);
        s.speed = 0.6;
        s.at(0.6);
        redPen(s, 1250, 700, 0.85, { rot: -28, mood: 'drawing', paint: true });
        s.at(1.2);
        kid(s, 300, 880, 0.9, { hair: 'curl', color: INK.orange, crayon: INK.pink });
        return s.svg();
      },
    },
    // E3 · the crossed-out drawings back on the wall; each red X turns into something
    {
      dur: 7.6,
      captions: [
        { at: 0.3, text: 'The crossed-out drawings went back up on the wall.' },
        { at: 2.8, text: 'Every red X turned into something: a kite (with a ruler for a spar), a star, a bird.' },
      ],
      art: () => {
        const s = new Sketch(131);
        // the wall (the archive), a rail of tape
        s.speed = 0.4;
        s.wash([[60, 120], [1540, 110], [1540, 860], [60, 870]], '#f3e3c8', { opacity: 0.6 });
        const drawings: [number, number, number, (s: Sketch) => void, (s: Sketch) => void, string][] = [
          [330, 430, -4, (q) => house(q, 0, 80, 110, 120, { color: INK.teal, roof: INK.orange, face: 'many', legs: true }), (q) => {
            kite(q, 0, -10, 70, INK.yellow);
            // the standard, put in its place: a ruler holds the kite together
            ruler(q, 0, -10, 150, 90);
          }, INK.pencil],
          [800, 400, 3, (q) => lamp(q, -20, 90, 150, {}), (q) => star(q, 0, 0, 80, INK.yellow), INK.orange],
          [1270, 440, -2, (q) => house(q, 0, 90, 130, 130, { color: INK.pink, roof: INK.blue, face: 'shout' }), (q) => bird(q, 0, -10, 90, INK.teal), INK.blue],
        ];
        for (const [x, y, rot, draw, , to] of drawings) {
          pinned(s, x, y, rot, (q) => {
            q.speed = 0.25;
            draw(q);
            q.speed = 0.5;
            // the X keeps its strokes but changes colour: the kite's spars, the star's glints, the bird's wings
            q.group(`class="turn" style="--to:${to};--ta:3.2s"`, () => redX(q, 0, 0, 96, { w: 13, dur: 0.15 }));
          });
        }
        // the X's become things
        s.at(3.0);
        s.speed = 0.75;
        for (const [x, y, rot, , turn] of drawings) s.group(`transform="translate(${x} ${y}) rotate(${rot})"`, () => turn(s));
        return s.svg();
      },
    },
    // E4 · and WAI is still asking why
    {
      dur: 6.4,
      captions: [{ at: 0.4, text: 'And WAI? WAI is still asking why.' }],
      art: () => {
        const s = new Sketch(141);
        s.speed = 0.4;
        house(s, 800, 860, 360, 300, { lean: -30, color: INK.purple, roof: INK.yellow, face: 'eyes' });
        s.speed = 0.6;
        s.at(1.2);
        wai(s, 790, 500, 1.15, { armUp: true, can: true });
        s.at(2.4);
        const bub = ellipsePts(1130, 230, 160, 84, 18);
        s.wash(bub, '#ffffff');
        s.shape(bub, { w: 5 });
        s.line([[1010, 280], [900, 330], [1040, 300]], { w: 5 });
        s.text(1130, 256, t('why?'), { size: 80, weight: 900 });
        s.at(3.2);
        for (const [x, y, r, c] of [[300, 220, 34, INK.yellow], [420, 120, 22, INK.pink], [1400, 520, 30, INK.teal], [240, 520, 26, INK.blue]] as [number, number, number, string][]) star(s, x, y, r, c);
        s.at(3.8);
        redPen(s, 1430, 860, 0.38, { rot: -14, mood: 'drawing', paint: true });
        return s.svg();
      },
    },
    letterPage(onLetter),
    // E6 · credits
    {
      kind: 'sheet',
      cls: 'wide',
      dur: 9,
      art: () => `<div class="sb-credits">
          <div class="logo-d">WRONGLY<br/>DRAWN</div>
          <div class="zh">错画之城</div>
          <p style="--d:1.2s">${escapeHtml(t('made by {name}', { name: AUTHOR }))}</p>
          <p style="--d:2.4s">${escapeHtml(t('Thank you for playing.'))}</p>
          <div class="end" style="--d:4.2s">TH<i>E</i> END</div>
        </div>`,
    },
  ];
}
