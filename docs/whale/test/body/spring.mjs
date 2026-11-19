// WAI and the partner launched by the same painted spring, side by side. Frames every 0.1 s.
// Usage: node spring.mjs <springIndex> <shotPrefix> [frames]
import { connect } from './lib.mjs';
const c = await connect();
const i = Number(process.argv[2] ?? 0), pre = process.argv[3] ?? 'spring', n = Number(process.argv[4] ?? 18);
const setup = await c.ev(`
  __WD.app.loop.stop(); // deterministic: only __WD.advance moves the game
  const s = __WD.session, a = s.ambient3, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  const sp = a.springs[${i}];
  // a quiet test: creatures nearby forget us (no fight in the frames)
  for (const e of s.enemies) if (e.pos.distanceTo(sp.spot.pos) < 30) { e.alerted = false; e.step = () => {}; }
  if (!sp.done) { sp.done = true; sp.outline.visible = false; a.makeSpringPad(sp); }
  const to = sp.spot.target.clone().sub(sp.spot.pos).setY(0).normalize();
  const side = new T(to.z, 0, -to.x);
  // both stand 1.6 m short of the pad, side by side, then walk onto it
  s.player.teleport(sp.spot.pos.clone().addScaledVector(to, -1.6).addScaledVector(side, -0.42), Math.atan2(to.x, to.z));
  s.ctx.camera.yaw = Math.atan2(to.x, to.z) + 0.9;
  __WD.advance(0.6);
  pip.teleportNear(s.player.pos, s.player.facing, 'regroup', true);
  window.__sp = { sp, to, side };
  return JSON.stringify({ pad: sp.spot.pos, target: sp.spot.target });
`);
console.log('setup', setup);
const rows = [];
for (let k = 0; k <= n; k++) {
  const r = await c.ev(`
    const s = __WD.session, pip = WD_COOP.partner.pip, { sp, to, side } = window.__sp;
    if (${k} === 0) {
      // put both on the pad's rim, the same frame (the spring throws whoever is on it)
      s.player.teleport(sp.spot.pos.clone().addScaledVector(to, -0.42), Math.atan2(to.x, to.z));
      const c2 = sp.spot.pos.clone().addScaledVector(to, 0.42);
      pip.teleportNear(c2, 0, 'regroup', true); pip.nudgeTo(c2); pip.body.setTranslation({x:c2.x, y:sp.spot.pos.y + 0.48, z:c2.z}, true); pip.pos.copy(c2);
    }
    s.ctx.camera.yaw = Math.atan2(to.x, to.z) + Math.PI / 2 * (window.__camSide ?? 1);
    __WD.advance(0.1);
    const f = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    return { t: +((${k} + 1) * 0.1).toFixed(1), waiVy: +s.player.vy.toFixed(2), pipVy: +pip.vy.toFixed(2), wai: f(s.player.pos), pip: f(pip.pos), waiG: s.player.grounded, pipG: pip.grounded, pipLeap: pip.leaping };
  `);
  rows.push(r);
  await c.shot(`${pre}-${String(k).padStart(2, '0')}`);
}
const peak = (key) => Math.max(...rows.map((r) => r[key][1]));
const base = rows[0];
console.log(rows.map((r) => `${r.t}s WAI y=${r.wai[1]} vy=${r.waiVy} ${r.waiG ? 'G' : ' '} | Pip y=${r.pip[1]} vy=${r.pipVy} ${r.pipG ? 'G' : ' '}${r.pipLeap ? ' leap' : ''}`).join('\n'));
console.log(JSON.stringify({ waiPeak: peak('wai'), pipPeak: peak('pip'), waiEnd: rows.at(-1).wai, pipEnd: rows.at(-1).pip }));
process.exit(0);
