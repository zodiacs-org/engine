# Independent orientation audit

This module rotates already geocentric Cartesian vectors using pinned PyERFA 2.0.1.5 / ERFA 2.0.1, derived from SOFA 20231011. It does not query NASA, calculate any planetary ephemeris, or apply light time, stellar aberration, gravitational deflection or a change of spatial origin. It makes no standalone claim about engine positional accuracy.

## Python API

```python
from rotations import project_vector, orientation_matrices, metadata

# Observation time in TT, two-part Julian Date; caller supplies vector units.
result = project_vector([1.0, 2.0, 3.0], 2451545.0, 9777.75, input_frame="icrs")
matrices = orientation_matrices(2451545.0, 9777.75, input_frame="icrs")
```

`result["projections"]` contains Cartesian coordinates and longitude/latitude for four named variants. Units of vector length are preserved. Matrices use the convention `output_column = M @ input_column`, and JSON arrays contain matrix rows.

| Variant | Exact definition |
|---|---|
| `fixed_j2000_iau2006` | `erfa.ecm06(2451545, 0)` |
| `fixed_j2000_obliquity_84381_448` | `Rx(84381.448 arcsec) @ erfa.pmat06(2451545, 0)` |
| `mean_of_date_iau2006` | `erfa.ecm06(TT)` |
| `true_of_date_iau2006_2000a` | `Rx(obl06(TT) + nut06a(TT).deps) @ erfa.pnm06a(TT)` |

`Rx(ε)` is the passive equatorial-to-ecliptic rotation with rows `(1,0,0)`, `(0,cosε,sinε)`, `(0,−sinε,cosε)`. The true-of-date transformation includes ERFA's frame bias, IAU 2006 precession and full IAU 2000A nutation with the IAU 2006 compatibility correction. Its ecliptic longitude equals mean-of-date longitude plus `nut06a.dpsi`; the controls check this identity directly.

An alternative `input_frame="mean_j2000"` right-multiplies every matrix by the transpose of `erfa.pmat06(J2000)`. This treats supplied numbers as already in dynamical mean J2000 axes and cancels ERFA's initial frame bias. It is a deliberate diagnostic, **not an exact FK5-to-ICRS transformation**. In particular, it does not model FK5 orientation/spin differences or prove the target's internal vector axes.

The strict `icrs` setting uses ICRS vectors as aligned GCRS directions for rotation. It does not perform a relativistic BCRS/GCRS positional transformation. This limitation must accompany any subarcsecond physical claim.

## Frozen matrix export for Node

```sh
python rotation/test_rotations.py
python rotation/generate_matrices.py --cases baseline/cases.json --output rotation/rotation-matrices.json
```

The export holds the exact 21 supplied epochs, with `TT = encoded UTC/UT1 clock + 69 seconds` for this comparison. This isolates the existing benchmark's clock assumption; it does not assert that UTC−UT1 actually equals zero or that ΔT actually equals 69 seconds at every date. Each row includes the original `utc`, `ttIso`, two-part `ttJdParts`, and these five row-major matrices:

- `trueOfDateICRS`
- `meanOfDateICRS`
- `fixedJ2000ICRS`
- `fixedJ2000Obliquity84381_448ICRS`
- `trueOfDateMeanJ2000`

The export includes source/installed-library byte hashes, versions, cases-file digest, definitions, and orthogonality/determinant controls for all 105 matrices. The first matrix is the independent strict ICRS true-of-date reference. The final matrix intentionally varies the interpretation of the same input numbers. `fixedJ2000Obliquity84381_448ICRS` is an explicit constant-obliquity experiment; no claim of identity with another service's ecliptic output is made.

## Controls and provenance

`test_rotations.py` runs ten tests, including upstream ERFA `ecm06` and `pnm06a` matrix values and an upstream `eqec06` spherical example, inspected in the installed pinned distribution's `erfa/tests/test_ufunc.py`. It also checks orthogonality, determinant, inverse rotation, length preservation, date partitioning, input validation, longitude quadrants, frame-bias cancellation, and the separate mean-plus-nutation construction. `controls.json` records the result. These controls are evidence for this finite orientation implementation; they do not certify the entire target pipeline.

Primary source references:

- [ERFA ecm06](https://github.com/liberfa/erfa/blob/v2.0.1/src/ecm06.c)
- [ERFA pmat06](https://github.com/liberfa/erfa/blob/v2.0.1/src/pmat06.c)
- [ERFA pnm06a](https://github.com/liberfa/erfa/blob/v2.0.1/src/pnm06a.c)
- [ERFA nut06a](https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c)
- [Pinned PyERFA test vectors](https://github.com/liberfa/pyerfa/blob/v2.0.1.5/erfa/tests/test_ufunc.py)
- [Official SOFA model compatibility explanation](https://www.iausofa.org/current-software)

The installed function documentation and upstream numerical tests were read directly. The official SOFA release/model explanation and ERFA ecm06 source were also checked online on 27 September 2026. ERFA is derived from SOFA; the audit does not claim to be SOFA or endorsed by IAU/SOFA/ERFA.

## Interpretation against the target

The separate source audit reports that the target rotates an EQJ vector through precession, a truncated nutation implementation and true obliquity. EQJ is not asserted to be exactly ICRS, and VSOP-derived vectors involve a J2000/FK5 convention. Consequently, a difference between the strict ERFA and engine rotations is an orientation/convention diagnostic, not by itself an ephemeris error.

The vector handed to this module must already have its intended observational corrections. In the audited engine, ordinary body positions use a first-order aberration approximation and the Moon follows a separate geometric pipeline. Compare matched vector conventions or label the residual accordingly. An apparent Q31 ecliptic result and an IAU2006/2000A true-of-date vector projection must not be declared interchangeable without verifying their full conventions.
