# Convention and residual attribution protocol

Declared before running this audit against the target. The 21 dates were already used in the preceding 210-row study; this is a follow-up diagnostic, not a blind holdout. There is no new numerical accuracy pass gate. The earlier one-arcsecond target is shown descriptively, without adjusting it to match new results.

Target: frozen `@zodiacs/engine@0.1.1-rc.10`, source `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`; complete distribution and Astronomy Engine 2.1.19 file hashes must match `baseline/identity.json`. Reference clock: synthetic UT1 ISO labels with TT−UT1=69 seconds, exactly as the first study. Dates do not represent actual historical UTC.

## Independent references

1. Preserve the original Q31 positions and their complete raw responses.
2. Acquire both geometric `NONE` and light-time/stellar-aberration `LT+S` ICRF geocentric vectors for every body/date. Require actual JDTT, Earth geocenter, frame, units, target IDs and correction headers. The reference provider never reads the target's calculated values.
3. Generate independent ERFA IAU2006/2000A rotations using the observation TT. Keep strict ICRS and mean-J2000 input interpretations separate. The latter is a sensitivity branch, not a relabelling of JPL ICRF coordinates.
4. Sample six outer body-center versus system-barycenter comparisons at three preselected dates. Optional unavailable centers are explicitly missing; no substitution changes the primary comparison target.

The frozen vector acquisition protocol is `reference/protocol.json`; the rotation manifest is `rotation/freeze.json`. Checks reconstruct processed vector rows from archived raw data and verify frozen matrix bytes before measurement.

## Measurements per body/date

- Public engine longitude/latitude versus the original Q31 values.
- Public engine longitude/latitude versus JPL vectors projected with independent ERFA. Use geometric JPL `NONE` for the Moon, and `LT+S` for ordinary bodies. The engine's approximate apparent-position algorithm and EQJ convention remain documented differences.
- Public result versus the same JPL vector projected through the target dependency's rotation. This controlled shared-frame diagnostic isolates a different question; it is not independent orientation validation.
- Geometric engine vector versus JPL `NONE`. Ordinary bodies use `HelioVector(body,t) - HelioVector(Earth,t)`; the Moon uses `GeoMoon(t)`. `GeoVector(...,false)` still applies light-time and must not be used for this control. Frame/center interpretation remains a caveat.
- Corrected provider vector versus JPL `LT+S` for ordinary bodies, plus a Moon-specific reduction consistency check. Use stable vector `atan2(cross,dot)` separation, not `acos(dot)` near zero.
- Reference sensitivity to frame bias, fixed/mean/true ecliptic choice, and optional body-center choice. These diagnose conventions; they do not establish the physical center intended by the approximate model.

For each longitude and latitude, preserve signed components that numerically close:

`target − Q31 = (target − shared-frame reference) + (shared-frame reference − ERFA reference) + (ERFA reference − Q31)`.

Report all three components and their numerical closure. Angular separations, maxima and percentiles are not additive. Do not subtract aggregate maxima or assign causal percentages. The final reference-convention term bundles corrections, frame/model choices and, for the Moon, geometric versus apparent selection.

## User-facing interpretation

Report observed sign-label agreement only for evaluated dates; no interval invariance follows. Estimate local input-time sensitivity from public-longitude derivatives at ±60 and ±300 seconds, with fixed refusal gates in `product-impact/sensitivity.mjs`. This is an empirical equivalent change in input time, never a measured event-time error, birth-time uncertainty or certified bound. Actual ingress/station/eclipse timing must be tested directly.

All outputs remain isolated research. No engine source, dependency, production gate or runtime behavior is modified.
