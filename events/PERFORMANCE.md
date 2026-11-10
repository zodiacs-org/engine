# Query cost measurements

[performance-plan.json](scripts/performance-plan.json) fixes the queries and
policies. [performance.json](evidence/performance.json) records before/after
wall times, peak process RSS, result counts, evaluation counts and hashes of
the complete serialized query results. These are cost and regression checks,
with no independent astronomical accuracy or completeness claim.
The result hash encoding preserves negative zero and rejects nonfinite numbers.

From the repository root on Node 22, after installing the events lockfile:

```sh
npm run build --prefix events
node events/scripts/performance.mjs --measure
node events/scripts/performance.mjs --check
```

Both commands need the baseline commit named in the plan in local git history.
The script reads its original adapter with `git show` and bundles that adapter
with the current remaining sources and locked dependencies. It writes only
small aggregate evidence and ignored comparison bundles under `generated/`.
It does not create a checkout or modify git metadata. The evidence records
the baseline adapter hash, current runtime source hash, script/plan/configuration/
lockfile hashes and machine/runtime details. Both commands bundle the current
source themselves, so stale build output cannot receive current source provenance.
Source or policy changes require remeasurement and review. The dedicated events
workflow fetches full history for the baseline digest check.

Each query runs in a fresh process. Timing starts after import and covers the
synchronous query, with no query warmup. The script runs sequentially, alternating
variant order over the rounds fixed in the plan. Peak RSS includes imports and
the runtime, and is not an allocation measurement. Host contention and runtime
differences can change the timings. CI checks input binding, then rebuilds both
variants and compares their complete serialized results and evaluations on its
current runtime. Historical numerical hashes are retained as measured evidence,
rather than required to match across processors or Node patch versions. There
is no wall-time limit or attempt to reproduce historical timings in this check.

The long Mercury station query uses TT labels from 1800-01-02 through
2199-12-31. These guarded endpoints leave room for the parent's finite-difference
speed samples and time-scale conversion inside its reference coverage. The
separate coverage-edge query records an engine refusal through 2200-01-01.
These explicit windows are in the plan; the benchmark does not silently trim
an unsupported request. The Venus query covers the named years in full and
uses positive-duration Leo overlap. The Moon query uses the explicit bodies,
aspects and station-aware policy in the plan, retaining unresolved tails.

## Longitude speed subcalculations

The measured change in [engine.ts](src/engine.ts) keeps the parent calculation
API for the central position, input validation, reference-span refusal and
instant provenance. For a speed request, its two side samples need longitude
alone. They use the same apparent geocentric vector and true-of-date longitude
rotation as the parent, omitting unused distance, Cartesian rotation and bound
construction. The finite-difference width, angular wrap, elapsed-day divisor,
input-clock normalization and arithmetic order remain those of the parent.
No samples are cached, and custom providers and eclipse adapters keep their
existing behavior.

All bundled vector calls and parent clock helpers resolve to the ephemeris
copy pinned by the events lockfile, including when a checkout also has root
dependencies installed. This keeps their global clock state shared. Parent
clock helpers restore their Delta T model after each subcalculation. Every
adapter request retains validation, its budget unit and cancellation checks.
[engine-speed.node-test.ts](test/engine-speed.node-test.ts) compares the speed
and metadata exactly with the parent over its declared bodies, clocks and
boundary cases. Those are integration and regression checks, rather than
independent astronomical accuracy evidence.

The helper follows the parent's current calculation path. Parent reduction or
clock changes require checking this parity again and refreshing the source-bound
evidence; matching on the current sample does not certify future implementations.

No sampling policy, event definition, root algorithm, budget threshold or
independent reference threshold changes. The paired benchmark requires every
recorded serialized result hash and evaluation count to agree across variants
and rounds before writing evidence. The existing independent date and
completeness checks remain applicable with their documented discrepancies.

## Measured queries

The committed run used Node 22.23.3 on Linux x64, with the CPU recorded in
`evidence/performance.json`. Each median uses the plan's three fresh query
processes per variant. Times below are seconds: the before median rounds down
to a whole millisecond and the after median rounds up. Raw measurements and
peak RSS remain in the JSON. These values apply only to the declared queries,
policies, source hashes and environment.

| Query and TT span | Returned results | Evaluations, both variants | Before median, seconds | After median, seconds |
| --- | ---: | ---: | ---: | ---: |
| Mercury stations, 1800-01-02 to 2199-12-31 | 2521 | 220150 | 21.955 | 11.842 |
| Venus retrogrades intersecting Leo, full years 1900 through 2100 | 18 | 226873 | 12.982 | 9.572 |
| Moon void periods under the declared policy, 2000-01-01 to 2001-01-01 | 160 | 178562 | 10.912 | 7.618 |

Mercury stations were the slowest completed baseline query in this set. The
separate 2199-12-31 to 2200-01-01 Mercury query remained an engine refusal,
returning no partial events after its two requests. Before/after serialized
results agree in every round, including all numerical brackets and residuals.
The completed scans retain their sampling assumptions; returned-result counts
are not independently verified astronomical inventories.
