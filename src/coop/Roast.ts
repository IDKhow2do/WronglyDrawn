import type { CoopPartner } from './Coop';
import { ATTACK_STATES } from './Companion';
import { getLang } from '../i18n';
import type { Face } from './prompt';

/**
 * LIVE ROASTS: now and then — rarely, out of the blue — she makes a short remark about what the PLAYER just did
 * (missed for ages, fell off, took a hit, slipped an ENCORE, stood still forever, a perfect dodge, pressed E at
 * something that would not budge). Never in a cutscene, a boss telegraph, a chat, or over another line.
 *
 * With a model: a REMARK call whose volatile tail names the moment and adds a random DIRECTOR'S NOTE (an angle /
 * mood / constraint), so the same moment does not get the same joke — the cached prefix (system + tools + journal)
 * is untouched. Without one: canned lines per moment, optionally with a tag line, never the same line twice in a row.
 */
export const ROAST = {
  /** at least this long between two roasts (s) */
  gap: 55,
  /** chance that a qualifying moment gets a roast at all */
  chance: 0.45,
  /** stood still this long (s) */
  idleFor: 28,
  /** sprayed this long without landing anything (s) */
  missFor: 3,
};

export type RoastWhat = 'missed' | 'fell' | 'hit' | 'encoreSlip' | 'idle' | 'perfect' | 'wrongDoor';

/** The rotating director's notes (English: they go to the model; the answer is still in the game's language). */
export const DIRECTOR_NOTES = [
  'tease him about food',
  'pretend you planned it all along',
  'answer in one word',
  'compare it to rice',
  'be overly dramatic, like a soap opera',
  'sports-commentator voice',
  'a grudging compliment',
  'blame your bowl',
  'make up a fake statistic',
  'whisper it, like a secret',
  'rate it out of ten',
  'quote a made-up old proverb',
  'act like his strict coach',
  'ask a rhetorical question',
  'mention that you were almost asleep',
  'say it as if writing in your diary',
  'be smug about something YOU did earlier',
  'offer terrible advice',
];

const WHAT_EN: Record<RoastWhat, (d: string) => string> = {
  missed: (d) => `WAI sprayed for ${d} without hitting anything`,
  fell: () => 'WAI fell off / got smudged and respawned',
  hit: (d) => `WAI just took a hit${d}`,
  encoreSlip: () => 'WAI let his ENCORE stamp streak slip (got greedy)',
  idle: (d) => `WAI has been standing still for ${d}`,
  perfect: () => 'WAI pulled off a PERFECT dodge',
  wrongDoor: (d) => `WAI pressed E at something that would not work (${d})`,
};

const CANNED: Record<'en' | 'zh', Record<RoastWhat, string[]>> = {
  en: {
    missed: ['Are you painting the air? Bold.', 'The wall is fine. The monster is over THERE.', 'That was a warning shot. Right?', 'Paint is not free, you know. Neither is rice.', 'You missed so hard the air got prettier.'],
    fell: ['Gravity: 1. You: 0.', 'You found the edge. Congrats.', 'Graceful. Like a dropped rice ball.', 'I would have caught you. Probably not.', 'Want me to draw you a railing?'],
    hit: ['Ooh. That looked like it hurt.', 'You dodge like a sleepy fish.', 'Tip: the pointy end is the bad end.', 'Did you want that hit? You took it so politely.', 'Walk it off. Or lie down. I support both.'],
    encoreSlip: ['Greedy! Should have cashed out.', 'One more stamp, he said. Famous last words.', 'All that stamping for nothing. Like me without rice.', 'The streak slipped. So did your dignity.'],
    idle: ['Are you… asleep? That is MY job.', 'Admiring the view? It is not going anywhere.', 'Standing still is my best skill. Stop copying.', 'If we stay longer I am starting lunch.', 'Hello? Is the controller warm?'],
    perfect: ['Okay, that dodge was cool. Do not tell anyone I said so.', 'Show-off.', 'Perfect dodge! I taught you that. In spirit.', 'Smooth. Smoother than my rice paddle.'],
    wrongDoor: ['It is not opening. Maybe say please?', 'Pressing harder will not help.', 'Wrong door. Right enthusiasm.', 'That is decoration. Very convincing decoration.'],
  },
  zh: {
    missed: ['你在给空气上色？有魄力。', '墙没事。怪在那边！', '这是警告射击，对吧？', '颜料不要钱的吗？白饭也要钱。', '你打得空气都变好看了。'],
    fell: ['重力 1 比 0 赢了你。', '恭喜，你找到了边缘。', '好优雅，像掉地上的饭团。', '我本来能接住你的。大概不能。', '要不要我给你画个栏杆？'],
    hit: ['哎呀，看着就疼。', '你躲得像条没睡醒的鱼。', '提示：尖的那头是坏的那头。', '你是想挨这一下吗？接得好礼貌。', '缓一缓，或者躺一会儿，我都支持。'],
    encoreSlip: ['贪心！早该收手的。', '“再盖一个就好”——著名遗言。', '盖了半天全没了。像我没饭吃。', '连击没了，面子也没了。'],
    idle: ['你……睡着了？那是我的活。', '看风景呢？风景又不会跑。', '站着不动是我的绝活，别学我。', '再不走我就开饭了。', '喂？手柄还热乎吗？'],
    perfect: ['好吧，这下躲得挺帅。别说是我夸的。', '显摆。', '完美闪避！我教的。精神上教的。', '真丝滑，比我的饭勺还滑。'],
    wrongDoor: ['它不开。要不要说声“请”？', '按得再用力也没用。', '门错了，热情是对的。', '那是装饰品。很逼真的装饰品。'],
  },
};
const TAGS: Record<'en' | 'zh', string[]> = {
  en: ['I am writing this down.', 'Rice score: 3/10.', 'For the record.', '…Just saying.'],
  zh: ['我记下来了。', '白饭评分：3 分。', '记录在案。', '……我就说说。'],
};
const FACE: Record<RoastWhat, Face> = { missed: 'caught', fell: 'hide', hit: 'angry', encoreSlip: 'rice', idle: 'idle', perfect: 'rice', wrongDoor: 'caught' };

export class Roaster {
  private lastAt = -999;
  private pending: { what: RoastWhat; detail: string; at: number } | null = null;
  private sprayT = 0;
  private sinceHit = 99;
  private stillT = 0;
  private idleSaid = false;
  private lastResult = '';
  private eDown = false;
  private lastLine = '';
  private noteIdx: number[] = [];
  private unsub: (() => void)[] = [];
  readonly log: { what: RoastWhat; note?: string; text: string; llm: boolean }[] = [];

  constructor(private p: CoopPartner) {
    const ev = p.s.events;
    this.unsub.push(
      ev.on('hit:marker', () => (this.sinceHit = 0)),
      ev.on('player:smudged', () => this.moment('fell', '')),
      ev.on('player:perfect', () => this.moment('perfect', '')),
      ev.on('player:damaged', ({ hp }) => {
        if (hp > 0) this.moment('hit', hp <= 2 ? ' and is low on health' : '');
      }),
    );
  }

  /** A roastable moment happened (it may or may not get a remark). */
  moment(what: RoastWhat, detail: string): void {
    if (Math.random() > ROAST.chance && what !== 'fell') return;
    this.pending = { what, detail, at: this.p.time };
  }

  /** Force one (tests / docs). */
  force(what: RoastWhat, detail = ''): void {
    this.lastAt = -999;
    this.pending = { what, detail, at: this.p.time };
  }

  private danger(): boolean {
    const s = this.p.s;
    return s.enemies.some((e) => !e.disposed && !e.harmless && e.engaged && ATTACK_STATES.has(e.state) && e.pos.distanceTo(s.player.pos) < 16);
  }

  /** A director's note, never one of the last four. */
  note(): string {
    let i = Math.floor(Math.random() * DIRECTOR_NOTES.length);
    for (let k = 0; k < 8 && this.noteIdx.includes(i); k++) i = Math.floor(Math.random() * DIRECTOR_NOTES.length);
    this.noteIdx.push(i);
    if (this.noteIdx.length > 4) this.noteIdx.shift();
    return DIRECTOR_NOTES[i];
  }

  step(dt: number): void {
    const p = this.p;
    const s = p.s;
    const wai = s.player;
    const input = s.ctx.input;
    // watchers for moments that have no event
    this.sinceHit += dt;
    const spraying = input.isDown('Mouse0') && !wai.smudged;
    const foe = s.enemies.some((e) => !e.disposed && !e.harmless && e.pos.distanceTo(wai.pos) < 20);
    if (spraying && foe) {
      this.sprayT += dt;
      if (this.sinceHit < 0.5) this.sprayT = 0;
      if (this.sprayT > ROAST.missFor) {
        this.sprayT = -6;
        this.moment('missed', `${Math.round(ROAST.missFor)} s`);
      }
    } else this.sprayT = Math.max(0, this.sprayT - dt);
    const still = Math.hypot(wai.vel.x, wai.vel.z) < 0.3 && !spraying;
    this.stillT = still ? this.stillT + dt : 0;
    if (!still) this.idleSaid = false;
    if (this.stillT > ROAST.idleFor && !this.idleSaid) {
      this.idleSaid = true;
      this.moment('idle', `${Math.round(this.stillT)} s`);
    }
    const res = s.combat.view?.result ?? '';
    if (res === 'slip' && this.lastResult !== 'slip') this.moment('encoreSlip', '');
    this.lastResult = res;
    const e = input.isDown('KeyE');
    if (e && !this.eDown) {
      const pr = s.prompt();
      if (pr && !pr.enabled) this.moment('wrongDoor', pr.text.slice(0, 40));
    }
    this.eDown = e;
    // deliver (a moment keeps 6 s; then it is old news)
    const pd = this.pending;
    if (!pd) return;
    if (p.time - pd.at > 6) {
      this.pending = null;
      return;
    }
    const cine = s.story.locked || s.ctx.camera.inCine || s.completed || s.frozen;
    if (cine || this.danger() || p.time - this.lastAt < ROAST.gap || p.chatT > 0 || p.llm.talking || p.bubble.busy || p.goofs.active) return;
    this.pending = null;
    this.lastAt = p.time;
    // dozing? she still saw it (one eye open)
    if (p.mood.asleep) p.mood.wakeQuietly();
    void this.deliver(pd.what, pd.detail);
  }

  private async deliver(what: RoastWhat, detail: string): Promise<void> {
    const p = this.p;
    const about = WHAT_EN[what](detail);
    p.event(about, true, { key: false });
    if (p.usingLlm) {
      const note = this.note();
      const r = await p.llm.roast(about, note);
      if (r) {
        this.log.push({ what, note, text: r, llm: true });
        return;
      }
    }
    const L = getLang() === 'zh' ? 'zh' : 'en';
    const pool = CANNED[L][what].filter((x) => x !== this.lastLine);
    let line = pool[Math.floor(Math.random() * pool.length)];
    this.lastLine = line;
    if (Math.random() < 0.3) line += (L === 'zh' ? '' : ' ') + TAGS[L][Math.floor(Math.random() * TAGS[L].length)];
    p.say(line, false, FACE[what]);
    p.journal.addRemark(`[${FACE[what]}] ${line}`);
    this.log.push({ what, text: line, llm: false });
  }

  dispose(): void {
    for (const u of this.unsub) u();
  }
}
