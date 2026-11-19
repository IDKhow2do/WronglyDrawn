/**
 * [INPUT]: none (plain data)
 * [OUTPUT]: exports ZH_STORY — the Chinese for every string of the story pass (src/story: the INTRO and END books, the
 *           letter, title cards, level outros, the Red Pen's margin notes, the retuned level-1 intro lines)
 * [POS]: spread into ZH (./zh.ts) like ZH_WORKS. Natural Chinese, not word for word: the zh version leans on 歪 where
 *        the English leans on WHY (docs/story/NOTES.md, "The name WAI").
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
export const ZH_STORY: Record<string, string> = {
  // ── storybook chrome ──
  'Hold to skip': '按住跳过',
  'click to continue': '点一下继续',
  STORY: '故事',
  'THE END': '结局',

  // ── INTRO ──
  'Once, some children drew a city.': '从前，有一群孩子画了一座城。',
  'Nothing in it was right. The houses leaned. The lamps had eyes.': '城里没有一样是“对”的：房子是歪的，路灯长着眼睛。',
  'And everything was alive.': '可是，每样东西都是活的。',
  'it SEES': '它会看',
  'it WALKS': '它会走',
  'it SINGS': '它会唱',
  'Its Eraser rubbed out the eyes. Its Hush ate the voices. Its rulers pinned the legs.': '它的橡皮擦掉了眼睛，它的「寂静」吃掉了声音，它的尺子按住了腿。',
  'The city stopped seeing. Then it went quiet. Then it stood still.': '城市先是看不见了，接着没了声音，最后一动也不动。',
  'In the margin, one small doodle got a red X too, and a note: WRONG!': '页边上有个小涂鸦，也挨了一个红叉，旁边批着一个字：歪！',
  'WRONG!': '歪！',
  'The doodle looked at it and asked: WHY?': '小涂鸦看了看，问：“为什么？”',
  'WHY?': '为什么？',
  'It kept the question as its name: WAI. It sounds like WHY. And its crown really was crooked.': '它干脆把这个字留下来当名字：WAI，就是“歪”。念快了，还像英文的 WHY，为什么。',
  '= why? = 歪': '= 歪 = WHY?',
  'Then it climbed off the page and picked up a spray can…': '然后，它从纸上爬了下来，捡起一罐喷漆……',
  '…and went to give the city back its colours.': '……去把颜色还给这座城。',

  // ── level 1's in-engine intro (retuned: it follows the book) ──
  'Somewhere, a kid is still drawing…': '某个地方，一个孩子还在画……',
  'But the Red Pen’s ERASER is rubbing the city out.': '可是，红笔的【橡皮擦】正在把这座城擦掉。',
  'It rubbed out the Guardians’ eyes and voice — and the road to the tower.': '它擦掉了守护者的眼睛和声音，还擦掉了通往高塔的路。',

  // ── title cards ──
  'CHAPTER 1 · THE EYE': '第一章 · 眼睛',
  'CHAPTER 2 · THE MOUTH': '第二章 · 嘴巴',
  'CHAPTER 3 · THE LEGS': '第三章 · 腿',
  'The city stopped seeing.': '城市看不见了。',
  'Through the tower door: the sea, and no sound at all.': '穿过塔门，是海，却一点声音也没有。',
  'The paper boat reached the Red Pen’s tower.': '纸船靠上了红笔的塔。',

  // ── level outros + celebration ──
  'TA-DA!': '当当！',
  'Behind the door, something smells of salt…': '门后面，飘来一股海水的咸味……',
  'The whole harbour sings them off.': '整个港口唱着歌，送他们出海。',
  'Next stop: the Red Pen’s tower.': '下一站：红笔的塔。',

  // ── the Red Pen's margin notes in the world (WAI answers each: "why?") ──
  'why?': '为什么？',

  // ── the Red Pen as the outside standard (author, 2026-11-14) ──
  'Then something came in over the edge of the page: the Red Pen.': '后来，有个东西从纸的边外面伸了进来：红笔。',
  'Nobody drew it. It came with the right answers.': '它不是谁画的。它带着标准答案来的。',
  'Deviation: 12°': '偏差：12°',
  'It measured everything with the same ruler.': '它拿同一把尺子，量所有的东西。',
  'Whatever did not match, it marked.': '不合标准的，一律打叉。',
  'Eyes: 2.': '眼睛：2 只。',
  'Volume: over limit.': '音量：超标。',
  'Legs: not to spec.': '腿：不合规格。',
  'Windows: 4 per row.': '窗户：每排 4 个。',
  'Eyes: 2. See the rules.': '眼睛：2 只。见规定。',
  'Not to scale.': '比例不对。',
  'WAI’s paint was the first crooked thing ever to touch the Red Pen.': 'WAI 的颜料，是第一样碰到红笔的歪东西。',
  'It drew a wobbly line, checked its rubric, and found no box to mark it wrong.': '它画了一条歪歪的线，翻遍评分标准，也找不到一格能扣它的分。',
  'Every red X turned into something: a kite (with a ruler for a spar), a star, a bird.': '每个红叉都变成了别的：会飞的（骨架是把尺子），会发光的，会唱歌的。',

  // ── END ──
  'The next morning, the children came back to their drawing.': '第二天早上，孩子们回到了他们的画前。',
  'The crossed-out drawings went back up on the wall.': '被打叉的画，全都挂回了墙上。',
  'And WAI? WAI is still asking why.': 'WAI 呢？WAI 还在问“为什么”。',

  // ── the letter (written for a child; both languages native, not translated: docs/story/NOTES.md) ──
  'Dear player,': '亲爱的小朋友：',
  'Thank you for drawing this city with me.': '谢谢你陪我把这座城画完。',
  'When I was small, I drew a house with legs. It got a red X: houses do not have legs. The next day I drew it again.':
    '我小时候画过一座长腿的房子，被打了一个红叉：房子哪有腿。第二天，我又画了一遍。',
  'Machines can make almost anything now. You ask them, and they build it. So the rare thing is not clever hands any more. The rare thing is the house with legs: the idea nobody else has, because it is yours.':
    '现在的机器很会做东西，你说一句，它就做出来。所以最稀罕的，已经不是一双巧手了。最稀罕的是那座长腿的房子——只有你想得出来，因为它是你的。',
  'A red pen can say “wrong”. It can never say what your idea could have become.':
    '红笔只会说“不对”。它永远说不出：你那个想法，本来能变成什么样。',
  'And when it comes out almost right, do not settle. Draw it again, and again, until it is the thing you saw in your head. Not settling, and your imagination: these are the two strongest things you will carry, wherever you go.':
    '要是做出来只是“差不多”，别将就。再画一遍，再画一遍，直到它就是你心里的那个样子。不将就和创造力，会是你前行路上最大的武器。',
  'So be a little WAI. Keep your crown crooked. Keep asking why. Then go and make the thing you are thinking of. Start today.':
    '所以，歪一点吧。王冠歪着也挺好。多问几个“为什么”。然后，去把你脑子里那个又怪又好玩的东西做出来。今天就开始。',
  'I can’t wait to see what you make,': '期待你的作品，',
  'made by {name}': '{name} 做的',
  'Thank you for playing.': '谢谢你来玩。',
};
