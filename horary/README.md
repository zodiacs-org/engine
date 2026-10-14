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
`evaluateSignificatorAspects`, `createDirectPerfectionPolicy` and
`evaluateDirectPerfection`, `createTranslationPolicy` and `evaluateTranslation`,
`createCollectionPolicy` and `evaluateCollection`,
`createImpedimentPolicy` and `evaluateImpediments`,
`createTimingPolicy` and `evaluateTimingHints`.
The combined analysis API and CLI are scheduled in [`PLAN.md`](PLAN.md).

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

## Direct contact and continuity evidence

`evaluateDirectPerfection(result, aspectPolicy, directPolicy)` extends the
significator aspect report with ordered sign-boundary and station evidence.
It uses engine `bodyLongitude`, `longitudeSpeed`, `dignityRulersAt` and the
existing crossing solver, without recasting the question or copying engine
event code. The embedded `aspects` report keeps its current geometry and
contact candidates. `events` lists the selected physical planets' sampled
events over the same horizon; shared roles remain on the single planet.

```ts
import { createDirectPerfectionPolicy, evaluateDirectPerfection } from "./src/index.js";

const directPolicy = createDirectPerfectionPolicy({ stations: true });
const direct = evaluateDirectPerfection(result, aspectPolicy, directPolicy);
```

Every enabled aspect between distinct physical significators gets a `direct`
assessment. A `direct-contact` means the current in-orb application reaches a
sampled contact with no earlier event found under the enabled continuity
checks. `interrupted` records a sign change or motion reversal before that
contact, retaining the later candidate. `requires-review` covers boundary
touches, unresolved transitions and events indistinguishable in sampled time
from contact. These are partial perfection observations. They do not decide
Lilly's reception, house-strength or competing-contact requirements, identify
refrenation from a station alone, or emit an outcome verdict.

An `exact-now` assessment describes present contact. Other explicit states
are `no-current-application`, `contact-not-found`, `search-disabled`,
`aspect-search-refused`, `event-search-refused` and `disabled`. Missing contacts
are bounded-horizon observations. No self-contact substitutes for a shared
querent/quesited ruler. Each candidate's attached events concern its physical
pair and have a `before` or `coincident` relation. Events after contact and
unrelated planets remain in the horizon-wide event list.

`createDirectPerfectionPolicy` defaults the independent `directAspect`,
`signChanges` and `stations` toggles on. Disable any check with `false`;
explanations record which checks were enabled. Keeping original signs and
flagging every motion reversal are explicit project choices described in
[`SOURCES.md`](SOURCES.md), rather than a full transcription of Lilly.
Disabling direct assessment can preserve event searching for later analysis.
Disabling all continuity checks retains direct contact observations without
performing an event scan. Disabling aspect searching or all aspect types also
disables the event scan.

Sign boundaries are searched on both direct and retrograde motion. Station
roots search exact sampled speed zero, independently of the aspect policy's
relative-speed threshold or the accidental policy's stationary tolerance.
Side probes distinguish sign changes and motion reversals from touches and
zero plateaus. An unavailable side at the horizon, or departure from a
boundary/zero speed at the question, requires review. Provider dates stay
inside the horizon; engine `longitudeSpeed` internally samples either side
of its date and can evaluate outside that horizon.

The event budget defaults to 20,000 provider calls and permits positive
integers up to 1,000,000, separately from the aspect search's budget.
Longitude and speed calls, including side probes, each consume a unit.
These defaults and bounds are enforced by `tests/direct-perfection.test.ts`;
`tests/direct-perfection.budget.test.ts` checks call accounting and refusal.
The event scan returns no partial events on refusal, and cannot label a
future candidate a clear direct contact when enabled checks were refused.
Already completed aspect evidence and current exact geometry remain available.

`eventSearch.rootResolutionMs` is the inherited bisection step divided by
`2^24`, rounded up, plus a millisecond for Date truncation. Events within
twice this resolution of the contact are conservatively coincident.
`tests/direct-perfection.test.ts` enforces that arithmetic over its synthetic
motion laws; it is numerical search resolution, not ephemeris accuracy.
`DIRECT_EVENT_METHOD` records the speed transform, smooth-motion assumptions,
nearby-root merging, zero-rounding and clock limitations. A completed scan
does not prove all events were found.

`evaluateDirectPerfectionWith(longitudeAt, speedAt, result, aspectPolicy,
directPolicy)` runs the same analysis on caller motion laws. Both providers
must describe consistent longitude and speed; the supplied chart and
providers are not authenticated. Reports are frozen JSON-friendly snapshots.
The independently worked fixtures and engine-delegation checks are documented
in [`tests/fixtures.md`](tests/fixtures.md).

## Translation of light

`evaluateTranslation(result, aspectPolicy, translationPolicy)` assesses a
third classical planet separating from one principal house ruler and
applying to the other. It reports both transfer directions independently.
The carrier may be the Moon, a declared natural significator or an unassigned
classical planet. Assigned roles remain present; an unassigned carrier has
an empty role list. Shared principal rulers produce no self-transfer.

```ts
import { createTranslationPolicy, evaluateTranslation } from "./src/index.js";

const translationPolicy = createTranslationPolicy();
const translation = evaluateTranslation(result, aspectPolicy, translationPolicy);
```

A current pattern requires nonexact, in-orb separating and applying contacts
under the engine's exact instantaneous aspect decisions. `translations`
lists every such pattern, its current geometry, rule checks, explanations
and any sampled endpoint contacts. A `translation-candidate` passes the
enabled checks with a past source contact followed by a future receiver
contact. This is partial eligibility evidence. Sign changes, stations,
refranation and competing perfection modes need subsequent assessment;
there is no outcome verdict.

The historical baseline is Lilly, with explicit project conventions in
[`SOURCES.md`](SOURCES.md). Independent policy choices are `lighterPlanet`,
`swifterPlanet`, `principalSeparation`, `principalAspects`,
`receptionDignities` and `uninterrupted`. The traditional weight check uses
sphere order, while the swiftness proxy compares absolute question-time
speeds in degrees/day. Principal separation defaults to conjunction,
sextile or trine; it must also be enabled in the aspect policy. Source
reception defaults to domicile, triplicity or term. Engine
`essentialDignities` evaluates the source's dignities at the carrier's
question longitude using question-chart sect. It requires source hosting
the carrier; reciprocal reception is not required. Reception at either
contact is not inferred from the question-time result. Empty reception
dignities disable that check. Disable each boolean check with `false`.

`carriers` defaults to the engine's classical planet set. Contacts with
every classical planet can interrupt a selected carrier, including planets
with no question role. Only aspect types enabled in `aspectPolicy` are
scanned. The latest past contact on the current separating branch and the
first future contact on the applying branch are retained. Other carrier
contacts between these endpoints fail uninterrupted transfer, including
contacts before the question and an exact third-party contact at the
question. Contacts coincident within the step-derived ordering resolution
require review. Disabling `uninterrupted` keeps this evidence while removing
the eligibility restriction. This does not classify those contacts as
prohibition or frustration.

`search` records the historical/future interval, clock, provider-call count,
root resolution and method limitations. `contacts` preserves all scanned
carrier contacts, with negative `elapsedDays` for history and positive days
for the future. These are elapsed UTC days rather than symbolic timing
hints. The past boundary is open and the future boundary closed. A past
contact exactly at the lookback boundary is not recovered. Missing contacts
are bounded-search observations, reported as `contact-not-found`.

The default `lookbackDays` is seven UTC days, bounded from a millisecond to
366 days. Future horizon and coarse step come from the aspect policy.
The translation scan uses its own `maxSamples`, defaulting to 200,000
longitude-provider calls, bounded to positive integers through 1,000,000.
Each relative sample calls both moving planets. The aspect policy's
separate relative-evaluation budget is not consumed by this scan. These
resource defaults and bounds are enforced in `tests/translation.test.ts`;
`tests/translation.budget.test.ts` verifies preflight and late refusal over
the derived motion fixtures. They are operational choices, not accuracy
claims. Global refusal returns `search-refused` assessments with no partial
contacts, endpoint references or intervening records. Current geometric
facts and question-time reception remain available.

Other explicit states include `rejected`, `requires-review` and
`search-disabled`. A `rejected` assessment lists failed enabled checks.
`requires-review` covers uncertain contact ordering or crossing direction
inconsistent with current relative motion. Global `translationOfLight:
false` disables the mode; empty carriers disable pattern selection;
`aspectPolicy.search: false` keeps current patterns without sampling.
No current pattern and shared principal rulers are explained at report
level. A completed scan means the sampled solver finished, without proving
exhaustive event finding or continuous application since the past contact.

`evaluateTranslationWith(longitudeAt, result, aspectPolicy,
translationPolicy)` provides the same analysis for independently supplied
motion laws. Current chart speeds and the longitude law must be consistent;
they are not authenticated against each other. Active pattern selection
requires exactly one valid row for every classical planet, because any can
intervene. Malformed geometry, providers, policies and unrepresentable
windows throw `RangeError`; provider exceptions propagate. Reports and
policies are frozen detached JSON-friendly snapshots. Derivations are in
[`tests/fixtures.md`](tests/fixtures.md), and the production integration
tests check delegation without claiming independent ephemeris accuracy.

`check:scope` checks commit-candidate file sizes, documentation punctuation,
the pinned ephemeris dependency and folder exclusion using npm's dry-run file
list. It creates no archive and does not build the engine. The full repository
package-content gate also needs an existing engine `dist/`; it cannot pass on
a checkout without that build output. This project does not generate it.

`evaluateCollection(result, aspectPolicy, collectionPolicy)` finds a third
classical planet to which both principal house rulers currently apply by
nonexact enabled in-orb aspects. The collector can be unassigned or hold
natural/Moon roles; roles remain attached to a single physical planet.
A shared principal ruler produces a `shared-principals` observation without
inventing a second application. `evaluateCollectionWith` accepts an independent
longitude provider for controlled motion laws.

```ts
import { createCollectionPolicy, evaluateCollection } from "./src/index.js";

const collectionPolicy = createCollectionPolicy({
  collectors: ["Jupiter", "Saturn"],
  receptionDirection: "principals-receive-collector"
});
const collection = evaluateCollection(result, undefined, collectionPolicy);
```

The default reception direction follows Lilly's collection passage as read
in [`SOURCES.md`](SOURCES.md): each principal receives the collector. Set
`receptionDirection: "collector-receives-principals"` for an explicit alternate
policy. Both ordered host/guest directions remain recorded using the selected
engine essential dignities at the question instant and question-chart sect.
The default selects all essential dignities; an empty `receptionDignities`
list disables the requirement. Reception adds no new dignity table or score.

Each collection assessment contains the two current applications, their first
future contacts on the same directed branches, directional receptions, every
eligibility check with its source/explanation and the contact order. Either
arrival order can qualify. A resolved later contact is recorded as
`completion` evidence even when another eligibility check rejects the pattern;
it establishes no prediction or authoritative judgement. Coincident or
unresolved order has no assigned completion and requires review. A root too
close to the question, or a crossing direction inconsistent with current
relative motion, also requires review.

`heavierPlanet`, `slowerPlanet` and `principalsNotAspecting` are independently
toggleable requirements. Traditional weight uses the existing sphere order.
Slower speed is a project proxy using absolute instantaneous degrees/day,
with strict comparison against both principals. Not beholding is operationally
read as no current enabled in-orb aspect between the house rulers, rather
than whole-sign aversion. Engine orbs and exact arithmetic control those
observations. `collectionOfLight: false` disables the whole mode;
`collectors: []` or an empty aspect selection creates no patterns.

Searches use the aspect policy's future horizon and step, but the collection
policy's separate global provider-call budget. All enabled directed branches
between active collectors and principals are scanned once and retained in
chronological order. Budget refusal discards every partial contact and endpoint
reference while preserving current and reception evidence. A missing contact
is bounded-search evidence; it does not establish absence outside that window.
Sign changes, stations and competing third-party contacts require separate
assessment. Completion inherits the engine solver's sampled-search limitations.

Reports and policies are deeply frozen JSON-friendly snapshots. Restored policy
snapshots are revalidated. The consumer checks actual cusps, question settings,
unique required body rows, canonical longitudes and finite speeds; unused rows
are ignored. It does not authenticate chart geometry against the motion
provider. Independent motion derivations appear in [`tests/fixtures.md`](tests/fixtures.md).
`tests/collection.test.ts` checks eligibility, branch handling, roles and
ownership; `tests/collection.budget.test.ts` checks atomic refusal and provider
validation; `tests/collection.integration.test.ts` checks engine delegation,
house systems and fallback without claiming independent ephemeris accuracy.

`evaluateImpediments(result, aspectPolicy, impedimentPolicy)` assesses current
nonexact in-orb applications between the two principal house rulers. It
reports sourced prohibition, frustration and station-associated refranation
observations, each independently toggleable. Moon and natural roles remain
available in the underlying significators without creating extra principal
house roles. Shared house rulers produce no self-application. Other perfection
modes remain separate reports.

```ts
import { createImpedimentPolicy, evaluateImpediments } from "./src/index.js";

const impedimentPolicy = createImpedimentPolicy({
  prohibitionScope: "both-principals",
  frustrationScope: "conjunction-only",
  refranation: false
});
const impediments = evaluateImpediments(result, undefined, impedimentPolicy);
```

The default prohibition scope is `either-principal`: a selected third planet
has an enabled exact contact with either ruler before their first found
contact on the current applying branch. `both-principals` requires the same
third planet to contact both rulers clearly before that endpoint. These
explicit readings of Lilly's definition and examples are documented in
[`SOURCES.md`](SOURCES.md). Third contacts need not already be in orb at the
question; their current orb and motion are preserved in the evidence.

Frustration uses the lighter ruler as applicant and the heavier as recipient,
using the existing traditional sphere order. The recipient must have a
current nonexact in-orb application to the third planet and reach that
same branch before the principal contact. Its crossing direction must agree
with current relative motion. The default `conjunction-only` scope requires
both contacts to be bodily conjunctions; `enabled-aspects` is a broader caller
interpretation. `swifterApplicant` defaults to requiring the lighter ruler's
absolute question-time speed to exceed the recipient's. Disable this project
proxy with `false`. It does not change sphere order or aspect arithmetic.
General prohibition can overlap frustration; both labels remain observations
without a chosen precedence or final verdict.

Refranation requires an applicant station from direct to retrograde before
any found original-branch principal contact. The recipient must be direct
at the question and side probes, and the aspect must be nonexact and
separating on its original branch after the station. The before/after aspect
states, signed speeds, transition and contact relation remain available.
This is a station-associated loss of the question-time application, without
proving that the station caused it or that contact can never occur. A later
geometric contact stays recorded. A recipient reversal or an applicant
reversal with ongoing application does not satisfy this selected reading.
Touches, unresolved sides and contact coincidences require review. The
station can qualify even when the bounded scan finds no later contact.

The underlying `motion` report reuses the existing aspect and station
scanners, with sign-boundary checks disabled. `contacts` preserves every
selected third contact in chronological order. Each application contains
its physical applicant/recipient, the swiftness fact and sourced rule
observations with status, evidence and short explanations. `not-triggered`
means the selected conditions were not established in the sampled horizon.
Contact rules return `contact-not-found` when no principal endpoint is found;
they do not order against a linear extrapolation. Sign changes, reception
exceptions, strength, continuous application and other perfection modes
are not adjudicated here.

The aspect policy controls enabled types, orbs, horizon and step. Its
relative-evaluation budget and the station scanner's provider-call budget
are separate from `search.samples`, which counts third-contact longitude
calls and station-probe longitude/speed calls. `maxSamples` and
`stationMaxSamples` defaults and limits are enforced in
`tests/impediments.test.ts`; preflight and late atomic refusal are enforced
in `tests/impediments.budget.test.ts` over the independent fixture horizon.
A refused third-contact/probe scan discards all intervention evidence;
the independent `motion` report remains available. A refused station scan
does not discard completed third-contact evidence. Disabled rules skip
their additional scans and inputs. A completed sampled scan is not a
completeness proof, and its ordering resolution is not an accuracy bound.

`evaluateImpedimentsWith(longitudeAt, speedAt, result, aspectPolicy, policy)`
accepts consistent independent motion providers. Snapshots are detached,
deeply frozen and JSON-friendly, with restored policies revalidated.
Required rows, geometry, finite speeds and representable horizons are
checked; providers are not authenticated against the chart. Invalid inputs
throw `RangeError`, and provider exceptions propagate. Fixture derivations
are in [`tests/fixtures.md`](tests/fixtures.md). The integration suite checks
engine delegation, actual houses and fallback without establishing new
ephemeris accuracy or predictive validity.

## Optional symbolic timing

`evaluateTimingHints(result, aspectPolicy, timingPolicy)` attaches symbolic
quantities to current in-orb applications with sampled contact candidates.
The default `createTimingPolicy()` disables timing, and every omitted
modality/house cell is disabled. Enable timing and choose units explicitly:

```ts
import { createAspectSearchPolicy, createTimingPolicy, evaluateTimingHints } from "./src/index.js";

const timingPolicy = createTimingPolicy({
  enabled: true,
  basis: "both",
  units: {
    cardinal: { angular: { unit: "weeks", unitsPerDegree: 1 } },
    fixed: { succedent: { unit: "years", unitsPerDegree: 0.5 } },
    mutable: { cadent: { unit: "months", unitsPerDegree: 2 } }
  }
});
const timing = evaluateTimingHints(result, createAspectSearchPolicy(), timingPolicy);
```

This table is the caller's convention, exercised in `tests/timing.test.ts`
over the hand-derived motion fixtures in [`tests/fixtures.md`](tests/fixtures.md).
It is not attributed to Lilly as a universal historical matrix. The source
record names his qualitative timing guidance; the selected interpretation
and its limits are described in [`SOURCES.md`](SOURCES.md).

The basis can be `both`, `querent`, `quesited` or `moon`. Each selected
physical planet supplies its own question-time sign modality and actual
house kind. Shared roles remain attached to that planet. Different bases
produce separate alternatives, without choosing between them, averaging
their quantities or substituting a missing role. The house kind follows the
actual cusp placement from engine `houseOf`, including polar fallback, with
no cusp anticipation or ecliptic latitude. Sign modality comes from engine
sign definitions and canonical longitude, ignoring stale chart labels.

Each assessment keeps `degreesToPerfection`, a computational `contact`
with `elapsedDays`, and separate `hints`. A hint's `symbolic.quantity` is
the engine-reported current angular gap multiplied by `unitsPerDegree`.
It is neither a travelled planetary arc nor the gap divided by speed.
Symbolic hours, days, weeks, months and years remain labeled quantities;
they are never converted into calendar dates or elapsed UTC days. Only
the sampled contact carries an ephemeris elapsed time.

Exact current contacts return `exact-now`, with a zero gap and no future
symbolic hint. Separating, stationary and outside-orb aspects return
`no-current-application`. Disabled or refused searches and a contact absent
from the bounded horizon emit no hint. These states retain their different
explanations; none establishes an outcome. A false unit cell independently
disables that combination. The default disabled timing policy skips future
provider calls and placement-only cusp circuit checks.

The `aspects` report preserves the existing search method, clock provenance,
resource accounting and all-or-none refusal. Contact searching delegates
to engine crossings; this adds no event solver. `evaluateTimingHintsWith`
accepts a consistent caller longitude provider for independent fixtures.
Policies and results are detached, deeply frozen and JSON-friendly, and
restored policy snapshots are revalidated. Malformed policies, enabled
placement geometry and numerical underflow of a nonzero symbolic quantity
throw `RangeError`; provider exceptions propagate. Those behaviors are
enforced in `tests/timing.test.ts`. Integration checks establish engine
delegation and preservation of actual house systems, without new ephemeris
accuracy evidence.

Sign changes, stations, reception and intervention may interrupt a sampled
candidate. This timing report leaves those assessments to the existing
perfection reports, and does not infer symbolic completion hints for
translation or collection. A symbolic quantity remains an optional
interpretive hint, without a prediction or final yes/no judgement.
