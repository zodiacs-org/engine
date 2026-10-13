# Interpretation dataset and reading evaluations

Work proceeds through the unchecked milestones in order. Each session completes
one or two milestones, runs their checks, marks them here, and appends a line to
`CHANGES.txt`. The harness handles all git writes and draft pull requests.

All project files stay under `evals/`. The engine source, packaged metadata,
release archives and root build output stay unchanged. Generated datasets and
reports belong in ignored directories. Examples use invented chart inputs only.
Original interpretation prose is licensed explicitly; no external interpretation
text or Swiss Ephemeris material is imported.

The factual reference is the local engine under recorded chart conventions.
Agreement with that reference measures reading consistency, not independent
astronomical accuracy or the validity of personality or predictive claims.

- [x] M1 Establish an isolated offline Node project, a versioned JSON Schema for factor-to-meaning entries, a local validator, and schema contract tests.
- [x] M2 Add a small original seed dataset covering placements, aspects, houses and sign dignities, with provenance, licensing and dataset-level integrity checks.
- [x] M3 Add a local engine adapter that computes synthetic chart facts, records conventions and version provenance, and handles unavailable houses and polar fallback.
- [x] M4 Define the reading and factual-claim schemas, preserving quoted spans and unsupported or ambiguous assertions without silently treating them as correct.
- [x] M5 Define a pluggable generation backend with a deterministic offline mock, explicit backend selection, bounded requests and no saved credentials.
- [x] M6 Implement the interpretation generator with versioned prompts, input/output validation, provenance, reproducible manifests and ignored output files.
- [x] M7 Write a versioned scoring rubric for factual correctness, coverage, contradictions and abstentions, separating interpretive quality from computable facts.
- [x] M8 Implement deterministic placement, aspect, house and dignity scoring with per-claim evidence, category totals and explicit denominators.
- [x] M9 Add an offline reading evaluation CLI that combines synthetic cases, engine facts, supplied or mock readings and machine-readable reports.
- [x] M10 Add a conservative prose claim extractor and tests for negation, ambiguity, duplicate claims and omitted facts; expose extraction limits in reports.
- [ ] M11 Add adversarial and end-to-end tests covering malformed model output, invented factors, unavailable birth time, conflicting conventions and output limits.
- [ ] M12 Document reproducible local workflows, backend extension, seed review and result interpretation; run the complete eval suite and package-isolation checks.

M1 acceptance: the schema requires typed factors, interpretation scope,
provenance and license metadata; tests reject malformed and incomplete entries;
validation needs no model or network call after local dependencies are installed.
Later milestones add dataset semantics and engine-backed scoring, with focused
tests alongside each implementation. No generated interpretation corpus or model
reading is committed.

M1 validation: `npm --prefix evals test` passed using Node 22 after an offline
`npm ci --prefix evals`. The tests verify package exclusion using npm's dry-run
inventory with scripts disabled. The root `npm run package:contents` was also
attempted and failed because this checkout has no `dist/calc.d.ts`; the engine
was not built because this task prohibits changes to root build output. All
session changes are under `evals/`.

M2 acceptance: `data/seed.json` contains individually composed original meanings
with explicit AI authorship, symbolic scope and MIT attribution. The dataset
schema and CLI enforce entry validation, unique ids and closed, acyclic source
references. Seed mode additionally checks authored provenance, factor coverage,
all supported sign dignity labels and canonical factor uniqueness. General
datasets permit sourced variants of the same factor. No generated corpus is
committed, and the checks make no factual accuracy or human-review claim.

M2 validation: `npm --prefix evals test` and `npm --prefix evals run validate:seed`
passed on Node 22.23.3. Dataset and CLI tests cover invalid records, provenance
cycles, forward references, reversed aspect pairs, separate house systems,
Mercury's separate sign dignities, byte and entry limits, and input preservation.
The package-exclusion test passed. The root `npm run package:contents` gate was
attempted again and failed on missing `dist/calc.d.ts`; no root build was run
because this task prohibits modifying `dist/`. Changes remain under `evals/`.

M3 acceptance: the synthetic-case schema and `computeChartFacts` adapter compute
placement, natal aspect, cusp-house and classical sign-dignity factors through
public local engine entry points. Results retain the supplied reference instant,
missing-house reasons, requested and actual systems, polar fallback, all applicable
sign-dignity labels, time basis and coverage flags. Immutable envelopes record
engine, ephemeris, bundler and runtime versions with computation-bundle and
adapter digests. The loader uses pinned eval-local dependencies and ignored
temporary files, without writing root build output or making network requests.

M3 validation: a clean offline `npm ci --prefix evals --ignore-scripts`,
`npm --prefix evals test`, and `npm --prefix evals run validate:seed` passed on
Node 22.23.3. Adapter and loader tests check public-API consistency, the house
systems in the schema, polar fallback in either hemisphere, unavailable houses,
Mercury's paired labels, time scales and pinned Delta T, rejected input, immutable
metadata, JSON round trips and repeatability across processes and working
directories. These are engine-consistency checks, not independent accuracy
evidence. Package-exclusion and project-isolation tests passed. The root
`npm run package:contents` gate was attempted and failed on missing
`dist/calc.d.ts`; the prohibited root build was not run. All changes stay in
`evals/`. M4 is next.

M4 acceptance: reading and factual-claim schemas retain original text, synthetic
case identity, declared conventions, licensing and separate reading/extraction
provenance. Resolved factors retain polarity, certainty and temporal scope;
ambiguous, unsupported, abstained and interpretive assertions retain quotes and
reasons without guessed factors or correctness verdicts. The offline validator
checks exact UTF-16 spans, Unicode boundaries and unique claim ids while preserving
duplicates, contradictions, different conventions and empty extractions. The
bounded reading CLI validates without rewriting inputs or echoing their text.

M4 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Reading contract
and CLI tests cover local schema registration, every claim variant, negation,
hedging, unsupported vocabulary, span integrity, Unicode and input-size
boundaries, provenance, frozen inputs, JSON round trips and non-file rejection.
Examples are original inline test assertions; no generated reading is committed.
Package-exclusion and project-isolation tests passed. The root
`npm run package:contents` gate was attempted and failed on missing
`dist/calc.d.ts`; no prohibited root build was run. All changes remain under
`evals/`. M5 is next.

M5 acceptance: `createGenerationClient` supplies a deterministic offline mock
and an explicit adapter registry with immutable metadata. Its versioned text
contract bounds canonical request bytes, returned text bytes, elapsed waiting
and calls per client. Requests and results retain exact text, completion reasons,
prompt version and a canonical invocation digest. Cancellation closes the client;
failures do not retry or fall back, and diagnostics retain no raw provider errors.
The client reads no credentials and writes no files. `BACKENDS.md` documents the
extension contract and trusted-adapter limits. Entry assembly and generation
manifests remain M6 work; no generated corpus is committed.

M5 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Backend contract
and integration tests cover strict selection, immutable snapshots, canonical
digests, UTF-8 boundaries, malformed output, refusals, call budgets, concurrent
requests, cancellation, deadlines and late results. Fresh-process checks verify
offline mock execution and reproducibility across working directories and request
property order. Package-exclusion and project-isolation tests passed. The root
`npm run package:contents` gate was attempted and failed on missing
`dist/calc.d.ts`; no prohibited root build was run. All changes remain under
`evals/`. M6 is next.

M6 acceptance: the interpretation generator validates and snapshots source
datasets and generation plans before dispatch, uses a versioned original prompt,
accepts only completed schema-valid meaning payloads, and assembles unreviewed
entries with explicit caller-supplied licensing and closed source provenance.
Manifests record canonical input and dataset digests, exact response digests,
backend limits and local implementation identity. The offline CLI writes bounded
dataset/manifest pairs into ignored content-addressed directories, reuses only
identical bytes, and refuses conflicting or symlinked paths. `GENERATION.md`
documents the workflow, adapter extension and reproducibility limits. No generated
corpus is committed; scoring remains later work.

M6 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Generator, file and
CLI tests cover all seed factor kinds, source ancestry, manifest hashes, full
preflight validation, malformed and incomplete model output, snapshot isolation,
cancellation, aggregate output limits, repeatability across processes and working
directories, byte-identical reuse, conflicts, symlinks, FIFOs, lock contention
and cleanup after injected write failures. Package-exclusion and project-isolation
checks passed. With npm's cache redirected under `evals/`, the root
`npm run package:contents` gate was attempted and failed on missing
`dist/calc.d.ts`; no prohibited root build was run. All changes remain under
`evals/`. M7 is next.

M7 acceptance: `RUBRIC.md` and the authored `rubrics/factual-v1.json` policy
define explicit eligibility, full-factor negation, canonical resolved units,
duplicate handling, pairwise contradictions and positive-factor coverage.
Correctness, coverage, contradiction and resolved-assessment rates retain their
own counts and denominators, with null for undefined rates. Unsupported prose,
ambiguity, abstentions and interpretations retain occurrence counts without
factual credit. The rubric specifies convention and availability handling,
required evidence and extraction limits. Scorer implementation remains M8 work.

M7 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Rubric contract
tests check current schema vocabulary, synthetic adapter compatibility, unknown
time, actual polar fallback, identity rules, truth tables and hypothetical
worked-example arithmetic. They do not claim to exercise a scoring harness or
establish independent astronomical accuracy. Package exclusion and project
isolation passed. The root `npm run package:contents` gate was attempted with
an eval-local npm cache and failed on missing `dist/calc.d.ts`; no prohibited
root build was run. All changes remain under `evals/`. M8 is next.

M8 acceptance: `scoreReading` computes its own complete local reference for a
validated synthetic case and reading. The deterministic scorer applies the
versioned rubric to placements, aspects, houses and sign dignities, preserving
original occurrences while scoring unique resolved units. Immutable reports
retain eligibility reasons, convention and availability diagnostics, categorical
membership evidence, contradiction edges, coverage decisions and explicit
category and overall denominators. Digests identify the inputs, complete
reference, rubric bytes and implementation. Invalid requests and oversized
reports are refused without scores. `SCORING.md` documents the API and evidence
links; reading CLI integration remains M9 work.

M8 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Scoring tests
exercise the full membership truth table, complete and omitted coverage,
duplicate and reversed-pair identity, pairwise contradictions, full-factor
dignity negation, coexisting dignity labels, temporal and convention exclusions,
unknown time, missing coordinates, polar fallback and reference-span warnings.
Boundary tests cover input snapshots, immutable reports, provenance, canonical
digests, fresh-process offline repeatability, unsupported factors, malformed
inputs, supplied-reference rejection and input/output limits. These tests measure
agreement with the local engine, not independent astronomical accuracy or
extraction faithfulness. Package exclusion and project isolation passed. The root
`npm run package:contents` gate was attempted with an eval-local npm cache and
failed on missing `dist/calc.d.ts`; no prohibited root build was run. All changes
remain under `evals/`. M9 is next.

M9 acceptance: `evaluateReading` and the offline evaluation CLI combine a
validated synthetic case with a supplied reading or a labeled deterministic
mock. Supplied readings retain their original claims and the complete scorer
report; the mock renders local reference factors with explicit convention and
availability handling, then the scorer recomputes its own reference. Immutable
envelopes preserve input, reference, rubric and implementation identity. The CLI
prints a machine-readable summary and publishes bounded canonical reports only
under ignored `reports/`, reusing exact bytes and refusing conflicts without
replacement. `EVALUATION.md` documents the workflow and mock limitations. No
generated reading or report is committed; general prose extraction remains M10.

M9 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Orchestration,
CLI and persistence tests cover supplied incorrect and empty readings, duplicates,
contradictions, convention exclusions, unavailable houses, polar fallback,
mock provenance, immutable snapshots, reference-span warnings, report expansion
limits, fresh-process repeatability, offline execution, input byte and UTF-8
boundaries, symlinks, nonregular files, concurrent writers, no-clobber publication
and staging cleanup. These are engine-consistency and workflow checks, not model
quality or independent astronomical accuracy evidence. Package exclusion and
project isolation passed. The root `npm run package:contents` gate was attempted
with an eval-local npm cache and failed on missing `dist/calc.d.ts`; no prohibited
root build was run. All changes remain under `evals/`. M10 is next.

M10 acceptance: `extractReadingClaims` parses a bounded English grammar from
unannotated reading envelopes without consulting chart facts. It retains exact
quoted spans, original metadata, duplicate assertions, explicit negation,
uncertainty and temporal scope, while keeping unsupported wording unresolved.
Paragraph and document guards withhold claims affected by recognized quotation,
code, hypothetical or refutation context. Immutable extraction reports record
identity, digests, reason counts, character accounting and unverified coverage.
The evaluation API and CLI expose opt-in extraction and retain those limits in
saved reports and summaries. `EXTRACTION.md` documents the grammar and its
discourse limitations. No generated reading corpus is committed.

M10 validation: `npm --prefix evals test` and
`npm --prefix evals run validate:seed` passed on Node 22.23.3. Parser and
integration tests cover supported and incorrect assertions, full-factor and
local negation, ambiguity, duplicate and reversed aspects, omitted facts,
convention conflicts, unavailable houses, scope and quotation guards, Unicode
spans, bounded refusals, immutable snapshots and offline repeatability. These
tests establish grammar behavior and local engine consistency, not extraction
recall, model quality or independent astronomical accuracy. Package exclusion
and project isolation passed. The root `npm run package:contents` gate was
attempted with an eval-local npm cache and failed on missing `dist/calc.d.ts`;
no prohibited root build was run. All changes remain under `evals/`. M11 is next.
