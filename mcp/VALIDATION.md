# Scaffold validation

P3 session: `node scripts/validate.mjs` passed on Node 22.23.3; the full output
is committed in [evidence/p3-validation.txt](evidence/p3-validation.txt).
Typecheck, the complete Vitest suite, the isolated build, parent pack exclusion,
source file sizes, documentation checks and the parent file/dist snapshot passed.
[test/http-limits.mcp-test.ts](test/http-limits.mcp-test.ts) checks configuration,
fixed-window admission and recovery, authentication interaction, guard ordering,
independent listeners, forwarding-header isolation and private refusals. It also
checks exact UTF-8 byte boundaries and oversized declared and chunked bodies,
including unfinished uploads and successful requests after rejection. Legacy SSE
responses retain the no-store policy alongside the SDK's streaming directives.
These are protocol and resource-policy checks, not astronomical accuracy evidence.
Parent build-dependent gates retain the limitation below; parent files, engine
archives and existing parent dist remained unchanged.

P2 session: `node scripts/validate.mjs` passed on Node 22.23.3; the full output
is committed in [evidence/p2-validation.txt](evidence/p2-validation.txt).
Typecheck, the complete Vitest suite, the isolated build, parent pack exclusion,
source file sizes, documentation checks and the parent file/dist snapshot passed.
The validation script and `npm test` build the worker before running tests.
[test/search-worker.mcp-test.ts](test/search-worker.mcp-test.ts) verifies native
JSON preservation, real worker exit after cancellation and deadline expiry,
bounded concurrency, close ownership, private failures and recovery.
[test/cancellation.mcp-test.ts](test/cancellation.mcp-test.ts) uses official SDK
clients over real stdio and HTTP, explicitly selecting current and older
protocols. It checks live cancellation, shutdown, deadline errors without
receipts, concurrent clients, legacy disconnects and request-ID isolation.
Older stateless HTTP cancellation notifications cannot identify another POST;
connection close and the server deadline remain its stopping mechanisms.
These are integration and resource-policy checks, not astronomical accuracy
evidence. Parent build-dependent gates were not run; parent files, engine
archives and existing parent dist remained unchanged.

Session checks used Node 22.22.2 through a local npm exec runtime.

- `npm ci`: passed using the committed lockfile.
- `npm run check`: typecheck, Vitest and build passed.
- `test/scaffold.mcp-test.ts`: SDK handshake and synthetic natal receipt round-trip passed.
- `test/isolation.mcp-test.ts`: parent engine dry-run pack manifest excludes `mcp/`.
- Dependency audit from `npm ci`: no reported vulnerabilities.
- `git status --short`: changes confined to `mcp/`.

The parent `npm run package:contents` command was attempted and failed because
this checkout lacks `dist/calc.d.ts`. No parent build was run: the task requires
leaving `dist/` untouched. The dry-run pack isolation test passed independently;
it does not substitute for the engine's build-dependent size/content gates.

M3 session: typecheck, Vitest and isolated TypeScript build passed on Node
22.22.2. Contract tests cover input rejection, JSON Schema export, resource
policy boundaries, native receipt preservation and rejection of lossy output.
The existing engine pack isolation test passed. Engine sources, packed files,
archives and parent dist were not changed. Parent build-dependent gates retain
the scaffold limitation described above.

M4 session: `npm run check` passed on Node 22.22.2, including typecheck,
Vitest and the isolated build. `test/natal.mcp-test.ts` checks native chart and
receipt preservation, replay, unknown time, absent coordinates, polar fallback,
time scales, pinned delta-T, coverage flags, invalid requests, engine range
errors and concrete output JSON Schema. The parent pack isolation test passed.
Replay supplies an empty input assertion list; tests allow that native metadata
normalization while comparing all calculation results. These are integration
checks, not independent accuracy evidence. Parent build-dependent gates retain
the scaffold limitation above.

M6 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. `test/synastry.mcp-test.ts` covers native pair
summary and receipt preservation, replay, chart ordering, independent time
settings and coverage flags, unknown time, missing coordinates, polar fallback,
identical charts, invalid inputs, engine range failures and concrete JSON Schema.
The parent pack isolation test passed. Comparisons establish wrapper integration,
not independent accuracy or predictive validity. Parent build-dependent gates
retain the scaffold limitation above.

M10 session: `npm run check` passed on Node 22.22.2, including typecheck,
Vitest and the isolated build. `test/transports.mcp-test.ts` exercises every tool
through official SDK clients over a real stdio child, current Streamable HTTP
and older stateless HTTP. Checks cover native receipt validation, discovery,
invalid-call recovery, concurrent clients, Host and Origin guards, routing,
body limits, malformed requests, invalid ports, occupied listeners, idempotent
close, unfinished request sockets, stdin EOF and SIGINT/SIGTERM shutdown.
The CLI writes protocol messages only to stdout and diagnostics to stderr.
The parent pack isolation test passed. Checks establish transport integration,
not independent astronomical accuracy. Parent build-dependent gates retain
the scaffold limitation above; no parent build was run. Session changes are
confined to mcp/.

M7 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. `test/returns.mcp-test.ts` covers solar and lunar
native result preservation, receipt replay, solar selections, strictly subsequent
lunar selection, location defaults and relocation, omitted coordinates, null
location, house overrides, polar fallback, independent natal time settings,
unknown time, coverage flags, concrete JSON Schema, invalid requests and engine
range refusals. The parent pack isolation test passed. Comparisons establish
wrapper integration, not independent accuracy or search completeness. Parent
build-dependent gates retain the scaffold limitation above.

M8 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. `test/events.mcp-test.ts` covers Moon phase and
search preservation, receipt replay, all supported bodies, direct and retrograde
events, empty and maximum windows, default policy, coarse and refinement budget
refusals, coverage flags, strict inputs, endpoint range failures and concrete
JSON Schema. The parent pack isolation test passed. Comparisons establish
wrapper integration, not independent accuracy or search completeness.
`npm run package:contents`, retried with a cache inside mcp/, failed because the
checkout lacks `dist/calc.d.ts`, as in the scaffold session. No parent build was
run; build-dependent engine gates retain the limitation described above.
`git diff --check` passed and session changes are confined to mcp/.

M9 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. `test/server.mcp-test.ts` checks SDK discovery,
published input/output schemas, registered tool output and receipt preservation,
clock injection, strict inputs and refinements, calculation errors, unknown
tools, structured budget refusals and recovery after errors. The parent pack
isolation test passed. Checks establish protocol integration, not independent
accuracy. Parent build-dependent gates retain the scaffold limitation above.


M11 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. Existing tool, server, transport and parent pack
isolation checks passed. README JSON snippets were parsed locally; whitespace,
em-dash exclusion and document size checks passed. Client configuration was
checked against the linked official Claude Desktop, Claude Code, Cursor and
OpenAI documentation. The guide covers absolute executable paths, local HTTP,
ChatGPT custom connection form values, gateway authentication and Host/Origin
handling, privacy, receipt roles and citation limits. These checks establish
local SDK protocol integration, not live GUI compatibility, hosted gateway
operation, independent accuracy or predictive validity. Parent build-dependent
gates retain the scaffold limitation above; no parent build was run. Session
changes are confined to mcp/.

M12 session: a clean `npm ci --ignore-scripts` using the committed lockfile
passed on Node 22.23.3. `node scripts/validate.mjs`, run from mcp/ with that
runtime, passed typecheck, the complete Vitest suite and the isolated build.
The reproducible script verifies the carried engine archive digest and lockfile
source, the parent pack exclusion test, project file sizes, Markdown em-dash
exclusion, README JSON snippets, whitespace and working tree scope. It hashes
tracked parent files and existing parent dist files before and after the checks
and requires the snapshots to match. Raw logs and Vitest JSON are written under
the gitignored `.generated/` directory. The script's concise stdout is recorded
in [evidence/m12-validation.txt](evidence/m12-validation.txt).

The tested span is the synthetic fixture cases in `test/*.mcp-test.ts`, including
every tool over stdio, current HTTP and older stateless HTTP, with discovery,
native receipts, refusals, error recovery and lifecycle. These checks establish
wrapper and protocol integration only. No live client GUI, public gateway or
independent accuracy claim is made. Parent build-dependent gates retain the
scaffold limitation above; no parent build was run. See
[HANDOFF.md](HANDOFF.md) for the draft PR description and deployment limits.
