# 0.1.1-rc.17 checks, 2026-10-05

rc.17 adds the sidereal zodiac to the calc entry, `@zodiacs/engine/calc`, on
rc.16 as main has it at `23660f5` (the merge of zodiacs-org/engine#25). It is
seven commits on that base:

1. `18cb6b7`, *Compute the sidereal zodiac in the calc entry*: `calc()`,
   `houses()`, `events()` and `chart()` take `zodiac: { sidereal }`, with the
   nine built-in ayanamsas or a caller's own, where rc.16 refused it as
   `not-in-this-version`;
2. `0887541`, *Act on the sidereal review*,
3. `8070095`, *Act on the second sidereal review*,
4. `2ecc43c`, *Act on the third sidereal review*,
5. `d36642e`, *Act on the fourth sidereal review*, and
6. `8d8e837`, *Act on the fifth sidereal review*: the reviews of `18cb6b7`
   and their fixes (*Reviews*, below);
7. `aae419c`, the source commit of this candidate, which brought this
   directory: the version, the generated records that carry it, the
   CHANGELOG, the README and these checks (*The source commit*).

Three commits follow it: `b080217` carries the archive packed from it (*The
archive*); `8ab96de` records the gates on that carrier (*The gates on the
carrier*); and the commit that brings this version of this file acts on a
review of those two (*Reviews*), in this directory and in one sentence of
`artifacts/README.md`.

The feature's own checks, against the Vedic entry and against ERFA, are in
`../calc-sidereal-2026-10-05/`; this directory records what the candidate as
a whole was checked for. Every figure below is read from a file in this
directory, in that one or in a test named beside it, but the reviews'
findings (*Reviews*), which are their reports'. Local paths in the outputs
are shortened to `<checkout>`, `<tmp>` and `<scratch>`, and in the carrier's
logs to `<clone>`.

## The source commit

- Version 0.1.1-rc.17: `package.json`, `package-lock.json`, `ENGINE_VERSION`
  (`src/types.ts`) and TypeDoc's title (`typedoc.json`). The two tests that
  pin the version a new receipt records (`src/receipt-nutation.test.ts`,
  `src/receipt-time-basis.test.ts`) read 0.1.1-rc.17.
- Generated again on this tree: `src/fixtures/calc-roundtrip.json`, whose 29
  lines that name the engine's version change and nothing else
  (`node scripts/build-calc-roundtrip.mjs`); and the conformance results
  (*Conformance*).
- `CHANGELOG.md` gains the rc.17 entry and `README.md` describes this
  candidate. Both say what npm carries, as `npm-view.txt` records it on
  2026-10-05: rc.14 to rc.16, `latest` rc.15 and `next` rc.16, and not
  rc.17; the CHANGELOG notes that the entries of rc.14 to rc.16 call them
  unreleased.
- `NOTICE` and `LICENSING.md` say that the star-based ayanamsas' 22 values
  are in a shared chunk under `dist/` that `dist/vedic.js` and `dist/calc.js`
  import, where rc.16's said `dist/vedic.js`; `LICENSING.md` adds that calc's
  ayanamsa bounds are measurements.
- `scripts/verify-package-contents.mjs`: the reason given beside the calc
  entry's budget had the first build's sizes (138,580 bytes, 17,411 of them
  in the shared chunk and 7,265 in `calc.js`); it now has this build's
  (*Sizes and budgets*), the Vedic entry's comment its rc.17 size, the
  budgets' preamble says that rc.17 raises one, and the cap's comment gives
  rc.17's size. It now also checks that the star values are in one shared
  chunk that both entries import, and that `NOTICE` and `LICENSING.md` say
  so, as it checks the ΔT values.

## Reviews

`18cb6b7` was reviewed, and each commit that answered a review was reviewed
in turn: five reviews, AI-assisted, each in its own copy of the checkout.
The first three were one reviewer's, each building on its last; the fourth
and the fifth were a second and a third reviewer's, each given the commit
and the findings it answers. A sixth, a fourth reviewer's, read this source
commit's changes before they were committed. Every finding was acted on, by
the next commit or, for the first review's release finding and the sixth
review's, by this source commit. A seventh, a fifth reviewer's, read the
carrier and the first record of its gates, `8ab96de`, after they were
pushed; the commit that brings this version of this file acts on it. The
commit messages of `0887541`, `8070095`, `2ecc43c`, `d36642e` and `8d8e837`
summarize each review and what was done; the reviewers' probes are not in
the repository.

1. The review of `18cb6b7` found the sidereal arithmetic correct and two
   findings that blocked a merge:
   - the packed files changed under the version of the carried rc.16
     archive, so CI's archive check would fail, and the CHANGELOG and README
     still said calc refused the sidereal zodiac. This source commit answers
     it: the version, the CHANGELOG entry, the README and a new archive
     (*The source commit*, *The archive*);
   - within a degree of the Sun, a denser run of the feature's own ERFA
     comparison parted from the engine by up to 0.0352″ and 17.1″ a day,
     against the 0.022″ and 0.40″ stated; a degree or more from the Sun the
     rate exceeded its bound out to 1.43°; and the stated cause did not fit
     the recorded figures.

   It also found the mean ayanamsa's bound set beside the true ayanamsa, two
   shapes under the one key `ayanamsa`, four gaps in the tests (the speed at
   a leap second, `events()` with a caller's ayanamsa, a caller's value near
   ±180°, the band edges) and four smaller points of wording and of error
   messages. `0887541` sampled densely near each star's pass by the Sun
   (`tools/dense_rates.py`), gave calc, houses and chart one shape, added
   the tests and corrected the rest.
2. The review of `0887541` found six of the nine findings fixed, two in
   part, and the release finding left to this commit. Its new finding
   blocked a merge: in years the dense comparison had not sampled, the
   engine and ERFA parted by up to 0.0574″ and 27.0″ a day within 0.3° of
   the Sun, 1.6 and 1.5 times the bounds. Three smaller ones: the epoch and
   linear band claimed every definition calc accepts, though a linear ayanamsa
   counted from an epoch at the edge of a Date's range carried 1.9 × 10⁻⁴″ a
   day of rounding in its rate; two test titles and assertions; and a count.
   `8070095` compares every star definition in every year from 1800 to 2199,
   builds a linear ayanamsa from its value at J2000.0, and fixes the rest.
3. The review of `8070095` found all of those fixed and nothing that blocked
   a merge. Of its five small findings, one was a bound: at 4,001 instants,
   two of 192,048 rates of epoch definitions parted from its reference by
   2.05 × 10⁻⁷″ a day, over the bound of 1.5 × 10⁻⁷, the rounding of two
   central differences. Four were documentation: 78 star-years over the
   earlier bounds that are 74, crossings of the deflection's cap up to 4.21
   minutes apart rather than 2.1, twelve years in which only the engine caps
   the deflection, and a citation of a section that does not exist.
   `2ecc43c` sets the rate bound at the floor of the engine's rounding, adds
   the engine's own crossings of the cap to the comparison with a check that
   each is sampled finely, and corrects the four.
4. The review of `2ecc43c` found the third review's findings fixed but one,
   and two problems in the record, neither in the engine's arithmetic.
   ERFA's cap had been read at the star's least apparent angle from the Sun,
   not at ERFA's least margin, about eight minutes later: ERFA caps in 286
   years, not 278; the engine alone in four, not twelve; and where both cap,
   the crossings fall up to 6.3 minutes apart, not 4.2. And the rate bound's
   floor was stated as covering calc's speeds, which add rounding of their
   own, up to 3.0 × 10⁻⁷″ a day in the cases it found. Smaller: two
   docstring errors in `tools/rounding_floor.py`, an epoch definition's
   rounding described as the engine's alone, and the fixture's units.
   `d36642e` reads the cap at ERFA's least margin and samples every 0.00001
   day wherever that margin is within 5 × 10⁻⁸ of zero, which covers both
   programs' crossings; says what the floor covers and what a speed adds;
   and corrects the rest. No bound changed.
5. The review of `d36642e` found the fourth review's findings fixed and no
   defect in the engine or the data, and rebuilt the every-year rows and
   results byte for byte. Two findings were in the record. Its account of
   why the fine rows cover the engine's crossings of the cap rested on the
   margins' difference at ERFA's least, 1.7 × 10⁻⁸, but at the engine's
   crossings ERFA's margin is up to 1.97 × 10⁻⁸ from zero. And the speeds'
   figures it gave as what calc adds were calc's whole difference from the
   definition's rate; a Julian date in TT gives a larger one, 3.45 × 10⁻⁷″ a
   day. Three smaller points: the fixture's units, the precision that
   `least_margin` claimed, and a sentence on the 1804 rate. `8d8e837`
   measures ERFA's margin at the engine's crossings
   (`dense_rates.py --erfa-at-crossings`), gives the limit on calc's speeds,
   about 6 × 10⁻⁷″ a day, and the largest found, adds that case to the speed
   test and corrects the rest. No bound, no engine code and no comparison
   changed.
6. The review of this source commit's changes found three statements in
   packed files false: the CHANGELOG said the round-trip fixture's earlier
   cases changed only in their version, where the sidereal Moon, refused in
   rc.16, is now computed and 15 cases gain `ayanamsa: null`; it said no
   value of `./vedic` moved but Raman's and Sri Yukteswar's, where a caller's
   linear ayanamsa moves too (*What did not change*); and `NOTICE` and
   `LICENSING.md` placed the star values in `dist/vedic.js`. Smaller: the
   package's growth was not split as rc.16's was; the README's statement of
   what npm carries had no record here; the README claimed bit-identity
   without its qualifier; this record repeated the fixture's error, gave a
   third-review figure without its scope or source and claimed every figure
   came from a file; and wording. This commit corrects each.
7. The review of `b080217` and `8ab96de` found nothing that blocked a merge,
   and the archive, `archives.json`, the receipts, the logs and every figure
   in this record as they were recorded. Three statements were wrong. This
   record called the carrier's gates each of CI's jobs, where they are the
   jobs of `ci.yml`, `conformance.yml` and `atlas.yml`, and a pull request to
   `main` also runs the Python package's workflow and CodeQL (*GitHub
   Actions*). `artifacts/README.md` said none of its archives is an npm
   publication, where npm's tarballs of rc.14, rc.15 and rc.16 are those
   bytes. And the history check's output was written before the record's
   last edits were staged: it was run again on the final staged changes and
   gave the same output, which the record did not say. Smaller: the packed
   consumer's 33 sections are rc.16's, the sidereal zodiac one assertion
   among them, where `8ab96de`'s message counted it a section; the history
   check's header gave its range as `23660f5..HEAD`; a placeholder of the
   logs was not listed; and a garbled sentence. The commit that brings this
   version of this file corrects each, and runs the history check and the
   review aid again on `23660f5..8ab96de` with its own changes staged (*Birth
   data*).

## What did not change

The rc.17 tree was built and its import graphs compared, entry by entry,
with the carried rc.16 archive, `artifacts/zodiacs-engine-0.1.1-rc.16.tgz`
(SHA-256 `43a72d30…`), by `tools/graph-compare.mjs`
(`results/graph-compare.txt`):

- At `8d8e837`, which still names itself 0.1.1-rc.16, the root entry and
  eleven others (`./crossings`, `./deltat`, `./geo`, `./houses`,
  `./internal`, `./internal/math`, `./receipt`, `./sky`, `./techniques`,
  `./timing` and `./window`) load the same files as rc.16's, byte for byte;
  only `./calc` and `./vedic` differ.
- On this tree the version's value differs, and with it the content-hashed
  name of the chunk that holds `ENGINE_VERSION`, and so the names in every
  chunk that imports it. With those names and that value written out of
  every file, the twelve graphs are again rc.16's; four of them (`./crossings`,
  `./deltat`, `./geo`, `./houses`) do not reach that chunk and are identical
  as built.
- Of the calc round-trip fixture's 25 cases from rc.16, 24 give the same
  values: 15 of them gain `ayanamsa: null` (`../calc-sidereal-2026-10-05/`
  explains it), and every receipt names rc.17. The 25th, the sidereal Moon,
  was refused `not-in-this-version` in rc.16 and is now computed.
- `./vedic`'s values are rc.16's but for its linear ayanamsas, which now
  count from J2000.0 rather than from their epochs (`18cb6b7`):
  `tools/linear-change.mjs` compares the two builds' `ayanamsa()` at 116
  instants from 1800 to 2199 (`results/linear-change.txt`). Every epoch and
  star definition gives the same value; Raman's moves by up to
  1.42 × 10⁻¹⁴° and Sri Yukteswar's by up to 1.07 × 10⁻¹⁴°; and a caller's
  linear ayanamsa by up to 6.82 × 10⁻¹³° from an epoch from 1800 to 2200,
  1.56 × 10⁻¹²° from the start of the Kali Yuga and 8.62 × 10⁻¹¹° from an
  epoch at either end of a Date's range, at 3,600″ a year.
- Conformance: every one of the 500 verdicts, and every residual, is rc.16's
  (*Conformance*).
- Receipts: no conventions set is added. The current set has been accepted
  from 0.1.1-rc.16 on, in SemVer order, so receipts written by rc.17 are
  accepted under it, as `src/receipt-nutation.test.ts` and
  `src/receipt-time-basis.test.ts` check for 0.1.1-rc.17.
- The techniques' site-parity fixtures (`src/techniques/fixtures/site-parity/`)
  were generated on rc.16's packed build and say so (`meta.engine`); they
  were not generated again, because the root's graph, which the site's code
  runs on, is rc.16's but for the version. The parity test passes on this
  tree against them.

## Conformance

`conformance/results/zodiacs-engine.json` was regenerated on this tree with
adapter 0.2.0, then `RESULTS.md` and `results/summary.json`, and
`results/zodiacs-engine.notes.md` names this release. Totals: 267 pass, 192
fail, 41 unsupported, 0 error of 500, as rc.16's. `conformance-changes.json`
(`../rc15-20260929/conformance-changes.mjs`, against rc.16's committed
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
   `23660f5..8ab96de`, the nine commits up to the first record of the
   carrier's gates, with the changes of the commit that brings this version
   of this file staged: no birth data in any commit (the carried archive
   decompressed and read), in the staged changes or in the tree of
   `8ab96de`, and the published examples' birth data only in files that cite
   them. The source commit held the same check on the six commits before it
   and its own changes, and `8ab96de` on the eight before it and its own,
   with the same result. rc.16's positive controls
   (`../rc16-20260930/history-check-control-first-cut.txt` and
   `history-check-control-recut.txt`) show the same patterns finding birth
   data in histories that held it.
2. The broad review aid, run outside the repository because its output holds
   the lines it matches, listed every added line with a year from 1700 to
   2029 beside birth vocabulary or a capitalized pair of words, and every
   such pair, commit by commit and for the staged changes: 41 lines in the
   nine commits up to `8ab96de` and the staged changes, each read, the same
   41 that the source commit's run found in the six commits before it and
   its own changes, and `8ab96de`'s in the eight before it and its own. They
   hold the stars' and the ayanamsas' names (True Pushya, Sri Yukteswar),
   the comparison's years, the start of the Kali Yuga, the conformance
   notes' statistics, the names of tests in the suite's logs (a rule for
   circumpolar bodies named after its author, and two cities named for their
   time zones), the published worked examples that `history-check.txt` lists
   with their citations, and this record's own description of the aid; no
   person's birth data.

No commit adds a person's birth data.

## Sizes and budgets

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried rc.16
archive, with the budgets of its source commit `ddbbaa0`, and this tree:

| Entry | rc.16 | rc.17 | rc.17 beyond the root's graph | Budget | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.` | 103,537 (34,828) | 103,537 (34,822) |  | 108,500 | 4.79 % |
| `./calc` | 113,904 (37,490) | 139,836 (45,927) | 61,686 (19,116) | 145,500 | 4.05 % |
| `./crossings` | 9,410 (2,768) | 9,410 (2,768) | 173 (106) | 10,000 | 6.26 % |
| `./deltat` | 4,968 (1,944) | 4,968 (1,944) | 161 (101) | 5,500 | 10.7 % |
| `./geo` | 34,659 (12,953) | 34,659 (12,953) | 31,730 (11,858) | 35,000 | 0.98 % |
| `./houses` | 13,606 (3,503) | 13,606 (3,503) | 13,606 (3,503) | 15,000 | 10.24 % |
| `./internal` | 64,830 (22,572) | 64,830 (22,568) | 305 (160) | 68,000 | 4.88 % |
| `./internal/math` | 18,165 (4,928) | 18,165 (4,928) | 1,325 (446) | 20,000 | 10.1 % |
| `./receipt` | 66,580 (22,374) | 66,580 (22,373) | 41,969 (11,893) | 70,000 | 5.13 % |
| `./sky` | 92,109 (31,262) | 92,109 (31,255) | 16,888 (5,539) | 97,000 | 5.31 % |
| `./techniques` | 152,472 (50,308) | 152,472 (50,304) | 62,610 (20,014) | 160,000 | 4.93 % |
| `./timing` | 123,039 (39,477) | 123,039 (39,471) | 32,505 (8,850) | 129,000 | 4.84 % |
| `./vedic` | 122,131 (40,647) | 123,639 (41,511) | 33,777 (11,221) | 128,000 | 3.52 % |
| `./window` | 102,590 (34,123) | 102,590 (34,118) | 33,677 (9,969) | 105,000 | 2.34 % |

Bytes, with the sum of the graph's files each gzipped at level 9 in
parentheses; headroom is the budget over the rc.17 size, as a percentage of
the size, rounded down. Graphs that load the same number of bytes gzip a few
bytes apart, because the hashed chunk names inside them changed.

One budget is raised, after the size it fits had been measured, with its
reason beside it in `scripts/verify-package-contents.mjs`: `./calc`, 115,000
→ 145,500, for the sidereal zodiac. The calc entry now imports the Vedic
entry's ayanamsas (`src/vedic/ayanamsa.ts`, with its star catalogue and
apparent places) and sidereal charts (`src/vedic/sidereal.ts`,
`src/vedic/grid.ts`), which esbuild puts, whole, in a chunk the two entries
share: 17,596 bytes, and 8,336 more in `calc.js`. `./vedic` grows by 1,508
bytes, to 123,639 of its 128,000, not raised.

The package is 946,349 bytes unpacked in 70 files, 23,067 more than rc.16's
923,282 in 69: 9,844 bytes (42.68 per cent of the growth) of JavaScript that
only the opt-in entry points load, the shared chunk and `calc.js`'s growth
less what left `vedic.js`; 4,618 (20.02) of declarations, `calc.d.ts`'s; and
8,605 (37.30) of documents, the CHANGELOG, README, `LICENSING.md` and
`NOTICE`. It is 0.38 per cent under the cap of 950,000. The cap was not
raised; the next candidate that grows the package by more than about 3,600
bytes will need it raised, or the package trimmed, with the reason in its
CHANGELOG. The zone histories are rc.16's, 189,144 bytes in 16 files.

## Gates on the tree

`gates.sh`, rc.16's writing here, ran CI's engine job on the tree of the
source commit before it was made, once on each Node version (`gates.log`, and
the suite's output in `full-tests-<version>.log`):

| Node (npm) | Typecheck | Tests | Build, export smoke, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7) | pass | 3,791 passed in 80 files | pass |
| 20.19.0 (10.8.2) | pass | 3,790 passed, 1 skipped, in 80 files | pass |
| 24.21.0 (11.19.0) | pass | 3,790 passed, 1 skipped, in 80 files | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), which runs only where Node's own time-zone
data is 2025c (theirs are 2025a and 2026c), as in rc.16. `npm run
package:contents` reports 70 files and 946,349 bytes unpacked on each.
TypeDoc builds the API reference with 0 errors and 8 warnings
(`typedoc.log`), rc.16's eight. The archive check reads commits, so it runs
on the carrier (below).

## The archive

`artifacts/zodiacs-engine-0.1.1-rc.17.tgz` is packed from the source commit
`aae419c` and carried by its child `b080217`: SHA-256
`9cd24c788863424ef614aaadec580db5a0dfc529303d385274db48a092a5299a`, 273,123
bytes, 70 files, 946,349 bytes unpacked. It was packed once, after every
gate on the tree had passed: clean clones of `aae419c`, each installed with
`npm ci`, built and packed the same bytes on Node 22.22.2 (npm 10.9.7),
20.19.0 (npm 10.8.2) and 24.21.0 (npm 11.19.0), 70 files each time
(`carrier/pack-source.log`, from `carrier/pack-source.sh`), and the carried
file is the Node 22.22.2 one. The carrier's gates rebuild and repack its
source, as CI does, to the same bytes. `artifacts/archives.json` records it
with its source commit, its receipt
`artifacts/zodiacs-engine-0.1.1-rc.17.sha256` names its digest, and
`artifacts/README.md` lists it; rc.16's row there now names its carrier,
`ef44477`, and says it was merged, and rc.10's no longer calls it the site's
current pin: the site has pinned later candidates since, and pins rc.16 now.

## The gates on the carrier

`carrier/carrier-gates.sh` ran each job of the three workflows that build
and check the package, `ci.yml`, `conformance.yml` and `atlas.yml`, on the
carrier, `b080217`, in a clean clone of the repository with full history,
with `TMPDIR` outside the clone and no `package.json` or `node_modules` at or
above it. Every job passes (logs in `carrier/`):

| Job | Node (npm) | Result | Log |
| --- | --- | --- | --- |
| engine: npm ci, typecheck, tests, build, export smoke, package contents, pack dry run, archive check | 22.22.2 (10.9.7) | 3,790 tests passed, 1 skipped, in 80 files; the other steps pass; the archive check as below | `engine-v22.22.2.log` |
| engine | 20.19.0 (10.8.2) | 3,789 passed, 2 skipped, in 80 files; the other steps pass | `engine-v20.19.0.log` |
| engine | 24.21.0 (11.19.0) | 3,789 passed, 2 skipped, in 80 files; the other steps pass (npm warns that esbuild's two install scripts are not covered by `allowScripts`) | `engine-v24.21.0.log` |
| archives: the archive check with `--rebuild-all` | 22.22.2 (10.9.7) | a rebuild of HEAD, and of each of the 12 recorded archives from its source commit, byte-identical to the recorded archive | `archives-v22.22.2.log` |
| pack: npm ci, build, `npm pack --ignore-scripts` | 22.22.2 (10.9.7) | byte-identical to the carried archive (`cmp`) | `pack-v22.22.2.log` |
| packed consumer, on the carried archive itself | 20.19.0 (10.8.2), 22.7.0 (10.8.2), 22.22.2 (10.9.7), 24.21.0 (11.19.0) | all 33 sections and the types pass on each version, on the archive of SHA-256 `9cd24c78…`; the sections are rc.16's, and rc.17's sidereal zodiac in `./calc` is one assertion among them, the sidereal Moon against the Vedic entry's, with the types of a caller's ayanamsa and a sidereal chart | `consumer-v*.log` |
| conformance: npm ci, build, self-test, vectors, verdicts, `RESULTS.md` | 22.22.2 (10.9.7) | self-test 7 of 7; 500 vectors conform; 267 pass, 192 fail, 41 unsupported, 0 error, every verdict as committed; `RESULTS.md` and `results/summary.json` current | `conformance-v22.22.2.log` |
| conformance generators | Python 3.11.15, pyerfa 2.0.1.5, numpy 2.4.6 | L1, L2 and L3 rebuilt from their sources (tzdata and tzcode 2025c downloaded from IANA, digests checked) byte-identical to the committed vectors | `generators-v22.22.2.log` |
| atlas: checks and self-test, nothing installed | 22.22.2 (10.9.7) | all checks pass; self-test 26 of 26 | `atlas-v22.22.2.log` |

In a clean clone the tests run before the build, as in CI, so the test in
`scripts/root-isolation.test.mjs` that checks the checkout's own build is
skipped (it ran on the tree before the source commit, where a build was
present, *Gates on the tree*), and on 20.19.0 and 24.21.0 so is the tzdb
2025c comparison.

On each engine run the archive check found
`artifacts/zodiacs-engine-0.1.1-rc.17.tgz` byte-identical to a rebuild of
HEAD, and the 12 recorded archives (11 carried, 1 superseded) and their
receipts holding only their recorded bytes across 145 commits, each bound to
its source commit. With `--rebuild-all` each of the 12 was also rebuilt from
its source commit on Node 22.22.2 and matched its recorded bytes, rc.11's
superseded first packing and rc.17's, from `aae419c`, included. The packed
consumer ran on the carried file, where CI's runs on the pack job's output;
the pack job shows the two are the same bytes. The generators' Python was
the system's, with the two libraries at the versions CI pins.

## GitHub Actions

On the pull request, zodiacs-org/engine#26, GitHub Actions ran every workflow
that runs on a pull request to `main` on its head, `8ab96de`, the carrier
with the first version of this record: CI (run 37393765481), Conformance
(37393764980), Atlas (37393765291), the Python package (37393767607) and
CodeQL (37393765404). All 21 check runs passed. Two of those workflows are
not among the carrier's gates: the Python package's seven jobs, which check
the rc.14 archive the package bundles against `artifacts/` and run its tests
on Python 3.10 to 3.14 on Linux, macOS and Windows, and CodeQL. On this tree
`python/tools/verify_vendor.py` passes, and the package's 10 tests pass on
Python 3.11.15, installed from its wheel.

## What is not established

- The ayanamsa bounds are the largest differences found over 2,333,979
  comparisons with ERFA's construction of the same definitions, every year
  from 1800 to 2199, densely near each star's passes by the Sun; they are
  measured, not proven, except a linear definition's rate bound, which is the
  floor of its own rounding between the rate's two instants. A speed in calc
  adds rounding of its own, a few tenths of a microarcsecond a day for a
  linear ayanamsa at 3,600″ a year, which no bound includes: with the
  definition's own, about 6 × 10⁻⁷″ a day at most, a limit derived from the
  roundings, not measured (`../calc-sidereal-2026-10-05/`). ERFA's Earth
  (`epv00`) is documented for 1900 to 2100, and the comparison uses it from
  1800 to 2200.
- The third review, by its report, sampled the star bands' cap crossings and
  edges ten to forty times more finely than the comparison does and found
  the star bounds held there, by 0.1 to 1.4 per cent (26.972″ a day at a
  crossing, against 27″); the epoch and linear rate bound it found exceeded
  (*Reviews*, 3). A change to the engine's Earth, or to the sampling, could
  take a difference past its bound.
- `tools/ayanamsa_rates.py` in `../calc-sidereal-2026-10-05/`, which writes
  the comparison's 960 sparse rows, was read by the first review only; it has
  not changed since `18cb6b7`, the commit that review covered.
- A star definition's bound depends on the star's angle from the Sun at the
  instant; within 0.3° of the Sun, where the star is on or beside the Sun's
  disc, the ayanamsa's rate can differ from ERFA's by up to 27″ a day.
- No Swiss Ephemeris output was used for rc.17; its sidereal results were not
  compared with `swe_calc_ut` with `SEFLG_SIDEREAL`.
- The reviews are AI-assisted, not human approval.
- GitHub Actions ran the pull request's head, `8ab96de`, which adds this
  record to the carrier, not the carrier alone (*GitHub Actions*, above).
- rc.17 is not to be published on npm: under the owner's delegated decision
  of 2026-10-05 the next publication is the 1.0 candidate. Nothing here
  represents a publication, a merge or the site's adoption.

## Reproduction

From a source checkout of the source commit, with Node 20.19.0, 22.7.0 or
later, after `npm ci` and `npm run build`:

```sh
node scripts/build-calc-roundtrip.mjs
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs
git show 23660f5:conformance/results/zodiacs-engine.json > rc16.json
node docs/evidence/rc15-20260929/conformance-changes.mjs rc16.json conformance/results/zodiacs-engine.json conformance-changes.json
node docs/evidence/rc16-20260930/sizes.mjs 0.1.1-rc.16=<rc.16 package> 0.1.1-rc.17=. > sizes.json
node docs/evidence/rc17-20261005/tools/graph-compare.mjs <rc.16 package>/dist dist
node docs/evidence/rc17-20261005/tools/linear-change.mjs <rc.16 package> .
npm view @zodiacs/engine versions dist-tags time --json
node docs/evidence/rc15-20260929/rebuilt/history-check.mjs 23660f5..HEAD <patterns file> <examples file>
TMPDIR=<tmp> sh docs/evidence/rc17-20261005/gates.sh "$PWD" <directory of node and npm> <scratch directory>
```

`<rc.16 package>` is the carried rc.16 archive unpacked, with
`scripts/verify-package-contents.mjs` from `ddbbaa0` beside its `dist/` for
`sizes.mjs` to read its budgets, and, for `linear-change.mjs`, a
`node_modules` beside it that holds astronomy-engine 2.1.19, which its
`dist/vedic.js` imports (a link to the checkout's). The history check's two
input files are not committed, because they hold the birth data it looks for;
the script's header gives their formats.

The source commit packed from clean clones, and the carrier's gates, one job
and one Node version per call, each in a clean clone of `<repository>`:

```sh
TMPDIR=<tmp> sh docs/evidence/rc17-20261005/carrier/pack-source.sh <repository> <source commit> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
TMPDIR=<tmp> sh docs/evidence/rc17-20261005/carrier/carrier-gates.sh <job> <repository> <carrier commit> <work directory> <directory of node and npm>
```

The jobs are `engine`, `archives`, `pack`, `consumer`, `conformance`, `atlas`
and `generators` (with `PYTHON` naming a Python that has pyerfa 2.0.1.5 and
numpy 2.4.6).
