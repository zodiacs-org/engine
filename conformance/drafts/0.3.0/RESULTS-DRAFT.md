# Draft level L4: results

A draft, not a released suite level: the released harness does not run it,
and releasing it is the owner's decision. Written by `report-draft.mjs` from
`L4-events.json` and the results files beside it; do not edit by hand.

Vectors: 140 in `L4-events.json` (SHA-256 `15328db5bbd81d1de54d9396441024c889aec9e6a94c6e2dac317efe19e86931`), 1 dropped.

## @zodiacs/engine 2.0.0-rc.3, default source (the shipped DE440 pack)

`zodiacs-engine.json`.

| set | kind | vectors | pass | fail | unsupported | error | largest residual (s) | largest residual / tolerance |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TT | event.ingress | 60 | 60 | 0 | 0 | 0 | 1.534 | 0.008 |
| TT | event.station | 30 | 0 | 0 | 30 | 0 |  |  |
| TT | event.lunation | 30 | 0 | 0 | 30 | 0 |  |  |
| UTC | event.ingress | 10 | 10 | 0 | 0 | 0 | 0.025 | 0.012 |
| UTC | event.lunation | 10 | 0 | 0 | 10 | 0 |  |  |

Total: 70 pass, 0 fail, 70 unsupported, 0 error.

No vector fails.

Unsupported, as the adapter reports it:

- event.station: the engine has no station search in its public API: positions() and natalChart() give a body's speed and retrograde flag at an instant, and events() searches longitude crossings only
- event.lunation: the engine has no lunation search in its public API: moonPhase() gives the phase at an instant, and events() searches one body's longitude crossings only

## @zodiacs/engine on astronomy-engine 2.0.0-rc.3, astronomy-engine, the fallback

`zodiacs-engine-astronomy-engine.json`.

| set | kind | vectors | pass | fail | unsupported | error | largest residual (s) | largest residual / tolerance |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TT | event.ingress | 60 | 25 | 35 | 0 | 0 | 33981.407 | 15.972 |
| TT | event.station | 30 | 0 | 0 | 30 | 0 |  |  |
| TT | event.lunation | 30 | 0 | 0 | 30 | 0 |  |  |
| UTC | event.ingress | 10 | 9 | 1 | 0 | 0 | 29.868 | 1.244 |
| UTC | event.lunation | 10 | 0 | 0 | 10 | 0 |  |  |

Total: 34 pass, 36 fail, 70 unsupported, 0 error.

Failing vectors (residual is the engine minus the expected instant):

| id | event | expected | residual (s) | tolerance (s) | engine flags |
| --- | --- | --- | ---: | ---: | --- |
| L4-ING-0007 | Moon at 30 deg | 1860-01-03 00:51:04 TT | -6.841 | 2 |  |
| L4-ING-0008 | Moon at 0 deg | 1925-01-01 02:57:22 TT | -2.414 | 2 |  |
| L4-ING-0011 | Moon at 270 deg | 2060-01-02 17:39:24 TT | -3.444 | 2 | delta-t-extrapolated |
| L4-ING-0014 | Mercury at 270 deg | 1925-01-14 07:15:50 TT | -59.617 | 31 |  |
| L4-ING-0015 | Mercury at 300 deg | 1990-02-12 01:12:08 TT | -36.159 | 18 |  |
| L4-ING-0016 | Mercury at 270 deg | 2026-01-01 21:11:51 TT | 32.733 | 16 |  |
| L4-ING-0020 | Venus at 270 deg | 1925-01-14 22:28:42 TT | -21.413 | 20 |  |
| L4-ING-0021 | Venus at 300 deg | 1990-01-16 15:23:52 TT | 222.372 | 40 |  |
| L4-ING-0022 | Venus at 300 deg | 2026-01-17 12:44:33 TT | -32.756 | 20 |  |
| L4-ING-0023 | Venus at 330 deg | 2060-01-11 11:39:31 TT | -26.092 | 20 | delta-t-extrapolated |
| L4-ING-0025 | Mars at 240 deg | 1860-01-31 08:45:48 TT | 52.211 | 40 |  |
| L4-ING-0026 | Mars at 30 deg | 1925-02-05 10:17:38 TT | -126.814 | 38 |  |
| L4-ING-0030 | Mars at 210 deg | 2140-07-28 15:39:22 TT | -65.545 | 45 | delta-t-extrapolated |
| L4-ING-0032 | Jupiter at 300 deg | 1926-01-06 01:00:50 TT | 264.842 | 104 |  |
| L4-ING-0034 | Jupiter at 120 deg | 2026-06-30 05:53:30 TT | 242.183 | 113 |  |
| L4-ING-0035 | Jupiter at 60 deg | 2060-04-04 01:54:13 TT | 124.379 | 122 | delta-t-extrapolated |
| L4-ING-0036 | Jupiter at 330 deg | 2140-03-09 05:02:09 TT | -382.062 | 103 | delta-t-extrapolated |
| L4-ING-0038 | Saturn at 240 deg | 1926-12-02 22:34:18 TT | -970.785 | 204 |  |
| L4-ING-0040 | Saturn at 0 deg | 2026-02-14 00:12:48 TT | 1686.090 | 219 |  |
| L4-ING-0041 | Saturn at 60 deg | 2060-03-31 11:51:35 TT | -365.441 | 240 | delta-t-extrapolated |
| L4-ING-0042 | Saturn at 330 deg | 2141-02-04 04:17:03 TT | -472.771 | 203 | delta-t-extrapolated |
| L4-ING-0045 | Uranus at 300 deg | 1995-04-01 12:12:17 TT | 6690.774 | 869 |  |
| L4-ING-0046 | Uranus at 60 deg | 2026-04-26 00:52:41 TT | 552.162 | 442 |  |
| L4-ING-0048 | Uranus at 210 deg | 2142-01-19 12:01:22 TT | -10198.444 | 1747 | delta-t-extrapolated |
| L4-ING-0049 | Neptune at 0 deg | 1861-04-13 20:24:40 TT | -6352.590 | 680 |  |
| L4-ING-0050 | Neptune at 150 deg | 1928-09-21 12:01:20 TT | -7781.408 | 717 |  |
| L4-ING-0051 | Neptune at 300 deg | 1998-01-29 02:53:08 TT | -4940.942 | 638 |  |
| L4-ING-0052 | Neptune at 0 deg | 2026-01-26 17:35:47 TT | -10977.353 | 945 |  |
| L4-ING-0053 | Neptune at 90 deg | 2065-07-03 07:11:20 TT | -1571.350 | 655 | delta-t-extrapolated |
| L4-ING-0054 | Neptune at 270 deg | 2148-01-04 12:22:45 TT | 10365.922 | 649 | delta-t-extrapolated |
| L4-ING-0055 | Pluto at 60 deg | 1882-07-21 21:51:21 TT | -8931.380 | 1851 |  |
| L4-ING-0056 | Pluto at 120 deg | 1937-10-07 12:14:40 TT | -2510.552 | 2322 |  |
| L4-ING-0057 | Pluto at 240 deg | 1995-01-17 09:16:54 TT | -1385.432 | 940 |  |
| L4-ING-0058 | Pluto at 330 deg | 2043-03-09 01:02:40 TT | 3338.259 | 876 | delta-t-extrapolated |
| L4-ING-0059 | Pluto at 0 deg | 2066-06-17 15:25:29 TT | 33981.407 | 5250 | delta-t-extrapolated |
| L4-UTC-0005 | Sun at 300 deg | 2035-01-20 06:14:16 UTC | 29.868 | 24 | delta-t-extrapolated |

Unsupported, as the adapter reports it:

- event.station: the engine has no station search in its public API: positions() and natalChart() give a body's speed and retrograde flag at an instant, and events() searches longitude crossings only
- event.lunation: the engine has no lunation search in its public API: moonPhase() gives the phase at an instant, and events() searches one body's longitude crossings only

## Dropped vectors

- L4-ING-0060, the first ingress of Pluto after 2140-01-01 TT: coverage: no event between 2140-01-01T00:00:00.000 TT and 2150-01-20T00:00:00.000 TT, the end of the search inside the kernel (which ends 2150-01-22).

## The arbiter's own checks

Tolerances by kind: event.ingress: 2 s to 5250 s; event.lunation: 2 s to 3 s; event.station: 6270 s to 50406 s. Check (a): every solve repeated with half hour brackets agrees within 0.000 s, at most 0.0000 of its tolerance (limit 0.1). The array reduction agrees with validate.py's apparent() at every solved instant within 0.004172 mas. Property: at t - tolerance and t + tolerance every ingress lies on opposite sides of its target, at most 1.498 arcsec from it (limit 1.5). Vector L4-ING-0061 solves -0.0002 s from the independent de440.bsp reduction in docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json (limit 1 s). Check (b), against the JPL Horizons API (version 1.2, ephemeris DE441, EOP file eop.261116.p270212), observer quantity 31 for the geocentre in TT, retrieved 2026-11-17 as recorded in sources/l4/horizons-provenance.tsv: 140 of 140 events checked, 0 failed and were dropped, 0 pending. For the 110 ingresses and lunations, Horizons' longitude at the solved instant differs from the target by a median of 0.047 arcsec; the worst is L4-ING-0049 (the first ingress of Neptune after 1860-01-01 TT) at -0.359 arcsec (limit 0.45). The difference grows with distance from J2000 (1860 to 1899: -0.359 to +0.011; 1900 to 1959: -0.158 to +0.002; 1960 to 2029: -0.057 to +0.003; 2030 to 2149: -0.012 to +0.343 arcsec), as the IAU 1976/1980 frame Horizons gives for quantity 31 parts from the IAU 2006/2000A frame of the arbiter. For the 30 stations, the station implied by Horizons' longitudes an hour either side of the solved instant lies at most 62 s from it; the largest share of a tolerance is L4-STA-0030 (the first station of Saturn after 2140-07-01 TT), +62 s against 49110 s (0.0013). Every event's own figure is in sources/l4/solutions.json under "horizons".
