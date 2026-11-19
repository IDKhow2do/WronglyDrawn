# TAG stamp art pass (2026-11-14)

The author: "the model for our stamp also needs doing; the current one looks cheap".
Test rig: own Vite :5277 (`/tmp/wd-stamp/vite.stamp.mjs`), "before" Vite :5278 (HEAD extracted to /tmp/wd-stamp/before),
headless Chrome CDP :9577 (`/tmp/wd-stamp/chrome.sh`, `--mute-audio`, own profile). Driver: `docs/art-pass/bot/stamp.mjs`.

## Decisions

- **Model**: Tripo v3.1 text-to-3D, one generation. Honey wooden bulb handle, brass collar, wooden mount block, thick
  pink rubber die. Post: `scripts/tripoPost.mjs … 1 y bottom 0 0.012` (decimate, 1K webp, meshopt) → 193 KB
  `public/models/rubber_stamp.glb`, die face at y 0. Manifest slot `rubberStamp` (height 1; StampFx sizes it).
- **Shape in game**: height 1.6 m at size 1, widened ×1.45 on x/z (Tripo made it slim; it must read chunky on a boss),
  leaned 0.07 rad (crooked like the world). The die half width is measured from the model (the lowest tenth).
- **Gold** (Golden Stamp / ENCORE): a material swap, no second generation. Each material is cloned twice; the gold
  clone pushes handle, collar and block to gold in the shader and keeps the pink rubber die (mesh-local y split).
  TAG is gold when the Golden Stamp sticker is owned (`REWARDS.encore`); every ENCORE stamp is gold.
- **Where it lands**: it tips 0.5 rad toward WAI and lands on the creature's real surface (a ray along the tipped axis
  through the upper body), so the print faces WAI and the TAG cameras instead of lying edge-on on top of the head.
- **Timing**: the drop is the last 0.06 s of the wind-up, so contact lands on the frame CombatDirector calls `slam()`;
  the print and squash are made inside `slam()`, so the hit-stop freezes on the squash with the ink already out.
  No gameplay number in CombatDirector changed; only 3 lines that build / drive the stamp (constructor gets
  `ctx.assets`, both `windUp` calls pass `{ on: creature root, look }`).
- **Contact is found twice**: at the wind-up (where the stamp hovers) and again in `slam()` (the creature crouches or
  shuts a lid under the wind-up; the first shots printed the seal 0.5 m above a reeling mutant). The print rides on the
  mesh it hit (a lid takes its print along); skinned meshes ride the creature root.
- **Camera (TAG shot 2, CombatDirector.tag)**: the first after-shots cut the stamp off at the top for a mid creature
  and put the camera INSIDE the Eraser boss (the room raycast only skipped the creature's capsule, not the extra block
  collider on the same body). Changes, camera only: (1) the room raycast skips every collider on the creature's body;
  (2) shot 2 aims between WAI's landing spot and the stamp's knob at the slam (`stampFx.handleY`; `windUp` now runs
  a few lines earlier in `tag()`, same frame, so the camera knows where the stamp lands; the creature's bounding box
  was useless here: alert '!' sprites and bars inflate it) and backs off to fit that height, room allowing; (3) when a wall holds the camera in, shot 2 opens its lens (40° → up to 70°) instead.
  Shot 1, durations, the slam time and every gameplay number are unchanged.
- **Camera against the stamp**: StampFx gets the view camera and turns see-through (down to 15 %) when a tight room puts
  the camera inside its bulk (seen on a stapler next to the Crossed-Out tear).
- **The mark**: WAI's crown seal (double wobbly ring, crown with three balls, "WAI", flecks), from a canvas.
  Shader: starved / thin ink by noise, a dark pooled rim on every stroke edge, a wet gloss that dries in 0.9 s;
  it rides on the creature, holds 2.6 s, fades 1.2 s. Pink ink (gold ink for gold stamps). The seal is never wider than
  0.8 × the creature's half width. Depth: a flat quad on a round, shader-inflated body was swallowed (the Eraser needed a
  2.2 m depth lead; on the mutant any lead big enough made it vanish again), so the ink batch draws with no depth test;
  a print turned away from the eye fades out (it never shows through its own creature). Cost: for its 3 s the ink can
  show through a wall between the camera and the creature.
- **Fix (coordinator review): the "yellow film" over gold prints** was not the print: it was the gold stamp body itself,
  half-transparent while it faded out on the lift, seen straight down its axis by the mark camera (proved with the ink
  batch switched off: the film stayed). The lift no longer fades: the stamp springs up and shrinks away at full
  opacity. Gold and PERFECT marks re-shot after the stamp is gone: ink only where the seal is (pink, gold, wet, dry).
- **Prints behind walls**: StampInkFx.watch(camera, blocked) checks each print every 0.15 s with a physics ray
  (CombatDirector passes it: colliders tagged static / gate / host) and eases the print out while a wall is in between.
  Not shot-verified (logic only).
- **Die dots**: the Tripo die had dice-like dots in its texture and normal map. The stamp material repaints the die
  (below 30 % of the mesh height) flat rubber pink with a faint mottle and keeps the smooth vertex normal there.
- **Style**: the stamp is WAI's and belongs to the drawn world (honey wood, crooked lean, pink rubber, crayon-wobble
  seal), on purpose the opposite of the Red Pen's exact, metallic, manufactured look.
- **Effects**: `src/render/StampInkFx.ts`, one instanced draw call (SprayFx / SoundFx pattern): print, ink droplets,
  splat ring, dust puffs, and on PERFECT / FRENZY a gold star flash and a second wide gold ring.

## Tripo ledger (cap 40)

| # | model | credits | result |
|---|---|---|---|
| 1 | rubber_stamp (text, v3.1, task e973b421) | 20 | good: chunky, crooked, wood grain; die a bit tall with dice-like dots (fine at game size) |
| | **total** | **20** | balance 690 → 670 |

## Shots (docs/art-pass/stamp/)

Staged with `docs/art-pass/bot/stamp.mjs` (rAF loop stopped, `__WD.advance` deterministic steps; time = seconds after
the E press; TAG slam at 0.55, ENCORE slam at 0.36). Runner: `/tmp/wd-stamp/run.sh <before|after> <vitePort>` (it
restarts its own Chrome before each level load: re-navigating a loaded game killed Chrome's GPU process every time).

- `compare-small.jpg` (Stapler), `compare-mid.jpg` (Crooked-Leg Mutant), `compare-boss.jpg` (Eraser): wind-up 0.53,
  slam 0.60, before at 1.00 vs after `-mark` (a camera in front of the print ~0.5 s after the slam, comic words hidden).
- `compare-gold.jpg`: FRENZY ENCORE (gold stamp) before/after, and the gold print after FRENZY and after PERFECT.
- `after-pen.jpg`: the Red Pen's TAG under SoulsCamera's own two shots (Limp Works roof). The stamp and its print land
  on the Pen's barrel and sit in both shots; SoulsCamera.ts needs no change.
- Singles: `before-*` / `after-*` at 0.53 / 0.60 / mark (TAG) and 0.34 / 0.37 / 0.40 / mark (ENCORE).
- Before = HEAD 2990fde extracted to /tmp/wd-stamp/before (Vite :5278); it lacks other agents' uncommitted work too.
- Staging caveats: WAI is teleported in front of the creature, so some gameplay-camera ENCORE frames look through a
  wall (stapler PERFECT); the ENCORE frames use the play camera, which this pass does not frame.

## Done / next

- [x] model + manifest slot, StampFx rewrite (code fallback kept), StampInkFx, CombatDirector stamp/camera lines, tsc clean
- [x] screenshots before / after (small, mid, boss; gold ENCORE / FRENZY; PERFECT; the print; the Red Pen)
- [x] camera check: TAG shot 2 fixed (boss camera was inside the Eraser; mid stamp was cut off). Small: the knob leaves
      the top of the frame at the top of the wind-up only.
- [x] Gentle L1 bot (docs/difficulty/bot/l1 copied to /tmp/wd-stamp/l1, Chrome :9578, Vite :5277): final run
      LEVEL COMPLETE in 537 s, 14 TAG/ENCORE hits, errs []. Earlier runs failed at the chomper TAG timeout (the HEAD
      "before" build failed the same way) or at the quarter's 900 s wall-clock cap under machine load: not the stamp.
- next: the stamp is small next to a boss (stampSize = 0.5 + bigness × 1.1 caps the Eraser at 1.6); the play-camera
  ENCORE stamp fills the frame on a small creature; the print is a flat quad (it hangs over the silhouette on thin
  bodies); the drawn crayon feel comes from the textured model + ink pass, not a hand-drawn texture of its own.
