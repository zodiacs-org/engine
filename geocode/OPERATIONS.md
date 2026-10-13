# Operating the offline geocode workbench

This folder is a private source-checkout project, outside the engine's npm
package. Keep this repository's `geocode/`, `atlas/` and `src/` together.
Use the Node runtime declared in [package.json](package.json), and Python for
place acquisition and sample checks. The library performs no chart math.

## Start with the committed sample

From the repository root:

```sh
cd geocode
npm ci --ignore-scripts --cache .cache/npm
python3 scripts/select-sample.py --check
npm run index:build -- --sample --out generated/quickstart
node examples/run.mjs generated/quickstart
```

Use a new output name on another build. The builder refuses an existing
destination. The sample is an attributed selection, not a worldwide place
database. All example place/date/time combinations are invented and describe
no person's birth. The example prints resolved results and typed engine input
where its application policy allows a handoff; it does not calculate charts.
See [the handoff contract](README.md#prepare-input-for-the-engine).

Keep the generated index immutable. Load its whole build directory rather
than one shard to preserve ambiguity across the selected extract. File
digests verify consistency with the manifest, not geographic authenticity.
The loader and lookup keep a snapshot in memory. There is no automatic
refresh, total-memory guarantee for arbitrary dumps, or network fallback.

## Choose places explicitly

These commands use the sample built above:

```sh
node bin/geocode.mjs lookup "Springfield" --index generated/quickstart
node bin/geocode.mjs lookup "Springfield" --country US --region IL --index generated/quickstart
node bin/geocode.mjs tz --place-id geonames:4250542 --date 2000-01-01 --index generated/quickstart
node bin/geocode.mjs tz "Paris, FR" --date 1905-06-01 --time 12:00 --index generated/quickstart
```

The ambiguous lookup intentionally exits with the documented nonzero outcome
status while printing its JSON answer. Avoid a blanket shell `set -e` for a
sequence that deliberately includes unresolved results. Inspect candidates
and choose the intended source ID or refine exact country/region filters.
Do not select the first suggestion merely because it has the largest
population. A unique match is unique only in this dataset.

The date-only command selects a place without asserting an offset, UTC
instant, historical coverage or default birth time. A timed command accepts
a Gregorian date and a local clock reading. Check outer `status`, then
`time.status`, uncertainty, citations and provider metadata. See
[CLI output and exit statuses](README.md#command-line-lookup-and-time-resolution).

For library use, load files explicitly with `loadPlaceIndex`, load the atlas
explicitly with `loadAtlasTimeProvider`, then pass both to `createGeocoder`.
Reuse that geocoder for lookup and resolution. The separate Node loaders
do filesystem I/O; the main library's factories do no file or network I/O.
The [API examples](README.md#composed-place-and-civil-time-requests) show
the source imports and result contract.

## Serve the same local index

In a separate terminal, from `geocode/`:

```sh
node bin/server.mjs --index generated/quickstart
```

The startup JSON reports the loopback address and assigned port. In your
client terminal, set `GEOCODE_SERVICE` to that reported origin, then send
invented requests:

```sh
curl --get "$GEOCODE_SERVICE/lookup" --data-urlencode 'query=Springfield' --data-urlencode 'country=US' --data-urlencode 'region=IL'
curl "$GEOCODE_SERVICE/tz" --header 'Content-Type: application/json' --data '{"query":"Paris, FR","date":"1905-06-01","time":"12:00"}'
```

Normal outcomes preserve the complete library answer, including ambiguous
places, date-only input, unavailable zones, gaps, folds and atlas uncertainty.
Transport success is not place selection or historical certainty. Dates in
JSON responses serialize as ISO strings. Admission is per client IP and
per process; clients behind the same address share a rate bucket.

Read [service options, limits and errors](README.md#optional-local-http-service)
before configuring a binding or proxy. Forwarded addresses are ignored by
default. Only configure exact trusted proxy IPs that you control and that
maintain the real peer's forwarding chain. Send `SIGINT` or `SIGTERM` to the
launcher to shut down through its existing lifecycle. For index refresh,
build to another name, validate it and restart with that index.

## Acquire a wider place extract

From `geocode/`, using new directory names:

```sh
python3 scripts/download-inputs.py --out downloads/world-snapshot
npm run index:build -- --downloaded downloads/world-snapshot --out generated/world
node bin/geocode.mjs lookup "Tokyo, JP" --index generated/world
```

Acquisition is an explicit network operation against public GeoNames HTTPS
downloads. Lookup, resolution, CLI and service never download missing places.
The default city extract is not all inhabited places; smaller settlements
and stations can be absent. The builder also accepts supported country
extracts and separately obtained split inputs, as documented in
[rebuild instructions](README.md#build-a-local-place-index).

Keep full sources in ignored `downloads/` and indexes in ignored `generated/`.
Keep receipts with their source directories: GeoNames updates daily, so a
later download may have different bytes. Preserve the selected shard
manifest, source receipts and runtime/provider metadata when reproducing an
answer. Publish an index directory only as a complete immutable generation.
For interrupted-build recovery, follow the README's staging and lock rules;
never remove a lock while its writer is active.

## Preserve time and data provenance

The [existing atlas](../atlas/README.md) decides covered GeoNames IDs within
its manifest's civil window. The adapter delegates its rules and resolution;
it does not infer coverage from a country name or nearby coordinates.
The atlas's comparison IANA zone is not a historical boundary claim.
Covered uncertainty, clock refusals and provider failures do not authorize
substituting a tzdb result.

Elsewhere the engine resolves the source-assigned zone using its pinned
histories and host Intl data. Missing assignments or unsupported zones
remain unavailable. The resolver does not infer offsets from longitude,
substitute a nearby city, or use GeoNames' current offset summary tables.
A modern assignment can misdescribe historical boundaries. Old histories
and host versions have documented limits; retain `timeZoneRole`,
`atlasFallback` and native provider metadata. See
[civil-time adapters](README.md#civil-time-adapters) and
[independent reference limits](evidence/M9.md).

Redistributing derived place records requires GeoNames attribution, its
license link and a description of changes. Covered atlas answers additionally
require atlas attribution, rule IDs and versions, and retained citations.
Keep [NOTICE](NOTICE), [LICENSING.md](LICENSING.md), the data receipts and
the answer's provenance with redistributed data. This project's code is
MIT; that does not replace the place data and atlas attribution terms.
The library validates recorded claims; it does not authenticate licenses.

## Keep queries private

Use invented queries in examples, tests and public issue reports. Do not
store names, birth records, credentials or API keys in this checkout. The
CLI and service write no request log or result file; CLI and example stdout
contain the answer and original civil input. Redirecting them persists that
information. Place results retain source identifiers and are not anonymous.

The service keeps client addresses temporarily in memory for admission and
does not return them. Its response headers request no caching. A browser,
shell history, client, reverse proxy or observability tool can still retain
queries and results. In particular, lookup text appears in a GET URL. The
tiny server has no authentication or TLS layer. Its loopback default is
appropriate for local use; wider deployment needs the application's access
control, transport encryption and deliberate logging/retention policy.
Do not interpret lack of a built-in request log as an end-to-end privacy
guarantee.

## Verify a local setup

```sh
npm run check
python3 scripts/select-sample.py --check
```

The independent timezone tests need the additional tools documented under
[development](README.md#development). They may download pinned IANA archives
on their first run; later reconstruction uses those verified cached inputs.
The sample builder and example need no such download. This session's example
and full project checks are recorded in [M11 evidence](evidence/M11.md).
Run `node evidence/check-m11-operations.mjs` to rebuild a temporary sample,
exercise the documented CLI commands and check the HTTP request fields on
loopback. It uses no external service and removes its generated sample.
The completed [final acceptance record](evidence/M12.md) documents the import
and offline-operation review, package exclusion and remaining limitations.
Run `node evidence/check-m12-imports.mjs` for the separate import-audit report.
Root package budget and built-engine gates still require the repository's
normal CI build, which this workbench task does not create.
