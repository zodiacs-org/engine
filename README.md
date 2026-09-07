# @zodiacs/engine

Pure TypeScript astrology calculations for browsers and Node.js. The package
computes tropical planetary positions, natal charts, transit snapshots,
synastry, Moon phase, and Saturn-return seasons. It is synchronous,
side-effect-free, ESM-only, and performs no network request from its core entry
point.

**Release candidate: 0.1.1-rc.0.** Public npm lookups for this package returned
404 on 2026-09-07. The expansion release remains held for review and operator
publication authority. Install the exact candidate tarball supplied with the
review, retaining its SHA-256 receipt:

```sh
pnpm add ./zodiacs-engine-0.1.1-rc.0.tgz
```

From the candidate source checkout, run `corepack pnpm --filter @zodiacs/engine
build`, then `npm pack --ignore-scripts` in `packages/engine`. Test the packed
file in a clean consumer using `corepack pnpm --filter @zodiacs/engine
consumer:smoke /absolute/path/to/zodiacs-engine-0.1.1-rc.0.tgz`. The smoke check
downloads the artifact's public dependencies and TypeScript 5.9.3; its output
records the artifact hash, runtime and isolated consumer directory. A packed
candidate is not a published release.

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

Returned longitudes use degrees in `[0, 360)` and positions include sign and degree
annotations. Charts use the tropical ecliptic of date. Planetary positions are
apparent and geocentric; this package does not calculate topocentric parallax.

Placidus is undefined in polar regions. Above 66 degrees absolute latitude the
engine falls back to whole-sign houses and adds `polar-fallback` to the chart
flags. When the birth time is unknown, pass a conventional UTC instant with
`timeKnown: false`; angles and houses remain absent and the chart carries the
`no-time` flag.

The shared engine selects the eastern horizon intersection before assembling
houses, including in either polar hemisphere. At exact geographic poles no
point physically rises; at ecliptic/horizon coincidence an ascendant is not
unique. Those degenerate configurations are outside the verified angle scope.
Near tangencies the selected axis can change by 180 degrees. Placidus uses a
bounded iteration and falls back if it cannot converge; it never returns the
last unconverged iterate as a successful construction.

See [CHANGELOG.md](CHANGELOG.md) for candidate changes. Reference coverage and
known limits are recorded in the site [platform evidence ledger](https://github.com/ZodiacsOfficial/site/blob/codex/platform-stage-a/docs/platform/EVIDENCE.md).
The date parser's representable range is not a claim of astronomical accuracy
across that range. Reference cases are finite; broader numerical scope review
remains a release gate.

`findLongitudeCrossings` requires a finite step of at least one millisecond
and permits at most 10,000 ephemeris evaluations per call, including root
refinements. Excessive scans throw `RangeError` instead of returning partial
results. The default 66-year Saturn scan fits this budget. This bounds sample
count, not execution time or accuracy outside reference coverage. Sampling can
miss crossings between steps; it is not a completeness guarantee for arbitrary
bodies and step sizes.

Exact window-boundary roots are included when an adjacent nonzero sample
establishes direction. Exact interior roots require opposite-side neighbors;
zero-length windows, sampled zero plateaus and tangencies return no crossing.

### Resolved instant inputs

`DateInput` values passed to the calculation APIs accept a valid `Date`, a finite
epoch-millisecond timestamp representable by JavaScript `Date`, or these ISO
string forms:

- `YYYY-MM-DD`, interpreted as midnight UTC using the proleptic Gregorian
  calendar. This convenience does not infer a birthplace's local midnight.
- `YYYY-MM-DDTHH:mm[:ss[.sss]]Z`, or the same date-time with an explicit
  `+HH:mm` or `-HH:mm` offset. Fractional seconds, when supplied, have one to
  three digits. ISO expanded years use a sign and six digits, such as
  `-000001-01-01T00:00:00Z`; years `0000`–`0099` are not shifted to 1900–1999.

Invalid calendar dates, rollovers such as February 30 or `24:00`, leap seconds,
unresolved local date-times, locale-specific strings, excessive fractional
precision, non-finite values, and other input types throw `RangeError` before
calculation. Existing `Date` values cannot reveal whether a caller previously
normalized an invalid date; pass the original string when validation is needed.
`Date` and numeric inputs retain JavaScript's millisecond resolution.

`Z`, `+00:00`, and `-00:00` identify the same UTC instant. Results normalize to
`Date` and do not retain the original offset or local-zone provenance; in
particular, [RFC 3339's `-00:00` convention](https://www.rfc-editor.org/rfc/rfc3339#section-4.3)
indicating an unknown local offset is not
preserved. Resolve daylight-saving gaps/folds and historical local-time rules
before calling these APIs. Accepted date syntax is not an accuracy guarantee
outside the documented reference coverage.

Birth settings accept only `houseSystem: "whole" | "placidus"` and a boolean
`timeKnown`. Omitting them defaults to `"whole"` and `true`; explicit `null`
and other unsupported values throw `RangeError`, including when coordinates
are absent. Latitude and longitude must be supplied together as finite numbers
within `[-90, 90]` and `[-180, 180]` respectively.

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
