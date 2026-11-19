import { ZH } from './zh';

export type Lang = 'en' | 'zh';

const KEY = 'wd.lang';
let lang: Lang = (() => {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'zh') return s;
  } catch {
    /* private mode */
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();
const listeners = new Set<(l: Lang) => void>();
const missing = new Set<string>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('lang-zh', l === 'zh');
  warmHand();
  for (const f of listeners) f(l);
}

export function onLangChange(f: (l: Lang) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * Translate an English source string. The English text IS the key, so call
 * sites stay readable. `{name}` placeholders are filled from `params` after
 * translation (the Chinese entry may reorder them).
 */
export function t(en: string, params?: Record<string, string | number>): string {
  let s = en;
  if (lang === 'zh') {
    const z = ZH[en];
    // "Known prefix: detail" (loading lines, asset names…) → translated prefix + the detail as-is
    const pre = z === undefined ? /^([^:]{2,40}): (.+)$/.exec(en) : null;
    if (z !== undefined) s = z;
    else if (pre && ZH[pre[1]] !== undefined) s = `${ZH[pre[1]]}：${pre[2]}`;
    // (already-translated text may be passed through again — don't report CJK strings)
    else if (import.meta.env.DEV && !missing.has(en) && !/[\u3400-\u9fff]/.test(en)) {
      missing.add(en);
      console.debug('[i18n] missing zh:', en);
    }
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  if (s !== en || params) remember(s, en, params);
  if (filter) {
    const f = filter(s, lang);
    if (f !== s) {
      // the filtered text is what the screen shows: it must find its way back to the English key too
      remember(f, en, params);
      s = f;
    }
  }
  return s;
}

/**
 * A last pass over every translated string (ui/TouchText.ts: no key names on a touch screen). One filter at a
 * time; null removes it. The filter must return its input unchanged when it has nothing to say.
 */
let filter: ((text: string, lang: Lang) => string) | null = null;
export function setTextFilter(f: ((text: string, lang: Lang) => string) | null): void {
  filter = f;
  // text already on screen was written without the filter: every language listener writes it again
  for (const l of listeners) l(lang);
}

// Displayed text → the English key (+ params) it came from, so text already on screen (toasts…)
// can be rebuilt in the other language. Small LRU; nested params are re-translated too.
const sources = new Map<string, { en: string; params?: Record<string, string | number> }>();
function remember(out: string, en: string, params?: Record<string, string | number>): void {
  if (sources.has(out)) sources.delete(out);
  sources.set(out, { en, params });
  if (sources.size > 400) sources.delete(sources.keys().next().value as string);
}

/** Re-translate text that was produced by t() (in either language) into the current language. */
export function retranslate(text: string): string {
  const src = sources.get(text);
  if (!src) return t(text);
  let params: Record<string, string | number> | undefined;
  if (src.params) {
    params = {};
    for (const [k, v] of Object.entries(src.params)) params[k] = typeof v === 'string' && sources.has(v) ? retranslate(v) : v;
  }
  return t(src.en, params);
}

/** Initialise <html lang> and the body class on boot. */
export function initLang(): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('lang-zh', lang === 'zh');
  warmHand();
}

/** Canvas text (pop-up words in the world) cannot wait for a web font: fetch the Chinese hand font up front. */
function warmHand(): void {
  if (lang === 'zh') void document.fonts?.load('900 32px "WD Hand"', '错画之城').catch(() => {});
}

/** Debug helper: list strings looked up without a Chinese entry. */
export function missingStrings(): string[] {
  return [...missing];
}
