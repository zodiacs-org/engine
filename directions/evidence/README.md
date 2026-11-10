# Evidence rules

Expected directional arcs must come from an independently derived sphere
example or a fetched and read published calculation, never from a previous
run of this library. All natal inputs in this project are synthetic. Do not
copy Swiss Ephemeris code, data, fixtures or per-case values.

For each numerical fixture, record the following before accepting it:

- The named source, edition, URL and page or section, or a complete hand
  derivation from explicitly stated coordinates.
- The synthetic inputs, units, frame, latitude policy, quadrant, direction
  construction, contact branch and timing key.
- The intermediate right ascensions, declinations, hour angles and semi-arcs
  used to obtain the expected arc, including signs and branches.
- The expected result and a tolerance justified by the source's precision
  or by the independent arithmetic. Set it before measuring this code.
- The exact tested domain. A finite set of examples establishes agreement
  on those examples, not a global error bound or predictive validity.

Keep short authored derivations and fixtures here. Scripts may write temporary
or large reports to `../generated/`, which is ignored. A numerical claim in
documentation needs a small committed evidence record and a test or script
that reproduces the comparison. Generated reference data must be reproducible
from a committed generator; do not hand-edit it. Bibliographic dates and page
locators identify sources and are not numerical performance claims.

Engine integration checks can demonstrate that we use the engine's values
correctly. They cannot establish independent accuracy by comparing the engine
to itself. [M1](M1.md) validates conventions and [M2](M2.md) checks the engine
adapter. Neither implements an arc calculation or establishes its accuracy.
[M3](M3.md) adds hand-derived hour angles, semi-arcs and quadrant coordinates;
these remain prerequisites for a later directional-arc calculation.
[M4](M4.md) checks direct conjunction arcs to fixed angles against independent
sphere examples. It does not yet implement body directions or directed ages.
[M5](M5.md) checks direct zodiacal conjunctions and ecliptic aspect rays to
body significators under the explicit zero-both projection policy. It adds
independent spherical fixtures and source limits; timing was not part of M5.
[M6](M6.md) checks mundane body conjunctions and aspects with retained bodily
coordinates and explicit direct/converse role exchange against independent
semi-arc examples. [M7](M7.md) checks fixed and birth-day solar-equatorial
timing against independent rational arithmetic and invented solar samples.
The engine sampler's checks establish integration only. [M8](M8.md) checks
complete hit envelopes and separates independent geometry/timing expectations
from natal-snapshot integration. [M9](M9.md) checks bounded finite scans
against an independently enumerated contact table, with separate single-hit
parity, endpoint, deduplication and work-limit checks.
[M10](M10.md) checks the CLI transport and subprocess results against the
existing independent hit and scan references, with separate natal integration
checks. [M11](M11.md) expands analytic geometry, near-tangency and exact timing
evidence, records reproducible residuals, and documents numerical refusals.
Run `npm --prefix directions run evidence` from the repository root to write
the M11 report into the ignored generated directory.
[M12](M12.md) records the completed API, CLI, convention and comparison guides,
their runnable synthetic examples, and final local verification. The new
examples reuse independent M8/M9 expectations only for coordinate geometry;
natal, solar and progression wiring remain separate integration checks.
