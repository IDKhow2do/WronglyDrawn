# Level 3 boss: the souls-like Red Pen fight

Goal: only the Red Pen fight on the roof of Limp Works turns into a souls-like duel (stamina, lock-on, honest
dodge, a giant boss with readable tells). The rest of the game stays as it is. Every new rule is gated on
`SoulsFight.active` (true from the ink gate to the Pen's fall, or to a smudge); `PlayerController.gate` is null
everywhere else, so stamina / lock-on / i-frame changes leave no trace outside the ring.

## Design decisions
- **Scale.** The Pen is the level-2 sky pen ×2.2 = **14.1 m** (`RedPenBody.PEN_SCALE`). One pose drives the drawing
  and four Rapier capsules: nib 0–2.4 m · grip 2.4–7 · barrel 7–10.8 · cap 10.8–14.1 (along the axis from the nib
  ball). Pose = pivot (nib ball) + `Ry(leanYaw)·Rx(tilt)·Ry(face−leanYaw)`. Attack shapes use the same capsules
  (`RedPenBody.gap()`), so what is drawn is what hits.
- **Weak points** (`PenWeak`): NIB, GRIP, CLIP, EYES. Each is closed (paint ×0.18) except in the punish window of a
  move; an open point glows turquoise (halos in RedPenLook) and takes ×2.6 (nib, grip) / ×3 (clip, eyes); the rest
  of the body takes ×0.5 during a window. One TAG per window (CombatDirector's TAG, 5 % of the bar).
- **Arena.** Radius 17 (was 12.5), ringed by a 5.2 m curtain of dripping red ink (`SoulsArena`) with ONE gate facing
  the roof checkpoint. Walking through the gate = entering the fight (it seals behind WAI). Outside the ring: two
  correction scaffolds with REDO banners, two more on the sides, a giant correction-ink bottle; the old tank,
  chimneys and flag stay. No cover inside the ring on purpose: the Pen's reach is the arena.
- **Stamina** (`combat/Stamina`, rows in `Difficulty.SOULS`): roll / jump / sprint cost; refill waits
  `regenDelay`, spraying refills at `sprayRegen` (Hard: spraying pauses it). A spend needs >0 left (the last roll can
  empty the bar); empty = no roll, no jump, WAI pants (0.7 s, speed ×0.78). Normal: 3 rolls in a row, not 4.
- **Aim (changed 2026-11-14 after the author's play).** Free camera and free crosshair, as in the rest of the game; no
  auto lock. **Y** (touch: FIND PEN) swings the view once onto the open weak point nearest the crosshair (or the Pen's
  body) and lets go; any mouse movement cancels the swing. The HUD marks the open weak point nearest the crosshair. The
  follow camera stands 2.4 m further back and 0.8 m higher in the ring (phase 2: 3.2 / 1.3). WAI faces his own aim.
- **Dodge feel.** The roll keeps its speed and the perfect-dodge Paint Time. In the fight the i-frames are exactly
  `SOULS.iframes` from the start of the roll (not the whole roll), shown as a white ghost glow + trail; a hit in the
  rest of the roll lands. After the roll a short recovery lock (`SOULS.recovery`).
  A TAG's leap pauses the roll timer, so a roll into a TAG keeps the glow until the slap. `SoulsFight.frame()` fades
  the glow whenever the fight is off: the last TAG ends the fight during that leap (shots/hero-white/).
- **WAI's actions.** Stagger (light hit: the `hurt` clip once + a reel), knock-down (heavy hit: Tripo `fall` clip +
  flat pose, 1.0 s get-up lock), heavy landing (crouch), pant (out of stamina); roll = existing `dodge` flip.
- **Arrival / death.** Ink gate → pushed through 2 m → intro cine (from WAI's heels up the whole Pen, a wide shot of
  both, its eyes) + name card "THE RED PEN — Head of Corrections" + the long bar at the bottom. Smudged in the ring:
  the SMUDGED sheet (a lined page, the Pen's red "see me!" circle and a teacher's note), back to the roof
  checkpoint 6 m outside the gate, gate open. Gentle and Normal retain the act and remaining corruption. Hard restarts at full corruption.
- **Story kept.** Stickers crossed out at 66 % (Legs) and 33 % (Mouth), the Hush in phase 2, the Eraser in phase 3,
  phase-3 sketch + True Sight, 4 % nib-first fall, the last TAG lends it paint, it DRAWS a wobbly loop. Lines (round 3,
  `RedPenVoice`): the outside standard's voice, short and cold ("An eye does not go there.", "Corrected."), shown as one
  correction slip above the boss bar; in phase 3 they waver as paint gets on it. Full list: docs/level3/PEN_ROUND3.md.

## Moveset (tell / answer / punish / damage)
The timing examples below use the 2026-11-14 tuning. See [current difficulty values](../difficulty/NOTES.md) for the updated rows.

Tell, punish and idle-gap seconds are from the previous Normal; tells and the gap before the next move (round 3: 1.0–1.2 s, phase 3 0.7–0.8 s) × `SOULS.tell` (Gentle 1.3, Hard 0.8; tells in phase 3 × 0.88) and × `SOULS.punish`
(Gentle 1.35, Hard 0.8). Heavy = `SOULS.heavy` half hearts (Gentle 1, Normal / Hard 2) + `Difficulty.hitDamage`
(Normal / Hard +1 on heavy); light = 1 (+1 on Hard). Heavy hits knock WAI down.

| Move | Phase | Tell | Answer | Punish window | Damage |
|---|---|---|---|---|---|
| NIB STAB | 1, 3 | rises 6.5 m over WAI, red ring follows him, LOCKS 0.4 s before the drop (1.15 s) | roll out of the ring when it locks | STUCK 2.8 s: GRIP | heavy |
| — delayed STAB | 3 (55 %) | same, then hangs trembling 0.75 s more | roll late, not at the lock | same | heavy |
| RULED LINE | 1, 3 | leans back, taps the giant ruler, it glows (1.1 s) | JUMP the ruler (9 m/s; phase 3 12 m/s) | LEAN 1.9 s: GRIP low | light |
| CORRECTION SWEEP | 1, 3 | tips 60° to one side, creaks, red sector on the roof (1.35 s) | ROLL THROUGH its body as it swings (0.95 s, 143°) | SPRAWL 2.5 s: CLIP + EYES on the roof | heavy |
| — swing back | 3 (always), 1 (25 %) | pauses 0.6 s at the end of the arc ("Missed a bit!") | roll again on the way back | then SPRAWL | heavy |
| INK FLICK | 1, 3 | shakes its nib, drips (1.0 s); 5–6 blots with landing rings | walk out of the rings; pools stay 7 s | DRY 2.0 s: NIB | light (+1 per s in a pool) |
| MARGIN CRUSH | 1, 3 (when WAI hugs the nib 1.5 s) | rises 2.6 m, eyes down, shrinking ring r 6.2 (0.9 s) | JUMP the shockwave | STUCK 1.7 s: GRIP | heavy |
| UNDERLINE SWOOP | 2 | flies to the rim, a dotted line 3.4 m wide through WAI (1.35 s), crosses the roof in 1.0 s | get off the line / roll as it passes | SKID 2.3 s: NIB + GRIP | heavy; the line stays 5 s (light) |
| CORRECTION MARKS | 2 (every other move) | it comes down to 5.2 m and sprays: exact red outlines of X crosses (6.6 m arms) and strike-through lines (a whole chord), each fill drawn along it like a stroke (1.6 s, staggered 0.35 s) | walk off each outline; never all ways shut (a mark that leaves < 3 clear bearings is dropped) | — (shout it down while it sprays) | light; `SOULS.inkMarks` per volley (2 / 3 / 4) + 1 below 50 % |
| INK BLOTS | 2 | 6 blots with rings over a 9 m patch: one on WAI, one where he is running to | walk out | — (shout it down) | light |
| CROSSED TILES | 2 | a plus of five tiles under WAI hatches in (1.2 s) | two steps to get off | — | light |
| SHOUT → HUSH | 2 (WAI's move) | it comes down to attack (MARKS, BLOT, TILES, SWOOP tell); cruising at 8.5 m it is out of reach | SHOUT (X): the Hush drags it down | DAZED 4.6 s: EYES + GRIP | — |
| GIANT X | 66 %, 33 % | two dotted strokes through WAI (0.95 s, then 0.8 s) | roll off each line | none (it crosses out a sticker) | heavy |

## Tripo ledger (cap 200, balance at start 760)
| # | what | task | credits | total |
|---|---|---|---|---|
| 1 | retarget `preset:fall` onto rig task `3e40101e-401d-47df-bce6-01cdad507e3d` (in place, skeleton only) | `7479816c` | 10 | 10 |

Merged with `reference/tools_wai2/build.mjs` into `reference/models_src/wai2_souls.glb` → `gltf-transform optimize`
(meshopt, webp 1024) → `public/models/wai2.glb` (clips: idle walk run jump shoot hurt dodge fall; 0.87 → 0.92 MB).
The raw Tripo output is `reference/models_src/wai2_tripo_anim_fall.glb`. No other preset fitted (biped presets:
idle walk run dive climb jump slash shoot hurt fall turn; hurt and dive were already in). The Pen and the props are
code-built (a Tripo mesh could not be split into weak points and would not match the flat ink look).

## Files
| File | What |
|---|---|
| `src/enemy/RedPenBoss.ts` | the spine: act gates, damage rule, attack picker, TAG anchor, ending |
| `src/enemy/RedPenBody.ts` | pose, four capsules, weak-point positions, gap / pushOut |
| `src/enemy/RedPenLook.ts` / `RedPenSkin.ts` / `RedPenModel.ts` | the look: face, halos, sketch, splats / matcap surfaces / the Tripo body fitted to the rig |
| `src/enemy/RedPenMoves.ts` | ground moves (STAB, RULE, SWEEP, SPLAT, CRUSH) + the hop walk; `PenRig`, `Threat` |
| `src/enemy/RedPenSky.ts` | phase 2 (fly, SWOOP, blots, tiles, Hush) + act changes (GIANT X, self-cross) |
| `src/enemy/RedPenHazards.ts` | floor tells (ring, sector, dotted line), ruler, ink lines, pools, tiles, blots; `rubOut` / `nearestRed` for the Eraser |
| `src/enemy/RedPenMarks.ts` | the sky's correction marks (X crosses, strike-through lines): outline → stroke fill → landing; the way-out rule; `safeSpot` for bots |
| `src/enemy/RedPenVoice.ts` | its lines (the table, en source) and the rate rule (one at a time, act lines queue); drained by SoulsFight into SoulsHud |
| `src/enemy/RedPenAllies.ts` | the Hush (drag-down; smothers one mark per 9 s) and the Eraser (rubs one red pool / line per 5 s; rubs the nib open per 15 s) |
| `src/enemy/RedPenLook.ts` | the Pen's body: exact machined parts, clip on the side, aperture eyes, halos, splats |
| `src/enemy/RedPenSkin.ts` | its matcap surfaces: lacquer, chrome, knurled steel, engraved band |
| `src/level/works/SoulsFight.ts` | the switch: gate → intro → fight → smudge / finish; implements `PlayerGate` |
| `src/level/works/SoulsArena.ts` | ink curtain ring + gate, props round it |
| `src/level/works/SoulsCamera.ts` | the camera rules: never inside the Pen (push-out, unblock, near fade), inside the ring in play, the Pen's own TAG shots. Since 2026-11-15 the follow camera's own boom ignores creatures' colliders and leaves the Pen out of its body limit (docs/regression/CAMERA.md): `unblock` alone brings the camera forward of the Pen |
| `src/combat/Stamina.ts`, `src/player/PlayerGate.ts`, `src/render/LockOn.ts` (now an aim assist: one Y swing), `src/ui/SoulsHud.ts` + `souls.css` | the systems |
| `src/meta/Difficulty.ts` | `SOULS` rows, `STAMP` rows (Stamp Press hop / shockwave) (appended) |
| `docs/level3/bot/souls.mjs` + `souls_brain.js` | the fight bot (in-page, answers each `pen.threat`, walks off marks, aims by turning the camera) |
| `docs/level3/bot/sky_probe.mjs` | hits per minute in the sky phase (dodging bot / standing still), volleys, marks the Hush smothered |
| `docs/level3/bot/souls_shots.mjs` | staged screenshots `shots/fix_*.jpg` + numbers (paint landed, camera gap) |
| `docs/level3/bot/pen_shots.mjs` / `noshove.mjs` | the Pen's look shots (`fix_pen_*`) / item-4 probe |
| `docs/level3/bot/barriers.mjs` | level-3 barrier sweep: walk + Long-Legs sprint jump at every shut barrier |

## Verification (2026-11-13/14, own Vite :5241 + headless Chrome :9441–9443, --mute-audio)
- `npx tsc --noEmit -p .`: clean.
- **Fight bot** (`docs/level3/bot/souls.mjs` + `souls_brain.js`, in-page, answers `pen.threat`): from the roof stair, walks
  through the gate, locks on, fights to the end, the Pen draws, LEVEL COMPLETE, `__errs` empty.
  | run | result | game time | hits / smudges |
  |---|---|---|---|
  | Gentle (final code) | won → level complete | 310 s | 20 / 1 (came back at the act reached) |
  | Gentle (earlier) | won | 193 s | 3 / 0 |
  | Normal ×3 | won each time | 148 s · 341 s · 571 s | 3/0 · 21/1 · 31/2 |
  | Normal (final code, get-up protection) | won → level complete | 246 s | 7 / 0 |
  | Hard (once, 480 s cap) | not won (reached phase 2, 6 smudges) | — | — |
  The bot has perfect information (the threat API) but plays honestly with stamina and i-frames; its misses are mostly
  the phase-3 swing-back and standing in pools. After the Normal runs a knock-down now gives 1.45 s of get-up
  protection (a hit + the swing-back used to be a guaranteed 6 half hearts).
- **Level 3 from the start** (`docs/level3/bot/full.sh`, all walking, Gentle): PASS, roof at 300 s, fight 309 → 550 s,
  LEVEL COMPLETE, game time 491 s, no errors (w3bot hands the roof to souls_brain.js).
- **Level 1** (`docs/level1-expansion/bot/full.sh`, copy on my ports) and **level 2** (`docs/level2-expansion/bot/full.sh`)
  on Gentle: both LEVEL COMPLETE, `__errs` empty (L1 929 s wall / L2 612 s wall, game 470 s).
- **Frame cost** (`souls_perf.mjs`, headless, 60 Hz cap, three Chromes running at once):
  | moment | draw calls (mean / max) | k tris (mean / max) | ms/frame mean / worst |
  |---|---|---|---|
  | roof, fight on, Pen idle | 191 / 192 | 547 / 557 | 16.7 / 24.6 |
  | ink pools + SWEEP (tell → swing → sprawl) | 177 / 198 | 628 / 651 | 16.7 / 23.7 |
  | phase 2 SWOOP + its ink line | 203 / 232 | 602 / 683 | 16.7 / 18.4 |
- Screenshots (`souls_shots.mjs`, looked at one by one): `docs/level3/shots/souls_gate, souls_intro, souls_phase1,
  souls_weakpoint, souls_lockon, souls_phase2, souls_phase3, souls_death, souls_ending`.
- Bugs found by looking: the SMUDGED sheet's class was also put on `<body>` and hid the whole page (renamed);
  the phase-2 camera beat looked at the Hush before it existed (flew to F1); the lock-on stared straight up at an
  overhead Pen (now capped, pulls back, frames the ring at WAI's feet); the finale shot sat behind the parapet.

## Not verified
- Sound (Chrome muted). Touch LOCK button on a device. The three other art styles. A human playtest (feel, fairness).
- Hard beaten by anyone. Co-op partner in the ring (Companion does not know the new state names; it does not dodge).

## Next (if wanted)
- A human pass on Normal; then tune `SOULS.tell/punish` and the sweep arc (the riskiest move).
- Keep the Pen red in this fight instead of the game-wide repaint tint (it turns purple/pink as it is painted).
- Sounds of its own for the 14 m body (today it borrows bigStep / slamLand / whoosh).
- Tripo: 190 credits left in the cap; a detailed Pen mesh would not split into weak points, so not used.

## Playtest fixes (2026-11-14, after the author's play to the end)
Seven items from the author's notes, plus item 8 (the Pen's look). Status is kept current here, in small steps (a restart loses nothing).
Found on disk at take-over (previous agent, untested): the code marked "half" below.

| # | Item | Status | What is on disk / what is left |
|---|---|---|---|
| 1 | Aim first: free camera + free aim, Y = one-shot "swing onto the Pen" | done; bot WON on Gentle and Normal without Y | LockOn reduced to `snap()` (mouse cancels it), no auto lock, `faceTarget` null, HUD marker = nearest open point, toast/touch/zh text changed, bot aims with the camera. Staged check (`bot/souls_shots.mjs`, camera turned like a mouse, 5–6 m from the point): paint landed in 0.8 s on GRIP 44–68, NIB 80–87, EYES 43–55, CLIP 74 (one run 2: the sprawl had ended, script now gives each point its own window). Y: one tap leaves the crosshair 2–3° off the Pen. Fight bot (aims by turning the camera, never Y), Gentle from the roof stair: WON, game 172 s, 3 hits, 13 TAGs, 6 shouts, `__errs` empty. Normal: WON, 757 s game time, 53 hits, 7 smudges (Normal restarts at full; the machine was at load ~350), no errors. |
| 2 | Camera never inside the Pen | done, shots looked at | Moved into new `src/level/works/SoulsCamera.ts`: guard (capsules + 0.9 m, roof, and in play INSIDE the ink ring: a camera behind the curtain veiled the whole view pink, which also made the Pen read lilac), re-aim after a push, near fade, and the Pen's OWN TAG shots (CombatDirector frames a TAG from the root's bounding box: for the 14 m Pen the slap shot sat inside the body, image 9). Plus: in play the Pen's body between WAI's head and the camera brings the camera forward (as a wall would); when that leaves under 2.2 m (WAI hugging the body after a TAG leap, the Pen leaning over him; the follow camera's own collision also stops on the capsules) the camera picks a spot 3.2 m round WAI with room and a clear line, and looks at him (`fix_tag_after`: WAI in frame, camera 1.4 m off the body; before: camera squeezed onto his head, nothing in view). Staged TAG at a stuck nib: shot 1 frames WAI + the grip (camera 6 m from the surface). |
| 3 | The Pen stays red; ending framing | done, shots looked at | `keepRed()` undoes the tint, `addSplat` paint blobs on hits, `paintAll()` at the drawing; gate posts + lintel sink with the ink. Found by looking: the Pen read pale lilac in many frames for two reasons, both fixed in SoulsCamera: the camera behind the ink curtain (veil) and the near-fade starting 3 m out (whole body at 0.57 alpha). Splats made larger (1.2 / 1.7 m, 2.2 m at the ending). Ending shot: red pen with paint. Result card: in the staged ending WAI fell through the roof to F3 (the floor culler then drew F3 under the postcard camera). Cause: the staging teleported WAI to `pen.pos`, which in FINAL is the buried nib (y 25.9 < roof 27); fixed in the script. Kept a guard anyway: `SoulsFight.settle()` now also runs in the won-over ending and never lets WAI sit under the roof inside the ring. Result card: the won-over Pen's drawing loop passed right in front of the postcard camera (a 14 m red wall over the card); the game stops stepping at the card, so the Pen froze wherever it was. Now it draws its loop in 5.2 s, then steps to a spot between the title and the card (arena −6, −4) and stands there admiring it (`fix_result`: the whole red pen with paint, no post). Also no fog on the Pen: the roof's dusk haze turned a Pen 13–20 m away pink (upright Pen in the aim shots). |
| 4 | WAI never moves the Pen | done, probed | `knock()` no-op, no jelly squash. Found: the lean / face snapped instantly toward WAI (`leanYaw = yawTo(...)`), so WAI hopping round the nib swung the 14 m body left and right. DONE: `PenPose.turn()` eases lean / face and holds still with WAI < 2.6 m from the nib (RedPenMoves, RedPenSky). Probe `bot/noshove.mjs`: Pen STUCK while WAI jumps on / against it for 2.5 s: pivot moved 0 m, turn ≤ 1.9° (its own settle); WAI circling the nib at 1.6 m with jumps for 3 s: lean / face change 0° per frame (it answered with MARGIN CRUSH, as designed). |
| 5 | F3 card-catalogue door + level-3 barrier sweep | done (probe 12/12 PASS; level-3 full run PASS) | Door: two hinged cabinet leaves, steel frame, CLOSED tape; swings into the Index; solid shut and open. (Old bug: the gate cabinets slid 1.15 m into the Index and lost their collider: walk-through.) Sweep (`bot/barriers.mjs`: walk + Long-Legs sprint jump at each, both sides of the QC arm): the lift tape, the lift cage gate, the QC arm and the roof-stair grille were all JUMPABLE (4 FAIL). Now: tape + QC arm get a wire shutter to the ceiling (rolls up on open), the cage gate fills the front to the roof frame (folds up), the grille reaches the ceiling (slides up); 12/12 PASS |
| 6 | Stamp Press: longer hops, shockwave ring | done, shots taken | `STAMP` rows in Difficulty.ts (hop 2.2 / 2.6 / 3.0 m, 0.74 / 0.68 / 0.62 s, ring r 3.0 / 3.4 / 3.8), ring drawn thicker + brighter in the tell, the slam's effect ring now grows to exactly the hit radius (it was drawn at 2× the radius) |
| 7 | Hush + Eraser sized for the 14 m Pen | done, shots looked at | Eraser 3.4 m (beside the Pen in phase 3), Hush 4.2 m hovering over WAI in phase 2, its dust (×7.5) over the dazed Pen. `fix_helper_*` |
| 8 | The Pen's look: clip off the face, real materials, form detail, judging face | done; shots looked at; bots re-run | DIRECTION (author, 2026-11-14): the Pen is the outside world's standard of judgement, the one thing NOT drawn wrong: exact, manufactured, cold, out of place against the crayon city. Done: clip on the cap's SIDE (+X; rivet, ball end; `RedPenBody` WEAK.clip side 1.4 m; sprawled it lies level at 1.2 m), new `RedPenSkin.ts` matcaps (deep red lacquer with one clean streak, chrome collars at every join + nib + clip + glasses, a precisely knurled steel grip, an engraved steel band: CORRECT, ruler ticks, serial number, standards mark; no wear), thin even outlines, a nib slit + hanging ink drop, cap seam + top button. Face: aperture irises (blades, hexagonal stop, gauge ticks, chrome bezel) that track WAI and never blink, ruler-straight brows, exact half-moon glasses; at the ending a crooked crayon star appears in each eye. Cost: 40 → 42 visible Pen meshes (static parts merged per material); `souls_perf.mjs` roof idle 228 → 246 calls mean (different idle moment), 16.8 ms/frame mean, worst 21 ms (before 68). Fight bot Gentle with the new Pen: WON, 176 s game, 4 hits, 0 smudges; it painted CLIP and EYES by aim. |

### Verification of the playtest fixes (own Vite :5251, headless Chrome :9451 / :9452, --mute-audio, English profile)
The machine ran at load average 280–390 (other agents' Chromes) the whole time: bots ran 2–4× slower in wall time.
- `npx tsc --noEmit -p .`: clean after every step.
- `bot/barriers.mjs`: before 4 FAIL / 12 (lift tape, cage gate, QC arm, roof-stair grille all jumpable with Long Legs), after 12 / 12 PASS.
- Fight bot (`souls.mjs roof … gentle`), no Y, camera-turned aim: WON, 172 s game time, 3 hits, 13 TAGs, 6 shouts, 1 smudge, no errors.
- Fight bot Normal: WON (757 s game, 53 hits, 7 smudges), no errors.
- Item 4 probe `bot/noshove.mjs`: pivot 0 m, turn ≤ 1.9° while WAI jumps on the stuck Pen; 0° lean / face swing while he circles the nib.
- With the new Pen (item 8): fight bot Gentle WON (176 s game, 4 hits, 0 smudges), Normal WON (265 s game, 18 hits, 0 smudges),
  both without Y, `__errs` empty. CLIP from its side: 32 paint in 0.9 s, the clip 1.76 m above the roof when sprawled.
- **Level 3 from the start** (`full.sh`, Gentle, all walking, run 7): PASS, LEVEL COMPLETE at 568 s wall, game 504 s, 1 fall,
  no errors. (`souls_brain.js` now walks round the roof-hatch railing when it sticks on the way to the gate.) The result card
  after that real win: `shots/fix_result_botwin.jpg` (the whole red Pen with paint, its face, between title and card).
- Chromes: twice something on the machine SIGTERMed every Google Chrome (exit 15) mid-run; the last runs use Playwright's
  `chrome-headless-shell` (Metal GPU, `--remote-debugging-port=968x`) instead.
- Screenshots `shots/fix_*.jpg` (`souls_shots.mjs all`, `pen_shots.mjs`), each looked at.

## The sculpted Pen (2026-11-18: "it looks cheap; model it with Tripo; the big boss must look mighty")

- **What changed.** The Pen's body is a Tripo model (`public/models/red_pen.glb`, slot `redPen`): an armoured crimson
  fountain pen with a steel crown, a riveted collar, a sword-blade clip, a ruled steel band with the check seal, a
  ribbed black grip and a lance nib. No fight rule, timing, hit point, collider or weak-point number changed.
- **The rig is one rigid pose.** The four "segments" are four capsules on one kinematic body; nothing bends or
  telescopes. So the model is ONE rigid GLB. Code keeps everything that moves or reports: eyes, lids, brows, glasses,
  the crayon star, the ink drop, halos, phase-3 sketch lines, the red X, paint splats (`RedPenLook`).
- **Pipeline.** Codex three-view sheet (two drafts; the second redrawn to the rig's proportions) → Tripo v3.1
  multiview (front / left / back, face limit 20 k) → `node scripts/tripoPost.mjs <raw> public/models/red_pen.glb 7.5 y
  bottom 0 1` (1K webp, meshopt, matte; 18.8 k triangles, 372 KB). Sheet: `docs/level3/shots/tripo-pen/sheet_three_view.png`;
  prompts and raw outputs: `reference/tools_redpen/` (not in git).
- **Fit (`RedPenModel`, manifest `height: 7.5, yaw: FACE_Z`).** 7.5 m (scale 1) puts the model's grip (1.4–3.2 m),
  clip (5.0–6.5 m) and blank cap front (5.1–6.6 m) on the WEAK table's grip (2.14), clip (5.45) and eyes (6.02). The
  axis and the barrel radius are measured from the mesh; x/z are squeezed ×0.84 to a 0.62 m barrel (the sheet's pen
  is fatter than the capsules allow).
- **Two honest differences from the colliders.** (1) The crown stands 2.4 m (at ×2.2) above the cap capsule's top: in
  a sweep it passes over WAI without a hit. (2) The body shows up to 0.15 m outside the capsules. Both err toward the
  player. A truly fatter Pen needs fatter capsules: that is a fight change, not done.
- **Surface.** `sculptSkin()` in `RedPenSkin`: the GLB's colour and normal map under a neutral gloss matcap, unlit,
  transparent, fog-free, like the rest of the Pen's skin. As lit PBR the crimson went near black in the roof's dusk.
  The ink line is the actor ink shell `markActor` adds to sculpted meshes.
- **Splats and halos follow the surface.** `look.radiusAt(y)` replaces the radius table in `RedPenBoss.splatOnBody`
  (splats were buried in the wider cap); halo radii come from it too.
- **The switch.** `?pen=drawn`, or a missing `red_pen.glb`, gives the body drawn from primitives (unchanged).
- **Tripo ledger.** text-to-3D ×2 (20 + 20, both too plain: a small office marker), multiview ×1 (30). Total 70,
  balance 565 → 495. The owner approved a cap of 60, then asked for the three-view route and allowed a re-generation.
- **Checked (built-in browser 800×600, `docs/level3/bot/pen_look.js`, the fight stepped by hand).** Standing shots
  (wide, face, clip side, nib), title screen, STAB tell, STUCK + grip halo, SWEEP tell, SWEEP, SPRAWL + clip / eyes
  halos, phase 2 in the sky, phase 3 sketch, FINAL nib-first: `docs/level3/shots/tripo-pen/after_*.jpg` against
  `before_*.jpg`. No console errors. `npm run build` passes. Frame cost, Pen upright, same camera, 150 frames with
  `gl.finish()`: drawn 139 calls / 536 k triangles / 2.45–2.66 ms; sculpted 116 calls / 564 k / 2.30–2.50 ms.
- **Not checked.** A real hand playing the whole fight; phones; the intro cine's framing with the taller crown; the
  ending (it DRAWS) and the near-camera fade were not shot.

## Status log
- 2026-11-14 (playtest fixes): items 1–8 above; status table and verification kept current while working.
- 2026-11-13: read the level, the boss, player, camera, difficulty, bots. Tripo `fall` retargeted (10 credits).
  Built every file above; tsc clean; first in-browser checks (gate, ring, HUD, fight starts).
- 2026-11-14: bot fights on Gentle / Normal / Hard, level 1–3 regressions, perf, screenshots, fixes listed above.
- 2026-11-15 (round-3 regression, docs/REGRESSION.md): the ruler MESH lay along the sweep direction (yaw had + π/2 on
  a box whose long axis is local x), 90° off the swept line that hits WAI. `PenHazards.startRuler` now turns it square
  to `ruler.n`; the hit rule and RULER_KNOCK are unchanged.

## Phase 2 retune (author playtest, 2026-11-15: "a shout always brings it down, no cooldown; phase 2 has no pressure")

- **The Hush rests.** After a drag-down the Hush cannot wrap the Pen again for `HUSH_REST` = 9 s ÷ SOULS.punish (Gentle 6.7 s,
  Normal 9 s, Hard 11.3 s), counted from the moment the Pen is back in the sky. A shout in that time answers
  "THE HUSH NEEDS A BREATH!"; "HUSH IS READY!" shows when the rest ends; the counter hint says to dodge meanwhile.
- **The move order runs on.** `PenSky.n` was reset on every RISE, and every swoop ends in a RISE: the act was "marks,
  swoop, stuck" on a loop, blots and tiles never came, every second move was a free opening. Now: marks, swoop, marks,
  tiles, marks, swoop, marks, blots.
- **Cadence.** tell(0.6) + 0..0.3 s between sky moves (was tell(1.4) + 0..0.5).
- **Reach.** Marks: SOULS.inkMarks + 1 (+1 past the middle), and three blots lobbed half-way through the volley. Blots 4 → 6
  over 9 m (was 5 m), one leads WAI. Tiles 3 → a plus of 5. Swoop band 2.4 → 3.4 m, crossing 1.25 → 1.0 s.
- **Checked (Gentle, stepped 1/60 s, WAI standing still and kept alive):** 40 s without a shout = 9 sky moves, all four
  kinds; 60 s with a shout every 0.25 s = 4 drag-downs (one per 15.5 s: 8.6 s down, then at least 6.7 s of attacks),
  51 shouts refused with the answer. Before: every attack could be shouted down at once.
- **Not checked:** Normal and Hard numbers, whether a dodging player can still win (no bot fight run), feel with a real hand.
