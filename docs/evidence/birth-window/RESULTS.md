# Birth-time windows: results

Programme unit B2.a, `@zodiacs/engine/window`. The 1,000-window check ran as
preregistered in `PREREGISTRATION.md` (commit `d1000e66`), on the build of
commit `670db8a6`.

## The 1,000-window check: PASS

| | |
| --- | ---: |
| Windows | 1,000, all passed |
| Samples (natalChart calls at whole seconds) | 12,259,372 |
| Sampled transitions | 24,188 |
| Matched | 24,188 |
| Missed | 0 |
| Extra | 0 |
| Cell disagreements | 0 |
| Searches that threw | 0 |
| Switches reported / changes in them | 20,629 / 25,425 |
| Sub-second excursions, all confirmed at their milliseconds | 8 |
| Millisecond checks (72 components at every switch) / failures | 1,485,288 / 0 |
| Windows flagged `bound-exceeded` | 0 |
| Windows flagged `polar-fallback` | 41 |

Every one of the 24,188 transitions natalChart shows between consecutive
seconds falls in the same second as a reported change of the same component;
no reported change falls in a second without one, except eight that return to
their starting value within it. Those eight, in four switches, are the true
node's: in window 275 (2197, −75.7°, Vehlow) a cusp passes both nodes and,
with the node's evaluation jitter large this far from 2000, their houses
change five times within 8 ms, across a sample instant. natalChart confirms
each change at its own milliseconds.

## Run

- Build: `npm ci` and `npm run build` in a checkout at `d1000e66`, whose
  source, lockfile and TypeScript configuration are identical to `670db8a6`'s.
  `generate.mjs` rebuilt `windows.json` byte for byte.
- `node run.mjs --workers 3`, Node.js v22.22.2, started 2026-09-28T17:30:09Z
  and finished after 96.9 minutes, on a four-core machine shared with other
  jobs (load average 4 to 15 during the run). Summed over the windows, the
  checker took 16,959 s and the search 59 s.
- `results.jsonl` holds one line per window, `summary.json` the totals;
  `summarize.mjs` makes the tables below from them.

| absolute latitude | windows | passed | sampled transitions | matched | missed | extra | sub-second, confirmed | switches | disagreements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0° to 60° | 349 | 349 | 8916 | 8916 | 0 | 0 | 0 | 7730 | 0 |
| 60° to 66° | 326 | 326 | 7328 | 7328 | 0 | 0 | 0 | 6527 | 0 |
| 66° to 67° | 179 | 179 | 5086 | 5086 | 0 | 0 | 0 | 4229 | 0 |
| 67° to 90° | 146 | 146 | 2858 | 2858 | 0 | 0 | 8 | 2143 | 0 |

| house system | windows | passed | sampled transitions | matched | missed | extra | sub-second, confirmed | switches | disagreements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| alcabitius | 71 | 71 | 1981 | 1981 | 0 | 0 | 0 | 1823 | 0 |
| campanus | 87 | 87 | 2421 | 2421 | 0 | 0 | 0 | 2238 | 0 |
| equal | 80 | 80 | 1541 | 1541 | 0 | 0 | 0 | 1369 | 0 |
| equal-mc | 73 | 73 | 1965 | 1965 | 0 | 0 | 0 | 1842 | 0 |
| koch | 70 | 70 | 1088 | 1088 | 0 | 0 | 0 | 837 | 0 |
| meridian | 68 | 68 | 2369 | 2369 | 0 | 0 | 0 | 2232 | 0 |
| morinus | 91 | 91 | 1662 | 1662 | 0 | 0 | 0 | 1559 | 0 |
| placidus | 95 | 95 | 1860 | 1860 | 0 | 0 | 0 | 1674 | 0 |
| porphyry | 71 | 71 | 1355 | 1355 | 0 | 0 | 0 | 1312 | 0 |
| regiomontanus | 78 | 78 | 1883 | 1883 | 0 | 0 | 0 | 1751 | 0 |
| topocentric | 70 | 70 | 2211 | 2211 | 0 | 0 | 0 | 1972 | 0 |
| vehlow | 71 | 71 | 1886 | 1886 | 0 | 0 | 8 | 1686 | 0 |
| whole | 75 | 75 | 1966 | 1966 | 0 | 0 | 0 | 334 | 0 |

| length | windows | passed | sampled transitions | matched | missed | extra | sub-second, confirmed | switches | disagreements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ≤ 10 min | 311 | 311 | 119 | 119 | 0 | 0 | 0 | 114 | 0 |
| 10 min – 2 h | 330 | 330 | 1784 | 1784 | 0 | 0 | 0 | 1510 | 0 |
| 2 h – 12 h | 264 | 264 | 10735 | 10735 | 0 | 0 | 8 | 9415 | 0 |
| 12 h – 24 h | 95 | 95 | 11550 | 11550 | 0 | 0 | 0 | 9590 | 0 |

A switch can carry several changes, and at a whole-sign ascendant switch
every house changes at once, so switches are fewer than transitions.

## Run time

The search's time per window during the check, in one of three worker
threads on the shared machine:

| length | windows | search median | p90 | max | checker median |
| --- | ---: | ---: | ---: | ---: | ---: |
| ≤ 10 min | 311 | 1 ms | 5 ms | 85 ms | 0.2 s |
| 10 min – 2 h | 330 | 10 ms | 39 ms | 513 ms | 2.7 s |
| 2 h – 12 h | 264 | 74 ms | 188 ms | 634 ms | 23.5 s |
| 12 h – 24 h | 95 | 217 ms | 476 ms | 1732 ms | 81.1 s |

`timing.mjs` times the search alone, in one thread, on 39 windows of each
length (each system three times) at typical and at high latitudes, dates 1800
to 2200, with the machine's load average near 2 (`timing.json`):

| length | latitudes | windows | median | p90 | max | median switches |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 10 minutes | −60° to 60° | 39 | 3 ms | 12 ms | 38 ms | 1 |
| 10 minutes | 60° to 90° | 39 | 1 ms | 13 ms | 37 ms | 0 |
| 2 hours | −60° to 60° | 39 | 20 ms | 31 ms | 41 ms | 13 |
| 2 hours | 60° to 90° | 39 | 17 ms | 26 ms | 68 ms | 7 |
| 24 hours | −60° to 60° | 39 | 232 ms | 361 ms | 389 ms | 163 |
| 24 hours | 60° to 90° | 39 | 229 ms | 384 ms | 549 ms | 108 |

A window around one of the true node's ingresses is slower, because every
millisecond near it is evaluated: three-hour windows around the ingresses of
March 2028 and September 2029 took 6 to 9 s, and around the slow one of July
2026, 23 s, with the machine loaded as during the check.

## Package

`package-check.mjs` against a build of the base commit `8c4946b1`
(`package-check.json`):

- All 15 existing JavaScript files in `dist/` are byte-identical, and also
  identical to those in `artifacts/zodiacs-engine-0.1.1-rc.12.tgz`. The
  declaration files say the same once the rollup's shared-chunk names and
  one-letter aliases are resolved.
- The root entry point, bundled and minified: 38,434 bytes, 14,555 gzipped,
  before and after.
- The window entry point alone: 25,116 bytes minified, 9,998 gzipped (with the
  engine code it shares, astronomy-engine excluded). Added to a bundle that
  already has the root entry point: 13,828 bytes minified, 5,199 gzipped. Its
  own module: 14,484 and 6,216.
- `npm pack`: 86,370 bytes packed (73,636 before) and 288,104 unpacked
  (246,329 before), 32 files; the package-contents gate requires under
  300,000 unpacked, which leaves 11,896. `dist/window.js` is 27,982 bytes and
  `dist/window.d.ts` 6,127.

## Gates

Run on the final tree (`gates.log`): typecheck; unit tests, 2,663 in 30 files;
build; export smoke; package contents; `npm pack`; the clean packed consumer,
which now also types and runs `@zodiacs/engine/window`; the conformance
self-test both plain and under `node --test`; the 500 conformance vectors;
this engine's conformance verdicts, all matching the committed results; and
the conformance report check. All passed.

## Scope and limits

- **Sampled, not proven.** The check compares the search with natalChart at
  every whole second. That the search misses nothing between samples rests on
  its enclosures, and three of their inputs are empirical: the body rate
  bounds (about twice the largest rates scanned from 1800 to 2200), the
  obliquity's rate bound (2.4 times) and the true node's jitter bound (at
  least 3.9 times every value scanned from 1700 to 2300); see
  `rate-bounds.json`. Outside 1800 to 2200 none was scanned, and results there
  carry `outside-reference-span`. "Proven" needs the interval runtime.
- **What one second cannot see.** A change and its reversal inside one second
  is invisible to the check. The search's own sub-second changes are confirmed
  by natalChart at their milliseconds; one the search missed would not be
  caught here.
- **Features.** Signs, houses, the ascendant's and midheaven's signs,
  natalChart's five major aspects with its orbs, and the Placidus or Koch
  fallback. Not partitioned: applying or separating, chart points and lots,
  configured aspects, declinations, and the brief's later slices (varga signs,
  KP sub-lords, dashas).
- **The true node.** Its evaluation jitter makes its sign flicker at an
  ingress, hundreds of times over up to seconds, all reported; such a window
  takes seconds, and a node nearly stationary on a boundary can pass the
  two-million-evaluation budget, which throws a RangeError.
- **Places and time.** Exact poles are refused (no ascendant is defined
  there); a place within about 1e-9° of a pole can pass the budget. ΔT is the
  engine's model; a pinned ΔT is not supported. Windows of up to 48 hours are
  accepted; this check covered 1 minute to 23.2 hours, and the unit tests
  two-day windows around two planetary stations.
- **natalChart as a lone call.** astronomy-engine reuses its nutation within
  86.4 ms, so natalChart calls closer together than that can differ from
  these values in the last digits.
- **Package.** 11.9 KB remain under the unpacked-size gate after this entry.
