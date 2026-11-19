# Corner view (PipView): from a 6 fps slideshow to 30 fps

The complaint: the partner's corner window (bottom left) feels laggy.

## Cause

Measured, not guessed. The window itself was the lag:

- It drew a new picture only **5.2–5.9 times per second** (`FPS = 6`, 174–193 ms between pictures).
  Her motion in it was a slideshow. This was the main thing the author saw.
- Each picture cost 2.8–5.6 ms of main-thread time for the render alone, plus an async pixel read-back
  (`readRenderTargetPixelsAsync`) and a CPU loop over 40 960 pixels (linear → sRGB look-up table, `putImageData`).
  At 6 per second this added only ~0.9 ms to the mean main frame, so the main view was not the problem.
- The partner's planning is not on this path: with the offline rule brain the PIP-HOOK costs 0.02 ms when the
  window is hidden. The DeepSeek brain was not measured (no key used, see below); its calls are async `fetch`.

Where a picture's time went (CPU profile, three.js r187): one third drawing ~200 meshes, the rest three's
per-render overhead: `scene.updateMatrixWorld()` over all ~3250 objects, `projectObject` walking the whole level,
and uniform uploads. Lower resolution does not help: the cost is CPU, not pixels.

## What changed

`src/coop/PipView.ts`, `src/render/Renderer.ts` (main.ts' PIP-HOOK is unchanged):

1. **No read-back.** `update()` books `Renderer.beforeFrame`. At the start of the next main render, PipView draws
   her view into a 256×160 scissored corner of the game canvas itself, copies that corner into the window's 2D
   canvas with `drawImage` (GPU to GPU, 0.12 ms), and the main frame's full clear paints over the corner. The
   corner is never on screen. The picture uses the main view's own tone mapping and sRGB output, so the
   colours now match the main view exactly and no extra shader variants exist (`Renderer.warmTarget` is gone).
   The DOM frame, its rotation, fade, labels and speech line are untouched.
2. **30 pictures per second, evenly paced**: never on two main frames in a row (60 fps → every other frame).
   15 per second while frames are slow (> 30 ms average); before, it stopped completely.
3. **Cheaper picture** (~120 draw calls instead of ~200): sight range 34 → 22 m (haze from 10 m); `cullParts`
   hides, for this picture only, the scene parts (children of `level-root`) out of range or smaller than 4 px
   radius on the picture, and the small meshes inside the parts in range. Bounds are cached and re-measured
   round-robin (12 parts per picture). Parts with skinned meshes, never-culled meshes or lights are always drawn
   (a hidden light would make every material re-check its program). Only the drawn parts get fresh world matrices;
   the picture skips three's whole-scene matrix update.

## Numbers

Setup: my own Vite (:5231 new, :5232 serving the old PipView via an alias) and Chrome 157 **headed** (window
off-screen) with `--use-angle=metal`: WebGL renderer `ANGLE Metal Renderer: Apple M1 Max`, the real GPU.
1440×813, DPR 2, graphics tier High, Gentle, partner on with the offline rule brain (`wd.coop.brain = rules`).
The window is forced shown / hidden (PipView.wanted overridden) in 8 alternating rounds of 2.5 s; frame time =
rAF interval. Spots: level 1 plaza start, level 2 market square (WAI at 2, 0.8, 20).

**Caveat:** four other agents were running game Chromes on this Mac at the same time (load average 60–118).
Absolute frame times swing between runs; the paired delta (shown minus hidden, same run) is the reliable figure.
The display is 120 Hz, so frame times come in 8.3 ms steps.

| run | corner updates / s | gap between pictures (mean / p95 / max ms) | main frame hidden (mean / p95 / max ms) | main frame shown (mean / p95 / max ms) | added mean (paired median) | ms per picture (mean / p95) | draw calls / triangles per picture |
|---|---|---|---|---|---|---|---|
| before, plaza (a) | 5.2 | 177 / 233 / 258 | 23.2 / 34.2 / 66.8 | 24.0 / 41.6 / 83.5 | +0.94 | 4.5 / 8.6 (render only) | 205 / 368k |
| before, plaza (b) | 5.8 | 174 / 200 / 258 | 14.3 / 17.2 / 50.0 | 15.0 / 17.6 / 57.5 | +0.90 | 2.8 / 3.5 (render only) | 205 / 368k |
| after, plaza (a) | 30.4 | 33.3 / 42.6 / 58.9 | 13.1 / 17.2 / 33.6 | 14.4 / 17.4 / 33.2 | +1.52 | 1.51 / 1.9 (all of it) | 123 / 227k |
| after, plaza (b) | 30.4 | 33.4 / 42.5 / 50.8 | 12.0 / 16.9 / 25.0 | 13.9 / 17.3 / 25.9 | +2.02 | 1.40 / 1.8 | 117 / 227k |
| before, market (a) | 5.9 | 174 / 199 / 209 | 15.1 / 17.8 / 26.0 | 15.9 / 23.5 / 33.4 | +0.97 | 3.2 / 3.9 (render only) | 195 / 287k |
| before, market (b) | 5.8 | 175 / 200 / 208 | 15.0 / 17.0 / 25.9 | 15.7 / 17.2 / 33.5 | +0.84 | 2.9 / 3.7 (render only) | 195 / 287k |
| after, market (a) | 26.2 | 38.5 / 48.7 / 100 | 17.4 / 25.0 / 37.1 | 19.3 / 25.9 / 82.9 | +1.57 | 2.03 / 2.4 | 129 / 203k |
| after, market (b) | 29.7 | 34.1 / 47.6 / 75 | 15.2 / 17.4 / 49.6 | 16.6 / 24.9 / 42.6 | +1.49 | 1.86 / 2.3 | 134 / 190k |

"Before" ms per picture is the render call only; the read-back wait and the CPU colour loop came on top.
"After" includes culling and the copy.

Reading: the window now updates 5× as often, evenly (p95 gap 42–48 ms, i.e. at most one extra frame).
Per picture it costs about half of what it did. Because it draws 5× as many pictures, the added mean main-frame
time went from ~0.9 ms to ~1.5–2.0 ms: on the 1.5 ms target in the market, just over it on the plaza. No long
hitches: the p95 of the main view moves by ≤ 0.5 ms in the calm runs; the max values follow the machine load.
`FPS = 24` would cut the added mean by about a fifth (estimate, not measured; a one-line change).

## Screenshots

`corner-en.png`, `corner-zh.png` (the window at 2× zoom, speech line and label are DOM text at full resolution),
`full-en.jpg`, `full-zh.jpg` (whole screen).

## Level 1 bot

`docs/difficulty/bot/l1/full.sh` (a copy pointed at my own Vite and headless Chrome, Metal ANGLE), Gentle, with the
partner on (rule brain) and the corner view on. During the run the corner view drew on its own whenever she was
off-screen (1647 pictures by the second guardian, ~100 draw calls, 1.5 ms each). Result: level complete, game time
369 s, `errs: []`. A first attempt in a headed off-screen window stalled because the game paused on blur. A second
attempt lost its browser after the quarter was cleared: the GPU process got SIGTERM from outside.

## Not verified

- The author's own Chrome (normal window, focused, no other games running). Headed Metal ANGLE on the same Mac
  is the closest I could get.
- The DeepSeek brain (no key used): its planning cost on the main thread is not measured here.
- `drawImage` of a WebGL canvas mid-frame relies on Chrome snapshotting the not-yet-presented drawing buffer.
  Chrome and the screenshots show it works; Safari / Firefox were not tried.
