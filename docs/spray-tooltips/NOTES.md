# Spray look + sticker tooltips (work notes)

Harness: /tmp/wdspray (copy of docs/level2-expansion/bot/lib.mjs on Chrome :9359 / Vite :5196, no HMR).
Before-build = pristine copy of src/ at /tmp/wd-before (served on the same port, one at a time).
Machine is shared with other agents: frame times move ±20 % between runs.

## Spray (done, tuning by screenshot)
- src/render/SprayFx.ts (new): one instanced quad batch per spray, interleaved buffer, update range = live
  instances only. Shapes: streak (comet capsule built in the view plane, ink rim, 2 px width floor),
  mist (soft, stretched along motion), splat (ragged star burst where a droplet lands).
- WeaponSystem: drops/puffs pooled (320 / 120, as before), swap-remove, scratch vectors, shade table per
  colour (8 jittered shades: same paint-colour logic, no per-drop Color/string). Aim + muzzle resolved once
  per step (was one raycast per droplet + per puff). Streaks + puffs were 2 draw calls, now 1.
- CoopSpray (Pip): Points dots → SprayFx streaks + mist + bursts. 64 drops + 32 puffs = 96 instances (was 96 points).
- Tried: uniform-width capsules → read as balloon tubes; 3D-extended quads → hard squares when a droplet
  flies away from the camera. Kept: view-plane capsule with comet taper (head full width, tail 0.3).

## Baseline (before build, plaza Medium, coop on, Pip forced to spray, 10 s, ms)
no spray p50 15.4/15.3 p95 18.2/20.0 · TP spray p50 16.1/15.9 p95 32.8/31.1 · aim spray p50 14.9/14.9 p95 31.5/34.9

## Sticker tooltips (done)
- src/ui/StickerTips.ts (new): pure text builder, one function per slot state; UI.ts owns DOM / events.
- UI.ts: `.sticker-tip` in #ui-root (z 17). Mouse hover on a card (works wherever the cursor is free:
  pause / Tab sticker book, Alt free cursor, no pointer lock); touch: tap a card toggles it for 4.5 s;
  state change pops it for 4.5 s on lend, recall and crossed-out (pickup and purify already toast).
  setCards(inv, hostName, hostOf?) — main.ts passes hostOf so the tip can say what the host does.
- style.css: cards take pointer events; in pause the tray stays visible above the overlay (z 16, scale .8
  so it clears the TITLE SCREEN button at 1600×813). `scale`, not `transform`: the HUD arrive animation
  (fill-mode both) owns `transform` — the same reason the touch-mode `.cards { transform: scale(.62) }`
  rule has no effect today (pre-existing, not changed here).
- Shout line on the Mouth tip follows the `.help .lv-shout` CSS gate (harbor, works).
- Level 3's "crossed" card state is covered; its 'crossed out!' zh string belongs to the level-3 agent.

## Frame time, interleaved A/B (plaza Medium, 1600×900 @2x uncapped, coop on + Pip forced to spray, 10 s each, ms p50 / p95)
| scenario | before run1 · run2 | after run1 · run2 |
|---|---|---|
| no spray | 12.5/14.6 · 12.3/14.0 | 13.3/14.9 · 12.8/14.7 |
| third-person spray | 14.7/17.9 · 12.8/14.5 | 13.7/15.9 · 13.1/15.2 |
| aiming spray | 12.5/16.3 · 12.1/14.9 | 12.1/25.7 · 11.7/14.3 |
Spray cost (spray − no spray, p50): before +0.5…2.2, after +0.3…0.4; aiming within noise. Draw calls equal (±3 of ~1980).
The 25.7 p95 is one run with a burst of long frames (other agents share the GPU); run 2 is 14.3.

## Screenshots here
spray_before/after_thirdperson, spray_before/after_aim_sky, spray_after_pip, tooltip_* (pause hover en / zh, lend pop-up).
