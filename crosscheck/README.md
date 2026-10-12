# Crosscheck

An isolated comparison harness for @zodiacs/engine. Development follows
[PLAN.md](PLAN.md). The scope, safeguards, isolated build, synthetic sampler,
streaming statistics and kernel acquisition are implemented; the runner and
measured error report are still pending. No accuracy or throughput
claim is made by this scaffold.

The planned JPL comparison uses public DE440/DE441 kernels downloaded from
NAIF/JPL at runtime into runtime/cache/. Kernels will be stored in bounded
chunks, never committed. The independent reduction must name its time scale,
reference frame, origin, light-time, aberration and deflection conventions.
Planetary centers and system barycenters must not be silently interchanged.
Different conventions will be reported separately from numerical error.
JPL does not provide an arbiter for house-system definitions or lunar nodes;
unsupported comparisons must be explicit.

Inputs are random synthetic instants and coordinates, with deterministic
case indices and a recorded seed. No personal birth records are accepted.
The runner will shard by case index and checkpoint aggregate state without
raw positions. Resume must refuse changes in configuration, source, build,
kernel identity or reference versions. Campaigns may request millions of
charts; reports must state only the cases actually processed.

Swiss Ephemeris is an optional external comparison instrument, installed by
the user outside this checkout. It is never an engine dependency or an
accuracy arbiter. Integration must use the repository's permitted
conformance/adapters/pyswisseph.py route and aggregate-only retention,
following the conformance harness's --values none policy. Missing libraries,
missing ephemerides and fallback flags must be reported explicitly. Never
save raw adapter stdout, exceptions containing values, per-case positions,
fixtures, tables, Swiss code, binaries or ephemeris files in this repository.
Only verdicts, returned flags and summary statistics may be retained.

Astrodienst offers Swiss Ephemeris under the AGPL or a professional licence.
Its [official licensing page](https://www.astro.com/swisseph/swephinfo_e.htm),
section "How to license the Swiss Ephemeris" (read 2026-10-13), describes
obligations when distributing software containing Swiss or activating a
public service using it. This is why Swiss is excluded from this MIT engine
and remains a separately installed, test-time instrument. This separation
is a repository retention policy, not a claim that external use waives Swiss
licence obligations. Users must comply with the licence applicable to their
installation and use. See the repository's [licensing audit](../LICENSING.md).
The harness's authored code follows the repository's MIT licence.

Run the current safeguards without installing dependencies:

```sh
node --test crosscheck/tests/safeguards.test.mjs
node crosscheck/tools/check.mjs
```

The file checker inspects publishable project files, rejects symbolic links,
known kernel/binary file names, oversized files and em dashes in documents.
It skips the explicitly ignored runtime and dependency directories. It is
not a content provenance or secret detector; review must still enforce the
retention policy. No secrets or tokens belong in any project file.

All work and dependency installation belongs in crosscheck/. Builds must
write into runtime/, never the root dist/. Do not change packed inputs,
release archives, engine source or root dependency manifests. Reports will
be committed in reports/ as markdown plus aggregate CSV, with the exact
command, source/build digest, dependency versions, kernel digest and coverage,
sampled span, counts, units, correction conventions, failures and exclusions.
A sample maximum is not a proven bound. Reports must be reproducible from
committed tooling and the named public inputs; Swiss values are never fixtures.

## Isolated build

Use a user-provided Node 22 executable on PATH. The builder enforces the
minimum version in package.json through requireNode22 and its test. Install
only the locked crosscheck dependency, with lifecycle scripts disabled:

```sh
npm ci --prefix crosscheck --ignore-scripts --no-audit --no-fund --cache "$PWD/crosscheck/runtime/npm-cache"
npm --prefix crosscheck run build
npm --prefix crosscheck run verify
npm --prefix crosscheck test
node crosscheck/tools/check.mjs
```

The builder reads the engine's non-test TypeScript sources from ../src and
emits JavaScript modules under runtime/build/, retaining relative imports.
It uses Node's built-in stripTypeScriptTypes in transform mode, needed for
TypeScript parameter properties. This is an isolated source build, not the
release's tsup bundle or a typecheck. Node documents the API as experimental;
see [Node module documentation](https://nodejs.org/download/release/v22.23.3/docs/api/module.html#modulestriptypescripttypescode-options).
No compiler package or Node executable is copied into the project.
The root and calc entries load their locked astronomy-engine dependency from
crosscheck/node_modules/, independently of root dependencies.

runtime/build-identity.json records SHA-256 digests of source paths and bytes,
root manifests, crosscheck manifests, builder and safeguard code, dependency
files, output files and the executing Node binary, plus runtime versions and
platform. Git HEAD is recorded for context but excluded from the content
identity, so a harness commit of documentation does not invalidate the build.
Verification recalculates the content identity and refuses changed inputs or
outputs. Rebuild before a campaign after reinstalling dependencies or changing
Node. The receipt is a local reproducibility record, not a signed attestation.
No synthetic chart positions are saved by build tests. See
[VALIDATION.md](VALIDATION.md) for the actual checks and their limitations.

## Sampling and statistics

lib/sampling.mjs exposes sampleCase with a seed and a half-open epoch
millisecond span, plus an independent case index. SHA-256 counters separate
fields and rejection attempts, so a case does not depend on execution order
or earlier cases. Time draws use rejection before modulo reduction. Longitude
is uniform and sine of latitude is uniform, giving uniform sphere area rather
than uniform latitude. House systems are chosen with rejection from the
engine's supported identifiers. This distribution includes polar cases;
future comparisons must distinguish undefined houses and fallback conventions.
The generated utc field is an ISO representation of a millisecond input,
not a claim of historical UTC coverage or a TT/TDB conversion.

shardIndices yields indices lazily by residue class. It does not allocate
charts or provide checkpoints yet. The sampler does not accept personal
records. A seed is public campaign configuration and must not contain secrets.

lib/statistics.mjs accepts finite signed residuals in caller-declared units
and an inclusive, caller-selected absolute tolerance. It maintains counts,
signed mean, central squared deviations, absolute and squared sums, and
maximum absolute residual, without keeping individual observations. Summaries
give mean absolute error, RMS and population standard deviation; empty
statistics return null for measurements. Angular residuals use the shortest
signed difference in degrees, with antipodal ties choosing the negative
half-turn. No physical accuracy tolerance is established by these helpers.

Aggregate state can be JSON serialized and merged only with the same
tolerance and the expected fields. Merge order can change floating-point
rounding; deterministic report reproduction will require a fixed merge order.
The tests in tests/sampling-statistics.test.mjs check arithmetic independently
of engine outputs and exercise shard recombination and JSON continuation.
They establish tooling behavior, not ephemeris accuracy or campaign throughput.

## Public kernel cache

Acquire a catalogued kernel with Node 22:

```sh
node crosscheck/tools/kernels.mjs de440s.bsp
node crosscheck/tools/kernels.mjs de440.bsp
node crosscheck/tools/kernels.mjs de441_part-1.bsp
node crosscheck/tools/kernels.mjs de441_part-2.bsp
```

The catalog and MD5 transport checks are from NAIF's
[public checksum list](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_checksums.txt)
(read 2026-10-13). Acquisition uses HTTPS, refuses redirects and encoded or
partial responses, and streams into a temporary directory under runtime/cache/.
Only a verified download with readable SPK descriptors is promoted to its
cache directory. Interrupted downloads are removed when the process handles
the error; a killed process may leave an ignored .download directory, which
can be removed before retrying. Download continuation is not implemented.
Acquire DE441 parts separately and check the actual required coverage.

Every chunk is capped by CHUNK_BYTES in lib/kernels.mjs, below the file limit;
tests/kernels.test.mjs enforces stream reconstruction and the chunk boundary.
The receipt records source URL, retrieval time, whole-file MD5 and SHA-256,
chunk SHA-256 digests, byte size and parsed segment descriptors. MD5 detects
transport corruption and does not authenticate the publisher. An optional
EXPECTED_SHA256 argument pins a previously trusted whole-file digest. On reuse,
openKernel rechecks every chunk and both whole-file digests, parses coverage
again, and refuses a changed receipt or requested digest. Cache metadata is a
local record, not a signature. Cache writes assume no concurrent hostile
filesystem mutation; acquisition of the same kernel should have one writer.

Descriptor interpretation follows NAIF's
[DAF specification](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/daf.html)
and [SPK specification](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html).
Coverage uses TDB seconds past J2000 and retains target, center, frame,
segment type and array addresses. requireCoverage checks an inclusive span
for an exact target/center/frame combination of supported Chebyshev segment
types, including contiguous segments and rejecting gaps. It does not infer
planet centers from barycenters or convert UTC to TDB. Tests use invented
binary descriptors, not astronomical or Swiss fixtures. Coefficient evaluation,
center-chain composition and physical reference validation belong to M5.

The attempted public acquisition in this session failed at network connection
setup. No real kernel coverage or astronomical accuracy was measured. See
[VALIDATION.md](VALIDATION.md) for the exact command and checks.
