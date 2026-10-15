# Boundary and name provenance

## equal28-aries-v1

The versioned table is [src/tables.ts](src/tables.ts), exported as
`EQUAL28_ARIES_V1`. Select it with the full identifier `equal28-aries-v1`.
`getBoundaryTable` requires that identifier and rejects missing, unknown and
unversioned choices. There is no combined star/equal table.

This project's computational convention divides longitude into exactly
28 equal, half-open intervals from 0 degrees Aries. In the tropical zodiac,
zero is the vernal equinox of date. The exact start of mansion `i`, numbered
from 1, is `(i - 1) * 90/7` degrees and its exclusive end is `i * 90/7`
degrees. The last end remains 360 degrees in the table, rather than being
stored as zero. A future explicit sidereal calculation must identify its
ayanamsa and interpret the same arithmetic from that selected zodiac's zero;
this milestone does not implement sidereal calculations.

Width is exactly `360/28 = 90/7` degrees, or `12 degrees 51 minutes
25 + 5/7 seconds`. The familiar `12°51′25.7″` is a rounded display value.
Repeating that rounded width would finish 0.4 arcseconds short of a circle.
The table stores integer numerators and denominators, not rounded decimal or
sexagesimal boundaries. [test/tables.test.ts](test/tables.test.ts) checks
every endpoint by independent integer cross multiplication, full-circle
coverage, and the rounded-width discrepancy.

The names and their sequence have historical attestation. Assigning those
names to these exact rational boundaries and this exact zero is an explicit
project convention, not a transcription of a historical coordinate table.
It does not claim to reproduce unequal stellar asterisms, the current
longitudes of their stars, or a star's conjunction with the Moon.
Changes to boundaries, zero, sequence or displayed names require a new table
identifier and version; leave an existing version available for replay.

## biruni-sachau-1879

Abū Rayḥān al-Bīrūnī, *The Chronology of Ancient Nations*, translated and
edited by C. Edward Sachau (London: W. H. Allen, 1879), chapter XXI:

- Printed pp. 335-336 describe the division into lunar stations.
- Printed p. 342 describes beginning the Arabic enumeration with Alsharatan
  in the first part of Aries. This supports the naming order, not a precise
  modern coordinate for any star.
- Printed pp. 343-350 enumerate the names used here. Each production row
  cites its printed page and numbered entry in `nameSource`.

Read 2026-10-15 in the Internet Archive
[OCR text](https://archive.org/download/chronologyofanci00biru/chronologyofanci00biru_djvu.txt)
of [this scan](https://archive.org/details/chronologyofanci00biru).
The source OCR SHA-256 is recorded in the name fixture. The fetched OCR was
read, including each numbered heading and its surrounding explanation;
page images could not be fetched in this session. The OCR misreads some
diacritics and running page numbers. The fixture preserves the OCR spellings
of the headings and separately records the editorial readings, so neither
OCR nor editorial spelling is passed off as a facsimile transcription.

The small committed
[name witness](test/fixtures/biruni-1879-names.json) contains only the numbered
names, locators and editorial name fields. It contains no historical
judgments, predictions, birth data, star coordinates or ingress times.
The test checks the production naming sequence against that witness; it
does not establish astronomical accuracy. Entry 18 is bracketed in Sachau's
edition, as the source OCR shows. This table retains that numbered entry.

Production Latin labels use a consistent editorial transliteration, with
separate `al-`, `q` for qaf, `ʿ` for ayn, `ʾ` for hamza, macrons for long
vowels, and `ṭ`, `ṣ`, `ḥ` where applicable. They are labels for the names
attested by Sachau, not verbatim typography from the edition. Arabic fields
are unvocalized editorial spellings of the same names, not transcriptions of
Arabic type in the English edition. Arabic spellings were also checked
against the primary work described below. No English meaning is invented
where the source's explanation is disputed. The Latin transliteration is
the non-Arabic display label.

In particular, entries 26 and 27 follow Sachau's first/second forms,
`al-Fargh al-Awwal` and `al-Fargh al-Thānī`, rather than silently switching
to the fore/rear variants used in other lists. Entry 28 is `Baṭn al-Ḥūt`,
rather than substituting `al-Rishāʾ`. Entry 14 retains `al-Aʿzal`.
These are name choices, not extra boundary systems.

The medieval work and this 1879 translation are public domain sources.
The scan's [Commons record and rights statement](https://commons.wikimedia.org/w/index.php?title=File:The_chronology_of_ancient_nations_(IA_chronologyofanci00biru).djvu&oldid=854880532)
identify Sachau, the publication year, and public domain status. That record
was read on 2026-10-15. The witness contains excerpts of the public domain
work, not the Commons page's modern descriptive prose. The table arithmetic,
editorial normalization, code and documentation are original contributions
under the repository's [MIT license](../LICENSE). Public domain source text
remains public domain.

## farghani-ch20-arabic

Aḥmad ibn Muḥammad al-Farghānī, *ʿIlm al-nujūm wa-uṣūl al-ḥarakāt
al-samāwiyya*, chapter 20, the successive paragraphs beginning with the
first mansion and proceeding through the Fish. Read 2026-10-15 in
[Arabic Wikisource, revision 425823](https://ar.wikisource.org/w/index.php?title=علم_النجوم_وأصول_الحركات_السماوية/الفصل_العشرون&oldid=425823).
The [work's index, revision 434358](https://ar.wikisource.org/w/index.php?title=علم_النجوم_وأصول_الحركات_السماوية&oldid=434358)
marks it public domain. This is the primary author's text as transcribed by
Wikisource, not a modern article. Its edition is not identified there, and
the chapter is marked as lacking source metadata. It is a spelling
cross-check, not authority for coordinates, exact typography or dates.
Only traditional names were used; no modern explanatory prose was copied.

The sequence agrees with the name identifications here, while some forms
differ: its thirteenth name has transcription irregularities; its sixteenth
uses the Scorpion's claws form; its eighteenth explicitly names the
Scorpion's heart; its last name is the Fish. Its fore/rear bucket names
also differ from Sachau's first/second names. Production spellings retain
the Sachau identifications documented above. Tatweel, vocalization and
obvious transcription artifacts are not retained in editorial Arabic.

## Scope of the evidence

The table's arithmetic is a definition tested independently of the engine.
Neither historical source supplies an independently usable modern mansion
ingress sample with a stated time scale and longitude convention. This
milestone makes no claim of measured ingress accuracy. The planned ingress
sample audit remains a separate milestone. Engine calculation receipts
belong to future calculated mansion results; the static table is a cited
convention, not an ephemeris result or an authenticated receipt. The engine
retains its existing [licensing and attribution](../LICENSING.md).
