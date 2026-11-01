// Same timing as time-untraced.mjs, but with no DevTools connection at all:
// Chrome is started as a plain process, a script injected into index.html
// clicks Refresh and times it, and the page POSTs its numbers back here.
// Usage: node scripts/time-no-devtools.mjs <dist folder> [--console]
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
    await wait(500);
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
    '--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    `http://127.0.0.1:${server.address().port}/`,
  ], { stdio: 'ignore' });
  const times = await Promise.race([result, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60_000))]);
  console.log(`${process.argv.slice(2).join(' ').padEnd(28)} no DevTools, per click: ${times.map((t) => t.toFixed(1)).join(', ')} ms`);
} finally {
  chrome?.kill();
  server.close();
  for (let i = 0; i < 20; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}
