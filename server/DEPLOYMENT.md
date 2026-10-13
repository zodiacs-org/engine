# Self-hosting the engine HTTP server

The server runs from this checkout or the included Dockerfile. It computes
through the engine's public source entries and bundles them into
`server/build/`. Installing or building the server does not require the root
package's dependencies or write root `dist/`. Keep the checkout's engine and
server together when building. API contracts, receipt scopes and calculation
limits are documented in [README.md](README.md) and the served
`/openapi.json`.
Client request, receipt and retry guidance is in [CLIENTS.md](CLIENTS.md).

## Run from a checkout

Use the Node release range in [package.json](package.json). From the repository
root:

```sh
npm --prefix server ci
npm --prefix server run typecheck
npm --prefix server test
npm --prefix server run build
```

Create an ignored credential file without displaying a key or overwriting an
existing file:

```sh
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('server/secrets', { recursive: true, mode: 0o700 });
writeFileSync('server/secrets/api-keys.json', JSON.stringify([
  randomBytes(32).toString('base64url')
]) + '\n', { flag: 'wx', mode: 0o600 });
NODE
API_KEYS_FILE="$PWD/server/secrets/api-keys.json" node server/build/main.js
```

The process defaults to the loopback listener described in
[README.md](README.md#run-from-a-checkout). Set `HOST`, `PORT` and `LOG_LEVEL`
in the service manager when needed. Use the direct `node` executable as the
managed process so the supervisor sends termination signals to the server.
Run it as a dedicated nonroot account with read access to the build,
dependencies and credential file. Keep credentials outside build output and
grant that account access only to the secrets it needs.

## Credential sources and rotation

Configure exactly one source:

| Variable | Content |
| --- | --- |
| `API_KEYS_FILE` | Path to a regular file containing a JSON array of key strings. Absolute paths avoid dependence on the process working directory. |
| `API_KEYS` | The same JSON array, injected into the process environment by the service manager or secret manager. |

The file-generation example supplies the accepted key format. Full format and
configuration limits are in [README.md](README.md#api-keys), enforced by
[test/api-keys.vitest.ts](test/api-keys.vitest.ts). Both sources, invalid JSON,
empty lists, duplicate keys and unreadable files fail startup. With neither
source present, discovery and probes work but every protected request is
denied. A successful readiness probe alone does not verify key provisioning.

For an environment-based checkout run, the same generated file can feed the
environment without putting a literal credential into command history or
printing it to the terminal:

```sh
API_KEYS="$(cat server/secrets/api-keys.json)" node server/build/main.js
```

Use this with shell tracing disabled and with `API_KEYS_FILE` unset. For a
container, have the secret manager populate the launch process's `API_KEYS`
environment and pass `--env API_KEYS` to Docker. Do not place a literal key in
the Docker command, an image build argument, a Dockerfile or a committed env
file. The application does not load `.env` files itself. Host and container
administrators may inspect process environments, so a file mount avoids
including the key in container environment metadata.

Keys are a startup snapshot. Editing a mounted file, replacing a symlink target
or changing the service manager's environment does not reload a running
process. Prepare the replacement configuration, replace the server process or
container, and verify an authenticated calculation. For overlap during a
rotation, start with both the old and new keys, migrate clients, then replace
the process again with the old key removed. Each key has its own bucket, and
every restart resets the buckets. Revocation is complete only after every
replica using the old configuration has stopped. File bind mounts may continue
to refer to an old file after an atomic host replacement; recreate the
container to mount the replacement.

Persist the key configuration in the host secret store across deployments.
The server has no account database or durable request queue and needs no
writable application volume. Clients retain any calculation results and
receipts they need. Protect secret backups using the same access controls as
the live configuration.

## Build and start a container

Run this from the repository root, since the build needs both `src/` and
`server/`:

```sh
docker build -f server/Dockerfile -t zodiacs-engine-http .
```

[Dockerfile.dockerignore](Dockerfile.dockerignore) permits only build inputs
and licence notices into the context. Credentials, local dependencies,
generated output and git metadata are excluded. The build installs the
server's locked dependencies and bundles the engine source. The runtime
contains the server build, production dependencies, healthcheck script and
licence notices. It runs `node build/main.js` directly as the image's `node`
user, with `/app/server` as its working directory.

The runtime defaults to `HOST=0.0.0.0` inside the container so the container
network can reach it. Publish only the intended host interface. This example
publishes to host loopback for a reverse proxy on that host and mounts the
credential file read-only:

```sh
docker run --detach --name engine-api \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --stop-timeout 40 \
  --publish 127.0.0.1:3000:3000 \
  --env API_KEYS_FILE=/run/secrets/api-keys.json \
  --mount "type=bind,src=$PWD/server/secrets/api-keys.json,dst=/run/secrets/api-keys.json,readonly" \
  zodiacs-engine-http
```

Before running this command, make the source file readable by the container
user. The image's default `node` user has UID and GID `1000`, checked by
[scripts/test-container.mjs](scripts/test-container.mjs); on a rootful
Linux Docker installation without user-namespace remapping, a file owned by
that UID and readable only by its owner works. If the file was created by
another account, an administrator can set its ownership and mode:

```sh
sudo chown 1000:1000 server/secrets/api-keys.json
sudo chmod 600 server/secrets/api-keys.json
```

These commands may remove the creating account's access. Keep the host
directory restricted and deliver client credentials through the secret
manager. Rootless Docker, user-namespace mappings and managed container secret
mounts need the corresponding host ownership or secret-file UID configured by
the operator. Test readability as the container's nonroot user; do not fix an
unreadable secret by making it world-readable or running the server as root.
The container smoke harness checks file loading with its configured mount
permissions. Check the actual runtime UID after changing the base image.

`HOST`, `PORT`, logging and resource-limit variables can be passed with
`--env`. If `PORT` changes, update the port mapping to match. Container health
checks need a fixed port; do not use the checkout's ephemeral `PORT=0` option
for container deployment. The runtime does not need registry access or engine
downloads; image building needs access to the locked dependencies.

## Probes and traffic routing

```sh
curl --fail http://127.0.0.1:3000/healthz
curl --fail http://127.0.0.1:3000/readyz
curl --fail http://127.0.0.1:3000/openapi.json
docker inspect --format '{{.State.Health.Status}}' engine-api
```

Only the exact GET probe and discovery routes are public. They do not spend
per-key tokens, even with an API key, but client admission limits apply. Avoid
putting credentials in probe commands. The Docker healthcheck runs
[scripts/healthcheck.mjs](scripts/healthcheck.mjs) against readiness on the
container's own listener. The probe has a bounded deadline, and Docker's
healthcheck schedule is defined in [Dockerfile](Dockerfile). Helper behavior is checked by
[test/healthcheck.vitest.ts](test/healthcheck.vitest.ts).

Liveness means the HTTP handler responds. Readiness means the engine and its
receipt passed startup verification and the calculation worker is available.
It becomes unavailable during worker replacement and shutdown. A full worker
queue leaves readiness healthy and refuses additional work as `server_busy`.
Socket saturation or host resource exhaustion can prevent any probe from
responding. Configure a supervisor to stop routing to unready instances and
replace an instance that remains unready after worker recovery fails. Docker
marks an unhealthy container; health status alone does not replace its process.

Terminate HTTPS at a reverse proxy and forward HTTP only across a trusted
host or private container network. Restrict direct access to the HTTP
listener. A proxy in another container cannot reach the host-loopback binding
shown above through its own loopback; attach it to the server's private
network and route to the server's container port without publishing that port
publicly. The API itself does not provide TLS or configure cross-origin
browser access.

Preserve the Authorization header and request content type. Disable proxy
caching of calculations and errors; application responses already use
`Cache-Control: no-store`. Apply proxy connection, body and request-rate limits
as needed for the deployment. The application throttles all requests reaching
request hooks by socket peer IP before authentication, with a bounded client
table, and applies per-key buckets after authentication. See
[Rate limits](README.md#rate-limits) for the window and saturation policy.
Clients behind a proxy share its admission allowance, including probes.
The application sets `trustProxy: false`; forwarded client-IP, protocol and
host headers do not change admission identity, authentication, per-key bucket
identity or OpenAPI URLs. Restrict access to the public discovery document at
the proxy if the deployment should not expose API metadata.

## Logs, resource limits and shutdown

The process writes JSON logs to standard output and sanitized startup failures
to standard error. Collect and rotate them through the supervisor or container
log driver. Application request logs contain generated request IDs, methods,
matched route templates, status and duration. They omit keys, request bodies,
raw URLs, query strings and raw errors. Privacy behavior at trace logging is
covered in [test/process.vitest.ts](test/process.vitest.ts). Configure reverse
proxy and observability tools separately: their headers, bodies, URL queries
and response capture can contain credentials or birth details. Retained
calculation responses contain the caller's inputs and engine receipts.

The executable isolates calculations in a worker with a bounded queue and
deadlines. Configure socket, request, calculation, queue and shutdown limits
using [README.md](README.md#resource-limits-and-shutdown); the accepted ranges
are enforced in [test/config.vitest.ts](test/config.vitest.ts). Set host or
container CPU and memory limits according to measurements of the intended
workload. Increasing request buckets does not increase worker capacity.
Each replica owns its keys, buckets and queue; use an upstream shared limiter
when a deployment needs an allowance shared across replicas. Rolling restarts
reset local allowances. No throughput or memory capacity is claimed here.

Send SIGTERM to stop the service; `docker stop engine-api` uses the image's
configured stop signal. Shutdown stops admission, closes the listener,
rejects waiting calculations and allows the active calculation to finish
within its existing deadline. A separate shutdown deadline forces failure if
connections do not drain. The Docker example allows more time than any
accepted `SHUTDOWN_TIMEOUT_MS`; preserve that relationship in other
supervisors. Remove an instance from upstream routing before stopping it when
possible. Socket closure and interruption can prevent a caller receiving a
response; reconnecting clients should use bounded backoff. Shutdown and worker
recovery behavior are exercised in
[test/lifecycle.vitest.ts](test/lifecycle.vitest.ts) and
[test/calculation-pool.vitest.ts](test/calculation-pool.vitest.ts).

## Validation and distribution

The final local check and coverage map are in [VALIDATION.md](VALIDATION.md),
with retained validation evidence. Run the local gate after installing the
locked dependencies, then run the separate container check on a Docker host:

```sh
node server/scripts/validate.mjs
npm --prefix server run test:container
```

The regular server suite tests the healthcheck helper against local HTTP
listeners and exercises the built server process. These tests do not execute
a Docker image or verify its complete build context and runtime filesystem.
The separate `test:container` command requires a working Docker CLI and daemon.
It builds an image and checks nonroot operation, the read-only filesystem,
credential sources, probes, a synthetic calculation and its receipt,
sanitized failures, licence files and termination. Its generated credentials
and output belong in ignored temporary directories, and it removes its test
containers and image when done. An unavailable Docker environment is a failed
container check, not a pass or silent skip. Container execution was unavailable
in the environment where this deployment milestone was implemented; run that
command on a Docker host before deployment. The milestone's validation record
is in [PLAN.md](PLAN.md).

The image retains the repository's `LICENSE`, `LICENSING.md` and `NOTICE` at
`/app/licenses/engine/`. Server code is MIT; the bundled engine includes code
and data with the terms and provenance recorded in those files. Preserve them
when redistributing the image or extracted bundles. Production dependencies
retain their own licence files in `node_modules/`; preserve those too. The
repository's [LICENSING.md](../LICENSING.md) records the engine's data terms
and outstanding provenance questions. This server does not change that
licensing record.
