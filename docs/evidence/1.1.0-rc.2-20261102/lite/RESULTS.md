# The lite entry in 1.1.0-rc.2: the formal run

The formal run of `PREREGISTRATION.md` in this folder, `@zodiacs/engine/lite`
and the four P2.E units it serves (declinations, sect, composite and
dignities), with every dated amendment at its end applied (through
2026-11-04, review 2), and with the committed tools in `tools/`. L1 to L12
ran once each with their controls, in the order of section 3's table, the
runs that several checks share first. None was rerun, and no tool, rule or
tolerance was changed. Every check passed and every control failed as
required. Nothing was committed.

- **Commit** 237b2265fcc53ae51abcb4f8e895e64c66321f5e (branch
  `rc2/main-first`), the reviewed tree whose packed bytes are the source
  commit's; HEAD was the same at the start and at the end
  (`results/00-start.log`, `results/99-end.log`). As the amendment of
  2026-11-03 (review 1) fixes, L9 and L11 also read the builds of L-c,
  16ad4fea8c5d6f187665de6a467a2a0e12276960, and of the commit before L-a,
  1deb29e2fa19dc8e45c10e7401d76b5f798ad2eb.
- **Machine** darwin-arm64 (macOS 27.0.1); **Node** v22.22.2 (npm 10.9.7),
  and v20.19.0, v22.7.0 and v24.21.0 where L4 and L12 name them; **Python**
  3.9.6, the system `python3`, run with `-I` (L12's control tool only). The
  OQ6 environment was not used: no check here needs pyerfa, numpy or
  pyswisseph (section 7).
- **When** 2026-11-04, from 12:14:59 to 12:21:47 (ICT, the start and end
  logs). No network, no downloads: npm ran in its offline mode throughout,
  and git in this checkout with lazy fetching off (*How the checks ran*,
  below).
- **Build and pack.** `npm run build` once (`results/01-build.log`):
  `dist/lite.js` 146 bytes, its parts 9,665 (declinations), 3,439 (sect),
  3,783 (composite) and 11,897 (dignities) bytes, and `dist/lite.d.ts` 5,135.
  The candidate packed from this tree with `npm pack --ignore-scripts` into
  a scratch folder outside the checkout: SHA-256
  `c5aef0e3f20a19cf7ffabc99112cf592045199d6803814cf4ef6ea013615351c`,
  318,004 bytes, 90 files, the same SHA-256 as `../tree-jobs.log`'s pack
  (`results/02-pack.log`) and the same bytes (`cmp`) as the candidate SR3
  ran on (`results/16-pack-against-sr3.log`). L4 and L12 read it.
- **Logs.** Each log under `results/` begins with the machine, Node, npm,
  Python and commit, the environment, the working folder and the command;
  local paths are shortened to `<checkout>`, `<scratch>` and `<programme>`.
  `results/99-end.log` gives the SHA-256 of each output written before it;
  `results/16-pack-against-sr3.log` was written after it.

## Checks and controls

| check | verdict | figures (this run) | control | failed as required |
| --- | --- | --- | --- | --- |
| L1 | pass | `npm run exports:smoke` passes (`results/03-exports-smoke.log`); this build passes L1 in `tools/broken-builds.mjs` (`results/05-l1-l3-broken-builds.log`) and in `scripts/lite-entry.test.mjs`, "passes L1 to L3" (`results/04-tests.log`); `dist/lite.js` holds the four export lines of its parts and nothing else (`results/15-figures.log`) | the unit tests' synthetic builds, each refused: a part importing a chunk (four forms), a dynamic import in `dist/lite.js` and in a part, a fifth file, a missing part, an extra line, a specifier outside `dist/`. The three real broken builds: (a), as amended on 2026-11-04, `dist/lite.js` with a fifth export line naming `dist/lite-composite-chart.js` (135,631 bytes, astronomy-engine inlined), "dist/lite.js must import exactly the four lite parts, declinations, sect, composite and dignities, in that order"; (b) the composite part re-exporting `compositeChart` with astronomy-engine external, "dist/lite-composite.js imports or re-exports astronomy-engine; a lite part must import nothing"; (c) the parts built with splitting on, "dist/lite-sect.js imports or re-exports ./chunk-3KZLMQOJ.js; a lite part must import nothing" | yes, all |
| L2 | pass | in the same runs: the merged module list describes every `dist/*.js` byte for byte, the entry's source closure is the pin, `src/lite.ts` and 15 modules ("the lite entry holds its 16 pinned source modules in 5 files that import nothing"; the pin in `results/15-figures.log`), each part's held and marked modules lie inside its own pin, and none is under `node_modules/` | the composite part built from `src/techniques/relationship.ts`, "the lite entry's source graph is not the pinned one"; the module list one byte stale, "dist/lite-composite.js differs from the build's module list; rebuild with npm run build"; the amendment's extra build (the composite part re-exporting `compositeChart`, astronomy-engine inlined, 131,045 bytes) fails L2 and L3; and the unit tests' L2 cases (a part built from the relationship module, a module outside a part's pin by the list or by its marker, a stale or incomplete list) | yes, all |
| L3 | pass | no file of the entry holds `astronomy-engine`, `Value is not boolean:`, `Light-travel time solver did not converge` or `zodiacs-deltat/1` (the same runs) | a copy of `dist/lite-dignities.js` with "// Light-travel time solver did not converge" appended (11,942 bytes), "dist/lite-dignities.js holds ..."; the unit test's case for each of the four strings in `dist/lite.js` and in `dist/lite-composite.js` | yes, all |
| L4 | pass | `tools/no-ephemeris.sh` on the pack (`results/06-l4-no-ephemeris.log`): under the resolve hook that refuses astronomy-engine, `import("@zodiacs/engine/lite")` gives 27 exports, none undefined, on Node v20.19.0, v22.22.2 and v24.21.0; the export smoke test's probe in the checkout passes too | the root entry under the same hook fails with the hook's error on each of the three Nodes (`"refusedByHook":true`); without the hook it loads, so astronomy-engine is installed | yes, on each |
| L5 | pass | `tools/same-answers.mjs` on this build (`results/07-l5-same-answers.log`): 11,129 cases, all agree: declinations 5,010 (7 refused alike), composite 2,004 (4), dignities 2,115 (9), sect 2,000 (the ecliptic convention against the root's `sectOf`, the Sun exactly on the ascendant and on the descendant among them); no function or table is its home entry's object | the lite build whose declination part takes the luminary orb as 1.4 (`broken-builds.mjs --l5-control`; it differs from this build in that one line only, `results/15-figures.log`): 565 of the 5,010 declination cases differ, the first at `.5.maximumOrb`, the other parts agree; exit 1 (`results/08-l5-control.log`) | yes |
| L6 | pass | `tools/site-fixtures.mjs` on this build (`results/09-l6-site-fixtures.log`): on the fixtures from site commit `67cccac5a19a7779a07f85b09218c1ffbe2300cd`, `checkComposite` (C-M+C-A) 400 of 400 and `checkDignities` (D-X) 144 of 144 agree with `./lite`'s functions, and the same with `./techniques`' | case 0's first composite longitude moved by one unit in the last place, 336.81281017139554 to 336.8128101713956: 399 of 400 agree, case 0 alone disagrees | yes |
| L7 | pass | `src/sect.test.ts`, 20 of 20 tests pass (`results/04-tests.log`): the site's 11 cases (3 of orientality, 8 of sect), 7 at the boundaries (the amendment of review 2's modulo case and the two charts at 78.2° N among them) and 2 on results and refusals | `tools/sect-controls.mjs` (`results/10b-l7-sect-controls.log`), the tests passing as they stand (20 of 20): the altitude test written `> 0` fails 2 of 20 tests, orientality's test written `>= 0` fails 3 of 20, among them each test the test file names for that control; `src/sect.ts` restored to its SHA-256 | yes, both |
| L8 | pass | the 51 names, 27 values and 24 types: `dist/lite.js`'s runtime names, each part's, and those `dist/lite.d.ts` declares, read with the TypeScript checker, in the export smoke test and in `scripts/lite-entry.test.mjs`, "passes L8 at run time and in its declarations"; those `src/lite.ts` exports in `src/lite.test.ts` (both cases pass); no name exported by two parts | `scripts/lite-entry.test.mjs`: a `lite.d.ts` missing `sectReading` (values) or `Declinations` (types), a source declaring `dignityFor` as a type, and `dignityFor` exported by two parts, each refused with its message | yes, all |
| L9 | pass | on L-c's build, 16ad4fe (the amendment of 2026-11-03), `tools/api-reports.mjs --before 874077e` (`results/11b-l9-api-reports.log`): the 15 reports the build gives equal 16ad4fe's `api/`, `api/lite.api.md` is new there, and the other 14 equal 874077e's byte for byte | the same comparison with `api/lite.api.md` left out: "api/lite.api.md is missing", and nothing else | yes |
| L10 | pass | `OPT_IN_SOURCE` names `src/lite.ts`, `src/lite/` and `src/sect.ts` (six paths), and none of the eight others `scripts/root-isolation.test.mjs` names (`src/literal.ts`, `src/lites/x.ts`, `src/sector.ts`, `src/sects.ts`, `src/sect/a.ts`, and the root modules `src/declination.ts`, `src/points.ts`, `src/read-options.ts`); the root's static graph (24 source modules in the build's module list, 23 marked in 13 files) reaches no opt-in module; the table check passes on every `dist/*.js`, the lite files among them (`results/03-exports-smoke.log`, `results/04-tests.log`) | the synthetic root builds importing `src/lite/declinations.ts` and `src/sect.ts`: "the root entry reaches src/lite/declinations.ts" and "the root entry reaches src/sect.ts" | yes, both |
| L11 | pass | between the builds of 1deb29e and 16ad4fe (`results/12d-l11-graphs-compare.log`): `./lite` is new (28,918 bytes), `./techniques` grows by 60 bytes (156,150 to 156,210) and the other 15 entries keep their files and bytes. On this build `npm run package:contents` passes: `./lite` 28,930 of 29,000, the entry's six files in `required`, the package 1,096,783 bytes unpacked of 1,100,000 in 90 files (`results/12e-l11-package-contents.log`, `results/15-figures.log`) | `tools/graphs.mjs --budget-control` on this build, `./lite`'s budget at 28,929: "the ./lite entry's import graph is 28930 bytes, over its budget of 28929", exit 1 (`results/12f-l11-budget-control.log`) | yes |
| L12 | pass | `scripts/verify-packed-consumer.mjs` on the pack, on Node v20.19.0, v22.7.0, v22.22.2 and v24.21.0, each with its own npm: all 38 results `passed`, `liteEntry` (the runtime block) and `types` (the typed use) among them, TypeScript 5.9.3, the consumer removed (`results/13a-l12-consumer-v20.19.0.log` to `results/13d-l12-consumer-v24.21.0.log`) | run once, on Node v22.22.2: the copy `tools/consumer-control.py` writes (its two changes printed in the log), whose installed package's `exports` lack `./lite`: `tsc` fails with "error TS2307: Cannot find module '@zodiacs/engine/lite' or its corresponding type declarations.", exit 1 (`results/13e-l12-control.log`) | yes |

## B1 and B5, recorded from the site runs (not run here)

B1 to B6 belong to the site's adoption and were not run. As this run's brief
asks, B1's figures and B5's controls are recorded from the latest site runs,
SR3 (2026-11-04, on the 5c00cb8 candidate, this pack's bytes) and SR2
(2026-11-03, on 4f4c1e8), programme notes kept outside this repository
(`notes/rc2-2026-11-01/sr3/` and `sr2/`, their REPORT.md, logs and data);
`results/14-b1-b5-record.log` holds the lines cited.

- **B1, SR2's figures.** SR3 did not measure the bundles: it skipped S0
  because its pack differs from SR2's only in files no site chunk carries
  (`dist/calc.js`, `dist/vedic.js` and `dist/lite-sect.js` among the
  JavaScript; sr3/REPORT.md lines 11 to 25). SR2, gzip bytes against B1's
  allowances: on the default build `/birth-chart/` 67,098 of 72,704 (44
  chunks), `/compatibility/` 34,592 of 36,864, `chunk-max` 51,331 of 61,440
  and the engine chunk 33,361 of 33,380.4; with production flags 70,284
  (45 chunks), 35,037, 51,366 and 33,361; `report-bundles: within budgets`,
  exit 0, on both. The site imports no `./lite` there, so these figures
  measure the engine's own effect; B1 itself is judged in the adoption, with
  its own control (`/birth-chart/` lowered to 1 KB below the measured value),
  which was not run. The control SR2 ran is S0's (the engine chunk's
  allowance cut to 33,360 bytes: `--fail` exits 1 with the engine chunk the
  only failure).
- **B5, its two controls.** The engine reference build's export-coverage
  control behaved in SR3 and in SR2: with `sectReading` left out of
  `./lite`'s documented names the build exits 1, "Export coverage differs
  for ./lite: sectReading" (SR3 restored `build.mjs` to the same SHA-256).
  The claims extractor's planted-sentence control did not behave: the
  sentence time-bands' C8 plants, "The band bounds the error of every
  position.", is not listed. In SR3 the extractor lists 47 unlisted
  sentences with it and 47 without it, the listings identical line for
  line; in SR2, 47 with it and without it; in SR on b11c5e8 it was not
  listed either (the amendment of 2026-11-03). So
  B5's claims-extractor control is void as run, as this preregistration's
  amendment of 2026-11-03 records, and B5 cannot show there that the
  extractor sees the new sentences of `./lite`; its version 2 is due in the
  site's adoption.

## Not run, and why

- **The site parity record** (section 4: D2, S2, C2 and DG, with the tool's
  own controls of section 4.5), **B1 to B6** (section 5) and **D1 to D3**
  (section 6) belong to the site's adoption and to production after the
  owner's merge. None ran here; B1 and B5 are recorded above from the site
  runs.
- **`npm run api:check` on this build.** Under the amendment of 2026-11-03 it
  stays CI's gate (`gates.sh`) and is not part of L9; `../gates.log` records
  "api-report: 15 entry points match api/" on the reviewed tree on Node
  22.22.2, 20.19.0 and 24.21.0. It was not run again here.
- Nothing of L1 to L12 or of their controls was left out.

## How the checks ran, and other notes

- **L7's controls in a clone of this commit.** `tools/sect-controls.mjs`
  changes `src/sect.ts` while it runs. So that no file of this checkout
  outside the unit's folder changed even for a moment (FORMAL-COMMON), it
  ran in a sparse, blobless clone of 237b226, as its header allows, made as
  `../carrier/pack-source.sh`'s `sparse_clone` makes one, then `npm ci`
  (`results/10a-clone-237b226.log`). There the tool, `src/sect.ts` and
  `src/sect.test.ts` have this checkout's SHA-256 (`results/00-start.log`,
  `results/10b-l7-sect-controls.log`). L7's check itself is this checkout's
  vitest run (`results/04-tests.log`); the tool's own first run of the tests
  as they stand is its precondition for the controls, not a second run of
  the check.
- **L9's and L11's builds** of 16ad4fe and 1deb29e were made the same way,
  each with `npm ci` and `npm run build` on Node 22.22.2
  (`results/11a-clone-16ad4fe.log`, `results/12a-clone-1deb29e.log`). Each
  clone's sparse checkout leaves `docs/evidence/calc-sidereal-2026-10-05/`
  out, and the folder is absent there (the path only was tested).
- **No network.** Every step ran with `npm_config_offline=true`: the clones'
  `npm ci` and L12's `npm install` of the pack and TypeScript 5.9.3 took
  their packages from the npm cache alone (an environment setting; the
  scripts are as committed). Git in this checkout ran with
  `GIT_NO_LAZY_FETCH=1`; before the run, `git cat-file -e` found on disk
  every `api/` file L9 reads at 874077e. The clones' checkouts read their
  blobs from this checkout's repository through its upload-pack, which does
  not fetch lazily.
- **What each check read.** L5 and L6 read this checkout after the build
  (`--package <checkout>`, as their tools allow); L4 and L12 the pack; L1 to
  L3, L8 and L10 the build; L9 and L11's comparison the two clones' builds.
- **Earlier runs.** The trials the amendments disclose (L9 and L11 on clones
  of 16ad4fe and 1deb29e; L7's controls on the tree of the commit that added
  `tools/sect-controls.mjs`; L1 to L3's controls on the build of the commit
  that amended `tools/broken-builds.mjs`, in review 2) were not formal runs;
  this run is. The readings of
  L9 and L11 on L-c's build were adopted after review 1 had seen L9 fail on
  b11c5e8, so they count as `validated` only until the owner ratifies them.
- **Sizes.** `results/graphs-237b226.json` (`results/12g-sizes-237b226.log`)
  records this build's import graphs, the sizes section 9 asks for: `./lite`
  28,930 bytes in 5 files, 12 more than at 16ad4fe, all in
  `dist/lite-sect.js` (3,427 bytes there, `results/11a-clone-16ad4fe.log`;
  3,439 here, `results/01-build.log`). A measurement, not a check.
  `results/graphs-1deb29e.json` and `results/graphs-16ad4fe.json` are L11's
  inputs.
- **`results/15-figures.log`** prints, from the files the checks read, the
  figures cited above that the checks do not print (the six required files
  and the budget line, `OPT_IN_SOURCE`, `dist/lite.js` and the entry's
  sizes, the pin and the count of names), and compares L5's control build
  with this build. It is not a run of any check; its script's source is
  appended to it.
- **Paths.** In `results/06-l4-no-ephemeris.log` the control's message,
  which the tool cuts at 120 characters, ended inside the scratch path,
  where the shortening could not match it; that cut path was shortened by
  hand to `file://<scratch, cut by the tool>` in its three lines, before
  `results/99-end.log` took the digests. `results/tests.json` is vitest's
  report with its paths shortened the same way as the logs.
- **Other folders.** `results/99-end.log` shows `f89/`'s files untouched:
  each was written before this run began, and its results match the SHA-256
  list in `../f89/results/99-end.log`. No other folder of the candidate's
  evidence changed.

## Release state (sections 6 and 10)

**No unit changes state on this run; at most `validated`.** This run decides
the engine checks only: L1 to L12 pass, and every control failed as required.
Each of the four units also needs, in the site's adoption, its parity record
(section 4) and B1 to B6 (section 5) to pass. With those, and the adoption
merged by the owner, it is `validated`, release `merged`; with D1 to D3
passing in production, `validated`, release `deployed`. It is `accepted` only
once the owner ratifies R3, R4's causes and thresholds, and R6 (OQ5, which is
with the owner), and the readings of L9 and L11 stay `validated` on the same
terms. B5 needs its version 2 in the adoption, its claims-extractor control
being void as SR ran it. Until then P2.E.declinations, P2.E.composite,
P2.E.dignities and P2.E.sect keep their ledger entries as they stand.

## Files

`results/`: `00-start.log`, `01-build.log`, `02-pack.log`,
`03-exports-smoke.log`, `04-tests.log` with `tests.json`,
`05-l1-l3-broken-builds.log`, `06-l4-no-ephemeris.log`,
`07-l5-same-answers.log`, `08-l5-control.log`, `09-l6-site-fixtures.log`,
`10a-clone-237b226.log`, `10b-l7-sect-controls.log`,
`11a-clone-16ad4fe.log`, `11b-l9-api-reports.log`, `12a-clone-1deb29e.log`,
`12b-l11-graphs-1deb29e.log` with `graphs-1deb29e.json`,
`12c-l11-graphs-16ad4fe.log` with `graphs-16ad4fe.json`,
`12d-l11-graphs-compare.log`, `12e-l11-package-contents.log`,
`12f-l11-budget-control.log`, `12g-sizes-237b226.log` with
`graphs-237b226.json`, `13a-l12-consumer-v20.19.0.log`,
`13b-l12-consumer-v22.7.0.log`, `13c-l12-consumer-v22.22.2.log`,
`13d-l12-consumer-v24.21.0.log`, `13e-l12-control.log`,
`14-b1-b5-record.log`, `15-figures.log`, `99-end.log` and
`16-pack-against-sr3.log`; and this file.
