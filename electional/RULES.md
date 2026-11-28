# Rule configuration

`parseRuleSet(text, 'json' | 'yaml')` loads a configuration.
`validateRuleSet(value)` validates an already parsed object. Both return a
detached, deeply frozen `RuleSet`, or throw `RuleValidationError`. Errors contain
bounded field paths and validation codes, without submitted values or parser
excerpts. These functions load configuration only. The separate
[`evaluateBasicRule`](EVALUATION.md) API evaluates Moon sign, Moon phase and
direct-motion rules. The remaining evaluators and composition are linked from
[README.md](README.md); [CLI.md](CLI.md) exposes the facts-only stream.

The source of the versioned Draft-07 JSON Schema is
[src/rule-schema.ts](src/rule-schema.ts), exported as `ruleSchema`. Run
`npm run schema` to write a JSON copy to the gitignored
`generated/rules.schema.json`. Consumers of that copy must register the
`resolved-instant` format and perform the cross-field checks described below;
the library loader performs both. The JSON Schema is local and contains no
remote references. TypeScript input and output types are in
[src/rule-types.ts](src/rule-types.ts).

## Document shape

Every document declares `schemaVersion: electional/v1`, an `activity` label,
`location`, `range`, `houseSystem` and a nonempty `rules` list. Unknown fields
and versions are rejected. The activity must be nonempty, have no control
characters or surrounding whitespace, and fit the schema's length limit.

`location` contains numeric `latitude` and `longitude` in degrees, north and
east positive, bounded as the engine's coordinates are. Both are required.
Names, addresses and timezone identifiers are outside this schema. Coordinate
acceptance does not guarantee that a house or rise/set computation is defined
there; the adapters expose refusals and polar fallbacks.

`range` contains `start`, `end` and `clock: utc`. Dates must be full Gregorian
date-time strings with seconds and an explicit `Z` or signed clock offset.
Fractional seconds must fit JavaScript's millisecond resolution. Dates without
times, local wall times, numeric timestamps, expanded years, leap seconds,
rollovers and the unknown-offset spelling `-00:00` are rejected. Accepted
strings retain their original spelling. `resolvedInstantMs` returns their
epoch-millisecond labels for comparison. Offset normalization can cross a
calendar date; the start must be strictly before the end as an instant.
The search domain is start-inclusive and end-exclusive.

Resolve local clocks before constructing this document. A location does not
resolve an ambiguous or nonexistent wall time. The UTC declaration identifies
the input clock only; it does not certify that an ephemeris clock or its
reference coverage is available over the range. UT1 and TT labels are not
accepted as UTC search ranges.

`houseSystem` selects one of the engine's public house-system identifiers. It
applies to the electional chart. A supplied natal input declares its own system.
The schema supports the tropical zodiac and the ordinary Sun, Moon and planets;
it does not expose nodes, other chart points, custom aspects or sidereal options.

## Rules and weights

Each rule requires a unique lowercase `id`, a recognized `kind`, an explicit
`mode` and its `options`. A `require` rule has no `weight`; the search
intersects its passing windows with the other required rules. A `prefer`
rule requires a positive finite `weight`; internal scoring uses it as a
relative numeric contribution only after explicit opt-in, while default library, stream, CLI and HTTP results report states only. Weights are
configuration choices, not probabilities or predictions. Missing modes,
stringified numbers and implicit defaults are
rejected. Selected lists must be nonempty and have no duplicate entries.

| Kind | Required options and declared interpretation |
| --- | --- |
| `moon-not-void` | `bodies: traditional` or `modern`, using the engine's existing void-of-course convention. Evaluation requires explicit scan lookahead and preserves unknown tails; see [VOID.md](VOID.md). |
| `direct-motion` | `bodies`, selecting Mercury, Venus or both. All selected bodies must have direct motion. |
| `moon-sign` | `signs`, with lowercase engine sign slugs. Any selected sign is eligible. |
| `moon-phase` | `phases`, using exact engine phase names such as `Waxing Crescent`. Any selected phase is eligible. |
| `planetary-hour` | `rulers`, selecting classical planets, and `utcOffsetMinutes`, the fixed day-ownership clock east of UTC. Any selected ruler is eligible. |
| `benefic-house` | `bodies` from Venus and Jupiter, integer `houses`, `match: any` or `all`, and `polarFallback: reject` or `allow`. Match refers to the selected bodies occupying any selected house. |
| `benefic-angular` | Benefic `bodies`, `angles`, `maxOrbDegrees` and `match`. Angles are `ascendant`, `midheaven`, `descendant` and `imum-coeli`; a body qualifies near any selected angle. |
| `applying-aspect` | Moving `body`, distinct `targets`, major `aspects`, `maxOrbDegrees` and `match`. Match refers to targets reached by any selected applying aspect; self-aspects are rejected. |
| `avoid-eclipses` | `kinds` from `solar` and `lunar`, and nonnegative `withinDays`. Exclude margins around selected events. |
| `avoid-stations` | Planetary `bodies` excluding Sun and Moon, and nonnegative `withinDays`. Exclude margins around selected stations. |
| `synastry-aspect` | `movingBodies`, `natalBodies`, major `aspects`, `maxOrbDegrees` and `match`. Match refers to every moving/natal pair under the engine's existing inter-chart aspect conventions. The declared orb caps native orbs; see [SYNASTRY.md](SYNASTRY.md). |

Angular and aspect orbs are nonnegative degrees. Station and eclipse margins
are elapsed epoch days, not local calendar days. Planetary-hour ownership uses
the explicitly supplied fixed offset; it does not follow a timezone's daylight
saving changes. The adapter uses the existing engine solar-day and
rise/set conventions and reports missing sunrise or sunset.

Major aspects use the engine's conjunction, sextile, square, trine and
opposition identifiers. Applying aspects use configured-aspect analysis;
synastry uses the existing relationship helper `findInterAspects`. Identical orb labels do
not make those APIs' arithmetic or motion conventions interchangeable. Result
explanations, policy records and receipt scope state which API computed each rule.

## Synthetic natal input

A `synastry-aspect` rule requires one `natal` object with `synthetic: true`, a
resolved `instant`, `clock: utc`, a coordinate `location` and `houseSystem`.
Arrays of charts, missing or false synthetic declarations, unknown times and
unused natal inputs are rejected. The declaration is a caller assertion; the
loader cannot establish whether an instant belongs to a real person. Use
invented data only in this workbench's requests, examples and fixtures.

The complete JSON example is the `request` member of
[test/fixtures/rules.json](test/fixtures/rules.json). It exercises every rule
family and declares its invented natal chart explicitly. The fixture wrapper
records its independent calendar derivation and is not itself a rule document.
To load that example after a local build:

```js
import { readFileSync } from 'node:fs';
import { validateRuleSet } from './build/index.js';

const example = JSON.parse(readFileSync('./test/fixtures/rules.json', 'utf8'));
const rules = validateRuleSet(example.request);
console.log(rules.activity);
```

This exercise configuration is separate from the authored traditional launch,
contract-signing and travel packs in [PRESETS.md](PRESETS.md). None claims
predictive validity.

## Loader boundaries and evidence

YAML uses data-only core scalars, with no aliases, anchors, explicit tags,
directives, merge-key options or multiple documents. Duplicate mapping keys are
rejected in both JSON and YAML, including duplicates with equal values. JSON
also has to satisfy JSON syntax; YAML is never guessed from a JSON request.
The object API accepts finite JSON data, rejects sparse arrays, accessors,
symbols and cycles, and copies shared object references separately. Proxies
remain caller-supplied executable code; this API does not sandbox them.

`RULE_LIMITS` defines bounded UTF-8 document bytes, nesting, node count, rule
count and preference weights. Their enforced boundary cases are in
[test/rules.electional-check.ts](test/rules.electional-check.ts). That test also
checks schema options, required fields, immutable snapshots, resolved date
syntax and agreement between object, JSON and YAML loading. The fixture's
reference span and expected epoch endpoints are hand-derived from Gregorian
leap-day counting and offset arithmetic. They establish configuration and
calendar behavior only, with no claim about astronomical accuracy or future
search completeness.

Runtime parsing uses the locally pinned [Ajv](https://ajv.js.org/guide/formats.html)
validator and [yaml](https://eemeli.org/yaml/) parser. Their code is consumed as
dependencies, not copied here; their own MIT and ISC notices apply. The
configuration loader contains no engine data. The evaluator's independent
astronomical inputs and attribution are recorded in
[references/README.md](references/README.md).
