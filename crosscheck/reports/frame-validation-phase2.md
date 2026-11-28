# True-of-date frame and relativistic correction validation

Frame and correction implementation validation against ERFA, not engine accuracy or a chart campaign.

Command: `node crosscheck/tools/validate-frames.mjs --phase2` on v22.23.3.
Reference: ERFA 2.0.1, compiled with `cc (Debian 14.2.0-19) 14.2.0`.
Exact commands, source and tooling SHA-256 digests, synthetic selection, TT span and acceptance limits are in [frame-validation-phase2.json](frame-validation-phase2.json).

The frame uses IAU 2006 bias and precession with unadjusted IAU 2000B nutation. The C reference independently evaluates the same specified composition. Aberration includes the ERFA solar-potential term. Solar deflection tests cover finite-target geometry, distant-source geometry and the near-Sun limiter. Shared model constants and coefficients make this an implementation check, not independent evidence for the physical model.

The apparent SPK pipeline uses converged reception light-time, deflection before aberration, and rotation last. Unit and published-reference tests check ordering and rotation signs. Its static reception-Sun geometry is an explicit approximation; it has not been validated end to end against apparent JPL coordinates.

| Group | Components compared | Maximum absolute residual | Failures |
| --- | ---: | ---: | ---: |
| nutation | 1026 | 2.710505431213761e-20 | 0 |
| precession | 2052 | 0 | 0 |
| true-equator-matrix | 4617 | 2.220446049250313e-16 | 0 |
| true-ecliptic-matrix | 4617 | 3.3306690738754696e-16 | 0 |
| relativistic-aberration | 1539 | 2.220446049250313e-16 | 0 |
| finite-target-solar-deflection | 1539 | 0 | 0 |
| distant-solar-deflection | 1539 | 0 | 0 |

Nutation and precession residuals are in radians; all other groups use dimensionless components. Limits are implementation acceptance checks, not engine accuracy bounds. No Swiss output or per-case positions are retained.
