# Level 3 "Limp Works": progress log

Goal: a new ≈20-minute level inside the Correction Tower (level 1's ending walks into it, level 2's boat sails to it).
The Legs chapter. Content plan: docs/CONTENT_PLAN.md (level 3 row, "Level 3 outline", the three level-3 creatures).
Patterns: HarborSession / PierDirector / BandstandPier (level 2), the level-2 bot harness.

## Design (decided 2026-11-12)

### Fiction and look
- The Red Pen's factory of corrections: straight lines, blueprint grids, steel and red correction marks
  (crosses, circles, CORRECT stamps). Each Guardian woken washes its floor: red marks fade, the grey
  steel turns colourful. WAI arrives with the Eye and the Mouth (the plaza and the harbour can keep
  their own now); the Legs are on the first floor.
- Four floors stacked in one 44 × 44 m tower (inner walls at |x|, |z| = 21.6). Floor tops y = 0 / 9 / 18 / 27
  (under the co-op partner's NavGrid ceiling, NAV.top = 32). Slabs 0.6 m. Only the floor WAI (or the
  camera) is on is drawn (plus a neighbour near a stair or the lift): per-floor groups, batched per material.
- Windows show a painted city panorama (a backdrop ring outside the tower); the roof is open sky.
- Light: one hemisphere + ambient + one shadowed sun through the windows; walls, ceilings and slabs
  cast no shadow (the sun reaches inside). Interior haze fog. No point lights.

### Main path (progression order)
1. **F1 Conveyor Hall** (y 0). Entry yard by the tower door (cp-hall). THE LIMP, a Crooked-Leg Mutant,
   holds the **Legs** → purify (F) → Long Legs. The Loading Dock (a 2.6 m ledge) needs the long jump.
   Belt floor: two conveyor beds (they carry WAI) and **encounter 1: two Stamp Presses** in the stamping
   aisle (cp-belts). North strip: a third press guards the lift; a red CORRECT tape closes the lift until
   the belt floor is quiet. **Guardian 1, THE FREIGHT LIFT**: its legs were crossed out — lend it the Legs,
   it wakes, its cage climbs the shaft with WAI to F2, the Legs come back.
2. **F2 Stamping Floor** (y 9). Lift arrival (cp-stamp). East wall: the STAMP RUN (optional challenge,
   six automatic presses, sprint the lane unstamped → crown). Middle: the SHREDDER PIT, crossed on hanging
   crooked platforms (long jumps); **encounter 2: two Ruler Snakes** on the rims straighten the platform WAI
   is on (it falls). West yard (cp-pit): **encounter 2b: a Stamp Press + a Ruler Snake**. **Guardian 2, THE
   INSPECTOR** (a QC machine, its lens crossed out): lend it the Eye → it looks at the pencil-sketch stair
   along the west wall and the stair becomes real (permanent); the QC barrier lifts; the Eye comes back.
   Shortcut: a gangway drops over the pit.
3. **F3 Archive of crossed-out drawings** (y 18). Filing-shelf stacks, pinned drawings with red Xs. Reading
   Room: **encounter 3: two Compass Spinners**; a card-catalogue barrier to the Index opens when it is quiet
   (cp-archive, cp-index). The Index: **encounter 3b: Compass Spinner + Ruler Snake + Stamp Press**.
   **Guardian 3, THE ARCHIVIST** (a giant typewriter, eye and voice crossed out): lend it the Eye (it reads)
   and SHOUT into its speaking horn while it reads — Eye and Mouth together → it wakes, the roof stair's
   grille lifts.
4. **The Roof** (y 27, open sky, the drawn city all round, cp-roof). **THE RED PEN**, three phases (below).
5. After the fall: the finale beat, the closing line ("the city stays drawn wrong, and that is fine"),
   then the normal level-complete flow.

### Creatures (src/enemy, one player action each)
| Creature | Action | Tell | Counter |
|---|---|---|---|
| Stamp Press (`stamppress`) | run through it with long Legs | hand-wheel spins, ram winds up, red CORRECT outline (0.8 s), then 4 slamming hops | sprint UNDER the raised ram to its back → it is STUCK (ink pad ×2.5, TAG). Front paint ×0.3 |
| Ruler Snake (`rulersnake`) | paint it to bend it back | lies dead straight at a platform's root, red ticks run along it (2 s) → the platform straightens and falls; WHIP (round 3): rears, rules a red line through WAI (up to 7 m), ticks race down it (1.15 s, aim locks 0.35 s before), then the whole ruler shoots flat along it (heavy hit) | step off the line (or jump it), then paint it lying stretched out (×2); paint elsewhere ×0.6; at 50 % paint it is TOO BENDY to measure |
| Compass Spinner (`compass`) | get out of its circle, hit its needle | (round 3) plants its needle, preview circle 1.6 m wider than WAI's distance (1.0 s); one turn of the pencil (2.2 s) CLOSES it: inside on foot = heavy hit | run out over the undrawn part or JUMP the drawn line (stepping on it hurts); paint the needle (×3) → it TOPPLES (TAG) |

### Boss: THE RED PEN (`redpen`), the roof
> **2026-11-13 (later): the fight is now souls-like** — a 14 m Pen, stamina, lock-on, honest rolls, an ink gate,
> SMUDGED → run back. Design, moveset table, tuning and files: **docs/level3/SOULS.md**. The phase story below
> (Legs at 66 %, Mouth at 33 %, the Hush, the Eraser, the won-over ending) is unchanged; the moves are new.
Same character as level 2's sky Pen (red lathe barrel, dark grip, silver cone, cap with clip, two unimpressed
eyes). It crosses out WAI's stickers one at a time (the sticker card shows a red X; the ability is off).
- **Phase 1 "Red Ink"** (100 → 66 %, all stickers): ground duel. RULE: it rules a red line and a giant ruler
  sweeps across the roof — JUMP it. STAB: red ring under WAI, it dives nib-first — dodge, then the nib is
  STUCK in the roof (grip ×2.5, TAG). Outside STUCK paint ×0.35. At 66 % it CROSSES OUT THE LEGS.
- **Phase 2 "Crossed Out"** (66 → 33 %, no Legs): it flies high over the roof, drops ink blots (rings) and
  crosses out roof tiles (red X tiles hurt). THE HUSH returns: SHOUT at the Pen and the Hush wraps it in dust,
  it sinks to the roof DAZED (×2.5, TAG). At 33 % it CROSSES OUT THE MOUTH.
- **Phase 3 "Undrawn"** (33 → 4 %): it crosses ITSELF out — a pencil sketch, real only while seen. It goes for
  the Eye; THE ERASER bursts in, rubs the X off the Legs and blocks it. Aim with the Eye (True Sight) to make
  it real and paint it; rulers sweep faster (jump). At 4 % it falls nib-first, stuck: **the last hit is a TAG**.

### Side goals
- 12 crowns (3 F1, 4 F2, 4 F3, 1 roof), paint-drop trails on every leg of the route, checkpoints on every
  floor (cp-hall, cp-belts, cp-stamp, cp-pit, cp-archive, cp-index, cp-roof).
- Optional challenge: the STAMP RUN (F2). Shortcut: the pit gangway (F2).

### Story direction (author, 2026-11-13 — overrides the "defeat" reading)
- The Red Pen is a teacher's pen that only knows how to correct and believes it is helping. It speaks in that
  voice ("Hold still — just a small fix!"). Its tools (presses, rulers, compasses) think they help; repainted,
  they stop correcting (a toast says so once).
- The archive shows the crossed-out drawings are CHILDREN'S drawings (signed "by Mia, 6"…; sign "CHILDREN'S
  DRAWINGS — CORRECTED"; a toast on arrival).
- The end: the last TAG lends the Pen paint. No breaking, no shrinking: it stands, and for the first time it
  DRAWS — a wobbly colourful loop round the roof. Closing captions are warm.

## Log
- 2026-11-12: read the plan, both expansion logs, the harbor session/director/kit, enemies, coop NavGrid,
  bots. Design above. The three creatures were written by helper agents (one file pair each, tested in
  the harbor test bed): StampPress(+Look), RulerSnake(+Look), CompassSpinner(+CompassLook).

## Files
| File | What |
|---|---|
| `src/enemy/StampPress.ts`, `StampPressLook.ts` | creature 1 |
| `src/enemy/RulerSnake.ts`, `RulerSnakeLook.ts` | creature 2 (exports `Straightenable`) |
| `src/enemy/CompassSpinner.ts`, `CompassLook.ts` | creature 3 |
| `src/enemy/RedPenLook.ts`, `RedPenBoss.ts`, `RedPenAllies.ts` | the boss (model, brain, the Eraser + Hush helpers) |
| `src/level/works/WorksLayout.ts` | every layout number |
| `src/level/works/WorksTextures.ts`, `WorksKit.ts`, `WorksShell.ts` | canvases, modelling kit, tower shell + floor build context |
| `src/level/works/ConveyorHall.ts`, `StampingFloor.ts`, `Archive.ts`, `Roof.ts` | the four floors |
| `src/level/works/Guardians.ts` | Freight Lift, Inspector, Archivist |
| `src/level/works/LimpWorks.ts` | builds it all; floor culling |
| `src/level/works/WorksDirector.ts`, `WorksStory.ts`, `WorksGuide.ts`, `WorksHud.ts`, `WorksSession.ts` | gameplay, story, arrow, prompt/dev tables, the session |

- 2026-11-13: written: WorksLayout, WorksTextures, WorksKit, WorksShell, ConveyorHall, StampingFloor, Archive, Roof,
  Guardians, LimpWorks, WorksStory, WorksGuide (waypoint graph), WorksDirector, WorksSession, WorksHud; RedPenLook,
  RedPenAllies, RedPenBoss. Shared hooks done (see below). tsc clean. Not yet run in the browser.

- 2026-11-13 (resumed): first run in the browser. Fixes: textures registered before the atmosphere; the creatures
  borrow `h2_p_brass` (ensureKitTextures); `inPit` fired on F1 (y check); the Limp moved away from the spawn;
  the lift's face box was too small for the bot's lend; the F1 hopper's full collider made a floor INSIDE the
  pit at 8.4 m (now hollow: bottom plate + sides); the guide's line of sight now refuses lines over gaps.
- zh: `src/i18n/zhWorks.ts` (spread into ZH). `docs/level3/bot/i18ncheck.py` lists misses (none left in level-3 code).
- Bot: `docs/level3/bot/w3bot.mjs` (CDP, Chrome 9357 / Vite 5197). Run 1 (fresh): Legs at 31 s, belt presses
  cleared ≈70 s, then stuck lending to the lift (fixed). Run 2 (from `belts`): lift woken 42 s, F2 at 50 s,
  then stuck on the hopper top in the pit (fixed).

- Pit jump checked by script (`jumptest.mjs`): a Long-Legs sprint jump from the east rim (x 8.6) lands on
  platform A (x 0.8). The bot's falls came from jumping at platforms a snake had straightened (gone): it now
  waits on the rim; it no longer backs away from a snake in mid-air. City panorama moved to r 170, below the eye line.
- Regression copies of the level-1/2 bots with ports 5197/9357: /tmp/wd-l3/l1bot, /tmp/wd-l3/l2bot.

- Run 8 (from the `stamp` warp; one manual nudge onto stair 2, before the half-step fix): Inspector 115 s, F3 160 s,
  Archivist 242 s, roof 302 s, Red Pen 307 s → phase 2 356 s → phase 3 371 s → FINAL 391 s → LEVEL COMPLETE 401 s,
  no errors. Fixes from it: a 0.25 m half step at every stair foot (the 0.5 m first rise beat WAI's autostep);
  the guide walks stairs straight (steps hid the next node); platforms A and B lined up (no diagonal jump);
  the bot lets the spray can refill. The fight was short (95 s): Red Pen hp 3000 → 4000, DAZED ×2.5 → ×2.0.

- Full runs 1–3 (fresh, no warps): F1 + lift in ≈60 s game time every time; the pit crossing failed in the bot:
  it sprinted off a platform and its long-legged jump overshot the next platform into the pit (a human just hops).
  Platform B moved to x −4 (gaps: rim→A 4.05 m, A→B 2.7 m, B→rim 2.25 m). The bot now walks on platforms and
  keeps its take-off speed mode in the air.

## Full level-3 bot run (all walking, no warps) — PASS (run 4, 2026-11-13)
`docs/level3/bot/full.sh` (log: `docs/level3/bot/full-run.log`). Wall clock / milestones:
Legs 17 s · lift woken 59 s · F2 68 s · Inspector 187 s · F3 194 s · Archivist 328 s · roof 337 s · Red Pen 341 s ·
phase 2 382 s · phase 3 399 s · FINAL 414 s · LEVEL COMPLETE 425 s. **Game time 377 s**, 1/12 crowns (the bot skips
side goals), `window.__errs` empty.

## Perf (perf.mjs, headless Chrome, gameplay camera, 60 Hz cap: every pose at 16.6–16.7 ms/frame)
| pose | draw calls | k tris | floors drawn |
|---|---|---|---|
| F1 entry (whole hall in view) | 1293 | 1970 | F1 |
| F1 belts / lift | 660 / 646 | 1159 / 1099 | F1 |
| F2 lift / pit / west / stamp run | 273 / 587 / 461 / 335 | 1132–1267 | F2 |
| F3 arrive (by stair 2) / reading / index | 512 / 381 / 592 | 2141 / 1490 / 1680 | F2+F3 / F3 / F3 |
| Roof hatch / arena | 801 / 204 | 1841 / 369 | F3+roof / roof |
Most calls are creatures (5 stamp presses ≈ 110 meshes each incl. ink; their static frame is now merged with
batchStatic) and the paint drops; the floors themselves are ≈ 15–30 batched meshes each.

## Regression: level 1 (copy of docs/level1-expansion/bot on 5197/9357, /tmp/wd-l3/l1bot)
Pass with one caveat: full.sh ran Eye+Mouth 62 s → quarter 66 s → Inkwell engaged 117 s → quarter cleared 516 s
(the bot was smudged several times by the Inkwell) → statue 556 s → boss.mjs hit its own 240 s fight cap with the
Eraser at ≈45 %; a second `boss.mjs` pass on the same session finished it in 56 s → tower door → LEVEL COMPLETE,
game time 922 s, errors none. (Earlier logged run: 472 s.) Other sessions have uncommitted edits in EnemyBase /
CombatDirector / PlayerController / RedInkwell (difficulty work) — none of my level-3 edits touch level-1 code paths.

## Shared-file edits
- `src/level/Session.ts`: LevelId += 'works'.
- `src/level/levels.ts`: imports; `works` entry (num 3, title/victory poses); harbor.next = 'works' + its completeSub; LEVEL_ORDER.
- `src/organs/OrganInventory.ts`: `crossed` set; `worn()` is false for a crossed sticker.
- `src/ui/UI.ts` setCards: a crossed card gets class `crossed`, state "crossed out!".
- `src/style.css`: X help line shown in works too; `.card.crossed` red ✕.
- `src/ui/levelselect.css`: `.lv-works` card art fallback.
- `src/coop/Companion.ts`: ATTACK_STATES += TELL_RUN, RUN, SNAP_TELL, SNAP, PLANT, SPIN, CIRCLE, RULE_TELL, RULE, STAB_TELL, STAB, BLOT, TILE_TELL, CROSS.
- `src/meta/Progression.ts`: level:complete only bumps plaza/harbor challenges; `level` type += 'works'.
- `src/audio/Music.ts`: works' explore mood plays the 'danger' loop slowed to 0.86.
- `src/i18n/zh.ts`: imports ZH_WORKS and spreads it at the end (2 lines).
- `src/render/CameraController.ts`: `cineProbeUp` field (default 40, as before); WorksSession sets 1.5 and restores 40.
  Souls fight (SOULS.md): `extraDistance` / `extraHeight` fields (default 0) + an L3 header.
- Souls fight shared edits (SOULS.md): `src/player/PlayerController.ts` (`gate: PlayerGate | null`, null outside the fight),
  `src/player/WaiModel.ts` (souls actions, `ghost`, L3 header), `src/meta/Difficulty.ts` (`SOULS` rows appended),
  `src/ui/TouchControls.ts` (LOCK button, shown only in the fight), `public/models/wai2.glb` (+ `fall` clip).
- `public/assets/levels/works.webp`: new level-card picture (rendered in game).
- Playtest fixes (SOULS.md "Playtest fixes"): `src/render/CameraController.ts` (`guard` slot: a session's last push of the camera spot),
  `src/meta/Difficulty.ts` (`STAMP` rows appended), F1 tape / lift gate / QC arm / roof-stair grille now block to the ceiling.

## Done (2026-11-13)
- All floors, Guardians, creatures, boss (3 phases, won-over ending), story beats, guide, dev warps, zh strings
  (`src/i18n/zhWorks.ts`; i18ncheck.py shows no misses), level-select entry + card art (`public/assets/levels/works.webp`),
  whale partner checked following on F1/F2 (NavGrid from devInfo.bounds), cutscene camera checked inside (CameraController
  `cineProbeUp`: the ceiling no longer counts as the ground under a shot), screenshots in `docs/level3/shots/`.
- Full level-3 bot run PASS (run 4 above), level-2 regression PASS (539 s wall, game 417 s, complete, no errors),
  level-1 regression PASS (see above, needed a second boss.mjs pass).
- Bots now load with `difficulty=gentle` (other agents' difficulty work).

- FINAL full level-3 run (run 7, difficulty=gentle, all walking, no warps): Legs 17 s · lift 60 s · F2 68 s ·
  Inspector 169 s · F3 176 s · Archivist 310 s · roof 319 s · Red Pen 323 s · phase 2 373 s · phase 3 407 s ·
  FINAL 427 s · LEVEL COMPLETE 437 s wall; **game time 387 s**; `__errs` empty. Log: bot/full-run.log.
  (The bot used to lend its Eye to the Inspector before the yard was clear: refused → recalled → close-up, a loop.
  It now lends only when the hint asks.)

- 2026-11-14 (stairs, docs/regression/FIXES_STAIRS.md): stair 2 and stair 3 carry an invisible nosing ramp
  (`WorksKit.stairRamp`): before, a walk below a sprint stalled on the first full step. WAI's model sinks onto the drawn tread.

## Left
- Not verified: sound (Chrome muted), the other three art styles, touch controls, a human playtest.

- 2026-11-15 (round 3, docs/level3/ROUND3.md): the Ruler Snake's WHIP and the Compass Spinner's CLOSING CIRCLE (rows RULER /
  COMPASS in meta/Difficulty, screen marks in render/ScreenMarks), a real arched tower door with the landing, the boat and
  the sky behind it (the intro never leaves the hall; spawn z 16.6), anti-moiré textures / relief maps / wire-mesh shader.

- 2026-11-15 (author playtest: "stuck leaving the lift on F2, only a jump gets me out"): the cage's body is FIXED while it
  stands and kinematic only for the climb (`Guardians.buildLift`: `park()`). Cause: on a kinematic floor the character
  controller wedged WAI after a few steps (20 zero-time hits on the plate, movement 0); the same plate as a fixed body
  walks fine. Checked with a real ride (7.5 s): straight out 0 stuck frames; 7 start spots × walk / sprint and two
  diagonals all reach the F2 floor; walking back in works. Not changed: the 0.3 m plate step and the 0.4 m gap to the slab
  (not the cause). Not checked: other kinematic floors in levels 1 and 2.

- 2026-11-15 (author playtest: "the level 3 title view still has something in the way"): the title drift moved to the ROOF
  (`worksTitlePose`: the Red Pen right of the logo, the drawn city behind). On F1 the shredder hopper hangs across the whole
  hall and sat behind the logo from every spot. The push-in to WAI now starts from `worksIntroPose` inside the tower door
  (`LevelInfo.introPose`, a cut under the bursting title stickers; main.ts `introPose()`). Looked at: title at 1440×760,
  Start → chapter card in the hall. Phase 2 retune: docs/level3/SOULS.md.

