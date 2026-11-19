# Art pass plan: the "Sunbleached Comic" look, done properly

**Reference:** Jav's Three.js prototype ("Moebius × Roger Dean open world"). We borrow its principles, not its designs. Every shape and landmark below is our own.

## Starting point

- **Today's switch only recolours.** The *Sunbleached Comic* style ([src/render/ArtStyle.ts](../src/render/ArtStyle.ts)) remaps textures and colours, light, haze and sky. It still has the thick-paint relief (normal maps), the heavy black outline hulls and our current shapes.
- **Terrain:** a heightfield function (`heightAt` in [src/level/Terrain.ts](../src/level/Terrain.ts)) drives the render mesh, the physics and prop placement. Cliffs are just steep triangles with a strata texture.
- **Buildings:** the wonky gable houses ([src/level/WonkyBuilding.ts](../src/level/WonkyBuilding.ts)) carry the story faces.
- **Distance:** "torn canvas islands" made of upside-down cones and boxes, plus a cylinder tower (`buildDistant` in [src/level/BlindPlaza.ts](../src/level/BlindPlaza.ts)).

## What makes the reference work (and what we lack)

| Principle | Reference | Us today |
|---|---|---|
| Line | Thin, even ink lines on every silhouette and crease | Thick inverted-hull outlines whose weight varies with object size |
| Shading | Flat two-tone: a lit side and a shadow side, and shadows read as shapes | Soft physically-lit shading plus impasto bumps everywhere |
| Ground shape | Layered, flat-topped mesa slabs and terraces stepping up and down | Smooth heightfield with jagged steep cliffs |
| Scale | Huge slender landmarks (arches, rings, towers) far away in haze | Small floating cones; the horizon is mostly empty sky |
| Colour | Muted world with one or two accents | Everything at full saturation |
| Air | Strong warm haze in layers | Now available through the style switch |

## Phases

### Phase 1: clean-line rendering (style-only, switchable)
- **Screen-space ink:** a post pass that finds edges from depth and normals and draws thin, constant-width lines in the style's ink colour. Graffiti keeps its hulls. The Low quality tier also keeps hulls (cheaper).
- **Flat two-tone shading:** relief off (normal strength 0), and the light quantised to lit/shadow plus a soft band. This needs one shader variant, compiled behind the paint wipe when you switch styles.
- **Hatching in cast shadows:** a fine diagonal hatch pattern fixed in world space, drawn only inside shadow areas.
- **Sky:** a painted gradient, layered cumulus with flat bottoms, a sun disc and haze bands near the horizon.
- *Done when:* a still frame reads as a clean comic panel; it costs at most +1.5 ms per frame on the Medium tier; it works on both levels.

### Phase 2: world shape for Blind Plaza (helps every style)
- **Mesa terraces:** the island rim, the Sleepy Cliff and the switchback hill get stacked flat-topped slab shells, with slightly offset layers and a clean lip on each step. Colliders still come from `heightAt`, so gameplay doesn't change.
- **Outcrops:** the low-poly boulders become slab stacks with consistent line weight.
- **Far landmarks:** original designs at 150–300 m in the haze: a broken arch bridge between floating mesas, a ring-balcony spire, a colonnade on a sky island, and a redesigned Correction Tower. Low-poly, fogged, with no physics.
- **Ground life:** clumps of instanced lavender plants and sandy paths worn between landmarks.
- *Done when:* the title shot and the hub view have a layered silhouette and visible depth, with no change to play spaces or the bot's route.

### Phase 3: architecture kit
- **New pieces:** cream arches, domes, ring balconies, awnings and banners (one red accent), as new options in the building kit.
- **Hero houses:** they keep their story faces, but take cream walls with linework in this style.
- **Mid-distance houses:** the flat blocks (audit item 7) are rebuilt with the kit.

### Phase 4: Mute Harbor
Mesa headlands, sea stacks, a layered lagoon edge, distant lighthouses and arches, and a dusk variant of the palette.

### Phase 5: budget and phones
Draw-call and triangle budgets per tier, instancing for repeated pieces, a check on low-end frame time, and keeping the touch HUD readable on pale scenes.

## Decisions for you

1. **Scope:** Phase 1 only (rendering, about 1 session), Phases 1–2 (adds new shapes to Blind Plaza, about 2–3 sessions), or the whole plan.
2. **Default look:** should *Sunbleached Comic* become the default once it is done, with Graffiti as the alternative, or stay an option?
3. **Graffiti identity:** in the comic style, should the player's spray paint and the story stickers stay loud? I recommend yes: they become the accent colour, like the orange suit in the reference.

**Risks:**
- The screen-space outline pass needs a depth+normal render, which is the first post-processing in the game.
- New terrain shells must line up with the existing colliders.
- Both would be checked with the playtest bot and before/after screenshots.

## Progress

**2026-11-09: Phases 1–2 built (Blind Plaza).**

**Phase 1: clean-line rendering**
- **Ink pass** ([src/render/InkPass.ts](../src/render/InkPass.ts)): lines from depth jumps, creases and colour edges.
  - Width is constant (about 1 px at 1080p) and lines thin out into the haze.
  - On in the Sunbleached Comic, Storybook and Riso styles, where it replaces the outline hulls. Off on the Low tier.
- **Two-tone light and hatching** ([src/render/ComicShading.ts](../src/render/ComicShading.ts)):
  - Sun shading snaps to lit or shadow; hatching sits in world space inside shadows.
  - Paint relief is cut to 15%.
  - On in Sunbleached Comic and Riso Print. Switching styles recompiles behind a paint wipe.
- **Painted sky:** a 2048-wide panorama with a sun glow, a horizon haze band and flat-bottomed cumulus. It replaces the scribble clouds.
- **Fix:** styles now give each material its own styled texture copy. Swapping images in place never reached the GPU after the first upload.

**Phase 2: world shape** ([src/level/Landscape.ts](../src/level/Landscape.ts), decor only, no colliders)
- Eight floating mesas built from offset, tall-walled slabs replace the upside-down cones. They carry original architecture: a ring-balcony spire, two colonnades, a domed hall, and an arch whose bridge reaches toward the next mesa and breaks off.
- The Correction Tower gets a stepped plinth and three ring balconies.
- Slab outcrops sit on the east high ground. That ground is unreachable, and the road legs and summit are kept clear.
- About 900 lavender blades in clumps on the grass.

**Not done in this pass**
- Terracing of the walkable cliffs and hill: it would mean new colliders and a bot re-route.
- Mute Harbor (Phase 4).
- The architecture kit (Phase 3).

**2026-11-09: Phase 3, architecture kit** ([src/level/ArchKit.ts](../src/level/ArchKit.ts)). Screenshots are in [art-styles/phase3/](art-styles/phase3/).
- Every wonky house (Blind Plaza and Mute Harbor) now gets:
  - arched windows with cream surrounds, keystones, sills and muntins on its plain side walls, one row per floor;
  - a ring balcony on corbels high on one side, on about 70% of tall houses;
  - a cupola with a dome and finial on the ridge instead of the chimney, on about 35% of houses;
  - a striped awning over the door;
  - a red banner as the single accent colour, on about 45% of houses.
- Pieces follow each wall's own bend (bulge, taper, twist and lean), so nothing sinks in or floats off.
- It is visual only: no colliders, and all of it sits flush or above head height.
- The kit uses the painted textures, so every art style restyles it.
- The sculpted hero houses (glTF models) are unchanged; the style remap already recolours them.

**2026-11-09: Phase 4, Mute Harbor.** Screenshots are in [art-styles/phase4/](art-styles/phase4/).
- **Shared kit:** the slab and mesa builders are now a shared `landscapeKit` in [src/level/Landscape.ts](../src/level/Landscape.ts), with a separate rock tint per level.
- **Sea stacks:** nine tall slab columns rise out of the cloud sea around the island's torn edge. They stand outside the island, so there is no gameplay contact.
- **Far mesas:** six floating mesas in the dusk haze replace the flat dome silhouettes. They carry two lighthouses (red bands, lit lamp rooms), an arch, a colonnade and a ring spire. The far factory chimney (the next level's hint) is kept.
- **Dusk variants:** each comic style now has a dusk variant (sky, haze, sun, sky light, exposure) that is used only on Mute Harbor. `ArtStyle.level` is set by the app when a level is built.
