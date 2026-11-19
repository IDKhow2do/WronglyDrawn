// Mid-boss squares (not locked): where does a knock leave WAI? Red Inkwell (Inkwell Square) and Red Gramophone (bandstand).
// Spots: a grid round the boss, kept only where WAI can stand on the fight floor (ground ray hits a wall-tagged
// collider within 0.6 m of the floor; for the Inkwell also inSquare()). Each spot: knock away from the boss with its
// own knock (Inkwell 6, Gramophone 7) and with the game's strongest (16). End states after 2.5 s:
//   inside  still on the fight floor;  walkout  off it but standing within 1.2 m of the floor height (walks back in);
//   fell    lower than that (the level's fall rules take over: tear / water / canvas edge);  far  teleported (a respawn)
// Usage: ONLY=inkwell,gramophone WD_VITE=5301 node midboss.mjs
import { connect } from './lib.mjs';
const c = await connect();
const ONLY = (process.env.ONLY || 'inkwell,gramophone').split(',');
const SET = {
  inkwell: { level: 'plaza', warp: 'inkwell', boss: '__WD.session.quarter.inkwell', own: 6, inside: `s.level.quarter.inSquare(p.pos)` },
  gramophone: { level: 'harbor', warp: 'gramophone', boss: '__WD.session.pier.gramophone', own: 7, inside: `Math.hypot(p.pos.x-e.pos.x,p.pos.z-e.pos.z) < 9.5` },
};
const out = {};
for (const name of ONLY) {
  const A = SET[name];
  await c.load(A.level, 'normal');
  await c.ev(`__WD.session.debugWarp('${A.warp}'); return 1`);
  for (let i = 0; i < 20 && !(await c.ev(`return ${A.boss}.alerted`)); i++) await c.adv(0.3);
  await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
  await c.adv(2);
  const spots = await c.ev(`const s=__WD.session, p=s.player, e=${A.boss}, V=p.pos.constructor, ph=s.ctx.physics;
    const floor = p.pos.y; const res=[];
    for (let dx=-12; dx<=12; dx+=2) for (let dz=-12; dz<=12; dz+=2) {
      const x=e.pos.x+dx, z=e.pos.z+dz; if (Math.hypot(dx,dz) < 3) continue;
      const h=ph.raycast(new V(x, floor+4, z), new V(0,-1,0), 8, (c)=>ph.isWall(c)); if (!h || Math.abs(h.point.y-floor) > 0.6) continue;
      const save=p.pos.clone(); p.pos.set(x,h.point.y,z); const ok=${A.inside}; p.pos.copy(save); if (ok) res.push([x,h.point.y,z]); }
    return {floor, res}`);
  const rows = [];
  const pick = spots.res.filter((_, i) => i % Math.max(1, Math.floor(spots.res.length / 24)) === 0).slice(0, 24);
  for (const k of [A.own, 16]) for (const sp of pick) {
    await c.ev(`const s=__WD.session, p=s.player, e=${A.boss}, V=p.pos.constructor; if ('attackCd' in e) e.attackCd=99;
      p.teleport(new V(${sp[0]},${sp[1] + 0.05},${sp[2]})); p.hp=6; p.invuln=0; p.takeHit(e.pos.clone().setY(p.pos.y), 1, ${k}); return 1`);
    await c.adv(2.5);
    const r = await c.ev(`const s=__WD.session, p=s.player, e=${A.boss}; const inside=${A.inside} && Math.abs(p.pos.y-(${spots.floor}))<0.8;
      const moved=Math.hypot(p.pos.x-(${sp[0]}),p.pos.z-(${sp[2]})); const dy=p.pos.y-(${spots.floor});
      return {pos:p.pos.toArray().map(v=>+v.toFixed(2)), state: moved>25 ? 'far' : inside ? 'inside' : dy > -1.2 ? 'walkout' : 'fell'}`);
    rows.push({ knock: k, from: sp.map((v) => +v.toFixed(1)), ...r });
  }
  const sum = {};
  for (const r of rows) { const s = (sum['knock' + r.knock] ??= { inside: 0, walkout: 0, fell: 0, far: 0 }); s[r.state]++; }
  out[name] = { spots: spots.res.length, used: pick.length, sum };
  console.log('MIDBOSS', name, JSON.stringify(out[name]));
  for (const r of rows.filter((r) => r.state === 'fell' || r.state === 'far')) console.log('  ', name, JSON.stringify(r));
}
console.log('ERRS', JSON.stringify(await c.ev('return window.__errs ?? []').catch(() => 'n/a')));
process.exit(0);
