# Sources and redistribution record

Read on 2026-10-15. M2 adds original JPL Horizons numerical API responses and
request manifests under `tests/fixtures/horizons/`. There are no fitted
coefficients or external source-code copies. The code and original
documentation in this directory use the repository's [MIT licence](../LICENSE);
that declaration does not relicense the retained JPL material.

M3 adds original numerical code and in-memory synthetic analytic tests. It
does not add fitted astronomical data or fetch new Horizons samples.

## Numerical definitions

Read on 2026-10-15: [NIST Digital Library of Mathematical Functions, table
18.9.1](https://dlmf.nist.gov/18.9.T1) for the Chebyshev recurrence, and
[section 3.11(ii)](https://dlmf.nist.gov/3.11.ii) for Clenshaw summation.
`src/chebyshev.ts` is an original implementation, with a full-weight constant
coefficient and an analytically differentiated recurrence. No source code,
coefficient table or website text is copied. These mathematical references
and the independent analytic tests establish numerical definitions, not
astronomical accuracy. The project's MIT licence covers the new code.

## JPL Horizons numerical data

The selected source is NASA/JPL Solar System Dynamics, Horizons public
numerical output. The project instruction expressly permits JPL/NASA public
data. Use numerical responses and derived coefficients only, with the
request and source identity recorded. The retained responses include their
own metadata and standard explanatory legends unchanged so their conventions
can be checked. This is numerical API output, not copied website articles,
imagery, logos, software or unrelated third-party tables.

Primary references:

- [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), sections
  on target selection, time specification and Cartesian vectors. This is
  the authority for coordinate and time semantics.
- [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), query
  parameters and COMMAND selection. The trailing semicolon selects a
  numbered asteroid rather than a major-body identifier.
- [Orbit and ephemeris description](https://ssd.jpl.nasa.gov/orbits_doc.html),
  sections on orbital elements, trajectory solutions and small bodies.
  Source-model uncertainty is distinct from the local approximation error.
- [SSD API fair-use policy](https://ssd-api.jpl.nasa.gov/doc/), requiring
  serialized requests, sensible caching, failure backoff and an identifying
  User-Agent. The generator must check returned API versions.

The intended numbered targets are:

| Body | COMMAND |
| --- | --- |
| Chiron | `2060;` |
| Ceres | `1;` |
| Pallas | `2;` |
| Juno | `3;` |
| Vesta | `4;` |

`tests/catalog.test.ts` enforces this selector catalogue.
`tests/horizons-parser.test.ts` checks the resolved names and identifiers in
the original responses and verifies that substituted targets are rejected.

Do not assert that everything hosted by NASA or JPL is public domain. The
[SSD publication FAQ](https://ssd.jpl.nasa.gov/faq.html#publish) asks about
permission for republication of site information and links to
[JPL's copyright notice](https://www.jpl.nasa.gov/caltechjpl-privacy-policies-and-important-notices/),
which warns that documents may be protected. Those pages do not state a
blanket numerical-data licence. The image-use policy is not a licence for
ephemerides. The data-intake milestone must record the redistribution basis
for the actual numerical material it retains, including any source-specific
notice, without inventing licence text or treating free access as a licence.
Nothing in this package implies JPL endorsement.

## Retained M2 captures

The redistribution basis for these numerical responses is the project's
explicit authorization to use and redistribute JPL/NASA public data. No
additional source-specific redistribution restriction is stated in the
captured responses. This record does not assert a blanket licence for other
content hosted by NASA, JPL or Caltech, or assign an invented SPDX identifier
to the responses. Retain this provenance when redistributing the fixtures.

`tests/fixtures/horizons/{chiron,ceres,pallas,juno,vesta}.json` holds each original
UTF-8 API envelope, including its returned signature and result text. Its
matching `.manifest.json` names the canonical request, URL and every parameter,
retrieval timestamp, raw byte count and digest, generator identifier and
resolved source identity. The initial Chiron, Ceres and Vesta probes were
imported unchanged from locally retained downloads; their recorded retrieval
times are the local file completion times. Pallas and Juno were captured
directly by the client. The request and source hashes are checked by
`scripts/capture-horizons.ts --check` as part of `npm run check`.

The fixture requests all use TT Julian dates 2451545, 2451545.125 and 2451546,
from 2000-01-01 at noon through 2000-01-02 at noon on TT. Their returned frame
is ICRF, their origin is the Earth center, and their vectors have receive
light-time and stellar aberration corrections in au and au/day. These are
source parser fixtures, not fitted data and not a held-out accuracy corpus.
`tests/horizons-parser.test.ts` enforces their request epochs and metadata.
Later fitting and validation must register disjoint epoch sets independently.

The script `scripts/capture-horizons.ts --capture` reproduces the requests and
reuses validated cache entries. A new live retrieval can change the orbit
solution, provider timestamps and raw digest. Exact replay uses the original
bytes, verified by `--replay` with their committed digests. Generated downloads,
candidate fixtures and caches stay ignored; only the compact reviewed source
fixtures and their request manifests are retained here.

## Engine reuse

Relative imports refer to this engine checkout. The synthetic engine-contract
tests import only `src/crossings.ts` and `src/configured-aspects.ts`, which require no
planetary ephemeris. They test integration with invented motions and rows.
Later source-level reuse is identified in [DESIGN.md](DESIGN.md).

The engine's [LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE) remain
authoritative for its dependencies and data. In particular, reusing or
bundling its time basis does not remove the attribution obligations on
its delta-T table. This companion's MIT code declaration does not relicense
the engine's MIT AND CC-BY-4.0 distribution. A future standalone build must
retain the notices for what it includes.

## Independent validation

Horizons samples at epochs excluded from training and tuning are the planned
reference. Capture original values with request parameters and hashes;
never synthesize expected astronomical values from this package. A separate
ERFA-based reduction is planned for frame validation. Record its exact
implementation version and licence before adding that reference tool.

Swiss Ephemeris code, binaries, tables, fixtures and per-case output are
excluded. No AGPL or commercial ephemeris data is an input. All examples
and event test instants are synthetic and unrelated to anyone's birth data.
