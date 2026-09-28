# Historical time atlas

A dataset of what civil clocks showed, where and when, with a primary source
for every rule. This first slice covers the United States and France,
including Alsace and Moselle under German rule, from 1 January 1870 to the end
of 1919: local mean time, then railway or city time, then standard time, and
summer time where it applied. `COVERAGE.md` lists the places and what is left
out.

The data are licensed under the Creative Commons Attribution 4.0
International licence (`LICENSE`). They are not part of the `@zodiacs/engine`
npm package: the package's `files` list leaves `atlas/` out.

## What is here

| path | what it is |
| --- | --- |
| `data/atlas.json` | the manifest: version, coverage window, the data files, the longitude source |
| `data/places.json` | covered places: GeoNames id, coordinates, the jurisdiction whose rules they follow, the tzdb zone they are compared with |
| `data/rules-*.json` | jurisdictions (a place's sequence of rules) and the rules themselves |
| `data/citations-*.json` | the primary sources, one entry per passage relied on |
| `data/leads.json` | secondary works and tzdb comments that pointed to sources; never cited |
| `data/tzdb-explanations.json` | why the atlas differs from tzdb, each explanation with its citations |
| `schema/atlas.schema.json` | JSON Schema (2020-12) for every data file |
| `tools/` | the resolver, the checks, the tzdb extract and comparison |
| `tzdb/` | the tzdb 2025c extract the comparison reads, and the differences found |
| `TZDB-DIFFERENCES.md` | every difference from tzdb 2025c with backzone, explained, and where they agree |
| `CORRECTIONS.md` | how corrections are accepted, and the log of accepted ones |

## The rules for the data

1. **Every rule cites a primary source**: a law or decree as published, an
   official gazette, a municipal notice or council record, a contemporary
   newspaper report, or a railway notice or timetable. Books, websites and
   tzdb's comments are not citations; where they pointed to a source they are
   recorded in `data/leads.json`.
2. **Only what was fetched and read is cited.** Each citation records its
   type, title, date, issuer, a stable URL, the date it was retrieved, a page
   and column locator, and a verbatim excerpt of at most 40 words in the
   original language (words are runs of text between spaces; an omission is
   marked `[...]`, which counts as one). `excerptBasis` says whether the
   excerpt was transcribed from the page image, copied from the archive's
   OCR (including the text its search service returns), or taken from the
   OCR and corrected against the image. `checks` records each later
   comparison of the excerpt with the source: against the page image, the
   archive's OCR text of the page, or the text an archive's search service
   returns for the page (Gallica's ContentSearch, used because Gallica's
   page and image servers refused automated requests), with the result,
   `matches` or `partial`, and a note naming any words the method could not
   confirm. A source that could
   not be fetched and read is not cited; the rule's uncertainty says so
   instead.
3. **No proprietary atlas is consulted or copied.** tzdb (public domain) is
   the comparison base, not a source.
4. **Each rule has a version, an uncertainty flag, and boundaries given as
   precisely as the sources allow**, with a window where they allow a
   range.

## How a rule reads

A jurisdiction is a set of places that followed the same sequence of rules
over the whole window. Its `timeline` lists rule ids in order, for the
`civil` clock and, where the sources describe one, the `railway` clock (the
time kept inside stations and in timetables where it differed from civil
time). A rule may appear in several jurisdictions.

- `offset` is `{"type": "fixed", "seconds": s}`, seconds east of Greenwich,
  or `{"type": "local-mean-time"}`: the place's own mean solar time, 240
  seconds per degree of longitude east, from the place's longitude. Offsets
  are not rounded to whole seconds: a fixed offset is the figure the sources
  give (−17761.62 s for New York, from a clock stopped for 3 min 58.38 s),
  and a mean time is only as exact as the longitude it is computed from.
- `start` and `end` are the instants the rule began and stopped. Each is
  written as a wall-clock reading `local` on the clock named by `reckoning`:
  `before` is the clock in force just before the instant, `after` the one in
  force just after it, `utc` is Greenwich. A rule's `start` and the previous
  rule's `end` describe the same instant. `precision` says how exactly the
  sources fix it (`second`, `minute`, `hour`, `day`, `days`, `weeks`), and a
  `window` gives the earliest and latest readings the sources allow.
  `kind: "coverage"` marks the edge of the atlas window, not a historical
  change.
- `uncertainty.flag` is `documented` (the cited sources state the offset
  and the change for this place, or for a law covering it, over the rule's
  whole period), `inferred` (they follow from the sources by a stated
  assumption: a time reported at one moment carried back to 1870, a
  national law applied in a town no source mentions, a city placed in the
  zone whose time it kept), or `uncertain` (the sources leave the offset or
  the date open, or disagree; the atlas gives its best reading).
  `uncertainty.reason` says why in one line.
- `version` starts at 1 and increases with every change to the rule;
  `changes` says what changed.
- `isDst` marks summer time; `abbreviation` is informational.

## The resolver

```bash
node atlas/tools/resolve.mjs --place fr-brest --local 1885-06-01T12:00
node atlas/tools/resolve.mjs --jurisdiction fr-general --department 44 --longitude -1.55 --local 1885-06-01T12:00
node atlas/tools/resolve.mjs --place fr-paris --local 1905-06-01T12:00 --clock railway
node atlas/tools/resolve.mjs --place us-new-york --utc 1883-11-18T17:00:00Z
```

`--local` takes a reading on the place's clock, `YYYY-MM-DDTHH:MM` or
`YYYY-MM-DDTHH:MM:SS`, and prints the instant or instants it denotes. `--utc`
takes a UTC time in the same form, with or without a trailing `Z`, always as
UTC whatever the host's time zone (any other offset is refused), and prints
what the place's clock read then, and whether that reading occurred once or
more than once. `--clock` is `civil` (the default) or `railway`.

A place not listed in `data/places.json` can be read by longitude only in a
jurisdiction that allows it (`readByLongitude`; in this slice `fr-general`),
and only with its département (`--department`, the code as today, `2A` and
`2B` for Corsica): the resolver refuses a département the jurisdiction does
not cover, with the reason (Alsace and Moselle, the départements occupied in
part in 1914-1918, Paris, which has its own jurisdiction), and a longitude
outside the area the département belongs to.

It prints JSON. `status` is `ok` (one instant), `ambiguous` (clocks were set
back and the reading happened more than once; every instant is listed,
earliest first), `nonexistent` (clocks were set forward over the reading; the
one instant given is the reading on the clock in force before the change,
which is the usual policy), `out-of-coverage` (outside the atlas window), or
`no-such-clock` (the jurisdiction keeps no separate clock of that kind: a
railway clock is kept only where the sources describe railway time differing
from civil time). Each instant carries the offset, the rule and its version,
the citations, and the uncertainty flag with its reasons. Where the sources
fix a change of offset only within a window, or to the hour or worse, the
reading is flagged `uncertain` when that span contains it: from `--utc`,
when the instant falls in the span; from `--local`, when the reading falls
in the span as read on either clock, since the change may have come before
or after it. A change of legal basis that left the clocks as they were never
makes a reading uncertain. The exit status is 0 for `ok`, 2 for `ambiguous`
or `nonexistent` (the answer is still printed), 3 for `out-of-coverage`, 4 for
`no-such-clock`, and 1 for an error, including a place or longitude the
atlas does not cover. The library is `tools/lib.mjs` (`loadAtlas`,
`buildTimeline`, `resolve`, `resolveUtc`, `resolveWall`, `wallAt`,
`placeFor`).

## Checks

```bash
npm run atlas:check
```

runs `node atlas/tools/check.mjs` and the tools' self-test
(`node --test atlas/tools/selftest.mjs`). The check validates every data file
against the schema; requires every rule to cite at least one citation and
every citation to have a URL, a retrieval date, a locator, an excerpt of at
most 40 words and a record of how it was checked; checks that every
referenced id exists and nothing is left unused; checks that every place's
timeline covers the window with no gap or overlap, and that the listed places
lie inside the areas their jurisdiction may be read by longitude in; round-trips
local time to UTC and back at every boundary and inside every rule; and
checks that the tzdb comparison is current and that every difference is
matched by exactly one explanation, on its place, zone, rule and both
offsets. A missing tzdb extract is a failure, not a skipped step. CI runs it
(`.github/workflows/atlas.yml`).

To rebuild the tzdb extract, compile tzdata 2025c with backzone by the L3
conformance recipe (`conformance/arbiters/l3/README.md`) and run
`node atlas/tools/tzdb-extract.mjs --zoneinfo DIR`; then
`node atlas/tools/compare-tzdb.mjs` rewrites `tzdb/differences.json` and
`TZDB-DIFFERENCES.md`.

## How to cite

> Zodiacs.org historical time atlas, version 0.1.0 (2026-09-28),
> https://github.com/zodiacs-org/engine/tree/main/atlas, licensed CC BY 4.0.

Cite the rule ids and versions you relied on. Place coordinates come from
GeoNames (https://www.geonames.org/, CC BY 4.0); keep that attribution when
you redistribute `data/places.json` (see `longitudeSource` in
`data/atlas.json` for what was copied). The texts of the sources, printed
between 1870 and 1919, are in the public domain. The scans and OCR text
through which they were read are the archives' (Gallica, the Library of
Congress, the Internet Archive); the atlas copies neither, and links to them
and quotes short excerpts of the texts only.
