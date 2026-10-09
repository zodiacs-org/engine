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

## Actual installed consumer

[Run 37939479363](https://github.com/zodiacs-org/engine/actions/runs/37939479363) tested head `a0bb90790e2eb9fce3eeb7ad7909788049dbe361`, integration `9c975f860308bf3e97c21bd6a079389871cd1fe4`. Node 22.22.2 passed 101 checks: five actual carried-engine display checks and sixteen checks in each of Chromium 149.0.7827.55, Firefox 151.0 and WebKit 26.5 at 360/1280px. Node 24.21.0 passed the five installed display checks. Both independently packed/installed the private package, passed all eight source checks and strict installed type checking. Their package bytes are identical (7416 bytes, SHA-256 820f20d258b953b1a9463889c35b40a1f7a71a62bc76a650a862a55b44ef4c1b); exact five-file contents are in the reports. The unchanged carried engine is 287011 bytes, SHA-256 4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002.

Keyboard navigation/native activation/live text, independent timed/untimed figures, full tables, unique IDs, no horizontal overflow, XML escaping and offline interactions passed. Automated WCAG A/AA checks reported zero violations in each browser/width. These checks do not substitute for human assistive-technology review, independent astronomy, or programme publication acceptance.

The unchanged original [CI 37939479209](https://github.com/zodiacs-org/engine/actions/runs/37939479209) passed all nine jobs; Atlas 37939479242, Conformance 37939479152, Python package 37939479236 and CodeQL 37939479134 also passed. This evidence-only commit still requires the final exact-head full suite and review before merge. No release archive or registry publication was created.
