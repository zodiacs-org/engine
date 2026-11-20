# Migration evidence

`api-diff-1.1.0.txt` is the unedited output of
`git diff 322f855 3962adc -- api/`. The first commit is the merge of
the carried 1.1.0 release. The second is the main commit used for this
guide, whose package version is 2.0.0-rc.3. Regenerate and compare with
`git diff 322f855 origin/main -- api/`.

The removed declaration lines are replaced by wider unions for `ChartFlag`,
`LocalTimeResolution.flags`, `TimeScale.basis` and `Ut1MinusUtc.source`.
`BodyPosition` gains `flags?: InstantFlag[]`. `LocalTimeResolution.zone`
gains `hostCheck?: HostZoneCheck`. The core entry adds root exports, and
the geo entry adds the calendar and local mean time declarations.
The other edits record those references and exports. All prior declarations
and deprecated names remain available.

## Archive comparison

The commands below were run from the repository root with Node 24.22.1
and the lockfile's astronomy-engine installed. They verify the archive
checksums, unpack the carried archives into scratch space, and call the
same entry points as the guide. The output records results and field
names from synthetic examples. It is a compatibility check. The
[time-scale](../continuous-utc-20261117/README.md) and
[zone history](../tzdb-2026f-20261117/README.md) evidence folders record the
independent measurements.

```sh
set -eu
scratch=$(mktemp -d /tmp/engine-migration.XXXXXX)
trap 'rm -rf "$scratch"' EXIT
for version in 1.1.0 2.0.0-rc.3; do
  archive="zodiacs-engine-$version"
  (cd artifacts && sha256sum --check "$archive.sha256") >&2
  mkdir "$scratch/$version"
  tar -xzf "artifacts/$archive.tgz" -C "$scratch/$version"
done
mkdir "$scratch/node_modules"
ln -s "$PWD/node_modules/astronomy-engine" "$scratch/node_modules/astronomy-engine"

node --input-type=module - "$scratch" <<'JS'
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const scratch = process.argv[2];
const old = join(scratch, "1.1.0/package");
const current = join(scratch, "2.0.0-rc.3/package");
const load = (dir, entry) => import(pathToFileURL(join(dir, `dist/` + entry + ".js")).href);
const root = await load(old, "index");
const next = await load(current, "index");
const geo = await load(old, "geo");
const calc = await load(old, "calc");
const timing = await load(old, "timing");
const receipts = await load(old, "receipt");
const nextReceipts = await load(current, "receipt");

const date = "1990-05-03";
const midnight = "1990-05-03T00:00:00Z";
const utc = "1990-05-03T12:00:00Z";
const place = { latitude: 40, longitude: -74 };
const target = "2024-02-29T00:00:00Z";
const future = "2030-01-01T00:00:00Z";
const same = isDeepStrictEqual;
const bare = root.natalChart({ utc: date, ...place });
const explicit = root.natalChart({ utc: midnight, ...place });
const untimed = root.natalChart({ utc: date, ...place, timeKnown: false });
const aliases = ["lat", "lng", "lon", "long", "house", "houses", "hsys", "housesystem",
  "scale", "time_scale", "delta_t", "time_known", "unknownTime"];
const spellings = [...new Set(aliases.flatMap((name) => [
  name, name.toLowerCase(), name.toUpperCase(), name[0].toUpperCase() + name.slice(1).toLowerCase()
]))];
const refusedAliases = [];
const baseline = root.natalChart({ utc });
for (const key of spellings) {
  try {
    if (!same(root.natalChart({ utc, [key]: 1 }), baseline)) throw new Error("Old alias changed chart: " + key);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    refusedAliases.push([key, error.name]);
  }
}
const oldFuture = root.natalChart({ utc: future });

const dublin = "Europe/Dublin";
await geo.prepareLocalTime("1925-09-20", dublin);
await geo.prepareLocalTime("1582-10-10", "Europe/Rome");
const dublinStart = Date.parse("1925-09-20T02:00Z");
const dublinEnd = Date.parse("1925-10-04T02:00Z");
const local = geo.resolveLocalBirth({ date, timeZone: "Etc/UTC" });
const oldRecord = receipts.serializeNatalEnvelope(receipts.createNatalEnvelope(bare));
const oldParsed = receipts.parseNatalEnvelope(oldRecord);
const newRecord = nextReceipts.serializeNatalEnvelope(nextReceipts.createNatalEnvelope(next.natalChart({ utc: future })));
const newExplicit = next.natalChart({ utc: midnight, ...place });
const oldReplay = oldParsed.ok ? root.natalChart(receipts.natalReplayInput(oldParsed.envelope)) : null;
const differingKeys = (before, after) => Object.keys(before).filter((key) => !same(before[key], after[key]));
const newOnOld = receipts.parseNatalEnvelope(newRecord);
const exports = JSON.parse(readFileSync(join(old, "package.json"), "utf8")).exports;

console.log(JSON.stringify({
  version: root.ENGINE_VERSION,
  archiveSha256: createHash("sha256").update(readFileSync("artifacts/zodiacs-engine-1.1.0.tgz")).digest("hex"),
  bareBirthDate: {
    bareMatchesExplicitMidnight: same(bare, explicit),
    explicitChartDifferences: differingKeys(explicit, newExplicit),
    timeKnown: bare.input.timeKnown,
    hasAngles: bare.angles !== null,
    unknownTimeFlags: untimed.flags,
    unknownTimeHasAngles: untimed.angles !== null,
    saturnReturnAcceptsBothForms: same(root.saturnReturn(date), root.saturnReturn({ utc: date })),
    calcChartStringStatus: calc.chart({ time: date }).status,
    calcChartObjectStatus: calc.chart({ time: { iso: date } }).status
  },
  birthKeys: {
    aliasSpellingsChecked: spellings.length,
    refusedAliases,
    aliasPairProducesAngles: root.natalChart({ utc, lat: 40, lng: -74 }).angles !== null,
    canonicalPairProducesAngles: root.natalChart({ utc, ...place }).angles !== null,
    ignoresFoo: same(root.natalChart({ utc }), root.natalChart({ utc, foo: 1 }))
  },
  utcAfterIersTable: {
    basis: oldFuture.timeScale.basis,
    ut1MinusUtcSource: oldFuture.timeScale.ut1MinusUtc.source,
    ttMinusUtcSeconds: oldFuture.deltaT.seconds + oldFuture.timeScale.ut1MinusUtc.seconds,
    flags: oldFuture.flags
  },
  historicWallTime: {
    tzdbVersion: geo.TZDB.version,
    dublinOffsetsMinutesEast: [dublinStart - 1, dublinStart, dublinEnd - 1, dublinEnd]
      .map((instant) => geo.zoneOffsetAt(dublin, instant)),
    dublinLocalOffsetMinutesEast: geo.resolveLocalToUtc("1925-09-21", "12:00", dublin).offsetMinutes
  },
  chartAndLocalTimeFlags: {
    polar: root.natalChart({ utc, latitude: 70, longitude: 0 }).flags,
    calendarUnknown: geo.resolveLocalToUtc("1582-10-10", "12:00", "Europe/Rome").flags.includes("calendar-unknown"),
    hasHostCheck: Object.hasOwn(local.resolution.zone, "hostCheck")
  },
  positionRows: Object.fromEntries(Object.entries({
    positions: root.positions(future),
    transits: root.transits({ utc }, future).positions,
    progressedBodies: root.progressedBodies(future, future)
  }).map(([name, rows]) => [name, rows.some((row) => "flags" in row)])),
  continuousUtcRecord: {
    currentAccepts: nextReceipts.parseNatalEnvelope(newRecord).ok,
    oldAccepts: newOnOld.ok,
    oldRefusal: newOnOld.ok ? null : newOnOld.code
  },
  optionalApis: {
    hasCore: Object.hasOwn(exports, "./core") && existsSync(join(old, "dist/core.js")),
    geo: ["julianDayNumber", "dateOfJulianDayNumber", "localMeanTimeOffset"]
      .map((key) => [key, typeof geo[key]])
  },
  otherDateInputs: {
    alreadyBuiltChart: same(root.transits(bare, target), root.transits(explicit, target)),
    receiptReplayDifferences: oldReplay && differingKeys(bare, oldReplay),
    progressedInstant: same(root.progressedInstant(date, target), root.progressedInstant(midnight, target)),
    progressedBodies: same(root.progressedBodies(date, target), root.progressedBodies(midnight, target)),
    solarArc: same(timing.solarArc(date, target), timing.solarArc(midnight, target)),
    calcHousesStatus: calc.houses({ time: date, place }).status,
    localBirth: { reference: local.reference, timeKnown: local.birth.timeKnown }
  }
}, null, 2));
JS
```

The archive answers (`on-1.1.0.json`) are recorded here.

```json
{
  "version": "1.1.0",
  "archiveSha256": "4e53cda9bd6ccb5f5581c2a9af2f2ae4010af2599f411ac5220425e0932e41ac",
  "bareBirthDate": {
    "bareMatchesExplicitMidnight": true,
    "explicitChartDifferences": [
      "engineVersion"
    ],
    "timeKnown": true,
    "hasAngles": true,
    "unknownTimeFlags": [
      "no-time"
    ],
    "unknownTimeHasAngles": false,
    "saturnReturnAcceptsBothForms": true,
    "calcChartStringStatus": "ok",
    "calcChartObjectStatus": "ok"
  },
  "birthKeys": {
    "aliasSpellingsChecked": 40,
    "refusedAliases": [
      [
        "housesystem",
        "RangeError"
      ],
      [
        "HOUSESYSTEM",
        "RangeError"
      ],
      [
        "Housesystem",
        "RangeError"
      ]
    ],
    "aliasPairProducesAngles": false,
    "canonicalPairProducesAngles": true,
    "ignoresFoo": true
  },
  "utcAfterIersTable": {
    "basis": "delta-t",
    "ut1MinusUtcSource": "fallback",
    "ttMinusUtcSeconds": 69.60229629702832,
    "flags": [
      "delta-t-extrapolated"
    ]
  },
  "historicWallTime": {
    "tzdbVersion": "2025c",
    "dublinOffsetsMinutesEast": [
      60,
      60,
      60,
      0
    ],
    "dublinLocalOffsetMinutesEast": 60
  },
  "chartAndLocalTimeFlags": {
    "polar": [],
    "calendarUnknown": false,
    "hasHostCheck": false
  },
  "positionRows": {
    "positions": false,
    "transits": false,
    "progressedBodies": false
  },
  "continuousUtcRecord": {
    "currentAccepts": true,
    "oldAccepts": false,
    "oldRefusal": "unsupported_feature"
  },
  "optionalApis": {
    "hasCore": false,
    "geo": [
      [
        "julianDayNumber",
        "undefined"
      ],
      [
        "dateOfJulianDayNumber",
        "undefined"
      ],
      [
        "localMeanTimeOffset",
        "undefined"
      ]
    ]
  },
  "otherDateInputs": {
    "alreadyBuiltChart": true,
    "receiptReplayDifferences": [
      "input"
    ],
    "progressedInstant": true,
    "progressedBodies": true,
    "solarArc": true,
    "calcHousesStatus": "ok",
    "localBirth": {
      "reference": "local-noon",
      "timeKnown": false
    }
  }
}
```
