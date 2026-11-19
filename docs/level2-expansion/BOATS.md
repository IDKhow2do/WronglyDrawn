# Level 2 · the ferry close-up and the boat crossing

The author's report: the close-up after the Mouth goes on the Foghorn Ferry starts blocked. Then three boats
arrive and a drawn bridge is laid over them. The bridge is not needed: the boats are the crossing.

## Found
- Guardian 1 is the Foghorn Ferry (`MuteHarbor.ts`, `ferryAt` (2, -1.4, 1.6)). It is `noCollider`; its drawn
  shape is solid through static hulls (`buildFerry` solids).
- Lending the Mouth runs `OrganHost.closeUp()` (1.5 s three-quarter push-in). 0.4 s later
  `HarborStory.ferryBeat()` replaces it with two shots (horn, then the boats sailing in).
- `closeUp().safe()` sphere-casts from the socket outward and skips only the host's own collider. The ferry has
  none, so the ferry's static hulls stop the cast at once. The camera then sits ≤ 0.8 m from the socket.
- The boats: `buildSailBoat` dinghies, three of them at x = pcx ± 2.7 (pcx = -15.375), z = 16 (`PONTOON_Z`).
  Gunwale at about -0.25, the floor at about -0.5. The quays: market 0.6 (east), old quay 1.5 (west).
  The bridge: `pontoonDeck` (three `ramp()` pieces at 0.95, trestles, rope colliders) drawn once all boats dock.
- WAI: jump 1.35 m, autostep 0.55 m. Water: a fall below -1.4 teleports WAI to `lastSafe` (last static ground
  above -0.8), with one half-heart of damage.
- The co-op partner's `NavGrid` bakes walk / jump / drop / gap edges from the real colliders: boat decks
  with colliders are routable with no extra code.

## What blocked the shot
Frame strip `shots/boats_ferry_before_strip.jpg`. 0–0.4 s: the Mouth close-up (clear). Then at 0.4 s
`ferryBeat` cut it short, and its first shot (0.5–3.0 s) showed only lilac and pink planes: the camera sat
inside the ferry at (3.9, 2.6, 2.3). That shot looked at `spots.ferry + (1.5, 0.6, 0)` = (3.5, 1.2, 1.6),
a point inside the deckhouse. Since the ferry became solid piece by piece (docs/clip-fix), every sight line
to that point hits the ferry's own walls. The shot planner found no clear spot, and the per-frame sweep
pulled the camera to 1.6 m from the point: inside the boat.

## Decisions
- `ferryBeat` shot 1 looks at the Mouth socket on the horn (the quay side, outside the hull). The authored
  camera spots are clear of it (`shotClear` true for the start and the end).
- `ferryBeat` starts at 1.4 s (was 0.4 s): the Mouth close-up (`OrganHost.closeUp`, 1.5 s) plays out, and no
  gameplay frame flashes between the two. The boats still dock during its second shot.
- The bridge (`pontoonDeck`: 3 plank ramps, trestles, rope colliders, the pencil sketch) is deleted.
- The boats are the crossing. `buildSailBoat` now has a plank deck flush with its gunwale (y 0.8), fenders,
  and returns its solids (hull, mast). They moor square to the channel (it runs at −10.6° to z), beam 2.35 m,
  0.25 m between gunwales, 0.23 m off each wall. Deck tops step up −0.15 · 0.2 · 0.55 from the market quay
  (0.6) to the old quay (1.5): 0.75 down, 0.35 up, 0.35 up, then a 0.95 m jump onto the old quay (jump 1.35 m).
- First try had 0.5 m gaps: the hulls taper below the deck, and WAI walking off one deck slid down between
  two hulls into the water (again and again while the stick was held). Now the gaps are narrower than WAI and
  a solid fender block fills each gap (boat to boat, boat to wall) 0.1 m under the lower deck.
  Walking into the next, higher boat's side stops WAI; a hop crosses. (`bot/gaptest.sh`)
  Each boat's height scale follows from its deck (waterline 1.1 units below the deck); lengths 3.4 · 3.7 · 4.1.
- Colliders: convex hulls of the drawn hull and mast, at the rest pose, made when the boats moor. The docked
  bob (±3 cm, roll ±0.012) is drawing only, as on the ferry.
- Landings: a pair of bollards beside each end, mooring lines from the outer boats. Falling in: the level's
  water rule puts WAI back on the last deck or quay he stood on (decks are static colliders above water).
- Guide: the market ↔ old-quay portal carries the decks as stepping stones (`spots.decks`); on the crossing
  the arrow points at the next deck.
- Co-op partner: no code. Her `NavGrid` bakes jump / drop / gap edges from the deck colliders.
  `bot/cooptest.sh` (rule brain): she was on the old quay 3 s after WAI, with no teleport.

## Level 2 cut-ins, first second frame by frame (strips in shots/boats_*_strip.jpg)
Taken with the game loop stopped and stepped by `__WD.advance` (bot: /tmp copy of bot/ + frames.mjs, cines.sh).

| cut-in | where | result |
|---|---|---|
| Mouth on the Foghorn Ferry (close-up + horn + boats) | OrganHost.closeUp, HarborStory.ferryBeat | FIXED (was inside the ferry 0.5–3.0 s) |
| Arrival (tower door, town, lighthouse) | HarborStory.intro | pass |
| Clock Tower rings (face, then the north channel) | HarborStory.clockBeat | pass |
| Red Pen strikes the Bell Bridge (bridge, pier gate) | RedPenSky.strike | pass at the start; its second shot (pier gate, from 5.6 s) has a house face filling the right ~40 % |
| Red Gramophone intro | PierDirector.gramoIntro | pass |
| The X comes off the Bell Bridge | RedPenSky.unstrike | pass |
| Lighthouse sings / the Hush rises | HarborStory.lighthouseBeat | pass |
| Hush boss intro | HarborStory.bossIntro | pass |
| Finale | HarborStory.finale | pass |
| Departure on the paper boat | LevelOutro (story agent) | not taken here |

## Done
- Ferry shot fixed (before / after strips: shots/boats_ferry_before_strip.jpg, boats_ferry_after_strip.jpg).
- Bridge code deleted (pontoon deck, trestles, rope colliders, plank texture, pencil sketch on docking).
- Decked boats, deck colliders, landing bollards and mooring lines; guide steps deck by deck.
- Text: the docking toast and the crossing hint say hop deck to deck (en + zh); the dev stage note too.
- Bot: h2bot.mjs `crossDecks()` walks to the market landing, hops three decks, jumps onto the old quay
  (3 tries). `crosstest.mjs N` repeats the crossing N times; `midhop.mjs` takes the boat / mid-hop pictures.
- Pictures: shots/boats_in_place_side.jpg, boats_in_place_top.jpg, boats_wai_midhop_e_to_m.jpg, boats_wai_midhop_m_to_w.jpg.

## Verified
- `npx tsc --noEmit -p .` clean.
- Full level-2 Gentle run from a fresh load (`bot/full.sh`, all walking): complete in 565 s, no ✗ step, no
  console errors; the deck crossing passed on the first try.

## Next
- RedPenSky's pier-gate shot: move it off the house on its right (owner of RedPen* decides).
