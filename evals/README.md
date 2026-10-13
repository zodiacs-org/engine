# Interpretation dataset and reading evaluations

This directory is an independent local project for developing an interpretation
dataset and evaluating chart readings. It validates factor-to-meaning entries
and datasets, includes an original authored seed set, computes synthetic
chart facts through the local engine, and validates readings with quoted claims.
Generation backends and the scoring harness are later milestones in
[PLAN.md](PLAN.md).

Interpretation text is symbolic prose. The eventual factual score will compare a
reading's assertions with computations from the local `@zodiacs/engine` under
recorded conventions. It will not measure independent astronomical accuracy,
personality truth or predictive validity.

## Run locally

Use Node.js 22. From the repository root:

```sh
npm ci --prefix evals --ignore-scripts --no-audit --no-fund --cache evals/.cache/npm
npm --prefix evals test
npm --prefix evals run validate:seed
node evals/bin/validate-entry.mjs --help
```

Installation resolves the locked validator, bundler and ephemeris dependencies.
Tests and validation then run offline; they require no LLM backend, API key or
root engine build. Tests use
Node's built-in runner and filenames ending in `.checks.mjs`, so the root Vitest
suite does not collect them.

The isolation tests inspect npm's actual dry-run inventory with lifecycle scripts
disabled and offline mode enabled. They verify that `evals/` is excluded even in
a checkout without `dist/`. This is a package-exclusion check; the repository's
full `package:contents` gate additionally requires an existing engine build.

To check a locally authored entry saved under the ignored scratch directory:

```sh
node evals/bin/validate-entry.mjs evals/scratch/entry.json
```

The CLI writes `{ "valid": true, "errors": [] }` for an accepted entry. Invalid
entries produce structured field paths and diagnostic messages. Exit codes are
zero for acceptance, one for a rejected entry, and two for usage or file errors.
The CLI accepts a single UTF-8 JSON file up to 64 KiB; its byte boundary and exit
codes are enforced by [the CLI tests](tests/cli.checks.mjs). It never rewrites
input files or echoes their contents in diagnostics.

## Entry contract

[meaning-entry.schema.json](schema/meaning-entry.schema.json) uses JSON Schema
2020-12. Each entry carries its schema version, stable id, language, tradition,
factor, meaning, provenance and license. Unknown properties are rejected at every
object boundary. This initial vocabulary covers English interpretations in the
Western tropical tradition.

| Factor kind | Required factor data | Convention |
| --- | --- | --- |
| `placement` | body and lowercase sign | Engine tropical sign names |
| `aspect` | distinct bodies, aspect and policy | `natal-major-defaults`; Sun through Pluto |
| `house` | body, house and house system | Explicit system, using the computed system after any fallback |
| `dignity` | classical planet, sign, dignity and system | `classical-sign`; domicile, exaltation, detriment or fall |

The vocabulary follows the local engine's public types in `src/types.ts` and
`src/techniques/dignities.ts`. A meaning requires a nonblank summary, distinct
themes and `epistemicStatus: "symbolic-interpretation"`. A schema-valid dignity
factor can still be factually wrong; astronomical and dignity computation belongs
to the engine adapter, not schema validation. Mercury in Virgo can have
both domicile and exaltation, represented by separate factors.

`provenance.kind: "authored"` requires named authors and an origin note. Record AI
assistance honestly in that note when applicable. `kind: "generated"` instead
requires backend and model identifiers, a prompt version, an input SHA-256 digest,
source entry ids and `reviewStatus: "unreviewed"`. Generated entries must retain
that origin; schema acceptance does not constitute review. The dataset check
resolves source ids and rejects duplicate entry ids.

The local validator adds the semantic rule that an aspect must have distinct
bodies. It does not mutate input, coerce values, apply defaults, fetch schema
references or run interpretation text as code. The schema and semantic behavior
are exercised in [the contract tests](tests/schema.checks.mjs).

## Seed and dataset checks

[data/seed.json](data/seed.json) contains original symbolic prompts for placements,
aspects, houses and sign dignities. Entries were composed individually with AI
assistance; their provenance names OpenAI Codex and asserts no human review.
They are independent examples, not factors of a shared birth chart. The seed
contains no person's birth input, external interpretation prose or pipeline
output. [The seed notes](data/README.md) describe scope and review expectations.

[meaning-dataset.schema.json](schema/meaning-dataset.schema.json) defines a
versioned envelope with `schemaVersion`, `id` and `entries`. Each entry keeps its
own provenance and license. The local validator registers both schemas without
fetching references; other JSON Schema validators must register the entry schema
under its `$id` before loading the dataset schema.

```sh
node evals/bin/validate-dataset.mjs --seed evals/data/seed.json
node evals/bin/validate-dataset.mjs evals/generated/dataset.json
```

The library exports `validateDataset(value, { seed: false })` from
`lib/validate-dataset.mjs`. It checks entry structure and semantics, unique entry
ids and generated-source references. Each source must exist in the same dataset;
forward references and shared sources are allowed, but self-references and
cycles are rejected. Include source entries alongside generated variants when
exporting a dataset. General datasets allow different meanings of the same
factor under distinct ids.

The `--seed` mode additionally requires authored provenance, every factor kind,
and domicile, exaltation, detriment and fall examples. It rejects repeated factors
within a language and tradition even when an aspect's bodies are reversed or
JSON keys change order. Distinct house systems and distinct dignity labels remain
separate factors. These checks do not authenticate authorship, verify rights,
evaluate prose quality or calculate whether a dignity applies to a sign. Engine
fact computation is separate from this dataset validation.

The CLI uses the same report shape and exit codes as entry validation. Its input
limit is 1 MiB of UTF-8 JSON, and a dataset allows up to 256 entries. These are
operational limits, enforced at their boundaries by
[dataset tests](tests/dataset.checks.mjs) and
[dataset CLI tests](tests/dataset-cli.checks.mjs). The dataset tests also enforce
the committed seed's category coverage and attribution.

## Local chart facts

`computeChartFacts(value)` in [lib/chart-facts.mjs](lib/chart-facts.mjs) accepts a
synthetic case and returns an immutable, JSON-serializable fact envelope. For
example, from the repository root in a Node ES module:

```js
import { computeChartFacts } from "./evals/lib/chart-facts.mjs";

const result = await computeChartFacts({
  schemaVersion: "1.0.0",
  id: "synthetic-example",
  synthetic: true,
  birth: { utc: "2003-05-17T08:13:00Z", latitude: 35, longitude: 12 }
});
console.log(result.facts, result.availability);
```

This invented input is exercised by the [adapter tests](tests/chart-facts.checks.mjs)
and [loader tests](tests/local-engine.checks.mjs). The input contract is
[synthetic-chart.schema.json](schema/synthetic-chart.schema.json).
`validateSyntheticChart(value)` returns structural errors using the entry
validator's report shape. Computation additionally rejects invalid calendar
dates and instants the engine cannot evaluate. A structural rejection throws
`TypeError` with an `errors` array; engine validation can throw `RangeError`.
Neither path changes the input or coerces fields.

Cases require a resolved date-time string with an explicit offset, paired
coordinates when supplied, and `synthetic: true`. Exact geographic poles are
excluded because their rising angles are degenerate. Unknown fields, supplied
chart results, flag assertions and personal metadata are rejected. The marker
records the caller's assertion of invented data; it cannot prove that assertion.
The normalized `input` records the engine's defaults and selected time scale;
`time.sourceInstant` preserves the submitted spelling. Non-UTC scales and pinned
Delta T are retained with the engine's complete time-basis record.

The flat `facts` array uses the meaning schema's factor vocabulary. `reference`
holds the engine's body positions, natal aspects, angles, cusps and sign-dignity
assessments, so later scoring can explain each factor. Numerical positions,
cusps and aspect orbs are in degrees, speeds are degrees per day, and Delta T is
in seconds, following the engine's public types. Facts preserve full returned
precision. No interpretation text or model call is needed to compute them.

The envelope makes availability and conventions explicit:

- Placements and aspects describe the supplied instant. With `timeKnown: false`,
  `availability.temporalScope` is `reference-instant`; the adapter makes no
  whole-day certainty claim and does not move the instant to noon.
- Houses are unavailable when time or coordinates are missing, with each reason
  recorded. Available house factors use the actual computed system, while the
  requested system and polar-fallback flag remain separate. Membership uses
  `houseOf` on ecliptic longitude and the returned cusps.
- Aspects are the engine's natal major-aspect results. Their eligible bodies,
  angles, ordinary and luminary orbs, and motion threshold are recorded alongside
  the policy id. Nodes are excluded by that policy.
- Sign dignities use `dignitiesFor`, retaining every applicable label. A classical
  body's empty label list means none of the supported sign dignities applies;
  it does not establish peregrine status. Outer planets and nodes are listed as
  unsupported. Triplicity, term, face and mutual reception are outside this
  adapter's dignity scope.

`conventions.natal` copies the engine's current public receipt conventions.
`flags` and `coverage` preserve its reference-span warning; computed facts beyond
that span are not a claim of verified astronomy. This adapter measures agreement
with the local engine, including its limitations. It supplies no independent
accuracy evidence and does not establish symbolic or predictive validity.

The [loader](lib/local-engine.mjs) bundles public source entry points using the
eval-local esbuild and the exact ephemeris version pinned by the root package.
It refuses mismatched source, package or dependency version labels. A temporary
module is written under ignored `.cache/`, loaded and removed; nothing is written
to `dist/`. Dependencies are resolved locally and computation makes no network
request. The loaded engine is cached for the process; restart after source edits.

Provenance records the engine and installed ephemeris versions and licenses,
runtime, bundler version, the digest of the executed computation bundle, and a
digest of the adapter, loader and input schemas. These identify local bytes;
they are not a release archive signature or a claim that the checkout matches a
published package. No wall-clock timestamp or temporary path is included.
The loader tests check repeatability across fresh processes and working
directories on the same runtime; they do not promise bitwise agreement across
runtimes or architectures. The adapter tests check consistency with public
engine APIs, missing inputs, polar fallback and sign-dignity behavior.

## Reading and claim contracts

[reading.schema.json](schema/reading.schema.json) retains a reading's unchanged
`text`, its synthetic `caseId`, declared `conventions`, origin `provenance`,
`license`, extraction metadata and quoted `claims`. Its case id is a reference
for the later harness to resolve against a synthetic case; this validator does
not look up cases or compute chart facts. Reading provenance is separate from
the method, producer and version that extracted its claims. Generated origin
requires backend, model, prompt version and input digest, and stays unreviewed.
These labels record supplied claims about origin, not authenticated receipts.

[factual-claim.schema.json](schema/factual-claim.schema.json) records each
assertion's id, exact quote and status:

| Status | Retained content | Meaning for later evaluation |
| --- | --- | --- |
| `resolved` | Supported factor, polarity, certainty and temporal scope | Ready for comparison; no correctness verdict |
| `ambiguous` | Quote and reason | No unique supported assertion was selected |
| `unsupported` | Quote and reason | Assertion is outside the vocabulary, convention scope or extractor's ability |
| `abstained` | Quote and reason | Reading explicitly declines an assertion |
| `interpretive` | Quote and reason | Symbolic prose outside computable factual correctness |

Resolved factors reuse the meaning-entry vocabulary, including its explicit
house system, aspect policy and dignity system. `polarity` is `affirmed` or
`negated`; `certainty` is `unqualified`, `hedged` or `conditional`.
`temporalScope` distinguishes `reference-instant`, `whole-day` and `unspecified`.
Whole-day certainty cannot be inferred from the adapter's reference-instant
facts. Unsupported bodies, aspects or dignity definitions stay in an unresolved
quote with a reason. They must not be rewritten as a nearby supported factor.
Unresolved records cannot contain a normalized factor or an asserted verdict.

The reading's convention fields can explicitly say `unspecified`; sidereal or
other conventions remain visible. Validation neither changes them to the
engine's conventions nor rejects contradictions between the reading's context
and individual factors. The later scorer must resolve convention mismatches
and reference availability before assigning a verdict. A structurally supported
house assertion can still concern a chart whose houses are unavailable.

Every quote has a half-open `span` with `start`, `end` and `quote`.
`offsetUnit: "utf16-code-unit"` means JavaScript string indexing, so
`text.slice(start, end)` must exactly equal the quote. The validator rejects
empty or out-of-range spans, boundaries splitting a surrogate pair, and text
with unpaired surrogates. It preserves whitespace, line endings and Unicode
normalization. Combining marks retain their original positions. Include the
negation, hedge and other context needed to interpret the assertion in its
quoted span. Claims may overlap, share a span, repeat a factor or contradict
each other; their ids must differ. Their supplied order is retained.

`validateReading(value)` and `validateClaim(claim, text)` in
[lib/validate-reading.mjs](lib/validate-reading.mjs) return the same
`{ valid, errors }` shape as entry validation. They check structure and quote
integrity without changing input, applying defaults, coercing values, fetching
references or evaluating text. Register the meaning-entry and factual-claim
schemas locally before compiling the reading schema in another validator.
The local validator additionally checks aspect-body distinctness, span integrity,
unique claim ids and that extraction method `none` has no claims.

Validation cannot establish that a factor faithfully represents its quote,
that a negation or hedge was extracted correctly, or that every assertion was
extracted. `extraction.coverage` is always `unverified`, including for manually
annotated readings. Empty text and empty claim lists are accepted for later
omission handling. Neither acceptance nor an empty list implies perfect factual
correctness. Scores, denominators and extraction audits belong to later
milestones; this command returns no score.

```sh
node evals/bin/validate-reading.mjs evals/scratch/reading.json
```

The CLI accepts a UTF-8 JSON file up to 1 MiB and never rewrites it. Exit codes
are zero for structural acceptance, one for a rejected reading, and two for
usage or file errors. [The CLI tests](tests/reading-cli.checks.mjs) enforce these
boundaries and check diagnostics without echoing supplied text. Readings allow
up to 256 claims and 32,768 Unicode code points of text, with quotes up to 4,096
code points. These operational limits and the span, uncertainty, provenance and
preservation rules are checked by [the contract tests](tests/reading.checks.mjs).
Original examples are inline in tests; no generated reading corpus is committed.

## Files and licensing

Code, documentation, the schema and original authored contributions in this
directory use the repository's [MIT license](../LICENSE). The entry contract
currently accepts MIT-labeled original text only. A label records a claim about
rights; it does not establish authorship or permission to redistribute. No
external interpretation prose is included. The committed data is the small seed
set; tests use it and original inline examples. Pipeline output stays ignored.

Ajv, esbuild, astronomy-engine and their dependencies retain their own licenses
in the local installation. Bundled engine code and data retain the engine's
license and attribution requirements, including when used in ignored local files.
This project's MIT metadata does not change the engine distribution's licensing
or attribution requirements; see the repository's [licensing record](../LICENSING.md).

Put generated datasets in `generated/`, reports in `reports/`, and temporary
inputs in `scratch/`. Those directories, dependencies and caches are ignored.
Keep each authored file and generated output file below the user's file-size
limit. Use synthetic birth inputs only, and keep credentials out of all files.
Do not modify engine code, root package metadata, `dist/` or carried archives.
