# Engine HTTP server

This private package is a self-hosted HTTP adapter for the engine in this
checkout. The current milestone implements health, readiness, JSON logging
and process lifecycle. Calculation routes, API-key authentication, rate limits,
OpenAPI and Docker deployment are tracked in [PLAN.md](PLAN.md).

## Run from a checkout

Use Node.js matching `engines.node` in [package.json](package.json), on the
Node 22 release line. From the repository root:

```sh
cd server
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Dependencies and the lockfile belong to this directory. The server imports
the engine's public source entries by relative path. Its build bundles those
sources into ignored `server/build/` and resolves external dependencies from
`server/node_modules/`. No root dependency installation or engine build is
needed. The ephemeris dependency remains pinned to the engine's exact version.

The listener defaults to `127.0.0.1:3000`. `HOST` and `PORT` override that
address; `PORT=0` requests an available port, reported in the `server_started`
JSON log. `LOG_LEVEL` defaults to `info` and accepts the levels listed in
`src/config.ts`. Invalid configuration fails startup without logging supplied
values. These defaults and validation rules are checked in
`test/config.vitest.ts` and `test/process.vitest.ts`.

```sh
curl --fail http://127.0.0.1:3000/healthz
curl --fail http://127.0.0.1:3000/readyz
```

## Current HTTP behavior

`GET /healthz` reports that the HTTP handler is running. `GET /readyz` reports
readiness after startup has computed a synthetic natal chart and created its
receipt using the actual engine. Neither route needs credentials. Shutdown
marks the server unready and closes its listener on SIGINT or SIGTERM.

Successful JSON responses have `data`, `engine`, `receipts` and `requestId`.
Errors replace `data` with an `error` containing a stable `code` and a generic
`message`. Unknown routes return `not_found`. The engine identity comes from
its own exported version and ephemeris constants. Infrastructure requests
produce no calculation receipt, so their `receipts` list is empty. The startup
probe's chart is not returned as a receipt for a health request.

Responses have a server-generated `x-request-id` matching the JSON body and
disable caching. The server does not trust a caller's request ID. Request logs
record the method, matched route template, HTTP status and elapsed milliseconds;
unmatched paths are recorded as `unmatched`. They omit raw URLs, query strings,
headers, bodies and raw errors. Route, error and logging behavior is covered
by `test/app.vitest.ts`.

## Development and isolation

```sh
npm run typecheck
npm test
npm run check:package
```

The test script builds the CLI before Vitest checks both in-process HTTP
requests and a real loopback listener. Tests use `*.vitest.ts` filenames and an
explicit local include pattern so the root engine's default Vitest discovery
does not pick them up. All example and probe instants are synthetic.

`check:package` asks npm for a dry-run file list with lifecycle scripts
disabled and verifies that `server/` is excluded. It writes no archive and
does not build root `dist/`. It does not replace the repository's full package
contents gate, which requires an existing engine build.

Keep runtime secrets in environment variables or the ignored `secrets/`
directory. `.env` files and `api-keys.json` are also ignored. Generated build
output, dependency installs, caches and raw logs stay ignored. No credentials
are included in this package.

Server code is MIT under [the repository licence](../LICENSE). A server build
also contains engine code and data covered by [LICENSING.md](../LICENSING.md)
and [NOTICE](../NOTICE); retain those notices when redistributing it.
