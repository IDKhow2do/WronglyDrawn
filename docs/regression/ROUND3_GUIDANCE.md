# Round 3 — level 1 stairs, the no-Legs route, guidance in all three levels — working notes

Ports: Vite 5293 (no HMR, config /tmp/wd-g3/vite.mjs), headless Chrome CDP 9393 (profile /tmp/wd-g3/chrome, English,
muted). Test scripts and logs: /tmp/wd-g3. One bot at a time.

## Job 1 — the "S-shaped" jump stairs

### Which staircase it was

The author: after the long-legged creature (the Crooked-Leg Mutant in the workyard), "spray something full of paint and
stairs grow; three steps a bit like an S; jumping from the first toward the second, WAI's head hits the third".
That is the **ladder graffiti** on the workyard rooftop building (`tag-ladder`, BlindPlaza.ts). Its reward was three
0.9 × 0.9 m rungs against the building's front, at x 41.05:

| rung | top (m above the terrace) | z |
|---|---|---|
| 1 | 1.2 | −7.7 |
| 2 | 2.4 | −6.7 |
| 3 | 3.6 | −7.7 (straight over rung 1) |

Zigzag in z (the "S"), and rung 3 hangs 2.24 m over rung 1. WAI is 1.06 m tall and jumps 1.35 m: from rung 1 his head
reaches 1.2 + 1.35 + 1.06 = 3.61 m, the bottom of rung 3 is at 3.44 m. Measured before the fix (rung 1 → rung 2, W held,
Space): **0 of 20** (walk 10, run 10), all 20 hit their head, the jump apex was cut from 2.55 to 2.36 m.
The kiosk steps (commit 1ed81b3) were a different flight; the sky stairs too.

### Every jump-up flight in level 1

| flight | file | kind | before | after |
|---|---|---|---|---|
| ladder tag reward (workyard → rooftop) | BlindPlaza.ts | painted, appears when the ladder art is sprayed full | 3 rungs, zigzag, 1.2 m rises, rung 3 over rung 1 | 5 blocks east into the roof's edge, 0.75 m rises |
| sky stairs (plaza → cliff ledge, crown-arch) | BlindPlaza.ts | undrawn (True-Sight, or the painted eye tag) | 5 slabs, 1.1 m rises, diagonal, each turned 0.3 more | 6 blocks north into the ledge, 0.82 m rises |
| kiosk steps (Gate Yard, crown-kiosk) | plaza/CrossedQuarter.ts | undrawn | 3 slabs, 1.0 m rises, the 3rd under the roof slab's corner | 3 blocks south into the roof's north edge, 0.8 m rises, roof rail |
| lesson steps (harbor, first True-Sight lesson) | BlindPlaza.ts | undrawn | 2 boxes, 0.6 / 0.45 m rises, straight, 7 cm apart in plan | unchanged (measured) |
| not flights | | | island pads (flat stepping stones), canal bridge and quarter planks (walkways), shelf (one ledge reached by a spring), scaffold (a ramp after the mutant's charge), summit / harbor / tow stairs (walk-up stairs with nosing ramps) | |

One rule now builds the three rebuilt flights: `jumpFlight()` in src/level/JumpFlight.ts. Each step is a block standing
on the ground (nothing hangs over a step, no gap to fall through); the rise is the fewest jumps of at most
MAX_RISE = 0.63 × the base jump = 0.85 m; the run is straight, square to the landing's edge. A jump that carries too far
hits the next riser and drops back onto the step (that is what makes a held-W sprint safe). The kiosk roof is only
2 m deep, so it gets a knee-high rail on its three far sides.

### Stair tables (after the fix)

Test: /tmp/wd-g3/stair.js. `__WD.advance(1/60)` steps; enemies frozen; undrawn blocks kept seen with `u.see('test', 0.5)`
every frame (the sky stairs were run a second time with no test sight at all, held only by the painted eye tag).
WAI starts 2 m before the first riser (±0.3 m sideways), holds W along the run (Shift held for "run"), and taps Space
whenever he is grounded and 0.1–0.9 m (random each jump) from the next riser. Success = standing on the landing.

| flight | rise | blocks | landing | walk | run | head bumps | headroom over every step and the take-off spot |
|---|---|---|---|---|---|---|---|
| ladder tag steps (x 36.4 → 41.9, z −5.3, terrace 4.5 → roof 9.0) | 0.75 | 5 | roof | 10/10 | 10/10 | 0 | open sky (ray up 6 m) |
| sky stairs (x 5, z −9.7 → −16.3, plaza 1.5 → ledge 7.25) | 0.82 | 6 | ledge | 10/10 | 10/10 | 0 | open sky |
| sky stairs, painted eye only | 0.82 | 6 | ledge | 10/10 | 10/10 | 0 | — |
| kiosk steps (north of the kiosk, quarter 13 → roof 16.2) | 0.80 | 3 | roof (2 m) | 10/10 | 10/10 | 1 * | open sky |
| lesson steps (harbor, unchanged) | 0.60 / 0.45 | 2 | lesson-1 | 10/10 | 10/10 | 0 | — |

\* the one "bump" at a run was the Gate Yard Stapler (frozen for the test) standing on step 1's footprint; the static
headroom scan finds nothing over any step. Before the roof rail the kiosk run was 2/10: a running jump carried WAI over
the whole 2 m roof (the walk was 10/10).

Painted eye tag: after it is done, all six sky blocks turn solid with `seenBy = 'painted-eye'` while WAI stands far away
looking elsewhere (the gaze now aims at the flight's middle with a 42° half-angle; it was a fixed direction, 30°).

Side views: /tmp/wd-g3/shots/flight_ladder_side.jpg, flight_sky_side.jpg, flight_kiosk_side.jpg.

## Job 2 — level 1 without the Legs

Route reproduced from a `quarter` warp with Eye + Mouth only (no Legs): sunken lane → Gate Yard → tear → East Walk
(White-out Bottle, Peeping Lamp) → the East Walk's **crossed-out boards**, `CrossedQuarter.ts` line 356
`barricade([48.6, -24.4], [55.8, -24.4], 2.6, true)`. Its collider is board height + 0.4 m: the top is 3.0 m over the
street. Measured there (walk into it, jump at it):

| | feet reach | over? |
|---|---|---|
| no Legs (base jump 1.35 m) | 1.5 m | no |
| Legs worn (long jump 2.9 m) | 4.8 m | **yes** |
| Legs worn, sprinting | 3.9 m | yes |

So the Legs are a real second key to that wall; the sketched spring beside it (52.2, −27.4) is the intended one.
A player who skipped the Legs and never painted the spring had nothing to go on: the spring toast only fired within
6 m of the spring, and the objective hint named the Inkwell.

Fix (QuarterDirector.atWall, src/level/plaza/QuarterDirector.ts): while WAI stands on the East Walk south of the
boards, the director counts his jumps there and his dwell time. After **3 failed jumps or 25 s** it says, once, in
WAI's voice: *"That cross is too high for me… maybe if I could jump higher. Somebody in this city has longer legs."*
Nothing points at the workyard. Only if he is still at the wall after 60 s, within 7 m of the sketched spring, does
the old spring line follow. Proof: /tmp/wd-g3/shots/hint_no_legs.jpg (Leg card "not found", boards in front of WAI).

## Job 3 — guidance audit

### The one rule

`Guide.stuck` (src/ui/Guide.ts): the arrow's own goal is measured every frame; getting 2 m closer than ever before
resets the clock, and a fight, a story beat or a frozen session pauses it. After **STUCK_AFTER = 25 s** with no
progress, `stuck` turns true and the game offers help. The arrow is drawn only while `stuck`; `guide.target` is
computed every frame either way, so the test bots still read it (level 1 `bot.mjs` / `quarter.mjs` / `boss.mjs`,
level 2 `h2bot.mjs`, level 3 `w3bot.mjs` all read `session.guide.target`).

HarborGuide (level 2) and WorksGuide (level 3) extend Guide, so all three levels share it. The sessions ask
`guide.stuck` for the objective panel's hint line, and the directors get it as `stuck()` on their host interfaces.

### The table

"Verdict" is what this round did. Counts are pieces of guidance, not strings.

| # | where | what it says | when it showed | verdict |
|---|---|---|---|---|
| 1 | Guide arrow, all 3 levels | a bobbing arrow + screen-edge chevron with metres | always, every frame there was a goal | **delay**: only while stuck |
| 2 | objective panel hint, level 1 (`GameSession.objective`) | 8 "go here / do this" lines (cliff, chomper, gatehouse, quarter, statue, road, door) | always | **delay**: only while stuck. Exception kept: the first line of the game (the starter lamp's eye) |
| 3 | objective panel hint, level 1 | purify Eye / Mouth / Legs (hold Q / R / F) | always | **keep**: a control, not a direction |
| 4 | objective panel hint, level 1 | the Eraser's counter line while it fights | during the fight | **keep** |
| 5 | objective panel hint, level 2 (`HarborSession.objective`) | 10 lines (bin, bell, ferry, boats, forks, bridge, cocoon, stair, Hush, boat) | always | **delay**: only while stuck. Exception kept: the first line (the Chomper Bin's Mouth) |
| 6 | objective panel hint, level 2 | purify / recall the Mouth, the Hush's counter | always | **keep** |
| 7 | objective panel hint, level 3 (`WorksSession.objective` → `WorksDirector.hint`) | 14 lines (dock, belts, lift, pit, Inspector, stair, catalogue, Archivist, roof) | always | **delay**: only while stuck |
| 8 | objective panel hint, level 3 | recall Eye / Mouth, the Red Pen's counter, the souls-fight line | always | **keep** |
| 9 | level 1, QuarterDirector | "the road climbs to its second bend… a sunken lane runs east" | 10 s after the Gatehouse woke | **delay**: only while stuck and still outside the quarter |
| 10 | level 1, QuarterDirector | "A sketched spring! Spray it full…" | within 6 m of the spring | **delay**: only after 60 s at the wall, and only after #11 |
| 11 | level 1, QuarterDirector | NEW: "That cross is too high for me…" | — | **new**: 3 jumps and 12 s at the boards, or 25 s |
| 12 | level 1, QuarterDirector | creature tips (White-out Bottle, Stapler), first meeting | on first sight | **keep**: first use of a mechanic |
| 13 | level 1, GameSession | TRUE SIGHT lesson, new spray colour, TAG / purify prompts | first time | **keep** |
| 14 | level 1, GameSession | Guardian / road / crown / checkpoint / smudge feedback (18 toasts) | on the event | **keep**: feedback, not guidance |
| 15 | level 2, PierDirector | "The pier is broken! A walkway zigzags over the gap…" | on entering the walk | **delay**: stuck |
| 16 | level 2, PierDirector | "A sketched spring! …onto the bandstand" | within 6 m | **delay**: stuck |
| 17 | level 2, PierDirector | "A velvet rope! …repaint them first" | at the rope | **delay**: stuck |
| 18 | level 2, PierDirector | "Back in the Ticket Yard. Through the gate…" | on re-entering the yard | **delay**: stuck |
| 19 | level 2, PierDirector | caught shout / lost in the fog / too quiet | after a failed attempt | **keep**: it answers what just failed |
| 20 | level 2, HarborSession | lamp too quiet / lamp too far / cocoon needs a BIG SHOUT | after a failed attempt | **keep** |
| 21 | level 2, HarborSession + PierDirector | Guardian beats, bridge down, crabs repainted, forks humming (26 toasts) | on the event | **keep**: feedback |
| 22 | level 3, WorksDirector | "The Loading Dock is too high to jump — without LEGS" | on standing in the entry yard | **delay**: stuck |
| 23 | level 3, WorksDirector | the shredder-pit crossing | 7.6 s after the lift ride, always | **delay**: stuck, and only while east of the pit |
| 24 | level 3, WorksDirector | "The Inspector's yard… only a pencil sketch" | on entering the west yard | **delay**: stuck |
| 25 | level 3, WorksDirector | "The card catalogue is locked…" | on entering the Reading Room | **delay**: stuck |
| 26 | level 3, WorksDirector | LONG LEGS!, the stamp run's rules, the belts | first time in that place | **keep**: first use of a mechanic / an optional challenge's rules |
| 27 | level 3, WorksDirector | the Archive's children's drawings, the roof | on arrival | **keep**: story, not guidance |
| 28 | level 3, WorksDirector | CORRECT tape / Inspector busy / Archivist shaking | when a gate refuses you | **keep**: it answers what just failed |
| 29 | level 3, WorksDirector | into the SHREDDER (after a fall) | after the fall | **keep** |
| 30 | all levels | creature first-meeting TIPS | on first sight | **keep** |

Counts of guidance that can speak while the player is simply walking around:

| | level 1 | level 2 | level 3 | total |
|---|---|---|---|---|
| before | arrow + 8 hint lines + 2 nudges = 11 | arrow + 10 hint lines + 4 nudges = 15 | arrow + 14 hint lines + 5 nudges = 20 | 46 |
| after (unprompted) | 1 (the game's first line) | 1 (the game's first line) | 0 | **2** |
| after (once stuck for 25 s) | 11 + the new wall line | 15 | 20 | — |

Nothing was deleted outright: every line is still reachable, it just waits. Two English strings changed wording and
their zh twins changed with them (the ladder reward, the shredder-pit nudge); one new line has both languages.

### What changed in code

| file:line | change |
|---|---|
| src/level/JumpFlight.ts (new, 47 lines) | `jumpFlight()`, `MAX_RISE`: the one rule for a straight jump-up flight |
| src/level/BlindPlaza.ts:721 | the sky stairs become a `jumpFlight` (6 blocks, 0.82 m) |
| src/level/BlindPlaza.ts:946 | the ladder tag's reward becomes a `jumpFlight` (5 blocks, 0.75 m), toast reworded |
| src/level/BlindPlaza.ts:965 | the painted eye aims at the flight's middle, 42° (it was a fixed direction, 30°) |
| src/level/plaza/CrossedQuarter.ts:264 | the kiosk steps become a `jumpFlight` (3 blocks, 0.80 m) + a knee-high roof rail |
| src/ui/Guide.ts:23 | `STUCK_AFTER`, `watchProgress()`, `stuck`, `target` made public; the arrow waits for `stuck` |
| src/level/GameSession.ts:957 | level 1's objective hint waits for `stuck` (controls and the boss's counter do not) |
| src/level/GameSession.ts:262 | `stuck: () => this.guide.stuck` passed to QuarterDirector |
| src/level/plaza/QuarterDirector.ts:170 | the way-to-the-quarter line waits for `stuck` |
| src/level/plaza/QuarterDirector.ts:187 | `atWall()`: the new "jump higher" line, then the spring line much later |
| src/level/HarborSession.ts:236, 960 | `stuck` passed to PierDirector; level 2's objective hint waits for `stuck` |
| src/level/harbor/PierDirector.ts:168 | `stuckOnce()`; the gap / spring / rope / back nudges use it |
| src/level/works/WorksSession.ts:246, 691 | `stuck` passed to WorksDirector; level 3's director hint waits for `stuck` |
| src/level/works/WorksDirector.ts:156 | `stuckOnce()`; the dock / pit / west / reading nudges use it (the pit nudge moved out of the lift ride) |
| src/i18n/zh.ts | 1 new line (the wall thought), 1 reworded (the ladder), 5 missing level-2 pier lines added |
| src/i18n/zhWorks.ts | 1 reworded (the shredder pit) |

`npx tsc --noEmit -p .` clean after each step. No dead i18n keys (checked: every zh key still appears in src).

## Bot runs (Gentle, Vite 5293 / Chrome 9393)

Machine note: three other agents were building and running their own bots throughout; load averages sat at 17–33.
Run A of level 1 reached the Eraser at 80 % paint and then my headless Chrome was killed (GPU process exit 15,
`ECONNREFUSED` on 9393 for the last probe) — a machine failure, not a game one. Rerun as B.

### The bots' own channel

`w3bot.mjs` (level 3) branches on the hint text (`/lens is crossed out/`, `/can’t read/`), so hiding the line from
the HUD would have slowed it to a crawl. The sessions now keep the un-delayed line in `hintFull`
(src/level/Session.ts:94) and `WD_AGENT.observe()` reports that (src/agent/AgentBridge.ts:79). The HUD still obeys
the stuck rule. `session.guide.target` is likewise computed every frame.

### Level 1 Gentle, runs A–C (`docs/difficulty/bot/l1/full.sh`, logs /tmp/wd-g3/logs)

| run | how far it got | ended by |
|---|---|---|
| A | eye, mouth, quarter entered 51 s, Inkwell engaged 192 s, **quarter cleared 281 s, statue awake 314 s**, Eraser at 80 % paint | headless Chrome killed (CDP 9393 gone) |
| B | never started | the same Chrome was already dead |
| C | eye, mouth, quarter entered 57 s, spring painted, Inkwell engaged 435 s | Chrome killed again at the boss hand-off (23:55:24, Chrome's own updater/crash handler in /tmp/wd-g3/chrome.log) |
| boss leg 1 | from a `summit` warp: climbed the summit stairs by the arrow in 2 s, Eraser engaged, fought it from 100 % to 57 % paint over ~80 s | Chrome killed again |
| boss leg 2 | never got past the prep | Chrome killed within a minute (swap full) |

Run C also exercised the new wall line by itself: the bot jumped at the crossed-out boards four times while painting
the spring and the "jump higher" line fired (`toldHigher` true). It was slightly eager, so the rule now wants
3 jumps **and** 12 s at the boards (or 25 s), not 3 jumps alone.

Swap on this machine was 8.1 GB of 9.2 GB used with four agents at work; my headless Chrome was killed three times
(each time ~10 minutes in, twice during the Eraser fight). Retried at Quality 'low' in a 960×540 window.

### Smoke test of the plumbing (levels 2 and 3, in-page)

| level | `WD_AGENT.observe().hint` at the start | HUD hint | `guide.target` | after 30 s standing still |
|---|---|---|---|---|
| 2 (harbor) | "That bin on the landing has gobbled a Mouth…" | the same (the game's first line always shows) | (26, 3.4, 38) | idle 41 s, stuck, arrow back, target (21.9, 3, 38.2) |
| 3 (works) | "THE LIMP stomps about the entry yard with your Legs…" | "" (hidden until stuck) | (−2.2, 2, 17.9) | idle 0 — THE LIMP keeps the fight alive, so the clock stays paused, as designed |

No console errors in either.

### Level 2 Gentle (`docs/level2-expansion/bot/full.sh`)

Walked the whole first half by the guide data with no arrow on screen: Mouth purified, gate bell, ferry (Guardian 1),
the four boat legs on try 1, the clock square moths, the clock (Guardian 2) — `errs []` throughout. Then the pier:
EYE from the Lost & Found at 11 s, fog walk crossed at 82 s, the Red Gramophone engaged at 161 s, the pier cleared at
325 s and the Bell Bridge down at 331 s (`falls 0`, `errs []`), then the lighthouse leg.
The lighthouse leg then reached the lighthouse foot by the guide (20 s) and burst the dust cocoon, and Chrome was
killed a fourth time on the spiral climb. So level 2 is proven as far as: both early Guardians, the whole pier
chapter including the Red Gramophone, and the cocoon — never a game error (`errs []` at every checkpoint in the log),
but **not** a LEVEL COMPLETE. Level 3 was not run at all; only the in-page smoke test above covers it.

## Honest status

- Done and measured: the three rebuilt flights (10/10 walk and run each), the no-Legs hint, the shared stuck rule,
  every verdict in the table, `npx tsc --noEmit -p .` clean, both languages in step, no dead i18n keys.
- Not done: a Gentle bot run of any level that ends in LEVEL COMPLETE on this build. Four Chrome kills on a machine
  whose swap was full; every leg that did run was clean. Rerun when the machine is quiet:
  `npx vite --config /tmp/wd-g3/vite.mjs` (port 5293), `bash /tmp/wd-g3/chrome.sh` (CDP 9393), then
  `WD_CDP=9393 WD_VITE=5293 PORT=5293 DIFF=gentle bash docs/difficulty/bot/l1/full.sh` (and the level 2 / level 3
  equivalents).
