/**
 * [INPUT]: depends on setTextFilter and the Lang type from ../i18n
 * [OUTPUT]: exports installTouchText() (rewrites every translated string while the game is in touch mode),
 *           touchText(text, lang) (the rewrite itself) and controlsIn(text) (the touch controls a text names)
 * [POS]: ui/ text layer of the touch HUD. TouchControls installs it when the first touch arrives and pulses the
 *        buttons a shown hint names. A phone has no keys: no letter key reaches the screen in touch mode.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { setTextFilter, type Lang } from '../i18n';

/**
 * Every hint in the game is written for a keyboard ("press E", "按住 X"). i18n.t() is the one door all of them
 * pass, so the rewrite sits there: a key becomes the name of its touch control in corner brackets, 〔互动〕 or
 * [Interact]. The brackets are the contract with TouchControls: a sink that shows a hint asks controlsIn() which
 * buttons the text names and makes them pulse, so the player learns where 〔翻滚〕 is by seeing it move.
 */
export type TouchControl = 'spray' | 'jump' | 'roll' | 'aim' | 'interact' | 'throw' | 'chomp' | 'color' | 'gadget' | 'shout' | 'eye' | 'mouth' | 'leg' | 'pause' | 'findpen' | 'stick';

const NAMES: Record<TouchControl, [en: string, zh: string]> = {
  spray: ['Spray', '喷漆'],
  jump: ['Jump', '跳跃'],
  roll: ['Roll', '翻滚'],
  aim: ['Aim', '瞄准'],
  interact: ['Interact', '互动'],
  throw: ['Throw', '投掷'],
  chomp: ['Chomp', '啃咬'],
  color: ['Colour', '颜色'],
  gadget: ['Gadget', '道具'],
  shout: ['Shout', '大喊'],
  eye: ['Eye', '眼睛'],
  mouth: ['Mouth', '嘴巴'],
  leg: ['Legs', '腿'],
  pause: ['Pause', '暂停'],
  findpen: ['Find Pen', '找红笔'],
  stick: ['the stick', '摇杆'],
};

const KEYS: Record<string, TouchControl> = {
  E: 'interact', Space: 'jump', C: 'roll', Z: 'aim', X: 'shout', G: 'throw', V: 'chomp', T: 'color', B: 'gadget',
  Q: 'eye', R: 'mouth', F: 'leg', Esc: 'pause', Y: 'findpen', WASD: 'stick',
};

const tag = (c: TouchControl, lang: Lang): string => (lang === 'zh' ? `〔${NAMES[c][1]}〕` : `[${NAMES[c][0]}]`);

/** A key name standing alone: not inside a word, a {placeholder}, an HTML tag or an entity. */
const GUARD_L = String.raw`(?<![A-Za-z0-9{&'’_-])(?<!<\/?)`;
const GUARD_R = String.raw`(?![A-Za-z0-9}>;'’_-])`;
const WORD_KEY = new RegExp(`${GUARD_L}(WASD|Space|Esc)${GUARD_R}`, 'g');
/** Chinese text: a lone Latin capital is always a key. */
const ZH_KEY = new RegExp(`${GUARD_L}([EQRFCZXGVTBY])${GUARD_R}`, 'g');
/**
 * English text: a lone capital is a key only where the sentence treats it as one ("hold X", "(E)", "X:", "<b>E</b>",
 * "Q/R/F", "V chomp"). The story also says "a red X" and "draws a giant X": those are the cross, not the key.
 */
const EN_KEY = new RegExp(
  [
    String.raw`(?<=\b(?:press|pressing|tap|hold|mash|with|then|use)\s)([EQRFCZXGVTBY])${GUARD_R}`,
    String.raw`(?<=[(/·>,]\s?)([EQRFCZXGVTBY])(?=\s?[)/<:=,]|\s(?:to|in|again|next)\b)`,
    String.raw`${GUARD_L}([EQRFCZXGVTBY])(?=\s?[:/=]|,? then\b|\s(?:in mid-air|to select|again|selects|swings|sticks|chomp|shout|gadget|dodge|lift|stick)\b)`,
  ].join('|'),
  'gi',
);

type Rule = [RegExp, string | (() => string)];
/** Mouse and keyboard-only phrases, most specific first. */
const ZH: Rule[] = [
  [/（\s*Tab\s*）/g, ''],
  [/去装备库装备它/g, '在暂停菜单的装备库里装备它'],
  [/鼠标已释放.*$/g, ''],
  [/方向键／摇杆移动.*返回/g, ''],
  [/按住\s*Alt[^·。]*(?:·\s*)?/g, ''],
  [/H\s*·\s*操作说明/g, ''],
  [/\s*·\s*H\s*查看全部操作/g, ''],
  [/<b>H<\/b>\s*隐藏\s*·\s*/g, ''],
  [/^<b>[QRF]<\/b>\s*/g, ''],
  [/重抽（R）/g, '重抽'],
  [/点击画面开始操控/g, '点屏幕开始'],
  [/鼠标灵敏度/g, '视角灵敏度'],
  [/视角：鼠标\s*\/\s*双指滑动\s*\/\s*方向键/g, '视角：滑动右半屏'],
  [/移动鼠标或双指滑动转视角|鼠标转视角/g, '滑动右半屏转视角'],
  [/(?:按住\s*)?(?:Z\s*或\s*右键|右键\s*\/\s*Z|Z\s*\/\s*右键)/g, () => tag('aim', 'zh')],
  [/按住右键|右键/g, () => tag('aim', 'zh')],
  [/左键(?=把|喷)/g, () => `点${tag('spray', 'zh')}`],
  [/左键/g, () => tag('spray', 'zh')],
  [/再点击把它吐出去/g, () => `再点${tag('spray', 'zh')}把它吐出去`],
  [/点击吐出/g, () => `点${tag('spray', 'zh')}吐出`],
  [/点击喷漆/g, () => `按住${tag('spray', 'zh')}喷漆`],
  [/点击/g, '点'],
  [/空格/g, () => tag('jump', 'zh')],
  [/（\s*Shift\s*）/g, '（把摇杆推到底）'],
  [/Shift\s*奔跑/g, '摇杆推到底奔跑'],
  [/Shift/g, '摇杆推到底'],
];
const EN: Rule[] = [
  [/\s*\(Tab\)/g, ''],
  [/equip it in the ARSENAL/gi, 'equip it in the Pause Menu → Arsenal'],
  [/Cursor free.*$/g, ''],
  [/Arrows \/ stick to move.*go back/g, ''],
  [/\s*·?\s*[Hh]old Alt[^·.]*/g, ''],
  [/\s*·\s*H\b[^·<]*controls/gi, ''],
  [/\bH\s*·\s*controls\b/gi, ''],
  [/<b>H<\/b>\s*hide\s*·\s*/g, ''],
  [/^<b>[QRF]<\/b>\s*/g, ''],
  [/Re-roll \(R\)/g, 'Re-roll'],
  [/[Cc]lick the picture to take control/g, 'Tap the screen to start'],
  [/\bMouse sensitivity\b/gi, 'Look sensitivity'],
  [/(?:[Hh]old )?(?:Z or right-click|right-click \/ Z|Z \/ right-click|Z \/ right mouse|right mouse \/ Z)/g, () => tag('aim', 'en')],
  [/(?:[Hh]old )?right(?:-click| mouse(?: button)?)/g, () => tag('aim', 'en')],
  [/\bleft-click\b/gi, () => tag('spray', 'en')],
  [/\b[Cc]lick(?:: spray| to spray)/g, () => `hold ${tag('spray', 'en')} to spray`],
  [/\bclick to spit/gi, () => `tap ${tag('spray', 'en')} to spit`],
  [/(?:[Mm]ove the )?[Mm]ouse(?: or 2-finger swipe| \/ 2-finger swipe)?(?: \/ arrows)?(?=[^a-z]|$)/g, 'drag the right side'],
  [/\bClick\b/g, 'Tap'],
  [/\bclick\b/g, 'tap'],
  [/\s*\(Shift\)/g, ' (push the stick to its rim)'],
  [/\bShift\b/g, 'the stick at its rim'],
];

/** Rewrite one translated string for a touch screen. Text without a key name comes back as it is. */
export function touchText(text: string, lang: Lang): string {
  if (!/[A-Z]|[Cc]lick|[Mm]ouse|鼠标|点击|空格|[左右]键/.test(text)) return text;
  let s = text;
  for (const [re, to] of lang === 'zh' ? ZH : EN) s = s.replace(re, to as string);
  s = s.replace(WORD_KEY, (_m, k: string) => tag(KEYS[k], lang));
  if (lang === 'zh') s = s.replace(ZH_KEY, (_m, k: string) => tag(KEYS[k], lang));
  else {
    // the cross the Red Pen draws is the letter X too: keep it out of reach, then put it back
    s = s.replace(/\b(?:red|giant|an|a|the|And)\sX\b|’s X\b|^X\./g, (m) => m.replace('X', '\u0001'));
    s = s.replace(EN_KEY, (m, a?: string, b?: string, c?: string) => (/^[A-Z]$/.test(m) ? tag(KEYS[(a ?? b ?? c)!], lang) : m));
    s = s.replace(/\u0001/g, 'X');
  }
  if (s === text) return text;
  if (lang === 'zh') {
    // 按 E → 点〔互动〕, 按住 X stays "hold"; no gap between Chinese text and a bracket
    s = s.replace(/\s*(〔[^〕]+〕)\s*/g, '$1').replace(/(?<![长狂])按(?=〔)/g, '点').replace(/狂按(?=〔)/g, '狂点');
    s = s.replace(/(〔[^〕]+〕)(?:\/|或)\1/g, '$1').replace(/[（(](〔[^〕]+〕)[）)]/g, '（$1）');
    s = s.replace(/〕(?=[A-Za-z])/g, '〕 ').replace(/<b>(〔[^〕]+〕)<\/b>/g, '$1');
  } else {
    s = s.replace(/\b[Pp]ress(?:ing)? (?=\[)/g, (m) => (m[0] === 'P' ? 'Tap ' : 'tap ')).replace(/\b[Mm]ash (?=\[)/g, (m) => (m[0] === 'M' ? 'Tap ' : 'tap '));
    s = s.replace(/(\[[^\]]+\]) (?:\/|or) \1/g, '$1').replace(/\((\[[^\]]+\])\)/g, '$1').replace(/<b>(\[[^\]]+\])<\/b>/g, '$1');
  }
  return s.trim() === '' ? '' : s;
}

const byName = new Map<string, TouchControl>();
for (const c of Object.keys(NAMES) as TouchControl[]) for (const n of NAMES[c]) byName.set(n, c);

/** The touch controls a shown text names (its 〔…〕 / […] tags). */
export function controlsIn(text: string): TouchControl[] {
  const out: TouchControl[] = [];
  for (const m of text.matchAll(/〔([^〕]+)〕|\[([^\]]+)\]/g)) {
    const c = byName.get(m[1] ?? m[2]);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

let installed = false;
/** Touch mode is on: from now on no translated string names a key. */
export function installTouchText(): void {
  if (installed) return;
  installed = true;
  setTextFilter(touchText);
}
