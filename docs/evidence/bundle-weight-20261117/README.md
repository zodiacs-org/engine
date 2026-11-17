# What the DE440 pack costs a browser bundle (17 November 2026)

Evidence for Linear ZOD-288. It measures what an application's bundle carries
when it imports `@zodiacs/engine`, under four bundlers, for the build on
`main` (2.0.0-rc.2), for 1.1.0 (what `npm install` gives today) and for 1.0.0
(the last version without the pack, and the mutation check). It also measures
a prototype of a pack-free entry, `@zodiacs/engine/core`, kept here as a
patch only. Nothing in this folder or in `tools/bundle-weight/` ships, and
nothing under `src/`, `scripts/`, `dist/` or the root `package.json` changed.
`PROPOSAL.md` puts three ways out in front of the owner; it decides nothing.

Files:

- `results.json`: every number below, written by
  `tools/bundle-weight/measure.mjs`, with the tool versions, the machine, the
  method and 119 recorded checks (all pass).
- `prototype.patch`: the `@zodiacs/engine/core` prototype.
- `PROPOSAL.md`: options A, B and C for the owner.
- The tables below are `node tools/bundle-weight/report.mjs results.json`,
  pasted with their headings one level lower.

## How it was measured

Commit: `main` at `04afaf4` (2.0.0-rc.2). The ticket was written against
`12943c1`; where its facts differ, this folder follows the code at `04afaf4`
and says so.

1. `npm ci && npm run build && npm pack --ignore-scripts` on `04afaf4` gave
   `zodiacs-engine-2.0.0-rc.2.tgz`, 2,734,988 bytes, SHA-256
   `e0621630...eb1cc`: byte for byte the carried
   `artifacts/zodiacs-engine-2.0.0-rc.2.tgz`. 1.1.0 and 1.0.0 are the carried
   archives, unchanged.
2. `measure.mjs` extracts each archive into `node_modules/@zodiacs/engine` of
   a new temporary project outside the checkout, beside astronomy-engine
   2.1.19 (the version every archive here pins), and bundles each app in
   `tools/bundle-weight/apps/` from there, as a user's project would.
3. Bundlers, pinned exactly in `tools/bundle-weight/package-lock.json`, all
   in production mode, minified, ES module output, code splitting on:
   esbuild 0.28.2; Rollup 4.67.4 with `@rollup/plugin-node-resolve` 16.0.3
   (browser) and `@rollup/plugin-terser` 1.0.2; Vite 8.3.5 (`vite build`,
   production only: dev-mode dependency pre-bundling is out of scope);
   webpack 5.112.2 (`experiments.outputModule`). Node 22.22.2.
4. Each JavaScript file a bundler wrote is measured: raw bytes (its length,
   what `wc -c` counts), `gzip -9 -n` bytes (gzip 1.12, the program), and
   brotli at quality 11. **No brotli program was installed**, so brotli is
   Node 22.22.2's zlib at quality 11 with a 24-bit window (the brotli
   program's default window, where zlib's default is 22) and a size hint;
   `results.json` (`tools.brotli`) says so. `measure.mjs` uses the brotli
   program instead wherever one is on `PATH`.
5. Each bundle is then run once in Node to show it computes, and on what
   ephemeris (the last column of the tables).
6. Node cold import: a new `node` process ten times per archive, timing
   `await import("@zodiacs/engine")` and then the first `natalChart`, which is
   the call that decodes the pack and hashes it. Median and full range.
7. **The browser step (plan step 4) was not run.** Playwright's Chromium
   download is blocked by the network policy of the workspace these numbers
   were measured in, and no other Chromium was installed. `measure.mjs` has
   the step behind `--browser <chromium executable>`: 4x CPU throttling,
   DevTools' "Fast 4G" (latency 165 ms, 1,012,500 bytes per second down,
   168,750 up, the preset's 60 ms x 2.75 and 9 and 1.5 Mbit/s x 0.9 as this
   tool states them; not checked against DevTools' source here, since its
   host is blocked too), cold cache, ten loads, median and range of time to
   first chart and of Chromium's `ScriptDuration`. Every `browser` field in
   `results.json` reads `"measured": false` with that reason. Run it later
   with:

   ```sh
   cd tools/bundle-weight && npm ci
   node measure.mjs --archive 2.0.0-rc.2=<archive> --out <dir> --browser <path to chromium>
   ```

Timings were taken on a shared cloud machine (Linux x64, 4 vCPU, Intel Xeon
2.10 GHz), with nothing else running during the measurement run; they vary
from run to run, which is why each is a median of ten with its range, and
none is quoted from a single run.

## What it found

- **The pack is in every bundle that imports the root, under every
  bundler.** App (a), `natalChart` from the root, is 3,415,068 to 3,417,703
  bytes raw (Vite to esbuild), 2,436,357 to 2,439,986 with gzip -9 and
  2,279,479 to 2,281,323 with brotli, one file each. 1.1.0, what npm gives
  today, is within 1,000 bytes of that.
- **`setDefaultEphemeris("astronomy-engine")` does not shrink it.** App (b)
  is 3,415,229 to 3,417,864 bytes raw: the pack stays in, unused.
- **A namespace import keeps it too, in webpack and the other three.**
  `import * as engine` (app a-namespace) is 3,415,078 to 3,417,713 bytes
  raw; `"sideEffects": false` lets a bundler drop an unused module, and the
  pack's module is used.
- **`./lite` and `./time` carry no pack.** App (c) is 4,768 to 4,873 bytes
  raw, app (d) 10,283 to 10,902, every bundler; the largest file of each is
  under 100,000 bytes.
- **The dynamic-import recipe works in all four.** App (e)'s first script is
  745 to 2,534 bytes raw; the pack arrives in a second file of 3,414,614 to
  3,444,935 bytes when the button is pressed. No bundler inlined it ("not
  split" never occurs). esbuild's second file is about 28,000 bytes larger
  than the others' because `await import()` hands it the whole namespace and
  it does not shake the root's unused exports out of it.
- **The prototype `@zodiacs/engine/core` gives app (a) at 75,937 to 79,084
  bytes raw, 33,864 to 35,784 gzip, 28,537 to 30,163 brotli**, close to
  1.0.0's app (a) (74,115 to 76,543 raw), and computes on astronomy-engine.
- **Node:** importing the root of 2.0.0-rc.2 takes a median 45.62 ms (38.32
  to 57.7) and its first `natalChart` 77.37 ms (70.85 to 107.19) more, on
  DE440. The prototype's `./core` imports in 14.29 ms (13.65 to 19.75), and
  its first chart takes 51.11 ms (47.96 to 54.88), on astronomy-engine.
  `docs/de440.md` says the time the first call takes "was not measured for
  1.1.0"; for 1.1.0 it is a median 73.7 ms (70.41 to 88.49) here, in Node on
  this machine, not in a browser.

## Checks the ticket asks for

| Check | Result |
| --- | --- |
| 5 apps by 4 bundlers, raw, gzip and brotli, with load timings and sample counts | sizes: all 20 (and the two extra apps); browser timings not measured (above); Node timings ten samples each |
| App (a), esbuild: the pack chunk within 1 per cent of 3,320,824 bytes | 3,320,151 bytes of the output are the pack chunk's module (esbuild's metafile), 0.020 per cent off, for 2.0.0-rc.2 and for 1.1.0 |
| Apps (c) and (d): no pack, largest file under 100,000 bytes, every bundler | pass, 24 of 24 (two apps, four bundlers, the three archives that have the entries) |
| Mutation: the 1.0.0 archive gives app (a) under 400,000 bytes | 74,115 to 76,543 bytes raw, four of four |
| Property: brotli <= gzip <= raw, every file | pass, every file of every build |
| `prototype.patch` applies with `git apply --check` | applies to `04afaf4`; **does not apply to `12943c1`**, where `src/ephemeris.ts` differs, so it was written against current `main` |

The ticket's own figures for the 1.1.0 pack chunk were 2,394,402 bytes gzip
and 2,243,442 brotli; this run has 2,394,384 and 2,243,438. The gzip
difference is 18 bytes, the stored file name `chunk-767FTO7O.js` and its
terminating zero, which `-n` leaves out; the brotli difference, 4 bytes, is
Node's zlib against the brotli program.

On 1.0.0, apps (b), (c) and (d) do not build: 1.0.0 has no
`setDefaultEphemeris`, no `./lite` and no `./time`. They are recorded with the
bundler's error. App a-core builds only against the prototype archive.

## The prototype, `@zodiacs/engine/core`

`prototype.patch` adds `src/core.ts` (`export * from "./index.js"`) and
`scripts/build-core.mjs`, which bundles it with esbuild on its own into
`dist/core.js`, swapping `src/ephemeris-shipped.ts` (new: the default source's
name and the pack's opener, which `src/ephemeris.ts` now imports) for
`src/core/ephemeris-shipped.ts` (default `"astronomy-engine"`, no pack). The
build refuses a `dist/core.js` that holds the pack's modules or imports
anything but astronomy-engine. It adds the `./core` export and a budget for
it. Applied on a scratch checkout of `04afaf4` (not pushed):

- `dist/core.js` is 108,411 bytes unminified and exports the root's 101
  names. A chart from it equals, as JSON, the root's chart after
  `setDefaultEphemeris("astronomy-engine")` (checked at 2000-01-01T12:00Z),
  and names astronomy-engine 2.1.19. `setDefaultEphemeris("de440")` in it
  computes on astronomy-engine and flags `"de440-unavailable"`.
- The root is unchanged in what it computes; its ephemeris chunk grows by
  109 bytes (the new module), and the pack chunk is the same file.
- Conformance, with the adapter pointed at a copy of the build whose
  `index.js` re-exports `core.js`, on Node 22.22.2: 267 pass, 192 fail, 41
  unsupported of 500; **L1 48 of 240**, L2 150 of 150, L3 69 of 110 (41
  unsupported). `run.mjs --check
  conformance/results/zodiacs-engine-astronomy-engine.json`: every verdict
  matches.
- Checks on the scratch build: `npm run typecheck` and `npm run build` pass.
  `npm test`: 4,365 passed, 3 skipped, 2 failed
  (`scripts/lite-entry.test.mjs`, `scripts/root-isolation.test.mjs`), both
  because the module list the checks read (`readModuleList` in
  `scripts/root-isolation.mjs`) does not yet know `dist/metafile-core.json`;
  `npm run exports:smoke` fails for the same reason. `npm run api:check`
  fails because `api/` has no report for the new entry yet.
  `npm run package:contents` passes the new entry's budget (108,411 of
  109,600) and then fails the package's total cap: 1,392,907 bytes beside
  the pack, over 1,289,000, because `dist/core.js` is a second copy of the
  root's code. Those are the work, and the owner's budget decision, that
  shipping option A would need.
- The prototype archive is 2,767,260 bytes, 32,272 more than 2.0.0-rc.2's.

## Tables

### Sizes and Node timings, per archive

The "First script" column is the file a page loads first (for app (e), the
file before the click). "Runs in Node on" is the ephemeris the bundle's chart
named when run once in Node, or "ran" for apps that compute no chart; 1.0.0's
charts do not name one.

#### 2.0.0-rc.2: zodiacs-engine-2.0.0-rc.2.tgz, 2,734,988 bytes, SHA-256 e0621630b5a0f9dbb6465f4f077630f313217d7b06ee88ffa960696fec5eb1cc

Pack chunk dist/chunk-UXY4RU57.js: 3,320,824 raw, 2,394,383 gzip -9, 2,243,066 brotli 11 (3,319,552 characters of base64).

| App | Bundler | Files | Raw | gzip -9 | brotli 11 | Pack | First script raw | Runs in Node on |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| a | esbuild | 1 | 3,417,703 | 2,439,986 | 2,281,323 | yes | 3,417,703 | jpl-de440 |
| a | rollup | 1 | 3,416,204 | 2,436,935 | 2,280,142 | yes | 3,416,204 | jpl-de440 |
| a | vite | 1 | 3,415,068 | 2,438,397 | 2,279,479 | yes | 3,415,068 | jpl-de440 |
| a | webpack | 1 | 3,415,146 | 2,436,357 | 2,279,651 | yes | 3,415,146 | jpl-de440 |
| b | esbuild | 1 | 3,417,864 | 2,440,054 | 2,281,149 | yes | 3,417,864 | astronomy-engine |
| b | rollup | 1 | 3,416,300 | 2,436,972 | 2,280,217 | yes | 3,416,300 | astronomy-engine |
| b | vite | 1 | 3,415,229 | 2,438,460 | 2,280,038 | yes | 3,415,229 | astronomy-engine |
| b | webpack | 1 | 3,415,238 | 2,436,390 | 2,279,882 | yes | 3,415,238 | astronomy-engine |
| c | esbuild | 1 | 4,872 | 2,176 | 1,984 | no | 4,872 | ran |
| c | rollup | 1 | 4,779 | 2,114 | 1,904 | no | 4,779 | ran |
| c | vite | 1 | 4,768 | 2,104 | 1,910 | no | 4,768 | ran |
| c | webpack | 1 | 4,873 | 2,131 | 1,915 | no | 4,873 | ran |
| d | esbuild | 1 | 10,902 | 6,422 | 5,608 | no | 10,902 | ran |
| d | rollup | 1 | 10,283 | 6,083 | 5,334 | no | 10,283 | ran |
| d | vite | 1 | 10,789 | 6,357 | 5,536 | no | 10,789 | ran |
| d | webpack | 1 | 10,661 | 6,229 | 5,486 | no | 10,661 | ran |
| e | esbuild | 2 | 3,445,680 | 2,450,366 | 2,290,926 | split: the pack is in a chunk loaded on click | 745 | jpl-de440 |
| e | rollup | 2 | 3,417,482 | 2,439,352 | 2,280,547 | split: the pack is in a chunk loaded on click | 777 | jpl-de440 |
| e | vite | 2 | 3,417,069 | 2,439,393 | 2,280,729 | split: the pack is in a chunk loaded on click | 2,455 | jpl-de440 |
| e | webpack | 2 | 3,417,367 | 2,437,558 | 2,280,808 | split: the pack is in a chunk loaded on click | 2,534 | jpl-de440 |
| a-namespace | esbuild | 1 | 3,417,713 | 2,439,992 | 2,281,351 | yes | 3,417,713 | jpl-de440 |
| a-namespace | rollup | 1 | 3,416,214 | 2,436,941 | 2,280,221 | yes | 3,416,214 | jpl-de440 |
| a-namespace | vite | 1 | 3,415,078 | 2,438,403 | 2,279,519 | yes | 3,415,078 | jpl-de440 |
| a-namespace | webpack | 1 | 3,415,166 | 2,436,372 | 2,279,399 | yes | 3,415,166 | jpl-de440 |
| a-core | esbuild | | | | | | | did not build: Build failed with 1 error: / src/a-core.js:4:27: ERROR: Could not resolve "@zodiacs/engine/core" |
| a-core | rollup | | | | | | | did not build: "@zodiacs/engine/core" is imported by "../../../../../tmp/bundle-weight-oEYYYK/src/a-core.js", but could not be resolved |
| a-core | vite | | | | | | | did not build: Build failed with 1 error: / [rolldown:vite-resolve] plugin `rolldown:vite-resolve` threw an error / Caused by: /     ". |
| a-core | webpack | | | | | | | did not build: Module not found: Error: "./core" is not exported under the conditions ["typescript","import","module-sync","module","we |

Node cold import of `@zodiacs/engine`: import median 45.62 ms (38.32 to 57.7, 10 runs); first natalChart after it median 77.37 ms (70.85 to 107.19, 10 runs) on jpl-de440; whole process median 178.15 ms (153.89 to 214.07, 10 runs).

#### 1.1.0: zodiacs-engine-1.1.0.tgz, 2,726,321 bytes, SHA-256 4e53cda9bd6ccb5f5581c2a9af2f2ae4010af2599f411ac5220425e0932e41ac

Pack chunk dist/chunk-767FTO7O.js: 3,320,824 raw, 2,394,384 gzip -9, 2,243,438 brotli 11 (3,319,552 characters of base64).

| App | Bundler | Files | Raw | gzip -9 | brotli 11 | Pack | First script raw | Runs in Node on |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| a | esbuild | 1 | 3,417,261 | 2,439,817 | 2,281,243 | yes | 3,417,261 | jpl-de440 |
| a | rollup | 1 | 3,415,769 | 2,436,766 | 2,279,473 | yes | 3,415,769 | jpl-de440 |
| a | vite | 1 | 3,414,637 | 2,438,217 | 2,279,510 | yes | 3,414,637 | jpl-de440 |
| a | webpack | 1 | 3,414,715 | 2,436,193 | 2,279,697 | yes | 3,414,715 | jpl-de440 |
| b | esbuild | 1 | 3,417,422 | 2,439,880 | 2,281,298 | yes | 3,417,422 | astronomy-engine |
| b | rollup | 1 | 3,415,865 | 2,436,802 | 2,279,526 | yes | 3,415,865 | astronomy-engine |
| b | vite | 1 | 3,414,798 | 2,438,282 | 2,279,512 | yes | 3,414,798 | astronomy-engine |
| b | webpack | 1 | 3,414,807 | 2,436,224 | 2,279,555 | yes | 3,414,807 | astronomy-engine |
| c | esbuild | 1 | 4,872 | 2,176 | 1,984 | no | 4,872 | ran |
| c | rollup | 1 | 4,779 | 2,114 | 1,904 | no | 4,779 | ran |
| c | vite | 1 | 4,768 | 2,104 | 1,910 | no | 4,768 | ran |
| c | webpack | 1 | 4,873 | 2,131 | 1,915 | no | 4,873 | ran |
| d | esbuild | 1 | 10,902 | 6,422 | 5,608 | no | 10,902 | ran |
| d | rollup | 1 | 10,283 | 6,083 | 5,334 | no | 10,283 | ran |
| d | vite | 1 | 10,789 | 6,357 | 5,536 | no | 10,789 | ran |
| d | webpack | 1 | 10,661 | 6,229 | 5,486 | no | 10,661 | ran |
| e | esbuild | 2 | 3,444,972 | 2,450,119 | 2,290,505 | split: the pack is in a chunk loaded on click | 745 | jpl-de440 |
| e | rollup | 2 | 3,417,050 | 2,437,509 | 2,280,396 | split: the pack is in a chunk loaded on click | 777 | jpl-de440 |
| e | vite | 2 | 3,416,638 | 2,439,212 | 2,280,361 | split: the pack is in a chunk loaded on click | 2,455 | jpl-de440 |
| e | webpack | 2 | 3,416,939 | 2,437,379 | 2,280,679 | split: the pack is in a chunk loaded on click | 2,534 | jpl-de440 |
| a-namespace | esbuild | 1 | 3,417,271 | 2,439,826 | 2,281,223 | yes | 3,417,271 | jpl-de440 |
| a-namespace | rollup | 1 | 3,415,779 | 2,436,772 | 2,279,496 | yes | 3,415,779 | jpl-de440 |
| a-namespace | vite | 1 | 3,414,647 | 2,438,222 | 2,279,510 | yes | 3,414,647 | jpl-de440 |
| a-namespace | webpack | 1 | 3,414,735 | 2,436,209 | 2,279,365 | yes | 3,414,735 | jpl-de440 |
| a-core | esbuild | | | | | | | did not build: Build failed with 1 error: / src/a-core.js:4:27: ERROR: Could not resolve "@zodiacs/engine/core" |
| a-core | rollup | | | | | | | did not build: "@zodiacs/engine/core" is imported by "../../../../../tmp/bundle-weight-qZZ9Q0/src/a-core.js", but could not be resolved |
| a-core | vite | | | | | | | did not build: Build failed with 1 error: / [rolldown:vite-resolve] plugin `rolldown:vite-resolve` threw an error / Caused by: /     ". |
| a-core | webpack | | | | | | | did not build: Module not found: Error: "./core" is not exported under the conditions ["typescript","import","module-sync","module","we |

Node cold import of `@zodiacs/engine`: import median 40.25 ms (37.71 to 43.29, 10 runs); first natalChart after it median 73.7 ms (70.41 to 88.49, 10 runs) on jpl-de440; whole process median 158.85 ms (152.43 to 178.21, 10 runs).

#### 1.0.0: zodiacs-engine-1.0.0.tgz, 288,063 bytes, SHA-256 c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6

No file of this archive holds the pack.

| App | Bundler | Files | Raw | gzip -9 | brotli 11 | Pack | First script raw | Runs in Node on |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| a | esbuild | 1 | 76,543 | 35,111 | 29,262 | no | 76,543 | ran |
| a | rollup | 1 | 75,285 | 34,061 | 28,307 | no | 75,285 | ran |
| a | vite | 1 | 74,115 | 33,609 | 28,071 | no | 74,115 | ran |
| a | webpack | 1 | 74,292 | 33,446 | 27,913 | no | 74,292 | ran |
| b | esbuild | | | | | | | did not build: Build failed with 1 error: / src/b-root-astronomy-engine.js:2:21: ERROR: No matching export in "node_modules/@zodiacs/en |
| b | rollup | | | | | | | did not build: ../../../../../tmp/bundle-weight-jNwF9R/src/b-root-astronomy-engine.js (2:21): "setDefaultEphemeris" is not exported by  |
| b | vite | | | | | | | did not build: Build failed with 1 error: / [MISSING_EXPORT] "setDefaultEphemeris" is not exported by "../../../../../tmp/bundle-weight |
| b | webpack | | | | | | | did not build: export 'setDefaultEphemeris' (imported as 'setDefaultEphemeris') was not found in '@zodiacs/engine' (possible exports: A |
| c | esbuild | | | | | | | did not build: Build failed with 1 error: / src/c-lite.js:3:39: ERROR: Could not resolve "@zodiacs/engine/lite" |
| c | rollup | | | | | | | did not build: "@zodiacs/engine/lite" is imported by "../../../../../tmp/bundle-weight-jNwF9R/src/c-lite.js", but could not be resolved |
| c | vite | | | | | | | did not build: Build failed with 1 error: / [rolldown:vite-resolve] plugin `rolldown:vite-resolve` threw an error / Caused by: /     ". |
| c | webpack | | | | | | | did not build: Module not found: Error: "./lite" is not exported under the conditions ["typescript","import","module-sync","module","we |
| d | esbuild | | | | | | | did not build: Build failed with 1 error: / src/d-time.js:2:26: ERROR: Could not resolve "@zodiacs/engine/time" |
| d | rollup | | | | | | | did not build: "@zodiacs/engine/time" is imported by "../../../../../tmp/bundle-weight-jNwF9R/src/d-time.js", but could not be resolved |
| d | vite | | | | | | | did not build: Build failed with 1 error: / [rolldown:vite-resolve] plugin `rolldown:vite-resolve` threw an error / Caused by: /     ". |
| d | webpack | | | | | | | did not build: Module not found: Error: "./time" is not exported under the conditions ["typescript","import","module-sync","module","we |
| e | esbuild | 2 | 102,414 | 44,918 | 37,806 | no pack | 745 | ran |
| e | rollup | 2 | 76,579 | 34,761 | 28,848 | no pack | 777 | ran |
| e | vite | 2 | 76,116 | 34,611 | 28,904 | no pack | 2,455 | ran |
| e | webpack | 2 | 76,506 | 34,620 | 28,955 | no pack | 2,534 | ran |
| a-namespace | esbuild | 1 | 76,553 | 35,115 | 29,283 | no | 76,553 | ran |
| a-namespace | rollup | 1 | 75,295 | 34,067 | 28,285 | no | 75,295 | ran |
| a-namespace | vite | 1 | 74,125 | 33,615 | 28,092 | no | 74,125 | ran |
| a-namespace | webpack | 1 | 74,312 | 33,460 | 27,874 | no | 74,312 | ran |
| a-core | esbuild | | | | | | | did not build: Build failed with 1 error: / src/a-core.js:4:27: ERROR: Could not resolve "@zodiacs/engine/core" |
| a-core | rollup | | | | | | | did not build: "@zodiacs/engine/core" is imported by "../../../../../tmp/bundle-weight-jNwF9R/src/a-core.js", but could not be resolved |
| a-core | vite | | | | | | | did not build: Build failed with 1 error: / [rolldown:vite-resolve] plugin `rolldown:vite-resolve` threw an error / Caused by: /     ". |
| a-core | webpack | | | | | | | did not build: Module not found: Error: "./core" is not exported under the conditions ["typescript","import","module-sync","module","we |

Node cold import of `@zodiacs/engine`: import median 18.77 ms (17.65 to 24.48, 10 runs); first natalChart after it median 47.21 ms (44.84 to 55.41, 10 runs) on null; whole process median 114.19 ms (104.45 to 133.48, 10 runs).

#### core-prototype: zodiacs-engine-2.0.0-rc.2-core-prototype.tgz, 2,767,260 bytes, SHA-256 12a509438e6a90856dc771c9da6e72d9ba7e97cfb2263f086647324bdb231562

Pack chunk dist/chunk-UXY4RU57.js: 3,320,824 raw, 2,394,383 gzip -9, 2,243,066 brotli 11 (3,319,552 characters of base64).

| App | Bundler | Files | Raw | gzip -9 | brotli 11 | Pack | First script raw | Runs in Node on |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| a | esbuild | 1 | 3,417,709 | 2,439,992 | 2,281,342 | yes | 3,417,709 | jpl-de440 |
| a | rollup | 1 | 3,416,204 | 2,436,935 | 2,280,142 | yes | 3,416,204 | jpl-de440 |
| a | vite | 1 | 3,415,074 | 2,438,403 | 2,280,009 | yes | 3,415,074 | jpl-de440 |
| a | webpack | 1 | 3,415,146 | 2,436,357 | 2,279,651 | yes | 3,415,146 | jpl-de440 |
| b | esbuild | 1 | 3,417,870 | 2,440,059 | 2,281,193 | yes | 3,417,870 | astronomy-engine |
| b | rollup | 1 | 3,416,300 | 2,436,972 | 2,280,217 | yes | 3,416,300 | astronomy-engine |
| b | vite | 1 | 3,415,235 | 2,438,464 | 2,280,070 | yes | 3,415,235 | astronomy-engine |
| b | webpack | 1 | 3,415,238 | 2,436,390 | 2,279,882 | yes | 3,415,238 | astronomy-engine |
| c | esbuild | 1 | 4,872 | 2,176 | 1,984 | no | 4,872 | ran |
| c | rollup | 1 | 4,779 | 2,114 | 1,904 | no | 4,779 | ran |
| c | vite | 1 | 4,768 | 2,104 | 1,910 | no | 4,768 | ran |
| c | webpack | 1 | 4,873 | 2,131 | 1,915 | no | 4,873 | ran |
| d | esbuild | 1 | 10,902 | 6,422 | 5,608 | no | 10,902 | ran |
| d | rollup | 1 | 10,283 | 6,083 | 5,334 | no | 10,283 | ran |
| d | vite | 1 | 10,789 | 6,357 | 5,536 | no | 10,789 | ran |
| d | webpack | 1 | 10,661 | 6,229 | 5,486 | no | 10,661 | ran |
| e | esbuild | 2 | 3,445,686 | 2,450,372 | 2,290,876 | split: the pack is in a chunk loaded on click | 745 | jpl-de440 |
| e | rollup | 2 | 3,417,482 | 2,439,352 | 2,280,547 | split: the pack is in a chunk loaded on click | 777 | jpl-de440 |
| e | vite | 2 | 3,417,075 | 2,439,399 | 2,280,712 | split: the pack is in a chunk loaded on click | 2,455 | jpl-de440 |
| e | webpack | 2 | 3,417,362 | 2,437,556 | 2,280,451 | split: the pack is in a chunk loaded on click | 2,531 | jpl-de440 |
| a-namespace | esbuild | 1 | 3,417,719 | 2,439,999 | 2,281,375 | yes | 3,417,719 | jpl-de440 |
| a-namespace | rollup | 1 | 3,416,214 | 2,436,941 | 2,280,221 | yes | 3,416,214 | jpl-de440 |
| a-namespace | vite | 1 | 3,415,084 | 2,438,409 | 2,280,050 | yes | 3,415,084 | jpl-de440 |
| a-namespace | webpack | 1 | 3,415,166 | 2,436,372 | 2,279,399 | yes | 3,415,166 | jpl-de440 |
| a-core | esbuild | 1 | 79,084 | 35,784 | 30,163 | no | 79,084 | astronomy-engine |
| a-core | rollup | 1 | 76,951 | 34,530 | 28,914 | no | 76,951 | astronomy-engine |
| a-core | vite | 1 | 76,548 | 34,214 | 28,933 | no | 76,548 | astronomy-engine |
| a-core | webpack | 1 | 75,937 | 33,864 | 28,537 | no | 75,937 | astronomy-engine |

Node cold import of `@zodiacs/engine`: import median 44.68 ms (38.56 to 53.77, 10 runs); first natalChart after it median 76.14 ms (72.39 to 107.19, 10 runs) on jpl-de440; whole process median 179.32 ms (158.41 to 201.91, 10 runs).
Node cold import of `@zodiacs/engine/core`: import median 14.29 ms (13.65 to 19.75, 10 runs); first natalChart after it median 51.11 ms (47.96 to 54.88, 10 runs) on astronomy-engine; whole process median 111.61 ms (104.38 to 126.68, 10 runs).

Checks: 119, 0 failed.
- pass: 2.0.0-rc.2 a esbuild: the pack chunk's bytes in the output within 1 per cent of the archive's dist/chunk-UXY4RU57.js (3320824): 3320151 bytes, 0.020 per cent off
- pass: 1.1.0 a esbuild: the pack chunk's bytes in the output within 1 per cent of the archive's dist/chunk-767FTO7O.js (3320824): 3320151 bytes, 0.020 per cent off
- pass: 1.0.0 a esbuild: an archive with no pack gives app (a) under 400,000 bytes raw: 76543
- pass: 1.0.0 a rollup: an archive with no pack gives app (a) under 400,000 bytes raw: 75285
- pass: 1.0.0 a vite: an archive with no pack gives app (a) under 400,000 bytes raw: 74115
- pass: 1.0.0 a webpack: an archive with no pack gives app (a) under 400,000 bytes raw: 74292
- pass: core-prototype a esbuild: the pack chunk's bytes in the output within 1 per cent of the archive's dist/chunk-UXY4RU57.js (3320824): 3320151 bytes, 0.020 per cent off

## Rerun

```sh
npm ci && npm run build && npm pack --ignore-scripts --pack-destination /tmp/pack
cd tools/bundle-weight && npm ci
node measure.mjs \
  --archive 2.0.0-rc.2=/tmp/pack/zodiacs-engine-2.0.0-rc.2.tgz \
  --archive 1.1.0=../../artifacts/zodiacs-engine-1.1.0.tgz \
  --archive 1.0.0=../../artifacts/zodiacs-engine-1.0.0.tgz \
  --archive core-prototype=<archive packed from a checkout with prototype.patch applied> \
  --out ../../docs/evidence/bundle-weight-20261117
node report.mjs ../../docs/evidence/bundle-weight-20261117/results.json
git apply --check ../../docs/evidence/bundle-weight-20261117/prototype.patch
```

Sizes come out the same on every run with the same tool versions; timings do
not, and a rerun is compared by its medians and ranges.
