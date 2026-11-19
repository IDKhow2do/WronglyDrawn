# 蓝色大肥鱼 — the AI co-op partner (2026-11-10)

The partner formerly called Pip is now 蓝色大肥鱼 ("Big Blue Fat Fish"): a chibi blue-whale girl with a
stainless-steel rice bowl for a helmet. Code still says `pip` (and `observe()` keeps the `pip` key) so
harnesses using `window.WD_COOP` keep working. `docs/AI_AGENT.md` was not updated (outside this task's files).

## Art (Codex)
- `public/assets/whale/{portrait,idle,rice,caught,angry,hide}.webp` — 512², transparent, die-cut sticker style. Sheet: `whale-stickers-sheet.png`.
- Pipeline in `art/`: `common.txt` (style + character) + `p_<name>.txt` → `run.sh <name> <ref>` (`codex exec` image generation, refs: title painting,
  `reference/ref-1.webp`, and the character sheet for the portrait / our portrait for the five expressions) → `node art/key.mjs <name>…`
  (chroma-key, crop, shadow, webp). Raw PNGs were left in `/tmp/whale-art/work/` (not in the repo).

## In-game body — `src/coop/CompanionModel.ts`
Procedural (primitives + `toon()` + `addOutline`), 11,610 triangles including ink hulls. Steel bowl = lathe + a painted matcap.
Animation inputs (`PipAnim`): the old ones plus `excited` (tail wags faster, sparkle eyes), `sleepy` (sits, hugs her tail, nods),
`hide` (bowl pulled over her eyes). `model-turntable.jpg`: idle / rice / dozing / hiding / flinging paint (private camera, no post FX).

## Personality + rice — `src/coop/Mood.ts`, `RuleBrain.ts`, `prompt.ts`
- Every paint drop WAI picks up (`paint:collected`) is a grain of rice: tail winds up, she comments; every 10th she "eats"
  (dance + one of her own half-hearts back — nothing for WAI, no damage change). ~80 s without rice → she asks where it is.
- ~13 s of nothing → she dozes off; WAI moving / a fight / being sprayed → she jolts awake ("我刚才有在想……真的。").
- Hit, lost (teleport rescue) or flinging paint at nothing for 3 s → bowl over the eyes. WAI sprays her → puffed cheeks.
- Speech bubbles show the matching sticker. The LLM gets `rice` and `mood` in the observation and can pick a `face` in `say`.

## Bring your own DeepSeek key — `KeyStore.ts`, `LlmBrain.ts`, `CoopApp.ts`
Pause → AI Partner row → **Key**. Password field, Save / Clear, status line, storage note.
- With a key: the browser calls `https://api.deepseek.com/chat/completions` (default model `deepseek-flash`, editable in the key panel) directly; the key is checked with `GET /models`.
- Without one: the dev-server proxy `/api/coop` if it is configured, else the built-in rule brain.
- The key lives in `localStorage` (`wd.coop.deepseekKey`) and only ever travels in the `Authorization` header to api.deepseek.com.
  It is not logged, not in any URL, not in `WD_COOP.status()`, and the input is emptied as soon as Save is pressed.
- 401 / 402 / 403 → the key is not retried until it changes; other failures retry after 12 s. Rules carry on meanwhile.

## Screenshots (headless Chrome, 1600×900, zh)
`ingame-close-rice-zh.jpg`, `ingame-close-hide-zh.jpg`, `ingame-{hello,rice,hide,poked,doze,caught}-zh.jpg`,
`key-panel-nokey-zh.jpg`, `key-panel-fakekey-zh.jpg`, `key-panel-fakekey-en.jpg` (fake key → clean 401 error state).

---

# Chat, memory, prompt cache, latency (2026-11-11)

## Chat — `src/coop/Chat.ts`
- **Enter** during play opens a sticker bar at the bottom; **Enter** sends, **Esc** closes. Keys typed there stop at the input
  (the game listens on `window`), held keys are dropped (`InputManager.reset()`), and the cursor is freed the way Alt frees it
  (`cursorFree`), so the lost pointer lock does not pause the game; closing re-requests the lock.
- Her answer goes to the speech bubble with the matching sticker. With the player's key it is streamed (`stream: true`), after a
  "嗯……" thinking beat (`pip.mood.think` is set for the model to use). Without a key (or when the call fails / no first token in 8 s)
  she answers from a small canned set that still uses her memory (e.g. why WAI sprayed her); the bar says a key unlocks real chat.
- Length: `max_tokens` 90 for chat, 60 for remarks, plus `trimReply()` (2 sentences, ~40 Chinese characters / 20 words); a reply that
  runs long is cut and the stream aborted.
- Harness: `WD_COOP.chat(text)`, `WD_COOP.memory()`, `WD_COOP.resetMemory()`.

## Memory — `src/coop/Journal.ts`
- A journal of short timestamped first-person facts: level / objective changes, guardians, boss start / phase / end, WAI hit or smudged,
  crowns, rice, meals, boons (read off the "Boon: …" toast), what she decided / did, and what was done to her — spraying her is logged
  with the likeliest reason (`WAI sprayed me (3 s after: I missed …)`).
- Chat turns are kept too. The journal belongs to `CoopApp`, so it carries over when the next level starts and resets when the same
  level is built again (restart / new game).

## Prompt-cache layout — `src/coop/prompt.ts`
`[system: persona + rules — static per language] + [tools — identical on every call] + [journal + chat log, append-only] + [volatile tail: "[now] {state}" + DECIDE | CHAT | REMARK]`.
Planning, chat and remark calls share the same prefix. The log is only rewritten by compaction (every 40 events) and a language switch
changes the system prompt: one miss each. `usage.prompt_cache_hit_tokens / prompt_cache_miss_tokens` are summed in `LlmClient.ts` and shown
in `WD_COOP.status().llm.cache` and in the key panel ("缓存 88% · 首字 0.3 秒 / 说完 0.9 秒").

## Latency
Time to first token and total time per call (`status().llm.ttftMs / totalMs / byKind`). Planning calls: every 2.4 s in a fight, 8 s
otherwise, never while a chat is in flight; 8 s timeout. The rule brain keeps driving her body the whole time.
Unprompted remarks: at most one per ~32 s, only when the journal has new entries; the model may answer `[skip]`.

## Tests
`test/mock-deepseek.mjs` is a local stand-in for the API (JSON + SSE, cache usage computed from the real common prefix of consecutive
requests). `WD_COOP.debugSetBase('http://127.0.0.1:9345')` points the direct calls at it — dev builds and loopback addresses only,
never persisted. Screenshots: `chat-bar-{nokey-zh,key-zh,key-en}.jpg`, `chat-canned-{reply,why}-zh.jpg`,
`chat-stream-{typing,done}-{zh,en}.jpg`, `key-panel-cache-latency-{zh,en}.jpg`.

---

# Standing orders, thinking models, tokens, server route, spawn-in (2026-11-11, round 3)

## Why she stood still, and what changed
- She was only ever a follower: with WAI standing still she had nothing to do and dozed off after 13 s; a model answering
  `hold` could also park her for up to 20 s per turn; and chat changed what she said, never what she did.
- `deepseek-flash` is a thinking model: with a small `max_tokens` the whole budget went to reasoning and the reply was empty.
  Every request now sends `thinking: {type: "disabled"}` (accepted by the real API: 0 reasoning tokens). If a provider rejects it
  (HTTP 400) the route drops the parameter and adds room to `max_tokens` instead (`noteThinking` in `prompt.ts`); reasoning text is
  never used or shown; an empty answer falls back to the rule brain / a canned line.
- Model orders can no longer freeze her: `hold` = a 3 s pause at most once per 25 s, `move_to` only near WAI, `follow` never cancels
  a standing order, and any model hold/move is dropped when WAI gets more than 8 m away.

## Standing orders (`Coop.ts` `setStance`, `Chat.ts` `parseOrder`)
`follow` · `close` · `stay` · `collect` (fetches paint drops for WAI) · `attack` · `free` (plays by herself: drops, small creatures,
wandering near WAI) · `goto <place>` · `wake`. They hold until changed (or WAI gets 40 m away).
- With a model: her chat answer carries an order tag (`[idle][do:stay] 哦鲸鲸…`), applied while the line streams.
- Without: a Chinese/English keyword parser (跟我/过来/follow, 停/等/stay/wait, 跟紧/stay close, 捡/收集/collect, 打/攻击/attack,
  自己玩/on your own, 去喷泉/go to …, 别睡/wake) and a canned in-character acknowledgement.
- Harness: `WD_COOP.act({type:'mode', mode, target?, place?})`. Orders are journaled.

## Tokens
`WD_COOP.status().llm.tokens` (last / total prompt, completion, reasoning), the key-panel status line, and a small chip under her
bubble for ~2.6 s after each call (`↑1.5k ↓27 · 缓存 77%`, plus `思考 N` when a model reasons). Checkbox in the key panel hides the chip.

## Server-key route (`server/coopApi.ts`)
`POST /api/coop {v:2, kind, lang, messages, stream}` carries planning, streamed chat and remarks with the server's key
(system prompt + tools are added server-side); `GET /api/coop?check=1` asks the provider's `/models`. With no browser key and a key in
`.env.local` she is fully functional; the panel shows "已连接 · deepseek-flash（开发服务器的密钥）".

## Spawn-in
Switched on (or at level start, after the intro) she is drawn by the kid's pencil (`story.pencilDraw`): a flat doodle on the ground
for ~1.4 s, then she pops up with a burst and says hello. No `pencilDraw` on a level → a paint burst.

## Tests
`test/vite.nohmr.mjs` = a private no-HMR dev server with the proxy (`WD_PORT=5193 npx vite --config docs/whale/test/vite.nohmr.mjs`;
add `COOP_BASE_URL=http://127.0.0.1:9345 COOP_API_KEY=sk-MOCK-not-a-real-key` to aim the proxy at `test/mock-deepseek.mjs`).
Screenshots: `spawn-pencil-drawing.jpg`, `spawn-popped.jpg`, `order-stay-nokey-zh.jpg`, `token-chip-zh.jpg`,
`key-panel-server-route-tokens-zh.jpg` (mock) and `real-chat-typing-zh.jpg`, `real-chat-done-chip-zh.jpg`, `real-key-panel-zh.jpg` (real API via the proxy).

---

# Round 4 (2026-11-12): navigation, player moves, goofs, live roasts, corner view, movement

Progress log with every number: `PROGRESS.md`. Real API calls this round: ~62 (see below).

## 1. Navigation — `src/coop/NavGrid.ts`, `Companion.ts`
- A lazily baked multi-layer **nav grid** (0.5 m) read from the level's real colliders, so it works on both levels with no
  waypoints: per column, every upward surface with ≥ 1.2 m head room (down rays with `solid=false` + an up ray);
  edges WALK (≤ 0.55 m, autostep), JUMP up ≤ 1.25 m, DROP ≤ 3.2 m onto wide ground, running GAP jump ≤ 3 m (one missing
  cell = a seam she walks over); a clearance cost keeps routes off walls and pier edges; water is never ground.
  Columns/edges expire after 14 s (gates, drawn bridges, the road's erased stretches) and are forgotten where she gets stuck.
- A* runs as a generator, ~2 ms per step. She follows the route with a straight-line lookahead (ground checked every 0.6 m),
  jumps ledges, steps off drops at a walk, takes gaps with a running jump and a **jet hover** in her paint.
- Catch-up sprint 8.8 m/s when > 11 m behind. Stuck → hop → forget that bit of the map + re-plan. A catch-up teleport only
  when there is no route (or no progress) or WAI is > 95 m away, and it is **drawn in by the pencil** (`Coop.redraw`).
- Verified (WAI warped straight to the goal, she walks): level 1, 11 routes (terrace/mutant yard, canal bridge, towpath
  stairs, bastion, scaffold ramp to the roof and back, switchbacks to the plateau below the summit): 0 teleports, 2.0–3.1 m.
  Level 2, 9 routes (bell gate, pontoon, grand stair to Clock Square, Bell Bridge, lighthouse spiral up and down, boardwalk,
  whole map both ways): 0 teleports where WAI can walk it. Shots: `nav-road-climb.jpg`, `corner-view-climb.jpg`.

## 2. Her player moves — `src/coop/Moves.ts`
| player | her | how |
|---|---|---|
| move / run / jump / dodge | yes | own KCC body; sprint when behind |
| jet hover | yes | `trick hover`, and on gap jumps |
| paint slam | yes | pounce + dive, stomp hit r 2.2 m in her paint |
| spray / aim | yes | `attack`, `spray_at` (CoopSpray) |
| throw (rock / can) | rice ball | own projectile, crash hit, bends a little toward the target |
| gadget | rice bomb | own 14 s cooldown, small KA-SPLASH |
| shout (L2) | whistle | rings veiled moths only (never bells / the boss) |
| collect paint / crowns | fetch / point | `trick fetch_paint` (drops heal WAI), `trick point_crown` |
| stickers: pick up, lend, recall, purify | no | WAI's single inventory + story puzzles |
| TAG / ENCORE stamps | no | finishers belong to WAI; she never takes a creature past 90 % (`CoopMoves.cap`) |
| lift / throw props, chomp | no | single held-prop slot / Mouth sticker are WAI's |
LLM: one extra tool `trick {move: slam|throw|bomb|hover|whistle|fetch_paint|point_crown, target?}` (static, cache-safe).
Harness: `WD_COOP.act({type:'trick', move, target})`. The rule brain slams what is in her face, throws at range, bombs crowds.

## 3. Goofs — `src/coop/Goofs.ts`
Nine clumsy moments, each setup → mishap → embarrassed beat (bowl down + a line): `sprayCam` (blue blots on the player's
screen through the HUD's own `inkHit`, recoloured by `.coop-blot`), `slip`, `wrongWall`, `earlyCheer`, `lampPost`,
`fightNap`, `eatDrop` (half a heart back), `bowlStuck`, `wrongSalute`. Weights: `GOOF_WEIGHTS`; timing `GOOF_TIMING`
(38–75 s apart). Never in cutscenes, boss fights, telegraphs, chats or when WAI is low; never back-to-back.
12 simulated minutes: 12 goofs, no repeats in a row, WAI never lost health. Shot: `goof-spray-camera.jpg`.

## 4. Live roasts — `src/coop/Roast.ts`
Moments: missed (3 s of spraying, no hit), fell, hit, ENCORE slip, idle 28 s, perfect dodge, E on a thing that will not
budge. `ROAST.chance` 0.45, `ROAST.gap` 55 s; never in cutscenes / telegraphs / chats / goofs. With a model: a REMARK whose
volatile tail says `about WAI: … Director's note: …` (18 rotating notes: food, pretend you planned it, one word, rice,
soap opera, commentator…), the cached prefix is unchanged. Without one: canned zh/en lines + tags.
Real API, 30 roasts (zh): 29/30 distinct, mean bigram Jaccard 0.011 — `roasts-real-zh.json`, `roast-canned-zh.jpg`.

## 5. Corner view — `src/coop/PipView.ts`
Off-screen, hidden behind a wall or > 16 m away → a sticker-framed live view (name, 2–3 words of what she is doing, her
line). 256×160 render target from a camera over her shoulder, 6 fps, no shadow re-render, async read-back; skipped on the
Low tier, in cutscenes / pause and when frames average > 30 ms. ~1–1.6 ms GPU per picture (measured with `gl.finish`).
Toggle: pause menu, AI partner row (`画中画 开/关`, `wd.coop.pip`). Hook: the one `// PIP-HOOK` line in `main.ts`.
Shots: `corner-view-climb.jpg`, `corner-view-toggle-zh.jpg`.

## 6. Movement — `CompanionModel.ts`
Idle / walk / run blended by real speed; playback follows speed (walk ≤ 2.6×, run ≤ 3.4×), lean into speed and turns,
a scurry bounce; spray = the shoot clip's arms only over the legs' walk/run (no kneeling); hand-to-bowl pose (salute,
bowl taps) picked from the clips; idle fidgets (look around, tap the bowl, hip wiggle = tail wag) 4–9 s apart.
Fixed: in fights she ran laps between two flank spots (the side pick was inverted).
Limits: the clips have a ~0.2 m stride, so at 4–9 m/s some foot slide remains; the rig has **no tail or hair bones**.
Tripo presets worth buying: a long-stride **sprint/dash**, a **standing spray / throw** (upper body), **salute**,
**trip-and-fall / face-plant**, **dizzy**, **eat / nom**, **look around** idle, and a re-rig with **tail + hair chains**.
Shot: `movement-idle-spray-salute-run.jpg`.
