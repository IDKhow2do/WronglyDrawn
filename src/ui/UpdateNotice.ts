/**
 * [INPUT]: 用户代理里 App 外壳写的版本和系统（WronglyDrawnAndroid/<v>，WronglyDrawnDesktop/<v> <系统>-<芯片>）；
 *          网站的 /api/version（scripts/assemble-site.mjs 从最新 GitHub Release 写出的 version.json）；t 来自 i18n。
 * [OUTPUT]: mountUpdateNotice(title)：安卓和电脑版启动到标题画面时查一次最新版本。比装着的新，就在标题画面贴一张
 *           “新版本”贴纸，“下载”直接拿本系统的安装包，“以后再说”三天内不再提这个版本。
 *           “下载”是普通的同窗口链接：安卓外壳（MainActivity）和电脑版外壳（desktop/main.mjs）都把站外地址交给系统浏览器。
 * [POS]: ui/ 的更新提示。main.ts 在标题画面出现后调用。网页版本来就是最新的，iOS 走 TestFlight，TapTap 由商店更新，
 *        都不提示。查不到（离线、超时、服务器没有这个文件）时什么都不显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { onLangChange, t } from '../i18n';

interface LatestRelease {
  version: string;
  page: string;
  files: Partial<Record<'android' | 'windows' | 'mac-arm64' | 'mac-x64' | 'linux', string>>;
}

const LATER_KEY = 'wd.update.later';
const LATER_MS = 3 * 24 * 3600 * 1000;
const CHECK_MS = 6000;

/** The app shell this page runs in, its installed version and which installer fits this machine. */
function installed(): { version: string; file: keyof LatestRelease['files'] } | null {
  const ua = navigator.userAgent;
  const android = / WronglyDrawnAndroid\/(\d+\.\d+\.\d+)/.exec(ua);
  if (android) return { version: android[1], file: 'android' };
  const desktop = / WronglyDrawnDesktop\/(\d+\.\d+\.\d+)(?: (win32|darwin|linux)-(x64|arm64))?/.exec(ua);
  if (!desktop) return null;
  const os = desktop[2] ?? (/Windows/.test(ua) ? 'win32' : /Mac OS X/.test(ua) ? 'darwin' : 'linux');
  const file = os === 'win32' ? 'windows' : os === 'darwin' ? (desktop[3] === 'x64' ? 'mac-x64' : 'mac-arm64') : 'linux';
  return { version: desktop[1], file };
}

/** 1 when a is newer than b, -1 when older, 0 when equal (x.y.z only). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  return 0;
}

function snoozed(version: string): boolean {
  try {
    const later = JSON.parse(localStorage.getItem(LATER_KEY) || 'null') as { v: string; until: number } | null;
    return !!later && later.v === version && Date.now() < later.until;
  } catch {
    return false;
  }
}

async function latest(): Promise<LatestRelease | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CHECK_MS);
  try {
    // the site's root, wherever the game page sits (the apps load it from the site's own origin)
    const res = await fetch(new URL('/api/version', location.origin), { cache: 'no-store', signal: stop.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as LatestRelease;
    return /^\d+\.\d+\.\d+$/.test(body?.version ?? '') ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function mountUpdateNotice(title: HTMLElement): Promise<void> {
  const app = installed();
  if (!app) return;
  const rel = await latest();
  if (!rel || compareVersions(rel.version, app.version) <= 0 || snoozed(rel.version)) return;
  const url = rel.files[app.file] ?? rel.page;
  if (!/^https:\/\//.test(url)) return;

  const note = document.createElement('div');
  note.className = 'update-note';
  note.setAttribute('role', 'status');
  const render = () => {
    note.innerHTML = `
      <strong></strong><span></span>
      <div class="update-actions"><a class="paint-btn update-get"></a><button type="button" class="update-later"></button></div>`;
    note.querySelector('strong')!.textContent = t('New version {v} is out', { v: rel.version });
    note.querySelector('span')!.textContent = t('Install it over this one. Your progress stays.');
    const get = note.querySelector<HTMLAnchorElement>('.update-get')!;
    get.href = url;
    get.textContent = t('Download');
    const later = note.querySelector<HTMLButtonElement>('.update-later')!;
    later.textContent = t('Later');
    later.addEventListener('click', () => {
      try {
        localStorage.setItem(LATER_KEY, JSON.stringify({ v: rel.version, until: Date.now() + LATER_MS }));
      } catch {
        /* private mode: hide it for this session only */
      }
      off();
      note.remove();
    });
  };
  render();
  const off = onLangChange(render);
  title.appendChild(note);
}
