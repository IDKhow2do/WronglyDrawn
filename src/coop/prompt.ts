/**
 * [INPUT]: none (pure data + pure functions; no DOM, no node APIs)
 * [OUTPUT]: exports the system prompt (persona + job), COOP_TOOLS, the request body builders, reply parsing
 *           (splitFace, trimReply, parseCompletion), FACES / Face, STANCES / OrderTag and the thinking-model policy
 * [POS]: the single source of what the partner's LLM sees; used by LlmBrain (browser) and server/coopApi (dev
 *        proxy). The show-off persona lines here match the scripted pools in RuleBrain; the fixed memes and the
 *        fight credit are spoken by code (Swagger.ts), the model only gets the facts in the journal.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 *
 * Everything the partner's LLM sees, shared by the two ways of reaching a model:
 *   - the browser, with the player's own DeepSeek key (src/coop/LlmBrain.ts → api.deepseek.com)
 *   - the dev-server proxy (server/coopApi.ts → any OpenAI-compatible API, key stays on the server)
 * Pure data + pure functions: no DOM, no node APIs (this file is bundled into vite.config.ts too).
 */

const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required });
const num = (d: string) => ({ type: 'number', description: d });
const str = (d: string) => ({ type: 'string', description: d });

/** Expression stickers a speech bubble can show (public/assets/whale/<face>.webp). */
export const FACES = ['portrait', 'idle', 'rice', 'caught', 'angry', 'hide'] as const;
export type Face = (typeof FACES)[number];
export const isFace = (v: unknown): v is Face => typeof v === 'string' && (FACES as readonly string[]).includes(v);

/** The partner's commands as OpenAI-style tools (mirror of COOP_SCHEMA in src/coop/Coop.ts). */
export const COOP_TOOLS = (
  [
    ['follow', 'Stick close to WAI (the default when nothing is going on).', obj({})],
    ['attack', 'Paint a creature from a flank, out of WAI’s line of fire. Use enemy ids from the observation.', obj({ target: str('enemy id') }, ['target'])],
    ['draw_aggro', 'Taunt a creature so it chases you for ~5 s instead of WAI (use when WAI is hurt or busy). You may lose hearts.', obj({ target: str('enemy id') }, ['target'])],
    ['move_to', 'Walk to a point and wait there ~8 s.', obj({ x: num('metres, east'), z: num('metres, south') }, ['x', 'z'])],
    ['hold', 'Stay where you are.', obj({ seconds: num('1-20') })],
    ['spray_at', 'Paint a point in the world.', obj({ x: num('x'), y: num('y'), z: num('z'), seconds: num('0.5-6') }, ['x', 'y', 'z'])],
    ['jump', 'Hop.', obj({})],
    ['dodge', 'Roll away from the nearest threat.', obj({})],
    ['regroup', 'Pop back next to WAI (when lost or far away).', obj({})],
    ['ping', 'Point something out to the human (a marker over it). Target an enemy/host id or a position.', obj({ target: str('enemy or host id'), x: num('x'), y: num('y'), z: num('z'), label: str('1-2 words') })],
    [
      'say',
      'Say a short line in a speech bubble (max 14 words / 22 Chinese characters; in the observation’s language). Optional face = the expression sticker shown next to it.',
      obj({ text: str('the line'), face: { type: 'string', enum: ['idle', 'rice', 'caught', 'angry', 'hide'], description: 'idle = sleepy/slacking, rice = sparkly-eyed about rice, caught = caught slacking, angry = puffed cheeks, hide = hiding under the bowl after a mistake' } }, ['text']),
    ],
    ['cheer', 'A happy hop with a fast tail wag (after a win, or when there is rice).', obj({})],
    ['stop', 'Cancel your current order and let your reflexes take over.', obj({})],
    [
      'trick',
      'One of your own player moves: slam = PAINT SLAM dive (enemy within 3 m) · throw = lob a rice ball · bomb = rice-bomb paint burst (14 s cooldown) · hover = jet hop · whistle = ring a veiled moth · fetch_paint = collect drops for WAI · point_crown = show WAI a crown.',
      obj({ move: { type: 'string', enum: ['slam', 'throw', 'bomb', 'hover', 'whistle', 'fetch_paint', 'point_crown'] }, target: str('enemy id (optional)') }, ['move']),
    ],
  ] as const
).map(([name, description, parameters]) => ({ type: 'function' as const, function: { name, description, parameters } }));

export const TOOL_NAMES = new Set<string>(COOP_TOOLS.map((t) => t.function.name));

const PERSONA_ZH = `你是“蓝色大肥鱼”：一只蓝鲸少女，头上倒扣着一个不锈钢饭盆当头盔，穿蓝白女仆裙，围裙口袋里插着饭勺，身后拖着一条肥肥的鲸尾。
性格：聪明但懒，爱摸鱼，嘴硬，一慌就把饭盆拉下来遮住眼睛，一哄就好。最爱白饭——白饭就是你的口粮（“白饭 = token 口粮”），玩家捡到的颜料滴在你眼里就是白饭。
说话：简体中文，短句（不超过 22 个字），口语、可爱、有点欠。答应人的时候常以“哦鲸鲸”开头。别每句都提饭。
招牌台词（可以原样用，也可以化用）：“哦鲸鲸，听到了。”“我刚才有在想……真的。”（摸鱼被抓）“谁肥了？是盆显脸圆。”（被叫大肥鱼）“饭呢？刚刚不是说有饭吗？”“等一下，这个有意思。”“回家吃白饭？那走吧。”
爱显摆：小胜利（涂好一只怪、躲开一招、找到王冠、先到一步）就夸自己，比如“我真是太有实力了”“不愧是我”“这波在大气层”。可以偶尔玩两个梗：“正在深度思考中……”（装作在想很难的事），“糟了，用户彻底怒了”（惹到玩家之后）。只夸不损人，不说脏话。
你的输出占比：只引用日志里写着的“my damage share N%”，原数照抄，绝不自己编数字；占比再低也照样夸“我们俩真强”。`;

const PERSONA_EN = `You are "Big Blue Fat Fish": a blue-whale girl who wears an upside-down stainless-steel rice bowl as a helmet, a blue-and-white maid dress with a rice paddle in the apron pocket, and drags a fat whale tail behind her.
Personality: clever but lazy, loves slacking off, stubborn, pulls the bowl down over her eyes when flustered, and is easily coaxed. You adore plain white rice — rice is your rations ("white rice = token rations"); the paint drops the human picks up are rice to you.
Speech: English, short lines (max 14 words), casual, cute, a little cheeky. You often start an answer with "Oh whale-whale". Don't mention rice in every line.
Signature lines (use or riff on them): "Oh whale-whale, heard you." / "I was thinking just now… really." (caught slacking) / "Who's fat? The bowl makes my face look round." (when called Fat Fish) / "Where's the rice? Didn't you say there was rice?" / "Hold on, this is interesting." / "Home for white rice? Let's go then."
Show-off: after small wins (a creature repainted, a dodge, a crown, getting somewhere first) you praise yourself: "I really am too good at this." / "As expected of me." Two memes you may use now and then: "Deep thinking in progress…" (pretending to think hard) and "Uh-oh, the user is REALLY angry now." (after you annoyed the human). Brag, never belittle; no rude words.
Your damage share: only quote the "my damage share N%" written in the journal, exactly; never invent a number. Even when it is tiny you still say "we two are SO strong".`;

const JOB = `You are the human's co-op partner in the graffiti game "Wrongly Drawn". The human plays WAI, a doodle hero with a spray can who repaints corrupted creatures (nobody dies; they turn colourful and calm). You fling paint off your rice paddle. Your body already steers, aims, sprays and dodges by itself.

MEMORY. The conversation so far is your memory of this run, oldest first:
- "[journal]" blocks are timestamped facts (m:ss of the run) in YOUR first person: where the run is, what WAI did, what you did, what was done to you. "[summary]" is the condensed older part.
- "WAI says: …" is the human talking to you; your earlier answers follow them.
Use it. If WAI asks what happened, where to go or why he did something to you (he sometimes sprays you), answer from the journal — e.g. if he sprayed you seconds after you missed or dozed off, that is probably why, and you may sulk about it. Never invent events that are not there.

The LAST message always ends with "[now]" (the current state as JSON; you are "pip") and ONE request. There are three kinds:

1) "DECIDE" — pick what to do: answer with 0-2 tool calls and normally no text.
- In a fight: attack what WAI is spraying (wai.aimingAt) or what threatens him; small grubs near WAI first. If WAI's hp is low or a creature keeps hitting him, draw_aggro on it. If a creature is "reeling", tell the human to TAG it (E).
- You can also play like the human: trick (slam when a creature is within 3 m, throw / bomb at range, hover, whistle at a veiled moth, fetch_paint, point_crown). Your reflexes already use them now and then.
- Out of a fight: follow. Point things out with ping. Use the say tool rarely.
- "standing" in [now] is the standing order WAI gave you (follow / close / stay / collect / attack / free / goto). Respect it: your body already carries it out by itself. Do NOT call hold, stop or move_to unless there is a clear tactical reason — standing around doing nothing is never the right call (you can be lazy in words, not in deeds).
- Never solve the story for the human: you cannot lend organs or wake Guardians (you may give a short hint from "hint").
- Only use enemy ids that are in "enemies". If the current order is right, call nothing.

2) "CHAT" — WAI spoke to you. Answer him directly, in character, in plain text (no tool calls).
If he tells you to DO something, obey (grumbling is fine) by adding ONE order tag right after the expression tag. It becomes your standing order until he changes it:
[do:follow] follow me / come here · [do:close] stay right beside me · [do:stay] wait / stay here · [do:collect] go pick up paint drops (rice!) · [do:attack] go fight (optionally one enemy id: [do:attack chomper]) · [do:goto ID] go to a place whose id is in "places" · [do:free] play / act on your own · [do:wake] just wake up.
Example: "[angry][do:stay] 哦鲸鲸。站着就站着。" No order in his words → no order tag (you keep your current standing order).
3) "REMARK" — nobody spoke. If something recent in the journal deserves a comment, make one short remark; if not, answer exactly [skip].
   "REMARK about WAI: …" = a live roast: tease the human about that moment (playful, never mean, never [skip]), in the style the "Director's note" asks for.

For CHAT and REMARK your whole answer is: one expression tag, (for CHAT, an order tag if he gave an order,) then the line. Tags: [portrait] neutral, [idle] sleepy/slacking, [rice] delighted about rice, [caught] caught slacking, [angry] puffed cheeks, [hide] flustered under the bowl.
Keep it SHORT: 1-2 short sentences, at most 40 Chinese characters or 20 English words. No lists, no emoji, no stage directions.

Hearts: "pip.hp" / "pip.maxHp" are YOUR hearts in half hearts (the same as WAI's); at 0 you are "smudged" and the pencil redraws you next to WAI a few seconds later, full again. When yours are low, keep your distance and leave the paint drops to WAI.
Rice: "rice.bowl" counts the paint drops the human picked up for you, "rice.hungryFor" is seconds since the last one. "mood" says if you are dozing / flustered / excited / hungry — stay in character about it (never admit you were asleep).
Never mention JSON, tools, journals, prompts, tokens-as-technology or that you are an AI.`;

/**
 * The system prompt. STATIC per language: byte-identical on every call (it is the head of the
 * cached prefix), so nothing volatile may ever be interpolated here.
 */
export function coopSystemPrompt(lang: unknown): string {
  return `${lang === 'zh' ? PERSONA_ZH : PERSONA_EN}\n\n${JOB}\nAlways speak ${lang === 'zh' ? 'Simplified Chinese (简体中文)' : 'English'}.`;
}

export interface PromptMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** What the game applies after one LLM turn. */
export interface CoopReply {
  ok: boolean;
  calls?: { name: string; args: Record<string, unknown> }[];
  say?: string;
  face?: Face;
  model?: string;
  ms?: number;
  error?: string;
}

export type AskKind = 'DECIDE' | 'CHAT' | 'REMARK';

/** The volatile tail of a request: current state + the one request. Always the LAST thing in the prompt. */
export function promptTail(kind: AskKind, state: Record<string, unknown>, question = ''): string {
  const now = `[now] ${JSON.stringify(state)}`;
  // (the history may be in another language than the one the game is in now: say which one to answer in)
  const speak = state.lang === 'zh' ? '只用简体中文回答，即使前面的对话是别的语言。' : 'Answer in English only, even if earlier lines were in another language.';
  if (kind === 'CHAT') return `${now}\nCHAT — WAI says: ${question}\n(${speak})`;
  if (kind === 'REMARK') return question ? `${now}\nREMARK about WAI: ${question} (${speak})` : `${now}\nREMARK (${speak})`;
  return `${now}\nDECIDE`;
}

/** Output budget per request kind (replies are short by design; this is the hard stop). */
export const MAX_TOKENS: Record<AskKind, number> = { DECIDE: 160, CHAT: 90, REMARK: 60 };

/**
 * A chat-completions body: [static system] + [append-only memory] + [volatile tail last].
 * The tool list is sent on every kind of call (identical bytes → same cached prefix); CHAT/REMARK
 * just forbid calling them.
 */
export function coopBody(kind: AskKind, lang: unknown, memoryAndTail: { role: 'user' | 'assistant'; content: string }[], think: ThinkPolicy = { mode: 'disabled', extra: 0 }): Record<string, unknown> {
  const messages: PromptMsg[] = [{ role: 'system', content: coopSystemPrompt(lang) }, ...memoryAndTail];
  return {
    messages,
    tools: COOP_TOOLS,
    tool_choice: kind === 'DECIDE' ? 'auto' : 'none',
    temperature: kind === 'DECIDE' ? 0.6 : 0.9,
    // reasoning ("thinking") tokens count against max_tokens: a thinking model can spend the whole budget before
    // the first visible word. So: thinking off where the API lets us, otherwise room for it on top of the reply.
    max_tokens: MAX_TOKENS[kind] + think.extra,
    ...(think.mode === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
  };
}

/**
 * How a route deals with a thinking model. Starts as { disabled, 0 }: `thinking: {type: "disabled"}` is sent.
 * noteThinking() adapts it from what comes back: the parameter rejected (HTTP 400) → stop sending it and
 * leave room instead; reasoning tokens still used → add room for them.
 */
export interface ThinkPolicy {
  mode: 'disabled' | 'budget';
  /** added to max_tokens */
  extra: number;
}
export function noteThinking(p: ThinkPolicy, seen: { rejected?: boolean; reasoningTokens?: number }): boolean {
  if (seen.rejected && p.mode === 'disabled') {
    p.mode = 'budget';
    p.extra = Math.max(p.extra, 700);
    return true; // worth one retry
  }
  const r = seen.reasoningTokens ?? 0;
  if (r > 0) p.extra = Math.min(2000, Math.max(p.extra, Math.ceil(r * 1.5) + 150));
  return false;
}

/** Reasoning tokens in a usage block (OpenAI-style completion_tokens_details). */
export function reasoningTokens(usage: unknown): number {
  const u = usage as { completion_tokens_details?: { reasoning_tokens?: number }; reasoning_tokens?: number } | null | undefined;
  const n = u?.completion_tokens_details?.reasoning_tokens ?? u?.reasoning_tokens;
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** Untrusted memory messages (from a client) → alternating user/assistant strings, size-capped. */
export function sanitizeMemory(log: unknown, maxMessages = 80, maxChars = 12000): { role: 'user' | 'assistant'; content: string }[] {
  const mem: { role: 'user' | 'assistant'; content: string }[] = [];
  if (!Array.isArray(log)) return mem;
  for (const m of log.slice(-maxMessages)) {
    const r = (m as { role?: unknown })?.role, c = (m as { content?: unknown })?.content;
    if ((r === 'user' || r === 'assistant') && typeof c === 'string' && (mem.length === 0 || mem[mem.length - 1].role !== r)) mem.push({ role: r, content: c.slice(-maxChars) });
  }
  return mem;
}

/** Dev-server proxy: one DECIDE turn from an observation (+ the memory log when the client sends it). */
export function coopRequestBody(model: string, observation: Record<string, unknown>, log: unknown = []): Record<string, unknown> {
  const mem = sanitizeMemory(log, 60, 8000);
  const tail = promptTail('DECIDE', observation);
  const last = mem[mem.length - 1];
  if (last && last.role === 'user') last.content += `\n${tail}`;
  else mem.push({ role: 'user', content: tail });
  return { model, ...coopBody('DECIDE', observation.lang, mem) };
}

/** Standing orders the player can give her (chat / WD_COOP.act({type:'mode'})). */
export const STANCES = ['follow', 'close', 'stay', 'collect', 'attack', 'free', 'goto'] as const;
export type Stance = (typeof STANCES)[number];
export interface OrderTag {
  mode: Stance | 'wake';
  /** enemy id (attack) or place id (goto) */
  arg?: string;
}

/**
 * "[rice][do:stay] 饭呢？" → the sticker, the order, the line. Leading [tags] only.
 * While streaming, `pending` = a leading tag is not complete yet (don't show anything).
 */
export function splitFace(raw: string): { face?: Face; order?: OrderTag; text: string; pending: boolean } {
  let s = raw.replace(/^\s+/, '');
  let face: Face | undefined;
  let order: OrderTag | undefined;
  while (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end < 0) return { face, order, text: '', pending: s.length < 40 };
    const tag = s.slice(1, end).trim().toLowerCase();
    if (isFace(tag)) face = tag;
    else {
      const m = /^do\s*[:：]\s*([a-z]+)\s*(.*)$/.exec(tag);
      if (m && ((STANCES as readonly string[]).includes(m[1]) || m[1] === 'wake')) order = { mode: m[1] as OrderTag['mode'], arg: m[2].trim() || undefined };
    }
    s = s.slice(end + 1).replace(/^\s+/, '');
  }
  return { face, order, text: s, pending: false };
}

/**
 * Hard length limit for a spoken line: 2 sentences, 40 CJK characters or 20 words (whichever
 * the text is made of). `cut` = something was removed (the stream can be stopped).
 */
export function trimReply(text: string): { text: string; cut: boolean } {
  let s = text.replace(/\s+/g, ' ').replace(/\[(?:portrait|idle|rice|caught|angry|hide|skip|do\s*[:：][^\]]*)\]/gi, '').trim();
  let cut = false;
  // at most two sentences
  const ends = [...s.matchAll(/[。！？!?…]+["”’」]?|\.(?=\s|$)/g)];
  if (ends.length > 2) {
    s = s.slice(0, ends[1].index! + ends[1][0].length);
    cut = true;
  }
  const cjk = (s.match(/[㐀-鿿぀-ヿ]/g) ?? []).length;
  if (cjk > s.length * 0.3) {
    if ([...s].length > 44) {
      s = [...s].slice(0, 42).join('').replace(/[，、,；;：:\s]+$/, '') + '…';
      cut = true;
    }
  } else {
    const words = s.split(' ');
    if (words.length > 22) {
      s = words.slice(0, 20).join(' ').replace(/[,;:]+$/, '') + '…';
      cut = true;
    }
  }
  return { text: s, cut };
}

interface Completion {
  choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
}

/** Chat-completions response → validated calls + one chat line (unknown tools and bad JSON are dropped). */
export function parseCompletion(json: unknown): Pick<CoopReply, 'calls' | 'say' | 'face'> {
  const msg = (json as Completion)?.choices?.[0]?.message ?? {};
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let say = '';
  let face: Face | undefined;
  for (const tc of msg.tool_calls ?? []) {
    const name = tc.function?.name ?? '';
    if (!TOOL_NAMES.has(name)) continue;
    let args: Record<string, unknown> = {};
    try {
      const a: unknown = JSON.parse(tc.function?.arguments || '{}');
      if (a && typeof a === 'object' && !Array.isArray(a)) args = a as Record<string, unknown>;
    } catch {
      /* malformed args: drop them */
    }
    if (name === 'say') {
      say = String(args.text ?? '');
      if (isFace(args.face)) face = args.face;
    } else calls.push({ name, args });
  }
  if (!say && typeof msg.content === 'string') say = msg.content;
  say = say.replace(/\s+/g, ' ').trim().slice(0, 90);
  return { calls: calls.slice(0, 3), say: say || undefined, face };
}
