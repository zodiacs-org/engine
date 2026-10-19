# Event query grammar

`parseQuery(text)` returns an immutable `EventQuery`. It only parses syntax;
it does not search, read birth data or choose a horizon. `executeQuery`
executes the parsed query under explicit search options. Import it from the local `events/src/index.ts` entry.

```text
query     := (next | all) event [range] [clock scale]
event     := body aspect [natal] body
           | body ingresses [into sign]
           | body stations [direct | retrograde]
           | body retrogrades [in sign]
           | (solar | lunar) eclipses
           | void-of-course Moon with bodies aspects aspect-list
bodies    := body { , body }
aspect-list := aspect { , aspect }
range     := from date to date | YYYY-YYYY
scale     := utc | ut1 | tt
date      := YYYY-MM-DD
aspect    := conjunction | sextile | square | trine | opposition
```

Tokens are separated by ASCII spaces, tabs or newlines. Commas are separate
tokens and require whitespace on both sides. Keywords, bodies and signs are
case insensitive; output body and sign names use the engine's canonical case.
Bodies are the Sun, Moon and planets listed by `EVENT_BODIES`; signs are those
listed by `SIGNS`. No comments, quoted strings, expressions, custom aspects,
or implicit corrections are accepted. Unknown and trailing terms fail.

`all` requires a range. `next` may omit it, leaving `range: null` for an
executor to supply an explicit bounded horizon. No current time is captured.
Omitting `clock` leaves `clock: null`; the executor must choose the clock
explicitly. Date labels denote midnight on that clock, encoded as epoch
milliseconds without an implicit time-scale conversion. Dates use the
proleptic Gregorian calendar and must survive exact calendar validation.
`from ... to ...` uses the supplied endpoints with the search convention
(start, end]. Year shorthand includes the entire named final year, ending at
midnight at the start of its following year. Years must increase. Parsing
calendar syntax does not assert ephemeris coverage.

A natal target remains a symbolic body reference; the executor must receive
its synthetic fixed longitude separately. A moving target cannot equal the
moving body. Ingress filters select the sign entered; station directions
select the outgoing motion. A retrograde sign filter selects whole intervals
with a positive-duration overlap in that sign, retaining their sign spans,
as `searchRetrogradeIntervals` does. It does not trim the interval to the sign.
Void-of-course queries require explicit unique non-Moon bodies and unique
aspects. They use the sign-based exact-contact convention documented in
[README.md](README.md); parsing does not supply a traditional policy.

```ts
parseQuery('next Mars square natal Sun');
parseQuery('all Venus retrogrades in Leo 1900-2100 clock tt');
parseQuery('all Moon ingresses into Aries from 2000-01-01 to 2001-01-01 clock ut1');
parseQuery('next Mercury stations direct');
parseQuery('next solar eclipses');
parseQuery('next void-of-course Moon with Sun , Mars aspects square , trine');
```

`QuerySyntaxError` extends `SyntaxError` and carries `code`, `offset` (a
zero-based UTF-16 code-unit position) and `expected`. Codes distinguish input
type, input length, token count, syntax, invalid dates and invalid ranges.
The exported `QUERY_LIMITS` bounds input before parsing. The grammar is flat
and has no recursive production. [test/query.node-test.ts](test/query.node-test.ts)
enforces the limits, examples, canonical output, strict filters, date
validation, duplicate rejection and error positions. These are parser
contract tests, not astronomical accuracy evidence. Existing Horizons and NASA
checks remain the independent date evidence for the underlying searches.

## Executing queries

`executeQuery(textOrQuery, options)` accepts DSL text or the immutable AST from
`parseQuery`. Programmatic ASTs must have exactly the parser's shape and values,
including date-range endpoints at Gregorian midnight. The existing lower-level
search APIs support arbitrary integer-millisecond windows.

```ts
import { executeQuery } from './src/index.js';

// Invented fixed Sun longitude, with no personal birth data.
const result = executeQuery(
  'next Mars square natal Sun from 2000-01-01 to 2001-01-01 clock tt',
  { stepMs: 3600000, maxEvaluations: 10000, natalLongitudes: { Sun: 0 } }
);

const bounded = executeQuery('next Mercury stations direct', {
  clock: 'tt',
  horizon: {
    startMs: Date.parse('2000-01-01T00:00:00Z'),
    endMs: Date.parse('2001-01-01T00:00:00Z'),
    clock: 'tt'
  },
  stepMs: 3600000,
  maxEvaluations: 10000
});
```

The steps and budgets in these examples are caller choices, not accuracy or
completeness guarantees. The API requires a positive integer `stepMs` and
`maxEvaluations`. A query clock or execution `clock` is mandatory, and conflicting
clocks fail. A range-free `next` requires `horizon` with matching clock. An
explicit query range cannot be overridden by a horizon. No current time,
time-zone resolution, clock conversion or automatic horizon expansion occurs.

Optional `stationStepMs` selects station-aware scanning. It must be a positive
safe integer no greater than `stepMs`, in milliseconds. Longitude and ingress
searches split cells at resolved speed zeros; moving aspects use the difference
of the bodies' speeds, so a relative turning point can occur while both bodies
move direct. Station searches use `stationStepMs` as their speed scan interval.
Retrograde sign partitions and void-of-course searches carry the same explicit
policy through their component scans. Omitting it retains the original scan
policy and its evaluation behavior. Both steps are copied before custom
provider callbacks run.

This policy still assumes continuous motion, resolved isolated speed zeros
and monotone short arcs between the discovered knots. Unresolved reversals
inside a speed cell can hide contacts. It is a caller-selected sampling policy,
not a proof of physical completeness. Eclipse queries reject `stationStepMs`
because longitude speed zeros do not govern their geometry search. The HTTP
request accepts and validates the same option; incompatible eclipse requests
receive the structured `invalid-request` error.

Provider requests stay inside the horizon; the default adapter's internal
finite-difference speed evaluations can extend past it. Guarded reference-span
endpoints and the retained discovery, timing and class discrepancies are
documented in [LIMITATIONS.md](LIMITATIONS.md). A completed query retains those
limits under either scan policy.

Natal queries require `natalLongitudes` to supply the target body's fixed
tropical longitude in degrees. Eclipse queries require `eclipse.model` with
explicit spherical `sunRadiusAu`, `moonRadiusAu` and `earthRadiusAu`, and
`eclipse.derivativeStepMs`; the geometry and boundary guards remain those of
`searchEclipses`. Void-of-course queries retain their explicit DSL policy.

The result includes the actual `window` and cumulative `evaluations`. On
`status: 'complete'`, `all` returns the filtered events, and `next` returns
only the earliest filtered event or interval in the supplied window. Both
modes scan the entire window, sharing the underlying budget across all aspect
branches and interval computations. There is no early-stop optimization.
Completion has the underlying searches' sampling and boundary assumptions;
it does not certify that a coarse scan found every physical event.

Intervals already in progress at the start can be returned with `clippedStart`;
`next` means the first intersecting interval, not necessarily a future onset.
Retrograde intervals may also have `clippedEnd`, and sign filters preserve the
whole interval with positive-duration sign overlap. Complete results include
`unresolved`, retaining any Moon tail whose sign exit lies outside the window,
even when `next` selects an earlier resolved interval. An empty event list with
an unresolved tail does not establish the absence of a void-of-course period.

`status: 'refused'` always has an empty event list. Reasons are
`evaluation-budget`, `cancelled` and `engine-refused` (the parent's calculation
coverage or policy refusal). Refusals discard earlier found events in both
modes. Syntax, configuration and unexpected computation errors throw; they
are not empty completed searches. An optional `AbortSignal` is checked between
synchronous evaluations. Cancellation cannot preempt a running calculation or
process an abort from the same event loop while this synchronous call runs.
The HTTP layer runs each admitted search in a worker and terminates it on
disconnect or deadline; see [README.md](README.md).

Trusted custom providers can be supplied through the optional `QueryProviders`
argument. Each factory receives the shared `EvaluationContext`, and providers
must charge each request to that context. They are an integration/testing
boundary, not untrusted input to the DSL or HTTP endpoint.

[test/search.node-test.ts](test/search.node-test.ts) checks dispatch, filtered earliest
selection, explicit horizons, clock conflicts, symbolic targets, clipped
intervals, unresolved tails, malformed AST rejection and all-or-nothing
refusals with analytic providers. Station-policy checks cover paired passes,
relative turning points with both bodies direct, step snapshots, validation
and shared refusal controls. Its synthetic natal square also uses the
independent JPL date and predeclared tolerance from
[references/horizons.json](references/horizons.json) over that fixture's window.
The HTTP integration checks paired-pass discovery against the independent
directions in [references/loop-cases.json](references/loop-cases.json); its
timing discrepancies remain separately recorded in
[evidence/station-loops.json](evidence/station-loops.json).
The remaining Horizons and NASA date tests still exercise the underlying
searches over their documented reference selections.
