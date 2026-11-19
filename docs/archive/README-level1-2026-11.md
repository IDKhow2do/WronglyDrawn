# Wrongly Drawn · 错画之城 — Level 1 "Blind Plaza"

**发版或接手项目时，请先读 [发布规则和待办](RELEASE.md)。**各渠道当前版本、验收标准和收尾命令都在这里。

A third-person 3D action-puzzle sandbox in the browser (**Three.js + TypeScript + Vite + Rapier 3D**).
You play WAI, a one-eyed graffiti monster in a city that is painted *wrongly*. Spray paint to repaint
corrupted creatures (nobody dies), take back their organs (Eye, Mouth, Legs), then **wear** them as
abilities or **lend** them to almost anything in the world to bring it to life.
Goal: **Wake the Plaza 3/3** and walk through the arch.

```bash
npm install
npm run dev        # http://localhost:5188
npm run build      # tsc + production build
```

## Controls

| | Desktop / MacBook | Phone / tablet |
|---|---|---|
| Move | WASD (Shift run) | left-thumb joystick (push to the rim to run) |
| Look | mouse (click to lock the cursor) · **two-finger trackpad swipe** · arrow keys | drag with the right thumb |
| Aim → first person (inside WAI's eye) | hold **right mouse** or **Z** | AIM (toggle) |
| Spray paint | hold **left click** | SPRAY |
| Paint colour | T | COLOR |
| Jump / dodge roll | Space / C | JUMP / ROLL |
| Select Eye / Mouth / Legs | Q / R / F (hold: purify a corrupted organ, or recall a lent one) | EYE / MOUTH / LEGS |
| Stick the selected organ on something | E (aim at it in first person, or stand next to it) | E |
| Chomp (Mouth worn) | V | CHOMP |
| Pause / settings (music, sfx, sensitivity) | Esc | ❚❚ |

## What's in the level

- **Organs, worn or lent.** Worn: Eye = *True Sight* (aim to make "undrawn" pencil sketches solid), Mouth = *Chomp*
  (bite, swallow grubs and spit them), Legs = *Long Legs* (2.9 m jump, faster run). Lent: any prop gets generic
  behaviour from its size and traits — legs make crates and benches follow you (ride them and steer with WASD),
  bolted lamps and statues turn to face you, buildings just kick feebly; eyes keep undrawn geometry real inside their
  gaze cone; mouths eat rubble, grubs and paint and bite monsters. Combinations stack (Eye + Legs crate = a walking
  lighthouse). Every attach gives a reaction, never "nothing happens".
- **Spray can, not a gun.** A short-range paint mist (about 7 m; the crosshair says "too far") with a regenerating tank.
  Paint stays on every surface as real strokes. Corrupted creatures get repainted: their colours brighten as the
  corruption drains, then they calm down and give up their organ. Grubs hop away as clean little erasers.
- **Graffiti becomes real.** Dashed outlines on walls: spray one full and it comes alive. A ladder you can climb, an
  eye that keeps watching the sky stairs, a crown that pops off the wall.
- **Eye first.** A gentle Peeping Lamp right by the spawn drops the Eye. Two undrawn steps next to it teach True Sight.
- **Three faces to wake** (each one paints itself a permanent organ and gives your sticker back):
  Sleepy Wall ← Eye (its gaze paints the canal bridge) · Gatehouse ← Mouth (shouts the drawbridge down) ·
  Blind Statue ← Eye (it looks at the arch; the eraser rubble crumbles and the sealed door opens).
- **Enemies:** Crooked-Leg Mutant (3.3 m: roar, kick, stomp shockwave to jump over, charge that dazes it against walls
  and exposes its knees) → Legs. Chomper Bin (eats front shots and spits them back; hit it while it chews) → Mouth.
  Peeping Lamp (sweeping ink beam, hide behind cover; spray the pupil while it's tired). Eraser Grubs (rub out paint).
- **Several ways through** every gate, for example onto the low roof: Long Legs jump, ride a legged crate, the painted ladder,
  or bait the mutant's charge into the wobbly scaffold so it collapses into a ramp.
- **12 crowns** (Odyssey-style), paint drops (heal), spray-can checkpoints, region banners, objective hints that
  adapt to what you've done.
- **Feel:** fixed-step physics, hit-stop, slow-mo on big repaints, camera shake from big footsteps, a roar that pulls
  the camera, ink creeping in at the screen edges when a monster is close, a boss bar, hit markers.
- **Audio:** everything is synthesised in WebAudio (no files): spray hiss, squelches, bites, roars, chimes, plus
  generative layered music (title / explore / danger / combat / victory) that gets brighter as faces wake.
- **Title:** your Blind Plaza art with the HUD as real stickers. On Start they burst off, the camera pushes into the
  painting while the game loads underneath, and it dissolves into the same composition in 3D.

## Art & asset pipeline

- **Concept & textures:** Codex image generation (from the reference art): tileable impasto textures + height maps
  (`public/textures`), facade murals, district concept paintings and a layout map (`reference/concepts`), three-view
  sheets (`reference/sheets`).
- **3D:** Tripo from the Codex three-view sheets (`public/models`). Creatures with joints were generated **in parts**
  (mutant body/thigh/shin/foot, chomper body/lid, lamp post/eye) so code drives every joint. WAI uses Tripo's rig and
  clips (idle/walk/run/jump/shoot) through an `AnimationMixer`. Models were optimised with gltf-transform
  (meshopt + webp, 70 MB → 5 MB); the originals are in `reference/models_src`. See `docs/ASSETS.md`.
- Everything is wired through `src/assets/manifest.ts` (`FACE_Z` turns Tripo's +X facing to the game's +Z).
  Delete an entry and the procedural fallback comes back.
- Materials: lit painted surfaces with impasto normal maps generated from the height maps, plus ink outlines.
  No post-processing; the first-person spray can is rendered in a separate pass, so it never clips into walls.

## Testing hooks

`http://localhost:5188/?test` installs `window.T` (drives real keyboard/mouse/touch events, `T.start()`, `T.grant('EYE')`,
`T.walkTo`, `T.lookAt`, `T.shot(name)` → saves a frame to `reference/shots/` through a dev-only endpoint) and
`__WD.advance(seconds)` for deterministic simulation. The full progression (all three faces → arch → complete), every
boss fight, organ purify/lend/recall, riding, the painted ladder, follow behaviour, canal recovery and mobile touch input
were exercised this way.

## Design docs

- `docs/LEVEL1_DESIGN.md`: the design.
- `docs/CODEX_REVIEW.md`: an independent review by Codex. Most of its top items are already done: follow bug,
  canal recovery, Eye first, looser jumps, nest gating, rubble at 3/3, colour lock, range hint, non-lethal grubs,
  gaze readability, mouth line of sight.

## Known limitations / next

- The statue is still a one-step wake (Codex suggests turn + clean + look as a three-organ finale).
- Paint doesn't yet change AI (a "fresh paint lures grubs" rule), and gameplay paint shares the visual stamp buffer.
- WAI's Tripo rig slightly smears the box corners in the run cycle; legs on hosts are procedural rigs.
- Audio is untested on real speakers by me (no audio output in automation); levels and mix may need tuning.
- One level only; the Correction Tower is a teaser on the horizon.
