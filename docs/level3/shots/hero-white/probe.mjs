import fs from 'node:fs';
const W = process.argv[2]; const out = process.argv[3]; const js = process.argv.slice(4);
const { open } = await import(W + '/video/intro/caplib.mjs');
const { c, close } = await open(W + '/dist', { level: process.env.LEVEL || 'works', format: 'ui', css: process.env.CSS || 'clean' });
const MATS = `const mats=()=>{const r=[];s.player.model.root.traverse(o=>{if(o.isMesh){for(const m of [].concat(o.material))r.push({n:o.name,vis:o.visible,type:m.type,map:!!m.map,img:m.map&&!!m.map.image,col:m.color&&m.color.getHexString(),em:m.emissive&&m.emissive.toArray().map(v=>+v.toFixed(2)),ei:m.emissiveIntensity})}});return {ghost:s.player.model.ghost,r}};`;
try {
  for (let k = 0; k < js.length; k++) {
    const r = await c.ev(`(async () => { const s = __WD.session, a = __WD.app; ${MATS} ${js[k]} })()`).catch((e) => 'ERR ' + String(e.message || e).slice(0, 400));
    console.log(k, typeof r === 'string' ? r : JSON.stringify(r));
    await c.ev(`(() => { __WD.app.renderer.render(); return 1; })()`);
    const shot = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    fs.writeFileSync(`${out}_${k}.jpg`, Buffer.from(shot.data, 'base64'));
  }
  if (c.errors.length) console.log('PAGE ERRORS', c.errors.slice(0, 3));
} finally { close(); process.exit(0); }
