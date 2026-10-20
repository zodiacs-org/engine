# Phase 2 checklist

Work through the milestones in order, completing one per session. Run the full
eval suite and seed validation before marking a milestone complete. The harness
handles commits, pushes and CI. A root CI failure file takes priority.

- [x] P1 Add a dedicated Node 22 workflow that installs from the eval lockfile, runs the complete eval suite and seed validation, and keeps test workers bounded and separate from the root runner.
- [ ] P2 Refresh the eval validator and bundler dependencies without changing the engine's ephemeris pin, verify a clean dependency audit, and rerun the full suite from the refreshed lockfile.
- [ ] P3 Define a versioned reflective-language rubric and deterministic text checker with original passing and failing test cases, explicit penalties, evidence spans and documented detection limits.
- [ ] P4 Include the reflective-language assessment in evaluation reports and CLI summaries, preserving factual scoring and testing supplied readings, extraction and the offline mock end to end.
- [ ] P5 Expand the individually authored MIT seed to cover Sun through Pluto in every sign and each supported major aspect, with complete provenance and tests enforcing coverage, originality metadata and reflective wording.
- [ ] P6 Add original synthetic adversarial readings for invented placements, houses, aspects and dignities, verify each rejection with the scorer, and commit a reproducible aggregate report with a check command used by CI.

Generation and mock reading evaluation remain offline by default; factual
computation uses the local engine. Custom backends remain an explicit caller
choice without saved credentials.
User-facing interpretation stays reflective, with no forecasts or financial
claims. Negative language examples belong only in checker tests, clearly marked
as rejected input. The adversarial report records aggregate engine consistency,
not independent astronomical accuracy or interpretation validity.

Only `evals/` and `.github/workflows/evals.yml` may change. Keep generated files
in ignored directories, each project file below 2 MB, and total worktree disk use
below the brief's 2 GB cap. Check disk use before installs and substantial runs;
stop and record a blocked run here if it would exceed that cap. Use at most
three worker processes. Preserve the completed phase 1 contracts and checks.

P1 validation: installed the eval lockfile with lifecycle scripts disabled on
Node 22, then passed `npm --prefix evals test` and
`npm --prefix evals run validate:seed`. The suite includes package exclusion,
project isolation, loader child-process cleanup and fresh-process repeatability.
The workflow runs these same commands without installing or building the root
package. The root `package:contents` check was attempted with an eval-local cache
and failed on the existing missing `dist/calc.d.ts`; no root build was run.
CI execution remains with the harness. P2 is next.
