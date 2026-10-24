# Private Chinese zodiac preparation

`@zodiacs/chinese-zodiac@0.0.0` gives the Chinese zodiac year of a birth
date (animal, element, yin or yang, heavenly stem, earthly branch and
position in the sixty-year cycle) and the traditional groupings of the
twelve animals (trines, six harmonies, six clashes). It is a library
(`index.mjs`) and a stdio MCP server (`mcp-server.mjs`) with three tools
defined in `mcp-tools.mjs`. It has no dependencies, makes no network
requests and writes no files.

It is private preparation under `tools/`, outside the engine package's
packed files and import graph. It is not published to npm, and the carried
engine archives, version and declarations are unchanged.

The guide for agents, with example calls and results, is
[`docs/agents/CHINESE-ZODIAC.md`](../../docs/agents/CHINESE-ZODIAC.md).

## Convention

The year starts at Li Chun, when the Sun's apparent geocentric ecliptic
longitude of date reaches 315 degrees, not at the Lunar New Year. The Li
Chun instant comes from the solar series of Meeus, *Astronomical Formulae
for Calculators* (4th ed., 1988), chapter 18, with its perturbation terms,
and Delta T from Espenak and Meeus (2006). Neither is derived from a JPL
ephemeris, so JPL Horizons serves as the independent arbiter.

Against JPL Horizons (DE441) for each year 1900 to 2100, the computed
instant differs by at most 292.0 s in UT; against the Hong Kong
Observatory's published minutes for 2019 to 2028, by at most 258.5 s
([evidence](../../docs/evidence/chinese-zodiac-2026-10-24/README.md)). The
tools therefore report any input within 600 s of the computed instant, or
any date or clock reading that could fall on either side of it, as
`depends` with both candidate years. The tests check, for every year 1900
to 2100 and every minute within 20 minutes of the Horizons instant, that no
resolved result disagrees with Horizons.

Supported dates are 1900-01-01 to 2100-12-31. Input is an ISO 8601 instant
with Z or an offset, or a Gregorian date with an optional clock time and
UTC offset. The tool does not resolve IANA time zones or places; resolve
those to an offset or instant first.

Not included: the Lunar New Year boundary, month, day and hour pillars,
the six harms and the punishments.

## Checks

```sh
node --test tools/chinese-zodiac/selftest.mjs
```

The workflow `.github/workflows/chinese-zodiac.yml` runs it on Node 22.22.2
and 24.
