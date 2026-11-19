# Level 3 round 3 (2026-11-14): creature presence, the entrance shot, moiré

Author's notes after a playthrough. Three jobs:
1. The Ruler Snake and the Compass Spinner (and the other level-3 creatures, not the Stamp Press) get presence:
   a clear telegraph, an attack that lands on a player who ignores it, a sound and a screen effect with weight, a clear counter.
2. The opening shot flies through the sealed tower wall: the way in must read as a way in; WAI's arrival agrees.
3. Moiré on the title backdrop (the level-3 hall) at DPR 2: fix per surface at the source.

Test setup: Vite :5292 (`npx vite --config docs/level3/round3/vite.mjs`, no HMR), headless Chrome CDP :9392
(`bash docs/level3/round3/chrome.sh`, profile /tmp/wd-r3/chrome, English, muted). Bots with `WD_VITE=5292 WD_CDP=9392`.
Shots: docs/level3/round3/shots/. One bot at a time.

## Log
- Read CONTENT_PLAN, PROGRESS, difficulty NOTES, art-pass NOTES, RulerSnake, CompassSpinner, StampPress (slam), Difficulty, w3bot.

### Job 1 — creature presence (state at 00:07)
Findings (before, HEAD code, F1 yard, Gentle, `presence.mjs`):
- Ruler Snake: SNAP only from < 3 m, 1 half heart, little sound; its lunge ends at WAI's feet, WAI is knocked up and
  lands on the ruler → `stompCheck` counts a STOMP (70 paint) → a standing WAI repaints it by accident in 2 snaps.
- Compass Spinner: circle radius = WAI's distance, so it only scratches a WAI standing ON the line (1 half heart, a
  small crash sound); a moving player is rarely there.
Built:
- `Difficulty.ts`: RULER / COMPASS rows appended (reach, tell, hit, rest, cd / plant, turn, margin, hit, line, cd).
- `RulerSnake.ts`: the WHIP — rears, rules a red line through WAI up to `reach` (wall/drop/room-aware), ticks race down
  it with a speeding tick sound, aim locks 0.35 s before; then the whole ruler shoots flat along the line (0.2 s) through
  WAI (heavy hit, STRAIGHTENED!, screen strike mark, hitstop), a wooden CLACK + shake by distance + strike-through on the
  floor; then REST stretched out (whole ruler ×2 paint). Paint elsewhere ×0.6 (varnish). Stomp guard after its own hit;
  the base stops 0.6 m short of WAI (never ends under him); slides out from under him; repositions toward open floor.
- `CompassSpinner.ts`: the circle goes round WAI (radius = distance + margin), one turn of the pencil (scratch sound
  speeding up) CLOSES it: inside on foot = heavy hit (CORRECTED!, screen circle mark, ding + stamp + shake). Line on
  foot = light hit, knocked OUT. Fair circles only (a wall right behind WAI shrinks it or the compass backs off).
- `CompassLook.ts` closeFx, `RulerSnakeLook.ts` measureTicks/strikeLine, new `src/render/ScreenMarks.ts`.
- zh strings in `src/i18n/zhWorks.ts` (6 lines, round-3 block).
- Bot: `docs/level3/bot/w3bot.mjs` steps off the whip line (open side), runs/jumps out of the circle, paints the
  stretched-out ruler's middle.
- Compass fairness: a circle never runs through a wall behind WAI (radius shrinks to stay on the floor); if he would have
  < 0.8 m to get out, the compass walks round him (~4 m, 1.4 s, flips at a wall) until his way out runs along open floor.

### Job 2 — the entrance (state at 00:25)
Cause: main.ts's INTRO push-in flies from the title pose to the shoulder camera behind WAI at the spawn (0, 0, 18.6),
yaw π: that camera sits at z ≈ 22.9, OUTSIDE the south wall (inner face z 21.6) — the shot ends in the bricks' back.
Then the story cuts inside, the door "creaks open" onto solid brick (the wall was never cut), a pilaster stands in the
middle of the doorway, and WAI scales up out of the brick.
Fix (no main.ts edit): spawn moved to z 15.8 (the push-in now ends at z ≈ 20.7, inside: measured 4.3–4.9 m behind WAI); `floorShell` cuts a real
arched doorway (brick pieces + spandrels, world-aligned bricks; wall collider kept whole; no pilaster in it); outside
the door a landing (deck, two bollards), water and the moored paper boat (HarborArt model) — a group shown only while
the door is open; LimpWorks shows the sky + drawn city on F1 while the door is open. The intro: door opens, WAI steps off
onto the landing (seen through the doorway), two hops in, the door shuts behind him. Entry drop trail moved off the spawn.
A glazed fanlight with three spokes fills the round head over the 3.3 m leaves (the cut opening showed a black void there).
Found on the way: with the spawn nearer, THE LIMP noticed WAI and CHARGED him during the cutscene (pushed a frozen WAI
3 m). `WorksStory.arriving` + one condition in `WorksSession.step` hold every creature still until WAI is handed over
(shared file: 2 lines).

### Job 3 — moiré (state at 00:25)
Per surface (1:1 crops of the DPR-2 title): the "fine vertical lines" on the dark riveted panels are NORMAL-MAP
hairlines: Materials.normalFromTexture Sobels the colour canvas, so every 2–5 px streak and 1–3 px speckle became two
1-texel ridges, lit by the sun and the sky: sub-pixel bright lines that crawl at a distance. The ceiling used the box's
own 0..1 UVs (one 256 px plate over 40 m: the streaks became "rays"). The ruler texture had 1 cm ticks 1.6 px wide
(a comb at the pixel limit). The wire mesh is an alpha-test cut-out: mipmaps thin its alpha, patches vanish and the
weave beats against the pixel grid. The normal maps had anisotropy 1, the colour maps 8.
Fixes: soft relief canvases (seams, rivets, brick courses; blurred) as `userData.heightMap` for steel / steel dark /
brick, a blurred copy of the paint as relief for the grid and the ruler (brush relief kept, line ridges gone); streaks → soft 10–30 px bands; softer speckle; grid minor lines 2 px;
ruler 1024 px / m with 2 cm ticks 4 px wide; anisotropy 16 on colour and normal maps; world UVs on the ceilings; the
wire mesh is an anti-aliased cut-out that fades to a flat see-through tone when a diamond is under ~6 px (alpha to
coverage with MSAA, a fixed 4×4 screen door without).

## Proof
### Job 1 — hits in 30 s of game time, Gentle, F1 yard, one creature 5 m from WAI (`presence.mjs`, `matrix.sh`)
Raw lines: `round3/presence-before.jsonl` (HEAD worktree), `round3/presence-after.jsonl`. Hits / half hearts lost.
| creature | stands still | strolls, ignores it | dodges only (counter) | full counter (dodge + paint) |
|---|---|---|---|---|
| Ruler Snake before | 2 / 2, then it stomped itself to death on WAI | 6 / 6 | — | — |
| Ruler Snake after | 5 / 10 (STRAIGHTENED!) | 4 / 8 | 0 / 0 (5 whips stepped off) | 0 / 0, repainted |
| Compass before | 8 / 8 (SCRATCH!) | 6 / 6 | — | — |
| Compass after | 4 / 7 (CORRECTED! ×3) | 6 / 6 | 0 / 0 (4 circles escaped, jumps) | 0 / 0, toppled + repainted |
| Stamp Press (untouched) | 8 / 8 | | | |
| THE LIMP (level-1 Mutant, untouched) | 12 / 24 | | | |
Attack stills (slow motion): `round3/shots/attack-snake-{tell,lock,whip,rest}-after.jpg`, `attack-compass-{plant,spin,close,after}-after.jpg`.

### Job 2 — the opening every 0.3 s (`entrance.mjs`)
`round3/shots/entrance-{before,after}-{0to29,30to60}.jpg` + `-cams.json` (camera + WAI per frame). Before: frames 4–8 fly
through the door leaves and the wall to z 22.9 (outside), frame 9+ the door opens on bricks. After: the push-in ends at
z 20.7 (inside; inner wall face 21.6, door leaves 21.4), every camera of the shot is inside the hall; the open door shows
the sky and the drawn city, WAI waits on the landing (z 24) and hops in.

### Job 3 — moiré (`moire.mjs`, high tier, DPR pinned, no creatures in frame)
Pictures: `round3/shots/moire-<view>-1280x720-before-over-after.jpg`, `moire-<view>-2000x1060dpr2-before-over-after.jpg`
(views: title, titlebare, hall, shutter, pit), 1:1 crops `moire-title-dpr2-1to1-dockface-before-after.jpg`,
`moire-pit-dpr2-1to1-wiremesh-before-after.jpg`, frame-difference maps `shimmer-<view>-2000x1060dpr2-before-over-after.jpg`.
Shimmer = mean |frame A − frame B| (0–255) on the view's static surface for a ~1 px camera move (lower = steadier):
| view | 1280×720 @1 before → after | 2000×1060 @2 before → after |
|---|---|---|
| title (dock face + ruler beam) | 1.14 → 0.54 | 1.82 → 1.37 |
| hall (far brick, beam, ceiling) | 3.01 → 2.23 | 3.68 → 2.74 |
| lift's wire shutter + riveted wall | 1.87 → 1.73 | 2.81 → 2.40 |
| pit (stair-cage wire screens) | 2.68 → 1.29 | 3.64 → 3.30 |
Note: earlier metric runs were polluted by animated belts / rollers / creatures (and once by a snake whipping WAI);
the numbers above are the clean run.

### Full level-3 bot run (Gentle, all walking, no warps, the taught bot) — PASS
`docs/level3/bot/full.sh` with WD_VITE=5292 WD_CDP=9392; log `round3/bot-full-gentle.log`. Legs 29 s · lift 115 s · F2 123 s ·
Inspector 247 s · F3 254 s · Archivist 389 s · roof 396 s · Red Pen 403 s · phase 2 497 s · phase 3 584 s · FINAL 659 s ·
LEVEL COMPLETE 669 s wall; game time 614 s (was 387–414 s: the snakes and compasses now take real fighting), hp 6 at
the end, 2 falls, `__errs` []. The creatures were not weakened; the bot was taught the counters (w3bot.mjs).

## Left / not verified
- Sound not heard (Chrome muted); the sound layering is by code only.
- Normal / Hard not run; the RULER / COMPASS rows for them are first guesses (another agent retunes).
- Other art styles (desert / storybook / riso) not checked against the new textures.
- `w3_ruler` is shared with the Red Pen fight (RedPenHazards, SoulsArena: agent A): it now has 2 cm ticks, 1024 px.
- THE LIMP (the level-1 Crooked-Leg Mutant) is left as it is: it already hits hardest (12 hits / 24 half hearts in 30 s).
