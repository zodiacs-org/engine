# @zodiacs/engine

Browser-first TypeScript astrology calculations that refuse to guess: a birth
with no time, a near-miss field such as `lat`, or an instant outside what was
checked is refused or flagged, never filled in. The calculations make no
network calls.

```sh
npm install @zodiacs/engine
```

```ts
import { natalChart } from "@zodiacs/engine";

const chart = natalChart({
  utc: "1990-06-15T12:30:00Z", // a resolved instant; this birth is synthetic
  latitude: 40.7128,
  longitude: -74.006,
  houseSystem: "placidus"
});
console.log(chart.bodies, chart.houses, chart.ephemeris); // ephemeris: astronomy-engine 2.1.19
```

The default computes on astronomy-engine: an application that bundles
`natalChart` is about 36 KB gzipped (36,213 bytes, 79,787 minified) and holds
no DE440 data. A date with no time is refused unless `timeKnown: false`; turn
a local wall time into an instant with `resolveBirth` from `@zodiacs/engine/geo`.

## NASA JPL DE440 in one line

```ts
import { useDe440 } from "@zodiacs/engine/de440/pack";
useDe440(); // the root, and every entry point that shares its ephemeris, now computes on DE440
```

`useDe440()` opens the sealed pack the package ships (2,489,664 bytes refitted
from NAIF's `de440.bsp` for 1790 to 2210, checked against its SHA-256) and
makes it the default: about 2.44 MB gzipped with `natalChart` (2,441,049
bytes), against the default's 36 KB. Charts, positions and receipts name
their ephemeris, and a fallback to astronomy-engine is flagged
`"outside-de440-span"` or `"de440-unavailable"`, never silent. **Breaking
from 2.x:** up to 2.1.0 the root loaded the pack on import and computed on it
by default ([docs/de440.md](docs/de440.md)).

## How it compares

The conformance suite's 240 L1 vectors: the Sun, the Moon and the planets at
24 instants from 1851 to 2148 against NASA JPL Horizons (DE441), within 1″
([conformance/RESULTS.md](conformance/RESULTS.md); notes in
[docs/comparison.md](docs/comparison.md)).

| Engine | Licence | Runtime | L1 within 1″ | Lon median / max | Footprint |
| --- | --- | --- | --- | --- | --- |
| `@zodiacs/engine` 3.0.0, default | MIT AND CC-BY-4.0 | JS/TS: browsers, Node, Deno, Bun | 48 / 240 | 2.083″ / 18.774″ | ~36 KB gzipped (`natalChart`) |
| `@zodiacs/engine` 3.0.0 + `useDe440()` | MIT AND CC-BY-4.0 | JS/TS: browsers, Node, Deno, Bun | 240 / 240 | 0.002″ / 0.013″ | ~2.44 MB gzipped, pack included |
| Swiss Ephemeris 2.10.03 | AGPL-3.0 or commercial | C, native bindings | 240 / 240 | 0.001″ / 0.005″ | native library and `.se1` files |
| Skyfield 1.55 (`de440s.bsp`) | MIT | Python and NumPy | 240 / 240 | 0.001″ / 0.013″ | Python package and a JPL BSP file |
| astronomia 4.3.0 (VSOP87B) | MIT | JS | 176 / 192 answered (48 unsupported) | 0.238″ / 2.782″ | JS package with VSOP87B tables |
| PyEphem 4.2.1 | MIT | Python, C (`libastro`) | 0 / 240 (all 240 unsupported) | none | Python package wrapping `libastro` |

Both `@zodiacs/engine` rows were measured on 3.0.0's build, and their
residuals equal the committed results' to the bit; sizes are esbuild 0.27.7
browser bundles, minified, gzip level 9
([docs/evidence/3.0.0-readme-20261126/](docs/evidence/3.0.0-readme-20261126/)).
Any engine can be measured through an adapter
([conformance/SUBMITTING.md](conformance/SUBMITTING.md)).

## Entry points

| Import | What it gives |
| --- | --- |
| `@zodiacs/engine` | natal charts, positions, transits, synastry, progressions, Moon phase, Saturn returns, chart points, declinations, configurable aspects, longitude crossings; astronomy-engine by default, about 36 KB gzipped |
| `@zodiacs/engine/de440/pack` | `useDe440()`: the shipped NASA JPL DE440 pack as the default, in one line ([docs/de440.md](docs/de440.md)) |
| `@zodiacs/engine/de440` | `openDe440Pack()`: a sealed DE440 pack you supply, used through the root's `withEphemeris` |
| `@zodiacs/engine/minor-bodies` | Chiron, Ceres, Pallas, Juno and Vesta from 1800 to 2200 TT, from tables fitted to NASA JPL Horizons; tree-shakeable (below) |
| `@zodiacs/engine/calc` | one calculation API over frames, centers and corrections, with bounds and receipts; ingresses, stations and lunations; the Swiss Ephemeris flag mapping ([docs/calc.md](docs/calc.md)) |
| `@zodiacs/engine/geo` | IANA local time: tzdb 2026f's histories before 1970, the host's `Intl` from 1970; Julian dates, local mean time, a GeoNames client ([docs/time.md](docs/time.md)) |
| `@zodiacs/engine/window` | birth-time windows: the cells within which signs, houses and aspects hold ([guide](docs/guide.md#birth-time-windows)) |
| `@zodiacs/engine/techniques` | returns, composite and Davison charts, the void-of-course Moon, aspect patterns, dignities ([docs/techniques.md](docs/techniques.md)) |
| `@zodiacs/engine/houses` | house positions of bodies with latitude, co-ascendants, cusp speeds ([docs/houses.md](docs/houses.md)) |
| `@zodiacs/engine/sky` | rise, set and transit times, planetary hours ([docs/sky.md](docs/sky.md)) |
| `@zodiacs/engine/timing` | profections, firdaria, zodiacal releasing, solar arc, planetary returns ([docs/timing-hellenistic.md](docs/timing-hellenistic.md)) |
| `@zodiacs/engine/vedic` | the sidereal zodiac: ayanamsas, nakshatras, vargas, KP sub-lords, dashas ([docs/vedic.md](docs/vedic.md)) |
| `@zodiacs/engine/time` | the time basis (UTC, UT1, TT, ΔT) and the frame of date, without the ephemeris ([docs/time.md](docs/time.md)) |
| `@zodiacs/engine/lite` | declination parallels, sect, composite midpoints, dignities, without the ephemeris ([docs/lite.md](docs/lite.md)) |
| `@zodiacs/engine/receipt` | draft natal receipts: create, serialize, parse, replay, redact ([guide](docs/guide.md#draft-natal-receipts-and-local-portability)) |
| `@zodiacs/engine/conventions` | the ids of the Zodiacs conventions registry that receipts name |
| `@zodiacs/engine/crossings` | the longitude-crossing solver, for a longitude function of your own, without the ephemeris |
| `@zodiacs/engine/deltat` | the ΔT model, with no dependencies |
| `@zodiacs/engine/core` | deprecated alias of `@zodiacs/engine`, kept for 2.x imports: the same module |

Each opt-in entry stays out of the root's import graph
(`npm run exports:smoke` checks it). `@zodiacs/engine/internal` and
`@zodiacs/engine/internal/math` are private to Zodiacs.org and carry no
compatibility promise ([docs/versioning.md](docs/versioning.md)).

## Points and minor bodies

`chartPoints()` gives the mean node, Black Moon Lilith (the mean lunar
apogee) and, from 3.0.0, **True Black Moon Lilith**, the osculating lunar
apogee from the Moon's state vector, which `calc()` gives too
(`lilith:true-osculating`). Against NASA JPL Horizons's Moon at 12 instants
from 1850 to 2150 it is within 1.589″ after `useDe440()` (median 0.050″) and
within 396″ on the default astronomy-engine ([guide](docs/guide.md#points)).

```ts
import { chiron, minorBodyPosition, minorBodyPositions } from "@zodiacs/engine/minor-bodies";

minorBodyPosition(chiron, "2000-01-01T12:00:00Z"); // a spec: only Chiron's table is bundled
minorBodyPositions("2000-01-01T12:00:00Z", ["Ceres", "Vesta"]); // names: all five tables are bundled
```

Chiron alone adds 14,403 bytes gzipped to a `natalChart` application, all
five 117,965. At 500 places from Horizons that the fit never saw, every
longitude and latitude is within 0.532″ after `useDe440()` and within 1.682″
on astronomy-engine ([guide](docs/guide.md#minor-bodies)).

## For coding agents and Swiss Ephemeris migrants

The package ships two documents beside the code, in
`node_modules/@zodiacs/engine/`: `skills/zodiacs-compute/SKILL.md`, how an
agent should choose, run and cite these calculations, and `docs/calc.md`, the
calc reference, which maps each `swe_calc_ut` flag and `SE_*` body to this
API (`SE_OSCU_APOG` is `"True Black Moon Lilith"`). The package holds no Swiss
Ephemeris code, data or output ([LICENSING.md](LICENSING.md)).

## Runtimes and `require(esm)`

- Node `^20.19.0 || >=22.12.0`, browsers through a bundler, Deno and Bun.
- ES modules only: `import` and `require("@zodiacs/engine")` load the same
  modules, through Node's require(esm). There is no CommonJS stub, and 2.x's
  `ERR_ZODIACS_ESM_ONLY` is gone. Node 22.12 prints a one-time
  `ExperimentalWarning` at the first `require()`; Node 20.19, 24 and 26 print
  none.
- CommonJS TypeScript projects need TypeScript 5.8 or later with
  `"module": "nodenext"` (or 5.9 with `"node20"`).
- No import-time side effects. The one runtime side effect is the ΔT model
  the engine installs in astronomy-engine.
- On 2.0.0 every supported conformance verdict (569) agreed with Node 22.22.2
  in Bun 1.4.4, Deno 2.9.6, Chromium, Firefox and WebKit; that check has not
  been run on 3.0.0 ([guide](docs/guide.md#runtimes-and-module-formats)).

## Accuracy you can check

The suite's 640 vectors cover positions, angles, houses, time scales,
calendars and events. After `useDe440()` 639 pass and one is unsupported (the
leap second 2016-12-31T23:59:60Z); on the default, 392 pass
([conformance/RESULTS.md](conformance/RESULTS.md)). Each figure here names
its evidence, and `budgets.json` with `scripts/ratchet.mjs` fails CI where a
bundle grows past its ceiling or accuracy slips past its limit.

## License and citation

`MIT AND CC-BY-4.0`: the code is MIT ([LICENSE](LICENSE)), and the 32 ΔT
values of Stephenson, Morrison & Hohenkerk's Table S15 in
`@zodiacs/engine/deltat` (in a shared chunk under `dist/` that
`dist/deltat.js` re-exports) are CC BY 4.0. [NOTICE](NOTICE) credits JPL's
DE440 (the pack is Zodiacs.org's refit, not reviewed or endorsed by JPL),
NASA JPL's Horizons system and the other sources, and
[LICENSING.md](LICENSING.md) gives each one's terms. Cite the package with
[CITATION.cff](CITATION.cff). [docs/guide.md](docs/guide.md) keeps every
section this README carried up to 2.1.0, [CHANGELOG.md](CHANGELOG.md) each
release's changes. The command line tool in `tools/cli/` and the Python
package in `python/` are parked at 3.0.0, not maintained or published for it
([tools/cli/PARKED.md](tools/cli/PARKED.md),
[python/PARKED.md](python/PARKED.md)).
