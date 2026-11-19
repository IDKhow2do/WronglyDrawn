// Frame strip: WAI in the Inkwell corner, slow mouse sweep; a shot every 2nd frame (20 shots) + per-frame numbers.
// Usage: node strip.mjs <tag> [x y z yaw sweep]   (page: plaza at the inkwell stage, probe injected)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
process.env.WD_SHOTS ??= '/tmp/wd-cam/shots';
const { connect } = await import('<local-path>');
const c = await connect();
const [tag = 'x', x = '49', y = '13.1', z = '-23.85', yaw = '4.71', sweep = '0.4'] = process.argv.slice(2);
await c.ev(fs.readFileSync('/tmp/wd-cam/probe.js', 'utf8') + '; return 1');
await c.ev(`__cam.freeze(); __cam.place(${x},${y},${z},${yaw}); __cam.run(60,{keepHp:true}); return 1`);
const fr = [];
const dir = `/tmp/wd-cam/shots/strip_${tag}`;
fs.mkdirSync(dir, { recursive: true });
process.env.WD_SHOTS = dir;
for (let i = 0; i < 40; i++) {
  const r = await c.ev(`const r = __cam.run(1,{keepHp:true,sweep:${sweep},keep:true}); __WD.app.renderer.render(); return r.fr[0]`);
  fr.push(r);
  if (i % 2 === 0) await c.shot(String(i / 2).padStart(2, '0'));
}
const m = await c.ev(`return __cam.metric(${JSON.stringify(fr)})`);
console.log(JSON.stringify(m));
console.log(fr.map((f) => `${f.close.toFixed(2)}`).join(' '));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/%02d.jpg`, '-vf', 'scale=384:-1,tile=5x4:padding=4', '-frames:v', '1', `/tmp/wd-cam/shots/strip_${tag}.jpg`]);
fs.writeFileSync(`/tmp/wd-cam/strip-${tag}.json`, JSON.stringify({ m, fr }));
process.exit(0);
