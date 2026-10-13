# Geocode licensing and provenance

Code, documentation and invented fixtures authored in this folder are MIT,
under the repository's [LICENSE](../LICENSE). This folder is outside the
engine's npm package. Its private manifest declares `MIT AND CC-BY-4.0`
because this folder also contains the GeoNames sample described below.

The source-checkout CLI uses the MIT-licensed `tsx` package from this folder's
locked runtime dependencies. Dependency code and its license notices remain
in the installed dependency tree; none is copied into authored sources or
the engine package.

## GeoNames sample and generated indexes

The official [GeoNames dump readme](https://download.geonames.org/export/dump/readme.txt),
read for this milestone, identifies its downloadable extracts as Creative
Commons Attribution 4.0 International (CC BY 4.0). The
[GeoNames export page](https://www.geonames.org/export/) permits commercial
use with credit to GeoNames. The
[license text](https://creativecommons.org/licenses/by/4.0/)
sets the attribution requirements.

The committed sample contains selected complete rows from `cities15000.zip`,
`NZ.zip`, `AQ.zip`, `admin1CodesASCII.txt` and `countryInfo.txt`. The rows
were selected and sorted without editing their field values or line endings.
[data/sample-receipt.json](data/sample-receipt.json) records the source URLs,
retrieval times, archive and member digests, selected keys, output digests and
the digest of the source's licensing statement. The selector can check the
local sample offline or compare its rows with the pinned upstream inputs;
see [README.md](README.md#build-a-local-place-index).

The sample and rebuilt indexes retain attribution to GeoNames, source links,
a license link and a description of the changes. [NOTICE](NOTICE) accompanies
the sample. Each generated shard and its manifest carry the builder's source
receipts and attribution. The builder selects populated places, joins country
and region labels, trims label edges, omits empty or control-bearing aliases,
deduplicates and sorts aliases, and encodes the selected fields as JSON.
Its manifest records these label and alias transformations. It preserves
source coordinates, timezone spelling, and separate elevation and DEM fields.
Neither the builder nor the sample selector computes a timezone offset.

Attribution for derived place records includes:

> Contains geographical data from GeoNames (https://www.geonames.org/),
> licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
> Records selected and transformed into this project's index format.

The data license applies to derived place records independently of the MIT
license for the builder and library. Redistributed samples and indexes must
keep their attribution and description of changes. Full source downloads and
generated indexes stay in ignored folders. A `license` field that passes
schema validation is a recorded claim, not independent verification of
permission or attribution completeness. The tests in
[tests/sample.test.ts](tests/sample.test.ts) check the local receipts and
field preservation, not the accuracy of upstream geographic facts.

## Timezone source

The adapters reuse the existing atlas with precedence for its covered
places and dates, then the engine's IANA timezone handling elsewhere. Atlas
data and documentation are CC BY 4.0; its tools are MIT, as recorded in
[atlas/LICENSING.md](../atlas/LICENSING.md). Atlas results retain the manifest's
version and license, atlas and GeoNames attribution, rule identifiers,
citations and uncertainty. Retain that provenance when redistributing
answers derived from the atlas. No atlas data or resolver code is copied here.

The engine's [licensing record](../LICENSING.md#geonames-and-timezone-data)
documents its public-domain tzdb histories and its use of host Intl/ICU.
The adapter retains the actual provider's metadata. Tests read selected
independent IANA vectors from the existing CC0 conformance suite without
copying or changing them. The broader evidence tests also reuse that suite's
independent arbiter to compile pinned IANA inputs and generate selected
synthetic reference queries under ignored `generated/`. Downloaded release
archives remain under ignored `downloads/`; compiled files remain under
ignored `.cache/` and are removed after each run. No new timezone dataset is
committed or used by the library. The verified release's LICENSE places its
timezone data in the public domain. It identifies `date.c`, `newstrftime.3`
and `strftime.c` as containing BSD material under BSD 3-Clause; the evidence
tool compiles `strftime.c` as part of zdump. Those files retain their notices
in the ignored source archives and temporary build tree and are not
redistributed here. [evidence/M9.md](evidence/M9.md) describes
these test-only references and a recorded difference between compilation
recipes. GeoNames timezone offset summary tables are not used to compute
historical offsets.

No Swiss Ephemeris code, binaries, tables, fixtures or per-case output,
proprietary atlases, paid geocoding APIs, or personal birth records are part
of this project.
