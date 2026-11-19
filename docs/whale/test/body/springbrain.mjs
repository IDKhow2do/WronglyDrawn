// WAI stands where a painted spring lands; the partner, below, follows him: does she use the spring herself?
// Usage: node springbrain.mjs <springIndex> [seconds]
import { connect } from './lib.mjs';
const c = await connect();
const i = Number(process.argv[2] ?? 2), secs = Number(process.argv[3] ?? 14);
const out = await c.ev(`
  __WD.app.loop.stop(); // deterministic: only __WD.advance moves the game
  const s = __WD.session, a = s.ambient3, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  const sp = a.springs[${i}];
  for (const e of s.enemies) if (e.pos.distanceTo(sp.spot.pos) < 40) { e.alerted = false; e.step = () => {}; }
  if (!sp.done) { sp.done = true; sp.outline.visible = false; a.makeSpringPad(sp); }
  s.player.teleport(sp.spot.target.clone().setY(sp.spot.target.y + 0.3), 0);
  __WD.advance(0.8);
  const away = sp.spot.pos.clone().add(new T(-5, 0, 2));
  const anchor = sp.spot.pos.clone().add(new T(${Number(process.env.DX ?? -8)}, 0, ${Number(process.env.DZ ?? 0)})); pip.teleportNear(anchor, 0, 'regroup', true);
  const t0 = pip.teleports, log = [];
  let bounced = -1; const start = pip.pos.clone();
  for (let t = 0; t < ${secs}; t += 0.25) {
    __WD.advance(0.25);
    if (pip.leaping && bounced < 0) bounced = +t.toFixed(2);
    if (Math.abs(t * 4 % 4) < 0.01) log.push(t.toFixed(0) + 's pip ' + [pip.pos.x, pip.pos.y, pip.pos.z].map((v) => v.toFixed(1)) + ' heading=' + (pip.world.heading ? 'spring' : '-') + ' goal=' + (pip.goal ? [pip.goal.x, pip.goal.y, pip.goal.z].map((v) => v.toFixed(1)) : null));
  }
  return JSON.stringify({ start, startToPad: +start.distanceTo(sp.spot.pos).toFixed(1), wai: s.player.pos, pip: pip.pos, bounced, teleports: pip.teleports - t0, tl: pip.teleportLog.slice(-2), dist: +pip.pos.distanceTo(s.player.pos).toFixed(1), log }, null, 1);
`);
console.log(out);
await c.shot('brain-spring-end');
process.exit(0);
