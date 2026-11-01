#!/usr/bin/env python3
"""The F-89 wording fixes for @zodiacs/engine 1.1.0-rc.2, as exact edits, and
the text checks that go with them: the scan of E1 and E2 in
docs/evidence/1.1.0-rc.2-20261102/f89/PREREGISTRATION.md (section 5),
committed before E1 and E2 run. It is the draft's tool (programme notes,
rc2-2026-11-01/drafts/f89/f89_edits.py) with the scan's method unchanged:
item 1's edit and E2 phrase are the ones OQ9 selects (section 4; (c) by
default, since pyswisseph is not approved), and edit 2a names the blind-band
output's path in the f89 folder (the cut plan's correction K27).

Standard library only; run with `python3 -I`. It reads only the files the
edits name (never a recursive scan of an engine clone, so it never touches
docs/evidence/calc-sidereal-2026-10-05/), and writes only under the output
directory it is given.

    python3 -I f89_edits.py validate ENGINE_ROOT
        each edit's current text occurs exactly once in its file (on engine
        main a253973, before the edits)
    python3 -I f89_edits.py apply ENGINE_ROOT OUT [--with-options]
        writes patched copies of the named files under OUT and prints the
        byte change of each (the preregistered set: the recommended edits,
        with item 1's as OQ9 selects; --with-options adds the optional ones,
        9b, X1 and X2, which the preregistration does not apply)
    python3 -I f89_edits.py package PACKAGE_DIR --expect old|new
        scans an unpacked package (README.md, NOTICE, LICENSING.md and every
        file directly under dist/ whose name ends in .d.ts, .js, .ts, .md,
        .py or .mjs; never CHANGELOG.md, whose history stays) for the
        overstated phrases and their replacements
    python3 -I f89_edits.py source OUT --expect new
        the same scan over patched source copies (doc comments in src/*.ts
        stand for the .d.ts files they become)
    python3 -I f89_edits.py json
        the edits as JSON
"""
import json
import os
import re
import sys

# Item 1 under OQ9 (PREREGISTRATION.md, section 4): (b) and (d) take edit 1's
# text, (c) edit 1-V3's; under (a) a dated amendment fixes the text and its
# phrase first. No owner answer had come when this file was committed, and
# pyswisseph is not approved (OQ6), so the default, (c), holds.
OQ9 = "c"

# Variants: "recommended" is the default design; "variant-B", "owner-V3" and
# "optional" are alternatives or extras that an owner answer or the
# coordinator would select. Each "twin" names the recommended edit it replaces.
EDITS = [
    # 1. eng.points-vertex-given (README). Neither text needs a download.
    # Edit 1's text closes the claim only after the rerun (pyswisseph, not
    # approved) or an owner ruling; edit 1-V3's retires it (OQ9).
    {
        "id": "1", "item": 1, "claim": "eng.points-vertex-given", "file": "README.md", "packed": True,
        "variant": "recommended",
        "old": (
            "  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,\n"
            "  they agree with its `swe_houses_armc` to within 0.00001″.\n"
        ),
        "new": (
            "  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,\n"
            "  they agree with its `swe_houses_armc` to within 0.00002″ on zodiacs.org's\n"
            "  points record of 0.1.1-rc.10 (2026-09-26). The largest difference there,\n"
            "  0.000014″, is the Vertex's at a near-degenerate case, 1852-03-19 at\n"
            "  23.38° N, where the zenith is 0.075° from the ecliptic.\n"
        ),
    },
    {
        "id": "1-V3", "item": 1, "claim": "eng.points-vertex-given", "file": "README.md", "packed": True,
        "variant": "owner-V3", "twin": "1",
        "old": (
            "  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,\n"
            "  they agree with its `swe_houses_armc` to within 0.00001″.\n"
        ),
        "new": (
            "  supplied chart's angles. On the conformance suite's ten L2 vectors for them,\n"
            "  at latitudes from 60° S to 60° N, whose arbiter is ERFA's sidereal time and\n"
            "  obliquity with each point's published definition, they are within 0.013″\n"
            "  and 0.007″ (`conformance/RESULTS.md`).\n"
        ),
    },
    # 2. eng.crossings-blind-band (README and the crossing search's doc comment).
    {
        "id": "2a", "item": 2, "claim": "eng.crossings-blind-band", "file": "README.md", "packed": True,
        "variant": "recommended",
        "old": (
            "A fixed step alone loses both crossings when a station falls between two\n"
            "samples just past the target: at 5 days, a Saturn station within 0.0103° of\n"
            "it, or a Jupiter station within 0.0205°. Wherever the sampled motion turns\n"
        ),
        "new": (
            "A fixed step alone can lose both crossings when a station takes the body\n"
            "less than f″h²/8 past the target, f″ being the second derivative of its\n"
            "longitude at the station and h the step, since both crossings can then fall\n"
            "between two samples: at 5 days, up to 0.0056° for Saturn and 0.011° for\n"
            "Jupiter at their stations from 2019 to 2024\n"
            "(`docs/evidence/1.1.0-rc.2-20261102/f89/blind-band.json`).\n"
            "Wherever the sampled motion turns\n"
        ),
    },
    {
        "id": "2a-B", "item": 2, "claim": "eng.crossings-blind-band", "file": "README.md", "packed": True,
        "variant": "variant-B", "twin": "2a",
        "old": (
            "A fixed step alone loses both crossings when a station falls between two\n"
            "samples just past the target: at 5 days, a Saturn station within 0.0103° of\n"
            "it, or a Jupiter station within 0.0205°. Wherever the sampled motion turns\n"
        ),
        "new": (
            "A fixed step alone can lose both crossings when a station takes the body\n"
            "less than f″h²/8 past the target, f″ being the second derivative of its\n"
            "longitude at the station and h the step, since both crossings can then fall\n"
            "between two samples. Wherever the sampled motion turns\n"
        ),
    },
    {
        "id": "2b", "item": 2, "claim": "eng.crossings-blind-band", "file": "src/crossings.ts", "packed": True,
        "variant": "recommended",
        "old": (
            " * A plain scan loses both crossings when a station falls between two samples\n"
            " * just past the target: at a 5-day step, a Saturn station within 0.0103° of\n"
            " * it, or a Jupiter station within 0.0205°. Where the sampled motion turns\n"
        ),
        "new": (
            " * A plain scan can lose both crossings when a station takes the body less\n"
            " * than f″h²/8 past the target (f″ the second derivative of its longitude at\n"
            " * the station, h the step), since both can then fall between two samples: at\n"
            " * a 5-day step, up to 0.0056° for Saturn and 0.011° for Jupiter at their\n"
            " * stations from 2019 to 2024. Where the sampled motion turns\n"
        ),
    },
    {
        "id": "2b-B", "item": 2, "claim": "eng.crossings-blind-band", "file": "src/crossings.ts", "packed": True,
        "variant": "variant-B", "twin": "2b",
        "old": (
            " * A plain scan loses both crossings when a station falls between two samples\n"
            " * just past the target: at a 5-day step, a Saturn station within 0.0103° of\n"
            " * it, or a Jupiter station within 0.0205°. Where the sampled motion turns\n"
        ),
        "new": (
            " * A plain scan can lose both crossings when a station takes the body less\n"
            " * than f″h²/8 past the target (f″ the second derivative of its longitude at\n"
            " * the station, h the step), since both can then fall between two samples.\n"
            " * Where the sampled motion turns\n"
        ),
    },
    # 3. eng.geo-resolution-names (README).
    {
        "id": "3", "item": 3, "claim": "eng.geo-resolution-names", "file": "README.md", "packed": True,
        "variant": "recommended",
        "old": (
            "Gregorian adoption. Each resolution names the tzdb version, the transition\n"
            "behind the offset and its cause (`dst`, `legal-change` or `date-line`).\n"
            "[docs/time.md](docs/time.md) describes every field.\n"
        ),
        "new": (
            "Gregorian adoption. Each resolution names the tzdb version (the host's where\n"
            "its Intl answered, null when the runtime does not report one) and, where\n"
            "there is one, the transition behind the offset with its cause (`dst`,\n"
            "`legal-change` or `date-line`): the jump's in a gap or fold, or, where the\n"
            "shipped history answered, the last change it records before the time. From\n"
            "1970, outside a gap or fold, the transition is null.\n"
            "[docs/time.md](docs/time.md) describes every field.\n"
        ),
    },
    # 4. eng.gregorian-table-location (NOTICE, LICENSING.md, and a build check).
    {
        "id": "4a", "item": 4, "claim": "eng.gregorian-table-location", "file": "NOTICE", "packed": True,
        "variant": "recommended",
        "old": (
            "@zodiacs/engine/geo carries a table of when 18 countries took the Gregorian\n"
            "calendar (GREGORIAN_ADOPTION, in dist/geo.js). Its dates come from these\n"
            "public-domain sources:\n"
        ),
        "new": (
            "@zodiacs/engine/geo carries a table of when 18 countries took the Gregorian\n"
            "calendar (GREGORIAN_ADOPTION), in a shared chunk under dist/ that dist/geo.js\n"
            "and dist/techniques.js import. Its dates come from these public-domain\n"
            "sources:\n"
        ),
    },
    {
        "id": "4b", "item": 4, "claim": "eng.gregorian-table-location", "file": "LICENSING.md", "packed": True,
        "variant": "recommended",
        "old": (
            "`@zodiacs/engine/geo` carries a table of when 18 countries took the Gregorian\n"
            "calendar (`GREGORIAN_ADOPTION`, `src/geo/calendar.ts`, built into\n"
            "`dist/geo.js`). Its dates and names come from public-domain sources only:\n"
        ),
        "new": (
            "`@zodiacs/engine/geo` carries a table of when 18 countries took the Gregorian\n"
            "calendar (`GREGORIAN_ADOPTION`, `src/geo/calendar.ts`), in a shared chunk\n"
            "under `dist/` that `dist/geo.js` and `dist/techniques.js` import. Its dates\n"
            "and names come from public-domain sources only:\n"
        ),
    },
    {
        "id": "4c", "item": 4, "claim": "eng.gregorian-table-location", "file": "scripts/verify-package-contents.mjs", "packed": False,
        "variant": "recommended",
        "old": (
            "assert(read(\"README.md\").includes(LICENSE_EXPRESSION), \"README.md must state the licence expression\");\n"
        ),
        "new": (
            "// The Gregorian adoption table, the same way: NOTICE and LICENSING.md say it\n"
            "// is in a shared chunk under dist/ that dist/geo.js and dist/techniques.js\n"
            "// import (1.0.0 and 1.1.0-rc.1 said dist/geo.js, which only re-exports it).\n"
            "const gregorianHolders = files.filter((file) => file.endsWith(\".js\") && read(file).includes(\"var GREGORIAN_ADOPTION =\"));\n"
            "assert(gregorianHolders.length === 1 && /^dist\\/chunk-[^/]+\\.js$/u.test(gregorianHolders[0]),\n"
            "  `the Gregorian adoption table must be in exactly one shared chunk under dist/, as NOTICE says; found it in ${gregorianHolders.join(\", \") || \"no file\"}`);\n"
            "const gregorianImporters = files.filter((file) => file.endsWith(\".js\") && read(file).includes(`./${gregorianHolders[0].slice(\"dist/\".length)}`));\n"
            "assert.deepEqual(gregorianImporters.sort(), [\"dist/geo.js\", \"dist/techniques.js\"],\n"
            "  \"exactly dist/geo.js and dist/techniques.js must import the chunk that holds the Gregorian adoption table, as NOTICE says\");\n"
            "assert(notice.includes(\"in a shared chunk under dist/ that dist/geo.js and dist/techniques.js import\"), \"NOTICE must say where the Gregorian adoption table is\");\n"
            "assert(prose(\"LICENSING.md\").includes(\"shared chunk under `dist/` that `dist/geo.js` and `dist/techniques.js` import\"),\n"
            "  \"LICENSING.md must say where the Gregorian adoption table is\");\n"
            "assert(read(\"README.md\").includes(LICENSE_EXPRESSION), \"README.md must state the licence expression\");\n"
        ),
    },
    # 5. eng.calc-bounds-basis (LICENSING.md, the bound labels, and the
    # sentences outside the nine that say the same thing).
    {
        "id": "5a", "item": 5, "claim": "eng.calc-bounds-basis", "file": "LICENSING.md", "packed": True,
        "variant": "recommended",
        "old": (
            "coefficients derived from JPL data: the largest differences between this\n"
            "package's own results and NASA JPL Horizons (DE441) responses at 32\n"
            "preregistered instants, rounded up, and the largest distance of\n"
        ),
        "new": (
            "coefficients derived from JPL data: the largest differences between this\n"
            "package's own results and NASA JPL Horizons (DE441) responses at 32\n"
            "preregistered instants, rounded up (for the mean node, the mean south node\n"
            "and Black Moon Lilith, from the same definitions evaluated with ERFA's\n"
            "fundamental arguments at those instants, which checks the implementation,\n"
            "not an ephemeris), and the largest distance of\n"
        ),
    },
    {
        "id": "5b", "item": 5, "claim": "eng.calc-bounds-basis", "file": "docs/evidence/calc-api/tools/bounds.py", "packed": False,
        "variant": "recommended",
        "old": (
            "    basis = (f\"largest difference from JPL Horizons (DE441) over {len(summary['instants'])} instants from \"\n"
            "             f\"JD {first} to {last} (TT), in all eight frames; {EVIDENCE}\")\n"
        ),
        "new": (
            "    basis = (f\"largest difference from JPL Horizons (DE441) over {len(summary['instants'])} instants from \"\n"
            "             f\"JD {first} to {last} (TT), in all eight frames; {EVIDENCE}\")\n"
            "    # The mean points were compared with their definitions evaluated with ERFA, not with Horizons\n"
            "    # (PREREGISTRATION.md, the true node and the mean points; compare.py's compare_point).\n"
            "    points_basis = (f\"largest difference from the same definition evaluated with ERFA's fundamental \"\n"
            "                    f\"arguments (faom03, faf03, fal03) and nut06a's nutation in longitude, over \"\n"
            "                    f\"{len(summary['instants'])} instants from JD {first} to {last} (TT), in all eight \"\n"
            "                    f\"frames: a check of the implementation, not of an ephemeris; {EVIDENCE}\")\n"
        ),
    },
    {
        "id": "5c", "item": 5, "claim": "eng.calc-bounds-basis", "file": "docs/evidence/calc-api/tools/bounds.py", "packed": False,
        "variant": "recommended",
        "old": "export const MEASURED_BASIS = {json.dumps(basis)};\n",
        "new": (
            "export const MEASURED_BASIS = {json.dumps(basis)};\n"
            "/** The basis of the mean node's, the mean south node's and Black Moon Lilith's bounds. */\n"
            "export const MEAN_POINTS_BASIS = {json.dumps(points_basis)};\n"
        ),
    },
    {
        "id": "5d", "item": 5, "claim": "eng.calc-bounds-basis", "file": "src/calc.ts", "packed": True,
        "variant": "recommended",
        "old": "import { MEASURED, MEASURED_BASIS } from \"./calc-bounds.js\";\n",
        "new": "import { MEAN_POINTS_BASIS, MEASURED, MEASURED_BASIS } from \"./calc-bounds.js\";\n",
    },
    {
        "id": "5e", "item": 5, "claim": "eng.calc-bounds-basis", "file": "src/calc.ts", "packed": True,
        "variant": "recommended",
        "old": (
            "function bound(value: number | null | undefined, unit: CalcBound[\"unit\"], estimated: string | null): CalcBound {\n"
            "  return value === undefined || value === null\n"
            "    ? { value: null, unit, label: \"estimated\", basis: \"not compared with an independent ephemeris\" }\n"
            "    : { value, unit, label: estimated === null ? \"measured\" : \"estimated\", basis: estimated ?? MEASURED_BASIS };\n"
            "}\n"
        ),
        "new": (
            "/** The mean points' bounds are differences from their definitions evaluated with ERFA, not from Horizons. */\n"
            "const MEAN_POINTS: readonly string[] = [\"Mean Node\", \"Mean South Node\", \"Black Moon Lilith\"];\n"
            "\n"
            "function bound(\n"
            "  value: number | null | undefined,\n"
            "  unit: CalcBound[\"unit\"],\n"
            "  estimated: string | null,\n"
            "  measured: string = MEASURED_BASIS\n"
            "): CalcBound {\n"
            "  return value === undefined || value === null\n"
            "    ? { value: null, unit, label: \"estimated\", basis: \"not compared with an independent ephemeris\" }\n"
            "    : { value, unit, label: estimated === null ? \"measured\" : \"estimated\", basis: estimated ?? measured };\n"
            "}\n"
        ),
    },
    {
        "id": "5f", "item": 5, "claim": "eng.calc-bounds-basis", "file": "src/calc.ts", "packed": True,
        "variant": "recommended",
        "old": "    let estimated: string | null = null;\n",
        "new": (
            "    let estimated: string | null = null;\n"
            "    const measured = MEAN_POINTS.includes(body) ? MEAN_POINTS_BASIS : MEASURED_BASIS;\n"
        ),
    },
    {
        "id": "5g", "item": 5, "claim": "eng.calc-bounds-basis", "file": "src/calc.ts", "packed": True,
        "variant": "recommended",
        "old": "        position: withAyanamsa(bound(row?.[0], \"arcsec\", estimated), added && { value: added.position, basis: added.basis }),\n",
        "new": "        position: withAyanamsa(bound(row?.[0], \"arcsec\", estimated, measured), added && { value: added.position, basis: added.basis }),\n",
    },
    {
        "id": "5h", "item": 5, "claim": "eng.calc-bounds-basis", "file": "src/calc.ts", "packed": True,
        "variant": "recommended",
        "old": "          ...withAyanamsa(bound(row?.[2], \"arcsec/day\", estimated), added && { value: added.rate, basis: added.basis }),\n",
        "new": "          ...withAyanamsa(bound(row?.[2], \"arcsec/day\", estimated, measured), added && { value: added.rate, basis: added.basis }),\n",
    },
    {
        "id": "5i", "item": 5, "claim": "eng.calc-bounds (supported on the site; same defect)", "file": "README.md", "packed": True,
        "variant": "recommended",
        "old": (
            "Results carry bounds and a receipt of convention ids. A measured bound is the\n"
            "largest difference from JPL Horizons on 32 instants from 1802 to 2188: a\n"
            "sample maximum, not a limit. In the sidereal zodiac a bound adds the\n"
        ),
        "new": (
            "Results carry bounds and a receipt of convention ids. A measured bound is the\n"
            "largest difference from JPL Horizons on 32 instants from 1802 to 2188 (for\n"
            "the mean nodes and Black Moon Lilith, from their definitions evaluated with\n"
            "ERFA on the same instants): a sample maximum, not a limit. In the sidereal\n"
            "zodiac a bound adds the\n"
        ),
    },
    {
        "id": "5j", "item": 5, "claim": "eng.calc-bounds-measured (supported on the site; same defect)", "file": "NOTICE", "packed": True,
        "variant": "recommended",
        "old": (
            "Its bounds and its barycentre's error are measurements: the largest\n"
            "differences of this package's own results from NASA JPL Horizons (DE441)\n"
            "responses at 32 instants, and of astronomy-engine's barycentre from a\n"
            "Newtonian barycentre and from Horizons's. They are not coefficients derived\n"
        ),
        "new": (
            "Its bounds and its barycentre's error are measurements: the largest\n"
            "differences of this package's own results from NASA JPL Horizons (DE441)\n"
            "responses at 32 instants (for the mean nodes and Black Moon Lilith, from\n"
            "their definitions evaluated with ERFA at those instants), and of\n"
            "astronomy-engine's barycentre from a Newtonian barycentre and from\n"
            "Horizons's. They are not coefficients derived\n"
        ),
    },
    {
        "id": "5k", "item": 5, "claim": "none (engine guide, not packed, not read by the site)", "file": "docs/calc.md", "packed": False,
        "variant": "recommended",
        "old": (
            "significant figures: `docs/evidence/calc-api/`. They are the largest seen on\n"
        ),
        "new": (
            "significant figures: `docs/evidence/calc-api/`. For the mean node, the mean\n"
            "south node and Black Moon Lilith they are the largest differences, on the\n"
            "same instants, from the same definitions evaluated with ERFA's fundamental\n"
            "arguments, which checks the implementation, not an ephemeris; their `basis`\n"
            "says so. They are the largest seen on\n"
        ),
    },
    # 6. eng.api-placidus-steps (doc comment of placidusCusps): drop the figures
    # no test records.
    {
        "id": "6", "item": 6, "claim": "eng.api-placidus-steps", "file": "src/houses.ts", "packed": True,
        "variant": "recommended",
        "old": (
            " * settles to 1e-9° within 64 steps except within about 1e-8° of the polar\n"
            " * limit, near the sidereal times at which a cusp's right ascension reaches 90°\n"
            " * or 270°: it needs up to 63 steps there, and the rounding of asin near ±1\n"
            " * moves each step by about the tolerance. Where it does not settle, the cusp\n"
        ),
        "new": (
            " * settles to 1e-9° within 64 steps except within about 1e-8° of the polar\n"
            " * limit, near the sidereal times at which a cusp's right ascension reaches 90°\n"
            " * or 270°, where the rounding of asin near ±1 can keep it from settling.\n"
            " * Where it does not settle, the cusp\n"
        ),
    },
    # 7. eng.api-coascendant-west (doc comment of coAscendants, and the guide).
    {
        "id": "7a", "item": 7, "claim": "eng.api-coascendant-west", "file": "src/houses-extra.ts", "packed": True,
        "variant": "recommended",
        "old": (
            " * the formula gives it: inside the polar circle (and, for Munkasey's\n"
            " * co-ascendant, within 90° − ε of the equator) it can lie west of the\n"
            " * meridian, and it is not turned east as the ascendant is.\n"
        ),
        "new": (
            " * the formula gives it: inside the polar circle (and, for Munkasey's\n"
            " * co-ascendant, within ε of the equator) it can lie west of the meridian,\n"
            " * and it is not turned east as the ascendant is.\n"
        ),
    },
    {
        "id": "7b", "item": 7, "claim": "none (engine guide, not packed, not read by the site)", "file": "docs/houses.md", "packed": False,
        "variant": "recommended",
        "old": (
            "Munkasey's co-ascendant. Where that point lies west of the meridian (inside\n"
            "the polar circle, and for Munkasey's within 90° − ε of the equator), it is not\n"
            "turned east as the ascendant is.\n"
        ),
        "new": (
            "Munkasey's co-ascendant. Where that point lies west of the meridian (inside\n"
            "the polar circle, and for Munkasey's within ε of the equator), it is not\n"
            "turned east as the ascendant is.\n"
        ),
    },
    # 8. eng.api-deltat-absent (doc comment of ChartInput.deltaT).
    {
        "id": "8", "item": 8, "claim": "eng.api-deltat-absent", "file": "src/types.ts", "packed": True,
        "variant": "recommended",
        "old": "  /** A caller's fixed ΔT in seconds; the engine's model when absent. */\n",
        "new": "  /** A caller's fixed ΔT (TT − UT1) in seconds, as BirthInput.deltaT; the engine's time basis when absent. */\n",
    },
    # 9. eng.receipt-ephemeris-from (doc comment of NatalReceipt.engine), and
    # the codec's inline comment, which says the same.
    {
        "id": "9a", "item": 9, "claim": "eng.receipt-ephemeris-from", "file": "src/receipt.ts", "packed": True,
        "variant": "recommended",
        "old": "  /** From the current conventions set on, the engine also names its ephemeris. */\n",
        "new": "  /** From the rc.8 conventions set on, the engine also names its ephemeris. */\n",
    },
    {
        "id": "9b", "item": 9, "claim": "none (inline comment)", "file": "src/receipt.ts", "packed": True,
        "variant": "optional",
        "old": "  // Receipts in the current set must say which ephemeris computed them.\n",
        "new": "  // Receipts from the rc.8 set on must say which ephemeris computed them.\n",
    },
    # Outside the nine: a figure no committed test or output records.
    {
        "id": "X1", "item": 0, "claim": "none listed (no trigger word; the 1.14h gap)", "file": "README.md", "packed": True,
        "variant": "optional",
        "old": (
            "unconverged iterate. Near the polar limit a cusp carries the rounding of asin\n"
            "near ±1: up to 6.5e-7° one unit in the last place below it.\n"
        ),
        "new": (
            "unconverged iterate. Near the polar limit a cusp carries the rounding of asin\n"
            "near ±1: under 1e-6°, against a bisection that avoids the rounding, at the\n"
            "latitudes and sidereal times `src/placidus-limit.test.ts` samples there.\n"
        ),
    },
    {
        "id": "X2", "item": 0, "claim": "none listed (no trigger word; the 1.14h gap)", "file": "src/houses.ts", "packed": True,
        "variant": "optional",
        "old": (
            " * never falls back. Near the limit, either way, a cusp carries the rounding of\n"
            " * asin near ±1: up to 6.5e-7° one unit in the last place below it.\n"
        ),
        "new": (
            " * never falls back. Near the limit, either way, a cusp carries the rounding of\n"
            " * asin near ±1: under 1e-6°, against a bisection that avoids the rounding, at\n"
            " * the latitudes and sidereal times src/placidus-limit.test.ts samples there.\n"
        ),
    },
]

# The nine overstated phrases (and the two sentences outside the nine that
# state the same calc-bounds defect), as a reader meets them in the package.
OLD_PHRASES = [
    (1, "eng.points-vertex-given", "`swe_houses_armc` to within 0.00001″."),
    (2, "eng.crossings-blind-band", "a Saturn station within 0.0103° of it, or a Jupiter station within 0.0205°"),
    (3, "eng.geo-resolution-names", "Each resolution names the tzdb version, the transition behind the offset and its cause"),
    (4, "eng.gregorian-table-location", "(GREGORIAN_ADOPTION, in dist/geo.js)"),
    (4, "eng.gregorian-table-location", "built into `dist/geo.js`)"),
    (5, "eng.calc-bounds-basis", "responses at 32 preregistered instants, rounded up, and the largest distance"),
    (5, "eng.calc-bounds (companion)", "A measured bound is the largest difference from JPL Horizons on 32 instants from 1802 to 2188: a sample maximum"),
    (5, "eng.calc-bounds-measured (companion)", "responses at 32 instants, and of astronomy-engine's barycentre"),
    (6, "eng.api-placidus-steps", "it needs up to 63 steps there"),
    (7, "eng.api-coascendant-west", "for Munkasey's co-ascendant, within 90° − ε of the equator"),
    (8, "eng.api-deltat-absent", "the engine's model when absent"),
    (9, "eng.receipt-ephemeris-from", "From the current conventions set on"),
]
# E2's phrase for item 1, by OQ9 (PREREGISTRATION.md, section 4).
ITEM_1_NEW = {
    "b": (1, "eng.points-vertex-given", "to within 0.00002″ on zodiacs.org's points record of 0.1.1-rc.10"),
    "c": (1, "eng.points-vertex-given (OQ9 c)", "On the conformance suite's ten L2 vectors for them, at latitudes from 60° S to 60° N, whose arbiter is ERFA's sidereal time and obliquity with each point's published definition, they are within 0.013″ and 0.007″"),
    "d": (1, "eng.points-vertex-given", "to within 0.00002″ on zodiacs.org's points record of 0.1.1-rc.10"),
}
NEW_PHRASES = [
    ITEM_1_NEW[OQ9],
    (2, "eng.crossings-blind-band (README)", "can lose both crossings when a station takes the body less than f″h²/8 past the target, f″ being"),
    (2, "eng.crossings-blind-band (doc comment)", "can lose both crossings when a station takes the body less than f″h²/8 past the target (f″ the"),
    (3, "eng.geo-resolution-names", "the jump's in a gap or fold, or, where the shipped history answered, the last change it records before the time"),
    (4, "eng.gregorian-table-location (NOTICE)", "in a shared chunk under dist/ that dist/geo.js and dist/techniques.js import"),
    (4, "eng.gregorian-table-location (LICENSING)", "shared chunk under `dist/` that `dist/geo.js` and `dist/techniques.js` import"),
    (5, "eng.calc-bounds-basis (LICENSING)", "evaluated with ERFA's fundamental arguments at those instants"),
    (5, "eng.calc-bounds (companion)", "from their definitions evaluated with ERFA on the same instants"),
    (5, "eng.calc-bounds-measured (companion)", "from their definitions evaluated with ERFA at those instants"),
    (6, "eng.api-placidus-steps", "where the rounding of asin near ±1 can keep it from settling"),
    (7, "eng.api-coascendant-west", "for Munkasey's co-ascendant, within ε of the equator"),
    (8, "eng.api-deltat-absent", "A caller's fixed ΔT (TT − UT1) in seconds, as BirthInput.deltaT; the engine's time basis when absent"),
    (9, "eng.receipt-ephemeris-from", "From the rc.8 conventions set on"),
]
# Only the basis string's code reaches dist/calc.js; at the source level it is
# in bounds.py's template, so the package scan alone looks for it.
PACKAGE_ONLY_NEW = [
    (5, "eng.calc-bounds-basis (dist/calc.js)", "evaluated with ERFA's fundamental arguments (faom03, faf03, fal03)"),
]


def normalize(path, text):
    """Whitespace collapsed; in TypeScript sources and declarations, the comment stars dropped."""
    if path.endswith(".ts"):
        text = "\n".join(re.sub(r"^\s*\*\s?", "", line) for line in text.split("\n"))
    return re.sub(r"\s+", " ", text)


def chosen(with_options):
    """The preregistered set: the recommended edits, item 1's as OQ9 selects;
    with --with-options also the optional ones (9b, X1, X2)."""
    item_1 = "1-V3" if OQ9 == "c" else "1"
    out = []
    for e in EDITS:
        if e["item"] == 1:
            if e["id"] == item_1:
                out.append(e)
        elif e["variant"] == "recommended":
            out.append(e)
        elif with_options and e["variant"] == "optional":
            out.append(e)
    return out


def validate(root):
    bad = 0
    for e in EDITS:
        text = open(os.path.join(root, e["file"]), encoding="utf-8").read()
        n = text.count(e["old"])
        print(f"{'OK  ' if n == 1 else 'FAIL'} {e['id']:5} {e['file']}: current text found {n} time(s)")
        bad += n != 1
    return 1 if bad else 0


def apply(root, out, with_options):
    edits = chosen(with_options)
    files = sorted({e["file"] for e in edits})
    total_packed = 0
    for name in files:
        before = open(os.path.join(root, name), encoding="utf-8").read()
        after = before
        for e in edits:
            if e["file"] == name:
                assert after.count(e["old"]) == 1, (e["id"], name)
                after = after.replace(e["old"], e["new"])
        target = os.path.join(out, name)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        open(target, "w", encoding="utf-8").write(after)
        delta = len(after.encode("utf-8")) - len(before.encode("utf-8"))
        packed = any(e["packed"] for e in edits if e["file"] == name)
        total_packed += delta if packed else 0
        print(f"{name}: {delta:+d} bytes{' (packed text or code)' if packed else ''}")
    print(f"source bytes added to packed files: {total_packed:+d}")
    return 0


def scan(files, phrases):
    hits = {}
    for path, text in files.items():
        norm = normalize(path, text)
        for item, claim, phrase in phrases:
            if phrase in norm:
                hits.setdefault((item, claim, phrase), []).append(path)
    return hits


def read_tree(base, patterns):
    files = {}
    for rel in patterns:
        if rel.endswith("/*"):
            folder = os.path.join(base, rel[:-2])
            if os.path.isdir(folder):
                for name in sorted(os.listdir(folder)):
                    if name.endswith((".d.ts", ".js", ".ts", ".md", ".py", ".mjs")):
                        files[os.path.join(rel[:-2], name)] = open(os.path.join(folder, name), encoding="utf-8").read()
        elif os.path.isfile(os.path.join(base, rel)):
            files[rel] = open(os.path.join(base, rel), encoding="utf-8").read()
    return files


def report(files, expect, extra_new=()):
    old_hits = scan(files, OLD_PHRASES)
    new_hits = scan(files, list(NEW_PHRASES) + list(extra_new))
    failures = 0
    for item, claim, phrase in OLD_PHRASES:
        where = old_hits.get((item, claim, phrase), [])
        ok = bool(where) if expect == "old" else not where
        failures += not ok
        print(f"{'ok  ' if ok else 'FAIL'} old  {item} {claim}: {', '.join(where) or 'absent'}")
    for item, claim, phrase in list(NEW_PHRASES) + list(extra_new):
        where = new_hits.get((item, claim, phrase), [])
        ok = not where if expect == "old" else bool(where)
        failures += not ok
        print(f"{'ok  ' if ok else 'FAIL'} new  {item} {claim}: {', '.join(where) or 'absent'}")
    print(f"{failures} failure(s) against --expect {expect}")
    return 1 if failures else 0


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    command = argv[0]
    if command == "validate":
        return validate(argv[1])
    if command == "apply":
        return apply(argv[1], argv[2], "--with-options" in argv)
    if command == "package":
        expect = argv[argv.index("--expect") + 1]
        files = read_tree(argv[1], ["README.md", "NOTICE", "LICENSING.md", "dist/*"])
        return report(files, expect, PACKAGE_ONLY_NEW)
    if command == "source":
        expect = argv[argv.index("--expect") + 1]
        files = read_tree(argv[1], ["README.md", "NOTICE", "LICENSING.md", "src/*"])
        return report(files, expect)
    if command == "json":
        print(json.dumps(EDITS, ensure_ascii=False, indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
