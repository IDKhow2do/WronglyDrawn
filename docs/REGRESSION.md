# Regression — can each level still be completed? (round 3)

Date: 2026-11-15 · HEAD ab95711 ("Round 3") plus the three small fixes below (not committed) · load 8–12 on 10
cores throughout (the user's own Chrome, the iOS simulator and the Claude app; no other bots).
Working notes, minute by minute: `docs/regression/ROUND3_RUN.md`.

**Another session edited the working tree during this run** (not "alone"): from 01:56 to at least 02:47 it changed
src/player (PlayerController, new PlayBody), src/coop (Companion, Coop, Moves, Swagger, …, new AutoDodge, PipHealth,
PipLife, PipWorld, HeartTag, Places), EnemyBase, GameSession, HarborSession, Session, WorksSession, WorksDirector,
StampingFloor, Ambient, and added docs/whale/BODY.md and trailer/. I did not touch any of it. What that means here:
- The three R3a bot runs loaded their pages at 01:26, 01:40 and 01:52, before the first of those edits: they ran on
  HEAD. The L3 R3b rerun (02:34) ran on HEAD + my fix + that session's work in progress.
- Every spot check and the build were therefore repeated on a clean copy: `git archive HEAD` + only my three diffs in
  `/tmp/wd-reg/head`, Vite :5272 (`/tmp/wd-reg/head-vite.mjs`). The numbers below are from that copy unless marked.

## Setup (own ports, never :5188)

- Vite :5271, no HMR: `npx vite --config docs/regression/vite.mjs`
- headless Chrome :9371, English profile, muted: `bash docs/regression/chrome.sh` (stock Chrome 157; it was never
  killed this time, so chrome-headless-shell was not needed)
- One run: `bash docs/regression/run.sh l1|l2|l3 [gentle|normal] [tag]` → `/tmp/wd-reg/logs/<lv>-<diff>-<tag>.log`
- Bots: level 1 `docs/difficulty/bot/l1`, level 2 `docs/level2-expansion/bot`, level 3 `docs/level3/bot` (w3bot +
  souls_brain). No bot change was needed this round: they read `session.guide.target` (computed every frame) and
  `WD_AGENT.observe().hint` (= `hintFull`, the un-delayed line), so the 25 s stuck rule does not slow them.
- Spot checks (new): `docs/regression/r3_ruler.mjs`, `r3_partner.mjs`, `r3_newgame.mjs`. Shots: `/tmp/wd-reg/shots`.
- Stop: `lsof -ti tcp:5271 | xargs kill; lsof -ti tcp:9371 | xargs kill`

## Results — full walking runs, Gentle, one at a time

| level | difficulty | run | result | game time | hits | smudges | load start → end |
|---|---|---|---|---|---|---|---|
| 1 | Gentle | R3a | **PASS** (LEVEL COMPLETE, `__errs` empty; wall 727 s) | 630 s * | 94 | 7 | 9.6 → 9.4 |
| 2 | Gentle | R3a | **PASS** (Mute Harbor complete, `__errs` empty; wall 692 s) | 507 s | 74 | 7 | 9.7 → 7.7 |
| 3 | Gentle | R3a | **PASS** (LEVEL COMPLETE incl. the Red Pen, `__errs` empty; wall 706 s) | 644 s | 34 | 1 | 9.3 → 7.7 |
| 3 | Gentle | R3b (after the ruler fix; tree had the other session's WIP) | **PASS** (LEVEL COMPLETE incl. the Red Pen, `__errs` empty; wall 814 s) | 756 s | 35 | 2 | 8.9 → 6.8 |

\* level 1 game time is the probe's `stats.time`; `quarter.mjs` zeroes it on entering the quarter (as in every earlier
run), so the ≈ 50 s before the quarter are not in it.

Section times (wall s): level 1 — quarter entered 52, Red Inkwell engaged 326, cleared 412, statue 450; Eraser fight
189 s (`boss.mjs`). Level 2 — first half 143; pier: EYE 18, fog walk 66, Red Gramophone 124 → 221, bridge 228, 0 falls;
Hush 243 s. Level 3 — Legs 38, lift 115, Inspector 258, Archivist 445, roof 452, Red Pen 462 → phase 2 552 → phase 3
622 → FINAL 695 → complete 705 (Pen ≈ 243 s), 1 fall. R3b: Inspector at 404 (fights on F2 took longer), roof 527,
Pen 537 → phase 2 612 → phase 3 718 → complete 814, 3 falls, no STUCK / TIMEOUT line.

Reading against the last clean run (2026-11-14): every level still completes on Gentle. Hits are up (level 1 94 vs
63–75, level 2 74 vs 56) and fights are longer: that is the new Gentle (old Normal output and enemy paint), as asked.
The level-1 East Walk was slow (≈ 250 s from the quarter to the Inkwell: the Peeping Lamp took 260 fight steps, WAI fell
off the Walk's open east edge once and through the tear once), but the quarter's wall time equals the last clean
run's (52 → 450 s now, 54 → 457 s then). **No tear stall**; I did not reproduce the "stalled in the tear passage"
report. The level-2 bell gate and the level-3 Index passed without a stall.

## Spot checks

### a. The Red Pen's ruler sweep (`RULER_KNOCK = 22`) — knock OK; the ruler mesh was turned 90° · **game bug, fixed**

`r3_ruler.mjs`: WAI stands still 6 m from the arena centre; the game loop is frozen and stepped 1/60 s; one frame
per 0.1 s (`/tmp/wd-reg/logs/ruler-{p1,p3,edge}.log`; p1 and p3 repeated on the clean copy with the same numbers:
`ruler-head-{p1,p3}.log`). Floor y 27.00; the ruler's top is floor + 0.71 m.

| case | hit | WAI thrown | feet when the ruler's line crosses him | flown (xz) | end |
|---|---|---|---|---|---|
| phase 1, 9 m/s | t 3.0 s, −1 half heart | vy 7.3 m/s, along the sweep | ≈ 1.03 m (clear by ≈ 0.3 m) | 2.35 m | on the roof, 5.3 m from centre |
| phase 3, 12 m/s | t 2.6 s | same | ≈ 0.75 m (clear by a few cm: it brushes his feet) | 2.63 m | on the roof |
| at the edge, 15.8 m out | t 4.3 s | same, outward | ≈ 1.06 m | 2.2 m | stops at 16.93 m (R 17) against the rim, stays on the roof; walks off it normally (4 m in 1.5 s) |

He is thrown ahead and up and the line passes under him; he never left the arena and never stuck in the wall.

But the **ruler mesh lay along the sweep direction**, not across it: matrix long axis · `ruler.n` = −1. The 37 m bar
slid lengthwise through the arena centre while an invisible line square to it did the hitting
(`/tmp/wd-reg/shots/r3_ruler_topdown_before.jpg`, broadside `r3_ruler_side_033.jpg`). Cause: `rotation.y =
atan2(n.x, n.z) + π/2` on a box whose long axis is local x (since 05851ca, not this round). Fix
(`src/enemy/RedPenHazards.ts` `startRuler`, one line): `rotation.y = atan2(n.x, n.z)`; long axis · n = 0 after. Shots
after, a fixed camera down the ruler's long axis: `r3_ruler_fixed_030.jpg` (coming), `_033` (under him), `_035` (past).
The hit rule, the knock and the bots' `ruler` data are unchanged.

### b. The partner (rule brain; no LLM, no key, no `/api/coop` proxy; `.env.local` not touched)

| check | result |
|---|---|
| Pen sky phase, 60 s game time, fight bot as WAI (`r3_partner.mjs sky`) | clean copy: 10 marks landed, **0 on her**, 0 on WAI; 6 `mark` dodges (`Companion.autoDodge` → `hz.dangerAt`); she stood on marked floor 18 of 3266 steps (0.3 s). (Mixed tree: 11 / 0 / 0, 13 dodges, 63 steps.) Shots `/tmp/wd-reg/shots-head/r3_partner_sky_{0..3}.jpg` |
| share, Crooked-Leg Mutant, WAI 42 paint/s simulated (`share mutant`) | clean copy: fight report **19.1 %**; live share peaks 22.5 % mid-fight (FIGHT.headStart = 12 paint before the cap bites), under 20 % at the close. She sprays 20.1 of 20.6 s, 452 hits |
| share, Eraser boss (`share eraser 60`) | clean copy: fight report **14.4 %** (live ≤ 19.7 %); sprays 38.1 of 39.1 s, 900 hits. (Mixed tree: 13.1 %) |
| face-spray flood (`flood`) | clean copy: 20 blots cover the screen 0.75 → 4.2 s (**3.45 s**), then gone; `shots-head/r3_flood_*.jpg` |

Pale dots — **game bug, fixed**: the 2–4 original blue blots under the flood kept their pale highlight disc
(`.coop-blot svg g:last-child`, #bfe0ff); only the `.coop-flood` clones hid it, so two big pale discs showed on the
blue. Fix (`src/style.css`): every `.coop-blot` hides that disc (her blots only ever land under a flood). After:
`r3_flood_after_fix.png`, `shots-head/r3_flood_zoom_full.png` (clean copy). Left as is: the originals' faint drop-shadow outlines show through the flood (cosmetic).
"Visibly sprays": she emits every frame of the fight (counted), and the PiP reads "painting mutant"; my stills did not
catch her stream on screen (`r3_partner_spray_{0..2}.jpg`), so the visual part is by count, not by picture.

### c. New game from the title without `?test` (`r3_newgame.mjs en|zh`, localStorage of the test profile cleared)

| profile | flow | console / exceptions |
|---|---|---|
| English | TITLE → setup screen → LET'S DRAW → intro book → SKIP (after the 0.8 s arm) → level card → PLAYING; `wd.setup` 1, `wd.story` {"intro":1} | none |
| 中文 | same, `lang` zh-CN, setup text in Chinese | none |

Both repeated on the clean copy: same flow, no errors (`shots-head/r3_newgame_*`).

Shots `r3_newgame_{en,zh}_{1_title,2_setup,3_intro,4_card,5_playing}.jpg`. Setup screen — **game bug, fixed**: at the
headless window's real viewport (1280×633, a laptop browser's size) the heading "BEFORE YOU DRAW" sat above the top and
could not be scrolled to (`justify-content: center` with `overflow-y: auto`; the ≤ 620 px media query already used
flex-start). Fix (`src/ui/setup.css`): flex-start, centred by auto margins on the first / last child. The default pen
on a fresh profile is MARKER (Normal).

## Build

Clean copy (HEAD + my three fixes): `npx tsc --noEmit -p .` exit 0; `vite build` ok (only the old
INEFFECTIVE_DYNAMIC_IMPORT notes for GLTFLoader / meshopt). The main tree (with the other session's WIP) also passed
both at 02:28.

| | previous | now (clean copy) |
|---|---|---|
| dist total | 62 MB | 66.7 MB (`du`; tracked `public/` alone is 51 MB) |
| JS | 6.5 MB | 6.64 MB (one chunk, `index-*.js`) |
| JS gzip | 2.3 MB | 2.42 MB (vite's figure) |

## What I changed

- `src/enemy/RedPenHazards.ts`: the ruler mesh is turned square to the sweep (one line + L3 header line).
- `src/style.css`: no pale highlight disc on her blue blots.
- `src/ui/setup.css`: the setup screen scrolls from its heading when it is taller than the window.
- `docs/level3/SOULS.md`: one status-log line for the ruler.
- New: `docs/regression/r3_ruler.mjs`, `r3_partner.mjs`, `r3_newgame.mjs`, `ROUND3_RUN.md`; this file.
- No bot script needed a change. Nothing committed. My three diffs are only in those three files; the other modified
  and untracked files in `git status` belong to the other session.
- Test-only copy outside the repo: `/tmp/wd-reg/head` (HEAD + my diffs, `/tmp/wd-reg/my-fixes.diff`).

## Open (design questions, not changed)

- Phase 3 ruler (12 m/s): the line reaches WAI when his feet are only ≈ 4 cm over the ruler's top; it reads as
  brushing his feet. A slightly larger pop (vy) or a later hit point would clear it.
- The partner's live share can sit at 21–23 % mid-fight (the 12-paint head start); the closed fight is under 20 %.
- The faint outlines of the original blots under the flood.
- Carried over, still true: the East Walk's open east edge (WAI fell off it once this run); the Peeping Lamp on the
  East Walk is a long fight for the bot.

## Not verified

- Sound (Chrome muted). Normal / Hard full runs (not asked this round). The level outro's SKIP button. Gamepad.
- The partner's spray stream as a picture (counted only, see b).
- A full bot run on the clean copy after the ruler fix: R3b ran on the shared tree with the other session's work in
  progress. The fix only turns a mesh, so the R3a pass on HEAD stands for the game logic.
- The other session's changes themselves (player body, partner life / health, …): not part of this regression.

## Rerun

```
cd <local-path>
npx vite --config docs/regression/vite.mjs &      # :5271, no HMR
bash docs/regression/chrome.sh                   # :9371, English, muted
bash docs/regression/run.sh l1 gentle A          # log: /tmp/wd-reg/logs/l1-gentle-A.log
bash docs/regression/run.sh l2 gentle A
bash docs/regression/run.sh l3 gentle A
WD_CDP=9371 node docs/regression/poll.mjs > /tmp/wd-reg/logs/X-poll.log &   # optional level-1 section poll (25 min)
export WD_CDP=9371 WD_VITE=5271 WD_SHOTS=/tmp/wd-reg/shots
node docs/level3/bot/prep.mjs works && node docs/regression/r3_ruler.mjs p1 0 6 1      # prep before every case
node docs/regression/r3_partner.mjs prep works en && node docs/regression/r3_partner.mjs sky 60
node docs/regression/r3_partner.mjs prep plaza en && node docs/regression/r3_partner.mjs share mutant 42
node docs/regression/r3_partner.mjs flood && node docs/regression/r3_partner.mjs off
node docs/regression/r3_newgame.mjs en; node docs/regression/r3_newgame.mjs zh       # clears the test profile
lsof -ti tcp:5271 | xargs kill; lsof -ti tcp:9371 | xargs kill
```

## Previous run (2026-11-14, HEAD 4e05d0a)

All four required runs passed with the then-current bots: level 1 Gentle (620 s game, 75 hits, 5 smudges), level 2
Gentle (549 s, 56, 7), level 3 Gentle incl. the Red Pen (562 s, 40, 3), level 1 Normal (593 s, 116, 16). Every failure
was the bot, each fixed in the bot: level 2 stuck in the pocket before the bell gate (`h2bot.mjs` steps back onto the
landing), level 1 Normal 90 s behind the East Walk barricade (`quarter.mjs` uses the spring while south of it), level 1
Gentle stuck at the summit stairs (`boss.mjs` runs to the door), level 3 deadlock at the Index compass (`w3bot.mjs`
walks round through the catalogue gate). Game notes from then: summit stairs need ≈ 3.8 m/s (since fixed, 4d13958 /
fd4e9ef), Eraser grubs outliving the Eraser (fixed), the Inkwell waking over the barricade, the Index compass leaving
the Index, the level-2 arrow briefly pointing south.
