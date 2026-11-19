# Lighthouse lantern room: art notes (2026-11-14)

Test rig: Vite :5263 (`/tmp/wd-eye/vite.mjs`), headless shell CDP :9563 (`/tmp/wd-eye/chrome.sh`, Playwright
chrome-headless-shell: Google Chrome headless got killed every few minutes on this machine).
Scripts: `/tmp/wd-eye/bot/` (copy of docs/art-pass/bot with `rcam` = camera without collision planning,
`lantern.sh <prefix> [woken]` = the 6 standard shots). Silenced = warp `gramophone`; woken = `level.lightLighthouse()`.

## What was there
- `lampGlass`: open cylinder, `#3a2f8f`, opacity 0.55, DoubleSide, no depth write. Seen from the gallery the lens
  sat behind two layers of it: flat blue through flat blue.
- `lampCore`: an unlit `MeshBasicMaterial` egg (`lampLensGeo`) with brass hoops; lit = colour set to yellow.
- Eyes: white spheres, a black sphere pupil, a coral half-sphere lid (rotated open when woken).
- Bars: thin dark iron boxes (`dressLighthouse`).

## What it is now
- `src/level/harbor/LanternRoom.ts` `buildLantern()`:
  - no glass volume at all: the panes are clear; drawn white glint strokes on every other pane (opaque, batched).
  - teal painted-timber glazing bars (wonky `block`, ink 3 cm), cream sill / middle / head rings with ink.
  - a Fresnel lens: lathe with saw-tooth prism rings and a smooth belt; one shared 128×256 canvas (facets, prism
    lines, bullseye, glint) as map and emissive map. Silenced: tinted `#b4b0cc`, no glow. Woken: white, amber
    glow pulsing, turns at 0.6 rad/s with the beam.
  - turned brass stand and brass caps (lathes, ink hulls).
  - eyes: `DoodleEyes` (src/render/DoodleEye.ts), SLEEPY preset, half-lidded, lashes hanging, greyed 0.75.
    `wake()`: lids open, colour returns, a surprised widen that eases off, a flash. They watch the camera when it
    is within 14 m (on the gallery that is WAI's shoulder), otherwise drift over the sea. Auto-blink.
- `HarborModels.dressLighthouse` keeps door, windows, corbels, drum and roof only; `lampLensGeo` is gone.
- `MuteHarbor.ts`: three local edits (build, `lightLighthouse` → `lantern.wake()`, `update` → `lantern.update`).
  Gameplay unchanged: shout target `lampMouth`, lamp collider, horn collider, `lampOut` all as before.

## Shots
docs/art-pass/lantern/: `before-*` / `beforeW-*` (silenced / woken) and `after-*` / `afterW-*`:
gallery, crop (same angle as the author's image), front, plaza (headland arena below), cutin (the woken cut-in
camera), harbour (across the water from the quay).

"crop" before = the author's own image (`before-crop-author.png`); the old `before-front` was taken before the
crop angle was found. Woken runs keep WAI topped up (`hp=6, invuln`) or the Hush greys the world out.

## Verdict (slice DONE, tsc clean)
- Gallery / crop: no more mud. The lens reads as a lamp (copper-amber facets when silenced, glowing gold and
  turning when woken), the brass stand and the horn's neck read as one brass family with the Tripo horn.
- Eyes: silenced = grey, heavy lid, hanging lashes, tired line; woken = blue iris, two highlights, crease, lashes up.
- Weak: the eyes are flat discs on the glass; from the side (crop angle) they are seen almost edge-on.
  The teal bars are heavy at the gallery distance; at the harbour distance the lamp room reads as a striped cage.
  The silenced lens is copper rather than grey (the facet texture is amber; a tint cannot make it grey).

