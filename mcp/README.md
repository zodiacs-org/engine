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
