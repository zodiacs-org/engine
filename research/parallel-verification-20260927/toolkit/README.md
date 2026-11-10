# Planetary position diagnostics

`cases.json` was fixed before target comparison. It selects 21 synthetic UT1 labels from 1801–2198 and ten bodies (210 rows), with TT−UT1 pinned to 69 seconds. This isolates the position calculation from a historical delta-T model; the ISO `Z` inputs here are synthetic labels, not claims about historical UTC or Earth rotation.

Expected positions come directly from the NASA/JPL Horizons API, quantity 31. The acquisition script never imports the engine. Each response and retrieval receipt is archived in `references/`; `positions.json` links every processed row to the original response digest. The validator checks coverage, raw digests, request/response conventions, epochs, values, and unique provenance before loading the target.

```sh
node --test toolkit/test-reference-check.mjs
node toolkit/run-positions.mjs --engine /absolute/path/dist/index.js --out /fresh/path/positions.json
```

Frozen rc.10 result: all 210 rows pass the predeclared 60 arcsecond diagnostic (both longitude and latitude); 168 exceed the aspirational 1 arcsecond threshold in at least one coordinate. The largest absolute longitude residual is Pluto, 28.534631 arcseconds. The complete per-body and per-row results are in `../results/rc10/positions.json`.

These residuals are not an estimate of absolute astronomical accuracy. Horizons returns apparent observer-centered IAU76/80 ecliptic-of-date coordinates including gravitational deflection and aberration. Engine conventions differ, including its Moon correction policy and rotation model. Mars through Pluto references use planetary-system barycenters, explicitly identified in the case policy; the inner targets use physical body centers. Different conventions must be reconciled before deriving a strict accuracy budget.

## Reacquisition

```sh
python3 toolkit/acquire-horizons.py
```

This command contacts the JPL API and updates the reference directory. Matching URL/digest receipts permit reuse of existing raw responses. Requests use TT Julian dates, proleptic Gregorian calendar, Earth geocenter, and quantity 31. A one-millisecond reference-epoch tolerance was declared before target comparison to accommodate decimal Julian-date input and printed-epoch rounding. Gates were not changed after observing engine results. The first failed calendar-list query is retained under `acquisition-errors/`; it is excluded from all expected outputs.

Do not silently refresh the recorded baseline. Freeze changed case policy and newly acquired references as a separately reviewed revision. See the official [Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html).
