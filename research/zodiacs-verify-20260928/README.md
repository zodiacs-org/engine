# Zodiacs Verify — working preview

An isolated, dependency-free Node.js companion to the Zodiacs engine. It compares chart receipts, reports birth-window uncertainty, and checks structured AI claims against explicitly trusted evidence. This is a local SDK and CLI, with a protocol-neutral tool session. It is not a deployed service, published npm package, whole-prose fact checker, empirical validation of astrology, or a new ephemeris.

The engine remains independently owned and developed. This directory adds no engine exports, dependencies, package-root changes, deployment configuration or database migrations. The included adapter qualifies the frozen `@zodiacs/engine 0.1.1-rc.10` artifact from commit `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`; a newer Opus build requires deliberate adapter qualification. A version string alone is insufficient.

## Run

Requires Node >=20. No `npm install` is required for this package.

The standalone Node.js suites use `*.node-test.mjs` names and an explicit test command so the engine's root Vitest discovery does not collect them. Run the commands below from this directory; no root test configuration is changed.

```sh
npm test
npm run demo
node src/cli.mjs --help
```

The demo uses clearly labelled **synthetic analytic functions**, not invented real-world chart data. It demonstrates a correct fact, an invented placement, a conditionally stable interval, a changing sign and a sourced editorial rule. Results are written under `reports/synthetic-demo/`.

For the real-engine path, first prepare the **existing frozen engine artifact and its pinned dependency** using the earlier handoff's bootstrap. Then run:

```sh
ZODIACS_ENGINE_PATH=/absolute/path/to/package/dist/index.js npm test
node src/cli.mjs calculate examples/chart-request.json --engine /absolute/path/to/package/dist/index.js --out /absolute/path/to/new-chart.json
node src/cli.mjs uncertainty examples/window-request.json --engine /absolute/path/to/package/dist/index.js --out /absolute/path/to/new-window.json
```

The two supplied requests describe a synthetic example person at a real test timestamp, not the owner's birth data. Saved `reports/engine-chart.json` and `reports/engine-window.json` were calculated with the frozen runtime. Their content is diagnostic; no comparison to an independent astronomical oracle is implied. Engine integration tests clearly skip if no configured frozen runtime exists; the final delivery run supplied one and had zero skips.

## Interfaces

| Function / CLI command | Implemented behavior |
| --- | --- |
| `loadZodiacsAdapter(path)` / `calculate` | Verify engine executable and dependency hashes; produce deterministic, sealed, explicit-convention receipts with planetary, angle, house and aspect facts. Reject silent house fallback. |
| `compareCharts(left,right,options)` / `compare` | Distinguish input, convention, provider, missing-fact and semantic differences; compare longitudes around the 0° seam. Does not convert frames or decide which provider is correct. |
| `analyzeUncertainty(request)` / `uncertainty` | Examine a union of resolved UTC intervals for body signs and specified aspect membership; preserve unresolved intervals, witnesses, assumptions and work budgets. |
| `verifyClaims(request)` / `claims` | Check structured fact/interval claims and interpretation provenance with explicit evidence trust, subject binding, dependencies and cycle detection. |
| `createVerifySession(adapter,options)` | Tool descriptions and local dispatch with bounded, session-local evidence retention and operator-owned interpretation rules. No transport, authentication or remote server. |

Import from `src/index.mjs`. The executable wire contracts are in `CONTRACT.md`; example CLI inputs and rules are in `examples/`. CLI writes use a new file only and refuse overwrites. `claims` exits 2 for unsupported claims, 1 for malformed requests/runtime failures, and 0 when all supplied claims are supported. Comparison disagreements and unresolved uncertainty are normal diagnostic outputs, not crashes.

## Meaning of uncertainty results

`stable` means the entire feature's interval was classified under every referenced external bound. `variable` means sampled values differ; the returned values need not enumerate every possible value. `unresolved` means evidence is insufficient. `complete` means all feature cells were bounded; it never means every event transition was located.

The production engine adapter provides **no conservative astronomical derivative or absolute-error bounds**. Real-engine windows therefore remain sampled unless a separately reviewed provider supplies suitable bounds. The lower-level SDK supports analytic/external bounds with an exact model digest, body, domain, source, rate limit and evaluation-error allowance. This is conditional mathematical enclosure, not independently certified physical truth. Tested discrepancies at selected dates cannot be turned into a universal error bound.

The algorithm uses outward-rounded enclosures and adaptive subdivision. It checks sampled pairs for contradictions to supplied bounds, with a fixed 100,000-pair consistency budget. Exhausting that budget downgrades affected conclusions. Other limits: seven-day interval hull, 32 components, 64 features, at most 100,000 sample attempts. A callback failure consumes its sample budget. CLI/tool preflight chart validation is separate from the report's sample-callback count. A host must impose its own time/memory limits before exposing this computation remotely.

Historical local times are not resolved by this package: supply explicit UTC/offset intervals, including both possibilities for ambiguous civil times. Input offsets are validated, but a timezone database, birth-place resolver, location uncertainty and clock-record research are not delivered here.

## Trust and interpretation

Seals are deterministic integrity hashes, not signatures, identity proof, source authentication or evidence of numerical accuracy. Trust lists are **operator configuration**. Never let an AI or remote caller add its own evidence, bounds or rules to a trusted list. The tool session retains evidence it computes and snapshots the operator's rule registry; direct SDK callers must maintain that separation themselves.

Receipt/report IDs bind their payload contents. Rule and bound IDs are labels; direct callers must pin reviewed registry content, not accept arbitrary objects merely because they repeat an approved label. A source locator is not proof that a source exists or supports a claim. See `docs/INTERPRETATION-REGISTRY.md`.

For interpretations, `supported` means **source metadata and prerequisite claims pass the stated checks**. It does not mean the prose follows from the rule, that an LLM omitted no hidden factual claims, or that the interpretation predicts real outcomes. The preview intentionally contains only one explicitly invented editorial demonstration rule. Expert-reviewed traditions and an empirical study are future work; `docs/RESEARCH-PROTOCOL.md` is a proposed study design only.

## Integration limits

This prototype uses Node crypto/filesystem APIs and has not been bundled for browsers, mobile or edge runtimes. There is no HTTP/MCP transport, authentication, persistent user storage, hosted registry, telemetry or external AI call. Trusted engine code is imported locally and is not sandboxed. Do not mutate the shared astronomy-engine clock, dependency installation or module files while using an adapter. Run future untrusted engine candidates in an isolated process before qualifying them.

Independent review reports and saved validation output accompany this package. Meaningful tests cover boundary arithmetic, hidden excursions, tangencies, contradictory bounds, omitted coverage, tampering, input mistakes, subject mismatches, reference-time suppression and trust injection. These checks validate this preview's contract, not the overall accuracy or scientific validity of astrology.
