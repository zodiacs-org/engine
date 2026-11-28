# Validation and remaining limits

From the repository root, use the Node release range in
[package.json](package.json):

```sh
npm --prefix server ci
node server/scripts/validate.mjs
```

The validation script runs the server typecheck, full Vitest suite, build and
npm package-exclusion check. The test command also builds before exercising
the executable and worker through loopback listeners. The script then checks
the retained load evidence's input and bundle hashes against this checkout
and its rebuilt output. A failure stops the run without producing a successful
report. Source changes during the checks also fail validation.

Successful runs write a report to an ignored directory under
`server/.cache/validation/`. It records the runtime, commands, input hashes and
load-evidence identity. It contains no environment dump, credentials, request
data or raw test output. The final milestone's retained report is
[docs/evidence/validation-local.json](docs/evidence/validation-local.json).
The report covers its recorded inputs; it does not authenticate a deployment.
The plan and session log are excluded from the input digest so that completion
can be recorded after validation. The report itself is excluded too.

The load measurements remain those in
[docs/evidence/load-local.json](docs/evidence/load-local.json), with methodology
and scope in [LOAD-TESTING.md](LOAD-TESTING.md). Checking their hashes does not
remeasure performance on the current machine. When runtime source or locked
dependencies change, regenerate evidence using the load harness before
retaining a new validation report. Test and documentation changes alone do
not change the measured runtime bundles.

## Coverage reviewed

| Area | Checks and evidence |
| --- | --- |
| Probes, envelopes, request IDs and private logs | [app tests](test/app.vitest.ts), [process tests](test/process.vitest.ts) |
| Configuration, key sources, duplicate headers, default protection and secret redaction | [config tests](test/config.vitest.ts), [key-store tests](test/api-keys.vitest.ts), [authentication tests](test/auth.vitest.ts), process tests |
| Monotonic refill, exhaustion, shared per-key allowance and key isolation | [bucket tests](test/token-bucket.vitest.ts), [rate-limit tests](test/rate-limit.vitest.ts), process tests |
| Strict schemas, JSON depth and size, invalid UTF-8, compression and header refusals | [request-validation tests](test/request-validation.vitest.ts), process tests |
| Natal results, absent houses, polar fallback, flags, clocks, receipt parsing and replay | [natal tests](test/natal.vitest.ts) |
| Transit and synastry results, independent inputs, aspect ordering and receipt scope | [comparison tests](test/comparisons.vitest.ts) |
| Solar and lunar selection, relocation, clock settings, fixed windows and refusals | [return tests](test/returns.vitest.ts) |
| Moon phase and supporting chart receipt | [moon-phase tests](test/moon-phase.vitest.ts) |
| House systems, time forms, bounds, native receipts and replay | [houses tests](test/houses.vitest.ts) |
| Generated discovery, registered schemas, authentication declarations, limits and response agreement | [OpenAPI tests](test/openapi.vitest.ts), including house systems and optional return settings |
| Worker task parity, queue admission, deadlines, crashes, recovery and shutdown | [worker tests](test/calculation-pool.vitest.ts), [lifecycle tests](test/lifecycle.vitest.ts) |
| Readiness helper, unavailable listeners, bounded response reads and silent errors | [healthcheck tests](test/healthcheck.vitest.ts) |
| Load response accounting, receipt checks, observed quantiles and child cleanup | [load tests](test/load.vitest.ts), [load-process tests](test/load-process.vitest.ts) |
| Client example, complete receipts, error metadata, redirects, deadlines and safe diagnostics | [client documentation tests](test/client-docs.vitest.ts) |

Route tests check successful requests, invalid inputs, authentication, rate
limits and log privacy. Their result comparisons call this same engine
directly. They establish HTTP integration and receipt preservation, not
independent astronomical accuracy. Accuracy and provenance remain those of
the engine and its existing evidence.

The client tests execute JavaScript extracted from [CLIENTS.md](CLIENTS.md)
against local HTTP servers. Keep the example and tests together when changing
client behavior. The OpenAPI tests check the generated document; there is no
separately committed spec to refresh.

## Checks outside the local gate

Actual Docker execution remains unverified on this machine. Before deploying
the image, run:

```sh
npm --prefix server run test:container
```

The command requires a working Docker CLI and daemon; unavailable tooling is
a failure, not a passed container check. Local process and healthcheck tests
do not verify image assembly, mount permissions or the runtime filesystem.
Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the container smoke checks and the
operator's proxy, credential and shutdown configuration.

The repository's root package gate requires root `dist/`, which is absent
here. The server-only task does not build it. The separate server exclusion
check confirms only that npm's dry-run file list excludes `server/`; it cannot
establish the root package's complete contents or size budgets. Root CI,
archive binding, packed-consumer, conformance and atlas gates remain the
repository harness's responsibility. No engine source, root package metadata,
root build output or carried archive is changed by this milestone.

Other operational limits remain explicit:

- Each process has its own keys, rate buckets and calculation queue. It has
  no shared limiter, durable queue, stored chart history or key reload.
- The application provides HTTP. TLS, cross-origin browser policy, proxy
  limits, credential distribution and proxy log privacy belong to the host.
- A lost connection or client cancellation does not promise cancellation of
  accepted calculations. Client retries need a bounded budget.
- Receipts are unsigned convention and provenance records. Chart receipts
  do not cover derived comparison, return-search or moon-phase fields.
- Load results cover repeated synthetic requests over local loopback, without
  TLS, remote clients, containers or mixed traffic. They do not establish
  deployment capacity or long-running reliability.
- There is no MCP transport or arbitrary event search in this HTTP adapter.

Runtime keys and generated output stay ignored. Retain only deliberately
reviewed, bounded reports under `docs/evidence/`; do not copy raw request logs,
environment dumps or operator credentials into evidence.
