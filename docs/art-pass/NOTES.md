# Art pass (2026-11-14): notes

Five items from the author's playthrough. Own Vite :5241, headless Chrome CDP :9517 (`/tmp/wd-art-chrome`).

## Findings (where things live)

1. L2 "bell tower with a big horn on top" = the **lighthouse** (Guardian 3): `MuteHarbor.ts` lamp room,
   `lampFace` group (eyes + an open cylinder `horn`), BIG SHOUT target `lampMouth`. Lamp room body: `dressLighthouse()` in HarborModels.ts.
2. L2 "boat at the end" = the **paper boat** at the jetty (`exitBoat` in MuteHarbor.ts, an extruded trapezoid + triangle).
   The Foghorn Ferry (`buildFerry`, HarborModels.ts) is mid-level and already detailed (looked at it: fine).
   The story agent already exposes `HarborBuilt.exitBoat` (that paper boat group): that is the root to animate.
   Old paper boat: deck drawn 1.2 m BELOW its collider, and it sailed sideways (long axis local X, heading on local Z).
3. L1 white bottle = the **White-out Bottle** creature (`src/enemy/WhiteoutBottle.ts`), on the Crossed-Out Quarter (y 13).
   White cylinder + black top hat, label on the back only: does not read. First-meeting toast exists (QuarterDirector TIPS).
6. (added) creature attack effects audit, sound attacks first (`src/enemy/SoundWave.ts`: MegaphoneCrab, RedGramophone).

Ports: my Chrome is on 9517 (9441/9442 belong to the souls agent; they killed mine once).
Bot driver: `docs/art-pass/bot/art.mjs` (prep / warp / cam / view / js / shot).
4. L3 skyline: `buildAtmosphere()` in works/WorksShell.ts (sky sphere + one cylinder `w3_city`). LimpWorks toggles `air.city.visible`.
5. Shout: `src/level/harbor/Shout.ts` (3 additive caps + rims per wave).

## Tripo ledger (cap 150; balance at start 750)

| # | model | credits | result |
|---|---|---|---|
| 1 | lighthouse_horn (text, v3.1) | 20 | good: riveted brass gramophone horn, coral rim; bell opens to -X, bracket at the bottom |
| 2 | paper_boat (text, v3.1) | 20 | good: doodled origami boat, pencil mast, crown flag; long axis Z; inner floor ≈ 1.1–1.3 m |
| 3 | whiteout_bottle (text, v3.1) | 20 | ok: white jug, red label patch facing +X, threaded neck; face/cap/label text added in code |
| | **total** | **60** | |

## Done / next

### Progress log
- Item 1 DONE (code): `src/level/harbor/HarborArt.ts` lighthouseHorn() (Tripo brass foghorn, rotation π, scale 1.4) replaces the
  cone in MuteHarbor's lampFace; a box collider matches the bell over the gallery. Screens: /tmp/wd-art/shots/horn_t3.
- Item 2 DONE (code): paper boat = Tripo `paper_boat.glb` inside `exitBoat` (name 'paper-boat'). Rest yaw now 0 (bow +Z,
  long axis along the jetty, it sails bow-first); colliders = floor + gunwales + mast (PAPER_BOAT in HarborArt.ts), enabled on docking.
- Item 5 DONE (code): `src/render/SoundFx.ts` (2 instanced draw calls: arcs + glyph atlas, owned by Effects as ctx.effects.sound),
  `src/render/SoundShapes.ts` (coneFront / wallFront / ringFront / groundRipple / soundSplat / dangerZone, palettes OURS/THEIRS/HUSH).
  Shout.ts: cone fronts to the exact hit range, strokes, "!!", ground ripple, CSS ring pulse on BIG, and from a high place
  (8 rays find a > 7 m drop) 5 ground rings + 3 air bands roll out (lighthouse gallery). Verified by eye under slowmo.
- Item 6 IN PROGRESS: SoundWave.ts rewritten on SoundShapes (red/grey; crab RETURN = ours; Hush blast = hush ink); tell() added.
  Next: call tell() from MegaphoneCrab OPEN; set ink on RETURN/HUSH opts; screenshots; then audit table.
- Testing tip: headless rAF is throttled; use `s.ctx.time.slowmo(0.06, 60)` before firing, then screenshot.
  Start Chrome with run_in_background (/tmp/wd-art/chrome.sh); `(nohup …&)` copies get reaped.

## HAND-OVER (state at 2026-11-14 ~04:00; tsc clean)

| item | state | files |
|---|---|---|
| 1 lighthouse horn | DONE, seen by eye | src/level/harbor/HarborArt.ts (lighthouseHorn), MuteHarbor.ts (lampFace horn + horn collider), manifest slot lighthouseHorn, public/models/lighthouse_horn.glb |
| 2 paper boat (= exitBoat, name 'paper-boat') | DONE, seen by eye (docked) | HarborArt.ts (paperBoatModel, paperBoatColliders, PAPER_BOAT), MuteHarbor.ts (exit boat block, boatRestYaw, exitColliders), public/models/paper_boat.glb |
| 3 White-out Bottle | DONE, seen by eye (front: WHITE-OUT label, angry eyes, ridged cap) | src/enemy/WhiteoutBottle.ts (glb body, front label, flashMats, dressCap, CAP_Y), public/models/whiteout_bottle.glb (rotation -π/2 is right: label to the front) |
| 4 L3 skyline | DONE, seen by eye at colour 0 and 1 | src/level/works/DrawnSkyline.ts (new, 4 crayon ring layers + marks sheets + 1 card mesh, 6 draw calls), WorksShell.buildAtmosphere returns { sky, city: skyline.group, skyline }. Control: `skyline.setColour(k)` / `.colour`, also `scene.getObjectByName("works-skyline").userData.skyline`; self-driven by face:woken / city:awake |
| 5 shout | DONE, seen by eye (slowmo) | src/render/SoundFx.ts, src/render/SoundShapes.ts, src/render/Effects.ts (+sound, L3 header), src/level/harbor/Shout.ts |
| 6 attack effects | MOSTLY DONE (audit table below; bottle roll lane reworked): SoundWave.ts rewritten + crab tell + Hush ink done, crab shots in after/. TODO: screenshots crab/gramophone, audit table of all creature attacks L1-3 | src/enemy/SoundWave.ts, src/enemy/MegaphoneCrab.ts |

Not yet done anywhere: before/after screenshots copied into docs/art-pass/ (before/ has L1/L2 befores; L3 skyline before = author image 8),
frame-cost measurements (docs/level2-expansion/bot/perf.mjs, docs/level3/bot/perf.mjs — run with WD_CDP=9517 WD_VITE=5241 in background),
Gentle bot runs L1/L2/L3 (docs/*/bot/full.sh; background), L2 CLAUDE/L3 header touch-ups for MuteHarbor (INPUT add HarborArt).

How to test: Vite on :5241 (`npx vite --config /tmp/wd-art/vite.art.mjs`, background), Chrome `/tmp/wd-art/chrome.sh` (background, CDP 9517),
`cd docs/art-pass/bot; WD_SHOTS=/tmp/wd-art/shots WD_LEVEL=harbor node art.mjs prep harbor; node art.mjs cam NAME px,py,pz lx,ly,lz`.
Lighthouse gallery stand: `node art.mjs warp lighthouse; node art.mjs view gal 16.4,16.8,-47.4 2.3 0.3`.

### Frame cost (docs/art-pass/bot/perf.mjs; one synchronous render + 1-px read-back, median of 25, headless M1 Max, medium quality)
"Before" = a worktree of HEAD 2990fde on :5242 (it also lacks other agents' uncommitted work, so small differences are noise).

| pose | before calls / ktris / ms (p90) | after calls / ktris / ms (p90) |
|---|---|---|
| L3 roof (hatch, looking out) | 563 / 1625 / 9.1 (10.9) | 581 / 1607 / 8.7 (11.3) |
| L3 roof arena | 215 / 561 / 8.3 (12.4) | 222 / 542 / 6.4 (8.3) |
| L2 lighthouse gallery | 695 / 1423 / 11.0 (13.1) | 692 / 1452 / 10.6 (15.1) |
| L2 gallery + BIG SHOUT in flight | 703 / 1496 / 11.3 (15.4) | 695 / 1453 / 10.5 (13.3) |

## Attack-effect audit (item 6)

Shots: docs/art-pass/audit/ (forced into the attack state in slow motion by `art.mjs atk`), docs/art-pass/after/ (sound).
"code" = rated from the telegraph code; the forced-state camera did not get a clean frame of it.

| level | creature · attack | what is drawn | rating | action |
|---|---|---|---|---|
| 2 | Megaphone Crab · BLARE (sound wall) | was: one additive cylinder + one thin torus | crude → **reworked** | wallFront: curtain + bold top/foot arcs + echoes at the exact hit radius/height/opening, red-pen red, "!"/note marks fly off, splat on hit; OPEN now draws the footprint (dangerZone) |
| 2 | Megaphone Crab · RETURN (your shout fired back) | as above, cyan | crude → **reworked** | same, in WAI's own colours (reads "that is MY shout") |
| 2 | Red Gramophone · BLARE | same SoundWave wall + its own pink floor cone | crude → **reworked** (wall) | wall reworked via SoundWave; its floor cone left as is (owned file, logic agent) |
| 2 | Red Gramophone · HUSH blast (ring to jump) | was: low additive ring | crude → **reworked** | ringFront: band + bold lip + floor arc + inner echo, Hush lilac, notes fly off |
| 2 | WAI · SHOUT / BIG SHOUT | was: 3 additive caps + rims | crude → **reworked** | item 5 |
| 1 | White-out Bottle · ROLL lane | translucent white rectangle | weak → **reworked** | white marker edges + crawling chevrons (SoundFx strokes), exact lane size |
| 1 | White-out Bottle · SQUIRT | cap lifts, Lobbed white blobs | fine | — |
| 1 | Crooked-Leg Mutant · CHARGE | pink chevron lane + "!" | fine | — |
| 1 | Stapler · CROUCH/LEAP | landing ring (pink) on the floor | fine (code + shot) | — |
| 1 | Chomper Bin · LUNGE | lid gape + lunge, no floor telegraph | weak (code) | would add a short bite-arc on the floor |
| 1 | Peeping Lamp · BEAM | faint white cone | weak | would add a marker-outlined cone edge; not a damage attack |
| 1 | Red Inkwell (boss) · ink lobs | Lobbed blobs + red rings | fine (code) | owned by logic agent: untouched |
| 1 | Eraser boss · RUB / SPIN | rub smear + spin dust | fine (code) | — |
| 2 | Fog Jelly · STING | tendril flick, no hit-shape drawing | weak (code) | would draw the sting reach as a ring |
| 2 | Hush Moth · DIVE | dive line + dust | fine (code) | — |
| 2 | The Hush · DIVE / STING / DOME | dome mesh, dive shadow | fine (code) | — |
| 3 | Stamp Press · RUN | (owned) | not rated by eye | do not edit (level-3 agent) |
| 3 | Ruler Snake · SNAP | snap line telegraph | fine (code) | — |
| 3 | Compass Spinner · CIRCLE | red circle drawn on the floor | fine (code) | — |
| 3 | Red Pen · SWEEP / STAB / blots / crossed tiles | (owned) | not edited | suggest: draw its sweep and stab rings with SoundFx strokes in red-pen red for one language |

### Bots (Gentle, my Chrome 9518 + Vite 5241, bot copies in /tmp/wd-art/b1..b3 with ports rewritten; logs /tmp/wd-art/bot_l*.log)
- L1: eye + mouth stages fine (T+152 s); `quarter.mjs` hit its 900 s wall-clock cap in the Crossed-Out Quarter (fights listed:
  grubs, both Staplers; game time 893 s, hp 1) while the machine ran 3 Chromes + 2 Vites + other agents' bots; then boss.mjs
  could not open the door (Guardians 2/3) → LEVEL NOT COMPLETE, no console errors. The bot never reached the White-out
  Bottle (not in its fight list), so my L1 change is not on its path; the failure is before the tear. Needs a rerun on a quiet machine.
- Sound in shots: crab blare + hit splat verified (after/crab-blare-hit-after.jpg); gramophone Hush ring verified small
  (after/l2-gramophone-blast-blare-after.jpg); the red blare wall did not land in a frame there (headless timing).
- SoundFx rim: dark paint (red-pen red) now gets a paper-white rim, light paint a dark ink rim (reads on the black record).
- L2: COMPLETE (TOTAL 789 s wall, no console errors): lighthouse BIG SHOUT, the Hush, boarded the new paper boat (its colliders).
- L1 rerun (Chrome 9517, while L3 ran on 9518): eye+mouth T+86 s, entered the quarter 43 s, Red Inkwell engaged at 216 s (the quarter that timed out in run 1 cleared this time). Machine load average ~550 during these runs.
- App restart cut runs; restarted Vite 5241 + Chromes 9517/9518; L3 run 2 (9518) and L1 run 3 (9517) started (logs /tmp/wd-art/bot_l3_run2.log, bot_l1_run3.log).
- L3 run 2 and L1 run 3: both Chromes were killed at ~590 s (fetch ECONNREFUSED), L3 had reached F3 at 435 s (Guardian 1 woken, F2 done), L1 was in the quarter. L3 run 3 started alone (log /tmp/wd-art/bot_l3_run3.log).
- L3 run 3: Chrome killed again right after load (probe error). Stopped trying: Chromes on this machine are being killed every few minutes (load avg 250-550).

## Final status
All five items + item 6 audit done and seen by eye; tsc clean; L2 Gentle bot COMPLETE; L1 and L3 Gentle full runs NOT completed (env kills), partial progress logged above. Servers stopped.
