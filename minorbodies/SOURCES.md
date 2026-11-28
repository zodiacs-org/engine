# Sources and redistribution record

Read on 2026-10-15. M2 adds original JPL Horizons numerical API responses and
request manifests under `tests/fixtures/horizons/`. There are no committed fitted
coefficients or external source-code copies. The code and original
documentation in this directory use the repository's [MIT licence](LICENSE);
that declaration does not relicense the retained JPL material.
The final dependency and inherited-data record is in [LICENSING.md](LICENSING.md),
with attribution in [NOTICE](NOTICE). Keep these records together when moving
the source checkout and its offline data.

M3 adds original numerical code and in-memory synthetic analytic tests. It
does not add fitted astronomical data or fetch new Horizons samples.

M4 adds original Chiron pilot responses under `tests/fixtures/pilot/`.
Derived coefficients and independent reduced references remain in ignored
`generated/`. The numerical-data redistribution basis below also applies
to this new corpus.

M5 adds a compact original File API fixture under
`tests/fixtures/horizons-file/`, frozen request manifests under
`data/manifests/` and `data/speed-manifests/`, and coefficient digest receipts
under `data/receipts/`. Bulk original responses and coefficients remain
ignored. The same numerical-data redistribution basis applies; no new
external source-code copy or ephemeris dependency was introduced.

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
The pilot reuses the engine's date parser, time basis and frame matrices as
identified in [DESIGN.md](DESIGN.md). It copies no planetary ephemeris.
The companion installs the same pinned `astronomy-engine@2.1.19` for type
resolution; the pilot's frame and time evaluation does not call its planetary
functions. Explicit dataset loading hashes the evaluator and bridge's local
source imports, including the parent engine files, into each receipt.
The later body adapter also needs that installed dependency at runtime when
it delegates ordinary-body calculations to engine calc. Its location under
`devDependencies` describes this private development package, not a promise
that delegated calculations run without it.

The engine's [LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE) remain
authoritative for its dependencies and data. In particular, reusing or
bundling its time basis does not remove the attribution obligations on
its delta-T table. This companion's MIT code declaration does not relicense
the engine's MIT AND CC-BY-4.0 distribution. A future standalone build must
retain the notices for what it includes.

## Independent validation

The M4 pilot uses Horizons samples excluded from training and tuning.
`tests/fixtures/pilot/manifest.json` records every request, raw digest,
retrieval time and source identity. It names Chiron solution `JPL#171`,
Earth `DE441`, perturbers `SB441-N16` and EOP `eop.261014.p270110`.
`src/pilot-sources.ts` checks those identities across all original responses;
`scripts/generate-pilot.ts` verifies them before any fit. These identifiers
are the captured source's claims, not claims of present-day JPL currency.
See `docs/evidence/M4.md` for the comparison scope and enforcing tests.

The separate `scripts/reference-erfa.py` uses PyERFA 2.0.1.5, its ERFA 2.0.1
library and SOFA heritage identifier 20231011, and NumPy 2.2.6. The script
checks those versions, and `scripts/requirements-reference.txt` pins the
installed Python packages. Its matrix is `rx(obl06 + nut06a.deps, pnm06a)`.
It rotates already corrected ICRF vectors only, without adding light time,
aberration or deflection. It imports neither this package's fitter nor the
engine. `tests/reference-erfa.test.py` also compares the frame construction
with ERFA's separate mean-ecliptic matrix plus nutation in longitude.

Primary implementation documentation read on 2026-10-15:

- [ERFA pnm06a](https://github.com/liberfa/erfa/blob/v2.0.1/src/pnm06a.c),
  TT bias, precession and nutation into the true equator and equinox of date.
- [ERFA nut06a](https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c),
  IAU 2000A nutation with the IAU 2006 adjustments.
- [ERFA obl06](https://github.com/liberfa/erfa/blob/v2.0.1/src/obl06.c),
  mean obliquity, and [rx](https://github.com/liberfa/erfa/blob/v2.0.1/src/rx.c),
  the rotation convention.
- [ERFA ecm06](https://github.com/liberfa/erfa/blob/v2.0.1/src/ecm06.c),
  transformation of free ICRS vectors, independent of their origin and
  astrometric corrections.

[PyERFA](https://github.com/liberfa/pyerfa/blob/v2.0.1.5/LICENSE.rst) and
[NumPy](https://github.com/numpy/numpy/blob/v2.2.6/LICENSE.txt) use BSD
three-clause licences; [ERFA's licence](https://github.com/liberfa/erfa/blob/v2.0.1/LICENSE)
is BSD-style with SOFA attribution. Their sources and binaries are installed
only under ignored `.cache/`, with their own notices. No library source or
binary is committed. The original reference script is MIT. Validation
records its script/requirements hashes and actual library versions.

Swiss Ephemeris code, binaries, tables, fixtures and per-case output are
excluded. No AGPL or commercial ephemeris data is an input. All examples
and event test instants are synthetic and unrelated to anyone's birth data.

## M5 File API and full-range provenance

Read on 2026-10-15: the
[Horizons File API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons_file.html)
specifies multipart POST input to the File API endpoint and requires checking
the returned API signature. This avoids the pilot GET transport's URL length
constraint while preserving its requested geocentric ICRF, TT and LT+S
conventions. The original Ceres fixture's `.manifest.json` contains the
exact submitted input, retrieval time, response digest and actual signature.
The File API's observed `1.0` signature is distinct from the GET fixtures'
observed `1.2`; neither is silently admitted as the other at intake.

Each full-range body manifest records its complete captured solution
identity, including orbit epoch and state, target solution, Earth solution,
perturber solution and EOP file. Every batch must agree with that identity.
The supplemental speed-reference manifest must also agree with the same
body's original full-range identity. Both corpora are public JPL numerical
responses with the same standard explanatory legends as the retained
fixtures; no additional source-specific redistribution restriction was
stated in them. The project's explicit authorization for JPL/NASA public
numerical data remains the redistribution basis described above.

The source manifests bind exact reconstructed requests and original bytes,
not an immutable remote download URL. Keep the original ignored capture
caches for offline replay. New live captures can have different timestamps,
numerical bytes or orbit solutions; they require new manifests and evidence.
The preserved original short-stencil failure and supplemental reference
method are described in [DESIGN.md](DESIGN.md#m5-reference-speed-correction).
Both use original Horizons positions and the same separately installed ERFA
reference, never this companion's prior numerical output as truth.

## M6 adapter reuse

M6 introduces original adapter code and integration tests only. It fetches
no new ephemeris data and vendors no additional implementation. Ordinary
bodies call this checkout's `src/calc.ts`; longitude callbacks use the
`src/crossings.ts` contract; aspect rows feed `src/configured-aspects.ts`.
The input translation reuses `src/date-input.ts` and `src/time-scale.ts`.
The engine notices and licensing obligations described above still apply.

The pinned companion dependency supplies the engine's existing
`astronomy-engine` import during native execution and Vitest. Engine calc
keeps its own ephemeris receipt and approximation descriptions. The
companion records both provider implementations when combining aspect rows;
it does not claim Horizons LT+S and engine calc are the same algorithm.

The adapter tests reuse the retained pilot's independent Horizons/ERFA
corpus. Comparisons with direct engine calc or the loaded minor-body evaluator
are integration checks, not new independent accuracy evidence. The real
pilot crossing test derives its target from computed positions and likewise
establishes only callback integration. Independent event references remain
part of the later search and final-validation milestones.

## M7 station reference sources

`tests/fixtures/stations/` retains original Horizons File API responses inside
their exact request/capture records. Each body's manifest pins the complete
capture bytes, recipe and generator source hashes. The numerical-data
redistribution basis above applies unchanged. No new external code, binary,
ephemeris file or dependency is committed. The File API documentation and
SSD serialized-use policy linked above were read again for this intake.

`scripts/capture-station-reference.ts` selects epochs only from its fixed
scan and from sign changes in independently reduced Horizons positions.
`src/station-reference.ts` rejects overlap with either the pilot or full-range
training epochs, requires the fitted dataset's original source identity,
and uses the separately installed ERFA reducer described above. It does not
call a fitted evaluator, a body adapter or a package event search. Source
velocity columns do not establish the expected station signs or times.

The original scan and refinement responses remain unchanged in these source
fixtures; derived ERFA rows and reference reports remain ignored. Exact replay
is offline. A fresh live capture can change source bytes or orbit identity
and is not treated as a replacement for retained evidence. The recipe's
initial training-epoch collision and the revised scan phase are retained in
code and explained in [M7 station reference evidence](docs/evidence/M7-station-reference.md).

## M9 ingress reference sources

`tests/fixtures/ingresses/` holds original Horizons File API captures and their
request manifests for sign-boundary refinement and reference-speed stencils.
The initial scan reuses the unchanged original M7 station captures. Every new
capture must have the same complete source identity as the fitted body's
frozen full-range dataset and, for Chiron, the pilot. Their redistribution
basis is the project's explicit authorization for JPL/NASA public numerical
data described above. No additional external source code or ephemeris is
introduced. The retained API envelopes keep their original explanatory legends.

`scripts/capture-ingress-reference.ts` uses `src/ingress-reference.ts` to select
reference epochs from independently ERFA-reduced original Horizons positions.
It never uses fitted positions or this package's ingress output to choose an
epoch or expected event. The existing training-exclusion checks cover every
requested epoch. Each body's manifest pins the recipe, generator files and
runtime, exact capture bytes and digests. The capture script writes proposed
sources and derived reports only under ignored `generated/`; replay verifies
the retained fixtures offline. New live bytes cannot replace frozen evidence
without a separate review.

The reference reduction and derivative implementation retain the previously
recorded ERFA and NumPy versions, licensing and notices. Numerical comparison
scope and enforcing tests are recorded in [M9 evidence](docs/evidence/M9.md).
Invented analytic trajectories independently test wraparound and close pairs
near a station; they are mathematical test cases, not additional JPL samples
or evidence of astronomical completeness.

## M11 final reference sources

The final position and event corpora use the same Horizons File API, TT,
geocentric ICRF and LT+S conventions as the fitted sources. The File API
documentation and Horizons manual linked above were read again for this intake.
Every response must retain the frozen fitted body's complete solution identity.
The numerical-data redistribution basis and dependency notices above apply
unchanged; no new external implementation or ephemeris dependency is introduced.

`data/final-manifests/` binds the registered requests, original response hashes,
retrieval metadata and source-generator identity. Original captures remain in
ignored `.cache/horizons-final/`. `src/final-recipe.ts` selects reference epochs
without reading fitted values; its complete derivative stencils are excluded
from training and kept inside individual responses. `scripts/capture-final.ts`
writes proposed manifests under `generated/final-sources/`. The offline validator
requires the committed manifest's exact original response bytes.

`data/final-event-manifests/` pins each named original capture under ignored
`generated/final-events/`. The separate `.cache/horizons-final-events/` also
retains each File API cache record. `scripts/capture-final-events.ts` records
the recipe and generator identity; reference refinement uses only original
Horizons positions through the independent ERFA reduction. Neither fitted
positions nor the companion's event searches choose expected event times.
Replay checks all source digests, exact reconstructed requests, training
exclusion and source identities. Missing files fail instead of skipping checks.

Derived reference rows and comparison reports remain ignored. The evidence
notes name the actual comparison scope, gates, failures and enforcing tests
in [M11 evidence](docs/evidence/M11.md). Reusing original captures is required
for exact replay; live recapture remains a proposed new dataset, even when
the request parameters have not changed.
