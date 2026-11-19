import { serve, launch } from './cdp.mjs';
const [dist] = process.argv.slice(2);
const srv = await serve(dist); const c = await launch({ width: 1280, height: 640 });
await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
const url = new Map(), by = {};
c.on((m) => { if (m.method === 'Network.requestWillBeSent') url.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFinished') { const u = url.get(m.params.requestId) || ''; const p = new URL(u).pathname; const k = p.startsWith('/models') ? 'models (glb)' : p.startsWith('/textures') ? 'textures' : p.startsWith('/audio') ? 'audio' : p.endsWith('.js') ? 'js' : p.endsWith('.wasm') ? 'wasm' : p.match(/\.(woff2?|ttf)$/) ? 'fonts' : p.match(/\.(png|webp|jpg|svg)$/) ? 'images (ui, stickers, cards)' : 'other'; const e = (by[k] ??= { n: 0, bytes: 0 }); e.n++; e.bytes += m.params.encodedDataLength; } });
await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test` });
await c.waitFor(`window.__WD && __WD.state === 'TITLE'`, 400000);
let tot = 0; for (const [k, e] of Object.entries(by).sort((a, b) => b[1].bytes - a[1].bytes)) { tot += e.bytes; console.log(k.padEnd(30), String(e.n).padStart(4), (e.bytes / 1048576).toFixed(2).padStart(7), 'MiB'); }
console.log('total before title'.padEnd(30), '    ', (tot / 1048576).toFixed(2).padStart(7), 'MiB (uncompressed transfer from the local server)');
c.close(); srv.close();
