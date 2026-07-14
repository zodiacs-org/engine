# @zodiacs/engine

Pure TypeScript astrology calculations for browsers and Node.js. The package
computes tropical planetary positions, natal charts, transit snapshots,
synastry, Moon phase, and Saturn-return seasons. It is synchronous,
side-effect-free, ESM-only, and performs no network request from its core entry
point.

```sh
pnpm add @zodiacs/engine
```

## Natal chart in 10 lines

```ts
import { natalChart } from "@zodiacs/engine";

const chart = natalChart({
  utc: "1990-06-15T12:30:00Z",
  latitude: 40.7128,
  longitude: -74.006,
  houseSystem: "whole"
});

console.log(chart.bodies, chart.houses);
```

`utc` must be a resolved instant. If a user enters a local wall time, use the
optional geo entry point so daylight-saving and historical timezone rules are
handled before the chart is computed:

```ts
import { natalChart } from "@zodiacs/engine";
import { resolveBirth } from "@zodiacs/engine/geo";

const birth = resolveBirth({
  date: "1990-06-15",
  time: "08:30",
  timeZone: "America/New_York",
  latitude: 40.7128,
  longitude: -74.006,
  houseSystem: "placidus"
});

const chart = natalChart(birth);
```

## Compatibility

```ts
import { natalChart, synastry } from "@zodiacs/engine";

const a = natalChart({ utc: "1990-06-15T12:30:00Z" });
const b = natalChart({ utc: "1992-11-03T07:15:00Z" });
const compatibility = synastry(a, b);

console.log(compatibility.top);
console.log(compatibility.elements);
```

## Daily transits

```ts
import { natalChart, transits } from "@zodiacs/engine";

const natal = natalChart({ utc: "1990-06-15T12:30:00Z" });
const today = transits(natal, new Date());

for (const aspect of today.aspects) {
  console.log(aspect.a, aspect.type, aspect.b, aspect.orb);
}
```

## API

- `positions(date)` returns the Sun, Moon, eight planets, and true Moon nodes.
- `natalChart(birth)` adds natal aspects and, when coordinates are present,
  angles and whole-sign or Placidus houses.
- `transits(natal, date)` returns a sky snapshot and moving-to-natal aspects.
- `synastry(a, b)` returns inter-chart aspects and element/modality balances.
- `moonPhase(date)` returns elongation, illuminated fraction, and phase name.
- `saturnReturn(birth)` returns exact-pass seasons through roughly age 92.
- `@zodiacs/engine/geo` provides IANA local-time resolution and a client for a
  separately hosted, sharded GeoNames index.

Inputs accept `Date`, ISO/date strings, or millisecond timestamps. Returned
longitudes use degrees in `[0, 360)` and positions include sign and degree
annotations. Charts use the tropical ecliptic of date. Planetary positions are
apparent and geocentric; this package does not calculate topocentric parallax.

Placidus is undefined in polar regions. Above 66 degrees absolute latitude the
engine falls back to whole-sign houses and adds `polar-fallback` to the chart
flags. When the birth time is unknown, pass a conventional UTC instant with
`timeKnown: false`; angles and houses remain absent and the chart carries the
`no-time` flag.

## Accuracy and licensing

The ephemeris is powered by the MIT-licensed `astronomy-engine`. Tests compare
modern and historical positions with public JPL Horizons vectors and exercise
astronomical and geometric invariants. See [LICENSING.md](LICENSING.md) for the
full provenance audit and the explicit Swiss Ephemeris exclusion.

The npm package contains no place or timezone database. GeoNames attribution
and the host-ICU historical-timezone caveat are recorded in [NOTICE](NOTICE),
which downstream users should retain.

## Internal site entry points

`@zodiacs/engine/internal` and `@zodiacs/engine/internal/math` are private
compatibility boundaries for Zodiacs.org. They let the site consume the exact
package implementation while keeping its scanner-oriented functions and lazy
bundle boundary intact. They are not covered by semantic-versioning guarantees;
third-party code must use the documented root and `/geo` entry points.
