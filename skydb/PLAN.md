# Sky database plan

Status: implementation complete. All project changes stay in skydb/. The engine package,
carried archives and release settings stay unchanged. The pull request stays draft.

The generator targets the half-open interval from 1800-01-01T00:00:00Z to
2200-01-01T00:00:00Z. Only small synthetic-time examples are committed.
Comparison with direct engine calls measures database agreement, not independent
astronomical accuracy. Code and documentation use the repository MIT licence;
engine data attribution accompanies the generated sample.

## Milestones

- [x] M1 Record scope, constraints, validation and ordered milestones. Validate the plan and commit it.
- [x] M2 Bootstrap an isolated Node 22 engine consumer with verified archive identity and configuration tests.
- [x] M3 Implement and document a versioned compressed binary tile codec with corruption tests.
- [x] M4 Generate position tiles with longitude, latitude, speed and time-basis boundaries. Test direct-call agreement.
- [x] M5 Detect exact major aspects, sign ingresses, longitude stations and new/full lunations. Test synthetic roots and direct residuals.
- [x] M6 Add resumable generation, atomic writes, locking, checkpoints and SHA-256 manifests. Test interruption and recovery.
- [x] M7 Add a bounded-cache query library, interpolation, event queries and integrity validation. Test wraparound, seams and tile boundaries.
- [x] M8 Add strict command-line tools, verification and reproducible small sample tiles with attribution. Test end-to-end use.
- [x] M9 Add benchmark and agreement scripts with committed outputs and measured scope. Run them on Node 22.
- [x] M10 Harden failure cases, document operations and limitations, run project and applicable repository checks, complete the plan and draft PR checklist.

## Validation

Each implementation milestone runs its relevant Node tests before the harness
commits and pushes. The project suite checks binary round trips, invalid input, engine
agreement, circular interpolation, event residuals, checksum rejection and
resume consistency. Benchmarks record runtime, platform, engine archive hash,
workload and elapsed timings. They make no full-dataset performance claim.
Final checks enforce folder isolation, small committed files, no em dash in
project documentation and exclusion from the engine npm package. Repository
checks that require rebuilding or packing the engine are subject to the explicit
instruction to leave dist/ and the npm package untouched; record that limit.

## Bootstrap validation

The isolated consumer tests pass on Node 22.23.3. Setup verifies the carried
archive and a second setup exercises the lockfile reinstall. The repository
package contents check cannot complete because this checkout has no dist/;
the engine build is excluded by the task constraints. A separate npm dry-run
file-list check verifies that skydb/ is not packed.

## Tile codec validation

The position codec tests and the bootstrap suite pass on Node 22.23.3.
The codec rejects malformed envelopes, corrupt payloads, unsupported versions,
truncation, trailing compressed input and output exceeding the decoding bound.
The wire layout and lossless synthetic-record agreement are enforced by
[test/tile.test.mjs](test/tile.test.mjs). This session completes M3 only.
The npm dry-run file list excludes skydb/. The repository package contents
check still cannot pass because dist/calc.d.ts is absent; rebuilding dist/
is outside the authorized scope. File-size, documentation-character and
whitespace checks pass. No archive or packed source was changed.

## Position generation validation

M4 completes lazy in-memory position generation with clipped tiles, shared
smooth endpoints and separate support samples on each side of time-basis jumps.
The project suite passes on Node 22.23.3, including direct-call agreement in
[test/generate.test.mjs](test/generate.test.mjs). The npm dry-run file list
excludes skydb/. The repository package contents check remains blocked by
missing dist/calc.d.ts; the task prohibits rebuilding dist/. Folder isolation,
file-size, documentation-character and whitespace checks pass. Persistence,
checkpointing and manifests remain M6 work. This session completes M4 only.

## Event detection validation

M5 adds lazy event scans for major aspects, sign ingresses, longitude-speed
stations and new/full longitude lunations, refined by direct engine calls.
The project suite passes on Node 22.23.3, including synthetic roots, retrograde
repeats, wraparound, sampled touches, ownership and time-basis splits in
[test/events.test.mjs](test/events.test.mjs). That test also checks direct
residuals over its synthetic calendar window. Sampling limitations are documented;
this is not a full-coverage completeness or astronomical accuracy claim.
The npm dry-run file list excludes skydb/. The repository package contents
check remains blocked by missing dist/calc.d.ts, and the task prohibits rebuilding
dist/. Folder isolation, file-size, documentation-character and whitespace
checks pass. Event persistence remains M6 work. This session completes M5 only.

## Persistence validation

M6 adds atomic position/event directory publication, exclusive writer locking,
configuration-bound checkpoints and distributed SHA-256 tile receipts.
The project suite passes on Node 22.23.3, including interruption recovery,
unchanged completed resume, stale staging cleanup, checksum rejection and
concurrent-writer rejection in [test/store.test.mjs](test/store.test.mjs).
Resume verifies completed tiles before skipping computation. Process interruption
recovery is supported; power-loss durability and hostile filesystem mutation
are outside the documented contract. This session completes M6 only.
The npm dry-run file list excludes skydb/. Repository checks needing dist/
remain excluded by the task's explicit engine-build prohibition.


## Query validation

M7 adds arithmetic tile lookup, a bounded LRU cache, serialized verified loads,
circular linear position interpolation and streaming filtered event queries.
The full project suite passes on Node 22.23.3, including planner agreement over
the target coverage, direct sample agreement at clock seams and coverage edges,
synthetic wraparound and retrograde interpolation, concurrent cache bounds,
consumer agreement at a synthetic midpoint, and incomplete/corrupt data rejection
in [test/query.test.mjs](test/query.test.mjs). No full-span interpolation error
bound is claimed. This session completes M7 only.
The npm dry-run file list excludes skydb/. The repository package contents
check fails on missing dist/calc.d.ts; rebuilding dist/ is forbidden by the task.
Folder isolation, file-size, documentation-character and whitespace checks pass.


## Command-line and sample validation

M8 adds strict generation, verification, position and streaming event commands,
plus whole-database verification and a reproducible attributed sample.
The full project suite passes on Node 22.23.3, including strict argument errors,
executable exit behavior, generation/resume, event queries and corruption failure
in [test/cli.test.mjs](test/cli.test.mjs). That test regenerates the committed
sample byte for byte and compares every stored position sample to a direct
engine call over the synthetic range in [samples/config.json](samples/config.json).
This measures consumer agreement, not independent astronomical accuracy.
Sample data carries attribution and upstream notices. CLI generation is limited
to a child of ignored generated/; the fixed sample script is the explicit
small-data exception. This session completes M8 only.
The npm dry-run file list excludes skydb/. The repository package contents
check fails on missing dist/calc.d.ts; rebuilding dist/ remains forbidden by
the task. Folder isolation, file-size, documentation-character and whitespace
checks pass. Benchmark work remains M9.


## Benchmark validation

M9 adds reproducible scoped agreement and performance scripts with committed
JSON outputs in [benchmarks/](benchmarks/README.md). Both ran on Node 22.23.3.
Agreement compares decoded support samples exactly with direct engine calls and
records per-body interpolation maxima at interior fractions in short synthetic
windows across centuries, every pinned clock seam and the coverage end.
Performance records fresh generation, verified resume, verification, opening,
queries and storage on its explicit small workload. Neither report supplies
independent astronomical accuracy, event completeness or full-dataset estimates.
The full project suite passes, including evidence shape and maximum selection
checks in [test/benchmarks.test.mjs](test/benchmarks.test.mjs).
The npm dry-run file list excludes skydb/. The repository package contents
check fails on missing dist/calc.d.ts; the task prohibits rebuilding dist/.
Folder isolation, file-size, documentation-character and whitespace checks pass.
This session completes M9 only; operations and final hardening remain M10.


## Final hardening validation

M10 makes resume, query loads and whole-database verification share event schema,
root-bracket, selected-body and sample-cadence checks. Store reads are bounded
before parsing. [test/hardening.test.mjs](test/hardening.test.mjs) rejects invalid
root definitions, duplicates, altered format versions, missing cadence samples,
reordered bodies and oversized files, including content with matching receipts.
The full project suite passes on Node 22.23.3; its output is committed in
[docs/evidence/m10-tests.txt](docs/evidence/m10-tests.txt). The agreement and
performance scripts were rerun after hardening; agreement output remains
byte-identical and performance-output.json records the new scoped run.
[OPERATIONS.md](OPERATIONS.md) documents trial runs, monitoring, cancellation,
resume, stale locks, backups, immutable queries and limitations.

The atlas checker and self-tests pass. Conformance harness self-tests, vector
validation with the repository's expected total and report freshness checks pass.
The project checker passes folder isolation, candidate file-size limits, absence
of em dash in documentation, whitespace and exclusion from npm's dry-run file
list. The repository package contents check fails because dist/calc.d.ts is
absent. Engine typecheck and unit checks lack installed root development tools;
root installation and checks that rebuild, pack or require dist/ were excluded
under the task's explicit folder and engine-build constraints. The full archive
binding/rebuild and packed-consumer gates remain harness/CI work. No engine,
archive, release or root configuration changed. This session completes M10.

## Draft pull request checklist

- [x] Generator, query library, format, tests, attributed small sample and scoped benchmark outputs are present.
- [x] Full dataset, dependencies, caches and temporary databases stay ignored.
- [x] Direct-engine agreement is distinguished from independent accuracy; sampled event completeness and interpolation limits are documented.
- [x] All local project and applicable read-only repository checks are recorded above, including unavailable gates.
- [x] Changes stay inside skydb/ and the engine npm file list excludes them.
- [x] Session summary appended to CHANGES.txt for the harness.
- [x] Git commits, pushes and draft PR updates are left to the harness; merging and release actions remain excluded.
