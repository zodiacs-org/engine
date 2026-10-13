# Engine candidate qualification report

Status: **checks-not-met-review-required**. Adapter review is required. No adapter qualification or release is authorized.

Plan SHA-256: `bf7e631657e2a10962af68a26e33d293c182a19ebc95cd842eb9befc533d81fe`
Report digest: `933ed66d4aceee7eb667f10c8a9df03ed3326eecd7cdf800cd7f7d7bc243a3e4`

## Checks

| Check | Result |
| --- | --- |
| integrity | pass |
| baselineExecution | pass |
| candidateExecution | pass |
| apiCompatibility | pass |
| behavioralContract | pass |
| nonRegression | fail |
| referenceResidualTarget | fail |
| nodeRuntimeBudget | pass |
| installedSizeBudget | pass |

## Reference residuals

The table uses the larger absolute longitude/latitude residual for each observed row. Missing rows remain failures. These are known regression cases under the declared reference profile.

| Body | Rows baseline / candidate / expected | Baseline max, arcsec | Candidate max, arcsec | Candidate target exceedances |
| --- | --- | --- | --- | --- |
| Sun | 21 / 21 / 21 | 2.1298 | 3601.1325 | 21 |
| Moon | 21 / 21 / 21 | 7.3593 | 7.3593 | 11 |
| Mercury | 21 / 21 / 21 | 8.1229 | 8.1229 | 21 |
| Venus | 21 / 21 / 21 | 14.2516 | 14.2516 | 16 |
| Mars | 21 / 21 / 21 | 2.8880 | 2.8880 | 11 |
| Jupiter | 21 / 21 / 21 | 9.1756 | 9.1756 | 20 |
| Saturn | 21 / 21 / 21 | 15.9938 | 15.9938 | 21 |
| Uranus | 21 / 21 / 21 | 16.0515 | 16.0515 | 20 |
| Neptune | 21 / 21 / 21 | 16.6277 | 16.6277 | 21 |
| Pluto | 21 / 21 / 21 | 28.0450 | 28.0450 | 19 |

Numerical digest: `5738a58e897974a3f854bb0017bfc112b1b7b96f2e55666b10e9d4638865b250`. It excludes run timestamps and performance timing; observation epochs remain bound to the results. The full report digest includes execution measurements.

## Declared candidate conventions

Operator/source-review declarations and selected reference profile; not independently authenticated equivalence to JPL conventions.

- **axes:** astronomy-engine EQJ/FK5 approximation; not an exact ICRF assertion
- **centers:** approximate provider coefficients; physical-center guarantee not established
- **clock:** encoded-UT1-plus-pinned-deltaT
- **frame:** true-ecliptic-equinox-of-date
- **moonCorrection:** geometric
- **origin:** geocentric
- **planetCorrection:** astronomy-engine 2.1.19 first-order apparent approximation, with retarded heliocentric target and Earth
- **rotationModel:** astronomy-engine 2.1.19 precession and truncated nutation
- **zodiac:** tropical

Declared differences:

- Planet correction differs from standard JPL LT+S.
- Approximate orientation differs from independent ERFA trueOfDateICRS.
- Outer-planet reference uses system barycenters; provider coefficients do not establish exact center equivalence.
- DELIBERATE NEGATIVE CONTROL: one degree added to every Sun longitude; not an actual candidate build.

## Limits

- One arcsecond is a research reference-residual target, not an existing production release gate or a certified physical error bound.
- Reference correction, frame and physical-center differences remain explicit; matching declaration fields does not authenticate implementation semantics.
- Existing cases are public regression data. A new unseen candidate does not turn them into a blind holdout.
- Node timings and installed file bytes are diagnostic budgets, not browser performance, download size or peak-RSS measurements.
- The child process bounds wall time, V8 old-space and transport; it does not cap total RSS and is not an OS security sandbox. Only trusted local candidate code may be executed.
- Every outcome requires separate adapter and release review. No Verify trust inventory is changed.
- These are previously evaluated regression epochs, not a new blind holdout or evidence of all-epoch accuracy.
- JPL LT+S is not identical to the engine first-order approximation that retards both heliocentric Earth and target; correction mismatch can remain.
- Strict ICRF/ICRS plus ERFA bias/precession/nutation differs from approximate engine EQJ/FK5, precession and truncated nutation conventions.
- ICRS axes are treated as aligned GCRS directions for rotation; no relativistic BCRS/GCRS positional transformation is added.
- Mars through Pluto are planetary-system barycenters, not guaranteed physical planet centers; optional body-center controls are not substituted.
- Moon uses geometric NONE to match the audited geometric Moon treatment; this is not an apparent Moon reference.
- Synthetic UT1+69s isolates the existing benchmark clock; it does not verify historical UTC, future Earth orientation or DeltaT.
- Hashes authenticate committed bytes within this toolchain, not source authority, publisher identity or astronomical truth.
- Finite position residuals do not establish event-time errors, interval invariance, certified bounds or Swiss Ephemeris equivalence.

## Review checklist

- [ ] Review candidate source, declared provider conventions and retained reference differences.
- [ ] Inspect every missing case, failed probe, per-body residual and regression before changing the qualification profile.
- [ ] Establish independent holdout coverage, additional epochs and required events/houses before broader accuracy claims.
- [ ] Review browser/mobile performance and product-specific budgets separately from this Node diagnostic.
- [ ] Deliberately implement and review a new Verify adapter inventory; this runner has not changed it.
- [ ] Obtain the separate merge/release decision under the project workflow.
