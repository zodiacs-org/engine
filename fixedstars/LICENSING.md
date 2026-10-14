# Fixedstars source licences

Original code and documentation in this folder use the repository's
[MIT licence](../LICENSE). The parent engine's licence and notices continue
to apply to its code and data. This folder is excluded from its npm package.

The selected astrometry source is David Nash / Astronexus, HYG Database,
version 4.1, at the revision in [sources/manifest.json](sources/manifest.json).
Both its root LICENSE and its HYG README explicitly apply
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The [legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
was read, particularly sections 2, 3 and 4. Redistribution and adaptation
are permitted, including commercial uses, with attribution, a licence link,
retention of supplied notices, and identification of changes. Adapted
material retains ShareAlike terms. The extracted and transformed catalog in
src/catalog-data.ts, its raw selected-row fixture in sources/hyg-selected.json,
the selection metadata in sources/selection.json, and adaptations of those
data are CC BY-SA 4.0, rather than MIT. NOTICE.txt identifies row selection,
unit conversion and frame conversion. The private project's licence expression
is MIT AND CC-BY-SA-4.0; this does not change the parent engine's licence
expression or packed material.
This permission comes from HYG's explicit licence; it does not assert that
the underlying Hipparcos, Yale or Gliese datasets are public domain.

The historical excerpts in sources/lore-passages.json come from Ptolemy,
*Tetrabiblos*, translated by J. M. Ashmand, London: Davis and Dickson, 1822.
The original book's text is public domain in the United States by publication
date. We transcribe short passages from the printed pages of the IAPSOP scan,
with line wrapping, ligatures and footnote markers normalized as described in
the source notes. No scan, OCR corpus or modern website layout is committed.
The original annotations and transcription records are MIT; no new exclusive
rights are claimed in the public-domain text. Lore is historical attribution,
not astronomical evidence or a claim of predictive validity.

ESA's *The Hipparcos and Tycho Catalogues* (1997), volume 1, section 1.2,
is consulted for definitions only. A short quotation and paraphrased
conventions are recorded with a citation. No ESA catalog rows or PDF are
redistributed here, and we assert no redistribution licence for that work.
The Astronexus build notes are consulted for the author's account of HYG's
epoch adjustment, without importing the AT-HYG catalog.

The Sacred Texts Ashmand transcription was read as a lead. Its title page
allows noncommercial file reuse only. Its files and redactor's text are
therefore not used as imported material; the original printed edition is the
source for our own transcriptions. The sources record preserves this decision
and the difference in pagination.

Retain [NOTICE.txt](NOTICE.txt) and the in-tree source records when using the
catalog. Each imported astrometric row identifies its HYG row and
HIP identifier. Each lore attribution must identify its printed passage and
whether it is about a named star, a described star group, or a constellation.
