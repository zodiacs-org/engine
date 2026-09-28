# Licensing of the time atlas

The atlas is not part of the `@zodiacs/engine` npm package: the package's
`files` list leaves `atlas/` out. Two licences apply to its files.

## The data: CC BY 4.0

`data/` (the places, the jurisdictions and rules, the citations with their
excerpts and glosses, the leads, and the explanations of the differences from
tzdb) is licensed under the Creative Commons Attribution 4.0 International
licence, as the owner decided on 2026-09-28; `LICENSE` holds its text. The
same licence covers what is generated from the data, `tzdb/differences.json`
and `TZDB-DIFFERENCES.md`, and the documentation: `README.md`, `COVERAGE.md`,
`CORRECTIONS.md` and this file. `README.md` says how to cite the atlas.

## The tools and the schema: MIT

`tools/` (the resolver, the checks, the tzdb extract and comparison, and the
self-test with its invented fixture) and `schema/atlas.schema.json` are
licensed under the MIT licence, like the rest of the repository's code. Its
text is the repository's root `LICENSE`.

## What the atlas quotes and copies

- Every rule cites primary sources (laws, gazettes, municipal notices,
  newspapers, railway notices) by link and short excerpt; no scan or full
  text of a source is committed. The source texts, printed between 1870 and
  1919, are in the public domain. The scans and OCR text through which they
  were read are the archives' (Gallica, the Library of Congress, the
  Internet Archive), each under its own terms, and are not copied. The
  data's licence covers the atlas's own work, not the texts its excerpts
  quote.
- No proprietary atlas was consulted or copied.
- Place names, coordinates and ids come from GeoNames `cities15000`, and
  region names from its `admin1CodesASCII.txt`, both CC BY 4.0;
  `data/atlas.json` records the files' digests and what was copied. Keep
  that attribution when you redistribute `data/places.json`.
- `tzdb/tzdb-2025c.json` is an extract of tzdb 2025c with backzone, in the
  public domain like tzdb itself, and is used only as the comparison base.
