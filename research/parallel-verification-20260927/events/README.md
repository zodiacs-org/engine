# Bounded JPL lunation comparison

This harness compares two ordinary October 2026 lunations against fresh JPL Horizons apparent geocentric Sun/Moon longitudes. It exercises the public `findLongitudeCrossingsWith` API with a callback that subtracts Sun longitude from Moon longitude, obtaining both from `natalChart` with a fixed ΔT of 69 seconds.

It is a small independent event diagnostic. It does not establish global completeness, Swiss Ephemeris parity, physical timing accuracy, or a two-second guarantee. It does not import Swiss Ephemeris code, binaries, or fixtures.

## Prespecified scope and gate

`protocol.json` fixes the choices before target execution:

| Case | Synthetic UT1 search window | Target Moon minus Sun |
|---|---|---:|
| October new Moon | October 1–16, 2026 | 0° |
| October full Moon | October 16–November 1, 2026 | 180° |

The engine scans at a quarter-day step. The diagnostic requires exactly one returned root in each window, no more than **10 seconds from either endpoint** of the final independently acquired reference bracket. The 10-second gate was chosen before viewing target results. This gate is not a proposed production accuracy specification.

The runner hard-codes these bounded choices so changing the protocol and refreshing its digest cannot silently relax the gate. A future protocol requires a reviewed runner revision.

## Clock and coordinate conventions

The engine's `utc` field receives a **synthetic UT1 clock**, represented using ISO `Z` strings for transport. These labels are not actual UTC phase timestamps. Every JPL sample is explicitly requested in TT at `synthetic UT1 + 69 seconds`, removing disagreement caused by independently modeled ΔT. The date format is proleptic Gregorian.

Horizons requests use Sun `10`, Moon `301`, Earth geocenter `500@399`, observer quantity `31` (`ObsEcLon`), decimal degrees, and extra precision. The saved headers identify DE441. These are apparent geocentric ecliptic longitudes of date. Syzygy here means a 0° or 180° **longitude difference**; it is not eclipse maximum, closest angular separation, or an illumination maximum. Residual differences can include implementation and coordinate-convention differences.

## Independent reference construction

`acquire-reference.py` uses only Python's standard library and public HTTPS. It never imports or invokes the target engine.

1. Sample Sun and Moon every three hours over the fixed calendar month.
2. Independently identify one local increasing sign change for each predeclared angle/window.
3. Use JPL-only interpolation to choose a ±20-minute refinement window sampled at one-minute intervals.
4. Use a second JPL-only interpolation to choose five TT instants spaced one second apart.
5. Save the adjacent sign-change bracket and interpolate within it.

The final sample brackets are approximately 0.999995 seconds wide. The interpolated estimate is useful for reporting residuals; it is not a proof of a subsecond physical lunar phase. Local samples support ordinary increasing crossings only. They do not prove complete searches across arbitrary motion, stations, tangencies, or all epochs.

In the acquired CSV, each longitude is printed to seven decimal places. Rounding of two such longitudes can shift their difference by about 0.0000001°; converting that to time using the locally sampled rate gives a submillisecond-to-millisecond scale estimate. TT Julian-date printing and floating-point arithmetic also add small numerical effects. These are much smaller than the one-second sample bracket and 10-second gate, but are not a quantified bound on JPL's physical ephemeris uncertainty. The test does not claim the bracket includes all physical/model uncertainty.

All ten successful responses are preserved byte-for-byte in `raw/*.json`. Each corresponding `*.request.json` preserves exact URL/parameters, request/retrieval UTC timestamps, API signature, raw SHA-256, and full table header/footer. One initial long-URL request failed with HTTP 502 and supplied no reference data; the successful coarse/minute requests use compact uniform interval queries. Fine queries use five explicit TT Julian dates.

## Run offline against a candidate

Requires Node.js with ES module support. Supply the candidate's public root module, with its dependencies available:

```sh
node compare-events.mjs --engine /absolute/path/to/package/dist/index.js --output candidate-events.json
```

The runner reads saved references without network access. It checks raw response hashes and then rederives expected event times/brackets directly from the raw Sun/Moon CSV, before importing target code. Missing/nonfinite processed times, duplicate cases, edited expectations, invalid target longitudes, and ignored ΔT pins are rejected. Reported ISO labels are regenerated from the raw-derived numbers.

For the frozen baseline run:

```sh
node compare-events.mjs \
  --engine /absolute/path/to/rc10/package/dist/index.js \
  --expect-version 0.1.1-rc.10 \
  --tarball /absolute/path/to/zodiacs-engine-0.1.1-rc.10.tgz \
  --output measured.json
```

`--expect-version` is optional. `--tarball` always records the supplied file's SHA-256. It enforces the frozen baseline archive hash only when the baseline version is explicitly requested. A recorded archive hash alone does not prove that imported runtime files came from that archive; the containing toolkit's artifact preparation performs that association. The report keeps actual target identity separate from baseline metadata.

## Rebuild or reacquire references

Offline reproducible derivation from the saved responses and request parameters:

```sh
python acquire-reference.py --from-raw
```

Fresh sequential public JPL requests:

```sh
python acquire-reference.py
```

Do not run another Horizons acquisition concurrently. The script makes one request at a time and refuses unexpected sample counts or missing bounded roots. Fresh JPL outputs may change as its ephemerides or service change; retain the prior raw snapshot for comparisons. Output metadata timestamps naturally change on offline rebuild, although expected numbers remain reproducible.

Run the offline integrity controls:

```sh
python check-integrity.py
```

This prints the report without changing the saved snapshot. To save a fresh report, add `--output /absolute/path/to/event-integrity.json`.

## Frozen rc.10 result

Baseline source identifier supplied by artifact preparation: `f5f33892`. Archive SHA-256: `a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`. Full machine-readable output is `measured.json`.

| Case | Engine minus interpolated JPL reference | Maximum distance to bracket endpoints | Diagnostic |
|---|---:|---:|---|
| October new Moon | −2.9615 seconds | 3.7160 seconds | Pass ≤10 seconds |
| October full Moon | −3.8001 seconds | 3.8460 seconds | Pass ≤10 seconds |

These two differences exceed two seconds. A numerical solver's narrow bisection interval must therefore not be described as a universal two-second agreement with independent event references. This sample does not diagnose which part of the ephemeris/convention pipeline accounts for the difference.

Official reference documentation:

- https://ssd-api.jpl.nasa.gov/doc/horizons.html
- https://ssd.jpl.nasa.gov/horizons/manual.html
- https://ssd.jpl.nasa.gov/planets/eph_export.html
