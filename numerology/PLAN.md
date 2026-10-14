# Numerology implementation plan

Work only inside `numerology/`. The project is private, MIT licensed, and
excluded from the engine package. Do not change engine sources, packed files,
archives, root configuration, or git metadata. Use synthetic identities and
calendar dates throughout. Generated output belongs in locally ignored folders.

Each session implements the next unchecked milestone, runs its checks, ticks
the milestone, and appends a single line to `CHANGES.txt`. The harness handles
commits and draft pull requests. Stop after the session's milestone is complete.

- [x] M1 Create the isolated TypeScript project and exact reduction API with configurable master numbers, karmic-debt annotations, JSON-safe step receipts, original meanings, handwritten golden cases, and deterministic arithmetic properties.
- [ ] M2 Validate Gregorian birth dates without timezone conversion; implement life path and birthday with explicit component versus whole-date reduction conventions and receipts.
- [ ] M3 Normalize Latin Unicode names with documented diacritic and ligature rules, per-character receipts, strict unsupported-character handling, and configurable Y-as-vowel classification.
- [ ] M4 Add versioned explicit transliteration tables for Greek and Cyrillic, caller-supplied mappings for other scripts, normalization provenance, and unsupported-script tests. Document that transliteration is a convention, not a pronunciation inference.
- [ ] M5 Implement Pythagorean and Chaldean letter tables, expression/destiny, soul urge, and personality; record selected system, original compounds, master policy, letter contributions, and reductions.
- [ ] M6 Implement maturity, karmic lessons, and hidden passion, including tied frequencies and empty vowel/consonant selections, with receipts and original meanings.
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
