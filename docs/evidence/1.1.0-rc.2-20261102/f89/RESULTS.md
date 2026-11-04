# F-89 in 1.1.0-rc.2: the formal run

The formal run of `PREREGISTRATION.md` in this folder, with every dated
amendment at its end applied (through 2026-11-04, review 2), and with
`tools/f89_edits.py` as committed. One run of each check: none was rerun, and
no tool, rule or tolerance was changed. Every check passed and every control
failed as required. Nothing was committed.

- **Commit** 237b2265fcc53ae51abcb4f8e895e64c66321f5e (branch
  `rc2/main-first`), the reviewed tree whose packed bytes are the source
  commit's; HEAD was the same at the start and at the end (`results/00-start.log`,
  `results/99-end.log`).
- **Machine** darwin-arm64 (macOS 27.0.1); **Node** v22.22.2 (npm 10.9.7);
  **Python** 3.9.6, the system `python3`, run with `-I`. The OQ6 environment
  was not used: nothing here runs pyerfa or pyswisseph.
- **When** 2026-11-04, from 11:56:33 to 12:02:52 (ICT, the start and end
  logs). No network, no downloads.
- **Build and pack.** `npm run build` once (`results/01-build.log`). The
  candidate packed from this tree with `npm pack --ignore-scripts` into a
  scratch folder outside the checkout: SHA-256
  `c5aef0e3f20a19cf7ffabc99112cf592045199d6803814cf4ef6ea013615351c`,
  318,004 bytes, 90 files, the same bytes (`cmp`) as the 5c00cb8 candidate
  that SR3 ran on (`results/02-pack.log`). E1, E2 and E5's controls read it
  unpacked.
- **Logs.** Each log under `results/` begins with the machine, Node, Python
  and commit, and the command; local paths are shortened to `<checkout>`,
  `<scratch>` and `<programme>`. `results/99-end.log` gives the SHA-256 of
  each output written before this file.

## Checks and controls

| check | item | verdict | figures (this run) | control | failed as required |
| --- | ---: | --- | --- | --- | --- |
| E1 | all | pass | 0 of the 12 overstated phrases (`OLD_PHRASES`, the companions counted) in README.md, NOTICE, LICENSING.md and `dist/` of the rc.2 pack | the same scan on the carried 1.1.0-rc.1 archive: all 12 found, 26 failures of 26, exit 1 | yes |
| E2 | all | pass | all 13 phrases of `NEW_PHRASES` (item 1's as OQ9 (c) and the amendment of 2026-11-03 set it) and the 1 of `PACKAGE_ONLY_NEW` found; 0 failures, exit 0 | as E1: none of the 14 found on rc.1 | yes |
| E3 (a) | 2 | pass | both tests of "a plain scan's blind band, f″h²/8" pass: no crossing at 0.999 times the band, both at 1.001 times, and the search finds the missed pair at the sampled turn | held in the test: both crossings are found at 1.5 times the band, so the assertion that the pair is missed there fails | yes |
| E3 (b) | 2 | pass | `blind-band.mjs` on this build gives the committed `blind-band.json`'s bytes (SHA-256 `0c4c6b0fc248dd3b5f6661f705ac41611d5d4895b45caa213493342c196c8886`, `cmp` identical); 12 Saturn stations (2019-04-30 to 2024-11-15) and 11 Jupiter stations (2019-04-10 to 2024-10-09); largest band 0.00554984° and 0.0109673°, rounded up 0.0056° and 0.011°, the figures README.md and `dist/crossings.d.ts` state; at those depths 0 of 100 phases miss, at every station | at 0.9 times each station's own band, 5 of 100 phases miss both crossings, at every station | yes |
| E4 | 3 | pass | "names no tzdb version where the host's Intl answered and the runtime reports none" passes: with `process.versions.tz` removed, `zone.tzdbVersion` is null for 2020-07-01 in Europe/London | held in the test: with `tz` set to `2025c` the resolution names `2025c`, so the null expectation fails | yes |
| E5 | 4 | pass | `npm run package:contents` passes (90 files, 1,096,783 bytes unpacked of 1,100,000); the table is in one shared chunk, `dist/chunk-HTT4HMQ6.js`, which exactly `dist/geo.js` and `dist/techniques.js` import (`results/figures.log`) | in a scratch mirror of the rc.2 pack, with the committed script copied unchanged, which passes as packed: 1.1.0-rc.1's NOTICE fails "NOTICE must say where the Gregorian adoption table is"; its LICENSING.md fails "LICENSING.md must say where the Gregorian adoption table is"; the definition moved into `dist/geo.js` fails the holder assertion ("found it in dist/geo.js") | yes, all three |
| E6 | 5 | pass | "name ERFA, not Horizons, as the basis of the mean points' bounds" passes; `bounds.py --check`: "src/calc-bounds.ts agrees with docs/evidence/calc-api/rc16/summary.json"; the round-trip fixture rule holds on 38 cases: (i) 28 band keys, (ii) 26 `conventions` arrays, (iii) 30 version strings (27 `version`, 3 `engineVersion`, 1.1.0-rc.1 to 1.1.0-rc.2), (iv) 6 bases (position and speed, cases 4, 12 and 26), 0 other | on 1.1.0-rc.1's calc entry, 12 of 12 basis assertions fail (the Horizons text), against 0 of 12 on the rc.2 pack; the fixture copy with one longitude changed in its last place and one key added fails, both reported | yes, both |
| E7 | 7 | pass | "puts Munkasey's co-ascendant west of the meridian only within ε of the equator" passes: on a 1° RAMC grid some west point at latitudes 0°, 10° and ε less 0.5°, north and south | held in the test: none at ε plus 0.5°, 30°, 45° and 60°, north and south, so the old wording's prediction of west points there fails | yes |
| E8 | 9 | pass | "is refused without the ephemeris it names, which receipts carry from the rc.8 set on" passes: RC14 with `engine.ephemeris` deleted is refused `invalid_shape`; the existing `src/reference-span.test.ts` case "puts it in every receipt and refuses a current receipt without it" passes | the rc.7 receipt without the field parses (`ok`, in the same test), and `src/receipt-conventions.test.ts`'s "still reads an rc.7 receipt, and keeps each set to the engines that wrote it" passes, where naming an ephemeris is refused `invalid_shape` | yes |
| E10 | 1 | pass | README.md states 0.014″ and 0.007″; `conformance/results/summary.json` gives the Vertex's maximum 0.013370956″ and the East Point's 0.00679320316″ on 10 vectors, each rounded up to three decimals and not below the maximum; latitudes from 60° S to 60° N (`results/figures.log`); the test asserts the vectors' first and last UT1 years, 1833 and 2182 | held in the test: the text as first shipped, "0.013″", does not give the figures, and neither does a summary whose Vertex maximum is moved up by 0.001″ | yes, both |

**The suite run** (`results/tests.log`, `results/tests.json`): the nine
named files in one vitest run, whole: 9 files, 226 tests, all passed
(`src/crossings.test.ts` 55, `src/geo/flags.test.ts` 48,
`src/calc-bounds.test.ts` 7, `src/houses-extra.test.ts` 24,
`src/receipt-time-basis.test.ts` 53, `src/receipt-conventions.test.ts` 6,
`src/reference-span.test.ts` 7, `src/points.test.ts` 15,
`src/deltat-chart.test.ts` 11).

**Items 6 and 8**, which need no figure (section 5): E1 and E2 cover their
text. Item 8's behaviour, the `src/deltat-chart.test.ts` case "computes a
chart in the leap-second era from the leap seconds and IERS UT1 − UTC, and
says so", passes; the old wording "the engine's model when absent" is absent
from `dist/time.d.ts` (E1's scan) and from `docs/time.md`, which is not
packed (`results/figures.log`).

**Item 2's figures** describe a fixed-step scan of the engine's own motion,
not the sky, and are not accuracy figures. They equal the run's largest bands
rounded up, so item 2's text does not change.

## S1, recorded from SR3

S1 ran inside SR3, the cut's scratch site run on the 5c00cb8 candidate
(2026-11-04). Its records are programme notes kept outside this repository
(`notes/rc2-2026-11-01/sr3/`, its REPORT.md and logs); `results/s1-record.log`
holds the lines cited here. That candidate is this tree's pack byte for byte
(`results/02-pack.log`), and `git diff --stat 5c00cb8 -- README.md NOTICE
LICENSING.md` (with the exclusion pathspec appended, as FORMAL-COMMON
requires) is empty.

- **Verdict: holds, as SR3 recorded it**, "identical to sr2's". On rc.2's
  reference the extractor lists 47 unlisted sentences, and R2 flags 13 of the
  15 replaced records from the reference alone (18 records listed, 13
  flagged), and all 15 once the MCP adapter's NOTICE carries rc.2's NOTICE in
  scratch (18 listed, 15 flagged; 20 orphans, 50 unlisted). The claims ledger
  was not changed there (`maxOpenOverstated` 11, 11 overstated).
- **Control: failed as required.** On rc.1's reference the extractor lists 0
  unlisted sentences and 0 orphans, so none of the new sentences, and R2
  flags the replaced records only on the candidate.
- **Open for the adoption** (SR3): the new texts of items 2, 6 and 7 carry no
  trigger word, so `eng.crossings-blind-band`, `eng.api-placidus-steps` and
  `eng.api-coascendant-west` have no sentence (R9) once their old records go,
  unless the adoption changes the lexicon or those claims.

## Not run, and why

- **E9 and E11.** OQ9 is (c) (`../OWNER-ANSWERS.md`, and the amendment of
  2026-11-03): E9 belongs to (a) and E11 to (b).
- **S1** was not run by this run; it ran inside SR3 (above).
- **S2 and S3** belong to the site's adoption of rc.2, after the owner's
  merge; they are not run here.
- **E3 (b) at the source commit itself.** This run is on the reviewed tree,
  whose packed bytes are the source commit's; the source commit adds the
  evidence only (RC2-PLAN 5.11).

## How the controls ran, and other notes

- **E5's and E6's controls have no committed tool.** They ran in scratch,
  with nothing in the checkout changed: E5's with the committed
  `scripts/verify-package-contents.mjs`, copied unchanged into a mirror of
  the unpacked rc.2 pack; E6's with a harness that checks, on a package's
  calc entry, the bases the committed test asserts, its two strings copied
  from `src/calc-bounds.test.ts`. Each harness first passed on the rc.2 pack,
  so a failure on a control input comes from that input, not from the
  harness. Their full source is printed in
  `results/e5-controls.log` and `results/e6-control-rc1.log`. The rc.1
  archive was checked against its receipt (`shasum -c` in `artifacts/`: OK;
  52352d3f8fde4a262483e4a5a6217e02d814aa53269b49c0333325e6c0d6a7b6, as
  `archives.json` gives it) before it was unpacked; a first `shasum -c` from
  the repository root could not find the file, since the receipt names it
  relative to `artifacts/`. That check is not in a log.
- **The controls of E3 (a), E4, E7, E8 and E10** are held in the committed
  tests as converse assertions, so each test's pass shows that its control
  assertion fails.
- **E6's fixture rule** ran with the time bands' committed
  `../time-bands/tools/fixture-diff.mjs` (one rule with P1.M3c's C6; its
  report calls itself C6), with a253973's fixture read from git objects by
  name with lazy fetching off (blob `0204417d63c9f749e5c8a4c2fd0e8dab02a91c3b`).
  Its four further controls (an engine version set to another version, a
  receipt's ephemeris version changed, a mean point's basis given another
  text, a band key added to a refused result) failed too.
- **`results/figures.log`** prints, from the files the checks read, the
  figures cited above that the checks themselves do not print; it is not a
  second run of any check. Its script's source was appended to it after it
  ran.
- The `git diff --stat` command was also run once while reading, before the
  run, with the same empty output.

## Release state (sections 7 and 8)

**`validated`, not `accepted`.** OQ5 is not ratified, so R-F89 and the
readings chosen after the scoping runs (item 2's figures, OQ9 (c)'s ERFA
figure) stay `validated`. On rc.2's packed text R-F89's point 1 holds (E1,
E2). For the figures of items 1, 2 and 5, point 2 is met by committed tests
and evidence output (E10, E3, E6); this run checked no other number in the
replacements. Point 3 needs the site's vendoring (S2). The corrections count only once rc.2's archive is
carried and the owner merges the cut, and the claims are restated only when
the site vendors rc.2 and production serves it. Until then no claim changes
status, F-89 is not closed by this run, and P1.14 stays `partial` (OQ10,
Q2).

## Files

`results/`: `00-start.log`, `01-build.log`, `02-pack.log`,
`e1-e2-rc2.log`, `e1-e2-control-rc1.log`, `e3b-blind-band.log` with
`blind-band.json` (this run's output, identical to `../blind-band.json`),
`tests.log` with `tests.json`, `e5-package-contents.log`, `e5-controls.log`,
`e6-bounds-check.log`, `e6-fixture-rule.log` with `e6-fixture-rule.json`,
`e6-control-rc1.log`, `figures.log`, `s1-record.log` and `99-end.log`; and
this file.
