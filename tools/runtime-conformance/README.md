# Runtime conformance

This private folder runs the conformance suite's requests (640 from suite
0.3.0, `conformance/vectors/0.3.0/`; the evidence of 17 November ran 0.2.0's
500) through `@zodiacs/engine` in six JavaScript
runtimes: Node, Bun, Deno, Chromium, Firefox and WebKit. Every run goes
through the unchanged harness (`conformance/harness/run.mjs`) and the same
adapter code (`conformance/adapters/zodiacs-engine.mjs`), so every verdict is
judged against the vectors' own arbiters with the suite's tolerances. Node's
values are used only to measure how far another runtime's values are from
them; they are never the pass mark.

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

`--runtimes node,bun,deno` runs a subset (Node always runs, as the
reference). `.github/workflows/runtime-conformance.yml` runs all six on pull
requests that touch `src/`, `conformance/`, the root `package.json` or
lockfile, the build configuration (`tsconfig.base.json`,
`tsconfig.build.json`, `scripts/build-lite.mjs`) or this folder, and weekly.

## How each runtime runs

- Node, Bun and Deno run the adapter itself, as the harness's adapter
  command: `node`, `bun` and `deno run -A` on
  `conformance/adapters/zodiacs-engine.mjs`. Bun and Deno are the npm
  packages `bun` and `deno` at the versions the lockfile pins.
- Chromium, Firefox and WebKit run `browser-adapter.mjs`, which speaks the
  same adapter protocol on its standard input and output. It bundles
  `page-entry.mjs` with esbuild (`bundle.mjs`): the built engine in `dist/`
  and the adapter's own `createHandlers`, with each tzdb shard the engine
  loads by dynamic import kept as a chunk of its own. A loopback server
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
  `serializeNatalEnvelope`) for the five synthetic births in
  `receipt-cases.mjs`, whose SHA-256 digests are compared with Node's.

## What a run writes, and when it fails

For each runtime, `<dir>/<runtime>/` holds `results.json` (the harness's
results file; `adapter.runtime` names the runtime and its version),
`responses.jsonl` (every line the adapter wrote) and `summary.json`:

- the runtime's name and version, its JavaScript engine, and the `Intl` time
  zone data version where the runtime exposes it (`process.versions.tz`;
  "not exposed" otherwise);
- the verdict counts, in total and per level;
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

`<dir>/matrix.json` collects every summary's headline. `run-all.mjs` exits 1
when Node's verdicts differ from `conformance/results/zodiacs-engine.json`,
when a runtime's verdict differs from Node's for a vector that is not "host
data", when a runtime does not answer every request exactly once, or when a
results file names another runtime than its folder's. No threshold is applied
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
fails, and that the browser bundle, run in Node, answers every request
exactly as the Node adapter does, tzdb shards included.
