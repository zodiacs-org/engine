# Relocation implementation plan

Work only in `relocation/`. Use the carried engine archive through a relative
file dependency and its public entry points. Keep the engine source, package,
archives and release settings unchanged. Each session completes the next
unchecked milestone, runs its checks, updates this checklist and appends one
line to `CHANGES.txt`. The harness handles git writes and draft PRs.

- [x] M1 Establish an isolated TypeScript project, engine-backed relocated charts, natal envelopes and synthetic Vitest tests.
- [ ] M2 Accept existing engine charts and natal envelopes as sources, preserve requested settings on replay, and test validation and polar fallback semantics.
- [ ] M3 Add geographic bounds, longitude wrapping, antimeridian splitting and bounded grid sampling with explicit work budgets.
- [ ] M4 Define angular-line conventions and add engine-backed planetary equatorial and observer-angle sampling with receipts and undefined-angle handling.
- [ ] M5 Generate bounded MC and IC polylines with sampled metadata and engine receipt references.
- [ ] M6 Generate ASC and DSC horizon polylines, including circumpolar gaps, tangencies and polar cases, without fabricating positions.
- [ ] M7 Extract grid crossings with bounded refinement, structured brackets, residuals and unresolved-cell metadata.
- [ ] M8 Sample great-circle paths and find angular crossings along them, with antipodal and antimeridian handling.
- [ ] M9 Add optional local-space azimuth lines using engine observer angles and bounded spherical geometry.
- [ ] M10 Implement the offline `relocation chart`, `relocation lines` and `relocation grid` CLI with validated JSON input and structured output.
- [ ] M11 Commit small generated golden polyline regression fixtures, their generator and synthetic integration tests; keep large generated outputs ignored.
- [ ] M12 Finish API and CLI documentation, receipt and numerical-limit explanations, end-to-end checks and package-isolation verification.

## Validation policy

Run the relocation typecheck and Vitest suite for every milestone. Add tests
that exercise new behavior, including invalid inputs and resource limits.
Engine parity tests and golden fixtures are regression checks, not independent
accuracy evidence. Cite committed tests for numerical claims in relocation
documentation. Use synthetic births throughout. Store generated grids,
temporary consumers, runtime downloads and caches in ignored directories.
Keep committed files below the user's file-size limit and documentation free
of em dash characters. Do not create archives, publish or run release commands.

## Completed milestone notes

M1 uses `file:../artifacts/zodiacs-engine-1.0.0.tgz` with lockfile integrity.
`relocateChart` accepts resolved engine birth inputs and returns natal and
relocated engine envelopes. It preserves time/settings and uses canonical
input flags so a source polar fallback does not become a destination claim.
Exact destination poles reject explicitly. Existing charts and envelopes as
inputs remain M2 work.

Validation: clean `npm ci --ignore-scripts`, `npm run typecheck` and `npm test`
passed on Node 22.22.2. `test/chart.vitest.ts` has synthetic parity and replay
checks. The explicit `.vitest.ts` pattern keeps this suite out of root Vitest
discovery. Root `npm pack --dry-run --ignore-scripts --json` excluded all
relocation files without creating an archive or building the engine. The
carried engine archive matched its SHA-256 receipt, and relocation file sizes
and documentation punctuation were checked. Engine CI gates requiring a root
install/build were not run; no engine files were changed.
