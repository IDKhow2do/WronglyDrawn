# Fat Fish round 4 — progress log (for resuming after interruptions)

Test infra (all in /tmp/whale-t): `chrome.sh <url>` (headless, muted, CDP 9344, own profile), mock
`node docs/whale/test/mock-deepseek.mjs` (9345), private Vite with the proxy aimed at the mock:
`COOP_BASE_URL=http://127.0.0.1:9345 COOP_API_KEY=sk-MOCK-not-a-real-key WD_PORT=5193 npx vite --config docs/whale/test/vite.nohmr.mjs`.
Scripts: `reload.mjs [url]` (boot + coop on, rules brain), `runnav.mjs <routes.json>` (+ `navtest.js`), `l1run.sh`, `l2run.sh`.

NOTE: early in this round the test tab sat with brain=Auto against the REAL proxy and made ~32 real planning calls
(~93k prompt tokens, 80% cache). Since then the private Vite always points at the mock.

## 1. Navigation — DONE, verified
- `src/coop/NavGrid.ts`: lazily baked multi-layer 0.5 m nav grid from the level colliders (down rays, solid=false, head-room
  check with an up ray), edges walk / jump-up ≤1.25 m / drop ≤3.2 m onto wide ground / running gap jump ≤3 m (seams = walk),
  clearance cost (walls + ledges), 14 s TTL + invalidate on stuck, time-sliced A* generator (2 ms per step).
- `Companion.ts`: route following (sync to nearest point, lookahead with clearPath every 0.6 m incl. water), jump/gap/drop
  execution, JET HOVER on gap jumps, catch-up sprint 8.8 m/s when > 11 m behind, progress watchdog on remaining path length,
  stuck → hop → invalidate + replan, trail fallback (stands still instead of walking blind when no route), teleport only when
  `navStuck()` (no route / no progress) or > 95 m; teleports are drawn in by the pencil (`Coop.redraw`).
- Verified (rules brain, WAI warped straight to the destination, she walks the whole way):
  L1 11 routes (hub↔terrace/mutant yard, hub↔west bank over the bridge, hub↔towpath, hub→bastion, terrace→rooftop via ramp,
  rooftop→hub, switchback hops, hub→plateau below summit): 0 teleports, final distance 2.0–3.0 m.
  L2 (stage clock + cocoon burst) landing→market, market→old quay (pontoon), old quay→Clock Square (grand stair),
  Clock Square→headland (Bell Bridge), headland→lighthouse gallery (spiral) and back, boardwalk→Clock Square,
  Clock Square→landing: 0 teleports, 1.8–2.9 m.
  Unreachable targets (headland→market; the bridge's east end is a 1.5 m ledge WAI cannot climb either; sky stairs before
  they are revealed): she waits / pencil redraw — expected.
- Level issue for the lead: Bell Bridge east end at z≈-30 is a 1.5 m ledge above the headland bank (WAI cannot get back on).

## 2. Player parity — DONE, verified
- `src/coop/Moves.ts` (+ `Companion.requestSlam/requestHover`): slam (pounce + dive, stomp hit r 2.2), rice-ball throw (crash,
  bends toward the target), rice-bomb gadget (r 2.6, 14 s), hover, whistle (veiled moths only); fetch_paint / point_crown in
  `Coop.trick`. Never finishes a creature: `CoopMoves.cap` keeps it ≤ 90 % repainted (spray too).
- One compact LLM tool `trick {move, target?}`; `WD_COOP.act({type:'trick', move, target})`; rule brain uses slam/throw/bomb in fights.
- Verified on grub-0 (maxHp 16): slam hit 16→8.8, throws hit (3/3), bomb hit; 40 s of her attacking alone → max repaint 0.902,
  not harmless. Hover airtime 1.6–2.1 s. Shot: `parity-slam-throw-bomb.jpg` (weak framing).
- Not done (WAI-only by design / single instance): lend / recall / purify stickers, TAG + ENCORE finishers, lifting props,
  chomp, WAI's gadget loadout, SHOUT at bells (puzzle).

## 3. Goofs — DONE, verified
- `src/coop/Goofs.ts`: 9 goofs, weights in GOOF_WEIGHTS, gap 38–75 s, no back-to-back repeats, aborts on danger.
- sprayCam → blue blots via UI.inkHit (hook `CoopApp.frame` from the `// PIP-HOOK` line in main.ts) + `.coop-blot` CSS.
- Verified: each forced goof plays (wrongWall/lampPost need a wall nearby); 12 simulated minutes: 12 goofs, 0 back-to-back,
  WAI hp never lowered, 0 errors. Shot: `goof-spray-camera.jpg`.
## 4. Live roasts — DONE, verified
- `src/coop/Roast.ts`: moments missed (3 s spraying near a creature, no hit:marker) / fell (player:smudged) / hit /
  encoreSlip (combat.view.result 'slip') / idle (28 s) / perfect (player:perfect) / wrongDoor (E on a disabled prompt);
  chance 0.45, gap 55 s, never in cine / telegraph / chat / goof; wakes her if dozing. Model: REMARK with
  `about WAI: … Director's note: …` in the volatile tail (18 notes, never one of the last four); static prompt got one line.
  No model: canned zh/en pools + tag lines, never the same line twice in a row.
- Verified offline: all 7 forced kinds deliver; natural hit / idle / missed counters fire (missed blocked while the lamp is
  in AIM — by design). REAL API (5194, planning disabled): 30 roasts, 30 calls, 65k prompt / 547 completion tokens,
  cache 74 %; 29/30 distinct, mean bigram Jaccard 0.011, 1 repeated catchphrase → tail now asks for a fresh line
  (not re-measured). `roasts-real-zh.json`, shot `roast-canned-zh.jpg`.
- Real calls this round: ~32 accidental planning calls (early) + 30 roasts = ~62.
## 5. Corner view — DONE, verified
- `PipView.ts`; visible when far/offscreen/hidden, fades back, low tier skip, pause/cutscene skip; ~1–1.6 ms/picture; toggle.
## 6. Movement polish — DONE (visual check on snapshots), see README round 4
- Flank lap-running bug fixed (Coop.pickStand side). Fidgets verified firing (look 5, wiggle 1, bowl 1 in 60 s).
- Nav regression after all items: L1 11/11 and L2 reachable routes, 0 teleports (one L1 run of the road hops took 35 s
  with 4 re-plans after earlier routes; alone 21 s).
