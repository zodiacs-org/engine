# Separate comparisons with other timing techniques

Primary directions solve a contact on the natal sphere, then apply the
explicit timing key to its equatorial rotation arc. Secondary progressions
and longitude solar arc use the engine's existing helpers in a separate
example. Their values never enter the primary solver or its evidence fixtures.

Run the synthetic example from the repository root after the local setup in
[README.md](README.md):

```sh
node directions/scripts/run-example.mjs compare-techniques
```

The runner bundles [compare-techniques.ts](examples/compare-techniques.ts)
inside the project's ignored build folder and prints JSON. The example uses
an invented UTC birth instant and place, with no pinned delta-T. Its
`primaryDirection` is a direct mundane Mars conjunction to the MC, with
retained bodily latitude, the Placidus semi-arc construction, the Ptolemy key
and an explicit tropical elapsed-year unit. This record includes the primary
hit's own arc, age and audit geometry.

`comparisons` has its own explicit target instant. It asks where the
secondary-progressed bodies are at that target and what longitude solar arc
the engine computes there. That target does not schedule the primary contact,
and the example makes no assertion that the techniques identify the same
event. Keep the complete records when comparing them: the field called
`arcDegrees` in a primary hit and `arcLongitudeDegrees` in this example have
different geometric meanings.

| Calculation | What changes | How time enters | Result to inspect |
| --- | --- | --- | --- |
| Primary direction | A natal point rotates westward at fixed declination to an explicitly selected position or axis; supported mundane converse exchanges the moving and fixed roles. | The selected timing key divides the solved equatorial arc into symbolic years. | `primaryDirection.arcDegrees`, `directedAgeYears`, `timing` and `geometry`. |
| Secondary progression | The engine evaluates the bodies at its progressed instant, with each body's own orbital motion. | `progressedInstant` maps elapsed life to an instant after birth under the engine's fixed tropical-year convention. | `comparisons.secondaryProgression.progressedUtc` and `bodies`. |
| Longitude solar arc | `directLongitudes` adds the same progressed-Sun longitude displacement to each supplied natal body longitude. | `solarArc` obtains that displacement from the engine's secondary-progressed Sun at the comparison target. | `comparisons.longitudeSolarArc.arcLongitudeDegrees`, the solar longitudes, and `directedLongitudes`. |

The example imports `progressedInstant`, `progressedBodies` and
`PROGRESSION_DAYS_PER_YEAR` from the engine's public root source entry,
[src/index.ts](../src/index.ts). It imports `solarArc` and
`directLongitudes` from its public timing source entry,
[src/timing.ts](../src/timing.ts). This source checkout resolves the public
APIs by relative path without building the root package. The comparison is
an opt-in example; [the pure directions entry](src/index.ts) does not import
the progression or solar-arc modules.

## Clocks and year units

The engine's progression convention maps each elapsed year of
`PROGRESSION_DAYS_PER_YEAR`, currently `365.2422` days, to one day after
birth. Its elapsed day is `86,400,000` JavaScript Date milliseconds, with no
leap seconds. The year and day constants, operation order and integer
millisecond truncation are implemented in
[src/progressions.ts](../src/progressions.ts) and checked in
[src/progressions.test.ts](../src/progressions.test.ts). This is elapsed-time
arithmetic, not a count of calendar birthdays or a TT-day progression rule.

`progressedBodies` evaluates engine positions at that mapped instant. Its
row speed is the ephemeris rate in degrees per day at the progressed instant;
under the progression mapping that number also expresses degrees per fixed
tropical year of life. It is not degrees per lived day. The source tests
check the mapped position call separately from the date arithmetic.

`solarArc` also uses those progression helpers. Its arc is a difference of
apparent solar ecliptic longitudes, unwrapped by the engine, and
`directLongitudes` applies that arc in longitude. There is no right-ascension
conversion in this calculation. The implementation and its checks are
[src/timing/solar-arc.ts](../src/timing/solar-arc.ts) and
[src/timing/solar-arc.test.ts](../src/timing/solar-arc.test.ts).

These comparison APIs accept UTC instants on the engine time basis, without
a caller-selected chart delta-T. The example therefore prepares its natal
chart on UTC without a pin. Reusing a TT or UT1 natal label as a UTC input,
or combining pinned natal longitudes with an unpinned solar arc, changes the
clock assumptions. Preserve the original time-scale metadata and perform
any needed clock conversion before making such a comparison.

The primary hit's `yearUnit` explicitly selects the interpretation of a
symbolic directed year as elapsed days. The example chooses
`tropical-365.2422-days`; `julian-365.25-days` is also available in the
primary library, but it does not change the engine's progression convention.
The two primary unit definitions and their arithmetic are enforced by
[timing.check.ts](checks/timing.check.ts) and derived in
[M7-derivations.md](evidence/M7-derivations.md). A primary hit returns elapsed
days under that choice; it does not return a calendar date.

## The solar-equatorial key is a separate primary key

`solar-equatorial-birth-day` uses the Sun's right-ascension advance over the
birth-to-following-day interval as a fixed annual rate for an already solved
primary arc. It does not follow the changing progressed-Sun longitude as
the target age changes. Lilly's attribution of this key to Maginus, and the
project's modern realization of it, are recorded in
[SOURCES.md](SOURCES.md#timing-keys-implemented-in-m7).

The primary solar adapter samples a TT day, using apparent geocentric solar
right ascension in each sample's true equator and equinox of date. Its
samples retain bodily solar latitude. [M7-derivations.md](evidence/M7-derivations.md)
and [solar.check.ts](checks/solar.check.ts) document and enforce that sampling
contract. This TT-day interval is different from the UTC Date arithmetic
used by the engine's secondary progression. Selecting the solar-equatorial
key does not turn a primary direction into longitude solar arc.

## What the example checks

[comparison-example.check.ts](checks/comparison-example.check.ts) runs the
documented command and checks that its serialized results preserve the
public engine helper results, the primary convention and the separate target
instant. It is an integration check on this synthetic input, not an
independent arc or ephemeris accuracy test. No displayed numerical result is
copied into an expected primary arc. The independent primary-direction
derivations and finite fixture coverage remain in
[evidence/README.md](evidence/README.md).
