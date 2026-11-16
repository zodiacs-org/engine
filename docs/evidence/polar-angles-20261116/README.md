# The polar-angles flag, 2026-11-16

What this checks: inside the polar circle the ascendant turns half a circle
twice a sidereal day. Up to 1.1.0 a chart there carried no flag unless it
asked for Placidus or Koch (`polar-fallback`); a whole-sign, Equal or
Porphyry chart said nothing. This branch adds `polar-angles` to every chart
with angles inside the circle (`docs/houses.md`, "Inside the polar circle").

`tools/pole-ascendant.mjs` computes `natalChart()` (whole sign, longitude 0)
every minute of 2021-06-21 UTC, 1,441 charts, at 60°, 66°, 66.5°, 67°, 70°,
78.22°, 89.99° and 90°, north and south. A turn is a step of the ascendant by
more than 90° between two charts a minute apart. A latitude passes if it has
no turn, or if every one of its charts carries `polar-angles`. The same tool
is in the ZOD-97 rerun (`docs/evidence/edge-cases-1.1.0-20261116/` on its own
branch), where 1.1.0 fails at 10 of the 16 latitudes.

Run from this folder, on this branch's build:

    node tools/pole-ascendant.mjs results/pole-ascendant.json

Result (`results/pole-ascendant.json`): **pass, 16 of 16.** At 67° to 90°,
north and south, the ascendant makes 2 turns of 180° in the day and all 1,441
charts carry `polar-angles`. At 60°, 66° and 66.5° there is no turn and no
flag (66.5° is just outside the circle on this date: 90° − ε is about 66.56°).

The result records `engineVersion` 1.1.0: the version string changes only when
a candidate is cut, so this is the branch build, not the 1.1.0 package.

Synthetic instants and places only; no person's birth data.
