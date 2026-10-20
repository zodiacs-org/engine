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

For the complete CI gate and a reproducible local report, run
`node scripts/validate.mjs` on Node 22 after installation. It runs typecheck,
build and the complete test suite, checks the carried engine archive and parent
package isolation, and verifies documentation, file sizes and project disk use.
The same command runs in [.github/workflows/mcp.yml](../.github/workflows/mcp.yml)
after installation from this project's lockfile. See [VALIDATION.md](VALIDATION.md)
for the checked scope and committed evidence. Raw reports stay in `.generated/`.

Dependencies are pinned in `package-lock.json`. The engine dependency is the
carried archive at `../artifacts/zodiacs-engine-1.0.0.tgz`, read as a local
relative dependency. Installation does not rebuild the parent engine or write
its `dist/`. The engine archive retains its own licences and NOTICE; the engine
as distributed is MIT AND CC-BY-4.0. See [LICENSING.md](../LICENSING.md).

The server uses the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
server and Node HTTP packages. The SDK client is a development dependency for
protocol tests. Generated build output, dependencies, caches and future generated
data stay in gitignored directories inside `mcp/`.

`npm run typecheck` checks source and tests. `npm test` builds the search worker
and runs only this project's Vitest tests, named `test/*.mcp-test.ts` so the
parent runner ignores them.
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

Registered `event_search` calls run in a separate worker thread. The server's
default execution budget is 10,000 milliseconds, including worker startup,
endpoint charts, the solver and receipt creation. The process permits one
active search worker across its server instances and immediately refuses an
additional search with a tool error. There is no waiting queue. Other tools
remain available during a search. These execution policies are enforced by
[test/search-worker.mcp-test.ts](test/search-worker.mcp-test.ts) and
[test/cancellation.mcp-test.ts](test/cancellation.mcp-test.ts).

Cancellation, deadline expiry, a busy worker or a worker failure produces no
partial events or receipts. Deadline and busy refusals use `isError: true`
without structured content; they are separate from the native structured
`sample-budget` refusal. The runner waits for worker exit before releasing the
slot. A deadline stops the worker through Node's termination mechanism;
cleanup and response delivery can take additional time. Stopping a search does
not establish that its window contained no events.

Embedded callers may supply `eventSearchRunner: new EventSearchRunner({ budgetMs })`
to `createServer`, `startStdio` or `startHttp`; import the class from
`build/event-search-runner.js`. The budget must be an integer from 1 through
30,000 milliseconds, as enforced by the worker tests. Transport shutdown closes
the runner and waits for its worker to exit. The exported synchronous
`eventSearchTool` calculation helper retains its native integration contract;
the registered MCP tool always uses the worker runner.

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

Tool descriptions state the computed geometry and the scope of native receipts.
Inter-chart aspects and pair summaries are derived tool results; their receipts
record the individual charts. Synastry aspect-type counts remain counts.
`test/transports.mcp-test.ts` scans discovered descriptions, nested schema
descriptions and titles, and synthetic successful, refused and error outputs for
predictive wording across its transport cases. The scan inspects property names,
string values and each text content block, including the JSON copy of a result.
`test/factual-language.mcp-test.ts` checks the scanner with rejected fragments
and altered outputs. It preserves the exact native `predicted` time-source label
only in chart and receipt `deltaT.segment` and
`timeScale.ut1MinusUtc.source` fields. These labels record Earth-rotation data
provenance. The vocabulary scan guards against wording regressions and supports
manual review; it does not establish semantic or astronomical correctness.

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
Signals use the same close path and stop active search workers. Other tools
calculate synchronously on the Node thread, so shutdown waits for those
calculations to yield.

The official SDK's `createMcpHandler` and Node adapter serve a fresh instance
per HTTP request. Current protocol requests and older stateless Streamable HTTP
requests are supported. No session identifier is issued or retained. Older
session GET and DELETE operations return method-not-allowed responses. The
endpoint accepts the SDK's JSON and SSE response forms; it does not implement
the separate legacy HTTP+SSE transport.

Stdio honours MCP request cancellation notifications on its connection.
Current Streamable HTTP clients cancel by closing the individual request's
response stream; that disconnect stops its search worker. A disconnected
older HTTP request also stops its worker. Older stateless HTTP clients that
send a separate `notifications/cancelled` POST cannot identify another request
securely: request IDs can overlap between independent clients, and this server
does not retain client sessions. Such a notification does not cancel another
POST. Close the original connection, use the current protocol, or let the
server execution budget stop the work. Cancellation tests cover both the
supported mechanisms and isolation between clients.

The Node adapter and SDK handler limit POST bodies to 65,536 bytes by default,
before creating a calculation server. Both use the same configured cap and count
UTF-8 bytes, including for chunked bodies without Content-Length. Oversized bodies
receive HTTP 413 and a closed connection. The cap applies to request bodies, not
response sizes. [test/http-limits.mcp-test.ts](test/http-limits.mcp-test.ts) checks
byte boundaries, streamed bodies, refusals and recovery. These are resource
policies, not chart-size or accuracy claims. HTTP responses use
`Cache-Control: no-store`. The official localhost guards validate Host and any
supplied Origin before routing. There
is no CORS support. Optional bearer authentication is described below. Remote
access requires an authenticated HTTPS gateway that checks the public Host and
Origin before forwarding with a permitted local host. Gateway configuration
and client setup are described below.

HTTP also admits at most 120 requests per 60,000-millisecond fixed window by
default. A window starts with the first request after startup or the previous
window's expiry. The limit is shared by every client of one listener. Every
`/mcp` request counts, including initialization, notifications, unsupported
methods, malformed or oversized bodies and failed authentication. Host, Origin
and exact-path guards run first; the rate check runs before authentication or
body reading. Exhaustion returns HTTP 429 with `Retry-After` as a positive number
of whole seconds, rounded up, `Cache-Control: no-store` and `Connection: close`.
The rejected body is not read and no calculation server is created. Refusals do
not extend the window. Existing response streams and calculations continue.

Rate tracking retains one window start and request count per listener, without
client maps or cleanup timers. It uses a monotonic clock. New connections,
credentials and Forwarded or X-Forwarded-For headers do not create another quota.
Separate listeners have independent quotas, and restarting a listener clears its
count. Apply per-client quotas at the authenticated gateway when needed.

Operators can configure the policies without disabling them:

```sh
node build/cli.js http --max-requests 120 --rate-window-ms 60000 --max-request-bytes 65536
```

Embedded callers supply `startHttp({ limits: { maxRequests, windowMs,
maxRequestBytes } })`, omitting fields to keep defaults. Each value must be a
positive safe integer; `maxRequestBytes` may only reduce the existing body cap.
Invalid configuration prevents startup. Stdio rejects these CLI options and
keeps its existing transport behavior. The defaults, configuration validation,
rate boundaries, recovery, guard ordering and authentication interaction are
enforced by [test/http-limits.mcp-test.ts](test/http-limits.mcp-test.ts).

HTTP bearer authentication is off by default. Select an environment variable
name or a file path whose contents hold the credential:

```sh
node build/cli.js http --port 3000 --auth-token-env ENV_NAME
node build/cli.js http --auth-token-file /absolute/operator/path --port 3000
```

Choose one source. The source options and `--port` may appear in any order.
There is no option for passing the credential itself on the command line.
Embedded callers use `startHttp({ auth: { tokenEnv: "ENV_NAME" } })` or
`startHttp({ auth: { tokenFile: "/absolute/operator/path" } })`.
Stdio rejects authentication options and does not read credentials. Setting
an environment variable alone does not enable HTTP authentication.

The source is read once before the listener starts. Missing, empty or invalid
credentials prevent startup; file sources must be readable regular files and
are read with a size bound. A credential must match the ASCII pattern
`[A-Za-z0-9._~+/-]+=*` and contain at most 4096 bytes. A file may end with one
LF or CRLF; other whitespace is rejected. Environment values are used without
trimming. Restart the process after changing the source to rotate the
credential. Keep credential files outside the checkout and provision
environment values through the operator's secret storage. Diagnostics do not
include credentials or source paths.

When configured, the backend checks the `Authorization` bearer credential on
every `/mcp` request admitted by the rate policy, before parsing the body or
creating a calculation server.
It compares SHA-256 digests with `timingSafeEqual` and rejects duplicate
authorization headers. Missing, malformed and wrong credentials receive the
same HTTP 401 response with `WWW-Authenticate: Bearer realm="zodiacs-astro"`
and `Cache-Control: no-store`, closing the connection without reading the body.
Credentials in URLs or request bodies do not authenticate a request.
[test/auth.mcp-test.ts](test/auth.mcp-test.ts) enforces
the credential syntax, size policy, source loading, request rejection and
CLI behavior. This shared credential does not provide OAuth or account
authorization.

The entry points follow the SDK's [Node adapter API](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/node/).
`test/transports.mcp-test.ts` uses real child processes and loopback HTTP with
official SDK clients. It exercises every tool with synthetic inputs over
stdio and HTTP in current and older protocol modes. Each structured result is
validated against the JSON schema returned by `tools/list`, with damaged copies
checked for rejection. Native receipt envelopes are parsed separately because
their codec checks go beyond the advertised JSON schema. Cases cover unknown
time, polar fallback, return relocation, populated and empty scans, and structured
sample-budget refusals. Input and calculation errors are checked for every tool,
along with unknown tools, recovery, body limits, independent clients, listener
failures, EOF and signal shutdown. `test/cancellation.mcp-test.ts` also checks
deadline and busy refusals without partial results over stdio and HTTP. These
tests establish transport integration, not independent astronomical accuracy.

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
Stdio needs no bearer credential and rejects HTTP authentication and limit flags.

For authenticated local HTTP, provision `ZODIACS_MCP_TOKEN` through your secret
storage in the listener's environment, then start it separately from `mcp/`:

```sh
node build/cli.js http --port 3000 --auth-token-env ZODIACS_MCP_TOKEN --max-requests 120 --rate-window-ms 60000 --max-request-bytes 65536
```

The command contains only the variable name. To load the same credential from
an operator-managed file, replace `--auth-token-env ZODIACS_MCP_TOKEN` with
`--auth-token-file /absolute/operator/path`. Keep that file outside the checkout
and readable only by the operator and service account. Restart the listener to
rotate its credential, then reconnect clients with the new value.

The HTTP templates below reference an environment variable; they contain no
credential value. Provision the matching value in the client's launch
environment too. A client cannot read the listener's environment or token file
automatically. Keep the interpolation syntax literal in JSON and let the client
expand it; do not substitute a credential into a shell command or committed
configuration. Restart a GUI client after changing its launch environment.
The combined command uses the policies enforced by
[test/http-limits.mcp-test.ts](test/http-limits.mcp-test.ts); source loading and
header authentication are covered by [test/auth.mcp-test.ts](test/auth.mcp-test.ts).
For remote access, configure the HTTPS gateway described below and use its
client authentication flow. Keep the backend credential between the gateway
and listener.

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

For a trusted local HTTP listener with backend authentication disabled, register
its URL instead:

```sh
claude mcp add --transport http --scope local zodiacs-astro http://127.0.0.1:3000/mcp
```

For the authenticated local HTTP command above, use this entry in a private
client configuration file supplied through `--mcp-config /absolute/operator/client.json`:

```json
{
  "mcpServers": {
    "zodiacs-astro": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${ZODIACS_MCP_TOKEN}"
      }
    }
  }
}
```

Choose one registration for this name. The HTTP entry connects to an existing
listener; it does not launch this server. The official
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp) explains scopes,
registration, environment expansion and removal. Do not pass an expanded
credential through the CLI's header option: command history and process
arguments can expose it.

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

For the authenticated local HTTP command above, use this instead:

```json
{
  "mcpServers": {
    "zodiacs-astro": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${env:ZODIACS_MCP_TOKEN}"
      }
    }
  }
}
```

Cursor uses `${env:NAME}` for header interpolation. Omit `headers` only when
connecting to a trusted local listener with backend authentication disabled.
Check discovery in Cursor's MCP settings. See the official
[Cursor MCP documentation](https://prod.cursor.com/docs/mcp) for configuration
locations, interpolation and tool controls. These are templates for your client;
this project does not write configuration outside `mcp/`.

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
[official connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)
directs users to ChatGPT Plugins, Add custom MCP server, then name, URL and
authentication settings. Review discovery and install the resulting plugin.
Account and workspace policies govern access; connector and app labels can
vary with client version. Follow the linked guide for your account's UI.
It also documents Secure MCP Tunnel for private connections; this project
does not configure or test that service.

The loopback URL cannot serve as a public ChatGPT endpoint. This server supplies
no OAuth discovery or account integration. Its optional shared bearer credential
is separate from the gateway's client authentication; it is not a custom bearer
field in this connection form. The gateway must implement the authentication
flow supported by the chosen connection, including discovery when required.
Choosing authentication in the form does not add it to the backend.
Vitest exercises official SDK clients, not live client GUIs,
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
headers unchanged, including `Accept`, `Content-Type`, `MCP-Protocol-Version`,
`Mcp-Method` and `Mcp-Name` when sent by the client. Preserve additional MCP
headers used by the negotiated protocol; do not invent a protocol version or
rewrite request IDs. Allow JSON or SSE responses without buffering away the stream.
The stateless backend does not require sticky sessions.

Apply gateway request limits, rate limits and bounded concurrency. The search
sample budget and worker execution deadline apply independently. A gateway
timeout stops a search only when it closes the upstream request stream; verify
that behavior with the deployed gateway. Other calculation tools remain
synchronous and do not have a worker deadline. Disable caching and avoid logging
request bodies, result bodies or authorization headers: natal inputs and receipts
contain birth details.
TLS, client authentication and authorization, OAuth, CORS, per-client quotas,
persistence and public routing belong to the deployment. If backend bearer
authentication is configured, the gateway must replace the client's
`Authorization` header with the backend credential on upstream requests after
authenticating and authorizing the client. Supply a single header and keep it
out of gateway logs and client-visible responses. When backend authentication
is disabled, forwarded authorization
headers are not checked there.

### Gateway operator checklist

- [ ] Keep the listener private on loopback, terminate HTTPS at the gateway,
  and route to the exact `/mcp` path without a trailing slash or query string.
  Verify public Host and supplied Origin allowlists before mapping upstream
  Host or Origin to permitted local values.
- [ ] Authenticate and authorize clients at the gateway. Enable backend bearer
  authentication using a protected environment variable or file; inject its
  credential only after gateway authorization. Test missing and wrong client
  credentials, valid access, and backend credential rotation without logging values.
- [ ] Set gateway body, per-client rate and concurrency limits. Keep the backend
  policies enabled and account for its shared listener quota, including
  initialization, notifications and failed authentication. Preserve HTTP 413,
  HTTP 429 and `Retry-After`; avoid automatic retry loops.
- [ ] Preserve MCP headers and JSON/SSE content types and stream responses
  without caching or buffering. Verify discovery and a synthetic tool call
  through the gateway with the actual client and its negotiated protocol.
- [ ] Verify client cancellation and gateway timeouts close the original
  upstream request stream and release the search worker. Older stateless
  cancellation POSTs cannot stop another request. The worker deadline bounds
  event searches; other tools calculate synchronously. Treat interrupted or
  refused work as incomplete, and check that a later request succeeds.
- [ ] Disable request/result body and authorization-header logging in the
  gateway, service, tracing and error capture. Keep operational logs private,
  limit retention, and review client history settings for birth details and receipts.
- [ ] Use a synthetic SDK initialization and tool call for a deployment check;
  `/mcp` has no health route. Older stateless GET/DELETE responses are
  method-not-allowed, and probes consume the shared quota. Verify signal
  shutdown closes active search workers and connections.

Backend behavior in this checklist is exercised locally by
[test/auth.mcp-test.ts](test/auth.mcp-test.ts),
[test/http-limits.mcp-test.ts](test/http-limits.mcp-test.ts),
[test/cancellation.mcp-test.ts](test/cancellation.mcp-test.ts) and
[test/transports.mcp-test.ts](test/transports.mcp-test.ts). A deployed gateway
needs its own checks; these tests do not exercise a public route or client GUI.

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

Client guidance and credential interpolation were checked against the linked
official pages during P6. Local protocol checks do not run those client applications.
[VALIDATION.md](VALIDATION.md) records local protocol evidence; live client
setup and gateway verification remain deployment checks for the operator.
