import type { CoopPartner } from './Coop';
import type { Face, OrderTag } from './prompt';
import { trimReply } from './prompt';
import { hasPlayerKey } from './KeyStore';
import { getLang, onLangChange, t } from '../i18n';

/**
 * No key (or the model is unreachable): she still answers — from a small in-character set,
 * picked by what the line is about and by what her journal says just happened.
 * English source strings; Chinese in src/i18n/zh.ts.
 */
export function cannedReply(p: CoopPartner, q: string, why: 'nokey' | 'failed' = 'nokey'): { text: string; face: Face } {
  const s = q.toLowerCase();
  const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
  const has = (re: RegExp) => re.test(s);
  const m = p.mood;
  if (why === 'failed') return { text: t(pick(['The signal is bad… and the rice has not arrived either.', 'Hm? My bowl echoed. Say that again later.'])), face: 'hide' };
  if (has(/喷|spray|为什么|为啥|why|打我|泼/)) {
    const w = m.lastPoke;
    if (w && p.time - w.at < 180) {
      if (w.why === 'miss') return { text: t('You sprayed me because I missed just before, right? …Fair.'), face: 'caught' };
      if (w.why === 'doze') return { text: t('You sprayed me to wake me up. I was thinking, though.'), face: 'caught' };
      if (w.why === 'nag') return { text: t('You sprayed me because I kept asking for rice. Still want rice.'), face: 'angry' };
      return { text: t('You sprayed me for no reason I can find. I am keeping count.'), face: 'angry' };
    }
    return { text: t('Why? I ask myself that every time there is no rice.'), face: 'idle' };
  }
  if (has(/肥|胖|fat|chubby/)) return { text: t("Who's fat? The bowl makes my face look round."), face: 'angry' };
  if (has(/饭|米|吃|饿|rice|eat|hungry|food/)) return m.rice > 0 ? { text: t('{n} grains so far. Not enough. Keep picking up paint drops.', { n: m.rice }), face: 'rice' } : { text: t("Where's the rice? Didn't you say there was rice?"), face: 'angry' };
  if (has(/睡|摸鱼|偷懒|懒|sleep|slack|lazy|nap/)) return { text: t('I was thinking just now… really.'), face: 'caught' };
  if (has(/去哪|哪里|哪儿|怎么|干嘛|干什么|下一步|目标|where|what now|next|how|objective|what do/)) {
    const o = p.s.objective();
    return { text: t('Oh whale-whale. The job right now: {obj}.', { obj: o.title }), face: 'portrait' };
  }
  if (has(/刚才|发生|怎么了|what happened|just now/)) {
    const n = p.journal.counts;
    return { text: t('So far: {g} guardians awake, {r} rice, you got hit {h} times. I was counting.', { g: p.s.woken.size, r: m.rice, h: n['WAI hit'] ?? 0 }), face: 'portrait' };
  }
  if (has(/你好|嗨|在吗|哈喽|hello|hi\b|hey/)) return { text: t('Oh whale-whale, heard you.'), face: 'portrait' };
  if (has(/谢|thank|厉害|棒|good job|nice|爱你|love/)) return { text: t('Praise is nice. Rice is nicer.'), face: 'rice' };
  return {
    text: t(pick(['Oh whale-whale… that question costs extra rice.', 'I am thinking. Really thinking.', 'Hm? The wind is loud and my bowl echoes.', 'Ask me again after lunch.'])),
    face: pick<Face>(['idle', 'portrait', 'caught']),
  };
}

/**
 * No key: the common orders, spotted by keyword (Chinese + English). Returns null when the line is
 * just talk. With a key the model reads the line itself and answers with an order tag instead.
 */
export function parseOrder(q: string): OrderTag | null {
  const s = q.toLowerCase();
  const has = (re: RegExp) => re.test(s);
  if (has(/别睡|醒醒|醒一醒|起床|起来|wake/)) return { mode: 'wake' };
  if (has(/自己玩|自己去玩|你自己|自由|随便你|随你|想干嘛|play by yourself|on your own|by yourself|do what you want|do your own|free roam|go play/)) return { mode: 'free' };
  if (has(/跟紧|贴着|挨着|靠近我|别走远|别乱跑|stay close|stick close|close to me|next to me/)) return { mode: 'close' };
  if (has(/停|等我|等一下|等等|等着|别动|站住|站着|待在|原地|别跟|stay|wait|stop|hold on|don'?t move/)) return { mode: 'stay' };
  if (has(/跟我|跟着|跟上|过来|来这|回来|走吧|走了|follow|come here|come back|come on|with me|let'?s go/)) return { mode: 'follow' };
  if (has(/捡|收集|拾|找饭|拿饭|搜|collect|pick up|gather|fetch|grab/)) return { mode: 'collect' };
  const go = /(?:去|到)\s*([^\s，。,.!！?？]{1,8})|go to (?:the )?([a-z\- ]{2,20})/.exec(s);
  if (go && !has(/去打|去揍|去攻击|去喷(?!泉)/)) return { mode: 'goto', arg: (go[1] ?? go[2] ?? '').replace(/那边|那里|那儿|旁边|边上|去|吧|呀|啊$/g, '').trim() };
  if (has(/打|攻击|揍|喷它|喷他|干掉|干它|上啊|上！|attack|fight|hit it|get it|paint it/) && !has(/别打|不要打|打招呼|don'?t attack/)) return { mode: 'attack' };
  return null;
}

/** Her answer to an order when there is no model to phrase it (English keys → zh.ts). */
const ACK: Record<string, { lines: string[]; face: Face }> = {
  follow: { lines: ['Oh whale-whale, coming, coming.', 'Fine. Walk slowly, my tail is heavy.'], face: 'portrait' },
  close: { lines: ["Right beside you. Don't step on my tail."], face: 'portrait' },
  stay: { lines: ['Oh whale-whale. Standing still is my best skill.', 'Waiting here. Bring rice when you come back.'], face: 'idle' },
  collect: { lines: ['Fetch rice? THAT I will do.', 'Oh whale-whale! Rice run!'], face: 'rice' },
  attack: { lines: ['Fine… paddle time.', 'Oh whale-whale, I will go bonk it.'], face: 'angry' },
  free: { lines: ['Play by myself? I will look for rice first.', 'Oh whale-whale. Doing my own thing, then.'], face: 'rice' },
  goto: { lines: ['Oh whale-whale, going there.'], face: 'portrait' },
  wake: { lines: ["I wasn't asleep! …I'm up, I'm up."], face: 'caught' },
  nowhere: { lines: ["Go where? I don't know that place."], face: 'caught' },
};
export function orderAck(key: string): { text: string; face: Face } {
  const a = ACK[key] ?? ACK.follow;
  return { text: t(a.lines[Math.floor(Math.random() * a.lines.length)]), face: a.face };
}

/**
 * The chat bar: Enter during play opens a sticker-style input at the bottom of the screen,
 * Enter sends, Esc closes. While it is open the game gets none of the keystrokes (they stop at
 * the input), held keys are released, and the mouse cursor is freed the same way holding Alt
 * frees it (InputManager.cursorFree), so losing the pointer lock does not pause the game.
 * Her answer appears in her speech bubble: streamed from DeepSeek with the player's key,
 * otherwise a canned in-character line (and the bar says a key unlocks real chat).
 */
export class ChatBar {
  private el: HTMLDivElement;
  private input: HTMLInputElement;
  private hint: HTMLElement;
  private label: HTMLElement;
  open = false;
  /** a question is being answered */
  busy = false;
  private hadLock = false;
  private seq = 0;
  private offLang: () => void;

  constructor(private partner: () => CoopPartner | null) {
    const root = document.getElementById('ui-root') ?? document.body;
    this.el = document.createElement('div');
    this.el.className = 'coop-chat hidden';
    this.el.innerHTML = `<div class="coop-chat-bar"><b class="coop-chat-to"></b><input class="coop-chat-in" type="text" maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"><kbd>Enter</kbd><kbd>Esc</kbd></div><div class="coop-chat-hint"></div>`;
    this.input = this.el.querySelector('input')!;
    this.hint = this.el.querySelector('.coop-chat-hint')!;
    this.label = this.el.querySelector('.coop-chat-to')!;
    root.appendChild(this.el);
    // the game listens on window: nothing typed here may get that far
    for (const ev of ['keydown', 'keyup', 'keypress'] as const)
      this.input.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev !== 'keydown' || e.isComposing) return; // IME: Enter confirms the composition, not the message
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          const q = this.input.value.trim();
          this.close(true);
          if (q) void this.send(q);
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.close(true);
        }
      });
    for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown'] as const) this.el.addEventListener(ev, (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => {
      // clicked back into the game: the bar goes away (the click itself re-captures the mouse)
      if (this.open) setTimeout(() => this.open && document.activeElement !== this.input && this.close(false), 0);
    });
    // capture phase: this runs before the game's own window listeners
    window.addEventListener('keydown', this.onKey, true);
    this.offLang = onLangChange(() => this.refresh());
  }

  /** Enter may open the bar: playing (not paused, no cards, no cutscene), partner around, nothing else focused. */
  private canOpen(): boolean {
    const p = this.partner();
    if (!p || this.open) return false;
    const s = p.s;
    const a = document.activeElement;
    if (a && a !== document.body && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName)) return false;
    // lockable / freeLook: main sets one of them exactly while the game is live (playing, not paused)
    const live = s.ctx.input.lockable || s.ctx.input.freeLook;
    return live && !s.frozen && !s.completed && !s.story.locked && !s.ctx.camera.inCine;
  }

  private onKey = (e: KeyboardEvent): void => {
    if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.canOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.show();
  };

  private refresh(): void {
    const p = this.partner();
    this.label.textContent = p ? `→ ${p.name}` : '';
    this.input.placeholder = t('Say something to her…');
    const real = !!p && p.llm.canChat && p.brainPref === 'auto';
    this.hint.textContent = real ? '' : hasPlayerKey() ? (p?.llm.keyError ? t('Your key is not working ({err}): canned answers for now.', { err: t(p.llm.keyError) }) : t('Her DeepSeek brain is offline: canned answers for now.')) : t('No key: canned answers. Pause → AI Partner → Key adds a DeepSeek key for real chat.');
    this.el.classList.toggle('canned', !real);
    this.el.lang = getLang();
  }

  show(): void {
    const p = this.partner();
    if (!p || this.open) return;
    this.open = true;
    const input = p.s.ctx.input;
    this.hadLock = input.pointerLocked;
    // free the cursor like Alt does (so the lost lock is not read as "pause"), drop held keys
    input.cursorFree = true;
    input.releaseLock();
    input.reset();
    this.refresh();
    this.input.value = '';
    this.el.classList.remove('hidden');
    this.input.focus({ preventScroll: true });
  }

  /** Hide the bar; `relock` = hand the mouse back to the game (a key press is a valid gesture for it). */
  close(relock: boolean): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.input.blur();
    const p = this.partner();
    const input = p?.s.ctx.input;
    if (!input) return;
    input.reset();
    if (relock && this.hadLock && input.lockable) input.requestLock();
    // stays "free" until the lock is really back, otherwise the game would pause on the way
    if (!this.hadLock || !relock) input.cursorFree = false;
    else {
      const done = () => {
        document.removeEventListener('pointerlockchange', done);
        document.removeEventListener('pointerlockerror', done);
        clearTimeout(timer);
        if (document.pointerLockElement) input.cursorFree = false;
      };
      const timer = setTimeout(done, 1500);
      document.addEventListener('pointerlockchange', done);
      document.addEventListener('pointerlockerror', done);
    }
  }

  /** Ask her something (also used by WD_COOP.chat for harnesses). Resolves with what she answered. */
  async send(question: string): Promise<{ text: string; face: Face; llm: boolean; ms: number; standing: string } | null> {
    const p = this.partner();
    const q = question.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!p || !q) return null;
    const my = ++this.seq;
    this.busy = true;
    const t0 = performance.now();
    p.heard(q);
    let out: { text: string; face: Face; llm: boolean };
    const real = p.brainPref === 'auto' ? await p.llm.chat(q) : null;
    if (my !== this.seq || this.partner() !== p) return null; // a newer question / she is gone
    if (real) {
      // (an order tag in her answer was already carried out while it streamed: LlmBrain.onOrder → setStance)
      out = { text: real.text, face: real.face ?? 'portrait', llm: true };
      p.bubble.finish();
    } else if (parseOrder(q)) {
      // no model: the keyword parser turns the line into a standing order, she acknowledges in character
      const o = parseOrder(q)!;
      const res = p.setStance(o, 'player');
      const a = orderAck(res.startsWith('no place') ? 'nowhere' : o.mode);
      out = { ...a, llm: false };
      p.say(out.text, false, out.face);
    } else {
      const c = cannedReply(p, q, p.llm.canChat || (hasPlayerKey() && p.brainPref === 'auto' && p.llm.lastError && p.llm.via === 'key') ? 'failed' : 'nokey');
      out = { text: trimReply(c.text).text, face: c.face, llm: false };
      p.say(out.text, false, out.face);
    }
    p.answered(q, out.text, out.face, out.llm);
    this.busy = false;
    return { ...out, ms: Math.round(performance.now() - t0), standing: p.standing.mode };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.offLang();
    this.el.remove();
  }
}
