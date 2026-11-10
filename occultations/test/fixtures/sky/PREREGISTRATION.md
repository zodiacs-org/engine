# M9 sky-context reference gates

Recorded on 2026-10-15 before evaluating the workbench against these cases.
These are development checks, separate from the untouched M4 held-out event
cases. They do not calibrate occultation contact times or lunar limb relief.

`sky-evidence.test.ts` will require all selected reference rows and finite
results, with these maximum errors fixed before comparison:

- Solar topocentric geometric altitude: 0.02 degree against USNO celestial
  navigation `hc - pa`, at Washington on 2024-06-21 at 17:10 UT1, Greenwich
  on 2000-09-22 at 12:00 UT1, Sydney on 2020-01-15 at 02:00 UT1, and the
  explicitly supplied polar station 78.2232 N, 15.6469 E on 2024-06-21 at
  12:00 UT1. These use sea level and the exact coordinates in the source
  requests. USNO identifies `hc` as geocentric altitude and `pa` as the
  parallax-in-altitude correction added during sight reduction, so subtracting
  `pa` recovers the unrefracted topocentric center altitude. This allowance
  includes the differences of reduction conventions and source rounding.
- Sun and Moon horizon transitions: the sign of the standard-horizon margin
  must change in the published direction between 120 seconds before and
  after every rise/set row in the existing root fixture
  `src/sky/fixtures/usno-rstt.json`. Its transit rows are excluded explicitly.
  Thus every reference transition has a bracket of half-width 120 seconds;
  this does not assert a refined crossing time or measured atmospheric
  visibility. USNO rounds these times to whole minutes. Its fixed solar
  semidiameter and the engine's distance-dependent semidiameter need not
  agree exactly.
- Moon phase: excess geocentric apparent ecliptic longitude of the Moon over
  the Sun must be within 0.05 degree, as a shortest circular difference,
  of each primary-phase definition at all four USNO phase times returned
  for 2024-01-01 with `nump=4`. Approximate illuminated fraction must be
  within 0.001 of the definition's zero, half or full value. These are
  minute-rounded reference times. The phase names at these instants must
  match the corresponding primary phase. No intermediate illuminated-fraction
  accuracy is asserted for the engine's elongation approximation.
- Polar day/night: the standard-horizon flag for the Sun must agree with
  USNO's continuously-above/continuously-below statement at 00:00, 06:00,
  12:00 and 18:00 UT1 on 2024-06-21 and 2024-12-21 at the same polar station.
  The test checks these samples, not all instants of each day.

The reference times use nominal UT1, as USNO specifies. Tests convert each
to the engine input clock using the existing time-basis resolver, without
substituting UTC or fitting delta-T.

## Sources and rights

The numerical source records in `usno-sky.json` are compact extracts from
US Naval Observatory Astronomical Applications API v4.0.1 responses, fetched
2026-10-15. Every record names its query URL, response SHA-256 and the exact
JSON fields selected. The script `acquire.py` retrieves and extracts them;
it does not import or run the workbench. These USNO numerical predictions
are US Government works, as recorded for the same service in the repository's
`LICENSING.md`. No page images or third-party photography are copied.

The following primary documentation was fetched and read on 2026-10-15:

- [USNO API documentation](https://aa.usno.navy.mil/data/api), headings
  "Phases of the Moon", "Complete Sun and Moon Data for One Day", and
  "Celestial Navigation Data for Assumed Position and Time": numerical
  field definitions, Universal Time/UT1 and coordinate conventions.
- [USNO celestial navigation](https://aa.usno.navy.mil/data/celnav),
  introductory description and "Notes on the Data": sea level, `hc` as
  geocentric altitude, and the sign and use of altitude corrections.
- [USNO rise, set and twilight definitions](https://aa.usno.navy.mil/faq/RST_defs),
  "Technical Definitions and Computational Details": horizon convention,
  solar and lunar upper limbs, refraction and geometric twilight.
- [USNO phases and percent illuminated](https://aa.usno.navy.mil/faq/moon_phases),
  paragraphs beginning "Technically, the phases" and "The percent":
  primary phases are defined by apparent ecliptic longitude excess at
  0, 90, 180 and 270 degrees. The source's credited photographs are excluded.

These comparisons establish a finite set of development checks only. A
comparison to a USNO prediction does not establish actual atmospheric
refraction, terrain visibility, or the accuracy of all observer altitudes.
