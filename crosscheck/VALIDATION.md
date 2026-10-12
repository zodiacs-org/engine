# M1 validation

Executed in the source checkout on Node v20.19.2:

```sh
node --test crosscheck/tests/safeguards.test.mjs
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

The test suite passes. build.test.mjs enforces runtime rejection, repeated
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

tests/sampling-statistics.test.mjs enforces indexed reproducibility, complete
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
