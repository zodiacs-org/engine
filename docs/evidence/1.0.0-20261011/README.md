# 1.0.0 checks, 2026-10-11

1.0.0 is the first stable release: 1.0.0-rc.2 with the version changed. It
is two commits on main as it stood at `9a6317a` (the merge of
zodiacs-org/engine#38), whose packed files are 1.0.0-rc.2's: CI's archive
check rebuilt `artifacts/zodiacs-engine-1.0.0-rc.2.tgz` from that tree byte
for byte, and so did a run on this machine (Node 22.22.2, 2026-10-10).

1. `3a4b8a6`, the version commit: the version, the generated records that
   carry it, the CHANGELOG entry, the README's release lines, the size notes,
   and its checks, kept in `version-commit-3a4b8a6/` and below.
2. The source commit of this release, which brings this version of this file.
   It acts on the independent review of `3a4b8a6` (*Reviews*): the CHANGELOG
   entry's paragraph on platforms and its path for callers on npm's
   0.1.1-rc.15, the README's line for them, and this record.

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

`.github/workflows/release.yml` is run from main after the merge, with
`version` 1.0.0 and `tag` set to `latest`: the input defaults to `next`. npm's
`next` then still names 0.1.1-rc.16, older than `latest`; moving or removing
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
contents, and left the excluded path unread. The final search, on the commits
up to the record, is recorded with the record commit.

## What is not established

- The archive is packed once, from this commit, and its gates run on the
  carrier; both are recorded with the record commit.
- 1.0.0 is not published by anything here.
- No browser engine but JavaScriptCore's shell was run, and no Firefox.
