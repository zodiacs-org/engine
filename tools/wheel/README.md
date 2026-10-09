# Private chart-wheel preparation

This is an unpublished, private `@zodiacs/wheel@0.0.0` review package.
No registry installation or programme acceptance is claimed.

The package renders supplied zodiacal longitudes as a wheel. It provides
a standalone SVG with a title and complete text description, or a DOM figure
with body controls, visible angle/house/aspect tables and a selected-body
text result. Tab enters/leaves the body controls; arrows, Home and End move
between bodies; native Enter/Space activation selects one. Color is not the
only way to read a position or relationship.

`fromNatalChart()` accepts the root engine's tropical natal-chart result.
For a sidereal chart, construct `WheelData` with an explicit `{sidereal:
"name"}` label and the corresponding sidereal longitudes/angles/cusps;
the adapter does not silently subtract an ayanamsa. The wheel performs no
astronomical calculation, interpretation, bounds computation or receipt
verification. It does not certify the accuracy of caller data.

```js
import { natalChart } from '@zodiacs/engine';
import { fromNatalChart, renderWheelSvg } from '@zodiacs/wheel';
import { createWheel } from '@zodiacs/wheel/dom';

const data = fromNatalChart(natalChart({
  utc: '2000-01-01T12:00:00Z', latitude: 0, longitude: 0, houseSystem: 'whole',
})); // synthetic example
document.querySelector('main').append(createWheel(data, {
  document, title: 'Synthetic chart',
}));
const svg = renderWheelSvg(data, { idPrefix: 'standalone-example' });
```

Supply a unique safe `idPrefix` for each standalone SVG in a document.
The DOM renderer allocates unique IDs and returns a detached figure. Importing
the root module or creating an SVG needs no DOM. Its TypeScript declarations
require only ES2022 libraries. The separate `@zodiacs/wheel/dom` entry contains
the browser factory and its DOM declarations. It makes no network request,
reads no storage or URL and has no import-time DOM effect. The natal adapter
copies display fields and omits input time/place. Displayed longitudes and
chart metadata can still be personal information; callers control where they
render, retain or export them.

Angles put the supplied ascendant at the left. Without angles, Aries zero is
at the left; no houses/angles are inferred. Longitudes increase counterclockwise.
Markers show the supplied positions; select a body to highlight its marker
and read its name/longitude/aspects. Closely overlapping positions may have
overlapping markers; the complete controls and text remain available.
Displayed sign degrees are truncated to six decimal places to avoid rounding
a point into the next sign. They are presentation values, not an error bound.
Unknown-time data may not contain angles or houses. Flags and the supplied
engine version stay visible. Requested major aspects are drawn and described;
none is inferred by this package.

The code is MIT licensed, copied from no third-party chart implementation.
No engine/data file is bundled; the supplied engine remains subject to its
own `MIT AND CC-BY-4.0` licence and notices. The exact carried rc.2 archive is
used only by the external clean-consumer check. Private preparation does not
settle its outstanding publication/private-clearance questions.

Run `node tools/wheel/scripts/prepare-consumer.mjs` from the repository.
Set `WHEEL_BROWSER=1` to run the installed-package consumer in Chromium,
Firefox and WebKit at mobile/desktop widths, including offline keyboard
operation, malicious-label checks and automated WCAG A/AA checks.
The script packs outside the checkout, verifies the exact package file list,
installs fresh consumers and runs strict installed TypeScript checks with
ES2022 alone for the root and ES2022/DOM for the browser entry. Maximum-length
labels are included before mobile overflow and automated accessibility checks.
The workflow preserves actual results. No runtime/accuracy/accessibility
pass is asserted until that workflow executes. Automated accessibility and
keyboard checks do not replace human assistive-technology review.
