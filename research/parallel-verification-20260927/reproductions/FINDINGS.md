# Focused findings from the frozen rc.10 package

The run confirmed one narrow API consistency concern and one illumination
approximation. All five targeted controls passed. Neither result establishes a
broad numerical failure, and no production change was made.

## Run identity

| Item | Value |
| --- | --- |
| Package | `@zodiacs/engine@0.1.1-rc.10` |
| Source reference supplied for this run | `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa` |
| Packed artifact SHA-256 | `a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c` |
| Ephemeris | `astronomy-engine@2.1.19` |
| Runtime | Node `v24.19.0`, Linux x64 |
| Run | 2026-09-27 15:11:43 UTC |
| Full observations | `results.json` |

The package hash identifies tested bytes. The source reference is provided by
the package-acquisition process, not independently attested by the package.
Distribution file hashes are also recorded in `results.json`.

## 1. Saturn returns silently discard a natal clock override

**Classification: reproduced contract gap; moderate for callers using pinned
ΔT.** Ordinary unpinned behavior is not implicated by this result. The existing
API accepts both a birth input and an engine-created chart, and the birth type
supports a ΔT override. The return documentation does not explicitly promise
support for that override, so the evidence warrants a contract decision rather
than an assumed implementation fix.

Synthetic input: `1990-02-01T12:00:00Z`, `timeKnown: false`. The engine's default
ΔT was `56.92123203285413` seconds; natal Saturn was
`289.27865351977727` degrees.

| Supplied ΔT | Saturn in the pinned natal chart | `saturnReturn(...).natalLon` | Difference |
| --- | ---: | ---: | ---: |
| Default + 1 second | 289.2786548192579° | 289.27865351977727° | 0.0046781301″ |
| Default + 3,600 seconds | 289.2833306530347° | 289.27865351977727° | 16.8376797269″ |

The return target and every returned season stayed byte-for-byte equal to the
default result when passed either the pinned birth or the engine-created pinned
chart. The one-hour override is an accepted diagnostic input, not an estimate
of a real modern clock error. No timing consequence is estimated here.

Minimal example inside a consumer with the frozen package installed:

```js
import { natalChart, saturnReturn } from '@zodiacs/engine';

const birth = { utc: '1990-02-01T12:00:00Z', timeKnown: false };
const ordinary = natalChart(birth);
const pinned = natalChart({ ...birth, deltaT: ordinary.deltaT.seconds + 1 });

console.log(pinned.bodies.find(body => body.body === 'Saturn').lon);
// Observed: 289.2786548192579
console.log(saturnReturn(pinned).natalLon);
// Observed: 289.27865351977727
```

**Proposed acceptance requirement:** use the supplied chart's natal Saturn
target, or explicitly reject/document unsupported clock overrides. This is a
proposed consistency requirement, not an existing release gate. A natal pin
must not automatically become a constant ΔT for all future event times.

The implementation supports the diagnosis: the public return function validates
the input, extracts only UTC, and calls the date-only return calculation. That
calculation recomputes natal Saturn under the default clock.

Sources: [public API](https://github.com/zodiacs-org/engine/blob/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/src/api.ts),
[return calculation](https://github.com/zodiacs-org/engine/blob/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/src/returns.ts),
[input type](https://github.com/zodiacs-org/engine/blob/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/src/types.ts),
[README](https://github.com/zodiacs-org/engine/blob/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/README.md).

## 2. Moon illumination is a longitude-only approximation

**Classification: measured model/documentation limitation; low priority.** This
is not a proven failure of an explicit numerical tolerance. The longitude
elongation convention is appropriate for zodiac phase events; it should not be
confused with the physical phase angle at the Moon.

The engine's reported illumination exactly followed
`(1 - cos(longitudeElongation)) / 2` at all 33 sampled daily instants, from
2026-09-01 12:00 UTC through 2026-10-03 12:00 UTC. Astronomy Engine's separate
`Illumination` computation uses Earth–Moon–Sun vectors, including distances and
out-of-ecliptic geometry. Its module was explicitly put on `engine.deltaT` for
this comparison.

The largest sampled difference was **0.1986717374 percentage points** at
2026-09-15 12:00 UTC:

| Quantity | Value |
| --- | ---: |
| Longitude elongation | 52.670003651590605° |
| Engine illumination | 0.19679761227870612 = 19.67976123% |
| Same-dependency geometric illumination | 0.19878432965275483 = 19.87843297% |
| Difference | −0.1986717374 percentage points |

This is a finite same-dependency comparison, **not an independent JPL/Swiss
validation and not a global error bound**. It does not isolate every possible
coordinate correction difference. No event time, phase label, or current
user-visible display failure is established by it.

**Suggested resolution:** document illumination as approximate if it is intended
for display. If physical illuminated fraction is promised, calculate and test
that quantity separately while retaining longitude elongation for astrology.
The source comment “High-precision Moon phase” is broader than the calculation
justifies for this particular field; tightening that wording is a reasonable
small follow-up.

Sources: [phase calculation](https://github.com/zodiacs-org/engine/blob/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/src/api.ts),
[MoonPhase field definitions](https://github.com/zodiacs-org/engine/blob/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/src/types.ts).
The exact installed reference module path and SHA-256 are recorded in
`results.json`; its `Illumination` function was inspected locally.

## Controls that passed

- Invalid Gregorian date `2026-02-30` rejects with `RangeError`.
- A nonfinite ΔT override rejects with `RangeError`.
- A contradictory asserted `polar-fallback` at the equator rejects.
- Unknown birth time withholds angles, houses, sect and lots, even with coordinates.
- A pinned chart does not change the clock of a later unpinned natal chart; the
  original body's longitudes reproduced exactly in this run.

## Handoff

Keep the core owner responsible for deciding and implementing any contract
change. The runner is an external observer and can be rerun against a successor
package. It does not prescribe changes to core source, release gates,
preregistration, sealed holdouts, fixtures or production deployments.
