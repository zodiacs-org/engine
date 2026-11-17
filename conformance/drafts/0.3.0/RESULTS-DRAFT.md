# Draft level L4: results

A draft, not a released suite level: the released harness does not run it,
and releasing it is the owner's decision. Written by `report-draft.mjs` from
`L4-events.json` and the results files beside it; do not edit by hand.

Vectors: 140 in `L4-events.json` (SHA-256 `74e63ec229bdb6e9a3847f72ead1b7393e9efe30c0c294ce141aa4b45bb372f0`), 1 dropped.

## @zodiacs/engine 2.0.0-rc.2, default source (the shipped DE440 pack)

`zodiacs-engine.json`.

| set | kind | vectors | pass | fail | unsupported | error | largest residual (s) | largest residual / tolerance |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TT | event.ingress | 60 | 60 | 0 | 0 | 0 | 1.534 | 0.008 |
| TT | event.station | 30 | 0 | 0 | 30 | 0 |  |  |
| TT | event.lunation | 30 | 0 | 0 | 30 | 0 |  |  |
| UTC | event.ingress | 10 | 7 | 3 | 0 | 0 | 22.537 | 11.246 |
| UTC | event.lunation | 10 | 0 | 0 | 10 | 0 |  |  |

Total: 67 pass, 3 fail, 70 unsupported, 0 error.

Failing vectors (residual is the engine minus the expected instant):

| id | event | expected | residual (s) | tolerance (s) | engine flags |
| --- | --- | --- | ---: | ---: | --- |
| L4-UTC-0010 | Moon at 30 deg | 2050-01-01 20:21:06 UTC | -2.242 | 2 | delta-t-extrapolated |
| L4-UTC-0014 | Moon at 180 deg | 2100-01-02 14:35:49 UTC | -9.733 | 2 | delta-t-extrapolated |
| L4-UTC-0018 | Moon at 60 deg | 2140-01-01 07:24:06 UTC | -22.492 | 2 | delta-t-extrapolated |

Unsupported, as the adapter reports it:

- event.station: the engine has no station search in its public API: positions() and natalChart() give a body's speed and retrograde flag at an instant, and events() searches longitude crossings only
- event.lunation: the engine has no lunation search in its public API: moonPhase() gives the phase at an instant, and events() searches one body's longitude crossings only

## @zodiacs/engine on astronomy-engine 2.0.0-rc.2, astronomy-engine, the fallback

`zodiacs-engine-astronomy-engine.json`.

| set | kind | vectors | pass | fail | unsupported | error | largest residual (s) | largest residual / tolerance |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TT | event.ingress | 60 | 25 | 35 | 0 | 0 | 33981.410 | 15.972 |
| TT | event.station | 30 | 0 | 0 | 30 | 0 |  |  |
| TT | event.lunation | 30 | 0 | 0 | 30 | 0 |  |  |
| UTC | event.ingress | 10 | 6 | 4 | 0 | 0 | 28.915 | 11.001 |
| UTC | event.lunation | 10 | 0 | 0 | 10 | 0 |  |  |

Total: 31 pass, 39 fail, 70 unsupported, 0 error.

Failing vectors (residual is the engine minus the expected instant):

| id | event | expected | residual (s) | tolerance (s) | engine flags |
| --- | --- | --- | ---: | ---: | --- |
| L4-ING-0007 | Moon at 30 deg | 1860-01-03 00:51:04 TT | -6.841 | 2 |  |
| L4-ING-0008 | Moon at 0 deg | 1925-01-01 02:57:22 TT | -2.414 | 2 |  |
| L4-ING-0011 | Moon at 270 deg | 2060-01-02 17:39:24 TT | -3.443 | 2 | delta-t-extrapolated |
| L4-ING-0014 | Mercury at 270 deg | 1925-01-14 07:15:50 TT | -59.617 | 31 |  |
| L4-ING-0015 | Mercury at 300 deg | 1990-02-12 01:12:08 TT | -36.159 | 18 |  |
| L4-ING-0016 | Mercury at 270 deg | 2026-01-01 21:11:51 TT | 32.733 | 16 |  |
| L4-ING-0020 | Venus at 270 deg | 1925-01-14 22:28:42 TT | -21.413 | 20 |  |
| L4-ING-0021 | Venus at 300 deg | 1990-01-16 15:23:52 TT | 222.372 | 40 |  |
| L4-ING-0022 | Venus at 300 deg | 2026-01-17 12:44:33 TT | -32.756 | 20 |  |
| L4-ING-0023 | Venus at 330 deg | 2060-01-11 11:39:31 TT | -26.088 | 20 | delta-t-extrapolated |
| L4-ING-0025 | Mars at 240 deg | 1860-01-31 08:45:48 TT | 52.211 | 40 |  |
| L4-ING-0026 | Mars at 30 deg | 1925-02-05 10:17:38 TT | -126.814 | 38 |  |
| L4-ING-0030 | Mars at 210 deg | 2140-07-28 15:39:22 TT | -65.540 | 45 | delta-t-extrapolated |
| L4-ING-0032 | Jupiter at 300 deg | 1926-01-06 01:00:50 TT | 264.842 | 104 |  |
| L4-ING-0034 | Jupiter at 120 deg | 2026-06-30 05:53:30 TT | 242.183 | 113 |  |
| L4-ING-0035 | Jupiter at 60 deg | 2060-04-04 01:54:13 TT | 124.380 | 122 | delta-t-extrapolated |
| L4-ING-0036 | Jupiter at 330 deg | 2140-03-09 05:02:09 TT | -382.062 | 103 | delta-t-extrapolated |
| L4-ING-0038 | Saturn at 240 deg | 1926-12-02 22:34:18 TT | -970.785 | 204 |  |
| L4-ING-0040 | Saturn at 0 deg | 2026-02-14 00:12:48 TT | 1686.090 | 219 |  |
| L4-ING-0041 | Saturn at 60 deg | 2060-03-31 11:51:35 TT | -365.440 | 240 | delta-t-extrapolated |
| L4-ING-0042 | Saturn at 330 deg | 2141-02-04 04:17:03 TT | -472.780 | 203 | delta-t-extrapolated |
| L4-ING-0045 | Uranus at 300 deg | 1995-04-01 12:12:17 TT | 6690.774 | 869 |  |
| L4-ING-0046 | Uranus at 60 deg | 2026-04-26 00:52:41 TT | 552.162 | 442 |  |
| L4-ING-0048 | Uranus at 210 deg | 2142-01-19 12:01:22 TT | -10198.439 | 1747 | delta-t-extrapolated |
| L4-ING-0049 | Neptune at 0 deg | 1861-04-13 20:24:40 TT | -6352.590 | 680 |  |
| L4-ING-0050 | Neptune at 150 deg | 1928-09-21 12:01:20 TT | -7781.408 | 717 |  |
| L4-ING-0051 | Neptune at 300 deg | 1998-01-29 02:53:08 TT | -4940.942 | 638 |  |
| L4-ING-0052 | Neptune at 0 deg | 2026-01-26 17:35:47 TT | -10977.353 | 945 |  |
| L4-ING-0053 | Neptune at 90 deg | 2065-07-03 07:11:20 TT | -1571.358 | 655 | delta-t-extrapolated |
| L4-ING-0054 | Neptune at 270 deg | 2148-01-04 12:22:45 TT | 10365.931 | 649 | delta-t-extrapolated |
| L4-ING-0055 | Pluto at 60 deg | 1882-07-21 21:51:21 TT | -8931.380 | 1851 |  |
| L4-ING-0056 | Pluto at 120 deg | 1937-10-07 12:14:40 TT | -2510.552 | 2322 |  |
| L4-ING-0057 | Pluto at 240 deg | 1995-01-17 09:16:54 TT | -1385.432 | 940 |  |
| L4-ING-0058 | Pluto at 330 deg | 2043-03-09 01:02:40 TT | 3338.263 | 876 | delta-t-extrapolated |
| L4-ING-0059 | Pluto at 0 deg | 2066-06-17 15:25:29 TT | 33981.410 | 5250 | delta-t-extrapolated |
| L4-UTC-0005 | Sun at 300 deg | 2035-01-20 06:14:16 UTC | 28.915 | 24 | delta-t-extrapolated |
| L4-UTC-0014 | Moon at 180 deg | 2100-01-02 14:35:49 UTC | -9.965 | 2 | delta-t-extrapolated |
| L4-UTC-0017 | Sun at 300 deg | 2140-01-20 17:49:55 UTC | -27.429 | 24 | delta-t-extrapolated |
| L4-UTC-0018 | Moon at 60 deg | 2140-01-01 07:24:06 UTC | -22.003 | 2 | delta-t-extrapolated |

Unsupported, as the adapter reports it:

- event.station: the engine has no station search in its public API: positions() and natalChart() give a body's speed and retrograde flag at an instant, and events() searches longitude crossings only
- event.lunation: the engine has no lunation search in its public API: moonPhase() gives the phase at an instant, and events() searches one body's longitude crossings only

## Dropped vectors

- L4-ING-0060, the first ingress of Pluto after 2140-01-01 TT: coverage: no event between 2140-01-01T00:00:00.000 TT and 2150-01-20T00:00:00.000 TT, the end of the search inside the kernel (which ends 2150-01-22).

## The arbiter's own checks

Tolerances by kind: event.ingress: 2 s to 5250 s; event.lunation: 2 s to 3 s; event.station: 6270 s to 50406 s. Check (a): every solve repeated with half hour brackets agrees within 0.000 s, at most 0.0000 of its tolerance (limit 0.1). The array reduction agrees with validate.py's apparent() at every solved instant within 0.004172 mas. Property: at t - tolerance and t + tolerance every ingress lies on opposite sides of its target, at most 1.498 arcsec from it (limit 1.5). Vector L4-ING-0061 solves -0.0002 s from the independent de440.bsp reduction in docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json (limit 1 s). Check (b), JPL Horizons (DE441), is pending: none of the 140 events has its Horizons answers yet. The 12 requests are listed in sources/l4/horizons-requests.txt; until their responses are committed under sources/l4/horizons/ with their SHA-256 in sources/l4/SHA256SUMS, no vector is confirmed by Horizons.
