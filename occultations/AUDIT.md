# Source, licence and scope audit

Reviewed on 2026-10-15 for the isolated workbench. This is a record of the
material and terms inspected, not a new licence grant, a blanket legal
assurance, an archive certification or an astronomical accuracy result.
[SOURCES.md](SOURCES.md) gives the detailed provenance; [VALIDATION.md](VALIDATION.md)
records executed comparisons and checks. Original source receipts and frozen
acceptance criteria remain unchanged by this audit.

## Retained material and distribution

| Material | Record and scope |
| --- | --- |
| Authored workbench code, tests and documentation | MIT under the repository LICENSE. The private package metadata describes this authored work; it does not relicense incorporated data. |
| Adjacent engine and pinned astronomy-engine dependency | Relative source imports and the existing pinned MIT dependency. The local build retains legal comments and copies the engine LICENSE, LICENSING.md and NOTICE. The bundled engine's attributed delta-T values retain CC BY terms. Inherited qualifications below remain unresolved. |
| SAO source rows and NASA ADC documentation | The catalogue-specific NASA determinations in `data/sao-rights.json` are the public-domain basis. `data/sao-source.json` retains selected source fields and provenance codes; `data/sao-documentation.txt` is unchanged. The build copies SAO-NOTICE.txt, the documentation, rights receipt and alias register. |
| Stellar names and aliases | Factual identifiers only, with individual SIMBAD identifier-table links in `data/sao-aliases.json`. No additional SIMBAD astrometry or photometry enters the workbench catalogue. This is distinct from the engine's inherited stellar data. |
| Nominal sphere radii | Individually transcribed physical facts and source receipt in `data/radii-source.json`, copied beside the bundle. No source page, illustration or ephemeris table is vendored. The Moon and Sun radii retain the engine's existing attribution. |
| ERFA published validation values | Test-only reference inputs and outputs, with `test/fixtures/ERFA-NOTICE.txt` retained. The Python comparison uses external development dependencies; generated values remain ignored. No ERFA implementation or ephemeris coefficient table is bundled. |
| Historical USNO occultation predictions | Compact factual extracts of the cited federal publication. The event source register, locators and `test/fixtures/events/NOTICE.txt` preserve authorship and provenance. Scans stay with the source provider. |
| NAOJ conjunction, occultation and outline references | Compact numerical extracts under the cited provider terms, with the event NOTICE retained. They are test references, not MIT data, runtime lookup tables or fitted ephemeris coefficients. |
| USNO sky references | Selected API facts and raw response receipts in `test/fixtures/sky/usno-sky.json`, with acquisition and preregistration records. The existing root rise/set fixture is read unchanged. |

`scripts/build.mjs` bundles only the runtime entry and CLI entry and writes
under the ignored `.generated/` directory. Its generated metafile identifies
which adjacent engine sources enter each output. The current graph includes
the delta-T and time-scale data, nutation and shared ayanamsa implementation;
choosing a tropical request does not remove the latter from distribution.
Event and ERFA validation fixtures are not runtime inputs. Runtime results
retain adopted catalogue and radius provenance rather than substituting
reference event times.

The catalogue adoption follows NASA's catalogue-specific rights records,
not the fact that a file appears on a government server. The
[SAO volume record](https://ntrs.nasa.gov/citations/19660017606), Copyright
field, was re-read for this review and still states "Work of the US Gov.
Public Use Permitted." The [HEASARC description](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/sao.html),
Overview, Provenance and proper-motion field definitions, was also re-read.
It confirms the edition chain and the FK5 right-ascension motion unit in
seconds of time per year. The existing receipt, rather than this review,
records the other volume and documentation determinations. A fresh web
request for the documentation record timed out; this audit does not claim
to have re-fetched or reauthenticated its recorded bytes.

The [NAOJ ECO terms](https://eco.mtk.nao.ac.jp/koyomi/site/index.html.en),
"Terms of Use of our Website", were re-read and permit reuse and
republication with credit requested. NAOJ's broader
[copyright terms](https://www.nao.ac.jp/en/terms/copyright.html), sections
on permitted uses, credit and restrictions, were also re-read. The outreach
references rely on their stated scientific and information/publication uses;
this is not permission to resell originals or adopt provider programs,
source code or third-party imagery. Retain the fixture notice when sharing
those references. No provider map code, map imagery or provider credentials
are retained.

## Unresolved inherited questions

The root [LICENSING.md](../LICENSING.md) remains the authority for the
engine's existing provenance decisions. This workbench neither repairs nor
expands them:

- The root audit conditions the adapted engine code's MIT publication on
  the operator having authority to grant it. This review establishes no
  separate chain of title.
- The root audit found no stated redistribution terms for IERS EOP C04.
  Values derived from that series occur in the inherited time machinery.
  Public access and retained attribution do not settle the missing terms.
- The root audit does not settle commercial reuse of the CDS-provided
  stellar values in the shared ayanamsa code. Those values enter the local
  bundles through calc even though they are not the workbench's adopted SAO
  catalogue. A new request for the CDS terms page was blocked by the web
  fetcher; this review relies on the root audit's explicitly dated record
  and makes no claim that the current terms were revalidated.
- The root audit records no terms read for the Reid and Brunthaler
  proper-motion facts in that same implementation. This review supplies no
  new terms for them.

The SAO compilation has its own source-catalogue contributions. Retained
codes, the edition documentation and the expressly excluded later imported
fields are part of the adoption decision in SOURCES.md. This decision is
not a blanket public-domain declaration for the contributing catalogues,
for all CDS services, or for future fields added to the subset. A new data
source or changed field scope requires its own provenance review.

## Geometry and evidence boundaries

The workbench delegates Moon and planet ephemerides, observer positions,
frames, nutation, clocks and time crossings to the engine. The sky context
reuses its phase calculation and rise/set constants; local tangent and
horizontal projections preserve the contact directions. It adds sphere
contacts and fundamental-plane geometry, not a replacement ephemeris.

The public outputs distinguish coordinate conjunctions, geocentric separation
minima, candidate intervals, local contacts and sampled global outlines.
Lunar terrain, planetary rings and oblateness, missing stellar distances,
binary motion, untransformed historical station datums and inherited
correction differences remain limitations. A receipt identifies conventions
and inputs; it is not an independent physical error certificate.

Published-reference comparisons must retain the original clock and limb
qualifications and every preregistered check. Historical USNO predictions
and NAOJ numerical predictions are independent comparison material, not
observed contacts. Coarse outreach appulse times cannot establish precise
geocentric minimum times. Analytic tests of poles, tangencies, horizons and
disconnected footprints establish geometry behavior without adding physical
coverage in those cases. The sensitivity budget in DESIGN.md must leave
unknown physical error terms unknown, including their divergence near a
graze. Solver termination precision does not fill those terms.

## Isolation and exclusions

The local manifest stays private, with its own dependency lock and ignored
installation, cache and generated-output directories. The local TypeScript
configuration does not emit; the local build does not write the root dist
directory. Root package metadata, engine source, carried archives and release
workflow are outside this workbench's change scope.

`scripts/check-scope.mjs` checks source file sizes, prose punctuation,
dependency pinning, private status, changed paths and root npm file selection.
It uses an npm dry run with lifecycle scripts disabled, not an archive write.
That check is narrower than rebuilding and authenticating a carried archive.
The executed checks and any unavailable root prerequisites belong in
VALIDATION.md; this audit does not replace the repository CI gates.

Runtime calculations and the CLI have no remote source-loading path. Source
verification commands are explicit development tools, distinct from normal
calculation. Downloads and generated comparison data remain ignored. The
review found no Swiss Ephemeris import or retained Swiss reference material
in the workbench sources or fixtures, and no new AGPL or commercial catalogue
was adopted. No proprietary atlas, personal birth record, date ranking or
interpretive output forms part of the workbench. These findings concern the
reviewed files; they are not a licence grant for unreviewed dependencies or
future source additions.
