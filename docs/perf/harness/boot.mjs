// Cold time to the title screen under an emulated link. node boot.mjs <latencyMs> <downMbps> <reps> <dist...>
import { serve, launch, sleep } from './cdp.mjs';
const [lat, mbps, reps, ...dists] = process.argv.slice(2);
const res = {};
for (let r = 0; r < +reps; r++) for (const d of dists) {
  const srv = await serve(d); const c = await launch({ width: 1280, height: 640 });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.emulateNetworkConditions', { offline: false, latency: +lat, downloadThroughput: (+mbps * 1e6) / 8, uploadThroughput: 1e6 / 8 });
  let reqs = 0; c.on((m) => { if (m.method === 'Network.requestWillBeSent') reqs++; });
  const t0 = Date.now();
  await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test` });
  await c.waitFor(`window.__WD && __WD.state === 'TITLE'`, 400000);
  (res[d] ??= []).push({ s: +((Date.now() - t0) / 1000).toFixed(1), reqs, errors: c.errors.length });
  c.close(); srv.close();
}
for (const d of dists) console.log(d.split('/').pop().padEnd(8), `latency ${lat} ms, ${mbps} Mbit/s →`, res[d].map((x) => `${x.s}s (${x.reqs} requests${x.errors ? ', ERR' : ''})`).join(' · '));
