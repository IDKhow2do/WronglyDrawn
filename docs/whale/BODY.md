# 蓝色大肥鱼's body: the world's mechanisms and WAI's hearts (2026-11-15)

The author's note: "The fish should be the same as us. A spring should bounce her. She should have the same health system."
Her role stays the same. She is clumsy and there for fun. Her paint stays capped at 20 % of a fight (`FightLedger.shareCap`, unchanged).

## One contract: `PlayBody` (src/player/PlayBody.ts)
`pos, vel, vy, grounded, smudged, collider, takeHit(), leap()`. `PlayerController implements PlayBody` (type only) and
`Companion implements PlayBody`. A world mechanism written against it acts on both bodies through the same code:
- `Ambient.update(dt, player, partners)`: every painted spring throws every body on its pad. Each body has its own re-bounce lock.
  Only WAI's bounce emits `spring:bounce` (the "3 springs" goal is his).
- `StampingFloor.update(…, partners)`: the STAMP RUN presses stamp her like WAI. The run itself stays WAI's: her stamp does not cancel it.
- Sessions pass `coop.bodies` (`[pip]`, or nothing when she is off). Level 3 passes it through `WorksHost.partners()`.

## Mechanisms × bodies
| Mechanism | WAI | Her | How (her side) | Proof |
|---|---|---|---|---|
| Painted spring, level 1 (sketched → painted) | thrown | thrown, same launch speed | Ambient (PlayBody.leap); Companion.leap = WAI's leap | tested: `body/l1-spring-sheet.jpg` |
| Painted spring, level 2 (landing → awning) | thrown | thrown, same launch speed | same | tested: `body/l2-spring-sheet.jpg` |
| Spring used on purpose (her brain) | — | walks 9 m to a spring that lands next to WAI | PipWorld.route (via `PlaySession.springPads()`) | tested: `body/brain-spring-end.jpg` |
| Pier spring (level 2 bandstand), summit-road springs | thrown | thrown | same Ambient loop | code-only |
| Conveyor belts (level 3) | carried 2 m/s | carried 2 m/s | `PlaySession.beltCarry()` (WAI now calls it too: same function) | tested (belt.mjs) |
| Walking hosts / boats (moving decks) | carried + turned | carried + turned | PipWorld.carry → the host's own `carryFor()` + `enforceAbove()` | code-only |
| Freight lift cage (level 3) | held above the cage | carried by the cage's kinematic step | PipWorld.carry (kinematic static floor) | code-only |
| Stamp presses (STAMP RUN lane) | −½ heart, knock | −½ heart, knock | StampingFloor `partners` | tested (press.mjs: 3 stamps in 6 s) |
| Kill plane (fell off the canvas) | −½ heart (never the last), redrawn | −½ heart (never the last), redrawn next to WAI | PipLife.fell | tested (pit.mjs plaza) |
| Shredder pit (level 3) | −½ heart (never the last), redrawn | same | WorksSession.inWater = inPit → her 'canal' rescue | tested (pit.mjs works) |
| Ink canal / harbour water | takeHit(1, no knock) → can smudge at ½ heart | −½ heart, never the last | PipLife.fell | code-only. Difference: water never smudges her (a smudge during the pencil redraw would collide with it) |
| Big creature push-out | pushed out | pushed out | PipWorld.pushOut (`e.pushOut`, Red Pen exempt as for WAI) | code-only |
| Boss bucks a body off its head | leap away | leap away (she has `leap` now) | EnemyBase.shakeOff (unchanged code) | code-only |
| Creature attacks (Compass circle, Ruler whip, Red Pen marks / sweep, ink pools, beams, rings, lunges) | hit when it hunts WAI | hit when it hunts her | unchanged: every creature tests its one target; `CoopPartner.targetFor` (aggro) decides | tested for grub (light) and mutant KICK (heavy) |
| Doors, gates, barriers, undrawn solids | collide | collide | her KCC hits every non-sensor collider | code-only (unchanged) |
| Checkpoint spray can (first tag) | full hearts | full hearts | PipLife (`checkpoint` event) | tested (event) |
| Paint drops | heal ½ heart × difficulty | heal only when WAI's hearts are already full | PipLife (`paint:collected`) | tested (event) |
| Crowns, stomps, paint surf, jet hover from Space | his | not hers | his rewards / his moves | n/a |

Not changed on purpose: a creature attack aimed at WAI does not also hit her when she stands in it. Every creature (25 files) tests
only its current target; making each test both bodies changes every fight and every file during the regression. Aggro decides who is hit.

## Hearts (src/coop/PipHealth.ts)
- Maximum = `PLAYER.maxHp` (WAI's, boons included). Cost per hit = `Difficulty.hitDamage()`. Blink = `Difficulty.s.invuln`.
  Heals use `Difficulty.s.heal` with WAI's bank of fractions. Normal: grub bite −1 for both; mutant KICK (heavy) −3 for both.
- No hit while she blinks, rolls, is smudged or is being drawn (squash < 0.9). Her auto-dodge stays (now in src/coop/AutoDodge.ts).
- Hearts at 0: **smudged**. 1.6 s of WAI's smudge blink (his `smudgeTimer`), the eraser rubs her out, 1.6 s hidden,
  then the pencil draws her in next to WAI (`Coop.redraw`) with full hearts and 2 s of blink after she pops up.
  She waits while WAI himself is smudged.
- "WAI helps her up (E)" is gone: nobody helps WAI up either, and the redraw is automatic. `prompt()` returns null.
- Lines (RuleBrain `down` / `redrawn`, Chinese in i18n/zhSwagger.ts):
  "Smudged! Kid, draw me back in. Rounder this time." / "I wasn't smudged. I was resting my eyes."
- Her rice meal (every 10th drop) heals her through the same `heal()`.
- Boss refill: her smudge never reaches a session, so `FightReset` only hears WAI's.
  Normal, Red Inkwell at 1040/1890 paint: she is smudged → it stays at 1040 (no refill); WAI is smudged → 1890 (refill).
- On screen: `HeartTag` (the HUD's heart glyphs, small, left of her head). It shows while she is hurt, for 3 s after a change and while
  she is smudged (all empty, blinking). The corner view's name line shows the same hearts.
- Brains: `observe().pip` = `{hp, maxHp, smudged}`. The LLM system prompt has one "Hearts:" line. The rule brain skips its
  now-and-then taunt on her last heart; the taunt that saves a low WAI is unchanged.

## Files
New: `src/player/PlayBody.ts`, `src/coop/PipHealth.ts`, `PipWorld.ts`, `PipLife.ts`, `HeartTag.ts`, `AutoDodge.ts` (moved out of Companion),
`Places.ts` (findPlace moved out of Coop). Companion.ts 999 → 982 lines, Coop.ts 1082 → 1059.
Shared files (behaviour-neutral for WAI): PlayerController (implements PlayBody), Ambient, Session (2 optional members),
GameSession / HarborSession (pass `coop.bodies`, springPads()), WorksSession (beltCarry, inWater = pit, partners),
WorksDirector (`partners` in WorksHost), StampingFloor (`partners`), EnemyBase (one comment).

## Tests (docs/whale/test/body/)
Vite 5298 (`npx vite --config docs/whale/test/body/vite.mjs`), headless Chrome CDP 9398 (`--user-data-dir=/tmp/wd-body/chrome --mute-audio`).
Each script stops the game loop (`__WD.app.loop.stop()`) so only `__WD.advance` moves the game. Run `node prep.mjs <level> en rules`
(`DIFF=normal` for Normal) and then one of: `spring.mjs <i> <prefix>`, `springbrain.mjs <i>`, `hits.mjs <enemyId>`, `smudge.mjs`,
`boss.mjs`, `belt.mjs`, `press.mjs`, `pit.mjs <works|plaza>`.
Screenshots: `docs/whale/body/` (spring sheets: 16 frames, 0.1 s apart; smudge-a-hurt = heart tag 1/3;
smudge-b-03 / -22 = blink / rubbed out; smudge-b-34 = the pencil draws her next to WAI; smudge-b-45 = back, full hearts).
