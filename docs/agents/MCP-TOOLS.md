# MCP tools for agents

The `zodiacs-astro` MCP server in [`mcp/`](../../mcp/README.md) calculates
locally over stdio or loopback Streamable HTTP, with the carried
`@zodiacs/engine` 1.0.0 archive. It fetches nothing and stores nothing. This
page lists every tool it registers: inputs, outputs, receipt roles, limits and
one synthetic example each. All example inputs are synthetic.

## Reading a result

- A successful call returns `structuredContent` with
  `schemaVersion: "zodiacs-astro/1"` and `data`, and a text item holding the
  same JSON.
- Chart tools add `receipts`, a list of `{ role, envelope }`. Select a receipt
  by `role`, not by position. Each envelope is a native engine natal receipt:
  `receipt` holds the request and conventions, `result` the recorded chart
  values. A receipt records a calculation; it is not an accuracy certificate
  or a signature.
- `resolve_civil_time` adds `record` with role `time-resolution` instead. It
  names the engine and zone data used and is not a chart receipt.
- Invalid arguments and engine refusals return `isError: true` with a text
  message and no `structuredContent`. An unknown tool name is a JSON-RPC
  invalid-params error.
- Instants are ISO 8601 text with `Z` or an explicit offset, at most
  millisecond precision. Longitudes, orbs and angles are in degrees.

## Birth input

Chart tools take a birth object:

| Field | Meaning |
| --- | --- |
| `utc` | resolved instant, required; never a local wall time |
| `latitude`, `longitude` | degrees, supplied together; without them angles and houses are absent |
| `houseSystem` | one of `whole` (default), `placidus`, `porphyry`, `equal`, `equal-mc`, `vehlow`, `koch`, `regiomontanus`, `campanus`, `topocentric`, `alcabitius`, `morinus`, `meridian` |
| `timeKnown` | `false` keeps `utc` as a reference instant and suppresses angles and houses; no noon is assumed |
| `timeScale` | `utc` (default), `ut1` or `tt` |
| `deltaT` | pinned TT minus UT1, seconds |

Objects are strict: an unknown key is an error. To start from a written local
time, call `resolve_civil_time` first and pass its `resolution.utc` as `utc`.
The chart receipt then records the instant only, not the local resolution.

## `resolve_civil_time`

Inputs: `date` (`YYYY-MM-DD`, as written), `time` (`HH:MM` or `HH:MM:00`; the
engine resolves to the minute), `timeZone` (IANA name); optional `longitude`
(degrees east, birthplace), `calendar` (`gregorian` default, or `julian`) and
`country` (ISO 3166-1 alpha-2 code or tzdata country name). There is no place
lookup: the caller supplies the zone.

Outputs: `data.status` is `resolved`, `gap` or `fold`, followed by
`data.request` and `data.resolution`, the native `resolveLocalToUtc` result
from `@zodiacs/engine/geo`: `utc`, `offsetMinutes` (may be fractional),
`flags` (`dst-gap`, `dst-fold`, `lmt`), `date` (Gregorian), `writtenDate`,
`calendar`, `jump`, `transition`, `localMeanTime`, `zone`,
`intlOffsetMinutes`, `calendarNote` and `localResolution`. A gap moves the
wall time forward by the jump; a fold gives the earlier of the two instants.
Unless `status` is `resolved`, ask the person which time they mean before
using the instant. `lmt` means a local mean time clock read the wall time;
with `longitude` that is the birthplace's own mean time. A `calendarNote` of
`old-style` or `new-style` says the date may have been written in the other
calendar; it never changes the instant.

Record: `time-resolution`, with `engine` (name and version), `shippedTzdb`
(version, SHA-256 of the tzdata archive and form of the history the engine
ships and uses before 1970) and `answeredBy` (which data gave this offset:
`tzdb` for the shipped history, or `intl` for the host's time zone data from
1970, with the host's tzdb version). Results from 1970 on depend on the host's
time zone data.

Limits: no network and no place lookup; seconds other than `00` are refused.
`mcp/test/civil-time.mcp-test.ts` checks the 45 `time.zone-offset` vectors of
`conformance/vectors/L3-time-calendars.json` (tzdb 2025c with backzone as
arbiter) through the tool; the other kinds in that file have no input this
tool takes.

```json
{ "date": "2026-03-08", "time": "02:30", "timeZone": "America/New_York" }
```

Excerpt of the actual result:

```json
{
  "data": {
    "status": "gap",
    "resolution": {
      "utc": "2026-03-08T07:30:00.000Z",
      "offsetMinutes": -240,
      "flags": ["dst-gap"],
      "jump": { "kind": "gap", "cause": "dst" },
      "transition": { "at": "2026-03-08T07:00:00.000Z", "offsetBeforeMinutes": -300, "offsetAfterMinutes": -240 },
      "localResolution": { "gapShiftMinutes": 60, "policy": { "fold": "earlier", "gap": "shift-forward" } }
    }
  },
  "record": {
    "role": "time-resolution",
    "engine": { "name": "@zodiacs/engine", "version": "1.0.0" },
    "shippedTzdb": { "version": "2025c", "form": "main+backzone" },
    "answeredBy": { "source": "intl", "dataForm": "host" }
  }
}
```

## `natal_chart`

Inputs: `{ birth }`.

Outputs: `data.chart`, the native chart: `input`, `bodies` (longitude,
latitude, speed, sign and degree), `angles`, `houses`, `aspects`, `flags`,
`deltaT`, `timeScale` and `engineVersion`.

Receipt roles: `natal`.

Limits: the engine refuses instants outside its supported span.

```json
{ "birth": { "utc": "2000-02-03T04:05:06+02:00", "latitude": 12, "longitude": 34 } }
```

Excerpt of the actual result:

```json
{
  "schemaVersion": "zodiacs-astro/1",
  "data": {
    "chart": {
      "input": { "utc": "2000-02-03T02:05:06.000Z", "houseSystem": "whole", "timeKnown": true },
      "bodies": [{ "body": "Sun", "sign": "aquarius", "retrograde": false }, "..."],
      "flags": [],
      "engineVersion": "1.0.0"
    }
  },
  "receipts": [{ "role": "natal" }]
}
```

## `transits_at`

Inputs: `{ birth, at }`.

Outputs: `data.transit` with `natal`, `at`, `positions` and `aspects` (`a` is
the moving body, `b` the natal body), and `data.sky`, the coordinate-free
chart at `at`. The sky uses the default UTC time basis.

Receipt roles: `natal`, `transit-sky`. The sky receipt covers positions, not
the aspects between the charts.

```json
{ "birth": { "utc": "2000-02-03T04:05:06+02:00", "latitude": 12, "longitude": 34 }, "at": "2026-01-03T00:00:00Z" }
```

Excerpt of the actual result:

```json
{
  "data": {
    "transit": {
      "at": "2026-01-03T00:00:00.000Z",
      "positions": [{ "body": "Sun", "sign": "capricorn" }, "..."],
      "aspects": [{ "a": "Venus", "b": "Venus", "type": "conjunction" }, "..."]
    }
  },
  "receipts": [{ "role": "natal" }, { "role": "transit-sky" }]
}
```

## `transits_now`

Inputs: `{ birth }`. The server reads its clock once per call.

Outputs and receipt roles: as `transits_at`, at the current instant.

```json
{ "birth": { "utc": "2000-02-03T04:05:06+02:00", "latitude": 12, "longitude": 34 } }
```

Excerpt of the actual result (natal fields only; the rest depends on the
clock):

```json
{
  "data": { "transit": { "natal": { "bodies": [{ "body": "Sun", "sign": "aquarius" }, "..."] } } },
  "receipts": [{ "role": "natal" }, { "role": "transit-sky" }]
}
```

## `synastry`

Inputs: `{ first, second }`, two birth objects.

Outputs: `data.synastry` with charts `a` and `b`, `aspects` (`a` belongs to
the first chart), `top`, `counts`, `easeful`, `charged`, `elements` and
`modalities`. `easeful` and `charged` count aspect types; they are not
compatibility scores.

Receipt roles: `first-natal`, `second-natal`. They do not cover the pair
summary.

```json
{
  "first": { "utc": "2000-02-03T04:05:06+02:00", "latitude": 12, "longitude": 34 },
  "second": { "utc": "2002-03-04T05:06:07Z" }
}
```

Excerpt of the actual result:

```json
{
  "data": {
    "synastry": {
      "top": [{ "a": "Mercury", "b": "Uranus", "type": "conjunction" }, "..."],
      "counts": { "conjunction": 11, "sextile": 8, "square": 7, "trine": 3, "opposition": 3 },
      "easeful": 11,
      "charged": 10
    }
  },
  "receipts": [{ "role": "first-natal" }, { "role": "second-natal" }]
}
```

## `solar_return`

Inputs: `{ birth, near }`; optional `location` (`{ latitude, longitude }`, or
`null` for no angles and houses; defaults to the birth coordinates),
`houseSystem` and `selection` (`nearest` default, or `most-recent`).

Outputs: `data.return` with `body`, `natalLongitude`, `instant`, `chart`,
`location`, `flags` and `selection`.

Receipt roles: `natal`, `solar-return`. They do not cover the search or its
selection.

```json
{ "birth": { "utc": "2000-02-03T04:05:06+02:00", "latitude": 12, "longitude": 34 }, "near": "2026-01-03T00:00:00Z" }
```

Excerpt of the actual result:

```json
{
  "data": {
    "return": {
      "body": "Sun",
      "instant": "2026-02-02T09:25:20.459Z",
      "location": { "latitude": 12, "longitude": 34 },
      "selection": "nearest"
    }
  },
  "receipts": [{ "role": "natal" }, { "role": "solar-return" }]
}
```

## `lunar_return`

Inputs: `{ birth, after }`; optional `location` and `houseSystem` as for
`solar_return`. The return is strictly after `after`.

Outputs: `data.return` with `body`, `natalLongitude`, `instant`, `chart`,
`location` and `flags`.

Receipt roles: `natal`, `lunar-return`.

Limits: refused for unknown birth time and for an anchor before birth.

```json
{ "birth": { "utc": "2000-02-03T04:05:06+02:00", "latitude": 12, "longitude": 34 }, "after": "2026-01-03T00:00:00Z" }
```

Excerpt of the actual result:

```json
{
  "data": { "return": { "body": "Moon", "instant": "2026-01-17T19:46:53.370Z" } },
  "receipts": [{ "role": "natal" }, { "role": "lunar-return" }]
}
```

## `moon_phase`

Inputs: `{ at }`.

Outputs: `data.phase` with `at`, `angle` (Moon minus Sun elongation),
`illumination` (from the elongation), `name` and `waxing`, and `data.sky`.

Receipt roles: `phase-sky`. It covers positions, not the phase name.

```json
{ "at": "2026-01-03T00:00:00Z" }
```

Excerpt of the actual result:

```json
{
  "data": { "phase": { "at": "2026-01-03T00:00:00.000Z", "name": "Full Moon", "waxing": true } },
  "receipts": [{ "role": "phase-sky" }]
}
```

## `event_search`

Inputs: `body` (Sun through Pluto, `North Node`, `South Node`), `longitude`
(tropical, 0 to under 360), `from`, `to`, optional `maxSamples`.

Outputs: `data.request`, `data.policy` (step, budget, interval `(from,to]`,
`completeness: "not-proven"`) and `data.search`. `status: "complete"` lists
the crossings found; `status: "refused"` with `reason: "sample-budget"` lists
none. A refusal is not evidence that no crossing exists, and a complete scan
is not proven exhaustive.

Receipt roles: `search-start`, `search-end`, and `event-1`, `event-2` and so
on in crossing order. They do not cover the search or its completeness.

Limits: a window of at most 366 days and `maxSamples` of at most 100,000
(enforced by `mcp/test/contracts.mcp-test.ts`); the default budget is 10,000
evaluations at a quarter-day step (enforced by `mcp/test/events.mcp-test.ts`).

```json
{ "body": "Sun", "longitude": 0, "from": "2026-03-01T00:00:00Z", "to": "2026-04-01T00:00:00Z" }
```

Excerpt of the actual result:

```json
{
  "data": {
    "policy": { "stepDays": 0.25, "maxSamples": 10000, "interval": "(from,to]", "completeness": "not-proven" },
    "search": { "status": "complete", "crossings": [{ "at": "2026-03-20T14:45:43.380Z", "retrograde": false }] }
  },
  "receipts": [{ "role": "search-start" }, { "role": "search-end" }, { "role": "event-1" }]
}
```

## How this page is checked

`mcp/test/agent-docs.mcp-test.ts` fails if the tools named in the `##`
headings differ from `tools/list`, or if an example's excerpt differs from
the tool's actual output. It calls each tool with the first JSON block of its
section and requires the second block to be contained in the result: every
key shown must have the value shown, and a list must hold exactly the elements
shown, except that a list ending in `"..."` need only start with them. `transits_now` runs with the clock fixed at 2026-01-03T00:00:00Z.
