# Stair fixes for levels 2 and 3 — working notes

Ports: Vite 5283, Chrome CDP 9383 (own profile /tmp/wd-st/chrome, English, muted). One bot at a time.
Probe: /tmp/wd-st/climb.mjs (stick 0.3 / 0.5 / 0.8 through WD_AGENT, keyboard W, Shift+W; game seconds from
`stats.time`; "top" = at the top height AND past a landing point; `down` runs the other way). Creatures near each
stair are disposed first. Logs: /tmp/wd-st/logs. Shots: /tmp/wd-st/shots (free.mjs renders from a free camera).

## Code

- Shared helper: `PhysicsWorld.addNosingRamp(pts, halfWidth)` (slabs along a polyline, tag 'static', handles kept
  for `isNosingRamp`). BlindPlaza's local `nosingRamp` is gone; its four ramps call the helper.
  Inner joints have no overrun: at a convex bend (slope → flat landing) the 4 cm overrun poked a ~2 cm lip over the
  flat leg, and that stalled stick 0.3 at the top of the pier stair.
- Level 3: `WorksKit.stairRamp(phys, stair, k0, k1)` — 6 cm over the nosings, starts on the floor 1.12 m before
  the foot, ends with a flat leg 6 cm over the landing. `stairs()` calls it whenever it builds colliders (stair 3:
  F3 k 0–12, roof k 12–18); `StampingFloor.drawStair` lays it for all 18 pencil-stair steps.
  No other stepped stairs in src/level/works (roof and arena are flat; the skyline's stairs are a painted backdrop).
- Level 2: `BandstandPier.stairway` lays a ramp 3 cm over its nosings; the flat leg runs 0.3 m onto the top deck
  (the round bandstand leaves a ~0.2 m gap behind the top step of the yard stair). Its foot is a short 33° leg
  (RAMP_FOOT 0.35 m before the first riser). The first version ran the nosing line down to the deck, 0.73 m in front
  of the carousel ramp; that reached past the carousel barricade (x −76.5), and two full bot runs wedged WAI at
  (−76, −90.5) between the barricade's end and the foot's side. With the short foot the third run completed.
- Level 2 jetty stair: the headland's ground mesh lay over the top 1.4 m of its ramp collider (a 0.8 m wall at
  x ≈ 22.5, visible as a block over the top steps): nobody could climb from the jetty, not even a sprint.
  `HarborTerrain.jettyStair()` is now the one source of the stair's ends; harborHeight() cuts the headland 35 cm
  under the ramp; the stair is 2 m longer (31° instead of 44°: on 44° the ground snap beats any walk < 1.45 m/s).
- Floating feet: on a 0.5 m-riser ramp WAI stood up to 0.57 m over the back of a tread (0.37 mid-tread).
  `PlayerController.treadBelowRamp()` (view only): standing on a nosing ramp, the model sinks onto the drawn tread
  under it. The body, the camera and the physics stay on the ramp.

## Measured (final code)

See the tables in the final report (logs l3-final, l2-after2, l2-jetty3, l2-spiral, l1-recheck).
- Slow stick on 0.5 m stairs (26.6°): ≈0.5 m/s up the slope. Cause: grounded vy −1.5 m/s projects against the
  slope. Not changed (global ground snap).
- Crab check (/tmp/wd-st/crab.mjs, log crab.log): phase 2 sent `p-crab-gramo`; the win repainted it
  (harmless, STUNNED → CALM, not disposed); 20 s next to it: 0 damage, `__errs` [].

## Final

- Full runs (Gentle, ports 5283 / 9383): level 2 complete (/tmp/wd-st/logs/l2-gentle-full3.log: wall 656 s, game 487 s,
  `__errs` []); level 3 LEVEL COMPLETE (/tmp/wd-st/logs/l3-gentle-full.log: wall 633 s, game 555 s, `__errs` [], one
  bot STUCK on F2 by the pit at (14.8, −16.1), away from the stairs, which it got out of). Level 2 runs 1 and 2 wedged at
  the carousel barricade (fixed by RAMP_FOOT, see above).
- `npx tsc --noEmit -p .` clean. Servers on 5283 / 9383 stopped. Nothing committed.
