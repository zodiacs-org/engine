import { CLASSICAL_PLANETS, HOUSE_SYSTEMS, dateFrom } from "./engine.js";
import type { ClassicalPlanet, DateInput, HouseNumber, HouseSystem } from "./engine.js";
import type { NormalizedHoraryInput } from "./types.js";

function record(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError(`${label} must be an object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !fields.includes(key)) {
      throw new RangeError(`${label} contains an unsupported field.`);
    }
  }
  return value as Record<string, unknown>;
}

function coordinate(value: unknown, label: string, limit: number, exclusive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      (exclusive ? Math.abs(value) >= limit : Math.abs(value) > limit)) {
    throw new RangeError(`${label} must be finite degrees within the supported geographic range.`);
  }
  return value;
}

/** Validate JSON-shaped input and snapshot it without retaining caller arrays or Dates. */
export function normalizeHoraryInput(value: unknown): NormalizedHoraryInput {
  const input = record(value, "input", ["instant", "location", "question", "houseSystem"]);
  const location = record(input.location, "location", ["latitude", "longitude"]);
  const question = record(input.question, "question", ["id", "quesitedHouse", "naturalSignificators"]);
  const latitude = coordinate(location.latitude, "latitude", 90, true);
  const longitude = coordinate(location.longitude, "longitude", 180);

  const id = question.id;
  if (typeof id !== "string" || !id.length || id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new RangeError("question.id must be a nonempty label without surrounding whitespace or control characters.");
  }
  const house = question.quesitedHouse;
  if (typeof house !== "number" || !Number.isInteger(house) || house < 1 || house > 12) {
    throw new RangeError("question.quesitedHouse must be an integer house from 1 to 12.");
  }
  const suppliedNaturals = question.naturalSignificators;
  if (suppliedNaturals !== undefined && !Array.isArray(suppliedNaturals)) {
    throw new RangeError("question.naturalSignificators must be an array of classical planets.");
  }
  const naturals: ClassicalPlanet[] = [];
  // for..of visits sparse slots as undefined, so holes cannot silently pass.
  for (const planet of suppliedNaturals ?? []) {
    if (!(CLASSICAL_PLANETS as readonly unknown[]).includes(planet)) {
      throw new RangeError("Natural significators must name classical planets.");
    }
    if (!naturals.includes(planet)) naturals.push(planet);
  }
  const suppliedSystem = input.houseSystem;
  const system = suppliedSystem === undefined ? "regiomontanus" : suppliedSystem;
  if (!(HOUSE_SYSTEMS as readonly unknown[]).includes(system)) {
    throw new RangeError("houseSystem must name a supported engine house system.");
  }
  const instant = dateFrom(input.instant as DateInput, "instant").toISOString();
  return Object.freeze({
    instant,
    location: Object.freeze({ latitude, longitude }),
    question: Object.freeze({
      id,
      quesitedHouse: house as HouseNumber,
      naturalSignificators: Object.freeze(naturals)
    }),
    houseSystem: system as HouseSystem
  });
}
