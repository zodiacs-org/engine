# Licensing of the time atlas

The atlas is not part of the `@zodiacs/engine` npm package: the package's
`files` list leaves `atlas/` out. Two licences apply to its files.

## The data: CC BY 4.0

`data/` (the places, the jurisdictions and rules, the citations with their
glosses, the leads, and the explanations of the differences from tzdb) is
licensed under the Creative Commons Attribution 4.0 International licence,
as the owner decided on 2026-09-28; `LICENSE` holds its text. The same
licence covers what is generated from the data, `tzdb/differences.json` and
`TZDB-DIFFERENCES.md`, and the documentation: `README.md`, `COVERAGE.md`,
`CORRECTIONS.md` and this file. `README.md` says how to cite the atlas.

## The tools and the schema: MIT

`tools/` (the resolver, the checks, the tzdb extract and comparison, and the
self-test with its invented fixture) and `schema/atlas.schema.json` are
licensed under the MIT licence, like the rest of the repository's code. Its
text is the repository's root `LICENSE`.

## What the atlas quotes and copies

- Every rule cites primary sources by link and short excerpt; no scan or
  full text of a source is committed. As far as we could establish, every
  text quoted is in the public domain: the laws, decrees, gazettes and
  official notices are official texts, which copyright does not protect (in
  France by settled case law, in Germany under § 5 UrhG, in the United
  States under 17 U.S.C. § 105); the parliamentary debates quoted are
  speeches made in the Senate on 17 February 1891 by Hervé Faye, who died in
  1902, and Pierre Lacombe, who died in 1918; the newspaper reports and
  railway notices quoted are unsigned items published before 1920, whose
  protection as anonymous or collective works (70 years from publication in
  France and Germany) has expired; and every United States publication
  quoted appeared before 1931. No quoted passage comes from a signed
  article; a correction that cites one must show that its author died more
  than 70 years ago (longer in France for an author mort pour la France) or
  rely on the right of short quotation, and say which. The scans and OCR
  through which the sources were read are the archives', each under its own
  terms, and are not copied. The data's licence covers the atlas's own work,
  not the texts its excerpts quote.
- No proprietary atlas was consulted or copied.
- Place names, coordinates and ids come from GeoNames `cities15000`, and
  region names from its `admin1CodesASCII.txt`, both CC BY 4.0;
  `data/atlas.json` records the files' digests and what was copied. Keep
  that attribution when you redistribute `data/places.json`.
- `tzdb/tzdb-2025c.json` is an extract of tzdb 2025c with backzone, in the
  public domain like tzdb itself, and is used only as the comparison base.
