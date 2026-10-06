// Why calc stops at EPHEMERIS_SPAN: the engine's mean ayanamsa for epoch
// definitions from epochs beyond it, which @zodiacs/engine/vedic computes and
// flags, at three instants in 1800 to 2200. Writes JSON to stdout:
//
//   npm run build
//   node docs/evidence/calc-epochs-2026-10-06/tools/far_epochs.mjs > results/far-engine.json
//   python3 docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py results/far-engine.json --far > results/far-epochs.json
import { ayanamsa, userAyanamsa } from "../../../../dist/vedic.js";

const J2000 = 2_451_545;
const UNIX_JD = 2_440_587.5;
// The first and last TT days a Date holds as an epoch, about 274,000 years either side; JD 0.5;
// EPHEMERIS_SPAN's ends and a little beyond them; a millennium further; and J2000.0 for scale.
const epochs = [UNIX_JD - 1e8 + 1, 0.5, 1_000_000, J2000 - 730_000 - 36_525, J2000 - 730_000, J2000, J2000 + 730_000, J2000 + 730_000 + 36_525, 4_000_000.5, UNIX_JD + 1e8 - 1];
const instants = ["1800-01-01T00:00:00Z", "2026-03-20T12:00:00Z", "2199-12-31T00:00:00Z"];
const rows = [];
for (const model of ["engine", "newcomb", "iau1976"]) {
  for (const epochTT of epochs) {
    const definition = userAyanamsa({ name: "far", epoch: { julianDateTT: epochTT }, value: 0, model });
    for (const at of instants) {
      const value = ayanamsa(definition, at);
      rows.push([model, epochTT, value.julianDateTT, value.mean]);
    }
  }
}
process.stdout.write(`${JSON.stringify({
  generator: "docs/evidence/calc-epochs-2026-10-06/tools/far_epochs.mjs",
  columns: ["model", "epochTT", "jdTT", "mean"],
  rows
})}\n`);
