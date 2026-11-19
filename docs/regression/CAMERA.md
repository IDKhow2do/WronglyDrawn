# Follow camera: jitter in corners, camera inside big bodies (2026-11-15)

Author's report (level 1): fighting the Red Inkwell, standing in the corner behind the wall that hides him from the
walk lamp, the view twitches hard; the same in other places. In the Eraser fight the camera sat inside the Eraser
(screen = its teeth, WAI not visible).

## Rig

- Vite :5300 (`/tmp/wd-cam/vite.mjs`, no HMR), headless Chrome :9400 (`--mute-audio`, own profile).
- Scripts in `docs/regression/camera/bot/` (run from a copy in `/tmp/wd-cam/`: they read and write there): `load.mjs` (level + warp), `probe.js` (in-page: freeze the loop,
  place WAI, step 1/60 s without the GPU draw, record the camera), `cands.js` (spots next to walls / in inner corners
  from the physics world), `scan.mjs` (8 yaws per spot: 45 still frames + 75 frames of a 0.4 rad/s mouse sweep),
  `eraser.mjs` (the Eraser cases), `ev.mjs` (eval / shot).
- Jitter metric `jit` = RMS of the camera position's second difference, mm per frame². Smooth motion (a sweep, an
  ease) is near 0; a camera that jumps back and forth is large. `flips` = sign changes of the camera→head distance
  in the window; `maxStep` = largest single-frame camera move (mm).

## Causes found

1. **Line-of-sight check fed back into the boom (the main jitter).** After the sphere cast, a ray from WAI's head to
   the camera spot moved the camera OFF the boom (onto the head→camera line) and cut `distance` to match. Next frame
   the shorter boom had a clear line, so `distance` eased out again until the ray hit again: a 5–10 Hz sawtooth of
   1.5–4 m. Typical trigger: the camera risen over WAI's head (the "rise" fallback) with a wall top between the head
   and the camera. Inkwell corner (49.0, 13.1, −23.85), yaw 4.71: 24 distance flips in 2 s, single steps of 2.7 m.
2. **Yes/no choices without hysteresis.** Shoulder in/out (`fc > free + 0.8`) and rise/no rise (`freeHi > free +
   0.9`) were decided fresh every frame from numbers that wobble at an edge.
3. **Snap in, ease out, no hold.** A limit that flickered for one frame snapped the boom in, then it eased out:
   a buzz whenever any limit flickered.
4. **softLimit cache.** main.ts reused the creatures/rocks answer every other frame even when the boom had moved
   (the camera length alternated between two frames' answers).
5. **Creatures in the hard cast.** Big creatures' colliders were walls for the boom's sphere casts. When a body
   reached the pivot (the Eraser's charge, a hop on WAI), the cast started inside it, returned 0 and the camera
   collapsed onto WAI's head, inside the body: the author's "teeth" screenshot. The drawn-body soft limit had a floor
   of 1.2 m, which is still inside a 4.5 m eraser block.

## Fix (one boom, one smoothed length)

- `CameraController`: hard limit = level colliders only (`levelBlocker`: the session's blocker minus `enemy`); soft
  limits = `softLimit` (rocks: floor 1.2 m; creatures' bodies: floor `BODY_MIN` 2.2 m) and `sightLimit` (the longest
  boom, in 0.3 m steps, whose end sees WAI's head; it depends on the geometry only, never on this frame's length).
  `track()`: the hard length snaps in, the soft one eases in (14/s); both hold `BOOM_HOLD` 0.3 s, then ease out
  (3/s). Shoulder and rise are states with hysteresis (`shoulderIn`, `raised`).
- `OcclusionFader.update(…, bodies)`: big creatures' drawn bodies (bigness ≥ 0.5, not the Red Pen, which fades
  itself in SoulsCamera) fade with the props' fade path when the camera is inside the body box (+0.35 m), when the
  line to WAI's head enters it within 2.5 m of the camera, or when WAI is pressed into it and hidden.
- main.ts: the softLimit cache is reused only for the same boom; it returns `{ wall, body }`.

- The Red Pen is left out of the body limit and of the body fade: SoulsCamera frames it (first try kept it in the
  limit: after a TAG the 2.2 m floor stopped SoulsCamera's own "round WAI" rule from firing and WAI fell out of the
  bottom of the frame, `camera/pen_tag_after_ref_vs_first_try.jpg`).
- Merged rock batches: `wallDistance(…, 0.3)` sweeps a fat ray (centre + 4 lines 0.3 m off). In the Inkwell corner
  a thin ray missed a rock's flank and the camera sat inside its black ink hull (first frame of the before strip,
  still there after the boom fix). Rocks count as the hard limit (snap), bodies as soft.

## Results (scripts: `camera/bot/`, spots: `camera/bot/spots-*.json`, 55 per level, 8 yaws each)

Inkwell corner (Crossed-Out Quarter, behind the barricade z −24.4 that hides WAI from the walk lamp):

| spot | still: max jit (mm/f²) | sweep: max jit | sweep: max flips / 2 s | sweep: largest step (mm) |
|---|---|---|---|---|
| inner corner A (49.0, 13.1, −23.85) | 186 → 0.6 | 1324 → 226 | 25 → 3 | 3865 → 1531 |
| corner B (51.3, 13.1, −23.85) | 0.2 → 0.2 | 657 → 76 | 3 → 0 | 3997 → 741 |
| strip A, yaw 4.71, 40 frames | | 1436 → 204 | 9 → 1 | 2725 → 1821 |

Worst 10 of the three scans (ranked by the before run):

| # | level | spot (x, y, z) | jit still | jit sweep | flips | largest step mm |
|---|---|---|---|---|---|---|
| 1 | 1 plaza | 31.3, 4.6, 3.2 | 3421 → 19 | 2653 → 588 | 49 → 1 | 3509 → 3548 |
| 2 | 2 harbor | −25.9, 1.6, −7.0 | 3394 → 11 | 3161 → 747 | 46 → 3 | 4732 → 4517 |
| 3 | 3 works | 6.0, 18.1, −10.0 | 2988 → 24 | 2375 → 325 | 52 → 3 | 3332 → 1684 |
| 4 | 3 works | −6.0, 18.1, −10.0 | 2982 → 24 | 2349 → 324 | 52 → 4 | 3405 → 1684 |
| 5 | 3 works | −2.0, 18.1, −6.0 | 2949 → 19 | 2338 → 265 | 53 → 1 | 4374 → 2287 |
| 6 | 3 works | −2.0, 18.1, −16.0 | 2922 → 19 | 2335 → 170 | 55 → 1 | 3317 → 994 |
| 7 | 1 plaza | 45.3, 4.6, 3.2 | 2879 → 16 | 1178 → 316 | 29 → 3 | 4308 → 1958 |
| 8 | 3 works | 20.0, 18.1, −6.0 | 2742 → 18 | 1761 → 341 | 43 → 3 | 3437 → 2110 |
| 9 | 1 plaza | 47.3, 4.6, 5.2 | 2014 → 26 | 2571 → 587 | 16 → 70 * | 5466 → 3645 |
| 10 | 1 plaza | 39.3, 13.1, −20.8 | 2557 → 15 | 2134 → 56 | 54 → 1 | 1843 → 431 |

Whole scans, median of each spot's worst jit: level 1 485 → 152, level 2 514 → 197, level 3 927 → 258.

How to read the "after" sweep numbers: a sweep that carries the boom past a wall edge has ONE legit cut (the wall
enters the boom, the camera snaps in front of it); one cut of 3 m in a 75-frame window alone gives jit ≈ 580. The
frame dumps after the fix show single cuts and smooth eases, no back-and-forth. (*) #9: 70 flips at jit 11: WAI
himself was being nudged (moved 0.25 m in the window) and the camera followed by millimetres; not a camera fault.

Eraser on the summit (`camera/eraser_before_after.jpg`, `camera/eraser_rub_after.jpg`):
- camera between WAI and the Eraser ("away"): before, camera 1.03 m from WAI's head, WAI out of frame; after, the
  boom stops at 2.25 m, the Eraser around the camera is faded, WAI in frame.
- the RUB through WAI: before, 9 of 70 frames with the camera inside the body (black screen with the teeth
  outline, `camera/eraser_rub_before_inside.jpg`), closest 0.06 m; after, 0 frames inside, WAI hidden by a SOLID
  body 5 of 150 frames (the 0.1 s fade-in), closest 4.9 m.

Do-not-break pass (`camera/dont_break.jpg`, `camera/intro_and_corner_view.jpg`): Red Pen TAG shots 1 and 2 (gap
5.3–5.5 m, as before), after the TAG in play (WAI in frame, 3° off centre, `camera/pen_tag_after_final.jpg`), the
whole `souls_shots.mjs all` run with `errs []`; TAG stamp close-up on the Inkwell (cine plays, TAGGED); first-person
aim (aim ray = look direction, dot 1.0, eye 0.12 m in front of WAI's eye); intro push-ins (levels 1 and 3); the
partner's corner view (levels 1 and 3, shows when she is far). `npx tsc --noEmit -p .` clean.

## Still imperfect / not checked

- A wall that enters the boom still cuts the camera in one frame (it must: the camera would be behind the wall).
- Squeezed into an inner corner facing the corner, the boom can be as short as 0.8 m (WAI's model hides).
- Not staged: the Hush, the Red Gramophone, the Mutant charging through WAI, the Eraser's hop landing on him. The
  body fade is generic (any creature with bigness ≥ 0.5 except the Pen) but only the Eraser and the Inkwell were
  looked at; a creature that swaps or animates its own materials while faded shows the swap only after the fade.
- The Stamp Press (bigness 0.5) fades but does not push the boom (the push starts at 0.55, as before).
- Not played with a real mouse and real frame times; all numbers come from 1/60 s steps.

