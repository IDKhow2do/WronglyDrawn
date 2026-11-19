/**
 * [INPUT]: ../landing/（落地页，纯静态）；一份用相对路径构建好的游戏（`vite build --base ./` 的输出目录）。
 * [OUTPUT]: `node scripts/assemble-site.mjs <游戏构建目录> <网站目录> [版本标记]` 拼出整个网站：
 *           落地页在根部，游戏在 `play/`，`build.txt` 写版本标记（默认是当前提交的短哈希）。
 *           环境变量 WD_RELEASE_JSON 指向一份 GitHub Release 的 JSON（`gh api …/releases/latest` 的输出）时，
 *           另写 `version.json`：最新版本号、Release 页面和各系统安装包的下载地址。服务器把它作为 /api/version 提供，
 *           App 里的更新提示读它（src/ui/UpdateNotice.ts）。
 *           拼完自查；入口缺失、页面引用的本地文件不存在、游戏入口里有以 `/` 开头的地址时，以非零退出。
 * [POS]: scripts。网站目录结构的唯一定义。`.github/workflows/deploy-site.yml` 和本地预览都调用它，
 *        两边拼出的目录因此相同。它不构建游戏，也不上传。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [gameArg, siteArg, labelArg] = process.argv.slice(2);
if (!gameArg || !siteArg) { console.error('usage: node scripts/assemble-site.mjs <game-build-dir> <site-dir> [label]'); process.exit(2); }
const game = path.resolve(gameArg), site = path.resolve(siteArg), landing = path.join(ROOT, 'landing');
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
if (inside(site, landing) || inside(site, game) || inside(ROOT, site)) { console.error('the site folder must not be the repository, landing/ or the game build'); process.exit(2); }

// ── 1. 拼目录：落地页在根部，游戏在 play/ ──
const NOT_FOR_VISITORS = new Set(['CLAUDE.md', '.DS_Store']);   // 给开发者看的说明不上线
// 落地页里只给开发用的东西也不上线：伙伴的源码目录和各种打包配置（成品 buddy.js 照常上线）
const landingDevOnly = (src) => { const rel = path.relative(landing, src); return rel === 'src' || /^[^/]+\.config\.[cm]?js$/.test(rel); };
fs.rmSync(site, { recursive: true, force: true });
fs.cpSync(landing, site, { recursive: true, filter: (src) => !NOT_FOR_VISITORS.has(path.basename(src)) && !landingDevOnly(src) });
fs.cpSync(game, path.join(site, 'play'), { recursive: true, filter: (src) => !NOT_FOR_VISITORS.has(path.basename(src)) });
const label = labelArg || execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(site, 'build.txt'), label + '\n');

// ── 1b. version.json：最新的 Release。文件名后缀与 release.yml 的产物命名一一对应 ──
const ASSET_KEYS = { android: '-android.apk', windows: '-windows-setup.exe', 'mac-arm64': '-mac-arm64.dmg', 'mac-x64': '-mac-x64.dmg', linux: '-linux-x86_64.AppImage' };
let released = '';
if (process.env.WD_RELEASE_JSON) {
  const rel = JSON.parse(fs.readFileSync(process.env.WD_RELEASE_JSON, 'utf8'));
  const version = String(rel.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version) || rel.draft || rel.prerelease) { console.error(`WD_RELEASE_JSON is not a published vX.Y.Z release (${rel.tag_name})`); process.exit(1); }
  const files = {};
  for (const [key, suffix] of Object.entries(ASSET_KEYS)) {
    const asset = (rel.assets || []).find((a) => a.name.endsWith(suffix));
    if (asset) files[key] = asset.browser_download_url;
  }
  fs.writeFileSync(path.join(site, 'version.json'), JSON.stringify({ version, page: rel.html_url, files }, null, 2) + '\n');
  released = `, latest release ${version}`;
}

// ── 2. 自查：两个入口都在，入口引用的本地文件都在，游戏入口不指向网站根部 ──
const problems = [];
const localRefs = (html) => [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)/g)].map((m) => m[1]).filter((u) => !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u));
for (const page of ['index.html', 'play/index.html']) {
  const file = path.join(site, page);
  if (!fs.existsSync(file)) { problems.push(`${page}: missing`); continue; }
  for (const ref of localRefs(fs.readFileSync(file, 'utf8'))) {
    if (ref.startsWith('/')) { if (page.startsWith('play/')) problems.push(`${page}: "${ref}" points at the site root; build the game with --base ./`); continue; }
    const target = path.join(path.dirname(file), ref);
    if (!fs.existsSync(target)) problems.push(`${page}: "${ref}" does not exist in the site folder`);
  }
}
if (problems.length) { console.error('site NOT ready:\n  ' + problems.join('\n  ')); process.exit(1); }

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`site ready: ${count(site)} files in ${site} (landing at /, game at /play/, build ${label}${released})`);
