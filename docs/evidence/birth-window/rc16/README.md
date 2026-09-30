# Birth-time windows, rerun on 0.1.1-rc.16's build

The preregistered 1,000-window check and the scans behind the search's
bounds, run again with this directory's tools unchanged (`../run.mjs`,
`../checker.mjs`, `../compare.mjs`, `../node-ingresses.mjs`,
`../node-jitter.mjs`, `../rate-bounds.mjs`, `../review-check2.mjs`) on the
integrated 0.1.1-rc.16 candidate after the engine took the full IAU 2000B
nutation: the build of `704cadc`, whose window, chart and ephemeris code the
later commits of rc.16 do not change, with Node.js v22.22.2 on a four-core
machine shared with other jobs. `PREREGISTRATION.md`, `RESULTS.md` and the
branch's results in `..` are unchanged.

The branch measured the window on `670db8a6`, the entry on 0.1.1-rc.12's
engine. Under it since then:

- rc.14's and rc.15's changes to the engine, rc.15's time basis above all
  (`f36d69e` puts the window on it): from 1972 to 2027-10-02 an instant is
  UTC read through the leap seconds and IERS UT1 − UTC, each sample installs
  its own ΔT, and the search splits at every step of the basis, not only at
  the ΔT model's seam of 1941.0; and rc.15's Placidus bisection;
- the nutation (`704cadc`): the angles take the engine's own sidereal time
  and true obliquity, and every longitude of date moves by the change in Δψ,
  up to 0.2701″ from 1800 to 2200.

The windows' results below carry both; the plumbing check of
`docs/evidence/rc16-20260930/results/entries-plumbing.json` separates the
nutation's part (switch instants by up to 17 ms in its eight windows, and two
one-millisecond flickers of the true node's house at a cusp).

## The 1,000-window check

**PASS**, as preregistered, as on the branch:

| | Branch (`670db8a6`) | rc.16 |
| --- | ---: | ---: |
| Windows | 1,000, all passed | 1,000, all passed |
| Samples (natalChart calls at whole seconds) | 12,259,372 | 12,259,372 |
| Sampled transitions | 24,188 | 24,188 |
| Matched | 24,188 | 24,188 |
| Missed / extra | 0 / 0 | 0 / 0 |
| Cell disagreements | 0 | 0 |
| Searches that threw | 0 | 0 |
| Switches reported / changes in them | 20,629 / 25,425 | 20,660 / 25,475 |
| Sub-second excursions, all confirmed at their milliseconds | 8 | 4 |
| Millisecond checks / failures | 1,485,288 / 0 | 1,487,520 / 0 |
| Windows flagged `bound-exceeded` / `polar-fallback` / `node-unresolved` | 0 / 41 / 0 | 0 / 41 / 0 |

The run started at 07:45Z and took 135.2 minutes on the loaded machine
(load average 10 to 16); summed over the windows, the checker took 23,759 s
and the search 86.8 s (the branch's: 96.9 minutes, 16,959 s and 59 s).

`results.jsonl` and `summary.json` are the run (`node run.mjs --out rc16
--workers 3`, from `..`); `compare-runs.mjs` sets them beside the branch's
window by window (`compare-runs.json`). 913 of the 1,000 windows give the branch's counts exactly. 87
differ in their number of switches, by −8 to +10, and so in their cells and
millisecond checks; every one still passes, with every sampled transition
matched and every switch confirmed at its millisecond. None of the 87 lies in
the time basis's span, 1972 to 2027-10-02, which holds 135 of the windows.
`window-diff.mjs` runs the 87 on the build before the nutation (`5e0d00c`,
packed) and on this one and counts each component's changes
(`window-diff.json`): in 80, the two builds differ only in the true node's
houses, the flicker of its millisecond jitter where a cusp passes it
(`RESULTS.md`, *The true node*), which grows away from 2000; in 5, all
Alcabitius windows at or inside the polar circle (66.80° S to 85.01° N), other
bodies' houses differ too, where several change within milliseconds; the
other 2 give the same switches on both builds, so their difference from the
branch's run is the time basis's. Window 275 (2197, 75.73° S, Vehlow), whose
eight sub-second changes the branch's run confirmed, has four here, the
node's houses again.

## The review's edge windows

`../review-check2.mjs`, the review's second-round checker (`../RESULTS.md`,
*After the review*), unchanged, on the 57 windows of
`../review-edge-windows.json`, with two workers (`review-check2.jsonl`, one
line per window, and `review-check2.summary.json`):

| | The branch's build (`f9ae1de`) | rc.16 |
| --- | ---: | ---: |
| Windows passed | 57 of 57 | 57 of 57 |
| Windows with an unresolved interval | 48 | the same 48 |
| Edge checks / failures | 278 / 0 | 278 / 0 |
| Compared edge milliseconds / failures | 87,000 / 0 | 87,000 / 0 |
| Millisecond checks at switches / failures | 5,009,252 / 0 | 2,703,462 / 0 |
| Switches / changes | 69,605 / 139,278 | 37,578 / 75,497 |
| Sub-second changes / confirmed | 79,668 / 79,668 | 47,868 / 47,868 |
| Sampled transitions: matched, masked, missed, extra | 2,136, 5,752, 0, 0 | 2,007, 6,428, 0, 0 |
| Cells null where they should not be; structural faults | 0; 0 | 0; 0 |
| The checker's verdict | PASS | PASS |

The windows are mostly the node's ingresses, so their switches are mostly
the node's flicker, whose count follows the node's noise (*The true node's
ingresses and flicker*, below); every edge of every unresolved interval, and
every millisecond within a second of each, still checks out.

## The bounds

| Scan | Branch (`670db8a6`) | rc.16 | Tool, file |
| --- | --- | --- | --- |
| The obliquity's largest rate, every 6 h, 1800–2200 | 2.0728e-5° a day (astronomy-engine's five-term nutation); the bound, 5e-5, is 2.41 times it | 2.5989e-5° a day on the engine's IAU 2000B nutation; the bound is 1.92 times it, 1.83 times with the grid's allowance for what it can miss | `docs/evidence/rc16-20260930/tools/window-rates.mjs`, `window-rates.json` |
| The RAMC's rate, every 24 h | 360.9856048 to 360.9856902° a day (astronomy-engine's sidereal time) | 360.9855904 to 360.9857101° a day (the engine's) | the same |
| Each body's largest longitude rate, and the grid's allowance for what it can miss | each bound 1.9857 (the node) to 2.0608 (Venus) times it | 1.9856 (the node) to 2.0601 (Venus) times it; the Sun's and Venus's largest now fall at leap seconds (1973-01-01, 1978-01-01), where a central difference straddles a step of the time basis, at which the window splits its search | `../rate-bounds.mjs`, `rate-bounds.json` |

`../rate-bounds.mjs` reads the obliquity and the RAMC from astronomy-engine's
`e_tilt` and `SiderealTime`, which the engine used up to 0.1.1-rc.15; its
obliquity and RAMC rows in `rate-bounds.json` are astronomy-engine's, as on
the branch, and the window no longer uses them. `window-rates.mjs` scans the
engine's own true obliquity and sidereal time on the same grid, as
`src/window.ts` evaluates them on the chart's clock; a central difference
whose two samples straddle a step of the time basis (a leap second,
1972-01-01, the ΔT model's seam, the end of the IERS table), where the window
splits its search, is left out and listed (30 for the obliquity, 29 for the
RAMC). `src/window.ts` states the obliquity's margin from this file.

## The true node's ingresses and flicker

`node-ingresses.json` (`../node-ingresses.mjs`): the same 294 ingresses from
1800 to 2200, the same 24 over the budget, on the same dates; their instants
moved by up to 10 minutes (the ingress of 1981-09-20 at 23:32, near a
station, is now at 23:22), their bands by up to 4.2 per cent. The fastest,
median and slowest bands are 1.48 minutes, 4.53 minutes and 2.33 hours (the
branch's: 1.48, 4.53 and 2.32). Two hours around each of the 24 still return
with the stretch unresolved, in at most 0.18 s on the loaded machine (0.14 s
on the branch). The three stations within 0.001° of a boundary are the same,
0.000102°, 0.000259° and 0.000727° from it (0.000110°, 0.000282° and
0.000699°).

`node-flicker.mjs` (new here) counts the node's sign changes in the three
hours around three ingresses, on the build before the nutation (`5e0d00c`,
packed) and on this one (`node-flicker.json`):

| Ingress | Before the nutation | rc.16 | `RESULTS.md` |
| --- | ---: | ---: | ---: |
| July 2026 | 1,603 | 1,349 | 1,579 |
| March 2028 | 311 | 299 | 311 |
| September 2029 | 147 | 179 | 147 |

The branch's counts for 2028 and 2029, after the IERS table ends, are the
build before the nutation's to the switch; 2026, inside the IERS era, moved
with the time basis first. The flicker is numerical noise in the true node
(`RESULTS.md`, *The search*), so the nutation, which moves the node by up to
0.27″, draws another sample of it: the same size, other milliseconds. Each
search took 4.0 to 15.5 s on the loaded machine, where the build before the
nutation took 5.3 to 16.3 s.

## The node's jitter

`node-jitter.json` (`../node-jitter.mjs`, two workers): the node at 3,000
consecutive milliseconds at each of 29,220 epochs, every five days from 1800
to 2200. The largest departure from the smooth motion is now 4.394e-5°, at
1835-06-27T19:26:24Z, where the bound J is 3.01 times it; J is at least 3.01
times every value found. On the branch's build the largest was 4.832e-5° at
2187-05-02T05:15:38Z, 2.97 times short of J; at that epoch the value is now
below the decade's largest, 3.865e-5° (the decades table). The review's
epoch, 2191-02-03T16:15:59.033Z over 30,000 ms, gives 4.361e-5°, 3.337 times
short, as before. Of the 40 decades, 26 give the branch's largest value to
within 1e-9°; the other 14 differ, from 1970 to 2029 through the time basis
and elsewhere by other samples of the same noise: each millisecond's TT now
comes from a constant ΔT per sample, where the branch installed the ΔT model
(`docs/evidence/rc15-20260929/README.md`, *What the time basis changes*, on
the node's noise). `src/window.ts` and the README state the new factor.

## What no longer holds in `RESULTS.md`

- *Scope and limits*, the obliquity's rate bound "2.4 times": 1.92 times on
  the engine's nutation (above).
- *The search* and *Scope and limits*, the node's jitter, "4.8e-5° near the
  ends of the span, the largest in 2187" and "at least 2.97 times": 4.394e-5°
  in 1835 and 3.01 times (above).
- *Scope and limits*, "natalChart as a lone call": astronomy-engine reused
  its nutation within 86.4 ms, so natalChart calls closer together could
  differ in the last digits. The engine's nutation is computed for each
  instant, so they no longer can; `../checker.mjs` still spaces its calls, as
  preregistered, and it does no harm.
- *The search*, "The bounds assume ΔT is continuous ... one discontinuity
  inside `REFERENCE_SPAN`, at 1940-12-31T18:00:00.000Z": on rc.15's time
  basis the search splits at every step of the basis (the README's
  *Birth-time windows*, and `f36d69e`).
- *Package*: the sizes are the branch's; rc.16's are in
  `docs/evidence/rc16-20260930/`.
- The counts of the three ingress windows and the run times, as above.
