# Draconic chart project plan

All implementation, tests, documentation and local tooling stay in `draconic/`.
The engine, its packed files and release archives stay unchanged. Each session
completes the next unchecked milestone, runs its checks, ticks it here and adds
a line to `CHANGES.txt`. Git operations belong to the external harness.

- [x] M1 Create an isolated private TypeScript project, implement a pure longitude rotation primitive with input validation, and document hand-derived synthetic arithmetic with Vitest coverage.
- [x] M2 Add an engine adapter using relative source imports for natal casting and true or mean north-node selection, preserving engine input settings and flags.
- [ ] M3 Implement the pure chart transformation for bodies, angles and existing house cusps, refresh position annotations, and reuse engine house helpers without recasting rotated houses.
- [ ] M4 Cover absent coordinates, unknown birth time, requested versus computed house systems and polar fallback with synthetic integration tests.
- [ ] M5 Implement structured natal tropical versus draconic comparisons with explicit circular delta units and boundary conventions, without interpretation.
- [ ] M6 Attach engine natal receipts and separate draconic convention metadata, preserving time basis and provenance without claiming the engine issued a draconic receipt.
- [ ] M7 Add the `draconic chart` CLI with strict arguments, synthetic JSON input, explicit mean-node selection, JSON output and useful errors.
- [ ] M8 Add `draconic compare`, plain text rendering for both commands and CLI subprocess tests covering exit codes and output streams.
- [ ] M9 Add small synthetic examples and usage documentation for the library and CLI, citing the arithmetic tests for every numerical example and describing scope and limits.
- [ ] M10 Audit validation, mutation isolation, receipts and package exclusion; run the complete standalone checks and record the final supported behavior and remaining limits.

## Conventions and implementation constraints

Subtract the selected natal north-node longitude from each natal longitude and
reduce it into the canonical circle. True north node is the default; mean north
node is an explicit option. Read both from the engine's public chart APIs.
Rotate existing natal bodies, angles and cusps together. In particular, do not
construct new whole-sign cusps from the rotated ascendant. Retain the original
natal receipt separately from the derived result and state the chosen node,
its natal longitude, rotation formula, units and house convention.

Use hand-derived exact arithmetic on invented charts for rotation expectations.
Engine integration comparisons establish wiring and preservation, not independent
astronomical accuracy. Use no interpretation, predictions, personal birth data,
Swiss Ephemeris material, paid APIs or secrets. Do not add progressions,
directions, harmonics, relocation, returns or an HTTP chart API.

## Standalone verification

Keep dependencies and generated output local and ignored. Use the local package's
Vitest and TypeScript commands on Node 22. Check the engine package's file list
without rebuilding or writing its `dist/`. The repository package-content check
requires an existing engine build; if absent, record that limitation and verify
that an npm dry run with scripts disabled excludes `draconic/`.

## M1 session verification

`npm run typecheck` and `npm test` passed in this folder on Node 22.22.2.
The runtime was provisioned inside the ignored `.cache/npm` folder because
the system Node is an earlier major version. The dependency lockfile is local
to this project; installation used scripts disabled.

An engine `npm pack --dry-run --json --ignore-scripts` report was checked to
exclude every path starting with `draconic/`. It wrote no archive.
`npm run package:contents` could not complete: the existing checkout has no
engine `dist/`, so the check reported missing `dist/calc.d.ts`. The engine was
not built because this task prohibits writing its `dist/`. No files outside
`draconic/` were changed. M2 is next.

## M2 session verification

Added `castNatal` with the engine's true north node as the default and explicit
mean north-node selection through `chartPoints(natal)`. The returned natal
chart retains engine settings, canonical flags, time basis and deltaT metadata.
Node options reject unsupported values and unknown keys. Synthetic integration
tests check both node paths, supported input scales with pinned deltaT,
canonical flags, caller-input isolation and propagated engine validation.
These comparisons establish adapter wiring, not astronomical accuracy.

`npm run typecheck` and `npm test` passed in this folder on Node 22.22.2.
The local dependency installation used scripts disabled. Vitest and TypeScript
resolve the engine's pinned ephemeris from this folder without a root install.
The engine npm dry run with scripts disabled excludes `draconic/` and wrote
no archive. `npm run package:contents` again stops at missing `dist/calc.d.ts`;
the engine build remains absent and was not generated. All session changes
are inside `draconic/`. M3 is next.
