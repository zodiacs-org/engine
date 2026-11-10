# Engine candidate qualification report

Status: **blocked**. Adapter review is required. No adapter qualification or release is authorized.

Plan SHA-256: `bf7e631657e2a10962af68a26e33d293c182a19ebc95cd842eb9befc533d81fe`
Report digest: `9d1b549fe8bc159985e50a5a2c18c16800de10f991a657a4f0e7d510772caa32`

Blocked at **artifact-preflight**: Candidate installation changed after plan creation

## Checks

| Check | Result |
| --- | --- |
| integrity | fail |

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
- Blocked runs cannot qualify a candidate, even if partial output contains valid rows.
