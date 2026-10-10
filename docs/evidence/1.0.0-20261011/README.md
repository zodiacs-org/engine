# 1.0.0 checks, 2026-10-11

1.0.0 is the first stable release: 1.0.0-rc.2 with the version changed. It
is cut on main as it stood at `9a6317a` (the merge of zodiacs-org/engine#38),
whose packed files are 1.0.0-rc.2's: CI's archive check rebuilt
`artifacts/zodiacs-engine-1.0.0-rc.2.tgz` from that tree byte for byte, and so
did a run on this machine (`../../../` at `9a6317a`, Node 22.22.2,
2026-10-10). The owner approved cutting 1.0.0 and publishing it under npm's
`latest` once every gate, review and private search passes (2026-10-11, in
the programme session; the approval is recorded on site main in
`docs/platform/programme/DECISIONS-2026-10-11.md`). Engine issue #32 holds the
proposal and its scope.

Every figure below is read from a file in this directory or in one it names.
Local paths in the outputs are shortened to `<checkout>`, `<scratch>`,
`<tmp>` and, for the directory of the Node binary, `<bin>`.

## The source commit

The source commit changes what carries the version and nothing else that is
packed:

- `package.json`, the lockfile, `ENGINE_VERSION` (`src/types.ts`),
  `typedoc.json` and the two tests that pin the version: 1.0.0.
- `src/fixtures/calc-roundtrip.json`, rebuilt by
  `scripts/build-calc-roundtrip.mjs`: the version in 30 places and nothing
  else. It was rebuilt on Linux x86-64; on this machine (arm64) the same
  script also moves three numbers in their last bits (*Platforms*).
- `conformance/`, run again on Linux x86-64 with Node 22.22.2, the version CI
  pins: the version alone changes in the results, and the hand-written notes
  name 1.0.0. The 500 verdicts are 1.0.0-rc.2's: 267 pass, 192 fail, 41
  unsupported, none in error.
- `CHANGELOG.md`: the 1.0.0 entry. `README.md`: the release, how to install it
  from npm, and two phrases that still described rc.16's build as this
  candidate's.
- `scripts/verify-package-contents.mjs`: the sizes beside the budgets; none
  is raised.

## What did not change

`tools/compare-rc2.mjs` compares this tree's build with the carried
1.0.0-rc.2 archive, unpacked, on one machine (`results/`):

- **Values.** 1.0.0-rc.1's battery, `../1.0.0-rc.1-20261006/tools/values.mjs`,
  unchanged, runs 6,417 calls over the twelve entry points, each package in
  its own process. The two runs are the same bytes
  (`results/values-compare.txt`): the battery writes the version as a
  placeholder.
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
`./geo` and `./houses` are unchanged. The package is 991,125 bytes unpacked in
74 files, 1,597 more than 1.0.0-rc.2's 989,528: the CHANGELOG entry and the
README's lines. The cap of 1,000,000 is not raised and leaves 8,875 bytes.

## Platforms

A value can differ between processor architectures in its last bits. On this
machine, an Apple M4 (arm64), the full suite fails 4 of its 3,853 tests on
Node 20.19.0, 22.22.2 and 24.21.0 alike, and passes the rest
(`full-tests-v*-darwin-arm64.log`):

- `src/calc-fixtures.test.ts`, cases 17 and 25: a calc request's longitude
  speed differs from the committed one by 1.4e-11 against the test's pin of
  1e-12.
- `src/techniques/site-parity.test.ts`, returns and void-of-course windows:
  they compare with the site's code exactly. Every instant agrees; a chart's
  digest differs in the returns, and one aspect's angle by 5e-14° in the
  windows.

On Linux x86-64, which CI runs, the round-trip fixture rebuilt there
differs from the committed one in its 30 version strings alone, and its 68
replay tests pass (Node 24.17.0 in that machine's existing image); CI runs
the full suite there on Node 20, 22 and 24. The
pins are x86-64's. Nothing in the package claims bit-identical results across
platforms; its "to the bit" comparisons are between runs on one platform, and
the CHANGELOG entry now says so.

## Gates on the tree

`gates.sh`, 1.0.0-rc.2's with each log named for its platform too, ran CI's
engine job on the tree of the source commit before it was made, without
`NODE_OPTIONS` (`gates.log`, and the suites' output in
`full-tests-<version>-<platform>.log`). `gates.log` is added by the record
commit, because the Linux run below was still writing to it when the source
commit was made:

| Node (npm), platform | Typecheck | Tests | Build, export smoke, API check, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7), darwin-arm64 | pass | 3,849 passed, 4 failed (*Platforms*) | pass |
| 20.19.0 (10.8.2), darwin-arm64 | pass | 3,848 passed, 1 skipped, 4 failed | pass |
| 24.21.0 (11.19.0), darwin-arm64 | pass | 3,848 passed, 1 skipped, 4 failed | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), which runs only where Node's own time-zone
data is 2025c. The same gates on Linux x86-64, with the official Node 22.22.2
linux-x64 build in an x86-64 virtual machine on this Mac under emulation,
were still running when the source commit was made; the record commit gives
their result.

`tree-jobs.sh` then ran on the same tree the jobs `gates.sh` does not
(`tree-jobs.log`): it packed the tree, SHA-256
`96a004f64cc45ce88255e384e61a59a52839271985bb1b0dc8d75fc4f52502f7`, 287,712
bytes; ran the packed-consumer check on that pack on Node 20.19.0, 22.7.0,
22.22.2 and 24.21.0, all 34 sections and the TypeScript consumer passing on
each; and ran the conformance job's self-test, vector validation, verdict
check and report check and the atlas job's check and self-test. All passed.
Its first run, `tree-jobs-first.log`, passed the same jobs, and failed only
its own line that prints the pack's size, a shell redirect from a glob,
which the script now writes without one; the pack it made had the same
SHA-256.

## What is not established

- The private search for birth data is recorded with the record commit.
- The archive is packed once, from the source commit, and its gates are run
  on the carrier; both are recorded with the record commit.
- 1.0.0 is not published by anything here. The Release workflow publishes it
  from main after the merge.
