# Body parts pass (Eye / Mouth / Legs): audit and changes (2026-11-14)

Shared module: `src/render/DoodleEye.ts` (DoodleEye, DoodleEyes, EYE_STYLES).
One domed disc (36 × 11 vertices, cached per bulge) and one fragment shader (MeshStandardMaterial +
onBeforeCompile, program shared by every eye; `customProgramCacheKey` 'wd-doodle-eye'). Drawn in the shader:
wobbly ink outline, paper-white sclera with edge and lid shadow, iris (lighter below, radial streaks, dark rim),
pupil, two highlights, lid with crayon hatching, lid line, crease (inside or above the eye), up to 5 lashes
(on the rim when open, hanging from the lid when lowered), a tired line. Per eye: 7 uniform slots, one draw call,
no texture, no canvas, `noPaint`. It animates itself in `onBeforeRender` (no update call, no allocation):
eased lid / grey / widen, auto blink, gaze toward `follow` (a world point) or `look`, hit flash.
States: `open` 0..1, `grey` 0..1 (silenced), `wide` 0..1, `pupil`, `blink()`, `flash(color)`, `follow`.
Styles: ROUND, SLEEPY, ANGRY, STARE, and STIFF (the Red Pen's servants: straight lid, no lashes, small iris, thin line).

Mouth and legs: no shared module was written (see "Not done"). The lent Mouth and Legs (OrganVisuals) already
are the game's best-made parts; the cheap mouths and legs are on creatures in src/enemy, which this pass may not edit.

Shots: docs/art-pass/parts/ (`*-before` / `*-after`, `audit-*` = the current state, rated).

## Audit

Rating: fine / weak / cheap. "Tripo" = the face is part of a model's own texture.

| # | where seen | part | built in | rating | action |
|---|---|---|---|---|---|
| 1 | L1+L2 houses (16 in L1, more in L2): sleeping facade eyes | eye | level/Ambient.ts `addEye` | cheap (pink ball lid, 5 box lashes, plain white bump, flat disc iris; 9 meshes each) | **DONE** → DoodleEye ROUND, shut + lashes while asleep, follows WAI when awake, 1 mesh. parts/l1-facade-* |
| 2 | L2 lighthouse (Guardian 3) | eye | harbor/MuteHarbor.ts lamp face | cheap | **DONE** → DoodleEyes SLEEPY, grey/sleepy → colour/open. LANTERN.md |
| 3 | L2 clock tower dial (Guardian 2) | eye | harbor/ClockTower.ts | weak (white spheres, flat indigo lid) | **DONE** → DoodleEyes SLEEPY in the dial; `setLit(true)` opens them. parts/l2-clock-* |
| 4 | Lent EYE on hosts and on WAI (core mechanic) | eye | hosts/OrganVisuals.ts `EyeVisual` | fine (3D die-cut sticker, painted iris texture, lid shells, cone lashes) | keep: its 3D sticker look is deliberate and better than a flat doodle. audit-o1-sleepyWall-eye |
| 5 | Lent MOUTH (gatehouse, ferry) | mouth | hosts/OrganVisuals.ts `MouthVisual` | fine / slightly weak (thin lips, a gap above the top teeth at rest) | keep. audit-o1-gatehouse-mouth |
| 6 | Lent LEGS | legs | hosts/OrganVisuals.ts `LegsVisual` (CrookedLeg, striped socks, high-tops, IK) | fine (from code; not shot) | keep |
| 7 | L1 Peeping Lamp | eye | enemy/PeepingLamp.ts (Tripo `lampEye`; EyeVisual fallback) | fine (Tripo) | keep |
| 8 | L1 Crooked-Leg Mutant | eye, mouth, legs | enemy/MutantModel.ts (Tripo body override; code sphere eye only as fallback) | fine (Tripo) | keep |
| 9 | L1 Chomper bin, Eraser grub, Eraser boss | eye, mouth | Tripo bodies; EraserBoss code pupils | fine | keep |
| 10 | L1 White-out Bottle (Pen's servant) | eye | enemy/WhiteoutBottle.ts | weak (white spheres, black dots, box brows; readable) | proposal P1 |
| 11 | L1 Red Inkwell (Pen's servant) | eye, mouth | enemy/RedInkwell.ts | weak (small white balls, dot pupils) | proposal P2 |
| 12 | L1 Stapler | eye, teeth | enemy/Stapler.ts | not framed (the camera never got a clean view); from code: sphere eyes | proposal P3 |
| 13 | L1 fountain whale | eye | level/Fountain.ts (5 cm spheres + torus ring) | weak but tiny (seen from 5+ m) | left: at its size the doodle eye adds nothing |
| 14 | L2 Fog Jelly | eye, mouth | enemy/FogJelly.ts | cheap (white balls, half-sphere lids, a torus mouth) | proposal P4 |
| 15 | L2 Red Gramophone (Pen's servant) | eye | enemy/GramophoneLook.ts + RedGramophone.ts | weak (white spheres, cabinet-wood half lids) | proposal P5 |
| 16 | L2 Megaphone Crab | eye stalks | enemy/MegaphoneCrab.ts | weak (ball + dot on a stalk; reads at gameplay distance) | proposal P6 |
| 17 | L2 Hush (boss) and Hush moths | eye, mouth | Tripo + HushLook.ts | fine | keep |
| 18 | L2 Foghorn Ferry portholes | "eyes" | HarborModels.buildFerry | fine (portholes, not eyes) | keep |
| 19 | L3 Stamp Press | gauge eyes | enemy/StampPressLook.ts | fine as machine eyes (gauges + riveted brows suit the Pen's side) | owned by the L3 agent: no change proposed |
| 20 | L3 Compass Spinner | eye | enemy/CompassLook.ts (4.5 cm spheres) | weak | proposal P7 |
| 21 | L3 Ruler Snake | eye | enemy/RulerSnakeLook.ts | not shot | proposal P8 (STIFF) |
| 22 | L3 Red Pen | eye | enemy/RedPenLook.ts | **excluded by design** (cold, exact, manufactured; redone by the L3 agent) | none |
| 23 | WAI | eye | player/WaiModel.ts | fine | keep |
| 24 | Co-op companion | eye | coop/CompanionModel.ts | fine (not plainly cheap) | keep |

## Proposals for files this pass may not edit (src/enemy/*)

All are look-only: no weak point, collider, timing or state changes. Each replaces the eye meshes with a
`DoodleEyes` group at the same centre and size, and maps the old lid rotation onto `open`.

- **P1 WhiteoutBottle.ts**: `new DoodleEyes({ ...EYE_STYLES.STIFF, tilt: 0.3, size: <old r>, iris: '#2b2b2b', lid: '#e8e8e8' })`
  where the white spheres sit; keep the box brows (they are the anger read); `flash()` in its hit flash.
- **P2 RedInkwell.ts**: STIFF, iris `#c0281e`, lid the ink-glass colour; tell (wind-up): `open = 1, pupil = 0.3` (a pupil
  locking on); dazed: `open = 0.3` + rolling `lookAt`.
- **P3 Stapler.ts**: STIFF, small; `open = 0.55` at rest, `wide = 1` on the bite tell.
- **P4 FogJelly.ts** (city creature, soft): replace the loop at the face (`for (const x of [-0.24, 0.24])`) with
  `DoodleEyes({ ...EYE_STYLES.SLEEPY, size: 0.13, spacing: 0.48, iris: '#7a5cff', lid: '#7fd0c0', bags: false })` at
  (0, 0.62, 0.76) on the bell; in update: `open = TELL||STING ? 1 : 0.5 - max(0, sin(swim·0.6))·0.25`, `wide` on the sting.
- **P5 GramophoneLook.ts / RedGramophone.ts**: `GramophoneParts.lids` → `eyes: DoodleEyes` (STIFF, size 0.3, spacing 1.2,
  iris `#d23a2a`, lid `#7a2e24`) at (0, 1.45, 1.12); brows stay. In RedGramophone (line ≈410):
  `open = dazed ? 0.3 : tell ? 0.5 : CALM ? 0.7 : 0.6`, dazed rolls `lookAt(sin, cos)`, `flash()` when `this.flash > 0`.
- **P6 MegaphoneCrab.ts**: put a `DoodleEye` (ROUND, size 0.12, no lashes) on each stalk tip instead of ball + pupil;
  OPEN state → `wide = 1` (it now scales the stalk's y).
- **P7 CompassLook.ts**: STIFF eyes (size 0.05) in place of the 4.5 cm spheres; the pinched brows stay.
- **P8 RulerSnakeLook.ts**: STIFF; "squint while measuring" → `open = 0.35`; "wide and happy when calm" → ROUND look, `open = 0.95`.

P4 and P5 were drafted as code but not applied (the edit was refused: src/enemy is outside this pass's rights).

## Cost
Facade eye: 9 meshes (+ outline hull) → 1 mesh.

Frame cost (`/tmp/wd-eye/bot/perfplaza.mjs` and `perf.mjs`: one synchronous render + 1-px read-back, median of 25,
headless, medium quality, all facade eyes woken). "Before" = a worktree of HEAD 2990fde on :5264, which also lacks
other agents' uncommitted work, so small differences are noise. Two runs each for the plaza.

| pose | before calls / ktris / ms (p90) | after calls / ktris / ms (p90) |
|---|---|---|
| L1 plaza spawn | 2028–2035 / 2310–2320 / 12.1–13.0 (13.5) | 1965–1989 / 2303–2343 / 11.9–12.4 (13.3) |
| L1 facade row | 831–838 / 1276 / 7.2–7.5 (9.2) | 821–826 / 1303–1340 / 6.9–7.4 (9.1) |
| L2 lighthouse gallery | 705 / 1424 / 7.6 (8.8) | 684 / 1458 / 6.7 (8.3) |
| L2 gallery + BIG SHOUT | 698 / 1496 / 6.8 (8.7) | 686 / 1528 / 6.6 (8.2) |

Fewer draw calls, about 30 k more triangles (the eye discs and the lens lathe), time within noise.

## Bots (Gentle, copies of docs/level1-expansion/bot and docs/level2-expansion/bot on :5263 / :9563)
- L1 run 1: eye + mouth fine (T+50 s); `quarter.mjs` hit its 900 s cap fighting grubs and the yard stapler,
  door not opened → LEVEL NOT COMPLETE, `__errs` empty. Same failure the art agent logged under load (NOTES.md).
- L2 run 1: ferry and clock woken (the clock's new eyes on that path), then `pier.mjs` spent 598 s on the
  barker crab and stopped at "jump on the spring over the barricade" → LEVEL NOT COMPLETE, `__errs` empty.
  The pier is where the level-2 agent is working now; nothing of this pass is on the pier.
- L1 run 2 (rerun once): further (Inkwell boss mark at 150 s; 226 s spent on a White-out Bottle), still the 900 s
  quarter cap → LEVEL NOT COMPLETE, `__errs` empty. Not rerun again. Servers and Chrome on :5263/:5264/:9563 stopped,
  HEAD worktree removed.

## Not done
- No shared doodle mouth or doodle legs module. The lent Mouth / Legs are already good; the cheap mouths
  (Fog Jelly's torus, Mutant fallback plane) and stiff legs are all in src/enemy. Next step if wanted: a
  `DoodleMouth` on the same shader pattern (lip line, teeth / tongue variants, closed / talk / shout / bite / taped).
- Stapler and Ruler Snake were not framed by the bot camera.
