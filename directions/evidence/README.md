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
to itself. The first milestone implements no arc calculation and claims no
numerical agreement.
