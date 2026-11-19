/**
 * [INPUT]: 接收 Vite 构建目录，复用 Chrome 测试驱动。
 * [OUTPUT]: 检查资源加载、首关启动和 WebGL 状态。
 * [POS]: CI 用这个入口验收网页和 TapTap 构建。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { basename, dirname, resolve } from 'node:path';
import { launch, serve } from '../docs/perf/harness/cdp.mjs';

const buildArgument = process.argv[2];
assert.ok(buildArgument, 'Usage: node scripts/smoke-build.mjs <build directory>');
const build = resolve(buildArgument);
const isTapTap = process.argv.includes('--taptap');
const directory = isTapTap ? dirname(build) : build;
const path = isTapTap ? `/${encodeURIComponent(basename(build))}/` : '/';
const browser = await launch({ width: 1200, height: 720, uncapped: false });
const { send, ev, waitFor } = browser;
const server = await serve(directory);
const failedResponses = [];

try {
  await send('Network.enable');
  browser.on(({ method, params }) => {
    if (method !== 'Network.responseReceived') return;
    const { status, url } = params.response;
    if (status >= 400 && !url.endsWith('/favicon.ico')) failedResponses.push(`${status} ${url}`);
  });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('wd.lang', 'zh'); localStorage.setItem('wd.boons', 'auto');`,
  });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.port}${path}?test&level=plaza` });
  await waitFor(`window.__WD?.state === 'TITLE' && window.T`, 90000);
  assert.ok(await ev(`__WD.app.assets.models.size > 0`), 'Game models did not load');
  assert.equal(await ev(`!!document.querySelector('.feedback-open-title')`), !isTapTap);
  await ev(`document.querySelector('.start-btn').click()`);
  await waitFor(`window.__WD?.state === 'PLAYING' && !!window.__WD.session?.player`, 75000);
  const frame = await ev(`__WD.app.renderer.renderer.info.render.frame`);
  await waitFor(`__WD.app.renderer.renderer.info.render.frame > ${frame}`, 15000);
  assert.ok(await ev(`!__WD.app.renderer.renderer.getContext().isContextLost()`));
  assert.deepEqual(failedResponses, []);
  assert.deepEqual(browser.errors, []);
  console.log(`${isTapTap ? 'TapTap H5' : 'Web'}: title, assets and first-level WebGL render passed`);
} finally {
  browser.close();
  server.close();
}
