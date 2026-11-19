// Tiny local stand-in for api.deepseek.com (tests only): /models, /chat/completions (JSON + SSE streaming),
// usage with prompt_cache_hit/miss computed from the real longest common PREFIX with earlier requests.
import http from 'node:http';
import fs from 'node:fs';
const LOG = '/tmp/whale-t/mock-log.jsonl';
fs.writeFileSync(LOG, '');
const seen = [];
let n = 0, remarkN = 0;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const auth = req.headers.authorization ?? '';
  if (!/^Bearer sk-MOCK/.test(auth)) { res.writeHead(401, { ...cors, 'content-type': 'application/json' }); return res.end('{"error":{"message":"bad key"}}'); }
  if (req.url === '/models') { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); return res.end('{"data":[{"id":"deepseek-chat"},{"id":"deepseek-flash"}]}'); }
  let raw = ''; for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  const msgs = body.messages;
  const ser = JSON.stringify(body.tools) + JSON.stringify(msgs).slice(0, -1); // prompt as a string
  let lcp = 0;
  for (const p of seen) { let i = 0; const m = Math.min(p.length, ser.length); while (i < m && p.charCodeAt(i) === ser.charCodeAt(i)) i++; lcp = Math.max(lcp, i); }
  seen.push(ser); if (seen.length > 6) seen.shift();
  const prompt_tokens = Math.ceil(ser.length / 4), hit = Math.floor(lcp / 4 / 64) * 64;
  const usage = { prompt_tokens, completion_tokens: 20, total_tokens: prompt_tokens + 20, prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: prompt_tokens - hit };
  const last = msgs[msgs.length - 1].content;
  const tail = last.slice(last.lastIndexOf('[now]'));
  const ask = /\nCHAT — WAI says: (.*)$/s.exec(tail)?.[1] ?? '';
  const kind = ask ? 'CHAT' : /\nREMARK/.test(tail) ? 'REMARK' : 'DECIDE';
  const zh = /简体中文\)\.$/.test(msgs[0].content);
  const mem = msgs.slice(1).map((m) => m.content).join('\n');
  const memNoTail = mem.slice(0, mem.lastIndexOf('[now]'));
  const sprayed = [...memNoTail.matchAll(/^\d+:\d\d (WAI sprayed me .*)$/gm)].pop()?.[1] ?? '';
  fs.appendFileSync(LOG, JSON.stringify({ n: ++n, kind, stream: !!body.stream, includeUsage: !!body.stream_options?.include_usage, tool_choice: body.tool_choice, max_tokens: body.max_tokens, model: body.model, msgs: msgs.length, roles: msgs.map((m) => m.role[0]).join(''), sysLen: msgs[0].content.length, chars: ser.length, lcp, lcpPct: Math.round((lcp / ser.length) * 100), usage, ask, sprayedLineSeen: sprayed, tailStart: tail.slice(0, 60), keyInBody: raw.includes('sk-MOCK') }) + '\n');
  if (kind === 'DECIDE') {
    await sleep(250);
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    // worst case on purpose: a model that answers "hold 20 s" every single turn
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'hold', arguments: '{"seconds":20}' } }] } }], usage }));
  }
  let text;
  if (kind === 'REMARK') text = remarkN++ % 2 ? '[skip]' : zh ? '[rice] 刚才那几粒饭，我都记在账上了。' : '[rice] Those rice grains just now? All on my ledger.';
  else if (/slow/.test(ask)) { await sleep(11000); text = '[idle] too late'; }
  else if (/long|长/.test(ask)) text = zh ? '[idle] ' + '这是一句特别特别长的回答，'.repeat(20) + '完。' : '[idle] ' + 'this is a very very long answer that keeps going '.repeat(12);
  else if (/喷|spray/i.test(ask)) text = sprayed ? (zh ? `[caught] 你喷我，是因为我${/missed/.test(sprayed) ? '刚才没打中' : /doz/.test(sprayed) ? '在摸鱼' : '……反正有原因'}吧？哼。` : `[caught] You sprayed me because I ${/missed/.test(sprayed) ? 'missed just before' : 'did something'}, right? Hmph.`) : (zh ? '[angry] 你什么时候喷我了？我没记这笔。' : '[angry] When did you spray me? Not in my book.');
  else if (/等|别动|stay|wait/.test(ask)) text = zh ? '[idle][do:stay] 哦鲸鲸。站着不动我最擅长。' : '[idle][do:stay] Oh whale-whale. Standing still is my best skill.';
  else if (/自己玩|own/.test(ask)) text = zh ? '[rice][do:free] 自己玩？那我先找饭。' : '[rice][do:free] On my own? Rice first.';
  else if (/捡|collect/.test(ask)) text = '[rice][do:collect] 捡饭？这个我愿意。';
  else if (/跟|过来|follow|come/.test(ask)) text = zh ? '[portrait][do:follow] 哦鲸鲸，来了来了。' : '[portrait][do:follow] Oh whale-whale, coming.';
  else text = zh ? '[rice] 哦鲸鲸，听到了。先给饭，再干活。' : '[rice] Oh whale-whale, heard you. Rice first, then work.';
  res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  await sleep(320);
  const chunks = [...text].reduce((a, ch, i) => { if (i % 3 === 0) a.push(''); a[a.length - 1] += ch; return a; }, []);
  for (const c of chunks) {
    if (res.destroyed || res.socket?.destroyed) break;
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: c } }] })}\n\n`);
    await sleep(70);
  }
  res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}).listen(9345, '127.0.0.1', () => console.log('mock on 9345'));
