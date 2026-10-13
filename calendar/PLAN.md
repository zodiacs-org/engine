# Calendar implementation plan

All authored files and local generated output stay under `calendar/`. The
parent engine sources, package metadata, build output and carried archives
stay unchanged. The harness owns git writes. Each session completes the next
unchecked milestone, runs its checks, updates this checklist, appends one line
to `CHANGES.txt`, and stops.

- [x] M1 Bootstrap an isolated private TypeScript project and receipt-bearing event model; implement UTC iCalendar serialization with TEXT escaping, UTF-8 folding, small golden fixtures and independent parser round trips.
- [x] M2 Define versioned event identities and stable UID generation; test regeneration, overlapping windows, changed labels, chart identities and nearby exact passes.
- [x] M3 Add timezone-aware DTSTART/DTEND with TZID and matching VTIMEZONE definitions; test daylight-saving folds, gaps and non-hour offsets while preserving exact UTC receipt instants.
- [x] M4 Integrate the existing events package through a relative-source adapter, with pinned read-only branch extraction into an ignored local cache if needed; validate ranges, UTC clocks, budgets and complete/refused results, and export ingresses.
- [ ] M5 Export personal natal transit exacts using engine natal charts and the events package's moving-to-fixed aspect search; retain aspect policy, residual orb, chart identity and calculation receipts.
- [ ] M6 Define and implement synastry exact exports for two explicitly synthetic charts using engine APIs; distinguish static natal aspects from any explicitly selected moving-chart convention, with documented event timing.
- [ ] M7 Export stations and solar/lunar eclipses through existing event searches; preserve event definitions, directions, geometry, time conventions and source limitations.
- [ ] M8 Export void-of-course Moon intervals through existing event APIs, with explicit body/aspect policy, interval boundaries and unresolved-result handling.
- [ ] M9 Add async streaming over bounded search windows with backpressure, cancellation, deterministic ordering and boundary deduplication; verify chunked and unchunked output agree.
- [ ] M10 Add the CLI for validated synthetic chart/range/query inputs, event selection, UTC or TZID output, stdout/files, useful failures and reproducible generation timestamps.
- [ ] M11 Add a small HTTP feed endpoint with streaming, configured synthetic schedules, stable feed URLs, conditional requests, bounded work and disconnect cancellation.
- [ ] M12 Finish mixed-feed golden/round-trip integration checks, long-range streaming evidence, usage examples and source/package isolation checks; document limitations and local verification commands.

## Design constraints

Use the parent engine through relative imports. Do not implement event search
algorithms here. At project creation, `origin/infra/events` is available as git
objects and exports `executeQuery` and lower-level searches from
`events/src/index.ts`; its files are absent from this worktree. Recheck that
read-only branch when implementing M4. Keep extracted files in a gitignored
calendar cache and preserve their provenance. Do not modify another worktree
or silently duplicate its search implementation.

All stored examples, tests and fixtures use synthetic data. Serializer
fixtures test formatting and preservation, not astronomical accuracy. Engine
receipts are calculation records, not authentication. Preserve their UTC
instant, bodies, event type or aspect and orb without claiming more precision
than the underlying search provides. A non-angular event uses a null orb.
Calendar DATE-TIME values cannot express fractions of a second; retain the
original instant in the structured receipt. Never label a TT or UT1 epoch
as UTC. Define search window boundaries and interval clipping before export.

The engine's `synastry(a, b)` describes two fixed charts and supplies no future
exact instant. M6 must give any dated synastry export an explicit convention;
it must not manufacture a future event from a static aspect. Search estimates
may depend on the sampling window, so M2/M9 must test identity across changes
of window and chunk size, not just hash an unqualified numerical root.

Follow RFC 5545 for content lines, values, VEVENT and timezone components.
Generated feeds, build output, dependency installs and downloaded inputs are
gitignored. Commit only small reviewed fixtures. Keep each authored file below
the user-specified size limit, use no em dashes in documentation, and keep
secrets out of files. Calendar code and documentation use the repository's MIT
license; upstream engine data retains the terms in `../LICENSING.md` and
`../NOTICE`.
