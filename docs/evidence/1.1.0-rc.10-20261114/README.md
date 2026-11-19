# 1.1.0-rc.10: every function on DE440, and no silent fallback

Linear ZOD-206. The candidate for 1.1.0 on draft pull request 101, cut on
2026-11-14 after the owner's calls of that day. It replaces 1.1.0-rc.9, the
same pull request's first draft, whose checks are in
`../1.1.0-rc.9-20261114/`. Nothing here was tagged, published or merged.

Machine: one Linux x86-64 host shared with other jobs, Node 22.22.2 unless a
line says otherwise. The host has a root-owned `/node_modules`, so every
command that the archive-binding check or a consumer check runs was started
in a mount namespace without it (`tools/gates.sh` has the command).

## What changed against 1.1.0-rc.9

- `calc()`, `chart()`, `events()` (the calc entry) and `birthWindow` compute
  on the root's default source, the shipped DE440 pack, as `natalChart()`
  does. In 1.1.0-rc.9 they were on astronomy-engine.
- A result that astronomy-engine computed where the pack was the default
  says so: the flags `de440-unavailable` and `outside-de440-span`, and the
  ephemeris named on every chart, body row, calc receipt and window.
- Pull request 102's head (`fe49889`, the far-future ΔT flag, ZOD-65) is
  merged in (`bca39af`).

## The number

The brief asked for the candidate to stay 1.1.0-rc.9, re-packed, unless the
repository's rules forbid reusing the number. They do: `artifacts/README.md`
("a version string names one byte sequence"; "once carried, an archive is
never repacked, replaced or removed"), `AGENTS.md` ("never rewrite, repack,
replace, rename or delete an archive, its receipt, or an entry of
`archives.json`"), and the archive-binding check, whose manifest is
append-only and which pins its only two exceptions. 1.1.0-rc.9's archive was
carried and pushed (`f56aeeb`). So this cut is 1.1.0-rc.10, the next free
number, and 1.1.0-rc.9's archive stays as it is; the check needed no new
exception.

## The 240 L1 vectors on the installed package

`tools/l1-installed.sh` installs the carried tarball into a new empty
directory outside the checkout with `npm install`, unsets every `ZODIACS_*`
variable, and runs `tools/l1-installed.mjs` there, which gives no pack and
sets nothing before the run that counts. `results/l1-installed.log`,
`results/summary.json`, `results/cases.json`, `results/cases.md`. The
arbiter is the vectors' own: JPL Horizons (DE441) in the IAU 2006/2000A true
ecliptic of date, 24 TT instants from 1851 to 2148, ten bodies.

| how it was asked | within 1″ in longitude and latitude | largest difference |
| --- | ---: | --- |
| plain `natalChart()`, first call of the process | 240 of 240 | 0.0126″ longitude (L1-POS-0002), 0.0010″ latitude (L1-POS-0222), both the Moon; 0.0127″ as an angle |
| `natalChart()` inside `withEphemeris` on the shipped source | 240 of 240 | the same |
| `calc({ body, time: { jd, scale: "tt" } })` | 240 of 240 | 0.0128″ longitude and as an angle, 0.0010″ latitude, the Moon; every case inside the bound its own result quotes |
| after `setDefaultEphemeris("astronomy-engine")` | 48 of 240 | 18.7745″ longitude, 19.0281″ latitude |

`calc()` reads the vector's Julian date itself, where `natalChart()` takes a
Date, a whole millisecond: that is the 0.0002″ between the two rows (the
Moon moves 0.55″ a second). Given one Date, `calc()`'s longitude, latitude
and longitude speed are `natalChart()`'s to the bit in 240 of 240 cases, and
its receipt names `jpl-de440` with no flag in every one.

`birthWindow` gives no positions, so the vectors apply to it through the
sign: in a window of one minute around each vector's instant, the sign of
the vector's body in the cell that holds the instant is the sign of
Horizons's longitude in 240 of 240, and `natalChart()`'s in 240 of 240. Every
window names `jpl-de440` and carries no flag.

## calc() and natalChart() agree

- `src/de440-default.test.ts`: for all twelve bodies `calc()`'s longitude,
  latitude and speed equal `positions()`'s to the bit on the pack, `chart()`
  equals `natalChart()`, and `events()` finds `findLongitudeCrossings`'s
  instants.
- What `calc()` leaves on astronomy-engine (a heliocentric, barycentric or
  topocentric center, an astrometric or geometric correction, the Earth) is
  named so in its receipt and listed in `docs/calc.md`, *Which ephemeris*,
  with the reason.
- `src/calc-bounds-de440.test.ts` recomputes the bounds `calc()` quotes on
  the pack from the 240 vectors: the Moon 0.013″, the Sun and the planets
  0.0034″ to 0.0038″.

## The fallback is never silent

Library: `src/ephemeris-fallback.test.ts`, 29 tests, all passing. Each case
runs on a new copy of the modules.

| case | how it is made | what every result must say |
| --- | --- | --- |
| missing | the pack's base64 text is the empty string | `de440-unavailable`, astronomy-engine named |
| damaged | one character of the text changed | the same |
| damaged | the text cut to half | the same |
| undecodable | text that is not base64 | the same |
| out of coverage | the pack whole; instants in 1700 and 2300, and searches that leave the pack | `outside-de440-span`, astronomy-engine named |
| the caller's choice | `setDefaultEphemeris("astronomy-engine")` | astronomy-engine named, no fallback flag |

Checked in the four unavailable cases: `defaultEphemeris()`; `natalChart`
(flags, `ephemeris`, each body, a natal receipt written and read back);
`positions`, `transits`, `synastry`, `progressedBodies`, `moonPhase`,
`saturnReturn`, `searchLongitudeCrossings`; `calc`, `chart`, `events`;
`birthWindow`; the timing entry's `profectionAt` and the techniques entry's
`solarReturn`.

Installed package: `scripts/verify-packed-consumer.mjs` installs the tarball,
then rewrites the one installed file under `dist/` that holds the pack's text
in the same four ways, runs a new process each time, restores the file and
runs a last one. `results/consumer-7fbdf3ad-v22.22.2.log` (and `-v20.19.0`,
`-v24.21.0`) hold the report: in each of the four, `natalChart`'s flags are
`["de440-unavailable"]` and it names astronomy-engine, with
`defaultEphemeris().de440.error` "the pack's SHA-256 is not the one
expected" (three cases) or "Invalid character"; restored, the flags are
empty and it names `jpl-de440`. The same process checks `positions`,
`moonPhase`, `saturnReturn`, a crossing search, `calc` for four bodies,
`chart`, `events`, `birthWindow` and a natal receipt.

## Birth-time windows on the pack

All run on the installed package's `dist/` (`ZODIACS_ENGINE_DIST`), with the
tools of `../birth-window/` unchanged and one new one.

- `results/window-pack-seams.json` (`tools/window-pack-seams.mjs`): at the
  96,049 instants the pack's source lists from 1800 to 2200, the longitude
  steps by up to 3.07e-4° (1.11″) for the true node, 2.91e-7° for the Moon
  and under 7e-8° for the Sun and the planets; a second later, where no step
  is listed, by under 6e-10°. The node's step is above its jitter bound, so
  the search treats each listed instant as a seam.
- `results/window-node-jitter-de440.json` (`../birth-window/node-jitter.mjs`):
  29,220 epochs, 3,000 consecutive milliseconds each; the node stays within
  4.5e-12° of a quadratic (astronomy-engine: 4.4e-5°).
- `results/window-rate-bounds-de440.json` (`../birth-window/rate-bounds.mjs`):
  the bounds hold with their margin for the Sun, the Moon, Mercury, Venus,
  Mars, Jupiter, Pluto and the node (bound over largest rate plus what the
  grid can miss, 1.92 to 2.06), and not near the Sun: Neptune reaches 0.142°
  a day on 1920-08-04 against a bound of 0.077, behind the Sun, where the
  reduction's light deflection moves its place; Saturn's and Uranus's ratios
  fall to 1.48 and 1.45 the same way. `Sky.rate` in `src/window.ts` raises
  the bound there; `src/window-de440.test.ts` has the Neptune window.
- `results/windows-1000-de440.summary.json` and `.results.jsonl`
  (`../birth-window/run.mjs` on `../birth-window/windows.json`, the 1,000
  preregistered windows): PASS. 1,000 of 1,000 windows passed; 12,259,372
  whole-second samples with no disagreement; 24,188 sampled transitions, all
  matched, none missed, none extra; 20,026 switches reported with 24,217
  changes; 1,441,872 millisecond checks, none failed; no window flagged
  `bound-exceeded`; no search threw. 16.9 minutes on six workers. The run
  was made on the installed `dist/` of this candidate's first local packing
  (SHA-256 `55e6e32f...`, never pushed), which was packed again for a wrong
  sentence in its README; the `.js` and `.d.ts` files of the two builds have
  one digest (`sha256sum *.js *.d.ts | sha256sum` in `dist/`:
  `837f6cb8...bdbb`), so the scans above were not repeated.

## Gates

`results/gates-c65f69e-v22.22.2.log`, written by `tools/gates.sh`: every
command exits 0.

On `c65f69e` (the commit that carries the archive), with no tracked file
modified:

- typecheck; `npm test`: 4,285 passed, 3 skipped, none failed, in 108 files
  (one file skipped); build; exports smoke; API check; package contents;
  pack dry run; the pack generator's check.
- `node scripts/verify-archive-binding.mjs`: the carried 1.1.0-rc.10 archive
  is byte-identical to a rebuild of the head. With `--rebuild-all`
  (`results/rebuild-all-v22.22.2.log`): 25 recorded archives (21 carried, 4
  superseded) rebuild to their bytes, 1.1.0-rc.9's and 1.1.0-rc.10's among
  them.
- Conformance: selftest; 500 vectors valid; a plain run matches the
  committed results (459 pass, 0 fail, 41 unsupported; L1 240 of 240), and
  the `--ephemeris astronomy-engine` run matches its own (267, 192, 41);
  report check. Both result files were regenerated on this candidate with
  Node 22.22.2.
- Atlas check and selftest.
- Offline CLI consumer (`preserve-checkout-bytes.mjs`,
  `prepare-consumer.mjs`): exit 0.
- Packed consumer on the carried tarball, Node 22.22.2, 20.19.0 and
  24.21.0: exit 0 (`results/consumer-7fbdf3ad-v*.log`).
- The suite on Node 20.19.0 and 24.21.0 (`results/tests-v*.log`): 4,284
  passed, 4 skipped, none failed, on each.
- The source commit `cafc5db` packed to the same bytes from clean clones on
  Node 22.22.2, 20.19.0 and 24.21.0 (SHA-256 `7fbdf3ad...3246`, 2,716,319
  bytes).

## Sizes

`sizes.json` (`tools/sizes.mjs` on the two carried archives).

| | 1.1.0-rc.7 | 1.1.0-rc.9 | 1.1.0-rc.10 |
| --- | ---: | ---: | ---: |
| tarball | 335,403 | 2,703,974 | 2,716,319 |
| unpacked | 1,152,017 | 4,502,147 | 4,540,059 |
| unpacked beside the pack | 1,152,017 | 1,182,595 | 1,220,507 |
| files | 94 | 98 | 98 |

## Not done, and limits

- `calc()`'s other centers and corrections, the sky entry's rising and
  setting and the vedic entry's star-anchored ayanamsas and
  `vargaSensitivity` are still on astronomy-engine (`docs/de440.md`).
- On the pack, `calc()` quotes no bound for a distance, a speed or the true
  node: nothing was compared.
- The sky, vedic and geo entries' own result types gained no fallback flag;
  the charts inside them carry it.
- `findLongitudeCrossings` returns bare crossings and cannot say which
  ephemeris they came from.
- The clients' contract (`clients/`) does not list the two new flags: the
  hosted compute API computes inside `withEphemeris`, where no fallback
  occurs.
- Node 22.7.0 is not on this machine. CI was not waited for.
