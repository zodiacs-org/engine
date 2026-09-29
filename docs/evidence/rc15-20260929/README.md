# 0.1.1-rc.15 checks, 2026-09-29

rc.15 brings four pieces of work onto rc.14, as main has it at `b0ddb88`
(rc.14, the time atlas's first slice and the repository basics):

1. the time basis and local time, `feature-time`: `a182c40` and its evidence
   `528fd72`. Its commit `353b71b`, "Minify whitespace in the published
   build", is dropped by decision: the published JavaScript is not minified;
2. Hellenistic timing techniques on `@zodiacs/engine/timing`,
   `feature-hellenistic` at `228ea836` (16 commits);
3. the sidereal zodiac and Jyotish techniques on `@zodiacs/engine/vedic`,
   `feature-vedic` at `266f608` (8 commits);
4. the Placidus bisection of finding F-46, `94b9fa2` of `feature-window`,
   alone.

The Hellenistic, Vedic and window pieces were reviewed on their branches; the
time branch was not reviewed before this integration. Every figure below is
read from a file in this directory or from a test named beside it. Local paths
in the outputs are shortened to `<checkout>`, `<clone>`, `<work>`, `<tmp>`
and `<scratch>`.

rc.15 was first cut from `d90a00a`, and two reviews of that build found
defects; a re-cut on branch `rc15-recut` carried their fixes. Neither build
was pushed or published. *The published history*, next, describes the
candidate as carried now: the re-cut's code with the corrections of a
re-check, in a history rebuilt before the first push. *The re-cut* describes
the re-cut as its branch recorded it, *After the reviews* what branch
`rc15-fix-records` changed, and *The review's fixes to the time basis and
local time* what branch `rc15-fix-time` changed. The other sections describe
rc.15 as first cut, except where they point elsewhere. The branches this
file names, and the commits but for `b0ddb88`, main's earlier commits and
the commits of this history (*The published history*), are local, were never
pushed and are not in this repository; *Commit identifiers in these records*
lists them.

## The published history

Branch `rc15-recut` held the re-cut as 46 commits on `b0ddb88`, ending in its
gate records, `bcd532c`. An independent re-check of it on 2026-09-29 verified
its archive, its merges, the time basis, the receipts' version gates and
every gate, and found living people's birth data in its history. Pull
requests are merged with a merge commit (`artifacts/README.md`), so every
commit of the branch would have been published, and eight of them add birth
data (`rebuilt/history-check-control.txt`): the commit that added the
Hellenistic timing tests held two living people's birth dates, two more
living people's rising signs and the birth dates of three people who have
died, taken from the public record; the commit that documented the timing
evidence, and one after it, repeated some of these; the first cut's source
commit brought a test log with a title that dated a birthday; and four
commits added again, in edited lines or new evidence, the birth time of a
person who has died that main's tests had taken from the Zodiacs site's demo
chart. The records branch took the podcast examples and the demo chart's
birth time out of the tests; the test log's title, and that birth in rc.12's
evidence script and in a query of `horizons-1908.sh`, were still at the tip.
The history was rebuilt before the first push, so that no commit carries
that birth data. On `b0ddb88` it has three commits:

| Commit | Subject |
| --- | --- |
| the commit that brings this version of this file | Release candidate 0.1.1-rc.15: time basis, timing and Vedic entries, Placidus bisection, review fixes (the source commit) |

The archive packed from the source commit is carried by its child, and the
gates on that carrier follow in a commit that changes only files under
`docs/evidence/`.

The source commit carries the whole reviewed integration at once. Its tree is
`bcd532c`'s without the re-cut's archive and its entries in `artifacts/`, and
with the re-check's corrections (below); its only parent is `b0ddb88`. It
adds no living person's birth data, and no real person's but the published
worked examples that `CONTRIBUTING.md` allows, each cited where it is used
with author, title, year and page: Hamish Saunders's charts of Christopher
Reeve (p. 3), Coretta Scott King (p. 4) and Princess Diana (p. 5) in *Solar
Arc Directions* (1996), Juan Estadella's of Charlie Chaplin in *Predictive
Astrology*, 3rd ed. (2019), pp. 84–85, and the native of Vettius Valens's
*Anthologies* IV.9, in Mark T. Riley's translation (2010), pp. 75–76.

`rebuilt/history-check.mjs` searches a history for the removed birth data:
the lines each commit adds, the contents of the binary files it adds or
changes (archives decompressed), the paths it adds and its message, and then
the whole tree of the last commit. Its patterns are kept outside the
repository, because they are the birth data it looks for; it prints labels,
counts, commits and paths, never a matched line. A second file, also kept
outside, gives the published worked examples' names, birth dates and
citations, and the check lists the files of the tree that hold each one's
birth data and whether each such file cites it. On the re-cut's
history, `b0ddb88..bcd532c`, it finds birth data added by 8 of its 46
commits, and in its tree (`rebuilt/history-check-control.txt`); the gate
records commit runs it on this history (`rebuilt/history-check.txt`).

### Commit identifiers in these records

Every commit identifier in the files of this directory and of the time,
timing and Vedic evidence directories (`../time-2026-09-28/`,
`../timing-hellenistic-2026-09-28/`, `../vedic-2026-09-28/`), other than
`b0ddb88`, main's earlier commits and the commits of this history, above,
names a local commit that was never pushed and is not in this repository. The logs and
outputs keep the identifiers they were written with
(`root-isolation-control-d90a00a.log` and `recut/item12-on-d90a00a.log` ran
on the first cut's tree, for one), and the scripts that read such a commit or
its build (`birth-data-mutations.sh`, `time-basis-fixes.mjs`,
`recut/analyses.sh`) run only where it exists.

| Identifiers | What they were |
| --- | --- |
| `a182c40`, `353b71b`, `528fd72` | branch `feature-time`: the time basis, a commit that minified the build (dropped), and its evidence |
| `373a660` to `228ea83`, 16 commits | branch `feature-hellenistic` |
| `80ed712` to `266f608`, 8 commits | branch `feature-vedic` |
| `94b9fa2` | branch `feature-window`: the Placidus bisection |
| `c588623` to `5af1929`, 30 commits | the first cut's integration on `b0ddb88` (*How the pieces were brought together*) |
| `d90a00a`, `cc98060`, `eb58011` | the first cut: its source commit, its carrier and its gate records |
| `d3a469a`, `4fa290e`, `b48d427`, `bcd0922`, `2283db9`, `3b3f4f2` | branch `rc15-fix-records` (*After the reviews*) |
| `d85cbb5`, `77c67d7`, `2db913c` | branch `rc15-fix-time` (*The review's fixes to the time basis and local time*) |
| `8345003`, `a1a9e95` | a first attempt at the re-cut, dropped before review: its source commit and carrier |
| `81fe41e`, `e756f93`, `8e1be15`, `51f567e`, `7daf832`, `bcd532c` | the re-cut, branch `rc15-recut`: the two merges, the version gates, its source commit, its carrier and its gate records |

### The re-check's other findings

The source commit corrects the re-check's other findings:

1. **Real people's birth data in the tree.**
   `docs/evidence/rc12-20260928/verify-site-adoption.mjs`, as main has it
   since rc.12, lists among its epochs a real person's birth taken from the
   Zodiacs site's demo chart, and the re-cut added a comment that named her.
   Main's history keeps that instant. At this tip the synthetic 1908 birth
   that the engine's tests use stands in its place, with a comment that says
   so without naming her, and no commit adds the re-cut's comment. The
   recorded output, `site-adoption-parity.json`, is the run's with the
   original epoch; run again on 2026-09-29 with the synthetic one, on the
   same frozen site tree and archives, the script passes as it did: 85 body
   cases, 1,020 rows and 321 further mappings, no mismatch
   (`rebuilt/site-adoption-rerun.json`). `horizons-1908.sh` also queried JPL
   Horizons at that birth, to show that its settings reproduced the digits
   the test had held: that query and its output are dropped, and the script,
   rerun on 2026-09-29, gives the rows of the first query as recorded. In `full-tests.log`, the
   first cut's test log, the title of one test named a person and gave their
   age on a date; it is redacted, and the log is otherwise as it ran. The
   comment in `src/engine.test.ts` that pointed at the dropped query now
   points at the script alone.
2. **Two root-entry refusals missing from the CHANGELOG.** A birth key that
   differs from a field only in letter case throws `RangeError`, and so does
   a `timeScale` other than `"utc"`, `"ut1"` or `"tt"`, `null` and `"UTC"`
   included (`src/api.ts`). rc.14 accepted both. The CHANGELOG now lists them
   among the breaking changes and in the migration.
   `rebuilt/corrections-probe.log` runs the carried rc.14 archive and this
   build on six such inputs and two controls: rc.14 accepts all eight, and
   this build refuses the six from `natalChart`, `saturnReturn` and
   `transits` alike and accepts the controls.
3. **Licensing.** `LICENSING.md` said GO without naming its open questions.
   Its status line now names three: no statement of terms for EOP 20 C04, so
   whether its rows and the values derived from them may be redistributed is
   not settled; whether a commercial use of the CDS's star values needs more
   than attribution; and no terms read for Reid and Brunthaler's two values.
   It no longer says that everything under `conformance/` is CC0: the copied
   inputs in `conformance/sources/` are not, as `conformance/README.md` says.
   `NOTICE` cites the C04 technical note that the Earth Orientation Centre's
   page for the series gives
   (https://hpiers.obspm.fr/eop-pc/index.php?index=C04&lang=en, read
   2026-09-29): Bizouard, C., Lambert, S., Gattano, C., Becker, O. & Richard,
   J.-Y. 2019, "The IERS EOP 14C04 solution for Earth orientation parameters
   consistent with ITRF 2014", J. Geod. 93, 621–633, whose authors, title,
   volume and pages were checked against the Crossref record of its DOI,
   10.1007/s00190-018-1186-3 (read 2026-09-29). `LICENSING.md` names it
   under *IERS data*.
4. **Three statements.** `docs/time.md` gave UT1 − UTC the source
   `"fallback"` after the table for UTC input only; TT input gets it too
   (`src/time-scale.ts`; the probe shows both). The CHANGELOG described the
   zone histories as the tzdb Makefile's `PACKRATDATA=backzone` build with
   an empty `PACKRATLIST`, from which 13 link names differ before 1970
   (`recut/backzone-divergence.json`); it now says so, as `docs/time.md`
   does. The CHANGELOG and `docs/time.md` said that `prepareLocalTime`
   resolves at once for the dates after those that need the history, from
   1970-01-02; it does from 1971, and loads the history for a date in 1970
   (`src/geo/timezone.ts`; the probe shows both).
5. **Commit references.** The CHANGELOG no longer names a local commit. This
   file, `artifacts/README.md`, the evidence READMEs of the time, timing and
   Vedic branches, `src/semver.test.ts` and the comments of
   `birth-data-mutations.sh`, `time-basis-fixes.mjs` and `recut/analyses.sh`
   say which identifiers are local.

Two more changes reach the packed CHANGELOG. Its headroom figures are rounded
down, since `AGENTS.md` asks that no figure be rounded in the engine's
favour, where the re-cut's were rounded to nearest: 2.34, 2.75, 6.26 and
10.70 per cent for the root, `/vedic`, `/crossings` and `/deltat`, where it
gave 2.35, 2.76, 6.27 and 10.71 (`rebuilt/headroom.log`). And its list of the
published examples names Valens's native beside Saunders's and Estadella's.

### Files that differ from the re-cut's tree

Against `bcd532c`, the source commit changes, for the reasons above:

- the packed `CHANGELOG.md`, `LICENSING.md` and `NOTICE`;
- `docs/time.md`, and the evidence READMEs of the time, timing and Vedic
  branches;
- in this directory, this README, `full-tests.log`, `horizons-1908.sh`,
  `horizons-1908.txt`, `birth-data-mutations.sh`, `time-basis-fixes.mjs` and
  `recut/analyses.sh`, and the new `rebuilt/`; and
  `docs/evidence/rc12-20260928/verify-site-adoption.mjs`;
- `src/engine.test.ts` and `src/semver.test.ts`, in comments only;
- `artifacts/`, which holds main's files: the carrier adds this history's
  archive, its receipt and their entries, where `bcd532c` held the
  re-cut's.

The carrier changes only `artifacts/`, and the gate records only this
directory.

### Measurements on this tree

On the source commit's tree before it was made:

- **The build.** The SHA-256 over the 48 `.js` and `.d.ts` files of `dist/`
  is `1b09c94f…`, the re-cut's, in this tree's build and in the archive
  packed from it (`rebuilt/dist-digest.log`). The engine's source is the
  re-cut's (two tests differ in comments only), so every measurement in
  `recut/` that reads the build holds for this one; of the package, only the
  documents differ.
- **Gates on the tree.** `rebuilt/gates.sh`, which is `recut/gates.sh`
  writing here (`rebuilt/gates.log`, `rebuilt/full-tests-*.log`):

  | Node (npm) | Typecheck | Tests | Build, export smoke, package contents, pack dry run |
  | --- | --- | --- | --- |
  | 22.22.2 (10.9.7) | pass | 3,257 passed in 59 files | pass |
  | 20.19.0 (10.8.2) | pass | 3,256 passed, 1 skipped, in 59 files | pass |
  | 24.21.0 (11.19.0) | pass | 3,256 passed, 1 skipped, in 59 files | pass |

  On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison, as
  on the re-cut.
- **Sizes.** `rebuilt/sizes.json` (`sizes.mjs` over the carried rc.14
  archive, the first cut's, the re-cut's and this tree) gives every import
  graph as the re-cut's, and the package 668,343 bytes unpacked in 54
  files, cap 700,000, 4.73 per cent above its size rounded down
  (`rebuilt/headroom.log`): 3,659 bytes more than the re-cut's, all in
  `CHANGELOG.md`, `LICENSING.md` and `NOTICE` (`rebuilt/archive-diff.log`).
- **The archive.** `rebuilt/pack-matrix.sh`, which is `recut/pack-matrix.sh`
  writing here: clean copies of the tree, each installed with `npm ci`, built
  and packed, give the same bytes on Node 22.22.2 twice (npm 10.9.7),
  20.19.0 (npm 10.8.2) and 24.21.0 (npm 11.19.0): SHA-256 `24eeb597…`,
  190,974 bytes (`rebuilt/pack-determinism.log`, `rebuilt/pack.json`).
- **The corrections.** `rebuilt/corrections-probe.log` and the Horizons
  rerun, above.

### The archive

`artifacts/zodiacs-engine-0.1.1-rc.15.tgz` is packed from the source commit
and carried by its child: SHA-256
`24eeb597b0157598c0faa26bb615c0cb5dfaaeac0393d62c73fbd37c5da4d348`, 190,974
bytes, 54 files, 668,343 bytes unpacked. It differs from the re-cut's archive
in `CHANGELOG.md`, `LICENSING.md` and `NOTICE` alone
(`rebuilt/archive-diff.log`).

Three local builds of rc.15 came before it, and none was pushed or published:
the first cut's archive, SHA-256 `3651c525…` (177,715 bytes), packed from
`d90a00a`; a first attempt at the re-cut, `554ed7ea…` (189,485 bytes), packed
from `8345003`; and the re-cut's, `bddfb3b7…` (189,575 bytes), packed from
`51f567e`. `artifacts/README.md` records them.

## The re-cut

This section and the ones after it keep what the re-cut, the first cut and
each review branch recorded, as they recorded it, with the local commit
identifiers they were written with; *The published history*, above, says
what holds for the candidate as carried now.

rc.15 was cut twice before its history was rebuilt. The first build was
packed from `d90a00a`: SHA-256
`3651c525e98ff83e20a46bded84ede5ad1465dde22674830347bceed87c31309`, 177,715
bytes, 54 files. It was carried in `cc98060`, with its gates recorded in
`eb58011`, on a local branch; neither commit was pushed and nothing was
published. Two reviews of that build found defects. Branch `rc15-recut`
started again at `d90a00a`, merged the two branches that fix them, fixed the
one item of the time review they left, and cut the candidate again under the
same version, since the first build was never published:

| Commit | Subject |
| --- | --- |
| `81fe41e` | Merge the records review's fixes to rc.15 (rc15-fix-records) |
| `e756f93` | Merge the time-basis review's fixes to rc.15 (rc15-fix-time) |
| `8e1be15` | Order receipts' engine versions by SemVer 2.0.0 precedence |
| `51f567e` | Re-cut release candidate 0.1.1-rc.15: IERS data licensing, re-measured figures and evidence (the source commit) |
| `7daf832` | Carry the re-cut 0.1.1-rc.15 tarball (the carrier) |
| `bcd532c` | Record the gates on the rc.15 carrier 7daf832 |

The archive packed from `51f567e` was carried by its child `7daf832`, and
`bcd532c` recorded the gates on that carrier (*The gates on the re-cut's
carrier*, below), changing only files under `docs/evidence/`. None of these
commits was pushed.

A first attempt at this cut was dropped before it was pushed or reviewed:
source commit `8345003`, whose archive (SHA-256
`554ed7eaeec6c6ca833a127f965a95959541e00679e282598cfa399e6bf6967e`, 189,485
bytes) was carried in `a1a9e95`; neither commit was pushed. Four
sentences in its packed files were wrong: its CHANGELOG said that every
figure in the rc.15 entry was measured on that build, though the entry's
Swiss Ephemeris statistics are the first build's, and that the rc.8 set is
accepted with any build metadata, though malformed metadata is refused; its
README said that the codec orders the versions of the earlier sets too,
though their gates are exact lists; and its LICENSING.md said that tzdata's
leap-second list stays only as a source of the conformance suite, though a
unit test also reads it. The re-cut corrected them. Those files are not read
by the code, so the build, and every measurement below but the package's size
and the archive's digest, were as they had been; each was run again on the
re-cut's tree.

The figures in the CHANGELOG's rc.15 entry, the README's rc.15 paragraph and
this section come from outputs in `recut/`, measured on the re-cut's tree
before its source commit was made, or from tests that ran there, except the
package's size and the archive's, which *The published history* gives for
the tree as carried now; the Swiss Ephemeris statistics are the first cut's,
and the entry says so where it gives them. `recut/analyses.sh` reruns each
evidence script of this directory whose figures those files give, one group
at a time, and `recut/gates.sh` runs CI's engine steps. The sections after
this one keep what the first cut and each review branch recorded, as they
recorded it; where the re-cut repeats one of their measurements, the table
under *Measurements* says whether it held.

### The two merges

`rc15-fix-records` (`3b3f4f2`, six commits) and `rc15-fix-time` (`2db913c`,
three commits) were merged in that order, each with a merge commit, so their
commits keep their hashes. The first merge had no conflict; its tree is
`3b3f4f2`'s. Six files are touched by both branches:

- `src/geo/timezone.ts` and this README merged without conflict: the records
  branch's comment on `country` and the time branch's refusal in
  `zoneOffsetAt`; both branches' sections here.
- `receipt-replay.mjs` was added on both branches with different analyses.
  The time branch's, which replays 16,218 rc.14 receipts and the exact path
  on UT1, keeps the name and its output `receipt-replay.json`. The records
  branch's, which replays five receipts a review chose and the rc.14 fixture,
  is now `receipt-replay-review.mjs`, with its log
  `receipt-replay-review.log`; the CHANGELOG and this README name the new
  files. Both commits' messages cite `receipt-replay.mjs`, the name each had
  on its branch.
- `CHANGELOG.md`: the time-basis bullet takes the time branch's sources (the
  IERS leap-second list, C04 in 1972, `finals2000A.all` from 1973-01-02) and
  the records branch's sample and wider review sample. Both branches had
  corrected the same four figures of `rc14-comparison.json` to 45.0″, 12.4″,
  0.462″ and 0.0723″. That file, as the time branch reran it, gives 44.98″,
  12.34″, 0.4616″ and 0.07221″, which those figures round up, and the
  re-cut's rerun gives the same (`recut/rc14-comparison.json`). The
  leap-second bullet is the time branch's; the receipts bullet keeps the
  records branch's optional rc.14 fields and both replay analyses. The
  records branch's breaking-change bullet said that `DeltaTSegment`'s new
  `"fallback"` marks charts in 1972 before the UT1 table; with 1972 from C04
  no chart's `deltaT.segment` is `"fallback"`, so the bullet now says that the
  type admits the value and no chart produces it.
- `README.md`: the records branch's figures with the wider sample, and the
  time branch's wording of the data carried (the IERS leap-second list) with
  the records branch's adoption table and star values.
- `docs/time.md`: the list of new geo exports takes both `zoneOffsetAt`'s
  refusal before 1970 and `GREGORIAN_ADOPTION_SOURCES` with its type.

Before the second merge commit was made, its tree passed typecheck, build,
3,225 tests in 57 files, the export smoke and the package contents check.

### The receipts' version gates (time review, item 12)

Three of the receipt codec's version gates were regular expressions over
spellings: "before 0.1.1-rc.15" for the time-basis set, and "before rc.9"
and "before rc.10" for the house systems those releases added.
0.1.1-rc.14.1, 0.1.1-beta, 0.1.1-alpha.7 and 0.1.1-rc come before
0.1.1-rc.15 in SemVer order and passed them. `8e1be15` replaces them with a
SemVer 2.0.0 precedence comparison written in the package (`src/semver.ts`,
no new dependency): each gate is `compareVersions(v, release) < 0`. A
receipt's engine, ephemeris and package versions must be SemVer 2.0.0
versions for that order to exist, and one that is not is refused as
`invalid_value`. The gates of the earlier sets stay exact lists of the
released versions that wrote them.

- `src/receipt-versions.test.ts` tests the gates through the codec, 10
  tests. On `d90a00a`'s tree 8 fail and 2 pass (`recut/item12-on-d90a00a.log`):
  the time-basis set was accepted under each of the four spellings and under
  four versions that are not SemVer 2.0.0 (0.1.1-rc.01, 00.1.1, 0.1.1-rc..16,
  0.1.1-rc.16+..). The two that pass there too check that every plain
  0.1.1-rc.N from 0 to 40, with and without build metadata, gets the answer
  it got before, under the time-basis set and the rc.8 set.
- `src/semver.test.ts`, 22 tests, checks the comparison on the
  specification's examples, on numbers beyond 2^53 and on malformed versions,
  and against the old expressions, copied from `d90a00a`: on every
  0.1.1-rc.N for N from 0 to 10,000 and two larger N, each with five
  spellings of build metadata (150,045 comparisons), and on the other
  versions they named, the two agree. It imports the new module, so it cannot
  run on `d90a00a`.
- `recut/versions.log` (`recut/version-probe.mjs`) gives the verdicts of
  rc.14's archive and of this build on eight versions no release wrote. rc.14
  accepted its own set, the rc.8 set, under all eight, 0.1.1-rc.15 included.
- The code is in the `/receipt` entry's graph alone, which grew from 65,164
  to 66,200 bytes; the root stayed at 97,704.

### The ΔT step at 1941.0 (time review, item 13)

The ΔT model steps back 13.95 ms at 1941.0, where its spline hands over to
its knots, and the re-cut keeps it. A receipt that rc.8 to rc.14 wrote records
the model's ΔT, and the codec recomputes it and refuses a difference over
1e-9 s (`src/receipt.ts`), so changing the model's values would make valid
receipts of those versions fail validation. The fix needs a new model name,
in a later candidate. The CHANGELOG's rc.15 entry states it as a known
limitation, and `docs/time.md` under *Limits*.

### Licensing of the IERS data

`LICENSING.md` (*Leap-second and UT1 data*, *IERS data*) and `NOTICE` now
name the data the package carries, with the URL, date and SHA-256 of each
source:

- the IERS leap-second list, `leap-seconds.list` as the IERS Earth
  Orientation Centre serves it (updated 2026-07-06, expires 2027-06-28,
  SHA-256 `db5a895f…`), in place of tzdata 2025c's copy. Its header states:
  "This file is in the public domain." The file served on 2026-09-29 is
  byte-identical to the committed one (Last-Modified 2026-07-06T07:54:11Z);
- UT1 − UTC for 1972 derived from the IERS EOP 20 C04 series
  (`eopc04.1962-now`, Last-Modified 2026-09-28, SHA-256 `e16cfbba…`), joined
  to `finals2000A.all`, whose entry is unchanged and served as the model.

No statement of terms was found for C04. Its file header, its description
(https://hpiers.obspm.fr/eoppc/eop/eopc04/readme), the IERS Data Center's
record of the series, the Earth Orientation Centre's page for it and the
Legal & Privacy page of iers.org, all read on 2026-09-29, state none;
`LICENSING.md` quotes what each says and asserts no licence. Whether the 367
rows the repository carries and the values the package derives from them
may be redistributed without other terms is a question for the owner. The
records branch's adoption-table sources and its attributions of the IERS and
star values are unchanged.

### Conformance on the re-cut

Every verdict is as the first cut committed it: 266 pass, 193 fail, 41
unsupported, 0 error of 500 (`recut/conformance.log`), and against rc.14's
results the same 34 verdicts change (`recut/conformance-changes.json`, as
`conformance-changes.json`). Regenerated on Node 22.22.2 with the documented
commands, `conformance/results/zodiacs-engine.json` differs from the first
cut's in two residuals: TT − UTC at 1972-06-30T23:59:59Z and
1972-07-01T00:00:00Z, 0 before and 4.2e-9 s and 7.1e-15 s now (tolerance
0.0005 s). The adapter reports TT − UTC as ΔT plus UT1 − UTC; with UT1 − UTC
taken as 0 in 1972 the sum was exact, and with C04's values it carries the
rounding of the millisecond arithmetic. `zodiacs-engine.notes.md` named
tzdata's leap-second list and `finals2000A.all` alone and now names the IERS
list and C04; `RESULTS.md` and `results/summary.json`, regenerated, change
only in that note.

### Measurements

Each output in `recut/`, from `analyses.sh <group>` on the re-cut's tree,
built, on Node 22.22.2. "Identical" means that the output equals, value for
value, the file the first cut or a review branch committed under the same
name in this directory, run times aside.

| Output (group) | On the re-cut | Against the committed record |
| --- | --- | --- |
| `rc14-comparison.json` (compare) | 1,801 charts from 1972 to 2027-10-02: ascendant and cusps up to 44.98″, midheaven 12.34″, Moon 0.4616″, Sun and planets 0.07221″, ΔT 0.08287 s; 7,896 charts outside: angles and cusps unchanged, Sun, Moon and planets within 0.000002747″, nodes 0.03462″ | identical |
| `review-sample.json` (compare) | 4,525 charts: ascendant and cusps up to 101.03″, Moon 0.4885″; nodes 0.0694″ in 1843 and 0.0681″ in 2156 | identical |
| `node-velocity.json` (compare) | the true node's numerical scatter: 0.18″ in 1600, 0.0668″ in 1870, 0.0000658″ at J2000 | identical |
| `leap-seconds.json` (compare) | all 28 changes of Bulletin C 72, 58 checks, 0 failures | identical |
| `ayanamsa-engine.json` (compare) | the engine's side of the Swiss comparison, the first cut against this build at its 14,647 instants: mean and true ayanamsas within 7.7e-11″, ΔT changed at 36 instants in 1972 by up to 0.6318 s | new |
| `sizes.json` (compare) | *Sizes*, below | new label `recut` |
| `receipt-replay.json` (replay) | 16,218 rc.14 receipts: midheaven up to 12.85″, ascendant and cusps up to 129.1″ at 65°, Moon 0.4619″; read on UT1 with the recorded ΔT pinned, angles and cusps exact | identical |
| `replay.log` (replay) | five receipts a review chose: angles up to 0.00170°, cusps 0.00179°, bodies 0.0000597°; the rc.14 fixture 0.0000584° | identical to `receipt-replay-review.log` |
| `versions.log` (versions) | *The receipts' version gates*, above | new |
| `time-basis-fixes.json` (time-basis) | the fixes measured against the first cut, as the CHANGELOG gives them | identical |
| `tz-line-ends.json`, `backzone-divergence.json` (tz) | 30 of the 1,125 wall-clock line ends moved; 122 of 597 names differ from the default build before 1970 | identical |
| `roundtrip-full.json` (roundtrip-full) | 65,237 offset changes 1850–2100, 2,548,849 wall minutes, 0 failures | identical |
| `roundtrip-default.json` (roundtrip-default) | 39,839 offset changes 1850–2037, 278,869 wall minutes, 0 failures | identical |
| `jdn-richards.json` (jdn) | 2,817,174 days and 1,096,114 string round trips, 0 mismatches | identical |
| `generators.log` (generators) | the zone histories match tzdb 2025c with the system's zic and with zic 2025c (597 names); `src/time-scale-data.ts` matches its committed sources, and its rows the whole `finals2000A.all`; the C04 extract's 367 rows and 6 header lines are those of `eopc04.1962-now` as IERS served it on 2026-09-29 | as `generators.log`, with the C04 check new |
| `conformance.log`, `conformance-changes.json` (conformance) | *Conformance on the re-cut*, above | identical |
| `controls.log` (controls) | the root-isolation controls fail naming each module and pass unchanged; the invented charts fail under every mutation the replaced tests failed under, and under one more | identical to `root-isolation-control.log` and `birth-data-mutations.txt` |
| `docs.log` (docs) | TypeDoc 0 errors, 5 warnings (the same five); atlas checks pass, self-test 26 of 26 | as `typedoc.log` and `atlas.log` |
| `sizes-merge.json` (merge-sizes) | the merge commit `e756f93`, built: `/receipt` 65,164 bytes, the root 97,704 | new |
| `rc10.log`, `rc10-compatibility.json` (rc10) | on the archive below, 382 of the 571 checks pass | the same checks, each with its first three mismatches, as `rc10-compatibility.json` |

The Swiss Ephemeris comparison itself, `ayanamsa-swiss.json`, was not run
again: the Swiss data files it reads are not on this machine. Its statistics
are engine minus Swiss, given to 0.000001″, and `ayanamsa-engine.json` shows
that this build's ayanamsas differ from the first cut's by at most 7.7e-11″
at the same instants, so those statistics hold for this build. Its ΔT
diagnostic (the median ΔT difference from Swiss) is the first cut's.

### Sizes

`recut/sizes.json`, from `sizes.mjs` over the carried rc.14 archive, the
first cut's archive and the re-cut's tree (the headroom rounded to nearest,
as the script gives it; *The published history* gives it rounded down):

| Entry | rc.14 | First cut | Re-cut | Beyond the root's graph | Budget | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `.` (the root) | 81,712 | 95,273 | 97,704 | | 100,000 | 2.35 % |
| `./crossings` | 9,410 | 9,410 | 9,410 | 173 | 10,000 | 6.27 % |
| `./deltat` | 4,968 | 4,968 | 4,968 | 161 | 5,500 | 10.71 % |
| `./geo` | 14,714 | 31,672 | 34,135 | 31,206 | 35,000 | 2.53 % |
| `./internal` | 45,259 | 56,961 | 58,997 | 305 | 60,000 | 1.70 % |
| `./internal/math` | 17,510 | 18,165 | 18,165 | 1,325 | 20,000 | 10.10 % |
| `./receipt` | 43,999 | 62,880 | 66,200 | 41,589 | 70,000 | 5.74 % |
| `./timing` | | 112,485 | 114,916 | 30,215 | 120,000 | 4.42 % |
| `./vedic` | | 114,106 | 116,779 | 32,750 | 120,000 | 2.76 % |
| zone histories, 16 files | | 189,144 | 189,144 | | 200,000 | 5.74 % |
| the package, unpacked | 282,469 | 634,490 | 664,684 | | 700,000 | 5.31 % |

Every graph is within its budget, and no budget changed. The root grew by
2,431 bytes over the first cut, all from the fixes to the time basis: the C04
knots of 1972 in the UT1 table (410), `src/time-scale.ts` (1,505), the time
basis in the API and the ephemeris (395 and 74), and imports and exports
(47). Beyond the root's graph, `/geo` grew by 2,463 bytes (2,091 with the
adoption table's sources, 372 with the zone fixes), `/receipt` by 1,373 (337
with rc.14's local resolution, 1,036 with the version gates) and `/vedic` by
242 (dashas in UTC), and `/timing` not at all: `sizes.json` (label `fix`,
the records branch), `recut/sizes-merge.json` (the merge commit `e756f93`)
and `recut/sizes.json`. The re-cut's package, 664,684 bytes, is that of its
archive, below; the package as carried now is 668,343 bytes (*The published
history*).

### Gates on the tree

`recut/gates.log` and the `recut/full-tests-*.log` files, from `gates.sh` on
the re-cut's tree before the source commit:

| Node (npm) | Typecheck | Tests | Build, export smoke, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7) | pass | 3,257 passed in 59 files | pass |
| 20.19.0 (10.8.2) | pass | 3,256 passed, 1 skipped, in 59 files | pass |
| 24.21.0 (11.19.0) | pass | 3,256 passed, 1 skipped, in 59 files | pass |

On 20.19.0 (tz 2025a) and 24.21.0 (tz 2026c) one test is skipped: a
comparison in `src/geo/zone-history.test.ts` that runs only where the host's
time zone data is tzdb 2025c, as on 22.22.2. The conformance steps, the
generators' checks and the atlas checks are in the table under
*Measurements*. The archive check reads commits, so it ran on the carrier
(*The gates on the re-cut's carrier*).

### The re-cut's archive

The re-cut's archive was packed from its source commit `51f567e` and carried
by `7daf832`: SHA-256
`bddfb3b708076c2ccf592779c38f3e1bd7f840221f257dbbac01ce1d87459637`, 189,575
bytes, 54 files, 664,684 bytes unpacked. It was never published, and the
archive carried now replaces it (*The published history*). Before `51f567e`
was made, clean copies of its tree, each installed with `npm ci`, built and
packed these bytes on Node 22.22.2 twice (npm 10.9.7), 20.19.0 (npm 10.8.2)
and 24.21.0 (npm 11.19.0) (`recut/pack-determinism.log`, `recut/pack.json`),
and clean clones of `51f567e` packed them again on the same three versions
(`recut/carrier/pack-source.log`). Its `dist/` is the build every measurement
in `recut/` read: the SHA-256 over its 48 `.js` and `.d.ts` files is
`1b09c94f…` in the archive, in the build measured and in the worktree's own
build (`recut/dist-digest.log`). On this archive the rc.10
compatibility script passes 382 of its 571 checks, and every check, with its
first three mismatches, is as on the first cut's archive (`recut/rc10.log`,
`recut/rc10-compatibility.json`; *rc.14 compatibility* explains the 189 that
fail by design). The first build's archive, `3651c525…`, is superseded, and
`artifacts/README.md` records it.

### A full disk

During the re-cut the disk that holds the scratch directories filled up with
other work on the machine, and four outputs of a first run of `analyses.sh`
were written empty. Every measurement above was then run in a copy of the
tree on a memory-backed file system: a clone of the repository at `8e1be15`
with the uncommitted changes copied in, whose tracked files were checked
against the worktree's by SHA-256, and whose build was the worktree's
(SHA-256 over `dist/*.js` and `dist/*.d.ts`, `1b09c94f…`, in both). For the
same reason `TMPDIR` for installs, packs and the archive check was a directory
on that file system, with no `package.json` or `node_modules` at or above it,
in place of the one prepared on the full disk.

### The gates on the re-cut's carrier

`recut/carrier/carrier-gates.sh` ran each of CI's jobs on the re-cut's
carrier, `7daf832`, in a clean clone of the repository with full history,
with `TMPDIR` outside the clone and no `package.json` or `node_modules` at or
above it. Every job passed:

| Job | Node (npm) | Result | Log |
| --- | --- | --- | --- |
| engine: npm ci, typecheck, tests, build, export smoke, package contents, pack dry run, archive check | 22.22.2 (10.9.7) | 3,256 tests passed, 1 skipped, in 59 files; the other steps pass; the archive check as below | `engine-v22.22.2.log` |
| engine | 20.19.0 (10.8.2) | 3,255 passed, 2 skipped, in 59 files; the other steps pass | `engine-v20.19.0.log` |
| engine | 24.21.0 (11.19.0) | 3,255 passed, 2 skipped, in 59 files; the other steps pass (npm warns that esbuild's two install scripts are not covered by `allowScripts`) | `engine-v24.21.0.log` |
| archives: the archive check with `--rebuild-all` | 22.22.2 (10.9.7) | a rebuild of HEAD, and of each of the 10 recorded archives from its source commit, byte-identical to the recorded archive | `archives-v22.22.2.log` |
| pack: npm ci, build, `npm pack --ignore-scripts` | 22.22.2 (10.9.7) | byte-identical to the carried archive (`cmp`) | `pack-v22.22.2.log` |
| packed consumer, on that archive | 20.19.0 (10.8.2), 22.7.0 (10.8.2), 22.22.2 (10.9.7), 24.21.0 (11.19.0) | all 29 sections pass on each version, on the archive of SHA-256 `bddfb3b7…` | `consumer-v*.log` |
| conformance: npm ci, build, self-test, vectors, verdicts, `RESULTS.md` | 22.22.2 (10.9.7) | self-test 7 of 7; 500 vectors conform; 266 pass, 193 fail, 41 unsupported, 0 error, every verdict as committed; `RESULTS.md` and `results/summary.json` current | `conformance-v22.22.2.log` |
| conformance generators | Python 3.11.15, pyerfa 2.0.1.5, numpy 2.4.6 | L1, L2 and L3 rebuilt from their sources (tzdata and tzcode 2025c downloaded from IANA, digests checked) byte-identical to the committed vectors | `generators-v22.22.2.log` |
| atlas: checks and self-test, nothing installed | 22.22.2 (10.9.7) | all checks pass; self-test 26 of 26 | `atlas-v22.22.2.log` |

In a clean clone the tests run before the build, as in CI, so the test in
`scripts/root-isolation.test.mjs` that checks the checkout's own build is
skipped (it ran on the tree before the source commit, where a build was
present), and on 20.19.0 and 24.21.0 so is the tzdb 2025c comparison.

On each engine run the archive check found the re-cut's
`artifacts/zodiacs-engine-0.1.1-rc.15.tgz` byte-identical to a rebuild of
HEAD, and the 10 recorded archives (9 carried, 1 superseded) and their
receipts holding only their recorded bytes across 128 commits, each bound to
its source commit. With `--rebuild-all` each of the 10 was also rebuilt from
its source commit on Node 22.22.2 and matched its recorded bytes, rc.11's
superseded first packing and rc.15 included.

The engine job on 24.21.0 and the archives job were stopped partway by a
cleanup of processes elsewhere on the machine, and were run again; their logs
are those of the second runs.

`recut/carrier/pack-source.sh` packed the source commit, `51f567e`, from
clean clones on Node 22.22.2, 20.19.0 and 24.21.0; each gave SHA-256
`bddfb3b7…`, 189,575 bytes, 54 files (`pack-source.log`), and the carried
file is the Node 22.22.2 one. That run's `TMPDIR` was on the memory-backed
file system (*A full disk*). By the time of the carrier's gates the disk had
room again: they, and `pack-source.sh` run a second time
(`pack-source-rerun.log`, the same three digests), used the `TMPDIR`
prepared for the re-cut.

## After the reviews

Branch `rc15-fix-records`, from `d90a00a` (the first cut's source commit,
whose archive `cc98060` carries), fixes the findings below. The findings on
the time basis are fixed on a branch of their own; the two are merged before
the candidate is cut again, and the sizes, the package's figures and the
gates are measured again on the merge. "Fails on `d90a00a`" means the new test
fails there and passes on the branch.

1. **The Gregorian adoption table's sources.** As first cut it cited English
   Wikipedia's list of adoption dates (CC BY-SA 4.0) and two other Wikipedia
   articles, and took its country names from a GeoNames index. It now has 18
   rows whose dates come only from public-domain sources: the `calendars`
   file of tzdata 2025c, which quotes Grotefend's 1941 edition, and
   Hermann Grotefend's own tables of 1891 and 1898 (he died in 1931). Each
   row names its sources (`GREGORIAN_ADOPTION_SOURCES` cites them), the
   region it dates where the sources date a country region by region, and in
   its note the other regions' dates and where the sources disagree. The
   names are those of tzdata's `iso3166.tab`, so `country` no longer matches
   GeoNames' `Czechia`, `United Kingdom` and `The Netherlands`; the codes
   match as before. `src/fixtures/gregorian-adoption.json` quotes every row's
   and note's sources, beside copies of the two tzdata files whose digests
   the tests pin, and `src/geo/calendar.test.ts` checks the table against it
   (7 of its 30 tests fail on `d90a00a`). The first cut's 24 other countries
   are gone, because these sources do not date them: Armenia, Azerbaijan,
   Belarus, Bulgaria, Canada, China, Egypt, Estonia, Georgia, Greece,
   Ireland, Japan, Latvia, Lithuania, Luxembourg, Montenegro, North Korea,
   North Macedonia, Romania, Serbia, South Korea, Turkey, Ukraine and the
   United States. `LICENSING.md` and `NOTICE` record the sources and their
   terms, and NOTICE's GeoNames paragraph says where the names come from.
2. **Birth data.** The first cut's tests used living people's charts: Al
   Gore's and George Lucas's in the releasing tests, and two more in the
   profection tests, all from podcast episodes. Other tests used the birth
   dates of people who have died, taken from the public record for podcast
   examples, and Frida Kahlo's birth time, as the Zodiacs site's demo chart
   gives it, in five test files. *Birth data*, below, says what replaced each.
   The rule in `CONTRIBUTING.md` and `AGENTS.md` now reads: synthetic by
   default; a worked example from a published source about a person who has
   died, cited with page, is allowed; a living person's, never.
   `birth-data-mutations.sh` puts back each defect the replaced tests guard
   against, and the invented charts fail under every one the old tests failed
   under (`birth-data-mutations.txt`). The new instants' JPL positions are in
   `horizons-1908.txt` (`horizons-1908.sh`).
3. **The root-isolation check.** As first cut, `npm run exports:smoke` found
   the modules in the root's graph by the build's `// src/<path>.ts` markers
   only, and a review showed that a module renamed `.mts` passed unseen.
   `scripts/root-isolation.mjs` now reads the build's own module list,
   esbuild's metafile, which `npm run build` writes to `dist/` (tsup
   `--metafile`; the file is not packed, and the published JavaScript is
   byte-identical). It checks that the list names exactly the built files, and
   fails if the root's static graph, by the list's inputs or by a marker of
   any extension, reaches a timing, Vedic or geo module or a zone history.
   `root-isolation-control.sh` imports into the root, without exporting any
   of its names, `rulers.ts`, the same module as `rulers.mts`, and a Vedic
   module whose name has a space: on the branch each fails naming the module
   and the unchanged copy passes (`root-isolation-control.log`); on
   `d90a00a` the second and third pass (`root-isolation-control-d90a00a.log`).
   `scripts/root-isolation.test.mjs` tests the check on synthetic metafiles.
4. **rc.14's local resolution.** As first cut, `createNatalEnvelope` refused
   a local resolution in rc.14's six fields (date, time, zone, offset, gap
   shift, policy), as a review showed with such a record. The fields that the
   time-basis set adds are now optional under it and checked when given; the
   rc.8 set still refuses them. `src/receipt-time-basis.test.ts`, "a local
   resolution in rc.14's shape, under the current set": 20 tests, of which
   19 fail on `d90a00a`; the twentieth, that the rc.8 set still refuses the
   added fields, passes on both.
5. **Dasha dates on a TT or UT1 chart.** The Vimshottari dasha started from
   the ayanamsa's instant as given, so a chart given on TT dated its dashas
   57.184 s late and printed them as UTC. A sidereal longitude's `utc`, from
   which the dashas start, is now the chart's UTC instant, as the timing entry
   reads it. `src/vedic/dasha.test.ts`, "dashas of a chart given on TT or
   UT1" (both tests fail on `d90a00a`), and the review's own tool
   (`dasha-scale.log`).
6. **Breaking changes.** The CHANGELOG's heading said all were in `/geo`. It
   now adds `DeltaT.model`'s `"iers-utc/1"`, `DeltaTSegment`'s `"fallback"`
   and the new set at index 0 of `NATAL_RECEIPT_CONVENTION_SETS`, and names
   the entry of each.
7. **Figures.** The README and CHANGELOG gave the largest differences of one
   sample as if they bounded all charts, and some figures were rounded in the
   engine's favour. `review-sample.mjs` repeats the review's wider sample
   (`review-sample.json`): from 1972 to 2027-10-02 the ascendant and cusps
   move from rc.14 by up to 101.03″ and the Moon by 0.4885″, against 44.98″
   and 0.4616″ in `rc14-comparison.json`; outside 1850–2150, where the first
   cut measured, the nodes differ by 0.0694″ (1843) and 0.0681″ (2156).
   `receipt-replay-review.mjs` (committed on the branch as
   `receipt-replay.mjs`) replays five receipts rc.14 wrote: angles move by up
   to 1.71e-3° and cusps by 1.80e-3°, where the CHANGELOG said under 1e-4°
   (true of the one fixture, 5.85e-5°) (`receipt-replay-review.log`). Figures rounded
   down (12.34″ to 12.3″, 0.000910″ to 0.0009″, 0.5438″ to 0.54″, 806.15″
   to 806″, 0.4616″ to 0.46″, 0.07221″ to 0.072″, 10.138″ to 10.1″, 0.1008″
   to 0.10″ and 0.07115″ to 0.071″) are now given to their recorded digits or
   rounded up, in the CHANGELOG, the README, `docs/vedic.md` and the Vedic
   evidence README.
8. **The package's size.** As first cut, the budgets' headroom was given as
   5 to 11 per cent; it was 4.96 (the root) to 11.32 per cent (`/receipt`) of
   each size. The CHANGELOG said the package's growth was in opt-in entry
   points and their data; `sizes.mjs` now splits it (`sizes.json`, `package`):
   of the 352,021 bytes rc.15 as first cut grew by, 274,897 were JavaScript
   only the opt-in entry points load, 189,144 of them the zone histories;
   48,380 declarations; 15,183 the README, CHANGELOG, licences and manifest;
   and 13,561 the root's graph. On this branch `/geo` is 33,763 bytes, with
   its budget 3.66 per cent above that, `/receipt` 63,217 and `/vedic`
   114,348, and the package 647,918 (label `fix` in `sizes.json`).
9. **Attribution and records.** `NOTICE` and `LICENSING.md` attribute the 22
   star values of the Vedic ayanamsas to their catalogues (VizieR I/311,
   III/252 and J/A+A/430/165, SIMBAD) and to Reid and Brunthaler (2004), and
   give the CDS's terms; whether commercial use needs more than attribution
   is not settled by them. The claim that IERS "asks users to cite" its data
   is withdrawn: no such IERS statement was found, and the files now say only
   what the USNO pages that distribute Bulletin A state. The sandbox path in
   `docs/evidence/time-2026-09-28/full-tests.log` is shortened, and this
   file no longer names one of the commits' trailers.

The gates ran on the branch's tree before its commit, on Node 22.22.2:
typecheck, build, export smoke, package contents and pack dry run pass
(`fix-checks.log`), and the full suite passes, 3,091 tests in 54 files
(`fix-full-tests.log`), where the first cut ran 3,083 in 53.

## The first cut's archive

The first build of rc.15 was packed from `d90a00a`, the first cut's source
commit: SHA-256
`3651c525e98ff83e20a46bded84ede5ad1465dde22674830347bceed87c31309`, 177,715
bytes, 54 files, 634,490 bytes unpacked. Before `d90a00a` was made, clean
copies of its tree, each installed with `npm ci`, built and packed these bytes
on Node 22.22.2 twice (npm 10.9.7), 20.19.0 (npm 10.8.2) and 24.21.0 (npm
11.19.0) (`pack.json`, `pack-determinism.log`). It was carried locally in
`cc98060`, never pushed or published, and is superseded:
`artifacts/zodiacs-engine-0.1.1-rc.15.tgz` holds the re-cut's archive (*The
re-cut*, *The archive*). Nothing under `docs/evidence/` is packed.

## How the pieces were brought together

This is the first cut's local history. Every commit in the table, in both
columns, is local and was never pushed; the published history carries their
result in its one source commit (*The published history*).

Each commit kept was cherry-picked in its branch's order onto `b0ddb88`, and
each keeps its author, date, message and trailers. Three commits of this
candidate's own integrate them, and the release commit follows.

| Branch commit | rc.15 commit | Subject |
| --- | --- | --- |
| `a182c40` | `c588623` | Time basis: tzdb 2025c history, birthplace mean time, Julian dates, leap seconds and IERS UT1 |
| `353b71b` | dropped | Minify whitespace in the published build |
| `528fd72` | `77dc7e0` | Record the time-basis evidence |
| `373a660` | `15006e6` | Add Hellenistic timing: profections, firdaria, releasing, solar arcs |
| `7523414` | `dc0ac17` | Document the Hellenistic timing techniques and their evidence |
| `1aa0b7f` | `a9274a1` | Move the timing API to the @zodiacs/engine/timing entry point |
| `2394267` | `54f9a03` | Name the timing API's origins and longitudes consistently |
| `d758ed6` | `23a9cd0` | Check timing names and dates before the chart; refuse ephemeris failures |
| `2e438df` | `ffa783d` | Keep the timing modules' file headers out of the declarations |
| `e21c07b` | `60fed1c` | Condense the timing JSDoc to the API contract |
| `8e79b78` | `a6d50f2` | Flag timing results outside the reference span or on a contradicted sect |
| `cdd51b6` | `d908eea` | Describe the profection months by what their sources say |
| `5ee8e4d` | `2d3aaa4` | Add Saunders's third solar arc example, Princess Diana's wedding |
| `a744e3b` | `cb96085` | Add the timing entry point to the changelog under Unreleased |
| `ba628c8` | `937f00e` | Record the independent comparison; relabel the evidence's self-checks |
| `a12020e` | `008a800` | Check the timing entry point in the packed-consumer smoke test |
| `3e716f5` | `bee5ff8` | Show the timing entry point's description in the API reference |
| `261f687` | `af40408` | Rename releasing's internal date window so it shadows no DOM global |
| `228ea83` | `70a4c20` | Note the pinned-ΔT solar arc caveat; bring the evidence figures up to date |
| (new) | `6b80fc3` | Keep the timing entry point on rc.14's ephemeris span and the time basis |
| `80ed712` | `ccc5dca` | Add sidereal zodiac and core Jyotish techniques |
| `d474757` | `e3f43e7` | Document the Vedic techniques and record their evidence |
| `70e143d` | `bb7fe9f` | Build each ayanamsa's epoch frame outside the caller's ΔT clock |
| `baf6ad5` | `fd7767b` | Rebuild sidereal whole-sign houses from the sidereal ascendant |
| `f75e5b0` | `2c8b9d7` | Look up Vimshottari periods on the boundaries their ISO strings show |
| `f631ddc` | `7dc60bf` | Move the Vedic API to the @zodiacs/engine/vedic entry |
| `b10ea6e` | `94afd71` | Ayanamsas: Krishnamurti from 1 January 1900, flags, and tests against ERFA and the IAE |
| `266f608` | `1441eea` | Document the ayanamsa construction and update the evidence |
| (new) | `5a61d80` | Read Vedic ayanamsas on the chart's time basis and scale |
| `94b9fa2` | `07a154f` | Keep Placidus outside the polar circle: bisect where the iteration does not settle |
| (new) | `5af1929` | Budget each entry point's import graph; check the root reaches no subpath |

The release commit then:

- sets the version (`package.json`, `package-lock.json`, `ENGINE_VERSION`,
  TypeDoc's title) and names `./timing` beside `./vedic` in the package
  description;
- writes one CHANGELOG entry for rc.15 in place of the "Unreleased" section,
  and rewrites the README's release paragraph ("receipt conventions remain
  unchanged" is no longer true);
- raises the receipts' version gate and adds the rc.14 receipt tests (see
  *Receipts*);
- updates the conformance adapter and regenerates its results (see
  *Conformance*);
- adds a section on the timing and Vedic values to `LICENSING.md`;
- updates `CONTRIBUTING.md` and `AGENTS.md` where rc.15 changes what they
  describe (the opt-in entry points, the size budgets, the generated time
  data), and the abstracts of `CITATION.cff` and `.zenodo.json`;
- points the links to the organization's repositories at its current name,
  zodiacs-org, as rc.14's evidence said rc.15 would
  (`docs/evidence/rc14-20260928/README.md`, "A note on links"); GitHub
  redirects the former name;
- notes the integration in the time and timing evidence READMEs and in
  `docs/time.md`.

### Conflicts and how each was resolved

- `a182c40` (time), `src/ephemeris.ts`: rc.14 had added the refusal of
  instants outside `EPHEMERIS_SPAN` and the chart declinations that exempt the
  Sun (`chartBodyDeclinations`); the time branch had rebuilt the clock around a
  time basis, installing each sample's own ΔT as a constant. The file takes
  the time branch's structure, with rc.14's span check inside `timeOf(basis)`
  on the basis's TT, so the instant and each speed sample are refused outside
  the span on a pinned clock as on the model, and with rc.14's chart
  declinations on the true obliquity of the same clock.
- `a182c40`, `LICENSING.md`: main's conformance section followed the
  paragraph on host time zone data, which the time branch replaced with the
  zone histories and a section on leap-second and UT1 data. Both are kept:
  the time branch's text, then the conformance section.
- `a182c40`, `README.md`: rc.14's licensing paragraph (the ΔT values in a
  shared chunk) is kept, and the sentence "The npm package contains no place
  or timezone database" gives way to the time branch's paragraph on the data
  it carries.
- `a182c40`, `scripts/verify-package-contents.mjs`: the closing report of
  rc.14 (licence and Node range) and the time branch's (shards) were combined;
  `5af1929` later replaced the size gate.
- `1aa0b7f` (timing), `README.md`: the list of entry points takes the time
  branch's `/geo` line (Julian calendar dates) and the timing line.
- `a744e3b`, `CHANGELOG.md`: the timing branch's "Unreleased" section goes
  above rc.14's entry.
- `a12020e`, `scripts/verify-packed-consumer.mjs`: rc.14's checks and the
  timing checks are both kept, one duplicated `void` line dropped, and the
  closing report adds `timing: "passed"` to rc.14's.
- `80ed712` (Vedic), `src/ephemeris.ts`: the branch added two clock helpers
  (`deltaTFor`, `onEngineClock`) written for the clock before the time basis.
  They were kept as the branch had them, so that its later commits applied as
  reviewed, and `5a61d80` replaced them (below).
- `f631ddc`, `package.json`, `typedoc.json`, `src/api.ts`,
  `scripts/module-resolution-smoke.mjs`, `scripts/verify-package-contents.mjs`
  and `scripts/verify-packed-consumer.mjs`: both branches added an entry
  point. Each file takes both: the `./timing` and `./vedic` exports and build
  entries, both TypeDoc entry points, both sets of smoke and consumer checks,
  and the `resolvedChart` comment naming both modules. `package.json` took the
  Vedic branch's description; the release commit extends it to name
  `./timing` too.
- `266f608`, `CHANGELOG.md` and `README.md`: the timing bullets, then the
  Vedic ones, under "Unreleased"; the entry-point list gains the Vedic line.
- `94b9fa2` (window), `CHANGELOG.md`: its hunk was written against a changelog
  without an "Unreleased" section. Its bullet went under the existing one,
  and its migration sentence (Placidus charts that fell back now keep
  Placidus) joined that section's migration line. The release commit folds
  the section into the rc.15 entry.

### The integration commits

- `6b80fc3`, timing on rc.14 and the time basis. Since rc.14 the core refuses
  an instant outside `EPHEMERIS_SPAN` before astronomy-engine sees it, so the
  timing test that expected astronomy-engine's thrown string now expects that
  refusal from every timing function. A chart given on UT1 or TT is read at the
  UTC instant of its time basis (`utcOf`, exported internally from
  `src/api.ts`), as `saturnReturn` reads one, so solar returns, releasing
  dates and solar arcs start at the chart's own instant; for a UTC chart
  nothing changes (`src/timing/solar-arc.test.ts`, "solar arcs and a chart's
  own clock"). The pinned-ΔT figure in `docs/timing-hellenistic.md` is
  restated for an instant a test pins (139.6″, pinned 3,600 s, 1600-06-15
  directed to 1650).
- `5a61d80`, Vedic on the time basis. An ayanamsa is read as a chart reads
  its instant, through `onChartClock` in `src/ephemeris.ts`: on UTC and the
  time basis by default, or on the `timeScale` and pinned ΔT given; the value
  records its `timeScale`; `siderealChart` passes the chart's own. The branch's
  `deltaTFor` is gone and `onEngineClock` now only fixes a ΔT for the epoch
  frames. The tests that tied the ayanamsa to the old clock were restated on
  the time basis, and one was added that reads the ayanamsa on UTC, TT and UT1
  charts. `docs/vedic.md` and the Vedic evidence README say so. The commit
  was moved before the window pick, so that the pieces stay in order.
- `5af1929`, the size gate and the root's isolation (next sections).

## Sizes as first cut

The re-cut's sizes are under *The re-cut*, *Sizes*.

`scripts/verify-package-contents.mjs` now gives each entry point in
`package.json` `exports` a budget for its import graph: the JavaScript a plain
`import` of it loads, its file and every chunk it imports statically,
astronomy-engine and declarations not counted. `sizes.json` (`sizes.mjs`)
measures rc.14's carried archive and this tree in the same way; the script
checks the same numbers on every run (`checks.log`).

| Entry | rc.14 | rc.15 | rc.15 beyond the root's graph | Budget |
| --- | ---: | ---: | ---: | ---: |
| `.` (the root) | 81,712 | 95,273 | | 100,000 |
| `./crossings` | 9,410 | 9,410 | 173 | 10,000 |
| `./deltat` | 4,968 | 4,968 | 161 | 5,500 |
| `./geo` | 14,714 | 31,672 | 28,743 | 35,000 |
| `./internal` | 45,259 | 56,961 | 305 | 60,000 |
| `./internal/math` | 17,510 | 18,165 | 1,325 | 20,000 |
| `./receipt` | 43,999 | 62,880 | 40,216 | 70,000 |
| `./timing` | | 112,485 | 30,215 | 120,000 |
| `./vedic` | | 114,106 | 32,508 | 120,000 |
| zone histories, 16 files | | 189,144 | | 200,000, exactly 16 files |
| the package, unpacked | 282,469 | 634,490 | | 700,000 |

The budgets leave from 4.96 per cent (the root) to 11.32 per cent (`/receipt`)
of headroom over these sizes (`sizes.json`, `headroomPercent`); the first cut
said 5 to 11. rc.14's unpacked size is from
`docs/evidence/rc14-20260928/pack.json`, and matches `sizes.json`'s count of
the carried archive's files.

**The root grew.** The brief for this candidate described rc.14's root graph
as "about 74 KB minified" and the cap's rationale as "subpaths are opt-in, and
the core entry does not grow". Neither holds for the package as it ships.
Nothing is minified, and rc.14's root graph as packed is 81,712 bytes; 74 KB
is the time branch's own figure for its root graph with the dropped minify
commit applied, 74,475 bytes, which was 91,561 without it
(`docs/evidence/time-2026-09-28/sizes.json`). rc.15's is 95,273, 13,561
bytes more (`sizes.json`, `coreByModule`): the leap-second and UT1 tables,
5,300; `src/time-scale.ts`, 4,994; the time basis's use in `src/ephemeris.ts`
and `src/api.ts`, 601 and 468; the Placidus bisection in `src/houses.ts`, 655;
and 1,543 of imports and exports, because the root's code is now split into
chunks that the new entry points share. Every chart needs the time basis, so
it cannot be opt-in. The CHANGELOG and the script therefore give the root's
growth and its reasons, and state the cap's rationale as what is true: the
growth beyond the root is in opt-in entry points and their data, which code
that imports only the root never loads, and the root's own graph has a budget.
That rationale left out the declarations and the documents; *After the
reviews*, item 8, gives the whole package's growth by kind.

**The root reaches no subpath.** As first cut, `npm run exports:smoke` read
the build's `// src/<path>.ts` markers in every file of the root's static
graph and failed if one was a timing, Vedic, geo or zone-history module
(`checks.log`: 21 modules). A module under another extension passed unseen;
the check now reads the build's module list (*After the reviews*, item 3,
where `root-isolation-control.sh` and its logs are described).

## What the time basis changes

`rc14-comparison.mjs` runs rc.14's carried archive and this build, each in its
own process, on 9,697 synthetic UTC instants from 1850 to 2150, 11 days 7 h
13 min apart, at four places in turn, with Placidus houses
(`rc14-comparison.json`):

- 1972 to 2027-10-02, 1,801 charts, where rc.15 reads the instant as UTC with
  the leap seconds and IERS UT1 − UTC and rc.14 read it as UT1 on the model:
  ascendant and cusps up to 44.98″, midheaven up to 12.34″, the Moon up to
  0.4616″, the Sun and planets up to 0.07221″ (Mercury), the nodes up to
  0.0172″; ΔT changes by up to 0.08287 s (rerun after the review fixes below;
  the first cut, which took UT1 − UTC as 0 in 1972, gave 0.6076 s, and the
  same maxima of angles and positions).
- Before 1972 (3,944 charts) and after 2027-10-02 (3,952), where both read
  the instant as UT1 on the same model: angles and cusps identical, the Sun,
  Moon and planets within 0.000002747″, and the north and south nodes within
  0.03462″.

These are the largest differences in this sample, not bounds. A review's
wider sample, 4,525 charts from 1800 to 2200 at random places within 66° of
the equator in seven house systems, found larger ones, near 65° S where the
ascendant turns fastest: 101.03″ in the ascendant and cusps and 0.4885″ in
the Moon from 1972 to 2027-10-02, and nodes 0.0694″ apart in 1843 and
0.0681″ in 2156 (`review-sample.mjs`, `review-sample.json`, which give each
maximum's chart).

The nodes' difference outside the span is numerical (`node-velocity.mjs`,
`node-velocity.json`). The true node comes from the Moon's angular momentum,
r × v, where astronomy-engine's `GeoMoonState` takes v as the difference of two
positions 0.864 s apart. rc.15 forms each sample's TT with a constant ΔT, rc.14
with the model installed. At the chart with the largest difference,
1870-06-26T01:26Z, the central TT is identical and the nodes differ by
0.03462″. Raising a constant ΔT by 1 to 200 µs, which moves the true node by
less than 0.00002″, scatters it by up to 0.0668″ there, 0.18″ in 1600, 0.026″
in 2100 and 0.00007″ at J2000: the true node carries numerical noise of this
size far from J2000 in rc.14 as in rc.15, and the new sampling draws other
values of it. The mechanism given in the script, the rounding of the Moon
series' large arguments amplified by the short difference, fits these sizes
but was not traced line by line.

## The time branch's own checks, at the integrated head

These ran on Node 22.22.2 on this tree before the commit; the geo and time
scale code they exercise is the source commit's. They are repeated on the
carrier (see *After the carrier*).

| Check | Result | File |
| --- | --- | --- |
| Generators, rerun after the review fixes: `build-tz-shards.mjs --check` against tzdata2025c.tar.gz with the system's zic and with zic 2025c, and `build-time-scales.mjs --check` from the committed sources, then also against the whole finals2000A.all and eopc04.1962-now (digests in the log) | all match (597 zone names) | `generators.log` |
| Round trip, unit-suite scope: every offset change 1850–2037 in 597 zones, rerun after the review fixes on a 3-day step (the first cut's 14-day step found 39,829 changes and 278,799 wall minutes) | 39,839 changes, zic's own count, 278,869 wall minutes, 0 failures | `roundtrip-default.json` |
| Round trip, full scope: every change 1850–2100, daily step, wider sampling | 65,237 changes, 2,548,849 wall minutes, 0 failures | `roundtrip-full.json` |
| Julian↔Gregorian against an independent Python implementation of Richards's algorithm, JDN 0 to Julian 3000-12-31 | 2,817,174 days and 1,096,114 string round trips, 0 mismatches | `jdn-richards.json` |
| Leap seconds against IERS Bulletin C 72 (`conformance/sources/l2/Leap_Second.dat`), through the public API | all 28 changes, before and at each, and the expiry: 58 checks, 0 failures | `leap-seconds.json` (`leap-seconds.mjs`) |
| The time tests (time scale, receipts' time basis, birthplace, calendar, flags, zone history) | 198 passed in 6 files | `time-tests.log` |

The round-trip and calendar counts equal those the time branch recorded on
its own base (`docs/evidence/time-2026-09-28/`). The leap-second check against
Bulletin C is new here. The re-cut repeats each of these checks
(`recut/generators.log`, `recut/roundtrip-*.json`, `recut/jdn-richards.json`,
`recut/leap-seconds.json`) with the same results.

## The review's fixes to the time basis and local time (branch `rc15-fix-time`)

Two reviews of the first cut (`d90a00a`) found faults in the time basis and
in local time. The branch `rc15-fix-time`, from `d90a00a`, fixes them. Each fix to the code has a
test that fails on `d90a00a` and passes after it; the replay and backzone rows
correct the documentation, and their tests and scripts pin what it now says.
Every figure below is read from a file in this directory or a test named
beside it; the new scripts round each largest change and band up and each
range of change outward, never to nearest (the speed ratios, to seven
digits, are to nearest).
Scripts and outputs:

| Fix | Evidence | Result |
| --- | --- | --- |
| UT1 inside a leap second is TAI + (UT1 − TAI), on TT and UT1 input | `src/time-scale.test.ts` (every one of the 27 leap seconds, TT and UT1 input against UTC input on either side); `time-basis-fixes.json` | the first cut's ΔT was 0.36 s to 1 s too large at 108 TT instants inside leap seconds (69.593 s for 68.593 s at the end of 2016); midheaven up to 14.11″, ascendant and cusps up to 31.23″. On UT1 input at 275 instants around the leap seconds from 1974 nothing changes but the reported UT1 − UTC (at 98), which was 1 s off |
| 1972 on IERS EOP 20 C04, joined to `finals2000A.all` on a knot | `src/time-scale.test.ts` (each of C04's 367 days within 0.66 ms, the join continuous), `scripts/build-time-scales.test.mjs`; `time-basis-fixes.json` | UT1 − UTC −0.635 s to +0.811 s where the first cut took 0; the midheaven's jump at 1973-01-02 11.83″ → 0.01462″ in a millisecond; 283 charts in 1972 on UTC and on TT input: midheaven up to 13.26″, ascendant and cusps up to 32.12″, positions within 2e-7″ (true nodes 0.0184″); on UT1 input: angles unchanged, ΔT up to 0.811 s, the Moon up to 0.399″ |
| The generator's inputs committed; its check in `npm test` | `scripts/time-scale-sources/`, `scripts/build-time-scales.test.mjs`, `generators.log` | `--check` passes from the checkout, and against the whole files; the `finals2000A.all` extract moved there from `src/fixtures/` with the same bytes (sha256 `b741c4e0…badb6e1`), and IERS's list replaced tzdata 2025c's copy (`src/fixtures/leap-seconds-2025c.list`, whose bytes stay in `conformance/sources/l3/leap-seconds.list`) |
| Speeds divided by the TT between samples where the basis steps | `src/speed.test.ts`; `time-basis-fixes.json` | the first cut's speeds were 1.005787 times the rate within 86.4 s of a leap second, 0.9997422 at 1972-01-01, 1.000845 at 2027-10-02, 0.9999193 at 1941.0 (the ΔT model's −0.01395 s step there, F-47, is kept) |
| 30 wall-clock zone-line ends placed as zic places them | `scripts/build-tz-shards.test.mjs`, `src/geo/flags.test.ts` (all 30); `tz-line-ends.json` | 30 transitions `"dst"` → `"legal-change"`, no other cause changes; of the 1,125 wall-clock line ends where the standard offset changes and zic 2025c wrote a transition within two days, all fall on one (the first cut's rule: 1,095) |
| The backzone divergence computed | `backzone-divergence.mjs`, `backzone-divergence.json` | 122 names answer differently from the default build before 1970, 136 differ between the builds; 28 of the 122 are not on the audit's list of 98, 4 of the 98 do not change; 584 of 597 names match the tzdb Makefile's all-backzone build before 1970 |
| `zoneOffsetAt` refuses before 1970 until the history is loaded | `src/geo/zone-history.test.ts` | one answer for one question, in any order of calls |
| Replay of rc.8-set receipts: the true shift and the exact path | `receipt-replay.mjs`, `receipt-replay.json`, `make-receipt-rc14-1973.mjs`, `src/fixtures/receipt-rc14-1973.json`, `src/replay-time-basis.test.ts` | 16,218 rc.14 receipts from 1972 to 2027-10-02 at 0° to 65°: midheaven up to 12.85″, ascendant up to 129.1″ at 65°; on UT1 with the recorded ΔT pinned, angles and cusps exact |
| Table edges labelled by the table | `src/time-scale.test.ts`; `time-basis-fixes.json` (`tableEdges`) | six edge instants: `"fallback"`, σ 0.9 s → `"observed"` or `"predicted"`, σ 2.69 ms or 26.2 ms |
| The unit round trip finds every offset change | `src/geo/roundtrip.test.ts`, `roundtrip-default.json` | 3-day step: all 39,839 of zic's changes 1850–2037, 278,869 wall minutes, 0 failures; the 5 excursions of under a week the 14-day step missed are found |
| The current IERS leap-second list | `src/time-scale.test.ts`, `leap-seconds.json` | updated 2026-07-06, expires 2027-06-28; the same leap seconds as tzdata 2025c's copy; all 28 changes of Bulletin C 72 |
| A birth key that differs from a field only in letter case is refused | `src/time-scale.test.ts` | `timescale`, `Latitude`, `deltat` and the like throw `RangeError`; other keys are still ignored |

Elsewhere nothing changes (`time-basis-fixes.json`, `elsewhere`): 20,000
synthetic charts from 1850 to 2150 on UTC, UT1 and TT input, 3,995 of them
with a pinned ΔT, away from the instants above, give the first cut's results
exactly but for `timeScale.leapSeconds.listed` (89 charts from 2026-06-28 to
2027-06-28, where the new list is in force) and the UT1 table's digest
(`064d98b4a531053a`). `rc14-comparison.json` was
rerun: of its figures only the largest change of ΔT from rc.14 moved.

Not changed on this branch: the version gate of receipts, which sits in
`src/receipt.ts`, outside the branch's files, and the ΔT model's step at
1941.0 (above; removing it needs a new model name). `LICENSING.md` and
`NOTICE`, also outside the branch's files, still name tzdata 2025c's
leap-second list and `finals2000A.all` alone as the sources of the time data.
The re-cut orders the versions by SemVer (item 12), states the step as a
known limitation (item 13), and brings `LICENSING.md` and `NOTICE` up to date
(*The re-cut*).

## Vedic: the Swiss Ephemeris comparison on rc.15

`docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py`, rerun on this build
with pyswisseph 2.10.03 as an instrument, over the same 14,647 instants from
1800 to 2200; the output holds statistics only (`ayanamsa-swiss.json`). Mean
ayanamsa against `swe_get_ayanamsa_ex_ut`, gate 0.01″:

| Ayanamsa | max \|Δ\| | Gate |
| --- | ---: | --- |
| Lahiri | 0.001284″ | pass |
| Fagan–Bradley | 0.000910″ | pass |
| True Chitra | 0.002000″ | pass |
| True Revati | 0.004363″ | pass |
| user-defined, J1900, B1950, J2000 | 0.001006″, 0.001223″, 0.001285″ | pass |
| Krishnamurti | 0.071153″ | **fail**, by design: the engine's epoch is 1900-01-01 0h TT, Swiss's J1900.0 |
| Raman | 10.137788″ | **fail**, by definition |
| Yukteswar | 806.15428″ | **fail**, by definition |
| True Pushya | 0.543838″ | **fail**, at 12 instants with δ Cnc within 0.2° of the Sun |
| Galactic Center | 0.100779″ | **fail**, on catalogue data |

The verdicts are the branch's (`docs/evidence/vedic-2026-09-28/results/
ayanamsa-swiss.json`, which stays as the branch recorded it). The time basis
moves some figures in the last printed digit: the median ΔT difference from
Swiss goes from −0.125 s to −0.126 s, Fagan–Bradley's maximum from 0.000909″
to 0.000910″, Krishnamurti's from 0.071152″ to 0.071153″, and the diagnostics'
by 0.000001″.

The re-cut did not run Swiss Ephemeris again. At the same 14,647 instants its
mean and true ayanamsas are within 7.7e-11″ of the first cut's
(`recut/ayanamsa-engine.json`), so the statistics above, given to 0.000001″,
hold for it; its ΔT differs from the first cut's at 36 instants in 1972, by up
to 0.6318 s, where UT1 − UTC now comes from C04.

## Conformance

`conformance/results/zodiacs-engine.json` is regenerated on Node 22.22.2 with
adapter 0.2.0, then `RESULTS.md` and `results/summary.json` with
`report.mjs`. The adapter now asks for the instant's scale (`timeScale: "tt"`
for positions and `"ut1"` for angles, where rc.14's adapter pinned ΔT at 0 and
relied on the engine reading its instant as UT1), awaits `prepareLocalTime`
before a zone offset, answers a repeated local time from the transition the
engine reports, and reports TT − UTC as a chart's ΔT plus its UT1 − UTC.

Totals: 266 pass, 193 fail, 41 unsupported, 0 error of 500; rc.14: 232, 222,
46, 0. All 34 changed verdicts are time vectors (`conformance-changes.json`,
`conformance-changes.mjs`):

- 20 zone offsets tagged `backzone-history`, fail → pass: rc.14 read those
  wall times on the host's default-build data; rc.15 reads the tzdb 2025c
  history with backzone that it ships. These are 20 of rc.14's 29 time
  failures.
- 9 values of TT − UTC, fail → pass: the other 9 failures. rc.14 answered with
  its ΔT model (residuals up to 0.634 s); rc.15 takes TAI − UTC from the leap
  seconds and UT1 − UTC from IERS (residuals up to 2.0e-8 s).
- 5 repeated local times, unsupported → pass: the engine now reports the
  transition behind a fold, and the adapter gives both offsets from it.

No other verdict changes. The ΔT vectors, which passed, come closer: median
residual 0.0041 s → 0.00013 s, maximum 0.069 s → 0.00051 s. Positions, angles
and cusps move by at most 3e-7″, because the adapter now reads TT and UT1
directly. The 193 failures are all positions: astronomy-engine against DE441,
as in rc.14. The 41 unsupported are the 35 calendar vectors (no public Julian
Day Number function), the 5 local mean time vectors (no local mean time from a
longitude alone) and one leap second itself (not a JavaScript date).
`conformance.log` holds the self-test (7 of 7), the vector validation (500),
the check of every verdict and the check of `RESULTS.md`. On the re-cut see
*The re-cut*, *Conformance on the re-cut*.

## Receipts

The time branch adds a conventions set at index 0 of
`NATAL_RECEIPT_CONVENTION_SETS`, and a set is accepted only from the engine
versions that wrote it. In `src/receipt.ts`, `BEFORE_TIME_BASIS` now names
every version before 0.1.1-rc.15, and the rc.8 set is accepted from rc.8 to
rc.14 (`RC8_TO_RC14`).

`src/fixtures/receipt-rc14.json` is a receipt that the carried rc.14 archive
serialized (`make-receipt-rc14.mjs`, a synthetic 1990-06-15 08:30 birth in
New York; SHA-256 in the script). `src/receipt-time-basis.test.ts` checks that
rc.15 parses it under the rc.8 set with rc.14's engine record, that its result
equals rc.13's receipt of the same chart, that it replays as the UTC request
it recorded, with bodies within 1e-5° and angles within 1e-4° of what rc.14
stored (5.85e-5° in fact; for five other charts, up to 1.80e-3° in the cusps,
`receipt-replay-review.log`), that a relabel to rc.15 or an added `timeScale` is refused, and which
versions each set accepts: the current set under 0.1.1-rc.15, rc.16, 0.1.1
and 0.2.0, not rc.12, rc.13, rc.14 (with or without build metadata) or 0.1.0;
the rc.8 set under rc.8, rc.12, rc.14 and rc.14 with build metadata, not
rc.7, rc.15, rc.16, 0.1.1 or 0.2.0. The re-cut orders versions by SemVer
2.0.0 (*The re-cut*, item 12); each of those versions gets the same answer
(`src/receipt-time-basis.test.ts`, `src/receipt-versions.test.ts`).

## rc.14 compatibility

There is no rc.14 counterpart of `scripts/verify-rc10-compatibility.mjs`, and
an exact one would fail by design: the time basis changes charts from 1972 to
2027-10-02, every chart gains `timeScale`, and receipts gain a set. What stands
in for it:

- `rc14-comparison.json`, above, measures every body, angle and cusp against
  rc.14's archive, era by era;
- the rc.14 receipt tests, above;
- `rc10-compatibility.json`: the rc.10 script itself, run against this
  archive (reduced; see its `reduced` field). rc.14 passed all 571 checks;
  rc.15 passes 382. It parses all 91 rc.10 receipts and recovers the same 91
  replay requests; both builds replay their own receipts exactly (182); it
  refuses the 11 invalid inputs as rc.10 does; it keeps every export, the 13
  house systems, the ephemeris and the order of calls; and it rejects the
  malformed receipts alike. The 189 failures are the 91 charts with their
  receipts, the 91 replays of rc.10 receipts and the 7 legacy API cases. Every
  chart and receipt differs by the added `timeScale` and the new receipt set;
  the values differ as `rc14-comparison.json` describes, since rc.14 matched
  rc.10 on all of these checks: from 1972 to 2027-10-02 by the time basis, and
  outside it by rounding (in 1600, for one, an aspect orb of
  0.00208633353543064° against 0.0020863334385694543°). The negative control
  passes.

On the re-cut's archive the rc.10 script gives the same: 382 of 571 checks
pass, and every check, with its first three mismatches, is as on the first
cut's archive (`recut/rc10.log`, `recut/rc10-compatibility.json`).

## Birth data

`CONTRIBUTING.md` and `AGENTS.md`, since the repository basics (#12), required
synthetic birth data: "None may describe a real person's birth." As first cut
this section named four people whose charts the tests used, and there were
more. The tree held:

- Hamish Saunders's worked examples in *Solar Arc Directions* (1996), the
  charts of Christopher Reeve (1952–2004), Coretta Scott King (1927–2006)
  and Princess Diana (1961–1997), in the timing tests, the timing
  documentation's example and two smoke scripts;
- Juan Estadella's worked example of Charlie Chaplin's chart (1889–1977),
  *Predictive Astrology*, 3rd ed. (2019), pp. 84–85, in
  `src/progressions.test.ts`, the solar arc invariants and the progression
  evidence of rc.12 to rc.14;
- from two episodes of The Astrology Podcast, the charts of four living
  people, Al Gore and George Lucas in the releasing tests and two in the
  profection tests, and the birth dates of Robert and Ted Kennedy and Lisa
  Marie Presley, taken from the public record, in the profection tests;
- Frida Kahlo's birth time (1907–1954), as the Zodiacs site's demo chart gives
  it, in five test files and the rc.12 site-adoption evidence.

On branch `rc15-fix-records` the rule is: synthetic by default; a worked
example from a published source about a person who has died, cited where it
is used with author, title, year and page; a living person's, never. Saunders's
and Estadella's examples stay, now cited with page wherever they are used
(Saunders's figures are on pp. 3, 4 and 5). Every podcast example on a
person's chart is replaced by invented charts counted by hand from the
rules, and Kahlo's time by a synthetic 1908 birth in Mexico City's local
mean time era, whose JPL positions are in `horizons-1908.txt`. The records
branch left her instant in the rc.12 evidence script, with a comment that
named her, and a test title that dated a birthday in the first cut's test log
(`full-tests.log`). As carried now, the script holds the synthetic birth in
her instant's place and the title is redacted (*The published history*).

## Checks on the first cut's source tree

Run on Node 22.22.2 before `d90a00a` was made, on the tree it holds (the logs
name the commit they sat on, with these changes uncommitted). The re-cut's
are under *The re-cut*, *Gates on the tree*.

| Gate | Result | File |
| --- | --- | --- |
| Typecheck, build, export smoke, package contents, pack dry run | pass | `checks.log` |
| Full test suite | 3,083 passed in 53 files | `full-tests.log` |
| Conformance: self-test, vectors, verdicts, `RESULTS.md` | 7 of 7; 500 conform; every verdict as committed; current | `conformance.log` |
| TypeDoc | 0 errors, 5 warnings (rc.14's tree: 1) | `typedoc.log` |
| Atlas check and self-test | pass; 26 of 26 | `atlas.log` |
| Clean pack, Node 22.22.2 twice, 20.19.0, 24.21.0 | identical | `pack-determinism.log` |

TypeDoc's four new warnings name `CONVENTIONS`, `CONVENTIONS_RC8`,
`CONVENTIONS_RC7` and `CONVENTIONS_RC3`: the time branch annotated
`NATAL_RECEIPT_CONVENTION_SETS` with `typeof` each set, and the sets are not
exported, so the reference names them without pages. The fifth,
`ConventionSet`, is rc.14's. The API reference covers the root, `/geo`,
`/receipt`, `/timing` and `/vedic`.

## After the carrier

The first cut's carrier gates were recorded in `eb58011`, and those of the
re-cut's carrier, `7daf832`, in `bcd532c`, all three local commits (*The
re-cut*, *The gates on the re-cut's carrier*). The gates on the carrier of
the published history follow it in a commit that changes only files under
`docs/evidence/` (*The published history*).

## What is not established

- The time branch had no review before the first cut; the re-cut carries
  the fixes of the review it then had.
- The TT − UTC and UT1 − UTC values after 2026-09-24 are IERS predictions,
  and after 2027-06-28 the leap-second list is carried past its expiry.
- Zone histories before 1970 are tzdb's, with its own uncertainty; the round
  trips check the engine against tzdb, not tzdb against the past. The atlas
  checks some of tzdb's rules against primary sources.
- The true node carries numerical noise of up to about 0.2″ far from J2000
  (0.18″ in 1600 above), in rc.14 as in rc.15.
- The four named ayanamsas and Krishnamurti fail the 0.01″ Swiss gate, as
  recorded.
- The size budgets bound bytes loaded, not time to parse or run them.
- CI has not run this candidate on GitHub Actions; the same scripts ran here.
- No npm publication, merge, push or site adoption is represented here, and
  the reviews are AI-assisted, not human approval.
- No Swiss Ephemeris code, data or per-case output is committed; Swiss was an
  instrument, and only statistics are here.
- The adoption table dates 18 countries. Its public-domain sources do not
  date the first cut's 24 others, and some regions of the 18 (Moravia,
  Zeeland, Drenthe) not at all.
- Whether commercial use of the Vedic star values needs more than the
  attribution `NOTICE` gives is not settled by the CDS's terms, and no terms
  were found for Reid and Brunthaler's two values.
- No IERS statement of terms was found for the IERS data the engine carries,
  C04 included; `LICENSING.md` states only what the distributing pages and
  files say, and the leap-second list's own header, which puts it in the
  public domain.
- The records fixes were measured on their own branch; the re-cut measured
  the merge again (*The re-cut*).
- The re-cut did not run the Swiss Ephemeris comparison again (its data files
  were not on the machine); *The re-cut*, *Measurements*, says why its
  statistics hold.
- The re-cut checked the C04 extract against the file IERS served on
  2026-09-29, whose 1972 rows are the same, not against the file of
  2026-09-28 whose digest the generator pins; the time branch checked that
  one (`generators.log`).
- Figures in the README from rc.14 and earlier candidates (the declination
  errors against DE440s, the obliquity against ERFA, the Sun at the
  solstices) were measured on those builds and not again on rc.15.
- The rule on birth data is the records branch's: worked examples from
  published sources about people who have died stay in the tests, cited
  with page. The published history adds no living person's birth data and
  no real person's but those examples; main's history before `b0ddb88`
  keeps the birth that earlier candidates took from the Zodiacs site's demo
  chart, in their tests and in rc.12's evidence.
- `birth-data-mutations.sh`, `time-basis-fixes.mjs`, the re-cut's analyses
  and the control run of `rebuilt/history-check.mjs` read local commits or
  builds that were never published; they cannot be run again from this
  repository, and their outputs are the record.
- The measurements in `recut/` were taken on the re-cut's tree. This tree's
  build is byte-identical to it (`rebuilt/dist-digest.log`); the package's
  sizes, the archive, the gates on the tree and the corrections were
  measured again on it.

## Reproduction

From a source checkout, with Node 20.19.0, 22.7.0 or later:

```sh
npm ci
npm run typecheck && npm test && npm run build
npm run exports:smoke && npm run package:contents && npm run pack:dry-run
node scripts/verify-archive-binding.mjs
node docs/evidence/rc15-20260929/leap-seconds.mjs leap-seconds.json
node docs/evidence/rc15-20260929/node-velocity.mjs node-velocity.json
node docs/evidence/rc15-20260929/sizes.mjs rc14=<rc.14 package> rc15=<rc.15 package as first cut> fix=. > sizes.json
node docs/evidence/rc15-20260929/rc14-comparison.mjs <rc.14 package> . rc14-comparison.json
git show b0ddb88:conformance/results/zodiacs-engine.json > rc14.json
node docs/evidence/rc15-20260929/conformance-changes.mjs rc14.json conformance/results/zodiacs-engine.json
node scripts/roundtrip-scan.mjs --out roundtrip-default.json
node scripts/roundtrip-scan.mjs --full --out roundtrip-full.json
python3 scripts/verify-jdn.py --json jdn-richards.json
TZDATA_TARBALL=<tzdata2025c.tar.gz> node scripts/build-tz-shards.mjs --check
node scripts/build-time-scales.mjs --check
IERS_FINALS=<finals2000A.all> IERS_C04=<eopc04.1962-now> node scripts/build-time-scales.mjs --check
TZDATA_TARBALL=<tzdata2025c.tar.gz> ZIC=<zic> node docs/evidence/rc15-20260929/tz-line-ends.mjs tz-line-ends.json
TZDATA_TARBALL=<tzdata2025c.tar.gz> ZIC=<zic> node docs/evidence/rc15-20260929/backzone-divergence.mjs backzone-divergence.json
node docs/evidence/rc15-20260929/time-basis-fixes.mjs <first cut, d90a00a, built> . time-basis-fixes.json
node docs/evidence/rc15-20260929/receipt-replay.mjs <rc.14 package> . receipt-replay.json
sh docs/evidence/rc15-20260929/root-isolation-control.sh "$PWD" <scratch directory>
sh docs/evidence/rc15-20260929/birth-data-mutations.sh "$PWD" <scratch directory>
sh docs/evidence/rc15-20260929/horizons-1908.sh > horizons-1908.txt
node docs/evidence/rc15-20260929/review-sample.mjs <rc.14 package> . review-sample.json
node docs/evidence/rc15-20260929/receipt-replay-review.mjs <rc.14 package> .
node scripts/verify-rc10-compatibility.mjs --candidate <absolute rc.15 .tgz> \
  --baseline <absolute rc.10 package directory with its node_modules> --output <absolute .json>
```

The re-cut's measurements and gates, from a checkout of its source commit,
built, with the inputs named in each script's header:

```sh
sh docs/evidence/rc15-20260929/recut/analyses.sh <group> "$PWD" <rc.14 package> <first cut package> \
  <scratch directory> <tzdata2025c.tar.gz> <zic 2025c> <finals2000A.all> [<eopc04.1962-now of today>]
TMPDIR=<tmp> sh docs/evidence/rc15-20260929/recut/gates.sh "$PWD" <directory of node and npm> <scratch directory>
TMPDIR=<tmp> sh docs/evidence/rc15-20260929/recut/pack-matrix.sh "$PWD" <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
```

`<rc.14 package>` is the carried rc.14 archive installed in a directory outside
the checkout, and `<rc.15 package as first cut>` the first cut's archive
(SHA-256 `3651c525…`), unpacked. `cc98060` carried it on a branch that was
not pushed, so it is not in this history; nor is `d90a00a`, which
`time-basis-fixes.mjs` needs built and `birth-data-mutations.sh` reads, nor
the re-cut's archive (SHA-256 `bddfb3b7…`).
`make-receipt-rc14.mjs` says how it made the rc.14 receipt. The
Swiss comparison needs pyswisseph and its ephemeris files:
`python3 docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py --ephe <dir>
--output ayanamsa-swiss.json`.

The re-cut's source commit packed from clean clones, and its carrier's gates,
one job and one Node version per call, each in a clean clone of
`<repository>` (both commits are local):

```sh
TMPDIR=<tmp> sh docs/evidence/rc15-20260929/recut/carrier/pack-source.sh <repository> 51f567e <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
TMPDIR=<tmp> sh docs/evidence/rc15-20260929/recut/carrier/carrier-gates.sh <job> <repository> 7daf832 <work directory> <directory of node and npm>
```

The jobs are `engine`, `archives`, `pack`, `consumer` (after `pack`, on its
archive), `conformance`, `atlas` and `generators` (with `PYTHON` naming a
Python that has pyerfa 2.0.1.5 and numpy 2.4.6).

The published history's measurements, from a checkout of its source commit,
built; `<the re-cut's package>` is the re-cut's archive, unpacked:

```sh
TMPDIR=<tmp> sh docs/evidence/rc15-20260929/rebuilt/gates.sh "$PWD" <directory of node and npm> <scratch directory>
TMPDIR=<tmp> sh docs/evidence/rc15-20260929/rebuilt/pack-matrix.sh "$PWD" <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
node docs/evidence/rc15-20260929/sizes.mjs rc14=<rc.14 package> rc15=<rc.15 package as first cut> recut=<the re-cut's package> rebuilt=. > sizes.json
node docs/evidence/rc15-20260929/rebuilt/corrections-probe.mjs <rc.14 package> .
node docs/evidence/rc15-20260929/rebuilt/history-check.mjs b0ddb88..HEAD <patterns file> <examples file>
```

The history check's two input files are not committed, because they hold
birth data: the patterns searched for, and the published examples' birth
dates. The script's header gives their formats.
