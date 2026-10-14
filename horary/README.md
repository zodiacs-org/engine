# Horary workbench

A checkout-local traditional Western horary library built on the engine's
source APIs. This folder is private and excluded from the engine npm package.
Code and documentation here use the repository's MIT license. The imported
engine retains the data licenses and attribution described in
[`../LICENSING.md`](../LICENSING.md) and [`../NOTICE`](../NOTICE).

The library provides `cast`, `normalizeHoraryInput`, `selectSignificators`,
`createRulePolicy`, `evaluateConsiderations`, `createEssentialPolicy` and
`evaluateEssentialCondition`.
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

`check:scope` checks commit-candidate file sizes, documentation punctuation,
the pinned ephemeris dependency and folder exclusion using npm's dry-run file
list. It creates no archive and does not build the engine. The full repository
package-content gate also needs an existing engine `dist/`; it cannot pass on
a checkout without that build output. This project does not generate it.
