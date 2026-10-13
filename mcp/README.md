# zodiacs-astro

An MCP server for the Zodiacs astrology engine.
`createServer()` creates an unconnected server with the implemented tools
registered. The executable entry point supports stdio and local Streamable HTTP.
Client configuration and receipt citation are documented below.

## Development

Use Node 22 and run these commands from `mcp/`:

```sh
npm ci
npm run check
```

Dependencies are pinned in `package-lock.json`. The engine dependency is the
carried archive at `../artifacts/zodiacs-engine-1.0.0.tgz`, read as a local
relative dependency. Installation does not rebuild the parent engine or write
its `dist/`. The engine archive retains its own licences and NOTICE; the engine
as distributed is MIT AND CC-BY-4.0. See [LICENSING.md](../LICENSING.md).

The server uses the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
server and Node HTTP packages. The SDK client is a development dependency for
protocol tests. Generated build output, dependencies, caches and future generated
data stay in gitignored directories inside `mcp/`.

`npm run typecheck` checks source and tests. `npm test` runs only this project's
Vitest tests, named `test/*.mcp-test.ts` so the parent runner ignores them.
`npm run build` emits JavaScript and declarations into `mcp/build/`.
The isolation test checks that the parent engine pack manifest excludes `mcp/`.
The scaffold test checks SDK initialization and imports the engine and receipt
entry point from the carried archive. It checks integration, not astronomical
accuracy or predictive validity. All example birth inputs are synthetic.

The harness handles commits, pushes and draft PR updates after each session.

## Tool contracts

`src/contracts.ts` defines strict inputs for the implemented tools. Inputs take
resolved ISO instants with an explicit UTC designator or offset. Birth inputs
accept coordinates together, house settings, a known-time flag and the engine's
time-scale and fixed delta-T options. They do not infer local time or substitute
noon. Engine calculation still checks its supported ephemeris span.

Event-search windows and sample budgets have server policy limits enforced by
`test/contracts.mcp-test.ts`. These are resource limits, not completeness or accuracy
claims. The event-search sampling policy is described below.

Structured responses carry a schema version, tool-specific data and named native
natal receipt envelopes. The engine codec validates each envelope. ISO dates and
full numerical precision survive JSON serialization; unsupported values fail
instead of disappearing. Text content contains the same JSON as structured
content. Tool-specific result schemas follow with each tool implementation.
A receipt is a calculation record, not an authentication or accuracy certificate.

The natal handler in `src/tools/natal.ts` accepts `{ birth }` and returns
`data.chart` containing the native chart, with its date serialized as ISO text.
Its concrete output schema describes bodies, aspects, houses, flags and time
provenance. The `natal` receipt preserves the original input instant spelling
and the requested house system even when the engine uses polar fallback.
Unknown time keeps the supplied reference instant and suppresses angles and
houses. Coordinates are optional; missing coordinates also leave angles and
houses absent. Input validation and engine range errors propagate to the SDK
protocol boundary.

`test/natal.mcp-test.ts` checks wrapper integration and receipt replay using synthetic
inputs. Comparisons with the native engine establish preservation, not independent
astronomical accuracy.

The transit handlers in `src/tools/transits.ts` accept `{ birth, at }` for
`transitsAtTool` and `{ birth }` for `transitsNowTool`. The latter captures the
current instant once and accepts an injected clock for deterministic tests.
Both return `data.transit`, preserving the native natal chart, transit instant,
positions and moving-to-natal aspects. Dates serialize as ISO text. Aspect
`a` is the moving body and `b` is the natal body; longitudes and orbs use degrees.

`data.sky` is a coordinate-free chart at the transit instant. Its native
`transit-sky` receipt records the position conventions, time basis and reference
coverage flags. The separate `natal` receipt retains the birth request. Natal
time-scale and pinned delta-T options do not apply to the transit sky, which
uses the engine's default UTC time basis. The sky receipt covers the sky
positions; it does not encode or attest the inter-chart aspect calculation.
The wrapper preserves the engine's aspects without adding interpretation.

`test/transits.mcp-test.ts` checks preservation against native engine calls,
receipt replay, independent coverage flags, captured clock behavior and failure
paths using synthetic inputs. These are integration checks, not independent
accuracy evidence.

The synastry handler in `src/tools/synastry.ts` accepts `{ first, second }`,
each a birth input, and returns `data.synastry`. It preserves the native charts
as `a` and `b`, inter-chart aspects, closest-aspect summary, aspect counts and
element/modality balances. Aspect `a` and `aLon` belong to the first chart;
`b` and `bLon` belong to the second. Longitudes and orbs use degrees. Native
`easeful` and `charged` fields count aspect types; they are not compatibility
scores, relationship predictions or advice. The wrapper adds no score.

The `first-natal` and `second-natal` receipts preserve each chart's input
instant, requested houses, time basis and coverage flags independently. They
record the natal calculations; they do not encode or attest the pair summary.
`test/synastry.mcp-test.ts` checks native result preservation, receipt replay,
chart ordering, unknown time, absent coordinates, polar fallback, independent
time settings, validation and output schemas with synthetic inputs. These are
integration checks, not independent astronomical accuracy evidence.

The return handlers in `src/tools/returns.ts` accept `{ birth, near }` for
`solarReturnTool` and `{ birth, after }` for `lunarReturnTool`. Both return
`data.return` with the native target longitude in degrees, selected instant,
return chart, casting location and search coverage flags. Solar selection
is `nearest` by default or `most-recent` at or before the anchor. Lunar selection
is strictly after the anchor; the engine refuses unknown birth time and an
anchor before birth. Solar returns accept the supplied reference instant even
when birth time is unknown.

The casting location defaults to the natal coordinates; `location: null`
suppresses angles and houses, while explicit coordinates relocate the chart.
The requested house system defaults to the natal setting and may be overridden.
Native polar fallback and requested houses remain in the return chart receipt.
The natal longitude retains its natal time settings; the search and return chart
use the engine's default UTC time basis. Search coverage flags and chart coverage
flags are separate native fields.

The `natal` and `solar-return` or `lunar-return` receipts record the natal and
return chart calculations independently. They do not encode or attest the
crossing search, its selection or its completeness. `test/returns.mcp-test.ts`
checks native output preservation, receipt replay, selection, location, unknown
time, time settings, coverage, validation and engine refusals with synthetic
inputs. These comparisons establish wrapper integration, not independent accuracy
or predictive validity.


The Moon phase handler in `src/tools/events.ts` accepts `{ at }` and returns
`data.phase`, preserving the native elongation in degrees, elongation-based
illuminated fraction, phase name and waxing flag. `data.sky` is the native
coordinate-free chart at that instant. Its `phase-sky` receipt records the
positions and time conventions used; it does not encode the derived phase
classification or establish a photometric measurement.

The event search handler accepts `{ body, longitude, from, to, maxSamples? }`
and searches tropical geocentric longitude crossings in `(from, to]` using
`searchLongitudeCrossings`. The target longitude uses degrees. The output
preserves native ordered crossings, retrograde indicators, status and evaluation
count. `data.request` retains the input instant spelling and `data.policy`
records the applied step and budget. An empty window returns an empty completed
scan. Budget exhaustion returns `status: "refused"`, `reason: "sample-budget"`
and no crossings, including when the engine had found events before exhausting
its budget. Agents must distinguish refusal from a completed scan with no events.

The server uses a quarter-day coarse step and a default budget of 10,000
longitude evaluations, including native refinement evaluations. These policy
values are enforced in `test/events.mcp-test.ts` across the supported bodies in the
synthetic January 2026 window, and for empty, annual and refused scans.
`test/contracts.mcp-test.ts` enforces the maximum window of 366 days and maximum
requested budget of 100,000 evaluations. The budget covers the crossing solver;
endpoint and event chart receipt calculations are additional work. The native
solver assumes smooth motion and can miss events, especially around jittering
true lunar nodes. `complete` means the scan finished within budget, not that
all possible crossings were proven found. The wrapper reports
`completeness: "not-proven"` and adds no accuracy or predictive claim.

`search-start` and `search-end` receipts record chart calculations at both
endpoints even for empty or refused scans. Each found crossing has an `event-N`
receipt, numbered in crossing order. These receipts retain the native coverage
flags and time provenance for their respective instants. They do not encode or
attest the search algorithm, event direction or completeness. Both endpoints
must support chart calculation; unsupported instants fail even when the scan
would otherwise use no samples. All calculations use the engine's default UTC
time basis.

`test/events.mcp-test.ts` checks native preservation, receipt replay, coverage,
resource policy, refusal, validation and concrete output schemas with synthetic
inputs. These are wrapper integration checks, not independent astronomical
accuracy evidence.

## MCP registration

`src/server.ts` registers `natal_chart`, `transits_at`, `transits_now`,
`synastry`, `solar_return`, `lunar_return`, `moon_phase` and `event_search`.
Each advertises its strict input schema and concrete output schema through
`tools/list`. Tool annotations describe local read-only calculations.
`createServer({ clock })` can inject the current-time clock for testing.

Registration follows the official SDK's [tool API](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md).
The SDK validates inputs and outputs at the protocol boundary. Invalid arguments
and engine calculation refusals return text with `isError: true`, without
structured content or invented receipts. An unknown tool returns a JSON-RPC
invalid-params error. Search budget refusal is a successful structured response
whose search status is `refused`; agents must inspect that status.

`test/server.mcp-test.ts` uses the official SDK client and linked in-memory
transports to check discovery, schemas, every registered handler, receipt
preservation, validation refinements and failure recovery. These checks
establish protocol integration, not astronomical accuracy.

## Running transports

Build from `mcp/`, then launch the compiled executable directly:

```sh
npm run build
node build/cli.js stdio
```

Omitting the transport also selects stdio. The executable uses the SDK's
`serveStdio` entry with a fresh server for the connection. Standard output
contains only MCP messages. Transport diagnostics go to standard error and
do not log tool arguments or results. Closing standard input ends the process;
SIGINT and SIGTERM close the transport before exiting. Keep stdin open until
responses have arrived.

For local Streamable HTTP:

```sh
node build/cli.js http --port 3000
```

The example port is checked by `test/transports.mcp-test.ts`. The endpoint is
`/mcp`, bound to IPv4 loopback. `startHttp({ port: 0 })` selects an available
port for embedded use and returns `{ url, close }`. Closing is idempotent,
stops new connections and closes active sockets, including unfinished bodies.
Signals use the same close path. A calculation runs synchronously on the Node
thread, so shutdown waits for that calculation to yield; this is not a hard
execution deadline.

The official SDK's `createMcpHandler` and Node adapter serve a fresh instance
per HTTP request. Current protocol requests and older stateless Streamable HTTP
requests are supported. No session identifier is issued or retained. Older
session GET and DELETE operations return method-not-allowed responses. The
endpoint accepts the SDK's JSON and SSE response forms; it does not implement
the separate legacy HTTP+SSE transport.

The Node adapter and SDK handler limit POST bodies to 65,536 bytes before
creating a calculation server. `test/transports.mcp-test.ts` checks requests at
that boundary and just above it. This is a resource policy, not a chart-size
or accuracy claim. HTTP responses use `Cache-Control: no-store`. The official
localhost guards validate Host and any supplied Origin before routing. There
is no CORS support or built-in authentication. Remote access requires an
authenticated HTTPS gateway that checks the public Host and Origin before
forwarding with a permitted local host. Gateway configuration and client
setup are described below.

The entry points follow the SDK's [Node adapter API](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/node/).
`test/transports.mcp-test.ts` uses real child processes and loopback HTTP with
official SDK clients. It exercises every tool with synthetic inputs over
stdio, current HTTP and older stateless HTTP, validates returned receipt
envelopes, and checks errors, recovery, body limits, independent clients,
listener failures, EOF and signal shutdown. These tests establish transport
integration, not independent astronomical accuracy.

## Client configuration

Install and build from `mcp/` before configuring a client:

```sh
npm ci
npm run build
```

Use a Node runtime allowed by this project's `package.json`, rather than the
parent engine's broader range. Replace `/absolute/path/to/node` with that
executable and `/absolute/path/to/engine` with your checkout. Absolute paths
avoid dependence on a GUI application's PATH or working directory. Windows
paths need escaped backslashes in JSON. There is no published MCP package or
required API key. The client launches the stdio process itself.

### Claude Desktop

Open Settings, Developer, Edit Config and merge this entry into the existing
`mcpServers` object in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zodiacs-astro": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/engine/mcp/build/cli.js", "stdio"]
    }
  }
}
```

Restart Claude Desktop and check discovery. The config lives under
`~/Library/Application Support/Claude/` on macOS or `%APPDATA%\Claude\` on
Windows. See the official [local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
for config locations and stderr logs. Preserve other server entries.

### Claude Code

Register stdio, then inspect it in `/mcp` inside Claude Code:

```sh
claude mcp add --transport stdio --scope local zodiacs-astro -- /absolute/path/to/node /absolute/path/to/engine/mcp/build/cli.js stdio
```

Alternatively, start the HTTP executable separately and register its URL:

```sh
claude mcp add --transport http --scope local zodiacs-astro http://127.0.0.1:3000/mcp
```

Choose one registration for this name. The HTTP entry connects to an existing
listener; it does not launch this server. The official
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp) explains scopes,
registration and removal.

### Cursor

Merge this into `.cursor/mcp.json` in the engine checkout, or into
`~/.cursor/mcp.json` for personal global use:

```json
{
  "mcpServers": {
    "zodiacs-astro": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/engine/mcp/build/cli.js", "stdio"]
    }
  }
}
```

For an already running local HTTP listener, use this instead:

```json
{
  "mcpServers": {
    "zodiacs-astro": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Check discovery in Cursor's MCP settings. See the official
[Cursor MCP documentation](https://prod.cursor.com/docs/mcp) for configuration
locations and tool controls. These are templates for your client; this project
does not write configuration outside `mcp/`.

### ChatGPT connectors and custom MCP servers

For the public URL route, enter these values in the custom MCP connection form:

```json
{
  "name": "zodiacs-astro",
  "description": "Astrology calculations with native engine receipts",
  "url": "https://astro.example.com/mcp"
}
```

This is a form-value template, not a ChatGPT config file or live endpoint.
Supply your own authenticated HTTPS gateway as described below. The current
[official OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
directs users to ChatGPT Plugins, Add custom MCP server, then name, URL and
authentication settings. Review discovery and install the resulting plugin.
Account and workspace policies govern access; connector and app labels can
vary with client version. Follow the linked guide for your account's UI.
It also documents Secure MCP Tunnel for private connections; this project
does not configure or test that service.

The loopback URL cannot serve as a public ChatGPT endpoint. This server supplies
no OAuth discovery, token validation or account integration. The gateway must
implement the authentication flow supported by the chosen connection, including
discovery when required. Choosing authentication in the form does not add it to
the backend. Vitest exercises official SDK clients, not live client GUIs,
ChatGPT connections or gateways.

## Deployment boundary

Keep the calculation listener on loopback. Place the HTTPS gateway on the same
host or provide a private route to the listener. Route public `/mcp` to
`http://127.0.0.1:3000/mcp`; the port example is checked by
`test/transports.mcp-test.ts`.

Authenticate and authorize requests before forwarding. Validate the public Host
and any supplied Origin against a gateway allowlist, then set upstream Host to
the permitted loopback authority. Backend localhost guards reject public Origin
values too. If the gateway removes or maps Origin upstream, do so only after
validating the original value. Forward MCP protocol and content negotiation
headers and allow JSON or SSE responses without buffering away the stream.
The stateless backend does not require sticky sessions.

Apply gateway request limits, rate limits and bounded concurrency. Calculations
are synchronous; the search sample budget is not a wall-clock timeout. A gateway
timeout does not cancel a running calculation. Hard deadlines require external
process supervision. Disable caching and avoid logging request bodies, result
bodies or authorization headers: natal inputs and receipts contain birth details.
TLS, authentication, OAuth, CORS, quotas, persistence and public routing belong
to the deployment. An authorization header forwarded to the backend is not
checked there.

Tools calculate locally without fetching places or resolving civil wall times.
Resolve local-time gaps, folds and historical rules before sending a birth
instant. The server adds no database or profile store. Clients and gateways may
retain messages independently. Review their settings before using private
inputs. Repository examples and tests use synthetic data only.

## Receipt citation for agents

Read `structuredContent` with `schemaVersion: "zodiacs-astro/1"`. Text content
contains the same JSON. Inspect errors and search status first: `isError: true`
has no successful structured result or receipt. Search `status: "refused"`
is a resource refusal, not evidence that no event exists.

Select `receipts` entries by `role`, rather than array order. Each entry contains
`{ role, envelope }`. The envelope separates `receipt` (request and conventions)
from `result` (recorded chart values).

| Tool | Receipt roles | Recorded calculations |
| --- | --- | --- |
| `natal_chart` | `natal` | Natal chart |
| `transits_at`, `transits_now` | `natal`, `transit-sky` | Natal chart and sky at the transit instant |
| `synastry` | `first-natal`, `second-natal` | Each natal chart independently |
| `solar_return` | `natal`, `solar-return` | Natal and selected return charts |
| `lunar_return` | `natal`, `lunar-return` | Natal and selected return charts |
| `moon_phase` | `phase-sky` | Sky positions used for the phase |
| `event_search` | `search-start`, `search-end`, `event-N` | Endpoint and found event charts |

Identify the tool call in the conversation and receipt role, then cite the
returned `envelope.receipt.engine.name`, `.engine.version`, `.engine.ephemeris`,
`.instant`, `.timeScale`, `.conventions`, `.coverage` and `.resultFlags`.
Inspect `.houses.requested` and `.houses.actual` when discussing houses.
`envelope.result.deltaT` and `.timeScale` record the calculation time basis.
Use actual returned fields, not inferred defaults or hardcoded engine versions.
Retain complete JSON when a calculation record is needed, subject to privacy
choices. Do not invent a public receipt URL or signature.

For practice, send `natal_chart` these synthetic arguments, exercised by
`test/natal.mcp-test.ts`:

```json
{
  "birth": {
    "utc": "2000-02-03T04:05:06.123+05:30",
    "latitude": 12,
    "longitude": 34
  }
}
```

Fill this citation pattern from the actual response:

> Calculated with zodiacs-astro, tool natal_chart, receipt role natal,
> [engine name and version], [ephemeris name and version], instant [instant]
> on [timeScale], using [conventions], with coverage [coverage and resultFlags].

A receipt preserves a structurally validated calculation claim. It does not
prove authenticity, independent accuracy or predictive validity. Chart receipts
do not attest inter-chart aspects, compatibility summaries, return selection,
phase classification or search completeness. Cite those as tool results with
their stated limitations. Do not turn aspect counts into a compatibility
percentage or call a completed sampled scan exhaustive. Unknown birth time
retains the supplied reference instant; do not infer noon or describe it as
verified birth time. Avoid reproducing private birth details publicly.

Client guidance was checked against the linked official pages during M11.
[VALIDATION.md](VALIDATION.md) records local protocol evidence; live client
setup and gateway verification remain deployment checks for the operator.
