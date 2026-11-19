# Perf pass notes (work in progress — survives interruptions)

Machine: Apple M1 Max, headless Chrome 157 (ANGLE Metal), 1600×900 window at DPR 2,
`--disable-frame-rate-limit --disable-gpu-vsync` (uncapped, so frame time = real cost).
Other agents share the machine: numbers move ±20 % between runs. Every number below is from ≥2 runs.
Harness: /tmp/wdperf (perf.mjs = 20 s scripted sprint in a circle, Quality scaler held at scale 1;
before-build = pristine copy of the tree at /tmp/wd-before served on :5197, after-build on :5195).

## Causes found (measured)
1. **Boon picker / pause judder (user report #2) — bug, not load.** While the step is frozen the loop
   keeps calling render(alpha) with alpha cycling 0→1 every 1/60 s; WAI, creatures and the camera are
   drawn lerped between their last two step positions → they shake back and forth for as long as the
   picker is open. WAI's velocity was also kept, so his run cycle kept playing in place.
2. **GLB props never frustum-culled.** AssetManager.instantiateModel sets frustumCulled=false on every
   mesh of every GLB (86 meshes in the plaza: houses, statue, crowd models, 15–20 k tris each). They were
   drawn every frame in the main pass and in the shadow pass. Plaza Low: 2.42 M → 1.05 M triangles/frame
   (bench, 4 headings). Fix: render/SceneOptimizer.cullModels() after the level is built (skinned meshes untouched).
3. **Draw calls / CPU.** ~900–1300 draw calls per frame; CPU profile: WebGLRenderer.render = 68 % of
   main-thread time, projectObject 14 %, shadow pass 12 %, updateMatrixWorld 9 %, game step 10 %.
   The renderer is CPU-bound on draw calls on this machine (GPU time 1.7 ms vs render() CPU 5–6 ms).
4. **CSS grade on the canvas** (filter chain + `url(#wd-look)` + multiply paper layer + colour-blend
   wash layer): measured ≈ +0.5 ms/frame on the M1 Max (uncapped plaza Low: 195 fps off vs 180 fps on).
   The compositor does it at device resolution (3200×1626 here) even when the game renders at 1×.
5. **Particle pool** drew all 700 instanced spheres every frame (98 k triangles) even when none were alive.
6. Roof tiles: 16 roofs / 42 k triangles in the plaza — no measurable cost when hidden (bench). Left as is.

## Changes
- main.ts: alpha=1 whenever the step is not running (paused, boon picker, title, results);
  offerBoon → haltForMenu() (zero velocity / dodge / jet / slam via player.teleport in place, agent stop,
  camera.snapTo); mouse-look, agent update and pointer-lock off while the picker is up;
  canvas filter → renderer.grade.setFilter(); cullModels() after createSession.
- render/Grade.ts (new): CSS filter string → clamped sRGB colour matrices, eased like the CSS transition;
  wash (W3C `color` blend) and paper (multiply; same feTurbulence SVG rasterised once) in GLSL.
- render/Renderer.ts: grade = copy of the finished frame (copyFramebufferToTexture) + one quad.
  (An HDR render target was tried first: it blends the transparent haze in linear light and the far
  tower came out foggier — rejected.) Ink styles: grade folded into InkPass.
- render/Look.ts, ArtStyle.ts: no DOM svg / .look-wash / .paper-grain layers; they feed Grade.
- render/SceneOptimizer.ts (new): cullModels(), batchStatic().
- level/ArchKit.ts + WonkyBuilding.ts: kit + roof pieces tagged and merged per material per house.
- render/Effects.ts: instanced particle draw count = highest live slot + 1.

## Look check
Fixed-pose screenshots in this folder (before_* / after_*). Mean absolute pixel difference per channel
(JPEG noise ≈ 1): plaza Low graffiti 1.5 / 2.6 / 1.8; plaza Low at 1 HP (B&W grade) 1.4–1.8;
harbor Medium storybook (paper tint + ink) 2.7–4.3 (grain phase).

## A/B, final (interleaved before/after, 2 runs each, 20 s sprint; fps / p50 / p95 / p99 ms / frames >33 ms / draw calls / triangles per frame)
| level tier | before (run1 · run2) | after (run1 · run2) |
|---|---|---|
| plaza low | 126/6.2/15.1/41/40, 832, 2.24M · 147/6.2/11.2/12.6/0 | 252/3.5/7.7/8.8/1, 564, 744k · 205/4.3/8.9/10.0/0 |
| plaza medium | 169/5.3/9.7/11.2/2, 924, 2.25M · 185/4.6/10.0/12.3/3 | 173/5.2/10.1/13.1/0, 723, 999k · 197/4.5/8.9/9.9/1 |
| plaza high | 125/7.6/12.8/15.2/4, 1257, 2.29M · 149/5.8/12.4/15.2/2 | 137/6.9/11.4/12.7/0, 1126, 1.53M · 184/5.1/8.6/9.6/0 |
| harbor low | 132/6.7/13.8/15.5/1, 1102, 2.88M · 170/4.8/11.2/12.5/0 | 148/6.2/12.4/15.2/0, 762, 893k · 227/3.6/9.3/10.7/1 |
| harbor medium | 105/8.4/16.4/21.7/3, 1198, 2.90M · 133/6.4/12.9/14.3/1 | 124/7.4/14.1/17.1/2, 860, 1.12M · 159/5.4/11.4/12.5/0 |
| harbor high | 106/8.4/15.3/17.5/1, 1496, 2.93M · 130/6.5/13.7/15.7/0 | 104/8.8/15.1/17.0/0, 1235, 1.93M · 129/6.7/12.9/14.3/0 |
CPU throttled 4× (a slower-laptop stand-in), Low tier, p50/p95 ms:
plaza 27.7/66.9 · 26.6/47.3 → 27.0/49.3 · 23.6/44.4; harbor 29.7/64.9 · 27.3/61.0 → 24.6/54.3 · 21.8/46.8.
Look-off control (before build, plaza low, CSS grade removed): 167 · 213 fps vs 126 · 147 with it on.

Render-only bench (plaza Low, 4 headings × 40 frames, gl sync after each, 3 repeats):
render() CPU 4.44 → 3.09 ms, GPU (timer query) ~1.9 → ~1.5 ms, draw calls 998 → 708, triangles 2.42 M → 0.95 M.
Shadow pass share after: 111 calls, 368 k triangles.

Co-op partner (owned by another agent; measured only, plaza Low after build): +3 draw calls,
+87 k triangles per frame (2 skinned meshes, 63 k tris, drawn in main + shadow pass, never culled),
render() CPU +0.1–0.2 ms (inside run-to-run noise), session.render +0.05 ms/frame.

## Boon picker (measured, plaza Low, picker opened mid-sprint via __WD.app.boonQueue++, 4 s window)
| | before | after |
|---|---|---|
| WAI speed while open | 6.6 m/s (kept sprinting) | 0 |
| WAI on-screen motion / frame, p50 / max | 5.5 cm / 7.0 cm (shaking) | 0 / 0 |
| camera motion / frame, p50 / max | 0.37 cm / 0.9 cm | 0 / 0 |
| frame time p50 / p95 (uncapped) | 8.6 / 9.7 ms | 6.9 / 7.8 ms |
At the moment it opens the camera snaps once onto WAI (largest single jump measured 52 cm, under the overlay).
Opening the picker: 2 layouts (0.7 ms) and 79 style recalcs (7.1 ms) in the first 2 s — no layout/paint
storm, so the .boon-* CSS was left unchanged.

## Level-1 bot (after build)
Run 1: EYE purify timed out while WAI was being hit (hp 6→2), so 1/3 woken. Re-run of the eye stage: pass.
Full run 2: pass — all three Guardians woken, no page errors. Before build, eye stage: pass.

## Quality scaler
Simulated (scalersim.mjs: GPU-bound game near the 60 Hz edge, vsync-quantised frames): the old tuner
climbs back to the scale it just left and pumps forever (33–36 resolution changes per 5 min, one every
~25 s). New back-off: 13–15 changes per 5 min, and the gaps keep doubling.


## Coordinator request: flat outlines + near plane
- render/Materials.ts addOutline: geometry whose smallest bbox side is < 5 mm gets its hull returned
  unattached and invisible (callers that tag `.userData` still work; mergeStaticInk never sees it).
- Near plane: CameraController already sets near = 0.22 in third person (0.03 only when aiming) —
  no change made.


## Mobile TestFlight baseline (2026-11-16)

- Source: iOS build 9, same bundled web files on TestFlight and the independently signed USB test app. iPhone 15 Plus, iOS 27.3, Plaza opening, Graffiti style, WebGL buffer 1425 × 657. Two short 3.5 s stationary samples after moving and spraying. Each frame resets Three.js render statistics once. The samples include main and shadow submissions.
- Phone: median roughly 2,090 draw calls and 2.36 million triangles. Frame intervals were 25–31 ms at P50 and 34–41 ms at P95. The second sample reapplied rigid-model culling. It found zero additional meshes, so the timing difference is a repeatability check, not a culling gain.
- Simulator drill-down: 106 frames. Main pass averaged 1,803 submissions and 1.71 million triangles. Shadow pass averaged 57 submissions and 161,000 triangles. Roughly 50 paint-drop meshes accounted for 742,000 triangles in the main pass. Their source model uses 14,834 triangles each.
- Paint-drop experiment: meshes projected to at most 24 device pixels used an alternate index buffer with 4,360 triangles. Positions, textures, materials and nearer meshes stayed at their original detail. The same stationary camera rendered about 1.73 M → 1.32 M triangles at a fixed 1398 × 645. Two interleaved samples per configuration returned P50 23–24 ms and P95 27–28 ms throughout. This optimization was omitted from build 9. A single earlier screenshot pair at 1342 × 619 differed on 346 of 830,698 pixels.
- Next: inspect repeated static geometry and materials by sector. Extend batching only for objects that share material and render state and can preserve their interaction identity. Measure draw calls, P95 and pixel differences before testing on the device. Separately defer later-level GLB decoding to reduce first-load memory. Keep rendered resolution and lighting fixed for A/B tests.


## Cross-platform pass (2026-11-16): draw submission, loading, touch HUD

Branches: `perf/draw-submission` (render work only, on `main`) and `mobile/unified-hud` (`main` + the six iOS web
patches of build 9 + `perf/draw-submission` + touch HUD + parallel loading). Remote: https://github.com/IDKhow2do/WrongDrawn.
Machine: Apple M1 Max, headless Chrome 157 (ANGLE Metal), uncapped. Numbers move about ±10 % between runs; every
comparison below is interleaved or done inside one page.

### Harness (kept in `docs/perf/harness/`, no dependencies, Node 22)
The scripts drive Chrome over the DevTools protocol and inject a probe, so no instrumentation ships.
Build a release first (`npx vite build --outDir /tmp/wdperf/<name>`), then from the harness folder:
- `bench.mjs <level> <tier> <reps> <throttle> <dist…>`: frozen frame, 4 headings, 120 renders each. Reports draw calls, triangles, render CPU and **GL calls per render** (each GL call is one cross-process message on iOS WebKit). `IOS=1` uses the iOS app's settings.
- `route.mjs <level> <secs> <throttle> <reps> <dist…>`: live walk + steady turn + spray bursts; frame P50 / P95 / P99 and long frames. Holds the render resolution.
- `pixdiff.mjs <dist> <level> <tier> <style>`: the same frozen frame with and without the merged copies, 10 poses, pixel counts.
- `run1.mjs <dist> <level> <file.js> [tier] [style]`: run one expression (`ab.js` = batcher on / cleared / rebuilt in one page; `remain.js` = what the remaining draws are; `switch.js` = art-style switch check; `audit.js` = touch text audit).
- `boot.mjs <latencyMs> <Mbit> <reps> <dist…>` and `payload.mjs <dist>`: cold time to title under an emulated link; bytes by kind.
- `mobile.mjs`, `scan.mjs`: phone viewport with touch emulation; screenshots and a scan of visible text for key names.
All scripts wait for the level's opening cutscene to end (`START` in `cdp.mjs`): the first runs of this pass measured the cutscene camera by mistake.

### What the frame costs (Blind Plaza spawn view, Low, 1425×657; matches the iPhone's ~2,090 draws)
- Baseline: 1,972 draws (main + shadow), 10,424 GL calls, 10.3 ms render CPU. 836 materials in view, 719 of them used by one mesh.
- The cost is the **material switch**, not the triangle. Every opaque surface is paintable and fadeable, so each mesh has its own material; three then re-uploads lights, fog and material uniforms on almost every draw. `setProgram` was a quarter of the frame.
- About 60 draws per frame used double-sided transparent materials. three flags such a material for a program check twice per frame (back pass, front pass).
- Creature and host parts (rigid primitives, own paint materials) are ~450 of the draws in that view.

### Changes
- **`render/StaticBatch.ts` (new).** Source meshes stay alive and untouched (paint, raycasts, occlusion fader, gameplay). The drawing cameras skip them through a `Layers` subclass; one merged copy per material signature is drawn instead. Materials that differ only by colour share a copy (colour moves to a vertex attribute). A per-frame watch compares every member with its baked state (world matrix, visibility chain, material and its textures' transforms, geometry and its attribute versions, shadow flags) and pulls a changed member out in that same frame; it returns after 30 calm frames. Multi-material meshes merge per group. Ink hulls merge only under their own material (see "rejected"). Sprawling copies are cut at the median of their longest axis so they still frustum-cull.
- **`SceneOptimizer.singlePassFlats()`**: flat double-sided transparent sheets draw in one pass (same pixels, no per-frame program checks).
- **`AssetManager`**: models and textures load 6 at a time on the web (the iOS app keeps 1: its limit is decode memory).
- `main.ts` builds the batch last in `createSession` and again after an art-style switch. `Renderer.precompile` shows the sources to the compiler so a member that leaves finds its program ready.

### Results
Frozen frame, same camera, interleaved (draws / GL calls / render CPU ms):
| view | before | after |
|---|---|---|
| Plaza spawn, forward | 1972 / 10422 / 10.1 | 834 / 5162 / 6.5 |
| Plaza spawn, side | 558 / 2838 / 4.3 | 262 / 1555 / 3.7 |
| Plaza spawn, away from the level | 204 / 855 / 2.2 | 119 / 602 / 2.6 |
| Harbor spawn, forward | 2715 / 15060 / 15.8 | 1437 / 8487 / 11.0 |
| Harbor spawn, side | 813 / 4090 / 7.0 | 313 / 1821 / 5.6 |
| Works spawn (creature-heavy, little static geometry) | 447 / 2111 / 3.0 | 454 / 2173 / 2.9 |
| Plaza, iOS app settings (Medium, 1677×774), forward | 1884 / 10206 / 9.9 | 838 / 5068 / 6.1 |

Same page, batcher on vs cleared (Plaza, render CPU ms): forward 9.7 → 6.1–6.8; sides 4.4 → 3.5 and 4.3 → 3.7; looking away 2.2 → 2.6. The watch costs 0.1 ms for 1,353 members: a view with nothing in it pays that and gains nothing.

Live route, 20 s walk + turn + spray, frame time P50 / P95 / P99 ms:
| run | before | after |
|---|---|---|
| Plaza, no throttle | 5.8 / 13.0 / 15.2 | 5.5 / 10.0 / 11.7 |
| Plaza, CPU ×4 | 40 / 120 / 180 | 36 / 68 / 160 |
| Plaza, iOS settings, CPU ×4 | 35 / 88 / 188 | 34 / 64 / 169 |
| Harbor, CPU ×4 | 50 / 163 / 235 | 49 / 121 / 201 |
| Works, CPU ×4 | 34 / 46 / 140 | 35 / 47 / 113 |
The slow frames (heavy views) improve most; the median moves little on this machine because the median view of the route has ~330 draws and per-object traversal, shadows and the simulation step then weigh as much as the draws.

Cold time to title (cache off): 150 ms latency / 8 Mbit/s 51.6 s → 40.1 s; 20 ms / 50 Mbit/s 14.0 s → 10.9 s. The game downloads 33 MiB before the title: models 15.2 (all three levels), textures 10.3, script 6.4 (2.4 gzipped).

### Look check
`pixdiff.mjs`: one frozen frame rendered with the merged copies and with the sources only, 10 poses, 936,225 pixels. Pixels that differ by more than 2/255, worst pose without animation noise: Plaza Low graffiti 6, Harbor Low graffiti 19, Works Low graffiti 4, Plaza Medium storybook 10, Harbor Medium riso 33, Works High desert 4, Plaza after a live switch to desert 8. They sit on silhouette edges (baked positions round by one float step). Up to ~20,000 pixels differ by 1–2/255 where a large flat surface takes its colour from a vertex attribute instead of a uniform.
The check found three real faults during the work, all fixed: a conveyor that rewrites its vertices in place (now watched), a floor ink mesh that won depth ties under a copied material (hulls keep their own material), and merged materials without the art style's `WD_TOON` define (`Material.copy` resets `defines`).

### Tried and rejected
- `polygonOffset` on merged ink hulls: it moved hull edges everywhere (60–500 pixels per pose).
- One merged copy per signature for the whole level: fewest draws when everything is in view, but every copy is drawn in every view.
- Freezing `matrixAutoUpdate` on resting members (self-thawing through a local-transform watch): no measurable gain in the minified build.
- Splitting copies down to 2–4 members: more draws in the heavy view, no gain in the light ones.

### Not measured here (needs the device or the host app)
iPhone 15 Plus and iPad (TestFlight build from `mobile/unified-hud`), Safari on a Mac, an Android phone, the TapTap app H5 runtime, memory after several minutes of play, Mainland China network timing. The GL-call count (−50 % in heavy views) is the number to expect the most from on iOS WebKit, where every GL call crosses a process boundary; the frame-time claim for the phone needs the interleaved device A/B from `RELEASE.md`.

### Follow-up the same day: the creatures' ink hulls
`render/MovingInk.ts` (driven by StaticBatch's watch): one `THREE.BatchedMesh` per ink material holds a copy of every creature hull; each hull hands its world matrix to its slot every frame and stays in the scene, hidden from the drawing cameras only. New hulls are adopted every 30 frames (creatures spawn in waves and get their ink material at precompile). Frozen frame, Low: Works side view 705 → 561 draws (GL calls 3,483 → 2,934), Works forward 451 → 405, Harbor forward 1,526 → 1,366, Plaza forward 904 → 843. Pixel check unchanged. Host hulls are not creature hulls: they rest most of the time and already merge through StaticBatch.

### Next, in order of expected gain
1. Creature bodies: ~250 draws in the forward plaza view. Each part has its own paint material and paint texture; they can merge only after a creature paints into one atlas.
2. Stage models by level: 15 MiB of GLBs load before the title and two thirds belong to later levels. `MODEL_MANIFEST` has no level tags yet.
3. Shadow pass on the web (about a tenth of the frame): the iOS app already redraws it at 12–15 fps; on the web that is a visible change and was left alone.
4. Paper-bird flocks (100 moving draws in the plaza) as two instanced meshes.
