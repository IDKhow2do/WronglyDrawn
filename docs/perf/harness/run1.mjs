import { writeFile, readFile } from 'node:fs/promises';
import { serve, launch, sleep, START } from './cdp.mjs';
const [dist, level, file, tier='low', style='graffiti'] = process.argv.slice(2);
const srv = await serve(dist); const c = await launch({ width: 1425, height: 657 });
await c.send('Emulation.setDeviceMetricsOverride', { width: 1425, height: 657, deviceScaleFactor: 1, mobile: false });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('wd.gfx','${tier}');localStorage.setItem('wd.levels','["plaza","harbor","works"]')}catch{}` });
await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test&dev&level=${level}&style=${style}` });
await c.waitFor(`window.T && document.querySelector('.start-btn') && window.__WD && __WD.state === 'TITLE'`);
console.error(JSON.stringify(await c.ev(START)));
const out = await c.ev(await readFile(file, 'utf8'));
for (const k of Object.keys(out)) if (typeof out[k] === 'string' && out[k].startsWith('data:image')) { await writeFile(`./img_${level}_${k}.jpg`, Buffer.from(out[k].split(',')[1], 'base64')); out[k] = `img_${level}_${k}.jpg`; }
console.log(JSON.stringify(out)); console.log('errors', c.errors);
c.close(); srv.close();
