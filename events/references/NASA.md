# NASA eclipse catalog references

The fixture is selected numerical data from NASA GSFC's
[solar catalog](https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html) and
[lunar catalog](https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html).
Attribution: **Eclipse Predictions by Fred Espenak and Jean Meeus (NASA's GSFC)**.

The source publications are Fred Espenak and Jean Meeus, *Five Millennium
Canon of Solar Eclipses*, NASA TP-2006-214141, and *Five Millennium Catalog
of Lunar Eclipses*, NASA TP-2009-214173. The web catalogs and their keys were
fetched and read for this milestone. The
[solar key](https://eclipse.gsfc.nasa.gov/SEcat5/SEcatkey.html), columns headed
TD of Greatest Eclipse and Eclipse Type, and the
[lunar key](https://eclipse.gsfc.nasa.gov/LEcat5/LEcatkey.html), the corresponding
columns, define the copied fields. The Acknowledgments section of each key
permits reproduction of the data with the attribution above. This permission
covers these copied numbers; they are not relabeled as this project's MIT code.
Retain the attribution and provenance when redistributing the fixture.

## Acquisition and offline reproduction

`nasa-cases.json` selects catalog numbers and dates, expected coarse classes,
model radii, scan steps and a comparison threshold. These choices were recorded
before any engine date comparison. `nasa.json` contains the normalized selected
rows, their SHA-256 digests, parsed dates and types, the selection configuration,
retrieval date on UTC, source URLs and full downloaded-page digests. Each catalog
number locates its row on the source page. The catalog's Delta T, lunation and
Saros fields are preserved for provenance and are not used to calculate dates.
No engine output enters the reference acquisition or parsing code.

From the repository root:

```sh
python3 events/scripts/nasa.py --acquire events/generated/nasa
python3 events/scripts/nasa.py --verify events/references/nasa.json
python3 events/scripts/nasa.py --verify events/references/nasa.json --source-dir events/generated/nasa
npm test --prefix events
```

Acquisition writes full HTML pages, catalog keys and a candidate fixture only
below the gitignored `events/generated/` folder. Review that candidate before
copying it to `references/nasa.json`. Requests use Python's standard HTTPS
client with bounded responses and timeouts. HTML is decoded as Latin-1 to
preserve the legacy pages' non-UTF-8 punctuation; selected numeric row fields
and the attribution are ASCII. Row digests cover whitespace-normalized text,
while page digests cover the original bytes. No page markup, images, ephemeris
code or coefficient tables are committed.

Offline verification reproduces dates and types from the committed rows,
checks their digests and matches the selection, source URLs and attribution.
It cannot authenticate a source page from its digest alone. The optional
`--source-dir` additionally verifies downloaded-page digests and reproduces
selected rows from those pages. Live pages may change, so a later acquisition
need not have identical full-page digests. Normal tests require Python and
use the committed rows without network access.

## Event definitions, clocks and comparison limits

The solar key defines greatest eclipse by the Moon's shadow axis approaching
Earth's center most closely. The lunar key defines it by the Moon's center
approaching Earth's shadow axis most closely. Those definitions match the
workbench's minimum-distance objective. NASA's
[Time page](https://eclipse.gsfc.nasa.gov/LEcat5/time.html), Terrestrial Dynamical
Time section, explains that its TD name denotes TT. The parser retains a TD
label without a UTC suffix and converts its calendar fields to a numeric TT
label. Tests request the engine on TT. They do not subtract catalog Delta T
or interpret a catalog time as UTC. The synthetic epoch test independently
checks the parser's clock arithmetic.

The catalogs use VSOP87 and ELP-2000/82, as their keys' Eclipse Predictions
sections explain. The workbench uses the parent's apparent geocentric vectors
and its spherical shadow model. Its Sun and Moon corrections differ, and the
model omits Earth's flattening and atmospheric shadow enlargement. The model's
chosen radii in kilometers and conversion to au are explicit in the selection
file. They are test inputs, not a claim to reproduce NASA's full physical model.

The acceptance threshold is three minutes on TT, enforced by
[nasa.node-test.ts](../test/nasa.node-test.ts) over exactly the selected dates from
2017-08-21 through 2025-03-29. It allows model and ephemeris differences and
catalog rounding; it is not a physical error bound. The scan uses hourly cells
and a one-minute derivative step, also enforced by that test. Each comparison
searches the entire catalog date with boundary padding, then requires a single
event in that date and the declared class. Millisecond root brackets describe
numerical refinement only.

Solar total, annular and hybrid examples are checked as central; the selected
partial example is checked as partial. The API does not identify total,
annular or hybrid solar types. Lunar examples check total, partial and penumbral
classes under the declared spherical model. These comfortably classified
examples do not validate marginal eclipse classification, contact times,
local visibility, century-wide completeness or dates outside the selection.
The ordinary analytic eclipse tests continue to enforce sampling limitations.

[nasa_test.py](../scripts/nasa_test.py) checks independent epoch arithmetic,
HTML row extraction, duplicate and missing rows, invalid dates and provenance
tampering. Those parser checks establish numerical and data handling behavior,
not astronomical accuracy. No Swiss Ephemeris material or birth data is used.
