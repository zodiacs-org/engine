# Arabic lunar mansions

This checkout-local project is being developed as a library and CLI for
Arabic lunar mansions (manazil al-qamar) on top of `@zodiacs/engine`.
[PLAN.md](PLAN.md) records the implementation milestones. The first boundary
table is available; classification and CLI commands are not implemented yet.

[src/tables.ts](src/tables.ts) exports the immutable `EQUAL28_ARIES_V1`
table and `getBoundaryTable("equal28-aries-v1")`. Table selection requires
the full versioned identifier. It divides longitude equally from Aries in
the explicitly selected zodiac, using exact rational boundaries. The
tropical zero is the vernal equinox of date. Traditional names follow
al-Biruni, translated by Sachau, with documented editorial Arabic spellings
and Latin transliterations. [SOURCES.md](SOURCES.md) records the definition,
source locators, naming variants and public domain provenance. The table
does not represent the current positions or unequal extents of star groups.

The current internal adapter in [src/engine.ts](src/engine.ts) reads the
engine's tropical geocentric Moon position on the true ecliptic of date and
retains its unmodified calculation receipt. Invalid dates throw the engine's
`RangeError`; unsupported coverage returns the engine's typed refusal. The
adapter does not calculate an ephemeris itself.

Use Node.js 22 from this directory:

```sh
cd mansions
npm ci --ignore-scripts
npm run check
```

Dependencies and the lockfile are local to this private project. Engine
source is imported by relative path. TypeScript and Vitest resolve the
engine's pinned `astronomy-engine` dependency from this directory, so no
root dependency installation or root build is needed. Vitest uses the
engine's ESM dependency entry. Future runtime tooling must use the same
local dependency resolution.

The tests check integration, receipt replay, validation, and hand-derived
synthetic motion through the existing crossing solver. Engine-to-engine
comparisons are regression checks, not independent astronomical accuracy
evidence. The solver's endpoint convention is `(from, to]`. Its numerical
resolution does not establish physical accuracy or search completeness.
The table tests check exact boundary arithmetic and the naming witness;
longitude classification and any usable independently published mansion
ingress samples will be checked in later milestones.

`npm run check:isolation` checks the project file constraints and an engine
package dry-run with lifecycle scripts disabled. It asserts that no file
under `mansions/` enters that package. It creates no archive and does not
run the full engine package-content gate, which requires an existing engine
build. Generated files and caches belong in `.generated/` or `.cache/`,
both ignored here. No generated data is committed.

New code and documentation here use the repository's [MIT license](../LICENSE).
The engine keeps its own [licensing and attribution](../LICENSING.md),
including the CC BY attribution for its delta-T data. This project does not
relicense the engine or redistribute its source as a new package. Table
provenance and third-party source terms are recorded in
[SOURCES.md](SOURCES.md).

The planned output contains astronomical facts only, in time order, with
explicit table selection and engine receipts. It contains no auspicious or
inauspicious labels, date ranking, predictions, weather or travel advice.
