# The time entry in 1.1.0-rc.2: the formal run

The formal run of `PREREGISTRATION.md` in this folder, `@zodiacs/engine/time`
(zodiacs.org's finding F-53), with every dated amendment at its end applied
(the owner's answers of 2026-11-03, the changes after review 1 of 2026-11-03,
and T12's tool of 2026-11-04), and with the committed tools in `tools/`. The
checks ran once each, alone, in the order of section 12: T6 and T11 before
the build, then one build, then T1, T2, T8, T9 and T13, then T3, T4, T7, T10
and T12, then T5; then `tools/controls.sh` for every control. None was rerun,
and no tool, rule or tolerance was changed. T1 to T13 pass, and every
control failed as required. T11's first invocation, with `--repo .`, stopped
with a Node error before it scanned anything; the coordinator then ran the
unchanged tool once with the checkout's absolute path, as its usage line
documents, and it passed (*T11: the error, and its run*, below). Nothing was
committed.

- **Commit** 237b2265fcc53ae51abcb4f8e895e64c66321f5e (branch
  `rc2/main-first`), the reviewed tree whose packed bytes are the source
  commit's; HEAD was the same at the start and at the end
  (`results/00-start.log`, `results/99-end.log`).
- **Machine** darwin-arm64 (macOS 27.0.1); **Node** v22.22.2 (npm 10.9.7)
  for every step, and v20.19.0 where T3 and its control name it; **Python**
  3.9.6, the system `python3`, recorded but not used: no tool of this unit
  runs Python, and pyerfa, numpy and pyswisseph were not used. TypeScript
  5.9.3, tsup 8.5.1, esbuild 0.27.7, astronomy-engine 2.1.19 and vitest 2.1.9,
  as installed in the checkout (`results/00-start.log`).
- **When** 2026-11-04, from 12:34:04 to 12:41:27 (ICT, the start and end
  logs).
- **Build and pack.** `npm run build` once, after T6 and T11
  (`results/05-build.log`). The candidate packed from this tree with
  `npm pack --ignore-scripts` into a scratch folder outside the checkout:
  SHA-256 `c5aef0e3f20a19cf7ffabc99112cf592045199d6803814cf4ef6ea013615351c`,
  318,004 bytes, 90 files, the same SHA-256 as `../tree-jobs.log`'s pack and
  byte for byte (`cmp`) the candidate SR3 ran on. It was extracted into a
  scratch consumer as `node_modules/@zodiacs/engine`, with the checkout's
  astronomy-engine 2.1.19 linked beside it, as the carrier's `time-entry` job
  does; its 84 `dist/*.js` and `dist/*.d.ts` files are byte for byte the
  build's (`results/06-pack.log`).
- **Corpora** (section 5), built by `tools/corpora.mjs`: K1 14,765 instants,
  K2a 50,000, K2b 50,000, V2 10 vectors, K3 41 instants, K4 101 and V 15
  vectors, each with the SHA-256 of its JSON text in `results/corpora.json`
  (`results/02-corpora.log`).
- **Site inputs** (sections 4 and 5): `src/lib/engine/time-basis.mjs` and
  `src/lib/engine/time-basis.d.mts`, read with
  `git -C <programme>/site-b3c show 9a67f761bc231741c6571af2dfae65b798954e11:<path>`
  into scratch files. Their blobs, SHA-256 and sizes are section 4's pins
  (26,217 and 2,711 bytes), and the module's header names
  `vendor/zodiacs-engine-1.1.0-rc.1.tgz` (`results/01-site-inputs.log`). Only
  `git rev-parse` and `git show` ran in that clone, with lazy fetching and
  optional locks off; it was not edited.
- **Logs.** Each log under `results/` begins with the machine, Node, npm,
  Python and commit, the environment, the free disk, the working folder and
  the command, and ends with the exit status; local paths are shortened to
  `<checkout>`, `<scratch>` (this run's scratch folder), `<scratchpad>`,
  `<programme>` and `<home>`. `results/99-end.log` gives the SHA-256 of each
  output written before it.

## Checks and controls

| check | verdict | figures (this run) | control | failed as required |
| --- | --- | --- | --- | --- |
| T1 | pass | the pack's `./time` has exactly R1's ten runtime names, `timeBands` among them (`results/07a-t1-runtime-names.log`, the carrier job's T1 script); `npm run api:check`: "api-report: 15 entry points match api/" (`results/07b-t1-api-check.log`); `src/time.test.ts`, 10 of 10 tests pass, among them "exports exactly the ten values of R1" and "declares exactly R1's twenty names in api/time.api.md" (`results/07c-t1-time-test.log`); `api/time.api.md` heads its block "## Exported (20)" and declares those 20 names, with no block of names referenced and not exported (`results/19-figures.log`) | R1's list less `elapsedDays`: the entry's names equal R1's, not that list, exit 1 (`results/controls/T1-list.out`); `api:check` on a copy of the build whose `api/time.api.md` reads `# @zodiacs/engine/tame`: "api/time.api.md differs from the build's declarations" (`results/controls/T1-api.out`) | yes, both |
| T2 | pass | `npm run exports:smoke` passes (`results/08-t2-t13-exports-smoke.log`), with `checkSelfContained("time")` allowing no external and the time entry's graph read both ways. That graph (`results/19-figures.log`): `dist/time.js` and six chunks, 42,306 bytes, every import a `./` file; its sources, held and marked modules are the same ten, section 6's nine and `src/time-bands.ts`; none imports astronomy-engine; of the `OPT_IN_SOURCE` modules only `src/time.ts` and `src/time-bands.ts`; neither `src/ephemeris.ts` nor `src/api.ts` | `checkSelfContained("index")` allowing no external, on a copy of the build: "external dependency in index build: astronomy-engine"; a copy whose `dist/time.js` starts with `import "astronomy-engine";`: "external dependency in time build: astronomy-engine" (`results/controls/T2-index.out`, `results/controls/T2-time.out`) | yes, both |
| T3 | pass | `tools/no-ephemeris.sh` on the packed tarball, in a consumer holding only the extracted package (`results/11-t3-no-ephemeris.log`): on Node v22.22.2 and v20.19.0, each accepting `--no-experimental-detect-module`, `timeBasis(Date.UTC(2017, 0, 1))` gives `taiMinusUtc` 37 and model `"iers-utc/1"`, and `eclipticOfDate(1, 0, 0, 0)` gives lon 359.9961300933642 and lat 0 | in the same consumer, `import("@zodiacs/engine")` rejects with `ERR_MODULE_NOT_FOUND` naming astronomy-engine, on both runtimes; the same in `controls.sh`'s run of the tool on the extracted package (`results/controls/T3.out`) | yes, on each |
| T4 | pass | `tools/site-module.mjs` on the pack against the site module (`results/T4.json`, `results/12-t4-site-module.log`): 1,033,254 `timeBasis` records (the 114,806 instants of K1, K2 and K3 on three scales, each without a pin and with two), 0 differences; 266,400 `elapsedDays` pairs, 0 differences, and 108 pairs left out because a sample would lie outside the Date range, as the tool counts them; the frame of date at 114,907 TTs (the 114,806 unpinned UTC records and K4's 101), 10,916,165 numbers, 0 differences; `EPHEMERIS_SPAN` deep-equal | (a) the last leap second removed: all 1,734 unpinned UTC records from 2017-01-01 to 2027-10-02 differ and none outside them (8,671 records on every scale and setting, and 90 pairs); (b) the first nutation coefficient read as `-172064160`: 0 record differences, while frames differ at 114,907 of 114,907 TTs (1,952,159 numbers); (c) the module's `timeBasis(ms + 1)`: 1,033,254 of 1,033,254 records differ (`results/controls/T4-a.json` to `T4-c.json`) | yes, all three |
| T5 | pass | `tools/natal-parity.mjs` on the pack (`results/T5.json`, `results/16-t5-natal-parity.log`): 16,765 records (K1 and the first 2,000 instants of K2a), `deltaT` and `timeScale` equal to `natalChart`'s, 0 differences; 201,180 longitudes of the 12 bodies, 0 differences (`Object.is`); astronomy-engine 2.1.19 | (a) astronomy-engine's own `Ecliptic()` in place of `eclipticOfDate`: longitudes differ at 16,765 of 16,765 instants (167,650 of 201,180, ten per instant); (b) `natalChart` given a `deltaT` 1 ms off the basis: 16,765 of 16,765 records differ (`results/controls/T5-a.json`, `T5-b.json`) | yes, both |
| T6 | pass | `tools/source-pins.mjs` at HEAD (`results/T6.json`, `results/03-t6-source-pins.log`): the six blobs of section 4, and the working copies' SHA-256 the pins; the texts of `meanObliquity` and `normalizeLongitude` hash to their pins; `package-lock.json` names tsup 8.5.1, esbuild 0.27.7 and TypeScript 5.9.3 | `src/types.ts` with a253973's blob `f26b9d2f` as its pin: HEAD's is `2b77f9ec`; `src/frame.ts` with one byte appended: blob `6b209b66` against the pinned `6657c7ee` (`results/controls/T6-types.json`, `T6-frame-byte.json`) | yes, both |
| T7 | pass | `tools/independent.mjs` on the pack, each reference refused unless its SHA-256 is section 4's pin (`results/T7.json`, `results/13-t7-independent.log`). T7a: 28 changes of `Leap_Second.dat`, 58 checks, 0 failures. T7b: the largest UT1 - UTC difference `0.0007881000000017069` s over the 19,997 finals2000A rows (bound 0.00079 s) and `0.0006568999999992942` s over the 367 C04 rows (bound 0.00066 s), 0 failures. T7c, at K4's 101 epochs: largest Δψ `5.329070518200751e-15`″ and Δε `3.552713678800501e-15`″ (tolerance 1e-10″), mean obliquity `2.9103830456733704e-11`″ (1e-9″), equation of the equinoxes `0.000015035156014919782`″ (5e-5″), and the rotation of the five directions `7.11028263288594e-7`″ (5e-6″) | the last value of `Leap_Second.dat` read as 36: 1 failure, at 2017-01-01 (36 expected, 37 given); every reference value 1 ms larger: 15,201 of the 19,997 finals rows and 308 of the 367 C04 rows outside their bounds; `tilt(tt + 1)`: largest Δψ `0.22577878771190285`″ against 1e-10″ (`results/controls/T7-leap.json`, `T7-ut1.json`, `T7-tilt.json`) | yes, all three |
| T8 | pass | `tools/one-copy.mjs` on the pack, layout MF (`results/T8.json`, `results/09-t8-one-copy.log`): `"zodiacs-deltat/1"` only in `chunk-BHJXUY67.js`, `"064d98b4a531053a"` only in `chunk-B5LKF437.js` and `-172064161,` only in `chunk-2BB5GQ3P.js`, each in `dist/time.js`'s static graph (`time.js` and six chunks); `EPHEMERIS_SPAN` and `DELTA_T_IERS_MODEL` the root's; `TIME_SCALE_NAMES` frozen and `["utc", "ut1", "tt"]` | a copy of the package whose `dist/time.js` is an esbuild bundle of `src/time.ts` without splitting: each string in two files, its chunk and `time.js`, and the span identity false (`results/controls/T8.json`) | yes |
| T9 | pass | `npm run package:contents` (`results/10-t9-package-contents.log`): `./time` 42,306 of 42,400 bytes (2,924 beyond the core's), and every other budget and the cap hold (1,096,783 of 1,100,000 bytes unpacked, 90 files); the budget written is the ceiling, and its comment gives 42,306 bytes in 7 files and 0.22 per cent of headroom; `../sizes.json` records `./time` at 42,306 bytes in 7 files, the figure measured here (`results/19-figures.log`) | the same script on a copy with the `./time` budget at 42,305: "the ./time entry's import graph is 42306 bytes, over its budget of 42305" (`results/controls/T9.out`) | yes |
| T10 | pass | `tools/behaviour.mjs` on the pack (`results/T10.json`, `results/14-t10-behaviour.log`): the 12 calls throw `RangeError` and the 4 others return; the frame, its rows and its tilt, and `tilt(tt)`, are frozen; the write to the rows throws `TypeError` in strict code and is ignored in sloppy code, and `eclipticOfDate` gives the same value after it | the same calls on the site module: 10 of the 12 return without throwing (`timeBasis(NaN)` and `eclipticOfDate(0, 0, 0, 0)` among them), its frame is not frozen, the strict write does not throw, and `eclipticOfDate` gives another value after the write (`results/controls/T10-site-module.json`) | yes |
| T11 | pass | `tools/state-scan.mjs --repo <checkout>` (the checkout as an absolute path, the unchanged tool), run once by the coordinator after the first invocation, `--repo .`, stopped before it scanned anything (`results/04-t11-state-scan.log`, then `results/04b-t11-state-scan-absolute.log` and `results/T11.json`): `src/time.ts` has 21 top-level statements and no finding, with TypeScript 5.9.3 | ran in `controls.sh`, which passes the checkout's absolute path: the scan of `src/time.ts` with `let cache = new Map();` at the top fails, its two findings both on that line (`results/controls/T11-let-cache.json`) | yes |
| T12 | pass | `tools/declarations.sh` with TypeScript 5.9.3 (`--strict`, `--noEmit`, NodeNext), the site's `time-basis.d.mts` at its pin and the pack's `./time`: `declarations.mts` compiles, exit 0 (`results/15-t12-declarations.log`) | the copy's `TimeBasis` with a required `extra: number`: TS2344 in `declarations.mts` at lines 17, 18 and 23 (the assertions on `timeBasis`, `elapsedDays` and `TimeBasis`), exit 2 (`results/controls/T12.out`) | yes |
| T13 | pass | the same run of `npm run exports:smoke` as T2 passes; `OPT_IN_SOURCE` names `src/time.ts` and `src/time-bands.ts` whole, so `src/time-scale.ts` and `src/time-scale-data.ts` are not matched and are in the root's graph, and the entry's two files are not (the root's graph: 24 source modules, 23 marked in 13 files) (`results/19-figures.log`) | a copy of the tree whose `src/index.ts` re-exports `timeBasis` from `./time.js`, built: "time leaked into root: timeBasis" (`results/controls/T13.out`) | yes |

`tools/controls.sh` reported "controls that failed as required: 20; controls
that did not: 0", and T3's control rejected as required on both runtimes
(`results/17-controls.log`); its reports are copied into `results/controls/`
(`results/17b-controls-outputs.log`). No control passed, so no check is void.

### T11: the error, and its run

```
TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received 'package.json'
    at createRequire (node:internal/modules/cjs/loader:1913:13)
    at file://<checkout>/docs/evidence/1.1.0-rc.2-20261102/time-entry/tools/state-scan.mjs:19:12
```

Line 19 of `tools/state-scan.mjs` loads TypeScript with
`createRequire(join(opts.repo, "package.json"))`; given `--repo .`, that is
the relative path `package.json`, which `createRequire` refuses. `--repo .`
is how the carrier's `time-entry` job calls the tool (`../carrier/carrier-gates.sh`,
its step "T11: state-scan.mjs"), so by its code that step would stop with the
same error; `tools/controls.sh` passes the checkout's absolute path, and there
the tool ran. As FORMAL-COMMON rules for a tool error, T11 was not run again
with another argument, and the tool was not changed. Whether and how T11 is
run (the same tool with an absolute `--repo`, or a corrected tool) is the
coordinator's decision. `src/time.test.ts`'s own case "keeps no module state
of its own (T11)", which applies the same three rules to `src/time.ts`,
passed in T1's vitest run; it is the repository's test, not T11's tool, and
it is not counted as T11.

The coordinator's decision, 2026-11-04: the tool's usage line is `--repo
<engine checkout>`, and neither the preregistration nor the tool fixes the
relative form, so the unchanged tool was run once with the checkout's
absolute path, on the same commit, with no result seen before (the first
invocation stopped before reading `src/time.ts`). It passed
(`results/04b-t11-state-scan-absolute.log`, `results/T11.json`). The
carrier's `time-entry` job now passes the clone's absolute path too
(`../carrier/carrier-gates.sh`). The tool is unchanged.

## S0, recorded from the site runs (not run here)

S0 (section 7) runs inside the cut's scratch site runs and was not run here.
It is recorded from programme notes kept outside this repository
(`notes/rc2-2026-11-01/sr2/`, `sr/` and `sr3/`); `results/18-s0-record.log`
holds the lines cited.

- **SR2** (2026-11-03, the candidate packed from 4f4c1e8), the last run with
  S0, passes on both builds: the engine chunk 33,361 of 33,380.4 bytes (19.4
  left) on each; the largest chunk 51,331 of 61,440 (`client.D2SwsgPS.js`)
  by default and 51,366 (`client.CCm7tF5v.js`) with production's flags; 0 of
  19 routes moved against SR; `report-bundles: within budgets`, exit 0, on
  both. Its control, the engine chunk's allowance set to 33,360 bytes: a
  warning (exit 0), and `--fail` exits 1 with the engine chunk the only
  failure, on both builds.
- **Against main's figures for 1.1.0-rc.1**, as SR measured them on b11c5e8
  and SR2 found unchanged (every served chunk byte-identical): the engine
  chunk's static closure grew by 94 bytes against report 6's 33,267 (by 30 to
  132 against main's CI), and `/birth-chart/` by 77 to 191 bytes across the
  builds, with one more chunk. SR attributes the growth to the chunk split
  that this entry needs, not to new code: `src/signs.ts` moved out of
  `dist/chunk-YJ7WZ7NS.js` into `dist/chunk-RMBWKZI2.js`, with
  `src/aspects.ts` and `src/types.ts` in `dist/chunk-F4JKI3XV.js`, and
  `src/nutation.ts` and `src/frame.ts` moved out of the ephemeris chunk into
  `dist/chunk-2BB5GQ3P.js`, which stays inside the same site chunk.
- **SR3** (2026-11-04, the 5c00cb8 candidate, byte for byte this run's pack)
  skipped S0: of the JavaScript, only `dist/calc.js`, `dist/vedic.js` and
  `dist/lite-sect.js` changed against SR2's pack, and the site bundles none of
  them.
- **The layout rule** (section 7): S0 passed on MF, so MF stays; T8 ran with
  layout MF, and S was not built.

## Not run, and why

- **T11**: a tool error (above).
- **S0** ran inside the site runs (above). **S1 to S3** belong to the site's
  adoption and to production after the owner's merge (section 8).
- **The checks on the carried archive** (section 6: the carrier's gates, with
  the archive rebuilds in CI only) follow the carrier commit; this run is on
  the source commit's tree.
- **T9's measurement with and without the `timeBands` re-export** (section 3)
  was made late, under the amendment of 2026-11-03, on that day's tree, as
  the amendment records; it is not repeated here, since it needs a tree
  without the re-export and this run changes no file outside its folder.
- **T8's clause for the layout S**: S was not built, since S0 passed on MF.

## How the checks ran, and other notes

- **What each check read.** T1's runtime names, T3, T4, T5, T7, T8, T10 and
  T12 read the pack in the scratch consumer; T1's `api:check` and tests, T2,
  T9 and T13 the build in the checkout; T6 and T11 the checkout's sources.
  T4 and T10's control read the site module, and T12 and its control the
  site's declarations, each refused by its tool unless its SHA-256 is the
  pin.
- **T1's runtime names** ran the script of the carrier's `time-entry` step
  "T1: the archive's runtime names of ./time, R1's" from a file in place of
  `node -e`, so its arguments start at `process.argv[2]`; nothing else
  differs, and the script is printed in its log. The vitest run used the
  verbose reporter, which lists each test; the carrier's step uses the
  default one.
- **T2 and T13** come from one run of `npm run exports:smoke`, made in T2's
  place in the order, as the carrier's job runs it for both.
- **T3 ran twice, as written.** It ran in its place on the packed tarball;
  `tools/controls.sh` runs `tools/no-ephemeris.sh` again for T3's control, on
  the extracted package, and both runs printed the same results.
- **Arguments.** T6 and T7 were given `--repo .` from the checkout, as the
  carrier's job gives them; both tools read their files relative to it, and
  ran. T11 was given the same (above).
- **Heavy steps** (the build, T4, T5 and the controls) ran under
  `nice -n 10`; each log gives the free disk before its step, never under
  10.0 GiB.
- **No network.** npm ran in its offline mode and git with lazy fetching off
  throughout; the consumer installed nothing (its astronomy-engine is the
  checkout's, from `npm ci` and the lock).
- **Paths.** The step wrapper shortened every log as it was written, and no
  log was shortened by hand. In `results/controls/T12.out` tsc printed its
  file's path relative to the checkout, so those lines read
  `../../../../..<scratch>/tmp/...`. In `results/06-pack.log` the listing of
  the consumer lost the link's name to the filter applied to it;
  `results/19-figures.log` lists the consumer in full. The search in
  `results/99-end.log` finds no local path in `results/`.
- **Written twice.** `results/18-s0-record.log` was written a second time
  only to change its excerpt headings from "lines 1,3" to "lines 1 to 3" and
  the like; it records notes and runs no check.
- **Earlier runs.** None of this unit's checks had a formal run before this
  one. The trials the amendments disclose (T1's and T2's controls on review
  1's build; T12 and its control once, with the amendment of 2026-11-04; T9's
  late measurement) were not formal runs.
- **Other folders.** `results/99-end.log` shows the 54 uncommitted files of
  `f89/` and `lite/` with the SHA-256 they had at the start; no other folder
  of the candidate's evidence changed (`git status`).

## Release state (sections 9 and 10)

**No state changes on this run, and F-53 stays open.** On the source
commit's tree T1 to T13 pass, and every control failed as required (T11 by
the coordinator's run, above). Section 10's pass needs, besides, T1 to T13 on
the carried archive (the carrier's gates, with the archive rebuilds in CI),
the merge of the cut, and S1 to S3 in the site's adoption. With all of them,
F-53 is recorded "fixed and deployed; readings awaiting ratification", which
is `validated` at most: OQ5 is not ratified, so R1 to R6, the MF layout and
its S rule stay unratified (section 3). F-53 has no unit in the ledger, so no
figure moves.

## Files

`results/`: `00-start.log`, `01-site-inputs.log`, `02-corpora.log` with
`corpora.json`, `03-t6-source-pins.log` with `T6.json`,
`04-t11-state-scan.log` (T11's error; no report), `05-build.log`,
`06-pack.log`, `07a-t1-runtime-names.log`, `07b-t1-api-check.log`,
`07c-t1-time-test.log`, `08-t2-t13-exports-smoke.log`,
`09-t8-one-copy.log` with `T8.json`, `10-t9-package-contents.log`,
`11-t3-no-ephemeris.log`, `12-t4-site-module.log` with `T4.json`,
`13-t7-independent.log` with `T7.json`, `14-t10-behaviour.log` with
`T10.json`, `15-t12-declarations.log`, `16-t5-natal-parity.log` with
`T5.json`, `17-controls.log`, `17b-controls-outputs.log` with `controls/`
(36 files: each control's report and standard error, and the outputs of the
runs `controls.sh` reads), `18-s0-record.log`, `19-figures.log` and
`99-end.log`; and this `RESULTS.md`.

## T1 to T13 on the carried archive (2026-11-04, added with the carrier's record)

Sections 6 and 9 also require T1 to T13 on the carried archive. The
carrier's gates ran them once, on the carrier `59c6ea9`, whose archive
(SHA-256 `c5aef0e3f20a19cf7ffabc99112cf592045199d6803814cf4ef6ea013615351c`)
is the one packed above: `carrier-gates.sh time-entry`, in a clean blobless
and sparse clone, Node 22.22.2 and 20.19.0 for T3, with the site's two files
read from its git objects at 9a67f761, each matching its pin. The build's
`dist/*.js` and `dist/*.d.ts` are byte for byte the archive's, and every
step passes, T1 to T13 (`../carrier/time-entry-59c6ea9-v22.22.2.log`, the
tools' reports in `../carrier/time-entry-59c6ea9-v22.22.2/`). No control
runs there: the controls are this run's. F-53 still needs the merge of the
cut and S1 to S3 in the site's adoption; its state does not change.
