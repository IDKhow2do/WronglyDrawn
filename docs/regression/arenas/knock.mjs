// Boss / mid-boss arenas: can a knock, a charge, a push-out or a buck-off carry WAI out where he cannot walk back?
// Per arena and trial: WAI stands `gap` m in front of a wall (found by a ray from the centre: the tower door, a rim
// segment, the south gap's crumb heap…), the boss 4 m further in. Then one of:
//   charge  the Eraser's real RUB at him (Eraser only)
//   knock   takeHit from the boss's side with the arena's strongest knock (16 Eraser, 12 Hush, 26 the Pen's ruler)
//   buck    the "SHOO!" leap off the boss's head toward that wall (EnemyBase.shakeOff: bodyRadius·2 + 2.2 m, vy 7)
//   hop     WAI jumps off the boss's head toward that wall with the Leg Sticker's jump (2.9 m: vy 11.8, 4 m)
//   net     the safety net alone: WAI is put straight into an out-of-arena spot (behind the wall at that angle, 1.2 m
//           past it, or 3 m below the floor on odd trials) and must be back inside within GRACE + a little, hearts and
//           boss paint unchanged
// Out = past the rim, below the floor, or walled off: every probe ray from inside the arena (centre + 4 points at half
// the radius, waist height, walls only) meets a wall before reaching him (the same test as src/level/ArenaGuard.ts,
// written out here so it also runs on the old build).
// (The mid-boss squares are not locked circles: midboss.mjs checks them.)
// Usage: ONLY=eraser,hush,pen DIFF=normal WD_VITE=5301 node docs/regression/arenas/knock.mjs
import { connect } from './lib.mjs';
const c = await connect();
const DIFF = process.env.DIFF || 'normal';
const ONLY = (process.env.ONLY || 'eraser,hush,pen').split(',');
const QUICK = !!process.env.QUICK;

const SETUP = {
  eraser: {
    level: 'plaza',
    go: `const s=__WD.session; s.debugWarp('statue'); s.debugWarp('summit'); return 1`,
    enter: `const s=__WD.session; s.player.teleport(s.eraser.arena.clone().add(new s.player.pos.constructor(0,0.3,5)), Math.PI); return 1`,
    awake: 'return __WD.session.eraser.awake',
    boss: '__WD.session.eraser', C: '__WD.session.eraser.arena', R: 9.5, knock: 16, locked: true, modes: ['charge', 'knock', 'buck', 'hop', 'net'],
  },
  hush: {
    level: 'harbor',
    go: `const s=__WD.session; s.debugWarp('lighthouse'); s.hushRisen=true; return 1`,
    enter: `const s=__WD.session; s.player.teleport(s.hush.arena.clone().add(new s.player.pos.constructor(0,0.3,0))); return 1`,
    awake: 'return __WD.session.hush.awake',
    boss: '__WD.session.hush', C: '__WD.session.hush.arena', R: 9.5, knock: 12, locked: true, modes: ['knock', 'buck', 'hop', 'net'],
  },
  pen: {
    level: 'works',
    go: `__WD.session.debugWarp('phase2'); return 1`,
    enter: `return 1`,
    awake: `return __WD.session.souls.mode === 'on'`,
    boss: '__WD.session.pen', C: '__WD.session.souls.host.ring.center', R: null, knock: 26, locked: true, modes: ['knock', 'net'],
  },
};

const all = {};
for (const name of ONLY) {
  const A = SETUP[name];
  await c.load(A.level, DIFF);
  await c.ev(A.go);
  await c.adv(1);
  await c.ev(A.enter);
  for (let i = 0; i < 30 && !(await c.ev(A.awake)); i++) await c.adv(0.3);
  await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
  await c.adv(3);
  const ok = await c.ev(A.awake);
  // page side: the centre, the out test, one trial
  await c.ev(`
    const s=__WD.session, p=s.player, V=p.pos.constructor, e=${A.boss}, ph=s.ctx.physics;
    const C=${A.C}.clone(); C.y = ${A.C}.y;
    const R=${A.R ?? '__WD.session.souls.host.ring.R'};
    const wall=(c)=>{const t=ph.tagOf(c); return t==='static'||t==='gate'||t==='barrier'||t==='undrawn';};
    const ray=(o,d,len)=>ph.raycast(o,d,len,wall);
    window.__A={C:C.toArray(), R};
    window.__walled=(pos)=>{ const to=new V(pos.x,pos.y+0.8,pos.z);
      for (let i=0;i<5;i++){ const a=i*Math.PI/2, r=i===4?0:R*0.5; const f=new V(C.x+Math.cos(a)*r, C.y+0.8, C.z+Math.sin(a)*r);
        const d=to.clone().sub(f); const len=d.length(); if (len<0.3) return false; if (!ray(f,d.divideScalar(len),len)) return false; } return true; };
    window.__out=()=>{ const r=Math.hypot(p.pos.x-C.x,p.pos.z-C.z); return p.pos.y < C.y-1.5 || r > R+0.5 || __walled(p.pos); };
    window.__trial=(mode, ang, gap)=>{
      const dir=new V(Math.cos(ang),0,Math.sin(ang)); window.__paint0=undefined;
      const o=new V(C.x, C.y+0.8, C.z);
      const hit=ray(o,dir,R+3); const wallR=Math.min(hit?hit.dist:R, R+0.5);
      const wr=Math.max(0.5, wallR-0.33-gap), er=Math.max(0, wr-4.2);
      const wp=C.clone().addScaledVector(dir,wr); wp.y=C.y+0.05;
      const ep=C.clone().addScaledVector(dir,er);
      if (e.setState && e.state!==undefined && ${A.locked}) { try{ e.setState('IDLE'); }catch{} }
      if ('attackCd' in e) e.attackCd=99;
      try{ e.hideTells?.(); }catch{}
      if (${name === 'eraser'}) { ep.y=C.y+0.05; e.pos.copy(ep); e.prevPos.copy(ep); e.facing=Math.atan2(dir.x,dir.z); e.body.setTranslation({x:ep.x,y:ep.y+e.cOff,z:ep.z},true); }
      p.teleport(wp, ang); p.hp=6; p.invuln=0;
      if (mode==='charge') { e.dashDir.copy(dir); e.hitDone=false; e.setState('RUB'); }
      if (mode==='knock') { p.takeHit(C.clone().addScaledVector(dir, wr-1.5), 2, ${A.knock}); }
      if (mode==='hop') { const top=e.pos.clone(); top.y=e.topY+0.05; top.x=C.x+dir.x*er; top.z=C.z+dir.z*er; p.teleport(top, ang); p.leap(dir, 4, 11.8); }
      if (mode==='net') { const out=C.clone().addScaledVector(dir, wallR+1.2); out.y = gap>0.5 ? C.y-3 : C.y+0.05; p.teleport(out, ang); p.hp=4; window.__paint0=e.hp; }
      if (mode==='buck') { const top=e.pos.clone(); top.y=e.topY+0.05; top.x=C.x+dir.x*er; top.z=C.z+dir.z*er; p.teleport(top, ang); p.leap(dir, e.bodyRadius*2+2.2, 7); }
      return {wallR:+wallR.toFixed(2), wall: hit? ph.tagOf(hit.collider): 'none'};
    };
    window.__read=()=>({ out: __out(), pos: p.pos.toArray().map(v=>+v.toFixed(2)), hp: p.hp, paint: +(e.hp/e.maxHp).toFixed(4), returns: (s.arenaGuard ?? s.souls?.guard)?.returns ?? null });
    return 1`);
  const res = [];
  const n = QUICK ? 12 : 24;
  const angles = [];
  for (let i = 0; i < n; i++) angles.push((i / n) * Math.PI * 2);
  if (name === 'eraser') for (const k of [-0.18, -0.09, 0.09, 0.18]) angles.push(-Math.PI / 2 + k); // around the tower door (north)
  for (const mode of A.modes) {
    for (const ang of angles) for (const gap of [0.1, 1.0]) {
      const w = await c.ev(`return __trial('${mode}', ${ang}, ${gap})`);
      let left = false, at = null;
      for (let i = 0; i < 12; i++) { await c.adv(0.1); const r = await c.ev('return __read()'); if (r.out) { left = true; at = at ?? r; } }
      const end = await c.ev('return __read()');
      let back = !end.out, backT = 0;
      if (end.out) for (let i = 0; i < 40 && !back; i++) { await c.adv(0.1); backT += 0.1; back = !(await c.ev('return __read()')).out; }
      const fin = await c.ev('return __read()');
      const paintSame = await c.ev('return window.__paint0 === undefined || window.__paint0 === ' + A.boss + '.hp');
      const netT = mode === 'net' ? (end.out ? 1.2 + backT : (at ? 0.1 : 0)) : 0;
      res.push({ mode, ang: +((ang * 180) / Math.PI).toFixed(0), gap, wall: w.wall, wallR: w.wallR, left, endOut: end.out, at: at?.pos, end: end.pos, back, backT: +backT.toFixed(1), hp: [end.hp, fin.hp], paint: [end.paint, fin.paint], returns: fin.returns, hpFin: fin.hp, paintSame, netT: +netT.toFixed(1) });
    }
  }
  const sum = {};
  for (const r of res) {
    const s = (sum[r.mode] ??= { trials: 0, leftEver: 0, endedOut: 0, stuckOut4s: 0, putBack: 0, heartsChangedOnPutBack: 0, paintChangedOnPutBack: 0 });
    s.trials++; if (r.left) s.leftEver++; if (r.endOut) s.endedOut++; if (r.endOut && !r.back) s.stuckOut4s++;
    if (r.endOut && r.back) { s.putBack++; if (r.hp[1] !== r.hp[0]) s.heartsChangedOnPutBack++; if (r.paint[1] !== r.paint[0]) s.paintChangedOnPutBack++; }
    if (r.mode === 'net') { s.finalInside = (s.finalInside ?? 0) + (r.back ? 1 : 0); s.hp4 = (s.hp4 ?? 0) + (r.hpFin === 4 ? 1 : 0); s.paintSame = (s.paintSame ?? 0) + (r.paintSame ? 1 : 0); s.maxBackT = Math.max(s.maxBackT ?? 0, r.netT); }
  }
  all[name] = { awake: ok, arena: await c.ev('return __A'), sum };
  console.log('ARENA', name, JSON.stringify(all[name]));
  for (const r of res.filter((r) => r.left)) console.log('  OUT', name, JSON.stringify(r));
}
console.log('ALL', JSON.stringify(all));
console.log('ERRS', JSON.stringify(await c.ev('return window.__errs ?? []').catch(() => 'n/a')));
process.exit(0);
