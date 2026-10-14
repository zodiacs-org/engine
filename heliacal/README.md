# Heliacal visibility workbench

This private project builds a planetary visibility library on the engine in
the parent checkout. It is outside the engine's npm package. The checklist
in [PLAN.md](PLAN.md) records the implementation order.

The foundation currently supplies strict inputs, apparent positions and
rise/set/transit events with position receipts. Visibility models, crescent
predictions, phase classification and the CLI are planned, not available.

## Development

Use Node as specified in this project's `package.json`, then, from the
repository root:

```sh
npm --prefix heliacal ci --ignore-scripts
npm --prefix heliacal run typecheck
npm --prefix heliacal test
npm --prefix heliacal run check:package
```

Dependencies and the lockfile belong to this folder. Vitest's alias and
TypeScript's path mapping let the parent engine source use the same pinned
astronomy dependency without installing or building anything at the root.
There is no emitted build or installed command yet. Consumers currently need
a TypeScript-aware loader or bundler with the same dependency mapping; a
plain Node import of the source is not a supported invocation.

The package check requires npm and GNU tar. It verifies that the current
working-tree pack list excludes this folder, then runs the repository's
`package:contents` check in a temporary copy using the carried archive's
build output. It writes no root `dist/` and creates no archive. This is a
packaging check, not a rebuild or an archive-binding check.

## Foundation API

```ts
import { enginePosition, horizonEvents } from "./src/index.js";

const site = { latitude: 38.89, longitude: -77.03 };
const position = enginePosition("Venus", "2024-06-21T12:00:00Z", {
  observer: site,
  frame: "equatorial-true-of-date"
});
const horizon = horizonEvents(
  "Moon", site, "2024-06-21", "2024-06-22", { maxSamples: 10000 }
);
```

The example site and dates are observing inputs, not personal birth data.
`VISIBILITY_BODIES` names the Moon, Mercury, Venus, Mars, Jupiter and Saturn.
The low-level adapters also accept the Sun for the observing geometry.
`visibilityBody`, `observationBody`, `observer`, `instant` and `dateRange`
validate inputs. Invalid inputs throw `RangeError` before a search.

Instants use the engine's resolved-date parser. Date-only inputs mean UTC
midnight; date-times need an explicit offset. The engine's UTC input basis
determines UT1 and TT. These adapters do not accept pinned delta T or a
different input time scale. Date inputs are copied. Ranges include the start
and exclude the end, and must be nonempty. Coordinates are geodetic degrees,
longitude positive east; observer height is in metres.

`enginePosition` returns the engine's calculation result unchanged, including
its bounds and receipt or its typed refusal. Positions are apparent,
tropical, in degrees and astronomical units, with Cartesian coordinates and
without speeds. The default is geocentric ecliptic of date; an observer
selects topocentric positions. In the equatorial frame, `lon` is right
ascension in degrees and `lat` is declination. See the parent's
[calculation guide](../docs/calc.md) for the engine's coverage and corrections.

`horizonEvents` delegates to `src/sky/riseset.ts` and preserves its event
times, geometric centre altitudes, north-through-east azimuths, conventions,
flags and sample counts. Its optional limb, refraction and sample budget
have the engine's meanings. Budget refusal returns no events. Additional
position calls are outside the solver's sample budget.

Each returned event adds `position`, an equatorial topocentric calculation
at that event. Its receipt records that position calculation only; the
result says `receiptScope: "event-positions"`. The sky solver has no native
receipt. A position can be refused outside the calculation entry's coverage
even when sky supplies the event; that refusal remains explicit. The common
`engine` field identifies the solver's engine and ephemeris even when no
events are returned.

Sky uses WGS84 for the observer; the calculation entry uses IERS 2003.
Consequently a position attached to an event is not a reproduction of sky's
horizontal reduction. Its receipt names the calculation conventions. Height
moves the observer, but the sky solver applies no horizon dip. See the
parent's [sky guide](../docs/sky.md). No visibility conclusion is implied by
the existence of a horizon event.

## Checks and sources

The foundation tests check inputs, body scope, engine delegation, receipt
preservation, refusals, polar conditions and interval boundaries. These are
integration checks, not independent accuracy measurements.

The USNO comparison in [test/engine.test.ts](test/engine.test.ts) uses the
parent's committed [USNO fixture](../src/sky/fixtures/usno-rstt.json), for the
Sun and Moon on 2024-06-21 at the example site. Its tolerance is one minute,
set before execution to accommodate the rounded table and differing solar
radius conventions. This checks only those listed events against the table,
not real-world sighting accuracy. It does not validate a visibility model.

[SOURCES.md](SOURCES.md) records the primary-source roadmap for later
milestones. Code and original documentation here follow the repository's
MIT licence. The engine's data retain the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE). The existing USNO
fixture's provenance is documented there. No papers, historical observation
databases or third-party code are copied into this folder.

Generated tables, dependency installs, caches and research downloads stay
in ignored folders; small future fixtures need their own source and terms.
