# Combined year and range reports

`searchMundaneReport(request, options?)` combines the existing ingress and
lunation searches into one chronological event list. Supply a UTC calendar
year or resolved `from` and `to` instants, a place, and an optional house
system. Request normalization captures the range and place once, and passes
the same captured values to both searches. There is no extra timing solver,
chart calculation, scoring, or interpretation.

The result contains `request`, `status`, `events`, and `searches` metadata,
with the label `traditional conventions, not predictions`. Each event keeps
its existing `kind`, event-specific fields, chart, angularity, angle rulers,
and factor list. Narrow by `kind` to read ingress `sign` or lunation `phase`.
Factor source pointers remain relative to their containing event. House
fallback, reference flags, clock metadata, and calculation provenance remain
on each chart. Results are deeply frozen and JSON-compatible.

Ordering uses epoch milliseconds, with ingresses before lunations at a time
tie, then target longitude or target elongation for ties within a kind.
Coincident events remain separate entries; time alone is not an event id.
The report does not group events by kind, phase, or sign.

Windows inherit `(from, to]`: the opening instant is excluded and the closing
instant is included. A year spans January midnight through the following
January midnight, using the same membership rule. A valid range without
events returns `status: "complete"` with an empty event list. Equal or
reversed endpoints are invalid. Each component retains its finite refinement
and integer-Date resolution. Changing a window may change its sample grid
and the last digits of refined event instants. The exact synthetic partition
tests below do not prove arbitrary astronomical window partitioning.

## Budgets and refusals

`options.ingressMaxSamples` replaces the ingress search's Sun longitude
evaluation budget; `options.lunationMaxSamples` replaces the lunation search's
elongation evaluation budget. Both must be positive safe integers when
supplied. Omitted budgets use the respective component defaults. Unsupported
options, non-data properties, and non-plain options objects are rejected
before searching. Budgets remain separate because they measure different
operations. The report does not add their sample counts together or impose
a time limit.

`searches.ingresses` and `searches.lunations` each retain `status`, `samples`,
and the component's `search` metadata, plus `reason` on refusal. These
summaries omit repeated requests and chart arrays. Their budget units,
sampling steps, and completeness statements remain unchanged. See
[ingresses.md](ingresses.md) and [lunations.md](lunations.md) for those
contracts and clock limitations. Search completion is labelled
`engine-sampled-search;not-proven`, preserving the component limitation.

Both searches run so that their outcomes and work are recorded, even when
one refuses. If either refuses, the report returns `status: "refused"`,
`reason: "sample-budget"`, and `events: []`. A successful component's charts
may already have been cast; the report discards those charts rather than
exposing an incomplete event list. Raising that component's budget alone
does not repair a refusal from the other search. Invalid input, unsupported
ephemeris endpoints, and calculation failures still throw; a thrown failure
does not become a successful or partial report.

## Derivation and validation scope

[test/report.test.ts](../test/report.test.ts) defines artificial Sun longitude
as elapsed days `d` and Moon longitude as `13d`, both modulo 360 degrees,
from the arbitrary epoch `2000-01-01T00:00:00Z`. Cardinal ingress roots are
`d = 90k`; directed elongation is `12d`, so New Moons occur at `d = 30k` and
Full Moons at `d = 15 + 30k`. Cancer and a New Moon therefore coincide at
day 90. These expectations are algebraic derivations, not prior engine
outputs or astronomical references. The real engine solvers and chart
casting remain active.

The tests enforce chronological and tie ordering through day 105, adjacent
windows through day 180, and millisecond windows around the day-90 root.
They also exercise empty event ranges, separate exact budgets, either
component's refusal, detached inputs, validation, and JSON compatibility.
A deliberately impossible set of simultaneous targets tests ordering within
each kind without claiming that such a sky can occur.

Integration checks compare the combined report to component APIs for the
synthetic place and year used in the README example. A synthetic polar place
over March 1750 checks house fallback and outside-reference flags. These
comparisons establish composition and metadata preservation only. Independent
timing evidence remains in [ingress-references.md](ingress-references.md) and
[lunation-references.md](lunation-references.md). No new astronomical tolerance
or claim about predictive validity is introduced here. The session check
record is [evidence/m10/checks.txt](evidence/m10/checks.txt).
