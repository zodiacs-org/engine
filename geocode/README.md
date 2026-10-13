# Offline geocode workbench

This private project is being developed separately from `@zodiacs/engine`.
It will provide offline place lookup, IANA civil-time resolution, a CLI and
an optional HTTP service. [PLAN.md](PLAN.md) tracks implementation. The
current milestone provides the place-data contract and its validation;
lookup, timezone resolution, the place sample, the CLI and the service are
not implemented yet.

## Development

Use Node.js as declared in this folder's `package.json`, then run:

```sh
cd geocode
npm ci --ignore-scripts --cache .cache/npm
npm run check
```

The local TypeScript check emits no files. Vitest runs this project's tests;
dependency installation and test caches stay in this folder when configured
with `npm --cache .cache/npm`. No engine build or root dependency installation
is required. The repository's root configuration and packed files are outside
this project's write scope.

`npm run scope:check` also checks the candidate files for the repository's
size limit and documentation punctuation rule and uses an npm dry run to
check that `geocode/` stays out of the engine package. It does not run the
engine build or replace the full root `package:contents` gate, which needs
an existing root build.

## Current library API

`src/index.ts` exports `parsePlaceDataset`, `DatasetValidationError` and the
TypeScript data types. Pass already parsed JSON to the validator:

```ts
import { parsePlaceDataset } from "./src/index.js";

// jsonText comes from the caller's chosen local data source.
const dataset = parsePlaceDataset(JSON.parse(jsonText));
for (const place of dataset.places) {
  console.log(place.name, place.latitude, place.longitude, place.timeZone);
}
```

This is a TypeScript source entry intended for TypeScript tooling. There is
no generated JavaScript distribution yet. The validator performs no file,
network, clock or timezone-provider access. It returns a detached, deeply
frozen snapshot and throws `DatasetValidationError` for an invalid structure.
Errors name a field without repeating its submitted value. JSON parsing
errors remain the caller's responsibility. This boundary validates JSON-like
data; it does not sandbox JavaScript getters, proxies or other executable
objects.

The format is defined in [src/types.ts](src/types.ts). It retains source
identifiers and attribution, Unicode display names and aliases, country and
region labels, coordinates and source timezone identifiers. Duplicate names
are valid; duplicate identifiers are rejected. Region codes remain opaque
strings so leading zeroes survive; region fields describe the source's first
administrative division. `asciiName` retains the source's transliteration
field but does not require its contents to be ASCII.

Latitude and longitude are WGS84 decimal degrees, north and east positive,
with inclusive geographic boundaries. `elevationMeters` is the source's
elevation above sea level; `demElevationMeters` is the separate terrain-model
estimate. Negative heights and zero are retained. `null` means unknown, for
height, population, region fields or timezone assignment. It never means
sea level, an unpopulated place or UTC. The validator preserves coordinate
precision and does not authenticate geographic facts.

Source timezone identifiers receive a syntax check only. Actual IANA-provider
support belongs to the later timezone adapter, so loading a dataset does not
depend on the host's zone-name support. Raw offset strings are not timezone
identifiers. Source-file digests are provenance claims here; a future loader
will verify the bytes against them.

[tests/dataset.test.ts](tests/dataset.test.ts) exercises these rules with
invented places and malformed variants. These are contract and regression
checks, not measurements of real-world geographic or timezone accuracy.

## Data and timezone design

The planned place source is the GeoNames downloadable gazetteer. Its current
dump format includes IANA zone identifiers and distinguishes elevation from
DEM estimates. [The official dump readme](https://download.geonames.org/export/dump/readme.txt)
describes those fields. Attribution and data terms are recorded in
[LICENSING.md](LICENSING.md). No external place records are included in this
milestone. The sample, its source receipts, the builder and exact rebuild
instructions belong to the next milestone.

Full downloads go in ignored `downloads/`; generated indexes go in ignored
`generated/`. Only a deliberately selected, attributed sample will be
committed. The builder must preserve the original source zone and record
which input bytes produced the index. It must split generated output into
files below the repository's file-size limit.

The owner's scope note requires building on [the atlas](../atlas/README.md)
and [the existing geo API](../api/geo.api.md). Civil-time conversion will use
the atlas resolver first for covered places and dates, matched by source
GeoNames ID, retaining its citations and uncertainty. Elsewhere it will use
the engine's geo resolver and its IANA data. Both will be imported through
relative paths, without copying their time math or modifying their source.
The IANA adapter will omit the geo resolver's longitude option, which can
otherwise substitute birthplace local mean time. Atlas local mean time stays
the atlas resolver's own documented calculation.

Results will retain provider/version metadata, expose skipped and repeated
local times, and require callers to choose among ambiguous places. Covered
atlas uncertainty must not trigger a silent substitution of tzdb results.
A civil date alone does not imply a birth time or a single offset for the
whole day.

A modern place-to-zone assignment is not a historical boundary atlas.
IANA describes the limits of older histories and the distinction between
zones and geographic boundaries in its
[theory documentation](https://www.iana.org/time-zones/theory). Missing place
coverage, especially for small polar settlements or stations, and missing
zone assignments must stay explicit. The project will not infer a zone from
longitude, pick the nearest city as a substitute, or invent an offset.

No chart calculations, paid geocoding APIs, API keys or personal birth records
are needed. All query examples and tests must remain synthetic.
