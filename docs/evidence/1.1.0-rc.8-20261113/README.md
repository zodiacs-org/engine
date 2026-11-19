# 1.1.0-rc.8: the sealed DE440 pack, shipped (ZOD-206), 13 November 2026

The owner's request of 2026-11-13 (17:12, Asia/Bangkok): the 240 L1 cases
within limits out of the box, from what `npm install` gives, by putting the
DE440 pack into a new candidate, as a draft. This folder records what the
candidate ships, what was measured on it and how, its size, the licensing
note, and what is left for the owner to decide.

It is a draft. Nothing was published, tagged, released or merged.

## In short

| | shipped DE440 pack, through `withEphemeris` | the root's own positions (astronomy-engine 2.1.19) |
| --- | ---: | ---: |
| suite tolerance, 1″ in longitude and in latitude | **240 of 240** | 48 of 240 |
| 30″ in longitude (longitude only) | 240 of 240 | 240 of 240 |
| receipt bound, whole angle (`src/calc-bounds.ts`, `geocentric/apparent`) | 240 of 240 (not this source's bound, see below) | 237 of 240 |
| largest longitude difference | 0.0127″ (Moon, L1-POS-0002) | 18.775″ (Neptune, L1-POS-0209) |
| largest latitude difference | 0.0011″ (Moon, L1-POS-0222) | 19.029″ (Saturn, L1-POS-0237) |
| largest whole-angle difference | 0.0127″ (Moon, L1-POS-0002) | 19.039″ (Saturn, L1-POS-0237) |

Figures are rounded up. Both columns were run on the package as installed
from its tarball (`artifacts/zodiacs-engine-1.1.0-rc.8.tgz`, SHA-256
`53df553c922eddc20e07b2c824b8f268fd0ea84f9c841dbe54294d6b6af8bc43`) into an
empty directory, on Node 22.22.2, with no `ZODIACS_*` environment variable
and no pack given. `results/summary.json` has the unrounded figures by body,
`results/cases.md` the 240 cases, one row each, for both columns, and
`results/l1-installed.log` the run's output.

**What "out of the box" means here, exactly.** The package now holds the
pack, and a caller reaches it with one import and one call:

```ts
import { natalChart, withEphemeris } from "@zodiacs/engine";
import { openShippedDe440Pack } from "@zodiacs/engine/de440/pack";

const source = await openShippedDe440Pack();
const chart = withEphemeris(source, () => natalChart({ utc: "1990-04-15T08:30:00Z" }));
```

The left column is that. A plain `natalChart(...)` call, with no
`withEphemeris`, still computes with astronomy-engine: that is the right
column, and it is unchanged from 1.1.0-rc.3. This candidate does not make
DE440 the source of a plain call. Why not, and what it would take, is the
first question under *For the owner* below.

## The version

`1.1.0-rc.8`. This branch stands on `main` at `8da3a4e` with pull request
100's two commits (`7d951d7`), where `package.json` says `1.1.0-rc.3`. The
numbers `1.1.0-rc.4` to `1.1.0-rc.7` are taken: each names a candidate with a
carried archive on a branch of the repository (`admin/engine-1.1.0-rc.4` to
`admin/engine-1.1.0-rc.7`; pull request 91 is rc.6 and pull request 95 is
rc.7). None of them has landed and none is in this history. `1.1.0-rc.8` is
the first number no branch or archive uses.

One consequence: `artifacts/archives.json` is append-only, and CI checks that
every committed version of it is a prefix of HEAD's. This branch appends rc.8
after rc.3; pull request 95 appends rc.6 and rc.7 after rc.3. The two cannot
both merge as they are. Whichever merges second is cut again under a new
number, on top of the first.

## How the pack is shipped

- **A new entry point, `@zodiacs/engine/de440/pack`** (`src/de440-pack.ts`,
  built into `dist/de440-pack.js`): `DE440_PACK` (the description),
  `de440PackBytes()` (the bytes) and `openShippedDe440Pack()` (a source for
  `withEphemeris`, opened with `openDe440Pack` against the pack's SHA-256).
- **The bytes are base64 text** in `src/de440/pack-data.ts`, one string of
  3,319,552 characters, written by `scripts/build-de440-pack.mjs` from the
  sealed pack, which it refuses unless its SHA-256 and size are the ones it
  names. `scripts/build-de440-pack.test.mjs` and `--check` hold the committed
  file to the generator. The raw kernel is not committed.
- **Nothing else imports it.** The root, `./de440` and every other entry are
  as they were; `scripts/verify-package-contents.mjs` checks that the pack is
  in `dist/de440-pack.js` and no other packed file, once, with its digest,
  and that only `./de440/pack`'s graph holds that file. The root's graph is
  108,531 bytes, as in 1.1.0-rc.3.
- **The pack**: `de440-1790-2210.v2.zeph`, 2,489,664 bytes, SHA-256
  `51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7`, the
  file job 9 compiled from NAIF's `de440.bsp` (SHA-256
  `a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5`) with
  zodiacs.org's compiler 2.0.0; `docs/evidence/l1-gap-20261113/README.md`
  records that build, and both digests are the ones `docs/de440.md` has named
  since 1.1.0-rc.3. It was not recompiled here.

Why base64 in a JavaScript module and not the binary file: the package is
ESM for browsers through a bundler and for Node, and has no way that works in
all of them to load a file that is not a module. The cost is in *Size* below.

## The 240 cases, and which limits (how they were run)

`tools/l1-installed.sh` makes a new empty directory outside the checkout,
runs `npm install <the tarball>` in it, copies `tools/l1-installed.mjs`
there and starts it, so that its imports resolve to
`node_modules/@zodiacs/engine` and to nothing in a checkout. It unsets any
`ZODIACS_*` variable first. The script reads the committed vectors
(`conformance/vectors/L1-positions.json`: JPL Horizons, DE441, apparent
geocentric places at 24 TT instants from 1851 to 2148 for ten bodies, in the
IAU 2006/2000A true ecliptic of date) and scores each case. The instants are
TT on both sides, so no ΔT model enters. No new Horizons request was made.

The limits are the three job 9 scored, for the same reasons
(`docs/evidence/l1-gap-20261113/README.md`, *Which limits, and why*):

- **the suite's tolerance**, 1″ in longitude (on the circle) and 1″ in
  latitude, which each vector carries;
- **30″ in longitude**, the public bound as ZOD-97 read it, longitude only;
- **the receipt bounds** of `src/calc-bounds.ts`, rows `geocentric/apparent`,
  whole angle. They were measured on astronomy-engine, and `calc()` refuses
  inside `withEphemeris`, so no receipt carries them for a DE440 position:
  the left column's 240 of 240 shows only that the shipped source is far
  inside them. For the right column they are the bounds a receipt quotes,
  and three cases exceed them, the same three job 9 found (Saturn 1986 and
  2148, Venus 2026). Nothing in this candidate changes a bound; pull request
  95 does.

For the shipped pack the limit that is published and applies is the suite's
1″. By body, the largest differences in arcseconds, each of 24 cases:

| body | shipped: within 1″ | Δlon | Δlat | root: within 1″ | Δlon | Δlat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sun | 24 | 0.0036 | 0.0002 | 15 | 1.306 | 1.634 |
| Moon | 24 | 0.0127 | 0.0011 | 13 | 3.741 | 1.720 |
| Mercury | 24 | 0.0037 | 0.0003 | 2 | 7.974 | 6.149 |
| Venus | 24 | 0.0038 | 0.0003 | 4 | 12.595 | 5.205 |
| Mars | 24 | 0.0034 | 0.0003 | 5 | 4.440 | 5.273 |
| Jupiter | 24 | 0.0038 | 0.0002 | 2 | 7.823 | 6.635 |
| Saturn | 24 | 0.0035 | 0.0002 | 1 | 10.217 | 19.029 |
| Uranus | 24 | 0.0038 | 0.0002 | 2 | 12.044 | 16.417 |
| Neptune | 24 | 0.0035 | 0.0002 | 0 | 18.775 | 9.714 |
| Pluto | 24 | 0.0037 | 0.0002 | 4 | 14.269 | 3.517 |

The same 240 are run three more ways, all agreeing:

- `src/de440-pack.test.ts`, in the suite, enforces 240 of 240 within 1″ and
  the two largest differences (0.0127″ and 0.0011″) on the source tree;
- the conformance harness with the adapter's default run, on the build:
  `conformance/results/zodiacs-engine.json`, 240 pass of 240 at L1 and 459
  pass, 0 fail, 41 unsupported of the 500; CI reruns it;
- the harness with `--ephemeris astronomy-engine`:
  `conformance/results/zodiacs-engine-astronomy-engine.json`, 48 pass and 192
  fail; CI reruns it too (one step added to `.github/workflows/conformance.yml`).

What the 240 do not test: the true node, speeds, instants outside 1851 to
2148, and anything beyond the pack's coverage (the start of 1790 to the start
of 2210, outside which a source refuses). `docs/de440.md` gives the pack's
own error against the kernel, the node's included.

## Size

From `sizes.json` (`tools/sizes.mjs`, which reads the two carried archives):

| | 1.1.0-rc.3 | 1.1.0-rc.8 | |
| --- | ---: | ---: | --- |
| tarball, bytes | 331,979 | 2,696,971 | 8.1 times |
| unpacked, bytes | 1,142,818 | 4,477,785 | 3.9 times |
| files | 94 | 97 | |
| the pack's base64 text | 0 | 3,319,552 | |
| everything else, unpacked | 1,142,818 | 1,158,233 | 15,415 more |

Of the 15,415 bytes that are not the pack: 12,306 are documents (README,
CHANGELOG, LICENSING.md, NOTICE), 1,661 declarations, 1,293 JavaScript that
only the opt-in entries load, 155 the manifest. The root's JavaScript did not
change.

The concern, stated plainly: the tarball is 2.7 MB where it was 0.33 MB,
because the pack's quantised coefficients compress little (the base64 text
gzips, at Node's highest level, only to 2,357,278 bytes). Every `npm install`
downloads it, whether or not the caller uses DE440. A web application that
imports `@zodiacs/engine/de440/pack` puts 3.3 MB of text into its bundle; one
that does not import it bundles none of it. Shipping the binary file instead
of base64 would save 829,888 bytes unpacked (3,319,552 less 2,489,664) and
some of the tarball, at the price of a loader that differs by runtime; a
separate data package would keep `@zodiacs/engine` at its old size. Neither
was done: the request was the pack in the candidate.

The package gate changes with it. It holds the pack to its exact size and
digest and caps the rest: that cap rises from 1,145,000 to 1,165,000 (6,767
bytes left), and `./de440/pack` has a budget of the pack and 49,400 bytes.
Earlier raises carried the owner's approval of a figure; these do not yet.

## Licensing

`LICENSING.md`, *DE440 pack*, and `NOTICE` carry the record. In short:

- The pack is data Zodiacs.org refitted from JPL's DE440 (Park, Folkner,
  Williams and Boggs 2021), taken from NAIF's kernel `de440.bsp`. `NOTICE`
  cites the ephemeris, says Zodiacs.org made the pack, and says JPL and NAIF
  have not reviewed it.
- NAIF's rules page, fetched and read on 2026-11-13
  (https://naif.jpl.nasa.gov/naif/rules.html, 23,487 bytes, SHA-256
  `ae85f851646e7c4f0a762db852907bc090a2ab50c815eb2a6cd8639e96b7e047`), says:
  "Redistribution of SPICE kernels distributed by NAIF is permitted as long
  as they have not been modified.", and that a modified kernel's attribution
  must name whoever modified it last. It says nothing of data refitted from
  a kernel. JPL's export page
  (https://ssd.jpl.nasa.gov/planets/eph_export.html, 29,979 bytes, SHA-256
  `ce7db9fc032a395318911b6b07cb2f12717f2849dc9938cbd207cb662f4d1687`)
  states no terms. NAIF's readme for the DE430 and DE440 kernels was asked
  for at one address and not found there (HTTP 404); it was not read.
- The owner's position (2026-11-13) is that DE440 is JPL's public data, and
  the candidate ships the pack on that. `docs/de440.md` at 1.1.0-rc.3 said a
  question about redistributing a pack had been put to NAIF and that no pack
  would be distributed until it was answered; no answer is recorded in the
  repository. `LICENSING.md` now lists it as an open question for the owner,
  to settle or accept in writing before publication. The SPDX expression is
  unchanged.

## Checks

On Node 22.22.2 unless said. The machine has a root-owned `/node_modules`,
which the archive-binding check refuses to work under, so the gate commands
were run inside a `bwrap` mount namespace that hides it (`tools/gates.sh`
says how), as job 9's were.

- **The gate commands on the source commit `e393949`**
  (`results/gates-e393949-v22.22.2.log`): typecheck; the suite, 4,183 passed
  and 3 skipped of 4,186 in 102 files, none failed; build; exports smoke; API
  check (17 entry points); package contents; pack dry run; the pack
  generator's `--check`; the archive binding; the conformance self-test,
  validation (500), both runs' checks and the report's check; the atlas check
  and self-test. All sixteen exit 0.
- **The same on the carrier** `7dec96f`
  (`results/gates-7dec96f-v22.22.2.log`): all sixteen exit 0, the suite again
  4,183 passed and 3 skipped, and the archive-binding check also rebuilds
  HEAD and finds the carried archive byte for byte. The log's "1 modified
  tracked paths" is `tools/l1-installed.mjs` in this folder, corrected after
  the source commit (how it finds the installed package's directory); it is
  not packed and no gate reads it.
- **The suite on Node 20.19.0 and 24.21.0** (`results/tests-v20.19.0.log`,
  `results/tests-v24.21.0.log`), run on the carrier's tree, one after the
  other: on each, 4,182 passed and 4 skipped of 4,186, none failed.
- **The archive from clean clones** (`results/source-packs.log`,
  `tools/pack-source.sh`): clean clones of `e393949`, each installed with
  `npm ci`, packed the same bytes on Node 22.22.2, 20.19.0 and 24.21.0. The
  carried file is the Node 22.22.2 one.
- **The packed consumer** (`results/consumer-53df553c-v*.log`):
  `scripts/verify-packed-consumer.mjs` on the tarball, on Node 22.22.2,
  20.19.0 and 24.21.0. It now also opens the shipped pack from the installed
  package and holds its Sun to L1-POS-0001. Node 22.7.0, which CI also runs,
  was not run here.
- Not run here: `verify-archive-binding.mjs --rebuild-all` (CI's archives
  job), tier B on the kernel (no file it tests changed), and the gate
  workflows themselves, which were not waited for.

In the logs, the directory the tarball sat in is written
`<outside the checkout>`; nothing else in them was edited.

## What changed, by file

- New: `src/de440-pack.ts`, `src/de440/pack-data.ts` (generated),
  `src/de440-pack.test.ts`, `scripts/build-de440-pack.mjs` and its test,
  `api/de440-pack.api.md`, this folder.
- Package: `package.json` (version, the export, the build's entry list, the
  description), `package-lock.json`, `src/types.ts` (`ENGINE_VERSION`),
  `typedoc.json`, the two receipt tests that name the version, the doc
  comment of `src/de440.ts`.
- Checks: `scripts/verify-package-contents.mjs` (the pack's size and digest,
  the cap, the budget), `scripts/module-resolution-smoke.mjs`,
  `scripts/verify-packed-consumer.mjs`, `scripts/root-isolation.mjs`.
- Documents: `README.md`, `CHANGELOG.md`, `LICENSING.md`, `NOTICE`,
  `docs/de440.md`, `docs/versioning.md`, `AGENTS.md`.
- Conformance: the adapter (the shipped pack by default, `--ephemeris
  astronomy-engine`, version 0.3.0), `harness/report.mjs` (the run order),
  `README.md`, the regenerated `RESULTS.md`, `results/summary.json` and
  `results/zodiacs-engine.json`, the new
  `results/zodiacs-engine-astronomy-engine.json` and notes, and the workflow
  step. Pull request 100's `results/zodiacs-engine-de440.json` and its notes
  are removed: that run needed a pack from outside the repository, and the
  default run now answers from the same bytes inside it.
  `docs/evidence/l1-gap-20261113/` still describes the removed file, as the
  record of that day.
- `artifacts/`: the archive, its receipt, its entry and its row.

No vector, arbiter, tolerance or bound changed. No value the root computes
changed.

## For the owner

1. **Is the shipped pack behind `withEphemeris` what was asked, or should a
   plain `natalChart` use DE440?** This candidate does the first. The second
   is a different engine: every position, and so every pinned value in the
   suite, would move; the root would carry 3.3 MB in every bundle, or load it
   some other way; the root's functions are synchronous and opening a pack is
   not; `calc()`, rising and setting, the star-anchored ayanamsas and
   `birthWindow` refuse under a source today and would need DE440 paths and
   bounds of their own; receipts would change their conventions set by
   default; and instants outside 1790 to 2210 would need a rule. None of it
   was started.
2. **Which run is the engine's headline in `conformance/RESULTS.md`?** It is
   now the shipped pack (459 pass, 0 fail), with the root's own positions as
   the second section (48 of 240). If the headline should stay what a plain
   call gives, the two swap by one argument of the adapter.
3. **The size**: 2.7 MB packed for every install, and the cap and budget
   figures above.
4. **The licensing question** above, before any publication.
5. **Merge order** with pull requests 91, 95 and 100: this branch contains
   100, and cannot merge beside 91 or 95 as it is (*The version*).
6. The archive was carried on local gates alone, before CI ran or anyone
   reviewed it. If the cut should change, rc.8's archive stays as it is and
   the change is a new number.
