# Methodology and integration review

Status: final implementation and result review completed on 27 September 2026. The methodology section was recorded before this reviewer inspected new target comparison results. Reviewer: a separate AI agent, not a human astronomical auditor.

**Scoped verdict:** the executable audit supports its finite discrepancy measurements. No outstanding blocker was found in the reviewed calculation, reference reconstruction or baseline identity checks. It does not establish absolute astronomical accuracy, unique causal error attribution or Swiss Ephemeris parity.

## Independent execution and findings

The reviewer reran `run-audit.mjs` against the frozen rc.10 installation into a separate directory. All stages passed. Every comparison row, summary, body group and body-center control initially reproduced exactly. After the additive sensitivity flag described below was introduced, the reviewer compared all 210 rows again: astronomical measurements, ratios, policies and original statuses were unchanged, and all flags were correct. The reviewer also independently ran the ten rotation controls, eleven reference-parser controls, nine geometry/closure controls and final ten sensitivity test groups.

The source review and runner agree on the important paths: Moon geometric reference; other bodies' corrected reference; same-time heliocentric subtraction for geometric controls; exact installed ESM dependency; and a separately verified 69-second pin for direct dependency calculations after public chart calls restore their clock state. The largest measured deviation of the direct clock receipt from 69 seconds was about 0.000000414 second.

| Observed quantity | Reviewed result |
|---|---:|
| New primary independent vectors | 420 |
| Additional body-center vectors | 18 |
| Final body/date comparisons | 210 |
| Above one arcsecond in longitude or latitude | 168 |
| Independent-frame angular discrepancy | Median 2.91584″; maximum 28.77886″ |
| Same-input target-versus-ERFA rotation choice | Median 0.05756″; maximum 0.16047″ |
| Geometric provider-versus-JPL direction discrepancy | Median 2.95988″; maximum 28.86984″ |
| Tropical sign-label disagreements at evaluated inputs | 0 |

The old and new counts both equal 168, but the membership is not identical: 164 cases exceed the threshold in both; four move below and four move above it. Signed-coordinate decomposition closes to within approximately 0.000000000819 arcsecond in this run. Public-to-direct-provider reduction agreement is an adapter self-consistency check, not evidence of physical accuracy at its tiny numerical residual.

These measurements support prioritizing the position provider for further precision work. The particular measured final-rotation difference alone cannot explain the much larger direction discrepancies observed here. The residual still contains unresolved kernel, internal-frame and target-center differences; the apparent comparison additionally retains correction-method differences. Do not turn this prioritization into a percentage attribution or a claim that one specific approximation has been proven solely responsible.

### Important sensitivity limitation

All 210 rows pass the predeclared derivative heuristics, but 96 calculated discrepancy/rate ratios exceed the longest sampled derivative offset of 300 seconds; two exceed one day. The largest is approximately 29.36 days. These are formal local linearization scales, **not demonstrated time shifts**, event-time errors or valid extrapolations over those durations. Agreement between derivatives measured over minutes does not establish linearity over days.

The final companion adds `extrapolatesBeyondDerivativeSamples`, comparing the estimate and the upper ratio with 300 seconds. It leaves the original gates, calculations and statuses unchanged; unavailable ratios receive a null flag. A dedicated test covers an upper-ratio-only exceedance, the exact 300-second boundary and unavailable ratios. The saved report correctly records 96 flags. README and FINDINGS disclose that this reporting flag was added after the first result and explain its limited meaning. An unflagged ratio is still not certified. This resolves the reporting concern without concealing post-result changes or retuning acceptance gates.

The review resolved nonfinite decomposition handling, ambiguous 180-degree sensitivity inputs, response-origin/calendar checks and a nonstandard even-sample median. No engine, dependency or production configuration edits were needed.

## What this audit can establish

This is a follow-up investigation of the earlier 210 cases. Reusing those dates is appropriate for explaining their discrepancies, but it is not a new blind holdout. The new JPL vector references must be acquired independently of engine outputs and must preserve request parameters, raw response bytes and hashes, actual source headers, times and target identifiers.

The planned comparisons can measure discrepancies and sensitivity to defined computational choices. They cannot automatically assign each residual to a unique physical or algorithmic cause. In particular, an apparent-vector discrepancy can still contain orbital-model, correction-method, frame-definition, body-center and numerical differences.

## Required interpretation constraints

1. **Time.** Use the same observation TT for JPL vectors, Q31 and rotation matrices. The full Horizons manual explicitly permits TT vector tables, despite the condensed API table omitting that option. Require the returned `JDTT` header and the intended epochs; do not silently reinterpret the input as TDB or UT. The transported ISO labels remain synthetic UT1 with the specified 69-second offset, not historical or future physical UTC.
2. **Origin and target.** Require Earth geocenter, ICRF equatorial axes, stated vector units, and the actual requested body ID. A system barycenter and physical body center are different targets. Three-epoch center comparisons, if available, remain finite controls rather than a universal correction or proof of the engine's target semantics.
3. **Corrections.** `NONE`, `LT+S`, engine apparent vectors and observer quantity 31 are distinct pipelines. Q31 includes gravitational light deflection and an IAU76/80 ecliptic-of-date reduction. Engine observer backdating is not established as numerically identical to the JPL stellar-aberration treatment. A Q31-to-rotated-vector difference therefore remains a bundled convention difference unless additional controlled calculations isolate its terms.
4. **Frames.** ERFA's IAU2006/2000A transformation is an independent implementation of a specified frame, not a reconstruction of Horizons' entire IAU76/80 reduction. Strict ICRS input includes frame bias. The mean-J2000 alternative is a convention-sensitivity experiment; applying it to unchanged JPL ICRF coordinates does not make it an equally matched physical reference. A fixed obliquity variant alone does not reproduce the entire Horizons frame pipeline.
5. **Target-frame controls.** Rotating an independent JPL vector through the target's own matrix is useful to hold the matrix fixed. It is explicitly a same-target-frame diagnostic, not independent validation of that matrix. Direct Cartesian-direction comparisons avoid the target's final ecliptic rotation but retain the vector and correction conventions.
6. **Attribution.** Signed longitude/latitude components may form an algebraic residual decomposition, with circular longitude closure checked. Maxima, absolute errors and angular distances cannot be subtracted or added as independent causes. Cancellation prevents an unqualified percentage claim such as a stated fraction of total error being caused by a frame choice. No root-sum-square budget is justified without a statistical model.
7. **Numerical resolution.** Small angular separations should use `atan2(norm(cross), dot)` on normalized directions. `acos(dot)` alone is poorly conditioned for the small frame-bias differences being examined. Verify matrix determinant, orthogonality and multiplication orientation; distinguish numerical tolerance from a physical error bound.
8. **Product impact.** A finite discrepancy is not a uniform uncertainty bound. A local discrepancy/rate estimate is not a measured event-time error, and it becomes unstable near a station or tangency. Sign-boundary margins describe the evaluated inputs only. Claims over an entire birth-time interval require separate coverage and error-enclosure evidence.

## Primary documentation checked

- [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html): Specification of Time; reference frames; vector correction options; observer quantity 31; Earth-orientation model discussion. Checked 27 September 2026.
- [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html): request parameters and the condensed time-scale table. Checked 27 September 2026. Its vector-time summary is less complete than the full manual; actual response-header validation controls the audit.

The mathematical closure, conditioning and inference restrictions above are this reviewer's analysis. They are not claims that JPL or ERFA endorses the toolkit.
