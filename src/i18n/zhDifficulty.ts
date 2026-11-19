/**
 * [INPUT]: none (plain data)
 * [OUTPUT]: exports ZH_DIFFICULTY — the Chinese for the difficulty cards, the pause row, the re-roll's guaranteed card, gold carry-over, the mid-boss fixes and the boss-fight restart toast, keyed by the English source
 * [POS]: spread into ZH (./zh.ts); kept apart so the difficulty strings live beside their feature (meta/Difficulty, ui/DifficultyPicker).
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const ZH_DIFFICULTY: Record<string, string> = {
  'LET’S DRAW': '开画',
  Difficulty: '难度',
  CRAYON: '蜡笔',
  MARKER: '马克笔',
  'PERMANENT MARKER': '油性记号笔',
  Gentle: '轻松',
  Normal: '普通',
  Hard: '困难',
  'Creatures attack more slowly and take less paint. Boss damage carries over when WAI is smudged.': '怪物出招较慢，喷漆更容易打倒它们。被抹花后，头目保留上次打掉的血量。',
  'Creatures take more paint. Boss damage carries over when WAI is smudged.': '怪物更耐打。被抹花后，头目保留上次打掉的血量。',
  'Creatures are tougher and hit harder. Get smudged and the boss gets its paint back.': '怪物更耐打，也打得更重。被抹花了，Boss 会变回满血。',
  // 困难模式下，被抹花会重开头目战。
  '{name} got all its paint back — the fight starts over!': '{name}变回满血了——这一仗从头再来！',
  'GOOD AS NEW!': '满血复活！',
  // boon picker: the card a re-roll guaranteed
  GUARANTEED: '保底',
  'Re-roll (R) · last one · gold guaranteed': '重抽（R）· 最后一次 · 保底出金',
  // gold boons carried into the next level
  'Carried over from the last level: {names}': '从上一关带过来了：{names}',
  // a boss bucks WAI off its head
  'SHOO!': '下去！',
  // the Red Gramophone's breath: what stops WAI answering, and where to stand
  'It’s breathing in — wear your Mouth Sticker (R), then HOLD X and BIG SHOUT into its horn!': '它在吸气——先戴上嘴巴贴纸（R），再按住 X，对着喇叭怒吼！',
  'MUFFLED — wait for your voice to come back, then BIG SHOUT into its horn!': '被闷住了——等声音回来，再对着它的喇叭怒吼！',
  'Climb back onto the bandstand, face its horn, then HOLD X: BIG SHOUT!': '爬回演奏台，面对它的喇叭，按住 X：怒吼！',
};
