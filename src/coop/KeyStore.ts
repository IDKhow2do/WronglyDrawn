/**
 * The player's own DeepSeek API key ("bring your own key").
 *
 * Stored ONLY in this browser's localStorage and sent ONLY as the Authorization header of
 * requests to https://api.deepseek.com (see LlmBrain.ts). It is never logged, never put in a
 * URL, never sent to the game's own server and never exposed on window.WD_COOP.
 */
const KEY = 'wd.coop.deepseekKey';

export const DEEPSEEK_BASE = 'https://api.deepseek.com';
const MODEL_KEY = 'wd.coop.model';
const DEFAULT_MODEL = 'deepseek-flash';
/** The model id sent with the player's key (they can change it in the key panel, e.g. to a faster "flash" model). */
export let DEEPSEEK_MODEL = (() => {
  try {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
})();
export function setPlayerModel(id: string): void {
  const v = id.trim().replace(/[^A-Za-z0-9._:\/-]/g, '').slice(0, 80);
  DEEPSEEK_MODEL = v || DEFAULT_MODEL;
  try {
    if (v && v !== DEFAULT_MODEL) localStorage.setItem(MODEL_KEY, v);
    else localStorage.removeItem(MODEL_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Tests only: point the direct calls at a local mock (never the default, never persisted).
 * Accepted only in a dev build and only for a loopback address, so a player's key can never be
 * redirected to another host by this.
 */
let devBase = '';
export function setDevBase(url: string | null): boolean {
  if (!url) {
    devBase = '';
    return true;
  }
  if (!import.meta.env.DEV) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return false;
    devBase = u.origin;
    return true;
  } catch {
    return false;
  }
}
/** Where the player's key is sent: https://api.deepseek.com (or the dev-only loopback mock). */
export function apiBase(): string {
  return devBase || DEEPSEEK_BASE;
}
export function usingMock(): boolean {
  return devBase !== '';
}

const listeners = new Set<() => void>();

export function getPlayerKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function hasPlayerKey(): boolean {
  return getPlayerKey().length > 0;
}

/** Save (trimmed). Returns false when the browser refuses storage (private mode). */
export function setPlayerKey(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  try {
    localStorage.setItem(KEY, k);
  } catch {
    return false;
  }
  for (const f of listeners) f();
  return true;
}

export function clearPlayerKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  for (const f of listeners) f();
}

export function onPlayerKeyChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** A key looks plausible enough to try (no spaces/control chars, sane length). Not a validity check. */
export function plausibleKey(key: string): boolean {
  return /^[\x21-\x7e]{8,200}$/.test(key.trim());
}

/** Short, key-free reason for a failed DeepSeek call (the response body is never read into it). */
export function describeStatus(status: number): string {
  if (status === 401) return 'key rejected (401)';
  if (status === 402) return 'no balance (402)';
  if (status === 429) return 'rate limited (429)';
  return `HTTP ${status}`;
}

export type KeyCheck = { ok: true } | { ok: false; error: string; fatal: boolean };

/**
 * Ask DeepSeek whether the key works (GET /models: no tokens spent).
 * `fatal` = the key itself is the problem (don't retry until it changes).
 */
export async function checkPlayerKey(key: string, timeoutMs = 8000): Promise<KeyCheck> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${apiBase()}/models`, { method: 'GET', headers: { authorization: `Bearer ${key}` }, signal: ctrl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.ok) return { ok: true };
    return { ok: false, error: describeStatus(r.status), fatal: r.status === 401 || r.status === 402 || r.status === 403 };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network error', fatal: false };
  } finally {
    clearTimeout(timer);
  }
}
