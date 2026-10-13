# Native exact smoke checks

Run the synthetic chart, houses and transit-scan workloads in Node, Deno and
Bun with the [exact transport](exact.md). The runner rebuilds the Node
reference and each selected target from the current checkout. It compares
complete results before ordinary JSON serialization, including Dates, signed
zero, every binary64 bit and all metadata. It applies no numerical tolerance.
This checks compatibility with Node, not astronomical accuracy.

The [M6 report](evidence/m6-runtimes.json) records failures in the tested Deno
and Bun versions. Both executed successfully and repeated their own results,
but each differed from Node. The checker exits unsuccessfully for those
results. No runtime flag or numerical workaround is applied to make them pass.

## Run

Install the edge toolchain as in [the lab README](../README.md), use Node 22,
and make `deno` and `bun` available on PATH. From the repository root:

```sh
npm --prefix edge run smoke:runtimes
```

By default all runtimes are required. The runner downloads no tools. An absent
runtime is an error, never a skip or a pass. To select installed executables:

```sh
node edge/scripts/smoke-runtimes.mjs \
  --deno "$PWD/edge/.cache/deno-tool/node_modules/.bin/deno" \
  --bun /usr/local/bin/bun
```

An executable argument is a file or command name, not shell command text.
Paths are resolved relative to the caller's working directory and support
spaces. Flags and shell substitutions are not parsed from the argument.
The Node reference always uses the Node executable running the checker.

For a deliberately narrower check, select runtimes explicitly:

```sh
node edge/scripts/smoke-runtimes.mjs --runtimes node
node edge/scripts/smoke-runtimes.mjs --runtimes deno
```

Node is always included as the reference. Every selected runtime remains
required, and the report lists unselected runtimes separately. A passing Node
selection says nothing about Deno or Bun. Selecting an empty, repeated or
unknown runtime name is an error.

## Reports and exit status

The direct `node` command writes a compact JSON report to stdout. Exit status
is zero only when every selected runtime completes and matches the reference.
Missing executables, build failures, process errors, malformed reports and
numerical mismatches produce a failure status. Invalid command arguments
produce a diagnostic on stderr without a JSON report. Use the exit status
as the CI gate; a report existing on disk does not imply success.

To save a local run in the ignored results folder while retaining the status:

```sh
mkdir -p edge/results
node edge/scripts/smoke-runtimes.mjs > edge/results/runtime-smoke.json
```

Each runtime record includes its reported version, V8 version or Bun revision,
platform, architecture, workload bundle digest, exact-result digest and byte
length. Target builds include the source digest of their build manifest.
The top-level report records the engine, ephemeris, build toolchain and runner
source digests. The Node reference is compiled in memory and passed to its
child through stdin, avoiding reuse of a stale generated file. Deno and Bun
execute their freshly built `.generated/<target>/workloads.mjs` files.
Build from a quiescent checkout; these are local provenance records, not
authenticated attestations. Licence files remain beside generated bundles.

Each child repeats the complete workload and rejects changes within its own
run. A `mismatch` record contains the first differing original data path,
its reason, and the exact expected and actual values or type descriptions.
Later fields are not claimed to match. Full generated results are kept only
in memory, not copied into compact evidence. Missing or failed runtime
processes carry an error code. If Node fails, other successfully executed
targets are marked `uncompared`, never passed. Runtime stderr is diagnostic
only and is truncated with an explicit flag when needed.

The child process gets a small environment allowlist, without inherited
credentials, proxy configuration, preload hooks or runtime flags. Deno uses
no config, lockfile, npm packages, remote modules or permission prompts; it
receives no network permission. Bun disables automatic installation and env
file loading. Each target's library is self-contained. This milestone does
not establish general network isolation in Node or Bun.

The process runner bounds waiting time and combined stdout/stderr bytes,
rejects malformed UTF-8, validates a single canonical report line and requires
a successful exit even if the child already printed valid results. It stops
children on interruption, timeout or excessive output. On POSIX it terminates
the process group to include npm wrapper descendants. On Windows it only
terminates the direct child; process-tree cleanup there is untested.

`tests/runtime-process.check.mjs` exercises process failures, output handling,
interruption and POSIX descendant shutdown. `tests/smoke-runtimes.check.mjs`
exercises runtime selection, framing, metadata and payload validation, exact
mismatches, repeatability failure, missing tools and CLI exit status. These
tests run with Node alone. Native Deno/Bun checks are the separate command
above so a regular test run never implies those runtimes were available.
The separate [web smoke command](web-smoke.md) covers local Workers and
browser execution. Run both commands for the full runtime matrix.
