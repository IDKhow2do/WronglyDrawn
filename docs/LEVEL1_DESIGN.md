# Wrongly Drawn — Level 1 "Blind Plaza" redesign

Status: proposal, 2026-11-04. Replaces the proof-of-concept slice (legs → box → ledge).

## 1. Why the current slice isn't fun (honest review)

| Problem | Effect |
|---|---|
| One straight line of tasks, each done once | No choice, no exploring, no "aha" |
| Organs are keys that get used once | The organ idea, our identity, feels like a fetch quest |
| A tiny enemy with one kick | No threat, no reason to move during combat |
| Shooting is "hold click, the meter drops" | No aiming skill, no feedback, no weapon feel |
| No sound, no hit-stop, few reactions | The world feels dead even though it's colourful |
| "Blind" Plaza is about legs | The name and the gameplay don't match |
| The title is a static image and a button | No first impression |

## 2. The core idea: an organ is either *worn* or *lent*

WAI can **wear** a sticker himself (an ability) or **lend** it to an object (that object comes alive).
He owns only one of each organ, so every lend gives up an ability. That trade-off is the puzzle engine
of the whole game.

| Organ | Worn by WAI (ability) | Lent to an object (object comes alive) |
|---|---|---|
| **EYE** | *True Sight*: hold Right Mouse to aim. Things WAI looks at that "were never drawn" (invisible platforms, secrets, weak points) become solid and visible | A wall/lamp/statue with the eye **keeps looking**. Whatever is in its gaze cone stays real (a bridge exists only while the wall watches it) |
| **MOUTH** | *Chomp*: melee bite, swallow small enemies or paint blobs and **spit** them as heavy shots; eating paint drops heals | Walls/bins **eat** things: rubble, enemies walking past (ref image 3), blocked doorways |
| **LEG** | *Long Legs*: higher jump + faster run (reach rooftops) | Crates, benches and statues **walk** (the moving platform we already built), and can carry WAI |

Keys follow your reference HUD: **Q = Eye, R = Mouth, F = Legs** to wear or unwear;
**E** on an object lends the selected sticker; **hold E** on a lent object recalls it.
(Purify moves to holding the sticker's key while it is corrupted.)

## 2b. Systemic rule: organs are verbs, so almost anything can take one (the "Zelda" rule)

No scripted "this socket takes that key". Every prop in the level is an **OrganHost** described by a few traits:

| Trait | Values |
|---|---|
| size | small (bucket, cone, bin) · medium (crate, bench, lamp) · large (statue, wall, building) |
| anchored | can move / bolted down |
| material | wood · stone · metal · paint · eraser |

An organ grants a **generic behaviour** that reads those traits, so results emerge instead of being authored:

| Organ on… | small | medium | large / anchored |
|---|---|---|---|
| **LEG** | trots after WAI like a pet, sits on pressure plates | walks to **wherever WAI aims** (E while aiming), rideable | can't walk: **turns in place** to face WAI (statue, lamp heads), or strains and shakes off dust |
| **EYE** | looks around, alerts WAI to nearby secrets | a gaze cone that makes "undrawn" geometry real wherever it looks | a long gaze beam (a wall eye builds a whole bridge) |
| **MOUTH** | nibbles paint drops for WAI (heals) | eats rubble, grubs and small props in front of it; spits them back out | bites anything walking past, enemies included; eats walls of eraser rubble |

Combinations stack, and that's where the fun is:
- **Eye + Leg** on a crate: a walking lighthouse that carries its bridge with it.
- **Mouth + Leg**: a hungry crate that hunts Eraser Grubs.
- **Eye + Mouth** on a wall: a turret that bites whatever it sees.
- **Leg on a stunned enemy's body**: it runs off (comedy, and a distraction).

**Never "nothing happens"**: every host reacts. An eye on a bucket blinks and stares at you, a mouth on a stone
burps ("too crunchy"), legs on a building kick feebly and the building sighs. Reactions are short, funny and
voiced with SFX, so experimenting always pays off with a laugh, a hint, or a secret Crown.

**Several ways through every gate** (each needs to work and be tested):

| Goal | Ways to do it |
|---|---|
| Reach the east rooftops | wear Legs and jump the awnings · walk a crate to the ledge and ride it · give the bench legs and stack it under the crate · lure the mutant's charge into the scaffold so it collapses into a ramp |
| Cross the canal | the Sleepy Wall's gaze bridge · wear the Eye and walk where you look · an Eye+Leg crate walks beside you projecting the path · get the Long-Legs jump from the pier crates |
| Clear the arch rubble | lend the Mouth to the arch wall · a Mouth+Leg crate eats through it · bait the Crooked-Leg charge into it |
| Beat the Crooked-Leg Mutant | shoot the knee weak points · lure it into a mouth-wall · make it charge a wall to stun itself · drop the walking crate on it from a roof |

## 3. Story hook (one paragraph, told by the world)

The **Correction Tower** and its giant Eraser are "fixing" the wrongly-drawn city, starting with its eyes, so
nobody can see what is being erased. Blind Plaza's three great faces had their eyes rubbed out. Their organs
were scattered and corrupted into mutants. Half the plaza "was never drawn": you can only walk on it where
something is looking. WAI is wrongly drawn too (one eye, a crooked crown), and he can take the organs back.

## 4. Level structure: an Odyssey-style sandbox (one hub, three districts, any order after the first)

```
                         [ ARCH → Correction Tower ]   (opens at 3/3 faces awake)
                                    |
   WEST: Canal of Unseen Bridges — PLAZA HUB (blind statue) — EAST: Sleepy Wall Alley & Rooftops
                                    |
                               SPAWN STREET
```

Main goal **"Wake the Plaza 0/3"** (big beats, like Power Moons):

1. **Sleepy Wall** (east, the big face building from the art): the tutorial district.
   *Crooked-Leg Mutant* (rebuilt and big, see §5) → **LEG**. Wear the legs to climb the rooftops.
   On the rooftop, the *Peeping Lamp* mini-boss holds a corrupted **EYE** → purify → lend the eye to the
   Sleepy Wall → it wakes (**1/3**) and its gaze **paints a bridge** across the canal (ref image 2).
2. **Canal of Unseen Bridges** (west): True Sight platforming over the canal (wear the eye and look at the path
   to make it real), plus a *Chomper Bin* → **MOUTH**. Lend the mouth to the gagged canal wall: it swallows the
   Eraser rubble damming the canal and the water route opens (**2/3**).
3. **The Blind Statue** (hub centrepiece): a 3-step puzzle that uses all three organs. Lend **legs** to the
   pedestal so it turns, lend the **mouth** to eat the eraser-crust off its face, give it the **eye** →
   the statue wakes and turns to the arch (**3/3**). The arch rubble crumbles, the Correction Tower appears,
   and the level is complete.

Side content (the reason to explore):
- **10 Crowns** (Power-Moon-style collectibles): hidden behind True Sight, on rooftops (legs), inside
  mouth-walls, for beating an enemy wave, for a time trial on the walking crate, and so on. The completion
  screen shows x/10.
- **Paint drops** (coins): heal, and show the way.
- **Graffiti tags**: painting all the blank tag spots in a district gives a Crown.
- **Checkpoint "spray cans"** to respawn at.

Target length: 25–40 min for a first run, 10 min for a speedrun of the main path.

## 5. Combat: a third-person spray-paint shooter

- **Weapon**: the *Spray Can Blaster*, a Tripo-modelled chunky spray-can gun in WAI's hand.
  - LMB: rapid paint shots (spread grows with sustained fire); hold for a short **paint stream**.
  - **Right Mouse = aim → first person**: holding aim smoothly flies the camera (≈0.25 s, eased) from the
    third-person follow position past the shoulder **into WAI's own giant eye**, giving a first-person view
    with the spray gun in the lower right of the screen (a viewmodel, like an FPS). Releasing flies back out.
    WAI's body fades as the camera enters it, so it never clips. Mouse turns freely in both modes. In first
    person the FOV narrows slightly and sensitivity drops for precise shots. The same view is True Sight
    when the eye is worn (the screen edge gets a painted iris vignette).
  - **Monster presence (feeling the threat up close)**: first person puts you at WAI's height (≈0.9 m), so a
    3 m mutant towers over the screen. On top of that: a low camera in third person too, footsteps that thud
    and shake the camera with distance falloff, a big shadow that reaches you before the monster does,
    a roar/telegraph that briefly pulls the camera toward the monster, screen-edge ink creeping in when a
    big enemy is close, music that drops to low drums when one sees you, and the monster leaning down into
    the camera on its attacks.
  - Paint colour cycles per magazine. Hits leave splats on the world (already done) and **on the enemy**:
    enemies get visibly painted over until they're "corrected back" (purified).
  - Weak points: glowing corrupted organs take 3× damage, with a hit marker plus a distinct sound.
- **Feel**: hit-stop (40–80 ms) on heavy hits, camera kick, crosshair hit marker, enemy flinch and squash,
  rising-pitch combo sounds, a short slow-motion on the stun.
- **Dodge roll** (Ctrl / double-tap) with brief invulnerability, needed for the bigger attacks.

Enemies (Level 1):

| Enemy | Size | Behaviour | Drops |
|---|---|---|---|
| **Eraser Grub** (fodder) | 0.8 m | Rubs out paint and erases a half heart on contact; comes in groups of 3–5; one-shot by mouth-spit | paint drops |
| **Crooked-Leg Mutant** (rebuilt) | **3 m** | Telegraphed **stomp shockwave** (jump over the ring), **double kick**, **charge** that crashes into walls (it gets stunned if it hits one); weak point = glowing knee joints | LEG |
| **Peeping Lamp** (mini-boss) | 5 m | Lamp-post with a huge corrupted eye; **sweeping ink beam** (hide behind cover), summons grubs; paint the pupil to make it blink-stun | EYE |
| **Chomper Bin** | 1.6 m | Lunging bite, swallows thrown paint shots and spits them back; hit it from behind or while it's chewing | MOUTH |

## 6. Title → game transition (what you asked for)

1. Title = your Blind Plaza art, slowly drifting (parallax), with **real** DOM HUD pieces (logo, hearts,
   level tag, Q/R sticker cards, "DEMO START") placed exactly over a *clean plate* version of the art
   (UI painted out; made with Codex image generation from your image).
2. Click Start: the HUD pieces **burst apart** like peeled stickers (spin, fly off-screen, paint flecks),
   then the art **pushes in** toward WAI.
3. Match cut: the 3D plaza is laid out to the same composition (statue left, sleepy wall right, arch centre),
   and the 3D camera starts at the art's framing, so the painting dissolves into the 3D scene.
4. The camera keeps pushing in to the gameplay shoulder position, the real HUD pieces fly back *in*, and
   control starts. Loading runs underneath the push-in (it already takes about 1 s), so there's no hard cut.

## 7. Art & assets pipeline

- **Codex image generation** → orthographic **front / side / back** sheets for WAI, the Crooked-Leg Mutant,
  the Peeping Lamp, the Chomper Bin, the Eraser Grub and the spray-can gun, all in the reference style.
- **Tripo** multiview → 3D (GLB), then **auto-rig + animation clips** for the creatures
  (idle/walk/run/attack/hit). Played with `AnimationMixer`; colliders and sockets stay in code (already set up).
- Buildings stay procedural (they read well), with more depth: balconies, pipes, awnings, window frames,
  and the canal.
- Rough credit budget: about 6 models × (multiview model + texture + rig + 3–5 anims), roughly 400–600 of the
  1,095 credits available. I'll check `tripo` cost estimates before each run.

## 8. Audio (fully original, no downloads)

- **SFX**: synthesised with WebAudio (paint shots, splats, squelchy organ peel/stick, bite, footsteps per
  surface, jump/land, hurt, stun sting, purify choir-chime, box footsteps, crown fanfare, UI clicks).
  Every sound gets random pitch/volume variation so repeats don't sound identical.
- **Music**: generated in-engine. A quirky looping groove (marimba + bass + brushed drums) with layers that
  switch by state: explore → combat (drums + distorted bass) → awakened district (adds melody).
  Ducks under stingers.
- Settings: master/music/SFX volume and mouse sensitivity in the pause menu.

## 9. Build order (each step playable, tested in the browser before moving on)

1. **Feel pass**: the shooter camera and aim, spray gun, hit-stop and hit markers, dodge, the audio engine and SFX.
2. **Organ system v2**: worn vs lent, Q/R/F keys, abilities (True Sight, Long Legs, Chomp), recall.
3. **Level geometry v2**: hub + east alley/rooftops + west canal + statue; invisible "undrawn" geometry.
4. **Enemies**: big Crooked-Leg Mutant, Eraser Grubs, Peeping Lamp, Chomper Bin.
5. **Progression**: Wake 0/3, crowns, paint drops, checkpoints, map/objective HUD, completion screen.
6. **Assets**: Codex 3-view sheets → Tripo models + animations → swap in via the manifest.
7. **Title transition** + music layers + polish + a full playthrough test + a performance pass.
