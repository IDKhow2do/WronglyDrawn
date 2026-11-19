# Level 1 expansion: progress log

Goal: grow Blind Plaza from about 12 to about 20 minutes for a first-time player.
Order: two creatures → the second district → the mid-boss. Each step is verified before the next.

## Design (decided 2026-11-12)

### Main path after the expansion
1. Starter lamp → Eye → Sleepy Cliff (road gap 0 redrawn, canal bridge).
2. Chomper Bin → Mouth → Gatehouse (road gap 1 redrawn, drawbridge).
3. **NEW:** the redrawn road reaches its second hairpin. A sunken lane runs east from there into
   **the Crossed-Out Quarter** (the east high ground, y 13). The Red Pen crossed this quarter out.
4. **NEW:** in Inkwell Square, the mid-boss **the Red Inkwell** holds the Red Pen's ink.
   Repaint it: every red mark in the quarter washes off, and so does the red cross over the
   Blind Statue's eye.
5. The Blind Statue refuses the Eye while the red cross is on it. After step 4 it accepts → road gap 2.
6. The summit and the Eraser, as before.

### The Crossed-Out Quarter (east high ground, x 27.5..56, z -48..-10)
- Fiction: the Red Pen is never seen in level 1. Only its marks: red crosses on walls and rocks,
  and a red line struck through a street. Where the line cut the street, the street came apart.
- The quarter is a ring of streets around a central ink-blot rock (the "Blot", a Landscape mesa).
  The other Landscape mesas become rock pillars between the streets (each gets a collider).
- Route: hairpin 2 (24, 8.5, -19.5) → sunken lane (x 27.6..31, z -21 → -29, y 8.5 → 13)
  → Gate Yard (encounter 1) → the Struck Street with the chasm (True-Sight planks or jet hover;
  encounter 2) → the East Walk (encounter 3, a painted spring over a red barricade)
  → Inkwell Square (mid-boss).
- Shortcuts back: the red barricade between Inkwell Square and Gate Yard dissolves with the marks;
  the square's south edge drops onto the workyard rooftop (y 9) → terrace → hub.
- One checkpoint (cp-quarter, Gate Yard). Three crowns. Paint-drop lines on every leg.

### New creatures
| Creature | Player action it teaches | Telegraph | Damage | Counter | Repainted |
|---|---|---|---|---|---|
| White-out Bottle (`whiteout`) | flank and spray from behind | shakes + cap pops (squirt); tips over and spins (roll) | blob ½ heart; roll ½ heart | front cap blanks paint; back panel ×2.5; dizzy after a roll (all weak) | friendly bottle that refills the can |
| Stapler (`stapler`) | dodge the leap, then TAG | crouches, jaw cocks open, red ring under you (1.0 s) | pin ½ heart, clamp ½ heart if you do not mash free | dodge (C) or step out of the ring: it sticks in the ground → TAG IT | hops away happily |

### Mid-boss: the Red Inkwell (`inkwell`)
- New mechanic it teaches: **PAINT SLAM** (jump, then C in mid-air). The Eraser fight needs it for
  its DIZZY/STUCK openings, and nothing before taught it on purpose.
- It corks itself: while corked, all spray slides off. A PAINT SLAM (or a stomp) next to it pops
  the cork → DAZED (TAG-able, ×2.5).
- Phase 1: ink flicks (red landing rings), a red line across the floor (jump it), cork every 12 s.
- Phase 2 (at 50 %): a red CROSS (two lines), faster flicks, it calls a White-out Bottle, cork every 8 s.
- It fights only WAI inside Inkwell Square on its side of the red barricades (`BuiltQuarter.inSquare`):
  behind a barricade it stays asleep, paint runs off it, no attacks. It wakes once; the cut-in never replays.
- Won: its White-out Bottle is repainted with it (as are the Eraser's and the rooftop lamp's grubs, in GameSession).

## Log
- 2026-11-12: studied GameSession, BlindPlaza, Terrain, enemies, Ambient, Guide, AgentBridge, bots.
  Design above. Landscape.ts (not mine) puts mesas on the east high ground: they stay, as
  pillars, with colliders from the quarter code.
- Creatures built and checked in the running game (no-HMR Vite :5198, headless Chrome :9352):
  - `src/enemy/WhiteoutBottle.ts`: 6 sprays from the front → 0 damage (BLANKED!, tip toast after 20);
    from behind → 20 damage. Squirts (3 white blobs, erase paint where they land), roll + lane, dizzy.
  - `src/enemy/Stapler.ts`: crouch ring → leap → PIN (1 + clamp 1 if not freed). Mashing 6 presses frees
    WAI and leaves it STUCK (TAG). Dodging the leap → STUCK → TAG (220 → 72 hp). Shared blob helper `src/enemy/Lobbed.ts`.
- District built: `src/level/plaza/CrossedQuarter.ts` (geometry, props, marks, barricades, tear, planks,
  spring, crowns ×3, drops ×18, checkpoint), `src/level/plaza/QuarterDirector.ts` (encounters, tips, statue
  gate, tear fall, hints, guide goal). Terrain: `QUARTER`, `laneAt`, `inTear` in Terrain.ts.
  - True-Sight needs AIM (right-click / Z) like everywhere else: checked, WAI crosses the tear while aiming.
  - A street-lamp host on the west bank takes the Eye and keeps the planks visible.
  - The Eraser no longer lobs crumbs at WAI inside the quarter (x > 27.5).
- Mid-boss `src/enemy/RedInkwell.ts`: 1400 hp (≥ 1000 → boss-sized TAG). Bot fight: 76 s, all states seen
  (FLICK, LINE, ROAR, CROSS, cork pops by PAINT SLAM, TAGs). Wash cutscene + statue cross lift work.
- Full-route bot (`/tmp/wd-l1x/quarter.mjs`, from the Gatehouse's wake, walking by the guide arrow) found:
  - Stapler + kiosk standoff (it stood still behind cover) → it now walks round when it can't see WAI.
  - Staplers leapt into the tear → they never leap at a spot without real ground (planks don't count).
  - Fights next to the tear pushed WAI in → knee-high kerbs along both torn edges, open at the planks;
    planks 3 m wide; the tear stapler waits further east (49, -34).
  - The spring's arc hit the 4.4 m barricade collider → barricade colliders are board height + 0.4 m,
    the spring target sits 2.5 m up (arc peaks ≈ 18 m, lands in the square). Checked: lands at (51.6, 13, -20).
  - Falling through the tear and drifting under its lip is caught too (3 m margin).
- Quarter bot (run 7, from the Gatehouse's wake, all walking): entered the quarter at 19 s, Inkwell engaged
  at 153 s, quarter washed at 209 s, Blind Statue awake at 237 s. No console errors.
  The bot found the White-out Bottle the hardest creature (it is bad at flanking): 124 decision ticks.
- Statue's red cross checked on screen; Red Inkwell resets UNcorked when WAI leaves and comes back.

## Files (all new code is in files this task owns)
| File | What |
|---|---|
| `src/enemy/Lobbed.ts` | arcing blobs with landing rings (bottle squirts, Inkwell flicks) |
| `src/enemy/WhiteoutBottle.ts` | creature 1 |
| `src/enemy/Stapler.ts` | creature 2 |
| `src/enemy/RedInkwell.ts` | the mid-boss |
| `src/level/plaza/CrossedQuarter.ts` | the district's geometry, props, marks, collectibles |
| `src/level/plaza/QuarterDirector.ts` | the district's gameplay |
| `src/level/Terrain.ts` | `QUARTER`, the sunken lane in `heightAt`, the tear hole |
| `src/level/Dressing.ts` | the east high ground's crags removed (streets), keep-out zones |
| `src/level/BlindPlaza.ts` | 4 targeted edits: import, `quarter` in BuiltLevel, build call before the ink merge, spring list + update |
| `src/level/GameSession.ts` | the director, hint, guide hook, dev stages `quarter` / `inkwell`, no Eraser crumbs in the quarter |
| `src/level/Ambient.ts` | `springDone(pos)` |
| `src/ui/Guide.ts` | quarter route + exit route, statue goal waits for the quarter |
| `src/story/StoryDirector.ts` | `midBossIntro`, `inkWashed` |
| `src/agent/AgentBridge.ts` | `player.pinned`, `midBoss` in observe() |
| `src/i18n/zh.ts` | 44 strings appended |

## Hooks wanted in files this task may not edit
- `src/debug/DevMenu.ts` STAGES (line 39): add after `gate`:
  `{ id: 'quarter', label: '3½ 打叉街区', note: '门楼醒了 · 站在街区入口' },`
  `{ id: 'inkwell', label: '3¾ 红墨水瓶', note: '在墨水瓶广场 · 中Boss前' },`
  (the session already accepts both ids in `debugWarp`).
- `src/coop/Companion.ts` ATTACK_STATES (line 38): add `'CROUCH', 'LEAP', 'PIN', 'ROLL_TELL', 'ROLL', 'SQUIRT_TELL', 'FLICK_TELL', 'LINE_TELL', 'CROSS_TELL', 'LINE', 'CROSS'`
  so Pip never swaps aggro mid-telegraph on the new creatures. Optional callouts in `src/coop/RuleBrain.ts`
  (e.g. `'stapler:CROUCH': 'It's crouching — roll out of the red ring!'`).
- `src/level/Landscape.ts` OUT list: nothing required (the mesas became the quarter's pillars, with colliders).

## Resumed after the usage-limit stop (same day)
- Guide fixes found by the walking bot: the way to the quarter now keeps the canal-bridge / terrace
  rules (it pointed straight across the canal from the west bank); "in Inkwell Square" respects the
  Gate Yard barricade's line (it pointed through the barricade from the yard side).
- North gorge stairs (`towStairs(-14.5, …)` in BlindPlaza.ts): the steps now run to the wall — there was a
  0.9 m slot behind them where WAI (and the bot) got wedged (pre-existing).
- Roof drop checked: walking off Inkwell Square's south edge lands on the workyard rooftop (y 9).
- Pip's nav grid (src/coop/NavGrid.ts) reads real colliders: the quarter's ground is the terrain trimesh,
  pillars / fences / barricades / kerbs are static boxes or cylinders, barricades are removed when washed.
  The planks are `undrawn` (in her SOLID set). The spring is the only way over the NE barricade for her
  (she pops to WAI when stuck). No GLB props were added (nothing for SceneOptimizer.cullModels to miss).

## Full level bot run (all walking, no warps) — PASS
`docs/level1-expansion/bot/full.sh` (copies of /tmp/wd-l1x scripts; no-HMR Vite :5198, Chrome :9352):
eye stage → mouth stage (WALK=1) → `quarter.mjs none` → `boss.mjs walk` (climbs by the guide) → door.
| Leg | Wall clock |
|---|---|
| Eye + Sleepy Cliff, Chomper + Gatehouse | 57 s |
| Gatehouse → quarter entered | 58 s |
| Quarter (3 encounters, tear, spring) → Inkwell engaged | 160 s |
| Red Inkwell fight | 73 s |
| Washed → Blind Statue awake (roof drop + walk) | 34 s |
| Climb + Eraser (144 s fight) + tower door | 182 s |
| **Total** | **565 s wall, 472 s game time; LEVEL COMPLETE; no console errors** |
The quarter adds ≈ 5½ bot-minutes (the bot plays far faster than a first-time person on the old route:
57 s for the first two Guardians). Expect ≈ 8–10 extra minutes for a first-time player.

## Round 3 (2026-11-15): stairs, the no-Legs wall, guidance

- The kiosk steps and the sky stairs are now `jumpFlight` runs (src/level/JumpFlight.ts): one direction, nothing
  overhead, 0.8 m rises. So is the ladder tag's reward on the workyard rooftop — that was the "S-shaped" flight the
  author could not climb.
- The East Walk's crossed-out boards say one line in WAI's voice after he has tried and failed there.
- Every "where to go" hint and the guide arrow now wait for `Guide.stuck` (25 s without progress).
- Details, tables and proof: docs/regression/ROUND3_GUIDANCE.md.
