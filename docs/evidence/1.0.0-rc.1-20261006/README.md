# 1.0.0-rc.1 checks, 2026-10-06

1.0.0-rc.1 is the first candidate for 1.0.0, on rc.17 as main has it at
`782b496` (the merge of zodiacs-org/engine#26). 1.0 is a promise about the
API rather than new calculations: from 1.0.0 the package follows Semantic
Versioning, as `docs/versioning.md` sets out. The candidate is seven commits
on that base:

1. `f0d66d5`, *Add the public API report, its CI check and the versioning
   policy*: `api/`, which `scripts/api-report.mjs` writes from the build's
   declarations and `npm run api:check` compares in CI, and
   `docs/versioning.md`. Its `api/` is rc.17's API, so that the next commit's
   diff of `api/` is what the reviews changed;
2. `bfcf354`, *Act on the three API reviews before 1.0*;
3. `d57eb2c`, *Check calendarNote's arguments, and raise ./geo's budget for
   it*;
4. `2aa59f6`, *Compute a caller's ayanamsa from any epoch in EPHEMERIS_SPAN
   (F-80)*, whose own checks, against ERFA, are in
   `../calc-epochs-2026-10-06/`;
5. `597a216`, *Act on the independent review of the 1.0 commits*;
6. `f9428a2`, *Act on the two reviews of the 1.0 candidate*: the reviews'
   findings in the code and the guides (*Reviews*);
7. the source commit of this candidate, which brought this directory: the
   version, the generated records that carry it, the CHANGELOG, the README,
   the package's raised cap and these checks (*The source commit*).

Three commits follow it: `bb1736a` carries the archive packed from it (*The
archive*); `4b11350` brings the packed-consumer check's own TypeScript to
1.0's window types, which it had kept from rc.17 and on which it failed on
the carrier (*The gates on the carrier*); and the commit that brings this
version of this file records the gates on those two.

This directory records what the candidate as a whole was checked for. Every
figure below is read from a file in this directory or in the one it names,
but the reviews' findings (*Reviews*), which are their reports'. Local paths
in the outputs are shortened to `<checkout>`, `<tmp>` and `<scratch>`, and in
the carrier's logs to `<clone>`.

## The source commit

- Version 1.0.0-rc.1: `package.json`, `package-lock.json`, `ENGINE_VERSION`
  (`src/types.ts`) and TypeDoc's title (`typedoc.json`). The two tests that
  pin the version a new receipt records (`src/receipt-nutation.test.ts`,
  `src/receipt-time-basis.test.ts`) read 1.0.0-rc.1. TypeDoc's entry points
  gain `src/crossings.ts` and `src/deltat.ts`, so that its reference covers
  the twelve public entry points (`typedoc.log`).
- Generated again on this tree: `src/fixtures/calc-roundtrip.json`, whose 30
  lines that name the engine's version change and nothing else (27 receipts'
  `version` and three charts' `engineVersion`; `node
  scripts/build-calc-roundtrip.mjs`); and the conformance results
  (*Conformance*).
- `CHANGELOG.md` gains the 1.0.0-rc.1 entry: the policy, the API report, the
  experimental tier, F-80, what is new, a fix, every breaking change with
  what a caller does about it, the deprecations, the sizes and three
  corrections. `README.md` describes this candidate, names
  `docs/versioning.md` and `api/`, and says that Node.js 20 has reached its
  end of life; it says what npm carries, as `npm-view.txt` records it on
  2026-10-06: rc.14 to rc.16, `latest` rc.15 and `next` rc.16, and not this
  candidate.
- `LICENSING.md` lists `src/fixtures/ayanamsa-epochs.json` among the test
  fixtures of values computed with ERFA, and names
  `../calc-epochs-2026-10-06/` beside `../calc-sidereal-2026-10-05/` as the
  measurements behind calc's ayanamsa bounds, which `2aa59f6` had left out.
- `scripts/verify-package-contents.mjs`: the package's cap is raised from
  950,000 to 1,000,000 bytes, with the owner's approval of 2026-10-06 and its
  reason beside it (*Sizes and budgets*); the budgets' preamble names
  `./geo`'s raise in `d57eb2c`, and the comments beside the budgets of
  `./calc`, `./crossings`, `./geo` and `./vedic` give this build's sizes.

## Reviews

Six reviews read this candidate, AI-assisted, each in its own copy of the
checkout; their probes are not in the repository. Every finding was acted on,
by the commit named for it.

1. Three reviews read every public declaration of the twelve entry points at
   `782b496`, as `f0d66d5`'s `api/` gives them, against a draft of
   `docs/versioning.md`, for what should not be frozen as it stood: one the
   root, `./crossings`, `./deltat` and `./houses`; one `./calc`,
   `./receipt`, `./geo`, `./sky` and `./window`; and one `./techniques`,
   `./timing` and `./vedic`. Their 41 findings (13, 14 and 14) each proposed
   an action: a breaking fix (15), an addition (10), a deprecation (3),
   documentation (11), or none (2). `bfcf354` acted on them. It left two
   items that would have taken an entry over its size budget: the crossings
   entry still takes only Dates (the root's two crossing functions take any
   `DateInput`), and `calendarNote`'s checks, which `d57eb2c` added once the
   owner had raised `./geo`'s budget.
2. A fourth review read `f0d66d5` and `bfcf354`. It found no calculated value
   changed, in a differential run of 1,713 cases on the two builds, and no
   regression in reading or writing receipts, and twelve findings. One
   blocked a merge: the packed files had changed while the version was still
   rc.17, so CI's archive check, which rebuilds HEAD's version from HEAD,
   would fail; and the CHANGELOG had no entry. This source commit answers
   both, with a new version and archive and the 1.0.0-rc.1 entry. `597a216`
   acted on the other ten: `./calc`'s receipts get a new schema id rather
   than reuse rc.16's for a different request vocabulary; the API report
   keeps the release tags of members and of exports under another name,
   follows `import("…")` types and prints a diff when its check fails;
   experimental tags no longer hide the descriptions they were added to, and
   package names in comments no longer read as tags; each guide names its
   experimental parts; `TZDB`'s version and digest are typed as strings;
   `declareSiderealLongitude` reads its declaration strictly; the crossing
   searches refuse what the shared options reader refuses; and the
   documentation errors it listed.
3. Two more read `d57eb2c`, `2aa59f6` and `597a216` and this source commit's
   changes before they were committed: one the code, one the record.
   - The review of the code found nothing that blocked a merge and no
     calculated value that moved but F-80's: calc's four functions over
     4,959 requests, `calendarNote` over 33,756,088 valid inputs and
     `resolveLocalBirth` over 15,200, against rc.17's. It rebuilt the F-80
     evidence byte for byte, found each new band the largest measured
     difference rounded up to two significant figures, ran a denser grid of
     its own, 10,374 calls, within the bands, and found the band and the
     refusal changing correctly at every edge; five of six mutations of the
     code failed the tests. Of its three findings to fix, `f9428a2` acts on
     each: `docs/calc.md` gave the refusals' order wrongly, and no test held
     it (the table is in the code's order, and a test now holds it);
     `docs/versioning.md` promised a `RangeError` where many functions throw
     a `TypeError` for an argument of the wrong type, as rc.17's did, and
     gave calc's results string instants where `chart()` carries the root's
     `Chart`, with Dates (both rewritten); and a Julian date late in 9999
     that resolves into the Gregorian year 10000 got no calendar note, in
     rc.17 too (fixed, with a test). Its smaller points: wording in
     `docs/calc.md`, stale headers of the F-80 tools, `calendarNote`'s
     unchecked country (now checked), a misplaced sentence in
     `docs/techniques.md`, and comments the API report would have taken from
     beside a declaration's tokens, with a namespace member's release tags
     dropped (latent, as the report has neither; fixed, with a test) in
     `f9428a2`; and sizes recorded before the last edits, measured again
     here.
   - The review of the record reproduced `results/` byte for byte and found
     nothing the comparison's rewriting hides, in stricter runs of its own:
     Dates told from strings, `undefined` values and class instances
     tagged, 507 more calls at instants outside 1800 to 2200, envelopes
     with local-time contexts, and 936 stored rc.17 calc requests passed
     back after the two renames, each giving the same result. Its one
     finding that blocked a merge: eight changes to declarations were
     breaking for TypeScript code and not in the CHANGELOG (readonly members
     of `AspectDefinition`, `SignDefinition` and four input types, and a
     receipt's conventions and coverage typed as strings); the CHANGELOG now
     lists them, and this directory's own comparison of the two releases'
     declarations, rc.17's written by the same script, finds no change it
     does not list. Its other findings, acted on here or in `f9428a2`: the
     policy's promises on error classes, records a minor release adds,
     tables of a union's members and the calc receipt's history; a battery
     call that never ran (`dashaSubperiods`) and paths it left out, now
     called; the CHANGELOG's account of `ZoneHistoryNotLoadedError`, ΔT,
     `davisonPlace`, `ASPECT_BODIES`, the options refused, the frozen
     results and the headroom, and the migration's count and steps; a
     `typedoc.log` written before the last edits; a place type that offered
     a height `houses()` and `chart()` refuse (now `CalcLocation`); Node.js
     20's end of life; and the README's wording, `values-compare.mjs`'s
     argument order, and TypeDoc's two missing entry points.

## What did not change

`tools/values.mjs` runs one battery of calls over the public functions of the
twelve entry points, with synthetic inputs, instants generated from 1801 to
2199 and places on a grid, that rc.17 and this candidate both accept, and
prints each call's result with every number exact (−0, NaN and the
infinities by name). It ran on the carried rc.17 archive,
`artifacts/zodiacs-engine-0.1.1-rc.17.tgz` (SHA-256 `9cd24c78…`), unpacked,
and on this tree's build, each in its own process, because each installs its
ΔT model in astronomy-engine. Where 1.0.0-rc.1 renamed something, the
battery writes rc.17's calls in rc.17's vocabulary (calc's capital scales,
houses()' `system`) and rc.17's calc receipts' requests in 1.0.0-rc.1's, and
it writes the engine's version and the calc receipt's schema id, in a result
or inside a serialized record, as placeholders; nothing else is rewritten.
`tools/values-compare.mjs` compares the two runs call by call
(`results/values-compare.txt`), as values with every number exact and then
as text:

- 6,411 calls on both, under 347 labels: natal charts in every house system
  at six places from 45.5° S to 68.5° N, on each time scale and with a fixed
  ΔT, transits, synastry, progressions, Saturn returns, aspects and aspect
  policies, declinations with a caller's orbs, the crossing searches with
  their steps and sample budgets, ΔT, angles, the thirteen house systems'
  cusps and the root's other functions; `./calc`'s `calc()` for every body
  and frame at six instants (a Date, an ISO string, a pinned ΔT, and a
  Julian date on each scale), every center and correction, radians, the nine
  ayanamsas and a caller's, `houses()` in every system at six places,
  `chart()` and `events()` with its steps and a sample budget; `./crossings`
  over a synthetic longitude; `./deltat` over 800,000 days either side of
  J2000.0; `./geo`'s zone offsets, local times (with daylight-saving gaps and
  folds and a Julian date), calendar notes and conversions; `./houses`;
  `./receipt`'s envelopes, eleven of them with a local resolution, local mean
  time, provenance, or a chart on TT, UT1, a pinned ΔT or at 80.5° N; `./sky`'s
  events and planetary hours for four observers, and sample budgets;
  `./techniques`, `./timing`, `./vedic` (each dasha on each year length, a
  chart in a caller's ayanamsa) and `./window`, with their options; and charts,
  positions, ayanamsas and the void-of-course Moon at four instants from 1650
  to 3500, which calc refuses. Every public function is called at least once
  but `createGeoNamesClient`, whose client makes network requests.
- 6,372 give the same result, to the bit, with their keys in the same order.
  Each of the 39 that differ is a change the CHANGELOG lists: three of a
  caller's ayanamsa from an epoch in 763 (JD 2,000,000.5), refused
  `out-of-range` by rc.17 and computed now (F-80); two `moonSignCandidates`
  calls before a zone's history is loaded, which throw a
  `ZoneHistoryNotLoadedError` where rc.17 threw an `Error`, with the same
  message; and the 34 calls of the battery's last section, which makes each
  listed change of behaviour once on both releases: a capital scale and
  houses()' `system` in calc; a ΔT for a UT that is not finite (two);
  `davisonPlace`'s place and convention; `calendarNote`'s date, calendar and
  country; an unknown option of `ayanamsa`, `userAyanamsa`,
  `vimshottariDasha`, `declareSiderealLongitude` and a crossing search;
  `userAyanamsa`'s bare-number epoch; a planetary day refused for its sample
  budget, which now carries its reason; the root's crossing finders given a
  window's ends as a string and as a number, which rc.17 refused; a Julian
  date late in 9999, which now has its calendar note; `ASPECT_BODIES`, which
  the engine no longer reads; and fourteen values now frozen, the twelve
  tables, `signForLongitude`'s result and `matchAspect`'s definition.
- Six calls are this candidate's only: the constants it adds, `SIGN_SLUGS`,
  `ASPECT_POLICY_SCHEMA`, `CONFIGURED_ASPECTS_SCHEMA`, `DELTA_T_IERS_MODEL`,
  `SIDEREAL_TIME_RATE` and `BIRTH_WINDOW_SCHEMA`.

The two runs' outputs, 11,255,320 bytes (SHA-256 `6d61ffbf…`) on rc.17 and
11,258,378 bytes (`63bd60bf…`) on this tree, are not committed: each
rebuilds in a few seconds, byte for byte the same.

Records: `tools/receipts-cross.mjs` reads each release's 30 serialized natal
envelopes from the battery with the other release's codec
(`results/receipts-cross.txt`). Each release accepts all 30 of the other's,
and for each the record it reads back is the one the writer's own codec
reads. As a control (`--tamper`), each of the 19 envelopes that names
Placidus is changed to name Porphyry, and each release refuses all 19 of the
other's, `inconsistent_result`.

The calc entry's round-trip fixture: `tools/roundtrip-compare.mjs` compares
rc.17's `src/fixtures/calc-roundtrip.json` with this tree's, case by case,
after writing rc.17's in 1.0.0-rc.1's vocabulary
(`results/roundtrip-compare.txt`). 36 of rc.17's 37 cases are the same; case
29, a caller's ayanamsa from an epoch in 763, refused `out-of-range` in
rc.17, is computed (F-80); and case 37, from JD 1,000,000.5, is new and
refused `epoch-out-of-range`.

The techniques' site-parity fixtures (`src/techniques/fixtures/site-parity/`)
were generated on rc.16's packed build and say so (`meta.engine`); they are
unchanged since rc.17, and the parity test passes on this tree against them.

## Declarations

`tools/api-diff.mjs` writes rc.17's public declarations with this checkout's
`scripts/api-report.mjs`, from the carried rc.17 archive unpacked, and diffs
them with `api/`, entry point by entry point (`results/api-diff.txt`).
`./deltat`'s are unchanged. Every other difference is a change the
CHANGELOG's entry lists: the tables, definitions and inputs now readonly, the
types widened to `string`, `number` or a record of strings, `| undefined` on
options, the new names and release tags, calc's lower-case scales,
`houseSystem`, `CalcLocation`, new refusal and schema id, the crossing
searches' type parameter and the root's `DateInput` window ends, the
receipt's record types, the sky's refused day, the window's readonly results,
and the Vedic entry's `epoch`, which no longer takes a number.

## Conformance

`conformance/results/zodiacs-engine.json` was regenerated on this tree with
adapter 0.2.0, then `RESULTS.md` and `results/summary.json`, and
`results/zodiacs-engine.notes.md` names this release. Totals: 267 pass, 192
fail, 41 unsupported, 0 error of 500, as rc.17's. `conformance-changes.json`
(`../rc15-20260929/conformance-changes.mjs`, against rc.17's committed
results) finds no verdict that moves and no residual statistic that changes:
the files differ in the engine version alone.

## Birth data

The rule is `CONTRIBUTING.md`'s: synthetic data, or a published worked
example about a person who has died, cited where it is used with author,
title, year and page; never a living person's. Every added line of every
commit on this branch was checked with rc.16's two tools
(`../rc16-20260930/README.md`, *Birth data*).

1. `../rc15-20260929/rebuilt/history-check.mjs`, unchanged, with rc.16's
   patterns and examples, which are kept outside the repository because they
   are the birth data it looks for. `history-check.txt` is its output on
   `782b496..4b11350`, the nine commits up to the packed consumer's fix,
   with the changes of the commit that brings this version of this file
   staged: no birth data in any commit (the carried archive decompressed and
   read), in the staged changes or in the tree of `4b11350`, and the
   published examples' birth data only in files that cite them. It was run
   again once every change of that commit, this file and that output
   included, was staged, and gave the same output. The source commit held
   the same check on the six commits before it and its own changes, and the
   carrier on the seven before it and its own, with the same result. rc.16's
   positive controls
   (`../rc16-20260930/history-check-control-first-cut.txt` and
   `history-check-control-recut.txt`) show the same patterns finding birth
   data in histories that held it.
2. The broad review aid, run outside the repository because its output holds
   the lines it matches, listed every added line with a year from 1700 to
   2029 beside birth vocabulary or a capitalized pair of words, and every
   such pair, commit by commit and for the staged changes: 20 lines in the
   nine commits up to `4b11350` and the staged changes, all of them in the
   source commit, each read, the same 20 that the source commit's run found
   in its own staged changes. They hold the conformance notes'
   statistics, this record's own description of the aid and of the
   comparison's inputs, the names of tests in the suite's logs (the clock of
   a birthplace at each change of three zones' histories, named for the
   zones' cities), the published worked examples that `history-check.txt`
   lists with their citations, Great Britain's adoption of the New Style in
   the comparison's calendar notes, a dasha's start at one of the
   comparison's generated instants, and the comment on its Julian date; no
   person's birth data.

The comparison's inputs are synthetic: its instants are generated from 1801
to 2199, and its few written dates are facts about calendars and zones (the
daylight-saving changes of 2021 in three zones, Russia's first New Style
day) or a date of no one (a Julian date in 1740), none with a person's name.

No commit adds a person's birth data.

## Sizes and budgets

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried rc.17
archive, with the budgets of its source commit `aae419c`, and this tree:

| Entry | rc.17 | 1.0.0-rc.1 | 1.0.0-rc.1 beyond the root's graph | Budget | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.` | 103,537 (34,822) | 105,365 (35,327) |  | 108,500 | 2.97 % |
| `./calc` | 139,836 (45,927) | 144,694 (47,419) | 65,122 (20,198) | 145,500 | 0.55 % |
| `./crossings` | 9,410 (2,768) | 9,942 (2,964) | 173 (106) | 10,000 | 0.58 % |
| `./deltat` | 4,968 (1,944) | 5,200 (2,028) | 161 (101) | 5,500 | 5.76 % |
| `./geo` | 34,659 (12,953) | 35,375 (13,081) | 32,446 (11,986) | 35,000 → 35,500 | 0.35 % |
| `./houses` | 13,606 (3,503) | 13,678 (3,521) | 13,678 (3,521) | 15,000 | 9.66 % |
| `./internal` | 64,830 (22,568) | 65,720 (22,782) | 305 (160) | 68,000 | 3.46 % |
| `./internal/math` | 18,165 (4,928) | 18,695 (4,989) | 1,325 (445) | 20,000 | 6.98 % |
| `./receipt` | 66,580 (22,373) | 68,825 (22,869) | 43,369 (12,196) | 70,000 | 1.7 % |
| `./sky` | 92,109 (31,255) | 93,566 (31,664) | 16,923 (5,538) | 97,000 | 3.67 % |
| `./techniques` | 152,472 (50,304) | 155,046 (51,127) | 63,589 (20,378) | 160,000 | 3.19 % |
| `./timing` | 123,039 (39,471) | 124,737 (40,182) | 32,608 (9,102) | 129,000 | 3.41 % |
| `./vedic` | 123,639 (41,511) | 127,184 (42,698) | 35,727 (11,949) | 128,000 | 0.64 % |
| `./window` | 102,590 (34,118) | 103,559 (34,368) | 33,756 (10,005) | 105,000 | 1.39 % |

Bytes, with the sum of the graph's files each gzipped at level 9 in
parentheses; headroom is the budget over the 1.0.0-rc.1 size, as a
percentage of the size, rounded down. Every entry grows: the reviews' checks
of inputs and options, the frozen tables and, in `./calc`, a caller's epochs
across `EPHEMERIS_SPAN`. One budget is raised, `./geo`'s, from 35,000 to
35,500, with the owner's approval of 2026-10-06, for
`ZoneHistoryNotLoadedError` and `calendarNote`'s checks (`d57eb2c`, with the
country's check from `f9428a2`); its reason is beside it in
`scripts/verify-package-contents.mjs`. The tightest are `./geo` (0.35 per
cent), `./calc` (0.55), `./crossings` (0.58) and `./vedic` (0.64).

The package is 982,086 bytes unpacked in 74 files, 35,737 more than rc.17's
946,349 in 70: 1,828 bytes (5.12 per cent of the growth) of the root's
JavaScript; 4,607 (12.89) of JavaScript that only the opt-in entry points
load; 13,515 (37.82) of declarations, 4,690 of them those the root's
`index.d.ts` reaches, most of it the documentation of the 1.0 API; 15,683
(43.88) of documents, the CHANGELOG's 1.0.0-rc.1 entry above all; and 104
(0.29) of manifest. The cap is raised from 950,000 to 1,000,000, with the
owner's approval of 2026-10-06 and its reason beside it in
`scripts/verify-package-contents.mjs`; it leaves 1.82 per cent of headroom.
The zone histories are rc.17's, 189,144 bytes in 16 files.

## Gates on the tree

`gates.sh`, rc.17's with the API check that CI now runs, writing here, ran
CI's engine job on the tree of the source commit before it was made, once on
each Node version (`gates.log`, and the suite's output in
`full-tests-<version>.log`):

| Node (npm) | Typecheck | Tests | Build, export smoke, API check, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7) | pass | 3,825 passed in 85 files | pass |
| 20.19.0 (10.8.2) | pass | 3,824 passed, 1 skipped, in 85 files | pass |
| 24.21.0 (11.19.0) | pass | 3,824 passed, 1 skipped, in 85 files | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), which runs only where Node's own time-zone
data is 2025c, as in rc.17. `npm run package:contents` reports 74 files and
982,086 bytes unpacked on each, and `npm run api:check` that the twelve entry
points match `api/`. TypeDoc builds the reference of the twelve entry points
with 0 errors and 2 warnings (`typedoc.log`): `PlanetaryDayBase` and
`SkyWindow`, which `./sky`'s declarations name but do not export, as `api/`
also shows. rc.17's other six warnings named the receipt's conventions sets,
which `./receipt` now declares as types of its own. The archive check reads
commits, so it runs on the commit that carries the archive.

## The archive

`artifacts/zodiacs-engine-1.0.0-rc.1.tgz` is packed from the source commit
`77a16c2` and carried by its child `bb1736a`: SHA-256
`cf1417d40bc2e1726857b17388415a3b588bd53ddd79848c78f8da2675657284`, 284,750
bytes, 74 files, 982,086 bytes unpacked. It was packed once, after every gate
on the tree had passed: clean clones of `77a16c2`, each installed with
`npm ci`, built and packed the same bytes on Node 22.22.2 (npm 10.9.7),
20.19.0 (npm 10.8.2) and 24.21.0 (npm 11.19.0), 74 files each time
(`carrier/pack-source.log`, from `carrier/pack-source.sh`), and the carried
file is the Node 22.22.2 one. The carrier's gates rebuild and repack its
source, as CI does, to the same bytes. `artifacts/archives.json` records it
with its source commit, its receipt
`artifacts/zodiacs-engine-1.0.0-rc.1.sha256` names its digest, and
`artifacts/README.md` lists it; rc.17's row there now names its carrier,
`b080217`, and says it was merged.

## The gates on the carrier

`carrier/carrier-gates.sh` ran each job of the three workflows that build
and check the package, `ci.yml`, `conformance.yml` and `atlas.yml`, on the
carrier, `bb1736a`, in a clean clone of the repository with full history,
with `TMPDIR` outside the clone and no `package.json` or `node_modules` at or
above it (logs in `carrier/`):

| Job | Node (npm) | Result | Log |
| --- | --- | --- | --- |
| engine: npm ci, typecheck, tests, build, export smoke, API check, package contents, pack dry run, archive check | 22.22.2 (10.9.7) | 3,824 tests passed, 1 skipped, in 85 files; the other steps pass; the archive check as below | `engine-v22.22.2.log` |
| engine | 20.19.0 (10.8.2) | 3,823 passed, 2 skipped, in 85 files; the other steps pass | `engine-v20.19.0.log` |
| engine | 24.21.0 (11.19.0) | 3,823 passed, 2 skipped, in 85 files; the other steps pass (npm warns that esbuild's two install scripts are not covered by `allowScripts`) | `engine-v24.21.0.log` |
| archives: the archive check with `--rebuild-all` | 22.22.2 (10.9.7) | a rebuild of HEAD, and of each of the 13 recorded archives from its source commit, byte-identical to the recorded archive | `archives-v22.22.2.log` |
| pack: npm ci, build, `npm pack --ignore-scripts` | 22.22.2 (10.9.7) | byte-identical to the carried archive (`cmp`) | `pack-v22.22.2.log` |
| packed consumer, on the carried archive itself | 20.19.0 (10.8.2), 22.7.0 (10.8.2), 22.22.2 (10.9.7), 24.21.0 (11.19.0) | failed to compile its own TypeScript on each version: it assigned the window's switches and unresolved spans to mutable arrays and `WINDOW_VERIFICATION` to its rc.17 literal | `consumer-bb1736a-v*.log` |
| conformance: npm ci, build, self-test, vectors, verdicts, `RESULTS.md` | 22.22.2 (10.9.7) | self-test 7 of 7; 500 vectors conform; 267 pass, 192 fail, 41 unsupported, 0 error, every verdict as committed; `RESULTS.md` and `results/summary.json` current | `conformance-v22.22.2.log` |
| conformance generators | Python 3.11.15, pyerfa 2.0.1.5, numpy 2.4.6 | L1, L2 and L3 rebuilt from their sources (tzdata and tzcode 2025c downloaded from IANA, digests checked) byte-identical to the committed vectors | `generators-v22.22.2.log` |
| atlas: checks and self-test, nothing installed | 22.22.2 (10.9.7) | all checks pass; self-test 26 of 26 | `atlas-v22.22.2.log` |

The packed consumer's failure was its own: its TypeScript declared the
window's results as rc.17 typed them, and 1.0.0-rc.1 makes them readonly and
types `WINDOW_VERIFICATION` as a string, two changes the CHANGELOG lists.
`4b11350` declares them as the CHANGELOG tells a caller to, and changes
nothing else; `scripts/` is not packed, so the archive is the same. On
`4b11350`:

| Job | Node (npm) | Result | Log |
| --- | --- | --- | --- |
| packed consumer, on the carried archive itself | 20.19.0 (10.8.2), 22.7.0 (10.8.2), 22.22.2 (10.9.7), 24.21.0 (11.19.0) | all 33 sections and the types pass on each version, on the archive of SHA-256 `cf1417d4…` | `consumer-v*.log` |
| engine, the archive check included | 22.22.2 (10.9.7) | 3,824 tests passed, 1 skipped, in 85 files; the other steps pass; the archive check finds the carried archive byte-identical to a rebuild of `4b11350`, across 157 commits | `engine-4b11350-v22.22.2.log` |

In a clean clone the tests run before the build, as in CI, so the test in
`scripts/root-isolation.test.mjs` that checks the checkout's own build is
skipped (it ran on the tree before the source commit, where a build was
present, *Gates on the tree*), and on 20.19.0 and 24.21.0 so is the tzdb
2025c comparison.

On each engine run the archive check found
`artifacts/zodiacs-engine-1.0.0-rc.1.tgz` byte-identical to a rebuild of
HEAD, and the 13 recorded archives (12 carried, 1 superseded) and their
receipts holding only their recorded bytes across 156 commits, each bound to
its source commit. With `--rebuild-all` each of the 13 was also rebuilt from
its source commit on Node 22.22.2 and matched its recorded bytes, rc.11's
superseded first packing and 1.0.0-rc.1's, from `77a16c2`, included. The
packed consumer ran on the carried file, where CI's runs on the pack job's
output; the pack job shows the two are the same bytes. The generators'
Python was the system's, with the two libraries at the versions CI pins.

## What is not established

- The values comparison covers the 6,411 calls it makes, not every input:
  it shows that the code each call reaches gives rc.17's values, and, by its
  last section, that each listed change of behaviour is real. A value that
  only an input outside the battery reaches is covered by the suite's own
  tests and by the reviews' reading of the changes, not by this comparison.
- The bands of a caller's epoch outside 1800 to 2200 are the largest
  differences found over 64,974 comparisons with ERFA's construction of the
  same definitions (`../calc-epochs-2026-10-06/`); they are measured, not
  proven.
- `docs/versioning.md` is a policy, and 1.0.0-rc.1 promises nothing:
  anything in it may change before 1.0.0.
- The carrier's gates ran on `bb1736a`, but the packed consumer's, which ran
  on `4b11350`: on `bb1736a` its own TypeScript failed to compile, and
  `4b11350` changes only that TypeScript (*The gates on the carrier*). The
  source commit's record said 6,290 calls where its comparison made 6,411;
  this version of this file corrects it.
- The reviews are AI-assisted, not human approval.
- 1.0.0-rc.1 is not to be published on npm: under the owner's delegated
  decision of 2026-10-05 the next publication is the 1.0 candidate, with the
  owner's approval of 1.0.0 itself. Nothing here represents a publication, a
  merge or the site's adoption.

## Reproduction

From a source checkout of the source commit, with Node 20.19.0, 22.7.0 or
later, after `npm ci` and `npm run build`:

```sh
node scripts/build-calc-roundtrip.mjs
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs
git show 782b496:conformance/results/zodiacs-engine.json > rc17.json
node docs/evidence/rc15-20260929/conformance-changes.mjs rc17.json conformance/results/zodiacs-engine.json conformance-changes.json
node docs/evidence/rc16-20260930/sizes.mjs 0.1.1-rc.17=<rc.17 package> 1.0.0-rc.1=. > sizes.json
node docs/evidence/1.0.0-rc.1-20261006/tools/values.mjs <rc.17 package> > rc17.jsonl
node docs/evidence/1.0.0-rc.1-20261006/tools/values.mjs . > rc1.jsonl
node docs/evidence/1.0.0-rc.1-20261006/tools/values-compare.mjs rc17.jsonl rc1.jsonl > values-compare.txt
node docs/evidence/1.0.0-rc.1-20261006/tools/receipts-cross.mjs . rc17.jsonl 0.1.1-rc.17
node docs/evidence/1.0.0-rc.1-20261006/tools/receipts-cross.mjs <rc.17 package> rc1.jsonl 1.0.0-rc.1
node docs/evidence/1.0.0-rc.1-20261006/tools/receipts-cross.mjs . rc17.jsonl 0.1.1-rc.17 --tamper
node docs/evidence/1.0.0-rc.1-20261006/tools/receipts-cross.mjs <rc.17 package> rc1.jsonl 1.0.0-rc.1 --tamper
node docs/evidence/1.0.0-rc.1-20261006/tools/api-diff.mjs <rc.17 package> > api-diff.txt
npx typedoc --options typedoc.json --out <tmp>/typedoc-out
git show 782b496:src/fixtures/calc-roundtrip.json > rc17-roundtrip.json
node docs/evidence/1.0.0-rc.1-20261006/tools/roundtrip-compare.mjs rc17-roundtrip.json src/fixtures/calc-roundtrip.json
npm view @zodiacs/engine versions dist-tags time --json
node docs/evidence/rc15-20260929/rebuilt/history-check.mjs 782b496..HEAD <patterns file> <examples file>
TMPDIR=<tmp> sh docs/evidence/1.0.0-rc.1-20261006/gates.sh "$PWD" <directory of node and npm> <scratch directory>
```

`<rc.17 package>` is the carried rc.17 archive unpacked, with
`scripts/verify-package-contents.mjs` from `aae419c` beside its `dist/` for
`sizes.mjs` to read its budgets, and a `node_modules` beside it that holds
astronomy-engine 2.1.19, which its `dist/` imports (a link to the
checkout's). The history check's two input files are not committed, because
they hold the birth data it looks for; the script's header gives their
formats.

The source commit packed from clean clones, and the carrier's gates, one job
and one Node version per call, each in a clean clone of `<repository>`:

```sh
TMPDIR=<tmp> sh docs/evidence/1.0.0-rc.1-20261006/carrier/pack-source.sh <repository> <source commit> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
TMPDIR=<tmp> sh docs/evidence/1.0.0-rc.1-20261006/carrier/carrier-gates.sh <job> <repository> <carrier commit> <work directory> <directory of node and npm>
```

The jobs are `engine`, `archives`, `pack`, `consumer`, `conformance`, `atlas`
and `generators` (with `PYTHON` naming a Python that has pyerfa 2.0.1.5 and
numpy 2.4.6).
