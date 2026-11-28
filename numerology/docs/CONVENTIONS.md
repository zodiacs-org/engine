# Conventions and provenance

This project implements declared symbolic arithmetic. System labels identify
letter tables, not historical authenticity, pronunciation, or scientific
validity. A result is a reflection prompt under its recorded settings.
[README](../README.md) gives the complete formulas and test references;
[API](API.md) indexes the entry. All example identities and dates are invented.

## Decisions needed for replay

| Choice | Project convention | Local evidence |
| --- | --- | --- |
| Integer arithmetic | Exact nonnegative decimal input, repeated digit sums, and explicit preserve/reduce master policy. Debt labels attach only to visited values with a local stage. | `test/reduction.test.mjs` and handwritten `test/fixtures/reductions.json`. |
| Civil calendar | Strict proleptic Gregorian date strings, with no timezone, clock, adoption history, or inferred conversion. | `test/dates.test.mjs` and `test/fixtures/dates.json`. |
| Life path | Separately reduced components by default; explicitly selectable whole-date digit sum. The same master policy applies at each reduction. | Date fixtures distinguish these formulas. |
| Names | Finite authored Latin, Greek, and Cyrillic tables, declared Unicode decomposition/context, and exact caller scalar overrides. Unsupported remainders reject. | `test/names.test.mjs`, `test/transliteration.test.mjs`, and their handwritten fixtures. |
| Y | Configurable mechanical classification on emitted ASCII tokens, with no inferred pronunciation. | Name and mixed-script classification controls. |
| Letter systems | Pythagorean repeating alphabetical values or the explicitly declared Chaldean table; raw emitted letters sum before reduction. | `test/name-numbers.test.mjs` and `test/fixtures/name-numbers.json`. |
| Maturity | Add the resulting life-path and expression values, then reduce under the shared policy. | `test/derived.test.mjs` and `test/fixtures/derived.json`. |
| Frequencies | Missing values are relative to the table's assigned domain; highest positive-frequency ties all survive. Counts are not reduced. | Derived frequency controls. |
| Cycles | Explicit caller target, calendar-year boundaries, reduced year components followed by raw month and day additions. | `test/cycles.test.mjs` and `test/fixtures/cycles.json`. |
| Periods | Pinnacles use component sums; challenges use single-digit absolute differences. Timing uses the reduced life path, inclusive first end age, and subsequent attained-age intervals. | `test/periods.test.mjs` and `test/fixtures/periods.json`. |
| Comparisons | Same date and captured settings; after-minus-before deltas have no rank or benefit interpretation. | `test/profiles.test.mjs` and `test/fixtures/profiles.json`. |

The Chaldean table affects letters only. Master handling, date arithmetic,
debt labels, maturity, cycles, and timing remain this project's explicit
combined conventions. This is not a complete reproduction of a particular
author's practice. The Pythagorean label does not attribute these formulas
to Pythagoras, and the Chaldean label does not establish an ancient origin.

## Source and authorship record

The script mappings, formulas as implemented, receipts, handwritten controls,
and interpretation text were authored for this isolated project. No external
transliteration dataset or interpretation text is vendored. The README's
Chaldean table section records the reference consulted during implementation:
Cheiro, *Cheiro's Book of Numbers*, first published 1926, chapter XII,
alphabet table on PDF page 65 of the linked transcription. That record is
about letter-value facts. It does not establish the transcription's fidelity
to a facsimile or license its prose. This milestone adds no new source fetch
or book excerpt. See [licensing](../LICENSING.md).

The mapping identifiers describe project spelling choices. They do not claim
conformance to an external romanization standard. A supplied Latin spelling
or caller table can change arithmetic. Exact caller keys apply before
normalization and can intentionally distinguish canonically equivalent
inputs. Receipts preserve the complete sorted caller mapping, including
unused entries, instead of trusting its identifier alone.

The runtime supplies Unicode normalization and Unicode property support.
Record the JavaScript runtime and its Unicode version alongside saved output
when reproducibility across runtimes matters. No locale-specific sorting,
name service, remote lookup, or current clock selects a convention.

## Receipt scope

The [API reference](API.md) names the result types. Their nested receipts
retain input spellings and dates, table identifiers, effective policies,
original compounds, selected letter contributions, and every performed
reduction. Repeated source results are intentional: serialized receipts can
be replayed without following in-memory references. Debt stages stay local
to the source identified by their containing receipt and source locator.

Normalization and calendar validation are preprocessing, with transformation
or validation records rather than invented digit reductions. Frequency
selection records counting steps. Comparison deltas record subtraction and
point to the full source calculations. Meaning text describes the result's
scope in ordinary language. No aggregate debt path is inferred from an
unrelated count, age, difference, or date substring.

Schemas identify the current local structures. They are not signatures or
attestations, and no imported-receipt validation or migration API is offered.
JSON serialization loses JavaScript freezing, and a parsed object is not a
validated calculation result. This private development project makes no
published compatibility promise. Preserve implementation identity and
runtime context with outputs if later replay is needed. A schema or table
identifier alone does not establish authenticity.

Profiles and comparisons contain supplied names and civil dates repeatedly
in source receipts. The CLI returns them in full. It does not write files;
callers control output storage and logging. These results are not anonymous
and are not the astrology engine's natal receipt format. No engine or
ephemeris module is imported or bundled here.
