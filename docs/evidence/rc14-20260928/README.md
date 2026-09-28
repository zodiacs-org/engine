# 0.1.1-rc.14 checks, 2026-09-28

rc.14 answers four independent reviews. The first reviewed rc.13 and made
three major, five minor and three informational findings. The second reviewed
a first local build of rc.14 and found one blocker and four minor issues. The
third reviewed a second local build and found no blocker and no major issue,
three minor defects and wording errors in packed files. The fourth reviewed
this build, found no blocker and no major issue, and found that the archive
check could still be steered by the checkout it ran in; commits after the
carrier fix that without changing any packed file (see "After the carrier"
below). rc.13's commits (`f05ea02`, `4eee700`) and its archive (`12db9dce…`)
are unchanged. Each finding below says what changed and which file here shows
it.
`validation.json` gathers the results; every figure in it is read from these
files. Local paths in the outputs are shortened to `<checkout>`, `<work>`,
`<tmp>` and `<consumer>`.

## The archive

`artifacts/zodiacs-engine-0.1.1-rc.14.tgz` is packed from the commit that
brings this version of this file, and carried by that commit's child: SHA-256
`adc9805e22cd2468fa3340a864d9c53b36ff91e8f1592fdb35d8da8b69f4476e`, 87,415
bytes, 30 files. It was packed on Node 22.22.2 (npm 10.9.7). A second clean
build and pack, and clean builds and packs on Node 20.19.0 (npm 10.8.2) and
24.21.0 (npm 11.19.0), gave the same bytes (`pack.json`, `second-pack.json`,
`pack-determinism.log`).

## Two builds superseded before publication

Neither build below was pushed, published or cited anywhere public, and
neither is in any commit of this history, so the archive check has nothing to
record for them. Each time, rc.14 was rebuilt rather than versioned anew.

The first build, SHA-256
`5ed5ca1eebeb5a918ca0e37d80df78669a68c15af6cec6d33c9c8a590f683a02` (85,104
bytes, 30 files), was packed from `74a4471` and carried locally in `cca9f44`.
Its review found:

- a blocker: it packed LICENSING.md from before main's conformance section, so
  merging main, as the release must, changed a packed file under the same
  version, and the archive check would fail on the merge;
- three ways past the archive check;
- the chart's Sun flagged out of bounds far from J2000: at 1,408 of the 7,995
  solstices in `EPHEMERIS_SPAN`, by the corrected count below (none in
  rc.13);
- NOTICE, LICENSING.md and the README naming the wrong file for the Table S15
  values.

`cca9f44` was dropped, `74a4471` stays as the base of the fixes, and main
(`8c4946b`) was merged into it in `8c3d94f`.

The second build, SHA-256
`d3106eb39fcad0b0cee1ad9010c5b44c01acb8fc3a1bac28a84abf66bacee5e4` (86,867
bytes, 30 files), was packed from `90d6cdb`, which holds the fixes for the
first build's review, and carried locally in `a4ee426`; `a0440c2` followed with
the conformance results. Its review found three more ways past the archive
check and wording errors in the packed README and CHANGELOG, which only a new
archive can correct: a solstice count one short, a timing taken from the first
build, a licensing paragraph that left out `dist/deltat.js`, and a link to a
branch. `a4ee426` and `a0440c2` were dropped, `90d6cdb` stays as the base,
and the fixes, the conformance results and this archive follow.

## Findings of the rc.13 review

### 1. Supported Node versions (major)

`engines` said `>=18`. astronomy-engine 2.1.19 ships ES modules in a package
without `"type": "module"`, and plain Node loads them as ES modules only from
20.19.0 and 22.7.0. `package.json` now says `"^20.19.0 || >=22.7.0"`, the
README gives the reason and says bundlers are unaffected, CI installs the
packed archive in a clean consumer on 20.19.0, 22.7.0, 22 and 24, and the
consumer check refuses an older runtime and says why.

- `node-support.log`: a plain `import` of the packed archive fails with "Named
  export 'Body' not found" on 18.20.8, 20.18.3, 21.7.3 and 22.6.0, and loads
  on 20.19.0, 22.7.0 (with a `MODULE_TYPELESS_PACKAGE_JSON` warning), 22.22.2
  and 24.21.0.
- `packed-consumer-matrix.json`: the full consumer check (types and 25
  behaviour groups) passed on 20.19.0, 22.7.0, 22.22.2 and 24.21.0 against the
  same archive; `packed-consumer.json` is the 22.22.2 run in full.
- Node 18.20.8, 20.18.3, 20.19.0, 22.6.0 and 22.7.0 were downloaded from
  nodejs.org and checked against its `SHASUMS256.txt`; 21.7.3, 22.22.2 and
  24.21.0 are the ones rc.13 used.

### 2. Archive binding (major)

`scripts/verify-archive-binding.mjs` works from a manifest,
`artifacts/archives.json`, which records each archive's version, digest, size,
file count and source commit. It reads every commit reachable from HEAD (`git
rev-list HEAD`, then each commit's tree), so no history simplification can
hide a side branch. rc.11's first packing, `13d637db…`, is allowed only in
`00bdae7`. Every carried version's receipt must name its recorded bytes. Each
archive is bound to its source commit: that commit is in history and names the
version, the commit that introduces the archive is the source commit or a
child of it, and the packed `package.json`, README, CHANGELOG, LICENSE,
LICENSING.md and NOTICE are byte-identical to the source commit's.
`--rebuild-all` rebuilds every archive from its source commit in a temporary
worktree; a second CI job runs it. The later reviews' fixes to this check are
under M1 and B1, and F1 to F3, below.

- `review-synthetic.log`: the first review's two synthetic repositories,
  copied and given one commit that records the manifest. The rc.13 check
  passes both. The rc.14 check fails both: it names the side-branch repack
  (`e1510363…` in `eabd776`), the 0.0.2 archive carried and removed on another
  side branch, and the restored `13d637db…`, besides what does not fit the
  manifest in those synthetic trees, such as an archive that is not a tar file.
- `archive-binding.log`: the default check on Node 20.19.0, 22.22.2 and
  24.21.0 before rc.14's archive is committed, so its rebuild is skipped: 8
  recorded archives (7 carried, 1 superseded) across 46 commits. It ran before
  the source commit existed, with HEAD at `90d6cdb`; the runs at the head of
  the follow-up after the carrier are in `followup/archive-binding.log`.
- `archive-rebuilds.log`: `--rebuild-all` rebuilt all eight recorded archives
  from their source commits, rc.11's superseded packing included, byte for
  byte, each in a worktree that `npm ci` installed afresh.

### 3. The Sun's exemption (major)

rc.13 said the Sun defines the bound and so is never beyond it. That is wrong.

- `sun-solstices.json`: computed with ERFA (IAU 2006/2000A, the Earth from
  `erfa.epv00`), the real Sun is beyond the true obliquity at 402 of the 800
  solstices from 1800 to 2199, by up to 1.09″. DE440s agrees within 0.008″
  over 1850–2149, where it has 300 of 600, by up to 1.09″.
- The engine's margin is beyond at 400 of the 800, by up to 1.35″, and has
  the real sign at only 404. At the solstices its solar latitude averages
  −1.12″ in 1800–1899 and +1.12″ in 2100–2199; the real Sun's averages zero.

The exemption is documented as a convention, because the engine's solar
declination error is larger than the effect. The CHANGELOG's rc.13 entry, the
README and the test comment are corrected. The 2024 June and 1970 December
solstices in the tests are the two examples in `sun-solstices.json`: the real
Sun 0.59″ inside and 0.05″ beyond, the engine 0.19″ and 0.21″ beyond. Which
rows it covers changed again under M2 below.

### 4. The margin, and the obliquity (minor)

(a) Each row has `boundMarginArcsec`. `declination-truth.json` compares the
engine with DE440s at 20,000 seeded instants from 1850 to 2150. The largest
declination errors, which the README tabulates, run from 2.7″ (Sun) to 21.6″
(Saturn). In that sample the engine's margin and DE440s's had opposite signs
only where the engine's margin was smaller than the body's largest error: at
most 16.0″, for Uranus. The review's three wrong-sign examples are reproduced
there: at their instants the engine puts Mars and Venus 1.57″ and 1.86″ inside
the bound where DE440s has them 1.05″ and 1.24″ beyond, and Mercury 2.09″
beyond where DE440s has it 1.40″ inside.

(b) `trueObliquity` is documented as astronomy-engine's five-term truncation
of IAU 2000B. `declination-truth.json` measures it against ERFA's `obl06` plus
`nut00b` (85.6 mas at most) and plus `nut06a` (85.4 mas).

### 5. Exact separations (minor)

`src/declination.test.ts` checks the review's cases, (−1e-20, 0) → 1e-20 and
(−0.1, 0.2) → 0.30000000000000004, and 3,000 random pairs of every scale
against BigInt rationals. The packed consumer checks the first two.

### 6. The rc.13 migration note (minor)

Reworded with the real bound, about 2⁻⁴⁴°. `orb-difference.json`: over 200,000
random pairs the largest difference between rc.12's and rc.14's orbs is 2⁻⁴⁵°,
and the review's example (Moon 331.026, Sun 103.38600000000001, 132.36°) is
orb 0 in rc.12 and 2⁻⁴⁶° in rc.13 and rc.14.

### 7. The ephemeris span (minor)

`EPHEMERIS_SPAN` is astronomy-engine's own tabulated range, TT J2000 ± 730,000
days, beyond which its source calls the computation "super slow".
`far-dates.json`: rc.13 took more than 20 s for a position on −30000-06-01 and
on 30000-06-01, and put the Sun 32.5° and 29.3° off the ecliptic; rc.14
refuses both in about a millisecond, and still evaluates the instants just
inside the span. `src/ephemeris-span.test.ts` covers every entry point and a
pinned ΔT clock.

### 8. Naming, and the reference URL (minor)

The shipped CHANGELOG no longer names the separate earlier package's npm
package, and `npm run package:contents` fails if any packed file does. TypeDoc
canonical URLs point to https://zodiacs.org/developers/engine/reference/.

### 9–11. Informational

- Labels: the rule is stated in UTF-16 code units, with `trim`'s white space,
  C0 controls and DEL rejected, and C1 controls, U+200B and lone surrogates
  accepted. The CHANGELOG records rc.13's message change.
- `performance.json`, fastest of 63 runs per build on a shared four-core
  machine: in the review's worst case `findConfiguredAspects` took 1.72 s in
  rc.14 and 0.19 s in rc.12, and `findDeclinationAspects` 0.47 s and 0.07 s.
  An ordinary chart's configured aspects and declinations took under 0.3 ms
  each. It was measured on the second build, whose `dist/` this build's
  matches file for file (`dist-identity.log`), and the CHANGELOG gives these
  figures alone.
- Licence: `MIT AND CC-BY-4.0`. `package-contents.log` shows the check that
  `package.json`, LICENSING.md, NOTICE and the README agree, and the packed
  consumer checks the installed metadata.

## Findings of the review of the first rc.14 build

### B1. The merge of main (blocker)

main (`8c4946b`, the conformance suite) adds a section to LICENSING.md, which
is packed. The first build predated it, so a merge of main changed a packed
file under a version already carried. The default check rebuilds the checkout
and so failed on such a merge; `--rebuild-all` rebuilt only source commits and
passed. Now:

- main is merged first (`8c3d94f`, LICENSING.md keeping both rc.14's licence
  statement and main's section), and the archive is built from a source commit
  that contains the merge;
- both modes rebuild a clean worktree of HEAD, so `--rebuild-all` cannot pass
  where the default fails.

`b1-replay.log` (`b1-replay.sh`) replays the blocker on real history in a
throwaway clone: the first build carried on `74a4471`, then main merged. Both
modes fail on HEAD's rebuild, whose LICENSING.md differs (it packs to
`861e9000…`, 85,298 bytes, as the review found), while every recorded archive,
the first build included, still rebuilds from its source commit.
`scripts/verify-archive-binding.test.mjs` has the same case on a synthetic
package that npm packs.

### M1. Three ways past the archive check (minor)

- Manifest edits: the check trusted `archives.json` as it stood at HEAD, so a
  rewritten manifest could whitelist replaced bytes. The manifest is now
  append-only: every committed version of it must be a prefix of HEAD's, and
  each commit's must extend its parents'. Superseded entries are pinned in the
  script, and a manifest cannot add one.
- Symbolic links: `artifacts/` could be a symbolic link to other bytes in some
  commit, or at HEAD, restored later by a merge. In every commit, `artifacts/`,
  where present, must now be a real directory holding only regular files named
  as archives, receipts, `archives.json` or `README.md`.
- The working tree: the check read HEAD's files from disk. It now reads git
  objects only, and rebuilds HEAD in a clean worktree. An archive that HEAD
  does not hold fails even when it is on disk, and uncommitted changes neither
  pass nor fail the check. The rebuild still took the checkout's
  `node_modules` when the lockfiles matched; F2 below removes that.

The README and `artifacts/README.md` now state exactly what the check
guarantees, and that it cannot detect history rewritten before CI sees it and
needs merge commits (a squash or rebase merge drops the source commits).

- `review-binding-attacks.log`: the review's ten synthetic cases
  (`review-binding-attacks.mjs`), run against this check. It refuses all eight
  attacks; the clean baseline and case 4, a dirty working tree over a correct
  HEAD, pass, as they should. The review's case 5 committed through a helper
  that ran `git add -A`, which added its "untracked" archive back; this copy
  commits without it, and the check fails the case.
- `scripts/verify-archive-binding.test.mjs`: 17 cases, among them each bypass
  the reviews found and the blocker, run in `npm test`.

### M2. The chart's Sun far from J2000 (minor)

The first build exempted a `Sun` row only within 0.001° of the ecliptic. The
engine's own solar latitude exceeds that at most solstices far from J2000 (the
longest run of years in which both stay within it is 1641 to 2413), reaching
−68.3″ at the June solstice of year 2 and +25.8″ at that of 3902, while the
real Sun's stays within about 1.2″. `chartDeclinations` now exempts the
chart's own Sun at any latitude, as rc.13 did; the latitude rule applies to
rows supplied to `declinationsForBodies`.

- `sun-span.json`: at the engine's own 7,995 solstices in the span (June and
  December of years 1 to 3997, and June of 3998), its solar latitude exceeds
  3.6″ at 5,403, with a positive margin at 1,408. rc.13 flags none of them,
  the first rc.14 build all 1,408, and this build none. The last, the June
  solstice of 3998 (3998-06-19T17:56:46Z), has a margin of +29.4″.
- The first build flags no solstice before 2591. Before 2000 the latitude
  exceeds 3.6″ at 2,512 solstices, and the largest margin among them is
  −3.608″: the latitude has the sign that pulls the Sun inside the bound, so
  no early solstice can test the fix.
- `src/declination.test.ts` checks 2591-06-20T20:25:27.709Z, the earliest
  solstice the first build flags, 2600-06-21T00:50:56Z and the June solstice
  of 3902: the chart's Sun is not flagged, while the same rows given to
  `declinationsForBodies` are. All three fail on `74a4471`'s source and pass
  on this one (`pre-fix-failures.log`). The June solstice of year 2, which the
  test checked until the third review, has a margin of −68.3″, and the first
  build did not flag it either.

### M4. The Table S15 values' file (minor)

NOTICE, LICENSING.md and the README said the values are in `dist/deltat.js`,
a 161-byte re-export. They now say the package's ΔT module, exported as
`@zodiacs/engine/deltat`, is in a shared chunk under `dist/` that
`dist/deltat.js` re-exports. `npm run package:contents` checks that exactly one
packed chunk holds the model and that `dist/deltat.js` re-exports it, without
naming the chunk's hashed file name, and, since the third review, that NOTICE,
LICENSING.md and the README all say `dist/deltat.js` re-exports it.

### Informational

- The earlier CHANGELOG entries now name pull request #5 of
  github.com/ZodiacsOfficial/sdk, which a reader can check.
- The CHANGELOG's timings gave a range, 1.7 s to 1.9 s and 0.45 s to 0.48 s;
  the third review found the 0.45 s taken from the first build, and they now
  give this build's measurement (P2 below).
- The README and `artifacts/README.md` say to merge with merge commits.
- The TypeDoc canonical URL is unchanged; the site serves it.

## Findings of the review of the second rc.14 build

### F1. Versions that npm reads as the same (minor)

The check keyed archives by file name, so a second archive under
`0.1.1-rc.14+evil`, packed from a source commit with that version and changed
engine code, passed in both modes; so did `v0.0.1` beside `0.0.1` in the
review's synthetic cases, and a packed file changed under a HEAD version that
differs only in build metadata, which skipped HEAD's rebuild. npm's
`semver.eq` takes each of these for the other version. Every recorded version,
every version in an archive's or receipt's file name, and `package.json`'s at
HEAD must now be a strict semantic version (SemVer 2.0.0 with no `v` prefix and
no build metadata), and no two carried versions may be equal under
`semver.eq`.

- `semver-replay.log` (`semver-replay.sh`): on real history, the review's
  attack, which packs `0.1.1-rc.14+evil` to `dff11aca…` as the review found,
  and a README changed under `0.1.1-rc.14+changed`. The check at `90d6cdb`
  passes both, by default and with `--rebuild-all`; this one fails both.
- `final-review-attacks.log` (`final-review-attacks.mjs`): the review's 16
  synthetic cases, copied with a two-line note at the top. This check refuses
  all 15 attacks, among them N3, N3b and N10, which are these, and passes the
  control.
- `scripts/verify-archive-binding.test.mjs` has all three cases.

### F2. The rebuild and the checkout's `node_modules` (minor)

HEAD's rebuild reused the checkout's ignored `node_modules` when its lockfile
matched the commit's, so the check did not read git objects only: the
review's replaced `tsup` gave a false failure, and a false pass for changed
engine code. Each rebuild's worktree now installs its commit's locked
dependencies afresh with `npm ci` (the npm cache may supply them) and builds
with those alone. Nothing is linked or reused from the checkout, and the
rebuild runs with no `node_modules/.bin` on `PATH` (`npm run` puts the
checkout's there), no `NODE_PATH`, and none of npm's variables naming the
checkout's package. The wording in the README, the CHANGELOG,
`artifacts/README.md` and the script's header was re-read, and each says how
the rebuild installs. That wording, and this source commit's message, called
the claim exact; it was not until the follow-up after the carrier (see "After
the carrier" below).

- `node-modules-replay.log` (`node-modules-replay.sh`): the review's
  demonstration on real history, with the second build carried on `90d6cdb`.
  The check at `90d6cdb` fails with a failing `tsup` and passes changed engine
  code with a `tsup` that copies `dist/` from the carried archive. This one
  passes the first and fails the second, run directly or with the clone's
  `node_modules/.bin` first on `PATH`, and with `--rebuild-all`.
- `scripts/verify-archive-binding.test.mjs`: the same on a synthetic package
  whose lockfile supplies its own `tsup`, run directly and as `npm run` starts
  it; and a build tool that only the checkout's `node_modules/.bin` holds is
  not found.

### F3. A case variant of `artifacts/`

The review's synthetic case N9, `Artifacts/` beside `artifacts/`, passed. On a
case-insensitive checkout its files would be written over `artifacts/`'s. The
check now refuses another top-level name that differs from `artifacts` only in
case, and two names under `artifacts/` that do (such as the archives of
`0.0.1-RC.1` and `0.0.1-rc.1`). `final-review-attacks.log` and a test show it.

### F4. A model name in rc.11's evidence (minor)

This came with main. `docs/evidence/rc11-20260928/RESULTS.md` named a model
in one sentence, which now reads without it. Six files there had a scratch
directory named after one in their paths; that path component is now
`continuation`, and RESULTS.md, the directory's index (it has no README), says
in one line that the paths were neutralized on 2026-09-28. Nothing else in
those files changed, and rc.13's evidence is untouched.

### P. Wording in the packed files

1. The span holds 7,995 solstices, not 7,994. `sun-span.mjs` stopped at 3997
   and so missed the June solstice of 3998, which the first build would also
   have flagged: 1,408 in all, not 1,407. The scan, `sun-span.json`, the
   CHANGELOG and this file are corrected.
2. The CHANGELOG's "0.45 s to 0.48 s" took 0.45 s from the first build's
   measurement. It now gives `performance.json`'s figures alone: 1.72 s and
   0.47 s, where rc.12 took 0.19 s and 0.07 s.
3. The README's licensing paragraph now says, as NOTICE and LICENSING.md do,
   that `dist/deltat.js` re-exports the chunk that holds the ΔT values.
4. The README linked the site's evidence ledger on a branch. It now links it
   at commit `75ae549` of github.com/ZodiacsOfficial/site, which is on that
   repository's main branch.

### Informational

- The year-2 test case, whose margin is −68.3″, is replaced as M2 above
  describes.
- The section on the archive above no longer says it is carried by "the
  commit after the one that adds this directory".
- `artifacts/README.md` names `cca9f44`, which carried the first build, and
  records the second build.
- The second build is recorded above, with why it was superseded.

## Gates

| Gate | Result | File |
| --- | --- | --- |
| Typecheck, Node 22.22.2, 20.19.0, 24.21.0 | pass | `typecheck.log`, `test-matrix.log` |
| Tests, Node 22.22.2, 20.19.0, 24.21.0 | 2,681 passed in 34 files, each | `full-tests.log`, `test-matrix.log` |
| New and changed tests on earlier sources | fail as they should: 31 of 63 on rc.13's, 16 of 42 on the first rc.14 build's, 5 of 17 on the second's | `pre-fix-failures.log` |
| Build, export smoke, package contents, pack dry run | pass | `build.log`, `exports.log`, `package-contents.log`, `pack-dry-run.log` |
| Pack determinism (Node 20.19.0, 22.22.2 twice, 24.21.0) | identical | `pack-determinism.log` |
| `dist/` against the second build's | identical | `dist-identity.log` |
| Packed consumer (Node 20.19.0, 22.7.0, 22.22.2, 24.21.0) | pass | `packed-consumer-matrix.json` |
| Plain import on unsupported and supported Node | fails and loads as documented | `node-support.log` |
| Archive binding, default (Node 20.19.0, 22.22.2, 24.21.0) | pass | `archive-binding.log` |
| Archive binding, `--rebuild-all` | 8 of 8 identical | `archive-rebuilds.log` |
| The first review's synthetic repositories | rc.13's check passes both, this one fails both | `review-synthetic.log` |
| The second review's attacks | all 8 refused | `review-binding-attacks.log` |
| The blocker replayed on real history | both modes fail, as they must | `b1-replay.log` |
| The third review's attacks | all 15 refused, the control passes | `final-review-attacks.log` |
| Versions npm reads as the same, on real history | `90d6cdb`'s check passes both cases, this one fails both | `semver-replay.log` |
| The checkout's `node_modules`, on real history | `90d6cdb`'s check fails and passes wrongly, this one does not | `node-modules-replay.log` |
| Exact rc.10 compatibility | 571 of 571 | `compatibility.json` |
| Exact oracle (rc.13's script) | 53,168 cases, 0 mismatches | `exact-oracle.json` |
| Independent progression mapping | 204 cases, within 1 ms | `progression-independent.json` |
| The chart's Sun at every solstice in the span | flagged at none of 7,995 | `sun-span.json` |
| Site adapter parity (site `f2bd0dd`) | 1,020 of 1,020 rows exact | `site-adoption-parity.json` |
| Conformance: self-test, vectors, verdicts, RESULTS.md | 7 of 7; 500 conform; 232 pass, 222 fail, 46 unsupported, as committed; current | `conformance.log` |

`conformance/results/` is regenerated for rc.14 in the source commit, on Node
22.22.2 as its CI job pins: every verdict is unchanged, and the files differ
from main's only in the version they name. The same gates are rerun on the
carrier commit from a clean full-history clone and reported with it, since that
record cannot precede the archive.

## After the carrier: the check made exact

The fourth review checked the rebuilt rc.14: source `03db4bb`, carrier
`b221534`, archive `adc9805e…`. It found no blocker and no major issue. The
archive reproduces on five Node versions, and a simulated merge onto main
passes every CI job. The archive, `03db4bb` and `b221534` are unchanged. The
commits after the carrier change the check, its tests, CI's workflow and
unpacked documentation (`artifacts/README.md` and this file), and no packed
file.

### What was not exact

`03db4bb`'s message says that the claim that the check reads git objects only,
never the working tree, is "now exactly true". The packed README and CHANGELOG
say that each rebuild "takes nothing from the checkout's `node_modules`" and
that no two carried versions may be equal as npm compares them. At `03db4bb`
and `b221534` none of this was exact. Started with `npm run archive:binding`,
as CI's engine job and the documentation started it, the checkout could still
decide the verdict:

- git was found through `PATH`, where `npm run` puts the checkout's
  `node_modules/.bin` first, so a git there could check out HEAD's parent when
  asked for HEAD;
- an `.npmrc` in the checkout could name code with `node-options`, which npm
  passes on as `NODE_OPTIONS` into the check and every process it started, the
  build included;
- with `TMPDIR` inside the checkout, `npm run build` in a rebuild put the
  checkout's `node_modules/.bin` on `PATH` as an ancestor's, so a tool planted
  there ran;
- `git worktree add` ran the post-checkout hook in the checkout's `.git`,
  which could put other sources into the rebuild.

And npm's `semver.eq` compares numeric identifiers as JavaScript numbers, so
above 2^53 − 1 it takes two versions that `03db4bb`'s check accepted as strict
for one, such as `0.0.1-9007199254740992` and `0.0.1-9007199254740993`: both
could be carried side by side, and a packed change with HEAD at the other
spelling skipped HEAD's rebuild. `03db4bb` cannot be amended, since `archives.json` records it
as rc.14's source commit. The packed sentences are exact for the check as it
stands after the carrier, which is the check CI runs.

### What changed

- git and npm are the first found on `PATH` outside the checkout, never in a
  `node_modules/.bin`, and the check fails if there is none. Every process it
  starts runs with that `PATH`, the running Node's directory first, and
  without `NODE_OPTIONS`, `NODE_PATH` or any `npm_*` variable; git runs
  without any `GIT_*` variable but the two named below.
- With `NODE_OPTIONS` set, or options given to node itself, the check first
  restarts itself in a new Node process without them, since code they name has
  already run in the first one. This machine sets
  `NODE_OPTIONS=--max-old-space-size=8192`, so the logs here show that restart.
- A `TMPDIR` inside the checkout, or with a `node_modules` or `package.json`
  at or above it, is refused, as the packed-consumer check refuses such a
  location for its consumer.
- Rebuilds no longer use `git worktree add`. Each writes the commit's tree
  from git objects (`git ls-tree` and `git cat-file --batch`) into a new
  temporary directory, so no hook, filter, attribute or sparse pattern of the
  checkout applies; "a clean worktree of HEAD" in the packed README and
  CHANGELOG now means that directory. Every git command runs with
  `core.hooksPath` set to the null device, and with grafts, replace refs and
  the commit-graph file ignored (`GIT_GRAFT_FILE`, `GIT_NO_REPLACE_OBJECTS`,
  `core.commitGraph=false`), which could otherwise hide a commit from
  `rev-list` or give other bytes for an object. Blobs are read with
  `git cat-file`, not `git show`.
- No version the check reads may have a numeric identifier above
  9007199254740991, and HEAD's version may not be `semver.eq` to a carried one
  under another spelling. The check computes `semver.eq` as semver 7 does,
  including its habit of deciding a prerelease at the first identifiers that
  differ as strings, so `0.0.1-9007199254740992.1` and
  `0.0.1-9007199254740993.2` are equal to it too.
- A top-level name that normalizes to `artifacts` (default-ignorable
  characters removed, NFKC, case-folded) but is not `artifacts` is refused,
  such as `artifacts` followed by U+200C or spelled with a fullwidth `ａ`; so
  are two names under `artifacts/` that normalize to one.
- CI's engine job starts the check with
  `node scripts/verify-archive-binding.mjs`. `npm run` reads the checkout's
  `.npmrc` before the check starts, and that file can replace the command npm
  runs.

### Evidence

- `followup/checkout-replay.log` (`checkout-replay.sh`): the four cases on real
  history, in a clone of `b221534` with engine code changed under
  0.1.1-rc.14. `b221534`'s check passes all four; this one fails each, with
  the honest verdict or by refusing the TMPDIR, and the planted git and hook
  never run.
- `followup/second-review-attacks.log` (`second-review-attacks.mjs`): the
  review's ten synthetic cases, copied with a two-line note at the top. This
  check refuses all eight attacks, and the two controls fail for the honest
  reason.
- `scripts/verify-archive-binding.test.mjs`: 23 cases, among them the git on
  `PATH`, the `.npmrc` `node-options`, the TMPDIR (inside the checkout, and
  below a `node_modules` or a `package.json`), the post-checkout hook, replace
  refs and grafts, numeric identifiers above 2^53 − 1, and the names.
  `followup/pre-fix-b221534.log`: with `b221534`'s check, 7 of the 23 fail,
  each because an attack passes.
- `followup/semver-eq-check.log` (`semver-eq-check.mjs`): on 200,007 seeded
  pairs of versions, valid and not, the check's `semver.eq` agrees with the
  semver that npm 10.8.2, 10.9.7 and 11.19.0 bundle (7.6.2, 7.7.4, 7.8.5), and
  no two distinct versions that the check accepts are `semver.eq`.

### What the check guarantees

On a clean checkout with full history, such as CI's, the check establishes
that every archive ever carried holds only its recorded bytes and is what its
recorded source commit builds. It protects against commits that repack,
replace, remove or re-version a carried archive, rewrite the manifest, hide
such a change on a merged side branch, carry a second archive under a version
npm takes for an existing one, or change a packed file under a version already
carried. When it runs in a working checkout, nothing there beyond its git
objects decides the verdict: not its files or `node_modules`, not the tools
`npm run` puts on `PATH` from it, not a `TMPDIR` inside it, and not hooks,
grafts, replace refs or a commit-graph file in its `.git`. It does not protect
against history rewritten before CI sees it, a squash or rebase merge (which
makes it fail), a change to the check or to CI's workflow, which review must
catch, or whoever controls the machine that runs it (its git, Node and npm,
their system and user configuration, the git object store, the environment),
who can defeat any local check.

### A note on links

The packed README and CHANGELOG name the GitHub organization by its former
name, ZodiacsOfficial: the site's evidence ledger at commit `75ae549` and pull
request #5 of `github.com/ZodiacsOfficial/sdk`. GitHub's redirect for the
renamed organization serves those links. They change with rc.15.

## What is not established

- The DE440s declination errors are maxima of a seeded sample, not bounds, and
  cover 1850–2150 only.
- The Sun's exemption is a convention. The engine cannot say whether the real
  Sun is beyond the bound at a given solstice.
- `EPHEMERIS_SPAN` is where astronomy-engine evaluates at all, not where it is
  accurate; accuracy was compared only within `REFERENCE_SPAN`.
- The archive check cannot detect history rewritten before CI sees it, and
  needs merge commits. Its rebuilds need the npm registry, or an npm cache that
  holds each commit's locked packages. Whoever controls the machine that runs
  it can defeat it, as any local check; CI's clean checkout is the run that
  counts.
- The physical 0.01″ declination target remains unmet.
- The CI jobs added in rc.14 (the packed consumer on each runtime,
  `--rebuild-all`) have run here with the same scripts, not yet on GitHub
  Actions.
- Timings come from a shared machine; the ratios between versions are more
  telling than the absolute figures.
- No npm publication, merge, push or site adoption is represented here, and
  the reviews are AI-assisted, not human approval.
- No Swiss Ephemeris code, data or output was used. ERFA and DE440s are the
  references, and only statistics and a few examples are committed.

## Reproduction

From a source checkout, with Node 20.19.0, 22.7.0 or later:

```sh
npm ci
npm run typecheck && npm test && npm run build
npm run exports:smoke && npm run package:contents && npm run pack:dry-run
node scripts/verify-archive-binding.mjs
node scripts/verify-archive-binding.mjs --rebuild-all
mkdir -p "$PWD/../pack" && npm pack --ignore-scripts --pack-destination "$PWD/../pack"
TMPDIR=/a/directory/without/node_modules/above \
  npm run consumer:smoke -- "$PWD/../pack/zodiacs-engine-0.1.1-rc.14.tgz"
```

The comparisons need Python 3 with numpy, pyerfa and jplephem, and JPL's
`de440s.bsp` (SHA-256
`c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`):

```sh
python docs/evidence/rc14-20260928/sun-solstices.py dist/index.js de440s.bsp sun-solstices.json
python docs/evidence/rc14-20260928/declination-truth.py dist/index.js de440s.bsp declination-truth.json
```

`performance.mjs`, `far-dates.mjs` and `sun-span.mjs` take
`<label>=<dist/index.js>` for each build to compare, `orb-difference.mjs` two
builds' `dist/index.js`, `node-support.sh` an archive and a list of Node `bin`
directories, `review-synthetic.mjs` the first review's directory and this
checkout, `review-binding-attacks.mjs`, `final-review-attacks.mjs` and
`followup/second-review-attacks.mjs` this checkout's check and a scratch
directory, `b1-replay.sh` this checkout and the first build's archive,
`semver-replay.sh` and `node-modules-replay.sh` this checkout and the second
build's archive, which is what `npm pack` gives for `90d6cdb`,
`followup/checkout-replay.sh` this checkout, and `followup/semver-eq-check.mjs`
the check and one or more semver package directories. The replays run the
check's rebuilds, so `TMPDIR` must be outside the checkout with no
`node_modules` or `package.json` above it.
