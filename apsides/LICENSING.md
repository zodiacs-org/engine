# Apsides licensing and attribution record

This private project stays outside the engine's npm package. Its local
`package.json` declares MIT for its original work. That declaration does
not relicense dependencies or external material.

| Material | Terms and provenance |
| --- | --- |
| Original `src/`, `bin/`, `scripts/`, `examples/`, tests and documentation | Repository [MIT license](../LICENSE) |
| Reference registration, fixture selection/schema and independent derivation code | Original work under the repository MIT license |
| Selected numerical Horizons results and target/solution identifiers in `references/` | External factual calculation results; source requests and response digests retained in each fixture, attribution and limits of the source license record below |
| Installed `@zodiacs/engine` archive | `MIT AND CC-BY-4.0`; retain its bundled LICENSE, LICENSING.md and NOTICE |
| Engine's `astronomy-engine` dependency | MIT, Don Cross; retain its license notice |
| Installed development tools and their transitive dependencies | Each installed package's own license; versions and integrity are recorded by `package-lock.json` |

Dependency installation and generated builds are ignored. There is no
vendored ephemeris, copied ephemeris coefficient table, or alternative
ephemeris implementation in the authored apsides files. The library uses
the carried engine through its public calculation API. The local examples
are original code using synthetic windows, not published birth records.

The engine's notices include the CC BY material and third-party attribution
it ships. See the repository [NOTICE](../NOTICE) and
[LICENSING.md](../LICENSING.md), and the matching files inside the installed
archive. This file does not resolve or supersede that licensing record's
open questions. The wrapper's MIT declaration cannot remove the dependency's
attribution obligations.

Horizons attribution: Giorgini, JD and JPL Solar System Dynamics Group,
NASA/JPL Horizons On-Line Ephemeris System,
[ssd.jpl.nasa.gov/horizons](https://ssd.jpl.nasa.gov/horizons/).
Fixture manifests bind the compact extracts; each source entry names its
actual target/origin solution, request and retrieval time. Physical-center
spot samples retain their separate satellite-system solution identities.
Use of the results does not imply NASA/JPL endorsement.

The numerical extracts contain selected factual calculation results and
identifiers, not provider prose, a copied website table, or full responses.
Raw responses belong only in the ignored cache. The
[NASA Horizons catalog](https://data.nasa.gov/dataset/horizons) lists its
license as unspecified. The
[SSD FAQ](https://ssd.jpl.nasa.gov/faq.html), under its republication question,
gives general website republication guidance and points to JPL's copyright
statement. Neither page supplies an explicit license specific to these
generated numerical extracts. They were rechecked for M11 on 2026-10-15.
This record asserts no blanket public-domain or MIT license for JPL
material. [SOURCES.md](SOURCES.md) records the pages actually read and the
scope of the earlier collection decision. M11 adds no new external data.

No Swiss Ephemeris material or per-case output, proprietary atlas data,
credentials or personal birth data belongs in this project. The independent
accuracy expectations remain the cited Horizons samples; replay of an
engine receipt is an integration check, not a new accuracy reference.
