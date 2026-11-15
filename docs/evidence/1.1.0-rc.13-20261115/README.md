# 1.1.0-rc.13: rc.12's code with its documentation corrected

The candidate for 1.1.0 on draft pull request 101, cut on 2026-11-15 after
the review of 1.1.0-rc.12 (`../1.1.0-rc.12-20261115/breaker/BREAKER.md`),
which found no blocker and six should-fix items, and after the owner's
wording edits: credit NASA JPL for the rule behind the Sun's disc in the
changelog and licence notes, and give no round figure for the size of the
change from earlier releases that rc.12's measurements do not back. Those
edits change `README.md`, `CHANGELOG.md`, `LICENSING.md` and `NOTICE`, which
the package holds, so the corrected package takes a new number
(`../../../artifacts/README.md`). Nothing here was tagged or published.

Machine: one Linux x86-64 host, Node 22.23.4 with npm 10.9.9. That toolchain
packs rc.12's source commit `d35343a` (at `86ad398`, from a clean
`npm ci`) to rc.12's carried bytes, SHA-256 `4577e2ff…0297`.

## What changed against 1.1.0-rc.12

Source commit `67a0e38`, against `86ad398`:

- Packed documents: `CHANGELOG.md` (the rc.13 entry; in rc.12's entry the
  limb sentence and `eraLdsun`'s 5.76″; in rc.11's entry the Neptune
  figure marked as rc.11's), `README.md` (the version line, the NASA JPL
  credit, the package's unpacked size, the list of drafts), `LICENSING.md`
  and `NOTICE` (the NASA JPL credit).
- Repository documents: `docs/de440.md` (the limb row and paragraph, the
  longitude search at the limb step, 5.76″) and
  `../1.1.0-rc.12-20261115/README.md` (the build the near-sun rows ran on).
- The version string, 1.1.0-rc.12 to 1.1.0-rc.13: `package.json`,
  `package-lock.json`, `ENGINE_VERSION` in `src/types.ts`, `typedoc.json`,
  the two tests that hold it and the 30 receipts in
  `src/fixtures/calc-roundtrip.json`.
- `scripts/verify-package-contents.mjs`: a comment recording this
  candidate's size. No budget and not the cap.

## The build against rc.12's

`distcmp.py` builds a list of every file of `dist/` with its SHA-256, after
naming each hashed chunk file `chunk-H` (the bundler names chunks by their
content, so the version string renames the chunks that hold it) and, on the
rc.13 side, writing `"1.1.0-rc.12"` for `"1.1.0-rc.13"`. On rc.12's `dist/`
(built from `86ad398`) and rc.13's (built from `67a0e38`):
`results/dist-vs-rc12.txt`, 94 files each, EQUAL. Each `dist/` holds the
quoted version string once. So the code is rc.12's but for the version
string.

## The archive

`npm ci`, `npm run build` and `npm pack --ignore-scripts` in a clean tree
of `67a0e38` (from `git archive`) gave
`zodiacs-engine-1.1.0-rc.13.tgz`, SHA-256
`8d7b2adb630e629b0673c3901fe383cf9b496429a0b98075581d4a8797767817`,
2,725,396 bytes, 98 files, the same bytes as the pack from the working
checkout. Not repacked on Node 20 or 24 here; CI's archive jobs rebuild it.

## Gates on `67a0e38`, Node 22.23.4

- `npm run typecheck`: passed.
- `npm test`: `results/test.log` (run with `dist/` built): 4,308 passed,
  4 skipped. rc.12's gates log has 4,309 and 3: the extra skip here is
  `src/geo/zone-history.test.ts`'s test that runs only on a host whose own
  tzdata is 2025c (`HOST_IS_2025C`), which this host's is not; the other
  three are `src/de440-kernel.test.ts`, which needs the kernel, as in rc.12's.
- `npm run exports:smoke`, `npm run api:check` (17 entry points match
  `api/`), `npm run package:contents` (98 files, 4,578,211 bytes unpacked,
  1,258,659 beside the pack, of the cap 1,265,000; every import graph the
  same size as rc.12's): passed.
- The archive-binding check needs full history and runs in CI.

## On the installed archive

- `results/l1-installed.log`: the 240 L1 vectors, with rc.12's tool
  (`../1.1.0-rc.12-20261115/tools/l1-installed.sh`) in a new directory
  outside the checkout, nothing but `npm install <tarball>`: plain
  `natalChart` 240/240 within 1″ of Horizons, largest 0.0127″ (L1-POS-0002);
  `calc()` 240/240; every result names jpl-de440. Apart from the version and Node's,
  the same lines as rc.12's log.
- `results/consumer-8d7b2adb-v22.23.4.log`: `scripts/verify-packed-consumer.mjs`
  on the archive, which checks the fallback labels with the pack removed,
  damaged and undecodable, among them `chartPoints` and `chartDeclinations`.
  Passed; apart from the version, the digest and the paths it is line for
  line rc.12's log on Node 22.22.2.
