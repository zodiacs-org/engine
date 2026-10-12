# Crosscheck

An isolated comparison harness for @zodiacs/engine. Development follows
[PLAN.md](PLAN.md). The scope, safeguards, isolated build, synthetic sampler,
streaming statistics, kernel acquisition, inertial JPL reduction and
validated true-of-date frame and relativistic correction implementations are
implemented, along with aggregate-only Swiss position integration, a
checkpointed sharded runner and deterministic aggregate report tooling.
A bounded engine campaign and its measured aggregate error report are now
[available](reports/bounded-sample.md). Million-chart execution remains
unmeasured.

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
The harness's authored code follows the repository's MIT licence. Adapted
ERFA formulas, constants and published test expectations retain the BSD
terms in [ERFA-NOTICE.txt](ERFA-NOTICE.txt). Runtime ERFA sources retain their
own notices and never enter the engine package.

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
charts; checkpoint orchestration is provided by lib/runner.mjs. The sampler does not accept personal
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
center-chain composition and inertial physical reference validation are
implemented in the reduction modules described below.

The M4 acquisition attempt failed during connection setup. M5b retried
successfully, opened the verified DE440s cache and evaluated selected public
reference positions. See [VALIDATION.md](VALIDATION.md) and
[the reference report](reports/jpl-reduction.md) for commands and limitations.

## Geometric SPK evaluation

lib/spk.mjs evaluates cached SPK Chebyshev segments using the layouts in
NAIF's [SPK Required Reading](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html),
sections "Type 2" and "Type 3". createSpkReader accepts opened kernels from
lib/kernels.mjs and a request with explicit target and center NAIF identifiers
and tdbSeconds. The epoch is TDB seconds past J2000. It returns geometric
J2000 Cartesian position in km and velocity in km/s. It does not accept UTC
or TT, apply light-time, aberration or deflection, or rotate to the ecliptic.
Physical inertial reduction and public JPL validation are in lib/reduction.mjs.
True-of-date rotations and relativistic modes are separate modules described
below; this geometric evaluator performs neither.

Type 2 velocity is the differentiated position polynomial divided by the
record radius. Type 3 velocity comes from its separately stored coefficients.
Center chains terminate at the solar-system barycenter. Later supplied
kernels and later segments have priority; an unsupported selected segment
fails rather than falling back. Missing planet-center data fails even when
system-barycenter data exists. Cycles, missing coverage, unsupported frames,
malformed directories and nonfinite coefficients are refused.

The evaluator reads one logical record at a time through the verified chunk
reader. The chunk reader currently reads and hashes chunks on each access;
this establishes bounded storage rather than campaign throughput. Arithmetic
and structural tests in tests/spk.test.mjs use invented data only. There is
no engine accuracy claim and no completed chart error report yet.


## Inertial physical reduction

lib/reduction.mjs accepts explicit NAIF target and center identifiers, TDB
seconds since J2000 and an explicit NONE, CN or CN+S correction. Results are
ICRF Cartesian positions in km and directions, with correction metadata.
It fixes the observer at reception and iterates the target at emission.
CN+S applies SPICE's Newtonian stellar rotation using the observer's
barycentric velocity. It does not return corrected velocities. Unsupported
frames or modes fail; planetary centers never substitute for barycenters.
The Moon may use NONE to match an uncorrected geocentric convention.

TT inputs can be converted with ttToTdb, using the implicit periodic model
from NAIF's [time documentation](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html),
"The Relationship between TT and TDB", and the constants in
[naif0012.tls](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls),
equations (4) through (6) and DELTET/K, EB and M (read 2026-10-13).
This truncated geocentric model omits short-period terms. UTC is not accepted
as TT; resolving chart input time is a later integration step. Correction
semantics follow [NAIF aberration documentation](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/abcorr.html),
"Reception case" (read 2026-10-13). No NAIF or ERFA implementation is copied.
Solar deflection, relativistic aberration and true-of-date rotations are
implemented separately below. Topocentric observations remain unsupported.

Run the bounded independent reference validation after kernel acquisition:

```sh
node crosscheck/tools/validate-jpl.mjs
node crosscheck/tools/validate-jpl.mjs --check
```

It reads public Horizons responses already committed under
../docs/evidence/calc-api/horizons/, checks their conventions, and evaluates
a deterministic bounded selection within DE440s coverage. The exact selection,
TT span, acceptance limits, compared counts, exclusions, source hashes and
reduction tooling hashes are recorded in reports/jpl-reduction.json. Limits
are fixed in lib/horizons.mjs before evaluation and tested by
tests/horizons.test.mjs. They are reference validation checks, not engine
accuracy bounds. The report includes DE440 versus Horizons DE441 differences
and CN versus Horizons LT semantics. It writes aggregate markdown, CSV and
JSON only, and --check requires exact reproduction on the recorded Node
runtime. A missing or invalid kernel is an error, never a passing skip.

[The reference report](reports/jpl-reduction.md) validates this reduction's
inertial modes against public JPL output. It evaluates no engine charts.
The synthetic campaign, engine error report and Swiss integration remain
later milestones. No public kernel bytes or per-case positions are committed.

## True-of-date frames and relativistic modes

lib/frames.mjs implements Fukushima-Williams IAU 2006 frame bias and
precession with unadjusted IAU 2000B abridged nutation. Callers choose
true-equator-equinox-date or true-ecliptic-equinox-date and provide TT days
since J2000 explicitly. The ecliptic rotation uses true obliquity. This is
the specified composite model, not IAU 2000A, observed pole offsets or a
nutation series with the IAU 2006 secular adjustment. The model's accepted
TT domain is enforced by tests/frames-apparent.test.mjs; implementation
comparison over that domain is recorded in
[the frame report](reports/frame-validation.md). No model accuracy outside
the measured span is claimed.

The nutation coefficients are read from digest-pinned ERFA source acquired
into ignored runtime/erfa-source/. They are independent of the engine's
nutation table. lib/erfa-catalog.json pins public ERFA inputs and lib/erfa.mjs
verifies them before use. Acquisition and validation require network access
on first use and a C compiler named cc. No download occurs at import time.

```sh
node crosscheck/tools/validate-frames.mjs
node crosscheck/tools/validate-frames.mjs --check
```

The validator compiles the runtime ERFA reference with the committed C
protocol driver, then compares synthetic frame matrices, aberration and
solar deflection. It retains only aggregate markdown, CSV and JSON under
reports/. The JSON records commands, source/tooling hashes, compiler,
selection, span, units and acceptance limits. Reproduction requires the
recorded Node and compiler environment. Shared published constants and
coefficients make this an implementation check, not a physical model
accuracy measurement or an engine chart error report.

lib/apparent.mjs exposes geocentric CN+REL and CN+REL+SUN modes separately
from the inertial SPICE modes. CN+REL uses converged reception light-time
and Lorentz aberration including the ERFA solar-potential term. CN+REL+SUN
adds finite-target solar deflection before aberration, using the Sun's
reception position and the ERFA near-Sun denominator limiter. Solar
self-deflection is refused. The static Sun geometry is an explicit
approximation, not moving-body or multi-body ray integration. It has not
been validated end to end against JPL apparent coordinates. Campaigns must
name this convention and keep deflection-enabled comparisons separate.

The pipeline requires both TT frame time and TDB kernel time; callers must
resolve and record the conversion. It returns a direction and convention
metadata, without implying a corrected range or velocity. ICRF output is
available without frame rotation. Other centers and topocentric frames fail.
The independent reference functions are ERFA's
[pfw06](https://github.com/liberfa/erfa/blob/v2.0.1/src/pfw06.c),
[nut00b](https://github.com/liberfa/erfa/blob/v2.0.1/src/nut00b.c),
[ab](https://github.com/liberfa/erfa/blob/v2.0.1/src/ab.c) and
[ld](https://github.com/liberfa/erfa/blob/v2.0.1/src/ld.c), read for this
implementation. Their published checks, analytic constructions, rotation
invariants and pipeline ordering are tested without engine or Swiss values.


## External Swiss position instrument

lib/swiss.mjs opens the unchanged permitted conformance adapter using a
user-provided Python executable in unbuffered mode. Supply an explicit
external ephemeris directory to openSwiss({ python, ephemerisPath }). The
library checks the real paths of that directory and the binding origin
before the adapter imports Swiss. It does not install software or download
Swiss files. Missing Python, a missing binding or an invalid handshake fails
with a fixed diagnostic; raw stderr and adapter errors are discarded.

The returned instrument exposes identity, comparePosition and close.
comparePosition accepts body, jdTT, actual: { lon, lat } and toleranceArcsec.
TT must already be resolved by the caller. Actual coordinates are degrees
in the apparent geocentric true ecliptic and equinox of date. The adapter's
Swiss apparent convention includes its own deflection model; agreement with
an engine without deflection is a convention comparison, not an independent
accuracy verdict. Positions are currently the only integrated request kind;
houses, angles, nodes and time comparisons remain unsupported here.

The instrument accepts one request at a time. Each response becomes only a
pass/fail verdict, returned flags and mergeable longitude/latitude residual
statistics in arcseconds. Requests answered by a backend other than SWIEPH
become fallback verdicts with flags and no residual statistics. Errors and
unsupported results retain only their verdict. Raw values and free-form
messages never leave the transport. No per-case output is written to disk.
Malformed, oversized or stalled responses terminate the instrument. The
identity records adapter and binding digests, version labels and the
adapter's external ephemeris file digests for later resume checks.

Tests in tests/swiss.test.mjs use invented protocol peers, independent
arithmetic and refusal cases. They never run Swiss and establish transport
and retention behavior only. A live Swiss measurement requires the user's
external installation and remains part of the later bounded campaign.

## Shards and checkpoints

lib/runner.mjs now provides runShard and mergeShards. Each shard walks its
residue class lazily and evaluates one synthetic chart at a time. The caller
supplies named comparison channels with fixed tolerances and explicit
conventions. An evaluator returns one aggregate observation per compared
channel, or an error, unsupported or fallback verdict. It must not return
raw positions. Swiss lon and lat aggregates belong in separate channels.
Channel names and flag cardinality are bounded; memory and checkpoint size
do not grow with chart count. This is a runner implementation property,
not a throughput measurement.

The campaign digest covers the sampling configuration, total, shard count,
channels, conventions, engine build identity, executable tooling identity
and reference identities. Use verifyBuild and runnerToolingIdentity before
opening a campaign, and verify kernel receipts and the Swiss identity with
the corresponding reference loaders. Identity inputs must describe verified
local content, rather than labels chosen by the caller. References and build
files must stay unchanged during a run. Resume rejects a different campaign
digest and validates progress and aggregate fields. The library does not
provide reference discovery or chart convention matching; the campaign
integration and report tools are later milestones.

Checkpoint directories must be under ignored runtime/. Each shard has an
exclusive lock directory. Writes sync a temporary file, atomically rename
it over the checkpoint and sync the parent directory. A failed comparison
stops the shard with a sanitized error; work since the last saved checkpoint
is repeated on resume. An AbortSignal stops between cases and saves progress;
maxCases can bound a session without changing campaign identity. Callers
must connect their signal handlers and supply a bounded evaluator timeout.
A killed process can leave a lock: after confirming that its writer has
stopped, remove that shard's .lock directory before resuming. Locks are never
stolen automatically. An abandoned .tmp file is discarded under the lock.
These guarantees assume a local filesystem supporting atomic rename and
file/directory sync, without concurrent hostile filesystem mutation.

mergeShards requires every shard, rejects duplicates and incomplete coverage
by default, and merges in ascending shard order for reproducible arithmetic.
Partial aggregation requires an explicit requireComplete: false option.
No timestamps, raw diagnostic messages or chart records enter checkpoints.
The checkpoint is a local progress record, not an authenticated receipt.

Run the independent invented-arithmetic runner checks on Node 22:

```sh
node --test crosscheck/tests/runner.test.mjs
```

The tests cover interrupted continuation, exact index coverage, deterministic
merging, exception rollback, aborted and empty shards, bounded session work,
identity mismatches, invalid retention fields, symlink refusal and locks.
They measure no physical positions or engine accuracy.

## Campaign aggregate reports

lib/report.mjs renders validated campaign receipts and all shard checkpoints
into deterministic markdown, CSV and a JSON reproducibility receipt. It
recomputes the campaign identity, validates checkpoints and merges in shard
order. Only aggregate statistics and verdicts enter reports. Empty channels
have unavailable measurements; error, unsupported and fallback outcomes never
count as residual observations. Returned flags have aggregate counts.

The receipt preserves the exact execution command as an argument vector,
engine and executable tooling digests, reference identities, conventions,
seed, tolerances, units and runtime. It records completed indices as the first
and last index and stride of each shard's completed prefix. The sampling span
is the configured half-open epoch-millisecond interval, explicitly distinct
from observed extrema or continuous physical coverage. A sample maximum does
not establish a bound beyond the comparisons made.

A campaign integration supplies a local bundle under runtime/ with exactly
campaign, states and metadata fields. campaign and states are the runShard
receipts; metadata has title, command (argument array), runtime (node,
platform, arch), units (one string per channel), and a nonempty exclusions
array. Metadata must describe the actual run and reference limitations. These
fields are caller declarations, not independently authenticated provenance;
never place diagnostics, personal records, positions or secrets in them or
reference identity fields. Capture verified build and reference identities at
execution, not from a later rebuild.

Render a new report and check its exact reproduction with the same bundle:

```sh
node crosscheck/tools/report.mjs crosscheck/runtime/campaign/report-bundle.json campaign-name
node crosscheck/tools/report.mjs crosscheck/runtime/campaign/report-bundle.json campaign-name --check
```

The CLI creates reports/campaign-name.md, .csv and .json and refuses to
overwrite existing reports. Reproduction checks read existing artifacts and
write nothing. Input paths must stay inside runtime/ and output names stay
inside reports/; symbolic links and oversized files are refused. Incomplete
shards are rejected unless --allow-partial is explicit; partial artifacts
state the actual completed count and retain precise prefix coverage. All
shards must still be present, including untouched shards with empty aggregates.
The library lets an integration stream checkpoints into an in-memory bundle;
the CLI bundle itself must fit the file limit. Do not concatenate arbitrarily
large campaigns into one runtime file.

The report tests use invented arithmetic and missing-reference verdicts.
They establish rendering, retention and reproduction behavior, not physical
accuracy. The bounded engine campaign is described below.


## Bounded engine measurement

[The measured report](reports/bounded-sample.md) and its
[CSV](reports/bounded-sample.csv) compare random synthetic natal charts with
DE440s, using exact Sun, Moon, Mercury and Venus centers. The
[JSON receipt](reports/bounded-sample.json) records the actual completed
count, configured TT sampling interval, seed, thresholds, engine build and
executable tooling digests, reference digests and exclusions. Residuals
include the named correction and frame model differences. This sample is
not a certification of accuracy or a bound on unsampled dates.

Use the recorded Node runtime, the isolated build and verified cached
DE440s and ERFA sources. Run from the repository root:

```sh
node crosscheck/tools/build.mjs
node crosscheck/tools/sample.mjs
node crosscheck/tools/sample.mjs --check
```

The sample command has a fixed bounded configuration in tools/sample.mjs.
It interprets synthetic ISO timestamps as TT via timeScale: 'tt', rather
than testing civil UTC conversion. The runner checkpoints each shard under
runtime/m9-sample/ and resumes only with matching identities. The command
handles SIGINT and SIGTERM between cases. Reference reads are local and
verified; no external process is used by this bounded evaluator.

The first invocation creates the aggregate report and refuses existing
report files. Use --check for reproduction. To independently recalculate
instead of reading completed checkpoints, remove runtime/m9-sample/ after
confirming no writer is running, then run the --check command. Keep the
recorded build, tooling and reference identities unchanged. A different
runtime or implementation needs a separately named measurement, not a
replacement of this report. Reports remain reproducible from completed
checkpoints after a clean build with the same recorded runtime and inputs.

Swiss is explicitly unavailable in this measurement because no external
user installation was supplied. The bounded command does not discover or
install Swiss. Other planet centers, houses, nodes, angles and speeds are
unsupported here, as the report states. DE441 was not run in this sample;
its acquisition and inertial reduction remain available through the kernel
and reduction libraries. Later campaign configuration must keep each
reference and convention separate.

## Campaign operations

`tools/campaign.mjs` supplies a production driver over the tested shard runner.
Its specification contains only a public synthetic seed, requested count,
shard count, campaign name and cached kernel name. It fixes the TT sampling
interval and correction conventions in its source; the report records them.
The accepted kernels are DE440s, DE440 and the positive-date DE441 part.
Acquire the chosen kernel with `tools/kernels.mjs` first. Missing exact centers
or coverage fail execution; planet barycenters never replace exact centers.
Full DE440 or DE441 acquisition and campaign measurements have not been run
here. The driver compares the same exact centers as the bounded sample.

After the isolated build and runtime ERFA acquisition described above, an
example requesting a million-scale campaign is:

```sh
cat > crosscheck/runtime/million.json <<'JSON'
{"name":"million-tt","kernel":"de440s","seed":"synthetic-million-v1","total":2000000,"shards":4}
JSON
node crosscheck/tools/campaign.mjs crosscheck/runtime/million.json all 0
node crosscheck/tools/campaign.mjs crosscheck/runtime/million.json all
node crosscheck/tools/campaign.mjs crosscheck/runtime/million.json report
node crosscheck/tools/campaign.mjs crosscheck/runtime/million.json check
```

This is a requested workload, not a completed measurement. The lazy budget
check in `tests/operations.test.mjs` exercises this requested count while
processing only a bounded prefix with invented arithmetic. No million-chart
throughput or memory benchmark has been performed. Kernel reads rehash chunks
and may dominate execution time; estimate resource use from a small campaign
before allocating a long run. Charts are generated one at a time and discarded.

`all` processes shards serially. Instead, assign each shard index to a separate
process with the same specification and external installation selectors. For
example, replace `all` with `0`, `1`, `2` and `3` for the specification above.
Each process owns only its shard lock and checkpoint. Stop all workers before
rendering a report. Never run two workers for the same shard. Shard count is
capped in `validateSpec` to keep collected checkpoint bundles below the file
limit; aggregate output size is also checked before writing.

The optional trailing case budget applies per selected shard per invocation.
SIGINT or SIGTERM stops after the in-flight comparison, saves aggregates and
releases the lock. Repeat the same command to resume. An exception repeats
uncheckpointed work and discards raw diagnostics. After an uncatchable kill,
confirm the worker is gone before removing its abandoned `.lock` directory.
Never repair checkpoint JSON by hand. A changed source, executable harness,
build, kernel, seed, shard configuration or Swiss identity refuses resume;
use a new campaign name instead. Completed runs are idempotent. A report
requires every shard to exist and be complete and refuses existing output.
`check` reproduces existing report bytes using the verified checkpoints.
To check fresh numerical reproduction, preserve the old runtime campaign
folder elsewhere under runtime/, run all shards again, and use `check`.

To enable Swiss, the user must separately install pyswisseph and its ephemeris
files outside this checkout. Set `CROSSCHECK_PYTHON` to that installation's
Python executable and `SE_EPHE_PATH` to its external data directory for every
run and report invocation. The harness installs nothing. An explicitly
configured but unavailable instrument fails rather than silently turning off
Swiss. Without these selectors, reports identify Swiss as unavailable.
Per-body `Swiss.*.lon` and `.lat` channels compare the exact centers used in
the JPL campaign via the unchanged permitted adapter. Only SWIEPH returned
flags contribute residuals; fallback, error and unsupported verdicts have no
numerical statistics. The legacy `Swiss.positions` channel stays unsupported
and must not be counted as an additional measurement. Binding, adapter and
ephemeris hashes and reported versions bind resume to the installation.
Only aggregates leave the transport; no raw stdout or instrument errors are
saved. Swiss expectations in the operational tests are invented arithmetic,
not Swiss reference values. No live Swiss installation was available here.

[The driver smoke report](reports/driver-smoke.md), its
[CSV](reports/driver-smoke.csv) and [receipt](reports/driver-smoke.json) record
a real budget-stop/resume run and a fresh numerical rerun that reproduced
all report bytes. The receipt contains the exact spec, span, commands,
threshold, actual counts, build and reference digests, and exclusions. These
are bounded measurements only. Run final retention and local-size checks
once workers and tests have stopped:

```sh
node crosscheck/tools/check.mjs --all-sizes
```

The usual checker covers publishable files. `--all-sizes` additionally visits
ignored cache, build and dependency files and rejects local symlinks or files
at the size boundary, as tested in `tests/safeguards.test.mjs`. It does not
identify secrets or prove provenance. The npm exclusion dry-run in that test
uses lifecycle scripts disabled and produces no archive.

Historical reports retain the executable tooling identities that actually
produced them. Later executable edits intentionally invalidate their checkpoint
resume identities. For fresh reproduction of the original bounded sample,
use its M9 source commit from git history with the recorded Node executable
and public input digests; do not replace its receipt with a new build's.
Rendering its retained aggregate bundle with `tools/report.mjs ... --check`
checks artifact reproduction only, not fresh instrument execution.
