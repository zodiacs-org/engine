# Library and CLI contract reference

This is a private source project inside the engine checkout. It is excluded
from the engine npm package and has no published installation or separate
compatibility promise. Its code and documentation are MIT under the repository
[LICENSE](../../LICENSE); engine data keep the attributions in
[LICENSING.md](../../LICENSING.md) and [NOTICE](../../NOTICE).

Run the commands in this document from `harmonics/`. Install with `npm ci`
and check with `npm run check`. No engine build is needed. The library ships
TypeScript source, so callers need a TypeScript runner or bundler that resolves
relative engine imports and the locally installed ephemeris dependency. The
`.js` imports in the [guide](../README.md) are TypeScript's NodeNext source
convention; this project does not emit those files. The CLI's
[runner](../bin/harmonics.mjs) handles compilation and dependency resolution
in memory. Development dependencies must be installed to use it.

## Entry points and results

The entry column refers to this private project's `exports` in
[package.json](../package.json), not to an `@zodiacs/engine` export. All library
operations are synchronous and consume original source longitudes.
Passing transformed rows to another harmonic operation would apply the
transform again; retain the original rows for parallel analyses.

| Entry | API | Input | Result fields |
| --- | --- | --- | --- |
| `.` | `harmonicChart(points, N, options?)` | Named longitude rows | `harmonic`, `maxHarmonic`, `points` |
| `.` | `findHarmonicAspects(positions, N, options?)` | Named rows with known source speeds | `harmonicChart`, `sourcePolicy`, `orbScaling`, `orbScale`, `analysis` |
| `.` | `harmonicSpectrum(positions, options?)` | Named rows with known source speeds | `formula`, `maxHarmonic`, `harmonics`, `sourcePolicy`, `orbScaling`, `weights`, `possiblePairs`, `weightCapacity`, `rows`, `ranking` |
| `.` | `projectDial(points, circle?, options?)` | Named longitude rows | `circle`, `contactOrb`, `arithmetic`, `points`, `contacts` |
| `.` | `dialDistance(a, b, circle?)` | Full source longitudes | Unsigned shortest distance in dial longitude degrees |
| `.` | `findPlanetaryPictures(points, circle?, options?)` | Named longitude rows | `dial`, `repeatedMembers`, `arithmetic`, `sensitivePoints`, `pictures` |
| `.` | `midpointTrees(points, circle?, options?)` | Named longitude rows | `dial`, `arithmetic`, `midpoints`, `trees` |
| `./engine` | `castChart(birth, options?)` | Engine `BirthInput` | `points`, `flags`, `envelope` |
| `./engine` | `castHarmonicChart(birth, N, options?)` | Engine `BirthInput` | `source`, `harmonicChart` |
| `./patterns` | `findHarmonicPatterns(positions, N, options?)` | Named longitude rows | `harmonicChart`, `policy`, `orbScaling`, `aspects`, `analysis`, `containment` |

The default entry imports no chart API or ephemeris, as enforced by
[pure-entry.test.ts](../test/pure-entry.test.ts). The engine entry loads the
chart API and calls the engine to cast. The patterns entry inherits static
chart and ephemeris imports from the engine detector, even though pattern
analysis itself makes no chart or ephemeris call. Pattern analysis is a
library API; the CLI exposes chart, spectrum and dial commands.

## Coordinate and selection contracts

Named rows are nonempty arrays of unique case-sensitive `body` labels and
finite numeric `lon` values. See [longitude validation](../README.md#pure-library)
for the label syntax and harmonic range. Negative and multi-turn longitudes
are accepted and normalized before derivation. Labels carry identity; they
do not prove that supplied rows are astronomical positions. Supply synthetic
data for examples and fixtures.

| Quantity | Unit and meaning |
| --- | --- |
| `sourceLon` | Normalized full zodiac longitude in degrees |
| Harmonic `lon` | Source longitude multiplied by N and normalized onto the zodiac circle |
| Source `speed`, `sourceSpeed` | Longitude degrees/day on a common source time basis |
| Harmonic `speed` | N times source speed, the unwrapped derivative in harmonic degrees/day |
| Aspect policy orbs | Original allowances at the first harmonic; effective limits and returned orbs use harmonic-circle degrees |
| Dial `lon`, `orb`, `contactOrb` | Longitude degrees on the folded circle; coordinates are not stretched to fill a display circle |
| Dial `sector` | Zero-based sector of the normalized source zodiac longitude |
| Spectrum weights, closeness and score | Dimensionless analysis quantities |

Aspects and spectra require known finite speed on every supplied row, even
unselected rows. Filter original rows explicitly before calling them when
speeds are absent. Longitude transforms, patterns and dial analyses need no
speed. Pure longitude transforms omit speeds; the casting and aspect adapters
retain and scale known speeds. Unknown speed is never replaced with a
stationary value.

Aspect policy body selection and source filtering are different operations.
The engine policy defaults select physical bodies; custom labels and nodes
need explicit policy selection. In the spectrum and dial CLI, `--bodies`
filters source rows and requires every named row to exist. It leaves a cast
`source` complete. For custom-label spectra, also select labels in `--policy`.
An empty policy selection can produce an empty analysis from nonempty input;
an empty source array is invalid.

## Analysis conventions

- [Aspect scaling](../README.md#harmonic-aspects): inverse scaling divides
  rule orbs, luminary replacements and body caps by N; fixed scaling keeps
  them constant. Angles remain fixed. Speeds and the stationary threshold
  scale together. Engine matching is exact on the resulting binary64 values;
  the preceding transform and division already introduce rounding.
- [Spectrum scoring](../README.md#harmonic-strength-spectra): each matched
  pair contributes its member-weight product times its aspect weight times
  linear orb closeness. Normalize by capacity over all eligible source pairs,
  using the largest configured aspect weight. Positive-limit boundary matches
  have no closeness contribution; exact zero-limit matches get full closeness.
  Zero capacity yields a zero score. Weights affect scoring after rule choice,
  and the ranking breaks score ties by ascending harmonic. The formula is an
  analysis convention, with no empirical calibration or predictive claim.
- [Patterns](../README.md#harmonic-aspect-patterns): reuse the engine detector
  and containment helper, limited to its supported physical-body figures and
  historical fixed major-aspect limits. Configurable aspect matching and
  pattern matching have different arithmetic and policy contracts.
- [Dials](../README.md#uranian-dial-projections): fold full source longitudes
  onto the supported circles and compare unsigned shortest distances with an
  inclusive, unscaled allowance. Use ordinary binary64 arithmetic without an
  epsilon. These contacts have no motion classification.
- [Pictures](../README.md#planetary-pictures-and-sensitive-points): evaluate
  canonical A+B-C sensitive points against a target for disjoint pair-sum
  relations. Default members are distinct; doubled mode permits repetition
  within a pair. Shared-label cancellations remain excluded. Only the
  canonical orientation decides a picture's eligibility.
- [Midpoints](../README.md#midpoint-trees): call the engine shorter-arc helper
  before folding. Canonical label order fixes antipodal ties. Retain near and
  opposite endpoints and test them separately because their rounding can
  differ. Group eligible endpoints into a single contact per pair and center;
  keep different formulas even at coincident coordinates. Center labels may
  not be midpoint members.

## Receipts, snapshots and errors

Pure operations create no receipt. Casting captures the engine's original
natal envelope before supplemental points or analysis. Keep `{ source,
analysis }` together when composing library calls. The receipt covers natal
bodies, angles, houses, natal aspects, flags and time conventions. It does not
cover extra chart points, transformed coordinates, scores, patterns, pictures
or midpoint trees. It is a structurally validated provenance claim, not
authenticated evidence or a physical accuracy guarantee.

Derived wrappers, rows and arrays are frozen snapshots. The natal envelope
retains the engine creator's mutable independent snapshot shape; the wrapper
does not recursively freeze it. Use the engine serializer, parser and replay
helpers for that envelope. Replaying with a different source revision or
runtime need not reproduce its values. A source receipt is not an analysis
serialization format, and there is no analysis import/replay codec here.

Library validation normally throws `RangeError`. Receipt creation can throw
the engine's `NatalEnvelopeError`; do not assume every casting failure is a
range error. Follow typed option shapes: aspect, spectrum, pattern and dial
wrappers reject unsupported enumerable string option fields, while the longitude
transform and casting adapters validate their recognized fields without a
general unknown-field check. These library calls accept ordinary in-process
objects and do not apply the CLI's bounded JSON decoder.

The CLI requires exactly one `points` or `birth` JSON request. See the
[input and error contract](../README.md#offline-chart-cli) and
[analysis flags](../README.md#spectrum-and-dial-cli). Successful commands write
a complete result to stdout; failures write a structured error to stderr.
Help is human-readable text. The schema tag describes CLI output and does not
authenticate it. Inline JSON options follow the same decoder limits as input.

## Limits and evidence

Harmonic charts transform longitude only. They do not recast houses, latitude,
declination or physical ephemeris positions. Folded dials lose source-sector
distinctions, so retain `sourceLon` when interpreting a contact. No chart
call expands the engine's documented physical accuracy coverage; inspect
source flags and the engine [README](../../README.md) for its limits.

Source order is retained by longitude transforms and dial point listings.
Canonical analysis listings use UTF-16 label order. Configured aspect results
retain engine matching order, and spectrum accumulation fixes source order
before matching. Results are deterministic for the same inputs and settings
under the same source and runtime; no cross-runtime bitwise promise is made.

Enumeration is complete for the accepted selection, without pagination,
truncation or an execution budget. More points, especially in picture
enumeration, can require substantial work and output. The CLI bounds input
documents, but does not cap result size or calculation time. Filter source
rows and choose explicit harmonic selections when volume matters. No timing
or physical accuracy benchmarks are claimed for this prototype.

The guide links each numerical example to its enforcing test and gives its
integer or binary-fraction derivation over the stated synthetic rows.
[Arithmetic tests](../README.md#arithmetic-evidence) establish transform and
analysis arithmetic; comparisons with delegated engine calls establish reuse
and receipt preservation. Neither comparison establishes independent
ephemeris accuracy. [CLI analysis tests](../test/cli-analysis.test.ts) enforce
single casting, filtering, file/stdin determinism and offline execution;
[midpoint tests](../test/midpoint-trees.test.ts) verify helper delegation and
endpoint conventions. Run all of them with `npm run check`.
