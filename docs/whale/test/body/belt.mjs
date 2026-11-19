// Level 3: both stand still on a conveyor belt for 2 s; the belt carries both the same way (WAI: session, her: PipWorld).
import { connect } from './lib.mjs';
const c = await connect();
const out = await c.ev(`
  __WD.app.loop.stop();
  const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  for (const e of s.enemies) { e.alerted = false; e.step = () => {}; }
  s.debugWarp('belts'); __WD.advance(1);
  p.setStance({ mode: 'stay' }, 'api');
  const b = s.built.hall.belts[0];
  s.player.teleport(new T(-6, b.top + 0.05, (b.z0 + b.z1) / 2), Math.PI / 2);
  const at = new T(-3, b.top + 0.05, (b.z0 + b.z1) / 2);
  pip.teleportNear(at, 0, 'regroup', true); pip.nudgeTo(at); pip.body.setTranslation({ x: at.x, y: b.top + 0.5, z: at.z }, true); pip.pos.copy(at);
  __WD.advance(0.3);
  p.setStance({ mode: 'stay' }, 'api'); // her "stay" spot = on the belt: she would walk back against it otherwise
  p.standing.at = null; p.auto = { mode: 'hold', at: null, until: Infinity, by: 'rules' };
  pip.goal = null;
  const w0 = s.player.pos.clone(), p0 = pip.pos.clone();
  const log = [];
  for (let i = 0; i < 20; i++) { p.standing = { mode: 'follow', since: 0 }; p.order = { mode: 'spray', at: pip.pos.clone().add(new T(0,0,3)), until: p.time + 99, by: 'api' }; __WD.advance(0.1); if (i % 5 === 4) log.push({ wai: +(s.player.pos.x - w0.x).toFixed(2), pip: +(pip.pos.x - p0.x).toFixed(2), on: pip.world.on }); }
  return JSON.stringify({ belt: { vx: b.vx }, log }, null, 0);
`);
console.log(out);
await c.shot('belt');
process.exit(0);
