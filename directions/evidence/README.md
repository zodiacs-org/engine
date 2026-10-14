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
independent spherical fixtures and source limits; timing remains unimplemented.
[M6](M6.md) checks mundane body conjunctions and aspects with retained bodily
coordinates and explicit direct/converse role exchange against independent
semi-arc examples. Timing and complete hit envelopes remain unimplemented.
