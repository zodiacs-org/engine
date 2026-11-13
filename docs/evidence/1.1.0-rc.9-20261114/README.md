# 1.1.0-rc.9: the record

Draft candidate 1.1.0-rc.9 (ZOD-206), cut on 2026-11-14 on main at `6825eb3`
(1.1.0-rc.7, with pull requests 91, 92, 95 and 100 merged). It ships the
sealed DE440 pack and makes it the root entry's default source. Its source
commit is `18bcfca`, the merge of main into pull request 101's branch.
Nothing was published, tagged or released.

## What was asked, and what was measured

The request: after a plain `npm install` of the package, a plain
`natalChart()` call, with no environment variable, no pack supplied and no
`withEphemeris`, matches JPL Horizons at all 240 L1 cases of the conformance
suite within the suite's limits, 1″ in longitude and in latitude.

Measured by `tools/l1-installed.sh` on the carried tarball
(`artifacts/zodiacs-engine-1.1.0-rc.9.tgz`, SHA-256
`f1801f0a35ef643a89c73ecd280e1e41142ae36e12c3690433536f9c3368396a`, 2,703,974
bytes): `npm install <tarball>` into a new, empty directory outside the
checkout, Node 22.22.2, every `ZODIACS_*` variable unset, no pack given. The
vectors are `conformance/vectors/L1-positions.json` (SHA-256 in
`results/summary.json`), JPL Horizons's apparent geocentric places from DE441
at 24 TT instants from 1851 to 2148 for the Sun, the Moon and the planets
(Mars to Pluto as system barycentres), carried into the IAU 2006/2000A true
ecliptic of date. The instants are TT on both sides, so no ΔT enters. No new
Horizons request was made.

| run on the installed package | suite limit, 1″ in longitude and latitude | longitude within 30″ | largest difference |
| --- | ---: | ---: | --- |
| plain `natalChart`, nothing else called first (the default source) | 240 of 240 | 240 of 240 | 0.0127″ longitude (the Moon, L1-POS-0002), 0.0011″ latitude (the Moon, L1-POS-0222) |
| inside `withEphemeris` on `openShippedDe440Pack()` | 240 of 240 | 240 of 240 | the same |
| after `setDefaultEphemeris("astronomy-engine")` (the fallback) | 48 of 240 | 240 of 240 | 18.775″ longitude (Neptune, L1-POS-0209), 19.029″ latitude (Saturn, L1-POS-0237) |

The largest differences are rounded up; `results/summary.json` has them to
six places (0.012647″ and 0.001011″), `results/cases.json` and
`results/cases.md` every case, and `results/l1-installed.log` the run's
output. Every chart of the first run names the pack in `chart.ephemeris`; the
script exits 1 otherwise. The vectors do not test the true node, speeds, or
instants outside 1851 to 2148.

The same 240 are enforced in the suite by `src/de440-default.test.ts` (a
plain call) and by the conformance harness, whose default run is plain calls:
459 pass, 0 fail, 41 unsupported of 500.

## What was not done

- **The calc entry is not on DE440.** `calc`, `houses`, `chart` and `events`
  of `@zodiacs/engine/calc`, `birthWindow`, the sky entry's rising, setting
  and planetary hours, and the vedic entry's star-anchored ayanamsas and
  `vargaSensitivity` still compute on astronomy-engine and name it. Their
  bounds were measured on astronomy-engine; DE440 positions in the calc
  entry's eight frames need bounds that have not been measured. So a default
  `calc()` position and the root's `positions()` differ inside 1790 to 2210,
  within the limits `calc()` quotes. `docs/de440.md` and the CHANGELOG say so.
- **The suite's older tests run on the fallback.** `src/test-setup.ts` sets
  astronomy-engine before each test file. Without it
  (`tools/vitest.default-source.config.mjs`), on the source commit's tree, 99
  tests fail in 21 files and 4,125 pass
  (`results/suite-default-source.log`). The failing files pin
  astronomy-engine's values, compare the root with the entries that compute
  on astronomy-engine, or count astronomy-engine's calls; the failures were
  not gone through one by one, and none was "fixed" by loosening a test.
- The time the first call takes to open the pack was not measured.
- No sweep of the default source over 1790 to 2210: the 240 vectors are the
  accuracy evidence, and the 146,097-day sweep of 1.1.0-rc.7 measured
  astronomy-engine, not the pack.
- Node 22.7.0 was not available on the machine. CI runs it.

## 1.1.0-rc.8

Withdrawn. It was cut on 1.1.0-rc.3 in this pull request on 2026-11-13,
before the owner merged 1.1.0-rc.6 and 1.1.0-rc.7, and it left a plain call
on astronomy-engine (48 of 240). Its archive was removed in the merge commit
and is recorded as superseded; `scripts/verify-archive-binding.mjs` pins the
three commits that held it and refuses the number from now on
(`artifacts/README.md`). Its record stays in `../1.1.0-rc.8-20261113/`.

## Sizes

`sizes.json` (`tools/sizes.mjs`, 1.1.0-rc.7's carried archive against this
one):

| | 1.1.0-rc.7 | 1.1.0-rc.9 | |
| --- | ---: | ---: | --- |
| tarball | 335,403 | 2,703,974 | 8.1 times |
| unpacked | 1,152,017 | 4,502,147 | 3.9 times |
| unpacked, without the pack's text | 1,152,017 | 1,182,595 | 30,578 more |
| files | 94 | 98 | |
| the root's import graph, without the pack's text | 108,531 | 142,693 | and the pack's 3,319,552 characters |

The pack's base64 text is in one file, `dist/chunk-2ABJESXV.js`, once; the
root and `./de440/pack` import that one file. `entryGraphs` in `sizes.json`
has every entry point's graph in both archives.

## Gates

`tools/gates.sh`, Node 22.22.2, in a mount namespace without the machine's
root-owned `/node_modules`: every command of `AGENTS.md`'s list that needs no
second Node version, the conformance and atlas commands, and the offline
CLI's two workflow steps.

- Source commit `18bcfca` and carrier `f56aeeb`: all eighteen commands exit 0
  on each (`results/gates-18bcfca-v22.22.2.log`,
  `results/gates-f56aeeb-v22.22.2.log`). Suite: 4,224 passed, 3 skipped, none
  failed. The archive check passes with 1.1.0-rc.8 withdrawn (24 recorded
  archives, 20 carried and 4 superseded, across 369 commits) and, at the
  carrier, rebuilds HEAD and finds the carried tarball byte for byte.
- Suite on other Node versions, at the carrier: 4,223 passed and 4 skipped on Node 20.19.0 and on
  Node 24.21.0, none failed
  (`results/tests-v20.19.0.log`, `results/tests-v24.21.0.log`).
- Archive: clean clones of `18bcfca` packed the same bytes on Node 22.22.2,
  20.19.0 and 24.21.0 (`results/source-packs.log`).
- Packed-consumer check on the tarball: exit 0 on Node 22.22.2, 20.19.0 and
  24.21.0 (`results/consumer-f1801f0a-*.log`).
- Offline CLI consumer (the check that failed on 1.1.0-rc.8's head): it
  installs the carried 1.0.0-rc.2 archive, and its baseline is now
  `conformance/results/zodiacs-engine-astronomy-engine.json`, the fallback's
  verdicts for all 500 vectors, which are main's verdicts for
  `zodiacs-engine.json` one for one (267 pass, 192 fail, 41 unsupported).
  Exit 0 on Node 22.22.2 (in both gate logs), 24.21.0 and 20.19.0
  (`results/cli-consumer-*.log`, without the report's base64 lines).
- `--rebuild-all`: exit 0 at the carrier. Every recorded archive, the withdrawn
  1.1.0-rc.8 from its source commit and 1.1.0-rc.9 among them, rebuilds to
  its recorded bytes (`results/rebuild-all-f56aeeb-v22.22.2.log`).
- CI: not waited for.

## Files

- `results/l1-installed.log`, `summary.json`, `cases.json`, `cases.md`: the
  240 cases on the installed tarball.
- `results/source-packs.log`: the archive packed from clean clones of the
  source commit.
- `results/gates-*.log`: the gate runs. `results/consumer-*.log`: the
  packed-consumer check on the tarball.
- `results/suite-default-source.log`: the suite without the setup file.
- `sizes.json`; `tools/`: the scripts that wrote all of the above.
