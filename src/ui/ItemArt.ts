/**
 * [INPUT]: 道具、增益与 HUD 图标 ID。
 * [OUTPUT]: 贴纸素材、可复用的内联图标与图片加载回退。
 * [POS]: HUD、菜单与 Pip 共用此处的游戏图标。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
/**
 * Hand-drawn graffiti-sticker icons for arsenal items and run boons.
 * Each icon is a tiny SVG (64×64 art box) turned into a data: URL, so it is
 * isolated from page CSS and can be used in <img> tags anywhere.
 * The white die-cut border and drop shadow come from one shared SVG filter.
 */

const O = '#1b1b2a'; // ink outline
const P = '#ff3fa4'; // pink
const Y = '#ffd23f'; // yellow
const T = '#22c4c0'; // turquoise
const C = '#3a5bff'; // cobalt
const Or = '#ff8a1f'; // orange
const R = '#ff3b4e'; // red
const G = '#3fcf6a'; // green
const V = '#a53cff'; // violet
const W = '#ffffff';
const S = '#c9c4d6'; // steel

// ---- little drawing helpers -------------------------------------------------
/** Thick stroke-shaped part (spring, magnet, leech…): ink pass under a colour pass. */
const tube = (d: string, col: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${O}" stroke-width="${w + 6}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
/** A paint drip hanging from (x, y). */
const drip = (x: number, y: number, len: number, col: string, w = 5) =>
  `<path d="M${x - w / 2} ${y} v${len} a${w / 2} ${w / 2} 0 0 0 ${w} 0 v-${len} z" fill="${col}" stroke-width="2.4"/>`;
/** White highlight stroke. */
const shine = (d: string, w = 2.6) => `<path d="${d}" fill="none" stroke="${W}" stroke-width="${w}" stroke-opacity=".9"/>`;
const dot = (x: number, y: number, r: number, col: string, sw = 2.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke-width="${sw}"/>`;
const sparkle = (x: number, y: number, r: number, col = Y) =>
  `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}z" fill="${col}" stroke-width="2"/>`;
const heartPath = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + 9 * s} C${cx - 16 * s} ${cy - 1 * s} ${cx - 11 * s} ${cy - 14 * s} ${cx} ${cy - 6 * s} C${cx + 11 * s} ${cy - 14 * s} ${cx + 16 * s} ${cy - 1 * s} ${cx} ${cy + 9 * s}z`;
const heart = (cx: number, cy: number, s: number, col: string) =>
  `<path d="${heartPath(cx, cy, s)}" fill="${col}"/>` + shine(`M${cx - 8 * s} ${cy - 4 * s} q2 -4 5 -3`, 2.2);
/** A spray can, base at (x, y+h). */
const can = (x: number, y: number, w: number, h: number, body: string, band: string, cap: string) =>
  `<rect x="${x + w * 0.22}" y="${y - 9}" width="${w * 0.56}" height="11" rx="3" fill="${cap}"/>` +
  `<rect x="${x + w * 0.38}" y="${y - 14}" width="${w * 0.24}" height="6" rx="1.5" fill="${W}"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.22}" fill="${body}"/>` +
  `<path d="M${x} ${y + h * 0.42} h${w} v${h * 0.2} h-${w} z" fill="${band}" stroke-width="2.4"/>` +
  shine(`M${x + 4} ${y + 6} v${h * 0.26}`);
const clover = (cx: number, cy: number, col: string) =>
  [0, 90, 180, 270]
    .map((a) => `<path transform="rotate(${a} ${cx} ${cy})" d="${heartPath(cx, cy - 11, 0.78)}" fill="${col}"/>`)
    .join('') + `<path d="M${cx} ${cy} q4 12 12 18" fill="none" stroke-width="4"/>` + dot(cx, cy, 3, Y, 2);

// ---- the art ------------------------------------------------------------------
const ART: Record<string, string> = {
  hp_full: heart(32, 32, 2.25, R),
  hp_empty: heart(32, 32, 2.25, '#635566'),
  hp_half: `<defs><linearGradient id="hp"><stop offset=".5" stop-color="${R}"/><stop offset=".5" stop-color="#635566"/></linearGradient></defs>` +
    heart(32, 32, 2.25, 'url(#hp)'),
  crown:
    `<path d="M8 20 L21 32 L31 12 L42 31 L56 18 L49 50 H15 Z" fill="${Y}"/>` +
    `<path d="M15 42 H50" stroke="${Or}" stroke-width="5"/>` + shine('M17 37 H26') + dot(32, 36, 3.8, P, 2),
  paint_drop:
    `<path d="M32 6 Q27 17 16 29 Q6 43 18 54 Q33 67 48 53 Q59 42 48 29 Q37 17 32 6Z" fill="${T}"/>` +
    `<path d="M16 41 Q30 49 50 37 Q51 52 38 54 Q25 59 18 49Z" fill="${C}" stroke="none"/>` + shine('M29 24 Q19 32 19 40'),
  stone:
    `<path d="M7 38 L19 18 L38 12 L55 25 L58 47 L46 54 L15 51 Z" fill="${S}"/>` +
    `<path d="M7 38 L25 38 L38 26 L55 25 L58 47 L46 54 L15 51 Z" fill="#827890"/>` + shine('M20 24 L33 20'),

  // spray caps
  classic:
    can(19, 19, 26, 39, P, Y, T) +
    `<path d="M26 37 l3 -4 3 4 3 -4 3 4" fill="none" stroke-width="2.4"/>` + // crown doodle
    dot(50, 8, 3, P) + dot(56, 13, 2.2, Y) + dot(51, 17, 1.8, T) + drip(24, 57, 4, P, 4),
  fatcap:
    `<path d="M24 32 L58 9 Q66 32 58 55 Z" fill="${Y}"/>` +
    `<path d="M24 32 L60 22 Q61 32 60 42 Z" fill="${P}" stroke-width="2.4"/>` +
    `<path d="M24 32 L61 30 L61 34 Z" fill="${T}" stroke-width="2"/>` +
    `<rect x="6" y="20" width="20" height="24" rx="7" fill="${T}"/>` +
    `<ellipse cx="25" cy="32" rx="4" ry="9" fill="${W}"/>` + shine('M10 25 v9') + drip(58, 52, 5, Y),
  needle:
    dot(44, 32, 18, W) + dot(44, 32, 13, R) + dot(44, 32, 7.5, W) + dot(44, 32, 3, R, 2) +
    `<rect x="0" y="24" width="18" height="16" rx="4" fill="${C}"/>` + shine('M4 28 v6') +
    `<path d="M18 30 L44 31.4 L44 32.6 L18 34 Z" fill="${T}" stroke-width="2"/>` +
    sparkle(26, 18, 5, Y) + drip(44, 46, 6, R, 4),
  blobber:
    `<path d="M10 54 Q14 24 34 18" fill="none" stroke-width="2.6" stroke-dasharray="1 6"/>` +
    `<path d="M36 10 C48 6 60 14 58 26 C62 34 54 44 44 41 C36 46 26 38 30 30 C24 22 28 12 36 10z" fill="${P}"/>` +
    dot(56, 46, 4, P) + dot(26, 44, 2.5, P) +
    `<rect x="4" y="50" width="16" height="10" rx="4" fill="${Or}"/>` +
    shine('M37 16 q6 -3 11 0') + drip(42, 41, 8, P),
  // gadgets
  bomb:
    `<path d="M40 18 q6 -10 14 -9" fill="none" stroke-width="3"/>` +
    dot(28, 38, 19, C) +
    `<rect x="31" y="15" width="12" height="9" rx="2" transform="rotate(35 37 19)" fill="${S}"/>` +
    `<path d="M54 2 l2 5 5 -1 -3 4 4 3 -5 1 0 5 -3 -4 -4 3 1 -5 -5 -2 5 -2z" fill="${Y}" stroke-width="2"/>` +
    `<path d="M16 36 c4 -4 8 2 12 -2 c4 -4 8 2 12 -2" fill="none" stroke="${P}" stroke-width="5"/>` +
    shine('M17 30 q3 -8 10 -10') + drip(24, 54, 7, P),
  patch:
    `<g transform="rotate(-38 32 32)"><rect x="5" y="22" width="54" height="20" rx="10" fill="#ffc890"/><rect x="24" y="22" width="16" height="20" fill="#ffe4c2" stroke-width="2.4"/>` +
    dot(13, 28, 1.2, O, 0) + dot(13, 36, 1.2, O, 0) + dot(51, 28, 1.2, O, 0) + dot(51, 36, 1.2, O, 0) + `</g>` +
    heart(46, 46, 0.7, P) + sparkle(14, 50, 5, Y),
  sprinkler:
    `<path d="M18 22 Q6 14 4 30 M46 22 Q58 14 60 30" fill="none" stroke-width="2.6" stroke-dasharray="1 6"/>` +
    dot(4, 36, 3, P) + dot(60, 36, 3, Y) + dot(12, 12, 2.4, T) + dot(52, 12, 2.4, P) +
    can(20, 28, 24, 30, T, Y, P) +
    `<path d="M24 16 h16" stroke-width="3"/>` + dot(32, 12, 4, Or, 2.4),
  magnet:
    `<g transform="translate(5 7) scale(.84)">` +
    tube('M18 10 V32 A14 14 0 0 0 46 32 V10', R, 13) +
    `<rect x="11" y="4" width="14" height="10" fill="${S}"/><rect x="39" y="4" width="14" height="10" fill="${S}"/>` +
    shine('M15 32 a17 17 0 0 0 6 11', 2.4) +
    `<path d="M4 46 q-3 6 2 10 M60 46 q3 6 -2 10 M24 60 q8 3 16 0" fill="none" stroke="${T}" stroke-width="3"/></g>`,
  // charms
  sneakers:
    `<path d="M6 46 L8 30 Q14 26 22 30 L30 20 Q36 18 40 26 Q52 34 60 38 Q62 44 58 48 Z" fill="${Or}"/>` +
    `<path d="M5 46 H59 Q60 54 52 54 H8 Q4 54 5 46z" fill="${W}"/>` +
    `<path d="M28 26 l6 4 M26 31 l6 4 M24 36 l6 3" stroke-width="2.4"/>` +
    `<path d="M40 40 q8 0 14 -2" fill="none" stroke="${P}" stroke-width="3.6"/>` +
    `<path d="M2 18 h12 M0 25 h9 M4 11 h8" stroke="${T}" stroke-width="3"/>`,
  big_can:
    `<rect x="12" y="16" width="40" height="42" rx="5" fill="${C}"/>` +
    `<ellipse cx="32" cy="16" rx="20" ry="6" fill="${S}"/><ellipse cx="32" cy="16" rx="15" ry="3.6" fill="${P}" stroke-width="2"/>` +
    `<path d="M12 30 h40 M12 44 h40" stroke-width="2.6"/>` +
    `<path d="M14 18 q-2 10 2 16 q3 4 3 -4 q0 -6 3 -8" fill="${P}" stroke-width="2.4"/>` + drip(46, 20, 12, P, 4.5) +
    sparkle(52, 6, 5, Y) + shine('M17 34 v8'),
  extra_heart:
    heart(28, 34, 1.55, R) + dot(48, 16, 10, Y) + `<path d="M48 10 v12 M42 16 h12" stroke-width="3.4"/>` + drip(28, 46, 6, R),
  rocket_arm:
    `<g transform="rotate(40 32 32)"><path d="M32 4 C44 14 44 34 40 46 H24 C20 34 20 14 32 4z" fill="${W}"/>` +
    `<path d="M24 34 L14 48 L24 46z M40 34 L50 48 L40 46z" fill="${R}"/>` +
    dot(32, 24, 5.5, T) + `<path d="M26 46 Q32 64 38 46z" fill="${Or}"/><path d="M29 46 Q32 56 35 46z" fill="${Y}" stroke-width="2"/>` +
    `<path d="M27 12 q5 -4 10 0" fill="none" stroke="${R}" stroke-width="3"/></g>`,
  splash_boots:
    `<path d="M20 6 H38 V34 Q50 34 54 42 V50 H16 Z" fill="${Y}"/>` +
    `<rect x="14" y="48" width="42" height="7" rx="3" fill="${O}"/>` +
    `<path d="M20 14 h18" stroke-width="2.4"/>` + shine('M24 18 v12') +
    `<path d="M6 60 q2 -8 6 -6 M62 60 q-2 -8 -6 -6" fill="none" stroke="${T}" stroke-width="3"/>` +
    dot(8, 48, 3, T) + dot(60, 46, 3, T) + dot(4, 56, 2, P, 2),
  lucky_ink: clover(30, 28, G) + drip(30, 36, 0, G) + drip(19, 38, 9, G, 4) + sparkle(54, 12, 6, Y),
  quickstep:
    `<path d="M22 26 C18 14 34 8 40 16 C48 10 60 18 54 28 C62 32 56 44 46 40 C42 48 28 46 28 40 C18 42 14 30 22 26z" fill="${W}"/>` +
    `<path d="M2 22 h14 M0 32 h12 M4 42 h12" stroke="${T}" stroke-width="3.4"/>` +
    `<path d="M32 26 q6 -6 12 0" fill="none" stroke="${C}" stroke-width="3"/><path d="M30 34 q8 6 16 0" fill="none" stroke="${P}" stroke-width="3"/>` +
    sparkle(52, 50, 5, Y),
  leech:
    tube('M8 44 C14 30 26 52 34 38 C40 28 50 36 54 24', V, 10) +
    dot(54, 23, 7, V) + dot(56, 21, 2.6, W, 1.8) + dot(57, 21, 1.1, O, 0) +
    heart(20, 18, 0.75, R) + drip(8, 46, 6, V, 4),
  // boons
  pressure:
    `<rect x="27" y="44" width="10" height="16" fill="${S}"/>` +
    dot(32, 28, 22, W) + `<path d="M32 28 L14 22 A19 19 0 0 1 22 12z" fill="${G}" stroke-width="0"/>` +
    `<path d="M32 28 L48 14 A19 19 0 0 1 51 30z" fill="${R}" stroke-width="0"/>` + dot(32, 28, 22, 'none') +
    `<path d="M32 28 L48 18" stroke-width="3.6"/>` + dot(32, 28, 4, Y, 2.4) + sparkle(56, 52, 6, Or),
  deepcan:
    `<path d="M12 22 Q32 2 52 22" fill="none" stroke-width="3"/>` +
    `<path d="M10 22 H54 L50 58 H14 Z" fill="${S}"/>` +
    `<path d="M10 22 H54 L53 30 Q42 26 32 32 Q20 26 11 30 Z" fill="${C}" stroke-width="2.4"/>` +
    drip(20, 28, 10, C, 4.5) + drip(44, 28, 16, C, 4.5) + `<path d="M24 42 h16 M32 34 v16" stroke="${W}" stroke-width="4"/>`,
  refill:
    `<path d="M32 16 C40 28 44 34 44 40 A12 12 0 0 1 20 40 C20 34 24 28 32 16z" fill="${T}"/>` + shine('M26 40 q0 5 4 7') +
    `<path d="M10 30 A23 23 0 0 1 48 12" fill="none" stroke="${G}" stroke-width="4"/><path d="M44 6 l6 6 -8 3z" fill="${G}" stroke-width="2"/>` +
    `<path d="M54 36 A23 23 0 0 1 16 54" fill="none" stroke="${G}" stroke-width="4"/><path d="M20 60 l-7 -5 8 -4z" fill="${G}" stroke-width="2"/>`,
  fleet:
    `<path d="M20 30 C12 6 20 2 26 26 Z M38 26 C42 2 52 4 44 30 Z" fill="${W}"/>` +
    `<path d="M21 24 C17 12 20 10 23 22z M41 22 C44 10 47 12 43 24z" fill="${P}" stroke-width="1.6"/>` +
    `<ellipse cx="32" cy="40" rx="17" ry="15" fill="${W}"/>` + dot(26, 38, 2.4, O, 0) + dot(38, 38, 2.4, O, 0) +
    `<path d="M30 44 q2 2 4 0" fill="none" stroke-width="2.4"/>` + dot(22, 45, 3, P, 0) + dot(42, 45, 3, P, 0) +
    `<path d="M2 50 h10 M4 58 h12" stroke="${T}" stroke-width="3"/>`,
  spring:
    `<rect x="16" y="54" width="32" height="7" rx="2" fill="${S}"/>` +
    tube('M20 50 L44 44 L20 38 L44 32 L20 26 L44 20', T, 4) +
    `<rect x="14" y="12" width="36" height="8" rx="3" fill="${R}"/>` +
    `<path d="M18 6 q14 -8 28 0" fill="none" stroke="${Y}" stroke-width="3.4"/>`,
  hover:
    `<path d="M6 28 A26 22 0 0 1 58 28 Q51 22 45 28 Q38 22 32 28 Q26 22 19 28 Q13 22 6 28z" fill="${P}"/>` +
    `<path d="M19 28 A13 20 0 0 1 32 6 A13 20 0 0 1 45 28 Q38 22 32 28 Q26 22 19 28z" fill="${Y}" stroke-width="2.4"/>` +
    `<path d="M7 28 L27 48 M57 28 L37 48 M32 28 V46" fill="none" stroke-width="2"/>` +
    `<rect x="25" y="46" width="14" height="12" rx="3" fill="${T}"/>`,
  heart: heart(38, 30, 1.25, P) + heart(22, 40, 0.95, R) + sparkle(54, 52, 6, Y) + sparkle(10, 14, 5, Y),
  lucky: clover(32, 30, Y) + sparkle(54, 54, 6, G) + sparkle(10, 52, 4, P),
  // golden rubber stamp: knob, handle, block, a crown on the pad
  encore:
    dot(32, 10, 7, R) +
    `<path d="M27 15 h10 l2 17 h-14 z" fill="${Or}"/>` +
    `<path d="M12 32 h40 a3 3 0 0 1 3 3 v9 h-46 v-9 a3 3 0 0 1 3 -3 z" fill="${Y}"/>` +
    `<path d="M9 44 h46 v6 h-46 z" fill="${P}"/>` +
    `<path d="M20 61 l3 -8 l5 5 l4 -7 l4 7 l5 -5 l3 8 z" fill="${Y}" stroke-width="2.2"/>` +
    shine('M15 36 h14') + sparkle(55, 14, 6, Y) + sparkle(8, 20, 4, T),
  grease:
    `<path d="${gear(26, 34, 18, 13, 8)}" fill="${S}"/>` + dot(26, 34, 6, W) +
    `<path d="M48 4 C54 14 58 20 58 25 A10 10 0 0 1 38 25 C38 20 42 14 48 4z" fill="${O}" stroke-width="0"/>` +
    shine('M42 25 q0 4 3 6', 2) + drip(26, 50, 6, '#5b4b2f', 4),
  bigboom:
    `<path d="${burst(32, 32, 30, 17, 11)}" fill="${Or}"/>` + `<path d="${burst(32, 32, 19, 10, 9)}" fill="${Y}" stroke-width="2.4"/>` +
    dot(32, 32, 6, W, 2.2),
  thirsty:
    `<g transform="rotate(35 32 32)"><rect x="28" y="2" width="8" height="30" rx="3" fill="${Or}"/>` +
    `<rect x="26" y="30" width="12" height="7" fill="${S}"/>` +
    `<path d="M26 37 H38 Q40 50 32 58 Q24 50 26 37z" fill="${P}"/></g>` +
    drip(20, 50, 7, P, 4) + heart(50, 50, 0.6, R),
  twin:
    `<g transform="rotate(-14 20 40)">${can(9, 26, 20, 32, P, Y, T)}</g>` +
    `<g transform="rotate(14 44 40)">${can(35, 26, 20, 32, C, Y, Or)}</g>` +
    dot(10, 6, 3, P) + dot(54, 6, 3, C) + dot(32, 4, 2.4, Y),
  giant:
    `<path d="M32 6 C40 6 38 16 46 14 C56 12 60 22 52 28 C60 34 58 46 48 44 C46 54 36 60 30 52 C22 60 10 54 14 44 C4 42 4 30 12 28 C6 18 16 10 22 16 C24 8 28 6 32 6z" fill="${P}"/>` +
    `<path d="M32 22 C38 20 44 26 40 32 C44 38 36 44 30 40 C24 44 20 36 24 32 C20 26 26 20 32 22z" fill="${Y}" stroke-width="2.4"/>` +
    dot(58, 56, 3.5, T) + dot(6, 58, 2.6, C) + drip(30, 52, 6, P),
  ghost:
    `<path d="M14 56 V28 A18 18 0 0 1 50 28 V56 L44 50 L38 56 L32 50 L26 56 L20 50 Z" fill="${W}"/>` +
    `<ellipse cx="25" cy="30" rx="3.5" ry="5" fill="${O}" stroke-width="0"/><ellipse cx="39" cy="30" rx="3.5" ry="5" fill="${O}" stroke-width="0"/>` +
    `<path d="M28 40 q4 4 8 0" fill="none" stroke-width="2.4"/>` + dot(20, 37, 2.6, P, 0) + dot(44, 37, 2.6, P, 0) +
    `<path d="M54 22 h8 M56 32 h8 M54 42 h6" stroke="${V}" stroke-width="3"/>`,
  lock:
    tube('M20 30 V20 A12 12 0 0 1 44 20 V30', S, 6) +
    `<rect x="12" y="28" width="40" height="30" rx="6" fill="${Y}"/>` +
    dot(32, 40, 4.5, O, 0) + `<path d="M30 42 h4 l1 9 h-6z" fill="${O}" stroke-width="0"/>` + shine('M17 33 v14'),
};

function gear(cx: number, cy: number, ro: number, ri: number, n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.PI / n / 2.2;
    const pts = [
      [ri, a - s * 2],
      [ro, a - s],
      [ro, a + s],
      [ri, a + s * 2],
    ];
    for (const [r, q] of pts) d += `${d ? 'L' : 'M'}${(cx + Math.cos(q) * r).toFixed(1)} ${(cy + Math.sin(q) * r).toFixed(1)} `;
  }
  return d + 'Z';
}
function burst(cx: number, cy: number, ro: number, ri: number, n: number): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? ri : ro * (0.85 + 0.15 * Math.sin(i * 7.3));
    d += `${d ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} `;
  }
  return d + 'Z';
}

function tilt(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 13) - 6) * 1.1;
}

const cache = new Map<string, string>();

/** data: URL of the sticker for an item / boon id ('lock' for locked slots). */
export function itemArt(id: string): string {
  let url = cache.get(id);
  if (url) return url;
  const body = ART[id] ?? ART.lock;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 80 80" width="160" height="160">` +
    `<defs><filter id="k" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="4.2" result="d"/>` +
    `<feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="w"/>` +
    `<feOffset in="d" dx="1.6" dy="2.6" result="o"/><feFlood flood-color="#1b1b2a" flood-opacity=".45"/><feComposite in2="o" operator="in" result="s"/>` +
    `<feMerge><feMergeNode in="s"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
    `<g filter="url(#k)" transform="rotate(${tilt(id).toFixed(1)} 32 32)" stroke="${O}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
  url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(id, url);
  return url;
}

/** <img> markup for an icon. */
export const itemImg = (id: string, cls = '') => `<img class="st-ic ${cls}" src="${itemArt(id)}" alt="" draggable="false">`;

/** Codex-painted card illustration of a run boon (public/assets/boons/<id>.webp). Call wireArtFallback() on the
 *  container after inserting it: a missing file falls back to the SVG sticker above. */
export const boonImg = (id: string, cls = '') =>
  `<img class="boon-art ${cls}" src="${import.meta.env.BASE_URL}assets/boons/${id}.webp" data-fb="${id}" alt="" draggable="false">`;

export function wireArtFallback(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('img[data-fb]').forEach((img) => {
    const fb = () => {
      const id = img.dataset.fb;
      if (!id) return;
      img.removeAttribute('data-fb');
      img.src = itemArt(id);
      img.classList.add('fb');
    };
    if (img.complete && !img.naturalWidth) fb();
    else img.addEventListener('error', fb, { once: true });
  });
}

/** 贴纸图标与相邻文字共用标签。 */
export function stickerIcon(id: string): string {
  return `<img class="wd-icon" src="${itemArt(id)}" alt="" draggable="false">`;
}
