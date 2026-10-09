# Accessible wheel preparation — 2026-10-09

Private `@zodiacs/wheel@0.0.0` is a display package under `tools/wheel/`.
It ships no calculation engine or data. Its standalone SVG has complete
structured text; its detached DOM figure has keyboard body controls and visible
angle, house and aspect descriptions. The root engine adapter preserves its
tropical display fields and omits the original input instant/place. Explicit
sidereal models use caller-supplied sidereal values and a named definition.
Validation establishes display shape, not accuracy or receipt authenticity.

Source `9df23cffb28860bfcd66b67adcae4e4f0be93176` passed [preflight 37936598171](https://github.com/zodiacs-org/engine/actions/runs/37936598171)
on Node 22.22.2 (job 113840088096) and Node 24 (job 113840087735).
Both execute all eight source tests with no failure: independent cardinal-point
geometry, complete text counterparts, untimed/sidereal displays, malformed
input boundaries, escaped SVG/safe identifiers, copied display fields and
DOM-free import/standalone SVG. The invalid Unicode/XML label cases also pass.
Selected source-bound records are retained in `source-preflight-37936598171/`.

The private packing/installed-type consumer and Chromium/Firefox/WebKit
keyboard, offline, malicious-label and automated accessibility checks are
prepared, but have not executed. Original full engine CI, conformance, atlas,
Python and CodeQL remain required before merge. Browser/runtime support,
clean-consumer checks and overall accessibility are not inferred from this
source preflight. Automated checks do not replace human assistive-technology
review. This is preparation for P3.1d, not accepted weight, npm publication or
stable/private clearance. All carried core archives remain unchanged.
