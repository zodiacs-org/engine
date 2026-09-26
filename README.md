# @zodiacs/engine

Pure TypeScript astrology calculations for browsers and Node.js. The package
computes tropical planetary positions, natal charts, transit snapshots,
synastry, Moon phase, and Saturn-return seasons. It is synchronous and
ESM-only, has no import-time side effects, and performs no network request from
its core entry point. Its one runtime side effect is the ΔT it installs in
astronomy-engine (see ΔT below).

**Release candidate: 0.1.1-rc.10.** Public npm lookups for this package returned
404 on 2026-09-26. The expansion release remains held for review and operator
publication authority. Install the exact candidate tarball supplied with the
review, retaining its SHA-256 receipt:

```sh
pnpm add ./zodiacs-engine-0.1.1-rc.10.tgz
```

From a source checkout, run `npm ci` and `npm run build`, then
`npm pack --ignore-scripts`. Test the packed file in a clean consumer using
`npm run consumer:smoke -- /absolute/path/to/zodiacs-engine-0.1.1-rc.10.tgz`.
The smoke check
downloads the artifact's public dependencies and TypeScript 5.9.3; its output
records the artifact hash, runtime and isolated consumer directory. A packed
candidate is not a published release. This candidate adds Equal houses from the midheaven, and `chartPoints`: the mean node, Black Moon Lilith, the Vertex, the East Point and the Hellenistic lots; rc.9 before it added nine house systems, for twelve; rc.8 computed on observed ΔT with a band, named its ephemeris and ΔT in receipts, flagged charts outside the reference span, and shipped the site's longitude-crossing solver as `@zodiacs/engine/crossings`; rc.7 judged aspects applying from the orb's rate, took speeds as the derivative of the reported longitude, built the angles on the true obliquity, put the Placidus limit at the polar circle and added Porphyry houses. CHANGELOG.md says what each change moves. The site platform draft retains its immutable rc.5 archive, and the standalone starter retains rc.3, until their separate integrations are reviewed.

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
  angles and houses in any of thirteen systems (see *House systems*).
- `chartPoints(natal)` returns the mean node, Black Moon Lilith and, with a
  birth time and place, the Vertex, the East Point, the chart's sect and seven
  lots (see *Points*).
- `transits(natal, date)` returns a sky snapshot and moving-to-natal aspects.
- `synastry(a, b)` returns inter-chart aspects and element/modality balances.
- `moonPhase(date)` returns elongation, illuminated fraction, and phase name.
- `saturnReturn(birth)` returns exact-pass seasons through roughly age 92.
- `findLongitudeCrossings(body, longitude, from, to)` returns the instants a
  body crosses a longitude, and `searchLongitudeCrossings` does the same under
  a sample budget. `@zodiacs/engine/crossings` provides the same solver for a
  longitude function of your own, without the ephemeris.
- `@zodiacs/engine/geo` provides IANA local-time resolution and a client for a
  separately hosted, sharded GeoNames index.

Returned longitudes use degrees in `[0, 360)` and positions include sign and degree
annotations. Charts use the tropical ecliptic of date. Planetary positions are
geocentric and corrected for light time and aberration, but not for the Sun's
gravitational deflection; the Moon's series carries neither correction. This
package does not calculate topocentric parallax.

Positions have been compared with an independent ephemeris from 1800-01-01T00:00Z
up to 2200-01-01T00:00Z, exported as `REFERENCE_SPAN`. A chart outside that span
is still computed, and carries the `outside-reference-span` flag.

### House systems

`houseSystem` takes one of thirteen systems. Each is the definition Swiss
Ephemeris uses, and every one agrees with Swiss's `swe_houses_armc` to within
0.0001″ given the same sidereal time, latitude and obliquity (Placidus, which
iterates, to 0.01″).

| `houseSystem` | System | Cusps |
| --- | --- | --- |
| `"whole"` | Whole sign | Each sign is a house, the first the ascendant's. The default. |
| `"placidus"` | Placidus | Semi-arcs of each degree in thirds. |
| `"koch"` | Koch | Ascendants at thirds of the midheaven degree's semi-arc. |
| `"porphyry"` | Porphyry | Each quadrant between the angles in three equal arcs of longitude. |
| `"regiomontanus"` | Regiomontanus | Circles through the horizon's north and south points, every 30° of the equator. |
| `"campanus"` | Campanus | The same circles, every 30° of the prime vertical. |
| `"topocentric"` | Topocentric (Polich–Page) | Regiomontanus's ascensions, with pole heights at a third and two thirds of the latitude's tangent. |
| `"alcabitius"` | Alcabitius | The ascendant's semi-arcs in thirds on the equator, along hour circles. |
| `"equal"` | Equal | 30° each from the ascendant. |
| `"equal-mc"` | Equal from the midheaven | 30° each, the 10th from the midheaven; the same at every latitude. |
| `"vehlow"` | Vehlow | 30° each, with the ascendant in the middle of the first. |
| `"meridian"` | Meridian (axial rotation) | Right ascensions every 30° from the midheaven's; the 1st cusp is the equatorial ascendant. |
| `"morinus"` | Morinus | The equator every 30° from the midheaven's right ascension, carried to the ecliptic through its poles. |

Placidus and Koch are undefined in polar regions, where |latitude| ≥ 90° − ε,
with ε the true obliquity of date (about 66.56° today). There the engine falls
back to whole-sign houses, exported as `POLAR_FALLBACK` (and, as before,
`PLACIDUS_POLAR_FALLBACK`), and adds `polar-fallback` to the chart flags. Swiss
Ephemeris falls back to Porphyry instead. Every other system is defined at
every latitude where the angles are. Inside the polar circle, where the
ascendant is taken on the eastern half of the horizon, Regiomontanus, Campanus
and Topocentric cusps turn with it, so their 10th cusp is then the lower
meridian, as in Swiss Ephemeris. When the birth time is unknown, pass a
conventional UTC instant with `timeKnown: false`; angles and houses remain
absent and the chart carries the `no-time` flag.

### Points

`chartPoints(natal)` takes a birth or a chart and returns `{ sect, points }`.
Each point has a longitude, a latitude, a sign and a degree, like a body.

| Point | Definition |
| --- | --- |
| Mean Node, Mean South Node | The Moon's mean ascending node Ω, and its opposite. |
| Black Moon Lilith | The mean lunar apogee: the point of the mean orbit 180° from the mean perigee, with the orbit's latitude. |
| Vertex | Where the prime vertical meets the ecliptic in the west. |
| East Point | The equatorial ascendant: the ecliptic point at right ascension RAMC + 90°. |
| Lots of Fortune, Spirit, Eros, Necessity, Courage, Victory and Nemesis | Paulus Alexandrinus's seven lots, reversed by night. |

The mean node and Black Moon Lilith come from the Moon's mean elements: the
IERS Conventions' fundamental arguments (Simon et al. 1994), with a mean
inclination of 5.1453964°. The nutation in longitude puts them on the true
equinox of date, like every other longitude here. They are within 0.7″ of Swiss
Ephemeris's `SE_MEAN_NODE` and `SE_MEAN_APOG` from 1800 to 2199. Both carry a
speed in degrees per day.

Every chart gets those three. The Vertex, the East Point, the sect and the
lots need a birth time and place.

- The Vertex and the East Point come from the instant and the place, not from a
  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,
  they agree with its `swe_houses_armc` to within 0.00001″.
- The sect is day when the Sun is between the descendant and the ascendant
  through the midheaven.
- The lots use the chart's own ascendant and bodies. Each is the ascendant plus
  the arc between two points, taken as Paulus gives it by day and reversed by
  night. Ptolemy's Fortune, which does not reverse, is `asc + moon − sun`.

`antiscion`, `contraAntiscion` and `midpoint` work on any two longitudes.
`meanNodeLongitude`, `meanApogee`, `lunarMeanArguments`, `hellenisticLots` and
`sectOf` expose the calculations underneath. The osculating ("true") Lilith is
not offered: from astronomy-engine's lunar series it would be several
arcminutes from Swiss's.

### Input flag compatibility

Public birth inputs accept all six `ChartFlag` values. Supply an array with at
most 64 entries; entries must be known string values in ordinary data slots.
Repeated values collapse in first-occurrence order. Unknown strings, sparse
slots, accessor slots, non-array iterables and simultaneous `dst-gap`/`dst-fold`
claims reject with a `RangeError` that does not include supplied flag values.

`dst-gap`, `dst-fold` and `lmt` remain caller assertions: a UTC instant alone
cannot verify a historical local-time resolution. `no-time`,
`polar-fallback` and `outside-reference-span` may be echoed for compatibility,
but must agree with the calculation. Set `timeKnown: false` for unknown time; a flag never overrides that
setting. A fallback assertion requires the actual requested Placidus calculation
to produce whole-sign houses, including fallback caused by nonconvergence.

`natalChart` stores only distinct time-resolution assertions in `chart.input.flags`
and derives result flags once. This is canonical semantic input, not a lossless
record of the submitted flag array. Correct derived echoes therefore work with
the existing draft receipt creator and replay; the receipt schema is unchanged.

When `transits`, `synastry` or `saturnReturn` receive a precomputed `Chart`, they
check flag consistency with its supplied time/settings and house/angle presence.
Contradictory or missing result claims reject. They do not recompute or verify
the supplied astronomical result. An already canonical Chart retains object
identity; compatible duplicate/derived echoes produce a shallow metadata copy,
preserving numerical arrays and engine version. These checks happen at call
time and do not freeze caller-owned objects.

Ordinary Saturn-return inputs require no extra natal calculation. A raw birth
input that explicitly asserts `polar-fallback` requires one natal calculation to
check that assertion before the return scan. A supplied Chart instead receives
the consistency check above, without natal recomputation. Public birth and
`resolveBirth` settings are validated once and the captured scalar values are
used for calculation/resolution. Explicit null settings or local time are
invalid. These boundaries do not sandbox same-realm getters, proxies or other
caller-supplied executable code. The unsupported `/internal` computation API is
unchanged.

The shared engine selects the eastern horizon intersection before assembling
houses, including in either polar hemisphere. At exact geographic poles no
point physically rises; at ecliptic/horizon coincidence an ascendant is not
unique. Those degenerate configurations are outside the verified angle scope.
Near tangencies the selected axis can change by 180 degrees. Placidus uses a
bounded iteration and falls back if it cannot converge; it never returns the
last unconverged iterate as a successful construction.

See [CHANGELOG.md](CHANGELOG.md) for candidate changes. Reference coverage and
known limits are recorded in the site [platform evidence ledger](https://github.com/zodiacs-org/site/blob/codex/platform-stage-a/docs/platform/EVIDENCE.md).
The date parser's representable range is not a claim of astronomical accuracy
across that range. Reference cases are finite; broader numerical scope review
remains a release gate.

### Longitude crossings

`findLongitudeCrossings(body, longitude, from, to, stepDays = 5)` returns every
instant in the half-open window (from, to] when `body` is exactly at
`longitude`, in time order, each marked `retrograde` when the body was moving
backward through it. A root exactly at `from` belongs to the window that ends
there and is not returned; a root exactly at `to` is. There is no sample
budget, and the call does not throw for the size of a search: its work grows
with (to − from) / step.

`searchLongitudeCrossings(body, longitude, from, to, { stepDays, maxSamples })`
makes the same search under a budget of ephemeris evaluations, root
refinements included. It returns `{ status: "complete", crossings, samples }`,
or `{ status: "refused", reason: "sample-budget", samples, maxSamples,
crossings: [] }`. It refuses before any sampling when the coarse scan alone
needs more than `maxSamples`, and otherwise when a refinement would pass the
budget. It never returns part of a result and never throws for the budget.
Without `maxSamples` there is no limit.

Both run the one solver, exported by `@zodiacs/engine/crossings` as
`findLongitudeCrossingsWith(longitudeAt, body, longitude, from, to, stepDays)`
and `searchLongitudeCrossingsWith(longitudeAt, body, longitude, from, to,
options)`. It takes the longitude function as its first argument and imports
no ephemeris, so that entry point carries none; the root entry point exports
the same two functions.

The solver samples `from`, every `stepDays` after it and `to`, and bisects each
sign change of the offset from the target 24 times, to the step divided by
2^24: 25.7 ms at 5 days, 1.3 ms at a quarter day. A sample exactly on the
target is returned once, at that sample, with the direction of the sample
before it; a sampled plateau on the target is returned where it begins.
Offsets of 90° or more on either side of a step are the far side of the circle,
not a crossing.

A fixed step alone loses both crossings when a station falls between two
samples just past the target: at 5 days, a Saturn station within 0.0103° of
it, or a Jupiter station within 0.0205°. Wherever the sampled motion turns
without the offset changing sign, and the turning sample is within reach of the
local curvature, the solver finds the extremum by golden-section search. It
bisects both crossings when the extremum passes the target, and returns one,
as direct, when it only touches. A turn in the first or last step is found by
a probe one minute inside the window, and no sample falls outside [from, to].
Crossings less than a second apart are returned once. The solver assumes
smooth motion with at most one station in two steps. That holds for the Sun,
the Moon and the planets at the steps the site scans with, from a quarter day
for the Moon to 5 days for Saturn to Pluto, but not for the wobbling true
node. It is tested on synthetic and real stations, not proven complete.

Invalid input throws `RangeError` before any sampling: an invalid `Date`,
`from` after `to`, a non-finite longitude, a step that is not positive or is
shorter than a millisecond, or a `maxSamples` that is not a positive integer or
`Infinity`. A non-finite longitude from the ephemeris throws `RangeError` too.

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

Birth settings accept only a `houseSystem` from the twelve above and
a boolean `timeKnown`. Omitting them defaults to `"whole"` and `true`; explicit
`null` and other unsupported values throw `RangeError`, including when
coordinates are absent. Latitude and longitude must be supplied together as finite numbers
within `[-90, 90]` and `[-180, 180]` respectively.

## ΔT

Positions are computed in Terrestrial Time, and a birth time is Universal
Time, so every chart needs ΔT = TT − UT1. From 0.1.1-rc.8 the engine uses its
own model, `zodiacs-deltat/1`, in place of astronomy-engine's 2004
polynomial, which was 6.3 s off the observed value in 2026 and 110 s off
Swiss Ephemeris's prediction for 2100:

- up to 1941, the reconstruction of Stephenson, Morrison & Hohenkerk 2016
  (their Table S15, CC BY 4.0);
- from 1941, observed values from USNO and IERS, then Bulletin A's
  predictions, then a damped extrapolation;
- a 1-σ band: 0.03 s where observed, growing with the years since the last
  observation (about 12 s by 2050 and 42 s by 2100), and an estimate rather
  than a calibrated band before 1620.

It is within 0.031 s of IERS on twelve dated values from 1962 to 2026 and
within 0.084 s on every IERS day since 1962. Each chart reports the value it
used as `chart.deltaT`: `{ seconds, sigma, model, table, tableDigest,
segment }`. The table is part of the release (`DELTA_T_TABLE`, IERS data of
2026-09-24) and changes only with a new release. `@zodiacs/engine/deltat`
exports the model with no dependencies.

The instant is read as UT1: UTC is taken as UT1, as Swiss Ephemeris's
`calc_ut` does; UT1 − UTC stays under 0.9 s. To fix ΔT yourself, pass
`deltaT` (seconds) in a birth input; the chart reports `model: "pinned"`.

astronomy-engine keeps one ΔT for its whole module. Every engine call
installs the engine's model first, so after any call astronomy-engine carries
it. Code that calls astronomy-engine directly should install it too:
`SetDeltaTFunction(deltaT)` with `deltaT` from `@zodiacs/engine/deltat`.

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

## GeoNames request recovery

The optional geo client shares in-flight requests and keeps validated
index/shards. A rejected fetch, unsuccessful HTTP response or JSON parsing
failure is returned to current callers with its original rejection reason. A
later explicit preload/search call may retry the failed resource. There is no
automatic retry loop, backoff or per-caller cancellation API. A custom fetch may
bind its own abort signal; the client does not reset that signal.

Parseable JSON must match the compact v1 asset format: index string tables and
`0`/`a`–`z` shard keys, with eight-field city rows containing valid table indices,
integer coordinates in hundredths of a degree (including ±90°/±180°), and
nonnegative integer populations. An invalid index or shard rejects with
`TypeError("Invalid GeoNames index data.")` or
`TypeError("Invalid GeoNames shard data.")` and is evicted for a later explicit
retry. The entire requested shard is checked before returning any results;
other successful caches remain available. Empty region/country labels and
Unicode names are retained. Timezone identifiers are checked as nonempty strings,
without requiring support in the current host's timezone database. Validation
does not authenticate place facts, check that the advertised count equals all
shards, or refresh a previously valid index when a shard changes independently.
In-range indices in a shard from another dataset generation can silently select
the wrong cached country or timezone; this v1 format has no content or generation
identity to detect that mismatch. Serve matching index/shards together.
`preload()` returns metadata snapshots: its arrays do not expose mutable cache
state.

These checks apply to parsed JSON data. A custom fetch implementation is trusted
code, not a sandbox: accessors or iterators it supplies in non-JSON objects may
execute during validation.

## Draft natal receipts and local portability

The optional `@zodiacs/engine/receipt` entry point is a Zodiacs draft for one
natal-chart envelope. It preserves full numerical precision and separates a
requested house system from the actual computed system. It does not calculate
an ephemeris, fetch an imported URL, execute extensions, save a profile or change
account sync v1. A valid envelope is a structurally checked claim, not an
attestation that its positions or provenance are authentic.

```ts
import { natalChart } from "@zodiacs/engine";
import {
  createNatalEnvelope,
  serializeNatalEnvelope,
  parseNatalEnvelope,
  natalReplayInput,
  redactNatalEnvelope
} from "@zodiacs/engine/receipt";

const chart = natalChart({
  utc: "2001-12-21T09:00:00Z",
  latitude: 78.2232,
  longitude: 15.6267,
  houseSystem: "placidus"
});
const encoded = serializeNatalEnvelope(createNatalEnvelope(chart));
const decoded = parseNatalEnvelope(encoded);
if (decoded.ok) {
  // Replay still requests Placidus even though this result used whole-sign.
  const replay = natalChart(natalReplayInput(decoded.envelope));
  console.log(replay.houses?.system);
  console.log(redactNatalEnvelope(decoded.envelope));
}
```

Capture original time-resolution and package/runtime facts while they are
available. Unknown birth time does not establish a noon convention: an explicit
08:30 reference remains 08:30, while unavailable historical context remains
unavailable. Imported package hashes and version strings are untrusted claims.
Pass the original validated ISO string as `sourceInstant` when available;
normalization alone cannot recover its original offset spelling. Captured local
resolution is checked arithmetically, without consulting the current timezone
database or authenticating the historical claim.

Receipts from 0.1.1-rc.8 on name the ephemeris that computed them, as
`receipt.engine.ephemeris` (`{ name: "astronomy-engine", version: "2.1.19" }`,
exported as `EPHEMERIS`); the dependency is pinned to that exact version, and
a current receipt without it is refused. Their conventions say what the
positions are corrected for (`aberrated-geocentric-ecliptic-of-date;no-deflection`)
and that the Moon has neither correction. Receipts from rc.3 to rc.7 are still
read, each under the conventions its engine recorded, and a set is accepted
only from the engine versions that wrote it.

`natalReplayInput` recovers the recorded request. It does not select or install
the original engine. Recalculation with another engine, ephemeris dependency or
runtime may differ; verify trusted artifact identity and runtime provenance
before claiming reproducible results. A matching imported version label alone
is insufficient. Displaying the stored result does not require recalculation.

The redacted diagnostic uses fixed fields; it does not copy birth details,
numerical positions, arbitrary metadata, extensions, raw parser errors or
stable hashes. Redacted does not mean anonymous.

Imports are limited to one chart and 64 KiB of UTF-8 JSON, with bounded depth,
node count and data arrays. Unknown required features or schema versions are
rejected explicitly. Optional data belongs in bounded extensions and is never
executed or rendered by this codec. Keep encrypted account payloads and legacy
positions-only links in their existing formats until an explicit adapter and
safe downgrade policy are reviewed. Do not infer a legacy user's requested
house system from a stored fallback result.
