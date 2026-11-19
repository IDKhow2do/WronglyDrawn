# Blind Plaza v3 — "The Torn Canvas"

## Story (told in 3 short beats, all in-game)
The city of Wrongly Drawn is a painting. One night **the Eraser** — a pink rubber blob that
corrupts everything it rubs — rubbed out the city's **eyes**. The three Guardians of the plaza went
blind, the hill road up to the **Gate Tower** crumbled into eraser dust, and the Tower itself was
sealed shut with a corrupted eye.

**WAI** is the last doodle a kid drew before the lights went out: a box-headed kid with a crown, a
red cape and a spray can. He wakes on the harbor of a torn piece of canvas floating in a sky of paint.

1. **Intro (harbor):** "The Eraser rubbed out the city's eyes. Wake its Guardians." (+ the Eye lesson
   from the gentle starter lamp.)
2. **Each Guardian woken** redraws one segment of the hill road (shown in a camera beat).
3. **Summit:** the Sealed Gate wakes up corrupted — the boss. Repaint it and the plaza can see again.

## Shape: a box-garden on a floating island
- The whole level is **one torn chunk of canvas floating in the sky** (≈110 × 100 m). The edge is
  torn paper with paint dripping off into the clouds. That is the boundary: you can always see it,
  and nothing exists past it.
- Falling off the edge or into the canal = **redrawn at the last checkpoint** (sketch-in effect,
  −½ heart). Nobody ever gets stuck out of bounds.
- **Every roof that is not part of a route is pitched (too steep to stand on) or out of reach.**
  Every walkable roof is deliberately a route with something on it.
- Every building sits on the terrain with a foundation going below it: **nothing floats**.

## Terrain tiers (y = height in m; x → east, z → south)
```
                         z -50  ┌─────────── SUMMIT (y 14) Gate Tower + boss arena ───────────┐
                                │      switchback HILL ROAD (y 2 → 14), 3 broken segments      │
                                │  SLEEPY CLIFF: a giant face carved in the hill's south cliff │
   WEST: CANAL QUARTER          ├──────────────────────────────────────────────────────────────┤  EAST: WORKYARD TERRACE
   sunken gorge (floor y -2.5,  │              HUB PLAZA  (y 1.5)                              │  (y 4.5, ramp + stairs up)
   water y -4) at x ≈ -30;      │   Blind Statue · fountain · starter lamp · benches          │  walled mutant yard,
   far bank (y 0) → Gatehouse   │                                                              │  scaffold → rooftop (y 9)
   bastion (y 3) on the W edge  ├──────── 3 wide steps down ───────────────────────────────────┤  with the roof lamp
                                │         HARBOR STEPS (y 0): spawn dock at the south tip      │
                         z +50  └──────────────────────────────────────────────────────────────┘
```
- **Harbor (y 0)** — spawn on a dock at the south tip; short street up 3 wide steps to the hub.
- **Hub Plaza (y 1.5)** — the heart. Blind Statue (west half), fountain (centre), starter lamp (east).
  Every district is visible from here.
- **Canal Quarter (west)** — a gorge cut into the island: stairs down to the towpath (y −2.5), water
  at −4, the Sleepy Cliff's gaze redraws the bridge; the far bank holds the **Gatehouse** on a bastion
  (y 3) whose mouth lowers the drawbridge back.
- **Workyard Terrace (east, y 4.5)** — ramp + stairs up; the walled yard is the mutant's arena; a
  scaffold and crates lead to one designed rooftop (y 9) with the roof lamp (crown drop).
- **The Hill (north)** — rises from y 2 to y 14 along a switchback road cut into it. Its south face
  is a cliff overlooking the hub with the **Sleepy Cliff** face carved into it. The road has
  3 eraser-dust gaps; each Guardian woken redraws one.
- **Summit (y 14)** — round plaza in front of the Gate Tower = boss arena; a low parapet all round.

## Guardians (unchanged puzzles, new places)
| Guardian | where | wakes with | redraws |
|---|---|---|---|
| Sleepy Cliff | hill's south cliff, faces the hub | EYE (lend) | canal bridge + road segment 1 |
| Gatehouse | far canal bank bastion | MOUTH (lend) | drawbridge + road segment 2 |
| Blind Statue | hub plaza | EYE (lend) | road segment 3 (it looks up at the tower) |

## Boss: the Sealed Gate
The Gate Tower's eye-and-teeth facade wakes corrupted. Arena = the summit plaza.
- **Phase 1:** eye beam sweeps (jump/dodge), paint the eye.
- **Phase 2:** spits eraser grubs + teeth slam shockwaves (jump the rings); paint the teeth.
- **Phase 3:** both, faster; the eye opens wide — final repaint → cinematic, level complete.

## Concept art direction
Same style as the title painting (`public/assets/title-blind-plaza.webp`): thick graffiti impasto,
Basquiat crowns, wonky Picasso faces on buildings, pink/orange/cobalt/turquoise/yellow, bunting.
The island must read as a floating diorama: torn canvas edges, paint drips falling into clouds,
real height differences (gorge, terrace, hill with switchbacks, summit tower).

---

# v3.1 — make it astonishing (user feedback 2026-11-05)

**Clear condition (shown in the HUD):** wake the 3 Guardians → climb the road → repaint the Eraser.
Crowns, paint drops and secrets are OPTIONAL (labelled so).

## Story set pieces (the level is a sequence of surprises, not a checklist)
1. **Drawn into being (harbor):** a giant kid's pencil sketches WAI on the dock; colour floods in.
   Above, the **Eraser** (a giant pink rubber with a sneer) rubs the eyes off the city's faces —
   every building face goes blank in a wave. It laughs and rolls up the hill to the Tower.
2. **Each Guardian woken** redraws one erased stretch of the road *in a camera beat*: the pencil
   hand appears in the sky and sketches the missing road, colour floods in.
3. **The Eraser comes down:** when the third Guardian wakes, the Eraser rolls DOWN the switchback
   road at you, rubbing it away behind it → short chase / dodge-it set piece, then it retreats to
   the summit.
4. **Boss on the summit:** the Eraser — repaint it in 3 phases (rubbing waves you jump, crumbs
   that become grubs, a slam). Repainted, it turns into a giant pink pencil eraser *that the kid
   picks up* — the city's eyes come back in a wave. Level complete.

## Always something happening (ambient surprises)
- Buildings have faces that **watch WAI**, blink, sneeze dust, yawn; spray one and it giggles.
- Doodle critters: paper birds that scatter, a scribble cat that runs off with a paint drop,
  paper planes that loop past.
- Pencil sketch lines that draw new things as you approach (a crate, a ramp, a spring).
- Paint geysers / **bounce springs** (paint a spring outline → it launches you).
- **Paint surfing:** dodge (C) onto your own fresh paint and WAI slides fast like on ice.

## Boundaries
- Island = the map. No standable roof anywhere unless it is a designed route; all roofs pitched.
- Falling off = redrawn at the last spray can.

## Look
- No plain boxes: every building is wonky (leaning, bulging, tapered, crooked pitched roof,
  overhangs, chimneys), plus Tripo hero buildings.
