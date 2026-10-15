# Occultations workbench

An isolated package over the adjacent `@zodiacs/engine` TypeScript source.
It describes sky geometry only. It does not select or recommend dates, attach
interpretations, or make predictions about people or events.

The current milestones provide validated position samples, a receipted SAO
stellar catalogue, reproducible source extraction and apparent star directions.
Occultation searches, contact times, visibility outlines and the
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

`starCatalogue()` returns an immutable source catalogue and its receipt. The
subset contains 119 SAO records, with catalogue visual magnitude at most 4.5
and absolute J2000 ecliptic latitude at most 8 degrees, plus explicitly named
Pleiades targets. Regulus, Spica, Antares and Aldebaran are included. The ten
Pleiades entries are Alcyone, Atlas, Pleione, Maia, Merope, Electra, Taygeta,
Celaeno, Asterope (21 Tauri) and the separate 22 Tauri. These counts and
selection thresholds are enforced by [the catalogue tests](test/catalogue.test.ts)
against the frozen SAO query described in [SOURCES.md](SOURCES.md).

This is a fixed catalogue selection, not verified event completeness across
the engine's time span. `starCatalogue()` retains positions at the catalogue
epoch and equinox J2000 in FK5. `starPositionAt()` propagates their proper
motion and returns an apparent direction at the requested instant.
Magnitudes are historical heterogeneous visual values. Missing distance,
radial velocity and multiplicity information remain unknown. The catalogue
does not resolve binary components or predict a variable star's brightness.

The public-domain basis, original authors, field conventions and exclusions
are recorded in [SOURCES.md](SOURCES.md) and [the rights receipt](data/sao-rights.json).
Keep the generated SAO-NOTICE.txt and sao-documentation.txt with the bundle.
Normalized data is generated only in the ignored folder:

```sh
npm --prefix occultations run catalogue:check
# Optional network check: retrieve the pinned NASA query and reproduce the extract.
npm --prefix occultations run catalogue:verify-source
# Or verify from the previously downloaded query without network access.
node occultations/scripts/catalogue.mjs --extract occultations/.cache/catalogue/sao-query.txt
```

Both extraction commands check the parent response digest and compare the
candidate extract with the committed original source rows. A changed response
is refused; no command overwrites committed data. The normal `check` is offline.

```js
import { starCatalogue, starPositionAt } from "./occultations/.generated/index.mjs";

const spica = starCatalogue().stars.find((star) => star.label === "Spica");
const direction = starPositionAt({
  star: spica.id,
  time: "2025-01-01T00:00:00Z",
  observer: { latitude: 0, longitude: 0, elevationMeters: 0 }
});
console.log(JSON.stringify(direction));
```

Use the exact catalogue `id`. The default frame is the true equator and
equinox of date; `frame: "ecliptic-true-of-date"` selects the true ecliptic.
The `direction` is a unit vector, and `lon` and `lat` are degrees, with
equatorial `lon` meaning right ascension. `distanceAu` stays null because
SAO supplies no distance here. The observer uses the same ellipsoid and
elevation convention as `positionAt()`.

Star reduction applies FK5 orientation and spin, proper motion, observer
light-time modulation, annual aberration and, for a site, diurnal aberration.
It uses the engine's clock, Earth state and frame rotations. Missing proper
motion produces a receipted refusal. Missing parallax and radial velocity
produce explicit omissions; no measured zeros or physical accuracy bounds
are invented. Refraction, solar deflection, stellar orbital motion and
unresolved component positions are absent. The result receipt records the
source row, catalogue digests, clock and reduction conventions.

The ordinary tests include published independent ERFA component references.
The extended comparison checks apparent stellar directions against an
independent ERFA Earth ephemeris and frame reduction, using the same SAO
inputs. It requires separate development-only Python dependencies:

```sh
python3 -m pip install --target occultations/.cache/erfa --cache-dir occultations/.cache/pip pyerfa==2.0.1.5 numpy==2.2.6
npm --prefix occultations run test:astrometry
```

This command generates its reference values under `.generated/` before
running the assertions. It is separate from `check`; missing dependencies or
references fail explicitly. Runtime calculations require no Python or network.
[The preregistration](test/fixtures/ASTROMETRY.md) fixes the cases and error
criteria, and [VALIDATION.md](VALIDATION.md) records their measured scope.
Agreement checks reduction of shared inputs, not the accuracy of the
historical catalogue or occultation contact times.

`check:scope` checks npm file selection without running lifecycle scripts or
writing an archive. It also enforces the task's source-file size and prose
rules and detects changed paths outside this folder. It does not replace the
repository's release archive or full built-package checks.

[VALIDATION.md](VALIDATION.md) records this milestone's checks and the
unavailable root build prerequisite.
