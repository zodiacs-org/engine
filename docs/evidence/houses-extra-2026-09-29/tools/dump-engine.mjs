// Writes the engine's values on both grids, one JSON line per case, for
// compare-swiss.py: house positions of the case's bodies in every system,
// the four co-ascendant points, and the analytic cusp and angle speeds.
// Run from the repository root after `npm run build`:
//   node docs/evidence/houses-extra-2026-09-29/tools/dump-engine.mjs > "$WORK/engine.jsonl"
import { HOUSE_SYSTEMS } from "../../../../dist/index.js";
import { coAscendants, housePosition, houseSpeeds } from "../../../../dist/houses-extra.js";
import { globalGrid, inputOf, ladder } from "./grids.mjs";

for (const c of [...ladder(), ...globalGrid()]) {
  const input = inputOf(c);
  const positions = {};
  const speeds = {};
  for (const system of HOUSE_SYSTEMS) {
    positions[system] = c.bodies.map(([lon, lat]) => housePosition(system, input, { lon, lat }));
    const s = houseSpeeds(system, input);
    speeds[system] = { fellBack: s.fellBack, cusps: s.cusps, asc: s.angles.asc, mc: s.angles.mc };
  }
  const co = coAscendants(input);
  process.stdout.write(
    JSON.stringify({
      ...c,
      positions,
      coAscendants: [co.equatorialAscendant, co.kochCoAscendant, co.munkaseyCoAscendant, co.polarAscendant],
      speeds
    }) + "\n"
  );
}
