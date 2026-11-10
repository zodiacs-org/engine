# Moon-not-void windows

`evaluateVoidRule(rule, window, engine, eventsCapability, options)` evaluates a
validated `moon-not-void` rule. It returns `satisfied`, `failed`, `covered` and
`unresolved` interval sets, engine receipts, source search audits, and an
explicit convention record. The validated mode and preference weight remain
available for factual composition. This rule describes a traditional selection
convention, not a prediction about an activity.

## Convention and delegation

The policy follows the engine's `VOID_OF_COURSE_CONVENTION` in
[src/techniques/void-of-course.ts](../src/techniques/void-of-course.ts): a void
period starts at the Moon's last exact Ptolemaic contact in a tropical sign
and ends at its entry into the next sign. If no contact occurs in a completed
sign residence, the entire residence is void. The void includes its starting
contact and excludes its ending ingress. There are no orbs or latitude tests;
nodes, chart angles and contacts perfected in the next sign do not count.
The parent guide cites Lilly, *Christian Astrology* (1647), page 112 for the
historical definition. The interval interpretation is the engine's explicit
convention, rather than a claim that every historical author used it.

`traditional` selects Sun, Mercury, Venus, Mars, Jupiter and Saturn. `modern`
also selects Uranus, Neptune and Pluto. Both use conjunction, sextile, square,
trine and opposition. The policy-delegation test in
[void-rule.electional-check.ts](test/void-rule.electional-check.ts) checks these
choices against the parent engine's exported body sets and convention through
the read-only local bridge. The result records the selected bodies and aspects
so callers can explain which convention they chose.

The evaluator calls `searchVoidOfCourseMoon` through `EventsAdapter`. It does
not implement a void scanner, derivative, root solver or aspect search. A
separate delegated `searchSignIngresses` scan supplies ingress brackets omitted
from native void intervals. Both scans share the same explicit evaluation
budget and cancellation signal. Position samples and native engine receipts
come from the existing engine `calc` provider described in [ADAPTERS.md](ADAPTERS.md).
The workbench does not call the parent's unbudgeted void scan as a fallback
when the events capability is missing.

## Padding, lookahead and ownership

Options require a positive integer `stepMs`, a nonnegative integer
`lookaheadMs`, and a positive integer `maxEvaluations`. The scan domain begins
one scan step before the requested start and ends one scan step plus the
requested lookahead after the requested end. The events adapter adds its usual
left ownership guard. No returned contact or ingress label is shifted.
Durations are clipped by intersection with `[startMs, endMs)`.

Lookahead lets the source observe the exit of a sign still in progress at the
requested end. There is no automatic retry or assumed sufficient duration:
if the source still has not observed that exit, its unresolved tail is
preserved. Explicit zero extra lookahead is allowed and retains the scan-step
padding. A tail wholly after the requested end remains visible in the search
audit, but does not make the clipped result unresolved. A tail overlapping the
request is excluded from both passing and failing sets. An empty void list
with unresolved coverage never establishes a passing window.

For an initial sign whose entry precedes the scan, the source can establish
classification after the requested start from future contacts and the ending
ingress. It may report a clipped void with a null last contact, meaning that
the true last contact or entry is outside the scan. Such a result does not
claim to have recovered that historical contact. Source durations, clipping
flags and last-contact metadata stay in the audit on their original clock.

UTC, UT1 and TT coordinates remain explicit throughout; numeric TT or UT1
labels must not be displayed as UTC timestamps. Configuration files still
accept resolved UTC ranges only. The evaluator does not need a birthplace,
house system or natal chart for this geocentric convention.

## Numerical uncertainty and refusals

Noncollapsed contact and ingress brackets contribute unknown spans covering
all their inclusive integer labels. Collapsed brackets use the source's exact
coordinate ownership. If the returned last contact's bracket overlaps its
ending ingress bracket, the preceding sign residence remains unknown: the
contact might belong to the next sign, changing which earlier contact was
last. If a relevant void exit disagrees with the separate ingress audit, or
that audit has incomplete transitions, the requested domain remains unknown.
Malformed clocks, policies, brackets, overlapping void intervals and
discontinuous ingress metadata throw as incompatible source results.

These exclusions describe numerical boundary uncertainty under the source's
contact selection and scan assumptions. The void API does not return every
candidate contact or a proof that contacts near an ingress were assigned to
the physically correct sign. The evaluator cannot certify that ordering from
the last-contact metadata alone. Narrow brackets do not enclose physical
position or frame error, and `completeness` remains `source-scan-assumptions`.
A completed result partitions only the source-established domain. It does not
prove exhaustive astronomical event discovery.

Missing capability, unrepresentable padding, cancellation, exhausted budgets
and native engine refusals produce a refused result with empty passing,
failing and covered sets. Receipts and search audits for work already performed
are retained. A refusal cannot become a partially successful rule. Cancellation
is checked around indivisible synchronous engine calls and before return.
Every result is copied and frozen, without freezing caller-owned inputs.

## Evidence

[void-windows.json](test/fixtures/void-windows.json) records hand-derived golden
sets on its synthetic integer domain. The associated tests check clipping,
endpoint ownership, initial clipped voids, completed contactless signs,
unresolved tails, overlapping numerical brackets, clocks, accounting,
validation and cancellation. Independent Boolean membership across subsets
of declared void and unknown blocks checks the partition. Those tests establish
set logic and control flow, not astronomical accuracy.

[void-cases.json](references/void-cases.json) declares the independent reference
span and boundary acceptance threshold before the native comparison.
[void-horizons.json](references/void-horizons.json) carries NASA/JPL Horizons
DE441 responses for the additional planetary longitudes and reduced void
boundaries. It reuses the committed independent Moon and Sun responses in
[horizons.json](references/horizons.json), identified by a file digest.
[scripts/void-horizons.mjs](scripts/void-horizons.mjs) verifies every request,
raw-response digest, clock and reduction offline. It imports neither engine
nor events code. Acquisition uses the inherited proxy through bounded curl
requests and writes only to gitignored `generated/` for review.

The independent reducer interpolates hourly Moon-minus-body longitude
crossings at the major-aspect angles and groups them between independently
interpolated Moon ingresses. It retains the hourly reference brackets and
selected last contact. [void-references.electional-check.ts](test/void-references.electional-check.ts)
checks the reduction against hand-derived arithmetic, checks provenance
tampering, then compares both native body policies' contacts, exit dates and
assembled failed windows over 2023-10-03 to 2023-10-28 TT. Source acquisition
covers 2023-10-01 to 2023-11-01 TT. The boundary threshold is 600000
milliseconds, enforced by void-cases.json and the native comparison test. It
allows the declared frame, model and hourly interpolation differences; it is
not a general accuracy bound or a predictive claim. Source conventions and
NASA/JPL attribution remain those documented in [references/README.md](references/README.md).

Native comparisons read only an already built events worktree at the fixed
relative test path described in [EVALUATION.md](EVALUATION.md). Absence skips
those comparisons explicitly. The default library loader still uses its fixed
sibling path. The test-run receipt in
[docs/evidence/m5-tests.json](docs/evidence/m5-tests.json) records what ran,
with source/reference digests, without committing engine sky output as an
expectation. Reproduce it with the command recorded in that file and
[scripts/record-m5-tests.mjs](scripts/record-m5-tests.mjs).

From `electional/`, after the local build, the executable smoke check is:

```sh
node scripts/void-horizons.mjs --verify
node scripts/check-void-esm.mjs
```
