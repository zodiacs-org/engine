# Breaker review of 1.1.0-rc.10 (draft pull request 101)

A second session's check of the candidate, made on 2026-11-15 (ICT) at head
`5ea3efaae1b34b7ef987e612c925bef65d99bf5a`. It did not write the candidate.
Everything below was run again here; the builder's logs in `../results/`
were read, not reused. Nothing was tagged, published, merged or marked
ready. CI was not waited for.

Machine: one Linux x86-64 host, Node 22.22.2 unless a line says otherwise.
The host has a root-owned `/node_modules`, so every command ran in a mount
namespace without it, with `TMPDIR` outside the checkout. No `ZODIACS_*`
variable was set in any run. Births and places are synthetic.

The installed package in every run below is the carried tarball
`artifacts/zodiacs-engine-1.1.0-rc.10.tgz` (SHA-256
`7fbdf3ade2a3350970e8e4195cda02ad596cbc2ca46c955ceae44a0ce7613246`,
2,716,319 bytes), put into a new empty directory with `npm install`
(`tools/install.sh`): 98 files, 4,540,059 bytes, beside astronomy-engine and
nothing else.

## Verdict: one blocker

**B1. Ten functions of `@zodiacs/engine/techniques` still fall back
silently.** With the pack damaged (one character of its text changed, in the
installed package), each of these returns astronomy-engine's result, byte
for byte what `setDefaultEphemeris("astronomy-engine")` gives, and nothing
in the result says so: no flag, no ephemeris name
(`results/silent-intact.jsonl`, `results/silent-damaged.jsonl`,
`results/hash-*.json`; `tools/silent.mjs`, `tools/probe.mjs`).

| function | returns | intact | pack damaged |
| --- | --- | --- | --- |
| `solarReturnInstant(25, 2020-03-01)` | a Date | 12:04:02.243Z | 12:04:27.575Z (25.3 s later) |
| `mostRecentSolarReturnInstant(25, 2020-03-01)` | a Date | 06:10:14.031Z | 06:10:02.541Z |
| `lunarReturnInstant(25, 2020-03-01)` | a Date | 03:31:09.346Z | 03:31:08.541Z |
| `moonIngresses` | an array | 1990-04-18T10:52:33.880Z | 10:52:32.026Z |
| `moonAspects` | an array | 14:59:59.201Z | 14:59:57.328Z |
| `voidOfCourseAt` | an object with no `flags` | next from 16:24:23.786Z | 16:24:26.853Z |
| `voidOfCourseWindows` | an array | the same window | the same shift |
| `moonSignsBetween` | an array of signs | (the signs did not change in this sample) | no label either |
| `compositeChart(birth, birth)` | an object with no `flags` | Sun 302.80618085° | 302.80604468° |
| `chartAspectPatterns(birth)` | an object with no `flags` | Sun 25.11385484° | 25.11370235° |

The same holds out of coverage: in 1750 and 2230 these ten carry no
`"outside-de440-span"` (`results/probe-intact-1750.log`,
`results/probe-intact-2230.log`). Two more on the `./internal` entry,
`bodyLongitude` and `longitudeSpeed`, return bare numbers and cannot say.

Why it blocks: the owner's call is that every affected result says so. The
packed README ("No fallback is silent"), `CHANGELOG.md` ("Never a silent
fallback") and `docs/de440.md` ("every result is astronomy-engine's and says
so"; "the `flags` of the timing and techniques entries' results") name one
exception, `findLongitudeCrossings`. The builder's handoff names the same
one. These ten are not named anywhere. `src/ephemeris-fallback.test.ts`
tests one techniques function, `solarReturn`, which does carry the flag.

What would close it: a field on the three object results; for the functions
that return a bare Date or array, either a result that can carry a flag or
a plain list of them in the README, the CHANGELOG and `docs/de440.md` beside
`findLongitudeCrossings`, with the owner's agreement that a documented
exception is enough. Both touch packed files, so either is a new candidate.

Everything else the owner asked for holds. The numbers follow.

## 1. calc() and birthWindow on DE440, and agreement with natalChart()

`tools/agree.mjs`, `results/agree.log`: 2,000 UTC instants from 1800-01-01
to 2199-12-31 (six chosen ends and leap seconds, the rest from a fixed
generator), twelve bodies.

- `calc()` against `positions()`: **0″ in longitude, latitude and speed in
  23,988 of 23,988 rows** (equal to the bit). It was up to 29.19″ in
  1.1.0-rc.9. Every pair names `jpl-de440`. The other 12 rows are one
  instant, 2199-12-31T23:59Z, which `calc()` refuses (`out-of-range`: its TT
  is past the entry's 2200 limit) and `natalChart()` computes
  (`results/anom.log`).
- `chart()` against `natalChart()`: bodies, angles and houses equal as JSON
  in 299 of 300; the one is the same refused instant.
- `birthWindow()`: 150 two-hour windows, eight instants in each: the cell's
  sign for each body is `natalChart()`'s in 14,400 of 14,400; every window
  names `jpl-de440`, none is flagged.
- For scale, the same code after `setDefaultEphemeris("astronomy-engine")`
  is up to 29.17″ from the default positions (Pluto, 2199-12-30), which is
  what 1.1.0-rc.9's `calc()` gave.

Still on astronomy-engine, by design, and unchanged by a damaged pack (the
same bytes out, `results/hash-*.json`): `calc()` with a heliocentric,
barycentric or topocentric center, an astrometric or geometric correction,
or the Earth (its receipt names astronomy-engine); the sky entry's four
functions; `ayanamsa()`. The reason given (the pack's reduction makes only
the apparent geocentric place, and the other products' bounds were measured
on astronomy-engine) holds: none of them is a position `natalChart()` gives.
The sky entry's results name no ephemeris at all.

## 2. No silent fallback

`tools/damage.mjs` rewrites the installed package's chunk that holds the
pack; `tools/damage-all.sh` does it thirteen ways, each on a new copy and in
a new process, and runs `tools/probe.mjs`, which makes 59 calls across
the root and the calc, window, techniques, timing, sky, vedic, internal and
receipt entries and reads what each result says
(`results/probe-<mode>.log`).

| damage | what happens |
| --- | --- |
| text empty (bytes missing) | `defaultEphemeris().de440.opened` false, `error` "the pack's SHA-256 is not the one expected"; of 59 calls 34 results carry `"de440-unavailable"`, 3 name astronomy-engine by design, 22 say nothing (below), none names `jpl-de440` |
| one character changed (middle, first, near the end); 333 characters changed | the same |
| cut to half; cut by four characters; halves swapped; all zero bytes | the same |
| not base64 | the same, `error` "Invalid character" |
| the expected SHA-256 changed, bytes intact | the same |
| the chunk file cut to half, or emptied | the import throws `SyntaxError` before anything is computed |

Flagged or named in every one of the eleven that load: `natalChart`,
`positions`, `transits`, `synastry`, `progressedBodies`, `moonPhase`,
`saturnReturn`, `searchLongitudeCrossings`, a natal receipt, `calc` (four
requests), `chart`, `events`, `birthWindow`, `solarReturn`, `lunarReturn`,
`moonSignCandidates`, `davisonChart`, the timing entry's nine, `siderealChart`,
`vargaSensitivity`. No result names `jpl-de440` in any damaged run. Not
flagged: the ten of B1, `findLongitudeCrossings` (documented), the two
internal functions, and results derived from a chart the caller supplies
(`chartPoints`, `chartDeclinations`, a dasha from a longitude), whose chart
carries the flag.

Out of coverage (`tools/span.sh`): in 1750 and 2230 the same results carry
`"outside-de440-span"` and name astronomy-engine; `calc()`, `chart()`,
`events()` refuse (`out-of-range`) and `birthWindow` throws `RangeError`.
Born in 2195 with a target in 2225, `transits`, `solarReturn`, `lunarReturn`,
`saturnReturn`, the profections, firdaria and planetary returns are flagged
and the natal chart is not.

Tests: `src/ephemeris-fallback.test.ts` has the missing case (empty text),
three damaged cases (one character, cut short, not base64), the out of
coverage case and the caller's choice: 29 tests, all pass in the suite run
below. `scripts/verify-packed-consumer.mjs` does the four unavailable cases
to the installed package and passes on Node 22.22.2, 20.19.0 and 24.21.0
(`results/consumer-*.log`).

## 3. Pack and credit

The tarball is 2,716,319 bytes. `NOTICE` (*DE440 pack*) credits the Jet
Propulsion Laboratory and NAIF and cites Park, Folkner, Williams and Boggs
2021; `LICENSING.md` (*DE440 pack*) records the source kernel and what
NAIF's rules say. Both files in the installed package equal the tree's.

## 4. The number, the CHANGELOG line, the docs

1.1.0-rc.10: `archives.json` keeps 1.1.0-rc.9's entry and bytes
(`f1801f0a...`, 2,703,974) and adds 1.1.0-rc.10's; `--rebuild-all` rebuilds
both. `docs/calc.md` (*Which ephemeris*) and `docs/vedic.md` say what
1.1.0-rc.10 does; no document still says `calc()` or `birthWindow` computes
on astronomy-engine by default.

The CHANGELOG line is there and bold. Its figure is the true largest value
of the sweep it cites (`../../de440-sweep-20261111/`: Pluto 29.19″ on
2199-12-31, true node 32.64″), and the entry says the sweep read one instant
a day at noon TT. **It is not a cap** (should-fix S1): the pack's reduction
bends light with no cut at the Sun's limb, and astronomy-engine does not
bend it, so a planet behind the Sun moves further. Neptune's default
longitude is 33.37″ from astronomy-engine's (latitude 18.15″) at
1920-08-03T23:48:31Z, 0.0234° from the Sun's centre, inside its disc; at
noon TT on the 3rd and the 4th it is 11.90″ and 13.83″
(`tools/shift.mjs`, `results/shift.log`). A closer passage would give more.
"Can shift by up to 29 arcseconds for the Sun, the Moon and the planets"
(CHANGELOG) and "up to 29.19″" (README) read as a limit.

## 5. The 240 L1 vectors on the installed tarball

`tools/l1.mjs` (this session's own runner), `results/l1.log`: Node 22.22.2,
no `ZODIACS_*` variable, nothing set or opened, `natalChart()` on each
vector's TT instant.

**240 of 240 within 1″.** Worst: 0.0126″ in longitude (L1-POS-0002, the
Moon), 0.0010″ in latitude (L1-POS-0222, the Moon). The Sun and the planets
are within 0.0038″. Every chart and row names `jpl-de440`; no fallback flag.
The arbiter is the vectors' own, JPL Horizons (DE441), 24 TT instants a
body from 1851 to 2148.

## 6. Pull request 102

`fe498896ad2e68a090519ca35f4e39d5b94d0baa` is an ancestor of the head, and
is still the head of pull request 102's own branch, which is untouched.
`tools/dt.mjs`, `results/dt.log`, on the installed package's default path:
30 of 30 checks pass. At 2199-06-15T12:00Z on UTC, `calc()` for the Moon,
the Sun, Mercury and Pluto is on `jpl-de440`, carries
`"delta-t-extrapolated"`, and quotes the pack's bound plus the body's rate
times the TT band (the Moon 0.013″ to 57.47″; band 103.06 s); the pack's
place at ΔT plus and minus σ moves less than the widening in each (the Moon
57.4536″ against 57.4559″). A present-day instant, TT input and a pinned ΔT
are not flagged and keep the pack's bound. `natalChart`, `chart`, `houses`
and `events` flag as pull request 102 describes.

Should-fix S2: the suite runs pull request 102's tests on astronomy-engine
(`src/test-setup.ts`); no test in the suite holds the flag or the widening
on the pack.

## 7. Gates at `5ea3efa`

`results/gates-5ea3efa-v22.22.2.log` (the builder's `../tools/gates.sh`, run
again): all 18 commands exit 0. Typecheck; `npm test` 4,285 passed, 3
skipped, none failed (108 files, one skipped); build; exports smoke; API
check; package contents (98 files, 4,540,059 bytes; beside the pack
1,220,507 of 1,225,000; the root's graph 147,832 of 149,400); pack dry run;
pack generator check; archive binding; conformance selftest, 500 vectors,
the plain run and the astronomy-engine run against their committed results,
report check; atlas check and selftest; Offline CLI consumer, both steps.

`results/rebuild-all.log`: `--rebuild-all` exits 0, 25 recorded archives (21
carried, 4 superseded) rebuild to their bytes. Packed consumer on the
carried tarball: exit 0 on Node 22.22.2, 20.19.0 and 24.21.0. Not run: Node
22.7.0 (not on the machine); the suite on Node 20 and 24.

The size caps pass only because this candidate raised them: the total from
1,185,000 to 1,225,000 and the import-graph budgets of the root and of the
calc, internal, sky, techniques, timing, vedic and window entries among
others. The owner has not approved them (should-fix S3, a decision).

## 8. State

Pull request 101 is open and a draft. No tag on the remote names 1.1.0; npm
has `latest` 1.0.0 and `next` 0.1.1-rc.16; the newest GitHub release is
v0.1.1-rc.15. The four commits since `8b9a1a5` are by Zodiacs Admin
<admin@zodiacs.org>, with no trailer. No other pull request's branch moved.

## Should-fix

- S1. The "up to 29 arcseconds" wording (section 4): say it is the largest
  of one instant a day, and that a planet behind the Sun moves more
  (33.37″ measured for Neptune).
- S2. A suite test for pull request 102's flag and widening on the pack
  (section 6).
- S3. The raised size caps need the owner's yes (section 7).
- S4. `src/ephemeris-fallback.test.ts` and the packed-consumer check cover
  one techniques function and one timing function; after B1 is fixed they
  should cover each function that reads positions.
- S5. The sky entry's results and `ayanamsa()` name no ephemeris. They are
  astronomy-engine's by design and do not change when the pack is damaged,
  but a caller cannot read that from the result.
- S6. `calc()` refuses 2199-12-31T23:59Z, which `natalChart()` computes: the
  one instant in 2,000 where the two do not give the same answer.
- S7. As the builder listed: on the pack `calc()` quotes no bound for a
  distance, a speed or the true node; the `clients/` contract does not list
  the two new flags.
