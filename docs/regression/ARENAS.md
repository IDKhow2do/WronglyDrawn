# Arenas and "not yet" answers (playtest round 4) — working notes

Ports: Vite 5301 (docs/regression/arenas/vite.mjs, no HMR), Vite 5302 for the HEAD c96b2df baseline (a git worktree in
/tmp/wd-arena/before), Chrome CDP 9401 (docs/regression/arenas/chrome.sh, own profile, English, muted). Scripts in
docs/regression/arenas/; logs and screenshots in /tmp/wd-arena/.

## Bug 1 — level 1: knocked out through the Gate Tower door mid-fight

The author: the Eraser knocked WAI "outside, through the door you finish the level by", and he could not get back.

### Cause (reproduced)

- The Gate Tower door (BlindPlaza) stands at z −49.8, 6.65 m north of the summit centre (0, −43). The summit's hold
  rule (GameSession, round 2) only slid WAI back inside radius 8.5. The 2 m doorway pocket between the sealed door and
  the rim barrier behind it (z −49.95 … −51.9) lies inside that circle: once there, nothing moved him, and the door
  (and the rim) kept him from walking back. The fight went on without him.
- How he got there: **the Eraser's charge (RUB)**. Its kinematic capsule (r 1.1) stops at walls, but its box collider
  (4.1 × 5.5 m) reaches 2.75 m ahead of it, so the block's front slid ~1.6 m through the door. GameSession then pushes
  WAI out of the block with `pushOut()` + `nudgeTo()`: a plain move, not a sweep, along the shallowest side — for a WAI
  pinned in front of the block that is "forward", i.e. through the door into the pocket.
- A second way in: the slot between the door's top (y +5.6) and the tower's lintel box (y +8). A WAI wearing the Leg
  Sticker who jumps off the Eraser's head toward the door (2.9 m jump) clears the door and drops into the pocket.
- Knock-backs themselves never tunnel: `takeHit` only sets a velocity, and the KCC sweeps it (16 m/s and the Pen's
  26 m/s ruler both stop at walls in every trial). The "SHOO!" buck-off (vy 7) never cleared a wall either.

### Fix

1. `src/enemy/EraserBoss.ts` — the RUB stops when the block's front meets a wall (`blockFrontRoom()`: three rays at
   knee height, centre and both front corners), so the block no longer slides through the door or the rim.
   `pushOut()` tries the four exits shallowest first and returns the first with no wall on the way (a ray from WAI
   to the exit); a WAI pinned against the door goes out sideways. Walled in on all four sides: no push (never seen).
2. `src/level/BlindPlaza.ts` — the sealed door's collider reaches up to the lintel (y +8); the visible door is unchanged.
3. `src/core/PhysicsWorld.ts` — `isWall()` / `wallAhead()`: the one "is this a wall" test (static, gate, barrier, undrawn).
4. **Safety net, one mechanism**: `src/level/ArenaGuard.ts`, used by GameSession (Eraser), HarborSession (Hush) and
   SoulsFight (Red Pen). While the fight is on: past the rim → slid back inside at once (the old hold rule, kept for
   the summit and the headland); below the floor → put back at once; **walled off** (every probe ray from inside the
   arena — centre and four points at half the radius, waist height, walls only — meets a wall before reaching him)
   or past the rim for 1.5 s → put back at the arena's entry spot (the same spot the session's in-arena respawn uses:
   SUMMIT_ENTRY, ARENA_ENTRY, 3.8 m inside the ink gate). No heart, no boss change (FightReset refills a boss only on
   a real smudge), a teal "BACK IN THE FIGHT!" puff.
   The mid-boss squares (Inkwell, Gramophone) are not locked: WAI may walk out and back, so they get no guard.

### Knock tests (knock.mjs; Normal; before = HEAD c96b2df on :5302, after = this change on :5301)

Per trial WAI stands 0.1 m or 1.0 m in front of a wall found by a ray from the centre (door, rim, tower front, crumb
heap), the boss 4 m further in. Eraser: 28 angles (24 round + 4 more round the door) × 2 gaps = 56 (full run) or
16 × 2 = 32 (QUICK). Hush / Pen: 12 angles × 2 gaps = 24 (QUICK). Out = past the rim, below the floor, or walled off.

| arena | attack | trials | out before | stuck out ≥ 4 s before | out after |
|---|---|---|---|---|---|
| Eraser summit | charge (real RUB) | 56 | 17 | 15 | 0 |
| Eraser summit | knock 16 | 56 | 0 | 0 | 0 |
| Eraser summit | buck-off leap (vy 7) | 56 | 0 | 0 | 0 |
| Eraser summit | Leg-Sticker jump off its head (QUICK) | 32 | 1 (over the door) | 1 | 0 |
| Hush headland | knock 12 / buck / hop (QUICK) | 24 each | 0 | 0 | 0 |
| Red Pen roof | knock 26 (the ruler's) (QUICK) | 24 | 0 | 0 | 0 |

Safety net alone (`net`: WAI put 1.2 m behind the wall at that angle, or 3 m under the floor):

| arena | trials | back inside, before | back inside, after | hearts kept (after) | boss paint unchanged (after) | slowest return (after) |
|---|---|---|---|---|---|---|
| Eraser | 32 | 25 (7 stuck: the door pocket and the tower front) | 32 | 32 | 32 | ≤ 0.1 s (hold / fall rules) to 1.5 s |
| Hush | 24 | 24, but 12 cost a heart (the canvas-edge fall respawn) | 24 | 24 | 24 | at once |
| Red Pen | 24 | 0 (24 stuck outside the ring) | 24 | 24 | 24 | 1.4 s (walled off: GRACE 1.5 s) |

Logs: /tmp/wd-arena/knock-{before,after}-{eraser,eraser2,hush,pen}.log.

### Mid-boss squares (midboss.mjs)

Not locked arenas: leaving is allowed, the fight pauses and resumes when WAI walks back in (round 3). Checked only
that a knock does not strand him. 24 standing spots on each fight floor, knocked away from the boss with its own knock
and with the game's strongest (16, the Eraser's charge; nothing in these squares deals it). State after 2.5 s:

| square | knock | inside | walked-out height (walks back) | fell lower | respawned |
|---|---|---|---|---|---|
| Inkwell Square | 6 (its own) | 24 | 0 | 0 | 0 |
| Inkwell Square | 16 | 21 | 1 | 2 (north edge, to y 9–10 from 13) | 0 |
| Bandstand | 7 (its own) | 24 | 0 | 0 | 0 |
| Bandstand | 16 | 21 | 3 | 0 | 0 |

No guard added there: the fight pauses outside the square, and the two "fell" cases are 3–4 m below the north edge
with the quarter's way back up (not walked by the script: unverified). Log /tmp/wd-arena/midboss.log.

## Bug 2 — level 2: the Hush ignores paint and shouts before its fight, silently

### What the author did (reproduced: hush_early.mjs)

The Hush wakes only when `woken.size === 3 && hushRisen` and WAI walks **inside 7.3 m** of the plaza centre (the
start circle is 2.2 m inside the 9.5 m plaza so the rim lock never traps him outside). Before that, `preDamage`
swallowed paint (a "SHHH…" on 4 % of hits) and `onShout` returned without a sound. Ways to get at it early:

| case | where WAI is | can he reach it? | before | after |
|---|---|---|---|---|
| A at sea (2/3, lighthouse not sung) | lighthouse gallery, 33 m away | no (spray ≈ 8–10 m, BIG SHOUT 15 m) | — | — |
| B lighthouse just sang, the Hush over the headland | lighthouse gallery, 11–13 m | BIG SHOUT yes, spray no | nothing | SHHH… on the Hush + "The Hush only fights on the headland plaza. Step onto it to face THE HUSH." |
| C same | on the plaza's north edge, 8.4 m from the centre, the Hush 5 m away | spray and shout | **nothing** (the author's case: "only the boss next to me") | the hit itself starts the fight (WAI pulled a step in, rim locks, intro) |
| D forced 2/3 (not reachable in play) | plaza edge | yes | nothing | SHHH… + "The Hush is not listening yet. Wake the three sound Guardians first (2/3)." |

The line never repeated within 20 s in any run (`againToasts` empty).

### Fix

- `src/level/NotYet.ts` — the one rule "a boss that is not fighting yet answers a hit". The boss calls its
  `onIgnored` hook (new on `EnemyBase`, with `shudder()`) instead of swallowing the hit. NotYet answers at once on the
  boss (paint drips off, it shrugs, its word, a "denied" sound; at most every 0.8 s) and toasts one line naming what
  is missing (the same line at most every 20 s). Not routed through the 25 s stuck rule (src/ui/Guide.ts): it is
  feedback to the player's own action. Session play time is its clock.
- Hit from the arena's edge with everything ready (Hush: 3/3 and risen; Eraser: 3/3 on the summit floor) = a
  challenge: the fight starts at once (`hushPoked` / `eraserPoked`), WAI pulled a step inside the rim first.
- English in code, Chinese in `src/i18n/zhArenas.ts` (spread into ZH).

### The other gated bosses (early.mjs)

| boss | gate | reachable early? | before | after (word on the boss + line) |
|---|---|---|---|---|
| Eraser | not awake (Guardians < 3, or WAI not on the summit) | 0/3 warp onto the summit: spray reaches | NOT YET! on 5 % of hits, no line | NOT YET! + "The Eraser is not fighting yet. Wake the three Guardians first ({n}/3)." / from the summit edge at 3/3: the fight starts / below the summit at 3/3: "Step onto the summit to face the Eraser." |
| Red Inkwell | WAI not in Inkwell Square (`reachable`) | the spray arc stops ~10 m, the barricades catch it; a long throw lands | two white specks, no word, no line | RUNS OFF! + "Your paint runs off its glass from out here. Get past the red barricades into Inkwell Square first." |
| Red Pen | not awake (before the ink gate) | no by spray (24 m from the gate); a direct hit was simulated | nothing | NOT YET. + "The Red Pen is not fighting yet. Wake the three Guardian machines first ({n}/3)." / at 3/3: "The Red Pen waits behind its wet ink. Push through the ink gate to face it." |
| Hush | not awake | see above | nothing / SHHH… on 4 % | see above |

Checked and left alone (they already answer): Hush Moth veil (SOAKED UP — SHOUT FIRST!), Fog Jelly (LOST IN THE FOG!),
Whiteout Bottle / Chomper Bin (comic + toast), the Archivist's horn before the Eye (onQuiet toast), the Red Pen's
FINAL / sketch states (tips), the Hush and Eraser phase roars (armour 1.6 s with a roar and the fight's hint).
The Red Gramophone ignores shouts from the deck below its bandstand on purpose (a shout at a crab must not wake it);
not gated by Guardians.

## Bots (Gentle, stage runs only, after the change)

- Level 1: docs/difficulty/bot/l1/botprep.mjs + boss.mjs (warp to the summit): Eraser repainted in 215 s (all its
  states seen: RUB, DAZED, SPIN, DIZZY, SHOWER, BOUNCE, STUCK, SLAM), LEVEL COMPLETE through the door. 5 smudges,
  ArenaGuard returns 0. Log /tmp/wd-arena/bot-l1-boss.log.
- Level 2: docs/level2-expansion/bot/prep.mjs + h2bot.mjs boss (warp to the lighthouse, walk to the plaza): the Hush
  repainted in 263 s (all its states seen), the paper boat boarded, COMPLETE. 7 smudges, ArenaGuard returns 0.
  Log /tmp/wd-arena/bot-l2-boss.log. (The Chrome profile was on Chinese for this run.)
- `npx tsc --noEmit -p .`: clean.
