# Red Pen, round 3 (2026-11-14): a stronger final fight

Author's play: the boss is not strong enough. Four jobs: (1) a real sky attack in phase 2, (2) the two allies help
visibly, (3) the Pen speaks during the fight, (4) the bottom of the HUD overlaps. Then judge the ground idle gaps.
Direction kept: the Pen is the outside standard (exact, metallic, cold), won over at the end; for children; free aim
first; the co-op partner never raises difficulty.

Ports: Vite 5291 (`/tmp/wd-pen/vite.mjs`, no HMR), headless Chrome CDP 9391 (`/tmp/wd-pen/chrome`, English, muted).

## Findings before the work
- HUD job 4: the yellow thing behind the boss bar is the ENCORE **FRENZY badge** (`.frenzy-badge`, UI.ts, bottom 12 px,
  centre): yellow pips, and a yellow plate "FRENZY READY" once charged. It appears after the first TAG and stays. The
  boss bar (bottom 2.2vh, 58vw) sat right on it. Also: at 1280 the bar's right end (x 1011) covered the Eye card (cards
  start x 940); at 2000×1060 the "Click to take control" lock hint (bottom 7 %) touched the bar's name strip.
- Sky phase: FLY waited `tell(2.4) + rand 0.8` s between moves, and a shout could drag it down any time it cruised,
  so a player (and the bot) shouted it down before it ever attacked. Two of its three moves were small. Hence "it just
  hangs there".
- Allies: the Hush only hovered by WAI until a shout; the Eraser rubbed the Legs' X once, then stood still.
- The Pen's lines were the old teacher's voice ("Hold still — just a small fix!"), as world comic text at its eyes.

## What changed
1. **Sky attack: CORRECTION MARKS** (`src/enemy/RedPenMarks.ts`, new; driven by `RedPenSky.startMarks / sprayMarks`).
   It comes down to 5.2 m and sprays: X crosses (two 6.6 × 1.5 m bars) and strike-through lines (a whole chord of the
   ring, 1.8 m wide). Each mark is an exact red outline whose fill is drawn along it like a pen stroke; when the stroke
   reaches the end it lands (light hit, 0.3 s live, then fades). Tell `tell(1.6)` (Gentle 2.08 s game time, Normal
   1.6 s game = 1.43 s real at tempo 1.12, Hard 1.07 s real), marks in a volley stagger `tell(0.35)`. The first mark lands
   under WAI (X / line alternately), the rest within 3.5–9.5 m. **Way out:** after each mark, 16 bearings round WAI are
   tested at 1.8 / 3 / 4.5 m; a mark that leaves fewer than 3 clear bearings is dropped. Density: `SOULS.inkMarks`
   (new column: Gentle 2, Normal 3, Hard 4) + 1 once the Pen is below 50 %. Marks are every other sky move (marks, swoop,
   marks, blots/tiles); the gap between sky moves is `tell(1.4) + rand 0.5`. **The shout window moved:** cruising (FLY) it
   hangs at 8.5 m, out of reach; it is shoutable only while it attacks (MARKS, BLOT, TILES, SWOOP tell). After a
   drag-down it rises straight into a volley. The objective hint says both.
2. **Allies** (`RedPenAllies.ts`, the boss calls `help()` each step; fixed cooldowns, never scaled by difficulty):
   - **Hush** (phase 2): every 9 s, when two or more marks are pending, it flies over ONE mark near WAI that he is not
     standing in and smothers it before it lands (lilac dust, ring, "SHH!", hush sound). It never takes the mark under
     WAI's feet and never the only mark. The drag-down on a shout is unchanged.
   - **Eraser** (phase 3): every 5 s it hops to the red ink pool or live ink line nearest WAI (≤ 8 m) and rubs it out
     (pink crumbs, "RUB RUB!", erase sound). Every 15 s, while the Pen walks between moves with nothing open, it rubs the
     Pen's nib: the NIB opens for `punish(1.6)` s — paint only, no TAG (`open(..., tag=false)`). Between jobs it hops at
     WAI's side, a step toward the Pen (never between WAI and the camera).
   - One line each as they join (below), through the same slip as the Pen.
3. **The Pen speaks** (`src/enemy/RedPenVoice.ts`, new): an event → line table, shown by `SoulsHud.say` as a correction
   slip (ruled paper, red margin, red marker) just above the boss bar. One line at a time, 3.2 s each, ordinary lines ≥ 6 s
   apart (others dropped), act lines (start, act changes, the fall, ally joins) queue (3 slots). A story caption on screen
   holds the voice (never two at once). Phase 3: `waver` = paint progress through the act; above 0.5 the late lines
   replace the cold ones and the slip's letters wobble and pick up turquoise / pink. The old teacher lines are gone
   (code and zh).
4. **HUD bottom** (`src/ui/souls.css`): in the fight the bottom row belongs to the boss bar. Its width is
   `clamp(420px, 100vw − 740px, 820px)` (clear of the cards and the help tab); the Pen's slip sits above it; the FRENZY
   badge moves under the stamina strip (top left); the lock hint moves to 57 % height; the opened help list and the co-op
   chat sit above the bar.
5. **Ground idle gaps**: the gap before the next ground move is now 1.0–1.2 s (phase 3: 0.7–0.8 s) × `SOULS.tell`
   (Gentle 1.3 → about the old gap; Normal ≈ 27 % shorter; Hard 0.8). Measured on Normal with the fight bot: the Pen
   walks (IDLE) 14 % of phase 1 and 8 % of phase 3; it is not passive, so nothing more was tightened.

## The Pen's lines (en / zh)
| event | English | 中文 |
|---|---|---|
| fight starts | Deviation detected. Beginning correction. | 检测到偏差。开始批改。 |
| WAI's eye (phase 3 True Sight; remark) | An eye does not go there. | 眼睛不该长在那里。 |
| | That eye is borrowed. And crooked. | 那只眼睛是借来的。还是歪的。 |
| WAI's legs (remark) | Legs? On a spray can? Incorrect. | 腿？长在喷漆罐上？错误。 |
| WAI's mouth (remark) | A mouth. On a can. Not to standard. | 一张嘴。长在罐子上。不合标准。 |
| remark | Not to standard. | 不合标准。 |
| it hits WAI | Corrected. / Marked wrong. / Error removed. | 已批改。/ 判为错误。/ 错误已清除。 |
| paint on a weak point | Paint. On me? / That is not my colour. | 颜料。在我身上？/ 那不是我的颜色。 |
| Legs crossed out (→ phase 2) | Legs: not to spec. Removed. | 腿：不合规格。已删除。 |
| up in the sky | From up here, every error is visible. | 从这上面，每个错误都看得一清二楚。 |
| marks volley | Strike through. / X. And X. And X. | 划掉。/ 叉。叉。再打个叉。 |
| shouted down | Lower your voice. | 把声音放低。 |
| Mouth crossed out (→ phase 3) | Volume: over limit. Removed. | 音量：超出上限。已删除。 |
| crosses itself out | If I cannot be seen, I cannot be marked. | 看不见我，就没法给我打分。 |
| STAB / RULE / SWEEP tells (½ chance) | Hold still. / Straight. As specified. / Clearing the page. | 别动。/ 笔直。按规定。/ 清理整页。 |
| late, painted (waver) | This colour is… not… incorrect? / My lines are… b-bending. / Is wobbly… permitted? | 这个颜色……不算……错？/ 我的线条……在、在弯。/ 歪歪的……也可以吗？ |
| late, it hits WAI | Cor… rected. Probably. | 批……改了。大概吧。 |
| nib-first fall | I have no rule for this. | 这个……我没有规定。 |
| Hush joins | Shh… I’ll keep its ink quiet. | 嘘……我让它的墨水安静下来。 |
| Eraser joins | I only rub out RED now! | 我现在只擦红色！ |

Unchanged: the won-over world caption "Oh! It’s… wobbly. I like it." (RedPenBoss.stepDrawing).

## Proof (own ports, headless, Gentle unless said)
- `docs/level3/bot/sky_probe.mjs` (60 s game time of phase 2, Pen paint held in the act, hearts topped up):
  | difficulty | WAI | hits / min | by word | volleys / marks / smothered by the Hush |
  |---|---|---|---|---|
  | Gentle | fight bot (dodges, shouts) | 0 | — | 5 / 10 / 2 |
  | Gentle | stands still | 18.9 | WET INK 11, UNDERLINED 4, CORRECTED 2, STRUCK THROUGH 2 | 5 / 10 / 4 |
  | Normal | fight bot | 1 | STRUCK THROUGH 1 | 6 / 18 / 1 |
  | Normal | stands still | 14.9 | WET INK 9, UNDERLINED 3, CORRECTED 2, STRUCK THROUGH 1 | 7 / 15 / 4 |
  (Before the change the fight bot shouted the Pen down before it attacked: 0 volleys in 60 s.)
- `docs/level3/bot/ground_probe.mjs normal 1|3 60`: IDLE share 0.14 / 0.08, moves 7.7 / 6.7 per min, 4 / 4 hits.
- Screenshots (`docs/level3/bot/pen_round3_shots.mjs`, in `/tmp/wd-pen/shots`, looked at): `r3_sky_telegraph`,
  `r3_sky_landing`, `r3_sky_pen_spraying`, `r3_hush_smothers`, `r3_eraser_rubs_pool`, `r3_eraser_rubs_nib`,
  `r3_voice_en`, `r3_voice_zh`, `r3_voice_waver`, `r3_hud_{en,zh}_{1280,2000}`. The HUD shots force every low element
  on at once (a Pen line, FRENZY READY, the lock hint); measured boxes: no overlaps at 1280×720 and 2000×1060, en and zh.
- `npx tsc --noEmit -p .`: clean (whole project, at the time of the last check).
- **Full level 3, Gentle** (`docs/level3/bot/full.sh`, all walking): LEVEL COMPLETE, wall 816 s, game time 750 s, `__errs`
  empty. Fight: engaged 505 s → phase 2 645 s → phase 3 729 s → FINAL 806 s → complete 816 s. The first attempt
  lost its Chrome at 518 s (killed from outside, no crash in the log, as noted in SOULS.md); the rerun used Playwright's
  chrome-headless-shell on the same port. Log: `/tmp/wd-pen/logs/l3_full_gentle2.log`.
- Shots copied to `docs/level3/shots/r3_*.jpg` (+ `r3_hud_before_en_1280.jpg`: the bar over the Eye card, before).

## Status
| # | Job | Status |
|---|---|---|
| 1 | Sky attack: correction marks | done, measured, shots |
| 2 | Allies help | done, shots |
| 3 | Pen speaks | done, shots (en, zh, waver) |
| 4 | HUD bottom layout | done, measured, shots |
| 5 | Ground idle gaps | done (× SOULS.tell, shorter on Normal), measured |
| 6 | Full level-3 Gentle run | PASS (LEVEL COMPLETE, no errors) |

## Not verified
- Sound (Chrome muted). Touch layout in the fight (the cards move to the top there; not shot). Hard difficulty marks.
- A human playtest: whether the marks' tell reads at a glance, whether the shout window (only while it attacks) feels
  fair to a child on Gentle.
- The co-op partner in the sky phase: `coop/Companion.ts` does not list the new state `MARKS` (not touched: shared file).
- The ENCORE "before" overlap was found by reading the CSS + layout boxes; the before shot shows the bar over the cards,
  not the badge (no TAG had happened in that shot).
