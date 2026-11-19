/**
 * [INPUT]: electron (app, BrowserWindow, protocol, net, shell, Menu); the web build copied into the package's
 *          resources/game/ by build.mjs (dev runs read ../dist-desktop/); env WD_SMOKE=1 for the CI first-level check,
 *          WD_SHOT=<file.png> to save what the check saw.
 * [OUTPUT]: the desktop app: one window that plays the game offline. Requests to https://wrongdraw.maequeen.top
 *           are answered from resources/game/; /api/* (feedback) and every other host go to the network as usual.
 *           The user agent ends in " WronglyDrawnDesktop/<version> <platform>-<arch>" (render/Quality.ts reads it as
 *           DESKTOP_APP; ui/UpdateNotice.ts reads the version and picks this machine's installer).
 * [POS]: desktop/. The same idea as android/ (MainActivity.java): the game keeps the site's origin, so saves,
 *        feedback and the AI partner work as on the web. All gameplay lives in the web build; this file only
 *        loads it and handles the window.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GAME_HOST = 'wrongdraw.maequeen.top';
const START_URL = `https://${GAME_HOST}/index.html`;
const SMOKE = process.env.WD_SMOKE === '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(here, '..', 'dist-desktop');

// CI machines have no graphics card: the check draws with Chromium's software renderer. Players never get this.
if (SMOKE) app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.userAgentFallback = `${app.userAgentFallback} WronglyDrawnDesktop/${app.getVersion()} ${process.platform}-${process.arch}`;

// ── the game's files come from the package; everything else goes to the network ──
function serveGame() {
  protocol.handle('https', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== GAME_HOST || url.pathname.startsWith('/api/')) {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(GAME_DIR, rel));
    if (!file.startsWith(GAME_DIR + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function openWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#1a1420', title: '错画之城 Wrongly Drawn', show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { if (!SMOKE) win.maximize(); win.show(); });
  // links to GitHub, TestFlight and the like open in the player's browser, not in the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).hostname !== GAME_HOST) { e.preventDefault(); shell.openExternal(url); }
  });
  // F11 (Windows, Linux) and the green button / Ctrl+Cmd+F (macOS) toggle full screen; Esc stays the game's pause key
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL(SMOKE ? `${START_URL}?test&level=plaza` : START_URL);
  return win;
}

// ── WD_SMOKE=1: load, reach the title, start the first level, see frames drawn, exit 0 (or 1 with the reason) ──
async function smoke(win) {
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const waitFor = async (code, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await js(`Boolean(${code})`).catch(() => false)) return; await new Promise((r) => setTimeout(r, 250)); }
    throw new Error(`timed out: ${code}`);
  };
  const shoot = async (wait) => {
    if (!process.env.WD_SHOT) return;
    await new Promise((r) => setTimeout(r, wait));
    fs.writeFileSync(process.env.WD_SHOT, (await win.webContents.capturePage()).toPNG());
  };
  const errors = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => errors.push(`load failed ${code} ${desc} ${url}`));
  try {
    await waitFor(`window.__WD?.state === 'TITLE' && window.T`, 180000);
    if (!(await js(`__WD.app.assets.models.size > 0`))) throw new Error('game models did not load');
    if (!(await js(`/ WronglyDrawnDesktop\\//.test(navigator.userAgent)`))) throw new Error('desktop user agent missing');
    if (await js(`!!document.querySelector('.gfx-tip')`)) throw new Error('web-play lag tip shown in the desktop app');
    await js(`document.querySelector('.start-btn').click()`);
    await waitFor(`window.__WD?.state === 'PLAYING' && !!window.__WD.session?.player`, 150000);
    const frame = await js(`__WD.app.renderer.renderer.info.render.frame`);
    await waitFor(`__WD.app.renderer.renderer.info.render.frame > ${frame}`, 30000);
    if (await js(`__WD.app.renderer.renderer.getContext().isContextLost()`)) throw new Error('WebGL context lost');
    await shoot(3000);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    console.log(`Desktop ${process.platform}-${process.arch}: offline title, assets and first-level WebGL render passed`);
    app.exit(0);
  } catch (err) {
    console.error(`Desktop smoke FAILED: ${err.message}`);
    await shoot(0).catch(() => {});
    app.exit(1);
  }
}

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  // macOS keeps a minimal menu so Cmd+Q, Cmd+H and full screen work; Windows and Linux have none
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }])
    : null);
  serveGame();
  const win = openWindow();
  if (SMOKE) smoke(win);
});
