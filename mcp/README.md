# zodiacs-astro

An MCP server under construction for the Zodiacs astrology engine. The current
scaffold creates an unconnected server; tools and transport entry points follow
in [PLAN.md](PLAN.md).

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
Vitest tests. `npm run build` emits JavaScript and declarations into `mcp/build/`.
The isolation test checks that the parent engine pack manifest excludes `mcp/`.
The scaffold test checks SDK initialization and imports the engine and receipt
entry point from the carried archive. It checks integration, not astronomical
accuracy or predictive validity. All example birth inputs are synthetic.

The harness handles commits, pushes and draft PR updates after each session.

## Tool contracts

`src/contracts.ts` defines strict inputs for the planned tools. Inputs take
resolved ISO instants with an explicit UTC designator or offset. Birth inputs
accept coordinates together, house settings, a known-time flag and the engine's
time-scale and fixed delta-T options. They do not infer local time or substitute
noon. Engine calculation still checks its supported ephemeris span.

Event-search windows and sample budgets have server policy limits enforced by
`test/contracts.test.ts`. These are resource limits, not completeness or accuracy
claims. The event-search implementation will choose its sampling policy.

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
houses absent. Input validation and engine range errors propagate to the future
protocol boundary. Registration and transports remain planned milestones.

`test/natal.test.ts` checks wrapper integration and receipt replay using synthetic
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

`test/transits.test.ts` checks preservation against native engine calls,
receipt replay, independent coverage flags, captured clock behavior and failure
paths using synthetic inputs. These are integration checks, not independent
accuracy evidence. MCP registration remains a later milestone.

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
`test/synastry.test.ts` checks native result preservation, receipt replay,
chart ordering, unknown time, absent coordinates, polar fallback, independent
time settings, validation and output schemas with synthetic inputs. These are
integration checks, not independent astronomical accuracy evidence.
