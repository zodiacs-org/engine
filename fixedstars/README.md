# Fixed stars

This private source-checkout project is being built according to
[PLAN.md](PLAN.md). It supplies a licensed catalog, source provenance, and a
direct bridge to the parent engine with synthetic integration and geometric
tests, proper-motion propagation, true-of-date stellar positions, pure
conjunction and parallel matching, natal chart-hit assembly with native
chart envelopes, prepared star and body sky-event searches, paran event
pairing, and an offline CLI.

Use Node as specified by this folder's package.json. Install and check only
this project from the repository root:

```sh
npm --prefix fixedstars ci
npm --prefix fixedstars run typecheck
npm --prefix fixedstars test
npm --prefix fixedstars run catalog:check
npm --prefix fixedstars run check:isolation
```

The engine is consumed by relative imports from its existing source. This
folder has its own lockfile and pinned ephemeris dependency, resolved locally
by the test configuration and TypeScript paths. Its tests do not need a
parent engine build or installation. The engine's packed files and export
map are unchanged. The bridge uses internal source APIs, so a different
engine checkout must be checked again; this is not a standalone npm package.
The tests use explicit .fixedstars.ts or .fixedstars.mjs suffixes and local
Vitest configuration to stay outside the parent engine's default test discovery. The isolation
check enforces the file-size and documentation-character constraints and
checks package exclusion with a parent package dry run that skips scripts.

Catalog contracts use degrees for right ascension and declination and
milliarcseconds per Julian year for proper motion. Right-ascension proper
motion includes the cosine of declination. Missing motion is explicit.
Each historical lore tag must carry an author, work, locator, source, and
the label historical-attribution. These tags describe historical beliefs
and do not assert physical or predictive effects.

[GEOMETRY.md](GEOMETRY.md) derives the expectations used in the geometric
tests. Integration tests exercise chart receipts and the existing sky
solver's refusal semantics; they do not measure stellar astrometric accuracy.
The scoped sky-vector proof and receipt distinction are described below.

Original code and documentation use the repository's [MIT licence](../LICENSE).
Source decisions, pinned retrieval receipts and short historical passages
are in [sources/README.md](sources/README.md). The selected HYG catalog data
retain CC BY-SA terms. [LICENSING.md](LICENSING.md) and [NOTICE.txt](NOTICE.txt)
state the redistribution terms and required attributions. Bulk generated
tables and downloads belong in ignored folders.

## CLI

From the repository root, after installing this folder's dependencies:

```sh
node fixedstars/bin/fixedstars.mjs list
node fixedstars/bin/fixedstars.mjs list --star Spica --star Regulus
# Invented chart instant and place, with explicit angular orbs in degrees.
node fixedstars/bin/fixedstars.mjs hits --utc 2000-03-20T06:00:00Z \
  --latitude 12 --longitude 30 --conjunction-deg 0.5 --parallel-deg 0.5
# Invented observer window, with an explicit time orb in milliseconds.
node fixedstars/bin/fixedstars.mjs parans \
  --from 2000-03-20T00:00:00Z --to 2000-03-21T00:00:00Z \
  --latitude 0 --longitude 0 --orb-ms 60000 --star Spica --body Sun \
  --star-refraction none --body-refraction none --body-limb centre
node fixedstars/bin/fixedstars.mjs --help
```

The local manifest names the executable fixedstars. It can also be run as
`npm --prefix fixedstars run fixedstars -- list`; direct Node invocation keeps
npm's script banners out of JSON stdout. Paths resolve from the executable,
so the working directory need not be the repository. The launcher compiles
the TypeScript CLI in memory, resolves the project-local pinned ephemeris,
and emits no build files. Paran preparation separately verifies the sky
compatibility contract and compiles the unchanged solver as described below.
Listing and natal hits do not prepare or call the sky solver. No command
fetches sources, geocodes a place, saves input, or writes result files.

Successful commands emit one newline-terminated JSON object with schema
fixedstars-cli/1, command and status. list includes stars as full catalog
records with astrometry, motion, source locators and labelled historical
attributions. hits and parans include result as the corresponding library
result, preserving conventions, native natal envelopes, sky call records and
refusal details. Native Dates serialize as ISO strings. There is no rounding
or shortening of the library's reported numerical precision. Help prints usage
text. Errors emit a JSON diagnostic to stderr, with empty stdout and no stack.

Stars default to the committed catalog. Repeat --star to select ids, names or
aliases using findStar's lookup rules; aliases for the same selected star are
duplicates and reject. Selection order is retained for listing and positions;
contact ordering follows the library. Unknown stars never silently disappear.
Numbers must be finite plain signed decimals; exponent notation, hexadecimal,
whitespace and Infinity reject. Options take either --key value or --key=value.
Unknown options, positional arguments, missing values and repeated scalar
options reject. --help must appear alone or immediately after a command alone.
Command-specific options cannot be silently applied to another command.

hits requires --utc and both --conjunction-deg and --parallel-deg. Each orb
accepts a nonnegative degree value or none to disable that kind; zero selects
exact equality. Optional --latitude and --longitude must be supplied together
in degrees, east positive. --house-system uses the engine's names;
--time-known true|false, --time-scale utc|ut1|tt and --delta-t seconds retain
the native chart settings. Unknown time or absent coordinates omit angles.
The engine validates ranges, dates and settings. Date syntax follows the
parent engine parser, including explicit offsets and date-only midnight.
An unresolved local date-time rejects; the CLI does not resolve time zones.

parans requires --from, --to, --latitude, --longitude and --orb-ms. The window
includes from and excludes to, on the native sky UTC time basis. Select bodies
explicitly with repeated --body Sun, --body Moon or planet names; --bodies none
requests an empty body selection and cannot be combined with --body. There
is no implicit body selection. Repeat --angle 'Midheaven@INSTANT' for an
explicit angular-phase anchor. The other supported names are Ascendant,
Descendant and Imum Coeli; anchors must be inside the window and unique by
angle and instant. Angle-only contacts use --bodies none and retain the same
angle/sky provenance distinction as the library. An empty target selection
still returns complete star searches with no hits.

Optional --height is metres above the native observer ellipsoid.
--star-refraction and --body-refraction take none or standard, preserving
the native standard default. --body-limb takes centre, upper or lower;
selected planets accept centre alone. Stars always use centre.
--star-max-samples and --body-max-samples each accept a positive safe integer
or unlimited, with unlimited as the native default. The budgets apply to
each individual subject search, and any refusal clears all paran hits while
retaining every selected call. A pin or alternate time scale is supported
only by hits, since the sky solver has neither option.

| Exit code | Meaning |
| --- | --- |
| 0 | Complete result, including no hits, or help |
| 1 | Runtime or preparation failure, including incompatible sky source |
| 2 | Invalid or unsupported request |
| 3 | Whole paran result refused because of a sample budget |

The CLI contract, option rejection, JSON/native receipt preservation and exit
codes are enforced by [tests/cli.fixedstars.ts](tests/cli.fixedstars.ts) over
its synthetic charts and observer windows. Its half-circle matching and
whole-window event-product expectations are derived in
[GEOMETRY.md](GEOMETRY.md), CLI geometric and transport checks. That section
also derives the upper-meridian construction checked within two milliseconds
at its single synthetic anchor. These checks establish arithmetic and wiring;
they do not measure physical stellar accuracy. Catalog licensing and stellar
correction omissions apply equally to CLI results.

## Sky event searches

```ts
import { prepareStarSky } from "./node.mjs";
import { findStar } from "./src/index.js";

// Preparation reads local source and compiles in memory. Do it once.
const sky = await prepareStarSky();
const spica = findStar("Spica")!;
const observer = { latitude: 0, longitude: 0 };
// Invented observing window, not a person's birth data.
const from = "2000-03-20T00:00:00Z";
const to = "2000-03-21T00:00:00Z";
const stars = sky.starEvents(spica, observer, from, to, {
  refraction: "none", maxSamples: 10000
});
const body = sky.bodyEvents("Sun", observer, from, to);
console.log(stars.starId, stars.events, stars.provenance);
console.log(body.sky, body.provenance);
```

The preparation entry is Node-only, with a TypeScript declaration beside it.
The numerical source index exports StarSkySearch and its result types and
STAR_SKY_CONVENTIONS. After preparation both search methods are synchronous
and perform no file or network operations. Each prepared search has an
independent adapter scope and exposes its verified compatibility contract.
Source incompatibility rejects preparation; there is no fallback model.

starEvents accepts a CatalogStar, an engine Observer, explicit from and to
DateInput values, and optional native SkyOptions. It returns rise, set,
upper-transit and lower-transit events in time order. The window includes
from and excludes to; native event Dates identify the first whole millisecond
at which the crossing has happened. Dates and offsets normalize through the
engine's parser. Each sample follows the sky solver's UTC time-basis rules;
timeScale and deltaT options are unsupported here. The stellar ray advances
proper motion on each sample's TT and uses the engine's true-of-date rotation.

The normalized observer retains latitude and east-positive longitude in degrees
and height in metres, with absent height defaulting to zero. Horizon and
transit definitions are the engine's. Stars use the point-body centre;
upper and lower limb options are refused. Refraction defaults to standard;
none requests the geometric horizon. Altitude and azimuth remain unrefracted
degrees, with azimuth measured from north through east. Height affects the
observer projection, without applying horizon dip. The observer defaults,
refraction and geometric expectations are checked in
[tests/sky.fixedstars.ts](tests/sky.fixedstars.ts), over its synthetic
equatorial and polar observing windows; [GEOMETRY.md](GEOMETRY.md) derives
the expected altitudes and azimuths. These are construction and integration
checks, not a physical stellar accuracy measurement.

The star result identifies starId and retains the native normalized window,
observer, conventions, flags and samples; it does not expose the adapter slot
as a body identity. status is complete with events, or refused with reason
sample-budget and an empty events array. maxSamples is a positive integer or
Infinity, defaulting to unlimited. Budgets apply to each search call and keep
the engine's accounting, including refinement predicates. A coarse scan can
refuse before consuming its remaining budget. No partial events survive a
late refusal. Invalid inputs throw under the engine's validation rules.

Native never-rises and never-sets flags describe this window, not an assertion
that the star is globally circumpolar. Transits remain present when there is
no rise or set. outside-reference-span is retained even on budget refusal;
refused searches do not infer horizon flags. Stellar accuracy is unmeasured
inside and outside that reference span, and the engine's ephemeris-span
restriction still applies to its sample clock.

bodyEvents returns the entire unmodified native SkyEvents under sky, including
the body identity, body-specific limb defaults and refusal semantics. Both
methods also return provenance, explicitly a fixedstars-call-record with
nativeReceipt false. It contains engine and ephemeris identity, the verified
source contract, normalized request, effective horizon conventions and budget,
and a snapshot of status, flags, samples and events. Star records include the
actual astrometry and stellar model conventions used; body records retain
their native conventions without attributing the stellar model to them.
The contract identifies source compatibility, not authentication or accuracy.
No native sky receipt is available from the engine, and these records do not
extend a natal envelope.

The call record is a frozen, JSON-safe snapshot: instants are ISO strings,
unlimited budget is the string unlimited, and absent refusal reason is null.
It remains unchanged if a caller mutates native event or window Dates.
Result objects and arrays are frozen, but Date methods retain their native
mutability. Caller astrometry, observer, options and Dates remain untouched.

## Paran contacts

```ts
import { prepareStarSky } from "./node.mjs";
import { findStar, searchParans } from "./src/index.js";

const sky = await prepareStarSky();
// Invented observer, window and angular reference instant.
const result = searchParans(sky, {
  observer: { latitude: 0, longitude: 0 },
  from: "2000-03-20T00:00:00Z", to: "2000-03-21T00:00:00Z",
  stars: [findStar("Spica")!], bodies: ["Sun", "Moon"], orbMs: 1000,
  angles: [{ angle: "Midheaven", at: "2000-03-20T06:00:00Z" }],
  starOptions: { refraction: "none", maxSamples: 10000 },
  bodyOptions: { limb: "centre", refraction: "none", maxSamples: 10000 }
});
console.log(result.status, result.hits, result.stars, result.bodies);
```

searchParans is synchronous after preparation. It searches each selected star
and body once through the existing engine solver and pairs the complete event
results. Omitted stars selects the catalog; an empty array selects no stars.
bodies is required, including an explicit empty array for angle-only searches.
Nodes are unsupported by the native sky solver. Subject ids must be unique.
The observer and resolved UTC window are required, using the sky API's units,
clock and validation. There is no natal cast, inferred local day, default time
orb or implied noon reference.

A body hit pairs any star event with any body event inside the window when
their absolute time difference is within the inclusive orbMs, in milliseconds.
Different phases are eligible, such as a rising Sun and a culminating star.
All eligible pairs are returned, including repeated events in a longer window;
there is no nearest-only selection or conversion to a longitude orb. Zero
requires identical returned event milliseconds. Fractional millisecond orb
limits are accepted, while event timestamps retain the engine's whole
millisecond resolution. Exact binary64 arithmetic decides eligibility and
ordering without an epsilon; reported differences round once. The arithmetic
and explicit boundary examples are enforced by
[tests/parans.fixedstars.ts](tests/parans.fixedstars.ts), over its hand-authored
synthetic event schedules, with derivations in [GEOMETRY.md](GEOMETRY.md).

Optional angles supplies explicit angle and at reference anchors. Ascendant
selects star rise, Descendant selects set, Midheaven selects upper transit,
and Imum Coeli selects lower transit. An anchor asks whether that stellar
angular phase occurs within orbMs of its supplied instant. It describes an
angular phase at the observer, without asserting that the star occupies the
ecliptic point carrying the same name. The natal-hit API separately compares
ecliptic angle points. No angle sky call or angle receipt is fabricated.
Repeated anchors for the same angle are allowed at different instants;
duplicate angle/instant pairs are refused.

Both events and every anchor must be inside the half-open window [from,to).
The orb never pads the window or wraps a difference across midnight. Events
outside it are ineligible even if close to an interior event. Native starOptions
and bodyOptions are independently configurable: their effective horizon and
limb conventions remain in the retained call records. Geometric angle phases
use refraction none; standard refraction instead selects the solver's refracted
rising or setting phase. The Sun and Moon otherwise retain their native upper
limb default. Transits retain the native meridian definition. The stellar
correction omissions and unmeasured physical accuracy still apply.

maxSamples is per search call, without an aggregate paran budget. Every selected
call is retained. If any search refuses, the entire paran result has status
refused, reason sample-budget and no hits, even if other searches completed.
Otherwise status is complete, including for an empty hit set. Window-local
never-rises/never-sets and reference-span flags stay attached to their individual
subject results. Circumpolar stars can still produce transit contacts.

Each hit identifies starId, targetId, targetKind, kind paran, both event kinds,
both ISO timestamps, signed offsetMs (star minus target), orbMs and maximumOrbMs.
Its provenance indexes the retained stars and bodies arrays through starSearch
and bodySearch; bodySearch is null for an angle anchor. Those arrays sort by
subject id. Hits sort by exact time orb, then star id, target kind, target id,
star instant, target instant and event kinds, with UTF-16 string ordering.
Input order and the host locale do not affect ties. Each retained star result
and native body result keeps its fixedstars call record and conventions. These
are the sky provenance described above, without a native sky receipt or an
astrometric accuracy certification.

pairParanEvents(stars, bodies, { observer, from, to, orbMs, angles }) supplies
the same pure matching operation for previously prepared results, with no sky
calls. It requires matching observers and windows, unique subjects, valid
interior events, and agreement between subject identities/event times and their
captured call records. A mutated native event Date is refused if it disagrees
with that snapshot. Supplied results and records remain caller claims rather
than authenticated calculations. The result, hit rows, policy fields, anchors
and array containers are frozen; retained native results keep their original
objects, including their Date mutability. ISO hit times and captured call
records remain stable after a caller mutates those Dates. Caller inputs are
not frozen or changed.

[tests/parans.fixedstars.ts](tests/parans.fixedstars.ts) also checks synthetic
simultaneous Sun rise and star upper/lower transit construction, native body
result preservation, independent per-call budgets, whole-result refusal and
angle-only circumpolar contacts. [GEOMETRY.md](GEOMETRY.md) derives the
simultaneous geometry and distinguishes it from physical accuracy evidence.

## Sky adapter implementation

The internal adapter now executes the existing parent src/sky/riseset.ts in
an isolated in-memory bundle. It redirects only that module's astronomy-engine
import to [src/sky-vector.ts](src/sky-vector.ts). Other imports keep the real
dependency. During a synchronous star search, the adapter binds a catalog
J2000 direction to the solver's Pluto point-body slot, advances its transverse
motion at every sampled TT instant, and lets the engine perform the frame
rotation, observer projection and event searches. The direction is represented
by a large finite numerical ray scale, which is not a catalog distance.
Stellar parallax and the other stellar correction omissions described in the
positions section still apply.

The binding clears on every exit. Reentry and promise-returning scopes are
refused. Ordinary bodies retain their native vector calls outside the binding;
other bodies also retain them inside it. No global export or star registry is
patched. Each loaded bundle has its own scope. The dependency's normal engine
clock side effect remains the one documented in the parent README.

[scripts/build-sky-adapter.mjs](scripts/build-sky-adapter.mjs) checks the
engine version, consumed engine source bytes and import graph, and the pinned
ephemeris version and source digest against
[sources/engine-sky-contract.json](sources/engine-sky-contract.json). It checks
the engine bytes supplied to the compiler as well. An incompatible checkout
fails explicitly; the script does not silently update its contract. Reviewing
a new engine requires reviewing its solver, vector shape, point-body slot,
frame and clock dependencies, then intentionally recording a new contract
and rerunning the adapter tests. A digest contract establishes compatibility,
not astronomical accuracy or an authenticated engine receipt.

Verify the proof without emitting an engine build:

```sh
node fixedstars/scripts/build-sky-adapter.mjs
```

The raw adapter interface is internal and absent from the library index. Its
raw star result names the private Pluto slot; the prepared public wrapper
replaces that identity with starId and captures the call record. The
scope, unchanged-body comparisons, error restoration and compatibility
refusals are checked in [tests/sky-vector.fixedstars.ts](tests/sky-vector.fixedstars.ts)
and [tests/sky-adapter.fixedstars.mjs](tests/sky-adapter.fixedstars.mjs).
[GEOMETRY.md](GEOMETRY.md) derives the equatorial event checks and distinguishes
them from independent physical accuracy evidence.

## Catalog snapshot

The catalog contains 44 HIP-backed named bright stars, enforced by
[tests/catalog.fixedstars.mjs](tests/catalog.fixedstars.mjs) over the full
selection in [sources/selection.json](sources/selection.json). This is a
curated selection, not a complete historical list. HYG names label specific
selected components; they do not resolve every member of a multiple system.
Coordinates describe the J2000 mean equator/equinox at the J2000 epoch.
The source-frame interpretation is an inference described in the source notes;
the catalog is not an independent astrometric arbiter and has no measured
error bound. It includes direction and optional angular motion, without
stellar parallax, perspective acceleration, annual aberration or light
deflection.

```ts
import { catalog, findStar } from "./src/index.js";

const star = findStar("Spica");
console.log(star?.raDeg, star?.decDeg, star?.properMotion);
console.log(star?.historicalAttributions);
console.log(catalog.map(({ id, name }) => ({ id, name })));
```

These are TypeScript source imports for a runner or bundler, not emitted
JavaScript files. The catalog and all nested records are frozen. findStar
returns the matching record or undefined; it matches an id, name or alias
case-insensitively after trimming outer whitespace. Empty or non-string
queries throw RangeError. Bayer/Flamsteed, HIP and HR aliases come from HYG;
historical aliases name their passage in the selection metadata. Unsupported
lore identifications remain empty, with a reason in the selection record.
Scope and graded wording are preserved: a constellation attribution does
not claim that the passage names every star individually.

Regenerate only this folder's catalog, without an engine build:

```sh
npm --prefix fixedstars run catalog:build
npm --prefix fixedstars run catalog:check
npm --prefix fixedstars run catalog:fetch
```

The first command rebuilds from committed selected raw rows. The second
checks for identical generated source. The third explicitly streams the
pinned remote HYG file, verifies its digest and header, retains only selected
raw records, and rebuilds. It never writes the bulk source catalog to disk.
The import compiler runs in memory and consumes the existing engine helpers.
Regeneration checks prove traceability and arithmetic consistency; the
independent geometric cases in GEOMETRY.md test the conversion's construction.

## Positions on a chart clock

```ts
import { catalog, starPositions } from "./src/index.js";

// Invented instant, with the same clock fields accepted by natalChart.
const result = starPositions({ utc: "2000-03-20T06:00:00Z" }, catalog);
console.log(result.positions, result.timeBasis, result.conventions);
```

starPositions defaults to the committed catalog. A supplied array selects stars
in caller order and must have unique ids. Its clock fields are utc, timeScale
and deltaT, resolved through the existing engine onChartClock helper. Positions
use TT for both motion and frame orientation, including a caller's pinned
deltaT. The native time-basis record describes that resolution; this function
casts no chart and makes no sky search, so it does not create either receipt.

Each row carries starId, ttDays, elapsedJulianYears, directionJ2000, motion,
lonDeg, latDeg, raDeg and decDeg. Longitudes and RA are degrees in [0,360);
latitudes and declinations are north positive. A numerical pole has null RA
or longitude and a false raDefined or lonDefined flag. The engine's
RA_POLE_TOLERANCE governs that singularity convention. The position rows,
their direction vectors and the positions array are frozen.

propagateStarDirection is a pure vector calculation on the catalog's J2000
axes. It uses the cosine-weighted RA motion and declination motion as tangent
components, advances a linear tangent vector over elapsed Julian years, and
normalizes the resulting direction. Null motion leaves the catalog direction
unchanged and reports unavailable; tabulated zero remains available motion.
starPositionAtTt accepts days of TT from J2000 and applies the existing
engine's eclipticRows and equatorRows true-of-date rotations. It and the clock
wrapper refuse instants outside the engine EPHEMERIS_SPAN. A catalog pole
with nonzero motion is refused because its RA tangent convention is undefined.

These positions omit radial motion, stellar parallax, perspective acceleration,
annual aberration and gravitational deflection. They are rotated catalog
directions with transverse motion, not fully apparent stellar places. Natal
bodies have the engine's own corrections, so comparisons with stars must
retain this difference in conventions. No physical accuracy bound is claimed.
[GEOMETRY.md](GEOMETRY.md) derives the motion and rotation checks in
[tests/positions.fixedstars.ts](tests/positions.fixedstars.ts), distinguishes
independent ERFA comparisons from engine integration checks, and names their
reference span.

## Pure contact matching

```ts
import { findStarContacts } from "./src/index.js";

// Invented coordinate rows, already on the same true-of-date frames.
const result = findStarContacts(
  [{ starId: "synthetic-star", lonDeg: 359.5, decDeg: 30 }],
  [{ targetId: "Synthetic angle", targetKind: "angle", lonDeg: 0.5, decDeg: 31 }],
  { conjunctionDeg: 1, parallelDeg: 1 }
);
console.log(result.hits, result.orbs, result.conventions);
```

findStarContacts consumes starId, lonDeg and decDeg from each star row, so
starPositions(...).positions can be passed directly. Targets supply targetId,
targetKind (body or angle), lonDeg and decDeg. The caller must put every row
at the same instant and on the chart's true equator and equinox of date.
The matcher does not rotate, cast, or verify coordinate provenance. The stellar
correction omissions described above still apply when comparing natal bodies.

The required orb policy has only conjunctionDeg and parallelDeg. Each is an
inclusive angular limit in degrees from zero through a half circle; null
disables that kind. Zero requests exact coordinate equality. There are no
luminary overrides or default orbs. Conjunctions compare the shortest projected
ecliptic-longitude arc, independent of latitude. Parallels compare the absolute
difference of signed declinations, independent of longitude and RA. Opposite
declinations do not become contraparallels implicitly. The constructed cases
and policy limits are enforced in [tests/contacts.fixedstars.ts](tests/contacts.fixedstars.ts)
and derived in [GEOMETRY.md](GEOMETRY.md), Pure contact geometry.

Longitude must be normalized to [0,360) degrees or explicit null. A null star
or target longitude skips conjunctions for that pair and leaves parallels
eligible. Target declination may be null, which skips parallels alone; star
declination must be available. Declinations are north positive in [-90,90]
degrees. Other missing, nonfinite or out-of-range coordinates reject even on
disabled kinds or when the other array is empty. Unavailable angles can be
omitted by the caller; null coordinates never become zero.

Ids follow the existing engine body-label rule: nonempty, trimmed,
case-sensitive strings of at most 80 UTF-16 code units, without C0 controls
or DEL. Star ids must be unique. Target ids must be unique within targetKind;
the same label can identify a body and an angle. Invalid or duplicate rows,
non-array inputs, and missing or unsupported orb fields throw RangeError.

Each hit contains starId, targetId, targetKind, kind (conjunction or parallel),
orbDeg and maximumOrbDeg. Both kinds can match the same pair. The result,
hits, policy snapshot and conventions are frozen without freezing caller
inputs. Engine exact-arithmetic helpers decide eligibility and ordering on the
exact binary64 coordinate values. No epsilon widens an orb. Only the reported
orb is rounded, once, to nearest with ties to even. Results sort by exact orb,
then starId, targetKind, targetId and kind in UTF-16 string order. Input order
and host locale do not break ties. These semantics are checked by the same
contact tests, including an independent integer representation of the doubles.
This function calls neither chart casting nor sky search and creates no
engine receipt. natalStarHits supplies the natal envelope described below.

## Natal chart hits

```ts
import { natalStarHits } from "./src/index.js";

// Invented birth input. Choose both angular limits explicitly, in degrees.
const result = natalStarHits(
  { utc: "2000-03-20T06:00:00Z", latitude: 12, longitude: 30 },
  { conjunctionDeg: 0.5, parallelDeg: 0.5 }
);
console.log(result.hits, result.targets, result.stellar.positions);
console.log(result.natal.receipt, result.conventions);
```

natalStarHits accepts an engine BirthInput, the same required ContactOrbs as
findStarContacts, and an optional array of CatalogStar records. Omission uses
the committed catalog; an empty array requests no stars. The function casts
the natal chart through the engine, then uses its canonical input clock for
stellar motion and frame rotation. It retains the original time scale and
optional caller pin, rather than pinning a freshly evaluated model deltaT.
The optional stars array has the same selection rules as starPositions.

Targets include every native body row, including the true north and south
lunar nodes. Body declinations come from chartDeclinations using full ecliptic
latitude. Available native angles are labelled Ascendant, Midheaven,
Descendant and Imum Coeli. Their declinations come from the engine's
eclipticToEquatorial helper at zero ecliptic latitude and the chart's true
obliquity. Thus an angle parallel refers to that point on the ecliptic; it
does not describe the observer's zenith. Unknown time or absent coordinates
omit angle targets and preserve the native envelope's absence reason.
An unknown time keeps the caller's reference instant without inferring noon.
House fallback and coverage flags remain in the native receipt.

The result contains hits and orbs with the pure matcher's semantics, targets,
stellar (the starPositions result), natal (a native engine NatalEnvelope),
and conventions. The native envelope is captured once for the chart underlying
every hit, with the default createNatalEnvelope context. Its normalized instant
is retained; sourceInstant is null because no separate original-spelling context
is supplied. It can be passed to the engine's native serializer and parser.
The envelope covers chart results only. Derived target declinations, star
coordinates and contacts remain separate and are not additions to its receipt
or an accuracy certification. Stellar correction omissions still apply when
comparing the catalog directions with the engine's natal bodies.

The result graph is frozen, including the fresh native envelope and clock
record. Caller birth input, policies, arrays and star records remain untouched.
The function performs no network request, file operation or sky search.
It uses the engine's validation for birth settings and the contact matcher's
validation for orbs and matching rows. Invalid input throws; disabled contact
kinds still require valid coordinates.

chartContactTargets(chart) derives the same frozen target rows from a supplied
engine Chart without casting it again or creating a receipt. As with the
engine's chartDeclinations, supplied numerical chart values remain caller
claims. Clock and flag consistency are checked by the engine, body directions
are derived with its declination helper, and target labels and angle coordinates
are checked with the existing contact matcher.

[tests/natal.fixedstars.ts](tests/natal.fixedstars.ts) checks hand-derived
target geometry against the parent's independent ERFA obliquity at the
constructed TT reading used there, as derived in
[GEOMETRY.md](GEOMETRY.md), Natal target geometry and receipt assembly.
The synthetic chart and native-envelope checks are integration tests, not
independent ephemeris accuracy evidence.

