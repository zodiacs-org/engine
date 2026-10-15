# Occultations workbench

An isolated package over the adjacent `@zodiacs/engine` TypeScript source.
It describes sky geometry only. It does not select or recommend dates, attach
interpretations, or make predictions about people or events.

The current milestone provides validated position samples and receipts.
Occultation searches, star data, contact times, visibility outlines and the
CLI remain unchecked in [PLAN.md](PLAN.md). There is no measured occultation
accuracy claim yet. [DESIGN.md](DESIGN.md) records the geometry and error
budget to validate; [SOURCES.md](SOURCES.md) separates provenance from leads.

Use Node matching this folder's `package.json` engines range. From the
repository root:

```sh
npm ci --prefix occultations --cache occultations/.cache/npm --ignore-scripts
npm --prefix occultations run check
```

No root install or root build is needed. Local TypeScript, Vitest and esbuild
resolve the pinned ephemeris from this folder while reading the engine source
through relative imports. The build writes only `.generated/`, which is
ignored. The built module can be used from the repository root:

```js
import { positionAt } from "./occultations/.generated/index.mjs";

const sample = positionAt({
  body: "Moon",
  time: "2025-01-01T00:00:00Z",
  observer: { latitude: 0, longitude: 0, elevationMeters: 0 }
});
console.log(JSON.stringify(sample));
```

The example is a sky sample at a synthetic station, not a contact prediction.
In an equatorial frame, `lon` is right ascension in degrees and `lat` is
declination in degrees. In an ecliptic frame they are longitude and latitude.
`dist` and Cartesian coordinates are in astronomical units. Speeds are absent.
Omit `observer` for the geocentre; specify `frame` for either true equator or
true ecliptic of date. The default is equatorial. Input and delegation behavior
are enforced by `test/input.test.ts` and `test/engine.test.ts`.

Instants follow the engine parser: ISO dates mean UTC midnight; date-times
need an explicit UTC offset. A valid Date is also accepted. Windows must be
nonempty and ordered; searches will use the engine's `(from, to]` ownership.
Input records use their own fields, captured once. Malformed inputs throw
RangeError. A valid position request beyond the
engine's calculation span returns `status: "refused"` with a receipt.

Receipts preserve normalized requests and the complete engine calculation
receipt when available, including time basis, correction conventions and
dependency identity. They are provenance records, not attestations or physical
accuracy guarantees. Results are immutable snapshots and JSON serializable.

The authored code and documentation are MIT under [the repository licence](../LICENSE).
The local bundle includes engine data: keep the generated LICENSE,
LICENSING.md and NOTICE alongside it. Its inherited terms are the engine's
`MIT AND CC-BY-4.0`, with the qualifications in [LICENSING.md](../LICENSING.md).
The workbench is private and excluded from the engine's npm package.

`check:scope` checks npm file selection without running lifecycle scripts or
writing an archive. It also enforces the task's source-file size and prose
rules and detects changed paths outside this folder. It does not replace the
repository's release archive or full built-package checks.

[VALIDATION.md](VALIDATION.md) records this milestone's checks and the
unavailable root build prerequisite.
