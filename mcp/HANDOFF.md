# Draft PR handoff

Suggested title: Add isolated zodiacs-astro MCP server with receipts and execution controls

The private mcp/ package exposes natal charts, transits at an explicit instant
and now, synastry, solar and lunar returns, Moon phase and bounded longitude
event search through the official MCP TypeScript SDK. Tools advertise strict
input and concrete output schemas and return structured JSON with native chart
receipt envelopes. Synastry preserves the engine's aspect summaries without
adding a compatibility score. Search budget refusal remains an explicit result.

The executable supports stdio and local Streamable HTTP with optional bearer
authentication from an operator-selected environment variable or file, shared
request rate limits, UTF-8 body limits, Host and Origin checks, private refusals,
error recovery and shutdown. Credentials are compared in constant time and are
never included in diagnostics. Stdio does not read HTTP credentials.

Registered event searches run in stoppable workers with an execution deadline
and bounded concurrency. Cancellation, deadline and busy errors return no
partial events or receipts; native sample-budget refusal retains its structured
result. Stdio cancellation notifications and current HTTP stream disconnects
stop active work. Older stateless HTTP cancellation POSTs cannot identify
another request securely; connection close and the execution deadline remain
available. Other tools calculate synchronously without a worker deadline.

The README supplies client connection templates, receipt citation instructions
and a gateway operator checklist for authentication, HTTPS, MCP headers, limits,
cancellation, credential rotation and private logs.

Validation: a clean locked install, TypeScript typecheck, Vitest and isolated
build passed on Node 22.23.3. Tests exercise synthetic requests for every tool,
schema discovery and validation of every structured tool result, receipt
preservation/replay, failures, authentication, limits, worker termination, both
transports and lifecycle. Description and synthetic output scans guard factual
wording. See [VALIDATION.md](VALIDATION.md) and the committed
[phase 2 validation output](evidence/p7-validation.txt). The Node 22 MCP workflow
runs the same complete validation command after its own locked install. These
are wrapper and protocol integration checks, not independent accuracy evidence.

Implementation and documentation live under mcp/; the only workflow change is
.github/workflows/mcp.yml. The engine is installed from its unchanged carried
archive. Parent package exclusion and before/after hash snapshots passed.
Validation also checks the lockfile/source digests, documentation, file sizes,
disk policy and allowed paths. The parent build-dependent CI gates were not run
in this session because the checkout lacks required dist output and this task
prohibits writing it. Repository CI remains authoritative for merge readiness.

Live client GUIs, ChatGPT connections and public gateways were not exercised.
TLS, public routing, client authorization, OAuth, per-client quotas and gateway
concurrency controls belong to the deployment. Backend bearer authentication
uses a shared operator credential, separate from gateway client authentication.
Receipt contents are calculation claims and can contain private birth details;
they do not attest derived summaries or search completeness.

The phase 1 and phase 2 plans are complete. The harness owns committing, pushing
and updating the draft PR. This handoff authorizes no merge, npm publication or
release workflow.
