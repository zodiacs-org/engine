# Independent ASC / MC verification

This is a standalone reference generator and public-API runner. Expected angles come from **ERFA Earth orientation plus original vector geometry**, not from Zodiacs, astronomy-engine, or Swiss Ephemeris. It changes no engine files. The target is supplied as a path to a built module exporting `natalChart`.

## Recorded rc.10 result

`report.json` records the actual run against `0.1.1-rc.10`. All 1,300 gated angle comparisons passed across 685 chart inputs:

| Quantity and scope | Comparisons | Predeclared maximum | Largest observed difference |
|---|---:|---:|---:|
| ASC, absolute latitude ≤45° | 355 | 0.5 arcsecond | 0.192617 arcsecond |
| ASC, 45° < absolute latitude ≤66° | 260 | 8 arcseconds | 4.148983 arcseconds |
| MC, every supplied latitude | 685 | 0.5 arcsecond | 0.109114 arcsecond |
| ASC, absolute latitude 80° | 70 | Diagnostic only | 0.075794 arcsecond |

No target call threw or returned an invalid angle. The larger ASC difference near latitude 66° is consistent with a poorly conditioned horizon/ecliptic intersection: the same small sidereal-angle difference is amplified. This observation alone does not identify which target approximation contributes which fraction of the difference.

**These are finite comparison results, not universal accuracy bounds.** The broad engine, its planetary ephemerides, event searches and house cusps are not validated by this suite. One passing finite grid does not establish superiority to Swiss Ephemeris. The oracle itself is newly authored research software; its controls are evidence, not a formal proof of correctness.

## Run

Use Node 18+ with a built target and its dependencies available:

```sh
node geometry/run.mjs --engine /absolute/path/to/engine/dist/index.js --out geometry/new-report.json
```

The runner checks frozen fixture and gate hashes, requires the target to echo pinned `deltaT=69`, compares circular longitude differences, writes every input/output/error, and returns exit code 1 for any gated failure. The report records the entry-module hash and engine's own version. The entry-module hash alone is **not** a hash of the target's complete dependency graph; use the enclosing toolkit's package manifest as well.

Python is only needed to regenerate expectations:

```sh
python -m pip install pyerfa==2.0.1.5
python geometry/generate.py --output geometry/regenerated-fixtures.json
```

Regeneration requires PyERFA **2.0.1.5**, ERFA **2.0.1**, and its recorded SOFA heritage **20231011**. The generator verifies these versions and passes 21 controls before writing. The original generator run used Python 3 and the runtime's NumPy; the calculation here calls scalar ERFA functions and uses Python `math` for geometry. Last-bit floating-point differences can occur across platforms; a differing regenerated file needs review rather than automatically replacing the frozen reference. `freeze.json` records the fixture and gate digests before the first target execution. Do not replace the freeze to make a failing candidate pass.

## Exact convention and independence boundary

The oracle uses:

1. `erfa.cal2jd` for proleptic Gregorian civil-date digits.
2. `erfa.gst06a(UT1, TT)` for Greenwich apparent sidereal angle, with IAU 2006 precession and IAU 2000A nutation plus the 2006 compatibility adjustment.
3. `erfa.obl06(TT) + erfa.nut06a(TT)[1]` for true obliquity.
4. Original vector-plane intersections for ASC and MC.

The ISO field is **a synthetic UT1 clock encoding**. The API calls it `utc`, but these fixtures deliberately set UTC−UT1 to zero and TT−UT1 to exactly 69 seconds at every epoch. This isolates angle geometry from historical/future ΔT models, leap-second interpretation and Earth-orientation observations. In particular, the 1950 ISO string is not a claim that modern UTC existed then. No realistic historical clock or future UT1 prediction follows from these cases.

Positions are tropical longitudes of date relative to the true equinox. East terrestrial longitude and north latitude are positive. Latitude is used directly as the orientation of the local horizon normal; no deflection-of-vertical correction is attempted. Polar motion, free-core nutation, refraction, terrain and house cusps are outside scope. Whole-sign houses are requested only to keep the target from encountering unrelated quadrant-house failures; the output houses are not compared.

This is an **independent implementation and dependency**, not an entirely independent astronomical model: ERFA and astronomy-engine can implement related IAU standards. A common flaw in a shared model is not disproved by agreement between implementations. The fixture generator has no target import, subprocess invocation, or engine output dependency. Dates, grids, equations and gates were fixed before target execution; only the published input/output types were read to connect the runner.

## Geometry

In true equatorial Cartesian coordinates, let θ be Greenwich apparent sidereal angle plus east longitude, φ the latitude, and ε true obliquity. Define:

```text
zenith Z       = (cosφ cosθ, cosφ sinθ, sinφ)
east E         = (−sinθ, cosθ, 0)
meridian Q     = (cosθ, sinθ, 0)
ecliptic pole N = (0, −sinε, cosε)
ecliptic Y      = (0, cosε, sinε)
```

ASC is the normalized intersection `N × Z`, choosing the antipode with positive dot product against east. This is the **rising** horizon intersection. MC is the normalized intersection `E × N`, choosing the antipode whose projection onto Q is positive. This is the upper meridian intersection, which need not lie above the horizon at high latitude. Convert either unit vector V to ecliptic longitude with `atan2(V·Y, Vx)` and normalize to `[0, 360)`.

If the horizon coincides with the ecliptic, ASC is nonunique and the generator returns null; a self-control exercises this case. No such nonunique case belongs to the frozen target grid. A norm below 0.001 is excluded from ASC acceptance by the predeclared conditioning rule. Above 66° absolute latitude, ASC comparisons are exploratory because branch conventions and conditioning need their own explicit contract. This exclusion was set before execution; the supplied ±80° cases happen to agree closely with the chosen rising-side convention.

## Coverage and controls

The grid contains five epochs in 1950, 2000, 2026, 2050 and 2100. Its 385 base cases use 11 latitudes and seven longitudes, including values adjacent to zero and ±180°. A further 300 cases target the four local right-ascension quadrants with ±0.0000001° offsets, using ERFA to select the terrestrial longitude. These are branch/seam probes, not a random representative sample of real births.

The controls cover four published upstream numerical vectors (`gst06a`, `obl06` and both `nut06a` components), eight equatorial cardinal-angle controls, six zero-obliquity controls, one horizon/ecliptic coincidence, scalar-versus-vector agreement over 364 geometry combinations, and residuals of the horizon/ecliptic/meridian plane equations. Rising direction is checked through a finite rotation of the zenith in the scalar comparison. The scalar check shares the same geometric assumptions and is not a second ephemeris.

The acceptance thresholds in `gates.json` are research criteria independently chosen for this finite verification task. They are neither reported measurement uncertainty nor a promise from the engine author. Keep diagnostic results separate from pass/fail results.

## Primary sources and provenance

- [ERFA `gst06a`](https://github.com/liberfa/erfa/blob/v2.0.1/src/gst06a.c): UT1 and TT inputs; compatible sidereal/precession/nutation convention.
- [ERFA `obl06`](https://github.com/liberfa/erfa/blob/v2.0.1/src/obl06.c): IAU 2006 mean obliquity.
- [ERFA `nut06a`](https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c): adjusted IAU 2000A nutation.
- [PyERFA test vectors](https://github.com/liberfa/pyerfa/blob/v2.0.1.5/erfa/tests/test_ufunc.py): four scalar expected values used by the generator controls, checked directly in the installed 2.0.1.5 distribution.
- [SOFA Issue 2023-10-11](https://www.iausofa.org/current-software): official model compatibility explanation, retrieved 27 September 2026.

The function descriptions and test vectors were inspected in the installed pinned PyERFA distribution; the matching SOFA release page and ERFA upstream `gst06a` page were also checked online. ERFA is derived from SOFA; **this project uses ERFA rather than claiming to be SOFA itself**. Neither IAU, SOFA nor ERFA endorses this toolkit. Numerical output and original fixture/geometry code are included here; no Swiss code or Swiss-generated expected values are included.
