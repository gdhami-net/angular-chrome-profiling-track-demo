// Times each click's change detection with NO trace recording, under a plain
// Puppeteer page, by wrapping the animation-frame and timeout callbacks
// Angular's zoneless scheduler races. Puppeteer keeps the protocol's
// Performance domain on here, so this is the script that shows the slowdown
// (compare dist/many-dev with time-no-devtools.mjs).
// Usage: node scripts/time-untraced.mjs <dist folder> [--console]
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const root = resolve(process.argv[2], 'browser');
const consoleMode = process.argv.includes('--console');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  let file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const profile = await mkdtemp(join(tmpdir(), 'ng-profiling-demo-'));
let browser;
try {
  browser = await puppeteer.launch({ headless: true, userDataDir: profile });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    // Angular races a timeout against an animation frame; time both.
    const raf = window.requestAnimationFrame.bind(window);
    const timeout = window.setTimeout.bind(window);
    globalThis.__frames = [];
    const timed = (cb) => (...args) => {
      const t0 = performance.now();
      try { cb(...args); } finally { globalThis.__frames.push(performance.now() - t0); }
    };
    window.requestAnimationFrame = (cb) => raf(timed(cb));
    window.setTimeout = (cb, ms, ...rest) => timeout(typeof cb === 'function' ? timed(cb) : cb, ms, ...rest);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await page.waitForSelector('app-shipping-estimate p');
  if (consoleMode) await page.evaluate(() => { globalThis.ng.enableProfiling(); });
  const times = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      globalThis.__frames.length = 0;
      document.querySelector('#refresh').click();
      await new Promise((r) => setTimeout(r, 400));
      out.push(Math.max(0, ...globalThis.__frames));
    }
    return out;
  });
  console.log(`${process.argv.slice(2).join(' ').padEnd(28)} untraced, per click: ${times.map((t) => t.toFixed(1)).join(', ')} ms`);
} finally {
  try { await browser?.close(); } catch {}
  server.close();
  for (let i = 0; i < 10; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}
