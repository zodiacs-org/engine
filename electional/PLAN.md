# Electional search workbench plan

Implement the next unchecked milestone in each harness session, run its checks,
tick it only after completion, and append one line to `CHANGES.txt`. Keep all
writes inside `electional/`. Git changes are handled by the harness.

- [x] M1 Create an isolated private TypeScript project and half-open interval arithmetic with hand-derived golden fixtures, boundary validation, and independent set-membership tests.
- [x] M2 Define a versioned JSON rule schema, JSON/YAML loading and strict validation for locations, resolved date ranges, rule options, weights, and one explicitly synthetic natal input.
- [x] M3 Add read-only engine and events adapters with explicit clocks, coverage, budgets, cancellation, refusal handling, and engine receipts; use relative imports when events is present and report missing capability when absent.
- [x] M4 Evaluate Moon sign and phase rules and Mercury/Venus direct-motion windows through existing engine/events APIs, with independently sourced astronomical reference instants.
- [x] M5 Evaluate Moon not void of course with explicit body/aspect conventions, lookahead, clipping and unresolved-tail handling through the events API.
- [x] M6 Evaluate planetary-hour rules through the engine sky entry, including local solar-day ownership, missing rise/set and polar refusals.
- [x] M7 Evaluate benefics angular or in selected houses and applying aspects to selected bodies using engine chart, house and configured-aspect APIs; expose house fallbacks and boundary uncertainty.
- [x] M8 Add eclipse and station avoidance within declared day margins using padded events searches and interval subtraction, preserving event clocks and coverage refusals.
- [x] M9 Add optional synastry rules against one synthetic natal chart through the existing engine API, with explicit aspect policies and receipt provenance.
- [x] M10 Compose chronological condition windows with required/preferred checks, neutral per-rule explanations, unresolved coverage and engine receipts; default output contains no scoring or ranking.
- [x] M11 Stream chronological factual condition windows over long ranges with bounded work, cancellation, chunk lookahead and seam reconciliation; preserve required failures and unknowns.
- [x] M12 Add a facts-only CLI for JSON/YAML rule files and neutral launch, contract-signing and travel conditions-to-check packs, documented as traditional conventions.
- [x] M13 Add a small bounded facts-only HTTP condition endpoint with validation, deadlines, cancellation and transport tests; isolate optional numeric scoring behind explicit internal/pro opt-in, with no ranking or consumer scoring.
- [x] M14 Finish executable synthetic condition examples, independent reference/evidence records, long-range checks and package-isolation verification; verify neutral chronological defaults without scores or ranks and document remaining uncertainty.

## Final scope

All default library, streaming, CLI and HTTP results are factual and chronological.
Every window retains its satisfied, failed and unresolved user-chosen checks.
No output ranks or recommends dates. One separate numeric annotation module is
internal/pro-only, requires explicit `enabled: true`, and preserves chronology.
It must never be enabled on the ChatGPT app or zodiacs.org. Historical session
records describe the builds measured then; M13 supersedes their scoring contract.

## Design constraints

Time windows use `[startMs, endMs)` with integer epoch-millisecond endpoints.
The event adapter must explicitly convert event ownership from `(start, end]`
without shifting astronomical instants. Numeric labels on TT or UT1 must never
be presented as UTC timestamps. Unknown or refused coverage must not become a
passing rule or a completed empty search.

Astronomical searches delegate to the existing engine or events package. Read
`origin/infra/events` with git when needed; never copy or modify that project's
implementation. If its files are unavailable locally, make the integration
conditional and test the missing-capability path. Do not implement a second
event solver. Source adapters may read the parent engine through relative
imports; local build output stays in a gitignored directory here.

Fixtures must state their independent arbiter and derivation. Hand-derived
interval logic establishes set behavior, not astronomical accuracy. Later
astronomical fixtures must come from JPL Horizons or published ephemerides,
with source, clock, frame, acquisition and redistribution terms recorded.
Never create expected astronomical values from this engine's output.

Tests use an electional-specific filename and Vitest include pattern so the
parent project's default Vitest discovery does not adopt this workbench's
tests. Generated data, caches and builds stay in gitignored directories.
Code and documentation use the repository MIT license; engine data retains
its existing attribution requirements. No release or git-write operations
belong to these milestones.
