# Fixed-query completeness evidence

[completeness.json](evidence/completeness.json) records whole-year searches and
paired-pass source windows against independently reduced Horizons dates and
published NASA catalog rows. [completeness-plan.json](references/completeness-plan.json)
defines the fixed queries, scan policies, work budget and matching rule.
[completeness.mjs](scripts/completeness.mjs) generates the evidence;
[completeness.node-test.ts](test/completeness.node-test.ts) enforces its
reproduction, scope and retained discrepancies.

From the repository root on Node 22, after installing the events lockfile:

```sh
npm run build --prefix events
node events/scripts/completeness.mjs --check
npm test --prefix events
```

Use `--write` instead of `--check` to regenerate the aggregate JSON. Source
reductions verify offline before searches begin. No downloads are required.
The report binds its plans, reference files, reduction scripts, reporting code,
lockfile and parent/events TypeScript sources with SHA-256 digests. It also
records the parent package and ephemeris versions. Digests identify the local
inputs; they do not authenticate an independent source. Local bundles must
come from a fresh build of those sources.

## Queried scope

The broader Horizons queries search every station and every tropical ingress
over each complete body-year declared in
[horizons-sample-plan.json](references/horizons-sample-plan.json): Mercury in
1900, Venus in 1950, Jupiter in 2000, Mars in 2001, Saturn in 2050 and Neptune
in 2100. The original Horizons cases are also queried over their entire
calendar years, including the moving Mars/Sun opposition and the square to an
invented fixed longitude. No direction filter removes other returned events.

Each of these queries runs under the original daily policy and under daily
longitude steps with six-hour speed cells. The paired Venus windows from
[loop-cases.json](references/loop-cases.json) run as both longitude crossings
and fixed conjunction aspects, using the original single-cell policy and
station-aware policy from that reference experiment. All fixed longitudes
are synthetic. No birth details enter the report.

The NASA queries search solar and lunar eclipses separately over each complete
year in [nasa-sample-plan.json](references/nasa-sample-plan.json): 1900, 1925,
1950, 1975, 2000, 2025, 2050, 2075 and 2100. These use the unchanged model,
hourly scan, derivative half-width and timing threshold. The search window is
padded by the derivative half-width, then results are filtered back to the
requested calendar year. Calendar-year windows include their first midnight
and exclude the next year's midnight: both search coordinates are one
millisecond before those midnights. This uses the searcher's open-start,
closed-end ownership and recovers its guarded edges without treating padding
events as results. Calendar-date matching uses the same encoding.

These selected years span 1900 through 2100. They are not continuous coverage
of every year in that period. NASA references include every retained catalog
entry in each queried year. Horizons references include only selected source
windows, even though the searches cover full years. A daily-selection slot
without a reference is never treated as evidence of astronomical absence.

## Matching and counts

Discovery matches identity within independently declared source windows before
testing timing or classification. Horizons identities use body and direction,
plus the ingress longitude or aspect branch when applicable. The search query
fixes the event kind and aspect target. NASA matches kind within the full TT
catalog date. Source windows retain the search convention: after the start
through the end. Calendar dates include their first midnight and exclude the
next midnight. All coordinates and timing errors are TT, without a UTC conversion.

Each reference and returned event can be used at most once. A reference with
no candidate is a miss; multiple candidates or a returned event eligible for
multiple references are ambiguous and remain unassigned. All unassigned outputs count as unmatched,
including ambiguous candidates. Under sparse Horizons coverage they are
`unreferencedResults`, with no false-positive verdict. Under the selected NASA
year inventories they are `catalogUnmatchedResults`. A refused search leaves
its references unassessed, rather than counting them as misses. Unexpected
computation errors stop the report.

Timing thresholds and NASA classes remain those of the independent fixtures.
A matched result outside its timing threshold is still discovered. A class
disagreement is still a matched eclipse. The JSON retains maximum and mean
absolute errors and signed extrema; raw millisecond errors decide acceptance.
Displayed absolute errors round up to whole seconds, signed extrema round
outward, and empty measurements are null. Aggregates use raw errors before
rounding.

## Measured results

The following values are reproduced by the script and its committed output
for exactly the scope above. Comparisons count repeated checks across policies
and equivalent longitude/aspect queries, rather than distinct sky events.

| Reference and policy | Queries | Comparisons | Matched | Missing | Unmatched | Outside timing threshold | Largest absolute TT error, rounded up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Broader Horizons, original | 12 | 17 | 17 | 0 | 32 unreferenced | 1 | 701 seconds |
| Original Horizons, original | 5 | 5 | 5 | 0 | 13 unreferenced | 0 | 61 seconds |
| Broader Horizons, station-aware | 12 | 17 | 17 | 0 | 32 unreferenced | 1 | 701 seconds |
| Original Horizons, station-aware | 5 | 5 | 5 | 0 | 13 unreferenced | 0 | 61 seconds |
| Paired windows, original | 4 | 8 | 0 | 8 | 0 | 0 | Unmeasured |
| Paired windows, station-aware | 4 | 8 | 8 | 0 | 0 | 8 | 2595 seconds |
| NASA selected years, hourly | 18 | 39 | 39 | 0 | 0 | 0 | 11 seconds |

All queries completed, with no ambiguous matches. The NASA selected-year
inventory has no missing or unmatched events, while the noncentral solar
catalog class disagreement on 1950-03-18 remains. The broader Horizons
Saturn ingress timing failure remains under both policies. Station-aware
bracketing recovers the paired directions that the original single-cell scans
miss, while their slow-pass timing failures remain. Discovery improvement does
not establish physical timing accuracy.

The NASA comparison tests inventory agreement only for the selected catalog
years and model definitions. Horizons unmatched outputs lack independent
expectations outside the selected windows. These results establish neither
full-span completeness nor error bounds for other dates, steps or policies.
Retrograde interval inventories and void-of-course Moon dates have no new
independent reference coverage here. Sampling, finite-difference speeds, frame
differences and spherical eclipse-model limits remain in
[LIMITATIONS.md](LIMITATIONS.md).
