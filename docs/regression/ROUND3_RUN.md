# Round 3 final regression — working notes

> L3 notes | Parent: docs/REGRESSION.md
> [PROTOCOL]: Update this file on change, then check docs/REGRESSION.md

Date 2026-11-15 · HEAD ab95711 ("Round 3") · Vite :5271 (docs/regression/vite.mjs), headless Chrome :9371
(docs/regression/chrome.sh, English, muted). Logs /tmp/wd-reg/logs/*-R3*.log, shots /tmp/wd-reg/shots.
Spot-check scripts (new, this run): docs/regression/r3_ruler.mjs, r3_partner.mjs, r3_newgame.mjs.

## Log

- 01:25 load 9.2 on 10 cores: the user's own Chrome, the iOS simulator, the Claude app. Nothing of the bots'. Port 5188
  (author) left alone. Memory free 63 %.
- 01:26 L1 Gentle R3a started (`run.sh l1 gentle R3a` + poll). `npx tsc --noEmit -p .` exit 0.
- L1 R3a quarter: entered 52 s, then ~250 s wall on the East Walk: `q-lamp-walk` took 260 fight steps, WAI fell off
  the East Walk's open east edge at least once ("fell off the canvas", qb_264.jpg) and fell through the tear once
  (qb_224.jpg). Inkwell engaged 326 s, cleared 412 s, statue 450 s. Not a stall: slow. The last clean run had the
  same quarter wall time (54 → 457 s), so this is not new.
- 01:39 **L1 Gentle R3a PASS**: LEVEL COMPLETE, `__errs` [], wall 727 s, game 630 s (probe; quarter.mjs zeroes the
  clock at the quarter, as before), hits 94, smudges 7, load 9.6 → 9.4. Eraser 189 s wall (boss.mjs). No tear stall.
- `pkill -f poll.mjs` was refused by the permission check; the poller ends by itself after 25 min (≈ 01:52).
- 01:40 L2 Gentle R3a started.
- 01:51 **L2 Gentle R3a PASS**: Mute Harbor complete, `__errs` [], wall 692 s, game 507 s, hits 74, smudges 7,
  load 9.7 → 7.7. First half 143 s; pier 228 s (Gramophone 124 → 221 s, 0 falls); Hush fight 243 s wall. No gate stall.
- 01:52 L3 Gentle R3a started.
- 02:04 **L3 Gentle R3a PASS**: LEVEL COMPLETE incl. the Red Pen, `__errs` [], wall 706 s, game 644 s, hits 34,
  smudges 1, 1 fall, load 9.3 → 7.7. Legs 38, lift 115, Inspector 258, Archivist 445, roof 452, Pen 462 → ph2 552 →
  ph3 622 → FINAL 695 → complete 705 (Pen ≈ 243 s wall).
- Ruler spot check (r3_ruler.mjs, game loop frozen, 1/60 s steps): the knock works (hit → vy 7.3, 2.35 m along the
  sweep, feet 1.03 m up while the ruler's line crosses him; ruler top = floor + 0.71). BUT the ruler MESH lay along
  the sweep direction n (matrix long axis · n = −1; top-down `r3_ruler_topdown_before.jpg`, broadside side view
  `r3_ruler_side_033.jpg`): a 37 m bar sliding lengthwise through the arena centre, 90° off the invisible line that
  hits WAI. Cause: `rotation.y = atan2(n.x, n.z) + π/2` on a box whose long axis is local x (since 05851ca).
  **Fixed** (game, one line): `rotation.y = atan2(n.x, n.z)`; long axis · n = 0 after. Shots `r3_ruler_fixed_0{30,33,35}.jpg`.
- After the fix: phase 1 (9 m/s) clearance ≈ 0.3 m; phase 3 (12 m/s) the ruler reaches him at feet ≈ 0.75 m, a few cm
  over its 0.71 m top (brushes his feet); at the arena edge (15.8 m out) he flies to 16.93 m (R 17), stays on the
  roof and walks off the wall normally.
- Partner (r3_partner.mjs, rule brain, no key, no proxy): sky phase 60 s game: 11 marks landed, 0 on her, 0 on WAI,
  13 `mark` dodges, she stood on marked floor 63 of 3278 steps (≈ 1 s). Share: mutant 19.1 % (live peaks 21.8 %:
  FIGHT.headStart = 12 paint before the cap bites), Eraser 13.1 % (live ≤ 15.4 %); she sprays 19.8 of 20.6 s / 37.2 of
  40.1 s, 463 / 852 hits. Flood: 20 blots, on 0.7 → 4.2 s (3.5 s), cleared.
- Flood bug: the 2–4 original blue blots under the flood kept their pale highlight disc (#bfe0ff, `.coop-blot svg
  g:last-child`); only `.coop-flood` clones hid it. Two pale discs read clearly on the blue (seen in a 0.4 s shot).
  **Fixed** (style.css): every `.coop-blot` hides that disc (they only exist under a flood). After: `r3_flood_after_fix.png`.
  Left: the originals' faint drop-shadow outlines still show through the flood (cosmetic, not changed).
- New game without ?test, en + zh: title → setup → intro → SKIP → card → PLAYING, CDP errors [] both.
  Setup-screen bug: at the headless window's real viewport 1280×633 the heading "BEFORE YOU DRAW" sat above the top
  and could not be scrolled to (flex `justify-content: center` + `overflow-y: auto`; the ≤ 620 px media query already
  switched to flex-start). **Fixed** (setup.css): flex-start + auto margins on the first / last child. Heading visible.
- Build: tsc exit 0; `vite build` ok; dist 67 MB (du), JS 6.65 MB (one 6.65 MB chunk), gzip 2.42 MB (vite).
- 02:30 L3 Gentle R3b started (after the ruler fix).
- 02:48 **L3 Gentle R3b PASS** (after the ruler fix): wall 814 s, game 756 s, hits 35, smudges 2, 3 falls, `__errs` [],
  load 8.9 → 6.8. REGRESSION.md rewritten. Looper to-do: ~/Looper/todos/wrongly-drawn-regression-round3.md.
- 02:50 Found `git status` full of files I never touched: another session edited src/player, src/coop, EnemyBase,
  the sessions, … from 01:56 to ≥ 02:47 (mtimes). R3a runs loaded before 01:56 (HEAD). Spot checks, build and R3b had
  mixed code. Repeated every spot check + tsc + build on `/tmp/wd-reg/head` (git archive HEAD + my 3 diffs, Vite :5272):
  sky 10 marks / 0 on her; mutant 19.1 %, Eraser 14.4 %; flood 3.45 s, no dots; ruler p1 / p3 identical; new game en +
  zh clean; build 66.7 MB / JS 6.64 MB / gzip 2.42 MB. Servers :5271 :5272 :9371 stopped; :5188 untouched.
