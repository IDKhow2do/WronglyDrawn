# Mute Harbor interference pass: working notes

Status: in progress. Updated after each step so an interrupted run can resume.

## Tools (in /tmp/wdif, not in the repo)
- `flick.mjs`: renders one pose, then 6 copies with ±1 mm camera jitter, in one JS task. It diffs each copy against the base. `multiPx` = pixels that change in 2 or more copies. `blobTiles` = 16×16 tiles with 12 or more such pixels. Control (same pose twice) = 0 px on every pose.
- `coplanar.js/.mjs`: walks all triangles (2.19 M) in a 1 m grid. It flags pairs from different meshes or parts that are near-coplanar (cos > 0.998), closer than 1 cm, overlap in area, and render from a common side. Runtime is about 6 min.
- `pick.mjs`: raycasts a pixel and lists every hit within 8 cm of the first hit. It shows z-fight partners.
- `probe.mjs` and `bunt.mjs`: raycast tests for lantern strings and lanterns, bunting strings and flag tips, and tree canopies against all other geometry.
- `before/` = a copy of the tree with my edits reverted. It is served on 5196 for the before shots.

## Found and fixed
1. **Exit paper-boat sail flicker (the user's report).** Cause: the sail was a flat `ShapeGeometry` (DoubleSide) with `addOutline`. The inverted hull of a zero-thickness shape lies in the sail's own plane. Its BackSide black faces z-fight the sail from one side, so the whole sail flickers yellow and black. Fix: MuteHarbor.ts exit boat. The sail is now a 6 cm `ExtrudeGeometry` solid, so the hull wraps it. Flicker at x_jetty dropped from 6585 to 872 multiPx. The whole-sail red blob is gone.
2. **Banners and awnings on every house (ArchKit) flicker for the same reason.** Flat `ShapeGeometry` and planes get `addOutline` → coplanar hull. Fix in my scope: `dropFlatInk(root)` in HarborKit.ts. It removes the ink hulls of geometry thinner than 5 mm, and it runs in MuteHarbor before `mergeStaticInk`. `StaticBatch.add` also skips auto-hulls for flat pieces. Root fix for the lead: `addOutline` in src/render/Materials.ts should return early when the geometry's smallest bbox axis is under 5 mm. That fixes Blind Plaza too. Before → after: victory 1184 → 355 multiPx, oldtown 6701 → 794, lagoon 5038 → 2166.
3. **Arena parapet joints.** 34 straight 1.8 m boxes on a 9.2 m circle overlapped by 10 cm at 10.6°, and their faces fought at every joint. Fix: the visual blocks are now mitred and meet edge to edge. The colliders are the same boxes as before.
4. **Ferry paddle-box sun face.** It was 1 cm proud of the box end cap. Fix: 2.5 cm (HarborModels.ts).
5. **Raft clipping the ferry stern.** The raft at (-2.2, 3.6) sat about 1 m inside the hull and its collider was inside the ferry's. Fix: moved to (-5.0, 3.6). Its paint-drop line moved with it. The bot route must be re-checked.
6. **Bunting string 6 on the boardwalk.** It ran 3 m through a house from the house's west wall. Fix: re-anchored at (28.6, 7, 15.75), on the south wall.
7. **Trees.** The canopy at (3.5, -49) sat in a roof eave; moved to (5.2, -49). The canopy at (36, -30) was in a wall; moved to (34.8, -30). The probe now reports both as clear.
8. **Old-town lantern string (x = -37).** Lanterns pressed into the wall and sill. Fix: moved to x = -36. The probe reports it as clear.

9. **Small decal gaps that the coplanar sweep found** (HarborModels.ts):
   - Lighthouse door plane vs fanlight: 5 mm → 25 mm (door at r0 + 0.06).
   - Lighthouse door step: its top was flush with the grass (1 mm). Raised 3 cm.
   - Ferry wheelhouse round pane: 1.5 cm → 2.5 cm off the wall.
   - Ferry bay-window pane: 0.8 cm → 2.2 cm.

## Numbers
- Coplanar sweep, before → after fixes 1–8 (fix 9 is not in this run):
  - All rows: 803 rows / 650 m² → 666 rows / 264 m².
  - Flat double-sided pieces + their own ink: 56 rows / 83 m² → 4 rows / 0.5 m².
  - landscape-far: 443 m² → 150 m².
- Jitter flicker (multiPx), before (B) → after (A2): see flicker_before.json and flicker_after.json, plus flicker_exit_*.json.
  - victory: 1184 → 50.
  - oldtown: 6701 → 160.
  - lagoon: 5038 → 998.
  - arena: 1684 → 220.
  - x_jetty (exit sail): 6585 → 439.
  - x_sail_far: 5386 → 223.
  - B used different (bad) camera poses for square, clock, quay_e, boardwalk and jetty_boat: they sat inside walls. Do not compare those rows.

## Not mine or left open
- landscape-far (Landscape.ts) has coplanar faces and ink at y = -3.73 around (-18, -90). They are under water and far away.
- Flicker that remains is mostly edge aliasing on Lines (bunting and lantern strings) and alpha-tested nets.
- Depth precision: near = 0.1, far = 400. At 90 m one depth step is about 5 mm. Decals that sit less than 1 cm off a surface can fight from the victory camera. Suggestion for src/render: near 0.2–0.3.

## Victory pose (levels.ts is the lead's file)
- The current pose looks over the market roofs and a big roof fills the foreground. The exit boat at the jetty (29, -1.2, -37) is hidden behind the right-hand roofs.
- Suggested pose D4: pos (38, 18, -58), look (14, 3, -30), fov 58. It looks from over the sea mouth back at the town. The paper boat with its sail sits at the jetty in the lower middle, with the arena, the lighthouse and the town behind.
- Evidence: victory_candidates_1.jpg / _2.jpg and victory_suggested_D4.jpg. The flicker test at D4 gives 0 blob tiles.
- Add a slow drift like the title pose, about ±1 m in x.

## Verification
- `npx tsc --noEmit -p .` passes.
- `window.__errs` is empty on every run.
- Bot `all` ends with `end "Mute Harbor complete!" errs []` (bot_complete.jpg).
  - One step in that run timed out: "square moths repainted". The bot then carried on and the clock woke 8 s later. That step is moth combat in the clock square, which none of these fixes touch.

## Status
Done. Not committed.
