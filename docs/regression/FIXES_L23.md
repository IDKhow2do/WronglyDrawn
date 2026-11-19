# Fixes for levels 2 and 3 (from docs/REGRESSION.md) — working notes

Ports: Vite 5282, Chrome CDP 9382 (own profile /tmp/wd-l23/chrome, English, muted). One bot at a time.

## Fix 1 — level 3, the Index compass leaves its room

- Existing leash: CompassSpinner / StampPress / RulerSnake CHASE drop to IDLE at 18 / 20 / 18 m from `home`, then
  IDLE wanders straight at a point near home (through the catalogue wall when outside). No room concept exists.
- Index = the only gated room on F3 with live creatures (compass-index, snake-index, press-index). Reading Room
  compasses cannot reach the Index while alive (the gate opens after they are repainted). F2 west yard: open floor.
- Plan: `HomeRoom` in EnemyBase (rect + door in/out points). move() never steps out of the room on its own feet;
  chase only while WAI is in the room (+6 m reach); outside the room IDLE walks to the door, then in.
- WorksRoute: goal node picked by sight first (a creature by the wall was snapped to the far-side node).

## Fix 2 — level 2, the arrow points at (26, 12) after the Mouth

- Cause: (26, 12) is the far end of HarborGuide's market↔east portal (`pb`). `HarborGuide.area()` asked
  `district()` first, and district() calls everything at x > 22 'east' (south of the lagoon), also the landing
  south of the sea wall. The Chomper Bin stands at (24, 38): WAI purifies the Mouth there, area = 'east', goal = the
  bell (market side, z 31.2) → BFS east→market → "walk to the portal's near end" = (26, 12), south through the halls.
  It flips to the bell once WAI drifts west of x 22 ("briefly").
- Fix: area() returns 'landing' for z > 32 before the east/market split (the sea wall seals z ≈ 31–33 from x −16 to 50).
- Test: docs/regression/l2arrow.mjs (100 ms page sampler around `h2bot.mjs mouth --walk`).

## Test results so far

- l2arrow (bot path, WAI purified at (11.9, 49.5)): 37 samples purification → gate, all at the bell. Not the bad spot.
- l2arrow 24 38 (purified beside the Chomper, the regression's spot): 38 samples, all (2, 31.2), area 'landing'.
  district(24, 38) = 'east' (the old classification). Logs /tmp/wd-l23/logs/l2-arrow*.log.
- l3room compass: phase A (WAI out to x −0.1 in the Reading Room) compass min x 11.97, gave up at 6 m; phase B
  (put at (9.6, 1.5)) walked (9.1, 2.4) → (8.5, 8.6) → (9.8, 9.0) → (12, 9) in ≈ 8 s, then CHASE/PLANT inside.
  Found: the arrow pointed at the compass through the wall while WAI saw the goal's node (g0) through the gate
  (`best === gn` returned the goal). Fixed: the goal only when WAI is at that node or sees the goal.
- l3room others: snake jammed on the jamb at (10.22, 8.63) turning toward home → homeward now walks right through to
  doorIn first and switches to "via door" in the doorway; snake then walked in. The press stays at (9.32, 10.24):
  its head capsule (r 0.82, top ≈ 3.1 m) does not fit under the screen over the gate (2.4 m). So the press can
  never leave (or re-enter) by the gate; the room clamp keeps it inside. Teleporting it out is not a game case.

## Status — done (nothing committed)

- Full runs after the last code change (ports 5282 / 9382, Gentle):
  - level 3: LEVEL COMPLETE, wall 466 s, game 414 s, F3 166 → 243 s (Archivist), `__errs` [] — /tmp/wd-l23/logs/l3-gentle-A.log
  - level 2: "Mute Harbor complete!", completed true, wall 565 s, game 450 s, `__errs` [] — /tmp/wd-l23/logs/l2-gentle-A.log
- `npx tsc --noEmit -p .` clean. Both servers stopped.
- Rerun the proofs: `node docs/level2-expansion/bot/prep.mjs harbor && node docs/regression/l2arrow.mjs 24 38`;
  `node docs/level3/bot/prep.mjs works && node docs/regression/l3room.mjs compass|others` (WD_CDP / WD_VITE set).
