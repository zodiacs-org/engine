# Contributing

Contributions are welcome: fixes, tests, documentation corrections, new
calculations, reports of wrong results, and corrections to the conformance
suite and the time atlas. This file covers setting up, the checks every
change must pass, the rules the repository follows, how releases are
published, and the licences contributions are accepted under.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.
Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Setting up

The package runs on Node.js 20.19.0 or a later 20.x, and on 22.7.0 or later
(`"engines": { "node": "^20.19.0 || >=22.7.0" }` in `package.json`). CI runs
the engine on Node 20, 22 and 24. The conformance and atlas workflows pin
Node 22.22.2: the time zone vectors read the runtime's ICU data, and the
atlas files were checked with that version. Use it when you regenerate
conformance results.

```sh
npm ci
npm test
npm run build
```

`npm test` runs the unit tests with Vitest (`src/**/*.test.ts` and
`scripts/*.test.mjs`). `npm run build` writes `dist/`, which the export,
package and conformance checks read.

## Checks every change must pass

Three workflows in `.github/workflows/` run on every pull request to `main`,
and a change must pass all of them: `ci.yml`, `conformance.yml` and
`atlas.yml`. Run their steps locally before you open a pull request. If this
list and a workflow disagree, the workflow is right.

`ci.yml` has four jobs:

- **Engine**, on Node 20, 22 and 24, with full history:

  ```sh
  npm ci
  npm run typecheck
  npm test
  npm run build
  npm run exports:smoke      # every entry point resolves and exports what it should
  npm run package:contents   # the packed files, each entry point's size budget and the total cap
  npm run pack:dry-run
  node scripts/verify-archive-binding.mjs
  ```

  The last step is the archive-binding check (see *Packed files change only
  with a new candidate* below). It reads git objects, so it needs a clone
  with full history, and `TMPDIR` must name a directory outside the checkout
  with no `package.json` or `node_modules` at or above it. Start it with
  `node`, not `npm run archive:binding`, which reads the checkout's `.npmrc`
  first.
- **Archives**, on Node 22, with full history: `npm ci`, then
  `node scripts/verify-archive-binding.mjs --rebuild-all`, which also
  rebuilds every carried archive from its source commit.
- **Pack**, on Node 22: `npm ci`, `npm run build`, and
  `npm pack --ignore-scripts` into a temporary directory. The next job
  installs that archive.
- **Packed consumer**, on Node 20.19.0, 22.7.0, 22 and 24:
  `node scripts/verify-packed-consumer.mjs` with the archive's absolute path,
  and `TMPDIR` outside the checkout. It installs the archive in a clean
  consumer and exercises it. 20.19.0 and 22.7.0 are the lowest versions the
  `engines` range admits.

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

Its second job, the generators, rebuilds the vector files from their sources
with the Python libraries it pins (`conformance/arbiters/l1/build.py`,
`l2/build.py` and `l3/build.py`; the L3 generator downloads tzdata and tzcode
from IANA and checks their digests) and fails unless the rebuilt files are
byte-identical to the committed ones.

`atlas.yml`, on Node 22.22.2, with nothing installed:

```sh
node atlas/tools/check.mjs
node --test atlas/tools/selftest.mjs
```

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

**Birth data is synthetic by default.** Tests, fixtures, vectors, examples
and documentation use invented instants and places. The one exception is a
worked example from a published source about a person who has died, cited
where it is used with its author, title, year and page, so that the test
checks the engine against the published result. A living person's birth data
is never used, published or not. Issues are public, so use invented details
there too.

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
each release candidate with its SHA-256 receipt, and
`artifacts/archives.json` records each archive's digest, size, file count and
the commit it was packed from. An archive is never repacked, replaced or
removed: a version string names one byte sequence.
[artifacts/README.md](artifacts/README.md) gives the rules in full, what the
archive-binding check protects against and what it does not.

**Packed files change only with a new candidate.** The package holds
`package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `LICENSING.md`,
`NOTICE` and the build output in `dist/`. While the current version's archive
is carried, CI rebuilds it from the pull request and fails on any changed
byte, unless the pull request cuts a new candidate. A change to one of those
files, or to anything that reaches `dist/` (code; doc comments, which reach
the `.d.ts` files; dependency updates that change the build), therefore
waits for the next candidate. So do corrections to the README and the
changelog. Leave `version` in `package.json` and the contents of `artifacts/`
alone unless you are cutting a candidate.

**Merge commits only.** Pull requests are merged with a merge commit, never
squashed or rebased. `artifacts/archives.json` records the commit each
archive was packed from; a squash or rebase would rewrite that commit, and
the archive-binding check would fail.

**The ephemeris dependency is pinned.** `astronomy-engine` is pinned to one
exact version, which receipts record (`EPHEMERIS` in `src/types.ts`) and a
test checks against the installed copy. Changing it can move every position,
so it is an engine change with its own candidate and evidence, not a routine
dependency update.

**Data needs a licence.** New data must be licensed for redistribution. For
data the package ships, record its source and licence in `LICENSING.md` and
its attribution in `NOTICE`, as for the ΔT table (CC BY 4.0); for the atlas,
in `atlas/LICENSING.md`. The npm package carries no place database. From
0.1.1-rc.15 it carries zone histories before 1970, compiled from tzdata 2025c,
the leap-second list and UT1 − UTC values of IERS, a table of Gregorian
adoption dates from public-domain sources, and the Vedic ayanamsas' star
values; `LICENSING.md` and `NOTICE` record their sources. Cite each row of a
table like the adoption dates to its source, and test it against a fixture
that quotes the source. `src/tzdb/` and `src/time-scale-data.ts` are
generated by `scripts/build-tz-shards.mjs` and `scripts/build-time-scales.mjs`
from pinned inputs whose digests they check: regenerate them, and never edit
them by hand (`docs/time.md`).

**What the package ships.** `files` in `package.json` decides what is packed,
and `npm run package:contents` checks the result. A new file at the
repository root, such as this one, is not packed unless `files` lists it or
npm packs it by default (`package.json` and any README, LICENSE, LICENCE or
COPYING file). `conformance/` and `atlas/` are not packed. The core entry
point makes no network request and has no import-time side effects;
`@zodiacs/engine/crossings` and `@zodiacs/engine/deltat` import no ephemeris.
`@zodiacs/engine/timing`, `@zodiacs/engine/vedic`, `@zodiacs/engine/geo` and
`@zodiacs/engine/sky` are opt-in: the root imports none of them, and
`npm run exports:smoke` fails if its static graph reaches one of their
modules or a zone history.
`@zodiacs/engine/internal` and `@zodiacs/engine/internal/math` exist for
zodiacs.org and carry no semantic-versioning guarantee.

**Size budgets.** `npm run package:contents` gives each entry point in
`package.json` `exports` a budget for its import graph, the JavaScript a plain
import of it loads (`scripts/verify-package-contents.mjs` states each with its
reason); the zone histories have a budget of their own, 200,000 bytes in
exactly 16 files; and the whole package a stated cap. A new entry point needs
a budget, or the check fails. A budget or the cap is raised only in a
candidate whose `CHANGELOG.md` says so, with the reason; never in passing.

**Plain documentation.** Say what the code does, with units, and what was
measured against what. No promotional language.

## Reporting results, discrepancies and atlas corrections

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
- **A correction or addition to the time atlas**: use the "Atlas correction"
  form or open a pull request, as
  [atlas/CORRECTIONS.md](atlas/CORRECTIONS.md) describes. A correction is
  accepted only with a citation to a primary source that meets the rules in
  [atlas/README.md](atlas/README.md): a law or decree, an official gazette, a
  municipal notice or council record, a contemporary newspaper report, or a
  railway notice or timetable, with a stable URL, a page and column locator
  and a short verbatim excerpt in the original language. Secondary works,
  tzdb comments, websites and proprietary atlases are accepted only as leads.
  A reviewer fetches the source and reads the passage. If it supports the
  change, the rule gets a new version with the change recorded (a rule is
  never edited in place), the atlas checks pass,
  `node atlas/tools/compare-tzdb.mjs` is rerun, and the correction is logged
  in `atlas/CORRECTIONS.md`.
- **Anything else**: the "Bug" form.

## Pull requests

- Keep each pull request to one change, with tests for the behaviour it adds
  or fixes.
- Say what changes for users of the package, and point to the evidence for
  any new number.
- Commit generated output with its source: rebuilt vectors with the
  generator change, regenerated conformance results with the engine change
  that moved them, and the regenerated tzdb comparison
  (`atlas/tzdb/differences.json`, `atlas/TZDB-DIFFERENCES.md`) with the atlas
  change.

## Releases

A maintainer cuts each release candidate: a commit that sets the new version
in `package.json` and describes it in `CHANGELOG.md`; the archive packed from
that commit and its SHA-256 receipt, added to `artifacts/` with an entry in
`artifacts/archives.json` and a row in `artifacts/README.md`; and the
candidate's evidence under `docs/evidence/`. The archive rules are in
[artifacts/README.md](artifacts/README.md).

A carried candidate is published to npm by the Release workflow,
`.github/workflows/release.yml`. A maintainer runs it by hand from `main`
(Actions, Release, Run workflow) with two inputs: `version`, the carried
version to publish (for example `0.1.1-rc.14`), and `tag`, the npm dist-tag
(`next` by default). It has two jobs, both on Node 24 and on the same commit:

1. **Verify**, which cannot publish. It checks out `main` with full history
   and runs `node scripts/verify-release-archive.mjs <version>`: there must
   be exactly one carried entry for the version in `artifacts/archives.json`,
   and the archive's size and SHA-256 must match it and its `.sha256`
   receipt. Then it runs `npm ci` and `node scripts/verify-archive-binding.mjs`.
2. **Publish**, in the `npm` environment with `id-token: write`. It checks
   that npm is 11.5.1 or later, repeats the archive check, refuses a version
   that is already on npm, and runs
   `npm publish <absolute path to the archive> --access public --tag <tag> --provenance`.
   It installs nothing, so no dependency's code runs where a publish token
   can be obtained.

npm publishes the carried file as it is, so the tarball on npm is byte for
byte the archive in `artifacts/`. It authenticates through trusted
publishing: npm exchanges the job's OIDC token for a short-lived publish
token, and no npm token is stored in the repository. `--provenance` makes
the provenance attestation, which links the package to this repository,
workflow and commit, a requirement: if it cannot be made, the publication
fails.

The workflow relies on two settings outside the repository:

- **npm**: the trusted publisher of `@zodiacs/engine` names the repository
  `zodiacs-org/engine`, the workflow `release.yml` and the environment
  `npm`, and allows `npm publish`. A trusted publisher created after
  3 September 2026 allows only `npm stage publish` unless direct publishing
  is also selected.
- **GitHub**: the `npm` environment exists before the first run (a job that
  names a missing environment creates it without any rules) and allows
  deployments from `main` only. npm does not check the branch, and a manual
  run uses the workflow file of the branch it is started on, so this rule is
  what stops a changed copy of the workflow on another branch from
  publishing. Required reviewers on the environment put a second person in
  front of every publication.

The first publication, 0.1.1-rc.14, is made by hand. Later candidates go
through the workflow.

## Licences

Code and documentation outside `conformance/` and `atlas/` are under the MIT
License ([LICENSE](LICENSE)), except third-party material, which keeps its
own licence: the data recorded in [LICENSING.md](LICENSING.md) and
[NOTICE](NOTICE), and the Contributor Covenant text of the code of conduct
(CC BY 4.0). Because the package ships the ΔT table values, which are
CC BY 4.0, the package as distributed is `MIT AND CC-BY-4.0`.

The conformance suite under `conformance/` (its vectors, harness, adapters
and generators) is dedicated to the public domain under CC0 1.0
([conformance/LICENSE](conformance/LICENSE)).

The time atlas under `atlas/` has two licences
([atlas/LICENSING.md](atlas/LICENSING.md)): its data, its documentation and
the comparison files generated from the data (`atlas/tzdb/differences.json`
and `atlas/TZDB-DIFFERENCES.md`) are CC BY 4.0
([atlas/LICENSE](atlas/LICENSE)); its tools and its schema are MIT.

By opening a pull request you agree that your contribution is licensed the
same way: under the MIT License for code and documentation outside
`conformance/` and `atlas/` and for the atlas's tools and schema, under
CC0 1.0 inside `conformance/`, and under CC BY 4.0 for the atlas's data,
documentation and generated comparison files. You also confirm that you have
the right to license it so. Do not submit material copied from a source
whose licence does not allow this, Swiss Ephemeris and proprietary atlases
included.
