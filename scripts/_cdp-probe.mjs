// The probe that found the Puppeteer side effect. Like time-no-devtools.mjs
// (the page times its own clicks and POSTs them back), plus a bare DevTools
// protocol client that turns on only the domains you name, and optionally
// records a trace the way the Performance panel does.
// Usage: node scripts/_cdp-probe.mjs <dist folder> [--enable=Runtime,Performance] [--trace] [--console]
// Try --enable=Performance on dist/many-dev to see the slowdown.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const root = resolve(process.argv[2], 'browser');
const consoleMode = process.argv.includes('--console');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const probe = `<script>
(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const timeout = window.setTimeout.bind(window);
  const frames = [];
  const timed = (cb) => (...a) => { const t0 = performance.now(); try { cb(...a); } finally { frames.push(performance.now() - t0); } };
  window.requestAnimationFrame = (cb) => raf(timed(cb));
  window.setTimeout = (cb, ms, ...r) => timeout(typeof cb === 'function' ? timed(cb) : cb, ms, ...r);
  const wait = (ms) => new Promise((r) => timeout(r, ms));
  window.addEventListener('load', async () => {
    while (!document.querySelector('app-shipping-estimate p')) await wait(50);
    await wait(4000);
    if (${consoleMode}) globalThis.ng.enableProfiling();
    const out = [];
    for (let i = 0; i < 5; i++) {
      frames.length = 0;
      document.querySelector('#refresh').click();
      await wait(400);
      out.push(Math.max(0, ...frames));
    }
    fetch('/result', { method: 'POST', body: JSON.stringify(out) });
  });
})();
</script>`;

let resolveResult;
const result = new Promise((r) => (resolveResult = r));
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/result') {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.end('ok');
    resolveResult(JSON.parse(body));
    return;
  }
  let file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) file = join(root, 'index.html');
  let content = await readFile(file);
  if (file.endsWith('index.html')) content = content.toString().replace('<head>', '<head>' + probe);
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(content);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));

const executable = await puppeteer.executablePath();
const profile = await mkdtemp(join(tmpdir(), 'ng-profiling-demo-'));
let chrome;
try {
  chrome = spawn(executable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    `http://127.0.0.1:${server.address().port}/`,
  ], { stdio: 'ignore' });
  // Attach a bare CDP client and enable only the domains named in --enable=A,B
  const domains = (process.argv.find((a) => a.startsWith('--enable=')) ?? '--enable=').slice(9).split(',').filter(Boolean);
  const portFile = join(profile, 'DevToolsActivePort');
  while (!existsSync(portFile)) await new Promise((r) => setTimeout(r, 100));
  const port = (await readFile(portFile, 'utf8')).split('\n')[0];
  let targets = [];
  while (!targets.some((t) => t.type === 'page')) {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const events = {};
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method) events[d.method] = (events[d.method] ?? 0) + 1; });
  for (const d of domains) ws.send(JSON.stringify({ id: ++id, method: `${d}.enable` }));
  // --trace: record a trace the way the Performance panel does (Tracing on the browser target)
  let bws;
  if (process.argv.includes('--trace')) {
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    bws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((r) => bws.addEventListener('open', r));
    bws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method) events[d.method] = (events[d.method] ?? 0) + 1; });
    bws.send(JSON.stringify({ id: 1, method: 'Tracing.start', params: { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'disabled-by-default-v8.cpu_profiler'] } } }));
  }
  const times = await Promise.race([result, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60_000))]);
  if (bws) {
    bws.send(JSON.stringify({ id: 2, method: 'Tracing.end' }));
    await new Promise((r) => bws.addEventListener('message', (m) => { if (JSON.parse(m.data).method === 'Tracing.tracingComplete') r(); }));
    bws.close();
  }
  ws.close();
  console.log(`${process.argv.slice(2).join(' ').padEnd(36)} per click: ${times.map((t) => t.toFixed(1)).join(', ')} ms  events: ${JSON.stringify(events)}`);
} finally {
  chrome?.kill();
  server.close();
  for (let i = 0; i < 20; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}
