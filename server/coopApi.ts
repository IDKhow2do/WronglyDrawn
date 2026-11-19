import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { coopBody, coopRequestBody, noteThinking, parseCompletion, reasoningTokens, sanitizeMemory, type AskKind, type ThinkPolicy } from '../src/coop/prompt.ts';

/**
 * Dev-server endpoint for the AI co-op partner's LLM brain (src/coop/LlmBrain.ts).
 *
 *   GET  /api/coop           → { configured, model, provider }      (never the key)
 *   GET  /api/coop?check=1   → … + check: { ok, status, modelListed } (asks the provider's /models)
 *   POST /api/coop  { v: 2, kind: DECIDE|CHAT|REMARK, lang, messages, stream? }
 *                   → the provider's answer: JSON { choices:[{message}], usage, model } or, with stream, its SSE
 *                     passed straight through. The system prompt and the tool list are added HERE (the client
 *                     only sends her memory log + the volatile tail), so with a server key and no browser key
 *                     she has everything the direct route has: planning, streamed chat, remarks, usage/cache numbers.
 *   POST /api/coop  { observation, log? } → { ok, calls: [{name, args}], say?, model, ms }
 *                   (log = her append-only memory messages, see src/coop/Journal.ts; kept in front of
 *                    the observation so the upstream prompt prefix stays cacheable)
 *
 * Forwards to any OpenAI-compatible chat-completions API with the partner's commands as tools
 * (function calling). Default: DeepSeek (`deepseek-flash`). The persona (蓝色大肥鱼), the tool list
 * and the reply parsing live in src/coop/prompt.ts and are shared with the browser, which calls
 * DeepSeek directly when the player has saved a key of their own (this proxy is then not used).
 *
 * Env (from the shell or `.env.local`, loaded server-side only — none of these use the
 * VITE_ prefix, so they never reach the browser bundle):
 *   DEEPSEEK_API_KEY   key for https://api.deepseek.com
 *   COOP_API_KEY       key for another provider (wins over DEEPSEEK_API_KEY)
 *   COOP_BASE_URL      e.g. https://api.openai.com/v1, http://localhost:11434/v1 (Ollama)
 *   COOP_MODEL         e.g. deepseek-flash, gpt-4o-mini, qwen2.5:7b
 *   COOP_TIMEOUT_MS    upstream timeout (default 8000)
 */
export interface CoopEnv {
  DEEPSEEK_API_KEY?: string;
  COOP_API_KEY?: string;
  COOP_BASE_URL?: string;
  COOP_MODEL?: string;
  COOP_TIMEOUT_MS?: string;
}

function readBody(req: IncomingMessage, limit = 400_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > limit) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function coopApiPlugin(env: CoopEnv): Plugin {
  const base = (env.COOP_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = env.COOP_MODEL || 'deepseek-flash';
  const key = env.COOP_API_KEY || env.DEEPSEEK_API_KEY || '';
  // a custom base URL (local Ollama, a mock) may not need a key
  const configured = !!key || !!env.COOP_BASE_URL;
  const timeout = Number(env.COOP_TIMEOUT_MS) || 8000;
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return 'invalid-url';
    }
  })();

  // thinking models: start with "thinking: disabled"; adapts if the provider rejects it or still reasons (see noteThinking)
  const think: ThinkPolicy = { mode: 'disabled', extra: 0 };
  /** Upstream error text for the client: the provider's own message, shortened, anything key-like removed. */
  const detail = async (r: Response): Promise<string> => {
    try {
      const txt = await r.text();
      let msg = txt;
      try {
        const j = JSON.parse(txt) as { error?: { message?: string } | string; message?: string };
        msg = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? txt;
      } catch {
        /* not JSON */
      }
      return String(msg).replace(/sk-[A-Za-z0-9_\-]{6,}/g, 'sk-…').replace(/Bearer\s+\S+/gi, 'Bearer …').slice(0, 240);
    } catch {
      return '';
    }
  };
  const upstream = (path: string, init: RequestInit) => fetch(`${base}${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...(key ? { authorization: `Bearer ${key}` } : {}) } });

  return {
    name: 'coop-api',
    apply: 'serve',
    configureServer(server) {
      const log = server.config.logger;
      log.info(`[coop] AI partner LLM: ${configured ? `${model} @ ${host}` : 'not configured (set DEEPSEEK_API_KEY in .env.local) — built-in brain only'}`);
      server.middlewares.use('/api/coop', async (req, res) => {
        if (req.method === 'GET') {
          const info = { configured, model: configured ? model : '', provider: configured ? host : '' };
          // ?check=1: ask the provider whether the server's key works and knows the model (GET /models; no tokens)
          if (configured && /[?&]check=1\b/.test(req.url ?? '')) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeout);
            try {
              const r = await upstream('/models', { method: 'GET', signal: ctrl.signal });
              let listed: boolean | null = null;
              if (r.ok) {
                const j = (await r.json().catch(() => null)) as { data?: { id?: string }[] } | null;
                if (Array.isArray(j?.data)) listed = j.data.some((m) => m?.id === model);
              }
              return send(res, 200, { ...info, thinking: think, check: { ok: r.ok, status: r.status, modelListed: listed } });
            } catch (e) {
              return send(res, 200, { ...info, check: { ok: false, status: 0, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network error' } });
            } finally {
              clearTimeout(timer);
            }
          }
          return send(res, 200, info);
        }
        if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' });
        if (!configured) return send(res, 503, { ok: false, error: 'no LLM configured' });
        const t0 = Date.now();
        try {
          const body = JSON.parse((await readBody(req)) || '{}') as { v?: number; kind?: string; lang?: unknown; messages?: unknown; stream?: boolean; observation?: Record<string, unknown>; log?: unknown };

          // ── v2: the same call the browser makes with a player key (plan / chat / remark, JSON or SSE) ──
          if (body.v === 2) {
            const kind: AskKind = body.kind === 'CHAT' || body.kind === 'REMARK' ? body.kind : 'DECIDE';
            const mem = sanitizeMemory(body.messages);
            if (!mem.length || mem[mem.length - 1].role !== 'user') return send(res, 400, { ok: false, error: 'bad messages' });
            const stream = body.stream === true;
            const ctrl = new AbortController();
            // no first byte within the timeout → give up; a stream may then run a little longer
            let timer = setTimeout(() => ctrl.abort(), timeout);
            // the browser gave up (a chat pre-empted a planning call, a timeout): stop paying for the upstream call
            res.on('close', () => {
              if (!res.writableEnded) ctrl.abort();
            });
            try {
              const call = () =>
                upstream('/chat/completions', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ model, ...coopBody(kind, body.lang, mem, think), ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}) }),
                  signal: ctrl.signal,
                });
              let r = await call();
              if (r.status === 400 && think.mode === 'disabled') {
                const why = await detail(r);
                // "thinking: disabled" not accepted → drop the parameter, leave room for reasoning, try once more
                if (noteThinking(think, { rejected: true })) {
                  log.warn(`[coop] ${kind} HTTP 400 with thinking disabled (${why}) → retrying without it, max_tokens +${think.extra}`);
                  r = await call();
                }
              }
              if (!r.ok) {
                const why = await detail(r);
                log.warn(`[coop] ${kind} upstream HTTP ${r.status} ${why}`);
                return send(res, 502, { ok: false, error: `upstream HTTP ${r.status}`, status: r.status, detail: why });
              }
              if (stream && r.body) {
                clearTimeout(timer);
                timer = setTimeout(() => ctrl.abort(), 20_000);
                res.statusCode = 200;
                res.setHeader('content-type', 'text/event-stream; charset=utf-8');
                res.setHeader('cache-control', 'no-store');
                res.setHeader('x-accel-buffering', 'no');
                const reader = r.body.getReader();
                let first = 0;
                const dec = new TextDecoder();
                let tailText = '';
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (!first) first = Date.now() - t0;
                  res.write(value);
                  tailText = (tailText + dec.decode(value, { stream: true })).slice(-1500);
                }
                res.end();
                // the usage block is in the last chunk: note reasoning tokens (numbers only, no text is kept)
                const rs = Number(/"reasoning_tokens"\s*:\s*(\d+)/.exec(tailText)?.[1] ?? 0);
                noteThinking(think, { reasoningTokens: rs });
                log.info(`[coop] ${kind} stream · first byte ${first} ms · ${Date.now() - t0} ms${rs ? ` · reasoning ${rs}` : ''}`, { timestamp: true });
                return;
              }
              const j = (await r.json()) as { choices?: { message?: unknown }[]; usage?: unknown };
              const u = (j.usage ?? {}) as Record<string, number>;
              const rs = reasoningTokens(j.usage);
              noteThinking(think, { reasoningTokens: rs });
              log.info(`[coop] ${kind} ${Date.now() - t0} ms · in ${u.prompt_tokens ?? '?'} (cache hit ${u.prompt_cache_hit_tokens ?? '?'}) out ${u.completion_tokens ?? '?'}${rs ? ` (reasoning ${rs})` : ''}`, { timestamp: true });
              // only what the game uses goes back: the text / tool calls (never reasoning_content) and the usage numbers
              const m = (j.choices?.[0]?.message ?? {}) as { content?: unknown; tool_calls?: unknown };
              return send(res, 200, { choices: [{ message: { content: typeof m.content === 'string' ? m.content : null, tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : undefined } }], usage: j.usage ?? null, model, thinking: think });
            } finally {
              clearTimeout(timer);
            }
          }

          // ── v1 (kept for older harnesses): one DECIDE turn from an observation ──
          const obs = body.observation ?? {};
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeout);
          let r: Response;
          try {
            r = await upstream('/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(coopRequestBody(model, obs, body.log)), signal: ctrl.signal });
          } finally {
            clearTimeout(timer);
          }
          if (!r.ok) {
            log.warn(`[coop] upstream HTTP ${r.status}`);
            return send(res, 502, { ok: false, error: `upstream HTTP ${r.status}`, status: r.status });
          }
          const { calls = [], say, face } = parseCompletion(await r.json());
          const ms = Date.now() - t0;
          log.info(`[coop] ${ms} ms · ${calls.map((c) => c.name).join(',') || '-'}${say ? ' · says' : ''}`, { timestamp: true });
          return send(res, 200, { ok: true, calls, say, face, model, ms });
        } catch (e) {
          const err = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'error';
          log.warn(`[coop] ${err}`);
          if (res.headersSent) return void res.end();
          return send(res, 502, { ok: false, error: err });
        }
      });
    },
  };
}
