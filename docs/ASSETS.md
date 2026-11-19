# Wrongly Drawn — 3D assets

Pipeline: **Codex `codex exec` (built-in image generation)** drew one orthographic three-view sheet per asset/part
(front / left side / back, white background, graffiti-impasto style; `reference/ref-1.webp` + `ref-3.webp` passed
as style refs; part sheets used the full creature sheet as reference) → sheets split with ffmpeg into
`reference/sheets/<name>_front|side|back.png` → **Tripo multiview-to-model** (`tripo-v3.1`, textured PBR,
standard texture quality, face limits set per asset) → GLB post-processed (scale + pivot only, geometry untouched)
into `public/models/`.

## Conventions (all files)

- **Up = +Y. Forward (face / nozzle / toes) = +X** (that is how Tripo v3.1 multiview oriented every model, including
  the rigged WAI). In Three.js, to make a model face +Z use `object.rotation.y = -Math.PI / 2`.
- **Units = metres.** Static models were scaled to the intended real size (scale is baked into the single node's
  `scale`; translation sets the pivot). Each GLB is one mesh node; the pivot is the GLB origin (`gltf.scene` origin).
- Lateral (left/right) axis is Z. For WAI's rig: character's right = +Z, left = −Z.
- Materials: one PBR material per file, 3 × 2048² textures (baseColor PNG, metallicRoughness + normal JPEG). Files are ~4–6 MB
  each (~70 MB total). If load size matters, downscale the small parts' textures to 1K (e.g. `gltf-transform resize`) — not done here.

## Table

| asset | file | rigged? | animation clips | size (m, after scale) | pivot / axis notes | forward | triangles | credits |
|---|---|---|---|---|---|---|---|---|
| spray_gun | `public/models/spray_gun.glb` | no | — | length 0.40 (X) × h 0.33 × w 0.17 | pivot = bbox centre. Nozzle tip ≈ (0.20, 0.076, 0). Pistol grip bottom ≈ (−0.064, −0.144, 0); hand hold point ≈ (−0.06, −0.09, 0) | +X (nozzle) | 19,764 | 30 |
| wai (rigged) | `public/models/wai.glb` | yes, skinned (Tripo rig v3.0 biped, 77 bones: Hip, Spine01/02, Head, L/R_Thigh/Calf/Foot, L/R_Upperarm/Forearm/Hand + fingers, L/R_Eye …) | `idle` (15.4 s), `walk` (2.4 s), `run` (1.3 s), `jump` (2.2 s), `shoot` (9.1 s); all in place (no root motion) | height 1.00 (Y) × 0.60 (Z) × 0.33 (X) | origin at feet (y = 0 floor). Scale 1 unit = 1 m | +X (eye) | 19,354 | 30 gen + 25 rig + 50 anims |
| wai hurt clip | `public/models/wai_anim_hurt.glb` | skeleton only, no mesh | `hurt` (13.8 s, in place) | — | animation-only GLB with the same bone names as `wai.glb`; load it and play its clip on wai's mixer (`AnimationMixer(waiScene).clipAction(hurtClip)`) | — | 0 | 10 |
| wai (static) | `public/models/wai_static.glb` | no | — | 1.00 tall | origin at feet | +X | 19,354 | (same generation as above) |
| crooked_leg_mutant body | `public/models/crooked_leg_mutant_body.glb` | no (parts) | — | h 1.35 × 0.99 (X) × 0.94 (Z) | pivot = bottom centre of bin. Hip sockets on the underside at ≈ (0, 0.03, ±0.22) | +X (eye) | 9,439 | 30 |
| mutant thigh | `public/models/mutant_thigh.glb` | no | — | length 0.85 | **pivot = hip ball at top**, segment hangs down −Y; knee joint at ≈ (0.02, −0.85, −0.01) | +X | 3,732 | 30 |
| mutant shin | `public/models/mutant_shin.glb` | no | — | length 0.80 | **pivot = knee knob at top**; ankle at ≈ (0.01, −0.80, 0) | +X | 3,838 | 30 |
| mutant foot | `public/models/mutant_foot.glb` | no | — | 0.60 long (X) × 0.31 tall × 0.43 wide | **pivot = ankle socket at top of stub**; claws rest on y ≈ −0.305; toes point +X, small back toe −X | +X (toes) | 5,992 | 30 |
| eraser_grub | `public/models/eraser_grub.glb` | no | — | 0.80 long (X) × 0.49 tall × 0.40 wide | pivot = bottom centre (feet on y = 0) — good for squash & stretch via `scale.y` | +X (face) | 8,975 | 30 |
| chomper_bin body | `public/models/chomper_bin_body.glb` | no (parts) | — | h 1.10 × 0.86 (X) × 0.82 (Z) | pivot = bottom centre. Open top with lower teeth + tongue. Lid hinge bracket at back ≈ (−0.43, 0.89, 0). Leg sockets under the base at ≈ (0, 0, ±0.2) | +X (eyes) | 7,721 | 30 |
| chomper_bin lid / jaw | `public/models/chomper_bin_lid.glb` | no | — | Ø 0.82 × 0.56 tall (incl. teeth) | **pivot = hinge knuckle at the back edge** (−X side). Modelled closed. Place pivot at the body's hinge (≈ (−0.43, 0.89, 0)); open = positive `rotation.z` (lifts the +X front edge) | +X | 5,783 | 30 |
| chomper_bin leg | `public/models/chomper_bin_leg.glb` | no | — | 0.35 tall | **pivot = hip cap at top**; foot sole at y = −0.35, toe toward +X. Use twice (left/right) | +X (toe) | 2,839 | 30 |
| peeping_lamp post | `public/models/peeping_lamp_post.glb` | no (parts) | — | 5.00 tall × 1.83 (X) × 1.90 (Z) | pivot = bottom centre of base. The lantern cage (empty, open front/back) hangs off the crooked arm; cage window centre ≈ (0, 3.45, 0.3) (approximate — tune in code) | +X (cage window) | 9,541 | 30 |
| peeping_lamp eyeball | `public/models/peeping_lamp_eye.glb` | no | — | Ø 0.80 | pivot = sphere centre (rotate freely). Pupil/iris on +X | +X (pupil) | 3,801 | 30 |
| peeping_lamp eyelid | `public/models/peeping_lamp_eyelid.glb` | no | — | 0.90 wide (Z) × 0.63 tall × 0.77 deep | half-dome shell, **pivot = centre of the open rim** (≈ sphere centre) so it sits on the eyeball centre; blink = rotate about Z (the lateral axis) | +X (lash lip) | 3,840 | 30 |

Leg chain for the mutant (per side, mirror Z for the other leg): `body → thigh @ hip (0, 0.03, ±0.22) → shin @ (0, −0.85, 0)
in thigh space → foot @ (0, −0.80, 0) in shin space`. Fully straight it is ≈ 3.3 m tall; bend knees backwards
(bird-like: rotate thigh forward, shin back) to land around 3 m. The two legs are the same mesh; make them
"mismatched" in code with slightly different scales/rotations.

## Credits

| item | credits |
|---|---|
| spray_gun (multiview) | 30 |
| wai (multiview 30, rig 25, 5 anims 50, hurt anim 10) | 115 |
| eraser_grub | 30 |
| crooked_leg_mutant (body + thigh + shin + foot) | 120 |
| chomper_bin (body + lid + leg) | 90 |
| peeping_lamp (post + eye + eyelid) | 90 |
| **total** | **475** (balance 1095 → 620; limit was 600) |

Codex image generation: no Tripo credits. (Rig = 25 credits, retarget = 10 credits per clip, v3.1 multiview with standard texture = 30.)

## Notes / known issues

- **WAI rig quality:** Tripo's rig-check said `riggable: false` (box body, no neck); the rig was forced as biped and
  succeeded. Arms, legs and boots animate well, but the rigid box body is skinned partly to the thighs, so in
  `walk`/`run` the lower corners of the box bend and smear like cloth. Fine at gameplay distance; for a crisper look use
  `wai_static.glb` and animate procedurally (bob/tilt), or only use `idle`/`shoot`/`jump`. `idle` (15 s) and `shoot`
  (9 s) are long clips; trim or loop sub-ranges in code if needed. No dedicated attack beyond `shoot`.
- Tripo outputs face **+X**, not glTF's usual +Z (see conventions).
- `peeping_lamp_post` was generated from front + back views only (the side view of the sheet was not consistent with the
  front), so its depth is Tripo's guess; it looks right in previews. The cage-centre coordinate is approximate.
- Parts were scaled by me to plausible sizes (mutant ≈ 3 m, chomper ≈ 1.6 m with lid and legs, lamp 5 m); adjust freely.
- Texture budget: all files use 2K textures; nothing was decimated further (all ≤ 20k tris).

## Sheets and other images

- Three-view sheets: `reference/sheets/<name>_sheet.png` (Codex originals) and split views `<name>_front.png`,
  `<name>_side.png`, `<name>_back.png` for: spray_gun, wai, eraser_grub, crooked_leg_mutant (full design, reference
  only), crooked_leg_mutant_body, mutant_thigh, mutant_shin, mutant_foot, chomper_bin (full design), chomper_bin_body,
  chomper_bin_lid, chomper_bin_leg, peeping_lamp (full design), peeping_lamp_post, peeping_lamp_eye, peeping_lamp_eyelid.
- **Title clean plate:** `public/assets/title-clean.png` (1672×941, Codex image edit of `title-blind-plaza.webp` with
  logo, hearts, level tag, DEMO START banner and sticker cards painted out) and `public/assets/title-clean.webp`
  (same, WebP q88, 0.6 MB).

---

## Environment pass (2026-11-04): textures, murals, statue head, gate tower, concepts

All images by **Codex `codex exec` built-in image generation** with `public/assets/title-clean.webp` + `reference/ref-1.webp`
as style references. 3D by **Tripo** v3.1 multiview (front/left/back split from a Codex three-view sheet), 20k face limit,
PBR, 2K textures.

### Tileable textures — `public/textures/` (1024², WebP q85)

| file | content | suggested repeat |
|---|---|---|
| `cobble_patchwork.webp` | plaza floor: irregular flagstones, pink/lavender/cobalt/orange/cream/turquoise, purple-grey grout | 1 tile ≈ 2 m (≈ 9 stones across) |
| `cobble_edge.webp` | kerb/sidewalk: staggered grey-purple dressed blocks (6 across), paint flecks | ≈ 2 m |
| `plaster_pink/orange/blue/turq/yellow.webp` | building walls: chunky staggered stones (4–5 across), one dominant colour, other colours splattered, drips, scratches | ≈ 3 m |
| `stone_patchwork.webp` | 4×4 grid of differently coloured blocks, two crowns + two X tags (pedestal style) | ≈ 2 m (one block ≈ 0.5 m) |
| `wood_planks.webp` | 6 vertical planks (turquoise/orange/pink/cobalt/yellow), nails | ≈ 1.2 m |
| `roof_tiles.webp` | curved clay tiles, orange/red/pink, rows run horizontally | ≈ 1.5 m |
| `metal_rust.webp` | dark iron with chipped orange/yellow/pink/cobalt paint | ≈ 0.5–1 m |

- Each has a matching **height map** `<name>_h.webp` (1024², grayscale, white = raised paint/stone, black = grout/cracks),
  derived with PIL from luminance + local contrast using a periodic (FFT) blur, so the height maps tile too.
  Build normal maps from them in code (e.g. Sobel → `normalScale` ≈ 0.5–1.5) or use as `bumpMap`.
- **Seamless:** all 11 tile in both directions. Codex outputs were already nearly tileable (verified by half-offset
  inspection); every file then got a low-frequency edge correction (wrap discontinuity spread over 80 px) + a 5 px
  seam polish, and a wrap-padded resize to 1024. Faint structural seams (a grout line that stops at the seam) remain only
  under close inspection on `plaster_orange`, `plaster_turq`, `plaster_blue`; colour is continuous everywhere.
- Set `texture.wrapS = wrapT = RepeatWrapping`, `colorSpace = SRGBColorSpace` for colour maps (not for `_h`).

### Facade murals — `public/textures/mural_*.webp` (1024², not tileable)

Full-bleed painted wall squares meant as a decal/plane on a façade (fade the edges in a shader or frame with a
plaster-textured border; background colours match the plaster set).

| file | content | blends with |
|---|---|---|
| `mural_sleepy.webp` | closed lashed eyes with white drips, two nostril dots, wide jagged-teeth mouth, small crown (right) | orange / pink plaster |
| `mural_awake.webp` | **same composition** (made by editing `mural_sleepy`), eyes wide open with big pupils — swap/cross-fade for the "woken" state | orange / pink |
| `mural_cyclops.webp` | one big lashed eye + yellow crown | blue |
| `mural_teeth.webp` | huge jagged red mouth with white teeth | pink |
| `mural_crowns.webp` | crowns + X tags scattered | turq / yellow |
| `mural_gatehouse.webp` | face with open eyes, mouth sealed by a big pink eraser smudge | lavender / blue |
| `mural_nose.webp` | two eyes, triangle nose, row of teeth | yellow / orange |

### 3D models

| asset | file | size (m) | pivot | forward | triangles | credits |
|---|---|---|---|---|---|---|
| statue_head | `public/models/statue_head.glb` | 3.60 tall (Y, incl. crown) × 2.25 deep (X) × 2.59 wide (Z, incl. ear) | bottom centre of bbox (y = 0 = underside of head, sits on a pedestal) | **+X** (eye) | 19,490 | 30 |
| gate_tower | `public/models/gate_tower.glb` | 15.0 tall × 3.77 deep (X) × 12.25 wide (Z) | bottom centre (y = 0 = ground, arch centred at x = z = 0) | **+X** (eye + mouth façade) | 18,664 | 30 |

**statue_head:** cubic patchwork head ≈ 2.5 m tall + yellow 5-point crown on top (crown ≈ y 2.5–3.6). One big eye on the
+X face centred ≈ (1.1, 2.05, 0); stitched mouth ≈ y 0.6; nose block protrudes on +X. Pink spiral ear on **−Z**
(= the head's left side, consistent with the convention right = +Z). Scale is uniform 3.6 (node scale), so the cube
itself is ≈ 2.3–2.4 m wide; bbox is slightly off-centre in Z because of the ear (cube ≈ z −1.1…+1.3).
The "blind" version (eye erased) must be done in code/material (e.g. decal over the eye) — only the seeing version exists.

**gate_tower:** two-storey crenellated gate block (top of main block ≈ 10 m) + central square turret + yellow crown.
Façade on +X: jagged-teeth mouth window ≈ y 7.0–8.8, eye window ≈ y 11–12 on the turret (both z ≈ 0). The back (−X)
has plain windows and a matching arch.
- **Arch passage runs along X** (walk through in ±X). Measured by projecting the mesh onto the YZ plane:
  clear opening **6.05 m wide (z −3.10 … +2.95) up to y ≈ 3.5 m**, narrowing to 5.65 m at y 4, 4.2 m at y 5;
  **crown of the arch at y ≈ 5.7 m**. Tunnel length (jamb depth) ≈ 3.2 m (x −1.64 … +1.55). Floor under the arch is open
  (no slab; a few stray verts near y < 0.15 at the centre — use your own floor collider).
- **Non-uniform scale:** node scale = (15, 15, 19.13). At a uniform 10 m width the arch was only 4.9 m wide, so Z was
  stretched to give the requested ≈ 6 m opening; result is 12.25 m wide and 15 m tall. If you need exactly 10 m wide,
  set `scale.z` to 15.6 (arch then ≈ 4.9 m) or scale the whole object.
- To put it on the level layout (arch at x −3…3, z = −20, passage running north–south, façade facing the plaza / +Z):
  `gate.rotation.y = -Math.PI / 2; gate.position.set(0, 0, -20)` → the façade faces +Z and the 12.25 m width spans x.
- Collision: use boxes for the two piers (|z| 3.1…6.1 in model space) and the block above y ≈ 5.7 rather than the mesh.

### Sheets and concept art

- Three-view sheets (`reference/sheets/<name>_sheet.png` + `_front/_side/_back.png`): `statue_head`, `gate_tower`, and
  prop sheets for future modelling (not sent to Tripo): `prop_lamp_post`, `prop_bollard`, `prop_crate`, `prop_bench`,
  `prop_fountain`, `prop_mailbox`, `prop_scaffold`, `prop_water_tank`.
- Concept art (`reference/concepts/*.webp`, 1672×941, layout 1254²): `concept_hub` (blind statue, sleepy wall, sealed gate
  with eraser rubble, fountain), `concept_yard` (low + high roofs, scaffold, dumpster, crooked-leg mutant),
  `concept_rooftop` (peeping lamp ink beam, water tank), `concept_canal` (ink canal, half-drawn turquoise bridge,
  island, gagged Gatehouse, drawbridge), `concept_finale` (stairs through the arch, Correction Tower with eraser),
  `layout_topdown` (stylised map: canal west, plaza with statue + fountain, sleepy wall east, stairs north — mood/
  orientation guide only, **not to scale**; the coordinate list in the brief is authoritative).

### Credits (this pass)

statue_head 30 + gate_tower 30 = **60** (balance 620 → 560). All images via Codex (no Tripo credits).

---

## Statue v2 — one-eyed statue in separate parts (2026-11-04)

Replaces the single-piece `statue_head.glb` for gameplay (that file is kept but not used here). Reference: the statue on
the left of `public/assets/title-blind-plaza.webp` (crop saved as `reference/sheets/statue2_title_crop.png`).

**Pipeline (same as above):** Codex `codex exec` image generation, one three-view sheet per part (front / left side / back,
white background), with the title crop + `reference/ref-1.webp` + `ref-3.webp` as references (prompts:
`reference/tools_statue2/p_<part>.txt`) → split with ffmpeg (`reference/tools_statue2/split.py` finds each view's gap-separated
column range and pads every view of a sheet to the same square, so all three views keep the same scale) →
`reference/sheets/statue2_<part>_front|side|back.png` → Tripo multiview-to-model (`tripo-v3.1`, PBR, standard texture;
face limit 20k for head/crown/plinth, 10k for eye/lid) → scale + pivot only (`reference/tools_statue2/gl.mjs apply`;
the scale and the pivot offset are in the single node's `scale` / `translation`, geometry untouched) →
`gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024 --simplify false` (same as the
other `public/models/*.glb`: meshopt + quantization, 3 × 1024² WebP textures, triangle counts unchanged).

Files: raw Tripo outputs `reference/models_src/statue2_<part>_tripo.glb`; scaled/pivoted, unoptimised
`reference/models_src/statue2_<part>.glb` (2K textures); final `public/models/statue2_<part>.glb`.
Conventions as everywhere: **+Y up, face/iris = +X, lateral axis = Z, metres.**

| part | file | size (m) | pivot | triangles | KB | credits |
|---|---|---|---|---|---|---|
| head (no eyeball) | `public/models/statue2_head.glb` | 3.00 tall × 1.78 deep (X) × 2.33 wide (Z, incl. ears) | **bottom centre of the neck** (y = 0 = neck base) | 19,399 | 607 | 30 |
| eyeball | `public/models/statue2_eye.glb` | Ø 0.85 (radius 0.42) | **sphere centre**; iris + pupil on **+X** | 9,549 | 265 | 30 + 30 (re-roll) |
| eyelid | `public/models/statue2_lid.glb` | 0.93 (X) × 0.78 tall × 1.07 wide (Z) | **eyeball centre** (= centre of the lid's rim) | 9,648 | 276 | 30 |
| crown | `public/models/statue2_crown.glb` | 1.36 (X) × 1.41 tall × 1.70 (Z) | bottom centre | 19,011 | 443 | 30 |
| plinth | `public/models/statue2_plinth.glb` | 3.60 Ø × 2.40 tall | bottom centre (y = 0 = ground) | 18,766 | 498 | 30 |

Measured bboxes (final files): head x −0.854…0.924, y 0…3.000, z −1.141…1.191 · eye ±0.426 · lid x −0.452…0.474,
y −0.186…0.598, z ±0.535 · crown x ±0.679, y 0…1.412, z ±0.850 · plinth x ±1.800, y 0…2.400, z ±1.800.

### Assembly numbers

| what | value |
|---|---|
| **Eye socket / eyeball centre, head-local** | **(0.644, 2.304, −0.110)**. Found by fitting a sphere to the socket's bowl (fit radius 0.45 m); the 0.42 m eyeball sits in it and bulges forward of the face like in the painting. The socket is 0.11 m off the neck axis toward −Z (as Tripo built it). |
| **Crown seat, head-local** | **(−0.099, 2.980, −0.026)**: centre of the flat head top (top surface y ≈ 2.98–2.99, head bbox top 3.00). Put the crown's origin there. Head top is ≈ 1.50 (X) × 1.52 (Z); the crown is 1.36 × 1.70, so it overhangs on the Z sides. |
| **Plinth top height** | **2.40 at the centre**; the top is a shallow dome: ≈ 2.37 at r = 0.7 m (the neck footprint is 1.34 × 1.43 m), 2.34 at r = 1.2. Top drum radius ≈ 1.3 m, base step radius 1.8 m. **Put the head at y = 2.37.** |
| **Eyelid rotation** (`lid.rotation.z`, lid placed at the eye centre) | Modelled at **0 = half-closed** (dome over the upper half of the eye, rim horizontal, spike lashes along the +X rim). **Closed = −π/2 (−1.571)**: dome swings forward over the whole front of the eye, lashes end up at the bottom. **Open = +π/2 (+1.571)**: dome swings back inside the head; only the lash spikes show above the eye (looks right; +1.2 leaves a row of lash nubs on the eye). Blink = tween +1.571 → −1.571 → +1.571; −0.8 is a good "sleepy" pose. |
| Eye look-around | Rotate the eye about its own centre (rotation.y = yaw, rotation.z = pitch). Suggested limits ±0.5 rad yaw / ±0.35 rad pitch (estimated from the socket size, not rendered). |

World placement with the statue root at the plinth's bottom centre (no rotation; to face +Z rotate the root by
`rotation.y = -Math.PI / 2`): plinth (0, 0, 0) · head (0, 2.37, 0) · eye and lid (0.644, 4.674, −0.110) ·
crown (−0.099, 5.350, −0.026). Total height ≈ 6.76 m. For the lid, either make it a child of the eye's parent at the
same position, or parent both eye and lid to an empty at the eye centre.

**Composite preview** (three.js page `reference/tools_statue2/index.html` + `assembly.json`, served by `serve.py` from a folder holding
the page plus symlinks `three` → `node_modules/three` and `pub` → `public/models`; it POSTs the canvas to `/save`): `reference/shots/statue2_composite_sheet1.png` (3/4, front, side, lid 0 / closed / open, socket profile)
and `statue2_composite_sheet2.png` (crown seat, top, back with lid open, mid-blink −0.8, lid +1.2, closed side);
individual views `reference/shots/statue2_*.png`; parts before scaling: `statue2_parts_lineup.png`. Parts fit: the neck
sits on the plinth top, the crown on the head top, the eye in the socket, and the lid covers the eye at −π/2 and hides in
the head at +π/2 (no poke-through at the back or top).

### Notes / known issues

- **Head shape:** Codex drew a round drum-shaped head (not the cube of the title painting); Tripo kept it. Both spiral
  ears, the brow, wedge nose, mouth slit and cracks are there. The socket is a real hollow (≈ 0.45 m deep), not paint.
- **Eye vs socket:** the opening is a bit tighter at the top (brow ≈ 0.36 m from the centre) than the eye radius (0.42),
  so the eye surface passes slightly through the underside of the brow; not visible in the previews. Scale the eye to
  ≈ 0.9 if you want a clean gap (it then sits deeper in the bowl).
- **Lid is solid:** Tripo closed the underside of the half-dome (flat disc at the rim), so the eye's covered half is
  inside it. When open (+π/2) the edge of that disc shows as a thin ring around the eye, which reads as a stone rim. The lid
  is taller (0.60 above the rim) than deep (0.46), so when closed it bulges ≈ 0.18 m in front of the eyeball surface.
- **Plinth is non-uniformly scaled:** Tripo made it squat (1.94 : 1). To reach 3.6 m wide × 2.4 m tall the node scale is
  (3.608, 4.670, 3.600), i.e. stretched ≈ 1.3× in Y. The textures (blocks, crowns, X tags) still read fine. For the
  painting's lower look use a uniform scale of 3.6 (height 1.85, top ≈ 1.83).
- The first eyeball generation came back with a blank grey texture
  (`reference/models_src/statue2_eye_tripo_try1_untextured.glb`); it was re-rolled once with the same inputs (+30 credits).
- Crown has a floor inside the band (not hollow); it is set on the head top, not around it.

### Credits (statue v2)

head 30 + eye 30 + eye re-roll 30 + lid 30 + crown 30 + plinth 30 = **180** (balance 560 → 380). Images via Codex (no Tripo
credits).

---

## WAI v2 — hero redesign (2026-11-05)

`public/models/wai2.glb` replaces `wai.glb` (the old file is kept untouched). One GLB holds the mesh, the rig and all clips.
Same conventions as `wai.glb`: **1.00 m tall, origin at the feet (y = 0 floor), +Y up, face/eye/toes = +X**, character's
right = +Z, left = −Z, metres. To face +Z in Three.js: `object.rotation.y = -Math.PI / 2`.

**Design:** one rigid box block for head and torso (blue/orange diagonal split, graffiti tags), yellow crown, sculpted face (a big
round eye: white dome, turquoise iris, black pupil, white highlight; a raised stitched X eye; a toothy grin), pink spiral ear on
the left (−Z) side, short tube arms with mitten hands (pink L, orange R), sturdy legs with X tags, chunky red high-top
sneakers with white soles, toe caps and laces. **No cape.** The back of the box is a plain flat painted face (no ear, no
relief), which suits the procedural cape.

**Pipeline** (as documented above): Codex `codex exec` image generation (prompt `reference/tools_wai2/p_wai2.txt`; refs: crop of
WAI from `title-blind-plaza.webp`, `reference/sheets/wai_front.png`, `ref-1.webp`, `ref-3.webp`) → `reference/sheets/wai2_sheet.png`
→ split with `reference/tools_statue2/split.py` → `wai2_front|side|back.png` → Tripo `tripo-v3.1` multiview (front/left/back,
face limit 20k, PBR, standard texture; task `5e91b4c8`) → rig-check said `riggable: false` again, so the rig was **forced biped**
(rig v3.0, Tripo spec; task `3e40101e`) → retarget with `animate_in_place=true`: idle/walk/run/jump/shoot (task `2ccff2fb`),
hurt + dive (task `352c7af2`, animation-only) → local post-process `reference/tools_wai2/build.mjs`: the hurt/dive clips are merged in by
bone name, `dive` is renamed `dodge`, and the box is re-skinned (see below). Output: `reference/models_src/wai2.glb` (2K textures) →
`gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024 --simplify false` → `public/models/wai2.glb`.
No geometry or scale change was needed: Tripo's rig output is already 1.000 m tall with the feet at y = 0.

**Rigid box re-skin (fixes the v1 smear):** Tripo again weighted the lower box partly to the thighs (≈ 50 % at y 0.3–0.4) and spread the
clavicles across the box. `build.mjs` binds **every box, crown and ear vertex 100 % to `Spine02`** (7,016 vertices: everything with
|z| < 0.205 and y ≥ 0.27, plus everything at y ≥ 0.53). Arm vertices on the box sides (|z| ≥ 0.18 with ≥ 50 % arm-chain weight) keep
their arm weights; their remaining share goes to Spine02. Legs, feet and arms keep Tripo's weights. The block now never bends. In
every clip it moves as one solid piece, with the legs bending cleanly below it.

### Files

| file | what |
|---|---|
| `public/models/wai2.glb` | final: mesh + rig + 7 clips, meshopt + 3 × 1024² WebP, 0.87 MB |
| `reference/models_src/wai2.glb` | same before optimisation (2K textures), 6.0 MB |
| `reference/models_src/wai2_tripo.glb` | raw Tripo multiview output (static, textured) |
| `reference/models_src/wai2_tripo_rigged.glb` | raw Tripo rig output (no clips) |
| `reference/models_src/wai2_tripo_retarget5.glb` | raw retarget: mesh + idle/walk/run/jump/shoot (Tripo's weights, not re-skinned) |
| `reference/models_src/wai2_tripo_anim_hurt_dive.glb` | raw retarget, skeleton only: hurt + dive |
| `reference/sheets/wai2_sheet.png`, `wai2_front/side/back.png` | Codex sheet and split views |
| `reference/shots/wai2_preview.png` | old (left) vs new (right) at rest: front, 3/4 (top row); side, back (bottom row) |
| `reference/shots/wai2_preview_anims.png` | old (left) vs new (right): walk, run (top); shoot, jump (bottom) |
| `reference/shots/wai2_preview_clips.png` | new, one frame each: idle, walk, run, jump, shoot, hurt, dodge |
| `reference/shots/wai2_tripo_preview.png` | Tripo's own render of the generation |
| `reference/tools_wai2/` | prompt, `build.mjs` (merge + re-skin), `inspect.mjs`, preview page + `serve.py` |

### Numbers

| item | value |
|---|---|
| triangles | **19,336** (1 skinned mesh, 1 material) |
| bbox (rest) | x −0.165…0.165 (depth incl. eye and shoe toes), y 0…1.000, z −0.316…0.316 (mitten to mitten) |
| box (head/torso block) | x ≈ −0.15 (back face)…0.10 (face; the eye bulges to ≈ 0.17), **y 0.27…0.81**, z ±0.19. Crown y 0.81…1.00 |
| skeleton | 78 joints (Tripo biped v3.0, same names as `wai.glb`): `BoneRoot, Hip, Pelvis, L/R_Thigh, L/R_Calf, L/R_Foot, L/R_ToeBase` (+ twist/share bones), `Waist, Spine01, Spine02, NeckTwist01/02, Head, FacialBone, L/R_Eye, L/R_Clavicle, L/R_Upperarm, L/R_Forearm, L/R_Hand`, fingers `L/R_Thumb/Index/Mid/Ring/Pinky1–3`, twist bones |
| rest joint positions (m) | Hip (−0.032, 0.341, −0.002) · Waist y 0.385 · Spine01 y 0.436 · **Spine02 (−0.033, 0.494, −0.002)** · Head (−0.033, 0.619, −0.002) · R_Upperarm (−0.041, 0.510, 0.182) · **R_Hand (−0.043, 0.439, 0.201)** · L_Hand (−0.043, 0.400, −0.234) · feet y 0.127, z ±0.09 |

**Cape anchor = `Spine02`.** The whole box is skinned rigidly to it, so anything parented to `Spine02` stays glued to the box
in every clip. The top-back edge of the box (the shoulder line for the cape) in Spine02-local coordinates is: centre
**(−0.099, 0.302, −0.004)**, left corner (−0.089, 0.302, −0.174), right corner (−0.109, 0.302, 0.166). Spine02's rest world
rotation is almost identity (≈ 3°), so in rest the local axes ≈ model axes (−X = behind). Use
`scene.getObjectByName('Spine02')`. The bone sits low inside the box, so the anchor offset is +0.30 m up.

**Gun hand = `R_Hand`** (character right, +Z). The arms are short, and most of the mitten is skinned to the finger bones
(the mitten has no fingers, so they just follow the hand). The mitten centre in R_Hand-local space is ≈ **(−0.030, 0.031, −0.075)**,
i.e. ≈ 8 cm from the joint. The left mitten centre in L_Hand-local space is ≈ (−0.021, 0.040, −0.041).

### Clips (all in place, no root motion)

| clip | duration (s) | channels | notes |
|---|---|---|---|
| `idle` | 15.37 | 234 | long; loop a sub-range if needed |
| `walk` | 2.37 | 234 | |
| `run` | 1.27 | 234 | strong forward lean; the rigid block tips ≈ 35–40° (the old model hid this by bending). Damping the Waist/Spine bend 50 % barely changed it (most of the lean is on `Hip`), so the clip is left as Tripo made it |
| `jump` | 2.23 | 234 | |
| `shoot` | 9.07 | 234 | crouched; the right mitten only reaches the front corner of the box (hand x ≈ 0.04–0.14 at rest scale), so offset/rotate the gun forward in code |
| `hurt` | 13.83 | 79 | from the second retarget task (rotations + Hip translation only, like `wai_anim_hurt.glb`) |
| `dodge` | 2.71 | 79 | Tripo preset `dive` renamed; a forward dive onto the belly and back up (no true roll preset exists) |

Clip names match `wai.glb` for the five original clips, so code that plays `idle/walk/run/jump/shoot` works unchanged;
`hurt` is now inside the same file (no separate anim GLB).

### Credits (WAI v2)

multiview 30 + rig 25 + 5 clips 50 + 2 clips (hurt, dive) 20 = **125** (balance 380 → 255; limit was 160). No re-roll was needed.
Sheet via Codex (no Tripo credits).

### Notes / known issues

- **Better than v1:** the face is clearly sculpted (iris + highlight, raised stitched X), the sneakers read well, the silhouette is
  cleaner, and the box no longer smears in walk/run/shoot. Paint texture is smoother and more "vinyl toy" than v1's thick, crusty impasto.
  Some of v1's heavy brush relief was lost.
- **Arms are small:** Tripo shortened the arms; from the front they are mostly hidden behind the box at rest, and only the mittens
  show. They animate (and the mittens swing out in walk/shoot), but they do not read as strongly as in the Codex sheet.
- With the block rigid, crouching clips (`shoot`, `hurt`) push the box down over the bent legs, so the knees and shoe tips can
  poke through the box's underside for a few frames. This is hard to see at gameplay distance.
- The crown is an open ring (orange inner wall visible from above).
- Shoulder joints: the arm roots follow the upper arm while the box stays rigid, so small creases can show where the arm enters
  the box at extreme arm poses.

---

## Town kit v3 — Eraser boss, crooked face houses, fountain (2026-11-05)

**Pipeline (same as above):** Codex `codex exec` image generation, one orthographic three-view sheet per asset (front / left
side / back, white background), refs `public/assets/title-blind-plaza.webp` + `reference/ref-1.webp` (houses also got
`reference/concepts/v3/view_hub.png` as a third ref). Prompts: `reference/tools_townkit/p_<name>.txt` (+ `house_common.txt` for the
houses, + `layout.txt`), runner `reference/tools_townkit/run_codex.sh <name>` → sheets `reference/sheets/<name>_sheet.png` →
split with ffmpeg into `<name>_front|side|back.png` (the eraser and wide house with `reference/tools_statue2/split.py`; the
lean/tall/shop/fountain sheets have views that touch, so `reference/tools_townkit/split_cc.py` assigns connected blobs to views
first and then crops/pads with ffmpeg, same common square per sheet) → Tripo `tripo-v3.1` multiview-to-model (front/left/back,
face limit 20k, PBR, standard texture) → scale + pivot only (`reference/tools_statue2/gl.mjs apply`, geometry untouched) →
`gltf-transform optimize --compress meshopt --texture-compress webp --simplify false` with `--texture-size 2048` for the boss and
houses (big hero assets, seen up close) and `--texture-size 1024` for the fountain.

Files: raw Tripo `reference/models_src/<name>_tripo.glb`; scaled/pivoted, unoptimised `reference/models_src/<name>.glb`;
final `public/models/<name>.glb`. Tripo's own renders: `reference/shots/<name>_tripo_preview.png`.
Conventions as everywhere: **+Y up, face = +X, lateral axis = Z, metres, pivot = bottom centre (y = 0 = ground)**, one mesh
node, one material. To face +Z in Three.js: `object.rotation.y = -Math.PI / 2`.

| asset | file | size (m) X deep × Y high × Z wide | footprint X × Z (m, base 3 %) | front | triangles | KB | textures | credits |
|---|---|---|---|---|---|---|---|---|
| THE ERASER (boss) | `public/models/eraser_boss.glb` | **4.00 long** × 3.02 × 3.02 (Z incl. arms) | 3.90 × 2.59 (incl. crumbs) | +X (face) | 18,674 | 827 | 3 × 2048² WebP | 30 |
| tall tower-house | `public/models/house_tall.glb` | 4.80 × **12.00** × 4.63 | 4.27 × 4.15 | +X (face) | 18,888 | 1,270 | 3 × 2048² | 30 |
| wide house | `public/models/house_wide.glb` | 6.63 × **9.00** × **12.00** | 5.88 × 11.42 | +X (face) | 18,899 | 1,423 | 3 × 2048² | 30 |
| leaning house | `public/models/house_lean.glb` | 4.47 × **10.00** × 5.54 | 3.74 × 4.96 | +X (face) | 19,365 | 1,447 | 3 × 2048² | 30 |
| corner shop | `public/models/house_shop.glb` | 3.95 × **8.00** × 5.84 | 2.97 × 5.24 | +X (face, awning) | 19,548 | 1,372 | 3 × 2048² | 30 |
| graffiti fountain | `public/models/fountain.glb` | **3.60** × 2.11 × 3.57 (round) | 3.47 × 3.49 | +X (fish mouth) | 19,024 | 409 | 3 × 1024² | 30 |

Measured world bboxes (final files): eraser x ±2.000, y 0…3.016, z ±1.508 · tall x −2.520…2.280, y 0…12.000, z −2.421…2.205 ·
wide x −3.211…3.414, y 0…9.000, z ±5.999 · lean x −2.275…2.195, y 0…10.000, z −2.812…2.732 · shop x −1.806…2.142, y 0…8.000,
z −3.009…2.833 · fountain x ±1.800, y 0…2.111, z ±1.787. The pivot is the centre of the **footprint** (base slab), not of the
bbox, so the houses sit centred on their foundation; the bbox is a bit larger than the footprint because of roof eaves, the
nose bay / balcony / awning on the +X face and the chimneys. Footprint centres measure within 5 mm of (0, 0) for all files.
Facing checked by rendering every file from +X (az 0): each face/fish mouth looks at the camera.

**Scales:** uniform for all, except **`house_wide` is non-uniform**: node scale (12.67, 9, 12.67) (X/Z vs Y = 1.41) to reach the
requested 9 m high × 12 m wide (uniform would have given 9 × 8.5 m or 12.7 × 12 m). It reads as a squat, wide house; the roof
pitch is flatter than in the sheet as a result (still clearly pitched). Uniform alternative: `scale.set(0.71, 1, 0.71)` on the
loaded object gives 9 m high × 8.5 m wide.

**Preview contact sheet:** `reference/shots/townkit_preview.png` (each file: front from +X with a red +X arrow, 3/4, side, back;
plus a lineup with `wai2.glb` for scale). Rendered headlessly: `reference/tools_townkit/render.sh <job.json>` starts
`serve.py` on 127.0.0.1:8791 (static files from `/tmp/townkit/view`, which holds `index.html` + symlinks `three`, `pub`, `src`)
and headless Chrome with SwiftShader WebGL; `index.html` renders the job and POSTs PNGs to `/tmp/townkit/renders`;
`contact.py` (PIL) assembles the sheet. `measure.mjs <glb>` prints bbox / footprint / triangles / textures (decodes meshopt).

### Notes / known issues

- **Eraser boss:** one mesh, unrigged (animate procedurally: squash via `scale.y`, wobble, lean). Face: angry slanted eyes with
  heavy brows and a big toothy grin, sculpted in relief on the +X end; stubby rubber arms with fists on both sides near the
  front (measured: x ≈ 0.47…1.36, y ≈ 0.58…1.48, |z| ≈ 1.25…1.51) — they are part of the mesh, so they cannot swing on their own; the blue/cream paper
  sleeve with scribbles, crown and X marks wraps the middle third of the length (from the renders). Eraser crumbs sit on the top edge and **as loose
  separate pieces on the ground around the base** (they move with the boss; if that looks odd while it rolls, hide them by
  spawning separate crumb particles instead — they are part of the single mesh, so they can only be removed in a DCC tool). The
  back end is plain worn pink. It shares the grub's design language (pink block + sleeve), which reads as "mother of the grubs".
- **Houses:** all four have steep pitched roofs with tiles and overhanging eaves, chimneys, shutters, doors and a stone
  foundation slab with a flat bottom; faces are made of window eyes, nose bays/drainpipes and door/balcony/awning mouths. The
  **lean house leans less than in its sheet** (Tripo straightened it; the roof and the bulge are still crooked). The tall house's
  witch-hat roof is slightly lopsided toward −X in profile (as drawn). Walls are solid (no interiors); windows are painted/relief.
  Small open details (balcony rail, awning) are solid shells — fine for collision with boxes, not for walking on.
- The houses' doors are big (2.5–3 m) relative to WAI (1 m), consistent with the cartoon scale of the concept art.
- **Fountain:** dry basin with a real hollow bowl (rim top y ≈ 0.60, inner floor y ≈ 0.36), central pedestal with a crowned fish-head
  spout (open pink lips on +X; front-most lip vertex at (1.00, 1.10, 0.02) — the spout opening is just behind it). No water
  geometry: add a water disc at y ≈ 0.45–0.5 inside the rim (inner radius ≈ 1.5 m) and particles from the mouth. A first, statue-like sheet with a much larger fish was
  rejected before Tripo (`reference/sheets/fountain_sheet_try1.png`, no credits spent).
- Codex hit "model at capacity" twice; those two sheets were simply re-run (no credits involved).

### Credits (town kit v3)

eraser_boss 30 + house_tall 30 + house_wide 30 + house_lean 30 + house_shop 30 + fountain 30 = **180** (balance 255 → 75;
limit was 200). No re-rolls were needed. Sheets via Codex (no Tripo credits).

## Tripo v3.1 text-to-3D props (2026-11)

`crown`, `paint_drop`, `checkpoint_can`, `moth_torso`, `moth_wing`, `hush_bell` in `public/models/` (slots `crown`, `paintDrop`, `checkpointCan`,
`mothTorso`, `mothWing`, `hushBell` in `src/assets/manifest.ts`; the procedural versions in `PropModels.ts` / `HushLook.ts` remain as fallbacks).
Raw Tripo outputs (1.4 M tris) are in `reference/tripo_new/`; `node scripts/tripoPost.mjs <in> <out> <size> <axis> <pivot> [yaw] [ratio] [up|flat] [flips]`
decimates to ~14 k tris, 1K webp textures, matte-ifies materials (no env map in game), meshopt-compresses and bakes scale + pivot.
The moth wing is a right wing with its root at the origin (tip +X); the left one is mirrored in code. Torso and bell face +X (manifest `yaw: FACE_Z`).

## The Red Pen's body (2026-11-18)

`public/models/red_pen.glb` (slot `redPen`, 7.5 m, `yaw: FACE_Z`; 18.8 k triangles, 372 KB): Codex three-view sheet →
Tripo v3.1 multiview → `scripts/tripoPost.mjs … 7.5 y bottom 0 1`. Blank cap front = +X, clip on its left (−Z), nib tip
at y 0. `enemy/RedPenModel.ts` fits axis and barrel radius to the fight's rig; the face stays code. 70 credits
(two discarded text-to-3D tries + the multiview). Full notes: docs/level3/SOULS.md "The sculpted Pen".
