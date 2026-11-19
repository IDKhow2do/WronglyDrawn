# Letting an AI play (DeepSeek / any LLM)

Two ways in, both already in the game:

| | drives | API | built-in brain |
|---|---|---|---|
| **AI co-op partner "Pip"** (It Takes Two style) | a second character who fights beside WAI | `window.WD_COOP` | rule brain (offline) + LLM commander (DeepSeek / any OpenAI-compatible) |
| **AI player** | WAI himself | `window.WD_AGENT` | none — bring your own harness |

An LLM can't press keys at 60 Hz, so both work like a commander: every ~1–2 s it reads
`observe()` and issues 1–3 high-level commands; steering, aiming, dodging and button-holding
run in-game every frame.

---

## 1. Co-op partner (Pip)

**Turn it on:** pause (Esc) → **AI Partner / AI 搭档: ON**. The second button picks the brain:
*Auto* (LLM when the dev server has a key, otherwise the built-in rules) or *Built-in*.
The choice is remembered (`localStorage` `wd.coop`, `wd.coop.brain`); default is off.
From the console / a harness: `WD_COOP.enable(true)`, `WD_COOP.setBrain('rules' | 'auto')`.

**What Pip does** (code: `src/coop/`):
- Follows WAI (beside him, a step ahead, on the camera's side), walks where WAI walked
  (breadcrumb trail → bridges, stairs, the switchback road), and pops next to him when it is
  stuck (>~3 s), fell in the canal, is >30 m behind, or is outside the locked boss arena.
- Fights: paints creatures that are already fighting (focus-fires what WAI is spraying, grubs
  near WAI first) from a flank, out of WAI's line of fire. Real repaint damage through
  `EnemyBase.applyDamage` (kind `paint`), about a quarter of WAI's can per second and never
  boosted by Paint Time — it helps, WAI still carries the fight. It can trigger staggers WAI can TAG.
- Draws aggro: now and then (always when WAI is at ≤ 1 heart) a creature hunts Pip for ~5 s
  instead of WAI. The switch only happens between attacks, never mid-telegraph. The boss is
  only taunted when WAI is in trouble.
- Dodges telegraphs by itself (lamp beam → hop, shockwave rings → hop, rub/charge/lunge lanes →
  roll aside, falling crumbs → step out).
- Can be knocked down (4 half-hearts): lies dizzy for 7 s, or WAI walks up and presses **E**
  ("Help Pip up"). WAI's paint and thrown rocks pass harmlessly off Pip.
- Points things out (a lime "!" marker over creatures that notice you off-screen), warns about
  telegraphs ("It's aiming — jump the beam!"), tells you to TAG a reeling creature, cheers.
- Never solves the story: no organs, no Guardians, never starts a fight on its own and never
  touches the Eraser before the boss fight begins.
  LLM/API `attack`/`draw_aggro` orders are refused for creatures more than 20 m from WAI
  (Pip stays with WAI), and the observation only lists creatures within 20 m.

**Files:** `Companion.ts` (KCC body, navigation, spray, dodge, knock-down) · `CompanionModel.ts`
(the sticker buddy) · `CoopSpray.ts` (paint stream) · `Coop.ts` (partner: orders, aggro,
observe/act) · `RuleBrain.ts` · `LlmBrain.ts` · `SpeechBubble.ts` · `CoopApp.ts` (toggle, pause
row, `window.WD_COOP`) · `server/coopApi.ts` (dev endpoint). Hooks: `GameSession.coop`
(step / targetFor / prompt / render / dispose) and `App.coop` in `main.ts`.

### Plug in DeepSeek
Put the key in `.env.local` at the project root (never commit it; `*.local` is git-ignored):
```
DEEPSEEK_API_KEY=sk-...
```
Restart `npm run dev`. The terminal prints `[coop] AI partner LLM: deepseek-chat @ api.deepseek.com`.
Turn the partner on with brain *Auto*; the pause row shows `LLM · deepseek-chat`.

How it works: `LlmBrain` posts `{ observation }` to `POST /api/coop` every ~1.8 s. The Vite
middleware (`server/coopApi.ts`, loaded by `vite.config.ts` with `loadEnv`) adds a system prompt
and Pip's commands as OpenAI **tools**, calls `{base}/chat/completions`, and returns only
`{ ok, calls: [{name, args}], say, model, ms }`. The key is read server-side only (no `VITE_`
prefix → never in the bundle), is sent only as the upstream `Authorization` header, and is never
logged or echoed (upstream errors are reduced to their HTTP status). `GET /api/coop` →
`{ configured, model, provider }`.

Orders from the model last a few seconds (attack 10 s, aggro 6 s, move 8 s) and then the rule
brain takes over again; while the LLM is live the rule brain stays quiet except for urgent
warnings. No key, a network error, a non-200 or a 9 s timeout → Pip falls back to the rule brain
immediately and retries the LLM after 12 s. Production builds have no `/api/coop` → rules only.

### Any other model (OpenAI-compatible)
```
COOP_BASE_URL=https://api.openai.com/v1      # or http://localhost:11434/v1 (Ollama), a proxy…
COOP_MODEL=gpt-4o-mini                        # or qwen2.5:7b, deepseek-chat…
COOP_API_KEY=sk-...                           # optional for local servers; wins over DEEPSEEK_API_KEY
COOP_TIMEOUT_MS=8000
```
The model must support function calling (`tools`). A custom `COOP_BASE_URL` without a key is
treated as configured (local models).

Request the model sees (user message, trimmed):
```json
{"lang":"en","objective":"Wake the Guardians 1/3","hint":"…","brain":"llm",
 "wai":{"pos":[-41.2,0,13.9],"hp":4,"maxHp":6,"doing":"spraying chomper","aimingAt":"chomper","paintTank":0.62},
 "pip":{"pos":[-44.1,0,8.2],"hp":4,"maxHp":4,"down":0,"order":"attack chomper (llm)","spraying":true,"distToWai":6.3,"paintDealt":41},
 "enemies":[{"id":"chomper","kind":"chomper","pos":[-46.8,0,10.9],"distWai":6,"distPip":3.8,"state":"CHASE","repaintPct":38,"chasing":"wai","reeling":false}],
 "events":["21s chomper noticed us","24s WAI got hit (hp 4/6)"],"pipSaid":["Watch the jaws — dodge!"],
 "cinematic":false,"yourLastTurns":["attack({\"target\":\"chomper\"}) → attacking chomper"]}
```
Reply it should produce: tool calls such as `attack {target:"chomper"}`, `draw_aggro {target}`,
`say {text}` (or plain text content, used as the chat line).

### External harness (no LLM in the loop, or your own agent)
`window.WD_COOP` mirrors `window.WD_AGENT`:
- `WD_COOP.observe()` → the JSON above.
- `WD_COOP.act(cmd)` → `follow`, `attack {target}`, `draw_aggro {target}`, `move_to {x,z}`,
  `hold {seconds}`, `spray_at {x,y,z,seconds}`, `jump`, `dodge`, `regroup`,
  `ping {target | x,y,z, label}`, `say {text}`, `cheer`, `stop`. Returns a short status string.
- `WD_COOP.schema` (command list), `WD_COOP.status()` (brain, LLM turns/latency/errors, Pip's
  stats: paint dealt, teleports, times knocked down), `WD_COOP.enable(on)`, `WD_COOP.setBrain(b)`.

With brain *Built-in*, orders from `act()` behave like LLM orders (they expire and the rule brain
resumes), so a Playwright/CDP script or an MCP tool can command Pip at any rate.

---

## 2. AI player (drives WAI)
`window.WD_AGENT` (see `src/agent/AgentBridge.ts`).

- `WD_AGENT.observe()` → compact JSON: objective + hint, WAI's position/HP/organs/paint tank,
  nearby enemies (state, repaint %), hosts (which organs they have), crowns, Eraser status, and
  `coop` (Pip's position/HP/order when the partner is on).
- `WD_AGENT.act(cmd)` → `move_to {x,z,run}`, `look_at`, `spray {seconds, at}`, `jump`, `dodge`,
  `bomb`, `select_organ`, `lend {organ, host}`, `recall`, `interact` (E / TAG IT! / help Pip up),
  `aim`, `stop`.
- `WD_AGENT.schema` → the command list, ready to hand to a model as tools.

To let an LLM drive WAI, reuse the same pattern as Pip: a dev endpoint like `server/coopApi.ts`
with `WD_AGENT.schema` as tools, and a loop that posts `observe()` every ~1.5 s and applies the
returned calls with `act()`. Both can run at once: one model as WAI, another as Pip.

Latency (~1–3 s per decision) is fine for exploring, puzzles and support roles; split-second
dodging stays in the in-game controller (Pip auto-dodges telegraphed attacks).
