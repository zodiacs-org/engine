# @zodiacs/wheel

An accessible chart wheel for zodiacal longitudes you supply: a standalone
SVG string with a complete text description, and an optional DOM figure with
keyboard body controls and tables. It has no runtime dependencies and no
framework.

## Install

```sh
npm install @zodiacs/wheel @zodiacs/engine
```

`@zodiacs/engine` 3 is an optional peer dependency, needed only for
`fromNatalChart()` with its results; the wheel installs nothing else. Node
`^20.19.0 || >=22.12.0` loads both entries with `import` or `require()`.

## Example

```js
import { natalChart, chartPoints } from '@zodiacs/engine';
import { minorBodyPositions } from '@zodiacs/engine/minor-bodies';
import { fromNatalChart, renderWheelSvg } from '@zodiacs/wheel';
import { createWheel } from '@zodiacs/wheel/dom';

const utc = '2000-01-01T12:00:00Z'; // synthetic example
const chart = natalChart({ utc, latitude: 0, longitude: 0, houseSystem: 'whole' });
const liliths = chartPoints(chart).points.filter((p) => p.point.endsWith('Lilith'));
const data = fromNatalChart(chart, { extraBodies: minorBodyPositions(utc), points: liliths });
const svg = renderWheelSvg(data, { idPrefix: 'example-wheel' }); // a string; no DOM needed
document.querySelector('main').append(createWheel(data, { document, title: 'Synthetic chart' }));
```

`fromNatalChart(chart)` takes the root engine's tropical `natalChart()`
result: Sun to Pluto and the true nodes, with its angles, houses, aspects,
flags and engine version. The optional second argument adds rows after the
chart's bodies: `extraBodies` takes `minorBodyPositions()` rows (Chiron,
Ceres, Pallas, Juno, Vesta) and `points` takes `chartPoints().points` rows
(Black Moon Lilith, True Black Moon Lilith, the mean nodes, the Vertex, the
East Point, the lots). A point's motion comes from its speed; a point without
one (the Vertex, the East Point, the lots) is described with no motion. An
ephemeris fallback flag on an added row joins the chart's flags, so it stays
visible. The adapter copies display fields only and never keeps the chart's
input time or place.

Any other data can be drawn as `WheelData`: an explicit zodiac, bodies with
`body`, `lon` and `retrograde` (`true`, `false` or `null`), and optional
angles, houses, aspects, flags and engine version. `validateWheelData()`
refuses malformed, duplicate, unbounded or contradictory data rather than
dropping it. For a sidereal chart, give `{ sidereal: "name" }` and sidereal
longitudes, angles and cusps; nothing here subtracts an ayanamsa.

## The wheel

The ascendant is at the left; without angles, Aries zero is. Longitudes
increase counterclockwise. Every body or point has a tick at its exact
longitude and a marker with a short label (Su, Mo, Me, Ve, Ma, Ju, Sa, Ur,
Ne, Pl, NN and SN; Ch, Ce, Pa, Jn and Vs; BL and TL for Black Moon Lilith and
True Black Moon Lilith; other names their first two characters). Where
markers would overlap, they are spread along the ring in the order of their
longitudes, each joined to its tick by a leader line. The selftest holds the
markers, and their labels taken as boxes 0.85 em wide a character, apart for
22 and for 48 objects at a single longitude, and the markers apart for 64,
the most a wheel takes. Each text
description gives the label beside the name. Displayed degrees are truncated
to six decimal places so that no point is rounded into the next sign; they
are presentation values, not an error bound.

## Accessibility

- The SVG has `role="img"` with a `<title>` and a `<desc>` that describes
  every body, point, angle, house cusp, aspect and flag in text.
- `createWheel()` from `@zodiacs/wheel/dom` returns a detached figure: a
  caption, the SVG, one button for each body or point, a live status that
  reads the selected one's position and aspects, and tables of angles, house
  cusps and aspects.
- The body buttons are one Tab stop. Arrow keys move between them, Home and
  End reach the first and last, and Enter or Space selects one; the selected
  marker grows and its label turns bold. Buttons are at least 44 px tall.
- Color is not the only way to read a position or relationship. Untimed
  charts show no invented angles or houses.
- Automated checks do not replace review with assistive technology.

## Scope

This is a display package. It performs no astronomical calculation,
interpretation or receipt verification, and does not certify the accuracy of
the data it draws. It makes no network request, reads no storage or URL, has
no import-time DOM effect and needs no framework. `renderWheelSvg()` returns
a string and needs no DOM; give each SVG in a document its own `idPrefix`.
The root entry's TypeScript declarations need only the ES2022 libraries; the
DOM factory and its types are in `@zodiacs/wheel/dom`. Displayed longitudes
and chart metadata can still be personal information; callers decide where
to render, keep or export them.

## Checks

From the repository:

- `node tools/wheel/selftest.mjs`: geometry, text descriptions, validation,
  a full engine 3.0.0 shaped chart with minor bodies and points, crowded
  markers, XML well-formedness and escaping of hostile labels, `require()`
  of both entries, and the `npm pack --dry-run` file list.
- `node tools/wheel/scripts/prepare-consumer.mjs`: packs the wheel outside
  the checkout, installs it alone (nothing else installed; `require()` and
  `import` work), then beside the carried `@zodiacs/engine` 3.0.0 archive
  (`WHEEL_ENGINE_ARCHIVE` names another packed engine), runs strict
  TypeScript checks with ES2022 alone for the root entry and ES2022 with DOM
  for the browser entry, and checks real `natalChart()`,
  `minorBodyPositions()` and `chartPoints()` output. `WHEEL_BROWSER=1` adds
  Chromium, Firefox and WebKit at 360 and 1280 px widths: keyboard use
  offline, hostile and maximum-length labels, XML parsing and automated
  WCAG 2.1 A and AA checks.

## Licence

MIT, copied from no third-party chart implementation. No engine or data file
is bundled; `@zodiacs/engine` is a separate package under its own
`MIT AND CC-BY-4.0` licence and notices.
