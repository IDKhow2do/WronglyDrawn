# Quality sweep — 2026-11-11

24 fixed views across both levels in the Graffiti style, HUD hidden, High graphics. The contact sheets are in [quality-sweep/](quality-sweep/): `s-p1…3` are Blind Plaza and `s-h1…3` are Mute Harbor.

**Not covered:** menus and HUD, the other three art styles, and things only visible in motion (animation, effects, water). Three Mute Harbor poses and one Blind Plaza pose landed inside or against a building, so the stairs, Clock Square close-up, net sheds and the hill's back side need a second look.

**Bar:** the sculpted hero pieces (the tall face houses, the statue, the big lamp, the Eraser, the new clock tower and ferry) set the standard. An item is on this list if it looks clearly cheaper than those when both are on screen.

## Blind Plaza

| # | Where | What looks cheap | Fix | Size |
|---|---|---|---|---|
| P1 | Everywhere | Roofs are flat red or maroon prisms with a faint tile texture and no eaves, ridge or dormers. They sit right next to sculpted roofs. | Give `wonkyBuilding` roofs real tiles: overhanging eaves, a ridge cap, tile rows in the geometry, the odd dormer. | M |
| P2 | Hub and upper town | Box houses: flat walls with one painted face. The side walls are plain bricks, apart from the new arched windows. | Add corner stones, a plinth, a cornice under the roof, shutters and a drainpipe from the kit, so the silhouette isn't a box. | M |
| P3 | Hub, terrace | Crates and bollards: plain cubes and cylinders with a noisy texture (the dark green cube, the striped block, the red-capped posts). | Model them: planked crates with corner irons, bollards with a base ring and cap, paint cans with a rim and handle. | S |
| P4 | Sky | Clouds are flat white cut-outs with a purple scribble that reads as a watermark. | Layered puffy cloud sprites with a painted shadow side, or the painted-sky clouds from the comic styles. | S |
| P5 | Hub and terrace | Street lamps: a black pipe with a flat yellow disc, standing beside the sculpted big lamp. | A small cast-iron lamp from a lathe profile: base, collar, glass globe, cap. | S |
| P6 | Dock | The white "torn paper" rim is a flat bright band with hard corners. | Give it a ragged edge and a slight curl, and tone it to cream. | S |
| P7 | Upper town | Grass is a loud flat confetti texture with sparse purple tufts. | A calmer painted grass texture, with denser tufts and flowers near paths. | S |
| P8 | Switchback road | Tall cliff walls are one brick texture stretched over large faces, and the hedge bushes are single low-poly blobs. | Add strata bands, ledges and a few plants to the cliff, and build the bushes from 3–4 blobs. | M |
| P9 | Summit | The arena wall is a ring of checkered blocks with thick outlines. | Shaped merlons with caps and a gate arch at the stairs. | S |
| P10 | Canal | The water is a flat turquoise sheet with no edge foam or movement visible in stills. | Reuse the fountain's water shader: ripples, an edge foam line, a slightly darker depth tint. | M |
| P11 | Terrace | The low patchwork wall is flat boxes with a busy quilt texture. | A stone parapet with a cap, with the quilt pattern only as painted panels. | S |
| P12 | Far background | The pale blue crenellated tower and the stacked "pancake" rocks read as placeholders. | Give the tower a texture and outline, and vary the rock stacks. | S |

## Mute Harbor

| # | Where | What looks cheap | Fix | Size |
|---|---|---|---|---|
| H1 | Everywhere | Same flat roofs as P1, all in red. | Same roof work as P1, plus teal, slate and coral tints so the town isn't one red mass. | with P1 |
| H2 | Landing, boardwalk | Plank floors are a flat purple striped texture with no boards, nails or wear. | Painted planks like level 1's dock: individual boards, gaps, nails, colour variation. | S |
| H3 | Town | Houses are the same boxes as P2, and their big side walls are bare. | Same kit work as P2. | with P2 |
| H4 | Square, quay | Lollipop trees: a stick with a faceted blob. | Trunk with a flare, and a canopy of 3–5 painted blobs with an outline. | S |
| H5 | Boardwalk | Paper lanterns on strings are flat dark silhouettes. | Give them ribs, a cap and tassel, and a warm glow once the harbor wakes. | S |
| H6 | Quay | The quay wall is one blue brick texture stretched, and the canal edge has a jagged saw-tooth seam where the ground meets the water. | A stone cap along the edge, mooring rings, and a smoothed edge mesh. | M |
| H7 | Arena | The checkered wall and floor are much louder than anything else, and the wall is plain blocks. | Same as P9. Keep the compass rose and calm the floor checks. | S |
| H8 | Lighthouse | The base rocks are translucent faceted blobs, and the gallery spikes are plain white cones. | Rock stacks like the outcrops, and proper lamp-room corbels. | S |
| H9 | Lagoon | The water is a flat teal sheet. | Same water work as P10. | with P10 |
| H10 | Quay | Street lamps are the same pipe-and-disc as P5. | Same lamp as P5. | with P5 |
| H11 | Net sheds, fish racks, boardwalk rails | Not rebuilt in the harbor pass, and not visible in this sweep. | Rebuild with the harbor kit. | M |
| H12 | Level-wide | The ground is a dark purple brick texture that reads as muddy next to level 1's bright cobbles. | A cobble set with dusk tints and lighter joints. | S |

## What already holds up

The sculpted face houses, the statue and big lamp, the Sleepy Cliff mural, the fountain, the Eraser, the new clock tower, ferry, lighthouse body, market gate and stalls, the bunting, and the dock planks.

## Suggested order

1. **Roofs (P1, H1).** They are in almost every frame of both levels, so this closes the biggest gap.
2. **Houses (P2, H3).**
3. **Small props (P3, P5, H4, H5, H10).** Crates, bollards, lamps, trees, lanterns.
4. **Water (P10, H9).**
5. **Floors and grass (H2, H12, P7).**
6. **The rest:** clouds, arena walls, cliffs, quay edge, net sheds.

## Progress

**2026-11-11: roofs (P1, H1) done.** Screenshots are in [quality-sweep/after-roofs/](quality-sweep/after-roofs/).
- Every wonky-house roof on both levels now has overlapping tile rows with a scalloped edge and per-tile shade, overhanging eaves, a ridge of rounded cap tiles, a timber A-frame on each gable with wall plaster behind it, and a dormer on about 60% of the bigger roofs.
- Tiles use the roof brushwork with its colour removed, tinted per roof: terracotta, pink, blue, amber, teal and purple in Blind Plaza; coral, teal, indigo, pink, sea blue and peach in Mute Harbor.
- Colliders are unchanged (the old prism is still the roof's core and its collider).
- The sculpted hero houses, the clock tower and other custom roofs are not affected.
