/**
 * [INPUT]: none (plain data)
 * [OUTPUT]: exports ZH_ARENAS — the Chinese for the "not yet" answers (level/NotYet: a boss hit before its fight) and
 *           the arena guard's word (level/ArenaGuard), keyed by the English source
 * [POS]: spread into ZH (./zh.ts); kept apart so these strings live beside their feature, like zhSetup / zhDifficulty.
 * [PROTOCOL]: Update this header on change, then check docs/regression/ARENAS.md
 */
export const ZH_ARENAS: Record<string, string> = {
  // ── level/ArenaGuard: knocked out of a locked arena, put back in ──
  'BACK IN THE FIGHT!': '回到战场！',
  // ── level/NotYet: the word on the boss ──
  'RUNS OFF!': '流走了！',
  'NOT YET.': '还没到时候。',
  // ── level/NotYet: the line ──
  'The Eraser is not fighting yet. Wake the three Guardians first ({n}/3).': '橡皮擦还没开打。先唤醒三位守护者（{n}/3）。',
  'Step onto the summit to face the Eraser.': '走上山顶，去面对橡皮擦。',
  'Your paint runs off its glass from out here. Get past the red barricades into Inkwell Square first.': '在外面喷，颜料只会顺着玻璃流走。先越过红色路障，进到墨水瓶广场里。',
  'The Hush is not listening yet. Wake the three sound Guardians first ({n}/3).': '「寂静」还不理你。先唤醒三位声音守护者（{n}/3）。',
  'The Hush only fights on the headland plaza. Step onto it to face THE HUSH.': '「寂静」只在海岬广场上应战。走上广场去面对它。',
  'The Red Pen is not fighting yet. Wake the three Guardian machines first ({n}/3).': '红笔还没开打。先唤醒三台守护机器（{n}/3）。',
  'The Red Pen waits behind its wet ink. Push through the ink gate to face it.': '红笔在湿墨水后面等着。穿过墨水门去面对它。',
};
