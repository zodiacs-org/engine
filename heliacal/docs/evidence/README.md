# Reference evidence and validation

The workbench has independent formula checks, selected coordinate comparisons
and selected published evening crescent calculations. It does not have a
validated observed-sighting forecast. This distinction applies to library
and CLI output alike.

[`reference-results.json`](reference-results.json) records numerical
comparisons produced by
[`measure-reference-evidence.mjs`](../../scripts/measure-reference-evidence.mjs).
The script reads committed independent fixtures, evaluates the current
implementation, checks their existing gates and writes the measured errors
without rounding them down. It records fixture hashes, source-tree digests,
engine identity and runtime. The report is evidence, never the reference
used to decide what the implementation should return. Vitest tests continue
to use the original independent fixtures.

## Coverage

| Check | Reference and scope | What it establishes |
| --- | --- | --- |
| Sun/Moon coordinates and separation | [Horizons geometry fixture](../../test/fixtures/geometry-reference.json), its recorded instant and site | The selected apparent directions and ranges pass that fixture's gates. Source frame and correction differences remain explicit. |
| Phase and elongation | [Horizons phase fixture](../../test/fixtures/phase-reference.json), the Moon and visible planets at its recorded instant | Selected simultaneous-geometry calculations compared with Horizons' retarded quantities, under the predeclared gates. |
| Horizontal rotation | ERFA worked transform in the geometry fixture | The local spherical transformation, independently of the ephemeris. |
| Sun/Moon horizon events | [USNO fixture](../../../src/sky/fixtures/usno-rstt.json), the first day only, as selected by [the adapter test](../../test/engine.test.ts) | The listed rounded horizon/transit times; no visibility criterion is involved. |
| Arcus and extinction arithmetic | [Schoch/Schaefer fixture](../../test/fixtures/visibility-reference.json) | Published thresholds, selected rounded air masses and a separately constructed scalar-extinction example. |
| Crescent formulas | [Yallop](../../test/fixtures/YALLOP.md) and [Odeh](../../test/fixtures/ODEH.md) | Independently computed Decimal formula cases, rational evening timing and category boundaries; Odeh also has selected published Table V boundaries. |
| Full evening crescent search | [Yallop Appendix A fixture and notes](../../test/fixtures/YALLOP-PUBLISHED.md) | Selected published London predictions reproduced through engine geometry, horizon solver, criterion, library search and CLI. |
| Event sequencing, clipping and refusals | Constructed schedules in the search and boundary tests | Implementation behavior, not independent ephemeris accuracy or sighting performance. |

The numerical report measures the comparisons named in its `comparisons`
and `classifications` arrays. The broader tests also check receipts, explicit
parameters, optical-aid distinctions, budget refusals, missing crossings,
polar cases, range edges, malformed inputs and CLI transport. Those are
integration or contract checks. Their success is not an independent accuracy
measurement.

The selected London rows are 1998-01-28, 1998-01-29, 1998-08-22 and
1998-08-23. The source is B. D. Yallop, *A Method for Predicting the First
Sighting of the New Crescent Moon*, NAO Technical Note 69 (1997, updated
April 1998), Appendix A, printed p. 16. The fixture transcribes only selected
numerical facts from this calculated example. It assumes sea level at the
source's coordinates and uses the engine's upper-limb, standard-refraction
crossings. The source does not disclose every original ephemeris/horizon
setting there. The [test](../../test/yallop-published.test.ts) fixes the
engine time gate at 120 seconds and compares categories exactly; the
rounded-input best-time arithmetic has a separate 60-second gate. These
gates preceded the implementation comparison and were not widened.

On the recorded Node v22.22.2 Linux x64 run, the maximum absolute differences
against those rounded source rows were:

| Quantity | Maximum difference |
| --- | ---: |
| Sunset | 23.830 seconds |
| Moonset | 18.356 seconds |
| Best time from engine horizons | 13.672 seconds |
| Best time from rounded published horizons | 13.333 seconds |

The categories match F then A in January and F then B in August. Both
searches return the corresponding first-evening category transition.
These statements are enforced by the published-example tests and recorded
in the report's `yallop-appendix-a-*` measurements. They are sample results
for those dates, not error bounds or a calibration validation. Appendix A
does not print the criterion's residual; residual arithmetic is checked
separately against Decimal calculations.

## Reproduction

Use the installed project dependencies and the runtime recorded in the
report for a byte-identical evidence check. From the repository root:

```sh
npm --prefix heliacal ci --ignore-scripts
npm --prefix heliacal run typecheck
npm --prefix heliacal test
npm --prefix heliacal run test:audit
python3 heliacal/scripts/build-yallop-reference.py --check
python3 heliacal/scripts/build-odeh-reference.py --check
node heliacal/scripts/measure-reference-evidence.mjs --check
npm --prefix heliacal run check:project
npm --prefix heliacal run check:package
```

The Python scripts use the standard library and check the independent
synthetic arithmetic fixtures. Tests and measurement read committed data
offline. Dependency installation may access the public npm registry.
`--check` on the measurement script recalculates the comparisons and compares
the complete report, including runtime and hashes. A changed runtime,
platform, source or fixture can therefore require a new reviewed report.
To record new measurements, use `--write` in place of `--check`; it first
requires every comparison gate to pass. Review the report and any prose
figures together. Do not adjust a reference or tolerance merely to make an
implementation pass. The measurements are not an authenticated attestation.

`check:project` enforces the strict file-size limit on tracked and unignored
project files, documentation punctuation, ignored output paths, declared
library import boundaries and current working-tree scope. `test:audit`
exercises failures and boundary cases. The audit does not inspect committed
branch history, establish runtime purity or certify scientific provenance.
`check:package` verifies the root npm pack list and runs its contents checker
in a disposable copy using the carried archive's build output. This leaves
the checkout's packed files and `dist/` untouched and creates no archive.
It is not a rebuild or archive-binding check, and these project checks are
not a substitute for the repository's release and CI workflows.

## Limits retained in the API

- Heliacal search uses explicit appearance-specific horizon arcus thresholds.
  It does not supply fitted planetary thresholds, a full Schaefer visibility
  model, computed magnitudes or weather. Adjustable altitude, extinction and
  limiting-magnitude gates belong to the separate instantaneous screen.
- Yallop and Odeh have distinct geometry and optical-aid categories. Odeh's
  adapter declares its distant-Sun width approximation. No full Odeh date
  forecast or observed-sighting dataset is validated by the London examples.
- Last-morning crescent timing is an opt-in unvalidated mirror of the evening
  rule. The new reference comparison concerns evenings only.
- First/last events describe changes between consecutive opportunities.
  Gaps break adjacency, range edges do not establish transitions, and the
  brackets are neither continuous roots nor statistical uncertainty bounds.
- Acronychal/cosmical labels retain the actual Sun/body horizon pairing and
  the selected terminology. They describe geometry, not sighting visibility.
- Engine receipts identify source position calculations. They do not
  authenticate derived events, validate a visibility model, or remove the
  differing sky/calc observer and apparent-position conventions. Search
  completion inherits the engine's sampled solver limitations.

Primary-source locators and conventions are in [SOURCES.md](../../SOURCES.md).
No Swiss Ephemeris values, personal birth data, paid service or credentials
are involved in these fixtures.
