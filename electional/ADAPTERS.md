# Read-only calculation and event adapters

The adapters connect electional rules to the existing engine and optional
sibling events package. They do not find roots or implement astronomical event
searches. The implemented event operations are sign ingresses, stations,
retrograde intervals, exact aspects and void-of-course intervals. Phase
boundaries delegate to exact aspects with an explicit custom-angle policy.
Moon sign, phase and direct-motion evaluation is described in
[EVALUATION.md](EVALUATION.md); Moon-not-void evaluation and lookahead are in
[VOID.md](VOID.md). Other rule wiring remains in [PLAN.md](PLAN.md).

Planetary-hour selection calls the parent sky API through `SkyAdapter`,
independently of the optional events package. [HOURS.md](HOURS.md) describes
its UTC-only input boundary, shared native sample budget, missing solar days
and explicit scan-endpoint receipt scope.

Run the development commands in [README.md](README.md) on the declared Node
runtime. Both `npm test` and `npm run build` first bundle a narrow bridge from
parent source into `generated/engine.mjs`, using this project's exact pinned
ephemeris dependency. Nothing is installed in the parent, no engine source is
changed, and no parent build output is written. Generated code retains the
upstream legal comments and the engine's existing data attribution obligations.

## Clocks and receipts

Every `ClockWindow` has integer epoch-millisecond labels and an explicit
`clock`, either `utc`, `ut1` or `tt`. Only `utc` labels denote UTC timestamps.
The engine receives UTC as a Date and the other clocks as explicitly scaled
Julian dates. Julian-date conversion can lose submillisecond precision. This
adapter does not convert a physical event between clocks. Intersect windows
only after their clocks agree.

`EngineAdapter.position` delegates to the engine's `calc` API with explicit
geocentric, tropical, true ecliptic of date, apparent, degree conventions.
Requested speed is the engine's finite-difference longitude speed in degrees
per day. Results retain native bounds and the full native receipt, including
its request, resolved instants, time basis, conventions, engine and ephemeris.
The native receipt's civil label remains distinct from the adapter input label.
Receipt copies and returned position objects are frozen.

`WorkContext` counts requests, including requests refused by the engine.
Its budget is an explicit positive integer. Internal speed samples are part
of that request, so the count is neither raw ephemeris work nor elapsed time.
Every event provider request charges both the sibling context and the adapter
context; these are two records of the same work, and their totals must agree.
All scans and refinements share that budget. Receipts are kept for each
successful request, without an implicit cache; callers should bound each
search and consume results before starting another. Long-range streaming is a
later milestone.

Cancellation is checked before and after each synchronous calculation and
before returning a search. A running engine call cannot be interrupted.
`AdapterRefused` distinguishes cancellation, budget exhaustion and a native
engine refusal. Its `detail` preserves the native refusal, including coverage
information when supplied. Argument and unexpected computation errors throw;
they do not become completed empty results. A position refusal is thrown to
the caller, which can inspect its context's consumed budget and audit receipts.

The engine decides calculation coverage using its resolved UT1 and TT and
retains its existing time-basis behavior. The adapter neither widens that span
nor treats a narrow numerical bracket as a physical accuracy guarantee.
The integration tests exercise receipt routing and native coverage refusal;
they pin no calculated astronomical position.

## Optional events package

`loadEventsCapability()` imports only the fixed relative sibling build at
`../events/build/src/index.js` from the project directory, when that file exists.
The sibling must already be available and built by its owner. The adapter does
not check out the branch, copy its implementation, build it, install it, or
contact its HTTP service. A missing build returns a missing capability;
a present build with missing dependencies, broken imports or incompatible
exports throws. Such a failure is never labelled a completed empty search.

The public interface was inspected read-only on `origin/infra/events` at commit
`bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7`. The runtime checks the exports it
uses and verifies result clocks, event ownership and request accounting.
Result provenance includes the imported entry's local URL and file digest.
This digest identifies that entry's bytes only, not its dependencies or an
authenticated release. The engine receipts describe the actual injected
calculation provider, independently of the sibling's own default provider.

A trusted application may construct `EventsAdapter` with another compatible
local module and engine runtime. This is a programming interface, not a
configuration-file or future HTTP option. Contract tests use canned event
responses through this interface; those stubs contain no event solver.

## Window ownership and unresolved coverage

Electional windows own `[startMs, endMs)`; the sibling's point searches own
`(startMs, endMs]`. The adapter searches from the immediately preceding integer
label through the requested end, then retains points belonging to the
requested half-open window. It does not shift returned event instants or their
brackets. Both sampling endpoints remain available to the source scanner.
The extra guard consumes the shared budget and must be within source coverage.
If the guard cannot be represented or calculated, the search refuses.

Durations are intersected with the requested window without shifting their
boundaries. `sourceInterval` preserves the original span and clipping flags
also reflect clipping by this adapter. Other event fields, including nested
sign spans and exact-contact records, remain source metadata on their original
clock. Such nested metadata can extend beyond the clipped duration.

The source scan must finish before a result has `status: complete` or
`status: unresolved`. The latter explicitly distinguishes unknown coverage
from a completed empty search. Neither proves exhaustive astronomical discovery.
`completeness: source-scan-assumptions` records this limit. The source requires
suitable steps, continuous short-arc motion and appropriate station behavior;
coarse scans can hide paired contacts or touches. Source station searches may
leave an endpoint station unconfirmed. Consumers needing events close to a
search boundary must pad the search according to that operation's conventions,
then clip; the ownership guard alone is not such physical lookahead.

Void-of-course results must declare `unresolved`, including a tail whose next
ingress was not observed. These spans are clipped and retained, and `covered`
is the requested scan domain minus the reported unresolved spans. An unknown
tail produces `status: unresolved`, even when no event was returned. `covered`
describes source scan coverage, subject to the assumptions above; it does not
certify the absence of hidden events. An unresolved result cannot establish
that a rule passes throughout the requested domain. Lookahead, padding,
and rule-specific uncertainty handling belong to the rule evaluators.

Search refusals have empty events, coverage and unresolved lists. They retain
work counts and audit receipts from work already performed. Missing capability
has no fabricated engine receipt, because no calculation ran. This is distinct
from a completed empty search with covered scan domain.

## Executable evidence

[test/fixtures/adapter-ownership.json](test/fixtures/adapter-ownership.json)
derives point ownership, duration clipping and unresolved coverage by hand on
its synthetic integer domain. [adapters.electional-check.ts](test/adapters.electional-check.ts)
checks those expectations, policy delegation, invalid inputs, budgets,
cancellation, receipt preservation, engine refusal and source integration.
The native-engine cases check metadata and control flow only. Astronomical
accuracy references for the basic rule evaluator are recorded separately in
[references/README.md](references/README.md); none is inferred from these
adapter control-flow tests.

The test loads the real sibling if it is already present, otherwise it checks
the missing-capability result. When sibling files are absent, contract stubs
exercise the present-module boundary without claiming a live sibling search.
Run the suite with the sibling available to exercise the conditional integration
check. All example natal inputs remain synthetic.
