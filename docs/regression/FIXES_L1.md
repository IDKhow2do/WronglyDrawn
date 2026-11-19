# Fixes for level 1 (from docs/REGRESSION.md) — working notes

Ports: Vite 5281, Chrome CDP 9381 (own profile /tmp/wd-l1/chrome, English, muted). One bot at a time.
The other agent (FIXES_L23.md) works in src/level/works, src/level/harbor (guide) and plans an EnemyBase edit:
this work stays out of EnemyBase.

## Fix 1 — summit stairs need ~3.8 m/s

- Existing pattern: BlindPlaza `towStairs` already lays an invisible ramp along the step nosings
  ("0.5 m steps on flat ground defeat the controller's auto-step"). Level 3 `WorksKit.stairs` only adds a half step
  at the foot. Level 2 stairs are terrain ramps / ramp colliders.
- Plan: share the nosing-ramp loop as one BlindPlaza helper; summit stairs get a ramp through their nosings.
- Then measure every stair at stick 0.3 / 0.5.

## Fix 2 — Eraser grubs outlive the Eraser

- Existing pattern: HarborSession repaints the Hush's brood moths (`debugRepaint`, the normal finish path) when the
  Hush is won. Grubs' finish = pop → `releaseCleanGrub` (the clean eraser hops away).
- Plan: GameSession keeps the ids of boss/mid-boss summons per summoner; on its win repaint the live ones.
  Eraser ai returns when harmless, so no new summons after the win.
- Others: rooftop Peeping Lamp (grubs), Red Inkwell (helper bottle), Red Gramophone (helper crab, PierDirector),
  Hush (already done), Red Pen (allies are not enemies; hazards cleared in finish), Archivist (a host, no summons).

## Fix 3 — Inkwell wakes across the East Walk barricade

- `RedInkwell.ai`: IDLE wakes on canSee within 15 m; any paint hit alerts (EnemyBase.applyDamage). `woke` flag keeps
  the cut-in to once.
- Plan: BuiltQuarter.inSquare(p) (in the Inkwell Square region and no red barricade on the line to the Inkwell);
  RedInkwell hook `reachable`; unreachable = no alert, paint slides off, the fight drops to IDLE (woke stays).

## Status (code done, being measured)

- Fix 1: `nosingRamp` helper in BlindPlaza (towStairs uses it too). Summit ramp 10 cm over the nosings, ends 6 cm
  over the summit (the terrain's summit-edge lip at z ≈ −33.7 poked 0.4 cm above a flush ramp and stalled a slow walk).
  Survey found the HARBOR STEPS (spawn → hub, 0.25 m risers) stall at stick 0.3 and 0.5 too → ramp added there.
  Tow stairs (existing ramp) climb at 0.5+; at 0.3 they climb slowly (gravity snap −1.5 m/s eats a slow walk on
  a 24–27° slope: ≈0.5 m/s up the slope).
- Test gotcha: walking onto the summit wakes the Eraser; its crumbs knocked WAI back mid-stair. Dispose the Eraser
  for stair tests (`__WD.app.session.eraser.dispose()`).
- Fix 2: GameSession `summoned` / `repaintSummons` (Eraser + rooftop lamp grubs). Mid-bosses own their helper:
  RedInkwell / RedGramophone `onHelper` returns the creature, `finish()` repaints it (PierDirector unchanged: its
  arrow already returns the crab).
- Fix 3: `BuiltQuarter.inSquare`, `RedInkwell.reachable` (preDamage absorbs, alert() skips, ai valid needs it).

## Measurements so far (logs in /tmp/wd-l1/logs)

- Summit (after fix): stick 0.3 / 0.5 / 0.8 / run all reach the summit (0.3 climbs ≈0.5 m/s up the slope).
- Harbor steps (after fix): 0.3 / 0.5 / 0.8 / run all reach the hub. Before: 0.3 and 0.5 stuck at the first riser.
- Inkwell: 29 s game time south of the barricade (spraying at it, a hop on the spring spot): IDLE, 1400/1400 paint,
  0 hits; a direct paint hit from there is absorbed. Over the barricade: FIGHT at once, cut-in count 1, hits WAI.
  Back south: IDLE (woke kept); north again: FIGHT, cut-in count still 1.
- Eraser (warp 'summit', 3 summons through `onSummon`, then repainted): live grubs 10 → 7 at the win (the 3 summons
  popped into clean grubs; the 7 left are the hub's own), no new grubs, 0 hits to the door, LEVEL COMPLETE.

## Level 2 / level 3 stairs — riser problem found, NOT fixed here (outside my files)

- L2 Bandstand Pier stairways (BandstandPier.ts `stairway`, 0.2 m risers, box steps): stick 0.3 stalls at the foot
  of the carousel → bandstand ramp and of the yard stair; 0.5 climbs slowly. The bandstand ramp leads to the
  Red Gramophone (critical path).
- L2 grand stair (terrain ramp), jetty stairs (ramp collider), lighthouse spiral (tilted slabs): ramps by
  construction; grand stair climbs at 0.3 / 0.5.
- L3 stair 2 (pencil stair) and stair 3 (WorksKit `stairs`, 0.5 m risers, 1 m treads): stick 0.3, 0.5, 0.8 AND
  keyboard W (4.4 m/s) all stall on the first full step; only a sprint climbs.
- Proposed fix (an edit there was refused by the session's permission check, so it is left for the owner):
  `PhysicsWorld.addStaticSlab(a, b, halfWidth)` now exists. WorksKit `stairs()`: when `phys`, one slab from
  along −1.12 (floor) through the nosings (y = foot.y + 0.5 + 0.5·along, +6 cm) to along n−1, then flat to n;
  StampingFloor `drawStair` adds the same for stair 2. BandstandPier `stairway`: one slab over the nosings
  (y = lo.y + dy·(k + 1/n), +3 cm) from k = −1/n to (n−1)/n, then flat to k = 1.

## Final

- Refactor: `nosingRamp` now calls `PhysicsWorld.addStaticSlab`. Re-measured after it: summit and harbor steps climb at
  0.3 / 0.5 / 0.8 / run; both tow stairs climb at 0.3 and 0.5.
- Full level 1 Gentle bot run (/tmp/wd-l1/logs/l1-gentle-full.log): LEVEL COMPLETE, `errs` empty, 569 s game,
  88 hits, 5 smudges, wall 665 s. Poll: 2 hostile grubs on the summit at 564 s, 0 at the win (568 s), 0 hits and 0
  smudges from the win to the door. The Inkwell was never engaged while WAI was outside its square.
- `npx tsc --noEmit -p .` clean. Servers on 5281 / 9381 stopped.
