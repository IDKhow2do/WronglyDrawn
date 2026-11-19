/**
 * [INPUT]: none (plain data)
 * [OUTPUT]: exports ZH_SETUP — the Chinese for the setup screen before a new game (ui/SetupScreen) and the SKIP
 *           control every story sequence shares (story/StoryBook), keyed by the English source
 * [POS]: spread into ZH (./zh.ts); kept apart so these strings live beside their feature, like zhDifficulty / zhStory.
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
export const ZH_SETUP: Record<string, string> = {
  // ── the one screen before a new game (ui/SetupScreen) ──
  'BEFORE YOU DRAW': '开画之前',
  'Three quick things. You can change them later in the pause menu.': '先选三样，以后在暂停菜单里随时能改。',
  'How sharp should it look?': '画面要多清楚？',
  'Auto picks what runs smoothly on this machine.': '“自动”会挑这台机器跑得顺的那一档。',
  'What colours?': '要什么颜色？',
  'The whole game takes these colours.': '整个游戏都会变成这套颜色。',
  'More colours': '更多颜色',
  'Which pen?': '用哪支笔？',
  'How hard the city fights back.': '这座城会反抗得多凶。',
  'Arrows / stick to move · Enter or A to pick · Esc to go back': '方向键／摇杆移动 · Enter 或 A 选 · Esc 返回',
  // ── the SKIP control (story/StoryBook) ──
  SKIP: '跳过',
  'Esc · hold Space': 'Esc · 按住空格',
  Esc: 'Esc',
};
