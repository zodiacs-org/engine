# Local verification and evidence

Activate the Node runtime required by [package.json](package.json), then run
from the repository root:

```sh
npm --prefix fixedstars ci
npm --prefix fixedstars run verify
```

The verifier uses its own Node executable for each child and prepends that
executable's directory to the child PATH, including for npm's package dry run.
It stops on the first failed check. It prints the runtime and digests of the
local lockfile and engine sky contract. It writes no build or result file;
the isolation dry run may populate fixedstars/.cache/npm. Dependency
installation can contact npm; the subsequent checks use installed dependencies
and committed source inputs without fetching astrometry or historical texts.

The final session's output is committed in
[docs/evidence/m12-verification.txt](docs/evidence/m12-verification.txt).
It records checks of this checkout on its stated runtime. These are local
construction, consistency and integration results, without a physical stellar
accuracy measurement, independent catalog validation, or a full parent CI run.

| Individual command from the repository root | What it establishes |
| --- | --- |
| npm --prefix fixedstars run typecheck | Source and test types, with no emitted files |
| npm --prefix fixedstars test | Synthetic geometry, arithmetic, integration and executable CLI contracts |
| npm --prefix fixedstars run check:docs | Local inline Markdown link targets and headings; README TypeScript snippets type-checked and executed in memory |
| npm --prefix fixedstars run catalog:check | Byte-identical regeneration from the committed selected HYG rows |
| node fixedstars/scripts/build-sky-adapter.mjs | Verified source digests and graph; unchanged engine solver compiled with scoped vector substitution |
| npm --prefix fixedstars run check:isolation | Authored file limits, documentation character rule and exclusion from the parent's npm package dry run |

The documentation checker treats each README TypeScript fence as a separate
module at the fixedstars root, using this folder's TypeScript settings and
pinned ephemeris. It emits no virtual files or bundles. Running an example
proves that the documented call is usable; it does not establish expected
stellar positions or a physical accuracy bound. The CLI suite separately
launches the real executable from outside the checkout and checks its JSON
transport, input failures and exit codes. External documentation links are
not fetched by the offline documentation checker.

## Evidence map

[GEOMETRY.md](GEOMETRY.md) documents derivations and comparison tolerances
beside each test family. Numerical tolerances apply only to the specified
constructed inputs or named independent fixture epochs. They must not be
extended into catalog error bounds or observational guarantees.

| Subject | Committed check and derivation | Reference and scope |
| --- | --- | --- |
| Engine source bridge | [engine tests](tests/engine.fixedstars.ts), [basis geometry](GEOMETRY.md#geometric-test-derivations) | Cartesian identities, published epoch obliquity and synthetic receipt/clock integration |
| Source identities and licences | [source tests](tests/sources.fixedstars.mjs), [source records](sources/README.md) | Pinned fetched sources, licence decisions and short printed lore passages; source identity rather than astrometric accuracy |
| Catalog selection and conversion | [catalog tests](tests/catalog.fixedstars.mjs), [bias and tangent derivations](GEOMETRY.md#catalog-direction-and-proper-motion-conversion) | Full committed selection, raw HYG rows and constructed rotations; published first-order bias signs |
| Motion and chart frames | [position tests](tests/positions.fixedstars.ts), [motion derivations](GEOMETRY.md#motion-from-j2000-and-true-of-date-positions) | Hand-derived tangents; independent parent ERFA rotation fixture at its committed TT epochs |
| Conjunctions and parallels | [contact tests](tests/contacts.fixedstars.ts), [contact geometry](GEOMETRY.md#pure-contact-geometry) | Constructed circles and signed declinations; independent integer representation of binary64 values |
| Natal bodies, angles and receipts | [natal tests](tests/natal.fixedstars.ts), [target derivations](GEOMETRY.md#natal-target-geometry-and-receipt-assembly) | Cardinal geometry and independent ERFA obliquity; synthetic native-chart and envelope integration |
| Scoped solver substitution | [vector tests](tests/sky-vector.fixedstars.ts), [adapter tests](tests/sky-adapter.fixedstars.mjs), [solver construction](GEOMETRY.md#scoped-sky-vector-proof) | Spherical identities, source-contract refusal, scope restoration and native-body comparisons |
| Prepared sky searches | [sky tests](tests/sky.fixedstars.ts), [horizontal geometry](GEOMETRY.md#prepared-sky-events-refraction-and-circumpolar-geometry) | Constructed equatorial and polar observers, refraction conventions, flags, budgets and call records |
| Paran pairing | [paran tests](tests/parans.fixedstars.ts), [simultaneous geometry](GEOMETRY.md#paran-time-arithmetic-and-simultaneous-angularity) | Hand-authored event schedules, BigInt time differences and simultaneous angular-phase constructions |
| CLI behavior | [CLI tests](tests/cli.fixedstars.ts), [transport geometry](GEOMETRY.md#cli-geometric-and-transport-checks) | Synthetic charts and observer windows; half-circle and full-window product expectations |
| Singularities and boundaries | [edge tests](tests/edge-geometry.fixedstars.ts), [edge derivations](GEOMETRY.md#coordinate-singularities-grazing-horizons-and-event-endpoints) | Pole/seam motion, independent moving-vector ERFA checks, missing angles, constructed grazing crossings and exact event-window membership |

Independent ERFA fixture comparisons use the existing parent
src/fixtures/nutation-erfa.json and its recorded generator, without changing
or copying that fixture. Native engine-output comparisons establish wiring
and regression behavior. Geometric inversions used to construct synthetic
contacts establish that construction; they are not independent observations
of real stars. No test expectation is taken from Swiss Ephemeris.

## Source revalidation and maintenance

For an explicit network revalidation, outside the offline verify command:

```sh
node fixedstars/scripts/audit-sources.mjs --check
npm --prefix fixedstars run catalog:fetch
```

The audit streams pinned resources into digests and discards them. catalog:fetch
verifies the whole remote HYG digest before writing the selected rows and
regenerating this folder's catalog. It checks the committed subset against
the remote stream. Offline regeneration alone cannot detect a selected raw
row edited after extraction. These commands must retain the existing licence
notices and do not establish physical astrometric accuracy.

To revise the catalog, edit sources/selection.json or the generator and
regenerate with catalog:build, then run verify. Retain a licence and source
locator for each astrometric input and a justified scope for each historical
attribution. Unsupported historical identifications stay omitted. Do not
edit generated coordinates by hand or import a bulk catalog into the tree.

To consume a changed engine checkout, review its solver, point-body slot,
frame and clock helpers before intentionally updating the local sky source
contract. Preparation refuses unexpected bytes or a changed source graph;
there is no automatic contract refresh. Rerun all local checks after review.
The catalog, source bridge and original documentation remain separate from
the engine's packed files and release process.

## Isolation and parent checks

All authored work stays under fixedstars/. The local isolation check enforces
the user's file limit and prohibition of em dash characters in documentation;
it rejects authored symbolic links and checks the parent package dry run with
scripts disabled. Dependencies, caches, generated tables and coverage belong
in the folders ignored by [the local ignore file](.gitignore).

The parent package-contents gate requires dist/ declarations and JavaScript.
Those files are absent in this checkout, so the gate fails on a missing
dist/calc.d.ts. Its final attempted output is retained in
[docs/evidence/m12-package-contents.txt](docs/evidence/m12-package-contents.txt).
Building the engine here would exceed the task's explicit boundary. The local
dry run establishes that fixedstars is excluded; it does not establish the
parent import-graph budgets or archive binding. Build, packed-consumer,
conformance and archive checks that require an engine build are not claimed
as passed. The repository workflows remain the authority for parent CI.
