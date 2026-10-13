# M1 validation

Executed in the source checkout on Node v20.19.2:

```sh
node --test crosscheck/tests/safeguards.node-test.mjs
node crosscheck/tools/check.mjs
npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
```

The safeguard suite passes, including the npm dry-run exclusion check with
--ignore-scripts. The project file checker passes. These are policy checks,
not astronomical accuracy evidence. The file limit is enforced by
MAX_FILE_BYTES in tools/check.mjs and its boundary test.

The full package-content gate fails because dist/calc.d.ts is absent: this
checkout has no dist/ build. No root build was performed because the session
is restricted to crosscheck/. The initial attempt also encountered the
read-only default npm cache; the retry used the ignored project cache.
The standalone npm exclusion check succeeds without a build or archive.

No astronomical sample has been run. Node 22 setup, isolated build identity,
reference adapters and measured reports belong to subsequent milestones.
Git status shows only the new crosscheck/ folder; git metadata was not written.

# M2 validation

Executed on Node v22.23.3 using the existing external executable
/tmp/node-v22.23.3-linux-x64/bin/node. Every npm command below had
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH. No Node binary was downloaded
or copied by this session.

```sh
npm ci --prefix crosscheck --ignore-scripts --no-audit --no-fund --cache "$PWD/crosscheck/runtime/npm-cache"
npm --prefix crosscheck test
npm --prefix crosscheck run verify
node crosscheck/tools/check.mjs
npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
```

The test suite passes. build.node-test.mjs enforces runtime rejection, repeated
build identity, root and calc import smoke checks on an invented chart,
changed file detection, dependency and output tampering rejection, receipt
tampering rejection, symbolic-link rejection and the file-size boundary.
The safeguard tests pass from crosscheck/ as well as from the repository
root; the git-ignore test now fixes its cwd explicitly. Test temporary files
now live under crosscheck/runtime/.

The verified build identity is:

```text
identity 7bb3015f58201140e8c3cbc7cbc588da2b75d2b7b2a0805e7c53e9ab9132c09d
source 749502dcde3ed7e762418e32b012ba864fdf17d8288a368a161a08d41f0b2635
dependency 2dbbbbc51c24153b75d9683140572bd1d8352e671d0e617792349150e745143c
output 5acff9549ca3f1b85e02d2f104811c10397a9e2baaa516b66db2dc46c459d2c2
sourceCommit 7307665bdbc432269fdac006104f661be16000bc
```

These are SHA-256 identities for this source build, not accuracy evidence.
The detailed receipt stays in the ignored runtime directory. Reinstalling
from the lock followed by the tests reproduced the identity on the same Node
binary. strip-only compilation rejected a TypeScript parameter property;
transform mode builds successfully and is recorded in the identity.

The file safeguards pass. A separate local scan also found no file at or
above MAX_FILE_BYTES anywhere under crosscheck/, including installed
dependencies and the ignored runtime. No reference instrument was invoked.

The full package-content gate still fails because dist/calc.d.ts is absent.
The npm dry-run exclusion test passes without a root build. The root build,
release gates and astronomy comparisons were not run: this milestone changes
only crosscheck tooling and must not write root dist/. There is no measured
JPL or Swiss comparison report yet.

# M3 validation

Executed on Node v22.23.3 with the same external executable as M2:

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm --prefix crosscheck test
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/check.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
```

The crosscheck suite and file safeguards pass. The npm dry-run exclusion
test passes. The full package-content gate fails because dist/calc.d.ts is
absent, as in M2; no root build was run under the folder-only constraint.

tests/sampling-statistics.node-test.mjs enforces indexed reproducibility, complete
shard recombination, valid input domains, supported house identifiers,
independent digest reduction including rejected time draws, lazy campaign
indices, independent BigInt sums and variance, inclusive tolerance verdicts,
JSON continuation, refusal of extra aggregate fields, count overflow and
independently enumerated angular differences. The broad time-draw test spans
negative to positive epoch milliseconds specified in its source; these are
sampler arithmetic tests, not charts evaluated over ephemeris coverage.

Statistics retain only aggregates. Arithmetic tests use invented residuals,
not engine or Swiss expected values. No reference instrument was invoked and
no astronomical sample was run. This milestone establishes reproducible
inputs and aggregate arithmetic; kernel acquisition is the next milestone.

# M4 validation

Executed on Node v22.23.3 using the external executable from M2:

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm --prefix crosscheck test
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/check.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/kernels.mjs de440s.bsp
```

The full suite and file safeguards pass. kernels.node-test.mjs independently
constructs invented DAF descriptors in both IEEE byte orders, checks exact
coverage boundaries, target/center/frame mismatches, contiguous spans and
gaps, unsupported segment types, malformed summary chains, invalid addresses
and encodings. Streaming tests reconstruct invented bytes across chunk
boundaries, check hashes independently, enforce CHUNK_BYTES and exercise
interruptions. Failed HTTP responses, encoded responses and wrong digests
leave no staging files. Cache destinations outside runtime are refused.
The npm exclusion test still passes without a root build.

The real DE440s acquisition failed with UND_ERR_CONNECT_TIMEOUT connecting
to naif.jpl.nasa.gov. A separate curl HEAD request also failed during TLS
setup. The checksum list and format documents were fetched and read through
the browsing tool. No kernel bytes or coefficients were committed or used
in comparisons. Successful public acquisition and real-cache reopen remain
unverified in this environment; the implemented acquisition is covered by
transport and structural unit tests, not a live-network success claim.
The bounded chart comparison and aggregate error report remain M9 work.
No Swiss instrument was run. Only crosscheck files changed.

The full package-content check was also rerun with the M3 command and still
fails because dist/calc.d.ts is absent. No root build was performed under the
folder-only constraint. git diff --check passes; status shows only crosscheck
changes. Existing invalid cache and symbolic-link refusal tests also pass.

# M5a validation

The original M5 has been split into geometric coefficient evaluation (M5a)
and physical reduction with public reference validation (M5b). This session
completes M5a only. Executed with the external Node v22.23.3 executable:

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm --prefix crosscheck test
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/check.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
```

The full crosscheck suite and file safeguards pass, including npm exclusion.
The package-content gate still fails because root dist/calc.d.ts is absent;
no root build was performed under the folder-only constraint.

The SPK tests independently expand an invented cubic and its derivative,
evaluate invented records in both byte orders, distinguish differentiated
velocity from stored velocity, and exercise record joins and final endpoints.
They check center addition and subtraction, missing exact target IDs, kernel
priority, cyclic center chains, unsupported frames and types, malformed
record directories, nonfinite coefficients and truncated reads. The numerical
comparison in the test is an arithmetic rounding allowance, not a physical
accuracy tolerance. No coefficients, fixtures or expectations come from Swiss.

The NAIF public SPK specification's type 2 and type 3 sections were retrieved
through search after a direct page request timed out. Implementation is
independently authored from the documented layout. No kernel acquisition or
astronomical comparison was performed in this session. TT/TDB conversion,
physical corrections, frame reduction and independent public JPL numerical
validation remain unchecked in M5b; no chart error report exists yet.


# M5b validation

The original physical reduction milestone is split again: M5b completes
inertial ICRF position reduction with SPICE correction semantics; M5c remains
unchecked for independently validated true-of-date frames and relativistic
modes required before a natal-chart campaign. This is an explicit scope split,
not acceptance of missing frame or correction validation.

Executed on Node v22.23.3 using the external executable from M2:

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/kernels.mjs de440s.bsp
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm --prefix crosscheck test
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/validate-jpl.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/validate-jpl.mjs --check
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/check.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
```

Public DE440s acquisition succeeded this time. The catalog MD5 and the
SHA-256 recorded by the independent conformance validation agree with the
local receipt. The kernel remains only in ignored bounded cache chunks.
Opening it again for validation and report reproduction reverified chunks,
whole-file digests and coverage descriptors.

The full crosscheck suite passes. reduction.node-test.mjs checks the implicit NAIF
TT/TDB equation, an analytically selected anomaly, the exact light-time
solution for an invented linearly moving target, reception-fixed observer,
analytic stellar rotation, preserved range, unit/frame/mode refusal, invalid
ranges and nonconvergence. These are arithmetic checks, not physical accuracy
evidence. horizons.node-test.mjs checks retained public response conventions,
malformed and nonfinite rows, increasing epochs, selection, coverage margin
and fixed validation limits. No expected value comes from the engine or Swiss.

The bounded numerical validation evaluates 150 selected positions against
JPL Horizons DE441 responses, with zero failed acceptance checks. The exact
TT span, counts, selection, exclusions, limits, public input hashes, kernel
identity and reduction tooling hashes are in reports/jpl-reduction.json;
reports/jpl-reduction.md and reports/jpl-reduction.csv give aggregates.
This measures the reduction against the selected reference output only,
including DE440 versus DE441 and correction/model differences. It evaluates
no engine chart and establishes no engine error bound. Exact report
reproduction passes with --check on the same Node executable.

The file safeguards and npm dry-run exclusion pass. A separate scan of all
crosscheck files, including ignored cache and runtime folders, finds every
file below MAX_FILE_BYTES. The full package-content gate still fails because
root dist/calc.d.ts is absent; the folder-only constraint prohibits a root
build. Root engine tests and release gates were not run. No Swiss dependency
was installed or invoked. Only crosscheck files changed, and git metadata was
not written. M5c, the runner and the actual chart error report remain pending.

# M5c validation

Executed on Node v22.23.3 with the same external executable as M2:

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node --test crosscheck/tests/*.node-test.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/validate-frames.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/validate-frames.mjs --check
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/validate-jpl.mjs --check
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH node crosscheck/tools/check.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
```

The crosscheck suite passes, including published ERFA pfw06, fw2m, ab and
ldsun checks, independently constructed zero-series offsets, determinant,
inverse rotation and ecliptic pole checks, analytic Lorentz aberration,
near-Sun limiter, invalid conventions and correction ordering. Those tests
do not depend on a local ERFA compiler or downloaded sources.

The bounded reference validation passes and reproduces exactly with --check.
The actual case count, TT span, component counts, limits and residuals are
in reports/frame-validation.json, with markdown and CSV aggregates. Runtime
reference sources were downloaded from public ERFA URLs, hashed against the
committed catalog and compiled with the recorded compiler. The published
nut00b check also passes against the downloaded coefficient table. The
source coefficients are shared published model data; these comparisons
validate implementation agreement, not the physical model's accuracy.

The frame is explicitly IAU 2006 bias/precession with unadjusted IAU 2000B
nutation. The solar mode uses static reception-Sun geometry and ERFA's
limiter; end-to-end JPL apparent-coordinate validation remains absent. The
historical inertial JPL report still reproduces without changes. The Swiss
integration, sharded runner and bounded engine chart campaign remain pending.

File safeguards and the suite's npm exclusion check pass. All local files,
including ignored runtime data, are below MAX_FILE_BYTES. The full package
contents gate remains blocked by missing root dist/calc.d.ts; the user's
folder-only constraint prohibits creating dist/. No root build, release,
Swiss invocation or git metadata write was performed. Only crosscheck/
files changed.


## M6 external Swiss transport

Validation command (Node v22.23.3):

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm --prefix crosscheck test
node crosscheck/tools/check.mjs
```

The Swiss tests use invented process peers, never Swiss-derived values.
They exercise angular residual arithmetic, retention, fallback flags,
external path refusal, missing executables, malformed or oversized output,
timeouts, exited processes and concurrent-request refusal. The full suite
also checks npm exclusion through a dry-run with lifecycle scripts disabled.
All checks passed. Python's importlib.util.find_spec('swisseph') returned no
binding in this environment; no live Swiss comparison was run and no Swiss
accuracy or agreement claim is supported by this session.

## M8 aggregate report generation

Executed on Node v22.23.3 with the external executable used in M2:

```sh
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm --prefix crosscheck test
node crosscheck/tools/check.mjs
PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
git diff --check
```

The full crosscheck suite and file safeguards pass, including the npm dry-run
exclusion test. tests/report.node-test.mjs independently checks invented residual
counts, mean, mean absolute error, RMS, maxima, exclusions and returned flag
counts. It checks deterministic rendering with reordered shards, exact command
argument preservation, CSV escaping, unavailable empty statistics, explicit
partial coverage, corrupt campaign and aggregate refusal, required units and
exclusions, output file limits, reproduction, overwrite refusal and path and
symlink constraints. All test-generated report files are removed afterward;
local bundles and logs remain only in ignored runtime/.

Reports carry the verified campaign digest and its recorded build and
reference identities. The renderer validates their structural consistency;
it does not authenticate caller-supplied metadata or rerun instruments.
Sampling intervals are labelled as configured distributions rather than
observed extrema. No JPL or Swiss measurement was made in this session and
no engine accuracy claim or measured chart error report is added. The bounded
physical campaign remains M9.

The full package-content gate still fails because root dist/calc.d.ts is
absent. The folder-only constraint prohibits a root build; no packed file,
archive or engine source changed. The repository diff check passes. No git
metadata write, release command or external Swiss installation was performed.

## M10 operational validation

Executed with the external Node v22.23.3 executable used in M2. Every command
below used PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH:

```sh
npm --prefix crosscheck test
node crosscheck/tools/build.mjs
node crosscheck/tools/campaign.mjs crosscheck/runtime/m10-driver-smoke.json all 1
node crosscheck/tools/campaign.mjs crosscheck/runtime/m10-driver-smoke.json all
node crosscheck/tools/campaign.mjs crosscheck/runtime/m10-driver-smoke.json report
mv crosscheck/runtime/campaigns/driver-smoke crosscheck/runtime/campaigns/driver-smoke-validated-first
node crosscheck/tools/campaign.mjs crosscheck/runtime/m10-driver-smoke.json all
node crosscheck/tools/campaign.mjs crosscheck/runtime/m10-driver-smoke.json check
node crosscheck/tools/report.mjs crosscheck/runtime/m9-sample/report-bundle.json bounded-sample --check
node crosscheck/tools/check.mjs --all-sizes
npm_config_cache="$PWD/crosscheck/runtime/npm-cache" npm run package:contents
git diff --check
```

The smoke specification was authored into ignored runtime storage before
execution:

```json
{"name":"driver-smoke","kernel":"de440s","seed":"crosscheck-m10-driver-v1","total":8,"shards":3}
```

The full crosscheck suite passes. tests/operations.node-test.mjs exercises an
interrupted distributed arithmetic run, aborted continuation, exact case-index
coverage, completed-run idempotence, fresh report byte equality, tooling
identity refusal, million-scale requested count with bounded actual work,
Swiss per-axis aggregate retention and fallback handling, strict specifications
and runtime input path/JSON/size refusal. These tests use invented arithmetic
and establish operational behavior rather than physical accuracy. The
safeguard boundary test additionally enforces checks of ignored local files.

The actual DE440s driver smoke run stopped at its per-shard budget, resumed,
and produced reports/driver-smoke.md, .csv and .json. A fresh campaign folder
then evaluated all cases again and exactly reproduced these artifacts. The
report receipt states the completed count, configured TT sampling span,
public seed, specification, commands, units, screening threshold, build,
source/output/dependency digests, Node executable identity, reference digests,
correction conventions and exclusions. It is a bounded measurement only.
No million-chart physical campaign, DE441 campaign, house/node/angle accuracy
check or live Swiss comparison was performed. No Swiss binding or ephemeris
was installed. The driver can explicitly enable a user-provided external
Swiss installation; its integration test supplies invented aggregates only.

The original bounded report also reproduces from its retained M9 aggregate
bundle without editing its committed receipt. That check validates rendering,
not fresh instrument execution. Executable changes intentionally change the
runner identity and prevent resuming historical checkpoints with new code;
a fresh M9 numerical reproduction requires its historical tooling commit.

The project retention check and full local file-size scan pass, including
ignored kernel chunks, source build and installed dependencies. npm's dry-run
exclusion test passes with lifecycle scripts disabled. The full root package
contents gate still fails because dist/calc.d.ts is absent; the user's
folder-only constraint forbids creating root dist/. No root source, packed
input, root dependency manifest, immutable archive or git metadata changed.
No release workflow, publish operation or git write was run. The diff check
passes. M10 is complete, and this session stops here as required by PLAN.md.

## F1 validation

The Node suites now use `*.node-test.mjs`, and the crosscheck test script
and documented test paths use that pattern. Test bodies are unchanged.
Executed on Node v22.22.2:

```sh
npm ci --prefix crosscheck --ignore-scripts --no-audit --no-fund --cache /tmp/crosscheck-f1-npm-cache
npm --prefix crosscheck test
npm --prefix crosscheck run verify
npm --prefix crosscheck run check
npm_config_cache=/tmp/crosscheck-f1-npm-cache npx --prefix /tmp/events-f1-root-check --no-install vitest list --filesOnly
npm_config_cache=/tmp/crosscheck-f1-npm-cache npx --prefix /tmp/events-f1-root-check --no-install vitest run --reporter=dot
git diff --check
```

Crosscheck's tests, build verification and file safeguards passed. The test
suite includes the npm exclusion dry-run with lifecycle scripts disabled.
Root Vitest's default listing and completed run selected no crosscheck test
files. Vitest came from an external dependency installation matching the
root lockfile, leaving root manifests and dependency installation unchanged.
The root run failed on unresolved root astronomy-engine/TypeScript imports
and the archive-check environment limitation described in the PR review.
This verifies crosscheck discovery isolation, not a passing full root suite.

## F3 bounded campaign review

The M9 aggregate report is complete. A fresh evaluation on Node v22.22.2
used its recorded seed, TT span, channels and shard configuration, the
verified isolated engine build, digest-verified DE440s and pinned ERFA
nutation terms. An ephemeral verification script called createEvaluator
and runShard in a new runtime directory, merged the completed shards, and
compared every channel's statistics, verdicts and flags with the committed
JSON receipt. All aggregates matched exactly. The script also checked the
engine source and output digests against the receipt. Its temporary
checkpoints were removed; no raw positions were retained.

This is a fresh numerical comparison with the historical measurement,
not reproduction of its historical build or executable tooling identities.
The retained M9 aggregate bundle separately reproduced all committed report
bytes with tools/report.mjs --check. Neither check changes the reports or
establishes an unsampled accuracy bound. Swiss remains explicitly unavailable;
DE441, other planet centers, houses, nodes, angles, speeds and topocentric
comparisons remain excluded.

The README now describes the completed campaign and report tooling throughout
and explains historical identity requirements. The added artifact consistency
test enforces completed bounded coverage, measured channel counts and explicit
unavailable comparisons; it is not an independent accuracy test.

Executed with Node v22.22.2 on PATH:

```sh
npm --prefix crosscheck run check:syntax
npm --prefix crosscheck test
node crosscheck/tools/build.mjs --verify
node crosscheck/tools/report.mjs crosscheck/runtime/m9-sample/report-bundle.json bounded-sample --check
node crosscheck/tools/check.mjs --all-sizes
npm_config_cache=/tmp/crosscheck-f3-npm-cache npx --prefix /tmp/events-f1-root-check --no-install vitest list --filesOnly
npm_config_cache=/tmp/crosscheck-f3-npm-cache npx --prefix /tmp/events-f1-root-check --no-install vitest run --reporter=dot
git diff --check
```

Crosscheck syntax, tests, build verification, report rendering and file
safeguards pass. Root Vitest's default discovery lists no crosscheck suites.
Its dependencies come from an external installation matching the root
lockfile. Root load errors for missing dependencies and the archive-check
environment limitation remain outside this fix. No root files or git metadata
were changed. F4 operational review remains unchecked.
