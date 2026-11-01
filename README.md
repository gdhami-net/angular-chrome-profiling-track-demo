# angular-chrome-profiling-track-demo

Companion demo for the post "How to see which Angular component is slow in the
Chrome Performance panel" on gdhami.net.

A small Angular 22.2 app with one deliberately slow component
(`ShippingEstimate`, whose template calls a method that loops 6 million times)
next to a few normal ones. `src/main.ts` calls `enableProfiling()` from
`@angular/core` before bootstrap. A script records Chrome traces of the app and
reads what Angular put on its "🅰️ Angular" track.

## What it proves

`npm run check` builds the app five ways, records a trace of each in headless
Chrome (page load plus three clicks on Refresh), and asserts:

- **Development build:** the trace has entries on the Angular track, every entry
  pairs with its start marker, startup is on it ("Bootstrap application"), and
  `_ShippingEstimate` has by far the most self time (its time minus its child
  components'). It is also the longest component entry below the root, and
  `ShippingEstimate_Template (update)` is the longest template entry.
- **Console route:** a build without the `main.ts` call, then
  `ng.enableProfiling()` called once the page is up. The clicks after the call
  are on the track; startup is not.
- **Production build, same `main.ts`:** zero entries on the Angular track, no
  `ng` global, and the minified `enableProfiling` is an empty stub
  (`function wc(){return Tr("Chrome DevTools profiling"),()=>{}}`): the profiler
  is tree-shaken out, only a feature-usage mark is left.
- **1,000 small row components** (`many-rows` configurations): `_OrderRow` has
  8,000 entries and the slow component still has the most self time. It also
  prints change detection time per click, dev with the track against production
  (not asserted; it depends on the machine).

Real output on the machine it was written on:

```
-- development build, enableProfiling() before bootstrap
PASS  the trace has 411 entries on the "🅰️ Angular" track
PASS  every entry pairs with its start marker
PASS  startup is on the track ("Bootstrap application")
   components, by self time (child components subtracted):
     _ShippingEstimate    self   152.1 ms   entries 9
     _OrderTable          self     6.2 ms   entries 9
     _App                 self     4.9 ms   entries 9
     _OrderHeader         self     1.0 ms   entries 9
     _PromoBanner         self     0.4 ms   entries 9
PASS  the slow component is named, and has the most self time
PASS  it has more than 5x the self time of the next one (_OrderTable)
PASS  the longest component entry below the root is _ShippingEstimate (40.4 ms)
PASS  the longest template entry is "ShippingEstimate_Template (update)"
PASS  4 "Change detection N" entries: startup plus 3 clicks
-- development build, ng.enableProfiling() typed after load
PASS  ng.enableProfiling exists on the page in dev mode
PASS  startup is missing from the track: it ran before the call
PASS  the clicks after the call are on it, slow component included
-- production build, same main.ts
PASS  the app ran: estimateDays() was called 4 times
PASS  the trace has 0 entries on the Angular track
PASS  there is no ng global to call from the console
PASS  enableProfiling compiles to an empty stub: function wc(){return Tr("Chrome DevTools profiling"),()=>{}}
-- 1,000 row components, development vs production
     _ShippingEstimate    self   143.4 ms   total   143.4 ms   entries 9
     _OrderTable          self    38.2 ms   total    63.8 ms   entries 9
     _OrderRow            self    25.6 ms   total    25.6 ms   entries 8000
     _App                 self     4.7 ms   total   213.1 ms   entries 9
     _OrderHeader         self     0.9 ms   total     0.9 ms   entries 9
     _PromoBanner         self     0.3 ms   total     0.3 ms   entries 9
PASS  _OrderRow has 8,000 entries (1,000 rows x 8 passes)
PASS  the slow component still has the most self time
   change detection per click (median of 3, not asserted, machine-dependent):
     5 components:   dev + track 41.3 ms   production 36.0 ms
     1,000 rows:     dev + track 46.4 ms   production 37.1 ms

ALL CHECKS PASSED
```

## How to run it

```
npm install
npm run check        # builds, records, asserts
npm test -- --watch=false   # one Vitest spec for the app itself
npm start            # ng serve; open DevTools > Performance and record
```

Puppeteer downloads its own Chrome for Testing on `npm install`. Each script
starts the browser with a temporary profile folder and deletes it when it ends.

## Versions

- Angular 22.2.4 (`@angular/core`, `common`, `compiler`, `forms`,
  `platform-browser`, `router`), `@angular/cli` and `@angular/build` 22.2.5
- TypeScript 6.0.3. TypeScript 7 is out, but `@angular/compiler-cli` 22.2.4
  declares `typescript: >=6.0 <6.1` as its peer range.
- Vitest 5.0.5, jsdom 30.1.3
- Puppeteer 25.16.0 with Chrome for Testing 156.0.8078.47
- Node 26.1.0, Windows 11

## How the entries look in a trace

Angular sends each entry with `console.timeStamp()`, as the Chrome team's post
says. In a trace file that is two `TimeStamp` instant events in the
`devtools.timeline` category: a start marker named like `Event_3_17`, then an
end event whose `args.data` has the entry's name, `track: "🅰️ Angular"`, a
`color`, and `start` set to the marker's name. `scripts/read-trace.mjs` pairs
them. Component entries carry the color `primary-light`; the source is
`devToolsProfiler` in `@angular/core/fesm2022/_debug_node-chunk.mjs`.

## Edge cases the post leaves out

- **Underscored names.** In the dev build the track shows `_ShippingEstimate`,
  not `ShippingEstimate`. The entry name is `instance.constructor.name`, and the
  build renames decorated classes. Template entries keep the plain name
  (`ShippingEstimate_Template (update)`).
- **A component's entry includes its children.** `_App` is longer than
  `_ShippingEstimate` because it wraps it. So do "Change detection N" and
  "Synchronization N". Look for the deepest wide bar, or subtract children the
  way `componentTotals()` does.
- **Nine entries per component for four change detection runs.** Startup has a
  create pass and an update pass, and dev mode adds a second "check no changes"
  pass after every run. `estimateDays()` still ran only four times: with OnPush as
  the default in Angular 22, the check pass visits the component without running
  its template again.
- **The track costs something per entry while you record.** With 1,000 row
  components, a click took about 60 ms with the track on against about 40 ms
  without it (traced over a bare protocol connection, `scripts/_cdp-probe.mjs
  --trace`). With five components the difference was within noise. Production
  showed about 37 ms either way. Read big gaps on the track, not small ones.
- **Puppeteer's default page inflates it badly.** Puppeteer calls
  `Performance.enable` on every page (for `page.metrics()`). With that domain on,
  each `console.timeStamp` sends a metrics snapshot to the client: 49,262
  `Performance.metrics` events in one short run with 1,000 rows, and about 260 ms per click
  instead of 40 with 1,000 rows. In that state the track pointed at the table
  instead of the slow component. `scripts/time-untraced.mjs` shows it;
  `scripts/_cdp-probe.mjs dist/many-dev --enable=Performance` isolates it, and
  `scripts/time-no-devtools.mjs` shows the same build with no protocol client at
  all. `scripts/record-trace.mjs` turns the domain off before recording. I have
  not checked whether DevTools' own Performance monitor drawer (which also reads
  these metrics) has the same effect.
- **The two docs disagree on colors.** The angular.dev page and the Chrome
  team's post give different meanings for blue, purple and green, so the post
  doesn't describe colors.
- `getBaseDocUrl()` in 22.2.4 treats `VERSION.full === '22.2.4'` as a
  pre-release, so the documentation links Angular attaches to entries point at
  next.angular.dev in this exact version.
- The headless recordings are not the DevTools UI. The post's screenshots are
  drawn from these traces, not captured from the panel.

## License

MIT, see `LICENSE`.
