# Frozen rc.10 coordinate and correction review

The earlier 168/210 comparisons above the aspirational 1 arcsecond threshold are diagnostic mismatches, not an attribution of 168 engine defects. Source inspection confirms both an intentionally approximate orbital kernel and material differences from the old Horizons observer quantity 31 convention. The controlled accuracy audit must measure these separately.

This is a read-only source review. No engine, dependency, CI, site, or existing research files were changed. No new NASA reference data were acquired for this review. Numerical residuals from the concurrent accuracy audit belong in its results, not in this document.

## Frozen evidence

- Engine: `@zodiacs/engine` 0.1.1-rc.10, source `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`.
- Packed artifact SHA-256: `a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`.
- Executed installation root: `/workspace/scratch/c1943cbff40d/parallel-runtime/package`.
- Dependency: `astronomy-engine` 2.1.19. The engine imports its ESM export, `node_modules/astronomy-engine/esm/astronomy.js`; source locations below refer to that file, abbreviated **AE**.
- Engine ephemeris implementation: `dist/chunk-35EQGGYX.js`, abbreviated **Z**; public API: `dist/index.js`.
- Source fingerprints are recorded in `source-manifest.json`. Upstream generator evidence is version-tagged source, not proof that every generator option was used to build this particular npm package.

## Actual computation

| Stage | Source evidence | Actual convention |
|---|---|---|
| Input clock | Z `clock`, `computeChart`; AE `AstroTime`, `TerrestrialTime` (1132–1297) | A JavaScript date supplies days from J2000 as `ut`; `tt = ut + deltaT(ut)/86400`. `natalChart` supports a pinned deltaT. The old corpus pins 69 seconds and treats the date labels as synthetic UT1. |
| Sun and eight planets | Z `eclipticOfDate` (117); AE `GeoVector` (3843) | `GeoVector(body,time,true)` supplies a geocentric EQJ vector with iterated light delay and an approximate aberration treatment. The final vector's timestamp is reset to observation time. |
| Moon | Z `moonOfDate` (125); AE `EclipticGeoMoon` (2805) | Geometric lunar position at observation TT, transformed to true ecliptic of date. Neither light delay nor stellar aberration is applied. `GeoVector(Moon,...)` also bypasses the general correction path. |
| Ecliptic reduction | Z `eclipticOfDate`; AE `Rotation_EQJ_EQD` (6524), `Rotation_EQJ_ECT` (6544), `Rotation_EQD_ECT` (6874) | J2000 mean equator → mean equator of date by precession → true equator of date by nutation → ecliptic using true obliquity. Rotation uses observation time, not emission time. |
| Reported longitude/latitude | Z `eclipticOfDate` | Longitude is normalized `atan2(y,x)`; latitude is `asin(z/r)`. There is no additional deflection or observer-location correction in this body-position path. |

The engine's bodies are geocentric even when a birth location is supplied; location affects chart angles/houses. The two nodes are separate derived quantities and are not part of the ten-body position corpus.

### Light delay and aberration equations

Let `H_b(t)` be AE's heliocentric EQJ vector of body `b`, `E` the Earth, `t` observation time and `c` the speed of light. AE `BodyPosition.Position` (3707), `BackdatePosition` (3777) and `CorrectLightTravel` (3688) implement:

- With `aberration=true`: solve `tau = |H_b(t−tau) − H_E(t−tau)| / c`; return that vector.
- With `aberration=false`: solve `tau = |H_b(t−tau) − H_E(t)| / c`; return that vector.
- Moon: return `GeoMoon(t)`, regardless of the aberration flag.

The first equation backdates the observer as a first-order approximation to stellar aberration. It is not an exact relativistic aberration transform. The second equation still includes light delay: **`GeoVector(...,false)` is not a geometric/NONE reference.** Construct same-time heliocentric differences for non-Moon geometric controls, and use `GeoMoon(t)` for the Moon.

The solver stops when successive emission times differ by less than `1e−9` day, with at most ten iterations. `AddDays` advances UT; TT is then recomputed. A fixed 69-second deltaT makes the increments equal. The path has no solar gravitational light bending. Using heliocentric positions at different instants also does not reproduce an exact barycentric light-time solver. Therefore an AE-versus-Horizons `LT+S` difference still contains correction-model differences and must not be named pure orbital-model error.

### Rotation and frame details

- AE `precession_rot` (1778) uses the familiar P03-form `psiA`, `omegaA`, `chiA` coefficient polynomials, with J2000 obliquity 84381.406 arcseconds. Its precession matrix is identity at J2000; there is no explicit ICRS frame-bias step here.
- AE `mean_obliq` (1340) uses the polynomial beginning `84381.406 − 46.836769 T − 0.0001831 T² + 0.00200340 T³` arcseconds, including fourth- and fifth-order terms.
- AE's function named `iau2000b` (1303) contains **five periodic terms**, not the complete 77-term IAU 2000B series. Its arguments are Ω, 2(F−D+Ω), 2(F+Ω), 2Ω and the solar mean anomaly. `e_tilt` derives true obliquity by adding the resulting obliquity nutation.
- `e_tilt` caches results within `1e−6` day (~0.0864 seconds). Use fresh, explicitly supplied epochs for audit records; do not mistake very small call-history effects for a separate physical model.
- AE `VsopRotate` (2920) uses the exact matrix documented by the upstream [VSOP87 source description](https://github.com/cosinekitty/astronomy/blob/v2.1.19/generate/vsop/vsop87.txt) under REFERENCE SYSTEM as a conversion from the dynamical J2000 ecliptic to **FK5 J2000 equatorial** axes. The generator's [ICRS comment](https://github.com/cosinekitty/astronomy/blob/v2.1.19/generate/generate.c#L2164) treats ICRS and EQJ as equivalent at the dependency's intended tolerance, not as mathematically identical frames.

Consequently, independently rotating a JPL ICRS vector and comparing it with an AE EQJ vector is useful, but a strict subarcsecond interpretation must state the axis approximation. Applying an IAU 2006 J2000 bias matrix alone is not an established full FK5-to-ICRS conversion with orientation and spin. Label such a variant a diagnostic.

### Orbital kernels and target centers

| Bodies | Kernel evidence | Center definition supported by inspection |
|---|---|---|
| Mercury–Neptune, Earth | AE `CalcVsop` (2935), `HelioVector` (3593): stored truncated spherical VSOP series, followed by `VsopRotate`. Upstream `LoadVsopFile` selects VSOP87B. | Earth uses the Earth series, not the EMB series. For other planets, the coefficient documentation names the planets but does not settle physical center versus planetary-system barycenter. No satellite displacement correction is visible in this pipeline. |
| Sun | `HelioVector(Sun)` is zero; its geocentric vector follows from Earth and the general correction path. | Heliocentric origin; geocentric Sun uses Earth-center geometry. |
| Moon | `CalcMoon` and `EclipticGeoMoon`: analytic Brown/Improved Lunar Ephemeris lineage, adapted via Montenbruck/Pfleger. | Moon center relative to Earth center, explicitly documented by `GeoMoonState`; no EMB substitution. |
| Pluto | AE `CalcPluto` (3276): gravitational integration between table states, with forward/backward segment blending. Upstream [codegen.c](https://github.com/cosinekitty/astronomy/blob/v2.1.19/generate/codegen.c#L1542) seeds the table through `TopPosition`, with TOP2013 planet 9. | Exact physical-center versus system-barycenter identity is not established by the inspected TOP2013 wrapper. No Charon displacement correction appears in this path. |

The dependency's public state-vector documentation says body center, but that wording alone does not prove the coefficient target identity. Upstream `generate/generate.c` tests non-Earth VSOP positions against raw NOVAS ephemeris body indices; its Earth case explicitly reconstructs the Earth center from EMB and geocentric Moon. This is useful lineage evidence, not sufficient justification to silently relabel every engine planet as a physical center or a barycenter.

For Pluto, `generate/top2013/top2013.c` `TopEquatorial` uses its own constant obliquity and longitude rotation before the seed states enter EQJ. Do not assume that every body's internal frame provenance is the VSOP matrix.

The upstream [VSOP truncation generator](https://github.com/cosinekitty/astronomy/blob/v2.1.19/generate/generate.c#L353) sets a **0.4 arcminute (24 arcsecond)** selection limit, tested at daily epochs from 1700 to 2200. This is direct evidence of an accuracy/size tradeoff well above the new 1-arcsecond aspiration. It is neither a certified bound for rc.10 nor a measurement of how much truncation contributed to the 168 mismatches. The full VSOP87 theory's published precision cannot be assigned to its truncated implementation.

## Old Q31 comparison and controlled next steps

Existing `parallel-work/toolkit/cases.json` and saved reference responses define the old oracle: Horizons Q31 apparent geocentric IAU76/80 ecliptic of date, TT epochs, Sun 10, Moon 301, Mercury 199, Venus 299, and system barycenters 4–9 for Mars–Pluto. The saved Q31 description includes light delay, stellar aberration and gravitational deflection. Its known-differences list already identifies major mismatches.

| Controlled comparison | What it resolves | What it does not resolve |
|---|---|---|
| Same-time geocentric NONE vectors in fixed axes, all ten bodies | Removes ecliptic-of-date and apparent-correction differences from the first comparison. | Exact FK5/ICRS equivalence and unresolved target centers; residual is a combined kernel/frame/target diagnostic. |
| Hold one input vector fixed; apply AE and independent ERFA rotations | Measures the rotation-model difference without orbital variation. Include mean versus true variants explicitly. | Does not prove the underlying vector is accurate or assign every Q31 residual to rotation. |
| Non-Moon geometric, LT-only and LT+S variants | Separates geometric versus apparent conventions and measures sensitivity to correction choice. | Standard JPL LT+S does not exactly reproduce AE's first-order observer-backdating rule. |
| Moon NONE versus Moon apparent variants | Measures the cost of using an apparent reference against the actual geometric lunar path. | Does not establish the analytic lunar kernel's universal accuracy. |
| Physical-center versus system-barycenter controls | Measures target-selection sensitivity at the explicitly acquired epochs. | Three epochs per outer body cannot establish a bound or identify all coefficients' intended centers. |
| Fixed TT instants and documented deltaT mapping | Prevents UTC/UT1/TT label errors. | Does not certify historical UTC or deltaT accuracy. AE has no explicit TT/TDB conversion here; VSOP's own source describes TT as its intended argument, so this alone is not a demonstrated time bug. |

Prioritize the geometric fixed-axis comparison, then the same-vector rotation control. They remove the largest attribution ambiguities without changing production code. Report angular vector separation alongside wrapped longitude and latitude differences. Do not divide or subtract scalar error magnitudes to claim additive causal contributions; compute controlled vector differences on the same case.

## Limits of this review

This review identifies implementation facts and finite experiments. It does not supply new numerical accuracy results, establish a universal error bound, certify planetary center identities, or demonstrate that the engine improves on Swiss Ephemeris. Exact matched-reference residuals are still required. The most defensible current explanation is that the old count mixes intentional approximation and convention differences; the relative contribution of each is an empirical question.
