# Chinese zodiac data for agents

Three read-only MCP tools give the Chinese zodiac year of a birth date and
the traditional groupings of the twelve animals. They are served by a small
stdio MCP server, `tools/chinese-zodiac/mcp-server.mjs`, with no
dependencies, and the same functions can be imported as a library from
`tools/chinese-zodiac/index.mjs`. Everything runs locally: no network
requests, no files written. The package is private preparation at version
0.0.0 and is not published to npm.

The results are calendar facts and a traditional classification. They are
not readings, and they say nothing about a person's character or future.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `chinese_zodiac_sign` | `date` (YYYY-MM-DD) with optional `time` (HH:MM) and `utcOffset` (+HH:MM), or `instant` (ISO 8601 with Z or an offset) | Animal, element, yin or yang, heavenly stem, earthly branch, cycle position, the Li Chun instant, and `status` |
| `chinese_zodiac_relation` | `first` and `second` animal | Which groupings the two share: `same-animal`, `trine`, `six-harmony`, `clash` |
| `chinese_zodiac_reference` | none | The stems, branches, trines, six harmonies, six clashes and the convention |

## The year boundary

The zodiac year starts at **Li Chun** (立春, start of spring): the instant
the Sun's apparent geocentric ecliptic longitude of date reaches 315
degrees. For every year from 1900 to 2100 that instant falls on February 3,
4 or 5 in China Standard Time (UTC+8), according to JPL Horizons. A birth
before Li Chun belongs to the previous year's animal, even in February.

Many popular calendars change the animal at the Lunar New Year instead.
The two conventions give the same animal except for births between the two
dates. These tools use Li Chun only; say which convention you used when you
report a result.

The year Y that begins at Li Chun has stem `(Y - 4) mod 10` and branch
`(Y - 4) mod 12` (Jia = 0, Zi = 0). The element and yin or yang of the year
come from the stem. Each branch also has a fixed element
(`branch.fixedElement`), which is a different thing: 2026 is a Fire year
(stem Bing) and the Horse's fixed element is also Fire, but 1990 is a Metal
year (stem Geng) with the same Fire Horse branch.

### How exact the boundary is

The Li Chun instant comes from a published analytical solar series (Meeus,
*Astronomical Formulae for Calculators*, 4th ed., 1988, chapter 18, with its
perturbation terms) and the Delta T polynomials of Espenak and Meeus (2006).
Measured against independent references
([evidence](../evidence/chinese-zodiac-2026-10-24/README.md)):

| Reference | Years | Largest difference |
| --- | --- | --- |
| JPL Horizons (DE441), apparent solar longitude, in UT | 1900 to 2100, 201 years | 292.0 s (1924) |
| JPL Horizons, in TT (no Delta T in the comparison) | 1900 to 2100 | 323.7 s (2091) |
| Hong Kong Observatory published times, to the minute | 2019 to 2028, 10 years | 258.5 s (2020) |

So the tools treat the computed instant as uncertain by 600 s (10 minutes)
either way. Any input that could fall inside that band, or on either side
of Li Chun, gets `status: "depends"` and both candidate years, never a
guess. After 2026 the UT comparison also depends on predicted Delta T,
which neither side knows.

## Reading `status`

- `"resolved"`: `sign` holds the year; `candidates` holds the same one year.
- `"depends"`: `sign` is `null`; `candidates` holds the year before Li Chun
  and the year after it, in that order; `reason` says what would resolve it.

What makes a result depend:

| Input | Treated as | Depends when |
| --- | --- | --- |
| `date` only | that date in every UTC offset from -12:00 to +14:00 | Li Chun falls on that date somewhere |
| `date` and `utcOffset` | that local day | Li Chun falls on that local day |
| `date` and `time` | that clock time in every offset from -12:00 to +14:00 | the clock time could be on either side |
| `date`, `time` and `utcOffset`, or `instant` | one instant | it is within 10 minutes of the computed Li Chun |

When a result depends, report both candidates or ask for the missing birth
time or UTC offset. Do not choose one. Do not fill in noon for an unknown
time, and do not take a UTC offset from a time zone's present-day rules:
historical offsets differ. Resolve a place and local time to an offset or
instant first (the engine's `@zodiacs/engine/geo` entry does this with its
historical time zone data), then call the tool.

## Example calls and results

Every example below is a real call and its real result; a test
(`node --test tools/chinese-zodiac/selftest.mjs`) runs each call and checks
that the result shown is part of the actual output. To keep them short, the
results leave out `convention`, and some leave out other keys or repeated
fields. The dates are synthetic.

### A date far from Li Chun

<!-- call -->
```json
{"name": "chinese_zodiac_sign", "arguments": {"date": "1990-06-15"}}
```
<!-- result -->
```json
{
  "status": "resolved",
  "sign": {
    "liChunYear": 1990,
    "animal": "Horse",
    "element": "Metal",
    "polarity": "Yang",
    "label": "Yang Metal Horse",
    "stem": {"pinyin": "Geng", "hanzi": "庚", "index": 6},
    "branch": {"pinyin": "Wu", "hanzi": "午", "index": 6, "animalHanzi": "马", "fixedElement": "Fire"},
    "name": "Geng Wu",
    "hanzi": "庚午",
    "cyclePosition": 7
  },
  "liChun": {
    "gregorianYear": 1990,
    "utc": "1990-02-04T02:14:00Z",
    "chinaStandardTime": "1990-02-04T10:14+08:00",
    "uncertaintySeconds": 600
  },
  "input": {"kind": "date", "from": "1990-06-14T10:00:00Z", "to": "1990-06-16T11:59:59.999Z"}
}
```

### Li Chun day without a birth time

<!-- call -->
```json
{"name": "chinese_zodiac_sign", "arguments": {"date": "2026-02-04"}}
```
<!-- result -->
```json
{
  "status": "depends",
  "reason": "Li Chun falls on this date in some time zones. Supply the birth time and UTC offset.",
  "sign": null,
  "candidates": [
    {"liChunYear": 2025, "label": "Yin Wood Snake", "hanzi": "乙巳"},
    {"liChunYear": 2026, "label": "Yang Fire Horse", "hanzi": "丙午"}
  ],
  "liChun": {"utc": "2026-02-03T20:02:00Z", "chinaStandardTime": "2026-02-04T04:02+08:00"}
}
```

### The same day with a time and offset

<!-- call -->
```json
{"name": "chinese_zodiac_sign", "arguments": {"date": "2026-02-04", "time": "04:30", "utcOffset": "+08:00"}}
```
<!-- result -->
```json
{
  "status": "resolved",
  "sign": {"liChunYear": 2026, "animal": "Horse", "element": "Fire", "polarity": "Yang", "label": "Yang Fire Horse", "cyclePosition": 43},
  "input": {"kind": "date-time-offset", "from": "2026-02-03T20:30:00Z", "to": "2026-02-03T20:30:00Z"}
}
```

### An instant inside the uncertainty band

<!-- call -->
```json
{"name": "chinese_zodiac_sign", "arguments": {"instant": "2026-02-03T20:02:00Z"}}
```
<!-- result -->
```json
{
  "status": "depends",
  "reason": "The input is within 10 minutes of the computed Li Chun instant, inside its uncertainty band. A published almanac time for Li Chun of 2026 can settle it.",
  "sign": null,
  "candidates": [{"label": "Yin Wood Snake"}, {"label": "Yang Fire Horse"}]
}
```

The Hong Kong Observatory publishes Li Chun to the minute for the years its
site serves (2019 to 2028 when this was written); for 2026 it gives
04:02 Hong Kong Time on February 4.

### Two animals in one trine

<!-- call -->
```json
{"name": "chinese_zodiac_relation", "arguments": {"first": "Rat", "second": "Dragon"}}
```
<!-- result -->
```json
{
  "first": {"animal": "Rat", "branch": "Zi", "hanzi": "子", "index": 0},
  "second": {"animal": "Dragon", "branch": "Chen", "hanzi": "辰", "index": 4},
  "branchDistance": 4,
  "relations": ["trine"],
  "trine": {"name": "Water trine", "element": "Water", "animals": ["Rat", "Dragon", "Monkey"]},
  "sixHarmony": false,
  "clash": false,
  "note": "Traditional groupings of the twelve earthly branches. They are a classical classification of the branches, not a measurement, score or assessment of any person or relationship, and they describe no future events."
}
```

### Two opposite animals

<!-- call -->
```json
{"name": "chinese_zodiac_relation", "arguments": {"first": "Rat", "second": "Horse"}}
```
<!-- result -->
```json
{"branchDistance": 6, "relations": ["clash"], "trine": null, "sixHarmony": false, "clash": true}
```

### A refused input

Errors are tool results with `isError: true` and a fixed code. They do not
repeat the input.

<!-- call -->
```json
{"name": "chinese_zodiac_sign", "arguments": {"date": "1890-05-01"}}
```
<!-- result -->
```json
{"isError": true, "text": "out-of-range: Supported dates are 1900-01-01 to 2100-12-31"}
```

Other codes: `invalid-input`, `invalid-date`, `invalid-time`,
`invalid-utc-offset`, `invalid-instant`, `invalid-animal`.

## The groupings

These are the classical groupings of the earthly branches, as listed for
example in the English Wikipedia article "Chinese zodiac" (compatibility
grid, read 2026-10-24). Each one is also fixed by branch arithmetic, and
the tests check the tables against it for all 144 pairs.

| Grouping | Rule on branch indices | Members |
| --- | --- | --- |
| Trines, San He (三合) | equal modulo 4 | Rat, Dragon, Monkey (Water); Ox, Snake, Rooster (Metal); Tiger, Horse, Dog (Fire); Rabbit, Goat, Pig (Wood) |
| Six harmonies, Liu He (六合) | sum is 1 modulo 12 | Rat and Ox; Tiger and Pig; Rabbit and Dog; Dragon and Rooster; Snake and Monkey; Horse and Goat |
| Six clashes, Liu Chong (六冲) | six places apart | Rat and Horse; Ox and Goat; Tiger and Monkey; Rabbit and Rooster; Dragon and Dog; Snake and Pig |

Report a grouping as what it is: "Rat and Dragon are in the same trine in
the traditional classification". Do not turn it into a score, a match
rating or a statement about how two people get along. The six harms
(Liu Hai) and the punishments (Xing) are not included.

## Connecting a client

The server is one file run by Node 22 or later. Use an absolute path to a
checkout of this repository.

Claude Code:

```sh
claude mcp add zodiacs-chinese-zodiac -- node /absolute/path/to/engine/tools/chinese-zodiac/mcp-server.mjs
```

Claude Desktop and other clients that read an `mcpServers` file:

```json
{
  "mcpServers": {
    "zodiacs-chinese-zodiac": {
      "command": "node",
      "args": ["/absolute/path/to/engine/tools/chinese-zodiac/mcp-server.mjs"]
    }
  }
}
```

Talking to it by hand, one JSON-RPC message per line:

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"shell","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"chinese_zodiac_sign","arguments":{"date":"1990-06-15"}}}' \
  | node tools/chinese-zodiac/mcp-server.mjs
```

The server implements `initialize`, `ping`, `tools/list` and `tools/call`,
and accepts protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.

## As a library

```js
import { chineseZodiac, chineseZodiacRelation } from './tools/chinese-zodiac/index.mjs';

const result = chineseZodiac({ date: '2026-02-04', time: '04:30', utcOffset: '+08:00' });
result.status;      // 'resolved'
result.sign.label;  // 'Yang Fire Horse'

chineseZodiacRelation('Rat', 'Dragon').relations; // ['trine']
```

Invalid input throws `ChineseZodiacInputError` with a `code` from the list
above. Type declarations are in `tools/chinese-zodiac/index.d.mts`.

To register these tools in another MCP server, import `TOOLS` (or
`listTools()` and `callTool(name, args)`) from
`tools/chinese-zodiac/mcp-tools.mjs`: each tool has a name, title,
description, JSON Schema input and output, and annotations.
