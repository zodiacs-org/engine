# Geocode licensing and provenance

Code, documentation and invented fixtures authored in this folder are MIT,
under the repository's [LICENSE](../LICENSE). This folder is outside the
engine's npm package. Its manifest is private and currently declares MIT
because this milestone contains no third-party place data.

## Planned GeoNames data

The official [GeoNames dump readme](https://download.geonames.org/export/dump/readme.txt),
read for this milestone, identifies its downloadable extracts as Creative
Commons Attribution 4.0 International (CC BY 4.0). The
[GeoNames export page](https://www.geonames.org/export/) permits commercial
use with credit to GeoNames. The
[license text](https://creativecommons.org/licenses/by/4.0/)
sets the attribution requirements.

The sample and rebuilt indexes must retain attribution to GeoNames, a source
link, a link to the license, and a description of the changes made by the
builder. Source files must be named with their URLs and SHA-256 digests. The
future sample will have its own source receipt and NOTICE; neither its data
nor an attribution for unselected records is fabricated in this milestone.

Expected attribution for derived place records:

> Contains geographical data from GeoNames (https://www.geonames.org/),
> licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
> Records selected and transformed into this project's index format.

The data license applies to derived place records independently of the MIT
license for the builder and library. A `license` field that passes schema
validation is a recorded claim, not independent verification of permission
or attribution completeness. The next milestone must review the actual
downloaded source and update this record and the local manifest as needed.

## Timezone source

The planned adapters reuse the existing atlas with precedence for its covered
places and dates, then the engine's IANA timezone handling elsewhere. Atlas
data and documentation are CC BY 4.0; its tools are MIT, as recorded in
[atlas/LICENSING.md](../atlas/LICENSING.md). Future results must retain its
attribution, rule identifiers, citations and uncertainty. No atlas data or
resolver code is copied here.

The engine's [licensing record](../LICENSING.md#geonames-and-timezone-data)
documents its public-domain tzdb histories and its use of host Intl/ICU.
No additional timezone tables are copied here in this milestone. GeoNames
timezone offset summary tables will not be used to compute historical offsets.

No Swiss Ephemeris code, binaries, tables, fixtures or per-case output,
proprietary atlases, paid geocoding APIs, or personal birth records are part
of this project.
