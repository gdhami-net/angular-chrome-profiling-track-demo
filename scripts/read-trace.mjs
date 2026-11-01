// Reads the Angular track out of a Chrome trace file.
//
// Angular sends each entry with console.timeStamp(). In the trace that is
// two "TimeStamp" instant events in the devtools.timeline category: a start
// marker named like "Event_3_17", and an end event whose args.data carries
// the entry's name, track "🅰️ Angular", a color, and start = that marker.
import { readFileSync } from 'node:fs';

export const ANGULAR_TRACK = '\u{1F170}️ Angular';

export function readAngularEntries(traceFile) {
  const raw = JSON.parse(readFileSync(traceFile, 'utf8'));
  const events = Array.isArray(raw) ? raw : raw.traceEvents;
  const stamps = events.filter((e) => e.name === 'TimeStamp' && e.args?.data);
  const markers = new Map();
  for (const e of stamps) {
    if (!e.args.data.track) markers.set(e.args.data.message, e.ts);
  }
  return stamps
    .filter((e) => e.args.data.track === ANGULAR_TRACK)
    .map((e) => {
      const startTs = markers.get(e.args.data.start);
      return {
        name: e.args.data.message,
        color: e.args.data.color,
        startUs: startTs,
        durationMs: startTs === undefined ? NaN : (e.ts - startTs) / 1000,
      };
    });
}

// Component entries are the ones Angular colors 'primary-light'
// (ProfilerEvent.ComponentEnd in @angular/core's devToolsProfiler).
// A parent's entry wraps its children's, so "self" subtracts the child
// component entries nested directly inside it.
export function componentTotals(entries) {
  const comps = entries
    .filter((x) => x.color === 'primary-light')
    .map((e) => ({ ...e, endUs: e.startUs + e.durationMs * 1000, selfMs: e.durationMs }))
    .sort((a, b) => a.startUs - b.startUs || b.durationMs - a.durationMs);
  const stack = [];
  for (const c of comps) {
    while (stack.length && stack.at(-1).endUs <= c.startUs) stack.pop();
    if (stack.length) stack.at(-1).selfMs -= c.durationMs;
    stack.push(c);
  }
  const totals = new Map();
  for (const c of comps) {
    const t = totals.get(c.name) ?? { name: c.name, count: 0, totalMs: 0, selfMs: 0, maxMs: 0 };
    t.count++;
    t.totalMs += c.durationMs;
    t.selfMs += c.selfMs;
    t.maxMs = Math.max(t.maxMs, c.durationMs);
    totals.set(c.name, t);
  }
  return [...totals.values()].sort((a, b) => b.selfMs - a.selfMs);
}

if (process.argv[1]?.endsWith('read-trace.mjs')) {
  const entries = readAngularEntries(process.argv[2]);
  console.log(`Angular track entries: ${entries.length}`);
  const byColor = {};
  for (const e of entries) byColor[e.color] = (byColor[e.color] ?? 0) + 1;
  console.log('by color:', byColor);
  console.log('longest 12 entries:');
  for (const e of [...entries].sort((a, b) => b.durationMs - a.durationMs).slice(0, 12)) {
    console.log(`  ${e.durationMs.toFixed(2).padStart(8)} ms  ${e.color.padEnd(14)} ${e.name}`);
  }
  console.log('components (self = without nested child components):');
  for (const t of componentTotals(entries)) {
    console.log(`  self ${t.selfMs.toFixed(2).padStart(8)} ms  total ${t.totalMs.toFixed(2).padStart(8)} ms  x${t.count}  ${t.name}`);
  }
}
