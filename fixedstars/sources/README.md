# Source decisions before catalog import

[manifest.json](manifest.json) records the documents fetched and read on
2026-10-14, their locators and the astrometric import contract.
[retrieval.json](retrieval.json) records the byte digests of the fetched
resources and the HYG CSV header. The reproducible command is:

```sh
node fixedstars/scripts/audit-sources.mjs --check
```

This explicit network check streams resources into a hash and discards them.
It never saves the bulk catalog or the full book. Offline Vitest checks the
record's consistency and the retrieval tool's refusal behavior. A matching
digest proves input identity; it does not prove the source's astrometry,
our reading of it, or the engine's accuracy.

## Astrometry

HYG v4.1 is selected because its publisher gives explicit redistribution
terms. Use only entries with a HIP identifier in the initial catalog. The
HYG README's general notes say the epoch and equinox are 2000.0. Its fields
describe RA, declination and proper motion, but do not explicitly distinguish
ICRS from the dynamical mean equator and equinox or state the cosine factor.

ESA SP-1200, volume 1, section 1.2.2, printed p. 22, says Hipparcos positions
and proper motions refer to ICRS. Section 1.2.5 and table 1.2.2, printed p. 25,
define the original epoch as J1991.25 on TT, the RA motion as
mu_alpha_star = (d alpha / dt) cos(delta), and the year as a Julian year.
The fetched PDF is the section extract linked in the manifest. The author's
AT-HYG build notes, under Tycho-2 positions, state that HYG's Hipparcos
positions were brought to epoch 2000 by applying proper motion. They describe
no frame-bias rotation in that adjustment.

Our explicit inference for the HIP-backed HYG subset is to retain the
Hipparcos ICRS axes and tangential RA motion, with HYG's epoch adjustment
already applied. This is an interpretation of the provider's documentation,
not proof that HYG has an exact homogeneous ICRS reduction. HYG does not
provide a per-row reduction history or uncertainties, and binary-star and
cross-identification errors remain possible. Do not call this a precision
catalog, use it as an arbiter of accuracy, or claim an astrometric error bound.

Read HYG RA in hours and multiply by 15 for degrees; declination is degrees
with north positive. Motion is milliarcseconds per Julian year, with eastward
RA tangent and northward declination components. Empty motion is unavailable,
not zero. Zero is accepted only when explicitly tabulated, without claiming
it was a significant measurement. A HIP identifier alone is not a license to
fill absent HYG fields from a different service. Preserve the raw selected
row and its identifiers so the interpretation and arithmetic are reviewable.

The CatalogStar contract is on the mean equator and equinox of J2000.
The importer does not directly relabel the interpreted ICRS source values.
It rotates the unit direction and its proper-motion tangent vector through the
engine's ICRS-to-J2000 bias matrix, using transpose(frameMatrix(
"equatorial-icrs", time)) from src/calc-frames.ts. Reproject the rotated
tangent onto the rotated RA and declination bases. Preserve the source
frame interpretation and this derivation in each row's provenance. M4 then
applies motion and the existing true-of-date engine frame/nutation helpers
on the chart's TT clock. Do not adjust HYG from J1991.25 a second time.

The catalog will use direction and tangential motion only. It will not add
stellar parallax, radial-velocity perspective acceleration, annual aberration,
or gravitational light deflection. Nutating the axes does not add those
corrections; star results must say so when compared with apparent chart bodies.

## Historical attributions

[lore-passages.json](lore-passages.json) holds our short transcriptions from
the original 1822 edition. The printed title page, and printed pp. 25 to 30
of Book I, chapters IX to XI, were read from the PDF and its page images.
Each excerpt names its exact row or paragraph, printed page and PDF page.
OCR was a reading aid; the committed passages were checked against images.
Line wrapping, hyphenation at a line break and typographic ligatures are
normalized; footnote symbols are omitted and recorded in the notes. We do
not copy the scan or the full OCR text.

The later Sacred Texts transcription has different pagination, and its title
page adds a noncommercial file-use condition. It was a lead only. The primary
1822 scan supplies the locators and text here. Neither source supplies our
astrometry. We do not consult or copy a modern Robson transcription.

The records distinguish named stars from constellation-wide or descriptive
group statements. A constellation attribution can be associated with one of
its catalog stars only with that scope preserved; it is not a quotation in
which Ptolemy names that star. Omit a lore tag if its identification cannot be
justified. In particular, a vague description such as the last star in a
river is not automatically an identification with a modern southern star.
Graded wording such as partly or moderately is retained in the interpretation.
The cited text describes historical beliefs, not observed physical effects.

## Selected raw rows and regeneration

[selection.json](selection.json) is the explicit selection, with expected HYG
proper names, HIP identifiers, constellation codes, historical aliases and
lore mapping decisions. Only tabulated magnitudes below 3.5 are eligible,
as enforced in scripts/build-catalog.mjs and tests/catalog.fixedstars.mjs for
the full committed selection and constructed rejection cases. This is a
selection rule, not an astrometric uncertainty bound or a historical rank.
[hyg-selected.json](hyg-selected.json) retains the exact CSV header and each
selected original CSV line, plus the verified source digest and byte count.
It copies only the selected rows, not the bulk catalog. All selected HYG data
and their transformed catalog retain CC BY-SA terms and source attribution.

The catalog generator and its checks are described in the project README.
Change the selection or generator, then regenerate src/catalog-data.ts;
do not edit generated positions by hand. Regeneration from saved raw rows
is an offline consistency check. catalog:fetch independently verifies the
whole remote source digest before saving any selection. A digest of the full
source cannot by itself authenticate a subset edited after extraction; the
explicit re-fetch checks that subset against the pinned remote file.

The data licensing boundaries and catalog notices are in
[../LICENSING.md](../LICENSING.md) and [../NOTICE.txt](../NOTICE.txt).
