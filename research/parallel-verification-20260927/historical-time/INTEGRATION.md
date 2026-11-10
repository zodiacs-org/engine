# Integration contract for the engine owner

This directory is independent of the engine. It installs nothing and edits no package, API, site or release configuration. Review it separately when the paused implementation resumes.

## Acceptance cases to borrow

| Input or situation | Required behaviour |
|---|---|
| A source records its approval date and a later clock-change date | Keep both; use the clock-change clause for conversion |
| A transition is expressed in GMT | Interpret it on GMT, not on the local pre-transition clock |
| A local birth label falls in a spring gap | Report zero valid candidates; ask for record clarification |
| A local birth label falls in an autumn fold | Preserve both candidate instants until a supported convention resolves it |
| A federal law exists, but city or institution applicability is unknown | Return unresolved applicability; do not invent a city offset |
| The requested year lies outside the reviewed record | Refuse that record; do not extrapolate its recurrence |
| A pre-UTC civil label is supplied | Preserve the source time scale; perform any UT1/TT modelling separately |
| A birth-time window straddles a rollback | Represent the admissible instant set; it need not be a single uniform interval |

Keep four concepts separate in the future API: recorded local label, applicable legal regime, evidence of actual recording convention, and conversion to the astronomical calculation time scale. A probabilistic birth-time prior is a fifth, independent input; neither a law nor the size of a clock fold supplies one.

For now, all records have `production_eligible: false`. To promote a record, obtain independent review and attach place/date applicability evidence plus amendment/exception checks. That is a data governance decision, not something this test runner can certify.

The dataset intentionally avoids IANA IDs. Mapping a named city to a meridian regime would need source-backed boundary evidence. Reusing an existing timezone database is a separate integration choice and should record the database version and its limitations.

## Suggested integration test adapter

The engine need not import this Python code. Its own test adapter can consume `rules.json`, verify that its explicit-offset input handling reproduces each fixture, and label those checks “conditional legal-rule fixtures.” Do not label them “validated historical birth times.” The standalone validator remains useful as a small independent implementation of civil arithmetic.

An eventual library implementation should return typed results such as `unique`, `gap`, `fold`, `unresolved_applicability` and `unsupported_period`. The names are suggestions, not a proposed engine API change. Include the source IDs and the assumptions used for each candidate so the uncertainty feature can preserve them.
