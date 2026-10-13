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
- [ ] M6 Implement the interpretation generator with versioned prompts, input/output validation, provenance, reproducible manifests and ignored output files.
- [ ] M7 Write a versioned scoring rubric for factual correctness, coverage, contradictions and abstentions, separating interpretive quality from computable facts.
- [ ] M8 Implement deterministic placement, aspect, house and dignity scoring with per-claim evidence, category totals and explicit denominators.
- [ ] M9 Add an offline reading evaluation CLI that combines synthetic cases, engine facts, supplied or mock readings and machine-readable reports.
- [ ] M10 Add a conservative prose claim extractor and tests for negation, ambiguity, duplicate claims and omitted facts; expose extraction limits in reports.
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
