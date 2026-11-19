// Moiré proof (docs/level3/ROUND3.md job 3): the title backdrop and fixed in-level views of Limp Works, at a given
// viewport and device pixel ratio, graphics tier HIGH (DPR up to 2, as on the author's Mac).
// Usage: node moire.mjs <tag> [W H DPR]   → $WD_SHOTS/moire/<tag>-<W>x<H>@<DPR>-<view>.png
// Views: title (the title screen as the player sees it), titlebare (same pose, UI hidden), and the in-level poses below.
// Shimmer: every bare view is shot twice, the camera moved by about one pixel in between (the title drift by 0.05 s, the
// in-level poses by 1.5 cm sideways). A band-limited picture barely changes; aliased fine lines flip whole pixels. The
// mean absolute difference (YAVG of the difference, 0–255) is printed per view and the difference ×6 is saved (-diff.jpg).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { connect, sleep, VITE } from '../bot/lib.mjs';
const c = await connect();
const tag = process.argv[2] ?? 'after';
const W = +(process.argv[3] ?? 1280), H = +(process.argv[4] ?? 720), DPR = +(process.argv[5] ?? 1);
const dir = `${process.env.WD_SHOTS ?? '/tmp/wd-r3/shots'}/moire`;
fs.mkdirSync(dir, { recursive: true });
const name = (v) => `${dir}/${tag}-${W}x${H}@${DPR}-${v}.png`;
const shot = async (v) => { const r = await c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(name(v), Buffer.from(r.result.data, 'base64')); };
await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
const st = () => c.ev('return window.__WD?.state?.current ?? window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=works` });
for (let i = 0; i < 80 && (await st()) !== 'TITLE'; i++) await sleep(500);
// HIGH tier, dynamic resolution pinned at full scale (a screenshot must not catch a frame rendered smaller)
const pin = `const Q=(await import('/src/render/Quality.ts')).Quality; Q.setPref('high'); Q.scale = 1; Q.applyPixelRatio?.call(Q); return [Q.tier, __WD.app.renderer?.renderer?.getPixelRatio?.() ?? null]`;
console.log('quality', JSON.stringify(await c.ev(pin)));
await sleep(2500);
// the title drift, frozen at one moment so before / after frame the same view
const freeze = (t) => c.ev(`const a=__WD.app; a.titleT=${t}; return 1`);
const shimmer = {};
// the static surface the view is about (fractions of the frame): animated things (belts, rollers, creatures, the title's
// mascot) are kept out of the number. title: the riveted dock face + the ruler beam; pit: the stair cage's wire screens
// and the brick behind; shutter: the lift's wire shutter + the riveted wall; hall: the far hall (brick, beam, ceiling).
const CROP = { titlebare: [0.3, 0.6, 0.68, 0.38], hall: [0.15, 0.1, 0.7, 0.55], shutter: [0.5, 0.25, 0.45, 0.45], pit: [0.22, 0.25, 0.36, 0.3] };
const yavg = (a, b, crop) => {
  const pre = crop ? `[0]crop=iw*${crop[2]}:ih*${crop[3]}:iw*${crop[0]}:ih*${crop[1]}[x];[1]crop=iw*${crop[2]}:ih*${crop[3]}:iw*${crop[0]}:ih*${crop[1]}[y];[x][y]` : '';
  const r = spawnSync('ffmpeg', ['-i', a, '-i', b, '-filter_complex', `${pre}blend=all_mode=difference,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /YAVG=([0-9.]+)/.exec(r.stderr + r.stdout);
  return m ? +(+m[1]).toFixed(3) : null;
};
const diff = (v) => {
  const a = name(v), b = name(v + '_b'), out = name(v + '-diff').replace(/png$/, 'jpg');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', a, '-i', b, '-lavfi', 'blend=all_mode=difference,format=gray,lutyuv=y=val*6', out]);
  shimmer[v] = { frame: yavg(a, b), surface: yavg(a, b, CROP[v]) };
};
for (const [v, hide] of [['title', false], ['titlebare', true]]) {
  await c.ev(`document.querySelectorAll('.title-screen, .title, #title, .menu').forEach(e=>e.style.visibility='${hide ? 'hidden' : ''}'); return 1`);
  await freeze(4); await sleep(400); await freeze(4); await sleep(120);
  await shot(v);
  if (hide) { await freeze(4.05); await sleep(150); await freeze(4.05); await sleep(120); await shot(v + '_b'); diff(v); }
}
await c.ev(`document.querySelectorAll('.title-screen, .title, #title, .menu').forEach(e=>e.style.visibility=''); return 1`);
// into the level: skip the push-in and the arrival, then fixed camera poses (override) on the floors
await c.ev("localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
for (let i = 0; i < 60 && (await st()) !== 'PLAYING'; i++) await sleep(500);
await sleep(1500);
await c.ev(`const s=__WD.app.session; for (let i=0;i<40;i++) s.story.skip(); return 1`);
await sleep(1500);
const VIEWS = {
  // F1: the entry yard looking north up the hall: brick, riveted panels, the ruler-marked beam, the lift's wire shutter far off
  hall: { warp: 'start', pos: [-6, 3.2, 19], look: [4, 2.2, -14], fov: 56 },
  // F1: the north strip, the tall wire shutter of the lift at an angle
  shutter: { warp: 'belts', pos: [-2, 2.4, -6], look: [9, 3.4, -19], fov: 58 },
  // F2: across the shredder pit: the hanging platforms, the wire screens of the stair cage
  pit: { warp: 'pit', pos: [12, 12.2, 8], look: [-14, 10.5, -4], fov: 58 },
};
await c.ev(`const s=__WD.app.session; s.debugWarp('start'); s.frozen = true; return 1`);
for (const [v, p] of Object.entries(VIEWS)) {
  await c.ev(`const s=__WD.app.session; const T3 = { Vector3: s.player.pos.constructor }; s.frozen=false; s.debugWarp('${p.warp}'); s.ctx.camera.stopCine();
    s.player.teleport(new T3.Vector3(${p.pos[0]}, ${p.pos[1]} - 2.2, ${p.pos[2]}), 0);
    s.ctx.camera.override = { pos: new T3.Vector3(${p.pos.join(',')}), look: new T3.Vector3(${p.look.join(',')}), fov: ${p.fov} };
    for (const e of s.enemies) if (e !== s.pen && !e.disposed) e.dispose(); // no creature walks or attacks into the frame
    document.querySelector('.hud')?.classList.add('hidden'); return 1`);
  await sleep(1800);
  console.log(v, JSON.stringify(await c.ev(pin)));
  await c.ev(`__WD.app.session.frozen = true; return 1`);
  await sleep(300);
  await shot(v);
  await c.ev(`const o=__WD.app.session.ctx.camera.override; o.pos.x += 0.015; o.look.x += 0.015; return 1`);
  await sleep(300);
  await shot(v + '_b');
  diff(v);
}
console.log('shimmer', JSON.stringify(shimmer));
fs.writeFileSync(`${dir}/${tag}-${W}x${H}@${DPR}-shimmer.json`, JSON.stringify(shimmer));
console.log('done', dir);
process.exit(0);
