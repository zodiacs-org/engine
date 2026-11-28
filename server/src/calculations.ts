import { calculateNatalResponse } from "./natal.js";
import type { NatalRequest } from "./natal.js";
import { calculateTransitsResponse } from "./transits.js";
import type { TransitsRequest } from "./transits.js";
import { calculateSynastryResponse } from "./synastry.js";
import type { SynastryRequest } from "./synastry.js";
import { calculateSolarReturnResponse, calculateLunarReturnResponse } from "./returns.js";
import type { SolarReturnRequest, LunarReturnRequest } from "./returns.js";
import { calculateMoonPhaseResponse } from "./moon-phase.js";
import type { MoonPhaseRequest } from "./moon-phase.js";
import { calculateHousesResponse } from "./houses.js";
import type { HousesHttpRequest } from "./houses.js";

export type CalculationTask =
  | "natal"
  | "transits"
  | "synastry"
  | "solar-return"
  | "lunar-return"
  | "moon-phase"
  | "houses";

export interface CalculationRunner {
  run(task: CalculationTask, input: unknown, requestId: string): Promise<unknown>;
}

/** Dispatch only trusted tasks with bodies already validated by their HTTP route. */
export function calculate(task: CalculationTask, input: unknown, requestId: string): unknown {
  switch (task) {
    case "natal": return calculateNatalResponse(input as NatalRequest, requestId);
    case "transits": return calculateTransitsResponse(input as TransitsRequest, requestId);
    case "synastry": return calculateSynastryResponse(input as SynastryRequest, requestId);
    case "solar-return": return calculateSolarReturnResponse(input as SolarReturnRequest, requestId);
    case "lunar-return": return calculateLunarReturnResponse(input as LunarReturnRequest, requestId);
    case "moon-phase": return calculateMoonPhaseResponse(input as MoonPhaseRequest, requestId);
    case "houses": return calculateHousesResponse(input as HousesHttpRequest, requestId);
  }
}
