import { DEEPSEEK_MODEL, apiBase, describeStatus, getPlayerKey } from './KeyStore';
import { coopBody, noteThinking, reasoningTokens, type AskKind, type ThinkPolicy } from './prompt';

/** direct route: how this browser deals with a thinking model (the proxy keeps its own, server-side) */
export const thinkPolicy: ThinkPolicy = { mode: 'disabled', extra: 0 };

/**
 * Direct chat-completions calls with the player's own key (browser → api.deepseek.com), plus the
 * numbers the game shows about them: time to first token, total time, and DeepSeek's prompt-cache
 * usage (`usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`).
 * The key only ever goes into the Authorization header; errors carry the HTTP status, never a body.
 */
export interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface LlmMessage {
  content?: string | null;
  tool_calls?: { function?: { name?: string; arguments?: string } }[];
}

export interface LlmResult {
  message: LlmMessage;
  usage: LlmUsage | null;
  ttftMs: number;
  totalMs: number;
}

export class LlmHttpError extends Error {
  constructor(readonly status: number) {
    super(describeStatus(status));
  }
}

export type CallKind = 'plan' | 'chat' | 'remark';

/** Rolling numbers for WD_COOP.status() and the key panel. */
export const llmStats = {
  calls: 0,
  errors: 0,
  lastKind: '' as CallKind | '',
  lastTtftMs: 0,
  lastTotalMs: 0,
  /** per kind: [ttft, total] of the last call */
  byKind: {} as Partial<Record<CallKind, { ttftMs: number; totalMs: number; n: number }>>,
  promptTokens: 0,
  completionTokens: 0,
  lastPromptTokens: 0,
  lastCompletionTokens: 0,
  /** reasoning ("thinking") tokens: part of the completion tokens, never shown as text */
  reasoningTokens: 0,
  lastReasoningTokens: 0,
  /** the provider's message for the last failed proxy call ('' = none) */
  lastErrorDetail: '',
  /** calls that came back with neither text nor a tool call */
  emptyReplies: 0,
  /** calls whose response carried a usage block */
  usageReports: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  lastHitTokens: 0,
  lastMissTokens: 0,
  /** calls whose response carried the cache fields */
  cacheReports: 0,
};

export function resetLlmStats(): void {
  Object.assign(llmStats, { calls: 0, errors: 0, lastKind: '', lastTtftMs: 0, lastTotalMs: 0, byKind: {}, promptTokens: 0, completionTokens: 0, lastPromptTokens: 0, lastCompletionTokens: 0, reasoningTokens: 0, lastReasoningTokens: 0, emptyReplies: 0, lastErrorDetail: '', usageReports: 0, cacheHitTokens: 0, cacheMissTokens: 0, lastHitTokens: 0, lastMissTokens: 0, cacheReports: 0 });
}

/** Share of prompt tokens served from DeepSeek's prefix cache: all calls so far / the last call (null = not reported yet). */
export function cachePct(): { total: number | null; last: number | null } {
  const t = llmStats.cacheHitTokens + llmStats.cacheMissTokens;
  const l = llmStats.lastHitTokens + llmStats.lastMissTokens;
  return { total: t > 0 ? Math.round((llmStats.cacheHitTokens / t) * 100) : null, last: l > 0 ? Math.round((llmStats.lastHitTokens / l) * 100) : null };
}

function record(kind: CallKind, r: LlmResult): void {
  const s = llmStats;
  s.calls++;
  s.lastKind = kind;
  s.lastTtftMs = r.ttftMs;
  s.lastTotalMs = r.totalMs;
  s.byKind[kind] = { ttftMs: r.ttftMs, totalMs: r.totalMs, n: (s.byKind[kind]?.n ?? 0) + 1 };
  const u = r.usage;
  if (!u) {
    for (const f of callListeners) f(kind);
    return;
  }
  s.usageReports++;
  s.lastPromptTokens = u.prompt_tokens ?? 0;
  s.lastCompletionTokens = u.completion_tokens ?? 0;
  s.lastReasoningTokens = reasoningTokens(u);
  s.reasoningTokens += s.lastReasoningTokens;
  s.promptTokens += s.lastPromptTokens;
  s.completionTokens += s.lastCompletionTokens;
  if (typeof u.prompt_cache_hit_tokens === 'number' || typeof u.prompt_cache_miss_tokens === 'number') {
    s.lastHitTokens = u.prompt_cache_hit_tokens ?? 0;
    s.lastMissTokens = u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - s.lastHitTokens);
    s.cacheHitTokens += s.lastHitTokens;
    s.cacheMissTokens += s.lastMissTokens;
    s.cacheReports++;
  } else s.lastHitTokens = s.lastMissTokens = 0;
  for (const f of callListeners) f(kind);
}

const callListeners = new Set<(kind: CallKind) => void>();
/** Called after every finished call (the token chip listens). */
export function onLlmCall(f: (kind: CallKind) => void): () => void {
  callListeners.add(f);
  return () => callListeners.delete(f);
}

/** 1234 → "1.2k" */
export const kTokens = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** "↑1.2k ↓38 · cache 91%" for the last call (cache part only when the provider reported it). */
export function lastCallLabel(cacheWord: (pct: number) => string, thinkWord: (n: number) => string = (n) => `think ${n}`): string {
  const s = llmStats;
  if (!s.usageReports) return '';
  const c = cachePct().last;
  const think = s.lastReasoningTokens ? ` (${thinkWord(s.lastReasoningTokens)})` : '';
  return `↑${kTokens(s.lastPromptTokens)} ↓${kTokens(s.lastCompletionTokens)}${think}${c !== null ? ` · ${cacheWord(c)}` : ''}`;
}

/** Which way a call travels: the player's key straight to the provider, or the dev server's proxy (its own key). */
export interface LlmRequest {
  route: 'key' | 'server';
  ask: AskKind;
  lang: unknown;
  /** her memory log + the volatile tail (no system prompt: that is added last, identically on both routes) */
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * One chat-completions call. `onDelta` → streaming (`stream: true`, usage requested in the last
 * chunk); it gets the whole text so far each time. Throws LlmHttpError / AbortError / TypeError (network).
 */
export async function chatCompletion(kind: CallKind, req: LlmRequest, opts: { signal?: AbortSignal; onDelta?: (textSoFar: string) => void } = {}): Promise<LlmResult> {
  const stream = !!opts.onDelta;
  const t0 = performance.now();
  let ttft = 0;
  try {
    let r: Response;
    if (req.route === 'key') {
      const key = getPlayerKey();
      if (!key) throw new Error('no key');
      const send = () =>
        fetch(`${apiBase()}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: DEEPSEEK_MODEL, ...coopBody(req.ask, req.lang, req.messages, thinkPolicy), ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}) }),
          signal: opts.signal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
      r = await send();
      // "thinking: disabled" not accepted by this model/provider → drop it, leave room for reasoning, try once more
      if (r.status === 400 && noteThinking(thinkPolicy, { rejected: true })) r = await send();
    } else {
      // the dev server adds the system prompt, the tools, the model and ITS key (server/coopApi.ts)
      r = await fetch('/api/coop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 2, kind: req.ask, lang: req.lang, messages: req.messages, stream }), signal: opts.signal, cache: 'no-store' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { status?: number; error?: string } | null;
        // the provider's own error text as passed on by the proxy (it strips anything key-like)
        llmStats.lastErrorDetail = String((j as { detail?: string } | null)?.detail ?? '').slice(0, 240);
        if (j?.status) throw new LlmHttpError(j.status);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
    }
    if (!r.ok) throw new LlmHttpError(r.status);
    let result: LlmResult;
    if (!stream || !r.body || !(r.headers.get('content-type') ?? '').includes('event-stream')) {
      const j = (await r.json()) as { choices?: { message?: LlmMessage }[]; usage?: LlmUsage };
      const total = Math.round(performance.now() - t0);
      result = { message: j.choices?.[0]?.message ?? {}, usage: j.usage ?? null, ttftMs: total, totalMs: total };
      if (stream) opts.onDelta!(String(result.message.content ?? ''));
    } else {
      // server-sent events: "data: {json}\n\n" … "data: [DONE]"
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '';
      let usage: LlmUsage | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let j: { choices?: { delta?: { content?: string | null } }[]; usage?: LlmUsage | null };
          try {
            j = JSON.parse(data);
          } catch {
            continue;
          }
          if (j.usage) usage = j.usage;
          const d = j.choices?.[0]?.delta?.content;
          if (d) {
            if (!ttft) ttft = Math.round(performance.now() - t0);
            text += d;
            opts.onDelta!(text);
          }
        }
      }
      const total = Math.round(performance.now() - t0);
      result = { message: { content: text }, usage, ttftMs: ttft || total, totalMs: total };
    }
    if (req.route === 'key') noteThinking(thinkPolicy, { reasoningTokens: reasoningTokens(result.usage) });
    if (!String(result.message.content ?? '').trim() && !result.message.tool_calls?.length) llmStats.emptyReplies++;
    record(kind, result);
    return result;
  } catch (e) {
    llmStats.errors++;
    throw e;
  }
}

/** A short, key-free reason for a failed call. */
export function errorReason(e: unknown): string {
  if (e instanceof LlmHttpError) return e.message;
  if (e instanceof Error) return e.name === 'AbortError' ? 'timeout' : e.name === 'TypeError' ? 'network error' : e.message;
  return 'error';
}
