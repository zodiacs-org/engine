import { HOUSE_SYSTEMS, dignityRulersAt } from "./engine.js";
import type { ClassicalPlanet, HouseNumber } from "./engine.js";
import { normalizeHoraryInput } from "./input.js";
import type {
  HoraryCast, HorarySignificators, HouseSignificator, PlanetRoles,
  SignificatorAssignment, SignificatorRole
} from "./types.js";

function houseSignificator(
  role: "querent" | "quesited", house: HouseNumber, longitude: number
): HouseSignificator {
  const { sign, domicile: planet } = dignityRulersAt(longitude);
  return Object.freeze({
    role,
    planet,
    basis: Object.freeze({
      kind: "house-cusp", house, longitude, sign,
      source: "lilly-house-ruler;ptolemy-domiciles"
    } as const),
    explanation: `House ${house} has cusp longitude ${longitude} degrees, in ${sign}; ` +
      `${planet} rules that sign by domicile and represents the ${role} ` +
      "under Lilly's house-ruler convention."
  });
}

/** Select roles from a cast without recalculating the chart or judging the question. */
export function selectSignificators(result: HoraryCast): HorarySignificators {
  if (!result || result.schema !== "horary.cast/v1") {
    throw new RangeError("Significator selection requires a horary.cast/v1 result.");
  }
  const input = normalizeHoraryInput(result.input);
  const houses = result.chart?.houses;
  if (!houses || !(HOUSE_SYSTEMS as readonly unknown[]).includes(houses.system) ||
      !Array.isArray(houses.cusps) || houses.cusps.length !== 12) {
    throw new RangeError("Significator selection requires a supported actual house system and twelve cusps.");
  }
  // Chart arrays are mutable. Reject missing, non-finite or noncanonical
  // cusps rather than silently wrapping an edited chart into a different sign.
  for (const cusp of houses.cusps) {
    if (typeof cusp !== "number" || !Number.isFinite(cusp) || cusp < 0 || cusp >= 360) {
      throw new RangeError("House cusps must be finite longitudes in [0, 360).");
    }
  }
  const assignments: SignificatorAssignment[] = [
    houseSignificator("querent", 1, houses.cusps[0]!),
    houseSignificator("quesited", input.question.quesitedHouse, houses.cusps[input.question.quesitedHouse - 1]!),
    Object.freeze({
      role: "moon", planet: "Moon",
      basis: Object.freeze({ kind: "querent-co-significator", source: "lilly-moon" }),
      explanation: "The Moon accompanies the querent as co-significator under Lilly's convention, " +
        "including when it also rules a selected house."
    })
  ];
  for (const planet of input.question.naturalSignificators) {
    assignments.push(Object.freeze({
      role: "natural", planet,
      basis: Object.freeze({ kind: "declared-natural", source: "caller-declaration" }),
      explanation: `${planet} is a natural significator explicitly declared by the caller; ` +
        "the library infers no association from the question label."
    }));
  }

  const rolesByPlanet = new Map<ClassicalPlanet, SignificatorRole[]>();
  for (const { planet, role } of assignments) {
    const roles = rolesByPlanet.get(planet);
    if (roles) roles.push(role);
    else rolesByPlanet.set(planet, [role]);
  }
  const planets: PlanetRoles[] = Array.from(rolesByPlanet, ([planet, roles]) => Object.freeze({
    planet,
    roles: Object.freeze(roles),
    shared: roles.length > 1,
    explanation: roles.length > 1
      ? `${planet} holds the ${roles.join(", ")} roles. Each role is retained, but these refer ` +
        "to the same physical planet; this overlap alone establishes no perfection or outcome."
      : `${planet} holds the ${roles[0]} role.`
  }));

  return Object.freeze({
    schema: "horary.significators/v1",
    questionId: input.question.id,
    houses: Object.freeze({ requested: input.houseSystem, actual: houses.system }),
    assignments: Object.freeze(assignments),
    planets: Object.freeze(planets)
  });
}
