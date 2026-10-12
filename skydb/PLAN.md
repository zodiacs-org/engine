# Sky database plan

Status: in progress. All project changes stay in skydb/. The engine package,
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
- [ ] M5 Detect exact major aspects, sign ingresses, longitude stations and new/full lunations. Test synthetic roots and direct residuals.
- [ ] M6 Add resumable generation, atomic writes, locking, checkpoints and SHA-256 manifests. Test interruption and recovery.
- [ ] M7 Add a bounded-cache query library, interpolation, event queries and integrity validation. Test wraparound, seams and tile boundaries.
- [ ] M8 Add strict command-line tools, verification and reproducible small sample tiles with attribution. Test end-to-end use.
- [ ] M9 Add benchmark and agreement scripts with committed outputs and measured scope. Run them on Node 22.
- [ ] M10 Harden failure cases, document operations and limitations, run project and applicable repository checks, complete the plan and draft PR checklist.

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
