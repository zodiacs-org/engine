import { natalChart } from "./engine.js";
import { normalizeHoraryInput } from "./input.js";
import type { HoraryCast, HoraryInput } from "./types.js";

/** Cast a question chart on the engine's UTC clock, without a judgement. */
export function cast(input: HoraryInput): HoraryCast {
  const normalized = normalizeHoraryInput(input);
  const chart = natalChart({
    utc: normalized.instant,
    latitude: normalized.location.latitude,
    longitude: normalized.location.longitude,
    houseSystem: normalized.houseSystem,
    timeKnown: true
  });
  const { angles, houses } = chart;
  if (angles === null || houses === null) {
    throw new RangeError("A horary chart requires computed angles and houses.");
  }
  return { schema: "horary.cast/v1", input: normalized, chart: { ...chart, angles, houses } };
}
