# Independent review of the declination API

Reviewed 2026-09-28 by the agent that implemented configurable longitude aspects,
not the declination author. Scope: `src/declination.ts`,
`computeChartDeclinations` in `src/ephemeris.ts`, and the public
`chartDeclinations` wrapper in `src/api.ts`. This is an AI review; no human review
or independent physical ephemeris certification is implied.

**Verdict: no blocking defect found in the reviewed scope.** The review used
fresh in-memory esbuild output from these sources, rather than relying on a
possibly stale `dist/` or only on the author's tests. No source files were
changed by this review.

## Premises checked

- The rotation uses the complete ecliptic longitude and latitude. It therefore
  retains latitude contributions that a longitude-only approximation loses.
- The chart wrapper obtains true obliquity from the current provider on the
  input chart's explicit Delta-T pin, when present. The instant retains the
  engine's UTC-label/UT1 convention. This feature does not implement UTC-to-UT1
  or UTC-to-TT conversion.
- The rotation is meaningful for positions already expressed in the engine's
  true ecliptic/equinox of date. It adds no light-time, aberration or deflection
  corrections. In particular, it preserves the existing Moon convention.
- A caller-supplied chart's positions remain claims, as documented by the
  public wrapper. The returned Delta-T describes the current obliquity
  calculation; it does not authenticate the supplied positions or an older
  engine's model. The feature explicitly remains outside the natal receipt.
- Every supplied body is eligible, including the two nodes in a normal chart.
  This differs deliberately from the longitude-aspect ten-body filter and is
  documented. Right ascension is in degrees, not hours. `separation` is
  ecliptic-longitude separation, not angular separation on the celestial sphere.
- Out-of-bounds means strict `abs(declination) > trueObliquity`, without an
  uncertainty margin. The exact-ecliptic clamp prevents a rounding-only flag at
  a solstice. Near-boundary classification is not an uncertainty guarantee.

## Executed counterexamples and observations

| Check | Outcome |
| --- | --- |
| Policy `orb` accessor, body identifier accessor, longitude accessor | Each rejected with `RangeError`; getter invocation counter stayed zero. |
| Sparse body array, decorated array, duplicate identifier, null latitude, 257 rows | Each rejected with `RangeError`. |
| 72 rotations: longitudes `±Number.MAX_VALUE`, `±Number.MIN_VALUE`, 0°, 90°, 180°, 270°; latitudes −90°, 0°, 90°; obliquities 0°, 23.4°, 90° | Declinations stayed finite and in [−90°,90°]. Defined RA stayed finite in [0°,360°); `raDefined` agreed with nullability. |
| Celestial north/south poles at `(longitude, latitude, obliquity)` = `(90°,66.6°,23.4°)` and `(270°,−66.6°,23.4°)` | RA null and `raDefined:false`; declinations ±89.99999999999999°. |
| 80 provider reconstructions: ten physical bodies × four dates × two Delta-T pins | Maximum declination discrepancy 5.7553961596568115e−11 arcseconds; maximum wrapped RA discrepancy 0 arcseconds in this sample. |
| Eight chart analyses | All returned twelve rows, including both nodes; reported instant, pin and true obliquity matched the requested calculation. Supplied charts were not mutated. |
| Mutation of input body and policy objects after calculation | Returned rows and resolved orb policy retained their captured values. |

The reconstruction dates were `1800-01-01T00:00:00Z`,
`2000-01-01T12:00:00Z`, `2026-09-28T00:00:00Z`, and
`2199-12-31T00:00:00Z`; pins were 69 and 3600 seconds. The deliberately large
second pin is a clock-isolation control, not a physical Delta-T estimate.

For each physical body the separate reconstruction used astronomy-engine
`GeoVector(body,time,true)` (Moon: `GeoMoon(time)`), then
`Rotation_EQJ_EQD`, `RotateVector`, and `EquatorFromVector`. RA hours were
converted to degrees before comparison. This bypasses the new ecliptic-to-
equatorial helper and reconstructs the equatorial geometry by another path,
but **shares the same ephemeris provider**. Its close agreement demonstrates
reduction and clock consistency, not astronomical truth or the brief's
0.01-arcsecond physical comparison target. The independently implemented
Python checks and any provider-residual measurements are separate evidence.

The execution recorded 117 check groups, including the 72 extreme-value
rotations and checks around the 80 reconstruction rows. This count is an
execution summary, not a claim of exhaustive coverage.

## Limits of this review

The data-slot and dense-array checks reject the tested accessors without
executing them. They are not a sandbox for same-realm proxies or arbitrary
caller code. The inherited `resolvedChart` wrapper is not a provenance verifier.
Finite sampling does not prove behavior for every representable number or
certify any physical error bound. This review neither evaluates the complete
release nor authorizes publication.

## Reviewed source hashes

SHA-256 at the completed counterexample run:

```text
1ede8dc17b1a3c573e25cf531cfb7d2d7de4d4adbee17cf5a3bdffa438062ba8  src/declination.ts
361e0b41fbf315573e4fbb905bcb537296409e3ccd030e2ca3574a418bfd1c9c  src/ephemeris.ts
a41b224a0c60008e2c2cbc5927c377a62bc9cdda2239d79d64f7276a21b656ae  src/api.ts
```
