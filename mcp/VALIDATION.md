# Scaffold validation

Session checks used Node 22.22.2 through a local npm exec runtime.

- `npm ci`: passed using the committed lockfile.
- `npm run check`: typecheck, Vitest and build passed.
- `test/scaffold.test.ts`: SDK handshake and synthetic natal receipt round-trip passed.
- `test/isolation.test.ts`: parent engine dry-run pack manifest excludes `mcp/`.
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
Vitest and the isolated build. `test/natal.test.ts` checks native chart and
receipt preservation, replay, unknown time, absent coordinates, polar fallback,
time scales, pinned delta-T, coverage flags, invalid requests, engine range
errors and concrete output JSON Schema. The parent pack isolation test passed.
Replay supplies an empty input assertion list; tests allow that native metadata
normalization while comparing all calculation results. These are integration
checks, not independent accuracy evidence. Parent build-dependent gates retain
the scaffold limitation above.

M6 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. `test/synastry.test.ts` covers native pair
summary and receipt preservation, replay, chart ordering, independent time
settings and coverage flags, unknown time, missing coordinates, polar fallback,
identical charts, invalid inputs, engine range failures and concrete JSON Schema.
The parent pack isolation test passed. Comparisons establish wrapper integration,
not independent accuracy or predictive validity. Parent build-dependent gates
retain the scaffold limitation above.

M10 session: `npm run check` passed on Node 22.22.2, including typecheck,
Vitest and the isolated build. `test/transports.test.ts` exercises every tool
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
Vitest and the isolated build. `test/returns.test.ts` covers solar and lunar
native result preservation, receipt replay, solar selections, strictly subsequent
lunar selection, location defaults and relocation, omitted coordinates, null
location, house overrides, polar fallback, independent natal time settings,
unknown time, coverage flags, concrete JSON Schema, invalid requests and engine
range refusals. The parent pack isolation test passed. Comparisons establish
wrapper integration, not independent accuracy or search completeness. Parent
build-dependent gates retain the scaffold limitation above.

M8 session: `npm run check` passed on Node 22.23.3, including typecheck,
Vitest and the isolated build. `test/events.test.ts` covers Moon phase and
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
Vitest and the isolated build. `test/server.test.ts` checks SDK discovery,
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
