# Horary workbench

A checkout-local traditional Western horary library built on the engine's
source APIs. This folder is private and excluded from the engine npm package.
Code and documentation here use the repository's MIT license. The imported
engine retains the data licenses and attribution described in
[`../LICENSING.md`](../LICENSING.md) and [`../NOTICE`](../NOTICE).

The library provides `cast`, `normalizeHoraryInput`, `selectSignificators`,
`createRulePolicy`, `evaluateConsiderations`, `createEssentialPolicy` and
`evaluateEssentialCondition`, `createAccidentalPolicy` and
`evaluateAccidentalCondition`, `createAspectSearchPolicy` and
`evaluateSignificatorAspects`.
Further analysis rules and the CLI are scheduled in [`PLAN.md`](PLAN.md).

From the checkout, using Node as specified in this folder's `package.json`:

```sh
npm ci --prefix horary
npm run typecheck --prefix horary
npm test --prefix horary
npm run check:scope --prefix horary
```

The test configuration resolves the engine's pinned astronomy dependency from
this folder. No root install or engine build is needed. Source imports are
checkout relative; this is not yet a standalone installed package or a plain
Node entry point. Future CLI tooling must preserve that dependency resolution.

```ts
import { cast, selectSignificators } from "./src/index.js";

const result = cast({
  instant: "2000-01-01T12:00:00Z",
  location: { latitude: 12, longitude: 34 },
  question: { id: "lost-object", quesitedHouse: 2 },
  houseSystem: "regiomontanus"
});
const significators = selectSignificators(result);
```

The example uses the synthetic fixture documented in
[`tests/fixtures.md`](tests/fixtures.md) and enforced by the input and cast
tests. The question label is caller-defined; `quesitedHouse` declares the
house and optional `naturalSignificators` declares classical planets. The
library does not infer houses from prose. Duplicate natural significators
normalize in their first-occurrence order.

Instants use the engine's strict parser and UTC clock: ISO date-times need an
explicit offset, calendar dates mean UTC midnight, Dates and finite epoch
milliseconds are accepted. Unresolved local wall times are refused. Resolve
them before calling. This API uses the engine's model clock; alternate time
scales and pinned delta-T options are not accepted. `input.test.ts` documents
and checks these normalization decisions.

Locations use degrees north and east. Geographic poles are refused because a
rising Ascendant is not defined there. The default house system is
Regiomontanus as a project convention; callers may choose any engine system.
The result includes both the requested settings and the engine chart's actual
houses, coverage/fallback flags, version, delta-T and time-basis metadata.
`cast.integration.test.ts` checks preservation of those distinctions.

`cast` returns data without a judgement. It creates fresh chart arrays and
does not modify caller input. Normalized settings are frozen snapshots; the
engine chart remains mutable and uses Dates as the engine does. JSON encoding
turns its Dates into ISO strings; parsing that JSON does not restore Date
instances or authenticate the chart. These ownership decisions are tested in
`input.test.ts` and `cast.integration.test.ts`.

`selectSignificators(result)` uses the actual first cusp and the declared
quesited house's cusp, obtaining traditional domicile rulers through the
engine's dignity API. The Moon remains the querent's co-significator, and
declared natural significators retain their input order. Each assignment
contains its role, planet, basis and a short explanation. The `planets`
array groups assignments by physical planet, retaining every role and
explaining overlaps without assigning an outcome. Source identifiers and
the first-cusp convention for alternative house systems are documented in
[`SOURCES.md`](SOURCES.md).

Selection reads an existing cast without recalculating the sky. It returns
a deeply frozen snapshot, including requested and actual house systems, and
leaves chart arrays mutable. It revalidates the question settings and cusp
shape/range because the chart may have been edited. This is a typed cast
consumer, not an authenticated chart importer: it does not verify that
supplied cusps agree with the instant, location or house system. These
behaviors and sign boundaries are checked in `significators.test.ts`; engine
delegation, house systems and fallback are checked in
`significators.integration.test.ts`.

`evaluateConsiderations(result, policy)` reads the cast's geometric data and,
when enabled, scans lunar motion at the normalized question instant for the
void-of-course rule. `createRulePolicy()` enables the implemented considerations;
override any toggle explicitly:

```ts
import { createRulePolicy, evaluateConsiderations } from "./src/index.js";

const policy = createRulePolicy({ rules: { "saturn-seventh": false } });
const considerations = evaluateConsiderations(result, policy);
```

Every observation contains its rule, `triggered`, `not-triggered` or
`disabled` status, named source tradition, measured evidence and a short
explanation. Disabled rules retain a source record and skip their inputs and
scans. These observations describe cautions without refusing a judgement
or issuing an outcome. The remaining analysis is scheduled in the plan.

The early Ascendant interval is `[0, 3)` degrees within each sign and the
late interval is `[27, 30)`. They use the Ascendant angle rather than the
first cusp. Moon Via Combusta uses absolute longitude `[195, 225)` degrees.
The source and boundary choices are documented in [`SOURCES.md`](SOURCES.md);
`considerations.test.ts` enforces them over every Ascendant sign and around
the lunar interval's endpoints with hand-derived fixtures in
[`tests/fixtures.md`](tests/fixtures.md).

Saturn's placement uses the engine's `houseOf` on actual cusps, assigning a
cusp to the house beginning there, without latitude or cusp anticipation.
Retrograde status is recorded but is not required to trigger either Saturn
rule. Personal-context exceptions and automatic suppression for a quesited
seventh house are not applied; callers can disable the relevant rule.

Policies and observations are deeply frozen snapshots with no references to
mutable chart arrays. Complete JSON-restored policy snapshots are revalidated
when consumed. Invalid toggles, unknown options, unavailable enabled-rule
inputs, duplicate required planet rows and invalid cusp circuits throw
`RangeError`. Disabled rules skip those geometric inputs; the cast schema
and normalized question input are still validated. This consumer validates
required fields, without authenticating a chart or verifying that the sky
matches its instant. `policy.test.ts` and `considerations.test.ts` enforce
these ownership and validation decisions. `considerations.integration.test.ts`
checks consumption of engine house systems and polar fallback.

The `moon-void-of-course` toggle delegates to the engine's `voidOfCourseAt`
with `bodies: "traditional"`, selecting the Sun, Mercury, Venus, Mars,
Jupiter and Saturn. It follows the engine's named last-exact-aspect convention:
conjunction, sextile, square, trine and opposition count only when exact in
longitude before the Moon's sign exit. No orb, latitude, nodes, angles or outer
planets participate. The void period includes its starting contact and excludes
the ending ingress; if a sign has no qualifying contact, it starts at ingress.
The exact-contact interpretation is an explicit Lilly-based project convention,
with source and contextual qualifications in [`SOURCES.md`](SOURCES.md).

An enabled observation includes a `scan` record with its question instant,
body/aspect selection, current and next void periods, sign names, last contact
and sampled-search limitations. `next` means the next void period, possibly
in a later sign; it is not the next applying contact. Dates become ISO strings
in deeply frozen records. The scanner uses the normalized input instant on
the engine UTC model clock, independently of mutable chart rows or their clock
metadata. It does not authenticate edited or imported charts against that
instant. Static geometric fixtures disable this time-dependent rule.

The scanner uses fixed sampling and a fixed horizon without a configurable
budget. `MOON_VOID_SCAN_METHOD` exposes the reused engine method and limitations.
Its results are sampled, with completeness unproven; grid-dependent root times
and millisecond Dates can shift status near a period boundary. All samples must
fit the engine's ephemeris span, including samples around an otherwise valid
cast instant. Scanner errors propagate as errors, rather than as non-triggered
observations. Independent linear-motion derivations and boundary tests are in
`tests/void-of-course.motion.test.ts` and [`tests/fixtures.md`](tests/fixtures.md);
wrapper ownership and error handling are checked in `tests/void-of-course.test.ts`,
and real-engine delegation in `tests/void-of-course.integration.test.ts`.

Tests distinguish independently worked calendar/angle fixtures from engine
delegation checks. Neither the foundation nor its integration tests establish
new astronomical accuracy or predictive validity. Traditional rule tests will
name their source tradition and derivation as they are added.

`evaluateEssentialCondition(result, policy)` reads an existing cast, selects
the significators and reports essential condition once per physical planet,
with every role retained. It delegates the dignities, debilities and peregrine
flag to engine `essentialDignities`, using engine `sectOf` on the Ascendant
and Sun longitudes. The result records those inputs and its sect convention.
Sign annotations, latitude, speed and retrograde flags do not determine these
essential conditions. This is a pure analysis of supplied geometry without
ephemeris recalculation or chart authentication.

```ts
import { createEssentialPolicy, evaluateEssentialCondition } from "./src/index.js";

const essentialPolicy = createEssentialPolicy({
  weights: { peregrine: false },
  receptionDignities: ["domicile", "exaltation"]
});
const condition = evaluateEssentialCondition(result, essentialPolicy);
```

The default weights are Lilly's own-position essential weights applied to the
engine's tables. These use Egyptian terms, Dorothean sect triplicities and
Chaldean faces, rather than reproducing every table in Lilly. Each condition
includes the complete scoring-rule list with condition presence, configured
weight, contribution, status, source and explanation. Set a weight to `false`
to disable that scoring rule; a zero weight remains enabled. Signed finite
custom weights carry `caller-override` provenance; totals that overflow are
refused. Changing weights never changes the engine's dignity or peregrine
facts. The score adds own-position contributions and permits peregrine and
debility penalties together; it adds no reception bonus. Historical sources
and this scoring choice are detailed in [`SOURCES.md`](SOURCES.md), with each
default weight and fixture total enforced in `tests/essential.test.ts`.

Directional reception explicitly names `host` and `guest`: the host holds
a selected essential dignity at the guest's longitude. Every ordered pair
of distinct selected planets is recorded, including absent reception.
The default selects all essential dignities; choose a subset to disable
the others, or an empty list to disable reception entirely. Mutual pairs
come from engine `mutualReceptions` and retain the dignity labels in each
direction, including mixed receptions. Neither hosting nor mutual reception
requires an aspect in this analysis or establishes perfection or an outcome.
Reception does not change a planet's own-position essential score or remove
its peregrine flag. Shared significator roles never create self-reception.

Essential policies and results are deeply frozen, JSON-friendly snapshots.
Complete JSON-restored policies are revalidated. Required planet rows must
be unique with canonical finite longitudes; the Sun is always required for
sect even when it holds no significator role. Unselected rows are ignored.
The existing significator-selection checks validate question settings and
actual cusps. Edited sign labels do not override longitude. Boundary,
ownership and malformed-input tests appear in `tests/essential.test.ts`;
`tests/essential.integration.test.ts` checks engine delegation across house
systems and fallback, without claiming independent ephemeris accuracy.

`evaluateAccidentalCondition(result, policy)` describes the selected planets'
house, direction, speed magnitude and chart-sect match. It reads the existing
chart without recalculating the sky, using engine `houseOf`, `sectOf` and the
speeds already produced by the engine's longitude-speed helper. Each physical
planet receives one record with all its roles, a contribution for each rule,
source records and a short explanation. The result preserves actual cusps and
requested/actual house settings, including polar fallback.

```ts
import { createAccidentalPolicy, evaluateAccidentalCondition } from "./src/index.js";

const accidentalPolicy = createAccidentalPolicy({
  weights: { "in-sect": 1, "out-of-sect": -1, slow: false },
  meanDailyMotion: { Mars: 0.5 },
  stationarySpeed: 0.125
});
const accidental = evaluateAccidentalCondition(result, accidentalPolicy);
```

The default house and motion weights are the selected rows of Lilly's
accidental table, documented in [`SOURCES.md`](SOURCES.md) and checked in
`tests/accidental.test.ts`. A planet receives only its actual house weight;
angular or cadent classification adds no second contribution. Cusps belong
to the house starting there, without anticipation or latitude corrections.
Sun and Moon receive no direction points, following Lilly's exemption.
Direction comes from the signed speed, ignoring mutable retrograde labels.

Speed magnitude compares with configurable historical mean daily motions
from Lilly. These are traditional comparison rates, not astronomical accuracy
bounds. Both rates and `stationarySpeed` use degrees/day. Speeds whose absolute
value is at or below the stationary tolerance receive no direction or rate
points; the default tolerance is zero. Equality with the mean is neutral.
Other speeds are swift above the mean and slow below it, in either direction.
Direction and magnitude are independent scoring conditions, as in Lilly's
table; a caller can disable either. This classification does not locate a
station, predict a reversal or establish refranation.

Sect weights default to `false`. The optional match uses Ptolemy's planetary
sect and the engine's existing ecliptic chart-sect convention. Mercury uses
a longitude proxy for morning or evening position; conjunction and opposition
are indeterminate and receive no sect points. The example's sect weights,
Mars comparison rate and stationary tolerance are caller choices checked in
`tests/accidental.test.ts`, without attribution of those numbers to a historical
table. This is chart-sect membership, without visibility, hemisphere, sign
gender or hayz criteria.

Each weight accepts a signed finite number or `false`; zero remains enabled.
Custom weights and comparison rates carry caller provenance. Disabling a
weight preserves its condition facts, so required geometry and speeds remain
validated even if all weights are disabled. Missing or duplicate required
rows, invalid longitudes, invalid cusp circuits, non-finite selected speeds,
retrograde Sun/Moon speeds and score overflow throw `RangeError`. The Sun's
longitude is always required for sect; its speed is required only if selected.
Unselected rows and unused labels/latitude fields are ignored.

Policies and reports are deeply frozen, JSON-friendly snapshots. Complete
JSON-restored policies are revalidated, and mutable chart arrays remain owned
by the caller. This typed chart consumer does not authenticate edited geometry
against the question instant. The partial score includes house, direction,
rate and optional sect matching; solar proximity, lunar phase, aspects, nodes,
joys and fixed stars are outside its stated scope. It establishes no outcome.
Independent derivations appear in [`tests/fixtures.md`](tests/fixtures.md);
`tests/accidental.integration.test.ts` verifies engine delegation across house
systems and fallback without claiming new ephemeris accuracy.

## Significator aspects and contact candidates

`evaluateSignificatorAspects(result, policy)` reads the existing cast and
reports each enabled major aspect for every pair of unique physical
significators. Each side retains its roles. Shared roles create no self-aspect.
The current record includes longitudes, speeds in degrees/day, rounded orb,
configured allowance, exact eligibility and applying/separating/stationary
motion. An out-of-orb aspect still reports its motion. Mutable chart aspect,
sign and retrograde labels do not override longitude or speed.

```ts
import { createAspectSearchPolicy, evaluateSignificatorAspects } from "./src/index.js";

const aspectPolicy = createAspectSearchPolicy();
const aspects = evaluateSignificatorAspects(result, aspectPolicy);
```

The engine's `findConfiguredAspects` decides motion, inclusive eligibility
and exactness using its exact binary arithmetic, including circular corners.
Each rule is evaluated separately so the engine's closest-match selection
does not hide another enabled rule. Moving exact contacts are classified as
separating; equal speeds or relative speed below the configured threshold are
stationary. The default relative-speed threshold is the engine's
`STATIONARY_RELATIVE_SPEED`. Orb defaults come from the engine's major
aspects, with its luminary replacements. These defaults are project choices,
not a transcription of Lilly's planetary moieties or separation margin.
[`SOURCES.md`](SOURCES.md) explains this distinction.

The search uses both planets' moving longitudes on the engine's UTC model
clock and delegates their relative longitude to `searchLongitudeCrossingsWith`.
It retains both directed branches, with a single branch for conjunction and
opposition. `contacts` lists every contact found in time order, including
returns after reversals. `relativeDirection` describes a-minus-b motion,
not either planet's retrograde flag. Times are ISO strings and `elapsedDays`
are UTC milliseconds divided by a day, not symbolic horary timing units.

`timeToPerfection` is an `exact-now` record at a current exact contact, or
a `candidate` at the first found contact on the current in-orb application's
branch. Otherwise it is null. A separating aspect's future contact on the
opposite branch is retained in `contacts` without being assigned to the
current application. Future contacts outside current orb likewise remain
evidence without a current-application candidate. Candidates have not yet
been evaluated for sign exit, station, reception, prohibition or another
traditional perfection condition; later milestones add that event analysis.
No outcome verdict is emitted.

Policy fields `aspects`, `orbs`, `luminaryOrbs` and
`stationaryRelativeSpeed` control the aspect observations. An empty aspect
selection disables them all; `search: false` keeps current observations and
disables future searching. Defaults are an elapsed horizon of 30 UTC days,
a coarse step of 0.25 day and a global budget of 20,000 relative evaluations.
The factory bounds horizons to 366 days, steps from a millisecond to a day,
and budgets to positive integers up to 1,000,000. These operational choices
and their defaults are enforced in `tests/aspects.test.ts`; they are not
accuracy bounds. Each relative evaluation calls the longitude provider for
both planets, so the budget unit is explicit in the method record.

The report's `search.status` is `complete`, `refused` or `disabled`. Refusal
is atomic across pairs and branches: no partial future contacts or candidates
escape, while current geometric observations remain. A completed scan means
the sampled algorithm finished within budget, not proof of event completeness.
Its smooth-motion assumptions, precision, nearby-root merging and clock-step
limitations appear in `ASPECT_SEARCH_METHOD`. A missing contact is a statement
about the bounded scan. Invalid chart rows, options, unrepresentable horizons
or provider errors throw rather than becoming missing-contact evidence.

`evaluateSignificatorAspectsWith(longitudeAt, result, policy)` exposes the
same deterministic analysis for an independent longitude provider. The
provider returns canonical finite degrees for a classical planet at a Date;
its clock is labeled `caller-longitude-provider`. Neither API authenticates
edited chart geometry against the instant or provider. Policies and reports
are frozen JSON-friendly snapshots without retaining caller chart arrays.
Independent motion and angular derivations are documented in
[`tests/fixtures.md`](tests/fixtures.md). `tests/aspects.integration.test.ts`
checks engine delegation over the synthetic question instant, house systems
and fallback, without claiming independent ephemeris accuracy.

`check:scope` checks commit-candidate file sizes, documentation punctuation,
the pinned ephemeris dependency and folder exclusion using npm's dry-run file
list. It creates no archive and does not build the engine. The full repository
package-content gate also needs an existing engine `dist/`; it cannot pass on
a checkout without that build output. This project does not generate it.
