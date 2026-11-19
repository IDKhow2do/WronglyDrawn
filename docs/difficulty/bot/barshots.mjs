// Screenshots of the creature bars: one creature at about a third painted, a group with several bars, a finished
// creature (its gold "done" beat), in a level-1 and a level-3 scene. Usage: node barshots.mjs (Vite :5194, Chrome :9363)
import fs from 'node:fs';
import { connect, sleep } from './l1/lib.mjs';
const c = await connect();
const OUT = new URL('..', import.meta.url).pathname;
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const save = async (name) => {
  const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  fs.writeFileSync(`${OUT}${name}.jpg`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
for (const level of ['plaza', 'works']) {
  await c.send('Page.navigate', { url: `http://localhost:5194/?test&difficulty=normal&level=${level}&style=graffiti` });
  for (let i = 0; i < 160 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await c.ev("localStorage.setItem('wd.boons','auto'); localStorage.setItem('wd.lang','en'); document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 160 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  await sleep(1500);
  // gather up to four ordinary creatures in a loose row 6–9 m in front of WAI, frozen in place for the photo
  const n = await c.ev(`const s=__WD.session, p=s.player; const V=p.pos.constructor;
    const fwd=__WD.app.camera.camera.getWorldDirection(new V()).setY(0).normalize(); const side=new V(fwd.z,0,-fwd.x);
    const list=s.enemies.filter(e=>!e.disposed && !e.harmless && e.baseHp>=60 && e.baseHp<1000).slice(0,4);
    list.forEach((e,i)=>{ const at=p.pos.clone().addScaledVector(fwd,7+(i%2)*2).addScaledVector(side,(i-1.5)*2.6);
      e.body.setTranslation({x:at.x,y:at.y+e.cOff+0.05,z:at.z},true); e.body.setNextKinematicTranslation({x:at.x,y:at.y+e.cOff+0.05,z:at.z});
      e.pos.copy(at); e.prevPos.copy(at); e.home.copy(at); e.renderPos.copy(at); e.ai=()=>{}; e.alerted=false; });
    window.__bars=list; return list.map(e=>e.kind);`);
  console.log(level, 'creatures', JSON.stringify(n));
  // 1 · one creature about a third painted
  await c.ev(`const e=__bars[0]; e.hp=e.maxHp*0.67; e.barHitAt=performance.now(); return 1`);
  await sleep(500);
  await save(`bars-third-${level}`);
  // 2 · a group fight: several bars at different shares, one reeling (gold = TAG it)
  await c.ev(`const t=performance.now(); [0.67,0.4,0.85,0.2].forEach((k,i)=>{const e=__bars[i]; if(!e) return; e.hp=e.maxHp*k; e.barHitAt=t;}); if(__bars[1]) __bars[1].staggerT=5; return 1`);
  await sleep(500);
  await save(`bars-group-${level}`);
  // 3 · finished: the bar fills, turns gold, swells and pops
  await c.ev(`const e=__bars[0]; e.hp=1; e.debugRepaint(); return 1`);
  await sleep(250);
  await save(`bars-done-${level}`);
}
process.exit(0);
