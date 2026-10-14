# Harmonics and Uranian dials plan

Work only in `harmonics/`. Keep the engine sources, package metadata, build
output and carried archives unchanged. Each session implements the next
unchecked milestone, runs its checks, marks it complete and appends a line to
`CHANGES.txt`. The harness handles git writes and the draft pull request.

- [x] M1 Set up an isolated private TypeScript project and Vitest runner; implement pure harmonic longitude charts with validated named points, a configurable harmonic ceiling and hand-derived arithmetic tests.
- [x] M2 Add an engine chart adapter using relative source imports, reuse natal chart casting and the natal receipt creator, preserve the original receipt and chart flags, and keep unknown point speeds absent.
- [ ] M3 Add harmonic aspect detection using the engine's configured aspect policy and matcher, with explicit orb units and per-harmonic scaling; test custom angles, wraparound and inclusive boundaries.
- [ ] M4 Reuse `src/techniques/aspect-patterns.ts` for supported harmonic aspect patterns, documenting its fixed major-aspect limits and refusing unsupported pattern policies rather than inventing graph results.
- [ ] M5 Implement harmonic strength spectra with a documented deterministic scoring formula, configurable harmonic selection and weights, pair contributions and hand-derived ranking tests.
- [ ] M6 Implement Uranian dial projections for the requested 90, 45 and 22.5 degree circles, preserving full source longitudes and testing circular distances and seam contacts.
- [ ] M7 Implement canonical planetary pictures and A+B-C sensitive points with configurable contact orbs, explicit repeated-member rules and arithmetic tests.
- [ ] M8 Implement midpoint-tree listings by calling `src/points.ts` midpoint helpers, covering both axes, antipodal ties, dial contacts, ordering and deduplication.
- [ ] M9 Add the offline `harmonics chart` CLI with strict JSON input validation, synthetic fixture examples, structured JSON output and receipts for chart calls.
- [ ] M10 Add `harmonics spectrum` and `harmonics dial` CLI commands, shared option parsing, configurable analysis settings and command integration tests.
- [ ] M11 Document the library and CLI contracts, units, scoring choices, midpoint conventions, receipt scope and limitations; cite tests for numerical examples and keep all fixtures synthetic and small.
- [ ] M12 Run project typechecking and Vitest integration checks, verify package exclusion and repository isolation, review deterministic outputs and record remaining limitations with reproducible validation commands.

## Reuse boundaries

Read engine modules through relative source imports without rebuilding
`dist/`. Reuse `src/signs.ts` for longitude normalization, chart casting and
`src/receipt.ts` for chart provenance, `src/configured-aspects.ts` for
configurable aspect matching, `src/techniques/aspect-patterns.ts` for its
supported patterns, and `src/points.ts` for midpoints. Do not implement an
ephemeris, house system, replacement aspect matcher or midpoint formula.

The pure longitude API operates on supplied data and claims no engine
receipt. An adapter that casts a chart must carry the engine's original
receipt alongside the derived harmonic or dial analysis. Harmonic positions
are longitude transforms, not newly computed astronomical positions.

## Validation and storage

Use synthetic named points and invented birth inputs. Derive arithmetic
expectations independently in test comments and documentation; do not pin
prior program output as an accuracy reference. Keep package tooling and its
lockfile inside this folder. Ignore dependencies, caches, coverage and bulk
generated data locally, and keep committed files below the requested size
limit. Never invoke git writes, publishing or release workflows.

## M1 validation

Project typechecking and Vitest passed on Node 22.22.2 with `npm run check`.
The engine's `npm pack --dry-run --json --ignore-scripts` manifest contains
no `harmonics/` paths. The root `npm run package:contents` command could not
finish because this checkout has no `dist/` and it requires `dist/calc.d.ts`.
The engine build was not run, in accordance with this project's restriction
on writing `dist/`. The next session starts at M2.

## M2 validation

Added the separate `./engine` source entry with `castChart` and
`castHarmonicChart`. The adapter retains the natal envelope and flags, optionally
includes engine angles and chart points, and scales only known source speeds.
It uses relative engine imports with the ephemeris dependency pinned and
resolved inside this project.

On Node 22.22.2, a clean `npm ci` followed by `npm run check` passed. The
hand-derived arithmetic and adapter delegation checks are in
`test/engine.test.ts`; they check transform correctness and receipt scope,
not ephemeris accuracy. `git diff --check` passed. All changed and untracked
files are inside `harmonics/`, below the requested file size limit, with no
em dash in documentation.

With a writable npm cache inside `harmonics/.cache/`, the root engine's
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project.
No archive was created. `npm run package:contents` still fails because this
checkout has no `dist/calc.d.ts`; no engine build or root dependency installation
was performed. The next session starts at M3.
