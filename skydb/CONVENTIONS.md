# Time and event conventions beside the events workbench

Skydb records computed sky coordinates and sampled event roots. The events
workbench in [PR #43](https://github.com/zodiacs-org/engine/pull/43) searches
on demand. Shared coordinate definitions do not make their result records or
timestamps interchangeable.

This comparison reviews the public events source at commit
[`bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7`](https://github.com/zodiacs-org/engine/tree/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events).
The [source receipt](docs/evidence/events-conventions.json) records retrieval,
immutable URLs, byte hashes, inspected line ranges and selected declarations,
beside the local skydb source hashes and configuration. Regenerate it from the
repository root on the project Node runtime with network access:

```sh
node skydb/scripts/events-conventions.mjs > skydb/docs/evidence/events-conventions.json
```

This is source inspection, with no execution of the events workbench and no
measured agreement between the projects. Later changes to that draft need a
fresh review. Local numerical and boundary rules below are enforced by
[bootstrap](test/bootstrap.node-test.mjs), [generation](test/generate.node-test.mjs),
[event](test/events.node-test.mjs) and [query](test/query.node-test.mjs) tests.
Public source locators are in the receipt; the linked implementations define
the events side of the comparison.

| Choice | Skydb | Events workbench at the reviewed commit |
| --- | --- | --- |
| Engine input | [Pinned carried archive](src/identity.mjs), sampled through the root `positions()` API. | [Relative-source adapter](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/engine.ts#L1-L53) calls the parent's `calc()` API. Matching names or ephemeris versions do not establish matching source or archive bytes. |
| Clock | Integer epoch milliseconds with `timeScale: 'utc'` only. | Explicit `utc`, `ut1` or `tt` in each search window. UTC uses a Date; the other labels become Julian dates on the declared scale. A TT or UT1 label cannot be passed directly to skydb as a UTC instant. |
| Coordinates and bodies | Tropical geocentric ecliptic of date longitude and latitude, plus reported longitude speed, for the configured luminaries and planets. Nodes are excluded. | Apparent geocentric tropical longitude in the true ecliptic of date for the same supported body names; speed is optional. Both inherit the parent's lunar-series correction convention. |
| Event range | Stored events and query filters own `[startMs, endMs)`. | [`EvaluationContext.owns()`](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/context.ts#L64-L79) owns `(startMs, endMs]`. Inclusive root brackets are separate from event ownership. |
| Scan step | Uses the database's configured cadence. Event generation rejects steps larger than one hour. | Caller supplies a positive integer `stepMs`; the inspected scanners have no matching one-hour cap. Equal scan steps still need equal cell alignment and continuity assumptions. |
| Root estimate | Exact sampled zero, or the smaller-residual endpoint of an adjacent-millisecond bracket; earlier endpoint wins a tie. | The [shared refiner](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/root.ts#L50-L77) uses the same endpoint rule with a default one-millisecond width. Longitude and station scanners replace an estimate at a cell's open start with its right bracket endpoint when the bracket is nondegenerate. Skydb has no such adjustment. |
| Result handling | Queries stream stored records from a completed immutable database; they do not rerun a search. Missing or invalid data throw. Generation checkpoints can resume. | [Search context](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/context.ts#L51-L79) returns complete/refused results for evaluation budgets and cancellation, discarding partial event lists on refusal. Adapter engine refusals and other computation errors throw in the lower-level searches. |

Skydb's UTC setting selects the pinned engine's UTC input basis. Outside its
carried civil-time table, that basis uses UT1 with the engine's Delta T model.
It is not a uniform TT clock. Dates and numeric labels alone do not convert
between scales; the events adapter also warns of Julian-date rounding.
Preserve the declared clock and time provenance when comparing results.

## Clock seams and window edges

The [skydb planner](src/generate.mjs) splits at the pinned Delta T handover,
carried leap-list changes and the millisecond after the UT1 table's final
timestamp. The last split is at `2027-10-02T00:00:00.001Z`, checked against the
consumed engine by the generation tests. Left support stops at the preceding
millisecond; right support starts at the split. Interpolation and event root
brackets never cross these seams. A clock jump is not reported as a smooth
event. Smooth neighboring tiles can share a support sample, while event
ownership still uses the reported timestamp.

The inspected events longitude and station scanners advance through the
caller window without this pinned split list. Their
[limitations](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/LIMITATIONS.md#L25-L49)
warn that UTC and UT1 time-model transitions can violate continuity. An equal
UTC window does not establish an equal search across those seams. Compare
only smooth spans under explicit clock handling, and record any seam intervals
excluded from the comparison alongside its endpoint rules. Skydb's split still
covers every supported integer instant on either side.

At a shared smooth boundary `t`, skydb assigns a reported root at `t` to the
following tile or range. Events assigns it to the preceding search window.
Reusing identical range endpoints therefore changes inclusion. For stored
integer timestamps, an inclusive bound can be rewritten using a neighboring
millisecond only when the surrounding coverage permits it. Moving an events
search endpoint also changes its sampled cells and endpoint confirmation, so
this arithmetic alone cannot establish equal search results. Pad a smooth
comparison search when possible, then filter the reported timestamps to a
chosen common ownership rule. Keep brackets and residuals: neither project's
estimate necessarily marks the first millisecond of a changed discrete state.

## Event definitions and record mapping

| Event | Skydb | Events workbench at the reviewed commit |
| --- | --- | --- |
| Ingress | Roots at tropical sign boundaries, including the longitude wrap; records `target` and scalar `increasing`/`decreasing` direction. Sampled zero touches can be emitted. | [Sign ingresses](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/longitude.ts#L63-L122) add `fromSign`/`toSign` and `direct`/`retrograde` crossing direction. Sampled touches followed by reversal or plateau are suppressed; an end-window boundary contact can use its incoming direction. |
| Aspect | Fixed major angles of conjunction, sextile, square, trine and opposition, both oriented branches where distinct, over canonical unordered body pairs. The signed circular residual is longitude of the second body minus the first minus `target`. | [Exact aspects](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/aspects.ts#L29-L103) require an explicit unsigned-angle policy and a moving body against a fixed longitude or another moving body. Relative longitude is moving minus reference longitude; the root scalar subtracts the chosen aspect branch after unwrapping. Custom angles are allowed; no default major policy or orbs. Sampled touches follow the crossing suppression rule. |
| Station | Roots of reported finite-difference longitude speed. A sampled touch can be emitted without a speed-sign reversal; cells with zero speed at both samples are skipped. `direction` describes change in speed over the finding cell. | [Stations](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/stations.ts#L46-L83) require speed-sign changes. Sampled zeros need nonzero signs on both sides; end-window zeros are unconfirmed. Zero-speed plateaus reject. `direction` is outgoing direct or retrograde motion. |
| Lunation | Sun-Moon longitude conjunction and opposition, labeled new and full. The corresponding aspect record is also stored. | The inspected exact-aspect API can request those Sun-Moon contacts with an explicit policy. It does not emit skydb's separate `lunation` record type. Its eclipse searches have a separate shadow-geometry definition. |
| Other searches | Stored kinds are ingress, aspect, station and lunation. Position interpolation is separate from event scanning. | Also offers fixed-target aspects, retrograde intervals, eclipse searches and policy-based void-of-course Moon intervals. Their interval, clipping and unresolved-tail semantics cannot be recovered merely by renaming skydb records. |

For an oriented moving-pair comparison, choose the second skydb body as the
events moving body and the first as its moving target. Normalize the skydb
signed branch to the events relative-longitude domain. Reversing the pair
reverses the branch and relative direction. In a genuine ingress crossing,
increasing/decreasing longitude corresponds to direct/retrograde crossing
direction. That mapping does not turn a sampled touch into a crossing. For a
station, increasing speed is a different quantity from outgoing direct motion;
it cannot safely be renamed without confirming the signs around the root.
For a simple speed-sign crossing, increasing speed leads into direct motion
and decreasing speed leads into retrograde motion. This does not hold for a
touch without a sign reversal. Aspect direction describes relative motion,
so the events label `retrograde` there need not describe either body's motion.
At a sampled zero, skydb's direction reflects the first cell that emitted the
record, which can describe approach or departure at an edge.

Skydb interpolates stored positions between support samples. Its event scanner
instead refines with direct engine calls. Finding a zero of an interpolated
query curve would define a different numerical search. Both projects can miss
multiple roots inside a sample cell and unsampled tangencies. A completed
checkpoint or a `complete` scan means that work finished under its documented
rules; neither establishes an exhaustive physical event inventory. The
workbench's selected independent reference tests do not transfer an accuracy
claim to skydb. Skydb's [full-span measurements](benchmarks/INTERPOLATION.md)
measure interpolation agreement with its consumed engine only.
