# Level 2 expansion: progress log

Goal: grow Mute Harbor from about 8 bot-minutes (≈12–14 human minutes) to about 20 human minutes.
Twin of docs/level1-expansion (same four additions, same patterns). Order: creatures → district → mid-boss → wiring → bots.

## Design (decided 2026-11-12)

### Main path after the expansion
1. Chomper Bin → Mouth → bell gate → Foghorn Ferry (Guardian 1) → boats → old town.
2. Clock Square: three tuning forks → the Clock Tower rings (Guardian 2).
3. **NEW (the sky moment):** the Bell Bridge starts to come down — the RED PEN swoops out of the sky and
   strikes it out with a red X while the camera watches. The bridge snaps back up. The clock's BONG has also
   shaken the rust off the old pier gate behind the tower.
4. **NEW: Bandstand Pier**, a seaside pleasure pier on iron stilts over a sea of fog (north-west, behind the
   clock tower). Gate → causeway → Ticket Yard (checkpoint, encounter 1) → the Fog Walk (encounter 2) →
   West Landing → Carousel Deck (encounter 3) → sketched spring over the red barricade → the Bandstand.
5. **NEW mid-boss: THE RED GRAMOPHONE** on the bandstand's giant record. Repainted: the pier's red marks wash
   off, the shortcut stair to the Ticket Yard opens, and the Red Pen's X lifts off the Bell Bridge — it comes down.
6. Bell Bridge → lighthouse (cocoon, spiral, BIG SHOUT) → THE HUSH → paper boat, as before.

### Bandstand Pier (world x −90..−40, z −100..−48, decks at y 5.85, bandstand at 9.85)
- Distinct look: whitewashed sea-green boards, cream iron railings and lamp posts, candy-striped kiosk and
  carousel, bunting, iron lattice stilts sinking into a fog sea. The old Landscape sea stack at (−70, −65)
  stands where the Fog Walk is: it is hidden.
- Gate (−42.5, −51) → causeway north → **Ticket Yard** x −56..−40, z −72..−60 (cp-pier).
  Encounter 1: two Megaphone Crabs (+ a Peeping Lamp that gives an Eye if WAI has none).
- **Fog Walk**: the pier is broken for 14 m (x −76..−62). A zigzag plank walkway crosses the gap; two Fog
  Jellies drift over it and their fog hides the walkway and the drops on it. True Sight (aim with the Eye)
  sees through; a Fog Lamp host on the near end takes the Eye and keeps looking for you. Falls → cp-pier.
- **West Landing** x −86..−76, z −72..−58 (crates crown). South of it: the **Echo Gallery** (optional
  challenge: shout 8 of 10 pop-up horns → crown).
- **Carousel Deck** x −90..−70, z −98..−80. Encounter 3: the Barker (big crab), a crab and a jelly round the
  carousel. A red barricade blocks the ramp to the bandstand; a sketched spring throws WAI over it.
- **The Bandstand**: round deck centre (−54, −88), r 9.5, y 9.85, the floor is a giant record. Pavilion behind.
- Shortcuts after the mid-boss: the stair from the bandstand down to the Ticket Yard and the ramp down to the
  Carousel Deck lose their barricades; yard → causeway → gate is 30 m from the Bell Bridge.

### New creatures
| Creature | Player action | Telegraph | Damage | Counter | Repainted |
|---|---|---|---|---|---|
| Megaphone Crab (`megacrab`) | SHOUT when its shell is open | lid flips up, pink throat glows, horn tracks WAI (1.15 s) | BLARE wall ½ heart | shout into the open horn → BACKFIRE: flipped, ×2.5, TAG. Shout at the shut lid → it CATCHES the shout and fires it back (½ heart + muffled 2.5 s). Paint on the shut shell ×0.3 | happy crab |
| Fog Jelly (`fogjelly`) | LOOK with the Eye (True Sight) | ring under it, tentacles glow (0.85 s) | sting ½ heart | inside its fog paint is lost; seen through True Sight its heart lights (×1.4). A shout only shoves it | glow jelly floats away, fog gone |

### Mid-boss: THE RED GRAMOPHONE (`gramophone`)
- Teaches the **counter-shout into an inhale with a BIG SHOUT** (hold X during the tell, release into the horn).
  The Hush's SILENCE DOME is beaten the same way, and the cocoon/lighthouse want BIG SHOUTs.
- INHALE: horn swings up, a lilac circle fills on the floor and pulls WAI in. A BIG SHOUT into the horn
  scratches the record → DAZED (×2.5, TAG). Too quiet: swallowed. Not countered: HUSH BLAST ring (jump) + muffle.
- SWEEP: the tonearm sweeps the record at knee height (jump it). BLARE: a wall of noise at WAI (step aside).
- Outside DAZED the music shakes paint off (×0.3). Phase 2 at 50 %: the Red Pen scratches an X into its record,
  a Megaphone Crab joins, double sweeps, faster inhales.

## Log
- 2026-11-12: read CONTENT_PLAN, level1 PROGRESS, harbor code. Design above.
- SoundWave.ts, MegaphoneCrab.ts, FogJelly.ts written; first look checked in the harbor (lathe winding fixed).
- District built: `BandstandPier.ts` (layout + geometry), `PierKit.ts` (decks, stilts, railings, lamps, barricades,
  textures), `PierDirector.ts` (gameplay), `FogVeil.ts` (fog hiding rule), `EchoGallery.ts` (challenge),
  `RedPenSky.ts` (the sky moment). Mid-boss `RedGramophone.ts` + `GramophoneLook.ts`. Shared `SoundWave.ts`.
- The first gate spot (−42.5, −51.6) sat inside an existing back-street house's collider (MuteHarbor house at
  (−41, −50)): the gate moved west to (−47.6, −49.7), the causeway with it. The house is untouched.
- The Fog Lamp first stood in the Fog Walk corridor (the bot wedged against it): moved to the yard-side corner.
- Jelly sting knock-back 5 → 2 (a sting on the walkway threw WAI off every time).
- HarborGuide: on the pier with a goal elsewhere, the arrow follows PierDirector.exitStep (bandstand → stair → yard →
  causeway → gate; the west side walks the zigzag back).

- Encounter 1 first had a Peeping Lamp (the Eye source) beside the two crabs: the bot was smudged in 20 s.
  Replaced by the **Lost & Found bell** on the ticket booth: SHOUT at it and it coughs up a lost Eye (only if
  WAI has none) — the level's verb, no combat pile-up. The yard is now crabs only.
- Bot run 7 (from the `pier` warp): gate → Eye 5 s → fog walk crossed 38 s → bandstand 46 s → Gramophone
  repainted 122 s → bridge down 130 s, 0 falls, no errors. Too quick: the bot walked past both crab
  encounters and its crossfire painted the spring. Added **encounter locks**: an iron turnstile between the
  yard and the Fog Walk (opens when both yard crabs are repainted) and a velvet-rope cordon round the
  carousel's spring (drops when the Barker, its crab and the jelly are repainted; no colliders, so spray
  still reaches the sketch — the director keeps WAI off the spring while it is up).
- The Gramophone woke to a BIG SHOUT aimed at a crab on the deck below: it now only hears shouts from the
  bandstand's own height.
- Open shells (crab horn, gramophone bell, gallery horns, carousel canopy, pavilion dome) lost their ink
  hulls: an inverted hull of an open lathe shows as a black disc inside the mouth. Their rims carry the ink.

- Walkway planks first ended square against the decks' edges at an angle: a wedge-shaped gap WAI slipped through.
  The end planks now run 1.2 m further and tuck 2 cm under the decks (never coplanar with them).
- A second spray can, `cp-carousel`, by the spring: a smudge in the Gramophone fight no longer sends WAI back over
  the fog. Falls off the pier use the session's own respawn (last spray can) minus half a heart.
- Run 8: the bot jumped a tonearm sweep at the bandstand's rim and sailed over the railing into the fog. A tall
  invisible ring (barrier) now stands over the parapet, open only at the ramp and the stair.
- Sky moment, first look: the X was two solid pink beams, filmed from the square through a tree. Now two brushed
  strokes revealed as the nib drags (the texture is cropped, not stretched), filmed from the channel side.
- Run 9 (from the `pier` warp, with locks): gate → Eye 5 s → turnstile → fog walk 32 s → carousel crowd → bandstand
  91 s → Gramophone repainted 180 s → bridge down 189 s (game time 177 s), 0 falls, no errors.
- Full run 1 stuck on the link (its waypoint sat inside the link, so arriving changed nothing): the waypoint is
  now on the carousel deck.

## Bot harness (docs/level2-expansion/bot)
- `vite.nohmr.mjs` (port 5199), headless Chrome on 9353:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9353 --user-data-dir=/tmp/wd-l2x/chrome --mute-audio --window-size=1280,720 about:blank`
- `prep.mjs harbor|plaza` loads a level; `pier.mjs [none|pier|gramophone] [--gallery]` plays the district;
  `h2bot.mjs pre|post --walk` is the old harbor bot split around the district; `full.sh` = the whole level.
- `cine.mjs name px py pz lx ly lz` holds a camera pose for a screenshot; `spawn.mjs` drops a test creature by WAI.
- `frames.mjs NAME <arm js> <go js>` stops the loop when a cut-in starts and strips its frames (1/60 s, every 0.1 s to 1 s,
  then every 0.5 s); see BOATS.md. `h2bot.mjs` crosses the moored boats deck to deck (`crossDecks`).

## Files
| File | What |
|---|---|
| `src/enemy/SoundWave.ts` | pooled travelling sound walls (blares: step aside / roll) and floor rings (jump) |
| `src/enemy/MegaphoneCrab.ts` | creature 1 (`megacrab`), also the Barker (size 1.45) and the Gramophone's helper |
| `src/enemy/FogJelly.ts` | creature 2 (`fogjelly`) |
| `src/enemy/GramophoneLook.ts`, `src/enemy/RedGramophone.ts` | the mid-boss's model and brain (`gramophone`) |
| `src/level/harbor/PierKit.ts` | the pier's modelling kit + textures + locks (turnstile, cordon) |
| `src/level/harbor/BandstandPier.ts` | the district's layout and geometry (`PIER`, `inPier`, `buildPier`) |
| `src/level/harbor/PierDirector.ts` | the district's gameplay, guide routes in and out, hints, dev clears |
| `src/level/harbor/FogVeil.ts` | what the jellies' fog hides and when True Sight shows it |
| `src/level/harbor/EchoGallery.ts` | the optional challenge |
| `src/level/harbor/RedPenSky.ts` | the Red Pen's sky moment (strike / unstrike of the Bell Bridge) |

## Shared-file edits (kept minimal)
- `src/level/HarborSession.ts`: imports; `pierBuilt` + `pier` fields; the level api object named (`levelApi`) so the pier
  is built with it; PierDirector constructed after the Hush; `wakeClock` calls `pier.clockRang(n)` instead of lowering
  the bridge (two `after()` calls removed); `pier.see(gazers)` after the gaze update; `pier.step(dt)` after
  `level.update`; `guideGoal`/`objective` ask the pier while the bridge is up; `debugStages` + warps `pier`,
  `gramophone` (later indices shifted by 2); devInfo stages/labels/bounds; `pier.dispose()`.
- `src/level/harbor/HarborGuide.ts`: on the pier with the goal elsewhere, route by `pier.exitStep` (+ import).
- `src/coop/Companion.ts`: `ATTACK_STATES` += OPEN, BLARE, CATCH, RETURN, STING, BLARE_TELL, SWEEP_TELL, SWEEP, INHALE, HUSH.
- `src/i18n/zh.ts`: one appended block between `// ── level-2 expansion (Bandstand Pier) ──` and its end marker
  (regenerate with `python3 docs/level2-expansion/bot/zh_add.py`; `i18ncheck.py` lists strings without zh).
- Not touched: main.ts, DevMenu.ts (harbor stages come from `HarborSession.devInfo`), levels.ts, MuteHarbor.ts.

- 2026-11-14 (art pass, docs/art-pass/NOTES.md): sound is drawn by `render/SoundFx` + `render/SoundShapes` now. SoundWave draws
  each blare / blast front at its exact hit radius and height (red-pen red; the crab's returned shout in WAI's colours; the Hush
  blast in lilac), marks fly off it, a hit leaves a splat; `SoundWaves.tell()` draws the blare's footprint (MegaphoneCrab calls it).
  The lighthouse horn and the exit paper boat are Tripo models (`harbor/HarborArt.ts`).

- 2026-11-14 (stairs, docs/regression/FIXES_STAIRS.md): the Bandstand Pier stairways carry an invisible nosing ramp
  (`PhysicsWorld.addNosingRamp`); the jetty stair is 2 m longer (31°) and `HarborTerrain.jettyStair()` cuts the headland's
  ground under it (the ground used to cover its top 1.4 m: nobody could climb back from the jetty).
