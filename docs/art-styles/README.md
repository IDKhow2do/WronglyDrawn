# Art styles: exploration (2026-11-08)

**Where to switch:** Pause → **Art style**. The choice is saved. For testing, add `?style=desert|storybook|riso|graffiti` to the URL.

**Code:** [src/render/ArtStyle.ts](../../src/render/ArtStyle.ts). A style restyles the running level in place, without reloading or recompiling shaders:
- **Surfaces:** the shared images behind the painted textures are swapped for processed copies. Each surface type (ground, plaster, wood, roof, murals and so on) is tone-mapped onto a small palette ramp. Murals keep their line drawing.
- **Plain colours and tints:** untextured colours and the tints over textures are pulled towards the same palette.
- **Lighting:** sun, sky and ambient colours, plus exposure.
- **Haze:** distance haze colour and depth.
- **Sky:** a painted gradient.
- **Ink lines:** outline colour.
- **Grade and paper:** a CSS colour grade on the canvas and a paper-grain overlay.

WAI and the creatures (actors) keep their own colours in every style, so they always stand out.

| Style | Idea | Screens |
|---|---|---|
| **Graffiti** (default) | The original loud hand-painted city. | `plaza-*-graffiti.jpg` |
| **Sunbleached Comic** | After the reference post (a "Moebius × Roger Dean" open-world prototype): sand and peach ground, terracotta and dusty-lavender plaster, murals as warm ink drawings on cream, a pale blue sky and a warm haze that washes the distance out. | `plaza-*-desert.jpg`, `desert-view-*.jpg` |
| **Storybook** | Soft watercolour washes: the same hues, with the value contrast washed out towards warm paper. | `*-storybook.jpg` |
| **Riso Print** | Two inks on paper: blue in the shadows, coral in the mid-tones, paper in the lights. | `*-riso.jpg` |

## What the reference does that a palette switch can't

The reference's terrain and architecture are a big part of its look:
- layered, flat-topped mesa slabs and terraces,
- tall cream architecture with fine linework (arches, towers, rings),
- very large distant landmarks seen through haze, for scale,
- flat two-tone shading with clean, thin, even lines,
- one or two accent colours (the orange suit, a red banner) against a muted world.

Getting there properly would be an art pass on the levels themselves:
- terrace and mesa terrain shapes,
- distant giant landmarks,
- thinner and more even outlines,
- flat/two-tone materials instead of impasto normal maps, plus hatching in cast shadows.

That is beyond this switchable-style pass.
