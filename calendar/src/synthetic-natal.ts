import { HOUSE_SYSTEMS } from "../../src/index.js";
import type { BirthInput } from "../../src/index.js";
import { canonicalJson } from "./canonical-json.js";
import { utcDateTime } from "./content-line.js";
import { label } from "./validation.js";
import type { JsonValue } from "./types.js";

/** Invented chart inputs only. The declaration does not verify their provenance. */
export interface SyntheticNatalInput {
  readonly id: string;
  readonly synthetic: true;
  readonly birth: Readonly<Omit<BirthInput, "utc" | "timeScale" | "flags"> & {
    utc: string; timeScale: "utc";
  }>;
}

function fields(value: unknown, allowed: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) {
    throw new TypeError("Unexpected synthetic natal fields.");
  }
}

/** Snapshot JSON input and normalize defaults before any engine call. */
export function snapshotSyntheticNatal(input: SyntheticNatalInput): SyntheticNatalInput {
  const natal = JSON.parse(canonicalJson(input as unknown as JsonValue)) as SyntheticNatalInput;
  fields(natal, ["id", "synthetic", "birth"]);
  label(natal.id, "natal chart identity");
  if (natal.synthetic !== true) throw new RangeError("An explicitly synthetic natal chart is required.");
  fields(natal.birth, ["utc", "timeScale", "latitude", "longitude", "houseSystem", "timeKnown", "deltaT"]);
  const birth = natal.birth;
  utcDateTime(birth.utc);
  if (birth.timeScale !== "utc") throw new RangeError("Natal birth inputs require an explicit UTC clock.");
  if (birth.houseSystem !== undefined && !HOUSE_SYSTEMS.includes(birth.houseSystem)) {
    throw new RangeError("Unsupported natal house system.");
  }
  if (birth.timeKnown !== undefined && typeof birth.timeKnown !== "boolean") {
    throw new RangeError("Natal timeKnown must be boolean.");
  }
  if ((birth.latitude === undefined) !== (birth.longitude === undefined) ||
      (birth.latitude !== undefined && (typeof birth.latitude !== "number" || !Number.isFinite(birth.latitude) ||
        Math.abs(birth.latitude) > 90 || typeof birth.longitude !== "number" ||
        !Number.isFinite(birth.longitude) || Math.abs(birth.longitude) > 180))) {
    throw new RangeError("Natal coordinates must be a finite latitude/longitude pair.");
  }
  if (birth.deltaT !== undefined && (typeof birth.deltaT !== "number" ||
      !Number.isFinite(birth.deltaT) || Math.abs(birth.deltaT) > 1e10)) {
    throw new RangeError("Invalid natal Delta T in seconds.");
  }
  return { ...natal, birth: { ...birth,
    houseSystem: birth.houseSystem ?? "whole", timeKnown: birth.timeKnown ?? true } };
}
