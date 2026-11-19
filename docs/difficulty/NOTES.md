# Difficulty — notes

## 2026-11-18 playability update

Normal uses the previous Gentle tuning. Hard uses the previous Normal tuning.
The stored difficulty selection keeps its current label.

| Rule | Gentle | Normal | Hard |
|---|---:|---:|---:|
| Creature corruption multiplier | 0.90 | 1.30 | 1.50 |
| Boss corruption multiplier | 1.00 | 1.20 | 1.35 |
| Boss tempo multiplier | 0.86 | 1.00 | 1.12 |
| Invulnerability after a hit (s) | 1.40 | 1.10 | 0.90 |
| Healing multiplier | 1.20 | 1.00 | 0.75 |
| Boss progress after a smudge | Keep | Keep | Restart |

Gentle also extends Red Pen attack warnings and recovery openings. It grants more stamina and fewer correction marks.
Red Pen retries preserve the current act and exact remaining health on Gentle and Normal.
Other bosses stay in their current fight state on both difficulties.
`src/meta/Difficulty.ts` contains the tuning for all three platforms.

## Round 3 (2026-11-14): historical tuning

> The author: today's Gentle lets WAI hit too hard (the TAG ×1.4), so it is out of balance.
> Decided: new Gentle takes the old Normal values for WAI's punch and the enemies' paint; Normal is a little tougher
> and a smudge restarts the boss fight at full paint; Hard restarts too, with tougher, faster bosses.
> **Interpretation (not the author's words):** the enemies' bite on Gentle (hit cost, blink, healing, tempo, swarm)
> stays at the old Gentle values. Reason: the complaint was only about WAI's output, and the regression shows old
> Normal costs the bot ≈ 56 hits / 10 smudges on the Eraser climb against ≈ 20 / 3 on Gentle.

### The table, old → new (src/meta/Difficulty.ts)

| lever | Gentle | Normal | Hard |
|---|---|---|---|
| light hit extra (half hearts) | 0 | 0 | 1 |
| heavy hit extra | 0 | 1 | 1 |
| blink after a hit (s) | 1.1 | 0.9 | 0.8 |
| healing share | 1 | 0.75 | 0.5 |
| creature paint (× base) | **1 → 1.3** | **1.3 → 1.5** | **1.6 → 1.7** |
| boss / mid-boss paint | **1 → 1.2** | **1.2 → 1.35** | **1.3 → 1.5** |
| creature tempo | 1 | 1.12 | 1.2 |
| boss tempo (new row `bossTempo`; was = tempo) | 1 | 1.12 | **1.2 → 1.3** |
| swarm | 1 | 1.5 | 2 |
| TAG / ENCORE (`tagMul`) | **1.4 → 1** | 1 | 0.75 |
| PAINT SLAM (`slam`) | **1.15 → 1** | 1 | 0.85 |
| smudge restarts the boss fight (new row `bossReset`) | no | **yes** | **yes** |
| Red Pen paint (`SOULS.penHp`, × bossPaint) | **0.8 → 1** | 1 | 1.15 |
| Red Pen smudge (`SOULS.phaseCheckpoint`, = !bossReset) | resume at the act reached | from act 1 | from act 1 |
| Red Pen sky marks (`SOULS.inkMarks`, another agent's new row) | 2 | 3 | 4 |
| Stamp Press (`STAMP`) | unchanged | unchanged | unchanged |
| Ruler Snake (`RULER`, another agent's new rows: reach / tell / rest / cd) | 7 m / 1.15 / 1.6 / 2.4 s | 8 / 1.0 / 1.4 / 2.0 | 9 / 0.9 / 1.25 / 1.7 |
| Compass Spinner (`COMPASS`, another agent's: plant / turn / margin / cd) | 1.0 / 2.2 / 1.6 / 1.8 | 0.9 / 1.9 / 1.8 / 1.5 | 0.8 / 1.7 / 2.0 / 1.2 |

RULER and COMPASS arrived already graded per difficulty: kept as their agent set them. Resulting Red Pen paint (base 6500): Gentle 5200 → 7800, Normal 7800 → 8775, Hard 9717 → 11213.
New Gentle = old Normal for every WAI-output and enemy-paint row. New Normal = new Gentle +15 % creature paint,
+12.5 % boss paint (one step), old Normal's bite. Hard creatures +6 % over old Hard; Hard bosses +11 % paint over
Normal, +16 % over old Hard, and their clock 1.3 (attacks come ≈ 8 % sooner than old Hard).
Player-facing lines (en in DIFFICULTY_TEXT, zh in src/i18n/zhDifficulty.ts):
- CRAYON: "Soft hits, lots of hearts back. Get smudged and the boss fight goes on where you left it."
- MARKER: "Creatures are tougher and hit harder. Get smudged and the boss gets its paint back."
- PERMANENT MARKER: "Every hit hurts, bosses are tough and fast. Get smudged and the boss gets its paint back."

### The restart rule (one mechanism)

- `src/level/FightReset.ts`: at the smudge each session calls `smudged(enemies, pos)`; it notes the live boss fight
  nearest WAI (BossMood.bossInFight: base paint ≥ 1000, engaged, awake, ≤ 32 m) when `bossReset` is on. At the
  respawn the session calls `respawn()` → that boss's `EnemyBase.resetFight()`. Falls and pit drops are not smudges:
  no restart.
- `EnemyBase.resetFight()`: the subclass `restartFight()` (first phase, gates, timers, tells, hazards, helper), then
  reels / TAG / stagger quarters cleared, the `onFightReset` hook (session: summons; director: arena marks), and the
  corruption flows back to full over `REFILL_SEC` = 1.4 s (eased; AI paused; paint slides off). The boss bar and the
  repaint colours visibly refill; a red "GOOD AS NEW!" comic over the boss and a toast "{name} got all its paint
  back — the fight starts over!" say what happened. Once-flags (`awake`, `woke`, `introduced`) are not reset: intro
  cut-ins never replay.
- Cleared creatures stay cleared on every difficulty (nothing respawns them; only the lost fight's boss restarts).

| boss | verdict | what the restart puts back |
|---|---|---|
| Eraser (L1 boss) | reset | gates ⅔ / ⅓, armour, tells, shockwave rings, crumbs in flight; its grubs repainted (GameSession.repaintSummons); stays awake + alerted (no intro, music stays 'boss') |
| Red Inkwell (L1 mid-boss) | reset | phase 1, uncorked, lines / ink blobs gone, its White-out helper repainted, IDLE until WAI is back in the square (`woke` kept: no cut-in) |
| Hush (L2 boss) | reset | gates, veil back on, tells / rings / dust bombs gone, brood moths repainted (HarborSession.repaintBrood), stays awake |
| Red Gramophone (L2 mid-boss) | reset | phase 1, tells / sound waves gone, its crab helper repainted, the record's red X wiped (PierDirector → BandstandPier.hideRecordX), IDLE (`woke` kept) |
| Red Pen (L3 boss) | already had it | SoulsFight.respawn → RedPenBoss.restartAt(1) on Normal / Hard (allies hidden, stickers restored, hazards and sky cleared, no long intro: 1.6 s card); Gentle resumes at the act reached. Not touched here. |
| Archivist (L3) | not a fight | a Guardian host (Eye + shout), no boss bar, nothing to restart |

### Test kit problems (round 3)

- The assigned Chrome port 9395 was killed three times mid-run by an outside `pkill` (caught once in the process
  list at 00:17:47; parent process not identified; never this job). Runs moved to :9695 (docs/difficulty/round3/chrome.sh).
- `/tmp/wd-r3` belongs to another session; this job's files live in /tmp/wd-round3 (one early vite.log of mine was
  written to /tmp/wd-r3/vite.log before I noticed).
- The full level-1 walk did not finish on Gentle (Chomper over 90 s once, quarter tear stall once; agent C is changing
  level-1 stairs and guide arrows at the same time). The warp run covers both level-1 boss fights.

### Working log (round 3)

- Code: Difficulty.ts rows + lines; zhDifficulty.ts; EnemyBase.resetFight / restartFight / onFightReset / refill;
  restartFight in EraserBoss, HushBoss, RedInkwell, RedGramophone; FightReset.ts; one-line wiring in GameSession,
  HarborSession, WorksSession, PierDirector; BandstandPier.hideRecordX. tsc clean.
- Proof: see "Round 3 proof" below (filled in as runs finish).
- Test kit: docs/difficulty/round3/ (vite.mjs :5295 no HMR, chrome.sh :9395 profile /tmp/wd-round3-chrome,
  resetcheck.mjs, ttk.mjs); logs in /tmp/wd-round3/logs.

### Round 3 proof

Scripted restart check (`DIFF=… node docs/difficulty/round3/resetcheck.mjs`): each boss is damaged past its first
gate (≈ 40 %), given summons and hazards (Eraser: grubs, a crumb in flight, a shockwave ring; Inkwell: its helper,
3 ink blobs; Hush: a brood, Gramophone: its crab, the record X), then WAI's hearts are set to 0.

| boss | Normal: paint after | phase | leftovers | cut-ins since smudge | refill (0.35 s samples) | Gentle: paint after |
|---|---|---|---|---|---|---|
| Eraser | 41 % → 100 % | 2 → 1, gates 1 → 2 | grubs 2 → 0, crumbs 1 → 0, rings 1 → 0 | 0 | bar 55 → 80 → 98 → 100 | 41 % kept, phase 2 |
| Red Inkwell | 38 % → 100 % | 1 → 0 (first) | helper repainted, blobs 3 → 0, uncorked | 0; back in the square: fights again, wakes 1 → 1 | 48 → 70 → 95 → 100 (WAI at the checkpoint: no bar, toast) | 38 % kept, phase kept |
| Hush | 42 % → 100 % | 2 → 1, veil back | brood 1 → 0 | 0 | bar 53 → 78 → 98 → 100 | 42 % kept |
| Red Gramophone | 40 % → 100 % | 1 → 0 | crab repainted, record X off | 0; back on stage: fights, wakes 1 → 1 | 55 → 83 → 100 | 40 % kept, X kept |
| Red Pen (SoulsFight) | 66 % → 100 % | 2 → 1 | (SoulsFight) | 0 | instant (its own sheet) | resumes act 2 at 66 % |

Music after the restart: 'boss' for the Eraser and the Hush (WAI respawns in the arena), 'explore' for the
mid-bosses (WAI at the checkpoint) and 'boss' again once he is back. Hard (Eraser, Pen): same as Normal.
Toast each time: "… got all its paint back — the fight starts over!". `__errs` empty in every run.

Time-to-kill in the live code (`docs/difficulty/round3/ttk.mjs`; bare can, sustained body spray 28.6/s; "+ TAG" =
one TAG on every reel; Eraser phase gates and roars included; game seconds):

| row | Stapler, spray | Stapler, spray + TAG | Eraser, spray | Eraser, spray + TAG |
|---|---|---|---|---|
| old Gentle (paint 220 / 2100, TAG ×1.4) | 7.7 s | 2.7 s (2 TAGs = 65 % of it) | 76.8 s | 64.5 s (3 TAGs = 17 %) |
| **new Gentle** (286 / 2520, TAG ×1) | 10.0 s | 4.9 s (2 TAGs = 51 %) | 91.4 s | 80.9 s (3 TAGs = 12 %) |
| new Normal (330 / 2835) | 11.6 s | 5.7 s (51 %) | 102.4 s | 90.6 s (12 %) |
| new Hard (374 / 3150, TAG ×0.75) | 13.1 s | 5.7 s (3 TAGs, 57 %) | 113.5 s | 103.6 s (9 %) |

Reading: on new Gentle a TAG'd Stapler takes 1.8× as long as before (2.7 → 4.9 s) and two TAGs no longer
finish half of a 65 % repaint; the Eraser fight is 19–25 % longer. That is the old Normal, as asked.

Reading the Normal run: as expected, a bot that never dodges no longer wins by attrition; each smudge sends the
fight back to the start. That is the rule working, not a soft-lock (no errors, no stuck state; the fight restarts
cleanly every time). Not weakened for the bot. A player who dodges is the target audience for Normal.

Bot runs (docs/difficulty/bot/l1, English profile, Vite :5295, Chrome :9695 — see "Test kit problems"):

| run | result | game time | hits | smudges | notes |
|---|---|---|---|---|---|
| level 1 Gentle, full walk ×4 | not complete | — | — | — | 3 runs lost when the Chrome on :9395 was killed by an outside `pkill` (never this job's); 1 run: the Chomper took > 90 s, then the bot stuck at the quarter's tear (q-stapler-tear 141 s, 900 s cap) |
| level 1 Normal, warps (same) | not complete (bot loses by the restart rule) | 1170 s | 93 | 11 | quarter: Inkwell engaged at 123 s, 8 smudges, not repainted by the 900 s cap (3602 paint sprayed into a 1890-paint Inkwell: each smudge refilled it; the White-out took the bot 532 s from the front); Eraser (warp): not repainted in the bot's 240 s (2456 paint into 2835, 3 smudges, restarts) |
| level 1 Gentle, warps (quarter from the gate + summit) | **LEVEL COMPLETE**, `__errs` empty | 1073 s | 63 | 6 | Inkwell engaged → quarter cleared 179 s wall; then 550 s lost before the statue woke (bot walk, not a fight); Eraser 194 s, 29 hits / 5 smudges |

## Names

Drawing tools, softest to most permanent (the doodle world's voice). The plain word stays on each card.

| id | name | tag | zh |
|---|---|---|---|
| gentle | CRAYON | Gentle | 蜡笔 · 轻松 |
| normal | MARKER | Normal | 马克笔 · 普通 |
| hard | PERMANENT MARKER | Hard | 油性记号笔 · 困难 |

## The table (src/meta/Difficulty.ts)

| lever | Gentle | Normal | Hard | read by |
|---|---|---|---|---|
| light hit (base 1 half heart) | 1 | 1 | 2 | PlayerController.takeHit |
| heavy hit (base ≥ 2) | +0 | +1 | +1 | PlayerController.takeHit |
| blink after a hit (s) | 1.1 | 0.9 | 0.8 | PlayerController.takeHit |
| healing share | 1 | 0.75 | 0.5 | PlayerController.heal (drops, checkpoint refill, Leech, gadgets) |
| creature paint (× corruption) | 1 | 1.3 | 1.6 | EnemyBase (base corruption < 1000) |
| boss / mid-boss paint | 1 | 1.2 | 1.3 | EnemyBase (base corruption ≥ 1000) |
| creature tempo | 1 | 1.12 | 1.2 | EnemyBase.step → ai(dt × tempo) |
| swarm (grubs, moths per spot) | 1 | 1.5 | 2 | Swarm.swarmSpots ← sessions |

WAI has 6 half hearts (3 hearts). Respawn after a smudge is always a full refill (no death spiral).

## Why these levers, and why here

- **Damage** — hits are integers (half hearts). A multiplier would round 1 → 1 or 1 → 2 unpredictably,
  so the table adds whole half hearts: Normal makes the big swings (Mutant, Chomper, Eraser slams, Lamp beam)
  cost 1½ hearts; Hard makes every hit cost at least a full heart. Hazards (ink canal) use takeHit too, so they
  scale with it; a fall off the island stays −1 (it does not go through takeHit).
- **Recovery** — one "healing share" covers paint drops (+1 each), the first touch of a checkpoint (heal to full),
  Ink Leech and the Patch gadget. Fractions bank, so 0.75 = three half hearts per four drops, a checkpoint
  refills 4–5 of 6 on Normal and 3 of 6 on Hard. Respawn keeps its full refill and 2 s blink.
- **Toughness** — `maxHp = baseHp × paint`. Bosses get a smaller multiplier: they already gate phases and a fight
  that drags is not harder, only longer. Size rules keep reading `baseHp` (stagger at ≥ 150, TAG damage at ≥ 1000),
  so a Fog Jelly does not start staggering because it got tougher. The Red Inkwell and the Red Gramophone now
  gate their half-way roar on `maxHp × 0.5` (was the HP constant), so the gate stays at half on every level.
- **Tempo** — every creature's `ai()` gets `dt × tempo`: telegraphs, cooldowns, chases, lunges and its projectiles
  (Lobbed, SoundWave, crumbs, blots) all run faster together, so attack ranges and shapes stay exactly as drawn,
  only sooner. The shortest tells in the game are ≈0.5 s (Chomper TELL 0.55, crab/mutant 0.5); at 1.2 they are
  ≈0.42–0.46 s, still a clear wind-up. Kept at real time on purpose: knock-backs and stagger reels (WAI's openings),
  anything while the camera plays a cut-in (boss intros never start early), and every creature while it is in an
  OPENING state (EnemyBase.OPENINGS: STUCK, DAZED, DIZZY, TIRED, STRANDED, CHEW, TANGLED, FLIPPED, OPEN):
  harder means attacks come sooner, never shorter windows to punish them.
- **Teaching creatures** (`teaching`, set by the tutorial Peeping Lamps that hand out the Eye) keep their drawn
  toughness and tempo on every level; their hits still cost the difficulty's damage. Reason: on the first Hard
  run the bot died 59 times at the very first creature and never got the Eye.
- **Swarm** — extra grubs / moths stand beside an existing spawn point, only on ground level with it (raycast), so
  none spawns over the canal or off a roof. Exact counts are untouched where a count is a requirement: the grub
  nest wave (crown), the moth nest (crown: extras join group "extra"), the stair-guard moths. Brood moths count
  toward the Hush's brood cap, so the Hush summons fewer later. Eraser and Peeping Lamp summons go through the swarm.
- **Not changed** — puzzle and platforming requirements, checkpoint positions, gate crowds (crabs, staplers),
  hearts count, paint tank, player speed.

## A change mid-level

Applies at once: damage, blink, healing, tempo (read every step), toughness (each creature rescales maxHp and hp
by the same factor on its next step, so the painted-away share and boss phase gates hold).
From the next spawn: swarm extras.

## Where it is chosen

- First new game (no `wd.setup` in localStorage): ui/SetupScreen shows one screen — picture quality, colours, pen —
  with the three taped tool cards (ui/DifficultyPicker.difficultyCards, MARKER preselected; mouse, touch, arrows or a
  gamepad to pick, LET'S DRAW to go). It is shown once per device; later starts go straight into the game.
- Pause menu: "Difficulty" row (select) with the tool's one-liner under it.
- URL: `?difficulty=gentle|normal|hard` sets and stores it, and skips the setup screen. `?test` with nothing stored =
  Gentle without asking (the bots), and no setup screen either.

Screenshots: picker-en.jpg, picker-zh.jpg (the old standalone picker), pause-en.jpg, pause-zh.jpg; the setup screen:
docs/story/shots/round3/setup-{en,zh}.jpg.

## Bots

`docs/difficulty/bot/` — copies of the level-1 (l1/) and level-2 (l2/) bots on Vite :5194 / Chrome :9363
(`npx vite --config docs/difficulty/bot/vite.nohmr.mjs`). `DIFF=normal bash full.sh` picks the level; default gentle.
The original bots (level1-expansion, level2-expansion) now ask for `difficulty=gentle` explicitly.

## Stickers (run boons) — damage audit and trim (src/meta/Arsenal.ts)

How a run gets boons: one pick of 3 after each Guardian wakes (3 per level) plus one early pick, reset per level,
2 free re-rolls. So a level ends with **about 4 boons**.

Damage model (WeaponSystem): a bare Classic Can sprays 84 drops/s × 0.56 = **47/s** while the tank lasts
(140 paint, drain 20/s, refill 34/s after 0.4 s). Sustained over refills: **28.6/s**. Time-to-kill below is pure
body spray, sustained (weak points, TAGs and stomps shorten every row by the same share).
Typical creature: Stapler 220 (Gentle) / 286 (Normal). Boss: Eraser 2100 / 2520.

Boons that raise damage, directly or not:

| boon | rarity | effect before → after |
|---|---|---|
| Pressure Valve | common, stacks | paint power +15 % ×4 → **+10 % ×3** |
| Giant Splats | epic | paint power +25 % → **+15 %** (splats ×1.6 kept) |
| Twin Nozzle | epic | rate +35 %, drain −25 % → **rate +25 %, drain −15 %** |
| Quick Refill | common, stacks | refill +40 %, delay ×0.7 per stack → **+30 %, ×0.8** (sustain) |
| Deep Can | common, stacks | tank +25 % (unchanged: longer bursts, not more damage per second) |
| Bigger Boom | rare | bomb +25 % damage → **+15 %** (radius +35 % kept) |
| Golden Stamp (ENCORE) | legendary | unchanged: TAG follow-up stamps (4 % + 12 per stamp, slips give paint back) |
| Thirsty Brush / Spare Heart / Ghost Step | — | survival, not damage (unchanged) |

New: **BOON_DAMAGE_CAP = 1.6** — paint power × spray rate from boons never exceeds 1.6×.

| build | before: ×dps | before: creature G / N | before: Eraser G / N | after: ×dps | after: creature G / N | after: Eraser G / N |
|---|---|---|---|---|---|---|
| bare can | 1.00× | 7.7 / 10.0 s | 73 / 88 s | 1.00× | 7.7 / 10.0 s | 73 / 88 s |
| Pressure Valve ×1 | 1.15× | 6.7 / 8.7 s | 64 / 77 s | 1.10× | 7.0 / 9.1 s | 67 / 80 s |
| Pressure Valve at max (old ×4, new ×3) | 1.60× | 4.8 / 6.3 s | 46 / 55 s | 1.30× | 5.9 / 7.7 s | 57 / 68 s |
| Giant Splats | 1.25× | 6.2 / 8.0 s | 59 / 71 s | 1.15× | 6.7 / 8.7 s | 64 / 77 s |
| Twin Nozzle | 1.50× | 5.1 / 6.7 s | 49 / 59 s | 1.33× | 5.8 / 7.5 s | 55 / 66 s |
| Quick Refill ×3 | 1.28× | 6.0 / 7.8 s | 57 / 69 s | 1.23× | 6.3 / 8.1 s | 60 / 72 s |
| 4 picks: Pressure ×2 + Giant + Twin | 2.32× | 3.3 / 4.3 s | 32 / 38 s | 1.70× | 4.5 / 5.9 s | 43 / 52 s |
| 4 picks: Pressure ×2 + Twin + Refill | 2.15× | 3.6 / 4.7 s | 34 / 41 s | 1.73× | 4.4 / 5.8 s | 42 / 51 s |
| theoretical max: Pressure max + Giant + Twin + Refill ×3 | 3.38× | 2.3 / 3.0 s | 22 / 26 s | 2.04× | 3.8 / 4.9 s | 36 / 43 s |

Reading: before, four realistic picks cut every fight to ~0.43× (an Eraser repaint in 32 s of spraying) and the
common Pressure Valve alone stacked to 1.6×. After, the same build is 1.7×: clearly stronger than a bare can, but
fights keep about 60 % of their length. The trim applies on **every difficulty** (one set of sticker values):
a runaway stack is broken everywhere. Gentle changes with it, modestly: a bare can is untouched and a
single sticker loses 5–17 points of its bonus.

Re-roll pity rule (Arsenal.rollBoons, goldSeen): a level's stock of 2 re-rolls shows a gold boon at least once.
Re-rolls keep today's odds; if a re-rolled hand shows gold by luck (shown counts, picked or not) the rule is met.
When the LAST re-roll is spent and no re-rolled hand has shown gold, that hand holds one gold card at a random place.
"Gold" = legendary; if no legendary is left in the pool, the best rarity left (epic, rare, common). The first hand of
an offer is never touched. Once per stock: resetRun (each level) refills the stock and clears it; extra re-rolls,
if ever granted, only raise the stock and the guarantee fires on whichever re-roll empties it.
The button says "Re-roll (R) · last one · gold guaranteed" / "重抽（R）· 最后一次 · 保底出金" only when the next
re-roll carries the guarantee; otherwise "Re-roll (R) · N left". The guaranteed card wears a GUARANTEED / 保底
ribbon and a gold glow. Note: the only gold boon is the Golden Stamp (max 1). Once a run holds it, "gold" means epic.

## Bot evidence (level 1, walking bot that never dodges; game time)

| run | result | game time | hits | smudges | Inkwell fight | Eraser fight |
|---|---|---|---|---|---|---|
| old logged run (level1-expansion PROGRESS) | complete | 472 s | — | — | 73 s | 144 s |
| Gentle | complete | 522 s | 80 | 7 | 68 s | 206 s |
| Normal (v1 table) | complete | 667 s | 89 | 8 | 81 s | 78 s |
| Hard, full walk ×3 | stuck | — | — | 47–59 | — | — |
| Hard, warps (quarter + summit) | complete | 641 s from the gate | 67 | 14 | 183 s | 116 s |

Hard full runs: run 1 died 59× at the tutorial lamp (→ `teaching`); runs 2–3 got the Eye but failed the Chomper
(MOUTH) in 90 s — its CHEW opening shrank with tempo (→ OPENINGS keep real time); everything after cascades.
The bot sprays from the front, which the Chomper swallows: on Hard that fight is about getting behind it.

Gentle drift check (the 922 s level-1 run in docs/level3/PROGRESS.md): the Eraser fight, warp to the summit, same
bot, Gentle — pre-difficulty commit e15bbb3: 151 / 229 / 184 s; current code: 190 / 206 s and one 240 s cap-out at
7 % left; the full Gentle run: 206 s. Same spread: no drift. The bot's own 240 s cap is just inside this fight's
normal range (the old code needed 229 s once); the 922 s run was that cap plus a long Inkwell with smudges.
Gentle's table is all-neutral by construction (every lever = 1, extras = 0).

Where Normal was still a walk: for a bot that never dodges, Normal cost +11 % hits and one more smudge than Gentle;
the time went into paint (+28 %), not danger. Changes: blink 0.95 → 0.9 s, tempo 1.1 → 1.12, plus the sticker
trim (a 4-boon build no longer halves fights). Where Hard was unfair: the tutorial lamp and the Chomper's CHEW
window (fixed as above); the Inkwell fight ran 2.7× Gentle (183 s) → boss paint 1.4 → 1.3.
Not changed: Hard light hits cost a full heart. With 3 hearts that is 3 mistakes; respawn refills fully.

## Gold boons carry over (Arsenal.saveCarried / resetRun, localStorage wd.carried.v1)

Today (before): every level start and restart cleared all boons (resetRun); Progression stores only challenge
unlocks, cape skin and bests. Now: on `level:complete` the gold (legendary) boons WAI holds are saved; every
level start / restart clears boons and then gives the saved golds back at one stack each, with a toast
"Carried over from the last level: …" / "从上一关带过来了：…"; the pause ARSENAL's boon row lists them.
Rules chosen (simplest sound):
- Replaying an earlier level (level select / restart): you bring the golds you hold. A held boon is never offered
  (rollBoons skips maxed), so no duplicates and a level's gold is never granted twice.
- New game: there is no new-game button today; `Arsenal.clearCarried()` is the hook (a fresh save has none).
- Dying / respawning: unchanged (boons are not touched by a smudge).
- Only golds held at a level's END travel; a gold found and then the level restarted is lost, as today.
- A gold whose effect is per level: it is re-applied fresh at each level start (one stack), so it simply restarts.
- Bots: `?test` URLs neither load nor save carried golds unless the URL has `carry`.

Balance: the only gold boon is the Golden Stamp (ENCORE). Arriving with it changes damage little: each good stamp
after a TAG deals 1.2 % + 8 on a boss (≈33 on the Eraser, ≈56 on the Red Pen) and 4 % + 12 on a creature; a careful
player cashes out after ~1.6 stamps per TAG, ≈2 % of a boss per TAG. Its real effect is sustain: a ×3 cash-out
pays 6 paint drops = 6 half hearts × the healing share. So "arrives with 1 gold" ≈ fights −2–5 % on bosses
(only at TAG windows) and more healing in long fights. Level 3's Red Pen: same per-TAG numbers (pass on to the
agent rebuilding that fight; not tuned here).

## TAG and ENCORE stamp damage (src/combat/CombatDirector.ts → TAG_DMG)

Measured in the running game (`docs/difficulty/bot/tagmeasure.mjs`, Gentle), before the trim: one TAG took
**38–42 % of an ordinary creature's paint** and 5–8 % of a boss's. Worse, the TAG passed through the normal
damage path, so it
1. picked up weak-point multipliers (the Red Inkwell's mouth ×1.6 turned its 70 into **112**), and
2. **crossed a stagger quarter and started a new reel**, which the bot and any player can TAG again: TAG → reel
   → TAG. Two tags plus a few seconds of spray finished a Stapler, a crab or a lamp outright.
The author's guess was right on both counts.

Changes (one set of values for every level; Gentle keeps a small allowance, `tagMul` 1.15):
- A TAG and an ENCORE stamp now carry `tag: true`. EnemyBase then skips weak points (a fixed bite, never a
  multiplied one) and does not open a new reel when the hit crosses a quarter, so a TAG cannot chain into itself.
- Ordinary creature: **24 % + 40 → 20 % + 20** of paint. Boss / mid-boss (base ≥ 1000): **5 % → 4 %**.
- ENCORE stamp: creature **4 % + 12 → 3 % + 8**; boss **1.2 % + 8 → 0.8 % + 5**.
- ENCORE's shape is untouched: same odds, same multipliers, same window, same paint-drop payout and the same
  corruption given back on a slip (the payout is drops, i.e. healing, which was not out of line).

| creature | paint | TAG before | TAG after | stamp before | stamp after |
|---|---|---|---|---|---|
| Stapler | 220 | 93 (42 %) | 64 (29 %) | 21 (9 %) | 15 (7 %) |
| Chomper Bin / tutorial Lamp | 230 | 95 (41 %) | 66 (29 %) | 21 (9 %) | 15 (6 %) |
| Megaphone Crab | 240 | 98 (41 %) | 68 (28 %) | 22 (9 %) | 15 (6 %) |
| Ruler Snake | 260 | 102 (39 %) | 72 (28 %) | 22 (9 %) | 16 (6 %) |
| Compass Spinner | 280 | 107 (38 %) | 76 (27 %) | 23 (8 %) | 16 (6 %) |
| Stamp Press | 320 | 117 (37 %) | 84 (26 %) | 25 (8 %) | 18 (6 %) |
| Barker crab / rooftop Lamp | 505–520 | 161–165 (32 %) | 121–124 (24 %) | 32 (6 %) | 23 (5 %) |
| Crooked-Leg Mutant | 650 | 196 (30 %) | 150 (23 %) | 38 (6 %) | 28 (4 %) |
| Red Inkwell / Red Gramophone | 1400 | 70, **112 on the mouth** (5–8 %) | 56 (4 %) | 25 (2 %) | 16 (1 %) |
| Hush | 2000 | 100 (5 %) | 80 (4 %) | 32 (2 %) | 21 (1 %) |
| Eraser | 2100 | 105 (5 %) | 84 (4 %) | 33 (2 %) | 22 (1 %) |
| Red Pen (level 3, not tuned here) | 5200 | 260 (5 %) | 208 (4 %) | 70 (1 %) | 47 (1 %) |

(On Gentle multiply the "after" column by 1.15: a Stapler TAG is 74, an Eraser TAG 96.)

So: a reeling creature at full paint now needs **two openings plus spray** instead of one opening plus a chain;
one TAG still removes a quarter of it, which keeps the TAG the best single hit in the game. A boss opening is a
fifth smaller, and the Inkwell's mouth TAG is halved (112 → 56), which was the worst outlier.
A typical ENCORE cash-out (about 1.6 good stamps) adds ~11 % of a creature or ~1.5 % of a boss on top.

### Bot caveat found on the way: the bots never TAGged in Chinese

Every bot presses E only when the prompt matches `/TAG/`. In Chinese the prompt is "盖上涂鸦！". My screenshot
scripts left the bot Chrome profile in Chinese, so **all of today's earlier bot runs (Gentle 522 s, Normal, Hard,
the Eraser A/B) were TAG-free**: a damage tally (`bot/l1/tally.mjs`) over a Gentle quarter + Eraser run counted
0 TAGs and 100 % spray. That is why the Eraser took 190–230 s instead of the logged 144 s. The same trap
probably explains the 922 s level-1 run in docs/level3/PROGRESS.md. Fixed: the bots in docs/difficulty/bot,
docs/level1-expansion/bot and docs/level2-expansion/bot now match `/TAG|盖上涂鸦/`, and the bot profile is set to
English. docs/level3/bot/w3bot.mjs (another agent's) still has `/TAG/`.

## Verification with everything in (sticker trim, TAG trim, final table, openings, carry) — English bot profile

| run | result | game time | hits | smudges | Inkwell | Eraser |
|---|---|---|---|---|---|---|
| level 1 Gentle | complete, no errors | 565 s | 87 | 6 | 74 s | 166 s |
| level 2 Gentle | complete, no errors | 532 s | — | — | — | — |
| level 1 Normal | complete, no errors | 602 s | 106 | 12 | 131 s | 163 s |
| level 3 Gentle (copy of docs/level3/bot, incl. souls_brain.js) | complete, no errors | 579 s | — | — | roof → done ≈ 327 s (Red Pen, not tuned here) | — |

TAG share of each creature's repaint (damage tally), level 1:

| creature | Gentle | Normal |
|---|---|---|
| Stapler (STUCK = its designed TAG opening) | 78 % (3 TAGs each) | 58 % |
| Chomper | 42 % | 45 % |
| tutorial / rooftop Lamp | 4 % | 38 % |
| White-out Bottle | 0 % (3 TAGs landed on the front cap: blanked) | 17 % |
| Red Inkwell | 18 % | 8 % |
| Eraser | 5 % | 4 % |
| grubs | 0 % (too small to reel) | 0 % |

Carry check (`bot/carry.mjs`, `?test&carry`): level 1 complete holding the Golden Stamp → level 2 starts holding it,
ENCORE on, never offered again → reload: still held, toast shown once the HUD is back → clearCarried: gone. Pass.

## Author's play-test pass (TAG slope, PAINT SLAM, immovable bosses, mid-boss bugs, creature bars, co-op)

### TAG and ENCORE scale with difficulty (`tagMul`: Gentle 1.4 · Normal 1 · Hard 0.75)

The trim above made the TAG feel flat on Gentle. Now the punish follows the level, and so do ENCORE stamps.
The no-chain rule and the no-weak-point rule hold on every level. Measured (`bot/tagmeasure.mjs`):

| | Gentle | Normal | Hard |
|---|---|---|---|
| Stapler TAG | 90 of 220 (41 %) | 77 of 286 (27 %) | 68 of 352 (19 %) |
| Crooked-Leg Mutant TAG | 210 of 650 (32 %) | 189 of 845 (22 %) | 171 of 1040 (16 %) |
| boss / mid-boss TAG | 5.6 % | 4 % | 3 % |
| ENCORE stamp, creature / boss | 9 % / 1.1 % | 6 % / 0.8 % | 4 % / 0.6 % |

Feel: the TAG's hit-stop (0.16 s), shake (1.1), gold splats, crown burst and crash/splat sound are fixed values,
the same on every level. A TAG now also counts as a weak hit for the creature's reaction (flash, wobble, glow)
without multiplying its number; the trim had made it land like a plain spray hit.

### PAINT SLAM (`WeaponSystem.SLAM`, `slam` row: Gentle 1.15 · Normal 1 · Hard 0.85)

Before: 28 + 6 per metre dropped (≤ 3) = 46 to everything in a 2.9 m ring, multiplied by weak points, and as a
'stomp' it skipped the Gramophone's ×0.3 shake-off. One slam took 20 % of a Stapler or a Lamp, 44 % of a Chomper
(its back panel ×2.2), 77 % of a White-out Bottle (×2.5) and 3.3 % of a boss (a boss TAG, every second, with no
opening needed). A slam cycle is about 0.9 s, so that was ~50 paint/s against a bare can's 28.6/s sustained.
After: 12 + 4 per metre (≤ 3) = 24 on Normal (28 Gentle, 20 Hard), a fixed bite (no weak-point multiplier).
Stapler 8.4 %, Chomper 8 %, White-out 12 %, Inkwell 1.4 % on Normal: ~27 paint/s if chained, about a bare
can's sustained spray. It is still the opener (pops the Inkwell's cork, flips creatures, knocks small ones)
and the crowd tool (the ring), no longer the best damage in the game.

### Bosses cannot be shoved (`EnemyBase.immovable`, base paint ≥ 1000)

Why they moved: WAI's body never pushes a creature (kinematic bodies), but several hits call `knock()`: the
TAG's shove (`4 + (1 − bigness) × 6` m/s; 5.5 m/s on the Inkwell), the shout's sonic shove on anything without
its own shout rule, and slams on small ones. For immovable creatures `knock()` is now a shudder only. Their own
moves (move()) are untouched. Standing or bouncing on a boss's head (stomp bounces peak ~3.3 m over it) for
0.6 s makes it buck WAI off sideways (`SHOO!`, no damage). The co-op partner is never bucked off.
The Red Pen extends EnemyBase and has base paint ≥ 1000, so it inherits both rules; nothing extra is needed
unless its own body code moves it through something other than knock().

### Red Inkwell re-triggers (author's screenshot 11) — `bot/repro.mjs`

Cause: leaving the square reset `woke`, so every return (and every stomp on its head, which counts as leaving:
WAI is more than 3 m above its feet up there) replayed the wake cut-in and its hint. Standing on it: stomp →
alert → cut-in → "left" → reset → stomp… Fixes: the cut-in plays once per fight; standing on its head counts
as being in the square; EnemyBase bucks WAI off; the mid-boss intro camera frames the boss from 8 m out when
WAI is beside or above it (it used to shoot over his shoulder straight down at the lid).

| repro (Normal) | before | after |
|---|---|---|
| leave the square and come back ×3: wake cut-ins replayed | 3 | 0 |
| stand on its head 8 s: wake cut-ins | 9 | 0 |
| … WAI's state | bouncing for ever, fight reset to IDLE | bucked off after 0.6 s, lands 5 m out, fight goes on |
| … camera's lowest look direction (y) | −0.89 (straight down) | −0.18 |

### Red Gramophone stuck (author's screenshot 12)

The same reset bug: stepping off the bandstand (a BLARE knocks WAI 7 m/s) and back replayed the intro cut-in
(3 times in 3 returns; 0 now). A cut-in disables shouting, and the inhale (2.8 s) ran on underneath it, so
the breath that must be answered was spent while WAI could not shout: HUSH, muffled, repeat. That is the loop
the author saw. A big shout answers it from anywhere on the stage (front, 8 m out, behind: all DAZED in the
repro, before and after). Fixes: intro once; an inhale does not start while WAI is muffled or a cut-in is on
screen, and an inhale pauses while a cut-in plays; the hint says what stops him (Mouth not worn, MUFFLED, off
the bandstand) and where to stand; EnemyBase's watchdog cancels any wind-up (…_TELL, INHALE, AIM, BEAM) that
has run 15 s. Level 2's other wake-gated fights: the Hush and the Eraser never reset `awake`; the Guardians
are hosts (no state machine to stall).

### Creature bars (`src/render/CreatureBars.ts`)

One instanced batch per scene (one draw call), rebuilt in onBeforeRender, depth-tested (walls hide it), no DOM.
A wobbly inked capsule over the head: the magenta corruption shrinks from the right as the paint fills from the
left, like the boss bar. Quiet: it appears on a hit or while WAI aims at it, fades 3.2 s after the last hit, and
on the finish fills, turns gold, swells and pops in 0.75 s (the same moment the creature blooms "REPAINTED!").
Gold corruption = reeling (TAG it). Ticks at each quarter on creatures that reel (base ≥ 150).
Size: 68–128 px wide whatever the distance. Who gets one: base paint 60–999. Grubs (16) and small Hush moths
(50) get none (one stomp ends them: a bar each would be noise); big moths (80), Fog Jellies, every level-3
creature and the tutorial lamps get one; bosses keep their HUD bar.
Screenshots: bars-third / bars-group / bars-done, -plaza and -works.

### Co-op partner

There was no difficulty scaling tied to the partner anywhere (Difficulty, EnemyBase, CombatDirector, sessions,
src/coop): nothing to remove. Creatures only switch target to her (`Coop.targetFor`). Her damage is capped by
design: she never takes a creature past 90 % painted (WAI finishes it).
Her share, measured (`bot/l1/coop-share.sh`, Normal, rule brain, quarter + Eraser): **30 % of all paint**
(Eraser 34 %, Inkwell 21 %, Staplers 31 %, White-out 50 %, grubs 48 %). Just under a third: she helps a lot
without taking fights over. If the author wants her lighter, the lever is partner-side: PIP_SPRAY.repaint
(now 0.65 × WAI's per drop) or MOVES damages in src/coop/Moves.ts (e.g. 0.5 × for ~24 %), not the difficulty.

### State of the eight items (14 Nov)

| item | done | tested |
|---|---|---|
| 1 TAG by difficulty | yes | measured live per level (table above) |
| 2 PAINT SLAM | yes | measured live per level (table above) |
| 3 unshovable bosses | yes | repro: Inkwell did not move (0.03 m) while stood on / bucked; TAG/shout knock are shudders |
| 4 Red Inkwell re-trigger + camera | yes | repro before / after (table above) |
| 5 Red Gramophone soft-lock | yes | repro before / after; Gentle pier section rerun: Gramophone repainted in 112 s |
| 6 Hard level 1 | ran | see below |
| 7 creature bars | yes | screenshots bars-*-plaza / -works |
| 8 co-op scaling | none found | partner share 30 % on Normal |

Bot runs this pass (English profile, final values):
- level 1 Gentle full: complete, 549 s game time, 79 hits, 7 smudges, no errors.
- level 2 Gentle full: run 1 stalled at the carousel Fog Jelly (bot kept spraying it unseen, 900 s); the pier
  section alone then passed (Gramophone repainted, bridge down, 189 s); run 2 full: complete, 1108 s game time.
- level 1 Normal full: two runs ran out the quarter's 900 s inside the fight with the Inkwell (no errors, no
  stuck state); the quarter alone (warp) passed: Inkwell 140 s, quarter 371 s game time. Diagnosis with
  positions: the bot reaches the Inkwell, is smudged there several times, respawns before the tear and walks
  back. Before this pass it could jump onto the Inkwell's head and stomp it every bounce while the fight reset
  to IDLE under it (no attacks, a cork pop and 25 paint per bounce): that exploit carried the old Normal runs.
  Now the head counts as in the fight and bucks WAI off, so the bot has to fight it on the ground, which it
  does badly (it never dodges). Bot skill, not a soft-lock; a human dodging the lines is not affected.
- level 1 Hard (warps; the full walk dies at the Chomper as before): Inkwell repainted in 561 s, 13 smudges in
  the quarter; Eraser not beaten in the bot's 300 s (46 smudges in total). The bot never dodges: Hard's full-heart
  light hits plus the trimmed slam (the bot pops the Inkwell's cork with slams) make it a long fight for it.
