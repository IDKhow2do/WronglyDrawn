# Story pass: intro, transitions, celebration, END

> L2 | Parent: docs/CONTENT_PLAN.md ("Story direction")
> [PROTOCOL]: Update this file on change, then check docs/CONTENT_PLAN.md

## Theme
Imagination is not a mistake to be corrected.

The Red Pen (author, 2026-11-14): the outside world's standard of judgement. Nobody in the drawn city made it and the
children did not draw it. It comes in over the edge of the page: the answer key, the rubric, the grade. It is drawn
EXACT (ruler-straight, flat machined fills, a steel cap, an engraved scale), the one thing in the game that is not
crooked. No malice: it simply cannot see anything but deviation from the standard. Each level shows one thing it took:
the city stopped seeing (1, the Eye), went silent (2, the Mouth), stood still (3, the Legs). It is won over, not
destroyed: WAI's paint is the first imperfect thing ever to touch it; it draws a crooked line and finds nothing in its
rubric to mark it down for. The epilogue puts the standard in its place rather than abolishing it (a ruler as a kite
spar, the red X turned into a star).

Show, do not lecture. Pictures carry the message. Only the closing letter speaks plainly.

## The name WAI (author, 2026-11-14)
- zh: WAI sounds like 歪 (crooked, askew). Not the correct answer, but creative.
- en: WAI sounds like WHY. It does not play by the usual rules. It dares to ask.
- Intro: the Red Pen marks the doodle with a red X and writes "WRONG!" (zh: "歪！"). The doodle answers
  "WHY?" (zh: "为什么？"). It keeps the word as its name. The en version leans on WHY and nods to 歪;
  the zh version leans on 歪 and nods to WHY.
- WAI's answer to every correction is "why?": the margin notes in the world get a small pencil "why?"
  scribbled under them.
- Letter: one line ("be a little WAI").

## Flow
New game (level 1, first time) → SETUP screen (picture / colours / pen, once per device: ui/SetupScreen) → INTRO storybook (≈50 s) → level-1 title card → level-1 pencil intro (in-engine).
Each level end: last story beat → CELEBRATION (in-engine, ≈3 s) → DEPARTURE beat (in-engine, 5–12 s) → result card.
Next level: title card (drawn, ≈3 s, over the camera push-in) → the level's own arrival intro (in-engine, existing).
Level 3 end: the Red Pen draws ("The city stays drawn wrong. And that is fine.") → celebration with the Pen →
END storybook (epilogue pictures → handwritten letter → credits) → result card.
Title screen: "STORY" sticker replays the intro; "THE END" sticker appears once the END has been seen.

Everything: a SKIP button (click / tap), Esc, or a gamepad B / Start — all asleep for the first 0.8 s — or hold
Space / Enter / mouse / a finger ≈1 s (a ring fills; a short tap never skips). A skip lands where the sequence would
have ended. The level title card carries the same SKIP (it ends the camera push-in).
Tap / click / → turns the storybook page early. Bypassed under `?test` (margin slips included); `?test&story=1` forces it on; `?story=0` turns it off anywhere.

## INTRO (storybook, en / zh)
1. Once, some children drew a city. / 从前，有一群孩子画了一座城。
2. Nothing in it was right. The houses leaned. The lamps had eyes. Everything was alive. /
   城里没有一样是"对"的：房子歪着，路灯长着眼睛。可是每样东西都是活的。
3. Then something came in over the edge of the page: the Red Pen. / 后来，有个东西从纸的边外面伸了进来：红笔。
   Nobody drew it. It was the answer key. / 它不是谁画的。它是标准答案。
   (the page edge, the grey ruled outside, the exact Pen; it measures her drawing: "Deviation: 12°" / "偏差：12°")
4. It measured everything against one standard. / 它拿同一把尺子，量所有的东西。
   Whatever did not match, it marked. / 不合标准的，一律打叉。
   (marks on the page: "Eyes: 2." / "眼睛：2 只。", "Volume: over limit." / "音量：超标。", "Legs: not to spec." / "腿：不合规格。",
   "Windows: 4 per row." / "窗户：每排 4 个。")
5. Its Eraser rubbed out the eyes. Its Hush ate the voices. Its rulers pinned the legs. /
   它的橡皮擦掉了眼睛，它的「寂静」吃掉了声音，它的尺子按住了腿。
   The city stopped seeing. Then it went quiet. Then it stood still. / 城市先是看不见了，接着没了声音，最后一动不动。
6. In the margin, one small doodle got a red X too, and a note: WRONG! / 页边上有个小涂鸦，也挨了一个红叉，旁边批着一个字：歪！
   The doodle looked at it and asked: WHY? / 小涂鸦看了看，问："为什么？"
   It kept the question as its name. WAI. (In Chinese, wāi 歪 means crooked. Its crown agreed.) /
   它干脆把这个字留下来当名字：WAI，就是"歪"。（念快一点，还像英文的 WHY，为什么。）
7. Then it climbed off the page, picked up a spray can… / 然后，它从纸上爬了下来，捡起一罐喷漆……
   …and went to give the city back its colours. / ……去把颜色还给这座城。

## Level 1 in-engine intro (existing, retuned)
"Somewhere, a kid is drawing…" → "Somewhere, a kid is still drawing…" (it follows the storybook).
"But something else is rubbing the city out." → "But the Red Pen’s ERASER is rubbing the city out."
"THE ERASER rubbed out the Guardians’ eyes and voice — and the road to its tower." →
"It rubbed out the Guardians’ eyes and voice — and the road to the tower." (the Eraser is named as the Pen's tool)

## Title cards (level start)
- CHAPTER 1 · THE EYE / BLIND PLAZA / "The city stopped seeing." / 第一章 · 眼睛 / 盲眼广场 / "城市看不见了。"
- CHAPTER 2 · THE MOUTH / MUTE HARBOR / "Through the tower door: the sea, and no sound at all." / 第二章 · 嘴巴 / 无声码头 / "塔门后面是海，却一点声音都没有。"
- CHAPTER 3 · THE LEGS / LIMP WORKS / "The paper boat reached the Red Pen’s tower." / 第三章 · 腿 / 瘸腿工厂 / "纸船到了红笔的塔下。"

## Departures (in-engine)
- Level 1: WAI cheers at the tower door, turns and walks in. "Behind the door, something smells of salt…" / "门后面，飘来一股海水的咸味……"
- Level 2: WAI cheers on the paper boat; the boat glides out of the harbour mouth toward the Correction Tower on
  the horizon. "The harbour sings them off." / "整个港口唱着歌送他们出海。" → "Next stop: the Red Pen’s tower." / "下一站：红笔的塔。"
  Note: the brief named the Foghorn Ferry (`buildFerry()`), but the player boards the PAPER BOAT (`exitBoat` in
  MuteHarbor.ts) and level 3 opens with "The paper boat bumps against the CORRECTION TOWER". The paper boat glides
  away; the ferry blows its horn as a goodbye (it stays moored: its colliders are static).
- Level 3: the Red Pen's finale (existing captions) → celebration beside the Pen → END.

## Red Pen margin notes (the voice of a standard, red marker, with WAI's pencil "why?" under each)
- Level 1 (it has red X's and the struck street, no words): "Windows: 4 per row." / "窗户：每排 4 个。",
  "Eyes: 2. See rubric." / "眼睛：2 只。见评分标准。"
- Level 2 (the Pen appears in the sky once): "Volume: over limit." / "音量：超标。", "Not to scale." / "比例不对。"
- Level 3 (already full of stamps and "CORRECT"): "Legs: not to spec." / "腿：不合规格。"
- Form: a torn slip of ruled paper on a little stake, stuck in the ground on the main path (no wall needed; the
  ground height comes from a physics ray). Spots: src/story/MarginNotes.ts NOTE_SPOTS.

## END (storybook, en / zh)
1. The next morning, the children came back to their drawing. / 第二天早上，孩子们回到了他们的画前。
2. WAI’s paint was the first crooked thing ever to touch the Red Pen. / WAI 的颜料，是第一样碰到红笔的歪东西。
   It drew a wobbly line, checked its rubric, and found no box to mark it wrong. / 它画了一条歪歪的线，翻遍评分标准，也找不到一格能扣它的分。
3. The crossed-out drawings went back up on the wall. Every red X turned into something: a kite (with a ruler for a
   spar), a star, a bird. /
   被打叉的画全都挂回了墙上。每一个红叉都变成了别的东西：会飞的，会发光的，会唱歌的。（避开“筝”：不在 WD Hand 子集里）
4. And WAI? WAI is still asking why. / WAI 呢？WAI 还在问"为什么"。
5. The letter (below).
6. Credits: WRONGLY DRAWN · 错画之城 / made by [your name] / thank you for playing / THE END.

## The letter (shipped, 2026-11-14: written for a child, en and zh each native)
Signed 巴特歪 (`AUTHOR` in src/story/EndPages.ts: the one place the name is written).

EN:
> Dear player,
>
> Thank you for drawing this city with me.
>
> When I was small, I drew a house with legs. It got a red X: houses do not have legs. The next day I drew it again.
>
> Machines can make almost anything now. You ask them, and they build it. So the rare thing is not clever hands any
> more. The rare thing is the house with legs: the idea nobody else has, because it is yours.
>
> A red pen can say “wrong”. It can never say what your idea could have become.
>
> And when it comes out almost right, do not settle. Draw it again, and again, until it is the thing you saw in your
> head. Not settling, and your imagination: these are the two strongest things you will carry, wherever you go.
> (added 2026-11-15, the author: creativity AND a stubborn refusal to settle)
>
> So be a little WAI. Keep your crown crooked. Keep asking why. Then go and make the thing you are thinking of.
> Start today.
>
> I can’t wait to see what you make,
> 巴特歪

ZH:
> 亲爱的小朋友：
>
> 谢谢你陪我把这座城画完。
>
> 我小时候画过一座长腿的房子，被打了一个红叉：房子哪有腿。第二天，我又画了一遍。
>
> 现在的机器很会做东西，你说一句，它就做出来。所以最稀罕的，已经不是一双巧手了。最稀罕的是那座长腿的房子——只有你想得出来，因为它是你的。
>
> 红笔只会说“不对”。它永远说不出：你那个想法，本来能变成什么样。
>
> 要是做出来只是“差不多”，别将就。再画一遍，再画一遍，直到它就是你心里的那个样子。不将就和创造力，会是你前行路上最大的武器。
>
> 所以，歪一点吧。王冠歪着也挺好。多问几个“为什么”。然后，去把你脑子里那个又怪又好玩的东西做出来。今天就开始。
>
> 期待你的作品，
> 巴特歪

### Draft A (what shipped before: written at an adult)
EN (≈140 words):
> Dear player,
>
> Thank you for drawing this city with me.
>
> Something is changing out there. AI can now do more and more of the making for us... (see git history)

### Draft B (shorter, warmer)
EN:
> Dear you,
>
> When I was small, I drew a house with legs. It got a red X: houses don't have legs. By the answer key, that was
> right. It didn't matter.
>
> Today, more and more of the making can be handed to AI. What cannot be handed over is the house with legs: the
> odd thing only you thought of, and the wish to see it real.
>
> So keep asking why. That is what WAI is for. Draw it wrong on purpose. Then make it.
>
> Yours, from the margin,
> [your name]

ZH:
> 给你：
>
> 我小时候画过一座长腿的房子，挨了一个红叉：房子没有腿。按标准答案，这没错。可那不重要。
>
> 现在，越来越多"做"的活儿可以交给 AI 了。交不出去的，是那座长腿的房子：只有你想得出来的怪东西，和你想看见它成真的那份心。
>
> 所以，继续问为什么吧，WAI 就是为这个而生的。故意画歪一点。然后，把它做出来。
>
> 页边的，
> ［你的名字］

### Draft C (a little more playful)
EN:
> Hi, it's me, the one who drew this city.
>
> Here is a secret: none of it was right. The crowns are crooked on purpose.
>
> The tools around us are getting very good at making things. Ask, and the making happens. That leaves the
> best part to you: deciding what is worth making, and wanting it badly enough to ask.
>
> No answer key has your idea in it, and no rubric has a box for it. So don't wait for one. Ask WHY, draw WAI,
> make the thing.
>
> See you on the next page,
> [your name]

ZH:
> 嗨，是我，画这座城的人。
>
> 告诉你一个秘密：这里面没有一样是"对"的，王冠是故意画歪的。
>
> 身边的工具越来越会"做东西"了，你一开口，它就动手。剩下最好玩的那部分留给你：决定什么值得做，并且想要到愿意开口。
>
> 标准答案里不会有你的点子，评分表上也没有它的格子。所以别等答案。问一句为什么，画一个歪，把它做出来。
>
> 下一页见，
> ［你的名字］

## Code map
- src/story/ (see the L3 headers): StoryBook (page player + the shared SKIP control), Doodle (hand-drawn SVG kit),
  IntroPages / EndPages (the pictures), StoryFlow (flags, URL switches, title stickers, title cards),
  LevelOutro (celebration + departures, in-engine), MarginNotes (the Pen's notes in the world), story.css.
- src/i18n/zhStory.ts: every new string in Chinese; src/i18n/zhSetup.ts: the setup screen + SKIP.
- src/ui/SetupScreen.ts (+ setup.css, ui/Pad.ts): the one screen before a new game. Round 3: docs/story/ROUND3.md.

## Done / next
Done (2026-11-14):
- Storybook engine (StoryBook, Doodle, Figures), INTRO 7 pages (≈54 s), END 4 pictures + letter + credits. Shots
  docs/story/shots/intro-{en,zh}-N, end-{en,zh}-N.
- Title: STORY sticker always, THE END once seen (localStorage wd.story). Title cards per level (card-*.jpg).
- Level outros (LevelOutro + Celebration): plaza hop through the arch, harbor paper boat glides out toward a horizon
  tower (the art agent's new paper_boat.glb rides along: only the root moves), works cheer beside the Pen → END.
  Shots outro-<level>-<lang>-NN.
- Celebration pose tuned by screenshot on wai2.glb bones: R_Upperarm z −2.5 (can beside the crown), R_Forearm z −0.6,
  L_Upperarm x 1.4. No airborne bounces (the jump clip's pose looks tilted).
- Margin slips in all three levels (slip-*.jpg).
- Hooks: main.ts (StoryFlow field, title stickers, intro before level 1, title card in beginIntro, level:complete →
  outro → result card, step/pose, decorate, drop), MuteHarbor.ts (HarborBuilt.exitBoat), StoryDirector.ts (3 retuned
  level-1 captions), zh.ts (spread ZH_STORY, 3 stale keys removed).
- Music: the story uses the session's moods (victory after a boss); no new mood added.
- Verified in headless Chrome (my Vite :5211, Chrome :9411): every book page en + zh (tap-through shots), all three
  outros en + zh, title cards, slips. Skip: a tap never skips, a 0.4 s hold does not, a 1.4 s hold does (intro, END
  from the title, each outro; level 3 = one hold for the cheer, one for the END book, then the result card). Reload
  mid-intro: back to a clean title, no flag written. tsc clean for src/story.
- Level 3 outro eases art's DrawnSkyline to full colour (`works-skyline` userData.skyline.setColour(1)).
- Font: every new Chinese glyph is in the WD Hand subset (筝 was not: the zh line avoids it).
- Bots (Gentle, ?test, copies in /tmp/wd-story/bots on :5211/:9412; headless shell from Playwright because
  Google Chrome headless instances kept being killed from outside every few minutes). None completed; none stalls
  in story code (under ?test the story layer is off; since 2026-11-14 the slips too):
  - L2 (rerun after the harbor rework settled, story fully off): PASS, complete, game 450 s, no errors.
  - L1: Guardians + quarter + statue + Eraser done (game 497–538 s, twice), then boss.mjs's move_to walks south off the
    summit and stalls at (0, 12.4, −30.8). From the door warp the same move_to completes the level: bot/nav issue.
  - L2 (earlier runs): never lent the Mouth to the ferry while another agent was mid-edit in MuteHarbor.ts.
  - L3: Legs → lift → F2 → Inspector → F3 → Archivist → roof stair at 426 s, then stuck at the wet-ink curtain until
    the 3000 s cap; other runs stalled on the Index stamp press and after F3: a different spot each time.
- The Red Pen reframed as the outside standard (author, 2026-11-14): intro pages 3–4, the exact Pen figure, slips in a
  standard's voice, END page 2 + the ruler-spar kite, letter paragraph 3 and drafts B/C. Shots retaken.
Next: the bots once the level owners settle; the in-level WorksStory caption still calls the Pen "a teacher's pen"
(not story-pass code: flagged to the coordinator).

Round 3 (2026-11-14): setup screen, SKIP buttons, the author's name in one constant, the child-reader letter.
See docs/story/ROUND3.md.
