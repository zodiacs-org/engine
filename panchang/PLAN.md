# Panchang implementation plan

Each session completes the next unchecked milestone, runs its checks, ticks
that milestone and appends a summary to CHANGES.txt. Work stays in panchang/.
The harness owns commits, pushes and the draft pull request.

- [x] M1 Establish an isolated private TypeScript project, Vitest and typechecking; add a receipt-preserving Sun/Moon engine adapter with selectable Lahiri-default ayanamsa, source ledger and independent reference smoke tests.
- [x] M2 Validate civil dates, synthetic observer inputs and IANA zones; reuse engine timezone resolution for civil-day boundaries, including gaps, folds, skipped dates and historical preparation.
- [x] M3 Define instantaneous tithi/paksha, yoga and karana classification; reuse engine nakshatra/pada; test rational boundaries, wrapping and the complete fixed/moving karana sequence against hand-derived arithmetic.
- [x] M4 Resolve sunrise-to-next-sunrise windows and vara through engine sky searches; record horizon conventions and explicit missing-sunrise refusals; test synthetic sites and independent rise references.
- [x] M5 Find and order limb and pada transitions through engine longitude crossings; record true start/end instants beyond day clipping, boundary ownership, search budgets and resolution; verify analytical crossing instants.
- [ ] M6 Assemble the pure panchang day API with chronological segments, sunrise state, convention metadata, ayanamsa and engine receipts; test clipping, simultaneous events and whole-result refusals.
- [ ] M7 Determine adjacent new/full moons and sidereal solar ingresses; implement explicit amanta and purnimanta lunar-month naming with independently documented conventions and arithmetic fixtures.
- [ ] M8 Detect adhika and kshaya months from ingress counts and identify kshaya/vriddhi tithis across consecutive sunrises; add independent constructed anomaly tests and sourced astronomical cases.
- [ ] M9 Implement date-range API with civil-date iteration, shared calculations, chronological results and bounded work; test DST, historical offsets, missing dates and range limits.
- [ ] M10 Add panchang day and panchang range CLI commands with explicit coordinates/timezone/month convention/ayanamsa, JSON and neutral plain text; test parsing, output order and exit statuses.
- [ ] M11 Add small independently published transition-instant fixtures and reproducible source retrieval tools; document timescales, ayanamsa, horizon conventions and preregistered comparison tolerances in SOURCES.md.
- [ ] M12 Review API and CLI documentation, reference coverage, edge cases and isolation; run the complete panchang checks and verify exclusion from the engine package without changing its build or archives.

## Design constraints

The output contains chronological astronomical and calendar facts only.
No auspiciousness, muhurta selection, good/bad periods, date/time rankings,
predictions, scoring, electional search, calendar/ICS export or HTTP API.
Existing dasha, varga and KP calculations are outside this project.

Import the engine's source by relative paths from this checkout. Reuse its
calc ayanamsa and sidereal conversion, Vedic nakshatra, sky rise/set,
longitude-crossing solver and geo timezone modules. Do not write an
ephemeris, precession model, sidereal converter, sunrise solver or timezone
database. Preserve engine refusals, receipts, timescale facts and bounds.

Sunrise days will be half-open intervals from a local-date sunrise to the
next local-date sunrise. Civil dates use the proleptic Gregorian calendar.
Missing or ambiguous sunrise windows require explicit handling, with no
invented polar sunrise. Month convention is an explicit input. Transition
instants must state the numerical resolution and reference coverage;
computed roots do not establish exact physical accuracy.

Fixtures use synthetic observers, independently published astronomical
instants or separately hand-derived arithmetic. Source retrieval and
licensing belong in SOURCES.md. Engine-parity checks are integration checks,
not independent accuracy evidence. Large downloads and generated working
data go into ignored directories. Each committed file stays below 2 MB.
