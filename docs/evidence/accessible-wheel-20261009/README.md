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

The source preflight alone did not establish private packing/installed types,
browser/runtime support or overall accessibility. The later installed consumer
results are recorded below. Original full engine CI, conformance, Atlas,
Python and CodeQL remain required on the final changed source before merge. Automated checks do not replace human assistive-technology
review. This is preparation for P3.1d, not accepted weight, npm publication or
stable/private clearance. All carried core archives remain unchanged.

## Actual installed consumer

[Run 37939479363](https://github.com/zodiacs-org/engine/actions/runs/37939479363) tested head `a0bb90790e2eb9fce3eeb7ad7909788049dbe361`, integration `9c975f860308bf3e97c21bd6a079389871cd1fe4`. Node 22.22.2 passed 101 checks: five actual carried-engine display checks and sixteen checks in each of Chromium 149.0.7827.55, Firefox 151.0 and WebKit 26.5 at 360/1280px. Node 24.21.0 passed the five installed display checks. Both independently packed/installed the private package, passed all eight source checks and strict installed type checking. Their package bytes are identical (7416 bytes, SHA-256 820f20d258b953b1a9463889c35b40a1f7a71a62bc76a650a862a55b44ef4c1b); exact five-file contents are in the reports. The unchanged carried engine is 287011 bytes, SHA-256 4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002.

Keyboard navigation/native activation/live text, independent timed/untimed figures, full tables, unique IDs, no horizontal overflow, XML escaping and offline interactions passed. Automated WCAG A/AA checks reported zero violations in each browser/width. These checks do not substitute for human assistive-technology review, independent astronomy, or programme publication acceptance.

The unchanged original [CI 37939479209](https://github.com/zodiacs-org/engine/actions/runs/37939479209) passed; Atlas 37939479242, Conformance 37939479152, Python package 37939479236 and CodeQL 37939479134 also passed. This evidence-only commit still requires the final exact-head full suite and review before merge. No release archive or registry publication was created.

## Review corrections

Review on head `9b6be46afc232acc8fb14a6bd51cb07c45025745` identified that the standalone SVG's complete description omitted the supplied engine version although the DOM caption preserved it. The changed summary now includes that version when supplied, so both SVG export and DOM retain it. Source/installed-consumer controls check supplied and absent versions, XML escaping and the actual carried engine version. These changed tests still need execution on the new source; prior package/SVG hashes describe their original producer only.

The numeric original-CI job-count claim is removed. Linked CI results are retained as historical workflow observations, without a documentation count that lacks committed enforcing output. No source change affects the core or any carried archive. A fresh complete required suite and review remain required on this corrected source.

## Actual version-preserving consumer

Corrected head `104219718a5d24b3f64065af9e5e627eaeac6d0b`, integration `1accbdba21029b58d3e70317c4d8d6198e2123ff`, passed [consumer 37940751717](https://github.com/zodiacs-org/engine/actions/runs/37940751717). Node 22.22.2 passed 101 checks including the six browser/width combinations; Node 24.21.0 passed five installed checks. Both pass all eight source tests, strict installed types, and the actual engine-version assertion in standalone SVG and full text. The source controls also cover an absent version and escaping a supplied version. The selected producer reports are retained in `producer-37940751717/`.

Both independently produced the same private package (7436 bytes, SHA-256 5d93e081dd2bdb502f65aedc1e4b2518afe48423d4ac43d20cc169d3f51ab4da) and SVG (SHA-256 653191b4a867e3fd647e6c707b9e274d5cfc7379c9fe58113baf54cc77f0862f). These replace the earlier package identity only for this new source; the original producer remains recorded. The carried engine archive and display model digest are unchanged. The evidence carrier still requires a fresh complete unchanged full suite and review before merge. No registry publication, accepted weight or human assistive-technology certification is claimed.

## Server types and bounded-label review corrections

Review on corrected source identified DOM globals in the root declaration, which prevented a Node project using only ES2022 libraries from importing standalone SVG types. The DOM renderer and its declarations now live at the separate `@zodiacs/wheel/dom` entry. Root SVG/model declarations refer to no browser types. The external consumer requires independent strict ES2022-only and ES2022/DOM type checks, including negative controls; the browser fixture imports its installed DOM entry.

The DOM figure allows long words to wrap, bounds button width including margins, and fixes its one-column table layout. Every browser/viewport mounts maximum permitted body/title/house-system/flag/version labels and escaped markup before the unique-ID, automated accessibility and horizontal-overflow assertions. The original keyboard, SVG/version/privacy and offline checks remain. These changed sources require fresh complete consumer/full-engine tests and review; prior source/pack/file-list/typecheck reports remain historical and do not establish the new behavior.

## Preserved declaration-resolution failure

At head `0d8051cb63b84a6ba4bf0ace6ac40d22bf08442f`, [consumer 37942019206](https://github.com/zodiacs-org/engine/actions/runs/37942019206), Node 22.22.2 (113858538229) and Node 24 (113858538029) each passed eight source tests, then failed the installed browser declaration check with TS7016: `dom.d.ts` imported `./index.mjs`, which TypeScript NodeNext could not associate with the differently suffixed `index.d.ts`. Server-only type and browser/runtime checks were not reached. Selected original errors and log digests are retained in `failed-37942019206/`.

The declarations now use matching `index.d.mts`/`dom.d.mts` names, referenced explicitly by the corresponding package exports; the package file-list check changes accordingly. Both strict installed type configurations and all original source, version, browser/width, long-label, keyboard, XML and offline checks remain required. The failed source is not rerun unchanged, and no passing new declaration/browser result is inferred.

## Actual DOM-free types and maximum-label checks

[Consumer 37942608941](https://github.com/zodiacs-org/engine/actions/runs/37942608941) on head `92545036d1cc2cbf5b69b8ac3592fde08cca39a0`, integration `02df16b2bdb8e699635b30fe67f1998e8b1c738a`, passes the corrected declaration resolution. Both Node 22.22.2 and Node 24.21.0 pass strict installed ES2022-only root declarations and ES2022/DOM browser declarations, all eight source tests, and the actual SVG-version controls. Node 22 passes 101 checks, including all six browser/width combinations after mounting maximum permitted labels and escaped caller markup before unique-ID, automated accessibility and overflow assertions. Node 24 passes five installed runtime checks. Selected reports are retained in `producer-37942608941/`.

Both packs are 7846 bytes, SHA-256 90cffc4456965d19700ebe4dff5229bab96e749ffb4610944148a5610fb1f221, with the exact seven-file list retained in those outputs. The root/browser split introduces no runtime dependency or import-time DOM access.

## House-sector review correction

The earlier renderer placed each house number at its cusp longitude, on the boundary line. The changed renderer places the number halfway along the forward angular span to the next cusp, including the 360-degree crossing, while retaining the original cusp positions and structured descriptions. Source geometry checks use independent known coordinates for a 0-to-30-degree sector and a 350-to-10-degree crossing. This changed SVG/package identity still requires fresh source, installed consumers, full original engine gates and review. Earlier package/SVG digests remain historical and are not claimed for the sector-label change.
