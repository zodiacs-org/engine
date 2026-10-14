# Numerology implementation plan

Work only inside `numerology/`. The project is private, MIT licensed, and
excluded from the engine package. Do not change engine sources, packed files,
archives, root configuration, or git metadata. Use synthetic identities and
calendar dates throughout. Generated output belongs in locally ignored folders.

Each session implements the next unchecked milestone, runs its checks, ticks
the milestone, and appends a single line to `CHANGES.txt`. The harness handles
commits and draft pull requests. Stop after the session's milestone is complete.

- [x] M1 Create the isolated TypeScript project and exact reduction API with configurable master numbers, karmic-debt annotations, JSON-safe step receipts, original meanings, handwritten golden cases, and deterministic arithmetic properties.
- [x] M2 Validate Gregorian birth dates without timezone conversion; implement life path and birthday with explicit component versus whole-date reduction conventions and receipts.
- [x] M3 Normalize Latin Unicode names with documented diacritic and ligature rules, per-character receipts, strict unsupported-character handling, and configurable Y-as-vowel classification.
- [x] M4 Add versioned explicit transliteration tables for Greek and Cyrillic, caller-supplied mappings for other scripts, normalization provenance, and unsupported-script tests. Document that transliteration is a convention, not a pronunciation inference.
- [x] M5 Implement Pythagorean and Chaldean letter tables, expression/destiny, soul urge, and personality; record selected system, original compounds, master policy, letter contributions, and reductions.
- [x] M6 Implement maturity, karmic lessons, and hidden passion, including tied frequencies and empty vowel/consonant selections, with receipts and original meanings.
- [ ] M7 Implement personal year/month/day cycles with explicit calendar-year boundaries, caller-supplied target dates, and no implicit current clock.
- [ ] M8 Implement pinnacles and challenges with documented age intervals, single-digit challenge arithmetic, zero challenges, and complete component receipts.
- [ ] M9 Assemble deterministic profiles and name-change comparisons using the same birth date and conventions, with auditable before/after deltas and no inferred identity data.
- [ ] M10 Add a JSON CLI for profiles, cycles, and comparisons with strict options/input validation, stdin support, stable output, structured errors, and subprocess tests.
- [ ] M11 Expand handwritten synthetic golden fixtures across both systems, scripts, and date boundaries; add seeded properties for conservation, normalization equivalence, receipt replay, and library/CLI parity.
- [ ] M12 Complete API and CLI documentation, conventions/provenance and licensing records, local consumer smoke checks, and isolation/evidence checks; verify that no project file enters the engine package.

## Conventions to carry through the milestones

Numerology arithmetic represents declared symbolic conventions. Test exact
arithmetic and documented behavior; do not describe fixtures as evidence of
predictive accuracy. Interpretive text must be authored for this project.
Preserve the unreduced compound and every performed reduction, recording when
a master number stops reduction. Karmic debt is attached only to values actually
visited on the relevant reduction path, with a stage locator, never inferred
from an unrelated digit substring. Name and date formulas must state which
components are reduced before summation. Both systems share calendar arithmetic
unless an explicitly named convention says otherwise; the Chaldean name table
does not silently change date formulas or master handling.

Use exact nonnegative integers and JSON-safe receipts. Reject invalid input
before calculation. APIs must not fetch, read the clock, mutate caller input,
or import the astrology ephemeris. Birth dates are civil Gregorian dates,
independent of instants and timezones. Script tables are explicit and local;
unsupported names require an explicit mapping rather than silently losing
letters. Y classification must remain configurable and visible in receipts.

Run project tests and type checks using its own scripts. Run the repository's
package-contents check after adding files if its existing build is available;
otherwise record the missing-build limitation and check package exclusion with
a script-free npm dry run. Do not generate root `dist/` to satisfy that check.

## Initial overlap review

Before M1, read the repository instructions, contribution and licensing rules,
root README, and the archive, conformance, and atlas READMEs. Read git history
and search the available local and origin `main` and `infra/*` refs for
`numerology`, `pythagorean`, `soul urge`, and `hidden passion`: no matches.
The existing Chaldean planetary order and faces are astrology features and
do not implement numerological letter mapping. This review covers locally
available git refs, not unfetched remote changes. Recheck overlapping areas
when later milestones introduce integration work.

## M1 validation

Project `npm run typecheck` and `npm test` passed on Node 22.22.2, using the
local pinned TypeScript compiler. `test/reduction.test.mjs` checks the
handwritten fixtures, exact receipt replay, independent digital-root
properties, invalid inputs, allocation bounds, and deep freezing.
`test/isolation.test.mjs` checks script-free npm package exclusion, authored
file size bounds, and documentation punctuation. Build output and caches
are ignored locally. Only files under `numerology/` were added.

The root `npm run package:contents` was attempted with a writable local npm
cache and fails because this checkout lacks `dist/calc.d.ts`. Its full gate
remains unverified. The script-free npm dry run confirms project exclusion,
but does not establish that the engine build satisfies its contents or
size budgets. Root `dist/` was not generated. M2 is the next session's work.

## M2 validation

Added strict civil-date parsing, life path under component and whole-date
formulas, and birthday. All results retain the civil date, declared master
policy, original reduction compounds, step receipts, original meaning text,
and source-local debt stages. The project README documents the accepted
calendar domain, formulas, receipt structure, and fixture references.

Project `npm run typecheck` and `npm test` passed on Node 22.22.2.
`test/dates.test.mjs` checks handwritten synthetic fixtures, Gregorian
calendar validation against UTC Date normalization over the cycle from
1600 through 1999, seeded independent arithmetic, debt provenance, every
birthday day, invalid inputs, JSON serialization, freezing, and timezone
independence. The engine package-exclusion and authored-file isolation tests
also passed. No numerology implementation was found outside this project
when rechecking the available local and origin `main` and `infra/*` refs.

The root `npm run package:contents` was attempted again with the local cache
and remains blocked by missing `dist/calc.d.ts`. Script-free npm dry-run
exclusion passed; the complete engine contents and size gate remains
unverified. No root build was generated. Only `numerology/` changed.
M3 is the next session's work.

## M3 validation

Added Latin name normalization with an authored, versioned ASCII mapping
table, canonical diacritic handling, finite punctuation boundaries, explicit
Y policies, and frozen per-character and expanded-letter receipts. The
project README documents every mapping, accepted separators and marks,
allocation bounds, rejection behavior, and classification conventions.

Project `npm run typecheck` and `npm test` passed on Node 22.22.2.
`test/names.test.mjs` checks handwritten synthetic fixtures in
`test/fixtures/names.json`, a complete receipt, every explicit Latin table
entry and its case forms, canonical equivalence, separator and mark ranges,
strict unsupported-character rejection, allocation boundaries, immutability,
and seeded independent expansions, classifications, conservation, receipt
replay, and normalization idempotence. Existing date and reduction tests and
engine package-exclusion and authored-file isolation tests also passed.
The local runtime and test output remain in ignored `.cache/` paths.

No overlapping numerology or name-normalization implementation was found
outside this project in the available local and origin `main` and `infra/*`
refs. This checks locally available refs, not unfetched remote changes.
The root `npm run package:contents` was attempted with the local cache and
remains blocked by missing `dist/calc.d.ts`. Script-free npm dry-run
exclusion passed; the complete engine contents and size gate remains
unverified. No root build was generated. Only `numerology/` changed.
M4 is the next session's work.

## M4 validation

Added authored, versioned Greek and Cyrillic scalar tables and bounded exact
caller mappings for letters and attached marks. Cyrillic canonical context
preserves explicitly mapped composed-letter distinctions, with a separate
receipt for every source scalar. Intentional silent mappings remain auditable
and do not create empty tokens. The development normalization receipt now
records all built-in identifiers and a complete sorted, frozen caller-table
snapshot. The README documents every built-in mapping, canonical and exact
caller rules, bounds, provenance, and the absence of pronunciation inference.

Project `npm run typecheck` and `npm test` passed on Node 22.22.2.
`test/transliteration.test.mjs` checks handwritten synthetic fixtures in
`test/fixtures/transliteration.json`, complete table and case coverage,
canonical equivalence over the declared cases, source-context receipts,
intentional omissions, mixed scripts, astral source indices, caller-table
sorting and ownership, exact overrides, unsupported scripts and partial maps,
accessor rejection, allocation bounds, and seeded independent emissions,
classification, conservation, receipt replay, and ASCII idempotence.
The shared replay helper also checks existing Latin fixtures, while date,
reduction, package exclusion, file size, and documentation checks still pass.
Generated build and logs remain in ignored project paths.

Rechecked all available local and origin `main` and `infra/*` refs for
overlap. The geocode project's use of supplied place transliteration fields
does not implement a general name transliterator or numerology arithmetic.
No overlapping implementation was found outside this project; this review
does not cover unfetched remote changes.

The root `npm run package:contents` was attempted with the local runtime and
cache and remains blocked by missing `dist/calc.d.ts`. Script-free npm dry-run
exclusion passed; the complete engine contents and size gate remains
unverified. No root build was generated. Only `numerology/` changed.
M5 is the next session's work.

## M5 validation

Added frozen versioned Pythagorean and Chaldean letter tables, expression
with its exact destiny alias, soul urge, and personality. Each calculation
sums raw selected letter values across the whole supplied name before
reduction, with the selected system, master policy, full normalization and
caller-table provenance, original compound, letter/source locators, and
all reduction steps in a frozen JSON-safe receipt. Empty vowel/consonant
selections retain arithmetic zero with original text explaining their absence.
The README documents the complete tables, formulas, receipt structure,
debt scope, options, empty selections, and the Chaldean table reference
checked in Cheiro's own published work. The project's selections and master
handling are declared combined conventions rather than a reproduction of
all the book's formulas or interpretive text.

Project `npm run typecheck` and `npm test` passed on Node 22.22.2.
`test/name-numbers.test.mjs` checks handwritten synthetic fixtures in
`test/fixtures/name-numbers.json`, complete table coverage, master and debt
paths, every ordered ASCII letter pair under both systems and master
policies, and seeded mixed-script spelling controls under every Y policy.
It independently checks letter sums, positional bigint reductions, digital
roots, raw vowel/consonant conservation, full receipt replay, canonical and
ASCII equivalence over declared inputs, source and expansion indices,
strict rejection, allocation bounds, freezing, and caller ownership.
Existing normalization, transliteration, date, reduction, package exclusion,
file size, and documentation punctuation checks also pass. Generated build
and validation logs remain in ignored project paths.

Rechecked all available local and origin `main` and `infra/*` refs for
numerology and related name arithmetic outside this project; no overlapping
implementation was found. This review covers locally available refs, not
unfetched remote changes.

The root `npm run package:contents` was attempted with the local runtime and
cache and remains blocked by missing `dist/calc.d.ts`. Script-free npm dry-run
exclusion passed; the complete engine contents and size gate remains
unverified. No root build was generated. Only `numerology/` changed.
M6 is the next session's work.

## M6 validation

Added maturity from reduced life path plus reduced expression under a shared
master policy, with complete source results, original compounds, all reduction
steps, and source/component/stage debt locators. Added karmic lessons and
hidden passion from full-name raw letter-value frequencies, including every
positive-frequency tie. Karmic lessons use the selected table's assigned
domain; the unassigned Chaldean nine remains visible as ineligible. Frequency
receipts retain normalization and expression provenance, contribution indices,
every count increment, and an explicit declaration that selection does not
perform digit reduction. New prompts are original project text. The README
documents formulas, options, empty selections, debt scope, and these declared
conventions with fixture and test references.

Project `npm run typecheck` and `npm test` passed on Node 22.22.2.
`test/derived.test.mjs` checks handwritten synthetic fixtures in
`test/fixtures/derived.json`, complete frequency receipts, debt provenance,
all assigned values and tied maxima, empty vowel/consonant selections,
every ordered ASCII letter pair under both systems, and seeded mixed-script
controls under both systems, master policies, date methods, and every Y
policy. It independently replays bigint reductions and letter counts,
checks raw count and weighted-sum conservation, canonical and ASCII
equivalents over declared cases, policy invariance of frequencies, source
and expansion indices, caller-mapped marks, allocation boundaries, strict
rejection, serialization, deep freezing, and caller ownership. A subprocess
also verifies import and calculation with clock and network entry points
disabled. Existing normalization, transliteration, name-number, date,
reduction, package exclusion, file size, and documentation checks pass.
Generated build output and validation logs remain in ignored project paths.

Rechecked all available local and origin `main` and `infra/*` refs for
numerology, Pythagorean, soul urge, hidden passion, and karmic lesson overlap
outside this project; no overlapping implementation was found. This review
covers locally available refs, not unfetched remote changes.

The root `npm run package:contents` was attempted with the local runtime and
cache and remains blocked by missing `dist/calc.d.ts`. Script-free npm
dry-run exclusion passed; the complete engine contents and size gate remains
unverified. No root build was generated. Only `numerology/` changed.
M7 is the next session's work.
