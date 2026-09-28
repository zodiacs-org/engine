# Contributing

Contributions are welcome: fixes, tests, documentation corrections, new
calculations, reports of wrong results, and corrections to the conformance
suite. This file covers setting up, the checks every change must pass, the
rules the repository follows, and the licences contributions are accepted
under.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.
Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Setting up

You need Node.js and npm. CI tests the Node versions in the matrix of
`.github/workflows/ci.yml`. The conformance job pins Node 22.22.2 because
the time zone vectors read the runtime's ICU data; use that version when you
regenerate conformance results.

```sh
npm ci
npm test
npm run build
```

`npm test` runs the unit tests (Vitest, `src/**/*.test.ts`). `npm run build`
writes `dist/`, which the export, package and conformance checks read.

## Checks every change must pass

`ci.yml` and `conformance.yml` in `.github/workflows/` run on every pull
request to `main`, and a change must pass both. Run their steps locally
before you open one. If this list and a workflow disagree, the workflow is
right.

`ci.yml`, on each Node version in its matrix:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run exports:smoke      # every entry point resolves and exports what it should
npm run package:contents   # the packed file list and its size
npm run pack:dry-run
```

`conformance.yml`, on Node 22.22.2:

```sh
npm ci
npm run build
node --test conformance/harness/selftest.mjs
node conformance/harness/validate.mjs --expect-total 500
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --check conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs --check
```

The same workflow rebuilds the vector files from their sources with the
Python libraries it pins (`conformance/arbiters/l1/build.py`, `l2/build.py`
and `l3/build.py`; the L3 generator downloads tzdata and tzcode from IANA
and checks their digests) and fails unless the rebuilt files are
byte-identical to the committed ones.

`codeql.yml` scans the code on pull requests, on `main` and weekly;
`scorecard.yml` checks the repository's security practices on `main` and
weekly. Their findings appear under the Security tab.

If a change moves one of this engine's conformance verdicts, the `--check`
step fails. Regenerate the results and the report on Node 22.22.2 in the
same pull request, and say which vectors changed and why:

```sh
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --out conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs
```

Update `conformance/results/zodiacs-engine.notes.md` if what it says is no
longer true.

## Rules the repository follows

**Independent references.** Accuracy is checked against sources independent
of this engine: public JPL Horizons vectors, ERFA, the IANA time zone
database, IERS data, published definitions, or exact arithmetic implemented
separately. A test that pins the engine's own output guards against
regressions; it is not evidence of accuracy. Every conformance vector names
its arbiter and a tolerance fixed before any engine was run against it
([conformance/SPEC.md](conformance/SPEC.md)).

**No Swiss Ephemeris code, data or output.** Swiss Ephemeris may be run as a
comparison instrument, as `conformance/adapters/pyswisseph.py` runs a
separately installed pyswisseph, but only verdicts, returned flags and
summary statistics are committed (`--values none`). Its source, binaries,
ephemeris files, tables, generated fixtures and per-case output never enter
the repository, and no test expectation or vector comes from it.
[LICENSING.md](LICENSING.md) records the exclusion; bringing any Swiss
Ephemeris material into the package would reopen that licensing decision.

**Synthetic birth data only.** Tests, fixtures, vectors, examples and
documentation use invented instants and places. None may describe a real
person's birth. Issues are public, so use invented details there too.

**Evidence for every number.** A number in `README.md`, `CHANGELOG.md` or
`docs/` (a tolerance, an agreement with a reference, a count, a size) needs
committed evidence: a test that enforces it, or the script and its output
under `docs/evidence/`. Say what it was measured against and over what span.
A figure measured on one build is not carried over to another.

**Released vectors never change.** A conformance vector is not edited once
it is released under a suite version. A vector found to be wrong is
withdrawn and replaced under a new id in the next suite version, and the
decision is logged in
[conformance/DISCREPANCIES.md](conformance/DISCREPANCIES.md). The vector
files are generated: change the generator in `conformance/arbiters/`, not
the JSON.

**Carried archives are immutable.** `artifacts/` holds the packed archive of
each release candidate with its SHA-256 receipt. An archive is never
repacked, replaced or removed, and a change to anything the package contains
needs a new version before it is packed. Leave `version` in `package.json`
and the contents of `artifacts/` alone unless you are cutting a candidate.

**The ephemeris dependency is pinned.** `astronomy-engine` is pinned to one
exact version, which receipts record (`EPHEMERIS` in `src/types.ts`) and a
test checks against the installed copy. Changing it can move every position,
so it is an engine change with its own candidate and evidence, not a routine
dependency update.

**Data needs a licence.** New data must be licensed for redistribution.
Record its source and licence in `LICENSING.md` and its attribution in
`NOTICE`, as for the ΔT table (CC BY 4.0). The npm package carries no place
or time zone database.

**What the package ships.** `files` in `package.json` decides what is packed,
and `npm run package:contents` checks the result. A new file at the
repository root, such as this one, is not packed unless `files` lists it or
npm packs it by default (`package.json` and any README, LICENSE, LICENCE or
COPYING file). The core entry point makes no network request and has no
import-time side effects; `@zodiacs/engine/crossings` and
`@zodiacs/engine/deltat` import no ephemeris. `@zodiacs/engine/internal` and
`@zodiacs/engine/internal/math` exist for zodiacs.org and carry no
semantic-versioning guarantee.

**Plain documentation.** Say what the code does, with units, and what was
measured against what. No promotional language.

## Reporting a wrong result or a conformance discrepancy

- **A value this engine computes that looks wrong**: use the "Wrong result"
  issue form. It asks for the engine version, the call and its input, the
  output or receipt, and the value you expected with its independent source.
  Many disagreements between programs come from conventions (zodiac, frame,
  node, ΔT, house system), so name the ones your source uses; the README
  states the engine's.
- **A conformance vector whose expected value, tolerance or arbiter you
  believe is wrong**: use the "Conformance discrepancy" form.
  [conformance/DISCREPANCIES.md](conformance/DISCREPANCIES.md) describes what
  happens next: each report is confirmed, clarified or rejected, and the
  decision is logged with its reasoning. Report the vector rather than
  sending a pull request that edits it.
- **Anything else**: the "Bug" form.

## Pull requests

- Keep each pull request to one change, with tests for the behaviour it adds
  or fixes.
- Say what changes for users of the package, and point to the evidence for
  any new number.
- Commit generated output with its source: rebuilt vectors with the
  generator change, regenerated conformance results with the engine change
  that moved them.

## Licences

Code and documentation outside `conformance/` are under the MIT License
([LICENSE](LICENSE)), except third-party material, which keeps its own
licence: the data recorded in [LICENSING.md](LICENSING.md) and
[NOTICE](NOTICE), and the Contributor Covenant text of the code of conduct
(CC BY 4.0). The conformance suite under `conformance/` (its vectors,
harness, adapters and generators) is dedicated to the public domain under
CC0 1.0 ([conformance/LICENSE](conformance/LICENSE)).

By opening a pull request you agree that your contribution is licensed the
same way: under the MIT License outside `conformance/`, and under CC0 1.0
inside it. You also confirm that you have the right to license it so. Do not
submit material copied from a source whose licence does not allow this,
Swiss Ephemeris included.
