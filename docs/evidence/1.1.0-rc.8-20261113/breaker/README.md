# Breaker's review of the draft candidate 1.1.0-rc.8 (ZOD-206)

A second session, which did not build the candidate, reran the checks on the
head `3de6a27` of `audit/fable-job9-de440-rc` (draft pull request 101) on
2026-11-13 and 2026-11-14 (ICT) and tried to break the claim "240 of 240 L1
cases within limits from what `npm install` gives". Nothing in the package,
the archive or the builder's files was changed. Every figure below is in a
log or a result file of this directory, named beside it.

## Verdict

The builder's numbers reproduce. The candidate still cannot go forward as it
is, for three reasons:

1. **A plain call is not on DE440.** The 240 of 240 needs two steps by the
   caller: import `@zodiacs/engine/de440/pack` and compute inside
   `withEphemeris(await openShippedDe440Pack(), fn)`. `natalChart()` with
   nothing else done still computes with astronomy-engine and passes 48 of
   240 at 1 arcsecond (`breaker-l1.log`). The builder says so in every
   document; whether that meets the request is the owner's call.
2. **`main` moved.** Pull requests 91, 92 and 95 were merged by the owner at
   2026-11-13 16:43 UTC, after the builder finished, and `main` (`fa4447e`)
   is now 1.1.0-rc.7. Pull request 101 is reported `CONFLICTING` by GitHub; a
   trial merge in memory conflicts in 15 files, among them
   `artifacts/archives.json`, `package.json` and
   `scripts/verify-package-contents.mjs` (`breaker-main-moved.log`). The
   carried 1.1.0-rc.8 archive was built on 1.1.0-rc.3 and holds none of
   1.1.0-rc.6's or 1.1.0-rc.7's changes. An archive is never repacked, so
   the pack has to be cut again on `main` under a new number.
3. **One workflow fails on the head.** `Offline CLI consumer` fails on Node
   22.22.2 on all three operating systems (`breaker-ci-at-3de6a27.log`, the
   run GitHub had already made on `3de6a27`; it was read once, not waited
   for). It installs the carried 1.0.0-rc.2 archive and, on Node 22.22.2,
   compares its verdicts with the committed
   `conformance/results/zodiacs-engine.json`
   (`tools/cli/scripts/verify-consumer.mjs`, line 177). This branch made
   that file the shipped pack's verdicts (459 pass), which 1.0.0-rc.2 cannot
   give. Reproduced here: `breaker-offline-cli.log` (`'fail' !== 'pass'`,
   exit 1). The same workflow passes on pull request 100's head `7d951d7`.
   It is not among the commands of `AGENTS.md`, and the builder did not run
   it.

## The 240 L1 cases on the installed package

`breaker-l1.sh` and `breaker-l1.mjs`, written apart from the builder's
runner: `npm install <tarball>` into a new empty directory outside the
checkout, Node 22.22.2, every `ZODIACS*` variable and `NODE_OPTIONS` unset,
no pack given, and the network unshared (`bwrap --unshare-net`) while the
cases ran. Expected values are the vectors' own, JPL Horizons (DE441) in the
IAU 2006/2000A true ecliptic of date; `conformance/vectors/` is unchanged
from `main` at `8da3a4e`. TT on both sides.

Tarball `artifacts/zodiacs-engine-1.1.0-rc.8.tgz`, SHA-256
`53df553c922eddc20e07b2c824b8f268fd0ea84f9c841dbe54294d6b6af8bc43`,
2,696,971 bytes. Vectors `conformance/vectors/L1-positions.json`, SHA-256
`853486bd33ddf2c136581803aec7df4b069c00f63678861537b2c0b86127366c`.

| how it was asked | within 1 arcsecond (longitude and latitude) | longitude within 30 arcseconds | largest difference |
| --- | ---: | ---: | --- |
| plain `natalChart()`, no pack opened | 48 of 240 | 240 of 240 | 18.7745 in longitude (Neptune), 19.0281 in latitude (Saturn) |
| `natalChart()` inside `withEphemeris` on the shipped pack | 240 of 240 | 240 of 240 | 0.0126 in longitude, 0.0010 in latitude (both the Moon) |
| plain `natalChart()` again, after the pack was used | the same 240 values as the first row | | |
| `withEphemeris` with an `async` callback | throws: "withEphemeris runs synchronous functions only" | | |

The published limit of the suite is 1 arcsecond in longitude and in
latitude; the second column is that score. The builder's 0.0127 and 0.0011
are the same two differences rounded up (0.012647 and 0.001011 in
`breaker-l1-summary.json`). Per case: `breaker-l1-cases.tsv`.

What was tried against the claim, and what was found (`breaker-l1.log`,
`breaker-tarball.log`):

- The pack is in the tarball. Its base64 text is in `dist/de440-pack.js`
  and in no other file; decoded with Python, without the package's code, it
  is 2,489,664 bytes with SHA-256 `51428874...1fa7`, identical byte for byte
  to job 9's sealed pack file.
- No environment variable and no network: no file of the installed `dist/`
  mentions `process.env`, `ZODIACS_`, `fetch(`, `node:fs` or `node:http`,
  and the run passed with the network unshared.
- Nothing is supplied by the caller but the two calls named above.
- The root does not load the pack: the root's static import closure is 14
  files, none of them `de440-pack.js`, and no other file imports it.
- The install adds two packages, `@zodiacs/engine` and `astronomy-engine`.

## Suite and gates on `3de6a27`

Node 22.22.2, in a mount namespace without the machine's root-owned
`/node_modules` (`breaker-ns.sh`), after `npm ci` (`breaker-gates.sh`,
`breaker-gates.log`): all seventeen commands exit 0. The suite: 4,183
passed, 3 skipped, in 101 files passed and 1 skipped. The archive-binding
check finds the carried tarball byte-identical to a rebuild of the head.

Also run, which the builder had not:

- `node scripts/verify-archive-binding.mjs --rebuild-all`: exit 0, 19
  recorded archives, each byte-identical to a rebuild of its source commit
  (`breaker-rebuild-all.log`).
- `node scripts/verify-packed-consumer.mjs` on the carried tarball: exit 0
  on Node 22.22.2, 20.19.0 and 24.21.0 (`breaker-consumer.log`). Node 22.7.0
  was not on this machine; GitHub's run on `3de6a27` passed it.
- `node tools/cli/scripts/prepare-consumer.mjs`: exit 1, item 3 above.

## Size

Measured from the two carried tarballs (`breaker-tarball.log`):

| | 1.1.0-rc.3 | 1.1.0-rc.8 |
| --- | ---: | ---: |
| tarball, bytes | 331,979 | 2,696,971 |
| unpacked, bytes | 1,142,818 | 4,477,785 |
| files | 94 | 97 |

They are the builder's figures. `dist/de440-pack.js` is 3,320,569 bytes, of
which 3,319,552 are the pack's base64 text. `main` now carries 1.1.0-rc.7 at
335,403 bytes with a package cap of 1,155,000 (`breaker-main-moved.log`), so
the cap this branch proposes (1,165,000, from 1,145,000) is measured against
a base that is no longer `main`'s. Neither the cap nor the new entry's
budget has the owner's approval, as the builder says.

## Licensing

Read again on 2026-11-13, by this session:

- NAIF, "Rules Regarding Use of SPICE"
  (https://naif.jpl.nasa.gov/naif/rules.html): the sentences `LICENSING.md`
  quotes are on the page as quoted. The page speaks of kernels, modified
  kernels and software; it does not speak of data refitted from a kernel.
- JPL, "JPL Planetary and Lunar Ephemerides"
  (https://ssd.jpl.nasa.gov/planets/eph_export.html): no licence and no
  terms of redistribution.
- NAIF's directory of the planetary kernels
  (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/) has no
  readme for DE440: its two `aareadme` files are for DE430, DE431 and
  DE432s. `de440_tech-comments.txt` there, which the builder did not read,
  was read in full: constants and a reference to Park et al. 2021, no terms.

So `LICENSING.md` states the position correctly: no page read gives or
withholds permission to redistribute data refitted from DE440, the question
`docs/de440.md` recorded as put to NAIF has no answer in the repository, and
shipping rests on the owner's statement of 2026-11-13. That stays open until
the owner accepts it in writing or NAIF answers.

## State of the pull request and the repository

`breaker-remote.log`, read 2026-11-13 16:48 UTC:

- Pull request 101 is open, a draft, base `main`, head `3de6a27`. Its six
  commits are by `admin@zodiacs.org`, with no model name and no co-author
  line. The body's last line (line 39) is an attribution to the
  coding tool that wrote it, with a link, which the house rules do not
  allow in a pull request.
- No tag names 1.1.0 on the remote, the newest GitHub release is
  0.1.1-rc.15, and npm carries 0.1.1-rc.14 to 0.1.1-rc.16 and 1.0.0: nothing
  of this candidate is tagged, released or published.
- Pull request 100's branch is at `7d951d7`, unchanged. Pull requests 91, 92
  and 95 were merged into `main` by the repository owner's account at
  2026-11-13 16:43 UTC; this job did not touch them.
- 1.1.0-rc.8 is the first number no branch used when it was chosen
  (1.1.0-rc.4 to 1.1.0-rc.7 each name a branch).
