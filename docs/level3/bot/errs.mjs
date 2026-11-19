// Navigate and print console errors / exceptions for 12 s. Usage: node errs.mjs [url-query]
import { connect, sleep, VITE } from './lib.mjs';
const c = await connect();
await c.send('Runtime.enable'); await c.send('Log.enable');
c.listeners.push((d) => {
  if (d.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 800));
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) console.log(d.params.type, d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') console.log('LOG', d.params.entry.text.slice(0, 400), d.params.entry.url ?? '');
});
await c.send('Page.navigate', { url: `${VITE}/?test&${process.argv[2] ?? 'level=works'}` });
await sleep(12000);
process.exit(0);
