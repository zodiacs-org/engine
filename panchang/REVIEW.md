# Panchang milestone review

M12 reviewed the library, CLI, documentation, evidence and isolation within
this source checkout. The implementation remains a private prototype with
the conventions and finite reference coverage below. No new astronomical
accuracy claim follows from this review.

## Requirements and checks

| Requirement | Implementation and verification |
| --- | --- |
| Explicit civil date, observer and zone | [civil.ts](src/civil.ts), [civil tests](test/civil.test.ts): Gregorian arithmetic, clock offsets and validation |
| Sunrise-to-following-local-date-sunrise day and vara | [sunrise.ts](src/sunrise.ts), [sunrise tests](test/sunrise.test.ts): weekday arithmetic, boundary ownership, USNO comparisons |
| Tithi/paksha, yoga and fixed/moving karanas | [limbs.ts](src/limbs.ts), [limb tests](test/limbs.test.ts): independently derived integer/rational classification |
| Moon nakshatra and pada | Engine classifier reused by [engine.ts](src/engine.ts); [engine tests](test/engine.test.ts) check delegation; [reference tests](test/references.test.ts) check finite JPL/ERFA windows |
| Chronological changes and full limb endpoints | [transitions.ts](src/transitions.ts), [transition tests](test/transitions.test.ts): analytical roots, ties, wrapping and day clipping |
| Complete chronological day partition | [day.ts](src/day.ts), [day tests](test/day.test.ts): independent partition arithmetic, simultaneous boundaries, receipts and refusal propagation |
| Explicit amanta/purnimanta naming and month anomalies | [months.ts](src/months.ts), [month tests](test/months.test.ts): rational roots, ingress ownership, adhika insertion, omitted kshaya names and cited astronomical cases |
| Kshaya/vriddhi tithis | [anomalies.ts](src/anomalies.ts), [anomaly tests](test/anomalies.test.ts): independent interval arithmetic and forward attribution |
| Inclusive civil-date ranges and bounded work | [range.ts](src/range.ts), [range tests](test/range.test.ts): calendar iteration, shared calculations, exact-budget accounting and whole-range refusals |
| CLI day/range, JSON/plain text | [cli.ts](src/cli.ts), [CLI tests](test/cli.test.ts): parsing, output ordering, complete provenance, process launcher and exit statuses |
| Engine receipts and selectable Lahiri-default ayanamsa | Original calc objects retained in snapshots and full interval endpoints; integration checks throughout the tests |
| Copyable API documentation | [README.md](README.md), [documentation test](test/documentation.test.ts): every TypeScript example compiles independently against the source API without emitting files |
| Source runtime and historical imports | [smoke.ts](scripts/smoke.ts): actual source runner, explicit historical preparation and day/range wiring |
| Project and package isolation | [check-isolation.mjs](scripts/check-isolation.mjs): project size/documentation rules, library import graph, engine build source graph, and npm dry-run exclusion |

The public API is [src/index.ts](src/index.ts). Its project-owned import
graph reaches the engine through relative source imports and does not
reach the CLI, filesystem/network modules or additional dependencies.
The graph check includes type imports. The engine retains its documented
dependency state and history-loading behavior; this is not a sandbox for
arbitrary caller code or a whole-program proof about I/O.

## Reference coverage

[SOURCES.md](SOURCES.md) is the authority for provider requests, locators,
redistribution basis, timescales and acceptance thresholds. Independent
evidence and engine integration checks remain distinct:

| Result | Independent evidence | Limit |
| --- | --- | --- |
| Limb definitions and arithmetic | Published calendar definitions and independently derived integer/rational oracles | Classifies supplied coordinates; no ephemeris accuracy follows |
| Vara and civil dates | Gregorian arithmetic and cited IANA/zic clock records | Zone rules are independent of invented coordinates |
| Sunrise | USNO labels at the synthetic observers and dates recorded under M4 | Upper limb, standard refraction, level horizon; no terrain or weather validation |
| Physical limb-transition instants | JPL DE441 longitude extracts with independent ERFA Lahiri reduction, and USNO primary phases under M11 | Only the listed windows/instants and conventions; no general error bound or coverage for other ayanamsas |
| Month anomalies and labels | USNO/JPL/ERFA kshaya case and PAC calendar interiors under M8, plus constructed trajectories | Calendar interiors do not establish exact phase or solar-ingress times |
| Clipping, caching, budgets, receipts and CLI formatting | Constructed inputs and original engine-object comparisons | Integration/operational evidence, not physical accuracy evidence |

Computed millisecond boundaries locate this model's classification changes.
They do not establish millisecond physical accuracy. Full endpoint receipts
expose the engine's corrections, frames, time basis, bounds and instantaneous
ayanamsa value. Traditional names contain no quality interpretation.

## Edge cases and remaining limits

The referenced tests cover sunrise/end ties, simultaneous and fractional
roots, angular wrapping, fixed-karana cycle endpoints, month/fortnight
boundaries, DST gaps/folds, midnight-straddling transitions, skipped and
repeated dates, historical mean time, missing/multiple sunrises, independent
search budgets and whole-result refusals. Invalid inputs throw; engine load
errors propagate to library callers; CLI failures use its documented status
and output routing.

Searches assume forward sector motion resolved by their sampling steps;
local boundary confirmation is not a proof of complete astronomical search.
Padded searches conservatively refuse across engine time-basis seams and
outside calc reference coverage, even when the requested sunrise day itself
does not cross the seam or edge. Missing polar sunrise has no substitute.
An affected following civil date can refuse the preceding sunrise day.
Purnimanta intercalation separates the regular dark and light halves around
the inserted month. Tithi repetition is attributed to the first sunrise of
the compared pair. These policies are explicit output conventions.

Alternative regional rules, alternate horizon models and broad physical
validation of other ayanamsas remain outside the reference coverage. The CLI
requires this source checkout and its local development dependencies. Its
complete receipt-bearing JSON can be large; generated working output belongs
in ignored folders and remains subject to the project file-size rule.

## Validation

Run from panchang/ on the Node runtime required by its package manifest:

```sh
npm run check
```

The final milestone run passed typechecking, the complete Vitest suite,
source runtime smoke and isolation. The isolation check reads the engine
build configuration with TypeScript without emitting files. It also performs
`npm pack --dry-run --ignore-scripts --json` using an ignored project-local
cache. This verifies exclusion without creating an archive or invoking the
engine build.

The root `npm run package:contents` was also attempted. It cannot pass in
this checkout because dist/ is absent; its missing-build-output assertion is
separate from panchang exclusion, which passed. The root build, archive
rebuilds and dist-dependent gates were not run under this task's restriction
against writing engine build output or packing archives. Final changes are
confined to panchang/; the harness owns subsequent git work.
