# Instructions for coding agents

This repository holds `@zodiacs/engine`, a TypeScript astrology calculation
package (MIT; `MIT AND CC-BY-4.0` as distributed, because it ships CC BY 4.0
ΔT values), a conformance suite for astrology computation under
`conformance/` (CC0 1.0), and a historical time atlas under `atlas/` (data
and documentation CC BY 4.0, tools and schema MIT). Read `README.md`,
`CONTRIBUTING.md`, `LICENSING.md`, `artifacts/README.md`,
`conformance/README.md` and `atlas/README.md` before changing behaviour.

## Where things are

- Source and unit tests: `src/`, with tests beside the code as `*.test.ts`,
  and tests of the scripts as `scripts/*.test.mjs` (Vitest). Build output
  goes to `dist/`, which is not committed.
- Package and release scripts: `scripts/` (export smoke test, package
  contents, packed consumer, archive binding, release archive check,
  compatibility checks).
- Release candidates: `artifacts/` (packed archives, SHA-256 receipts,
  `archives.json`), `CHANGELOG.md`, and each candidate's evidence in
  `docs/evidence/`.
- Conformance suite: vectors in `conformance/vectors/`, their generators in
  `conformance/arbiters/`, the harness in `conformance/harness/`, adapters in
  `conformance/adapters/`, committed results in `conformance/results/`.
- Time atlas: data in `atlas/data/`, schema in `atlas/schema/`, tools in
  `atlas/tools/`, the tzdb comparison in `atlas/tzdb/` and
  `atlas/TZDB-DIFFERENCES.md`.
- Gates: `.github/workflows/ci.yml`, `conformance.yml` and `atlas.yml`. They
  are the authority on what must pass. `release.yml` publishes to npm and is
  run by hand.

## Commands

```sh
# ci.yml, engine job (Node 20, 22 and 24; full history)
npm ci
npm run typecheck
npm test
npm run build
npm run exports:smoke
npm run package:contents
npm run pack:dry-run
node scripts/verify-archive-binding.mjs

# ci.yml, archives job (Node 22; full history)
node scripts/verify-archive-binding.mjs --rebuild-all

# ci.yml, pack job (Node 22), then packed-consumer job (Node 20.19.0, 22.7.0,
# 22 and 24); DIR is an absolute path, and DIR and TMPDIR are outside the
# checkout
npm run build
npm pack --ignore-scripts --pack-destination DIR
node scripts/verify-packed-consumer.mjs DIR/zodiacs-engine-<version>.tgz

# conformance.yml (Node 22.22.2, after the build)
node --test conformance/harness/selftest.mjs
node conformance/harness/validate.mjs --expect-total 500
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --check conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs --check

# atlas.yml (Node 22.22.2, nothing installed)
node atlas/tools/check.mjs
node --test atlas/tools/selftest.mjs
```

Run the archive-binding check with `node`, not `npm run archive:binding`,
from a clone with full history, and with `TMPDIR` outside the checkout and
below no `package.json` or `node_modules`. The package supports Node
`^20.19.0 || >=22.7.0` (`engines`).

## Rules

- Packed files change only with a new candidate. The package holds
  `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `LICENSING.md`,
  `NOTICE` and `dist/`. While the current version's archive is carried, CI
  fails any pull request that changes one of them, or anything that reaches
  `dist/` (code, doc comments, dependency updates that change the build),
  unless it cuts a new candidate. Do not edit them in an ordinary change;
  README and CHANGELOG corrections wait for the next candidate.
  `artifacts/README.md` has the rules and the check's threat model.
- `artifacts/` holds immutable release archives. Never rewrite, repack,
  replace, rename or delete an archive, its receipt, or an entry of
  `archives.json`. Do not change `version` in `package.json` or pack an
  archive unless you were asked to cut a candidate.
- Pull requests are merged with a merge commit, never squashed or rebased:
  `archives.json` records source commits, which a squash or rebase would
  rewrite.
- Do not run the release workflow or publish to npm unless asked. It
  publishes only a carried archive, from `main`.
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
- Atlas rules change only as `atlas/CORRECTIONS.md` describes: a primary
  source that was fetched and read, cited with a URL, a locator and a
  verbatim excerpt of at most 40 words; a new rule version with the change
  recorded, never an edit in place; the atlas checks passing; and
  `node atlas/tools/compare-tzdb.mjs` rerun. Secondary works and tzdb
  comments are leads, not citations. Consult no proprietary atlas.
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
