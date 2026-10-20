# MCP validation

The review follow-up passed `node scripts/validate.mjs` on Node 22.23.3.
Its stdout is recorded in
[evidence/review-validation.txt](evidence/review-validation.txt). Reproduce the
checks from `mcp/` with the committed lockfile and Node 22:

```sh
npm ci --ignore-scripts --cache .cache/npm
node scripts/validate.mjs
```

The report identifies the source baseline, carried engine archive, lockfile and
validation inputs by SHA-256. Inputs are the maintained TypeScript, JavaScript
module and JSON files under `mcp/`, plus the MCP workflow. Paths and contents
are hashed in sorted order with NUL separators. Documentation and evidence are
excluded from that digest so committing the report does not change the
executable inputs it identifies. Raw logs and the Vitest JSON report stay in
gitignored `.generated/`.

The checked span is the synthetic cases in the complete `test/*.mcp-test.ts`
suite. These establish wrapper, resource-policy and protocol integration,
not independent astronomical accuracy.

| Checked behavior | Committed tests |
| --- | --- |
| Strict inputs, JSON serialization and native receipt validation | `contracts.mcp-test.ts`, `scaffold.mcp-test.ts` |
| Natal chart preservation and receipt replay | `natal.mcp-test.ts` |
| Dated and current transits, captured clock and separate natal/sky receipts | `transits.mcp-test.ts` |
| Native synastry summaries without an added score | `synastry.mcp-test.ts` |
| Solar and lunar return selection, relocation and refusals | `returns.mcp-test.ts` |
| Moon phase, sampled crossings and whole sample-budget refusals | `events.mcp-test.ts` |
| Credential sources, HTTP authorization and private diagnostics | `auth.mcp-test.ts` |
| Worker termination, deadlines, cancellation, busy refusals and recovery | `search-worker.mcp-test.ts`, `cancellation.mcp-test.ts` |
| Shared rate policy, UTF-8 body caps and exact-path rejection | `http-limits.mcp-test.ts`, `auth.mcp-test.ts` |
| Discovery, every tool's advertised output schema, errors and lifecycle over stdio and HTTP | `server.mcp-test.ts`, `transports.mcp-test.ts` |
| Factual descriptions and synthetic successful, refused and error outputs | `factual-language.mcp-test.ts`, `transports.mcp-test.ts` |
| Shared npm cache configuration for workflow setup and installation | `ci.mcp-test.ts` |
| Parent pack exclusion | `isolation.mcp-test.ts` |

## Transits and authentication evidence

M5 transit checks remain in `test/transits.mcp-test.ts` and the complete current
run. They compare native results and receipt replay, cover time settings and
coverage flags, and check that an injected clock is captured once. The natal
receipt and transit-sky receipt record separate calculations; neither attests
the derived inter-chart aspects.

P1 authentication validation is recorded in
[evidence/p1-validation.txt](evidence/p1-validation.txt). The current run also
includes its accepted, missing, malformed and wrong bearer credentials, bounded
environment/file sources, constant-time comparison and private diagnostics.
Relative file source resolution is covered by the review follow-up tests.

## Isolation and CI scope

The Node 22 MCP workflow installs from this project's own lockfile and invokes
the same validation command. Its cache location is shared by setup and install.
Validation checks the carried archive digest and locked source, parent pack
exclusion, parent file/dist snapshots, allowed change paths, whitespace,
Markdown dashes and JSON examples. It enforces the file and project disk
policies in [PHASE2.md](PHASE2.md), counting dependencies, caches and generated
reports before and after each validation stage, with reserved room for build
and report growth. Authored files, build output and raw reports are checked
for file size; upstream dependencies and cache files retain their own sizes.

No parent build was run. Earlier `npm run package:contents` attempts failed
because the checkout lacked `dist/calc.d.ts`; this task prohibits writing parent
`dist/`. The dry-run pack exclusion test and unchanged-file snapshots do not
substitute for the engine's build-dependent gates. Repository CI remains
authoritative for those gates and merge readiness.

Client GUIs, public gateways and live authentication services were not
exercised. The [README operator checklist](README.md#gateway-operator-checklist)
describes those deployment checks. Event searches have a worker deadline;
other tools remain synchronous without a worker deadline and require gateway
concurrency controls.

## Historical reports

[evidence/p7-validation.txt](evidence/p7-validation.txt) records the completed
phase 2 locked install and complete validation before this review follow-up.
Earlier reports remain records of their original source baselines:
[P2](evidence/p2-validation.txt), [P3](evidence/p3-validation.txt),
[P4](evidence/p4-validation.txt), [P5](evidence/p5-validation.txt) and
[P6](evidence/p6-validation.txt). P6 includes an initial current-HTTP cancellation
timeout, a passing focused rerun and a passing complete rerun; those outcomes
are preserved in its report.

[evidence/m12-validation.txt](evidence/m12-validation.txt) predates the F1 test
rename. Its `test/isolation.test.ts` path is the historical name of today's
`test/isolation.mcp-test.ts`; the captured stdout is preserved rather than
rewritten. [evidence/f1-validation.txt](evidence/f1-validation.txt) records the
rename and parent test-discovery isolation.
[evidence/f3-validation.txt](evidence/f3-validation.txt) records signal cleanup
checks. Those historical parent test runs failed in the unchanged archive
binding tests under sandbox restrictions; they demonstrate discovery isolation,
not a passing root suite.
