# Fixed stars

This private source-checkout project is being built according to
[PLAN.md](PLAN.md). The current milestone supplies catalog types and a direct
bridge to the parent engine, with synthetic integration tests. Catalog
positions, contact matching, parans, and the CLI are pending milestones.

Use Node as specified by this folder's package.json. Install and check only
this project from the repository root:

```sh
npm --prefix fixedstars ci
npm --prefix fixedstars run typecheck
npm --prefix fixedstars test
npm --prefix fixedstars run check:isolation
```

The engine is consumed by relative imports from its existing source. This
folder has its own lockfile and pinned ephemeris dependency, resolved locally
by the test configuration and TypeScript paths. Its tests do not need a
parent engine build or installation. The engine's packed files and export
map are unchanged. The bridge uses internal source APIs, so a different
engine checkout must be checked again; this is not a standalone npm package.
The tests use an explicit .fixedstars.ts suffix and local Vitest configuration
to stay outside the parent engine's default test discovery. The isolation
check enforces the file-size and documentation-character constraints and
checks package exclusion with a parent package dry run that skips scripts.

Catalog contracts use degrees for right ascension and declination and
milliarcseconds per Julian year for proper motion. Right-ascension proper
motion includes the cosine of declination. Missing motion is explicit.
Each historical lore tag must carry an author, work, locator, source, and
the label historical-attribution. These tags describe historical beliefs
and do not assert physical or predictive effects.

[GEOMETRY.md](GEOMETRY.md) derives the expectations used in the geometric
tests. Integration tests exercise chart receipts and the existing sky
solver's refusal semantics; they do not measure stellar astrometric accuracy.
The sky custom-vector limitation and receipt distinction are recorded in
PLAN.md for the later adapter milestone.

Original code and documentation use the repository's [MIT licence](../LICENSE).
No external star catalog or lore data has been imported yet. Any imported
data must first have verified redistribution terms and attribution recorded
inside this folder. Generated data and downloads belong in ignored folders.

