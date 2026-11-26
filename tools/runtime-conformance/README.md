# Runtime conformance

This private folder runs the conformance suite's requests through the root
entry (`@zodiacs/engine`) and the core entry (`@zodiacs/engine/core`) in Node,
Bun, Deno, Chromium, Firefox and WebKit. Every run uses the conformance
harness (`conformance/harness/run.mjs`) and the same request handlers
(`conformance/adapters/zodiacs-engine.mjs`). The harness judges each response
against the vector's arbiter and tolerance. The runtime gate compares the
resulting verdicts with Node's for that entry. Matching failures count as
agreement, including positions where core's astronomy-engine result falls
outside the arbiter's tolerance.

Nothing here is packed: the folder has its own `package.json` and lockfile,
which pin Bun, Deno, esbuild and Playwright, and the root `package.json` and
lockfile do not change.

## Run

From the repository root, with Node 22.22.2:

```sh
npm ci && npm run build
cd tools/runtime-conformance
npm ci
npx playwright install --with-deps chromium firefox webkit
node --test selftest.mjs
node run-all.mjs --out <dir>
```

`run-all.mjs` runs both entries by default. Use `--entry root` or
`--entry core` for a single entry. `--runtimes node,bun,deno` selects a subset.
Node always runs as the reference for each selected entry. The
`.github/workflows/runtime-conformance.yml` workflow runs all supported
runtimes on pull requests that touch `src/`, `conformance/`, the root `package.json` or
lockfile, the build configuration (`tsconfig.base.json`,
`tsconfig.build.json`, `scripts/build-lite.mjs`) or this folder, and weekly.

## How each runtime runs

- Node, Bun and Deno run the adapter itself, as the harness's adapter
  command: `node`, `bun` and `deno run -A` on
  `conformance/adapters/zodiacs-engine.mjs`, with `--entry core` for core.
  Bun and Deno are the npm packages `bun` and `deno` at the versions the
  lockfile pins.
- Chromium, Firefox and WebKit run `browser-adapter.mjs`, which speaks the
  same adapter protocol on its standard input and output. It bundles
  `page-entry.mjs` with esbuild (`bundle.mjs`), resolving the chart entry to
  `dist/index.js` for root or `dist/core.js` for core. Both use the adapter's
  `createHandlers`, with each dynamically imported tzdb shard kept as a
  chunk of its own. As the adapter does, the root is put on the shipped DE440
  pack with `useDe440()` (from 3.0.0) and core on astronomy-engine. A loopback server
  serves only those bundled files, Playwright opens the page in the browser
  and refuses every other request, and each request is answered in the page.
  WebKit here is Playwright's WebKit build on Linux, not Safari on a phone or
  a Mac.
- `tee-adapter.mjs` sits between the harness and each adapter and keeps a
  copy of every line the adapter writes (`responses.jsonl`), so that values,
  not only residuals, can be compared. For the native runtimes it adds
  `runtime` to the adapter's first line, as `native-extras.mjs` reported it
  from inside that runtime; the browser adapter reports its own.
- `native-extras.mjs` (in Node, Bun and Deno) and the browser page also
  compute draft natal receipts (`createNatalEnvelope`, then
  `serializeNatalEnvelope`) for the synthetic births in `receipt-cases.mjs`,
  using the selected entry for the chart. The run compares their SHA-256
  digests with Node's for that entry.
- Both entries follow the adapter's existing routing for the shared `/geo`
  and `/calc` functions, including `/calc` for event ingresses.

## What a run writes, and when it fails

For each runtime, `<dir>/<runtime>/` for root and `<dir>/core/<runtime>/`
for core hold `results.json` (the harness's results file, with the runtime
and version in `adapter.runtime`),
`responses.jsonl` (every line the adapter wrote) and `summary.json`:

- the runtime's name and version, its JavaScript engine, and the `Intl` time
  zone data version where the runtime exposes it (`process.versions.tz`;
  "not exposed" otherwise);
- the arbiter verdict counts, in total and per level;
- vectors answered, matching supported verdicts, differing verdicts, and
  unsupported vectors. A support difference also appears among differing
  verdicts;
- every vector whose verdict differs from Node's, with both outputs, the
  expected value and the tolerance, classed as "host data" (pass against fail
  on a `time.zone-offset` vector at a local time in 1970 or later, which the
  engine answers from the host's `Intl` data) or "engine" (anything else,
  including an error or an unsupported answer on such a vector);
- for each kind and field, the largest absolute difference from Node's value,
  in degrees (with arcseconds) or seconds, the vector where it occurs, and how
  many values are bit-identical to Node's;
- the receipt digests and whether each equals Node's;
- the gate: whether the run passes, and why not.

`<dir>/matrix.json` and `<dir>/core/matrix.json` collect the summaries for
root and core. `run-all.mjs` exits 1 when the root Node verdicts differ from
`conformance/results/zodiacs-engine.json`, when a runtime's verdict differs
from the same entry's Node verdict for a vector outside the host zone data
exception, when a runtime fails to answer each request exactly once, or when
a results file names a different runtime or entry. No threshold is applied
to the differences in value, and different receipt digests are reported, not
gated: the ECMAScript specification leaves `Math.sin`, `cos`, `tan`, `atan2`,
`exp` and `pow` implementation-approximated, so runtimes may differ in the
last bits.

`RUNTIME_CONFORMANCE_MUTATE=<browser>:<vector id>` moves that vector's
answered longitude by 2 arcseconds in that browser, only to show that the run
then fails. Nothing sets it by default.

## Where parts came from

The loopback server that serves only captured bundle bytes, and the
Playwright request policy that refuses everything but the page's own
modules, follow `edge/scripts/smoke-browser.mjs` and
`edge/scripts/browser-driver.mjs` on the unmerged `infra/edge` branch (pull
request 45), simplified. That branch compares runtimes with each other, bit
for bit, on its own synthetic workloads; this folder judges each runtime
against the conformance suite's outside arbiters and measures the spread
from Node.

## Self-test

`node --test selftest.mjs` needs Node alone. It checks that one L1
longitude moved by 2 arcseconds fails the gate, that a zone vector from 1970
on that flips between pass and fail is "host data" while one that turns
into an error or an unsupported answer fails, that one before 1970 is never
host data, that a results file swapped
with another runtime's is caught by its runtime name, that a missing answer
fails, and that each browser bundle, run in Node, answers every request
exactly as the matching Node adapter does, tzdb shards included. It also
checks that one invocation writes both entries and accepts core verdicts
that agree with the core Node run.
