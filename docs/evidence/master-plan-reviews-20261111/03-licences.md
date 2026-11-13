# Review 3: licences

Redone on 2026-11-11 from this repository at `origin/main` (`bc0b5a7`):
`LICENSE`, `LICENSING.md`, `NOTICE`, `package.json`, `CITATION.cff`,
`.zenodo.json`, `CONTRIBUTING.md`, `conformance/`, `atlas/LICENSING.md`, the
licence files of `python/`, `clients/` and `tools/`, and the same files on
six other branches as last fetched. The first pass could read no third
party's page. The second pass fetched the providers' own current pages on
2026-11-11 and read the site repository at `47fee79f`; its results are in
*Second pass: the open questions against the providers' current terms*,
which comes first below, and C1 and the letters section are amended where
it changed them.

## Second pass: the open questions against the providers' current terms

Each row is one question the repository leaves open, or one claim it makes,
set against text fetched on 2026-11-11.

| Question or claim | Provider's text today | Verdict |
| --- | --- | --- |
| **EOP 20 C04**: "No statement of terms or licence was found" (`LICENSING.md:312-313`) | The file's header (`https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now`, first 3 KB) has six lines, with a description link and a contact and no terms. The readme (`https://hpiers.obspm.fr/iers/eop/eopc04/readme`), the Centre's page (`https://hpiers.obspm.fr/eop-pc/index.php?index=C04&lang=en`, "Page updated on 2026, February 21"), the IERS legal page (`https://www.iers.org/iers/en/service/imprint`) and the data centre's record of the series state none. | **Still open.** Confirmed that nothing is stated. The data centre now calls the series "EOP 20u24 C04" (`https://datacenter.iers.org/eop.php`); the letter should use both names. |
| **Bulletin A**: the USNO page ends "Distribution Statement A. Approved for public release: distribution unlimited." (`LICENSING.md:290-291`) | The sentence is on `https://maia.usno.navy.mil/products/bulletin-a` today. | Confirmed. |
| **Leap-second list**: "This file is in the public domain." (`LICENSING.md:246-247`) | Lines 49 to 50 of `https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list`: "COPYRIGHT STATUS OF THIS FILE" / "This file is in the public domain." | Confirmed. |
| **CDS**: commercial use of the 20 values "is not settled by these sources" (`LICENSING.md:385-387`) | `https://cds.unistra.fr/legals/` and `.../vizier-org/licences_vizier.html` both return 404 today; the site serves a notice, "Last updated November 09, 2026", of "a cybersecurity incident within its network of servers located in Strasbourg". Archived copies carry the sentences `LICENSING.md` quotes, word for word, one page each. The copy of `/legals/` (`https://web.archive.org/web/20260909122430/https://cds.unistra.fr/legals/`, "Updated at: 7 January 2026") has "The Data Sets must be cited in any work or product that uses them". The copy of the VizieR page (`https://web.archive.org/web/20261025102348/https://cds.unistra.fr/vizier-org/licences_vizier.html`) has "The commercial usage of the data is subject to rules depending of the origin", and under it a list by origin with this entry: "Tabular data, spectra or images coming from A&A (J/A+A) are free for a scientific usage." Famaey et al. 2005 is `J/A+A/430/165`, one of the three catalogues (C13). The ReadMe files of I/311 and III/252 (`https://vizier.cfa.harvard.edu/ftp/cats/I/311/ReadMe` and `.../III/252/ReadMe`, a mirror) state no licence; the second reader did not fetch them again. | **Still open**, and the CDS cannot be read or, presumably, written to at its usual address today. |
| **Hipparcos**, the origin of most of those values | ESA, `https://www.cosmos.esa.int/web/hipparcos/catalogues`: "The Hipparcos and Tycho Catalogues are distributed under the CC BY-NC 3.0 IGO licence". ESA's archive terms, `https://www.cosmos.esa.int/web/esdc/terms-and-conditions`: "Prior to any commercial use by the User of any Data or Data Product ... a detailed request for authorisation/licence shall be made". ESA's page for the new reduction states no licence and says "A copy of the VizieR data is available from the ESA legacy archive". | **New problem (C9).** `LICENSING.md` does not mention ESA. |
| **Reid and Brunthaler**: "no terms for them were read" (`LICENSING.md:383-385`) | The journal page, `https://iopscience.iop.org/article/10.1086/424960`: "© 2004. The American Astronomical Society. All rights reserved." arXiv (`astro-ph/0408107`) shows only its own non-exclusive licence to distribute. | **Still open as a question of terms.** The terms are now read: no licence is granted to anyone. What ships is two numbers from a table, with citation; whether two measured values need a licence is the lawyer's question, not the authors'. |
| **Stephenson, Morrison and Hohenkerk 2016**: "The article and its electronic supplement are CC BY 4.0" (`LICENSING.md:166-168`) | The publisher's page refused automated reading (403). The full text at Europe PMC (PMC5247521): "Published by the Royal Society under the terms of the Creative Commons Attribution License http://creativecommons.org/licenses/by/4.0/". The two supplement files are listed inside that record with no licence statement of their own. Crossref lists no Creative Commons licence for the article. | Confirmed for the article. For the supplement, where Table S15 is, **by inclusion only**: no separate statement was found. |
| **The 2020 addendum** "has no established licence" (`LICENSING.md:168-169`) | Crossref (`https://api.crossref.org/works/10.1098/rspa.2020.0776`) lists only a text-mining policy. OpenAlex's record for the same DOI gave it as closed with no licence; that record's address was not kept and the second reader did not fetch it again, so it rests on one reading. | Consistent. Not shipped. |
| **NAIF**: may a pack derived from DE440 be redistributed (`docs/de440.md:38-40`) | `https://naif.jpl.nasa.gov/naif/rules.html`: "Redistribution of SPICE kernels distributed by NAIF is permitted as long as they have not been modified." A modified kernel must carry the modifier's name and a changed file name. "No fees or licensing are required." The page has no sentence on data derived from a kernel. | **Still open.** The rules cover kernels and modified kernels, and a refit is neither. The site repository records that the question "was sent once, on 2026-09-30 at 10:54 UTC ... No answer yet" (`docs/platform/programme/STATUS.md:1512`). |
| **Horizons output** is "public" (`LICENSING.md:132`) | `https://ssd.jpl.nasa.gov/faq.html`: "No permissions are needed. The data provided on this site are considered public domain." It asks for a citation and that "If the data obtained is subsequently modified, that modification should be made clear." | Confirmed, and now citable. See the amended C1. |
| **GeoNames** is CC BY 4.0 (`LICENSING.md:221-222`) | `https://download.geonames.org/export/dump/readme.txt`: "This work is licensed under a Creative Commons Attribution 4.0 License". | Confirmed. |
| **tzdata** is in the public domain (`LICENSING.md:227-228`) | `https://data.iana.org/time-zones/tzdb/LICENSE`: "all files in the tz code and data (including this LICENSE file) are in the public domain", with three BSD files the package does not use. | Confirmed. |
| **astronomy-engine** is MIT | Its `LICENSE`: "MIT License / Copyright (c) 2019-2025 Don Cross". | Confirmed. |
| **ERFA** is BSD 3-Clause (`LICENSING.md:134`) | Its `LICENSE` is BSD 3-clause in form, and adds: "please acknowledge that you are using a library derived from SOFA, rather than SOFA itself." | Confirmed. |
| **NOVAS** "is not suseptible to copyright" (`LICENSING.md:200-203`, quoting the PyPI package) | USNO's pages state no copyright or licence; `https://aa.usno.navy.mil/software/novas_faq` gives the citation it asks for and says "If you use NOVAS, please send us an email that outlines your application." | Not contradicted. The request for an email is not recorded in the repository. |

The owner's authority to publish as MIT (the first open question) is not a
matter of upstream terms. The site repository's `LICENSE:9-11` does say "The
chart engine, @zodiacs/engine, is MIT AND CC-BY-4.0", which is the grant
`LICENSING.md:89-95` relies on, now read. The master plan adds a risk that
`LICENSING.md` does not: "the MIT grant weak because many commits are
AI-written with no contributor agreement". That is for the lawyer.

### C9 (new). Whether ESA's terms reach the Hipparcos values is a question the record does not ask

(Fix round: the heading used to read "ESA's terms for Hipparcos are
non-commercial". That said more than was found.)

`LICENSING.md:357-368` gives the Hipparcos new reduction as the source of
the star values and reads only the CDS's terms for them. What ESA's pages
say, and no more:

- The 1997 catalogues: "The Hipparcos and Tycho Catalogues are distributed
  under the CC BY-NC 3.0 IGO licence"
  (`https://www.cosmos.esa.int/web/hipparcos/catalogues`).
- ESA's archive terms ask for a request before commercial use: "Prior to
  any commercial use by the User of any Data or Data Product ... a detailed
  request for authorisation/licence shall be made"
  (`https://www.cosmos.esa.int/web/esdc/terms-and-conditions`). They do not
  use the word "non-commercial" of the data as a whole.
- The values the engine carries are from van Leeuwen's 2007 reduction,
  through VizieR. ESA's page for that reduction
  (`https://www.cosmos.esa.int/web/hipparcos/hipparcos-2`) states no
  licence and says "A copy of the VizieR data is available from the ESA
  legacy archive".

So whether ESA's terms reach those values is not settled by what was read.
What is settled is that the question exists and is not in the record.
It matters far more for `feat/fixed-stars-hipparcos` (pull request 80, "411
Hipparcos stars"), whose `LICENSING.md:142-143` says these sources are
"each free to use with acknowledgement" (C7).

### C10 (new). The site repository still states the IERS terms that the engine withdrew

`docs/platform/evidence/deltat-2026-09-25/sources.json` in the site
repository describes `finals2000A.all` and `eopc04.1962-now` as "IERS
product, free to use with citation of the IERS". That is the sentence
`LICENSING.md:292-296` says was not found on any IERS page and no longer
makes. The engine's ΔT provenance points at that folder
(`LICENSING.md:172-174`).

### C11 (new). Two records disagree on where the DE440 entry's nutation came from

`LICENSING.md:83-85` says the research runtime's nutation table, "which its
`NOTICE.md` gives as ERFA's (BSD 3-Clause), was not taken", and that the
port sums the engine's own table from NOVAS. The site's
`examples/precision-alpha/NOTICE.md:5-14` confirms the runtime's table was
"parsed out of ERFA's `src/nut00b.c`". The engine's account is consistent.
It rests on the statement that the two tables "equal ... term for term and
double for double", which a reader can check only with both repositories.
No defect found; recorded because the letters and the licence map will be
asked.

### C12 (new). Swiss Ephemeris values in the site repository's history

The plan asks the owner to "decide what to do with the site repo history
that holds about 44,000 Swiss-generated values". The site's record:
`docs/engine-validation/SWISS-OUTPUT-REMOVAL.md:36-44` counts "44,071
distinctive numbers and timestamps that left", of which "40,597 ... are
'gone'" and 3,474 kept "as inputs, statistics or reference values", and
`:21-24` says "Git history was not rewritten". The plan's figure is the
record's. The clone read here has a depth of one commit, so the history
itself was not inspected.

### C13 (fix round). The CDS's own rule for one of the three catalogues

Found by the second reader (`BREAKER.md`, S3) and not in `LICENSING.md` or
in this review's first two passes. The archived VizieR page lists rules by
origin, and for data from Astronomy & Astrophysics it grants scientific use
and names no other: "Tabular data, spectra or images coming from A&A
(J/A+A) are free for a scientific usage." Famaey et al. 2005
(`J/A+A/430/165`) is the source of some of the 20 values
(`LICENSING.md:359-362`). This does not close the commercial-use question.
It sharpens it for those values. Recording it in `LICENSING.md` is for a
later candidate and the owner; this review changes no licence file and
nothing was sent to the CDS.

## First pass

## What holds

- The package's expression is `MIT AND CC-BY-4.0` in `package.json:5`,
  `LICENSING.md:15`, `README.md:1009`, `CONTRIBUTING.md:343` and
  `scripts/verify-package-contents.mjs:407`. The CC BY part is the 32 values
  of Table S15 of Stephenson, Morrison and Hohenkerk 2016, attributed in
  `NOTICE:141-147`, and a script checks the attribution is packed.
- One runtime dependency, `astronomy-engine` 2.1.19, MIT
  (`package.json:130-132`, `package-lock.json:1139`). Two of its functions
  are reproduced in `src/frame.ts` and `src/calc-reduce.ts` under its notice
  (`LICENSING.md:112-115`, `NOTICE:12-20`).
- No JPL ephemeris value ships: `LICENSING.md:411-412`, `NOTICE:90-91`,
  `src/de440.ts:6`. `src/de440/` is code only.
- `LICENSING.md` is careful where it has read a source: it quotes the
  provider and gives the date read for Bulletin A (`:283-291`), EOP 20 C04
  (`:297-313`), the CDS (`:370-382`), the leap-second list (`:239-247`) and
  NOVAS (`:193-203`), and it withdrew an earlier claim about IERS terms that
  it could not find (`:292-296`).

## Open questions the repository itself records

`LICENSING.md:3-13` gives its status as GO subject to four things. None is
closed in the repository.

1. That the operator has authority to publish the Zodiacs.org-authored code
   as MIT. The site repository's `LICENSE` "reserves all rights in its
   contents but the parts it names" (`LICENSING.md:89-95`). That file is in
   another repository and was not read here.
2. EOP 20 C04: "No statement of terms or licence was found"
   (`LICENSING.md:312-313`). The repository carries 367 of its rows, and the
   package carries values derived from them.
3. The 20 star values from the CDS: "whether a commercial use needs more
   than attribution is not settled by these sources" (`LICENSING.md:385-387`).
4. Reid and Brunthaler's two values: "no terms for them were read"
   (`LICENSING.md:383-385`).

A fifth is recorded elsewhere and belongs beside them:

5. `docs/de440.md:38-40`: "Whether a pack derived from DE440 may be
   redistributed is a question put to NAIF; until it is answered, no pack is
   distributed". `CHANGELOG.md:788-790` says the same of any coefficient set
   derived from a JPL ephemeris. `LICENSING.md` does not mention the
   question.

## Findings

### C1. JPL material is committed with no statement of JPL's terms (second pass: amended)

Second pass. JPL's Solar System Dynamics FAQ, read today, says "No
permissions are needed. The data provided on this site are considered public
domain", and asks for a citation with the retrieval date. So the Horizons
responses may be kept, and the finding below reduces to this: `LICENSING.md`
should cite that page and its date instead of the bare word "public", and
`NOTICE` or the evidence folders should carry the citation JPL asks for.
The `infra/minorbodies` branch's more guarded reading, quoted below, is of
JPL's general site notice ("Permission to reproduce may be required") and
is superseded for SSD data by the FAQ. The DE440-derived oracles are a
separate matter and stay under the NAIF question. The API's fair-use policy
(`https://ssd-api.jpl.nasa.gov/doc/`) also asks automated clients for "a
valid, application-specific User-Agent request header that includes correct
product name, version, and contact information"; the repository's
`fetch_horizons.py` scripts should be checked against it.

First pass, as written: `LICENSING.md:132` calls the Horizons responses
"public" and cites nothing.
The repository holds about 170 verbatim Horizons responses under
`docs/evidence/calc-api/horizons/`, 16 under
`conformance/sources/horizons-24/`, two fixtures under `src/`, and 200
instants of places computed from `de440.bsp`
(`docs/evidence/de440-20261110/oracles/`). None is packed. A branch of this
repository has read JPL's pages and reached a more guarded conclusion:
`infra/minorbodies:minorbodies/LICENSING.md:32-35` says the SSD pages ask
users "to obtain permission for republishing site information" and "do not
supply a blanket licence for numerical API output", and assigns no licence
to its retained responses. `main` should say at least as much. The
conformance suite's CC0 dedication already excludes these copies
(`LICENSING.md:479`), but `CONTRIBUTING.md:345-347` states the dedication
without that exception.

### C2. Values reached through Swiss Ephemeris are in the repository and the package

The rule in `AGENTS.md` is "No Swiss Ephemeris code, binaries, ephemeris
files, tables, fixtures or per-case output in the repository".
`LICENSING.md:484` says "no Swiss Ephemeris code, data file or output is
committed". Three things sit against those sentences:

- `conformance/sources/horizons-24/corpus-tt.json:2`: "TT was taken as UT +
  Swiss's deltaT, recorded here as a clock value". The file holds 24 ΔT
  values that Swiss Ephemeris returned, and the TT instants built from them
  are the inputs of all 240 L1 vectors. `conformance/DISCREPANCIES.md:42`
  discloses it. It is per-case Swiss output, committed. The vectors'
  expected values do not come from it, and released vectors cannot change,
  so the honest repair is to correct the two sentences, not the data.
- `src/vedic/ayanamsa.ts:140` ships the Krishnamurti value 22.363889, whose
  source is given as "Swiss Ephemeris documentation §2.8.6"
  (`docs/vedic.md:718-720`), and the Lahiri value is the Indian
  Astronomical Ephemeris's "as quoted in the Swiss Ephemeris documentation"
  (`docs/vedic.md:707-709`). These are published constants read from
  documentation, not program output. Whether documentation counts under the
  rule is for the owner to say. Neither `NOTICE` nor `LICENSING.md` mentions
  these epoch values at all.
- `docs/evidence/vedic-2026-09-28/results/primary-tables.json:65`: "IAE
  values before 2021 are quoted from the Swiss Ephemeris documentation,
  appendix E."

Reviews 1 and 2 record two related points: README sentences that use Swiss
as the yardstick (A6), and the bot's test expectations taken from Swiss and
kept outside the repository (B6).

### C3. Metadata that states the licence differently

- `.zenodo.json:11` has `"license": "mit"`. Its own description on line 3
  says the package is `MIT AND CC-BY-4.0`. A Zenodo record made from it
  would show MIT alone.
- `CITATION.cff:37-39` lists the two licences, and lines 9 to 10 admit the
  format reads a list as a choice.
- `python/THIRD_PARTY_NOTICES.md:38-40` still says IERS "asks that its
  products be cited", the sentence `LICENSING.md:292-296` withdrew.
  `python/THIRD_PARTY_NOTICES.md:61` says the geo entry "does not
  redistribute the IANA Time Zone Database", which was true of the
  0.1.1-rc.14 it bundles and is not true of `main` (`NOTICE:175`).
- `clients/python/NOTICE.md:12-13` cites `contracts/provenance.json`, which
  exists only under `clients/typescript/`.

### C4. Parts of the repository with no licence statement of their own

`skills/`, `bots/` and `api/` have none. `CONTRIBUTING.md:338-339` covers
them with "Code and documentation outside `conformance/` and `atlas/` are
under the MIT License". `LICENSING.md` names none of `python/`, `clients/`,
`tools/`, `skills/` or `bots/`. Three of those carry expressions of their
own for reasons the root file does not explain: the clients are `MIT AND
CC-BY-4.0` because of the hosted API's OpenAPI document
(`clients/typescript/NOTICE.md:7`), and `tools/cli` is `MIT AND CC0-1.0`
while packing `conformance/**`, sources included
(`tools/cli/package.json:7`, `:16`; `tools/cli/LICENSING.md:5`). The Python
wheel bundles `astronomy-engine-2.1.19.tgz` and the engine's 0.1.1-rc.14
archive (`python/pyproject.toml:34`).

### C5. `NOTICE` and `LICENSING.md` do not list the same things

Shipped according to `LICENSING.md` and absent from `NOTICE`: the classical
sources of the timing and Vedic tables (`LICENSING.md:354-356`), and
Chaucer and Cassius Dio (`LICENSING.md:472-474`). In `NOTICE` and absent
from `LICENSING.md`: Wallace and Capitaine 2006 and the Fukushima-Williams
angles (`NOTICE:77`, `:86-88`), and the count of 91 derived ΔT values
(`NOTICE:153`). `README.md:1015-1021` lists some of the shipped data and
leaves out the frame constants, the dignity tables and the sky constants.
None of these is a licence breach. They are the gaps a reader checking one
file against the other finds.

### C6. Claims about a third party's terms with no citation to that party

`LICENSING.md` states these without a URL, file or quotation from the party
concerned: Horizons responses are "public" (`:132`); ERFA is BSD 3-Clause
(`:134`); the USNO API's pages "state no other terms" (`:141-145`); the
Royal Society article "and its electronic supplement are CC BY 4.0"
(`:166-168`); the 2020 addendum "has no established licence" (`:168-169`);
GeoNames files "are CC BY 4.0" (`:221-222`); the tz project places tzdata
"in the public domain" (`:227-228`); Grotefend, Ptolemy, Dorotheus,
al-Bīrūnī, Lilly, Chaucer and Cassius Dio are in the public domain (`:336-340`,
`:447-448`, `:472-474`, with no jurisdiction or edition); and "The
attribution in `NOTICE` meets the CDS citation terms" (`:385`), which is
the repository's own conclusion. Most are very likely right. The file's
own standard, set in *IERS data*, is to state "what its providers' pages
and files say", and these do not meet it.

### C7. Two branches would change the licence position and disagree with each other

- `feat/fixed-stars-hipparcos` would ship a star catalogue in the npm
  package (`src/stars-data.ts`) ported from a third-party MIT project, and
  its `LICENSING.md:142-143` calls the Hipparcos new reduction, SIMBAD and
  the IAU names "each free to use with acknowledgement" with no citation.
  That is looser than `main`'s reading of the same CDS terms, which leaves
  commercial use open (`LICENSING.md:385-387`).
- `infra/fixedstars` takes its stars from the HYG database and declares
  `MIT AND CC-BY-SA-4.0` (`fixedstars/package.json:6`). ShareAlike data
  would be new to the repository.

Only one of them can be the engine's star source, and either one widens
open question 3.

### C8. Provenance that rests on a repository a reader may not be able to open

The ΔT derivation (`LICENSING.md:172-174`), the research runtime's MIT
declaration (`:81-83`), the DE440 oracles' generator
(`docs/evidence/de440-20261110/README.md`) and the pack's digests
(`docs/de440.md:32-33`) are all recorded as being in zodiacs.org's
repository, whose `LICENSE` reserves all rights (`LICENSING.md:89-91`).
The engine's licence record is therefore complete only for someone who can
read that repository. This review could not.

## What the letters to NAIF, IERS and CDS must not get wrong (licence part)

1. **NAIF.** The question is about redistributing a refit of `de440.bsp`,
   not the kernel. NAIF's rules already allow redistributing an unmodified
   kernel and say how a modified one must be named; they are silent on
   derived data, and the letter should say it has read them. Nothing
   derived from DE440 ships in the npm package today. A question was
   already sent on 2026-09-30 and the site's record says "Do not resend
   it"; a second letter must refer to the first. Ask also about the 200
   instants of DE440-derived places committed as test evidence. Second
   pass: JPL's SSD FAQ does call its site's data "public domain", so the
   first pass's advice not to use those words applies to NAIF's kernels
   only. The site's own `examples/precision-alpha/NOTICE.md:46-53` records
   the same care: "NAIF never says public domain, and what it grants is a
   permission with conditions." 
2. **IERS.** Three products, three providers: the leap-second list and EOP
   20 C04 from the Earth Orientation Centre at Paris Observatory, and
   `finals2000A.all` from the Rapid Service/Prediction Centre at the US
   Naval Observatory (`LICENSING.md:239-271`, `:283-291`). The open question
   is C04 only. Say what is carried: 367 rows of 1972 in the repository, and
   derived values in the package (UT1 − UTC sampled every third day, and
   some ΔT values from 1941). Do not say IERS "asks only for citation";
   that sentence was withdrawn.
3. **CDS.** 20 single values for three stars and Sgr A*'s position, from the
   Hipparcos new reduction (VizieR I/311), Gontcharov 2006 (III/252), Famaey
   et al. 2005 (J/A+A/430/165) and SIMBAD (`LICENSING.md:357-368`). No
   catalogue file or table is redistributed. The question is commercial
   use. The two Sgr A* proper-motion values are Reid and Brunthaler's and
   are not the CDS's to license. Second pass: the CDS's site is down after
   a security incident and its legal pages return 404, so quote the terms
   from a dated archive copy and expect a slow reply. For Hipparcos values
   the letter may need to go to ESA as well (C9). If the fixed-stars branch is going ahead,
   the letter should ask about a catalogue of that size now, not 22 values.
4. In all three, give the package's licence as `MIT AND CC-BY-4.0` and say
   the CC BY part is the ΔT values, which come from none of these three
   bodies.

## Not checked

- The CDS's terms on its own site (down today; archive copies read), the
  ReadMe of J/A+A/430/165 (no mirror answered), and the Royal Society's own
  article pages (refused).
- The licence text inside the NOVAS distribution.
- The site repository's history (the clone has one commit).
- Whether the build leaves astronomy-engine out of `dist/` (nothing was
  built; `scripts/verify-package-contents.mjs:78` and `:294` treat it as
  external).
- The contents of the carried archives in `artifacts/` and of the tarballs
  bundled under `python/src/zodiacs/_vendor/`.
- Whether the count "320 of the 336" in `src/placidus-limit.test.ts:12-13`
  is an expectation taken from Swiss Ephemeris or a figure that agrees with
  it.
