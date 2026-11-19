// Eraser case: WAI hard against the Eraser on the summit. Usage: node eraser.mjs <tag>   (page: plaza, probe injected)
// Cases: face = camera behind WAI looking at the Eraser; away = camera between WAI and the Eraser; rub = the Eraser
// dashes through WAI (frames every 2nd step); hop = it bounces onto him. Prints per case: camera inside the drawn
// body (frames), WAI's head hidden by the body (frames, not counting a faded body), shots in /tmp/wd-cam/shots.
import fs from 'node:fs';
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
process.env.WD_SHOTS ??= '/tmp/wd-cam/shots';
const { connect, sleep } = await import('<local-path>');
const c = await connect();
const tag = process.argv[2] ?? 'x';
await c.ev(fs.readFileSync('/tmp/wd-cam/probe.js', 'utf8') + '; return 1');
await c.ev(`const s=__WD.session; if (!window.__summit) { s.debugWarp('summit'); window.__summit = 1; } return 1`);
await sleep(1500);
await c.ev(`__cam.freeze(); const s=__WD.session, e=s.eraser; if(!e.awake) e.engage(); __WD.app.camera.stopCine(); s.story?.locked && s.story.skip(); return 1`);
// in-page helpers: body box, inside test, WAI occlusion
await c.ev(`const s=__WD.session, e=s.eraser, app=__WD.app, cam=app.camera.camera, V=cam.position.constructor;
  const B=cam.position.constructor;
  window.__er = {
    box(){ const T=window.__T; const b=new T.Box3(); e.root.updateMatrixWorld(true); e.root.traverse(o=>{ if(!o.isMesh||!o.visible||o.userData.isOutline) return; const ms=Array.isArray(o.material)?o.material:[o.material]; if(!app.fader.faded.has(o) && ms.some(m=>m.transparent)) return; if(!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }); return b; },
    stat(){ const T=window.__T; const p=cam.position; const b=this.box(); const inside=b.containsPoint(p);
      const head=s.player.renderPos.clone(); head.y+=0.9; const d=head.clone().sub(p); const L=d.length(); d.normalize();
      const rc=new T.Raycaster(p.clone(), d, 0, L-0.2); rc.camera=cam; const hits=rc.intersectObject(e.root,true).filter(h=>!h.object.userData.isOutline && h.object.visible && (app.fader.faded.has(h.object) || !(Array.isArray(h.object.material)?h.object.material[0]:h.object.material).transparent));
      let fadedK=0; for (const [m,f] of app.fader.faded) { let q=m; while(q&&q!==e.root) q=q.parent; if(q) fadedK=Math.max(fadedK,f.k); }
      // which way the camera looks vs WAI (in frame?)
      const ndc=head.clone().project(cam); const inFrame=Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1&&ndc.z<1;
      return {inside, hidden: hits.length>0, fadedK:+fadedK.toFixed(2), inFrame, close:+app.camera.closeness.toFixed(2), cam:[p.x,p.y,p.z].map(v=>+v.toFixed(2))}; } };
  return 1`);
await c.ev(`const app=__WD.app; let bb=null; __WD.session.eraser.root.traverse(o=>{ if(o.isMesh&&!bb){ o.geometry.computeBoundingBox(); bb=o.geometry.boundingBox; } });
  window.__T = { Box3: bb.constructor, Raycaster: app.fader.ray.constructor }; return 1`);
const place = (yawExpr, gap) => c.ev(`const s=__WD.session, e=s.eraser, p=s.player, app=__WD.app; const V=p.pos.constructor;
  e.hp=e.maxHp; e.attackCd=99; e.setState('IDLE');
  const b=__er.box(); const ctr=b.getCenter(new V()); const half=b.getSize(new V()).multiplyScalar(0.5);
  // WAI on the summit floor, ${gap} m off the block's side facing the summit centre
  const dir=new V(0,0,1);
  const r=Math.max(half.x,half.z);
  const at=e.pos.clone().addScaledVector(dir, r+${gap}); at.y=p.pos.y;
  const yawTo=Math.atan2(e.pos.x-at.x, e.pos.z-at.z);
  const yaw=${yawExpr};
  p.teleport(at, yaw); app.camera.yaw=yaw; app.camera.pitch=0.22; app.camera.shake=0;
  for(let i=0;i<50;i++){ p.hp=6; p.invuln=1; e.attackCd=99; __WD.advance(1/60); }
  return {at:[at.x,at.y,at.z], e:[e.pos.x,e.pos.y,e.pos.z], half:[half.x,half.y,half.z], st: __er.stat()}`);
const out = {};
for (const [name, yawExpr] of [['face', 'yawTo'], ['away', 'yawTo+Math.PI'], ['side', 'yawTo+Math.PI/2']]) {
  const r = await place(yawExpr, 0.15);
  await c.shot(`er_${tag}_${name}`);
  out[name] = r;
  console.log(name, JSON.stringify(r));
}
// the rub: WAI in front of the Eraser, camera behind WAI looking at it; it dashes through him
await place('yawTo', 1.5);
const rub = [];
await c.ev(`const e=__WD.session.eraser; e.attackCd=99; e.setState('RUB_TELL'); return 1`);
let ns = 0, r0 = -1;
for (let i = 0; i < 150; i++) {
  const st = await c.ev(`const s=__WD.session, p=s.player; p.hp=6; p.invuln=1; __WD.advance(1/60); return {...__er.stat(), st: s.eraser.state, d: +s.eraser.pos.distanceTo(p.pos).toFixed(1)}`);
  rub.push(st);
  if (r0 < 0 && st.st === 'RUB') r0 = i - 8;
  if (r0 >= 0 && (i - r0) % 2 === 0 && ns < 20) await c.shot(`er_${tag}_rub_${String(ns++).padStart(2, '0')}`);
}
const sum = (a) => ({ frames: a.length, inside: a.filter((q) => q.inside).length, hidden: a.filter((q) => q.hidden).length, insideSolid: a.filter((q) => q.inside && q.fadedK < 0.6).length, hiddenSolid: a.filter((q) => q.hidden && q.fadedK < 0.6).length, outOfFrame: a.filter((q) => !q.inFrame).length, closeMin: Math.min(...a.map((q) => q.close)) });
console.log('rub', JSON.stringify(sum(rub)), rub.map((q) => q.st.slice(0,4) + (q.inside ? 'I' : '') + (q.hidden ? 'H' : '') + (q.fadedK > 0.6 ? 'f' : '') + q.d).join(' '));
fs.writeFileSync(`/tmp/wd-cam/eraser-${tag}.json`, JSON.stringify({ out, rub }));
process.exit(0);
