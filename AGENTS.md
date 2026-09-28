# Instructions for coding agents

This repository holds `@zodiacs/engine`, a TypeScript astrology calculation
package under the MIT License, and a conformance suite for astrology
computation under `conformance/`, dedicated to the public domain under
CC0 1.0. Read `README.md`, `CONTRIBUTING.md`, `LICENSING.md`,
`conformance/README.md` and `conformance/SPEC.md` before changing behaviour.

## Where things are

- Source and unit tests: `src/`, tests beside the code as `*.test.ts`
  (Vitest). Build output goes to `dist/`, which is not committed.
- Package and release scripts: `scripts/` (export smoke test, package
  contents, packed consumer, compatibility checks).
- Release candidates: `artifacts/` (packed archives and SHA-256 receipts),
  `CHANGELOG.md`, and each candidate's evidence in `docs/evidence/`.
- Conformance suite: vectors in `conformance/vectors/`, their generators in
  `conformance/arbiters/`, the harness in `conformance/harness/`, adapters in
  `conformance/adapters/`, committed results in `conformance/results/`.
- Gates: `.github/workflows/ci.yml` and `.github/workflows/conformance.yml`.
  They are the authority on what must pass.

## Commands

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run exports:smoke
npm run package:contents
npm run pack:dry-run

# conformance, after the build, on Node 22.22.2
node --test conformance/harness/selftest.mjs
node conformance/harness/validate.mjs --expect-total 500
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --check conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs --check
```

## Rules

- `artifacts/` holds immutable release archives. Never rewrite, repack,
  replace, rename or delete an archive or its receipt. A change to anything
  the package contains needs a new version before it is packed. Do not
  change `version` in `package.json` or pack an archive unless you were
  asked to cut a candidate.
- Numbers in documentation need committed evidence. Every tolerance,
  agreement figure, count or size you write in `README.md`, `CHANGELOG.md`
  or `docs/` must be backed by a test that enforces it or by a committed
  script and its output under `docs/evidence/`. Name the reference and the
  span it was measured over. Do not round in the engine's favour, extend a
  claim past what was checked, or reuse a figure measured on another build.
- Accuracy expectations come from independent arbiters (JPL Horizons, ERFA,
  the IANA time zone database, IERS data, published definitions, separately
  implemented exact arithmetic), never from this engine's own output. A test
  that pins the engine's output is a regression test; do not present it as
  accuracy evidence.
- No Swiss Ephemeris code, binaries, ephemeris files, tables, fixtures or
  per-case output in the repository, and no vector or test expectation taken
  from it. It may be run as an instrument through
  `conformance/adapters/pyswisseph.py`, recording verdicts and summary
  statistics only (`--values none`).
- Synthetic birth data only, in tests, fixtures, vectors, examples and
  documentation.
- Released conformance vectors never change. A wrong vector is withdrawn and
  replaced under a new id and logged in `conformance/DISCREPANCIES.md`.
  Change a generator, never the vector JSON by hand. Regenerate this
  engine's results (`conformance/results/zodiacs-engine.json`),
  `conformance/RESULTS.md` and `conformance/results/summary.json` with the
  harness (`run.mjs --out` on Node 22.22.2, then `report.mjs`) rather than
  editing them.
- `astronomy-engine` is pinned to one exact version recorded in receipts
  (`EPHEMERIS`). Do not update it as a routine dependency bump.
- Keep new files at the repository root out of the npm package unless they
  are meant to ship. `files` in `package.json` decides what is packed; npm
  also packs `package.json` and any README, LICENSE, LICENCE or COPYING file
  by default. Run `npm run package:contents` after adding files.
- Keep the core entry point free of network requests and import-time side
  effects, and keep `@zodiacs/engine/crossings` and
  `@zodiacs/engine/deltat` free of the ephemeris.
- Write documentation plainly: what the code does, with units, and what was
  measured against what.
