# Composing and ranking rule windows

`searchElectional(ruleSet, dependencies, options)` evaluates a validated rule
set through the existing rule evaluators and returns ranked windows. It does
not sample another chart, discover another event, or convert clocks during
composition. The rule schema resolves the search range to UTC; the lower-level
evaluators still support their documented clocks. Supplying TT or UT1 results
to the UTC composer is an error.

`loadSearchDependencies()` loads the existing local engine bridge and optional
relative events build described in [ADAPTERS.md](ADAPTERS.md). Callers may supply
the same read-only runtime interfaces explicitly, including an already built
events worktree. The coordinator reports missing capabilities; it does not
check out, build or install the events project.

```js
import { loadSearchDependencies, searchElectional } from './build/index.js';

const result = searchElectional({
  schemaVersion: 'electional/v1',
  activity: 'Synthetic selection example',
  location: { latitude: 0, longitude: 0 },
  houseSystem: 'whole',
  range: {
    start: '2000-09-22T12:00:00Z',
    end: '2000-09-22T12:01:00Z',
    clock: 'utc',
  },
  rules: [
    { id: 'sign', kind: 'moon-sign', mode: 'require',
      options: { signs: ['taurus'] } },
    { id: 'phase', kind: 'moon-phase', mode: 'prefer', weight: 5,
      options: { phases: ['Waxing Crescent'] } },
  ],
}, await loadSearchDependencies(), {
  stepMs: 60000,
  lookaheadMs: 0,
  maxEvaluations: 10000,
  maxSkySamples: 100000,
});
console.log(result.status, result.windows, result.refusals);
```

The example supplies controls, not a completeness guarantee. The source scan
step and Moon-not-void lookahead need to suit the selected rules and range.
An eclipse rule additionally requires explicit `eclipse` settings with the
spherical model and derivative step described in [AVOIDANCE.md](AVOIDANCE.md).
No radius model or scoring policy is inferred from the activity label. Rule
choices describe traditional conventions and do not predict an activity's
outcome.

## Hard rules and preferences

A candidate is the intersection of all hard rules' satisfied sets. A hard
failure excludes its span even when another hard rule is unknown there.
Unknown hard coverage never becomes a candidate. `eligible` records the hard
intersection, `excluded` records confirmed hard failures, and
`unresolvedRequired` records the remaining spans whose eligibility is unknown.
These sets use the same half-open ownership as [README.md](README.md).

Preferences split eligible spans into constant-state cells. A satisfied
preference earns its declared weight; a failed preference earns no weight.
An unresolved preference contributes only to the upper score bound. Hard rules
have no score contribution. `score.lower` is the sum of earned preference
weights and `score.upper` also includes every unknown preference's possible
weight. `score.maximum` is the sum of all declared preference weights. Scores
are JavaScript number sums in rule declaration order, with no decimal rounding
or normalization. They describe the chosen weights, not probabilities.

`score.status` is `exact` when every preference is resolved, and `bounded`
otherwise. This state remains explicit even when floating-point addition makes
a tiny unknown weight invisible in the numerical bounds. Each window carries
one explanation per declared rule: its options, state, source status, lower
and upper contribution, selection convention, local unresolved diagnostics,
and native receipts.

Ranking compares lower score descending, uncertainty width ascending, duration
descending, then start and end ascending. Ranks start at the first position in
the returned array. Adjacent cells with the same rule states and diagnostic
reasons merge. Equal totals from different preference states keep separate
windows so their explanations stay accurate. Spans separated by a hard failure
or unknown hard coverage never merge. With only hard rules, all passing windows
have an exact zero score and sort by duration and time.

The hand-derived [composition fixture](test/fixtures/composition-windows.json)
enforces a worked example: the weights and score bounds in that fixture, and
the resulting ordering, are checked by
[test/composition.electional-check.ts](test/composition.electional-check.ts).
Its finite-state tests independently enumerate the failed, satisfied and
unknown possibilities on the declared integer-label domain. This is evidence
for Boolean set logic and scoring, with no astronomical accuracy claim.

## Status, refusals and budgets

`complete` means all declared rule evaluations resolved their entire requested
range under their source scan assumptions. A complete search may legitimately
return no windows. `unresolved` means a source left unknown coverage or an
optional capability refused evaluation. Confirmed eligible windows may still
be ranked with bounded preference scores. Source unknowns remain in the
search-wide diagnostic list even when another hard rule excludes their spans.

`refused` means a required capability refused, or shared cancellation/request/
sky-sample limits stopped the search. Resource refusals suppress all ranked
windows, including a previously completed prefix. `eligible` still records the
hard intersection of completed evaluations as an audit; consume `windows` and
`status` together for the search outcome. A missing optional capability can
produce a bounded preference score with empty receipts, explicitly stating that
no native calculation established that preference. No provenance is invented.

The coordinator evaluates rules in declaration order. Every rule receives the
remaining `maxEvaluations` request budget. Planetary-hour rules also share
`maxSkySamples`, rather than restarting the sky allowance for each rule.
Cancellation is checked between rules and after the final delegate returns.
Completed work, refusal details and receipts remain available when work stops;
unattempted rules have explicit refusal records and consume no requests.

`evaluations` counts native API requests as documented by the individual
adapters. It does not count internal finite differences, hidden work inside
`birthWindow`, or sky samples. Those scopes and the full per-rule searches,
policies, house partitions, native sky days and natal audits are retained in
`ruleResults`. Synchronous native calls cannot be interrupted mid-call. This
milestone does not stream, apply deadlines or bound the size of a serialized
result; long-range work is the next milestone in [PLAN.md](PLAN.md).

## Receipts and pure composition

Every ranked window carries the search's native receipt array, and each rule
explanation carries that rule's own receipts. These arrays share frozen objects
in memory. Serializing a result can repeat receipts; callers should bound their
range and work before serializing. The explicit scope is
`source-evaluation-provenance;not-every-instant-in-window`. It preserves endpoint
and scan scopes, natal versus moving clocks, models and conventions; it does
not attest an evaluation at every candidate instant, authenticate an artifact,
or upgrade a numerical bracket to a physical error bound.

`composeRuleWindows(ruleSet, ruleResults)` is the standalone pure operation. It
requires exactly one matching evaluation for each declared rule and verifies
matching UTC domains and available location/house/natal context. The satisfied,
failed and unresolved sets must partition the declared domain, with no known
state overlap, gap or outside span. Refusals cannot claim known states. Known
coverage requires receipt provenance. Result ordering is independent of the
input evaluation order. Snapshots detach and freeze results without freezing
caller-owned inputs. These structural checks do not authenticate externally
supplied calculations.

[search.electional-check.ts](test/search.electional-check.ts) checks every rule
route, shared budget accounting, cancellation, missing capabilities and invalid
controls with explicit hand-derived contracts.
[search-native.electional-check.ts](test/search-native.electional-check.ts)
checks composition through the existing events solver using invented linear
functions whose selected windows follow from their equations. It also checks
native receipt and audit transport with a real-engine selection of every sign,
house and hour ruler, without pinning any astronomical position. Existing
independent Horizons and NASA comparisons remain in their original reference
tests. The complete session report is
[docs/evidence/m10-tests.json](docs/evidence/m10-tests.json), generated by
[scripts/record-m10-tests.mjs](scripts/record-m10-tests.mjs).
