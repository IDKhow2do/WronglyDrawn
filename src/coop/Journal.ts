/**
 * Her memory of the run — what the LLM (and the canned chat) knows beyond "right now".
 *
 *   events   short timestamped facts in the first person ("2:14 WAI sprayed me (3 s after I missed the lamp)")
 *   log      the same facts + the chat turns as chat-completions messages, APPEND-ONLY
 *
 * DeepSeek caches prompts by exact PREFIX, so every request is
 *   [static system prompt] + log + [small volatile tail: the current state / the new question]
 * and `log` only ever grows at its end (new messages, or more lines added to its last user
 * message). The one exception is compact(): about every 40 events the older part is folded into a
 * summary — one cache miss, then the prefix is stable again.
 *
 * Lives at app level (CoopApp), so it survives level changes inside a run; reset() starts a new run.
 */
export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface JournalEvent {
  /** run time, s */
  t: number;
  text: string;
  /** a milestone: survives compaction verbatim */
  key?: boolean;
  /** something she did that WAI might be annoyed about (looked up when he sprays her) */
  blame?: 'miss' | 'doze' | 'nag' | 'lost' | 'down' | 'cheeky';
}

export const COMPACT_EVERY = 40;
const KEEP_RECENT = 12;
const KEEP_MILESTONES = 14;
const KEEP_CHAT = 4;

const stamp = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class Journal {
  /** run clock (s): advanced by the partner every step, continues across levels */
  now = 0;
  runId = 1;
  /** everything since the last compaction (older facts live on in `summary`) */
  events: JournalEvent[] = [];
  summary = '';
  log: ChatMsg[] = [];
  /** chat turns of this run (newest last) */
  chat: { t: number; q: string; a: string; llm: boolean }[] = [];
  compactions = 0;
  totalEvents = 0;
  /** counters that survive compaction */
  readonly counts: Record<string, number> = {};
  private pending: string[] = [];
  private sinceCompact = 0;
  private lastText = '';
  private lastAt = -99;
  /** bumped whenever the log's existing bytes were rewritten (compaction / reset) */
  prefixEpoch = 0;

  reset(): void {
    this.runId++;
    this.now = 0;
    this.events = [];
    this.summary = '';
    this.log = [];
    this.chat = [];
    this.pending = [];
    this.sinceCompact = 0;
    this.totalEvents = 0;
    this.lastText = '';
    this.lastAt = -99;
    for (const k of Object.keys(this.counts)) delete this.counts[k];
    this.prefixEpoch++;
  }

  count(what: string, n = 1): number {
    return (this.counts[what] = (this.counts[what] ?? 0) + n);
  }

  /** Remember a fact. Exact repeats within 5 s are dropped. */
  note(text: string, opts: { key?: boolean; blame?: JournalEvent['blame'] } = {}): void {
    if (text === this.lastText && this.now - this.lastAt < 5) return;
    this.lastText = text;
    this.lastAt = this.now;
    this.events.push({ t: this.now, text, ...opts });
    this.pending.push(`${stamp(this.now)} ${text}`);
    this.totalEvents++;
    this.sinceCompact++;
  }

  /** The most recent thing she did that could explain WAI being cross (within `within` s). */
  lastBlame(within = 25): JournalEvent | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (this.now - e.t > within) break;
      if (e.blame) return e;
    }
    return null;
  }

  recent(n = 6): string[] {
    return this.events.slice(-n).map((e) => `${stamp(e.t)} ${e.text}`);
  }

  private addUser(text: string): void {
    const last = this.log[this.log.length - 1];
    // roles alternate: more user text extends the last user message (its existing bytes stay as they are)
    if (last && last.role === 'user') last.content += `\n${text}`;
    else this.log.push({ role: 'user', content: text });
  }

  /** Move the not-yet-sent facts into the log (called right before a request is assembled / a turn is stored). */
  seal(): void {
    if (this.sinceCompact >= COMPACT_EVERY) this.compact();
    if (!this.pending.length) return;
    this.addUser(`[journal]\n${this.pending.join('\n')}`);
    this.pending = [];
  }

  /** A finished chat turn (LLM or canned): part of the history from now on. */
  addChat(q: string, a: string, llm: boolean): void {
    this.chat.push({ t: this.now, q, a, llm });
    if (this.chat.length > 30) this.chat.shift();
    this.seal();
    this.addUser(`WAI says: ${q}`);
    this.log.push({ role: 'assistant', content: a });
  }

  /** Something she said on her own (LLM remark): history too. */
  addRemark(a: string): void {
    this.seal();
    if (this.log[this.log.length - 1]?.role !== 'user') this.addUser('(a little later)');
    this.log.push({ role: 'assistant', content: a });
  }

  /**
   * Request messages after the system prompt: the log, then the volatile tail LAST (merged into
   * the last user message when the log ends with one, so roles keep alternating).
   */
  messages(tail: string): ChatMsg[] {
    this.seal();
    const out = this.log.slice();
    const last = out[out.length - 1];
    if (last && last.role === 'user') out[out.length - 1] = { role: 'user', content: `${last.content}\n${tail}` };
    else out.push({ role: 'user', content: tail });
    return out;
  }

  /** Fold everything but the most recent facts into a summary (rare: rewrites the cached prefix once). */
  compact(): void {
    const old = this.events.slice(0, Math.max(0, this.events.length - KEEP_RECENT));
    const recent = this.events.slice(-KEEP_RECENT);
    const milestones = old.filter((e) => e.key).map((e) => `${stamp(e.t)} ${e.text}`);
    // milestones already in the previous summary stay (oldest dropped first)
    const prev = this.summary ? this.summary.split('\n').filter((l) => /^\d+:\d\d /.test(l)) : [];
    const kept = [...prev, ...milestones].slice(-KEEP_MILESTONES);
    const c = this.counts;
    const tally = Object.keys(c)
      .sort()
      .map((k) => `${k} ${c[k]}`)
      .join(', ');
    this.summary = [`(earlier in this run, up to ${stamp(recent[0]?.t ?? this.now)}; totals so far: ${tally || 'nothing yet'})`, ...kept].join('\n');
    this.events = recent;
    this.pending = [];
    this.sinceCompact = 0;
    this.compactions++;
    this.prefixEpoch++;
    const lines = [`[summary]\n${this.summary}`, `[journal]\n${recent.map((e) => `${stamp(e.t)} ${e.text}`).join('\n')}`];
    const talk = this.chat.slice(-KEEP_CHAT);
    if (talk.length) lines.push(`[earlier chat]\n${talk.map((x) => `${stamp(x.t)} WAI: ${x.q}\n${stamp(x.t)} me: ${x.a}`).join('\n')}`);
    this.log = [{ role: 'user', content: lines.join('\n') }];
  }

  /** For WD_COOP.status(). */
  info(): Record<string, unknown> {
    return { runId: this.runId, events: this.totalEvents, kept: this.events.length, logMessages: this.log.length, logChars: this.log.reduce((n, m) => n + m.content.length, 0), chatTurns: this.chat.length, compactions: this.compactions, recent: this.recent(5) };
  }
}
