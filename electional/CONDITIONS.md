# Chronological condition windows

`searchElectional(ruleSet, dependencies, options)` evaluates the declared
checks through the existing engine and events adapters. `composeRuleWindows`
combines already evaluated sets without sampling a chart or discovering an
event. Both return chronological constant-state windows with each rule marked
`satisfied`, `failed` or `unresolved`. Default results contain no score,
contribution or rank. A failing required check remains visible.

All sets use half-open integer epoch-millisecond intervals on UTC. Each rule's
satisfied and failed sets partition its covered domain; unresolved spans fill
the remaining domain. Composition rejects overlapping states, missing
coverage, mismatched rules, locations, house settings, natal inputs or clocks,
and covered calculations without native provenance.

`eligible` is the intersection of required satisfied sets. `excluded` is the
union of known required failures. `unresolvedRequired` is the remaining domain
where neither required success nor a known required failure is established.
These are descriptions of user-chosen checks, not activity assessments.
Preferred checks partition windows too but do not change that intersection.
Adjacent windows merge only when all rule states and diagnostic reasons match.
They stay in chronological order regardless of duration or declared weights.

Every window carries per-rule explanations, local uncertainty and source
receipts. Each explanation retains its rule and source status. `ruleResults`
retains the full source audit, including scan windows, house fallbacks,
planetary-hour days and synthetic natal policies. Receipt scope is
`source-evaluation-provenance;not-every-instant-in-window`: source calculations
carry their own clocks and conventions, without certifying every interior
instant or authenticating externally supplied results.

`complete` means all checks resolved the range under the source scan
assumptions. `unresolved` preserves unknown coverage or a refused preferred
capability. `refused` means a required capability or shared resource stopped
the operation; windows are suppressed and full refusal audits remain. An empty
required intersection is a factual result with failed or unknown windows,
distinct from a refused search.

The coordinator delegates in declaration order under shared request and sky
sample budgets. Cancellation is checked between rules and after the final
call. Synchronous calls cannot be interrupted within this API. The stream in
[STREAMING.md](STREAMING.md) adds chunk ownership and bounded output; the
HTTP host in [HTTP.md](HTTP.md) can terminate a dedicated worker on a deadline.
`loadSearchDependencies()` reads existing local builds only. Missing events is
an explicit capability refusal, without building or modifying that worktree.

[test/composition.electional-check.ts](test/composition.electional-check.ts)
checks the manually derived cells in
[test/fixtures/composition-windows.json](test/fixtures/composition-windows.json)
over its declared integer domain, including failed and unknown required
states. Its exhaustive finite-state cases independently enumerate rule
membership. [test/search.electional-check.ts](test/search.electional-check.ts)
checks delegation, budgets, refusals and cancellation.
These references establish set behavior and control flow, not astronomical
accuracy. Existing astronomical references are in [references/README.md](references/README.md).

The only numeric annotation module is documented in [SCORING.md](SCORING.md).
It is separately imported, requires explicit internal/pro opt-in and never
changes chronology or factual rule states.
