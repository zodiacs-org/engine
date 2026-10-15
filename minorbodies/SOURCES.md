# Sources and redistribution record

Read on 2026-10-15. M1 contains no downloaded ephemeris samples, fitted
coefficients, external source code or copied documentation. Catalogue
selectors are identifiers, not orbital elements. The code and original
documentation in this directory use the repository's [MIT licence](../LICENSE).

## JPL Horizons numerical data

The selected source is NASA/JPL Solar System Dynamics, Horizons public
numerical output. The project instruction expressly permits JPL/NASA public
data. Use numerical responses and derived coefficients only, with the
request and source identity recorded. Do not copy JPL website prose,
imagery, logos, software or unrelated third-party tables into the package.

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

`tests/catalog.test.ts` enforces this selector catalogue. M2 must validate
the resolved names and identifiers in actual responses before accepting data.

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

## Engine reuse

Relative imports refer to this engine checkout. The current M1 tests import
only `src/crossings.ts` and `src/configured-aspects.ts`, which require no
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
