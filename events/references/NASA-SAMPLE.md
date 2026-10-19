# Broader NASA eclipse sample

The fixed selection in [nasa-sample-plan.json](nasa-sample-plan.json) takes every
solar and lunar catalog entry in 1900, 1925, 1950, 1975, 2000, 2025, 2050,
2075 and 2100. The years, model radii, hourly scan, one-minute derivative
half-width and three-minute TT comparison threshold were recorded before
comparing the engine. No date was excluded after comparison. The original
phase 1 NASA selection and its tests remain unchanged.

[nasa-sample.json](nasa-sample.json) contains the selected numerical rows and
the complete normalized numerical tables used to reproduce that selection.
The source pages are NASA GSFC's solar catalogs for
[1801 to 1900](https://eclipse.gsfc.nasa.gov/SEcat5/SE1801-1900.html),
[1901 to 2000](https://eclipse.gsfc.nasa.gov/SEcat5/SE1901-2000.html) and
[2001 to 2100](https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html), and its
lunar catalogs for
[1801 to 1900](https://eclipse.gsfc.nasa.gov/LEcat5/LE1801-1900.html),
[1901 to 2000](https://eclipse.gsfc.nasa.gov/LEcat5/LE1901-2000.html) and
[2001 to 2100](https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html).
The first page of each kind supplies the endpoint year 1900.
Table rows outside the chosen years are selection evidence only and have
no engine date comparison in this milestone.

These pages, the [solar key](https://eclipse.gsfc.nasa.gov/SEcat5/SEcatkey.html),
the [lunar key](https://eclipse.gsfc.nasa.gov/LEcat5/LEcatkey.html) and the
[time explanation](https://eclipse.gsfc.nasa.gov/LEcat5/time.html) were fetched
and read. Source metadata records each URL, UTC retrieval timestamp and SHA-256
of the original downloaded bytes. Numerical table excerpts have their own
digests. No HTML, images, coefficient tables or contact details are stored.

The fixture retains the acknowledgment required by the keys' Acknowledgments
sections. The authors, publications and data reproduction permission are
recorded in [NASA.md](NASA.md). That permission covers these numerical data;
retain their acknowledgment and provenance when redistributing them. The
project's code license does not replace those attribution terms.

## Reproduction

From the repository root, after installing and building the events project:

```sh
python3 events/scripts/nasa_sample.py --acquire events/generated/nasa-sample
python3 events/scripts/nasa_sample.py --verify events/references/nasa-sample.json
python3 events/scripts/nasa_sample_test.py
node events/scripts/nasa-sample-timing.mjs --check
npm test --prefix events
```

Acquisition uses bounded, sequential HTTPS requests. It reads each page in
memory and writes only the candidate fixture under the ignored generated
directory. Review a new candidate before copying it to the references folder.
The tool does not import or call the engine. Offline verification reconstructs
selected events from the numerical tables and checks source routing, complete
century year coverage, consecutive catalog numbers, date ordering, row hashes,
type handling, clock arithmetic, configuration and document metadata.
It cannot authenticate downloaded bytes from their digest or recover HTML
from numerical rows. Full-page digests are acquisition provenance; they cannot
be recomputed offline. A later acquisition may have different retrieval
timestamps or page digests. Normal tests require Python and no network.

## Clocks, definitions and measured scope

The keys' TD of Greatest Eclipse field supplies each reference time. NASA's
time explanation identifies TD with TT. The parser preserves that label
without a UTC suffix and converts its Gregorian fields to numeric TT labels;
catalog Delta T is retained without subtraction. Engine searches run on TT
over the complete catalog date, padded by the derivative half-width to
recover the searcher's guarded edges. Each date must produce one event before
its time or class is assessed. It is not a narrow reference-centered bracket.

Solar P types map to partial. Solar A, T and H map to central unless their
suffix is + or -, which the key defines as noncentral; those map to the API's
partial class because their shadow axis misses Earth. The API does not
distinguish annular, total or hybrid solar eclipses. Lunar N, P and T map to
penumbral, partial and total, with the raw suffix preserved. The live lunar
tables use Nx; the parser retains x without interpreting it and uses the
documented N coarse class. The selection includes every catalog type from
the chosen years, including marginal and noncentral cases.

[nasa-sample.node-test.ts](../test/nasa-sample.node-test.ts) enforces the
selection, model, scan settings, threshold and date comparisons. It also
reproduces [nasa-sample-timing.json](../evidence/nasa-sample-timing.json) with
[nasa-sample-timing.mjs](../scripts/nasa-sample-timing.mjs). On this parent
version, over exactly the selected catalog dates, the measurements are:

| Kind | Reference dates | Found on date | Within TT threshold | Coarse class matches | Largest absolute TT error, rounded up |
| --- | ---: | ---: | ---: | ---: | ---: |
| Solar | 20 | 20 | 20 | 19 | 8 seconds |
| Lunar | 19 | 19 | 19 | 19 | 11 seconds |

Acceptance uses the unrounded millisecond differences. These sample maxima
are not physical error bounds. The solar class disagreement is catalog 09398
on 1950-03-18: NASA's A- is noncentral, while the spherical model returns
central. The evidence records a failed class verdict; the reference class,
radii and threshold were retained. Earth's flattening and lunar atmospheric
shadow enlargement are omitted by the model, and the parent vector conventions
differ from NASA's ephemerides, as [NASA.md](NASA.md) describes. The comparison
does not isolate the cause of this disagreement.

These date searches do not establish full-year or full-span discovery,
accuracy on other dates, surface visibility, contact times or exact grazing
classification. The broader fixed-query completeness report remains a separate
milestone. Parser tests in [nasa_sample_test.py](../scripts/nasa_sample_test.py)
use independent calendar arithmetic and synthetic rows for numerical behavior
and tampering checks; they are not extra astronomical accuracy evidence.
