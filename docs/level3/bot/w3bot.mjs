// Level-3 bot: plays Limp Works by the guide arrow, all walking (no warps unless argv[2] names a dev stage).
// Fights each creature with its counter (round 3: steps off the Ruler Snake's whip line, runs and jumps out of the
// Compass Spinner's closing circle, paints the needle), lends the stickers to the Guardians, rides the lift, jumps the pit,
// shouts into the Archivist's horn; on the roof souls_brain.js fights the souls-like Red Pen. Usage: node w3bot.mjs [none|stage] [maxSec]
import fs from 'node:fs';
import { connect, sleep } from './lib.mjs';
const c = await connect();
const t00 = Date.now();
const log = (...a) => console.log(((Date.now() - t00) / 1000).toFixed(0).padStart(4) + 's', ...a);
const act = (x) => c.ev(`return WD_AGENT.act(${JSON.stringify(x)})`);
const O = () => c.ev('return WD_AGENT.observe()');
const S = () => c.ev(`const s=__WD.app.session; const b=s.built; const p=s.player.pos; const g=s.guide.target; const pen=s.pen;
  const T3 = s.player.pos.constructor;
  const dir = g ? new T3(g.x-p.x,0,g.z-p.z) : null; let gapAhead=false;
  if (dir && dir.length()>0.5) { dir.normalize(); const a=p.clone().addScaledVector(dir,1.1).setY(p.y+1.0);
    const hit=s.physics.raycast(a,new T3(0,-1,0),3.0,(cc)=>{const t=s.physics.tagOf(cc); return t==='static'||t==='undrawn'||t==='host';}); gapAhead=!hit; }
  const en=s.enemies.filter(e=>!e.disposed&&!e.harmless&&e!==pen&&Math.abs(e.pos.y-p.y)<3&&e.pos.distanceTo(p)<14).map(e=>({id:e.id,k:e.kind,st:e.state,t:+e.stateT.toFixed(2),pos:e.pos.toArray(),f:e.facing,tag:e.canBeTagged,ramUp:e.ramUp,c:e.circle?{x:e.circle.center.x,z:e.circle.center.z,r:e.circle.r,on:e.circle.active,drawn:e.circle.drawn}:null,pa:e.pencilAngle,alerted:e.alerted,
    wl:e.whipLine?{o:[e.whipLine.o.x,e.whipLine.o.z],yaw:e.whipLine.yaw,len:e.whipLine.len,half:e.whipLine.half,on:e.whipLine.on}:null,
    mid:e.J?[(e.J[3].x+e.J[5].x)/2,(e.J[3].y+e.J[5].y)/2,(e.J[3].z+e.J[5].z)/2]:null}));
  return { g: g? g.toArray():null, gapAhead, grounded:s.player.grounded, en,
    woken:[...s.woken], tape:b.hall.tape.open, liftAwake:b.lift.awake, liftTop:b.lift.atTop, riding:b.lift.riding, stair:b.stamping.stairReal, gate:b.archive.gate.open, grille:b.archive.grille.open,
    legs: !!s.inventory.get('LEG'), legCorrupt: !!s.inventory.get('LEG')?.corrupted, legWorn: s.inventory.worn('LEG'), eyeLent: s.inventory.get('EYE')?.hostId ?? null, legLent: s.inventory.get('LEG')?.hostId ?? null,
    legDrop: (s.organs.worldOrgans.find(w=>!w.disposed&&w.organ.type==='LEG')||{}).at?.toArray?.() ?? null,
    archReading: b.archivist.reading, horn: b.archivist.horn.toArray(), insp: b.inspector.host.socketWorld('EYE').toArray(), inspF: [b.inspector.host.forward().x, b.inspector.host.forward().z], arch: b.archivist.host.socketWorld('EYE').toArray(), liftFace: b.lift.host.socketWorld('LEG').toArray(),
    pen: { awake: pen.awake, st: pen.state, t:+pen.stateT.toFixed(2), ph: pen.phase, pos: pen.pos.toArray(), hp: Math.round(pen.hp/pen.maxHp*100), tag: pen.canBeTagged, seen: pen.seen, grip: pen.look.grip.getWorldPosition(new T3()).toArray(),
      ruler: pen.ruler.active, rn: [pen.ruler.n.x, pen.ruler.n.z], roff: pen.ruler.off, rsp: pen.ruler.speed, arena: pen.arena.toArray(),
      tiles: pen.tiles.filter(t=>t.on).map(t=>[t.at.x,t.at.z]) },
    plats: b.stamping.platforms.map(pl=>({c:pl.center.toArray(), ok: pl.present && pl.crooked})),
    done: s.completed, bossDone: s.bossDone, cine: s.ctx.camera.inCine || s.story.locked, time: s.stats.time }`);
const stats = { falls: 0, fights: {} };
let aiming = false;
const aim = async (on) => { if (aiming !== on) { await act({ type: 'aim', on }); aiming = on; } };
const near = (p, q, r) => Math.hypot(q[0] - p[0], q[2] - p[2]) < r && Math.abs(q[1] - p[1]) < 2.5;
const dist = (p, q) => Math.hypot(q[0] - p[0], q[2] - p[2]);

async function fight(o, s) {
  const p = o.player.pos;
  if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) { await aim(false); await act({ type: 'interact' }); await sleep(300); return true; }
  // an empty can: let it refill (spraying on an empty tank refills nothing)
  if (o.player.paintTank < 0.12) { await act({ type: 'stop' }); await sleep(900); return true; }
  const list = s.en.filter((e) => e.alerted || dist(p, e.pos) < 9).sort((a, b) => dist(p, a.pos) - dist(p, b.pos));
  const e = list[0];
  if (!e) return false;
  stats.fights[e.id] = (stats.fights[e.id] ?? 0) + 1;
  // on a hanging platform over the pit: never step anywhere, just paint from where WAI stands
  if (p[1] > 8 && p[1] < 10.5 && Math.abs(p[0]) < 8.2) { if (dist(p, e.pos) > 6.5) return false; await aim(false); await act({ type: 'stop' }); await act({ type: 'spray', seconds: 0.45, at: [e.pos[0], e.pos[1] + 0.5, e.pos[2]] }); return true; }
  const d = dist(p, e.pos);
  await aim(false);
  // F3: the card catalogue (x = 10, z -1.6 … 17.8) splits the Index (x > 10) from the Reading Room; the gate
  // (z 7.9 … 11.1) is the only way through. A compass can follow WAI through the open gate and then sit on the
  // far side, where paint never reaches it (regression 2026-11-14): walk round through the gate.
  if (p[1] > 17 && s.gate && (p[0] - 10) * (e.pos[0] - 10) < 0 && e.pos[2] > -1.6 && e.pos[2] < 17.8 && !(e.pos[2] > 7.9 && e.pos[2] < 11.1)) {
    const side = Math.sign(p[0] - 10);
    const atGate = Math.abs(p[2] - 9.5) < 0.9 && Math.abs(p[0] - 10) < 3.2;
    await act({ type: 'move_to', x: atGate ? 10 - side * 2.5 : 10 + side * 2.5, z: 9.5, run: true });
    return true;
  }
  const fx = Math.sin(e.f), fz = Math.cos(e.f);
  if (e.k === 'stamppress') {
    if (e.st === 'STUCK') {
      // its back: the ink pad
      const back = [e.pos[0] - fx * 1.6, e.pos[2] - fz * 1.6];
      if (Math.hypot(back[0] - p[0], back[1] - p[2]) > 2.2) await act({ type: 'move_to', x: back[0] - fx * 1.2, z: back[1] - fz * 1.2, run: true });
      await act({ type: 'spray', seconds: 0.5, at: [e.pos[0] - fx * 0.6, e.pos[1] + 1.7, e.pos[2] - fz * 0.6] });
      return true;
    }
    if (e.st === 'RUN' || e.st === 'TELL_RUN') {
      // run THROUGH it: aim past its back
      await act({ type: 'move_to', x: e.pos[0] - fx * 3.5, z: e.pos[2] - fz * 3.5, run: true });
      return true;
    }
    if (d < 4) await act({ type: 'move', forward: -1, right: 0.4, seconds: 0.3 });
    await act({ type: 'spray', seconds: 0.4, at: [e.pos[0], e.pos[1] + 1.2, e.pos[2]] });
    return true;
  }
  if (e.k === 'compass') {
    // round 3: the circle goes round WAI and closes on him — get out (jump the drawn line), unless the needle topples first
    if (e.c && e.c.on && (e.st === 'SPIN' || e.st === 'CIRCLE')) {
      const dc = Math.hypot(p[0] - e.c.x, p[2] - e.c.z);
      if (dc < e.c.r + 1.2) {
        const k = (e.c.r + 2.2) / Math.max(0.3, dc);
        await act({ type: 'move_to', x: e.c.x + (p[0] - e.c.x) * k, z: e.c.z + (p[2] - e.c.z) * k, run: true });
        if (Math.abs(dc - e.c.r) < 1.1 && s.grounded) { await act({ type: 'jump' }); await sleep(160); }
        return true;
      }
      await act({ type: 'stop' });
    }
    if (e.st === 'IDLE' || e.st === 'CHASE' || e.st === 'LIFT') {
      if (d < 3) await act({ type: 'move', forward: -1, right: 0, seconds: 0.3 });
      else if (d > 6.5) await act({ type: 'move_to', x: e.pos[0] + ((p[0] - e.pos[0]) * 4.5) / d, z: e.pos[2] + ((p[2] - e.pos[2]) * 4.5) / d, run: true }); // out of spray range: close in
    }
    await act({ type: 'spray', seconds: 0.45, at: [e.pos[0], e.pos[1] + 0.3, e.pos[2]] });
    return true;
  }
  if (e.k === 'rulersnake') {
    // round 3: it rules a red line through WAI, then whips flat along all of it — step off the line (the open side)
    if ((e.st === 'SNAP_TELL' || e.st === 'SNAP') && e.wl) {
      const fx = Math.sin(e.wl.yaw), fz = Math.cos(e.wl.yaw);
      const lat = (p[0] - e.wl.o[0]) * fz - (p[2] - e.wl.o[1]) * fx;
      if (Math.abs(lat) > e.wl.half + 0.8) { await act({ type: 'stop' }); return true; }
      let sg = lat >= 0 ? 1 : -1;
      const open = await c.ev(`const s=__WD.app.session; const V=s.player.pos.constructor; const p=s.player.pos; const ph=s.physics;
        const ok=(sg)=>{ const d=new V(${fz}*sg,0,${-fx}*sg); if (ph.raycast(new V(p.x,p.y+0.8,p.z), d, 2.6, (cc)=>ph.tagOf(cc)==='static')) return false;
          return !!ph.raycast(new V(p.x+d.x*2.6,p.y+0.8,p.z+d.z*2.6), new V(0,-1,0), 1.6, (cc)=>ph.tagOf(cc)==='static'); };
        return [ok(1), ok(-1)]`);
      if (!open[sg > 0 ? 0 : 1] && open[sg > 0 ? 1 : 0]) sg = -sg;
      await act({ type: 'move_to', x: p[0] + fz * sg * 2.6, z: p[2] - fx * sg * 2.6, run: true });
      return true;
    }
    // stretched out after a whip (double paint) or measuring a platform: paint its middle; otherwise keep 4–7 m off
    const at = e.mid ?? [e.pos[0], e.pos[1], e.pos[2]];
    if (e.st !== 'REST' && e.st !== 'MEASURE' && d < 3.5) await act({ type: 'move', forward: -1, right: 0.3, seconds: 0.3 });
    else if (d > 7) await act({ type: 'move_to', x: e.pos[0], z: e.pos[2], run: false });
    await act({ type: 'spray', seconds: 0.45, at: [at[0], at[1] + 0.25, at[2]] });
    return true;
  }
  // the Limp (crooked-leg mutant) and anything else: keep away, spray
  if (d < 4.5) await act({ type: 'move', forward: -1, right: 0.5, seconds: 0.35 });
  else if (d > 9) await act({ type: 'move_to', x: e.pos[0], z: e.pos[2], run: true });
  await act({ type: 'spray', seconds: 0.45, at: [e.pos[0], e.pos[1] + 1.0, e.pos[2]] });
  return true;
}

// The Red Pen fight is souls-like (docs/level3/SOULS.md): it needs frame-exact answers, so on the roof the in-page
// brain (souls_brain.js, the same one souls.mjs uses) takes over: it walks in through the ink gate and fights.
let brainOn = false;
async function soulsBrain() {
  if (brainOn) return;
  brainOn = true;
  await act({ type: 'stop' });
  const brain = fs.readFileSync(new URL('./souls_brain.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, '');
  log('souls brain', await c.ev(`return (${brain})`));
}

const start = process.argv[2] ?? 'none';
const maxSec = +(process.argv[3] ?? 3600);
if (start !== 'none') { await c.ev(`__WD.app.session.debugWarp('${start}'); return 1`); await sleep(1500); }
const tStart = Date.now(); let lastP = null, stuckT = 0, lastLog = 0, lastShot = 0;
const marks = {};
let jumpRun = true;
const mark = async (k, txt) => { if (!marks[k]) { marks[k] = Math.max(1, Math.round((Date.now() - tStart) / 1000)); log(txt); await c.shot('w3_' + k); } };
while ((Date.now() - tStart) / 1000 < maxSec) {
  let o, s;
  try { o = await O(); s = await S(); } catch (err) { log('probe error', String(err).slice(0, 200)); await sleep(500); continue; }
  if (s.done) { await mark('complete', 'LEVEL COMPLETE'); break; }
  if (o.cinematic || s.cine) { if (!brainOn) await act({ type: 'stop' }); await sleep(300); continue; }
  const p = o.player.pos;
  if (s.legs) await mark('legs', 'got the LEGS');
  if (s.woken.includes('lift')) await mark('lift', 'Guardian 1: the lift');
  if (s.liftTop) await mark('f2', 'on F2');
  if (s.woken.includes('inspector')) await mark('inspector', 'Guardian 2: the Inspector');
  if (p[1] > 17) await mark('f3', 'on F3');
  if (s.woken.includes('archivist')) await mark('archivist', 'Guardian 3: the Archivist');
  if (p[1] > 26) await mark('roof', 'on the ROOF');
  if (s.pen.awake) await mark('boss', 'Red Pen engaged');
  if (s.pen.ph >= 2) await mark('ph2', 'phase 2');
  if (s.pen.ph >= 3) await mark('ph3', 'phase 3');
  if (s.pen.st === 'FINAL') await mark('final', 'FINAL (TAG)');
  if (s.bossDone) await mark('won', 'the Red Pen DRAWS');
  if (Date.now() - lastLog > (process.env.FAST ? 2000 : 10000)) { lastLog = Date.now(); log('pos', JSON.stringify(p.map((v) => +v.toFixed(1))), 'hp', o.player.hp, '|', o.hint, '| guide', JSON.stringify(s.g?.map((v) => +v.toFixed(1))), s.pen.awake ? `pen ${s.pen.st} ph${s.pen.ph} ${s.pen.hp}%` : '', JSON.stringify(s.en.map((e) => [e.id.slice(3, 14), e.st, e.pos.map((v) => Math.round(v))]))); }
  if (Date.now() - lastShot > 45000) { lastShot = Date.now(); await c.shot('w3_t' + Math.round((Date.now() - tStart) / 1000)); }
  // stickers
  if (s.legCorrupt) { await act({ type: 'stop' }); await c.ev("__WD.app.input.virtualDown('KeyF'); return 1"); await sleep(1700); await c.ev("__WD.app.input.virtualUp('KeyF'); return 1"); continue; }
  if (s.legDrop && !s.legs) { await act({ type: 'move_to', x: s.legDrop[0], z: s.legDrop[2], run: true }); await sleep(300); continue; }
  if (s.bossDone) { if (!brainOn) await act({ type: 'stop' }); await sleep(400); continue; }
  if (p[1] > 26 && s.woken.length === 3) { await soulsBrain(); await sleep(400); continue; }
  // mid-air over the pit: keep flying to the arrow (backing away from a snake now drops WAI in)
  if (!s.grounded && p[1] > 8 && p[1] < 13 && Math.abs(p[0]) < 10 && s.g) { await act({ type: 'move_to', x: s.g[0], z: s.g[2], run: jumpRun }); await sleep(120); continue; }
  if (await fight(o, s)) { await sleep(140); continue; }
  await aim(false);
  // Guardians
  const lendAt = async (face, organ, host, dz = 1.3, dx = 0) => {
    const tx = face[0] + dx, tz = face[2] + dz;
    if (Math.hypot(tx - p[0], tz - p[2]) > 0.8) { await act({ type: 'move_to', x: tx, z: tz, run: false }); await sleep(400); return; }
    await act({ type: 'stop' }); await act({ type: 'look_at', x: face[0], y: face[1], z: face[2] }); await sleep(300);
    await act({ type: 'lend', organ, host }); await sleep(2500);
  };
  if (s.legWorn && !s.woken.includes('lift') && s.tape && dist(p, s.liftFace) < 9 && p[1] < 2) { await lendAt(s.liftFace, 'LEG', 'freight-lift'); continue; }
  if (!s.woken.includes('inspector') && s.liftTop && dist(p, s.insp) < 9 && Math.abs(p[1] - 9) < 1 && !s.eyeLent && /lens is crossed out/.test(o.hint)) { await lendAt(s.insp, 'EYE', 'inspector', s.inspF[1] * 2.0, s.inspF[0] * 2.0); continue; }
  if (!s.woken.includes('archivist') && s.gate && dist(p, s.arch) < 9 && p[1] > 17) {
    if (!s.eyeLent && /can’t read/.test(o.hint)) { await lendAt(s.arch, 'EYE', 'archivist', 0, -2.0); continue; }
    if (s.eyeLent === 'archivist') { await act({ type: 'look_at', x: s.horn[0], y: s.horn[1], z: s.horn[2] }); await sleep(250); await act({ type: 'shout', at: s.horn, big: false }); await sleep(900); continue; }
  }
  // the pit: never jump at a platform that a snake has straightened (it is falling / gone) — wait on the rim
  if (s.g && s.plats) {
    const pl = s.plats.find((q) => dist(q.c, s.g) < 0.6);
    if (pl && !pl.ok && s.grounded && Math.abs(p[0]) > 7.6) { await act({ type: 'stop' }); await sleep(400); continue; }
  }
  // follow the arrow; jump gaps (the shredder pit) and ledges (the dock)
  if (s.g) {
    // on a hanging platform: walk (a long-legged sprint jump from a platform overshoots the next one)
    const onPlat = p[1] > 8.5 && p[1] < 10 && Math.abs(p[0]) < 7.9;
    await act({ type: 'move_to', x: s.g[0], z: s.g[2], run: !onPlat });
    if (s.gapAhead && s.grounded && p[1] > 8 && p[1] < 10) { jumpRun = !onPlat; await act({ type: 'jump' }); await sleep(250); }
    if (s.g[1] - p[1] > 1.2 && s.grounded && dist(p, s.g) < 4.5) { await act({ type: 'jump' }); await sleep(200); }
  }
  if (lastP && dist(lastP, p) < 0.05) { stuckT += 0.3; if (stuckT > 6) { log('STUCK at', JSON.stringify(p), 'guide', JSON.stringify(s.g)); await c.shot('w3_stuck'); stuckT = 0; await act({ type: 'jump' }); await act({ type: 'move', forward: -1, right: 1, seconds: 0.6 }); } } else stuckT = 0;
  if (lastP && p[1] < lastP[1] - 2.5) stats.falls++;
  lastP = p;
  await sleep(250);
}
await aim(false);
const o = await O();
const gameT = await c.ev('return __WD.app.session.stats.time');
log('END marks', JSON.stringify(marks), 'game time', gameT.toFixed(0), 'hp', o.player.hp, 'falls', stats.falls, 'errs', JSON.stringify(await c.ev('return (window.__errs||[]).slice(-5)')));
log('fights', JSON.stringify(stats.fights));
await c.shot('w3_end');
process.exit(0);
