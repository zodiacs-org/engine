# 1.0.0 checks, 2026-10-11

1.0.0 is the first stable release: 1.0.0-rc.2 with the version changed. It
is two commits on main as it stood at `9a6317a` (the merge of
zodiacs-org/engine#38), whose packed files are 1.0.0-rc.2's: CI's archive
check rebuilt `artifacts/zodiacs-engine-1.0.0-rc.2.tgz` from that tree byte
for byte, and so did a run on this machine (Node 22.22.2, 2026-10-10).

1. `3a4b8a6`, the version commit: the version, the generated records that
   carry it, the CHANGELOG entry, the README's release lines, the size notes,
   and its checks, kept in `version-commit-3a4b8a6/` and below.
2. `ca2c8ce`, the source commit of this release. It acts on the independent
   review of `3a4b8a6` (*Reviews*): the CHANGELOG entry's paragraph on
   platforms and its path for callers on npm's 0.1.1-rc.15, the README's line
   for them, and this record.

Two commits follow it: `38d3185` carries the archive packed from it (*The
archive*), and the commit that brings this version of this file records the
gates on the carrier and the search for birth data.

The owner approved cutting 1.0.0 and publishing it under npm's `latest` once
every gate, review and private search passes (2026-10-11, recorded in the
site repository's `docs/platform/programme/DECISIONS-2026-10-11.md`, in
zodiacs-org/site#704). Engine issue #32 holds the proposal and its scope.

Every figure below is read from a file in this directory or in one it names,
or from the CI run it names. Local paths in the outputs are shortened to
`<checkout>`, `<scratch>`, `<tmp>` and, for the directory of the Node binary,
`<bin>`.

## What changes from 1.0.0-rc.2

Only what carries the version, and documents:

- `package.json`, the lockfile, `ENGINE_VERSION` (`src/types.ts`),
  `typedoc.json` and the two tests that pin the version: 1.0.0.
- `src/fixtures/calc-roundtrip.json`, rebuilt by
  `scripts/build-calc-roundtrip.mjs` on Linux x86-64: the version in 30
  places and nothing else. Rebuilt on this machine, arm64, it would also move
  three numbers of one case (*Platforms*).
- `conformance/`, run again on Linux x86-64 with Node 22.22.2, the version CI
  pins: the version alone changes in the results, and the hand-written notes
  name 1.0.0. The 500 verdicts are 1.0.0-rc.2's: 267 pass, 192 fail, 41
  unsupported, none in error.
- `CHANGELOG.md`: the 1.0.0 entry. `README.md`: the release, how to install it
  from npm, the line for callers on 0.1.1-rc.15, and two phrases written for
  an earlier candidate, one about rc.16's build and one about 1.0.0-rc.1's
  work, that called it this candidate's.
- `scripts/verify-package-contents.mjs`: the sizes beside the budgets; none
  is raised.

## Reviews

An independent review of `3a4b8a6`, by an agent with a fresh context that
was given the claims and the repository's rules but not the author's
reasoning, rebuilt the tree on its own clone, ran the CI workflows' jobs on
Node 20.19.0, 22.7.0, 22.22.2 and 24.21.0, packed the tree on all four (the
same bytes as CI's x86-64 pack), simulated the carrier and the Release
workflow's checks, and probed. It found no blocker and these faults, each of
which this commit acts on:

- **Major: the paragraph on platforms understated the differences.** It said
  "last bits" where the arm64 differences reach 1.42e-11° a day in a speed,
  called a chart digest "a chart's", gave an angle that was a Moon longitude
  and rounded its size down, and left out that the Node version and the
  JavaScript engine matter too, and the conformance residual. The paragraph
  now gives measured figures (*Platforms*).
- **Major: callers on npm's `latest`, 0.1.1-rc.15, were not sent to
  0.1.1-rc.16's entry**, which has breaking changes and its own *Migration*.
  The CHANGELOG entry and the README now say so.
- **Minor: the x86-64 claims had no committed evidence at `3a4b8a6`.** This
  record now cites CI run 38093582694 on `3a4b8a6` and commits the Linux run
  and the platform probes.
- **Minor: wording.** "passes the rest" left out the skipped test; the count
  on Node 22.22.2 depended on an existing build; one of the two README phrases
  was 1.0.0-rc.1's, not rc.16's. All corrected here.
- **Minor: the Release workflow's tag defaults to `next`.** It is to be run
  with `tag` set to `latest` (*Publishing*).
- **Info: the carrier must be a direct child of the source commit**, as
  1.0.0-rc.2's was; the record commit follows the carrier.

## What did not change

`tools/compare-rc2.mjs` compares this tree's build with the carried
1.0.0-rc.2 archive, unpacked, on one machine (`results/`):

- **Values.** 1.0.0-rc.1's battery, `../1.0.0-rc.1-20261006/tools/values.mjs`,
  unchanged, runs 6,417 calls over the twelve entry points, each package in
  its own process. The two runs are the same bytes
  (`results/values-compare.txt`). The same battery on Linux x86-64 with Node
  22.22.2 prints, for 1.0.0, the very bytes 1.0.0-rc.1's and 1.0.0-rc.2's
  records give, SHA-256 `63bd60bf…` (`results/values-by-runtime.json`).
- **The API.** All 22 declaration files are 1.0.0-rc.2's byte for byte
  (`results/declarations.txt`), and `npm run api:check` finds the twelve
  entry points as `api/` has them.
- **The JavaScript.** Each of the 46 built files equals one of the archive's
  once the content hash in a chunk's file name and the version string are set
  aside; one file holds the version (`results/javascript.txt`).

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.0.0-rc.2
archive and this tree. Each import graph that loads the engine's version is
five bytes smaller, the length of `-rc.2`; `./crossings`, `./deltat`,
`./geo` and `./houses` are unchanged. The package is 991,915 bytes unpacked in
74 files, 2,387 more than 1.0.0-rc.2's 989,528: the CHANGELOG entry and the
README's lines. The cap of 1,000,000 is not raised and leaves 8,085 bytes.

## Platforms

The package's results depend on the JavaScript engine, its version and the
processor. `tools/platform-probe.mjs` runs, on the built package, the three
checks that pin exact x86-64 values: every number of the calc round trip, and
the returns and void-of-course windows that the site-parity test compares
exactly with the site's code (`results/platform-*.json`).
`tools/compare-batteries.mjs` compares 1.0.0-rc.1's 6,417-call battery across
runtimes with Linux x86-64 Node 22.22.2 (`results/values-by-runtime.json`).

| runtime | round trip: numbers differing (beyond the 1e-12 pin), largest | return charts differing of 120 | void-of-course windows differing of 60 | battery calls differing of 6,417, largest |
| --- | --- | --- | --- | --- |
| V8, Node 22.22.2, linux-x64 | 0 | 0 | 0 | the reference |
| V8, Node 24.17.0, linux-x64 | not run | not run | not run | 135, 1.14e-13 |
| V8, Node 20.19.0, darwin-arm64 | 3 (1), 1.42e-11 | 42 | 1 | 486, 2.17e-8 |
| V8, Node 22.22.2, darwin-arm64 | 3 (1), 1.42e-11 | 42 | 1 | 359, 2.17e-8 |
| V8, Node 24.21.0, darwin-arm64 | 3 (1), 1.42e-11 | 42 | 1 | 490, 2.17e-8 |
| JavaScriptCore (macOS `jsc` shell), darwin-arm64 | 118 (24), 3.56e-9 | 120 | 3 | not run |

- In every differing return chart the instant agrees; the chart's digest does
  not. In every differing void-of-course window the instants agree and the
  Moon's longitude at the last aspect differs by 5.68e-14°.
- The largest arm64 battery differences are in the true nodes: 2.17e-8° a
  day in a node's speed and 1.31e-8° in its longitude (a solar return chart).
  In JavaScriptCore the largest round-trip difference is 3.56e-9° a day in a
  speed and 1.26e-9° in a longitude (case 8).
- The round trip's three arm64 differences are in one case, 25, which two
  tests replay: its longitude speed by 1.42e-11° a day, its latitude speed and
  one Cartesian rate by less.
- Conformance, run on arm64 with Node 22.22.2, gives L1-POS-0110's latitude
  residual as 0.257339116″ where Linux x86-64 gives 0.257339117″; every
  verdict is the same, and the committed results are x86-64's.
- The R-E corpus of the returns, 35 of 40 cases, differs by design on every
  platform, as the site-parity test records; it is left out of the counts
  above.
- JavaScriptCore's shell has no `TextEncoder` or Node modules, so
  `tools/platform-probe-jsc.mjs` bundles the probe with the checkout's esbuild
  and replaces `node:crypto` with `tools/node-crypto-shim.mjs`, whose SHA-256
  it checks against Node's first.

The tests' exact pins are x86-64 V8's, as CI runs, where none fails. The
differences are far below any bound the package publishes; a comparison "to
the bit" in the CHANGELOG is between runs on one runtime and processor. These
figures describe the runtimes named, not every browser: Firefox's engine was
not run.

## Gates on the tree

`gates.sh`, 1.0.0-rc.2's with each log named for its platform too, ran CI's
engine job on the tree of the source commit before it was made, without
`NODE_OPTIONS` (`gates.log`, and the suites' output in
`full-tests-<version>-<platform>.log`):

| Node (npm), platform | Typecheck | Tests | Build, export smoke, API check, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7), darwin-arm64 | pass | 3,849 passed, 4 failed (*Platforms*) | pass |
| 20.19.0 (10.8.2), darwin-arm64 | pass | 3,848 passed, 1 skipped, 4 failed | pass |
| 24.21.0 (11.19.0), darwin-arm64 | pass | 3,848 passed, 1 skipped, 4 failed | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), which runs only where Node's own time-zone
data is 2025c. On 22.22.2 the root-isolation test that reads the checkout's
own build ran because a build was present; in CI's order, tests before build,
it is skipped.

`tree-jobs.sh` then ran on the same tree the jobs `gates.sh` does not
(`tree-jobs.log`): it packed the tree, SHA-256
`c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6`, 288,063
bytes; ran the packed-consumer check on that pack on Node 20.19.0, 22.7.0,
22.22.2 and 24.21.0, all 34 sections and the TypeScript consumer passing on
each; and ran the conformance job's self-test, vector validation, verdict
check and report check and the atlas job's check and self-test. All passed.

On `3a4b8a6` (`version-commit-3a4b8a6/`):

- the same gates and tree jobs gave the same results on darwin-arm64; the
  first tree-jobs run failed only its own line that prints the pack's size, a
  shell redirect from a glob, and the next run, with the line corrected,
  passed;
- the same gates on Linux x86-64, with the official Node 22.22.2 linux-x64
  build in an x86-64 virtual machine on this Mac under emulation, passed the
  4 tests that fail on arm64 and every other but one: the table check's timing
  test, which allows 2,000 ms, took 8,474.54 ms under emulation;
- [CI run 38093582694](https://github.com/zodiacs-org/engine/actions/runs/38093582694)
  on x86-64 passed every job: the engine on Node 20.20.2 (3,852 passed, 1
  skipped), 22.23.3 and 24.21.0 (3,851 passed, 2 skipped each), every carried
  archive rebuilt, the pack and the packed consumer on Node 20.19.0, 22.7.0,
  22 and 24; so did the Conformance workflow, its vector generators included,
  and Atlas, Python package, CodeQL and Offline CLI consumer.

CI runs every job again on this commit and on the carrier.

## Publishing

zodiacs-org/engine#39 was merged with a merge commit, `f8992a4`, at
2026-10-11T13:49:42Z. All 29 check runs on that commit passed: the 27 of
the workflows a push to main starts, and the Release workflow's two jobs
([`publication/merge-check-runs.json`](publication/merge-check-runs.json),
read after the release).
`.github/workflows/release.yml` was then run from main with `version` 1.0.0
and `tag` set to `latest` (the input defaults to `next`): run 38144970198
([`publication/release-run.json`](publication/release-run.json)). Its verify
job matched the archive to its entry and receipt, rebuilt the 1.0.0 archive
from that commit byte for byte (on Node 24.21.0), and found the 15 recorded
archives and their receipts holding only their recorded bytes across the
history, each bound to its source commit; it does not pass `--rebuild-all`,
so it rebuilt no other archive. Its publish job uploaded
`artifacts/zodiacs-engine-1.0.0.tgz` with trusted publishing and provenance
(job logs `publication/release-run-38144970198-*.log`). npm records the
publication at 2026-10-11T13:54:56Z
([`publication/registry.json`](publication/registry.json)).

`tools/verify-npm-publication.mjs` then checked what npm serves
([`publication/npm-publication.json`](publication/npm-publication.json),
2026-10-11T13:59:15Z):

- `latest` names 1.0.0.
- The tarball npm serves is the carried archive byte for byte (SHA-256
  `c4d3754d…b0f6`, 288,063 bytes), and npm's sha512 integrity is its digest.
- `npm audit signatures`, in a clean consumer that installed the version,
  verified the registry signatures and the attestation.
- `natalChart` and `ENGINE_VERSION`, imported from the published package,
  report 1.0.0 and the same Sun longitude in Node 26.4.0 and, through an
  `npm:` specifier, in Deno 2.9.0. Deno refuses npm versions younger than its
  minimum dependency age, so the probe turns that check off.
- The repository's packed-consumer check passes on the tarball npm serves.

The provenance statement ([`publication/attestations.json`](publication/attestations.json),
Sigstore log index 3208435349) names this repository,
`.github/workflows/release.yml` at `refs/heads/main`, commit
`f8992a4c1dfedd9e69c0783e2c185e22580460f7` and run 38144970198, and its
subject's sha512 is the carried archive's.

npm's `next` still names 0.1.1-rc.16, older than `latest`; moving or removing
that tag needs the owner's npm login, since the workflow only publishes.

## Birth data

`history-check-source.txt` is the output of the search for people's birth
data that must not be published (`tools/history-check-excluding.mjs`, the
rc.15 record's tool with one change), run on the 52 commits from 1.0.0-rc.2's
carrier to `9a6317a` with `3a4b8a6`'s changes staged, the carried archives
decompressed and read, and on the tree: none found. The tool leaves out
`docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`, which the
owner has ruled must never be opened or read, in every commit, the index, the
tree and any archive member of that name, and says so; nothing here covers
that file. A positive control, kept outside the repository with the patterns,
found every one of the 89 patterns under all seven labels, read gzip and tar
contents, and left the excluded path unread.

`history-check.txt` is the same search run on the 55 commits from 1.0.0-rc.2's
carrier to the carrier `38d3185`, with this record's changes staged, the
carried archives decompressed and read, and on the tree of `38d3185`.

## The archive

`artifacts/zodiacs-engine-1.0.0.tgz` is packed from the source commit
`ca2c8ce` and carried by its child `38d3185`: SHA-256
`c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6`, 288,063
bytes, 74 files, 991,915 bytes unpacked, the bytes `tree-jobs.sh` packed from
the tree before the source commit. Clean clones of `ca2c8ce`, each installed
with `npm ci`, built and packed the same bytes on Node 22.22.2 (npm 10.9.7),
20.19.0 (npm 10.8.2) and 24.21.0 (npm 11.19.0), 74 files each time, and the
carried file is the Node 22.22.2 one (`carrier/pack-source.sh`, 1.0.0-rc.2's
with `shasum`, `wc` and `awk` in place of `sha256sum` and `stat -c`). It was
carried after every CI job had passed on `ca2c8ce`
([run 38119791641](https://github.com/zodiacs-org/engine/actions/runs/38119791641)
and its companion workflows). `artifacts/archives.json` records the archive
with its source commit, its receipt `artifacts/zodiacs-engine-1.0.0.sha256`
names its digest, and `artifacts/README.md` lists it; 1.0.0-rc.2's row there
now names its carrier, `e790362`, and says it was merged.

## The gates on the carrier

`carrier/carrier-gates.sh`, 1.0.0-rc.2's for 1.0.0's archive and with
`shasum` in place of `sha256sum`, ran each job of the three workflows that
build and check the package on the carrier, `38d3185`, in a clean clone of
the repository with full history, with `TMPDIR` outside the clone and no
`package.json` or `node_modules` at or above it, and without `NODE_OPTIONS`
(logs in `carrier/`), on darwin-arm64:

| Job | Node (npm) | Result | Log |
| --- | --- | --- | --- |
| engine: npm ci, typecheck, tests, build, export smoke, API check, package contents, pack dry run, archive check | 22.22.2 (10.9.7) | 3,848 tests passed, 1 skipped, 4 failed (*Platforms*); the other steps pass; the archive check as below | `engine-38d3185-v22.22.2.log` |
| engine | 20.19.0 (10.8.2) | 3,847 passed, 2 skipped, 4 failed; the other steps pass | `engine-38d3185-v20.19.0.log` |
| engine | 24.21.0 (11.19.0) | 3,847 passed, 2 skipped, 4 failed; the other steps pass | `engine-38d3185-v24.21.0.log` |
| archives: the archive check with `--rebuild-all` | 22.22.2 (10.9.7) | a rebuild of HEAD, and of each of the 15 recorded archives from its source commit, byte-identical to the recorded archive | `archives-38d3185-v22.22.2.log` |
| pack: npm ci, build, `npm pack --ignore-scripts` | 22.22.2 (10.9.7) | byte-identical to the carried archive (`cmp`) | `pack-38d3185-v22.22.2.log` |
| packed consumer, on the carried archive itself | 20.19.0 (10.8.2), 22.7.0 (10.8.2), 22.22.2 (10.9.7), 24.21.0 (11.19.0) | all 34 sections and the types pass on each version, on the archive of SHA-256 `c4d3754d…` | `consumer-38d3185-v*.log` |
| conformance: npm ci, build, self-test, vectors, verdicts, `RESULTS.md` | 22.22.2 (10.9.7) | 267 pass, 192 fail, 41 unsupported, 0 error, every verdict as committed; `RESULTS.md` and `results/summary.json` current | `conformance-38d3185-v22.22.2.log` |
| atlas: checks and self-test, nothing installed | 22.22.2 (10.9.7) | all checks and the self-test pass | `atlas-38d3185-v22.22.2.log` |

In a clean clone the tests run before the build, as in CI, so the test that
reads the checkout's own build is skipped, and on 20.19.0 and 24.21.0 so is
the tzdb 2025c comparison. On each engine run the archive check found
`artifacts/zodiacs-engine-1.0.0.tgz` byte-identical to a rebuild of HEAD on
that Node version, and the 15 recorded archives (14 carried, 1 superseded)
and their receipts holding only their recorded bytes across 231 commits, each
bound to its source commit. The conformance generators were not run here;
this machine has no Python 3.11 with the pinned pyerfa and numpy. CI ran them
on the carrier, with every other job of the three workflows on x86-64:
[CI run 38121238462](https://github.com/zodiacs-org/engine/actions/runs/38121238462),
Conformance, Atlas, Python package, CodeQL and Offline CLI consumer all
passed on `38d3185`.

## What is not established

- No browser engine but JavaScriptCore's shell was run, and no Firefox.
- The conformance generators ran in CI only.
