# Independent ICRF vector references

This dataset supplies raw JPL Horizons vectors for a follow-up accuracy investigation. It deliberately reuses the **21 dates from the prior Q31 comparison**. These dates are not blind holdout data, and this small dataset cannot establish universal accuracy.

No Zodiacs, Astronomy Engine, or Swiss code is imported to acquire, select, or parse the reference values. The only numerical processing in this folder is time-label conversion and finite-value/unit validation. Rotation into ecliptic coordinates and comparisons with target calculations belong in the separate audit analysis.

## Frozen scope

`protocol.json` was frozen before acquisition. `cases.json` is a byte-for-byte copy of the earlier date/body manifest, bound by its SHA-256.

| Group | Bodies and dates | Correction | Rows |
|---|---|---|---:|
| Primary geometric | Ten bodies × all21 dates | `NONE` | 210 |
| Primary corrected | Same ten bodies × same21 dates | `LT+S` | 210 |
| Optional body-center controls | Mars–Pluto × 2000-01-01, 2026-09-27, 2051-03-14 | `LT+S` | Up to18 |

The primary target IDs are identical to the older observer-Q31 comparison: Sun10, Moon301, Mercury199, Venus299, and Mars–Pluto system barycenters4–9. Optional controls use499,599,699,799,899,999. Unsupported optional coverage is reported and does not block the primary dataset. It is not silently substituted.

No target residuals or numerical pass gates influence request selection. No new dates are added after seeing results.

## Actual reference conventions

| Parameter | Choice |
|---|---|
| Ephemeris type | `VECTORS` |
| Origin | `500@399`, Earth body center |
| Axes | `REF_SYSTEM=ICRF`, `REF_PLANE=FRAME` |
| Timescale | `TIME_TYPE=TT`, `TLIST_TYPE=JD` |
| Requested TT instant | Synthetic UT1 input label +69seconds |
| Calendar | Proleptic Gregorian |
| Units | `AU-D` |
| Table | `VEC_TABLE=3`: position, velocity, one-way light time, range, range rate |
| Correction groups | `NONE`, `LT+S` |

The generic API parameter table omits TT from its condensed vector-timescale description, while the main Horizons manual explicitly permits TT vector tables. The actual acquired responses identify `JDTT` and `Calendar Date(TT)`. The parser requires this returned evidence. It never substitutes TDB for TT or assumes the two are identical.

Horizons converts the requested TT to its internal ephemeris time. The target's dynamical series may treat TT as the independent time without that conversion. That remaining distinction must be recorded in any inference about small residuals. ISO-looking input labels represent synthetic UT1 with pinned ΔT; they are not reconstructions of physical historical UTC.

The parser checks the returned target ID, Earth399, `BODY CENTER`, Gregorian calendar, ICRF frame, AU-D units, correction type, finite values, positive range/light time, vector norm versus range, row cardinality, and every returned TT epoch against the request to within1millisecond.

## Interpretation boundaries

- `NONE` supplies instantaneous geometric geocentric vectors. To compare with the target's geometric model, use its simultaneous heliocentric target-minus-Earth vectors, and its instantaneous geocentric Moon. A target function that still applies light time is not a geometric comparison.
- `LT+S` includes light time and stellar aberration. It omits the gravitational light bending and of-date coordinate reduction present in observer Q31. The engine's approximation that retards both heliocentric Earth and target to a common emission epoch is not exactly the same algorithm as JPL's correction. A corrected residual therefore cannot automatically be called pure orbital-model error.
- The engine's public Moon calculation is geometric; Moon `NONE` is the relevant correction choice. Moon `LT+S` is retained as a diagnostic control.
- ICRF and an engine's mean-J2000/FK5-like axes are not automatically interchangeable at arbitrarily tight tolerances. Independent frame projection and deliberate use of the same engine rotation are different analyses and must be labeled separately.
- Existing planetary barycenter IDs preserve the earlier reference convention. The actual center represented by each truncated target model has not been established merely from API names. Optional physical-center comparisons show sensitivity; they do not settle that question.
- Old Q31 versus corrected-vector differences combine frame reduction, gravity corrections, and potentially EOP treatment. They should not be attributed exclusively to one precession formula.

## Files and reproducibility

`snapshot/raw/<table>.json` preserves the exact response bytes. Each `.receipt.json` preserves the exact URL, parameters, request/retrieval timestamps, HTTP status, and raw SHA-256. `.parsed.json` captures verified source headers/footer and API signature. `snapshot/vectors.json` contains parsed rows and a source manifest; each row links back to its raw response hash.

The saved source lines identify the actual ephemeris/target solution used by Horizons. Optional body centers may use a satellite-system solution rather than the same label as a system barycenter; preserve those labels when interpreting differences.

Reconstruct a fresh processed manifest entirely offline:

```sh
python acquire-vectors.py --mode replay \
  --manifest-output /absolute/path/to/reconstructed-vectors.json
```

Acquire the same fixed protocol into a new directory:

```sh
python acquire-vectors.py --mode acquire --output-dir /absolute/path/to/new-snapshot
```

Requests are sequential. Do not run another Horizons acquisition concurrently. The script refuses to overwrite archived requests. `--resume` reuses existing successful responses after validating the exact request parameters and hashes. Any primary request failure stops acquisition; optional control failures are reported explicitly.

Check parser rejection controls without network or target engine access:

```sh
python check-reference.py
python check-reference.py --output /absolute/path/to/reference-integrity.json
```

The integrity checks print by default and write only to an explicit output path. They test failure handling, not astronomical accuracy. Offline reconstruction validates raw hashes, parameters, headers, rows and times again; target analysis should consume the reconstructed manifest rather than trusting edited processed numbers.

Official source documentation:

- https://ssd-api.jpl.nasa.gov/doc/horizons.html
- https://ssd.jpl.nasa.gov/horizons/manual.html
- https://ssd.jpl.nasa.gov/planets/eph_export.html
