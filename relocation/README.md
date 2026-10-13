# Relocation workbench

This isolated project uses the carried engine archive through a relative file
dependency. It does not rebuild the engine. Install dependencies from this
directory with `npm ci --ignore-scripts`, then run `npm run typecheck` and
`npm test`. Use Node from the package's declared runtime range.

`src/index.ts` exports `relocateChart(source, destination)` and the
`RelocationSource` type. Supply an engine `BirthInput` with an already resolved
instant, a full engine `Chart`, or a `NatalEnvelope` from the engine's receipt
API. Parse JSON text with the engine's `parseNatalEnvelope` first; this function
accepts the decoded envelope object. Supply a destination containing `latitude`
and `longitude` in geographic degrees. Longitude is east-positive.
The returned `natal` and `relocated` fields are full envelopes created by the
engine's receipt API. Each contains its result, conventions, time basis,
engine identity, requested house system, actual house system and flags.

Relocation preserves the instant, time scale, pinned delta-T and time-known
setting. It changes the geographic coordinates and asks the engine to
recompute the chart. Planetary positions remain geocentric. Local wall times
must be resolved before calling this API. Unknown-time charts keep absent
angles and houses. Polar fallback is the engine's own result; exact geographic
poles are rejected because a rising direction is undefined there.

Existing charts are captured with `createNatalEnvelope`. Existing envelopes
are validated and copied through the engine codec, including its data and
size limits. Incomplete or inconsistent chart and envelope records throw the
engine's `NatalEnvelopeError`; invalid births or destinations throw
`RangeError`. Result snapshots belong to the caller and do not share mutable
data with the source.

The engine's `natalReplayInput` supplies the destination request. It preserves
the requested house system, even when the source used polar whole-sign fallback,
and carries only input flags rather than derived result flags. Source results,
engine labels, provenance, original reference convention and extensions stay
in `natal`. They are structurally checked claims, not authenticated facts. The
destination always uses the installed engine and gets a fresh receipt. That
receipt retains captured source-instant spelling but does not copy birthplace
time-resolution context, source artifact claims or extensions. An unknown-time
destination records the supplied instant without asserting destination noon.

The synthetic cases in `test/chart.vitest.ts` check equality with direct engine
calls, replay, polar fallback, antimeridian endpoints and input ownership.
`test/source.vitest.ts` also checks source replay, ownership, polar Placidus and
Koch requests, malformed records and the engine codec's import limits.
They are regression checks, not independent accuracy evidence. Receipt
labels describe the calculation and do not authenticate its physical accuracy.
The remaining geometry and CLI work is listed in `PLAN.md`.

Code and documentation here use the repository's MIT license. The engine is
distributed under MIT AND CC-BY-4.0; retain its LICENSE, LICENSING.md and
NOTICE when redistributing it or its attributed data. Generated grids and
temporary files belong in the ignored `generated/` and `.cache/` directories.
