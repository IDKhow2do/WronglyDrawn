/**
 * [INPUT]: none (plain data)
 * [OUTPUT]: exports ZH_SWAGGER — the Chinese for the co-op partner's show-off lines (brags, fight credit with her
 *           damage share, "the user is REALLY angry now", deep thinking) and her smudge lines (down, redrawn, the
 *           corner view's "smudged!"), keyed by the English source in src/coop/RuleBrain.ts (LINES) and coop/PipView
 * [POS]: spread into ZH (./zh.ts); kept apart so the personality strings live beside their feature (coop/Swagger.ts).
 *        Written as Chinese lines in her voice, not word-for-word translations. {pct} stays as is.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
export const ZH_SWAGGER: Record<string, string> = {
  // small wins
  'I really am too good at this.': '我真是太有实力了。',
  'As expected of me.': '不愧是我。',
  'That move was out of this world.': '这波在大气层。',
  'Talent like this cannot be taught.': '这种天赋，学不来的。',
  'Too easy. Next!': '太简单了，下一个！',
  'Write that down: I am amazing.': '记下来：我超厉害。',
  'Repainted! I really am too good at this.': '涂好了！我真是太有实力了。',
  'Another one! Did you see my paddle work?': '又一个！看到我的饭勺操作了吗？',
  'Masterpiece. You may clap now.': '杰作。现在可以鼓掌了。',
  'Dodged! Too fast for my own eyes.': '躲开了！快到我自己都没看清。',
  'Missed me! Of course it did.': '没打着我！当然打不着。',
  'Saw that coming a mile off.': '早就看穿了。',
  'A crown! I spotted it first. Obviously.': '王冠！我先看到的，显然。',
  'Crown found. All thanks to my sharp eyes.': '找到王冠了，全靠我眼尖。',
  'Shiny! My nose for treasure is too good.': '闪闪的！我这寻宝的本事，太有实力了。',
  'First! I win.': '我第一！我赢了。',
  'Got here first. Naturally.': '我先到的，理所当然。',
  'Too fast? Sorry, it is a gift.': '太快了？不好意思，天生的。',
  // fight credit ({pct} = her real share of the paint)
  'We two are SO strong! (my share: {pct}%)': '我们俩真强！（我的输出：{pct}%）',
  'What a team! I carried. (my share: {pct}%)': '好一个组合！我带飞的。（我的输出：{pct}%）',
  'Team win! Mostly thanks to me. (my share: {pct}%)': '团队胜利！主要靠我。（我的输出：{pct}%）',
  'Us two? Unstoppable. (my share: {pct}%)': '咱俩联手，无人能挡！（我的输出：{pct}%）',
  'I did most of that! (my share: {pct}%)': '大半是我打的！（我的输出：{pct}%）',
  'See that? I carried the whole fight. (my share: {pct}%)': '看到没？全程我带飞。（我的输出：{pct}%）',
  'I really am too good at this. (my share: {pct}%)': '我真是太有实力了。（我的输出：{pct}%）',
  // the memes
  'Uh-oh. The user is REALLY angry now.': '糟了，用户彻底怒了。',
  'Uh-oh. User anger level: maximum.': '糟了，用户怒气值已满。',
  'Alert: the user is fuming. Behaving now.': '警报：用户彻底怒了。我先老实一会儿。',
  'Uh-oh, I think I made the user REALLY angry.': '糟了，好像把用户彻底惹怒了。',
  'Uh-oh. Switching to good-fish mode.': '糟了，用户怒了。切换乖巧模式。',
  'Deep thinking in progress': '正在深度思考中',
  'Done thinking. Conclusion: the floor is down there.': '思考完毕。结论：地板在下面。',
  'Thought it through. The answer is: rice.': '想明白了。答案是：白饭。',
  'Analysis complete: we keep walking.': '分析完毕：我们继续走。',
  'After deep thought: I am right. As always.': '深度思考的结果：我是对的。一如既往。',
  'Thought it through: paint the monster!': '想清楚了：涂那个怪！',
  'Thought it through: there is a crown over there!': '想清楚了：那边有王冠！',
  // her hearts (coop/PipHealth): smudged, then redrawn next to WAI
  'Smudged! Kid, draw me back in. Rounder this time.': '被抹花了！小画家，把我画回来。这次画圆一点。',
  "I wasn't smudged. I was resting my eyes.": '我没被抹花，我是在闭目养神。',
  'smudged!': '被抹花了！',
};
