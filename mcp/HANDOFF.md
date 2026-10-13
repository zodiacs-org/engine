# Draft PR handoff

Suggested title: Add isolated zodiacs-astro MCP server with native receipts

The private mcp/ package exposes natal charts, transits at an explicit instant
and now, synastry, solar and lunar returns, Moon phase and bounded longitude
event search through the official MCP TypeScript SDK. Tools advertise strict
input and concrete output schemas and return structured JSON with native chart
receipt envelopes. Synastry preserves the engine's aspect summaries without
adding a compatibility score. Search budget refusal remains an explicit result.

The executable supports stdio and local Streamable HTTP with request bounds,
Host and Origin checks, error recovery and shutdown. The README supplies Claude
Desktop, Claude Code, Cursor and ChatGPT connection templates, receipt citation
instructions and the authenticated gateway boundary.

Validation: a clean locked install, TypeScript typecheck, Vitest and isolated
build passed on Node 22.23.3. Tests exercise synthetic requests for every tool,
schema discovery, receipt preservation/replay, failures, both transports and
lifecycle. See [VALIDATION.md](VALIDATION.md) and the committed
[validation output](evidence/m12-validation.txt). These are wrapper and protocol
integration checks, not independent astronomical accuracy evidence.

All implementation and documentation live under mcp/. The engine is installed
from its unchanged carried archive. Parent package exclusion and before/after
hash snapshots passed. The parent build-dependent CI gates were not run in this
session because the checkout lacks required dist output and this task prohibits
writing it. Normal repository CI remains authoritative for merge readiness.

Live client GUIs, ChatGPT connections and public gateways were not exercised.
HTTP authentication, TLS, public routing, quotas and hard calculation deadlines
belong to the deployment. Receipt contents are calculation claims and can contain
private birth details; they do not attest derived summaries or search completeness.

The plan is complete. The harness owns committing, pushing and updating the
draft PR. This handoff authorizes no merge, npm publication or release workflow.
