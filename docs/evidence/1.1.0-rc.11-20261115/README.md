# 1.1.0-rc.11: every techniques result labelled, and the sweep's check fixed

The candidate for 1.1.0 on draft pull request 101, cut on 2026-11-15 after
the review of 1.1.0-rc.10 (`../1.1.0-rc.10-20261114/breaker/BREAKER.md`).
It replaces 1.1.0-rc.10, whose checks are in `../1.1.0-rc.10-20261114/`.
Nothing here was tagged, published or merged.

Machine: one Linux x86-64 host shared with other jobs, Node 22.22.2 unless a
line says otherwise. The host has a root-owned `/node_modules`, so every
command that the archive-binding check or a consumer check runs was started
in a mount namespace without it (`tools/gates.sh` has the command).

## What changed against 1.1.0-rc.10

- The breaker's blocker B1: ten functions of `@zodiacs/engine/techniques`,
  and `bodyLongitude` and `longitudeSpeed` on `./internal`, returned
  astronomy-engine's answer with no flag and no ephemeris name where the
  pack could not be opened or the instant was outside it. Each now says so
  (`docs/techniques.md`, *Which ephemeris*; `docs/de440.md`).
- The dense DE440 sweep's workflow failed on 1.1.0-rc.10. The cause and the
  fix are below.
- The README's and CHANGELOG's 29 arcseconds are said to be the largest at
  one instant a day, not a limit, with the Neptune instant measured on this
  build (the breaker's S1).
- A suite test of pull request 102's flag and widening on the pack (S2).

## The sweep's failure on 1.1.0-rc.10

Workflow run 43618467433 on `d92a213`: every era passed, and the last step,
`write_bounds.py --against`, found the `geocentric/apparent` rows over the
limits `src/calc-bounds.ts` quotes: Jupiter's position 19.05″ against 17″,
and the rate of every planet far over (Jupiter 686″ a day against 0.11),
while the Sun's and the Moon's held.

The era results (downloaded from the run) say where: against the kernel's
place with the Sun's light deflection (`withDeflection`, true ecliptic of
date), the engine's apparent planets were within 0.004″ at every instant
but those few where a planet was within a tenth of a degree of the Sun's
centre (Jupiter on JD 2499942.0, Saturn on 2383621.0, Mercury on 2431039.0
TT), and against the bound's arbiter, which leaves the deflection out, they
differed by the deflection itself. So:

1. `src/calc-bounds.ts` holds the bounds `calc()` quotes for
   astronomy-engine's results; on the pack it quotes
   `src/calc-bounds-de440.ts` (`src/calc.ts`). From 1.1.0-rc.10 `calc()`'s
   default is the pack, and `engine_sweep.mjs` ran `calc()` at its default,
   so it measured the pack against astronomy-engine's limits.
2. Its arbiter for an apparent place is light time and aberration without
   the deflection, which astronomy-engine leaves out and the pack's
   reduction (`src/de440/reduce.ts`) applies. A planet behind the Sun is
   bent by many arcseconds there, and its rate changes by hundreds of
   arcseconds a day as it passes: that was the rate row.

Neither is an engine error: the pack's places and rates agree with the
kernel's to the precision above wherever the two deflection models agree
(see *The sweep on the pack*, below, for every instant). The tools are
fixed (`../de440-sweep-20261111/tools/`):

- `engine_sweep.mjs --ephemeris astronomy-engine|de440` sets the source
  with `setDefaultEphemeris` and refuses a result that another source
  computed or that carries a fallback flag; the workflow passes
  `astronomy-engine`.
- `sweep.py shard` compares a run on the pack with the kernel's place with
  the deflection (`erfa.ld` with `erfa.ldsun`'s limiter, then `erfa.ab`), and
  its rates with that place's central difference; `merge` keeps which
  source was run.
- `write_bounds.py` (writing and `--against`) and `dry_run.py` refuse a run
  on the pack.

### The sweep on astronomy-engine, run here

`tools/run-sweep.sh astronomy-engine` on the build of `d92a213` with the
fixed tools (the position code 1.1.0-rc.11 keeps), the kernel `de440.bsp`
(SHA-256 `a4ce9bf9…c4b5`), Python 3.13.5 with pyerfa 2.0.1.5, numpy 2.4.6
and jplephem 2.24 (the workflow uses Python 3.11): `sweep/`.

- The self-checks S1 and S2 pass (`sweep/selfcheck.json`).
- In all eight eras the engine's values are the same bytes as 1.1.0-rc.3's
  committed sweep (`sweep/against.log`), so every table and bound is the
  committed sweep's (`sweep/summary.json` has the same `bounds`).
- `write_bounds.py --against`: every largest difference of the 32 rows is
  within the limit `src/calc-bounds.ts` quotes. `dry_run.py` changes no
  file. `src/calc-bounds.ts` is unchanged.

The workflow's own run on this candidate's head is the measurement of this
build; it was not waited for.

### The sweep on the pack

`tools/run-sweep.sh de440` (`KEEP=1`) on this candidate's build, then
`tools/pack_near_sun.py` on the engine values it kept: `sweep-pack/` and
`results/pack-near-sun.json`. The build swept is a `dist/` whose `.js`
files have the carried archive's digest (`find dist -name '*.js' | sort |
xargs sha256sum | sha256sum`: `ce728d56…` for both); its `.d.ts` files
differ from the carried ones by one doc comment of `DetailedResult`, written
after the copy was taken. `results/near-sun.json` was made on the same
build. This is evidence about the pack, not a bounds table: `calc()` on the
pack still quotes `src/calc-bounds-de440.ts`.

Against the kernel's place with the deflection, with `erfa.ldsun`'s limiter
(`sweep-pack/tables.md`), over the 146,097 instants and all eight frames:
the Sun, the Moon, Venus, Neptune and Pluto are within 0.0045″ (the Moon
0.00443″, the Sun 0.00394″); the true node within 0.566″ of the kernel's
osculating node; Mercury, Mars, Jupiter, Saturn and Uranus within the same
0.004″ except at a few instants, up to 17.308″ (Jupiter, JD 2499942.0 TT),
with rate differences up to 624.5″ a day there.

`results/pack-near-sun.json` splits each body's instants at 0.1° from the
Sun's centre (the Sun's own row is all in the near part, at 0°, and means
nothing there), true ecliptic of date:

| body | instants within 0.1° | largest angle, farther, either limiter | within 0.1°, ldsun's limiter | within 0.1°, the engine's limiter (1e-14) |
| --- | ---: | ---: | ---: | ---: |
| Mercury | 10 | 0.0040″ | 5.000″ (0.0178° from the centre) | 0.0012″ |
| Venus | 5 | 0.0040″ | 0.0007″ | 0.0007″ |
| Mars | 7 | 0.0040″ | 5.643″ (0.0320°) | 0.0016″ |
| Jupiter | 7 | 0.0040″ | 17.308″ (0.0206°) | 0.0031″ |
| Saturn | 3 | 0.0039″ | 7.247″ (0.0420°) | 0.0016″ |
| Uranus | 4 | 0.0040″ | 6.196″ (0.0463°) | 0.0005″ |
| Neptune | 2 | 0.0040″ | 0.0011″ (0.0986°) | 0.0011″ |
| Pluto | 0 | 0.0040″ | | |
| Moon | 0 | 0.0043″ | | |

Each figure is rounded up from `results/pack-near-sun.json`.

Rates, against the arbiter's own central difference over 0.0001 day: farther
than 0.1°, within 0.426″ a day for the Moon and 0.039″ for every other
body, with either limiter; within 0.1°, up to 624.5″ a day (Jupiter) with
ldsun's limiter and 0.89″ a day (Jupiter) with the engine's, the difference
of the two steps over a deflection that changes fast.

So the pack's place and rate agree with the kernel's to a few
thousandths of an arcsecond wherever the deflection model is the same, in
every frame, near the Sun too; every larger difference is at an instant
within 0.1° of the Sun's centre (each body's largest within 0.05°), where
`erfa.ldsun` tapers the deflection to zero (inside about 0.081°) and
`src/de440/reduce.ts`, with its limiter of 1e-14, does not.

## The techniques entry's labels

`src/ephemeris-fallback-techniques.test.ts`, 7 tests, all passing, each on a
new copy of the modules: the twelve functions (`solarReturnInstant`,
`mostRecentSolarReturnInstant`, `lunarReturnInstant` and `moonSignsBetween`
through their detailed forms, `moonIngresses`, `moonAspects`,
`voidOfCourseAt`, `voidOfCourseWindows`, `compositeChart`,
`chartAspectPatterns`, and `bodyLongitude` and `longitudeSpeed` on
`./internal` through theirs), every result and every element of a list:

| case | what each must say |
| --- | --- |
| the pack whole, 2024-03-01 | `jpl-de440` with the pack's version, no flag |
| the pack's text with one character changed | astronomy-engine, `["de440-unavailable"]` |
| 1750-06-01 and 2230-06-01, the pack whole | astronomy-engine, `["outside-reference-span", "outside-de440-span"]` (`./internal`: `["outside-de440-span"]`) |
| `setDefaultEphemeris("astronomy-engine")` | astronomy-engine, no fallback flag (at 2230 `["outside-reference-span"]` only) |

and that a list running past the pack's last day labels the elements before
it `jpl-de440` and those after it astronomy-engine, and that a result built
from supplied charts takes their labels (`null` where they differ or name
none). Each detailed form's `value` is the plain function's result.

Installed package: `scripts/verify-packed-consumer.mjs`, which removes,
damages and replaces the installed pack's text, now also checks
`solarReturnInstantDetailed`, `voidOfCourseAt`, `compositeChart`,
`chartAspectPatterns`, each element of `moonIngresses`, and
`bodyLongitudeDetailed` in each state. `results/consumer-d84f3302-v*.log`:
exit 0 on Node 22.22.2, 20.19.0 and 24.21.0.

## The size of the change, said exactly (S1)

`tools/near-sun.mjs` on this build's `dist/` (`results/near-sun.json`):
Neptune at 1920-08-03T23:48:31Z, 0.02341° from the Sun's centre in the
pack's apparent places, is 33.369″ in longitude and 18.149″ in latitude
from its place after `setDefaultEphemeris("astronomy-engine")` (37.985″ as
an angle); at noon UTC on the 3rd and the 4th, 0.44° and 0.48° from the
Sun's centre, 11.896″ and 13.830″ in longitude. These are the breaker's
figures (`../1.1.0-rc.10-20261114/breaker/`), measured again here. They are
a difference between two of the engine's sources, not an accuracy.

## The 240 L1 vectors on the installed package

`tools/l1-installed.sh` installs the carried tarball into a new empty
directory outside the checkout with `npm install`, unsets every `ZODIACS_*`
variable, and runs `tools/l1-installed.mjs` there (`results/l1-installed.log`,
`results/summary.json`, `results/cases.json`, `results/cases.md`). The
arbiter is the vectors' own: JPL Horizons (DE441) in the IAU 2006/2000A true
ecliptic of date, 24 TT instants from 1851 to 2148, ten bodies.

| how it was asked | within 1″ in longitude and latitude | largest difference |
| --- | ---: | --- |
| plain `natalChart()`, first call of the process | 240 of 240 | 0.0126″ longitude (L1-POS-0002), 0.0010″ latitude (L1-POS-0222), both the Moon; 0.0127″ as an angle |
| `natalChart()` inside `withEphemeris` on the shipped source | 240 of 240 | the same |
| `calc({ body, time: { jd, scale: "tt" } })` | 240 of 240 | 0.0128″ longitude and as an angle, 0.0010″ latitude, the Moon; every case inside the bound its own result quotes; equal to `natalChart()` at one Date in 240 of 240 |
| after `setDefaultEphemeris("astronomy-engine")` | 48 of 240 | 18.7745″ longitude, 19.0281″ latitude |

`birthWindow`: the body's sign in the cell that holds each vector's instant
is Horizons's sign in 240 of 240 and `natalChart()`'s in 240 of 240; every
window names `jpl-de440` and carries no flag.

## Gates

`results/gates-4d8b3fe-v22.22.2.log`, written by `tools/gates.sh` on
`4d8b3fe` (the commit that carries the archive), with no tracked file
modified: every one of its 18 commands exits 0.

- typecheck; `npm test`: 4,295 passed, 3 skipped, none failed, in 110 files
  (one file skipped); build; exports smoke; API check; package contents;
  pack dry run; the pack generator's check.
- `node scripts/verify-archive-binding.mjs`: the carried 1.1.0-rc.11
  archive is byte-identical to a rebuild of the head; 26 recorded archives
  (22 carried, 4 superseded) hold their bytes across 381 commits.
  With `--rebuild-all` (`results/rebuild-all-v22.22.2.log`): all 26 rebuild
  to their bytes from their source commits, 1.1.0-rc.10's and 1.1.0-rc.11's
  among them.
- Conformance: selftest; 500 vectors valid; a plain run matches the
  committed results (459 pass, 0 fail, 41 unsupported; L1 240 of 240), and
  the `--ephemeris astronomy-engine` run matches its own (267, 192, 41);
  report check. Both result files were regenerated on this candidate with
  Node 22.22.2; only the version in them changed.
- Atlas check and selftest.
- Offline CLI consumer (`preserve-checkout-bytes.mjs`,
  `prepare-consumer.mjs`): exit 0.
- Packed consumer on the carried tarball, Node 22.22.2, 20.19.0 and
  24.21.0: exit 0 (`results/consumer-d84f3302-v*.log`).
- The source commit `c766129` packed to the same bytes from clean clones on
  Node 22.22.2, 20.19.0 and 24.21.0 (SHA-256 `d84f3302...5e56`, 2,720,663
  bytes).

## Sizes

`sizes.json` (`tools/sizes.mjs` on the two carried archives).

| | 1.1.0-rc.7 | 1.1.0-rc.10 | 1.1.0-rc.11 |
| --- | ---: | ---: | ---: |
| tarball | 335,403 | 2,716,319 | 2,720,663 |
| unpacked | 1,152,017 | 4,540,059 | 4,557,833 |
| unpacked beside the pack | 1,152,017 | 1,220,507 | 1,238,281 |
| files | 94 | 98 | 98 |

Raised, for the owner to decide (`scripts/verify-package-contents.mjs`):
the techniques entry's import graph, 201,294 bytes, from 199,900 to 203,800;
the total beside the pack from 1,225,000 to 1,245,000. Every other graph is
inside its budget (the root 148,136 of 149,400).

## Not done, and limits

- On the pack, `calc()` quotes the bounds of the 240 L1 vectors; the sweep
  on the pack above is evidence, not a bounds table.
- The pack's reduction bends light by the Sun with no cut at the limb, as
  the research runtime it was ported from does; ERFA's `eraLdsun` tapers it
  to zero within about 0.081° of the Sun's centre. Where a planet is that
  close the two differ by many arcseconds. Whether to adopt a limiter is
  the owner's call: it would change `natalChart()` there.
- `calc()`'s other centers and corrections, the sky entry's rising and
  setting and the vedic entry's star-anchored ayanamsas and
  `vargaSensitivity` are still on astronomy-engine, which is not a
  fallback; those sky and vedic results name no ephemeris.
- The clients' contract (`clients/`) does not list the two fallback flags.
- Node 22.7.0 is not on this machine. CI was not waited for.
