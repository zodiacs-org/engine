# Final standalone audit

The source project implements the planned library and CLI. Its supported
behavior is fixed longitude rotation and structured coordinate comparison,
with the engine's original tropical natal envelope attached separately.
[../README.md](../README.md) documents the API and runnable synthetic examples.

## Review and evidence

| Area | Reviewed behavior and evidence |
| --- | --- |
| Arithmetic | Hand-derived invented positions, wraparound, sign annotations and signed circular differences in [../test/ARITHMETIC.md](../test/ARITHMETIC.md), enforced by the rotation, transformation, comparison and text tests. |
| Node selection | True north node by default, explicit mean north node from the engine chart clock, and refusal when the selected node is missing or invalid. The adapter and audit tests check wiring without substituting another node. |
| Houses | Existing natal cusps rotate in sequence; requested and computed systems stay distinct. The availability tests cover absent geometry and polar fallback. The audit test iterates the engine's exported house-system list with both node choices and validates the natal envelopes. |
| Isolation | Pure snapshots do no natal casting or node selection. Only declared scalar node fields enter output, avoiding mutable undeclared metadata. Frozen sources, frozen birth/options/context, nested receipt claims and interleaved time settings are exercised by the audit tests. Existing transformation, comparison and result tests cover independent mutable outputs. |
| Receipts | Engine receipts remain natal and tropical. The result tests check codec round trips, replay input, explicit context and unknown context. Draconic conventions describe this library's derivation outside that receipt. |
| Commands | Both commands support JSON and text, explicit file or standard input, synthetic declarations, node selection, bounded UTF-8 input and separate diagnostic streams. CLI and example tests run the local source runner from outside the checkout. |
| Packaging | [../scripts/audit.mjs](../scripts/audit.mjs) checks nonignored project files, documentation punctuation, the private package flag, the ephemeris pin and exclusion from the engine npm dry run. It disables package scripts and creates no archive. |

The audit found that spreading a caller's node object could copy undeclared
mutable metadata into derived output. The transform now copies only its
declared scalar fields. The regression checks cover both pure APIs, both
node choices, mutable extra data and an undeclared getter that must not run.

All engine comparisons here are wiring and preservation evidence using
invented birth inputs. They establish no independent astronomical accuracy.
The independent arithmetic reference covers only its listed synthetic cases.

## Verification

From `draconic/`, with Node 22 and the local locked dependencies installed:

```sh
npm run typecheck
npm test
node scripts/audit.mjs
```

These checks passed for this final session on the local Node 22.22.2 runtime.
The complete suite includes the audit tests along with the existing arithmetic,
availability, receipt, CLI and example tests. The audit script enforces the
requested file limit on nonignored project files and the documentation
punctuation rule; dependencies, caches and generated output stay ignored.

The engine's `npm run package:contents` was also attempted with its npm cache
inside this project. It stops at missing `dist/calc.d.ts` because this checkout
has no engine build. The successful npm dry-run exclusion check is narrower:
it establishes that `draconic/` is absent from the package file list. Engine
build, size-budget, export, packed-consumer and archive-binding gates are not
claimed as passed. This task prohibits writing the engine build or packing
archives, and leaves git work to the external harness.

## Remaining limits

This remains a private source-checkout project with a local TypeScript loader,
not a published package or built JavaScript library. Source layout, local
tooling and the pinned engine dependency are required. The standalone suite
has no added root CI job; the commands above must be run separately.

Pure transformations accept trusted typed chart objects and validate consumed
coordinates, cusp array completeness and node labels. They do not authenticate
body identities, house construction, node provenance or the chart. Consumed
getters, proxies and iterators remain caller code. The CLI accepts birth input,
not imported position snapshots, and the synthetic declaration remains a
caller assertion. Use invented data only.

Derived positions inherit the natal engine's limits. A fixed rotation adds
no physical accuracy or date coverage. Latitude remains unchanged; house
assignments use the engine's longitude-only helper. Floating-point arithmetic
and that helper's boundary behavior remain in force. Mean selection keeps
the supplied true-node body rows. A selected mean node is identified in
metadata rather than inserted as a replacement body.

The engine receipt describes only the natal chart. It authenticates neither
the supplied provenance nor the derived positions or comparisons. Results
are mutable snapshots, and no draconic import, validation or replay codec is
provided. No interpretation, predictions, derived motion or additional
astrological techniques are supplied. Unknown time still requires a reference
instant and makes no claim across the rest of the date.
