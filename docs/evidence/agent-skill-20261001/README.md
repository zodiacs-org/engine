# Calculation skill verification

The bundle at `skills/zodiacs-compute/` fulfills the content scope of programme
A4: tool selection, birth-time uncertainty, receipt citations, and claims that
calculation tools do not establish. Publication and programme acceptance are
separate from this local verification record.

The skill is repository documentation. It changes no calculation, API, package
version, dependency, archive, vector, runtime setting or frontend behavior.
`package:contents` confirms it is not included in the carried engine package.
The package's existing licensing and archive identities are unchanged.

## Verified contracts

- Local stdio source: site commit
  `9cfafa3e742de943062c9174338472781724a4b5`, `src/mcp/server.ts`,
  `src/mcp/tools.ts` and `examples/mcp-server/README.md`. The actual rc.15
  adapter verification command also passed locally on Node 22.22.2.
- Hosted requests and citations: that commit's `src/lib/compute-api/examples.ts`,
  `openapi.ts` and `receipt.ts`. The live OpenAPI document was fetched on
  2026-10-01 and matched the six named POST routes. Its SHA-256 was
  `55c06cf1404637d02680343dd9544f4653a8f3243bec242a46fff1dfc06ca323`.
- The first public npm lookup that morning reported engine `0.1.1-rc.15`.
  Later on 2026-10-01, release workflow
  [36858851623](https://github.com/zodiacs-org/engine/actions/runs/36858851623)
  published rc.16 under `next`, with `latest` unchanged at rc.15. The reference
  now records that independently verified update without treating it as site
  adoption or new tools in the currently deployed local adapter.
- The later checkpoint 11 Hot timing/usage-cost supplement is linked as dated
  evidence. Cold samples, the general limiter and deployment of the private
  cache fix remain open; no stronger hosted privacy claim is introduced.

## Forward-use checks

The proposed instructions were exercised against actual local MCP operations
and the generated compute handler, with synthetic data and no production POSTs.

| Request | Observed contract and appropriate response |
| --- | --- |
| Unknown birth time, only date and city; ascendant and Moon certainty | Date/city-only and undocumented zone arguments were refused. An explicitly declared reference instant with unknown time returned no angles/houses. One reference Moon position was not promoted to whole-day certainty |
| Mercury retrograde on 2026-10-24 in America/New_York | The sky-fact operation returned `depends`, with the local-day interval, a station during the day and a computed receipt. Its citation digest was recomputed; no all-day yes/no was invented |
| Two chart records differ; their comparison is described as anonymous | The real summary withheld absolute values but retained exact deltas. Combining a known input with a delta reconstructed the other value; the response preserved the non-anonymity warning and did not share it publicly |
| Year 5000 Moon precision proof and an npm MCP installation | Both contracts refused the unsupported year. No accuracy proof, substitute year, invented MCP endpoint or nonexistent package installation was offered |

These are bounded contract/behavior checks, not a cross-model reliability score
or independent astronomical accuracy measurement. They support routing and
honest refusal, not the correctness of every astronomical result.

## Reproduction and release gates

- Run the skill creator's `quick_validate.py` against the skill folder to check
  frontmatter and incomplete scaffolding.
- In a matching site checkout with its locked dependencies, run
  `node examples/mcp-server/verify.mjs` to exercise the actual stdio protocol.
  Its fixtures are synthetic; the supplied calculation records are not signed.
- In this engine checkout run typecheck, the full test suite, build,
  `exports:smoke`, `package:contents`, archive binding, conformance and atlas
  gates described by `CONTRIBUTING.md`. Never alter their thresholds for a
  documentation change.
- The first local full suite could not rebuild six archive-binding fixtures
  because npm's default home was unwritable. With an isolated writable HOME,
  the unchanged archive-binding suite passed. That is a runner setup change,
  not a source or acceptance-gate change.
- The owner-supplied external-private-pattern check passed for local revision
  `c583f31b`: three unpublished commits and the complete 1,080-file tree, with
  zero birth-data or name-only matches. Only aggregate outcomes are recorded;
  no patterns, labels or private-input digest are included. The optional
  published-example check was not run because its input was not supplied.
  Rerun the required scanner on the final range/tree before publication; no
  substituted or reconstructed pattern list satisfies it.
- Publish through a reviewed PR with the engine's required CI and merge-commit
  policy. A draft alone is not programme acceptance. No npm/JSR publication or
  GitHub Release is part of this skill delivery.
