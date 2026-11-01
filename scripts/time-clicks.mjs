// Rough dev-vs-production comparison, read from a trace that
// record-trace.mjs wrote. With zoneless change detection, each Refresh
// click's change detection ran inside one animation-frame callback in
// these recordings, so the long FireAnimationFrame events are the clicks.
// Usage: node scripts/time-clicks.mjs <trace file> [<trace file> ...]
import { readFileSync } from 'node:fs';

export function clickTimes(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const events = Array.isArray(raw) ? raw : raw.traceEvents;
  return events
    .filter((e) => e.name === 'FireAnimationFrame' && e.ph === 'X' && e.dur > 10_000)
    .map((e) => e.dur / 1000);
}

if (process.argv[1]?.endsWith('time-clicks.mjs')) {
  for (const file of process.argv.slice(2)) {
    console.log(`${file.padEnd(28)} change detection per click: ${clickTimes(file).map((t) => t.toFixed(1)).join(', ')} ms`);
  }
}
