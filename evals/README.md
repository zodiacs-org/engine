# Interpretation dataset and reading evaluations

This directory is an independent local project for developing an interpretation
dataset and evaluating chart readings. Its current implementation validates
factor-to-meaning entries and datasets, including an original authored seed set.
Generation backends, the engine fact adapter and the scoring harness are later
milestones in [PLAN.md](PLAN.md).

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

Installation resolves the locked validator dependencies. Tests and validation
then run offline; they require no LLM backend, API key or engine build. Tests use
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
to the planned engine adapter, not schema validation. Mercury in Virgo can have
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
fact checking remains a later milestone.

The CLI uses the same report shape and exit codes as entry validation. Its input
limit is 1 MiB of UTF-8 JSON, and a dataset allows up to 256 entries. These are
operational limits, enforced at their boundaries by
[dataset tests](tests/dataset.checks.mjs) and
[dataset CLI tests](tests/dataset-cli.checks.mjs). The dataset tests also enforce
the committed seed's category coverage and attribution.

## Files and licensing

Code, documentation, the schema and original authored contributions in this
directory use the repository's [MIT license](../LICENSE). The entry contract
currently accepts MIT-labeled original text only. A label records a claim about
rights; it does not establish authorship or permission to redistribute. No
external interpretation prose is included. The committed data is the small seed
set; tests use it and original inline examples. Pipeline output stays ignored.

Ajv and its dependencies retain their own licenses in the local installation.
This project's MIT metadata does not change the engine distribution's licensing
or attribution requirements; see the repository's [licensing record](../LICENSING.md).

Put generated datasets in `generated/`, reports in `reports/`, and temporary
inputs in `scratch/`. Those directories, dependencies and caches are ignored.
Keep each authored file and generated output file below the user's file-size
limit. Use synthetic birth inputs only, and keep credentials out of all files.
Do not modify engine code, root package metadata, `dist/` or carried archives.
