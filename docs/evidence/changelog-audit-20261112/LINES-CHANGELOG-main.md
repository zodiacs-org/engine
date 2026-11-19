# Engine CHANGELOG.md on origin/main, line by line (ZOD-152, R2)

Checked: `CHANGELOG.md` at `origin/main` `bc0b5a769ad2cfb17e1f853b94d94eb271fdd56d`, lines 1 to 2,052, all 23 release entries. Checked 12 and 13 November 2026.

371 rows: supported 143, not supported 8, unchecked 220.

| Release | Rows | Supported | Not supported | Unchecked |
| --- | ---: | ---: | ---: | ---: |
| 1.1.0-rc.3 | 17 | 11 | 0 | 6 |
| 1.1.0-rc.2 | 21 | 15 | 0 | 6 |
| 1.1.0-rc.1 | 16 | 9 | 0 | 7 |
| 1.0.0 | 10 | 7 | 0 | 3 |
| 1.0.0-rc.2 | 17 | 7 | 0 | 10 |
| 1.0.0-rc.1 | 43 | 16 | 0 | 27 |
| 0.1.1-rc.17 | 20 | 9 | 0 | 11 |
| 0.1.1-rc.16 | 48 | 15 | 3 | 30 |
| 0.1.1-rc.15 | 53 | 12 | 3 | 38 |
| 0.1.1-rc.14 | 26 | 7 | 1 | 18 |
| 0.1.1-rc.13 | 12 | 3 | 0 | 9 |
| 0.1.1-rc.12 | 6 | 3 | 0 | 3 |
| 0.1.1-rc.11 | 7 | 5 | 0 | 2 |
| 0.1.1-rc.10 | 12 | 5 | 1 | 6 |
| 0.1.1-rc.9 | 7 | 4 | 0 | 3 |
| 0.1.1-rc.8 | 11 | 5 | 0 | 6 |
| 0.1.1-rc.7 | 8 | 4 | 0 | 4 |
| 0.1.1-rc.6 | 6 | 2 | 0 | 4 |
| 0.1.1-rc.5 | 6 | 1 | 0 | 5 |
| 0.1.1-rc.4 | 6 | 0 | 0 | 6 |
| 0.1.1-rc.3 | 4 | 0 | 0 | 4 |
| 0.1.1-rc.2 | 5 | 0 | 0 | 5 |
| 0.1.1-rc.1 | 10 | 3 | 0 | 7 |

## Method

Status has three values. **supported**: a source other than the changelog was opened in this audit and says what the line says; the source is named. **not supported**: the evidence contradicts the line, or shows it is out of date; what the evidence shows is stated. **unchecked**: not verified here; the reason is given. A row never cites the changelog as its own support (two rows cite a later changelog correction as evidence against an earlier line, which is the opposite use).

How each entry was read: the entry was split into its paragraphs and bullets (one block each, with its line range), and every block got at least one row; a block that mixes checked and unchecked statements is split into lettered rows. A script confirmed that no block is without a row. For each block a mechanical pass looked up every backticked path (in the tree, at the release's source commit, or in its unpacked archive), every backticked name (in the unpacked archive's `dist/` or the source commit), every commit id, and every figure (as text, in the release's evidence folders and archive). "Names found" and "figures appear in" in the notes refer to that pass. A figure that only "appears" in a folder was not counted as support: rows are marked supported only where the cited file was opened and the value read, or the value was recomputed (sizes, file counts, digests, differences between two archives), or the registry or git history was queried.

What "unchecked" mostly means here: statements about how the code behaves (what a function returns, throws or refuses), accuracy figures measured against ERFA, JPL Horizons, DE440 or Swiss Ephemeris, timings, and statements about owner approvals or about local builds that were never pushed. Re-running the measurements needs the test dependencies, external kernels or Swiss Ephemeris, and was outside what one session could do for 2,052 lines. They are listed, not waved through.

Lines that are headings only, with no claim of their own: line 1 (`# Engine changelog`) and 639 (`### Corrections`), 755 (`### Corrections`), 822 (`### New entry points`), 962 (`### The nutation`), 1115 (`### Receipts`), 1130 (`### Sizes and budgets`), 1187 (`### Corrections`). Blank lines carry nothing.

## The entries

### 1.1.0-rc.3

Heading as written: `## 1.1.0-rc.3 (unreleased candidate)` (line 3).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-1.1.0-rc.3-01 | 3 | ## 1.1.0-rc.3 (unreleased candidate) | supported | `npm view @zodiacs/engine@1.1.0-rc.3 version` returns E404; `raw/npm-view-engine.json` lists no 1.1.0-rc.3; `raw/github-tags.json` has only v0.1.1-rc.15 | Not published anywhere. The archive is carried (`artifacts/archives.json`, source `cc910b3`). |
| E-1.1.0-rc.3-02a | 5 to 8 | "The third candidate for 1.1.0, on 1.1.0-rc.2 (main at `883371f`)" | supported | `git log`: `883371f Merge pull request #82 from zodiacs-org/rc2/main-first`; `gh pr view 84`: merged 2026-11-10T02:37:52Z as `bc0b5a7` | 883371f is the merge of the rc.2 pull request, and rc.1 and rc.2 precede it. |
| E-1.1.0-rc.3-02b | 5 to 8 | "with sixteen public entry points" | supported | packed `package.json` of 1.1.0-rc.3 has 18 `exports` keys, 16 without `./internal` and `./internal/math`; 1.1.0-rc.2 has 17 and 15, and its entry says fifteen | Sixteen is the export map without the two internal entries, one more than rc.2. |
| E-1.1.0-rc.3-02c | 5 to 8 | "It is not to be published on npm until the owner approves it" (the not-published part) | supported | npm E404 for the version | The owner's condition itself is an intention and cannot be checked. |
| E-1.1.0-rc.3-03a | 10 to 23 | "`@zodiacs/engine/de440`, a new entry point. `openDe440Pack(bytes, { expectDigest })` opens a sealed pack (`ZODEPH02`)" | supported | packed `package.json` exports `./de440` (absent from the 1.1.0-rc.2 archive); `dist/de440.d.ts` and `dist/de440.js` in the archive name `openDe440Pack` and `ZODEPH02` | Present in the archive. |
| E-1.1.0-rc.3-03b | 10 to 23 | the reduction's description (light-time, deflection, aberration, IAU 2006/2000B, barycentres, the Moon from the system's parts, six-byte fields refused, "fetches nothing and ships no pack") | unchecked | none | Behaviour of the code, not re-derived here. The archive's 94 files were listed and none is a pack, but the reduction steps were not traced. |
| E-1.1.0-rc.3-04a | 24 to 30 | "On the raw kernel the reduction is within 1e-6″ of an ERFA chain over `de440.bsp` at 200 instants from 1800 to 2200" | unchecked | `docs/evidence/de440-20261110/README.md:67` says so; `src/de440-kernel.test.ts` holds the gate but runs only with PRECISION_KERNEL set | No recorded output of the kernel run was found in the folder; only the author's README states the result. `pack-accuracy.json` `oracles` (200 instants) measures the pack, not the raw kernel. |
| E-1.1.0-rc.3-04b | 24 to 30 | "against the kernel at 20,001 instants ... the Moon's place differs by at most 0.0016″, every other body's by at most 0.0008″, and the true node by at most 0.84″, at an edge of the Moon's records" | supported | `docs/evidence/de440-20261110/pack-accuracy.json`: `dense.instants` 20001; `largest.Moon` 0.001504; largest other body Venus 0.000797; `recordEdges.byBody["North Node"].maxArcsec` 0.8397 | Figures match when rounded up. |
| E-1.1.0-rc.3-05a | 31 to 39 | "`withEphemeris(source, fn)` in the root"; functions computed on astronomy-engine "throw a TypeError inside it" | supported | archive `dist/index.d.ts` exports `withEphemeris`; `dist/chunk-AMCCLJCB.js:389` throws `TypeError("... does not run inside withEphemeris: it is computed on astronomy-engine")` | The switch and the refusal exist. |
| E-1.1.0-rc.3-05b | 31 to 39 | which functions run under it and which throw; "restores the one before"; `chart.ephemeris`; "a chart from astronomy-engine is unchanged" | unchecked | none | Not traced call by call. |
| E-1.1.0-rc.3-06a | 40 to 46 | receipts "name the ephemeris `jpl-de440` ... and require the feature `ephemeris-jpl-de440`" | supported | `git show cc910b3:src/receipt.ts` lines 116, 263, 265 | Both strings are in the source commit's receipt code. |
| E-1.1.0-rc.3-06b | 40 to 46 | "The set is the last of `NATAL_RECEIPT_CONVENTION_SETS`, so no earlier set's index moved"; "an earlier engine refuses them"; the provenance rule | unchecked | none | Not run against earlier engines; the array order was not diffed. |
| E-1.1.0-rc.3-07a | 47 to 52 | the four test files exist | supported | `src/de440.test.ts`, `src/de440-format.test.ts`, `src/de440-sources.test.ts`, `src/de440-kernel.test.ts` in the tree | Present. |
| E-1.1.0-rc.3-07b | 47 to 52 | what each of the four tests covers | unchecked | none | Test contents were not read line by line. |
| E-1.1.0-rc.3-08a | 53 to 64 | "1,142,818 bytes unpacked, 46,035 more than 1.1.0-rc.2's 1,096,783 ... 29,536 ... 2,206 ... declarations 6,866, documents 7,271 and the manifest 156" | supported | sum of file sizes in the unpacked 1.1.0-rc.3 archive is 1,142,818 and in rc.2's 1,096,783 (recomputed); `.d.ts` bytes differ by 6,866 (recomputed); `sizes.json` holds 29,536, 2,206, 7,271, 156 | Match. |
| E-1.1.0-rc.3-08b | 53 to 64 | "The cap rises from 1,100,000 to 1,145,000, with a budget of 48,000 for `./de440` ... `./internal` (69,000), `./time` (42,600), `./window` (107,000) ... root's rises to 109,000 and `./vedic`'s to 144,500" | supported | `scripts/verify-package-contents.mjs`: `TOTAL_CAP = 1_145_000` (was `1_100_000` at `883371f`), lines 159, 204, 210, 242, 269, 278 | Match. |
| E-1.1.0-rc.3-08c | 53 to 64 | "with the owner's approval of 2026-11-10"; "under the owner's delegation of 2026-11-04" | unchecked | none | No owner record was looked up; approvals live outside the repository. |

### 1.1.0-rc.2

Heading as written: `## 1.1.0-rc.2 (unreleased candidate)` (line 66).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-1.1.0-rc.2-01 | 66 | ## 1.1.0-rc.2 (unreleased candidate) | supported | `raw/npm-view-engine.json` lists no 1.1.0-rc.2; no tag or release | Not published. Archive carried, source `806f76b`. |
| E-1.1.0-rc.2-02a | 68 to 75 | "The second candidate for 1.1.0, on 1.1.0-rc.1 (main at `a253973`)" | supported | `git log -1 a253973`: "Merge pull request #77", an ancestor of the rc.2 branch, after the rc.1 merge | Consistent. |
| E-1.1.0-rc.2-02b | 68 to 75 | "two new entry points ... `@zodiacs/engine/time` and `@zodiacs/engine/lite`, which make fifteen public entry points" | supported | packed `package.json`: rc.2 has 17 exports keys, 15 without the two `./internal` ones; rc.1 has 15 and 13; `./time` and `./lite` are the two added | Match. |
| E-1.1.0-rc.2-02c | 68 to 75 | "The 500 conformance verdicts are ...: 267 pass, 192 fail, 41 unsupported, none in error" | supported | `conformance/results/zodiacs-engine.json` read at the source commits `77a16c2` (1.0.0-rc.1), `7fa964d` (1.0.0-rc.2), `ca2c8ce` (1.0.0), `c417062` (1.1.0-rc.1) and `806f76b` (1.1.0-rc.2): 500 results each, 267 pass, 192 fail, 41 unsupported, no other verdict | Totals identical across the five commits. Individual verdicts were not compared one by one. |
| E-1.1.0-rc.2-02d | 68 to 75 | "It is not to be published on npm" | supported | npm lists no 1.1.0-rc.2 | The owner's condition is an intention. |
| E-1.1.0-rc.2-03a | 77 to 102 | "The README no longer says that the Vertex and the East Point agree with Swiss Ephemeris's `swe_houses_armc` to within 0.00001″" | supported | packed README of 1.1.0-rc.1 contains `0.00001″` once; packed README of 1.1.0-rc.2 contains it 0 times | The sentence is gone from the rc.2 archive. |
| E-1.1.0-rc.2-03b | 77 to 102 | the replacement figures (0.014″, 0.007″ on ten L2 vectors, 1833 to 2182), the crossing-scan figures (0.0056°, 0.011°, formerly 0.0103°, 0.0205°), and the other F-89 corrections (transition naming, Gregorian table chunk, node bounds' basis, Placidus step count, Munkasey, `ChartInput.deltaT`, receipts naming the ephemeris) | unchecked | the numbers appear in `docs/evidence/1.1.0-rc.2-20261102/f89/README.md` and `f89/PREREGISTRATION.md` (found by search) | The figures are present in the author's F-89 record, but each corrected statement was not compared with the code or re-measured. "No bound's value changes" was not diffed. |
| E-1.1.0-rc.2-04a | 103 to 120 | "`@zodiacs/engine/time` ... a new entry point": `timeBasis`, `elapsedDays`, `EPHEMERIS_SPAN`, `tilt`, `eclipticFrame`, `meanEcliptic`, `eclipticOfDate`, `DELTA_T_IERS_MODEL`, `TIME_SCALE_NAMES`; `api/time.api.md`, `docs/time.md`, `src/time.test.ts`, `time-entry/` | supported | every backticked name was found in the unpacked rc.2 archive or the source commit `806f76b`; every cited path exists; packed exports include `./time` | Names and paths exist. |
| E-1.1.0-rc.2-04b | 103 to 120 | "loads no ephemeris"; "throws `RangeError`"; frozen results; "to the bit"; "The root does not import the entry"; the chunk move | unchecked | none | Behaviour not re-run. `exports:smoke` logs were not opened for this line. |
| E-1.1.0-rc.2-05a | 121 to 152 | `timeBands` exported by `./time`; calc results carry `band`; receipts name `time-band:first-order` | supported | names found in the archive; `dist/calc.js:623` pushes `"time-band:first-order"` when banded; `docs/time.md`, `docs/calc.md`, `time-bands/` exist | Present. |
| E-1.1.0-rc.2-05b | 121 to 152 | the rules of the bands (dates 1972-01-01 to 2027-10-02 and 2027-06-28, band 0 on UTC input, root-sum-square after the table, ±0.25 day for true nodes, which results carry none) | unchecked | none | Not re-derived; the preregistered checks in `time-bands/` were not replayed. |
| E-1.1.0-rc.2-06a | 153 to 177 | "`@zodiacs/engine/lite` ... a new entry point"; the named functions; `sectReading`; `docs/lite.md`, `api/lite.api.md`, `scripts/build-lite.mjs`, `scripts/lite-entry.mjs`, `src/techniques/composite.ts`, `src/techniques/names.ts` | supported | names found in the archive or source commit; paths exist; packed exports include `./lite` | Present. |
| E-1.1.0-rc.2-06b | 153 to 177 | "esbuild 0.27.7 ... is now a direct dev dependency" | supported | `git show 806f76b:package.json` line 131 `"esbuild": "0.27.7"`; absent from `c417062:package.json` (rc.1) | Match. |
| E-1.1.0-rc.2-06c | 153 to 177 | "loads no ephemeris"; "a copy ... with the same results and not the same object"; "Each of the four parts is built into a file of its own that imports nothing"; "with no public change" | unchecked | none | Not re-run. |
| E-1.1.0-rc.2-07a | 178 to 198 | `vargaSensitivity`, `VARGA_POINTS` exported by `./vedic`; the refusal codes; `src/vedic/fixtures/varga-changes.json`; `docs/vedic.md` | supported | names and the five refusal strings found in the archive or source commit; paths exist; 2,880 and 2,000,000 appear in `varga-sensitivity/INPUTS.md` and `PREREGISTRATION.md` | Present. |
| E-1.1.0-rc.2-07b | 178 to 198 | "seven types"; exactness and the "none is missed" argument; the 66° polar rule | unchecked | none | Not counted or re-derived. |
| E-1.1.0-rc.2-08a | 199 to 223 | graph sizes: `./time` 42,306 in 7 files, `./lite` 28,930 in 5, `./calc` 151,426 (6,165 more than 145,261), `./vedic` 141,340 (13,589 more than 127,751), root 106,325 (345 more) | supported | `docs/evidence/1.1.0-rc.2-20261102/sizes.json` entries for 1.1.0-rc.1 and 1.1.0-rc.2 (root 105,980 and 106,325; calc 145,261 and 151,426); `de440-20261110/sizes.json` repeats rc.2's | Match; differences recomputed. |
| E-1.1.0-rc.2-08b | 199 to 223 | budgets 42,400 and 29,000; calc 145,500 raised to 156,000; vedic 128,000 raised to 143,000; cap 1,020,000 raised to 1,100,000; `./window` leaves 443 | supported | `git show 806f76b:scripts/verify-package-contents.mjs` lines 172, 203, 223, 247, 367; `c417062:` lines 142, 198, 204 (`./window` 105,000), 307; window graph 104,557 in `sizes.json` | Match (105,000 minus 104,557 is 443). |
| E-1.1.0-rc.2-08c | 199 to 223 | "The package is 1,096,783 bytes unpacked in 90 files, 90,289 more than 1.1.0-rc.1's 1,006,494"; "21,520 of declarations" | supported | unpacked archives recomputed: rc.2 1,096,783 bytes, 90 files; rc.1 1,006,494; `.d.ts` bytes 216,595 minus 195,075 is 21,520 | Match. |
| E-1.1.0-rc.2-08d | 199 to 223 | "50,692 bytes of JavaScript ... 17,312 of README, CHANGELOG, LICENSING.md and NOTICE, 420 of manifest"; "grow by 49 to 405 bytes" | unchecked | the numbers appear in the folder's `README.md` | Present in the author's README; not recomputed from the two archives. |
| E-1.1.0-rc.2-08e | 199 to 223 | "approved under the owner's delegation of 2026-11-03 (OQ3 in `OWNER-ANSWERS.md`)" | supported | `docs/evidence/1.1.0-rc.2-20261102/OWNER-ANSWERS.md:19` lists the cap 1,100,000 and the four budgets under OQ3 | The file records the ceilings. It is the repository's record of the owner's answer, not the owner's own message. |

### 1.1.0-rc.1

Heading as written: `## 1.1.0-rc.1 — unreleased candidate` (line 225).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-1.1.0-rc.1-01 | 225 | ## 1.1.0-rc.1 — unreleased candidate | supported | `raw/npm-view-engine.json` lists no 1.1.0-rc.1; no tag or release | Not published. Archive carried, source `c417062`. |
| E-1.1.0-rc.1-02a | 227 to 230 | "The first candidate for 1.1.0, on 1.0.0 (main at `4771fa6`)" | supported | `git log -1 4771fa6`: "Merge pull request #70", on main after the 1.0.0 commits | Consistent. |
| E-1.1.0-rc.1-02b | 227 to 230 | "a new entry point gives those ids"; not published on npm | supported | packed exports of 1.1.0-rc.1 include `./conventions` (1.0.0's do not); npm lists no 1.1.0-rc.1 | Match. |
| E-1.1.0-rc.1-02c | 227 to 230 | "No value changes." | unchecked | see 07 | Rests on the battery run in 07, which was not replayed. |
| E-1.1.0-rc.1-03a | 232 to 249 | `createNatalEnvelope` writes `conventionIds`; the registry (version 2026-10-18) "holds every id these receipts name but the new set's own" | supported | `docs/evidence/1.1.0-rc.1-20261026/results/site-rule.txt`: registry version 2026-10-18; "57 of 57 envelopes"; "51 distinct ids ... the registry holds 50; not held: conventionIds:zodiacs-conventions-registry;receipt-and-result;sorted-unique;in-receipt" | Match. |
| E-1.1.0-rc.1-03b | 232 to 249 | "The tests' timed chart in New York with Placidus houses names 26"; the list of what each id is drawn from; the codec's refusal under any other set | unchecked | none | The count 26 was not found in the lines of `site-rule.txt` read; the test was not run. |
| E-1.1.0-rc.1-04a | 250 to 262 | "An envelope of the new set requires the feature `convention-ids`. Each carried archive from 0.1.1-rc.7 to 1.0.0 refuses such a record as `unsupported_feature` ... without the feature ... `invalid_shape`" | supported | `results/earlier-readers.json`: `requiredFeatures: ["convention-ids"]`; archives from 0.1.1-rc.7 on show `asWritten: unsupported_feature`, `withoutFeature: invalid_shape` (the first four entries were read; the rest of the list was not printed); `dist/receipt.js:240` `IDS_FEATURE = "convention-ids"` | Match for the entries read. |
| E-1.1.0-rc.1-04b | 250 to 262 | "This release reads every record 1.0.0 reads"; accepted from 0.1.1-rc.16 with no upper bound; the 1.0.0 fixture "replays ... within 1e-9°" | unchecked | `src/fixtures/receipt-1.0.0.json` and `src/receipt-ids.test.ts` exist | Files exist; the test was not run and its assertions were not read. |
| E-1.1.0-rc.1-05a | 263 to 272 | "`@zodiacs/engine/conventions`, a new entry point": `natalConventionIds`, `conventionId`, `parseConventionId`, `conventionAddress`, `CONVENTIONS_REGISTRY`, `ConventionIdParts` | supported | all names found in the unpacked archive or source commit; `./conventions` in packed exports | Present. |
| E-1.1.0-rc.1-05b | 263 to 272 | "imports no module of another entry"; `RangeError` for a malformed id; "The root does not import the entry" | unchecked | none | Not traced. |
| E-1.1.0-rc.1-06a | 273 to 284 | "the envelope grows from 5,585 to 6,976 bytes, the longest string ... falls from 59,927 to 58,536 characters, and the longest array of numbers from 3,816 to 3,787 entries" | supported | `results/extension-room.txt` lines 3 to 5 | Exact match. |
| E-1.1.0-rc.1-06b | 273 to 284 | "`NATAL_RECEIPT_CONVENTION_SETS` gains the new set at index 0, so each earlier set moves one place"; the migration advice | unchecked | none | Array order not diffed against 1.0.0. |
| E-1.1.0-rc.1-07 | 285 to 293 | battery of 6,417 calls prints the same bytes but in 129 lines; "Of the build's 48 JavaScript files, three are new ... ten ... 35" | unchecked | 6,417 and 129 appear in the folder's `README.md` | Stated in the author's README. The battery output files were not compared here. |
| E-1.1.0-rc.1-08a | 294 to 302 | "The new entry's graph is 2,754 bytes, under a budget of 2,900. `./receipt` ... 72,500 bytes, 3,009 more than 1.0.0's 69,491, over its budget of 70,000, which this candidate raises to 76,500" | supported | `sizes.json`: `./conventions` 2754, `./receipt` 72500 (1.0.0: 69491); `git show c417062:scripts/verify-package-contents.mjs` lines 146, 171; `ca2c8ce:` line 154 `70_000` | Match (72,500 minus 69,491 is 3,009). |
| E-1.1.0-rc.1-08b | 294 to 302 | "The package is 1,006,494 bytes unpacked in 77 files, 14,579 more than 1.0.0's 991,915, over the cap of 1,000,000, which it raises to 1,020,000 ... 3,740 ... 3,370 ... 7,328 ... 136 ... 5" | supported | unpacked archives recomputed (1,006,494 in 77 files; 991,915 in 74); `sizes.json` `growthFrom` split: optInJs 3740, otherDeclarations 3370, documents 7328, manifest 136, rootJs 5; `TOTAL_CAP` 1_000_000 at `ca2c8ce`, 1_020_000 at `c417062` | Match. |
| E-1.1.0-rc.1-08c | 294 to 302 | "with the owner's approval of 2026-10-26" | unchecked | none | No owner record looked up. |

### 1.0.0

Heading as written: `## 1.0.0 — 2026-10-11` (line 304).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-1.0.0-01 | 304 | "## 1.0.0 — 2026-10-11" | supported | `raw/npm-view-engine.json`: `"1.0.0": "2026-10-11T13:54:56.087Z"`, dist-tag `latest`; `raw/npm-dist.json` shasum `72b7a026...` equals `sha1sum artifacts/zodiacs-engine-1.0.0.tgz` | Date and publication confirmed by the registry. There is no git tag or GitHub release for 1.0.0; the entry does not claim one. |
| E-1.0.0-02a | 306 to 309 | "1.0.0-rc.2 with the version changed"; "the twelve entry points" | supported | every `.d.ts` in the 1.0.0 archive is byte-identical to 1.0.0-rc.2's (22 files compared with `cmp`); packed exports without the internal ones: 12 | Declarations identical; twelve public entries. JavaScript files were not compared byte for byte here. |
| E-1.0.0-02b | 306 to 309 | "From this release the package follows Semantic Versioning as docs/versioning.md describes" | unchecked | `docs/versioning.md` exists | A policy statement. |
| E-1.0.0-03a | 311 to 317 | "Before this release npm carried 0.1.1-rc.14 to 0.1.1-rc.16 (`latest` 0.1.1-rc.15, `next` 0.1.1-rc.16)" | supported | `docs/evidence/1.0.0-20261011/npm-view.txt`, captured 2026-10-10T22:32:40Z: versions rc.14, rc.15, rc.16; `latest` 0.1.1-rc.15, `next` 0.1.1-rc.16 | Match. |
| E-1.0.0-03b | 311 to 317 | "0.1.1-rc.17, 1.0.0-rc.1 and 1.0.0-rc.2 were never published" | supported | `raw/npm-view-engine.json` lists none of them | Match as of 12 November 2026. |
| E-1.0.0-04a | 318 to 323 | "Every declaration file of the build is 1.0.0-rc.2's byte for byte" | supported | `cmp` over the 22 `.d.ts` files of the two unpacked archives: no difference | Match. |
| E-1.0.0-04b | 318 to 323 | "No API and no value changes"; the battery of 6,417 calls "prints the same bytes" | unchecked | 6,417 appears in the folder's `README.md`; `results/values-compare.txt` exists | The comparison file was not read line by line. |
| E-1.0.0-04c | 318 to 323 | "The 500 conformance verdicts are ...: 267 pass, 192 fail, 41 unsupported, none in error" | supported | `conformance/results/zodiacs-engine.json` read at the source commits `77a16c2` (1.0.0-rc.1), `7fa964d` (1.0.0-rc.2), `ca2c8ce` (1.0.0), `c417062` (1.1.0-rc.1) and `806f76b` (1.1.0-rc.2): 500 results each, 267 pass, 192 fail, 41 unsupported, no other verdict | Totals identical across the five commits. Individual verdicts were not compared one by one. |
| E-1.0.0-05a | 324 to 338 | "On arm64 (an Apple M4, Node 20, 22 and 24) 4 of the 3,853 tests fail" | supported | `docs/evidence/1.0.0-20261011/full-tests-v20.19.0-darwin-arm64.log`, `-v22.22.2-`, `-v24.21.0-`: each "Tests 4 failed ... (3853)" | Match. The machine model is not in the logs read. |
| E-1.0.0-05b | 324 to 338 | the differences quoted (1.42e-11, 42 of 120, 1 of 60, 5.69e-14, 1.31e-8, 2.17e-8, 1.14e-13, 1.26e-9, 3.56e-9, the ninth decimal) and "where none fails" on x86-64 | unchecked | `README.md` lines 122 to 133 carry 1.14e-13 and 3.56e-9; `results/values-by-runtime.json` and `platform-*.json` exist | Some figures are in the author's README; 5.69e-14 was not found by text search in the folder (it may be stored unrounded). Not recomputed from the result files. |

### 1.0.0-rc.2

Heading as written: `## 1.0.0-rc.2 — unreleased candidate` (line 340).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-1.0.0-rc.2-01 | 340 | ## 1.0.0-rc.2 — unreleased candidate | supported | `raw/npm-view-engine.json` lists no 1.0.0-rc.2; no tag or release | Not published. Archive carried, source `7fa964d`. |
| E-1.0.0-rc.2-02a | 342 to 351 | "on 1.0.0-rc.1 (main at `c6b5490`, the merge of zodiacs-org/engine#30)" | supported | `git log -1 c6b5490`: "Merge pull request #30: Release candidate 1.0.0-rc.1: the API settled for 1.0" | Match. |
| E-1.0.0-rc.2-02b | 342 to 351 | "It changes no API" | supported | the 22 `.d.ts` files of the 1.0.0-rc.2 archive are byte-identical to 1.0.0-rc.1's (`cmp`) | Declarations identical. |
| E-1.0.0-rc.2-02c | 342 to 351 | "and no value"; the bundler explanation; "on zodiacs.org that put the chart bundle's engine chunks over their size budget" | unchecked | none | Value identity rests on the battery in 11, not replayed. The site's budget claim was not looked up in the site repository. |
| E-1.0.0-rc.2-03 | 353 to 366 | the `/*#__PURE__*/` marks; "each of the 66 such tables ... is left out"; "1.0.0-rc.1 kept 43 of them under esbuild, 11 under Rollup and 42 under Rolldown"; "kept 43, 20 and 42 ... this candidate keeps three" | unchecked | `docs/evidence/1.0.0-rc.2-20261006/README.md` lines 308 to 309 and 330 to 332 tabulate 66; 43, 42, 11, 42; 43, 20, 42; and 3, 3, 3 | The counts are in the author's README tables; the bundling runs were not repeated. Note the README's first table has four bundler columns (43, 42, 11, 42) where the line names three bundlers. |
| E-1.0.0-rc.2-04 | 367 to 375 | `src/time-scale.ts` and `src/time-scale-data.ts`; "180 bytes gzipped, where it was 7,475" | unchecked | both files exist; 180 and 7,475 appear in the folder's README | Bundle sizes not re-measured. |
| E-1.0.0-rc.2-05 | 376 to 381 | `DEFAULT_ASPECT_POLICY` marked; 137, 4,169, 3,936, 35,132, 37,000, 36,736 bytes | unchecked | the six numbers appear in the folder's README | Not re-measured. |
| E-1.0.0-rc.2-06 | 382 to 383 | `CHALDEAN_FACES` ... "it is marked now" | unchecked | name found in the archive | The mark itself was not inspected. |
| E-1.0.0-rc.2-07a | 384 to 391 | "`UNMARKED_SOURCE` in `scripts/pure-tables.mjs` names their modules" | supported | `git show 7fa964d:scripts/pure-tables.mjs` line 184: `UNMARKED_SOURCE = /^src\/(?:calc\.ts\|vedic\/(?:ayanamsa\|dasha\|kp\|nakshatra\|varga)\.ts)$/u` | Match. |
| E-1.0.0-rc.2-07b | 384 to 391 | "`./calc`'s graph and ... `./vedic`'s, which have 239 and 249 left" | supported | `sizes.json` rc.2: calc 145,261, vedic 127,751; budgets 145,500 and 128,000 at `7fa964d` (`verify-package-contents.mjs` lines 130, 177) | 145,500 minus 145,261 is 239; 128,000 minus 127,751 is 249. |
| E-1.0.0-rc.2-07c | 384 to 391 | "16 bytes each ... at least 288 bytes ... 432" | unchecked | numbers appear in the README | Not recomputed. |
| E-1.0.0-rc.2-08 | 392 to 406 | what `scripts/pure-tables.mjs` checks and refuses; "the release's record reads each mark in `src/` by hand" | unchecked | the script and the two generated files exist | The checker's behaviour was not exercised. |
| E-1.0.0-rc.2-09 | 407 to 415 | the TypeScript migration step; what the packed-consumer check exercises; "which failed on 1.0.0-rc.1's archive" | unchecked | names found in the archive | Consumer check not re-run; no failing log was opened. |
| E-1.0.0-rc.2-10a | 416 to 422 | "the root's is 105,980 bytes, 615 more"; "`./crossings`, 9,942 of 10,000; `./geo`, 35,439 of 35,500; `./calc`, 145,261 of 145,500; and `./vedic`, 127,751 of 128,000"; "from none (`./crossings`, `./houses`) to 759 bytes (`./techniques`)" | supported | `docs/evidence/1.0.0-rc.2-20261006/sizes.json`: root 105,365 then 105,980; crossings 9,942 both; houses 13,678 both; techniques 155,046 then 155,805; geo 35,439; calc 145,261; vedic 127,751; budgets in `7fa964d:scripts/verify-package-contents.mjs` lines 130, 133, 141, 177 | Match. |
| E-1.0.0-rc.2-10b | 416 to 422 | "less 105 bytes where it loads the time scale"; "No budget is raised" | unchecked | none | Budgets were not diffed entry by entry against `77a16c2`. |
| E-1.0.0-rc.2-11a | 423 to 425 | "every declaration file is 1.0.0-rc.1's, and the conformance results are 1.0.0-rc.1's" | supported | `cmp` over 22 `.d.ts` files; `conformance/results/zodiacs-engine.json` at `77a16c2` and at `7fa964d`: 500 results, 267 pass, 192 fail, 41 unsupported in both | Declarations identical; verdict totals identical. `git diff --stat 77a16c2 7fa964d -- conformance/results` shows 4 changed lines in 3 files, not read line by line (expected to be the version string). |
| E-1.0.0-rc.2-11b | 423 to 425 | the battery of 6,417 calls "prints the same bytes on both candidates" | unchecked | 6,417 appears in the README | Not replayed. |

### 1.0.0-rc.1

Heading as written: `## 1.0.0-rc.1 — unreleased candidate` (line 427).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-1.0.0-rc.1-01 | 427 | ## 1.0.0-rc.1 — unreleased candidate | supported | `raw/npm-view-engine.json` lists no 1.0.0-rc.1; no tag or release | Not published. Archive carried, source `77a16c2`. |
| E-1.0.0-rc.1-02a | 429 to 441 | "on rc.17 (main at `782b496`, the merge of zodiacs-org/engine#26)" | supported | `git log -1 782b496`: "Merge pull request #26: Release candidate 0.1.1-rc.17" | Match. |
| E-1.0.0-rc.1-02b | 429 to 441 | "in a comparison of 6,411 calls across the twelve entry points, each result that differs from rc.17's is one of the changes listed here" (the count) | supported | `docs/evidence/1.0.0-rc.1-20261006/results/values-compare.txt` lines 1 to 2: "6411 calls in values-rc17.jsonl, 6417 in values-rc1.jsonl"; "6411 calls in both, under 347 labels; results the same in 6372 ...; 39 differ" | The count is recorded. Later entries' "battery of 6,417 calls" is the same tool run on 1.0.0-rc.1 and later, so the two figures do not conflict. |
| E-1.0.0-rc.1-02c | 429 to 441 | that each of the 39 differing results "is one of the changes listed here"; the six reviews; the policy summary | unchecked | none | The 39 differences were not matched to the list. Reviews are described in the folder's README (which says they are AI-assisted), not checked here. |
| E-1.0.0-rc.1-03 | 443 to 450 | `api/` holds the declarations; `npm run api:check` in CI | unchecked | `git ls-tree 77a16c2 api/` has 12 files | Twelve files exist; the CI step was not looked up. |
| E-1.0.0-rc.1-04 | 451 to 454 | `docs/versioning.md`: the policy | unchecked | file exists | A description of a document; not compared sentence by sentence. |
| E-1.0.0-rc.1-05 | 455 to 462 | the experimental names | supported | all names found in the archive; `@experimental` occurs in `index.d.ts` (4), `houses-extra.d.ts` (2), `techniques.d.ts` (5), `timing.d.ts` (7), `vedic.d.ts` (5) of the 1.0.0-rc.1 archive | Tags are present in the five entries named. The tag was not matched name by name. |
| E-1.0.0-rc.1-06a | 463 to 472 | "measured against ERFA in 64,974 comparisons ... 0.0037″ and 1.3 × 10⁻⁷″ a day ... 1.8 × 10⁻⁵″ and 1.2 × 10⁻⁷″ a day" | supported | `docs/evidence/calc-epochs-2026-10-06/README.md` lines 65 to 66: 21,658 and 43,316 comparisons (sum 64,974), maxima 0.003674″, 1.22e-7, 1.706e-5, 1.16e-7, bands as quoted | Match (bands are the maxima rounded up). The README is the author's table; the run was not repeated. |
| E-1.0.0-rc.1-06b | 463 to 472 | the `EPHEMERIS_SPAN` dates; "the owner's decision of 2026-10-06"; `epoch-out-of-range` behaviour | unchecked | `epoch-out-of-range` found in the archive | String exists; behaviour not run; no owner record looked up. |
| E-1.0.0-rc.1-07 | 473 to 482 | the new names | supported | every name listed was found in the 1.0.0-rc.1 archive or its source commit (mechanical search, none missing) | Present. Whether each is new relative to rc.17 was not checked name by name. |
| E-1.0.0-rc.1-08 | 483 to 491 | receipt record types and reader behaviour; "which reads it, and it reads rc.17's" | unchecked | none | Not run across the two archives. |
| E-1.0.0-rc.1-09 | 492 to 496 | `ZoneHistoryNotLoadedError` behaviour | unchecked | name found in the archive | Not run. |
| E-1.0.0-rc.1-10 | 497 to 499 | the year 9999/10000 calendar note | unchecked | none | Not run. |
| E-1.0.0-rc.1-11 | 500 to 501 | `reason: "sample-budget"` for a refused `planetaryHours` day | unchecked | string found in the archive | Not run. |
| E-1.0.0-rc.1-12 | 502 to 506 | `BodyLongitudeAt<B>`; `DateInput` window ends | unchecked | names found | Not run. |
| E-1.0.0-rc.1-13 | 507 to 510 | `CALC_AYANAMSAS` taken from `AYANAMSAS`; type aliases | unchecked | names found | Not traced. |
| E-1.0.0-rc.1-14 | 511 to 523 | the documentation items | unchecked | none | Doc comments not read one by one. |
| E-1.0.0-rc.1-15a | 524 to 536 | "the package is 982,086 bytes unpacked in 74 files, 35,737 more than rc.17's 946,349 in 70: 1,828 ... 4,607 ... 13,515 ... 15,683 ... 104" | supported | unpacked archives recomputed: 982,086 in 74 files; 946,349 in 70; `sizes.json` `growthFrom` 35,737 with rootJs 1,828; split differences: optInJs 287,483 minus 282,876 is 4,607; declarations 191,705 minus 178,190 is 13,515; documents 204,544 minus 188,861 is 15,683; manifest 3,845 minus 3,741 is 104 | Match. |
| E-1.0.0-rc.1-15b | 524 to 536 | "raising the cap from 950,000 to 1,000,000 ... 1.82 per cent of headroom"; "`./geo`'s was raised from 35,000 to 35,500 ... its graph is 35,375"; "`./calc`, 144,694 of 145,500; `./crossings`, 9,942 of 10,000; and `./vedic`, 127,184 of 128,000" | supported | `verify-package-contents.mjs` at `77a16c2`: `"./geo": 35_500`, `TOTAL_CAP = 1_000_000`; at `aae419c`: `35_000`, `950_000`; `sizes.json`: `headroomPercent` 1.82; rc.1 graphs in `1.0.0-rc.2-20261006/sizes.json`: geo 35,375, calc 144,694, crossings 9,942, vedic 127,184 | Match. |
| E-1.0.0-rc.1-15c | 524 to 536 | "The owner approved ... on 2026-10-06" | unchecked | none | No owner record looked up. |
| E-1.0.0-rc.1-16 | 538 | "Breaking changes, each with what to do:" (heading line) | unchecked | none | Introduces 17 to 26. |
| E-1.0.0-rc.1-17 | 540 to 543 | calc scale names in lower case; upper case throws | unchecked | none | Not run. |
| E-1.0.0-rc.1-18 | 544 to 546 | `houses()` takes `houseSystem`; `system` throws | unchecked | none | Not run. |
| E-1.0.0-rc.1-19 | 547 to 550 | "a receipt's schema is `zodiacs.calc-receipt.v1`, where rc.16 and rc.17 wrote `zodiacs.calc-receipt.draft-v1`" | supported | `grep` of the archives' `dist/*.js`: 1.0.0-rc.1 holds only `zodiacs.calc-receipt.v1`; 0.1.1-rc.17 only `zodiacs.calc-receipt.draft-v1` | Match for rc.17 and 1.0.0-rc.1; rc.16's string not printed here. |
| E-1.0.0-rc.1-20 | 551 to 554 | `epoch-out-of-range` as a new member of `CalcRefusal["reason"]` | unchecked | string found in the archive | Not run. |
| E-1.0.0-rc.1-21 | 555 to 564 | unknown options throw | unchecked | none | Not run. |
| E-1.0.0-rc.1-22 | 565 to 567 | `userAyanamsa` refuses a bare-number epoch | unchecked | none | Not run. |
| E-1.0.0-rc.1-23 | 568 to 573 | `davisonPlace` and `calendarNote` refusals | unchecked | none | Not run. |
| E-1.0.0-rc.1-24 | 574 to 577 | `deltaT`/`deltaTAt` throw for a non-finite UT; rc.17's old behaviour | unchecked | none | Not run. |
| E-1.0.0-rc.1-25 | 578 to 586 | tables frozen and readonly; `ASPECT_BODIES` as `ReadonlySet` | unchecked | names found | Not run. |
| E-1.0.0-rc.1-26 | 587 to 606 | the types-only changes | unchecked | names found (the tool's `TZDB.sha256`, `SOLAR_RETURN_*`, `LUNAR_RETURN_*` misses are a member access and two wildcards, not missing names) | Declarations not diffed against rc.17 item by item. |
| E-1.0.0-rc.1-27 | 608 to 609 | "kept working at least until twelve months after 1.0.0" | unchecked | none | A promise about the future. |
| E-1.0.0-rc.1-28 | 611 | `SIGN_NAMES` deprecated | supported | `@deprecated` precedes its declaration in the archive's `.d.ts` | Tag present. |
| E-1.0.0-rc.1-29 | 612 | `ConfiguredAspectMotion` deprecated | supported | same check | Tag present. |
| E-1.0.0-rc.1-30 | 613 | `PLACIDUS_POLAR_FALLBACK` deprecated | supported | same check | Tag present. |
| E-1.0.0-rc.1-31 | 614 to 615 | `DECLINATION_ORB` and `DECLINATION_ORB_LUMINARY` deprecated | supported | same check, both | Tags present. "the same values" not compared. |
| E-1.0.0-rc.1-32 | 616 | `SIDEREAL_RATE` deprecated | supported | same check | Tag present. |
| E-1.0.0-rc.1-33 | 617 to 618 | `PlanetaryReturn` (`./techniques`) deprecated | supported | same check | Tag present. |
| E-1.0.0-rc.1-34 | 620 to 623 | "Considered and left as they are" | unchecked | none | A record of decisions. |
| E-1.0.0-rc.1-35 | 625 to 637 | the migration summary | unchecked | none | Restates 17 to 33. |
| E-1.0.0-rc.1-37 | 641 to 642 | "`docs/time.md` called the flags `dst-gap` and `dst-fold` deprecated. They are permanent" | supported | `git show aae419c:docs/time.md` line 336: "**Deprecated:** the names `dst-gap` and `dst-fold`"; `77a16c2:docs/time.md` lines 346 to 347: "so they are not deprecated (this note called them deprecated before 1.0.0)" | The correction is in the document. |
| E-1.0.0-rc.1-38 | 643 to 645 | `docs/timing-hellenistic.md`, *Limits* corrected | unchecked | file exists | Not diffed. |
| E-1.0.0-rc.1-39 | 646 to 648 | three doc comments fixed | unchecked | none | Not located. |

### 0.1.1-rc.17

Heading as written: `## 0.1.1-rc.17 — unreleased candidate` (line 650).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.17-01 | 650 | ## 0.1.1-rc.17 — unreleased candidate | supported | `raw/npm-view-engine.json` lists no 0.1.1-rc.17; no tag or release | Not published. Archive carried, source `aae419c`. |
| E-0.1.1-rc.17-02a | 652 to 663 | "on rc.16 (main at `23660f5`, the merge of zodiacs-org/engine#25)" | supported | `git log -1 23660f5`: "Merge pull request #25" | Match. |
| E-0.1.1-rc.17-02b | 652 to 663 | "so are the conformance suite's 500 verdicts" | supported | `conformance/results/zodiacs-engine.json` at `aae419c` and at `ddbbaa0`: 500 results, 267 pass, 192 fail, 41 unsupported in both | Totals identical. Values not compared one by one. |
| E-0.1.1-rc.17-02c | 652 to 663 | "rc.17 is not to be published on npm" | supported | npm lists no 0.1.1-rc.17 | Match. The owner's decision of 2026-10-05 was not looked up. |
| E-0.1.1-rc.17-02d | 652 to 663 | rc.16 refused `zodiac: { sidereal }`; "the root entry and eleven others build to rc.16's files but for the version's value and the hashed chunk names"; tropical round-trip values unchanged | unchecked | none | Built files of the two archives were not diffed. |
| E-0.1.1-rc.17-03 | 665 to 677 | the four functions take `zodiac: { sidereal }`; "to the bit" with `siderealChart()` | unchecked | names found in the archive | Not run. |
| E-0.1.1-rc.17-04 | 678 to 683 | the two new refusals and the RangeError | unchecked | strings found | Not run. |
| E-0.1.1-rc.17-05 | 684 to 691 | new result keys and the receipt ids | unchecked | names found | Not run. |
| E-0.1.1-rc.17-06a | 692 to 707 | "over 2,333,979 comparisons"; "4.6 × 10⁻⁷″ and 1.6 × 10⁻⁷″ a day for epoch and linear definitions"; "0.058″ and 27″ a day within 0.3°" | supported | `docs/evidence/calc-sidereal-2026-10-05/README.md` line 51 (2,333,979), line 132 (4.53e-7, 1.52e-7), line 135 (0.0574″, 27.0″ a day, band 0.058″; 27″) | Match, bands being the maxima rounded up. Author's table; the run was not repeated. |
| E-0.1.1-rc.17-06b | 692 to 707 | the two middle bands (0.0013″/0.00039″ at 2° or more; 0.0048″/0.026″ from 0.3° to 2°); the fixtures hold the engine to them | unchecked | numbers appear in the same README (found by search); fixture and test files exist | Rows for those two bands were not opened. |
| E-0.1.1-rc.17-07 | 708 to 722 | the linear ayanamsa change and its magnitudes; `docs/vedic.md`'s correction (164 comparisons, 17°, 0.058″) | unchecked | numbers appear in the two folders' READMEs and `gates.log` | Not re-derived. |
| E-0.1.1-rc.17-08a | 723 to 728 | "The conformance results are regenerated: 267 pass, 192 fail and 41 unsupported of 500" | supported | `conformance/results/zodiacs-engine.json` at `aae419c` | Match. |
| E-0.1.1-rc.17-08b | 723 to 728 | "The calc round-trip fixture gains twelve cases ... Of its 25 earlier cases ... 15 gain `ayanamsa: null`" | unchecked | `src/fixtures/calc-roundtrip.json` exists at `aae419c` | Cases not counted (1.0.0's later entry refers to cases 17 and 25 of the fixture, which is consistent with at least 25). |
| E-0.1.1-rc.17-09a | 729 to 738 | "the calc entry's import graph grows from 113,904 to 139,836 bytes, and its budget is raised from 115,000 to 145,500"; "`./vedic`'s graph grows by 1,508 bytes, to 123,639 of its 128,000" | supported | `docs/evidence/rc17-20261005/sizes.json`: calc 113,904 then 139,836; vedic 122,131 then 123,639; `verify-package-contents.mjs` at `ddbbaa0` `"./calc": 115_000`, at `aae419c` `145_500`, `"./vedic": 128_000` | Match. |
| E-0.1.1-rc.17-09b | 729 to 738 | "The package is 946,349 bytes unpacked in 70 files (rc.16: 923,282 in 69): of the 23,067 bytes it grows by, 9,844 are opt-in JavaScript, 4,618 declarations and 8,605 documents. That leaves 0.38 per cent of the cap of 950,000, which was not raised" | supported | unpacked archives recomputed (946,349 in 70; 923,282 in 69; npm reports rc.16 `unpackedSize` 923282, `fileCount` 69); `sizes.json` growth split 9,844, 4,618, 8,605; `TOTAL_CAP = 950_000` at both commits | Match. |
| E-0.1.1-rc.17-10 | 740 | "Breaking changes:" (heading line) | unchecked | none | Introduces 11 and 12. |
| E-0.1.1-rc.17-11 | 742 to 745 | `not-in-this-version` now means only gravitational deflection | unchecked | none | Not run. |
| E-0.1.1-rc.17-12 | 746 to 748 | new keys null in the tropical zodiac | unchecked | none | Not run. |
| E-0.1.1-rc.17-13 | 750 to 753 | migration note | unchecked | none | Restates the above. |
| E-0.1.1-rc.17-15 | 757 to 760 | "rc.14's, rc.15's and rc.16's entries call each an unreleased candidate. They were published on npm afterwards: rc.14 and rc.15 on 2026-09-30, rc.16 on 2026-10-01, and on 2026-10-05 `latest` was rc.15 and `next` rc.16" | supported | `docs/evidence/rc17-20261005/npm-view.txt` (captured 2026-10-05T23:46:07Z) and `raw/npm-view-engine.json`: rc.14 2026-09-30T11:45:36Z, rc.15 2026-09-30T11:53:41Z, rc.16 2026-10-01T12:02:05Z; `latest` rc.15, `next` rc.16 | Match. This correction is the changelog's own statement that the three headings below it are out of date. |

### 0.1.1-rc.16

Heading as written: `## 0.1.1-rc.16 — unreleased candidate` (line 762).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.16-01 | 762 | "## 0.1.1-rc.16 — unreleased candidate" | not supported | `raw/npm-view-engine.json`: `"0.1.1-rc.16": "2026-10-01T12:02:05.117Z"`, dist-tag `next`; `raw/npm-dist.json` shasum `f57e312b...` equals `sha1sum artifacts/zodiacs-engine-0.1.1-rc.16.tgz`, `fileCount` 69, `unpackedSize` 923282 | Contradicted today: 0.1.1-rc.16 has been on npm since 1 October 2026. The heading was true when written (source commit `ddbbaa0` and carrying commit `ef44477` are dated 2026-09-30; pull request #22 merged 2026-09-30T15:46:00Z). rc.17's *Corrections* (line 757) and `README.md` say it was published later; the heading itself was never changed. No git tag or GitHub release exists for it. |
| E-0.1.1-rc.16-02a | 764 to 784 | "onto rc.15 (main at `93ebae9`, the merge of zodiacs-org/engine#20)" | supported | `93ebae9` is the target of tag `v0.1.1-rc.15` (`raw/engine-refs-before.txt`) and the GitHub release body calls it "the rc.15 merge" | Match. |
| E-0.1.1-rc.16-02b | 764 to 784 | "Nothing was pushed or published." | not supported | npm registry as in 01 | True on 30 September 2026 when written; rc.16 was published to npm the next day. Listed as out of date, not as an error at the time. |
| E-0.1.1-rc.16-02c | 764 to 784 | the six pieces and their order; the earlier local build and its review's findings | unchecked | `docs/evidence/rc16-20260930/README.md` exists (cited section *The re-cut* not read) | Local builds that were never pushed cannot be checked from the repository. |
| E-0.1.1-rc.16-03 | 786 to 794 | "Held back: ... `@zodiacs/engine/chinese`" | supported | packed `package.json` of 0.1.1-rc.16 has no `./chinese` export | The entry is absent from the archive. The NAIF question and the DE430 fit were not checked. |
| E-0.1.1-rc.16-04 | 796 | "Breaking changes:" (heading line) | unchecked | none | Introduces 05 and 06. |
| E-0.1.1-rc.16-05a | 798 to 806 | "A receipt of the new set carries `nutation: \"iau2000b;equation-of-equinoxes-with-two-complementary-terms\"` and `moonPosition: \"astronomy-engine-geo-moon;no-light-time;no-aberration\"`" | supported | both strings are in the 0.1.1-rc.16 archive's `dist/*.js`; `src/receipt-nutation.test.ts` and `src/receipt-versions.test.ts` exist | Present. |
| E-0.1.1-rc.16-05b | 798 to 806 | the set's index (0, 1, 2) and the version windows the codec accepts | unchecked | none | Not run. |
| E-0.1.1-rc.16-06 | 807 to 814 | every result that depends on the nutation moves; "No function signature of the root entry or of an rc.15 entry point changes" | unchecked | none | Declarations of rc.15 and rc.16 were not diffed. |
| E-0.1.1-rc.16-07 | 816 to 820 | migration note | unchecked | none | Advice. |
| E-0.1.1-rc.16-09a | 824 to 850 | "Bounds ... over 32 preregistered instants ... 3.00″ median and 24.6″ at worst"; "on astronomy-engine's five-term nutation the four ... had failed by up to 0.20″" | supported | the three figures appear in `docs/evidence/calc-api/RESULTS.md` (text search); `docs/evidence/calc-api/rc16/` exists | Figures are in the record. Context lines not read; marked supported on the figure match only, see the method note. |
| E-0.1.1-rc.16-09b | 824 to 850 | the API description (frames, centers, corrections, refusals, instants, "to the bit"); "`houses()` carries ... 0.02″ ... 0.08″"; "maps every Swiss Ephemeris `calc_ut` flag" | unchecked | names found in the archive | Not run. |
| E-0.1.1-rc.16-10a | 851 to 871 | "all 24,188 sampled transitions matched, none missed and none extra ... (1,487,520 checks)" | supported | `docs/evidence/birth-window/rc16/README.md` lines 38 to 45: sampled 24,188, matched 24,188, "Millisecond checks / failures ... 1,487,520 / 0" | Match. |
| E-0.1.1-rc.16-10b | 851 to 871 | the description of `birthWindow`; "24 of its 294 ingresses"; 1,000 random windows | unchecked | names found; 294 appears in the folder | Not run. |
| E-0.1.1-rc.16-11a | 872 to 903 | "6,795 of 6,796 cases agree exactly; the preregistered parity gate, G1, ... recorded as failed. The one that differs is 2011-12-30 in Pacific/Apia" | supported | `docs/evidence/techniques-2026-09-29/rc16/README.md` line 35 | Match. |
| E-0.1.1-rc.16-11b | 872 to 903 | "the root's graph was to stay at rc.15's 95,273 bytes and is 103,537; ... 700,000-byte cap ... is 923,282 bytes; `./techniques` ... 152,472" | supported | `docs/evidence/rc16-20260930/sizes.json`: root 103,537, techniques 152,472, package 923,282; npm `unpackedSize` 923282 | The measured sizes match. For the phrase "rc.15's 95,273 bytes" see 11d. |
| E-0.1.1-rc.16-11c | 872 to 903 | the function list; USNO and Horizons figures (42.27 s, 32.05 s, 6.81 s); the deviation; the rest of the paragraph past the gate list | unchecked | 42.27 and 6.81 found by text search; 32.05 only in `measurements.json` unrounded | Not re-derived. |
| E-0.1.1-rc.16-11d | 872 to 903 | "the root's graph was to stay at rc.15's 95,273 bytes" (also in 12 and 14: "rc.15's 95,273 bytes") | not supported | this entry's own table (line 1140) and `docs/evidence/rc16-20260930/sizes.json` (`rc15`): the root of rc.15 as carried is 97,704 bytes; rc.15's entry, line 1486: "The first cut's root was 95,273" | 95,273 is the root of rc.15's first local cut, which the feature branches were built on, not of rc.15 as carried and published (97,704). The three sentences call it "rc.15's". The gate verdicts (failed) do not depend on which figure is used, since 103,537 exceeds both. |
| E-0.1.1-rc.16-12a | 904 to 928 | "Its part for `./houses` ... holds: 13,606 bytes of 15,000"; "`./timing` was to stay within its 120,000-byte budget and is 123,039" | supported | `sizes.json`: houses 13,606, timing 123,039; budget 15,000 at `ddbbaa0` | Match. |
| E-0.1.1-rc.16-12b | 904 to 928 | the accuracy figures against Swiss (0.01″, 11 of 20,000, 0.445″, 0.00000001″, 0.00035° a day, 5 cases) | unchecked | some figures appear in the folder's README | Swiss Ephemeris output is not in the repository; not re-derived. |
| E-0.1.1-rc.16-13 | 929 to 938 | `planetaryReturns` and its Horizons and USNO figures (49.7 s) | unchecked | 49.7 appears in the folder's README; names found | Not re-derived. |
| E-0.1.1-rc.16-14a | 939 to 955 | "192 rises and sets of Uranus at 65° in 1950 (up to 11.61 s ...)"; "465 of 467 USNO times ... (30.06 s and 30.15 s)" | supported | `docs/evidence/sky-chinese-2026-09-29/rc16/s2-swiss.json` and `s1s2.log`: `"max": 11.608559...`; 30.06 and 30.15 in the folder's README; 465 and 467 in `results.jsonl` and README | Maxima match on rounding. The count 192 and "226,717 events" were not found by text search (226,717 not found in any form). |
| E-0.1.1-rc.16-14b | 939 to 955 | "226,717 events, 1900–2100"; the function description; which gates pass and fail | unchecked | none | 226,717 could not be located in the evidence folders searched. |
| E-0.1.1-rc.16-15 | 957 to 960 | "`scripts/root-isolation.mjs` checks it" with `OPT_IN_SOURCE`, `src/equator.ts`, `src/first-millisecond.ts` | supported | the script and both source files exist; `OPT_IN_SOURCE` found at the source commit | Present. The check was not run. |
| E-0.1.1-rc.16-17a | 964 to 983 | "(Zodiacs site repository, `docs/platform/evidence/engine-audit-2026-09-22/LEDGER.md`)" names finding production-positions-7 | supported | the file exists in the site repository at that path and contains `production-positions-7` | The cross-repository reference resolves. |
| E-0.1.1-rc.16-17b | 964 to 983 | the nutation's sources and what the code no longer calls ("5 of that model's 77 luni-solar terms", NOVAS C 3.1, IERS tables) | unchecked | `src/nutation.ts`, `src/frame.ts`, `src/equator.ts`, `LICENSING.md`, `NOTICE` exist | Source attributions not compared with the cited publications. |
| E-0.1.1-rc.16-18 | 985 to 998 | agreement with ERFA (1e-10″, 6e-11″, 3.50e-5″, 7.1e-7″, 0.00394″) | unchecked | the cited JSON files exist; 3.50e-5, 7.1e-7, 0.00394 appear in the READMEs; 6e-11 not found as text | ERFA runs not repeated; JSON values not opened. |
| E-0.1.1-rc.16-19 | 1000 to 1001 | "What it moved, from rc.15 ..." (lead-in) | unchecked | none | Introduces 20 to 26. |
| E-0.1.1-rc.16-20 | 1003 to 1029 | the root entry's movements (0.2701″, 0.2635″, 9,697 charts, 0.8003″, 3.883″, 257 s, 0.035″ against Swiss, and the rest) | unchecked | nearly every figure appears in the two folders' READMEs or result files (text search; see the pass output) | Too many figures to trace to their JSON keys in this pass; none was found missing. |
| E-0.1.1-rc.16-21 | 1030 to 1043 | calc's movements; "Of calc's 107 rows of bounds, 104 are measured ... 71 ... fall" | unchecked | 107, 104, 0.051, 0.013, 0.0023 found; 0.322 and 0.874 not found as text | Not traced. |
| E-0.1.1-rc.16-22 | 1044 to 1059 | window movements and node flicker counts | unchecked | `node-flicker.json`, `window-rates.json` exist; 1,349 and 1,603 found; 2.60e-5 and 2.073e-5 not found as text | Not traced. |
| E-0.1.1-rc.16-23 | 1060 to 1066 | techniques' movements (7.2 s, 0.59 s, 0.372 s, 45.35 s to 42.27 s, 33.23 s and 6.87 s to 32.05 s and 6.81 s) | unchecked | several found; 45.35, 33.23, 32.05 only in `measurements.json` (files that contain those digit strings) | Not traced. |
| E-0.1.1-rc.16-24 | 1067 to 1068 | `./houses`: nothing moves given the same input | unchecked | none | Not run. |
| E-0.1.1-rc.16-25 | 1069 to 1073 | `planetaryReturns` movements | unchecked | 79.2, 0.840, 0.804, 0.815, 0.705 found; 0.239 not found as text | Not traced. |
| E-0.1.1-rc.16-26 | 1074 to 1078 | sky movements | unchecked | figures found by text search | Not traced. |
| E-0.1.1-rc.16-27 | 1080 to 1088 | the plumbing check (520 charts, 8.0e-13°, 178,416 values) | unchecked | the three JSON files exist; 178,416 found; 8.0e-13 not found as text | Not opened. |
| E-0.1.1-rc.16-28 | 1090 to 1094 | cost figures (3, 6 to 20, 19 per cent; ten calls where 154) | unchecked | `results/performance.json` exists | Timings not re-measured. |
| E-0.1.1-rc.16-29a | 1096 to 1102 | "267 pass, 192 fail, 41 unsupported of 500" | supported | `conformance/results/zodiacs-engine.json` at `ddbbaa0`: 500 results, 267/192/41 | Match. |
| E-0.1.1-rc.16-29b | 1096 to 1102 | "one verdict moves, `L1-POS-0041`"; the L2 residuals before and after | unchecked | `docs/evidence/rc16-20260930/conformance-changes.json` exists and compares rc.15 and rc.16 results; 0.182, 0.178, 0.285, 0.103, 0.489, 0.0712 found; the four "after" figures not found as rounded text | JSON not walked. |
| E-0.1.1-rc.16-30 | 1104 to 1113 | tests whose expectations changed (5.94 s, 06:47:13.822Z, 0.047 s, 0.0003″, 1.07e-5″) | unchecked | figures appear in the folder's README | Tests not read. |
| E-0.1.1-rc.16-32 | 1117 to 1128 | rc.15 receipts still parse; 16,218 rc.14 receipts differ by up to 0.2554″ and 3.022″ | unchecked | `src/fixtures/receipt-rc15.json` and `receipt-replay.json` exist; figures appear in the README | Replay not run. |
| E-0.1.1-rc.16-34 | 1132 to 1135 | "(`docs/evidence/rc16-20260930/sizes.json`)" is the table's source | supported | file exists with keys `rc15`, `pre-nutation`, `rc16` | See 35. |
| E-0.1.1-rc.16-35 | 1137 to 1152 | the fourteen-row table of import graphs, gzip sums and budgets | supported | every row compared by script with `docs/evidence/rc16-20260930/sizes.json` (`rc15` and `rc16` bytes and gzip) and with the budgets in `git show ddbbaa0:scripts/verify-package-contents.mjs`: 14 rows, 0 mismatches | Exact match. The "was" and "on its branch" notes in the Budget column were not checked. |
| E-0.1.1-rc.16-36 | 1154 to 1159 | "The root grows by 5,833 bytes, 2,420 gzipped" and its breakdown | unchecked | 103,537 minus 97,704 is 5,833 and 34,828 minus 32,408 is 2,420 (from the table checked in 35); the per-module breakdown appears in the README | The totals follow from 35; the breakdown was not recomputed. |
| E-0.1.1-rc.16-37 | 1161 to 1176 | which budgets were raised from what, and why; "0.96 and 2.34 per cent"; geo +524, receipt +380 | unchecked | 34,659 minus 34,135 is 524 and 66,580 minus 66,200 is 380 (from the table) | Earlier budget values were not read from the branch commits. |
| E-0.1.1-rc.16-38a | 1178 to 1185 | "The cap ... was raised from 700,000 to 950,000 bytes ... (in `5e0d00c`, before the nutation, when they took the package to 879,777 bytes)"; "The package is 923,282 bytes unpacked in 69 files (rc.15: 668,343 in 54)" | supported | `git show 5e0d00c -- scripts/verify-package-contents.mjs` removes `TOTAL_CAP = 700_000`; `sizes.json` `pre-nutation` total 879,777, `rc16` 923,282, `rc15` 668,343; npm reports 69 files / 923282 and 54 files / 668343 | Match. |
| E-0.1.1-rc.16-38b | 1178 to 1185 | "A stand-in for the Zodiacs site's engine chunk grows by 1,080 bytes gzipped"; "no site build measured it" | unchecked | none | Not opened. |
| E-0.1.1-rc.16-40 | 1189 to 1193 | the Placidus band correction (4e-9° to 1e-8°) | unchecked | `src/houses.ts` exists | The comment in `src/houses.ts` was not read. |

### 0.1.1-rc.15

Heading as written: `## 0.1.1-rc.15 — unreleased candidate` (line 1195).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.15-01 | 1195 | "## 0.1.1-rc.15 — unreleased candidate" | not supported | `raw/npm-view-engine.json`: `"0.1.1-rc.15": "2026-09-30T11:53:41.415Z"`; `raw/npm-dist.json` shasum `e4a49148...` equals `sha1sum artifacts/zodiacs-engine-0.1.1-rc.15.tgz`, 54 files, 668,343 bytes; `raw/github-releases.json`: tag `v0.1.1-rc.15`, prerelease, published 2026-10-01T10:13:53Z | Contradicted today: rc.15 is on npm (30 September 2026) and is the one GitHub release. True when written (source commit `104bd5a` dated 2026-09-29; pull request #20 merged 2026-09-30T06:12:54Z, before the npm publish at 11:53Z). The GitHub release body says the heading "describes when those notes were written"; rc.17's *Corrections* says the same. |
| E-0.1.1-rc.15-02a | 1197 to 1217 | "Three builds came before this one, on local branches, and none was pushed or published" | unchecked | none | About three earlier local builds, which are not in the repository and cannot be checked. Read beside the heading, a reader may take "none was pushed or published" for rc.15 itself, which is published (row 01). |
| E-0.1.1-rc.15-02b | 1197 to 1217 | "Its `dist/` is byte-identical to the re-cut's (`rebuilt/dist-digest.log`)" (the log exists and records one digest for the builds it compares) | supported | `docs/evidence/rc15-20260929/rebuilt/dist-digest.log` lines 1 to 6: the same digest `1b09c94f...` for the checkout's `dist/` on Node 24.21.0 and on Node 22.22.2 | The log exists and its first two digests agree. The re-cut's own line was not printed in the lines read. |
| E-0.1.1-rc.15-02c | 1197 to 1217 | "`artifacts/README.md` lists their archives" | supported | `artifacts/README.md`: "Three local builds of rc.15 were superseded before publication. None was pushed or published, none is carried here" followed by a list | Match. |
| E-0.1.1-rc.15-02d | 1197 to 1217 | the four pieces of work; the history of the three builds; the birth-data finding; 7.7e-11″ | unchecked | 7.7e-11 appears in a README | Local history is not in the repository. |
| E-0.1.1-rc.15-03 | 1219 | "Breaking changes, in `@zodiacs/engine/geo` ..." (lead-in) | unchecked | none | Introduces 04 to 09. |
| E-0.1.1-rc.15-04 | 1221 to 1226 | wall time before 1970-01-02 throws until `prepareLocalTime`; "one of 16 files" | unchecked | the archive's `dist/` has 16 zone-history files; `rebuilt/corrections-probe.log` exists | The 16 files are there; the throwing behaviour was not run. |
| E-0.1.1-rc.15-05 | 1227 to 1231 | unknown keys throw `RangeError` | unchecked | none | Not run. |
| E-0.1.1-rc.15-06 | 1232 to 1237 | case-variant keys throw | unchecked | `rebuilt/corrections-probe.log` exists | Log not read. |
| E-0.1.1-rc.15-07 | 1238 to 1241 | the meaning of `lmt` | unchecked | none | Not run. |
| E-0.1.1-rc.15-08 | 1242 to 1247 | `"iers-utc/1"` and `"fallback"` | unchecked | both strings found in the archive (the tool's "missing path" flag is a string, not a path) | Not run. |
| E-0.1.1-rc.15-09 | 1248 to 1251 | new conventions set at index 0 | unchecked | none | Not run. |
| E-0.1.1-rc.15-10 | 1253 | "Other changes to existing results:" (lead-in) | unchecked | none | Introduces 11 to 17. |
| E-0.1.1-rc.15-11a | 1255 to 1270 | "597 names" | supported | `recut/backzone-divergence.json`: `names: 597`; `recut/roundtrip-full.json`: `zones: 597` | Match. |
| E-0.1.1-rc.15-11b | 1255 to 1270 | 584 of 597; 13 links; 122 names differ; the audit's 98 misses 28; Stockholm 1947 | unchecked | `recut/backzone-divergence.json` exists with comparison groups; 584 and 122 found by text search | The JSON's groups were counted only at top level; not matched to the figures. |
| E-0.1.1-rc.15-12 | 1271 to 1293 | the UTC reading from 1972 to 2027-10-02 and every movement figure (0.66 ms, 0.79 ms, 45.0″, 12.4″, 0.462″, 101.03″, 0.4885″, 7,896 charts and the rest) | unchecked | `recut/rc14-comparison.json`, `recut/review-sample.json`, `recut/node-velocity.json` exist; 4,525 and the two timestamps' seconds are in `review-sample.json`; most other figures appear in READMEs; 0.0829 and the four coordinates not found as text | Not traced to keys. |
| E-0.1.1-rc.15-13a | 1294 to 1301 | "sha256 `db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433`"; "the engine matches all 28 changes of Bulletin C 72 (`recut/leap-seconds.json`)" | supported | the digest string is in the 0.1.1-rc.15 archive; `recut/leap-seconds.json`: `changes: 28`, `checks: 58`, `failures: 0`, reference "IERS Bulletin C, through Bulletin 72, July 2026" | Match. The digest was not recomputed against IERS's file. |
| E-0.1.1-rc.15-13b | 1294 to 1301 | "updated 2026-07-06"; "expires 2027-06-28"; 37 s carried; no leap second after 2017; ±0.9 s after 2027-10-02 | unchecked | none | External IERS facts not fetched. |
| E-0.1.1-rc.15-14 | 1302 to 1304 | "The flag names `dst-gap` and `dst-fold` are kept, deprecated" | not supported | CHANGELOG line 641 (1.0.0-rc.1, *Corrections*): "`docs/time.md` called the flags `dst-gap` and `dst-fold` deprecated. They are permanent"; `git show 77a16c2:docs/time.md` lines 346 to 347 | The project later withdrew "deprecated" for these flags in the documentation. This changelog line still says it. `jump.cause` was not run. |
| E-0.1.1-rc.15-15a | 1305 to 1326 | "over 16,218 rc.14 receipts ... the midheaven by up to 12.85″ and the ascendant and cusps by up to 12.94″ at the equator, 40.55″ at 60° and 129.1″ at 65°" | supported | the five figures are in the cited `docs/evidence/rc15-20260929/recut/receipt-replay.json` (text search of that file) | Figures are in the cited file; keys not read. |
| E-0.1.1-rc.15-15b | 1305 to 1326 | what the conventions set records; version windows; the fixture's 5.85e-5°; the five charts (1.71e-3°, 1.80e-3°, 5.98e-5°); the UT1 replay | unchecked | test files and `recut/replay.log` exist; 5.98e-5 not found as text | Not run. |
| E-0.1.1-rc.15-16 | 1327 to 1339 | SemVer ordering in the codec and the refused versions | unchecked | `recut/versions.log`, `src/receipt-versions.test.ts`, `src/semver.test.ts` exist | Not run. |
| E-0.1.1-rc.15-17a | 1340 to 1348 | "Within about 4e-9° of the polar limit ... the 64-step iteration could fail to settle" | not supported | CHANGELOG lines 1189 to 1193 (0.1.1-rc.16, *Corrections*): the window branch's review "measured the band at about 1e-8°; `src/houses.ts` says so" | The figure was corrected by a later entry; this line still gives 4e-9°. The later measurement itself was not re-run. |
| E-0.1.1-rc.15-17b | 1340 to 1348 | Placidus no longer falls back outside the polar circle (F-46); bisection where the iteration does not settle; cusps bit-identical elsewhere | unchecked | none | Not run. |
| E-0.1.1-rc.15-18 | 1350 to 1352 | "(`recut/time-basis-fixes.json`, `recut/tz-line-ends.json`)" | supported | both files exist under `docs/evidence/rc15-20260929/recut/` | Present. Lead-in to 19 to 26. |
| E-0.1.1-rc.15-19 | 1354 to 1362 | leap-second fixes and figures | unchecked | several figures appear in READMEs | Not traced. |
| E-0.1.1-rc.15-20 | 1363 to 1373 | 1972 UT1 − UTC from C04 and figures | unchecked | figures appear in READMEs; 0.0526 and 0.017 not found as text | Not traced. |
| E-0.1.1-rc.15-21 | 1374 to 1378 | speed across a step; the four ratios | unchecked | figures appear in READMEs | Not traced. |
| E-0.1.1-rc.15-22 | 1379 to 1383 | labels just outside the table; 0.148 s | unchecked | 0.148 is in `time-basis-fixes.json` | Not traced. |
| E-0.1.1-rc.15-23 | 1384 to 1386 | `listed` true from 2026-06-28 to 2027-06-28 | unchecked | none | Not run. |
| E-0.1.1-rc.15-24 | 1387 to 1390 | 20,000 charts unchanged; digest `064d98b4a531053a` | unchecked | digest string found in the archive or source | Not run. |
| E-0.1.1-rc.15-25 | 1391 to 1394 | 30 changes relabelled `"legal-change"` | unchecked | `recut/tz-line-ends.json` exists | Not counted. |
| E-0.1.1-rc.15-26 | 1395 to 1397 | `zoneOffsetAt` throws until prepared | unchecked | none | Not run. |
| E-0.1.1-rc.15-27 | 1399 | "New:" (lead-in) | unchecked | none | Introduces 28 to 33. |
| E-0.1.1-rc.15-28 | 1401 to 1407 | `timeScale` input and `chart.timeScale` | unchecked | names found | Not run. |
| E-0.1.1-rc.15-29a | 1408 to 1427 | "Around each of the 65,237 changes of offset from 1850 to 2100 in 597 zones, 2,548,849 sampled wall minutes in all round-trip (`recut/roundtrip-full.json`), and the calendar conversion matches ... on all 2,817,174 days (`recut/jdn-richards.json`)" | supported | `recut/roundtrip-full.json`: zones 597, transitions 65237, tested 2548849, failures 0; `recut/jdn-richards.json`: days 2817174, failures 0, check against Richards | Exact match. |
| E-0.1.1-rc.15-29b | 1408 to 1427 | the geo functions' behaviour; "18 countries"; sources cited | unchecked | names found | The adoption table was not counted. |
| E-0.1.1-rc.15-30 | 1428 to 1435 | the timing techniques | unchecked | names and the two docs paths exist; `./timing` in packed exports | Not run. |
| E-0.1.1-rc.15-31 | 1436 to 1457 | the vedic techniques and the Swiss statistics | unchecked | `ayanamsa-swiss.json` exists and holds 14,647 and 0.00091; several figures not found as rounded text (0.0020, 10.14, 806.16, 0.544) | Not traced. |
| E-0.1.1-rc.15-32 | 1458 to 1462 | root imports none of `/timing`, `/vedic`, `/geo`; `dist/metafile-esm.json` "which is not packed" | unchecked | the archive has no `dist/metafile-esm.json` (the tool's missing-path flag confirms it is not packed) | Not-packed part confirmed; the smoke check was not run. |
| E-0.1.1-rc.15-33a | 1463 to 1472 | "266 pass, 193 fail and 41 unsupported of 500 (rc.14: 232, 222, 46)" | supported | `conformance/results/zodiacs-engine.json` at `104bd5a`: 266/193/41 of 500; at `03db4bb` (rc.14): 232/222/46 | Exact match. |
| E-0.1.1-rc.15-33b | 1463 to 1472 | "All 34 changes are time vectors" and their breakdown; the two residuals | unchecked | `recut/conformance-changes.json` exists; 34 is 266 minus 232 | Breakdown not read. |
| E-0.1.1-rc.15-34a | 1474 to 1479 | "rc.14 had one cap, 300,000 bytes unpacked ... (rc.14: 282,469)" | supported | `git show 03db4bb:scripts/verify-package-contents.mjs` line 46 `report.unpackedSize < 300_000`; npm `unpackedSize` of 0.1.1-rc.14 is 282469 | Match. |
| E-0.1.1-rc.15-34b | 1474 to 1479 | "No budget or cap changed after the first cut." | unchecked | none | The first cut is not in the repository. |
| E-0.1.1-rc.15-35a | 1481 to 1489 | "the root, `.`: 97,704 bytes, budget 100,000 ... rc.14's was 81,712" | supported | `rebuilt/sizes.json`: rc14 root 81,712; rc.16's `sizes.json` `rc15` root 97,704; `"."`: `100_000` at `104bd5a` | Match (97,704 minus 81,712 is 15,992). |
| E-0.1.1-rc.15-35b | 1481 to 1489 | the breakdown of the 15,992 bytes; "The first cut's root was 95,273" and the 2,431 breakdown | unchecked | figures appear in the folder; 1,590 not found as text | Not recomputed. |
| E-0.1.1-rc.15-36 | 1490 to 1501 | each entry's graph, budget and headroom; first-cut sizes | unchecked | the rc.15 column of rc.16's size table (checked there by script against `sizes.json`) gives timing 114,916, vedic 116,779, geo 34,135, receipt 66,200, internal 58,997, internal/math 18,165, crossings 9,410, deltat 4,968, all equal to this line; zone histories: 16 files in the archive; `SHARD_BUDGET = 200_000` | The graph sizes are confirmed through rc.16's table. Budgets other than the root's and deltat's, "beyond the root" figures, headroom percentages and first-cut sizes were not checked, so the row stays unchecked as a whole. |
| E-0.1.1-rc.15-37a | 1502 to 1510 | "the whole package: 668,343 bytes unpacked in 54 files, cap 700,000"; "It grew by 385,874 bytes from rc.14's" | supported | npm `dist` of 0.1.1-rc.15: `fileCount` 54, `unpackedSize` 668343; `TOTAL_CAP = 700_000` at `104bd5a`; 668,343 minus 282,469 is 385,874 | Match. |
| E-0.1.1-rc.15-37b | 1502 to 1510 | the split of the growth (278,975; 49,620; 41,287; 15,992 and the percentages) | unchecked | 385,874 and 4.14 are in `rebuilt/sizes.json`; 278,975, 49,620, 41,287 not found as text | Not recomputed. |
| E-0.1.1-rc.15-38 | 1512 to 1519 | the known limitation: 13.95 ms step at 1941.0 (F-47) | unchecked | 13.95 appears in a README | Not measured. |
| E-0.1.1-rc.15-39 | 1521 to 1523 | "Links to the organization's repositories, in the README ... now use its current name, zodiacs-org" | supported | packed README of 0.1.1-rc.15 contains `ZodiacsOfficial` 0 times; packed CHANGELOG contains it once (this sentence) | Match. |
| E-0.1.1-rc.15-40 | 1525 to 1537 | the birth-data statement and the rebuilt history | unchecked | `CONTRIBUTING.md`, `AGENTS.md` and the README exist | A history scan for birth data is out of this audit's scope; `rebuilt/history-check.txt` exists and was not read. |
| E-0.1.1-rc.15-41 | 1539 to 1551 | migration note | unchecked | none | Advice. |

### 0.1.1-rc.14

Heading as written: `## 0.1.1-rc.14 — unreleased candidate` (line 1553).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.14-01 | 1553 | "## 0.1.1-rc.14 — unreleased candidate" | not supported | `raw/npm-view-engine.json`: `"0.1.1-rc.14": "2026-09-30T11:45:36.308Z"`; `raw/npm-dist.json` shasum `30498f08...` equals `sha1sum artifacts/zodiacs-engine-0.1.1-rc.14.tgz`, 30 files, 282,469 bytes | Contradicted today: rc.14 has been on npm since 30 September 2026. True when written (carried 2026-09-28; pull request #10 merged 2026-09-29T05:35:58Z). rc.17's *Corrections* says so; the heading was never changed. No tag or GitHub release. |
| E-0.1.1-rc.14-02a | 1555 to 1561 | "`engines` now reads `\"node\": \"^20.19.0 \|\| >=22.7.0\"`; rc.13's `>=18`" | supported | packed `package.json`: rc.14 `engines.node` `^20.19.0 \|\| >=22.7.0`; rc.13 `>=18`; both depend on `astronomy-engine` 2.1.19 | Match. |
| E-0.1.1-rc.14-02b | 1555 to 1561 | "CI installs the packed archive in a clean consumer on Node 20.19.0, 22.7.0, 22 and 24" | supported | `git show 03db4bb:.github/workflows/ci.yml` line 128: `node: ['20.19.0', '22.7.0', 22, 24]` | Match. |
| E-0.1.1-rc.14-02c | 1555 to 1561 | the failure on Node 18.20.8, 20.18.3, 21.7.3 and 22.6.0 with "Named export 'Body' not found" | unchecked | none | Those Node versions were not run. |
| E-0.1.1-rc.14-03a | 1562 to 1568 | "The licence expression is `MIT AND CC-BY-4.0`"; "`package.json` had declared `MIT` alone" | supported | packed `package.json`: rc.14 `license` `MIT AND CC-BY-4.0`; rc.13 `MIT` | Match. |
| E-0.1.1-rc.14-03b | 1562 to 1568 | "The 32 values of ... Table S15 ... shipped since rc.8"; where the values sit; what `package:contents` checks | unchecked | `dist/deltat.js` exists in the archive | Values not counted. |
| E-0.1.1-rc.14-04 | 1569 to 1575 | instants outside `EPHEMERIS_SPAN` throw; rc.13's behaviour at year 30,000 | unchecked | name found; figures appear in the folder | Not run. |
| E-0.1.1-rc.14-05 | 1576 to 1584 | `boundMarginArcsec`; DE440s errors (2.7″, 3.4″, 4.6″, 12″ to 22″); the Mars example | unchecked | name found; 1.57 and the timestamp are in `validation.json`; 3.4 and 4.6 are in the packed README | Not traced. |
| E-0.1.1-rc.14-06a | 1585 to 1597 | "at 402 of the 800 solstices ... its margin has the real sign at only 404 of the 800"; "all 7,995 solstices"; `SUN_BOUND_LATITUDE` (0.001°) | supported | `docs/evidence/rc14-20260928/README.md` lines 121 to 125 (402 of the 800; 404), 260 and 368 (7,995); archive `dist/chunk-RETEVD4F.js:122`: `SUN_BOUND_LATITUDE = 1e-3` | Match. The README is the author's; the ERFA script (`sun-solstices.py`) was not re-run. |
| E-0.1.1-rc.14-06b | 1585 to 1597 | 1.09″, 0.008″, ±1.1″ drift, −68.3″ and +25.8″ | unchecked | figures appear in the folder | Not traced. |
| E-0.1.1-rc.14-07 | 1598 to 1601 | `trueObliquity` description; 0.086″ | unchecked | 0.086 is in the packed README | Not re-measured. |
| E-0.1.1-rc.14-08 | 1602 to 1606 | the `separation` examples | unchecked | 0.30000000000000004 appears in the folder README | Not run. |
| E-0.1.1-rc.14-09a | 1607 to 1615 | the old and new label messages | supported | archive `dist/*.js`: rc.14 holds "Body labels must be nonempty, trimmed strings of at most 80 characters, without control characters."; across rc.12 and rc.13 the three strings quoted in the line all occur | The three messages exist as quoted. Which archive holds which old string was not separated. |
| E-0.1.1-rc.14-09b | 1607 to 1615 | the precise rule (UTF-16 units, U+FEFF, C0, C1, U+200B) | unchecked | none | Not run. |
| E-0.1.1-rc.14-10 | 1616 to 1620 | the archive check reads git objects only; what the rc.13 check missed | unchecked | `scripts/verify-archive-binding.mjs` exists | Not exercised. |
| E-0.1.1-rc.14-11 | 1621 to 1625 | "`artifacts/archives.json` records each archive's digest, size, file count and source commit ... rc.11's first packing, allowed only in 00bdae7" | supported | `artifacts/archives.json` on main: every entry has `sha256`, `bytes`, `files`, `sourceCommit`; the superseded rc.11 entry has `onlyInCommit: 00bdae79...`; all carried files' digests and sizes recomputed and equal | Match. The append-only rule is the script's and was not exercised. |
| E-0.1.1-rc.14-12 | 1626 to 1631 | strict semantic versions; `0.1.1-rc.14+evil` refused | unchecked | none | Not exercised. |
| E-0.1.1-rc.14-13 | 1632 to 1635 | `artifacts/` shape rule | unchecked | none | Not exercised. |
| E-0.1.1-rc.14-14 | 1636 to 1637 | receipts checked; nothing missing from HEAD | unchecked | every carried archive on main has its `.sha256` beside it (listing) | Rule not exercised. |
| E-0.1.1-rc.14-15 | 1638 to 1640 | packed files byte-identical to the source commit's | unchecked | none | Not exercised here. |
| E-0.1.1-rc.14-16 | 1641 to 1646 | clean rebuild byte for byte; `--rebuild-all`; CI runs both | unchecked | none | Not run. |
| E-0.1.1-rc.14-17 | 1647 to 1648 | merge with merge commits | unchecked | none | Advice. |
| E-0.1.1-rc.14-18 | 1649 to 1651 | "rc.14 includes main's conformance suite (`conformance/`, not packed)" | supported | `git log`: `8c3d94f Merge main (conformance suite v0) into the rc.14 candidate` between the rc.13 and rc.14 carrying commits; the rc.14 archive has no `conformance/` directory (30 files) | Match. |
| E-0.1.1-rc.14-19 | 1652 to 1655 | TypeDoc canonical URLs; earlier entries name the sdk repository | unchecked | none | Not checked. |
| E-0.1.1-rc.14-20 | 1656 to 1661 | timings (1.72 s vs 0.19 s; 0.47 s vs 0.07 s; 32,045 aspects) | unchecked | figures appear in the folder README; 32,045 in `validation.json` | Not re-timed. |
| E-0.1.1-rc.14-21 | 1663 to 1670 | migration note | unchecked | none | Advice. |

### 0.1.1-rc.13

Heading as written: `## 0.1.1-rc.13 — unreleased candidate` (line 1672).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.13-01 | 1672 | "## 0.1.1-rc.13 — unreleased candidate" | supported | `raw/npm-view-engine.json` lists no 0.1.1-rc.13; no tag or release | Not published. Archive carried in `4eee700` (2026-09-28), source `f05ea02`. No pull request titled for rc.13 was found; its commits are in the history that pull request #10 (rc.14) merged. |
| E-0.1.1-rc.13-02 | 1674 to 1686 | exact binary64 configured aspects and the three worked examples | unchecked | the example numbers appear in `docs/evidence/rc13-20260928/README.md`; `00bdae79` is a commit | Not run. |
| E-0.1.1-rc.13-03 | 1687 to 1689 | exact declination parallels (13.3/12.3, 8.3/7.3, 1.1/0.1) | unchecked | the pairs appear in `exact-oracle.py` | Not run. |
| E-0.1.1-rc.13-04a | 1690 to 1701 | the bracketed correction's figures: "at 402 of the 800 solstices ... by up to 1.09″ ... only 404 of the 800"; exemption "within 0.001° of the ecliptic" | supported | `docs/evidence/rc14-20260928/README.md` lines 121 to 125; rc.14 archive `SUN_BOUND_LATITUDE = 1e-3` | Matches rc.14's record (see 0.1.1-rc.14 row 06a). The bracket is the changelog correcting its own earlier claim that "the Sun defines the bound and so never passes it"; the line as it stands today is accurate, so it is not in the unsupported list (it is named there under lines corrected in place). |
| E-0.1.1-rc.13-04c | 1690 to 1701 | "400 of the 800 ... by up to 1.35″, as at 2024-06-20T20:51Z" | unchecked | 400 and 800 are in `sun-bound-rc13.json`; 1.35 is in the packed rc.13 README | Not traced. |
| E-0.1.1-rc.13-05 | 1702 to 1705 | one body-label rule | unchecked | none | Not run. |
| E-0.1.1-rc.13-06 | 1706 to 1711 | ephemeris failures are `RangeError`s | unchecked | 8.64e15 is in the packed README | Not run. |
| E-0.1.1-rc.13-07 | 1712 to 1718 | the progression documentation; the PDF's SHA-256; 4.73 s | unchecked | 4.73 is in `validation.json` | Not traced. |
| E-0.1.1-rc.13-08 | 1719 to 1722 | `homepage`; packed-consumer check details | unchecked | none | Not checked. |
| E-0.1.1-rc.13-09a | 1723 to 1730 | "The first rc.11 archive, packed at 00bdae79 (SHA-256 `13d637db…`, 70,676 bytes), was superseded before merge and never released; the rc.11 archive is `d88e0ff8…`" | supported | `artifacts/archives.json`: superseded entry `13d637db21e3...`, 70,676 bytes, `onlyInCommit` `00bdae79...`; carried entry `d88e0ff8db91...`; the file on main hashes to `d88e0ff8...`; npm lists no rc.11 | Match. |
| E-0.1.1-rc.13-09b | 1723 to 1730 | CI on Node 20, 22 and 24 runs `archive:binding` | unchecked | none | Workflow at `f05ea02` not opened. |
| E-0.1.1-rc.13-10 | 1732 to 1741 | migration note and its examples (2⁻⁴⁴°, 200,000 pairs) | unchecked | 200,000 appears in the README | Not run. |

### 0.1.1-rc.12

Heading as written: `## 0.1.1-rc.12 — unreleased candidate` (line 1743).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.12-01 | 1743 | "## 0.1.1-rc.12 — unreleased candidate" | supported | `raw/npm-view-engine.json` lists no 0.1.1-rc.12; no tag or release | Not published. Archive carried (`a1d0f2c`); pull request #8 merged. |
| E-0.1.1-rc.12-02 | 1745 to 1748 | "Export `PROGRESSION_DAYS_PER_YEAR`, `progressedInstant` and `progressedBodies`" | supported | all three names found in the 0.1.1-rc.12 archive (mechanical search, none missing); 365.2422 appears in the folder | Names present. The mapping's arithmetic was not run. |
| E-0.1.1-rc.12-03 | 1749 to 1751 | accepted input forms; operation order | unchecked | none | Not run. |
| E-0.1.1-rc.12-04 | 1752 to 1755 | twelve position rows; what is not added | unchecked | none | Not run. |
| E-0.1.1-rc.12-05 | 1756 to 1758 | the JPL fixture check and the published example | unchecked | none | Tests not read. |
| E-0.1.1-rc.12-06 | 1760 to 1762 | "this is an unpublished package candidate, not site adoption or npm release" | supported | npm lists no 0.1.1-rc.12; the site's `vendor/` has no rc.12 archive | Match. |

### 0.1.1-rc.11

Heading as written: `## 0.1.1-rc.11` (line 1764).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.11-01 | 1764 | "## 0.1.1-rc.11" (no "unreleased candidate" suffix) | supported | `raw/npm-view-engine.json` lists no 0.1.1-rc.11; no tag or release; `artifacts/archives.json` carries it (source `be3585b`) with a superseded first packing | The heading claims no publication, and none exists. Its own last line says "not an npm publication". The missing suffix is an inconsistency of style with the entries around it, noted in the inventory. |
| E-0.1.1-rc.11-02 | 1766 to 1769 | `createAspectPolicy` and `findConfiguredAspects` added | supported | both names are in the 0.1.1-rc.11 archive's `dist/` | Present. Behaviour not run. |
| E-0.1.1-rc.11-03 | 1770 to 1775 | the review repair; `docs/evidence/rc11-20260928/decimal-orb-repair/` | unchecked | the folder exists | Not run. |
| E-0.1.1-rc.11-04 | 1776 to 1780 | `chartDeclinations(natal)` added | supported | name in the archive | Present. Its definition was not traced. |
| E-0.1.1-rc.11-05 | 1781 to 1783 | `eclipticToEquatorial`, `declinationsForBodies`, `declinationOf`, `declinationOrb`, `findDeclinationAspects` | supported | all five names in the archive | Present. |
| E-0.1.1-rc.11-06 | 1784 to 1787 | evidence location; what the checks do not establish | unchecked | `docs/evidence/rc11-20260928/` exists | A limitation statement. |
| E-0.1.1-rc.11-07 | 1789 to 1792 | "This is a review candidate, not an npm publication" | supported | npm lists no 0.1.1-rc.11 | Match. The rest of the migration note is unchecked advice. |

### 0.1.1-rc.10

Heading as written: `## 0.1.1-rc.10` (line 1794).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.10-08 | 1794 | "## 0.1.1-rc.10" | supported | npm lists no 0.1.1-rc.10; archive carried (source `9c4f3fd`); the site vendors the same bytes (`vendor/zodiacs-engine-0.1.1-rc.10.tgz`, SHA-256 `a377cdc8...`) | Not published; no claim of publication. |
| E-0.1.1-rc.10-09 | 1796 to 1801 | a thirteenth house system `"equal-mc"`, `equalMcCusps` | supported | both strings in the rc.10 archive; `equalMcCusps` absent from rc.9's `index.d.ts` | Present and new. Receipt behaviour not run. |
| E-0.1.1-rc.10-10 | 1802 | `chartPoints(natal)` | supported | name in the rc.10 archive | Present. |
| E-0.1.1-rc.10-11 | 1803 to 1805 | Mean Node definition (Simon et al. 1994) | unchecked | none | Not traced. |
| E-0.1.1-rc.10-12 | 1806 to 1808 | Black Moon Lilith definition; 5.15° | unchecked | none | Not traced. |
| E-0.1.1-rc.10-13 | 1809 to 1810 | within 0.7″ of Swiss every 3.7 days | unchecked | 0.7 is in the packed README | Swiss output is not in the repository. |
| E-0.1.1-rc.10-14 | 1811 to 1813 | `vertexOf` and `eastPointOf` compute the Vertex and East Point | supported | both names are in the rc.10 archive | Present. The accuracy sentence is row 14b. |
| E-0.1.1-rc.10-14b | 1811 to 1813 | "Given the same sidereal time, latitude and obliquity they agree with Swiss's to within 0.00001″" | not supported | `docs/evidence/1.1.0-rc.2-20261102/f89/PREREGISTRATION.md` line 231: the "Vertex differs by 0.000014″ at the near-degenerate case 1852-03-19T05:35:26.734Z"; line 309: "the old bound fails on it"; CHANGELOG lines 83 to 87 (1.1.0-rc.2): the README "no longer says" this | The project's own F-89 record has a case at 0.000014″, above the 0.00001″ stated. The README was corrected in 1.1.0-rc.2; this rc.10 changelog line was left as written. |
| E-0.1.1-rc.10-15 | 1814 to 1816 | the seven lots; `sectOf` | unchecked | `sectOf` in the archive | Not traced. |
| E-0.1.1-rc.10-16 | 1817 | `antiscion`, `contraAntiscion` and `midpoint` | supported | names in the archive | Present. |
| E-0.1.1-rc.10-17 | 1818 to 1819 | osculating Lilith left out; 198″ median, up to 683″ | unchecked | 198 appears in an rc.11 chunk comment | Swiss output is not in the repository. |
| E-0.1.1-rc.10-18 | 1821 to 1823 | migration note | unchecked | none | Advice. |

### 0.1.1-rc.9

Heading as written: `## 0.1.1-rc.9` (line 1825).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.9-19 | 1825 | "## 0.1.1-rc.9" | supported | npm lists no 0.1.1-rc.9; archive carried (source `82aad2f`) | Not published; no claim of publication. |
| E-0.1.1-rc.9-20a | 1827 to 1833 | "Nine more house systems, for twelve" (the nine named) | supported | the nine `*Cusps` functions are in the rc.9 archive's `dist/` | Present. |
| E-0.1.1-rc.9-20b | 1827 to 1833 | agreement with Swiss's `swe_houses_armc` to within 0.0001″ over 20,000 cases; Placidus to 0.0096″ | unchecked | 0.0096 appears in a site README; 0.0001 in the packed README | Swiss output is not in the repository. |
| E-0.1.1-rc.9-21 | 1834 to 1840 | `POLAR_FALLBACK`, `POLAR_UNDEFINED_HOUSE_SYSTEMS`; `PLACIDUS_POLAR_FALLBACK` stays | supported | the three names are in the rc.9 archive | Present. Polar behaviour not run. |
| E-0.1.1-rc.9-22 | 1841 to 1848 | each system exported as a function and through `computeHouses`; `src/house-systems.test.ts` | supported | names in the archive; the test file exists | Present. Test contents not read. |
| E-0.1.1-rc.9-23 | 1849 to 1855 | receipt checks per system | unchecked | none | Not run. |
| E-0.1.1-rc.9-24 | 1857 to 1859 | migration note | unchecked | none | Advice. |

### 0.1.1-rc.8

Heading as written: `## 0.1.1-rc.8` (line 1861).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.8-25 | 1861 | "## 0.1.1-rc.8" | supported | npm lists no 0.1.1-rc.8; archive carried (source `352ea49`) | Not published; no claim of publication. |
| E-0.1.1-rc.8-26a | 1863 to 1870 | "`@zodiacs/engine/deltat` exports the model"; model name `zodiacs-deltat/1` | supported | packed exports of rc.8 include `./deltat` (rc.7's do not); the string `zodiacs-deltat/1` is in the rc.8 `dist/` | Present. |
| E-0.1.1-rc.8-26b | 1863 to 1870 | the ΔT figures (75.50 s to 69.20 s; 3.4″; 78.9 ± 42.4 s; 202.7 s) and sources | unchecked | 75.50, 69.20 and 3.4 appear in a site README | Not re-measured. |
| E-0.1.1-rc.8-27a | 1871 to 1877 | "astronomy-engine 2.1.19, now an exact dependency pin" | supported | packed `package.json`: rc.7 `"astronomy-engine": "^2.1.19"`; rc.8 `"2.1.19"` | Match. |
| E-0.1.1-rc.8-27b | 1871 to 1877 | receipts record ΔT; conventions wording; rc.3 to rc.7 receipts still parse | unchecked | none | Not run. |
| E-0.1.1-rc.8-28 | 1878 to 1879 | `REFERENCE_SPAN` and the `outside-reference-span` flag | supported | both strings in the rc.8 archive | Present. The dates were not run. |
| E-0.1.1-rc.8-29 | 1880 to 1884 | `@zodiacs/engine/crossings` with `findLongitudeCrossingsWith` and `searchLongitudeCrossingsWith` | supported | packed exports of rc.8 include `./crossings`; both names in `dist/` | Present. "import no ephemeris" not traced. |
| E-0.1.1-rc.8-30 | 1885 to 1887 | window is (from, to] | unchecked | none | Not run. |
| E-0.1.1-rc.8-31 | 1888 to 1890 | station between samples; three passes | unchecked | none | Not run. |
| E-0.1.1-rc.8-32 | 1891 to 1895 | no sample budget; 95 crossings, 13; `maxSamples` and `refused` | unchecked | `maxSamples` and `refused` in the archive | Not run. |
| E-0.1.1-rc.8-33 | 1897 to 1903 | migration note | unchecked | none | Advice. |

### 0.1.1-rc.7

Heading as written: `## 0.1.1-rc.7` (line 1905).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.7-34 | 1905 | "## 0.1.1-rc.7" | supported | npm lists no 0.1.1-rc.7; archive carried (source `6e14f3f`); pull requests #1 and #2 merged | Not published; no claim of publication. |
| E-0.1.1-rc.7-35 | 1907 to 1910 | `aspectMotion`, `AspectMotion`, `STATIONARY_RELATIVE_SPEED` exported | supported | names in the rc.7 archive | Present. The old rule's 14.4 minutes not checked. |
| E-0.1.1-rc.7-36 | 1911 to 1914 | speeds over ±0.001 day; 7.55″ to 0.0015″ a day | unchecked | none | Not re-measured. |
| E-0.1.1-rc.7-37 | 1915 to 1918 | angles on the true obliquity; ERFA figures (506.8″ to 6.36″ and the rest) | unchecked | 506.8, 6.36, 2.25, 0.20 appear in a site README | Not re-measured. |
| E-0.1.1-rc.7-38 | 1919 to 1921 | Placidus limit 66.53° to 66.59° | unchecked | figures appear in a site README | Not run. |
| E-0.1.1-rc.7-39 | 1922 to 1925 | `houseSystem: "porphyry"`; `PLACIDUS_POLAR_FALLBACK`; `fallbackSystem` | supported | the three strings are in the rc.7 archive | Present. |
| E-0.1.1-rc.7-40 | 1926 to 1930 | `CONVENTIONS_RC3`; `NATAL_RECEIPT_CONVENTION_SETS` | supported | both names in the rc.7 archive | Present. Acceptance rules not run. |
| E-0.1.1-rc.7-41 | 1932 to 1934 | migration note | unchecked | none | Advice. |

### 0.1.1-rc.6

Heading as written: `## 0.1.1-rc.6 — unreleased candidate` (line 1936).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.6-01 | 1936 | "## 0.1.1-rc.6 — unreleased candidate" | supported | npm lists no 0.1.1-rc.6; the engine repository carries no archive; the site vendors one (`vendor/zodiacs-engine-0.1.1-rc.6.tgz`, 36,591 bytes, SHA-256 `09c3e634...`) whose `package.json` says 0.1.1-rc.6 | Not published. The entry predates this repository's pull requests. |
| E-0.1.1-rc.6-02 | 1938 to 1941 | complete civil timestamp comparison | unchecked | none | Behaviour of the rc.6 code, not run. |
| E-0.1.1-rc.6-03 | 1942 to 1944 | offset conversion to integer milliseconds | unchecked | none | Not run. |
| E-0.1.1-rc.6-04 | 1945 to 1947 | guards retained; limitation statement | unchecked | none | Not run. |
| E-0.1.1-rc.6-05a | 1949 to 1953 | "The explicit merge/publication hold and required review on pull request #5 of that repository remain" | supported | `gh api repos/zodiacs-org/sdk/pulls/5`: open, draft, not merged, "WS7: engine and widgets packages (pending adversarial review)" | Still open and unmerged on 13 November 2026. |
| E-0.1.1-rc.6-05b | 1949 to 1953 | receipts immutable; what is unchanged | unchecked | none | Not diffed. |

### 0.1.1-rc.5

Heading as written: `## 0.1.1-rc.5 — unreleased candidate` (line 1955).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.5-06 | 1955 | "## 0.1.1-rc.5 — unreleased candidate" | supported | npm lists no 0.1.1-rc.5; the site vendors `zodiacs-engine-0.1.1-rc.5.tgz` (36,065 bytes, SHA-256 `1809c168...`), `package.json` version 0.1.1-rc.5 | Not published. |
| E-0.1.1-rc.5-07 | 1957 to 1959 | five typed birth flags | unchecked | none | Not run. |
| E-0.1.1-rc.5-08 | 1960 to 1962 | claims rejected; 64 raw entries | unchecked | none | Not run. |
| E-0.1.1-rc.5-09 | 1963 to 1965 | chart flag consistency | unchecked | none | Not run. |
| E-0.1.1-rc.5-10 | 1966 to 1969 | settings captured once | unchecked | none | Not run. |
| E-0.1.1-rc.5-11 | 1971 to 1977 | migration note; hold on sdk pull request #5 | unchecked | see 05a for the hold | The hold is confirmed in 05a; the rest is advice. |

### 0.1.1-rc.4

Heading as written: `## 0.1.1-rc.4 — unreleased candidate` (line 1979).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.4-12 | 1979 | "## 0.1.1-rc.4 — unreleased candidate" | unchecked | npm lists no 0.1.1-rc.4 | No archive of 0.1.1-rc.4 was found in either repository (the engine's `artifacts/` starts at rc.7; the site's `vendor/` has rc.0, rc.1, rc.5, rc.6 and later). Unpublished is confirmed; that the candidate existed as a build could not be checked. |
| E-0.1.1-rc.4-13 | 1981 to 1983 | GeoNames client validation | unchecked | none | No rc.4 archive to inspect. |
| E-0.1.1-rc.4-14 | 1984 to 1987 | table index and coordinate checks | unchecked | none | No rc.4 archive. |
| E-0.1.1-rc.4-15 | 1988 to 1990 | `preload()` snapshots | unchecked | none | No rc.4 archive. |
| E-0.1.1-rc.4-16 | 1991 to 1993 | limitation statement | unchecked | none | No rc.4 archive. |
| E-0.1.1-rc.4-17 | 1995 to 1999 | site rc.1 and starter rc.3 pins; hold on sdk pull request #5; "not npm publication" | unchecked | npm lists no rc.4; sdk #5 still open | Unpublished confirmed; pins at the time not looked up. |

### 0.1.1-rc.3

Heading as written: `## 0.1.1-rc.3 — unreleased candidate` (line 2001).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.3-18 | 2001 | "## 0.1.1-rc.3 — unreleased candidate" | unchecked | npm lists no 0.1.1-rc.3 | No archive found in either repository. |
| E-0.1.1-rc.3-19 | 2003 to 2008 | draft natal receipt entry point | unchecked | the rc.5 archive (the next one available) exports `./receipt`; rc.1's does not | Consistent with a receipt entry arriving between rc.1 and rc.5; rc.3 itself cannot be inspected. |
| E-0.1.1-rc.3-20 | 2009 to 2011 | parser rejections | unchecked | none | No rc.3 archive. |
| E-0.1.1-rc.3-21 | 2012 to 2013 | site and starter retain rc.1; publication gates | unchecked | none | Not looked up. |

### 0.1.1-rc.2

Heading as written: `## 0.1.1-rc.2 — unreleased candidate` (line 2015).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.2-22 | 2015 | "## 0.1.1-rc.2 — unreleased candidate" | unchecked | npm lists no 0.1.1-rc.2 | No archive found in either repository. |
| E-0.1.1-rc.2-23 | 2017 to 2018 | GeoNames retry | unchecked | none | No rc.2 archive. |
| E-0.1.1-rc.2-24 | 2019 to 2020 | in-flight requests preserved | unchecked | none | No rc.2 archive. |
| E-0.1.1-rc.2-25 | 2021 to 2022 | limitation; site and starter retain rc.1 | unchecked | none | No rc.2 archive. |
| E-0.1.1-rc.2-26 | 2024 to 2027 | geo client only; hold on sdk #5 | unchecked | sdk #5 still open | See 05a. |

### 0.1.1-rc.1

Heading as written: `## 0.1.1-rc.1 — unreleased candidate` (line 2029).

| ID | Lines | Claim | Status | Evidence opened | What it shows, or why unchecked |
| --- | --- | --- | --- | --- | --- |
| E-0.1.1-rc.1-27 | 2029 | "## 0.1.1-rc.1 — unreleased candidate" | supported | npm lists no 0.1.1-rc.1; the site vendors `zodiacs-engine-0.1.1-rc.1.tgz` (21,374 bytes, SHA-256 `f95c887d...`), `package.json` version 0.1.1-rc.1; the site's `public/sdk/engine/media/CHANGELOG.md` is a copy of this entry (see the site report) | Not published. |
| E-0.1.1-rc.1-28 | 2031 to 2032 | polar ascendant corrected | unchecked | none | Not run. |
| E-0.1.1-rc.1-29 | 2033 to 2034 | "allow up to 64 iterations" | supported | the rc.1 archive's `dist/chunk-ATHPYVIF.js` has a loop bound `< 64` | A 64-step bound is in the code. Convergence criterion and the 66-degree limit not traced. |
| E-0.1.1-rc.1-30 | 2035 to 2037 | input rejections | unchecked | none | Not run. |
| E-0.1.1-rc.1-31 | 2038 | public contract regressions; packed-consumer check | unchecked | none | Tests are not in the archive. |
| E-0.1.1-rc.1-32 | 2039 | crossing work bounded | unchecked | none | Not run. |
| E-0.1.1-rc.1-33 | 2040 | exact coarse-sample crossing once | unchecked | none | Not run. |
| E-0.1.1-rc.1-34 | 2041 to 2042 | years below 100 preserved | unchecked | none | Not run. |
| E-0.1.1-rc.1-35 | 2044 to 2048 | migration note | unchecked | none | Advice. |
| E-0.1.1-rc.1-36 | 2050 to 2052 | "Release holds remain in pull request #5 of that repository. This entry records implementation, not publication" | supported | sdk #5 open, draft, unmerged; npm lists no 0.1.1-rc.1 | Match. |
