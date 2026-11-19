# 蓝色大肥鱼 — the show-off personality

The partner brags. She takes credit for team wins with her real damage share in the line, she "thinks deeply" on the
spot like a model, and she knows when she has annoyed the player. Cheeky and warm: she praises herself, never puts the
player down. Made for children: no rude words, no adult references, no brand names.

## Where it lives

| File | Role |
|---|---|
| `src/coop/FightLedger.ts` | Per-fight paint totals. Polls every creature's repaint each step (total); her own hits report what they took off (`mine()`). WAI = total − hers. |
| `src/coop/Swagger.ts` | The show-off director. Fight credit, small-win brags, "the user is REALLY angry now", the queue that waits for a free bubble / the end of a cutscene. All limits in `SWAGGER`. |
| `src/coop/Goofs.ts` | New goof `deepThink` (weight 1.1) and `hush(seconds)`. `sprayCam` now reports itself as an annoyance. |
| `src/coop/RuleBrain.ts` | The single table of line pools (`LINES`): `brag`, `bragWin`, `bragDodge`, `bragCrown`, `bragFirst`, `credit`, `creditSelf`, `angry`, `think`, `thinkDone`, `thinkFight`, `thinkCrown`. `line()` takes `{pct}` vars, never repeats a pool's last line, returns whether she spoke. |
| `src/i18n/zhSwagger.ts` | The Chinese for all of them (spread into `ZH`). |
| `src/coop/prompt.ts` | Two short persona paragraphs (zh + en): show-off, the two memes as allowed catchphrases, quote only the journal's share. |
| `src/coop/SpeechBubble.ts` | `dots()`: animated trailing dots for "Deep thinking in progress". |

No shared combat file was edited: `CombatDirector.ts`, `Damage.ts` and `EnemyBase.ts` are untouched. The share is
measured from `repaint × baseHp` (difficulty rescaling never reads as damage).

## Triggers and rate limits (`SWAGGER` in Swagger.ts)

**Fight credit.** A fight opens with the first paint on any creature and closes when nothing was painted for 3 s and
no engaged creature, and no unfinished creature of this fight, is within 22 m of WAI (or 15 s without paint; never
while a boss / mid-boss is still up and fighting near WAI; 0.5 s after a boss is repainted). It counts only when it was
**real**: at least one creature finished, ≥ 90 base paint in all, ≥ 4 s from first to last stroke. So a single hit or a
grub WAI one-shots never gets a line.
- share < 30 % → `credit` ("We two are SO strong! (my share: 7%)"), share ≥ 40 % → `creditSelf`; 30–40 % → no line.
- boss / mid-boss fights (base paint ≥ 1000) always get the line; ordinary fights: 65 % chance, ≥ 100 s apart.
- Every real fight is written to her journal as a key fact: `fight won (…): WAI painted N, I painted M, my damage
  share P%` — the LLM sees exactly this and may only quote it.

**Deep thinking** (goof `deepThink`): she stands stock-still 3.2 s, head tilted, bubble "正在深度思考中" with animated
dots, then hops and answers with great confidence: "paint the monster!" in a fight, a real crown ping if one is within
30 m, else a trivial conclusion ("the floor is down there"). Goof rules apply (≥ 38–75 s between goofs, never in a
cutscene, a boss fight, a telegraph, with WAI low). It never starts and stops at once when she would be in the way:
within 1.4 m of WAI, on the line he is walking (8 m ahead, 1.6 m to each side), or in a doorway (walls within 1.6 m on
two opposite sides). Companion.autoDodge still runs every step. She does not doze off during a goof.

**"The user is REALLY angry now"** after: her `sprayCam` goof (screen flood), WAI's paint on her (`Mood.poke`), "wake
up / come here" twice within 20 s, a catch-up teleport because she wandered off (`far` / outside the boss arena; not
`blocked` / `no-progress`, and not within 8 s of WAI jumping across the map: respawn, warp). ≥ 45 s apart, five
variants, never the same one twice in a row. Then she behaves: no goofs for 60 s, no small-win brags for 30 s.

**Small-win brags**: a creature repainted (30 %, replaces the "repainted" line), her own dodge (35 %), WAI's crown
(50 %), getting into a new region ahead of WAI (50 %). ≥ 35 s apart and ≥ 35 s after a credit line. Half the time the
generic catchphrases ("I really am too good at this."), else one for the moment.

**With the LLM on**: `credit`, `creditSelf`, `angry`, `think*` are URGENT kinds, so code still speaks them; the
small-win brags are left to the model (persona in prompt.ts) so the two brains do not both brag.

## Lines

| kind | English | 中文 |
|---|---|---|
| brag | I really am too good at this. | 我真是太有实力了。 |
| brag | As expected of me. | 不愧是我。 |
| brag | That move was out of this world. | 这波在大气层。 |
| brag | Talent like this cannot be taught. | 这种天赋，学不来的。 |
| brag | Too easy. Next! | 太简单了，下一个！ |
| brag | Write that down: I am amazing. | 记下来：我超厉害。 |
| bragWin | Repainted! I really am too good at this. | 涂好了！我真是太有实力了。 |
| bragWin | Another one! Did you see my paddle work? | 又一个！看到我的饭勺操作了吗？ |
| bragWin | Masterpiece. You may clap now. | 杰作。现在可以鼓掌了。 |
| bragDodge | Dodged! Too fast for my own eyes. | 躲开了！快到我自己都没看清。 |
| bragDodge | Missed me! Of course it did. | 没打着我！当然打不着。 |
| bragDodge | Saw that coming a mile off. | 早就看穿了。 |
| bragCrown | A crown! I spotted it first. Obviously. | 王冠！我先看到的，显然。 |
| bragCrown | Crown found. All thanks to my sharp eyes. | 找到王冠了，全靠我眼尖。 |
| bragCrown | Shiny! My nose for treasure is too good. | 闪闪的！我这寻宝的本事，太有实力了。 |
| bragFirst | First! I win. | 我第一！我赢了。 |
| bragFirst | Got here first. Naturally. | 我先到的，理所当然。 |
| bragFirst | Too fast? Sorry, it is a gift. | 太快了？不好意思，天生的。 |
| credit | We two are SO strong! (my share: {pct}%) | 我们俩真强！（我的输出：{pct}%） |
| credit | What a team! I carried. (my share: {pct}%) | 好一个组合！我带飞的。（我的输出：{pct}%） |
| credit | Team win! Mostly thanks to me. (my share: {pct}%) | 团队胜利！主要靠我。（我的输出：{pct}%） |
| credit | Us two? Unstoppable. (my share: {pct}%) | 咱俩联手，无人能挡！（我的输出：{pct}%） |
| creditSelf | I did most of that! (my share: {pct}%) | 大半是我打的！（我的输出：{pct}%） |
| creditSelf | See that? I carried the whole fight. (my share: {pct}%) | 看到没？全程我带飞。（我的输出：{pct}%） |
| creditSelf | I really am too good at this. (my share: {pct}%) | 我真是太有实力了。（我的输出：{pct}%） |
| angry | Uh-oh. The user is REALLY angry now. | 糟了，用户彻底怒了。 |
| angry | Uh-oh. User anger level: maximum. | 糟了，用户怒气值已满。 |
| angry | Alert: the user is fuming. Behaving now. | 警报：用户彻底怒了。我先老实一会儿。 |
| angry | Uh-oh, I think I made the user REALLY angry. | 糟了，好像把用户彻底惹怒了。 |
| angry | Uh-oh. Switching to good-fish mode. | 糟了，用户怒了。切换乖巧模式。 |
| think | Deep thinking in progress (+ animated dots) | 正在深度思考中 |
| thinkDone | Done thinking. Conclusion: the floor is down there. | 思考完毕。结论：地板在下面。 |
| thinkDone | Thought it through. The answer is: rice. | 想明白了。答案是：白饭。 |
| thinkDone | Analysis complete: we keep walking. | 分析完毕：我们继续走。 |
| thinkDone | After deep thought: I am right. As always. | 深度思考的结果：我是对的。一如既往。 |
| thinkFight | Thought it through: paint the monster! | 想清楚了：涂那个怪！ |
| thinkCrown | Thought it through: there is a crown over there! | 想清楚了：那边有王冠！ |

## Proof (2026-11-15, level 1, Gentle, scripted with `__WD.advance`)

Scripts: `docs/whale/test/personality/` (own Vite :5296 without the /api/coop proxy, headless Chrome :9396, the mock
LLM copied to :9397). WAI's spray is simulated with `applyDamage` every 0.1 s; she fights with her own brain. A
stack-based tally (every `applyDamage`, split by calls from `src/coop/`) cross-checks the ledger.

| fight | WAI | fish | share | line | tally (fish / other) |
|---|---|---|---|---|---|
| mutant, zh, rules | 535 | 115 | 18 % | (65 % roll missed: journal fact only) | 115 / 535 |
| lamp + 2 grubs, zh, rules | 514 | 38 | 7 % | 好一个组合！我带飞的。（我的输出：7%） | 38 / 502 (12 of WAI's paint did not pass the tally's hook; fish matches exactly) |
| Eraser boss + grub, zh, rules | 1956 | 160 | 8 % | 团队胜利！主要靠我。（我的输出：8%） | — |
| mutant, en, rules | 501 | 110 | 18 % | Team win! Mostly thanks to me. (my share: 18%) | 110 / 540 (39 painted before she was drawn in) |
| mutant, en, **mock LLM on** | 614 | 36 | 6 % | We two are SO strong! (my share: 6%) | 36 / 614 |
| stapler 3.5 s / bottle 4.8 s | 220 / 78 | 0 | 0 % | none (too short = not real) | — |

Spam check (`spam-5min.json`): 300 simulated s, fights with whatever came near, two sprays on her, "过来" ×3 in 4 s.
39 lines in all (7.8 / min, mostly the old pools); show-off: 1 think, 1 credit, 4 angry (one per provocation, ≥ 45 s
apart), 0 brags. Under the mock LLM the think / angry / credit lines still played; `brag()` returned false.

Screenshots: `docs/whale/personality/` — `fight-credit-zh`, `boss-credit-zh`, `think-zh` (dots), `think-done-zh`,
`angry-flood-zh` (screen flooded), `brag-zh`, `fight-credit-en`, `think-en`, `angry-en`, `fight-credit-llm-en`.

## Known limits

- She cannot finish a creature (her 90 % cap), so her share is low by design; `creditSelf` mostly shows when WAI
  barely painted.
- Damage done before she is drawn in (level start, a redraw) is not counted.
- A credit after a fight she slept through can read "my share: 0%". That is on purpose: it is the joke.
- The deep-think crown answer pings the crown; the ping can be off-screen.
