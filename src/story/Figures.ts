/**
 * [INPUT]: depends on Sketch, INK, rectPts, ellipsePts, starPts from ./Doodle
 * [OUTPUT]: exports the storybook cast and props, each drawn into a Sketch at the cursor: house, lamp, sun, kid, redPen,
 *           wai, sprayCan, redX, marginNote, kite, star, bird, cloud, notes, ruler, splat, tower, paperBoat, waves, heart
 * [POS]: the characters of src/story. IntroPages / EndPages / StoryFlow (title cards) place them; every figure draws in
 *        local coordinates (origin at its feet) inside a translate/rotate/scale group, so one drawing serves every size.
 *        The look follows the game: WAI's box head, crooked three-point crown, red cape and spray can. The Red Pen is the
 *        odd one out: the outside world's standard, drawn exact (no wobble, flat machined fills, an engraved scale).
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import { INK, Sketch, ellipsePts, rectPts, starPts, type Pt } from './Doodle';

const g = (x: number, y: number, k = 1, rot = 0) => `transform="translate(${x} ${y}) rotate(${rot}) scale(${k})"`;

export interface HouseOpts {
  lean?: number;
  color?: string;
  roof?: string;
  face?: 'eyes' | 'many' | 'sleepy' | 'shout' | 'none';
  legs?: boolean;
  /** Colour the walls in (false: outline only, the grey city). */
  fill?: boolean;
  door?: string;
}

/** A child's house: leaning box, crooked roof, a face in the windows. Origin: bottom centre. */
export function house(s: Sketch, x: number, y: number, w: number, h: number, o: HouseOpts = {}): void {
  const lean = o.lean ?? 0;
  s.group(g(x, y), () => {
    const body = rectPts(-w / 2, -h, w, h, lean);
    if (o.fill !== false) s.scribble(body, o.color ?? INK.orange, { gap: 15 });
    s.shape(body, { w: 5 });
    const roof: Pt[] = [[-w / 2 + lean - 14, -h], [lean + w * 0.12, -h - w * 0.62], [w / 2 + lean + 14, -h]];
    if (o.fill !== false) s.scribble(roof, o.roof ?? INK.red, { gap: 13 });
    s.shape(roof, { w: 5 });
    // a face: window eyes, a door mouth
    const ex = w * 0.2, ey = -h * 0.66;
    const eye = (cx: number, cy: number, r: number) => {
      s.shape(ellipsePts(cx + lean * 0.3, cy, r, r * 0.9, 12), { w: 4, dur: 0.18 });
      s.dot(cx + lean * 0.3 + r * 0.2, cy + r * 0.15, r * 0.42);
    };
    if (o.face === 'many') {
      for (const [cx, cy, r] of [[-ex, ey, 15], [ex, ey, 18], [0, ey - 34, 12], [-ex * 1.7, ey + 30, 10], [ex * 1.6, ey + 34, 11]] as Pt3[]) eye(cx, cy, r);
    } else if (o.face === 'sleepy') {
      for (const sx of [-ex, ex]) s.line([[sx - 16 + lean * 0.3, ey], [sx + lean * 0.3, ey + 8], [sx + 16 + lean * 0.3, ey]], { w: 4, dur: 0.15 });
    } else if (o.face !== 'none') {
      eye(-ex, ey, 17);
      eye(ex, ey, 17);
    }
    if (o.face === 'shout') {
      const m = ellipsePts(lean * 0.15, -h * 0.28, w * 0.18, h * 0.13, 14);
      s.scribble(m, INK.pencil, { gap: 8, w: 12 });
      s.shape(m, { w: 4 });
    } else {
      // door with a smile line above it
      const dw = w * 0.22;
      s.shape([[-dw / 2 + lean * 0.1, 0], [-dw / 2 + lean * 0.12, -h * 0.3], [dw / 2 + lean * 0.12, -h * 0.3], [dw / 2 + lean * 0.1, 0]], { w: 4, dur: 0.25 });
      if (o.fill !== false) s.scribble(rectPts(-dw / 2, -h * 0.3, dw, h * 0.3, 0), o.door ?? INK.blue, { gap: 9, w: 11 });
      s.line([[-w * 0.18 + lean * 0.2, -h * 0.4], [lean * 0.2, -h * 0.36], [w * 0.18 + lean * 0.2, -h * 0.4]], { w: 4, dur: 0.2 });
    }
    if (o.legs) {
      // two walking legs with shoes under the house
      s.line([[-w * 0.22, 0], [-w * 0.3, 46], [-w * 0.42, 50]], { w: 6 });
      s.line([[w * 0.22, 0], [w * 0.3, 44], [w * 0.44, 40]], { w: 6 });
    }
  });
}
type Pt3 = [number, number, number];

/** A street lamp with one big eye. Origin: foot. */
export function lamp(s: Sketch, x: number, y: number, h: number, o: { eye?: boolean; lean?: number; color?: string } = {}): void {
  s.group(g(x, y, 1, o.lean ?? 0), () => {
    s.line([[0, 0], [2, -h]], { w: 7 });
    s.line([[2, -h], [24, -h - 22], [48, -h - 10]], { w: 6 });
    const head = ellipsePts(52, -h + 6, 26, 20, 14);
    s.scribble(head, o.color ?? INK.yellow, { gap: 10 });
    s.shape(head, { w: 5 });
    if (o.eye !== false) {
      s.shape(ellipsePts(52, -h + 6, 12, 10, 10), { w: 3, dur: 0.15 });
      s.dot(55, -h + 8, 6);
    }
  });
}

/** A crayon sun with a grin. */
export function sun(s: Sketch, x: number, y: number, r: number, o: { color?: string; face?: boolean } = {}): void {
  s.group(g(x, y), () => {
    const disc = ellipsePts(0, 0, r, r, 18);
    s.scribble(disc, o.color ?? INK.yellow, { gap: 12 });
    s.shape(disc, { w: 5, color: INK.orange });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      s.line([[Math.cos(a) * (r + 14), Math.sin(a) * (r + 14)], [Math.cos(a) * (r + 40), Math.sin(a) * (r + 40)]], { w: 5, color: INK.orange, dur: 0.08, step: 0.6 });
    }
    if (o.face !== false) {
      s.dot(-r * 0.32, -r * 0.15, 5);
      s.dot(r * 0.32, -r * 0.15, 5);
      s.line([[-r * 0.4, r * 0.25], [0, r * 0.45], [r * 0.4, r * 0.25]], { w: 4, dur: 0.15 });
    }
  });
}

export interface KidOpts {
  color?: string;
  hair?: 'pig' | 'cap' | 'curl' | 'bob';
  crayon?: string;
  /** Which arm holds the crayon up: -1 left, 1 right, 0 none. */
  arm?: -1 | 0 | 1;
  sad?: boolean;
  /** Holds a sheet of paper up (the drawing that gets a red X). */
  sheet?: boolean;
  flip?: boolean;
}

/** A child: round head, triangle or box body, stick limbs, big crayon. Origin: feet. ~260 px tall at k = 1. */
export function kid(s: Sketch, x: number, y: number, k = 1, o: KidOpts = {}): void {
  s.group(g(x, y, k), () => {
    s.group(o.flip ? 'transform="scale(-1 1)"' : '', () => {
      const head = ellipsePts(0, -196, 42, 44, 16);
      s.wash(head, '#ffe1c6', { opacity: 0.95 });
      s.shape(head, { w: 5 });
      // hair
      if (o.hair === 'pig') {
        s.line([[-40, -214], [-10, -238], [30, -232], [42, -206]], { w: 6 });
        s.shape(ellipsePts(-58, -200, 14, 18, 10), { w: 5 });
        s.shape(ellipsePts(58, -200, 14, 18, 10), { w: 5 });
      } else if (o.hair === 'cap') {
        const cap: Pt[] = [[-42, -206], [-30, -236], [26, -238], [42, -206]];
        s.scribble(cap, INK.blue, { gap: 9, w: 12 });
        s.shape(cap, { w: 5 });
        s.line([[30, -208], [78, -204]], { w: 6 });
      } else if (o.hair === 'curl') {
        for (let i = 0; i < 5; i++) s.shape(ellipsePts(-34 + i * 17, -232 + Math.abs(i - 2) * 6, 11, 10, 8), { w: 4, dur: 0.08 });
      } else {
        s.line([[-44, -190], [-40, -232], [0, -244], [40, -232], [44, -190]], { w: 6 });
      }
      // face
      s.dot(-15, -198, 5);
      s.dot(15, -198, 5);
      if (o.sad) s.line([[-14, -168], [0, -175], [14, -168]], { w: 4, dur: 0.12 });
      else s.line([[-16, -176], [0, -166], [16, -176]], { w: 4, dur: 0.12 });
      // body
      const body: Pt[] = [[-8, -152], [8, -152], [46, -60], [-46, -60]];
      s.scribble(body, o.color ?? INK.teal, { gap: 12 });
      s.shape(body, { w: 5 });
      // legs
      s.line([[-18, -60], [-22, 0], [-38, 2]], { w: 6 });
      s.line([[18, -60], [22, 0], [38, 2]], { w: 6 });
      // arms
      const up = o.arm ?? 1;
      if (o.sheet) {
        s.line([[-14, -138], [-56, -170], [-62, -214]], { w: 6 });
        s.line([[14, -138], [56, -170], [62, -214]], { w: 6 });
      } else {
        s.line([[-12, -138], [-44, -112], [-62, -86]], { w: 6 });
        if (up === 1) {
          s.line([[12, -138], [52, -166], [70, -200]], { w: 6 });
          crayon(s, 70, -200, o.crayon ?? INK.pink, -35);
        } else s.line([[12, -138], [44, -112], [62, -86]], { w: 6 });
      }
    });
  });
}

/** A fat crayon held at a point. */
export function crayon(s: Sketch, x: number, y: number, color: string, rot = 0): void {
  s.group(g(x, y, 1, rot), () => {
    const b: Pt[] = [[-10, -60], [10, -60], [10, 0], [-10, 0]];
    s.wash(b, color, { opacity: 0.95 });
    s.shape(b, { w: 4 });
    const tip: Pt[] = [[-10, -60], [0, -84], [10, -60]];
    s.wash(tip, color);
    s.shape(tip, { w: 4 });
  });
}

export interface PenOpts {
  rot?: number;
  /** 'flat' = it only sees deviation; 'drawing' = the ending, when its own crooked line finds no box in the rubric. */
  mood?: 'flat' | 'drawing';
  /** Splashed with WAI's paint (the ending). */
  paint?: boolean;
}

/**
 * The Red Pen: not drawn by the children. It comes from outside the page, the standard everything is measured
 * against, so it is drawn EXACT: ruler-straight edges (no wobble), flat machined fills, a steel cap and nib, a
 * scale engraved down the barrel. No malice: a level stare and a level mouth. Origin: nib tip. ~520 px at k = 1.
 */
export function redPen(s: Sketch, x: number, y: number, k = 1, o: PenOpts = {}): void {
  const exact = { wob: 0, w: 4, color: '#1d1a22' };
  s.group(g(x, y, k, o.rot ?? 20), () => {
    const nib: Pt[] = [[-16, -64], [0, 0], [16, -64]];
    s.wash(nib, '#b9c0c8', { dur: 0.15 });
    s.shape(nib, exact);
    const barrel: Pt[] = [[-40, -380], [40, -380], [40, -64], [-40, -64]];
    s.wash(barrel, '#d81f2a', { dur: 0.2 });
    s.wash([[18, -380], [40, -380], [40, -64], [18, -64]], '#a8141d', { dur: 0.15 });
    s.shape(barrel, exact);
    const cap: Pt[] = [[-44, -500], [44, -500], [44, -380], [-44, -380]];
    s.wash(cap, '#9aa3ad', { dur: 0.2 });
    s.wash([[-44, -500], [-20, -500], [-20, -380], [-44, -380]], '#c9d0d6', { dur: 0.1 });
    s.shape(cap, exact);
    s.shape([[48, -488], [62, -488], [62, -400], [48, -400]], exact);
    // the engraved scale
    for (let i = 0; i < 14; i++) {
      const yy = -90 - i * 20;
      s.line([[-40, yy], [i % 5 === 0 ? -18 : -28, yy]], { ...exact, w: 3, color: '#fbe8e8', dur: 0.03, step: 0.4 });
    }
    // a level stare: two square eyes, one straight mouth
    s.wash([[-24, -300], [-10, -300], [-10, -286], [-24, -286]], '#1d1a22', { dur: 0.08 });
    s.wash([[10, -300], [24, -300], [24, -286], [10, -286]], '#1d1a22', { dur: 0.08 });
    if (o.mood === 'drawing') s.line([[-18, -250], [-6, -246], [6, -252], [18, -246]], { wob: 2, w: 5, color: '#1d1a22', dur: 0.15 });
    else s.line([[-18, -250], [18, -250]], { ...exact, w: 5 });
    if (o.paint) {
      for (const [px, py, r, c] of [[-14, -340, 18, INK.yellow], [20, -160, 22, INK.teal], [-12, -100, 14, INK.pink], [24, -440, 16, INK.blue], [-26, -470, 12, INK.green]] as [number, number, number, string][])
        splat(s, px, py, r, c);
    }
  });
}

/** WAI: box head, crooked three-point crown, red cape, spray can. Origin: feet. ~230 px tall at k = 1. */
export function wai(s: Sketch, x: number, y: number, k = 1, o: { can?: boolean; armUp?: boolean; rot?: number; spray?: boolean } = {}): void {
  s.group(g(x, y, k, o.rot ?? 0), () => {
    // cape behind
    const cape: Pt[] = [[-30, -140], [30, -140], [56, -40], [-50, -46]];
    s.scribble(cape, INK.red, { gap: 11 });
    s.shape(cape, { w: 5 });
    // body + legs (red shoes)
    const body: Pt[] = [[-26, -140], [26, -140], [28, -64], [-28, -64]];
    s.wash(body, '#f4f0ea');
    s.shape(body, { w: 5 });
    s.line([[-14, -64], [-16, -10]], { w: 7 });
    s.line([[14, -64], [16, -10]], { w: 7 });
    s.wash([[-34, -12], [-6, -12], [-4, 4], [-36, 4]], INK.red);
    s.wash([[6, -12], [34, -12], [36, 4], [4, 4]], INK.red);
    // box head
    const head: Pt[] = [[-52, -236], [52, -232], [50, -140], [-50, -142]];
    s.wash(head, '#fffaf2');
    s.shape(head, { w: 6 });
    s.dot(-20, -190, 7);
    s.dot(22, -192, 7);
    s.line([[-14, -164], [2, -158], [18, -166]], { w: 4, dur: 0.12 });
    // the crooked crown (tilted, three points)
    s.group('transform="rotate(-12 0 -236)"', () => {
      const crown: Pt[] = [[-40, -232], [-44, -290], [-20, -258], [0, -300], [20, -258], [44, -292], [40, -232]];
      s.scribble(crown, INK.yellow, { gap: 9, w: 13 });
      s.shape(crown, { w: 5 });
    });
    // arms; the right one holds the can
    s.line([[-26, -128], [-56, -98], [-64, -76]], { w: 6 });
    if (o.armUp) {
      s.line([[26, -128], [58, -168], [66, -206]], { w: 6 });
      if (o.can !== false) sprayCan(s, 66, -206, 0.8, INK.pink, 10);
    } else {
      s.line([[26, -128], [56, -100], [70, -86]], { w: 6 });
      if (o.can) sprayCan(s, 72, -86, 0.8, INK.pink, -10);
    }
  });
}

/** A spray can (held at its base). */
export function sprayCan(s: Sketch, x: number, y: number, k = 1, color: string = INK.pink, rot = 0): void {
  s.group(g(x, y, k, rot), () => {
    const can: Pt[] = [[-22, -100], [22, -100], [22, 0], [-22, 0]];
    s.scribble(can, color, { gap: 9, w: 12 });
    s.shape(can, { w: 5 });
    s.shape([[-14, -100], [-10, -116], [10, -116], [14, -100]], { w: 4, dur: 0.12 });
    s.wash(ellipsePts(0, -122, 7, 6, 8), INK.pencil);
  });
}

/** The Red Pen's mark. */
export function redX(s: Sketch, x: number, y: number, r: number, o: { w?: number; dur?: number } = {}): void {
  const w = o.w ?? 12;
  s.line([[x - r, y - r], [x + r, y + r * 0.9]], { color: INK.red, w, dur: o.dur ?? 0.22, wob: 2, cls: 'redmark' });
  s.line([[x + r * 0.95, y - r * 1.05], [x - r * 0.9, y + r]], { color: INK.red, w, dur: o.dur ?? 0.22, wob: 2, cls: 'redmark' });
}

/** A correction in the margin: red marker words, underlined, sometimes circled. */
export function marginNote(s: Sketch, x: number, y: number, text: string, o: { size?: number; rot?: number; circle?: boolean } = {}): void {
  const size = o.size ?? 46;
  s.text(x, y, text, { font: 'marker', color: INK.red, size, rot: o.rot ?? -4, anchor: 'start', cls: 'redmark' });
  const w = Math.max(80, text.length * size * 0.48);
  const r = ((o.rot ?? -4) * Math.PI) / 180;
  s.line([[x, y + 12], [x + w * Math.cos(r), y + 12 + w * Math.sin(r)]], { color: INK.red, w: 5, dur: 0.2, cls: 'redmark' });
}

export function heart(s: Sketch, x: number, y: number, r: number, color: string = INK.pink): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    pts.push([x + r * 0.06 * 16 * Math.sin(t) ** 3, y - r * 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  s.scribble(pts, color, { gap: 8, w: 11 });
  s.shape(pts, { w: 4, color: '#c2186b' });
}

/** A kite whose spars are the two strokes of an X. */
export function kite(s: Sketch, x: number, y: number, r: number, color: string = INK.yellow): void {
  const d: Pt[] = [[x, y - r * 1.2], [x + r, y], [x, y + r * 1.3], [x - r, y]];
  s.scribble(d, color, { gap: 12 });
  s.shape(d, { w: 5 });
  s.line([[x, y + r * 1.3], [x - r * 0.3, y + r * 2], [x + r * 0.2, y + r * 2.6], [x - r * 0.2, y + r * 3.3]], { w: 4 });
  for (const k of [0.45, 0.75]) s.line([[x - r * 0.18, y + r * (1.3 + k * 2)], [x + r * 0.18, y + r * (1.3 + k * 2) + 8]], { w: 6, color: INK.pink, dur: 0.1 });
}

export function star(s: Sketch, x: number, y: number, r: number, color: string = INK.yellow): void {
  const p = starPts(x, y, r);
  s.scribble(p, color, { gap: 10 });
  s.shape(p, { w: 5 });
}

/** A bird: the X's arms bent into wings, plus a head. */
export function bird(s: Sketch, x: number, y: number, r: number, color: string = INK.teal): void {
  const body = ellipsePts(x, y, r * 0.55, r * 0.35, 12);
  s.scribble(body, color, { gap: 9, w: 12 });
  s.shape(body, { w: 4 });
  s.line([[x - r * 1.1, y - r * 0.8], [x - r * 0.4, y - r * 0.1], [x, y - r * 0.2]], { w: 5 });
  s.line([[x + r * 1.1, y - r * 0.8], [x + r * 0.4, y - r * 0.1], [x, y - r * 0.2]], { w: 5 });
  s.dot(x + r * 0.32, y - r * 0.08, 4);
  s.line([[x + r * 0.55, y], [x + r * 0.8, y + r * 0.08], [x + r * 0.55, y + r * 0.14]], { w: 4, color: INK.orange, dur: 0.1 });
}

export function cloud(s: Sketch, x: number, y: number, k = 1, color = '#ffffff'): void {
  const pts: Pt[] = [];
  const bumps = [[-90, 0, 46], [-40, -36, 52], [30, -40, 56], [86, -6, 44]];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    let best = 0;
    for (const [bx, by, br] of bumps) {
      const dx = Math.cos(a), dy = Math.sin(a);
      const t = bx * dx + by * dy + Math.sqrt(Math.max(0, br * br - (bx * dy - by * dx) ** 2));
      best = Math.max(best, t);
    }
    pts.push([x + Math.cos(a) * best * k, y + Math.min(20, Math.sin(a) * best) * k]);
  }
  s.wash(pts, color, { opacity: 0.85 });
  s.shape(pts, { w: 4, color: '#9cb6d8' });
}

/** Music notes rising (something singing). */
export function notes(s: Sketch, x: number, y: number, color: string = INK.purple): void {
  for (const [dx, dy] of [[0, 0], [46, -44], [100, -20]]) {
    s.wash(ellipsePts(x + dx, y + dy, 13, 10, 10, -0.4), color);
    s.line([[x + dx + 12, y + dy - 2], [x + dx + 12, y + dy - 52], [x + dx + 30, y + dy - 40]], { w: 5, color, dur: 0.12 });
  }
}

/** A school ruler laid at an angle (it pins a leg down). */
export function ruler(s: Sketch, x: number, y: number, len: number, rot = 0): void {
  s.group(g(x, y, 1, rot), () => {
    const r: Pt[] = [[-len / 2, -18], [len / 2, -18], [len / 2, 18], [-len / 2, 18]];
    s.wash(r, '#e9d9a8');
    s.shape(r, { w: 5 });
    for (let i = 1; i < 12; i++) s.line([[-len / 2 + (len / 12) * i, -18], [-len / 2 + (len / 12) * i, i % 3 ? -6 : 2]], { w: 3, dur: 0.04, step: 0.5 });
  });
}

/** A paint splat. */
export function splat(s: Sketch, x: number, y: number, r: number, color: string): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = r * (i % 2 ? 0.62 : 1) * s.rand(0.85, 1.2);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  s.wash(pts, color, { dur: 0.15, step: 0.5 });
  s.dot(x + r * 1.4, y - r * 0.6, r * 0.18, color);
}

/** The Correction Tower: a tall stepped tower with a red nib roof. Origin: base centre. */
export function tower(s: Sketch, x: number, y: number, k = 1, o: { fill?: boolean } = {}): void {
  s.group(g(x, y, k), () => {
    const shaft: Pt[] = [[-60, 0], [-46, -420], [46, -420], [60, 0]];
    if (o.fill !== false) s.scribble(shaft, INK.purple, { gap: 16 });
    s.shape(shaft, { w: 6 });
    for (let i = 1; i < 5; i++) s.line([[-58 + i * 3, -i * 84], [58 - i * 3, -i * 84]], { w: 4, dur: 0.1 });
    for (const yy of [-120, -220, -320]) s.shape(rectPts(-14, yy - 40, 28, 40), { w: 4, dur: 0.12 });
    const nib: Pt[] = [[-52, -420], [0, -540], [52, -420]];
    s.scribble(nib, INK.red, { gap: 12 });
    s.shape(nib, { w: 6 });
  });
}

/** The folded paper boat with a yellow sail and a crown. Origin: waterline centre. */
export function paperBoat(s: Sketch, x: number, y: number, k = 1, o: { wai?: boolean } = {}): void {
  s.group(g(x, y, k), () => {
    const hull: Pt[] = [[-170, -60], [170, -60], [110, 20], [-110, 20]];
    s.wash(hull, INK.cream);
    s.shape(hull, { w: 6 });
    s.line([[-60, -60], [0, 10], [60, -60]], { w: 4 });
    const sail: Pt[] = [[-90, -70], [90, -70], [0, -250]];
    s.scribble(sail, INK.yellow, { gap: 12 });
    s.shape(sail, { w: 5 });
    if (o.wai) wai(s, 110, -60, 0.42, { armUp: true, can: true });
  });
}

/** Wavy water lines across a band. */
export function waves(s: Sketch, x0: number, x1: number, y: number, rows = 3, color: string = INK.blue): void {
  for (let r = 0; r < rows; r++) {
    const pts: Pt[] = [];
    for (let x = x0; x <= x1; x += 40) pts.push([x, y + r * 34 + Math.sin(x * 0.05 + r) * 9]);
    s.line(pts, { w: 5, color, dur: 0.5, step: 0.25 });
  }
}
