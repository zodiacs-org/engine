// Checked by `npm run typecheck` and never run. The declared BirthInput has no
// `lat` or `lng`, so TypeScript refuses them in an object literal (TS2353):
// remove the directive and the typecheck fails. JavaScript callers, and objects
// typed loosely, are refused at run time instead (src/public-input.test.ts).
import { natalChart } from "../index.js";

export function nearMissKeys(): void {
  // @ts-expect-error `lat` is not a field of BirthInput; use `latitude`.
  natalChart({ utc: 0, lat: 1, lng: 2 });
  natalChart({ utc: 0, latitude: 1, longitude: 2 });
}
