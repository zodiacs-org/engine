# Sources and provenance

This register records the sources consulted for the foundation milestone.
External source pages were retrieved or inspected through web search on
2026-10-15. No new stellar catalogue records, occultation predictions or
observations have been copied into this project. The links below are research
leads, not approved inputs or committed accuracy evidence.

## Local engine

The implementation uses this checkout of `@zodiacs/engine` through relative
source imports. Its source, dependency and data provenance are recorded in
the repository's [licensing audit](../LICENSING.md) and [NOTICE](../NOTICE).
The engine's code is MIT; its distributed package also carries CC BY data.
Using its time and ephemeris machinery does not remove those attribution
requirements. The local [package metadata](../package.json) and engine
receipts identify the engine and pinned ephemeris versions.

This project must reuse the engine's ephemeris, frames, nutation, time basis,
rise/set machinery and crossing solver. Integration tests against those
functions establish wiring and conventions, not independent astronomical
accuracy. Existing star values in the engine do not provide a shortcut to a
new catalogue: the root licensing audit explicitly leaves questions about
their redistribution terms unresolved.

## Catalogue leads for M2

| Source | What was read | Status |
| --- | --- | --- |
| [ESA Hipparcos and Tycho catalogues](https://www.cosmos.esa.int/web/hipparcos/catalogues) | The licence and credit section was available in the search index. A subsequent direct page request was refused by the host. | The page specifies CC BY-NC 3.0 IGO. These catalogues cannot be assumed to satisfy the requested public-domain catalogue requirement. No records copied. |
| [NASA HEASARC Bright Star Catalog](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html) | The overview, Hoffleit and Warren bibliographic reference, provenance and field descriptions. | The page describes a table derived from the Yale catalogue and later HEASARC revisions. It supplies no explicit licence for the Yale-origin records. NASA hosting alone does not establish public-domain status. No records copied. |
| [USNO ICRS products](https://crf.usno.navy.mil/icrs) and [USNO Bright Star Catalog paper](https://arxiv.org/html/2204.09080v1) | The official catalogue listing and the authors' description of the combined astrometric solution and field origins. | A possible alternative requiring further review. Its solution incorporates Hipparcos intermediate astrometry, and some fields come directly from Hipparcos. USNO hosting alone does not resolve the rights in every field. No catalogue download retained. |

M2 must establish an explicit public-domain basis for the chosen input before
vendoring records. Record the exact catalogue edition, publisher, original
authors, download URL, retrieved bytes and digest, applicable terms, and any
third-party fields. Public availability and scientific-use permission are
insufficient substitutes for the requested rights.

The subset generator must retain field provenance and define epoch, reference
frame, proper-motion units and right-ascension convention, magnitude band,
aliases, multiplicity and missing-value handling. Coverage of the named stars
and other eligible targets must be checked from the chosen catalogue rather
than inferred from its name. Downloaded bulk inputs and generated bulk output
belong in ignored directories.

## Independent reference leads for M4

| Source | Potential use | Conventions or unresolved issues |
| --- | --- | --- |
| [IOTA northern Mars limits, January 2025](https://occultations.org/publications/rasc/2025/20250114MarsNLimit.txt) | Coarse visibility-outline comparison using published longitude, latitude and event-time rows. | Distinguishes inner and outer planetary limits. States WGS84 coordinates, mean-sea-level site elevations and a low-altitude refraction adjustment. These conventions must be matched or their differences budgeted. |
| [IOTA epsilon Arietis contacts, April 2025](https://occultations.org/publications/rasc/2025/20250401epsAriNAmerLoc.txt) | Published disappearance and reappearance times, position angles and observer coordinates. | The [authors' overview](https://occultations.org/publications/rasc/2025/nam25grz.htm) says the predictions use the mean position of a close double. They cannot be treated as a simple single-star reference without resolving that convention and the site elevations. |
| [IOTA Spica graze, November 2024](https://occultations.org/publications/rasc/2025/20241127Spica.htm) | Published account of observed contacts, with site coordinates and links to prediction and timing material. | The page distinguishes a spherical lunar limit from terrain-driven repeated contacts. Useful for documenting the spherical-limb limitation; no linked timing table has been adopted as a fixture. |

The older [IOTA Mars contact page](http://www.lunar-occultations.com/iota/planets/0114mars.htm)
was found through links but could not be fetched. Its contents have not been
reviewed and must not be cited as an inspected contact reference.

Before selecting any fixture, M4 must check redistribution permission and
the prediction's computational lineage. The IOTA affiliation alone does not
establish that lineage. Confirm the underlying planetary ephemeris, stellar
catalogue and reduction method and exclude Swiss Ephemeris code, data and
per-case output. Record the published contact definition, time scale, site
coordinates and elevation datum, lunar radius or limb profile, planetary disk
model, refraction treatment and printed precision. A city name alone does not
define an observer.

Freeze development and held-out cases separately and establish maximum-error
criteria before comparing this project's results. Distinguish published
predictions from observed contacts, and explain any reference uncertainty or
model mismatch. No contact-time accuracy, catalogue completeness or visibility
accuracy has been established by the foundation milestone.
