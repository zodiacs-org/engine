# HTTP API server plan

All implementation, dependencies, tests, documentation and evidence belong in
`server/`. The engine source, root package metadata, carried archives and root
`dist/` stay untouched. Import the engine's public source entry points by
relative path and build the server into its own ignored output directory.
Use synthetic birth inputs only. Do not implement MCP or event search.

Complete the next unchecked milestone, run its checks, tick it and append a
single session summary to `CHANGES.txt`. The harness owns all git writes.

- [x] M1 Bootstrap a private TypeScript server package, reproducible local build and Vitest setup; add health/readiness routes, safe JSON response/error envelopes, structured logs and process lifecycle tests.
- [ ] M2 Load API keys from environment or an ignored local file, fail closed for calculation routes, and test authentication and secret redaction without committed credentials.
- [ ] M3 Add per-key token buckets, bounded JSON request validation and consistent HTTP errors; test refill, exhaustion, key isolation and invalid requests.
- [ ] M4 Add the natal chart REST route using the engine directly, preserving full output and the engine's natal receipts; test coordinates, unknown time, flags and invalid input.
- [ ] M5 Add transit and synastry REST routes, with engine receipts for each contributing chart and explicit receipt scope; test successful and invalid requests.
- [ ] M6 Add bounded solar and lunar return REST requests through the engine's return functions; preserve their charts and receipts and test calculation failures and limits.
- [ ] M7 Add moon-phase and houses REST routes through public engine APIs; attach applicable engine receipts with explicit scope and test every route and refusal.
- [ ] M8 Generate and serve an OpenAPI 3.1 document from route schemas, including authentication, limits, receipts, errors and synthetic examples; test schema and route agreement.
- [ ] M9 Harden lifecycle and resource limits across the completed API, including shutdown, readiness, logging privacy and calculation work limits; run the full server integration suite.
- [ ] M10 Add a Dockerfile and self-hosting instructions with environment/file key setup, health checks, persistent configuration and required engine licence notices; exercise the container when tooling permits.
- [ ] M11 Add an autocannon or k6 harness and commit small throughput and p50/p95 latency evidence from this machine, with commands, runtime, workload, build identity and limitations; keep raw generated output ignored.
- [ ] M12 Review all route, auth, rate-limit, OpenAPI and deployment tests; finish operator/client documentation and record final validation and remaining limitations.

The initial HTTP paths are `/healthz` and `/readyz`; calculation routes will
live under `/v1/`. Health and HTTP error responses identify the engine and
carry an empty receipts list because no calculation produced them. Calculation
routes must retain engine-generated receipts, label what each receipt covers,
and never present server-authored metadata as an engine calculation receipt.
`/openapi.json` will serve the generated specification itself.

Each milestone must pass `npm --prefix server run typecheck`,
`npm --prefix server test` and `npm --prefix server run build`. The tests must
exercise behavior through HTTP injection and, for process lifecycle, a real
loopback listener. Check package exclusion without writing the root build.
Performance figures are deferred until the committed harness measures the
completed API on this machine.

M1 validation: the server typecheck, Vitest suite, build and package-exclusion
check passed using Node 22.22.2. Repeating the build produced identical output.
Tests cover probes, configuration, listener conflicts, graceful signals,
request IDs, body errors, malformed URLs and malformed raw HTTP at trace
logging. The root `npm run package:contents` was attempted and failed because
this checkout has no `dist/calc.d.ts`. No root build was generated because
the task confines all writes to `server/`; the separate dry-run exclusion
check passed. Root tracked files are unchanged.
