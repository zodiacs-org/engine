# HTTP API server plan

All implementation, dependencies, tests, documentation and evidence belong in
`server/`. The engine source, root package metadata, carried archives and root
`dist/` stay untouched. Import the engine's public source entry points by
relative path and build the server into its own ignored output directory.
Use synthetic birth inputs only. Do not implement MCP or event search.

Complete the next unchecked milestone, run its checks, tick it and append a
single session summary to `CHANGES.txt`. The harness owns all git writes.

- [x] M1 Bootstrap a private TypeScript server package, reproducible local build and Vitest setup; add health/readiness routes, safe JSON response/error envelopes, structured logs and process lifecycle tests.
- [x] M2 Load API keys from environment or an ignored local file, fail closed for calculation routes, and test authentication and secret redaction without committed credentials.
- [x] M3 Add per-key token buckets, bounded JSON request validation and consistent HTTP errors; test refill, exhaustion, key isolation and invalid requests.
- [x] M4 Add the natal chart REST route using the engine directly, preserving full output and the engine's natal receipts; test coordinates, unknown time, flags and invalid input.
- [x] M5 Add transit and synastry REST routes, with engine receipts for each contributing chart and explicit receipt scope; test successful and invalid requests.
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

M2 validation: server typecheck, full Vitest suite, build and package-exclusion
check passed using Node 22.23.3. Key configuration tests cover bounded
environment/file loading, malformed values, duplicate keys and nonregular
files. HTTP injection and built-process tests cover default route protection,
public probes, duplicate Authorization headers and credential redaction at
trace logging. Test credentials are generated at runtime and temporary files
are removed. The root package contents gate still reports the missing
`dist/calc.d.ts`; no root build was generated. All changes are in `server/`.

M3 validation: server typecheck, full Vitest suite, build and package-exclusion
check passed using Node 22.23.3. Deterministic and HTTP tests cover per-key
refill, exhaustion, concurrency, isolation, probe exemptions and authentication
before rate limiting and parsing. Validation tests enforce JSON byte, depth
and value limits, strict schemas, UTF-8, media types, content encodings and
sanitized errors. Built-process tests verify environment configuration,
refill, duplicate content headers and chunked body overflow. An independent
review found no actionable issues. The root package contents gate still
reports missing `dist/calc.d.ts`; no root build was generated. All changes
remain in `server/`, within the file-size rule and without em dashes in docs.

M4 validation: server typecheck, full Vitest suite, build and package-exclusion
check passed using Node 22.23.3. The natal route returns the complete engine
chart and a scoped, unchanged natal envelope. Injection and built-listener
tests cover direct-engine transport parity, receipt parsing and replay,
house systems, polar fallback, unknown time, missing coordinates, source
spelling, time scales, pinned delta T, canonical flags, strict validation,
authentication, rate limits and logging privacy. Timed exact poles are
refused before calculation; codec refusals for extreme near-pole geometry
return receipt_unavailable without a partial chart. These tests check engine
integration, not independent astronomical accuracy. The root package contents
gate still reports missing `dist/calc.d.ts`; no root build was generated.
All changes remain in `server/`.

M5 validation: server typecheck, full Vitest suite, build and package-exclusion
check passed using Node 22.22.2. Transit and synastry routes call the public
engine directly and preserve its results, with unchanged natal envelopes
scoped to each contributing chart. Transit responses add a location-free
sky chart on the engine's default UTC time basis. Tests cover exact transport
parity, receipt parsing and replay, independent clocks and pins, aspect axes,
source spelling, flags, strict nested validation, shared authentication and
rate limits, receipt refusals without partial data, and trace-log privacy.
The built listener and synthetic documentation examples are exercised too.
These are integration checks, not independent accuracy evidence. An
independent review found no actionable issues. The root package contents gate
still reports missing `dist/calc.d.ts`; no root build was generated. All
changes remain in `server/`, within the file-size rule and without em dashes
in docs.
