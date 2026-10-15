# Independent apsis reference registration

Registered in M2 before implementing the apsides search or comparing it with
an independent ephemeris. [plan.json](plan.json) is the machine-readable
record of cases, targets, acceptance limits and numerical settings. Its
digest is bound into every fixture and [manifest.json](manifest.json).
Changing the registration after a comparison requires a new version, a
reason and new held-out cases. A failed limit stays recorded as a failure.

## Selection and held-out boundary

The cases are fixed Gregorian calendar windows interpreted on TT. They were
chosen without engine output or expected event counts. Every signed
range-rate change detected on the registered grid is retained, even when
perturbations produce an unexpected turn. The development grids and their
window endpoints are stored in the fixtures. They establish sampled
coverage only; two turns between successive samples can remain unseen.

Every target has disjoint development and held-out windows. M2 collects
only development cases. The collector refuses held-out case IDs; neither
their reference data nor their engine outputs are used for tuning. M10
will explicitly enable their collection after the search is fixed. The
held-out grid is finer than its target's development grid, but still does
not mathematically prove completeness. Missing or additional events fail
validation even if the paired events meet their time and distance limits.

Pluto's development window is 1805-01-01 to 1900-01-01 TT; its held-out
window is 1900-01-01 to 2195-01-01 TT. Its perihelion is reserved for the
held-out evaluation. The same Pluto event must not appear in both splits
to manufacture separate coverage of both kinds. These windows are enforced
by `test/references.vitest.ts`, not a claim about an orbital period.

Physical-center checks for Mars through Pluto are also reserved. Their
epochs and target IDs are in `physicalCenterChecks`; they compare physical
center and system barycenter values without replacing one with the other.
These spot checks cannot establish physical-center event timing accuracy.

## Acceptance budgets

These are project acceptance targets, fixed before comparison, not measured
errors, confidence intervals, or accuracy statements from JPL. The time
allowances widen for shallow, slowly varying distance curves; they do not
follow from a position error divided by total orbital speed. The collector
does not import the engine or judge these limits. M4, M5 and M10 will measure
whether the implementation meets them on the named cases.

| Body | Event time, seconds | Distance, km | Radial speed, km/s | Total speed, km/s |
| --- | ---: | ---: | ---: | ---: |
| Moon | 120 | 30 | 0.001 | 0.001 |
| Mercury | 1200 | 5000 | 0.005 | 0.005 |
| Venus | 21600 | 5000 | 0.005 | 0.005 |
| Earth | 3600 | 5000 | 0.005 | 0.005 |
| Mars | 7200 | 10000 | 0.005 | 0.005 |
| Jupiter | 86400 | 100000 | 0.01 | 0.01 |
| Saturn | 172800 | 200000 | 0.01 | 0.01 |
| Uranus | 604800 | 300000 | 0.01 | 0.01 |
| Neptune | 2592000 | 500000 | 0.01 | 0.01 |
| Pluto | 604800 | 100000 | 0.005 | 0.005 |

`test/references.vitest.ts` pins these values and the registered windows.
The limits apply only to the targets and centers in `plan.json`. Record
distance error at the reference instant separately from distance error at
the engine's own event; compare signed radial and total speeds at the same
TT instant. Pair events by body, kind and chronological order within their
reference neighborhoods. Report unmatched events and ambiguous matches.

The apsides solver's numerical interval target is 1 second, separately from
the physical event-time allowance. Reference root brackets must also be no
wider than 1 second. Their midpoint is at most half that bracket from a
root, conditional on continuity and the witnessed sign change. This is
numerical localization within the named Horizons solution. The vector
table does not supply the physical ephemeris uncertainty, and printed
digits do not establish it. No kilometre uncertainty for the reference
model is asserted. Retain full scalar/vector precision in the fixture.

## Reference method and reproducibility

`scripts/collect-references.mjs` contains a reference calculation separate
from the planned golden-section search. It uses only Horizons samples:

1. Sample the exact TT grid in `plan.json`, including both endpoints.
2. Find adjacent negative-to-positive range rates for a minimum and
   positive-to-negative rates for a maximum. Refuse sampled exact zeros
   rather than silently classifying a flat curve or tangency.
3. Subdivide each bracket into eight equal parts and query its interior.
   Require exactly one sign change of the original kind. Continue until
   the interval is at most 1 second, refusing after twelve rounds.
4. Sample the final midpoint directly. Also query before and after it at
   one eighth of the registered grid spacing. Require the matching signed
   rates and strict distance inequalities at these wider probes.
5. Preserve the endpoint states, midpoint state, wider probes and their
   request identities. Compute total speed from the reference velocity
   norm. The independent expectation is the final bracket midpoint, not
   an engine prediction or a fitted orbital element.

The bracket uses range rate because distance changes can round away on
shallow outer-planet curves. The wider distance probes check the turn but
do not improve the final time bracket. No interpolation error is hidden in
the midpoint distance: it is queried directly. The exact-zero and ambiguous
bracket refusals mean this collector must not silently serve as a complete
reference for arbitrary windows or targets.

From `apsides/`, with Node 22.22.2 and curl available:

```sh
node scripts/collect-references.mjs --case dev-moon-2000
node scripts/collect-references.mjs --case dev-moon-2000 --offline --freeze
npm run check
```

Use the other development IDs in `plan.json` to reproduce their fixtures.
After freezing all of them, `node scripts/collect-references.mjs --manifest`
creates or verifies the same manifest bytes without network access. It
refuses to replace a different existing manifest.
Ordinary collection writes only `.generated/references/`. Raw downloaded
responses and request metadata stay in `.cache/horizons-v1/`. Successful
cache identities are immutable and their digests are checked before reuse.
Offline mode performs no networking. `--freeze` creates the compact fixture
once or verifies identical bytes; it refuses a different existing file.
Exact offline regeneration requires the original raw cache. A fresh
checkout can verify the committed compact fixtures offline with the tests,
but must download references to regenerate them. The compact corpus omits
intermediate refinement states and cannot recreate absent response bytes.

Live requests run sequentially. Failed requests are not cached and the
command stops, so the caller can wait before retrying. Long time-list
requests returned HTTP 502. Before collecting fixtures, the transport
batch was reduced to 32 epochs, which allowed collection to complete.
The source-integrity tests enforce that batch limit on every retained
request. No case, grid, budget or expected value was changed in response
to engine output.

The committed extracts contain numerical samples and identifiers, not
provider prose. Every request records its URL, parameters, retrieval time,
response digest and returned solution metadata. The fixture manifest binds
the compact bytes. A response digest can be checked against an available
raw cache; it cannot authenticate an absent response from the extract
alone. A later live query may use a revised JPL solution or have different
header bytes. Never overwrite the frozen corpus with such a response.

These fixtures locate strictly interior extrema. An exact zero at either
window endpoint is refused, including at the future search API's inclusive
end. Boundary and partition tests belong to M4 and M6; the current collector
does not claim to validate those semantics. Printed JD rounding contributes
at most the parser's `2e-9` day matching allowance per endpoint, separate
from the reported numerical bracket width; that allowance is enforced in
`test/horizons-io.vitest.ts` and is not a physical timing uncertainty.

M2 tests verify source conventions, sample geometry, bracket signs,
registration identity and offline integrity. They do not compare the engine
with these references and make no measured astronomical accuracy claim.
