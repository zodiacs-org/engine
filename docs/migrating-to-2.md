# Migrate @zodiacs/engine from 1.1.0 to 2.0.0

Update birth inputs that relied on implicit midnight or misspelled fields,
and recalculate cached results that use the old UTC convention or affected
zone histories. The [declaration diff](evidence/migration-2.0.0-20261120/api-diff-1.1.0.txt)
records the public API changes. The [archive comparison](evidence/migration-2.0.0-20261120/README.md)
records how the previous release answered. The examples use synthetic inputs
and are covered by the [migration tests](../src/migration-2.0.test.ts).

## Bare birth dates

Previously, a bare birth date meant midnight UTC with the time treated as
known. A bare birth date throws a RangeError unless timeKnown is false.
This applies to birth objects, both forms of `saturnReturn`, and calc's
`chart()` with a string or an `{ iso }` time. Give the full instant when
the time is known. An explicit offset, a `Date` or epoch milliseconds work
as before. The unknown-time form returns `no-time` with angles and houses
set to `null`. See the [migration tests](../src/migration-2.0.test.ts).

```ts
import { natalChart, saturnReturn } from "@zodiacs/engine";

natalChart({ utc: "1990-05-03", timeKnown: false });
natalChart({ utc: "1990-05-03T00:00:00Z" });
saturnReturn("1990-05-03T00:00:00Z");
```

## Near-miss birth keys

The previous release silently ignored aliases such as `lat` and `lng`.
It already refused spellings that differed from `houseSystem` only by
letter case. The listed near-miss birth keys throw a RangeError in any letter case.
The error names the field to use, and other unknown keys are ignored.
Rename the keys before passing a birth object to the engine. The
[migration tests](../src/migration-2.0.test.ts) check the aliases and casing.

| Replace | With |
| --- | --- |
| `lat` | `latitude` |
| `lng`, `lon`, `long` | `longitude` |
| `house`, `houses`, `hsys`, `housesystem` | `houseSystem` |
| `scale`, `time_scale` | `timeScale` |
| `delta_t` | `deltaT` |
| `time_known`, `unknownTime` | `timeKnown` |

```ts
natalChart({ utc: "1990-05-03T12:00:00Z", latitude: 40, longitude: -74 });
```

## UTC after the IERS table

The previous release treated unpinned UTC input after the table as UT1
and added modelled ΔT to get TT. After the IERS table, unpinned UTC input puts TT exactly 69.184 seconds ahead of UTC.
The last UTC instant on the IERS basis is `2027-10-02T00:00:00.000Z`. The
new basis derives UT1 from TT and the ΔT model. The first 146 ms after the
table still use the predicted ΔT segment and are unflagged. The next
millisecond starts `delta-t-extrapolated`.
[Migration tests](../src/migration-2.0.test.ts), [IERS and ERFA evidence](evidence/continuous-utc-20261117/README.md).

On the shipped DE440 pack at `2199-06-19T12:00Z`, the Moon's geocentric
ecliptic longitude was 28.26 arcseconds from JPL Horizons and is now
0.51 arcseconds away. At that instant TT moved earlier,
from 125.844 to 69.184 seconds ahead of UTC. The longitude comparison
uses each source's ecliptic of date.
[Before and after measurements](evidence/continuous-utc-20261117/README.md#before-and-after),
[carried candidate measurement](evidence/2.0.0-rc.3-20261117/results/horizons-2.0.0-rc.3.json).

Refresh cached positions, angles, houses, returns and windows computed
from affected UTC inputs. Speeds that sample across the table boundary
can also move. Pass `timeScale: "ut1"` when the input is already on UT1
or when reproducing the old interpretation of an unpinned instant after
the table. A stored natal record can supply its replay input directly.
[Time-scale evidence](evidence/continuous-utc-20261117/README.md#before-and-after).

```ts
const fromUtc = natalChart({ utc: "2030-01-01T00:00:00Z" });
const fromUt1 = natalChart({ utc: "2030-01-01T00:00:00Z", timeScale: "ut1" });
```

## Historical wall times

Shipped wall-time histories before 1970 use IANA tzdata 2026f, where the
previous release used 2025c. America/Yellowknife keeps its 2025c history.
Offsets change for 23 names, including the Dublin aliases and 21 Brazilian
names. The [tzdb comparison](evidence/tzdb-2026f-20261117/README.md#offsets-before-1970)
lists every affected name and UTC interval, including the Brazilian
changes in 1965 and 1966. Rerun local-time resolution for affected
wall times before recomputing charts. Call `prepareLocalTime` before
asking for a historical offset.

Europe/Dublin reads +0:00 from 1925-09-20T02:00Z up to 1925-10-04T02:00Z where 1.1.0 read +1:00.
The final instant is excluded from the changed interval.
[Independent tzdb comparison](evidence/tzdb-2026f-20261117/changes.json),
[migration tests](../src/migration-2.0.test.ts).

```ts
import { prepareLocalTime, resolveLocalToUtc } from "@zodiacs/engine/geo";

await prepareLocalTime("1925-09-20", "Europe/Dublin");
const time = resolveLocalToUtc("1925-09-21", "12:00", "Europe/Dublin");
```

Historical metadata can change even where the offset stays fixed. The
[tzdb comparison](evidence/tzdb-2026f-20261117/README.md#what-changes-changesjson)
covers U.S. wartime abbreviations and transitions, Kyiv-linked histories,
and the transition cause for Morocco and Western Sahara on hosts that
know the new rule. Affected caches may also hold these fields.

## Chart and local-time flags

ChartFlag gains polar-angles, calendar-unknown and host-zone-data-differs.
Add cases for these values if you switch exhaustively. `polar-angles`
marks angles inside the polar circle even for a house system that can be
computed there. Such a chart can be passed back into the engine.
`calendar-unknown` marks an uncertain civil calendar on a skipped date.
`host-zone-data-differs` reports when a runtime's zone data disagrees at
a nearby probe. The wall time still resolves using the runtime's offset.
[Polar-angle evidence](evidence/polar-angles-20261116/README.md),
[calendar evidence](evidence/calendar-unknown-20261116/README.md),
[host zone evidence](evidence/host-zone-probes-20261117/README.md).

`LocalTimeResolution.flags` also gains `calendar-unknown` and
`host-zone-data-differs`. Its `zone` can include the optional
`HostZoneCheck` in `hostCheck`, with a status of `unchecked`, `current`,
`differs` or `newer`. Use optional access and read the probe and the
two offsets only when the status supplies them.
[Public declarations](evidence/migration-2.0.0-20261120/api-diff-1.1.0.txt).

```ts
import type { ChartFlag } from "@zodiacs/engine";

function chartFlagMessage(flag: ChartFlag) {
  switch (flag) {
    case "polar-angles": return "Angles inside the polar circle";
    case "calendar-unknown": return "Civil calendar uncertain";
    case "host-zone-data-differs": return "Host time zone data differs";
    default: return flag;
  }
}

if (time.zone.hostCheck?.status === "differs") {
  const { hostOffsetMinutes, tzdbOffsetMinutes } = time.zone.hostCheck;
  // Use both offsets when displaying the warning.
}
```

## Flags on position rows

Rows from positions(), transits().positions and progressedBodies() can carry an optional flags field.
The previous rows omitted that key. `BodyPosition.flags` uses the new
exported `InstantFlag` type, covering `outside-reference-span`,
`delta-t-extrapolated` and the ephemeris fallback flags. A row omits the
property when there are no instant flags. Compare fields you depend on
when old row key sets matter, and default missing flags to an empty array.
[Position evidence](evidence/positions-span-20261116/README.md),
[migration tests](../src/migration-2.0.test.ts).

```ts
import { positions } from "@zodiacs/engine";

const rows = positions("2030-01-01T00:00:00Z").map(
  ({ body, lon, flags = [] }) => ({ body, lon, flags })
);
```

## Natal records and downgrades

A continuous-UTC natal record is refused by 1.1.0 as unsupported_feature.
Its conventions set requires `time-basis-continuous-utc`. Keep a reader
that supports the feature wherever such records may be read. Preserve
earlier records for a rollback and keep the original conventions with
each record.
[Archive comparison](evidence/migration-2.0.0-20261120/README.md),
[migration tests](../src/migration-2.0.test.ts).

```ts
import { parseNatalEnvelope } from "@zodiacs/engine/receipt";

const parsed = parseNatalEnvelope(savedRecord);
if (!parsed.ok && parsed.code === "unsupported_feature") {
  // Send the unchanged record to a reader that supports its required features.
}
```

## Time-scale cases

TimeScale.basis gains continuous-utc and Ut1MinusUtc.source gains model.
Handle these cases in displays, validators and exhaustive switches. A
modelled UT1 offset comes from TT and ΔT on the continuous-UTC basis.
[Public declarations](evidence/migration-2.0.0-20261120/api-diff-1.1.0.txt),
[migration tests](../src/migration-2.0.test.ts).

```ts
const timeScale = fromUtc.timeScale;
const basisLabel = timeScale.basis === "continuous-utc" ? "Continuous UTC" : timeScale.basis;
const source = timeScale.ut1MinusUtc?.source;
const ut1Label = source === "model" ? "Modelled UT1" : source;
```

## New entry point and geo helpers

The core entry exposes the root API and geo adds Julian Day Number conversion and a local mean time offset.
Keep the root import for its shipped DE440 default. An opt-in import from
`@zodiacs/engine/core` uses astronomy-engine and carries no DE440 pack.
In `@zodiacs/engine/geo`, use `julianDayNumber` and
`dateOfJulianDayNumber` for Julian or proleptic Gregorian dates, and
`localMeanTimeOffset` for seconds east of Greenwich at a given longitude.
[Public declarations](evidence/migration-2.0.0-20261120/api-diff-1.1.0.txt),
[core tests](../scripts/core-entry.test.mjs), [migration tests](../src/migration-2.0.test.ts).

```ts
import { natalChart as coreNatalChart } from "@zodiacs/engine/core";
import {
  dateOfJulianDayNumber, julianDayNumber, localMeanTimeOffset
} from "@zodiacs/engine/geo";

const calendar = "gregorian";
const day = julianDayNumber({ year: 1990, month: 5, day: 3 }, calendar);
const date = dateOfJulianDayNumber(day, calendar);
const secondsEast = localMeanTimeOffset(-74);
const chart = coreNatalChart({ utc: "1990-05-03T00:00:00Z" });
```

The birth-input refusals and the change to the UTC convention are the
major-version breaks. New flag values, optional result fields and
time-scale cases are additions that the [versioning policy](versioning.md)
allows in a minor release.

## Not changed

Already-built charts, receipt replay and the non-birth date inputs below keep working.
`progressedInstant`, `progressedBodies`, timing's `solarArc` and calc's
`houses()` still read bare date arguments as midnight UTC.
`resolveLocalBirth` still accepts a local date with no time and uses
local noon with `timeKnown: false`. An earlier natal receipt replays under
the convention it recorded. All deprecated declarations remain available.
[Migration tests](../src/migration-2.0.test.ts),
[public declarations](evidence/migration-2.0.0-20261120/api-diff-1.1.0.txt).

```ts
import { progressedInstant } from "@zodiacs/engine";

const at = progressedInstant("1990-05-03", "2024-02-29T00:00:00Z");
const local = resolveLocalBirth({ date: "1990-05-03", timeZone: "Etc/UTC" });
```
