# Horary workbench

A checkout-local traditional Western horary library built on the engine's
source APIs. This folder is private and excluded from the engine npm package.
Code and documentation here use the repository's MIT license. The imported
engine retains the data licenses and attribution described in
[`../LICENSING.md`](../LICENSING.md) and [`../NOTICE`](../NOTICE).

The foundation provides `cast` and `normalizeHoraryInput`. Analysis rules,
explanations and the CLI are scheduled in [`PLAN.md`](PLAN.md).

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
import { cast } from "./src/index.js";

const result = cast({
  instant: "2000-01-01T12:00:00Z",
  location: { latitude: 12, longitude: 34 },
  question: { id: "lost-object", quesitedHouse: 2 },
  houseSystem: "regiomontanus"
});
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

Tests distinguish independently worked calendar/angle fixtures from engine
delegation checks. Neither the foundation nor its integration tests establish
new astronomical accuracy or predictive validity. Traditional rule tests will
name their source tradition and derivation as they are added.

`check:scope` checks commit-candidate file sizes, documentation punctuation,
the pinned ephemeris dependency and folder exclusion using npm's dry-run file
list. It creates no archive and does not build the engine. The full repository
package-content gate also needs an existing engine `dist/`; it cannot pass on
a checkout without that build output. This project does not generate it.
