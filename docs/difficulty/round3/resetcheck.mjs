// Round 3: does a smudge restart each boss fight cleanly (Normal / Hard) and keep it as it was (Gentle)?
// Per boss: start the fight, damage it past its first phase gate, add summons + hazards, smudge WAI, let him respawn,
// then read paint, phase, leftovers, cut-ins, music and the boss bar.
// Usage: DIFF=normal|gentle|hard [ONLY=eraser,inkwell,hush,gramophone,pen] node resetcheck.mjs   (Vite :5295, Chrome :9395)
import { connect, sleep } from '../bot/l1/lib.mjs';
const c = await connect();
const PORT = process.env.WD_VITE || 5295;
const DIFF = process.env.DIFF || 'normal';
const ONLY = (process.env.ONLY || 'eraser,inkwell,hush,gramophone,pen').split(',');
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const load = async (level) => {
  await c.send('Page.navigate', { url: `http://localhost:${PORT}/?test&difficulty=${DIFF}&level=${level}&style=graffiti` });
  for (let i = 0; i < 160 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await c.ev("localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 100 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 160 && (await c.ev("return document.querySelector('.hud')?.classList.contains('hidden')")); i++) await sleep(500);
  // count camera cut-ins and toasts from here on
  await c.ev(`window.__r={cines:0, toasts:[]}; const cam=__WD.app.camera; const pc=cam.playCine.bind(cam);
    cam.playCine=(...a)=>{window.__r.cines++; return pc(...a)};
    __WD.session.events.on('toast', (e)=>window.__r.toasts.push(e.text)); return 1`);
};
const adv = (sec) => c.ev(`__WD.advance(${sec}); return 1`);
// shared page-side helpers: damage a share of maxHp, read the boss bar
const H = `const V=__WD.session.player.pos.constructor;
  const dmg=(e,f,kind='paint')=>e.applyDamage({amount:f*e.maxHp, point:e.pos.clone().setY(e.pos.y+1.5), dir:new V(0,0,-1), collider:null, kind, color:'#2a4be0'});
  const bar=()=>{const b=document.querySelector('.boss'); return b && !b.classList.contains('hidden') ? parseFloat(document.querySelector('.boss-fill').style.width) : null};`;

/** Smudge WAI and read the boss through the respawn and the refill. `read` = page-side expression for boss-specific state. */
async function smudgeAndRead(get, read) {
  const before = await c.ev(`${H} const e=${get}; return {paint:+(e.hp/e.maxHp).toFixed(3), ${read}}`);
  await c.ev(`window.__r.cines=0; window.__r.toasts=[]; __WD.session.player.hp=0; return 1`);
  await adv(0.2);
  const smudged = await c.ev(`return __WD.session.player.smudged`);
  // the session's smudge beat → respawn (souls fight: longer), then the refill sampled every 0.35 s
  for (let i = 0; i < 40 && (await c.ev('return __WD.session.player.smudged')); i++) await adv(0.1);
  const refill = [];
  for (let i = 0; i < 5; i++) {
    await adv(0.35);
    refill.push(await c.ev(`${H} const e=${get}; return [+(e.hp/e.maxHp).toFixed(3), e.refilling, bar()]`));
  }
  await adv(0.5);
  const after = await c.ev(`${H} const e=${get}; return {paint:+(e.hp/e.maxHp).toFixed(3), refilling:e.refilling, state:e.state, ${read}, mood:__WD.session.mood, bar:bar(), cinesSinceSmudge:window.__r.cines, toasts:window.__r.toasts}`);
  return { before, smudged, refill, after };
}
const out = {};

// ── Eraser (level 1 boss) ──
if (ONLY.includes('eraser')) {
  await load('plaza');
  await c.ev(`const s=__WD.session; s.debugWarp('statue'); s.debugWarp('summit'); return 1`);
  await adv(1);
  await c.ev(`const s=__WD.session; s.player.teleport(s.eraser.arena.clone().add(new s.player.pos.constructor(0,0.3,5)), Math.PI); return 1`);
  for (let i = 0; i < 20 && !(await c.ev('return __WD.session.eraser.awake')); i++) await adv(0.3);
  const cinesIntro = await c.ev('return window.__r.cines');
  await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
  await adv(3);
  // to phase 2 (past the ⅔ gate's roar) and on to ≈ 45 %
  for (let i = 0; i < 60; i++) {
    const r = await c.ev(`${H} const e=__WD.session.eraser; if (e.hp/e.maxHp > 0.45) dmg(e,0.05); return [e.phase, e.gates.length, +(e.hp/e.maxHp).toFixed(2)]`);
    if (r[0] >= 2 && r[2] <= 0.45) break;
    await adv(0.5);
  }
  await c.ev(`const s=__WD.session, e=s.eraser, V=s.player.pos.constructor;
    e.onSummon(e.pos.clone().add(new V(3,0,0))); e.crumbAt(s.player.pos.clone(), e.pos.clone().add(new V(0,3.5,0)), 4); e.shockwave(3, 1); return 1`);
  const read = `phase:e.phase, gates:e.gates.length, armorT:+e.armorT.toFixed(2), crumbs:e.crumbs.length, rings:e.rings.filter(r=>r.active).length, tells:[e.lane,e.shadow,e.spinRim,e.spinFill].filter(m=>m.visible).length,
    grubsLeft:(__WD.session.summons.get(e)??[]).filter(g=>!g.harmless&&!g.disposed).length, awake:e.awake, alerted:e.alerted`;
  out.eraser = { cinesIntro, ...(await smudgeAndRead('__WD.session.eraser', read)) };
  console.log('ERASER', JSON.stringify(out.eraser));
}

// ── Red Inkwell (level 1 mid-boss) ──
if (ONLY.includes('inkwell')) {
  await load('plaza');
  await c.ev(`const s=__WD.session; s.debugWarp('inkwell'); window.__r.wakes=0; const ink=s.quarter.inkwell; const w=ink.onWake; ink.onWake=()=>{window.__r.wakes++; w&&w()}; return 1`);
  for (let i = 0; i < 20 && !(await c.ev('return __WD.session.quarter.inkwell.alerted')); i++) await adv(0.3);
  await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
  await adv(2);
  for (let i = 0; i < 60; i++) {
    const r = await c.ev(`${H} const e=__WD.session.quarter.inkwell; if (e.state==='FIGHT' && !e.corked && e.hp/e.maxHp > 0.4) dmg(e,0.05,'paint'); if (e.corked && e.state==='FIGHT') dmg(e,0.01,'stomp'); return [e.phase, +(e.hp/e.maxHp).toFixed(2), e.state]`);
    if (r[0] >= 1 && r[1] <= 0.4) break;
    await adv(0.5);
  }
  await c.ev(`const s=__WD.session, e=s.quarter.inkwell; e.flick(s.player, 3); return 1`);
  const read = `phase:e.phase, corked:e.corked, helperLeft: !!(e.helper && !e.helper.harmless), lines:e.strikes.filter(x=>x.mesh.visible).length, blobs:e.blobs.blobs.length, wakes:window.__r.wakes`;
  const r = await smudgeAndRead('__WD.session.quarter.inkwell', read);
  // walk back into the square: the fight starts again without its cut-in
  await c.ev(`const s=__WD.session; s.player.teleport(new s.player.pos.constructor(50.5, 13.2, -21.5), -0.64); return 1`); // the warp's spot in the square
  await adv(3);
  r.back = await c.ev(`const e=__WD.session.quarter.inkwell; return {state:e.state, alerted:e.alerted, phase:e.phase, paint:+(e.hp/e.maxHp).toFixed(3), wakes:window.__r.wakes, cines:window.__r.cines, mood:__WD.session.mood}`);
  out.inkwell = r;
  console.log('INKWELL', JSON.stringify(r));
}

// ── Hush (level 2 boss) ──
if (ONLY.includes('hush')) {
  await load('harbor');
  await c.ev(`const s=__WD.session; s.debugWarp('lighthouse'); s.hushRisen=true; return 1`);
  await adv(1);
  await c.ev(`const s=__WD.session; s.player.teleport(s.hush.arena.clone().add(new s.player.pos.constructor(0,0.3,0))); return 1`);
  for (let i = 0; i < 20 && !(await c.ev('return __WD.session.hush.awake')); i++) await adv(0.3);
  const cinesIntro = await c.ev('return window.__r.cines');
  await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
  await adv(3);
  for (let i = 0; i < 60; i++) {
    const r = await c.ev(`${H} const e=__WD.session.hush; e.unveil(20,'X'); if (e.hp/e.maxHp > 0.45) dmg(e,0.05); return [e.phase, +(e.hp/e.maxHp).toFixed(2)]`);
    if (r[0] >= 2 && r[1] <= 0.45) break;
    await adv(0.5);
  }
  await c.ev(`const s=__WD.session, e=s.hush; e.onSummon(e.pos.clone()); return 1`);
  await adv(0.2);
  const read = `phase:e.phase, gates:e.gates.length, veiled:e.veiled, bombs:e.bombs.length, rings:e.rings.filter(r=>r.active).length,
    brood:__WD.session.enemies.filter(m=>m.id.startsWith('moth-brood')&&!m.harmless&&!m.disposed).length, awake:e.awake, alerted:e.alerted`;
  out.hush = { cinesIntro, ...(await smudgeAndRead('__WD.session.hush', read)) };
  console.log('HUSH', JSON.stringify(out.hush));
}

// ── Red Gramophone (level 2 mid-boss) ──
if (ONLY.includes('gramophone')) {
  await load('harbor');
  await c.ev(`const s=__WD.session; s.debugWarp('gramophone'); window.__r.wakes=0; const g=s.pier.gramophone; const w=g.onWake; g.onWake=()=>{window.__r.wakes++; w&&w()}; return 1`);
  for (let i = 0; i < 20 && !(await c.ev('return __WD.session.pier.gramophone.alerted')); i++) await adv(0.3);
  await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
  await adv(2);
  for (let i = 0; i < 60; i++) {
    const r = await c.ev(`${H} const e=__WD.session.pier.gramophone; if (e.hp/e.maxHp > 0.4 && e.state!=='ROAR') dmg(e,0.05,'stomp'); return [e.phase, +(e.hp/e.maxHp).toFixed(2), e.state]`);
    if (r[0] >= 1 && r[1] <= 0.4) break;
    await adv(0.5);
  }
  const read = `phase:e.phase, helperLeft: !!(e.helper && !e.helper.harmless), waves:e.waves.waves.filter(w=>w.on).length, recordX: (()=>{let v=null; __WD.session.ctx.root.traverse(o=>{ if(o.isMesh && o.geometry?.parameters?.width===13) v=o.visible; }); return v})(), wakes:window.__r.wakes`;
  const r = await smudgeAndRead('__WD.session.pier.gramophone', read);
  await c.ev(`const s=__WD.session, g=s.pier.gramophone; s.player.teleport(g.pos.clone().add(new s.player.pos.constructor(0,0.1,5))); return 1`);
  await adv(3);
  r.back = await c.ev(`const e=__WD.session.pier.gramophone; return {state:e.state, alerted:e.alerted, phase:e.phase, paint:+(e.hp/e.maxHp).toFixed(3), wakes:window.__r.wakes, cines:window.__r.cines, mood:__WD.session.mood}`);
  out.gramophone = r;
  console.log('GRAMOPHONE', JSON.stringify(r));
}

// ── Red Pen (level 3 boss: SoulsFight's own restart) ──
if (ONLY.includes('pen')) {
  await load('works');
  await c.ev(`__WD.session.debugWarp('phase2'); return 1`);
  await adv(3);
  const before = await c.ev(`const s=__WD.session, e=s.pen; return {phase:e.phase, paint:+(e.hp/e.maxHp).toFixed(3), mode:s.souls.mode}`);
  await c.ev(`window.__r.cines=0; __WD.session.player.hp=0; return 1`);
  await adv(0.3);
  const down = await c.ev(`return __WD.session.souls.mode`);
  await adv(3.2);
  const after = await c.ev(`const s=__WD.session, e=s.pen; return {phase:e.phase, paint:+(e.hp/e.maxHp).toFixed(3), mode:s.souls.mode, awake:e.awake, crossed:[...(s.inventory.crossed??[])], cines:window.__r.cines}`);
  out.pen = { before, down, after };
  console.log('PEN', JSON.stringify(out.pen));
}
console.log('ERRS', JSON.stringify(await c.ev('return window.__errs ?? []').catch(() => 'n/a')));
process.exit(0);
