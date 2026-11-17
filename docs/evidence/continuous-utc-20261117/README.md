# The continuous-UTC rule, 2026-11-17

Linear ZOD-281. After the IERS UT1 table ends (2027-10-02T00:00Z), the engine
now reads a UTC instant on the continuous-UTC rule: TAI − UTC stays 37 s, so
TT = UTC + 69.184 s exactly, and UT1 = TT − ΔT from the model
(`zodiacs-deltat/1`). Up to 2.0.0-rc.2, and in 1.1.0, such an instant was read
as UT1 and TT = UT1 + ΔT(model). [docs/time.md](../../time.md) states the rule;
this directory holds what it rests on and what it changes.

## Sources

Each file was downloaded by the repository's fetch job and is recorded in
`fetched/MANIFEST.tsv` on branch `fetched/engine-sources-1-44102962737-1`.

| File here | What | URL | SHA-256 | Retrieved (UTC) | HTTP |
| --- | --- | --- | --- | --- | --- |
| `sources/bulletinc.dat` | IERS Bulletin C 72, 6 July 2026: no leap second at the end of December 2026; UTC − TAI = −37 s from 2017-01-01 "until further notice" | https://hpiers.obspm.fr/iers/bul/bulc/bulletinc.dat | `310e172eadacacca3adf92cb9bd646fcc0d6320e35e996a106d2644ede3b52f0` | 2026-11-17T14:47:04Z | 200 |
| `sources/Leap_Second.dat` | the IERS leap-second list through Bulletin C 72, expiring 28 June 2027; its last change is 1 January 2017, 37 s | https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat | `6cb6f5d4b819f2e568e25db4b0b26d89dedf031fdffb18bc94d40f4e94e268d7` | 2026-11-17T14:47:08Z | 200 |
| `sources/horizons-moon-301.txt` | JPL Horizons, the Moon (301) from the geocentre (500@399): TDB − UT and apparent ecliptic longitude and latitude of date, degrees, at JD 2461938.0, 2462668.0, 2469973.0, 2488235.0 and 2524398.0 UT | https://ssd.jpl.nasa.gov/api/horizons.api?COMMAND=%27301%27&format=text&EPHEM_TYPE=OBSERVER&CENTER=%27500@399%27&QUANTITIES=%2730,31%27&ANG_FORMAT=DEG&EXTRA_PREC=YES&TIME_TYPE=UT&TLIST_TYPE=JD&TLIST=%272461938.0%202462668.0%202469973.0%202488235.0%202524398.0%27&OBJ_DATA=NO&MAKE_EPHEM=YES | `6447167fae329ee655ca2e130121a83970c9b27e42a4d82affc554ce85daa881` | 2026-11-17T14:47:31Z | 200 |
| `sources/horizons-sun-10.txt` | the same for the Sun (10) | the same with `COMMAND=%2710%27` | `818328255926ef492a2b0bcbc023727c3709439a31ca45f1d81147fcc8cb104f` | 2026-11-17T14:47:34Z | 200 |
| `sources/tzdb-NEWS-2026f-excerpt.txt` | lines 3 to 7, 20 to 28 and 47 to 49 of tzdb's NEWS, release 2026f (2026-10-27): "No more leap seconds, and leap second tables no longer expire" | https://data.iana.org/time-zones/tzdb/NEWS | whole file `1b22446d6ac1690fec6fde2ad8283b40ca20ea2ed9607da386a1ecfeb3c13a1d` (264,231 bytes); the excerpt `5decb02ba7ab64c99775fc98d9a486ff3ef8ec5094afe2926c2f06fa524888c7` | 2026-11-17T14:46:45Z | 200 |

Horizons notes that its TDB − UT is TDB − UTC from 1962 on, and that its last
prediction is carried as a constant; it prints 69.184513 s to 69.184557 s at
the five instants, TDB − TT being under 2 ms. tzdb's NEWS is a secondary
source. The decision behind it, the 2026 General Conference on Weights and
Measures' resolution on UTC, was not fetched (outside hosts other than these
are blocked here), and nothing in this directory or in docs/time.md cites it.
The pages needed to cite it are on https://www.bipm.org/ under the CGPM 2026
meeting's resolutions; their exact addresses are not known here.

ERFA's `eraDat` (pyerfa 2.0.1.5, ERFA 2.0.1, from PyPI, wheel sha256
`0e43c7194e3242083f2350b46c09fd4bf8ba1bcc0ebd1460b98fc47fe2389906`) gives
TAI − UTC 37 s, so TT − UTC 69.184 s, at 2027-10-02 and the five Horizons
dates (`erfa-dat.py`, `results/erfa-dat.txt`). For years more than five past
its own table it warns "dubious year" and carries its last value, as this
engine does: it is an outside implementation of the same carry, not a
further authority.

## Before and after

`horizons-comparison.mjs` on the carried 1.1.0 and 2.0.0-rc.2 archives and on
this tree (`results/horizons-*.json`), on the DE440 pack, UTC input at
0° N 0° E. Longitudes are compared raw: Horizons prints the IAU 1976/80
ecliptic of date and the engine the IAU 2006/2000A one. How much of the
residual after the change is that frame difference is not separated here.

| UTC | TT − UTC before | after | Moon − Horizons before | after | Sun − Horizons before | after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2028-06-15T12:00Z | 69.418 s | 69.184 s | 0.157″ | 0.040″ | 0.054″ | 0.044″ |
| 2030-06-15T12:00Z | 69.654 s | 69.184 s | 0.331″ | 0.035″ | 0.056″ | 0.037″ |
| 2050-06-15T12:00Z | 71.491 s | 69.184 s | 1.278″ | −0.030″ | 0.065″ | −0.026″ |
| 2100-06-15T12:00Z | 79.033 s | 69.184 s | 5.534″ | −0.186″ | 0.212″ | −0.180″ |
| 2199-06-19T12:00Z | 125.844 s | 69.184 s | 28.259″ | −0.510″ | 1.757″ | −0.498″ |

1.1.0 and 2.0.0-rc.2 give the same values. `reference-time-basis.mjs` writes
the SHA-256 of each group of time-basis records that
`src/time-scale-continuous.test.ts` compares with this build
(`scripts/continuous-utc-instants.mjs`: 2,000 UTC instants from 1972 to the
table's end, 8 at or just before its end, 403 TT and UT1 instants after it,
9 pinned ones); the two archives give the same digests
(`results/time-basis-1.1.0.json`, `results/time-basis-2.0.0-rc.2.json`), and
this build gives the same four digests: whole records for the UTC and pinned
groups, and UT1 and TT alone for the TT and UT1 group, whose recorded UTC and
time scale do change. Only unpinned UTC instants after the table change their
UT1 and TT.

Other changes a user of 1.1.0 or 2.0.0-rc.2 sees, all after 2027-10-02 and
measured on this tree:

- UT1 − UTC at the table's end moves from −0.148 s to −0.146 s across the
  hand-over (up to 2.0.0-rc.2, from −0.148 s to 0 ± 0.9 s). After it the
  model's UT1 − UTC is −2.307 s at 2050-06-15, passes −3,600 s in 2957, and
  its band reaches 1,200 s by 3998.
- `natalChart()` refuses a UTC instant whose TT leaves `EPHEMERIS_SPAN`; the
  last one accepted moves from 3998-09-03T02:01:41.309Z to
  3998-09-03T05:58:50.816Z. `calc()`'s last UTC instant computed moves from
  2199-12-31T23:57:53.752Z to 2199-12-31T23:58:50.815Z. Both are bisected to
  the millisecond by `span-ends.mjs` (`results/span-ends-1.1.0.json`,
  `span-ends-2.0.0-rc.2.json`, `span-ends-this-tree.json`, whose `engine`
  field is this tree's package version); origin/main (`373ceda`) gives the
  same as 2.0.0-rc.2.
- On UTC input UT1 − UTC is now 69.184 s − ΔT, so 32.184 s + TAI − UTC −
  (UT1 − UTC) = ΔT holds within 1e-12 s on UTC, UT1 and TT over the whole
  span (worst measured about 6e-14 s). Taken as the difference of the two
  rounded millisecond instants, as first written here, it was off by up to
  3.9e-6 s from 2528 on. `src/time-scale-continuous.test.ts` checks it at
  3,000 instants up to the span's last ones.
- ΔT's segment is keyed on UT1. On UTC input from 2027-10-02T00:00:00.001Z
  to .146Z UT1 is still on or before the table's end, so the segment is
  `"predicted"` and the chart is not flagged; from .147Z it is
  `"extrapolated"` and flagged `"delta-t-extrapolated"`. docs/time.md says
  so; `src/time-scale-continuous.test.ts` pins both sides.
- `calc()` on UTC input: the band of TT is 0 and that of UT1 the ΔT band, so
  a geocentric position's bound no longer widens (the Moon at
  2199-06-15T12:00Z: its measured 12″, where 2.0.0-rc.2 added 50″ to 65″),
  and a topocentric one widens by its observer's turn times σ alone. Results
  are still flagged `"delta-t-extrapolated"`. `events()` keeps its flag and
  its timing bound no longer widens.
- Natal receipts: two conventions sets and the required feature
  `"time-basis-continuous-utc"`. 1.1.0 and 2.0.0-rc.2 refuse a record of this
  tree's as `unsupported_feature` (`parse-on-engine.mjs`,
  `results/new-receipt-on-earlier-engines.json`, on
  `results/continuous-utc-record.json` that `make-receipt.mjs` wrote on this
  tree). Their own records after the table still verify here and replay as
  the UT1 instant their engine read, to the same positions, angles and cusps
  (`src/fixtures/receipt-1.1.0-after-table.json`, sha256
  `5ca2dde3a14e5de5f797c62df5ae0d861e1c0afaa749f675c08432930cd2c32d`, and
  `receipt-2.0.0-rc.2-after-table.json`,
  `a7d26844903fa3177740746b5837cc2dc66570335eed983634d2832949543871`, written
  by `make-receipt.mjs` on the archives). Records of 0.1.1-rc.8 to rc.14
  and older (no time scale in the result) replay the same way after the
  table, so the rule does not move them (their TT would be 0.47 s earlier at
  2030 on UTC): `src/fixtures/receipt-0.1.1-rc.14-after-table.json`, sha256
  `1667adc5dcb8640bc6e5b7f8418ab1cfdc9baff6b444bd14eca2367e2b0f59f0`,
  written by `make-receipt.mjs` on the carried 0.1.1-rc.14 archive.
- Speeds within six hours of the table's end. A speed is the change over
  samples 0.002 day apart (the true node's 0.5 day), so where one sample lies
  on the other side of 2027-10-02T00:00Z it is read on the other rule. This
  moves speeds only, inside the table as well as after it.
  `speeds-near-table-end.mjs` compares every minute over the twelve hours and
  every 100 ms within 100 s of the end, at 48.2° N 16.37° E, with the
  archives (`results/near-table-end-*.json`): on the DE440 pack the Moon's
  speed moves by up to 3.5e-7 °/day and the true node's by 8.0e-9; on
  astronomy-engine the Moon's by 3.6e-7 and the true node's by 3.8e-6
  (1.6e-6 inside the table); every other body's by under 7e-8. Longitudes,
  latitudes, angles and cusps are the same to the bit, and outside the six
  hours so is every speed. `src/time-scale-near-end.test.ts` holds 18 of
  those instants, the largest changes among them, to 4e-7 °/day (the nodes
  4e-6), from `src/fixtures/near-table-end-2.0.0-rc.2.json`
  (`make-near-end-reference.mjs` on the 2.0.0-rc.2 archive).
- Types: `TimeScale.basis` gains `"continuous-utc"` and `Ut1MinusUtc.source`
  gains `"model"`, in every entry that exports them (api/).
- Solar returns over 300 years from 24 births stay within 266 minutes of the
  mean tropical year (268 before), `docs/timing-hellenistic.md`.

Inside the table (but for those speeds), before 1972 and with a pinned ΔT
nothing changes, and the
conformance suite's verdicts do not change (459 pass, 41 unsupported): its
time vectors end in 2026, and its later instants are given on TT.

## Fixtures generated again

- `src/fixtures/calc-roundtrip.json` (`scripts/build-calc-roundtrip.mjs`):
  cases 3, 8, 10, 13, 26 and 31, UTC instants from 2031 to 2188, move; case 7,
  a TT instant in 2049, keeps its numbers and only its recorded UTC and time
  scale change. No other case changes.
- `src/techniques/fixtures/site-parity/returns.json`, `void-of-course.json`
  and `moon-sign.json`: the site's code at `67cccac5` (a `git archive` copy
  of the site repository) run on this tree's packed build by
  `../techniques-2026-09-29/site-parity.mjs`, with `site-parity-default.mjs`
  preloaded so that it runs on astronomy-engine, as the test does. Run the
  same way on origin/main (`373ceda`) it gives all six committed files' bodies
  byte for byte. `site-parity-changes.mjs` (`results/site-parity-changes.json`)
  finds every changed case touching an instant after the table's end, the
  largest shift 57.0 s; returns from births after it move by up to 26.8 s
  before it. The other three files give the same bodies and are left as they
  are.

## Checks

- `results/mutations.txt`: changing 32.184 s, dropping TAI − UTC, or starting
  the rule at the table's last instant each fails 11 to 14 of the 144 tests in
  the five time-basis files; taking UT1 − UTC from the rounded milliseconds
  fails 2, and dropping the basis comparison from the window's `onePiece`
  fails 1 (`src/window-table-end.test.ts`).
- Package sizes (`npm run package:contents`, measured, budgets not raised):
  the root graph 153,473 bytes of 151,700; `./calc` 205,199 of 204,100;
  `./internal` 112,272 of 110,900; `./receipt` 80,771 of 77,400; `./sky`
  139,726 of 138,600; `./time` 44,485 of 42,600; `./timing` 172,776 of
  171,200; `./vedic` 188,508 of 187,100; `./window` 152,596 of 151,500; the
  package without the DE440 pack 1,290,106 bytes of 1,289,000.

## Reproducing

```sh
# the carried archives, each extracted into its own new directory outside the
# checkout, with astronomy-engine installed beside them
node reference-time-basis.mjs "$DIR/1.1.0/package" > results/time-basis-1.1.0.json
node make-receipt.mjs "$DIR/1.1.0/package" > ../../../src/fixtures/receipt-1.1.0-after-table.json
node horizons-comparison.mjs "$DIR/1.1.0/package" > results/horizons-1.1.0.json
node parse-on-engine.mjs "$DIR/1.1.0/package" results/continuous-utc-record.json
# this tree, after npm run build, from the repository root
node docs/evidence/continuous-utc-20261117/make-receipt.mjs . > docs/evidence/continuous-utc-20261117/results/continuous-utc-record.json
node docs/evidence/continuous-utc-20261117/horizons-comparison.mjs . > docs/evidence/continuous-utc-20261117/results/horizons-this-tree.json
node docs/evidence/continuous-utc-20261117/span-ends.mjs . > docs/evidence/continuous-utc-20261117/results/span-ends-this-tree.json
# the archives again, for the span ends and the speeds near the table's end
node span-ends.mjs "$DIR/1.1.0/package" > results/span-ends-1.1.0.json
node speeds-near-table-end.mjs "$DIR/1.1.0/package" ../../.. > results/near-table-end-1.1.0.json
node speeds-near-table-end.mjs "$DIR/1.1.0/package" ../../.. astronomy-engine > results/near-table-end-1.1.0-astronomy-engine.json
node make-near-end-reference.mjs "$DIR/2.0.0-rc.2/package" > ../../../src/fixtures/near-table-end-2.0.0-rc.2.json
node make-receipt.mjs "$DIR/0.1.1-rc.14/package" > ../../../src/fixtures/receipt-0.1.1-rc.14-after-table.json
python3 -I erfa-dat.py > results/erfa-dat.txt
```
