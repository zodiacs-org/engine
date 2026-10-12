# Event query grammar

`parseQuery(text)` returns an immutable `EventQuery`. It only parses syntax;
it does not search, read birth data or choose a horizon. Execution is the next
milestone. Import it from the local `events/src/index.ts` entry.

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
and has no recursive production. [test/query.test.ts](test/query.test.ts)
enforces the limits, examples, canonical output, strict filters, date
validation, duplicate rejection and error positions. These are parser
contract tests, not astronomical accuracy evidence. Existing Horizons and NASA
checks remain the independent date evidence for the underlying searches.
