# Horary workbench

A checkout-local traditional Western horary library built on the engine's
source APIs. This folder is private and excluded from the engine npm package.
Code and documentation here use the repository's MIT license. The imported
engine retains the data licenses and attribution described in
[`../LICENSING.md`](../LICENSING.md) and [`../NOTICE`](../NOTICE).

The library provides `cast`, `normalizeHoraryInput`, `selectSignificators`,
`createRulePolicy` and `evaluateConsiderations`.
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

`evaluateConsiderations(result, policy)` reads the cast without recalculating
the sky. `createRulePolicy()` enables the implemented considerations;
override any toggle explicitly:

```ts
import { createRulePolicy, evaluateConsiderations } from "./src/index.js";

const policy = createRulePolicy({ rules: { "saturn-seventh": false } });
const considerations = evaluateConsiderations(result, policy);
```

Every observation contains its rule, `triggered`, `not-triggered` or
`disabled` status, named source tradition, measured evidence and a short
explanation. Disabled rules retain a source record and skip their geometric
inputs. These observations describe cautions without refusing a judgement
or issuing an outcome. Void of course and the remaining analysis are still
scheduled in the plan.

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

Tests distinguish independently worked calendar/angle fixtures from engine
delegation checks. Neither the foundation nor its integration tests establish
new astronomical accuracy or predictive validity. Traditional rule tests will
name their source tradition and derivation as they are added.

`check:scope` checks commit-candidate file sizes, documentation punctuation,
the pinned ephemeris dependency and folder exclusion using npm's dry-run file
list. It creates no archive and does not build the engine. The full repository
package-content gate also needs an existing engine `dist/`; it cannot pass on
a checkout without that build output. This project does not generate it.
