# Offline geocode workbench

This private project is being developed separately from `@zodiacs/engine`.
It will provide offline place lookup, IANA civil-time resolution, a CLI and
an optional HTTP service. [PLAN.md](PLAN.md) tracks implementation. The
current milestone provides the place-data contract, an attributed GeoNames
sample and an offline index builder. Lookup, timezone resolution, the
`geocode` CLI and the service are not implemented yet.

## Development

Use Node.js as declared in this folder's `package.json` and Python 3 for the
source acquisition scripts and their offline subprocess tests, then run:

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

## Build a local place index

The place source is the GeoNames downloadable gazetteer. Its current
dump format includes IANA zone identifiers and distinguishes elevation from
DEM estimates. [The official dump readme](https://download.geonames.org/export/dump/readme.txt)
describes those fields. Attribution and data terms are recorded in
[LICENSING.md](LICENSING.md) and [NOTICE](NOTICE). The
[sample receipt](data/sample-receipt.json) binds selected unchanged rows to
upstream archives, member digests and retrieval times. It includes ambiguous
names, polar places and cities with IDs matching the atlas.
[tests/sample.test.ts](tests/sample.test.ts) checks every copied field
against these input rows; it does not claim geographic accuracy.

From `geocode/`, rebuild the sample without network access:

```sh
python3 scripts/select-sample.py --check
npm run index:build -- --sample --out generated/sample
```

Every output directory must be new. Choose another name for a later build.
`--sample` verifies local input hashes against the committed receipt. The
generated manifest's hashes describe selected local inputs; the receipt
separately records the full upstream inputs and exact selection.

Download the worldwide `cities15000` extract and build a larger index:

```sh
python3 scripts/download-inputs.py --out downloads/world-snapshot
npm run index:build -- --downloaded downloads/world-snapshot --out generated/world
```

The downloader uses public GeoNames HTTPS files and Python's standard
library. It reads bounded archives in memory and stores uncompressed place
bytes as small numbered parts, alongside metadata and `sources.json`.
It never persists a full ZIP or a full extracted place file. The builder
verifies the concatenated parts against the archive-member digest and both
metadata inputs against their raw file digests. The builder itself makes no
network requests. Daily sources can change between downloads; keep the
matching source directory and receipt together. Digests identify bytes, not
the authenticity of geographic facts.

`cities15000` is a city extract, not all inhabited places. The sample adds
Waitangi and McMurdo Station from country dumps. The downloader also accepts
`--places-archive cities500.zip` or a country filename such as `NZ.zip`.
It refuses compressed or uncompressed sources beyond its in-memory bound.
For a larger input obtained separately, the builder accepts a local text
file or a directory of contiguous `part-000000.tsv`, `part-000001.tsv`, and
subsequent parts:

```sh
npm run index:build -- --places downloads/local-parts \
  --places-url https://download.geonames.org/export/dump/allCountries.zip \
  --countries downloads/countryInfo.txt --admin1 downloads/admin1CodesASCII.txt \
  --out generated/local
```

Optional `--places-sha256`, `--countries-sha256` and `--admin1-sha256` pin
these raw inputs. A parts digest covers their ordered concatenation, not a
ZIP. Preserve original bytes when splitting, including line endings. Keep
full inputs in ignored `downloads/`, split into small parts, and indexes in
ignored `generated/`. Only the attributed sample belongs in source control.

The builder selects feature class `P`, retains source IDs, coordinates,
population, elevation, DEM and timezone spelling, and joins country and
region labels. Missing region labels remain null with their code retained;
missing country labels are errors. Elevation and DEM stay separate. Numeric
source sentinels remain numeric, without an invented replacement height.
Blank optional fields become null. Zone labels do not determine offsets at
build time.

Real source data contains edge whitespace and a control-bearing alias.
The builder trims label edges, omits empty or control-bearing aliases,
deduplicates aliases and sorts by JavaScript code-unit order. Manifest
`transformations` counts each trimmed label occurrence, omitted alias token
and duplicate alias token. Retained labels and aliases must pass the dataset
contract. Numeric fields require decimal syntax and safe integers where
appropriate. Invalid retained rows fail with a field or line description
without echoing submitted content. Non-place rows receive structural, ID and
feature checks before exclusion. Unused country metadata is not interpreted.

Each shard is a complete `PlaceDataset`. `manifest.json` lists row counts,
byte sizes and SHA-256 hashes, and is written last. Rows retain source order.
Identical input bytes, source filenames, source URLs and shard settings yield
identical output bytes, independent of parent directory paths and clock time.
Source filenames are retained in provenance, so renaming an input changes
the output. Inputs are hashed again during
parsing to detect changes during a build. Memory holds label maps, seen IDs
and a shard, rather than the full place dump. Failed builds remove only their
newly created output directory; existing directories are refused.

`src/build-index.ts` exports Node-only `buildGeoNamesIndex` separately from
the pure library entry. Its command compiles into ignored `.cache/tools/`.
Byte limits and validation are exercised by
[tests/build-index.test.ts](tests/build-index.test.ts). Validation of
untrusted or mixed indexes and stronger publication guarantees remain later
milestones; consuming an incomplete directory is not supported.

To check or deliberately refresh the committed sample:

```sh
python3 scripts/select-sample.py --check-upstream
python3 scripts/select-sample.py --check-upstream --source-dir downloads/pinned-inputs
python3 scripts/select-sample.py --refresh
```

The first command requires today's upstream bytes to match the pinned hashes
and fails if they have changed. The second reads saved original archives and
text files. `--refresh` deliberately replaces the sample and receipt with a
new daily snapshot; review and test that change before committing it.
Selection preserves complete row bytes and sorts rows by source identifier.

## Timezone design

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
