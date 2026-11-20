# Licence record for 2.0.0 (ZOD-341)

On 2026-11-20 at 10:37 Asia/Bangkok, the owner (Dias) answered:
"Re-accept the licence questions and add Hipparcos as a 4th."

On 2026-11-20 at 11:16 Asia/Bangkok, the decision record gives Dias's
superseding answer:
"ship 2.0.0 with the open licence questions NOTED, not settled and NOT
recorded as re-accepted: IERS, CDS, Reid and Brunthaler, plus ESA's
non-commercial Hipparcos terms noted as a fourth."

The decision selects outcome (b). The scope of ESA's terms for the values
obtained from VizieR remains open.

## Provider sources

All sources below were read on 2026-11-20 (Asia/Bangkok). The excerpts are
from the providers' own pages or release files, with cached search text
identified where the direct fetch failed.

| Source and locator | Verbatim excerpt | Finding |
| --- | --- | --- |
| [ESA Hipparcos mission home](https://www.cosmos.esa.int/web/hipparcos), *The Hipparcos Space Astrometry Mission* | “ESA's Hipparcos space astrometry mission was a pioneering European project” | ESA identifies the mission and links to both catalogue editions. |
| [ESA, The Hipparcos and Tycho Catalogues](https://www.cosmos.esa.int/web/hipparcos/catalogues), *License and credit* | “The Hipparcos and Tycho Catalogues are distributed under the CC BY-NC 3.0 IGO licence” and “Credit: ESA” | This page covers the 1997 catalogues, which CDS lists as I/239. |
| [ESA SP-1200, Volume 1](https://www.cosmos.esa.int/documents/532822/552851/vol1_all.pdf), copyright page | “©1997 European Space Agency” | The catalogue's copyright page identifies ESA. |
| [ESA, The Hipparcos-2 Catalogue](https://www.cosmos.esa.int/web/hipparcos/hipparcos-2), *Astrometric Data*, item 2 | “A copy of the VizieR data is available from the ESA legacy archive” | ESA identifies I/311 as the later iteration of van Leeuwen's 2007 reduction, with its copy in `hipparcos2_cds`. The page gives no licence specific to I/311. |
| [ESA Science Data Centre](https://www.cosmos.esa.int/web/esdc), archive navigation | “Astronomy Science Archives” | Archive landing page. |
| [ESA ESASky catalogues](https://www.cosmos.esa.int/web/esdc/esasky-catalogues#Legacy:Hipparcos), Hipparcos legacy tables, product 25 | “The Hipparcos Main Catalogue” | ESA lists both `hipparcos2_cds.hip2` and `hipparcos2_dvd.hip2` under Hipparcos-2. |
| [ESA Space Science Archives terms](https://www.cosmos.esa.int/web/esdc/terms-and-conditions#TC1), opening paragraph, item 2 and Hipparcos credit row | “Data hosted in the ESA Space Science Archives are distributed under the CC BY-NC 3.0 IGO licence.” Item 2 begins “Prior to any commercial use by the User of any Data or Data Product”. The credit row says “Credit: ESA”. | The terms call for prior authorisation for commercial use of archive data and data products. |
| [CDS General Terms and Conditions](https://cds.unistra.fr/legals/), *Citation* and *Licences* | “The Data Sets must be cited in any work or product that uses them” and “This specific licence is provided on the Dataset page.” | The citation text and licensing provisions recorded in `LICENSING.md` on 2026-09-29 still match their corresponding text. The page still displays January 7, 2026 as its last update. |
| [VizieR I/311 catalogue record](https://cdsarc.cds.unistra.fr/viz-bin/cat/I/311), title and related catalogue (indexed provider copy) | “Hipparcos, the New Reduction : I/311” and “I/239 : The Hipparcos and Tycho Catalogues (ESA 1997)” | The indexed record distinguishes the two catalogues. No licence line appeared in the available text. |
| [VizieR I/311 ReadMe](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/I/311?format=html&tex=true), *Byte-by-byte Description of file: hip2.dat* (indexed provider excerpt) | “Right Ascension in ICRS, Ep=1991.25” and “Proper motion in Right Ascension” | The indexed excerpt identifies the astrometric fields. A complete current ReadMe could not be verified. |
| [VizieR search for I/311](https://vizier.astro.unistra.fr/local//viz-bin/VizieR-3?-source=I%2F311), indexed search table | “Hipparcos, the New Reduction (van Leeuwen, 2007)” | The table lists I/311/hip2 as the Astrometric Catalogue. |
| [VizieR service home](https://vizier.cds.unistra.fr/), service notice | “Last updated November 09, 2026” | The service home served the incident notice. |
| [IANA Time Zone Database](https://www.iana.org/time-zones), database overview | “The Time Zone Database (often called tz or zoneinfo) contains code and data” | IANA maintains the database and links to its releases. |
| [NAIF, Rules Regarding Use of SPICE](https://naif.jpl.nasa.gov/naif/rules.html), *Kernels Redistribution* | “Redistribution of SPICE kernels distributed by NAIF is permitted as long as they have not been modified.” | The fetched page's SHA-256 matches the 2026-11-13 reading in `LICENSING.md`. The quoted rule covers kernel redistribution. |

### IANA archive licences

Downloaded from IANA and read on 2026-11-20. The first paragraph of
`LICENSE` in the digest-verified 2025c archive reads:

> Unless specified below, all files in the tz code and data (including
> this LICENSE file) are in the public domain.

The same excerpt appears in the other two archives. All three licence files
list the same BSD exception for named files outside the probe table inputs.

| IANA archive | SHA-256 of downloaded archive |
| --- | --- |
| [tzdata2021a.tar.gz](https://data.iana.org/time-zones/releases/tzdata2021a.tar.gz) | `39e7d2ba08c68cbaefc8de3227aab0dec2521be8042cf56855f7dc3a9fb14e08` |
| [tzdata2025c.tar.gz](https://data.iana.org/time-zones/releases/tzdata2025c.tar.gz) | `4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957` |
| [tzdata2026f.tar.gz](https://data.iana.org/time-zones/releases/tzdata2026f.tar.gz) | `01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d` |

### Sources that could not be read directly

- [VizieR rules for data usage](https://cds.unistra.fr/vizier-org/licences_vizier.html)
  returned HTTP 404 on 2026-11-20. Alternate VizieR addresses also failed.
  The prior reading in `LICENSING.md` (2026-09-29) records “are free of
  usage in a scientific context” and “The commercial usage of the data is
  subject to rules depending of the origin”. Whether the page or these
  terms changed since that reading is unverified.
- The direct I/311 record and ReadMe URLs above and
  [the raw ReadMe](https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe) could
  not be read on 2026-11-20. The catalogue service and alternate CDS hosts
  returned a certificate error, a timeout or HTTP 404. The available
  indexed provider text supports provenance and field names. The prior
  finding of no catalogue-specific licence line (2026-09-29) remains the
  last complete reading in the licence record.
- IERS EOP 20 C04 and Reid and Brunthaler's two measured values carry
  forward the open questions in the 1.1.0 licence record. This ticket
  did not reopen their sources.

No provider was contacted.

## Why the Hipparcos question is open

ESA's 1997 catalogue notice gives the licence for I/239. ESA also says it
holds a copy of the I/311 data in the legacy archive, and its archive terms
expressly address data hosted there. The package used the CDS distribution
of van Leeuwen's 2007 reduction, I/311. Whether the archive terms reach
individual measurements taken through the CDS remains open. The proposed
notice gives ESA's mission credit exactly as requested, alongside van
Leeuwen's citation. The record leaves the legal status of individual
measured facts open.

### Count from the engine source

Each number below counts a scalar field in the built-in `star(...)`
calls in [`src/vedic/ayanamsa.ts`](../../../src/vedic/ayanamsa.ts). The
I/311 subtotal uses `ra`, `dec`, `pmRa`, `pmDec` and `parallax`
for each of its stars. The source of each radial velocity is identified
in `NOTICE`. Sgr A* has only four published values. Its two zero
placeholders and the calculation epochs are outside this count.

| Object | VizieR I/311 | Other CDS values | Reid and Brunthaler | Total |
| --- | ---: | ---: | ---: | ---: |
| Spica | 5 | 1 (SIMBAD radial velocity) | 0 | 6 |
| zeta Psc A | 5 | 1 (III/252 radial velocity) | 0 | 6 |
| delta Cnc | 5 | 1 (J/A+A/430/165 radial velocity) | 0 | 6 |
| Sgr A* | 0 | 2 (SIMBAD position) | 2 (proper motion) | 4 |
| Total | 15 | 5 | 2 | 22 |

The CDS total is 20. Hipparcos supplies nine measurement groups (position,
proper motion and parallax for each of three stars), or 15 scalar values
on the same basis as the 22-value total used in the licence record.
The draft uses 15.

## Applying the draft

[LICENSING.patch](LICENSING.patch) and [NOTICE.patch](NOTICE.patch) were
generated against `origin/main` at `5633889`. Both pass
`git apply --check` there and at the ticket's original base, `3962adc`.
`git diff 3962adc 5633889 -- LICENSING.md NOTICE` is empty.

The host-probe paragraph is a separate hunk in each patch. Ticket 10
should include those two hunks only if pull request 128 ships in rc.4.
Its correction 18 and generator at `f8a7e7e` give the same releases
and digests as the IANA downloads above. The zone histories stay on
2026f with America/Yellowknife held at 2025c.

Pull request 94's README and licence review at `d0be097` were read on
2026-11-20 as background. The existing DE440 acceptance stays as recorded.
`git diff 322f855 origin/main -- src/de440/` produced no output.
`conformance/RESULTS.md` gives the sealed pack's SHA-256 as
`51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7`.

### Probe digest check

Run this script with the scratch checkout path after applying both full
patches. It checks the release and digest pairs within each probe paragraph.
The check printed `Both host-probe paragraphs match all three IANA digests.`

```sh
set -eu
cd "${1:?pass the scratch checkout containing the patched files}"

licensing=$(awk '/^From 1970 conversion uses/{show=1}
  /^## Leap-second and UT1 data/{show=0} show' LICENSING.md)
notice=$(awk '/^comes from the host runtime.s Intl\/ICU data/{show=1}
  /^The core carries TAI/{show=0} show' NOTICE)

while read -r release digest; do
  for file in LICENSING.md NOTICE; do
    case "$file" in
      LICENSING.md) paragraph=$licensing ;;
      NOTICE) paragraph=$notice ;;
    esac
    if ! printf '%s\n' "$paragraph" | tr -d '\140' | tr '\n' ' ' |
      grep -Eq "tzdata${release}\.tar\.gz \(SHA-256[[:space:]]+${digest}\)"; then
      printf '%s is missing the correct tzdata %s digest\n' "$file" "$release" >&2
      exit 1
    fi
  done
done <<'DIGESTS'
2021a 39e7d2ba08c68cbaefc8de3227aab0dec2521be8042cf56855f7dc3a9fb14e08
2025c 4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957
2026f 01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d
DIGESTS

printf '%s\n' 'Both host-probe paragraphs match all three IANA digests.'
```

## Acceptance

- [x] Provider source readings, excerpts and access gaps are recorded.
- [x] The ESA question follows outcome (b), supported by ESA's published terms.
- [x] Both patches apply to main and are limited to the named paragraphs.
- [x] The counts in the patches match the shipped source.
- [x] Both answers are quoted with their times. The 11:16 answer supersedes
  the 10:37 answer and records all four licence questions as noted and open.
- [x] The commit changes only these evidence files.
- [x] No message was sent to any provider.
