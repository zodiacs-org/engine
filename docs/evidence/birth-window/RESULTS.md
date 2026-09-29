# Birth-time windows: results

Programme unit B2.a, `@zodiacs/engine/window`. The 1,000-window check ran as
preregistered in `PREREGISTRATION.md` (commit `d1000e66`), on the build of
commit `670db8a6`. An independent review then reproduced it and ran 300
windows of its own; its findings were fixed in commits `94b9fa2` to `e0833ee`,
and on the build of `e0833ee` the review's checker ran both sets again ("After
the review", below). A second round of review asked for documentation fixes
only, made in `f9ae1de`, whose built JavaScript is byte-identical to
`e0833ee`'s, and for a stricter check of the unresolved intervals.

## The search

`birthWindow` halves the window until each feature is settled. On an
interval, a feature is dropped when an enclosure of every quantity it depends
on keeps clear of every threshold and the feature agrees at both ends; single
milliseconds are compared directly. The enclosures:

- A body's longitude, from its values at both ends and `WINDOW_RATE_BOUNDS`:
  twice the largest rate the engine's positions reach from 1800 to 2200, in
  degrees per day (Moon 31, Mercury 4.5, Venus 2.6, Sun 2.1, Mars 1.6, Jupiter
  0.49, Saturn 0.27, Uranus 0.13, Pluto 0.082, Neptune 0.077, nodes 0.53;
  `rate-bounds.json`). The separation of two bodies takes the sum of their
  bounds.
- The true node, as the engine computes it, departs from its smooth motion
  from one millisecond to the next, because astronomy-engine differences the
  Moon's position over 1.728 s for its velocity. Its enclosure is widened by
  twice J = 5e-5·(1 + |T|)°, T in Julian centuries from 2000. A scan of 3,000
  consecutive milliseconds every five days from 1800 to 2200 (29,220 epochs,
  `node-jitter.json`) finds the departure growing away from 2000: at most
  2.4e-6° in the 1990s and 2000s, 2.5e-5° around 1900 and 2100, and 4.8e-5°
  near the ends of the span, the largest in 2187, where J is 2.97 times as
  large. J is at least 2.97 times every value found. It was scanned, not
  derived, so a larger departure between the samples is not ruled out.
- Where the node's smooth motion lies within about 2J of a sign boundary, its
  sign can change back and forth from one millisecond to the next, and the
  search compares it at every millisecond: for about 4J/|rate| days around an
  ingress, 1.5 minutes at the fastest ingress from 1800 to 2200, 4.5 minutes
  at the median one and 2.3 hours at the slowest (`node-ingresses.json`).
  Before the search, the node is sampled every hour, and every minute where
  it may be near a boundary; stretches of those samples within 5J of one are
  set aside, with the milliseconds a search of each would need estimated from
  where the samples lie within 3J. The rest of the window is settled first.
  Each stretch is then searched, cheapest first, if all its milliseconds, or
  its estimate, fit in what is left of the budget of two million evaluated
  instants; one that does not, or whose search runs out, is left unresolved:
  the nodes' signs, and their houses where the houses are whole signs, are
  null throughout it, it is listed in `unresolved`, and the result carries
  `node-unresolved`. Outside the stretches the node stays at least 4J from a
  boundary, where the search drops its intervals of up to some seconds.
- Angles and cusps follow the sidereal time, which increases, and the
  obliquity, which changes by less than 5e-5° a day. The ascendant, the
  midheaven and the Regiomontanus, Campanus, Topocentric, Koch, Alcabitius and
  Meridian cusps are oblique longitudes, whose exact range over an interval of
  ascensions comes from its ends and turning points. Outside the polar circle
  Placidus cusps increase with the sidereal time (the iteration's slope is at
  most 2/3); Morinus cusps always do; Porphyry and the equal systems follow
  from the angles. Inside the polar circle the ascendant turns half a circle
  where the horizon meets the ecliptic on the meridian, and an interval that
  may contain such a turn is halved to the millisecond.
- Near the polar limit Placidus cusps carry the rounding of asin near ±1, up
  to 6.5e-7° one unit in the last place below it, where the RAMC is near a
  value at which a cusp's right ascension reaches 90° or 270°: 30°, 150°,
  210°, 270° and 330° in the north, 30°, 90°, 150°, 210° and 330° in the
  south. Koch's cusps do near 90° and 270°, where the midheaven's declination
  is extreme. Where the latitude is within 1e-8° of the limit, plus what the
  obliquity can change over the interval, and the RAMC within 0.1° of those
  values, the house system and the houses are compared at every millisecond.
- The bounds assume ΔT is continuous. The engine's ΔT model has one
  discontinuity inside `REFERENCE_SPAN`, at 1940-12-31T18:00:00.000Z (1941.0),
  where its spline for the past hands over to its table and ΔT steps from
  24.834 s to 24.820 s: TT, and every position computed from it, steps back
  13.95 ms. The Moon, the obliquity and the sidereal time step there; the true
  node also 864 ms either side of it, where one of the two lunar positions it
  differences crosses it; the Sun and planets one light time later, from about
  8 minutes (the Sun) to 5.6 hours (Pluto), where their backdated positions
  cross it. The search finds each of those milliseconds from the engine's own
  arithmetic and never drops an interval that holds one: it halves it down to
  the step and compares both sides directly.
- Thresholds carry a band of 1e-9° for rounding. Every enclosure is checked
  against the engine's values at both ends of its interval; a failed check,
  or a change between an interval's ends larger than its rate bound allows,
  adds the flag `bound-exceeded`, and completeness is then not established for
  that result. A bound that fails only between an interval's ends, and not in
  its end-to-end change, goes unseen.

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

## After the review

The review reproduced the preregistered check exactly (1,000 windows, none
missed, none extra, 1,485,288 millisecond checks passed) and ran 300 windows
of its own, weighted to hard cases, with a checker written independently of
this directory's (`check.mjs`, sha256 `f2026d46…`, outside this repository).
Its findings, and what changed:

- **Placidus fell back outside the polar circle**, at isolated milliseconds
  within about 1e-8° of the limit (26 of the 2,201 from 1 s before to 1.2 s
  after 2000-03-20T00:00Z at 66.56186339751429°, 92.16879370494166°; a scan
  at 2e-6° steps of RAMC found the 64-step iteration failing up to 9.5e-9°
  below the limit).
  `94b9fa2` bisects each cusp where the fixed-point iteration does not settle;
  `placidus-limit.test.ts` checks the reproduction and 14,140 inputs from one
  unit in the last place to 1e-6° below the limit near the sensitive RAMCs
  (540 were null before), and every conformance verdict is unchanged.
  `6933b1d` also compares the house system and houses at every millisecond
  within 1e-8° of the Placidus or Koch limit near those RAMCs; the
  reproduction is a window test.
- **Five windows at slow node ingresses threw** after one to two minutes at
  the budget (ids 158, 159, 161, 162, 163). The node's flicker is now found
  before the budget is spent and left unresolved where the budget cannot
  cover it: those five return in under 0.3 s, flagged `node-unresolved`.
  `WindowBudgetError` replaces the RangeError for anything that still runs
  out; none of the 1,300 windows does.
- **The ΔT seam at 1941.0** could break the enclosures for intervals of a few
  milliseconds across it. The search now splits at every millisecond where a
  computation crosses it; unit tests compare every millisecond across the
  Moon's, the node's and the Sun's steps, and check that deltat.ts has no
  other discontinuity in the span.
- **Jitter figures.** The review found 4.36e-5° in 2191, 3.34 times short of
  the bound, not the 3.9 stated. `node-jitter.json` now scans every five
  days: 4.83e-5° in 2187, 2.97 times short.
- **Span and poles.** Windows outside 1800 to 2200 and latitudes within 1e-6°
  of a pole are refused.
- **Documentation.** When cells hold natalChart's features, when
  `bound-exceeded` is added, which features are not partitioned, run times
  around node ingresses, one whole-day timing, the README example's variable
  and the quoting in `gates.log`.

On the build of `e0833ee`, the review's checker, unchanged, with three
workers:

| | 1,000 preregistered, `670db8a6` | the same, `e0833ee` | review's 300, `670db8a6` | the same, `e0833ee` |
| --- | ---: | ---: | ---: | ---: |
| Searches that threw | 0 | 0 | 5 | 0 |
| Samples | 12,259,372 | 12,259,372 | 5,901,060 | 5,901,060 |
| Sampled transitions | 24,188 | 24,188 | 11,805 | 11,805 |
| Matched | 24,188 | 24,188 | 11,552 | 11,599 |
| Missed | 0 | 0 | 253 | 206 |
| Extra | 0 | 0 | 0 | 2 |
| Cell disagreements | 0 | 0 | 0 | 53,592 |
| Structural faults | 0 | 0 | 0 | 0 |
| Sub-second changes / confirmed | 8 / 8 | 8 / 8 | 80,924 / 80,924 | 80,926 / 80,924 |
| Switches / changes | 20,629 / 25,425 | 20,629 / 25,425 | 67,582 / 143,520 | 67,628 / 143,569 |
| Millisecond checks / failures | 1,485,288 / 0 | 1,485,288 / 0 | 4,865,904 / 0 | 4,869,216 / 4 |
| `bound-exceeded` / `polar-fallback` | 0 / 41 | 0 / 41 | 0 / 39 | 0 / 39 |
| The checker's verdict | PASS | PASS | FAIL: 5 threw | FAIL: 5 unresolved |

The `670db8a6` columns are the review's own runs. The 1,000 preregistered
windows give the same counts as before, window by window, and pass; their
searches took 59 s in all, the checker 88 minutes of wall time. In the
review's 300, 295 windows give the same counts as before, window by window,
including window 160 (1,950 s at the ingress of 2032-11-25, 18,315
switches, the most the budget has resolved here). Every difference is in the
five windows that threw: each now returns in 8 to 91 ms (0.04 to 0.26 s in
a second run) with one interval flagged `node-unresolved`, the whole window
in four of them and 2.6 hours of 2.9 in window 163. The checker, which
predates the `unresolved` field, reads the null nodes there as disagreements:
its 53,592 are exactly the samples inside those intervals times the two
components each leaves open (18,600, 11,572, 9,670, 9,194 and 4,556), and
its misses, extras and four millisecond failures are the sampled flicker and
the intervals' edges.

The review's second-round checker, kept here as `review-check2.mjs` and
credited to the review, is written for unresolved intervals. Inside each
interval only the components it lists are wildcards, and the partition must
be null for exactly those, exactly there. At each edge the resolved side is
verified at its millisecond: the switch at a takes each listed component from
its value to null, and natalChart at a − 1 has that value; the switch at b
takes it from null to the value natalChart has at b. Every millisecond within
1,000 ms of each edge, outside the interval, is compared for all 72
components; everything else is checked as by `check.mjs`. On the build of
`f9ae1de` it passes all 57 windows of `review-edge-windows.json`: the five
former budget windows; the review's 35 with an ascendant change, or a
Placidus cusp crossing the node, at a − 1, a, a + 1, b − 1, b and b + 1 of an
interval; and its 17 others, 8 of them with a Placidus or Koch fallback
switch inside an interval. 48 of the 57 have an unresolved interval. None of
their 278 edge checks, 87,000 compared edge milliseconds or 5,009,252
millisecond checks at switches fails, and no cell is null where it should
not be. As a check of the checker, the review's mutation that hides a node
sign change 300 ms before a fake interval opens fails it (234 mismatches at
the edge's milliseconds); the same window unmutated passes. A masked copy of
`check.mjs` recorded here before skipped every switch to or from null and
every switch inside or at the end of an interval, so it verified neither side
of an edge: it passed that mutation, and failed all 18 edge windows whose
nodes' houses are null. Its results are withdrawn (`review-recheck.json`).

## Run time

The search's time per window during the preregistered check (build of
`670db8a6`), in one of three worker threads on the shared machine:

| length | windows | search median | p90 | max | checker median |
| --- | ---: | ---: | ---: | ---: | ---: |
| ≤ 10 min | 311 | 1 ms | 5 ms | 85 ms | 0.2 s |
| 10 min – 2 h | 330 | 10 ms | 39 ms | 513 ms | 2.7 s |
| 2 h – 12 h | 264 | 74 ms | 188 ms | 634 ms | 23.5 s |
| 12 h – 24 h | 95 | 217 ms | 476 ms | 1732 ms | 81.1 s |

`timing.mjs` times the search alone, in one thread, on 39 windows of each
length (each system three times) at typical and at high latitudes, dates 1800
to 2200, on the build of `87bed02` (the search of `e0833ee`; that commit
changes comments and messages only), with the machine's load average near 5
(`timing.json`). At `670db8a6` the medians were 3, 1, 20, 17, 232 and 229 ms.

| length | latitudes | windows | median | p90 | max | median switches |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 10 minutes | −60° to 60° | 39 | 2 ms | 7 ms | 15 ms | 1 |
| 10 minutes | 60° to 90° | 39 | 1 ms | 10 ms | 26 ms | 0 |
| 2 hours | −60° to 60° | 39 | 22 ms | 30 ms | 54 ms | 13 |
| 2 hours | 60° to 90° | 39 | 17 ms | 34 ms | 68 ms | 7 |
| 24 hours | −60° to 60° | 39 | 228 ms | 317 ms | 382 ms | 163 |
| 24 hours | 60° to 90° | 39 | 229 ms | 390 ms | 556 ms | 108 |

A window around one of the true node's ingresses is slower, because the node
is compared at every millisecond of its flicker: three-hour windows around the
ingresses of March 2028 and September 2029 took 5.9 and 4.3 s (311 and 147
sign changes), around the slower one of July 2026 14.8 s (1,579), and the
review's 1,950 s at the ingress of 2032-11-25 77 s (18,315 switches), all on
the loaded machine. The rework did not slow these down: timed alternately on
the same machine, that window took 74.5 s on the build of `7614f7b` and 74.4 s
on `e0833ee`, and the review's windows 166, 175, 178 and 179 agreed within 0.8
s. Where the flicker is left unresolved, the window takes a fraction of a
second (`node-ingresses.json`: at most 0.14 s for two hours around each of the
24 slow ingresses). Near the pole, at 89.999999°, a 48-hour window took from
0.35 s (Vehlow) to 174 s (Alcabitius); Whole, Koch and Placidus about 14 s,
Regiomontanus 26 s and Topocentric 54 s.

## Package

`package-check.mjs` on the build of `f9ae1de`, against a build of the base
commit `8c4946b1` with the Placidus change (`src/houses.ts` of `f9ae1de`)
carried onto it, so that the comparison isolates the window entry point; and
against the base as it is for the root entry's size (`package-check.json`):

- All 15 JavaScript files of the baseline are byte-identical in the new
  build, and `window.js` is added. Against the base as it is, five of them
  differ (`index.js`, `internal.js`, `internal-math.js` and two shared
  chunks), by the Placidus change alone. The declaration files say the same
  once the rollup's shared-chunk names and one-letter aliases are resolved.
- The root entry point, bundled and minified: 38,635 bytes, 14,653 gzipped,
  with the window entry point and without it; 38,434 and 14,555 before the
  Placidus change.
- The window entry point alone: 28,652 bytes minified, 11,614 gzipped (with
  the engine code it shares, astronomy-engine excluded). Added to a bundle
  that already has the root entry point: 17,244 bytes minified, 6,770
  gzipped. Its own module: 17,973 and 7,790.
- `npm pack`: 89,868 bytes packed and 299,301 unpacked, 32 files; the
  package-contents gate requires under 300,000 unpacked, which leaves 699.
  `dist/window.js` is 35,079 bytes and `dist/window.d.ts` 7,035. The review's
  fixes first took the package to 307,066; the README's window section was
  condensed, its method moved to "The search" above, and comments that the
  build kept in `dist/window.js` moved where it drops them.

## Gates

Run on a clean tree at `f9ae1de` (`gates.log`; the commit that adds this
file changes only `docs/evidence/`): typecheck; unit tests, 2,676 in 30
files; build; export smoke; package contents; `npm pack --dry-run`;
`npm pack`; the clean packed consumer, which types and runs
`@zodiacs/engine/window`, `WindowBudgetError` and the `unresolved` field; the
conformance self-test both plain and under `node --test`; the 500
conformance vectors; this engine's conformance verdicts, all matching the
committed results; and the conformance report check. All 13 passed.

## Scope and limits

- **Sampled, not proven.** The check compares the search with natalChart at
  every whole second. That the search misses nothing between samples rests on
  its enclosures, and three of their inputs are empirical: the body rate
  bounds (about twice the largest rates scanned from 1800 to 2200) and the
  obliquity's rate bound (2.4 times), in `rate-bounds.json`, and the true
  node's jitter bound, at least 2.97 times every value found at 3,000
  consecutive milliseconds every five days from 1800 to 2200, in
  `node-jitter.json`. (The first scan of the jitter, two epochs a year, put
  that factor at 3.9; the review found 3.34 in 2191, and the dense scan 2.97
  in 2187.) Windows outside 1800 to 2200, where none was scanned, are refused.
  "Proven" needs the interval runtime.
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
  ingress, all reported where the budget allows: such a window takes from
  seconds to minutes. At 24 of the 294 ingresses from 1800 to 2200 the
  flicker is longer than the two-million-evaluation budget; a window that
  holds too much of it returns within a fraction of a second with it left
  unresolved and flagged `node-unresolved` (`node-ingresses.json`). A search
  that still runs out throws `WindowBudgetError`.
- **Places and time.** Latitudes within 1e-6° of a pole are refused (no
  ascendant is defined at a pole). ΔT is the engine's model; a pinned ΔT is
  not supported, and the search splits at the model's seam at 1941.0. Windows
  of up to 48 hours are accepted; this check covered 1 minute to 23.2 hours,
  and the unit tests two-day windows around two planetary stations.
- **natalChart as a lone call.** astronomy-engine reuses its nutation within
  86.4 ms, so natalChart calls closer together than that can differ from
  these values in the last digits.
- **Package.** 699 bytes remain under the unpacked-size gate.
