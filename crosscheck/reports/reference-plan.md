# Phase 2 reference availability plan

No engine accuracy measurement was made by this command. Full DE440 covers
the requested synthetic TT interval from 1800-01-01 up to 2200-01-01,
excluding the endpoint. DE441 has no requested outside-span cases.

Command: `node crosscheck/tools/reference-plan.mjs`

Runtime: v20.19.2 (linux, x64).
Executable SHA-256: `ca0728526aa1cc4e3056decec848ecc6d2c5391cecdd4e21a0ebd221d665c84e`.

Coverage source: [NAIF summary](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt), read 2026-10-19.
Calendar labels in that summary denote TDB. Synthetic ISO input labels denote TT.
The NAIF periodic TT/TDB conversion is used; civil time is outside this plan.

Kernel: de440.bsp, 119799808 bytes, SHA-256 `a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5`.
Source: [public kernel](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp).
The whole payload, receipt and parsed descriptors were verified locally.
Kernel bytes and per-case values are ignored and never enter this report.

Coverage planning pads reception epochs backward by 86400 seconds.
This is a conservative planning allowance, not a measured light-time bound.
Reduction must still reject any actual emission epoch outside covered records.

| Group | Availability | Selection |
| --- | --- | --- |
| DE440 | available | Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval. |
| DE441 | empty | The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested. |

DE440s is a shorter export and does not define the full DE440 boundary.
DE441 parts overlap near 1969; neither part was acquired for this plan.
Public catalog coverage is recorded in the JSON receipt. Only DE440 coverage
has been verified from locally acquired descriptors here.

| Body | Exact target | Observer | Availability | Reason |
| --- | ---: | ---: | --- | --- |
| Sun | 10 | 399 | available | Exact center chain covered. |
| Moon | 301 | 399 | available | Exact center chain covered. |
| Mercury | 199 | 399 | available | Exact center chain covered. |
| Venus | 299 | 399 | available | Exact center chain covered. |
| Mars | 499 | 399 | unavailable | Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution. |
| Jupiter | 599 | 399 | unavailable | Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution. |
| Saturn | 699 | 399 | unavailable | Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution. |
| Uranus | 799 | 399 | unavailable | Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution. |
| Neptune | 899 | 399 | unavailable | Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution. |
| Pluto | 999 | 399 | unavailable | Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution. |

Missing exact centers require separate satellite-kernel planning before
accuracy comparisons. System barycenters must remain distinct conventions.

Combined runtime/ and cache/ logical file bytes at planning: 154016945.
Fixed disk cap: 6000000000 bytes; files counted: 215.
Nested runtime/cache/ is counted once. Staging and abandoned files count.
Acquisition reserves the catalog payload and a bounded receipt before fetching,
rechecks each chunk write, and shares an exclusive lock with ERFA acquisition.
An existing lock is never stolen. Other writers must remain within the cap.

- Swiss Ephemeris is not installed; no installation or live comparison is part of this plan.
- Houses, lunar nodes, angles, speeds and topocentric positions are outside this reference plan.
- Available system barycenters do not establish unavailable exact-center errors.

The JSON receipt records catalog spans, verified kernel descriptors, exact
tooling hashes, command and storage snapshot. Tests of planning and budgeting
use invented descriptors and independent byte arithmetic, not engine outputs.
