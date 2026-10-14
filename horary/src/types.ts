import type {
  Angles, Chart, ClassicalPlanet, DateInput, HouseNumber, Houses, HouseSystem, ZodiacSign
} from "./engine.js";

export interface QuestionType {
  /** Caller-defined label; house selection is always explicit. */
  readonly id: string;
  readonly quesitedHouse: HouseNumber;
  readonly naturalSignificators?: readonly ClassicalPlanet[];
}

export interface QuestionLocation {
  /** Degrees north; geographic poles are excluded. */
  readonly latitude: number;
  /** Degrees east. */
  readonly longitude: number;
}

export interface HoraryInput {
  /** Resolved UTC instant; local wall times must be resolved before calling. */
  readonly instant: DateInput;
  readonly location: QuestionLocation;
  readonly question: QuestionType;
  /** Project default: Regiomontanus. Engine fallback remains visible. */
  readonly houseSystem?: HouseSystem;
}

export interface NormalizedHoraryInput {
  readonly instant: string;
  readonly location: QuestionLocation;
  readonly question: Readonly<{
    id: string;
    quesitedHouse: HouseNumber;
    naturalSignificators: readonly ClassicalPlanet[];
  }>;
  readonly houseSystem: HouseSystem;
}

export type LocatedChart = Chart & { angles: Angles; houses: Houses };

export interface HoraryCast {
  readonly schema: "horary.cast/v1";
  readonly input: NormalizedHoraryInput;
  /** Original engine chart, including its actual houses, flags and clock. */
  readonly chart: LocatedChart;
}

export type SignificatorRole = "querent" | "quesited" | "moon" | "natural";

export interface HouseSignificator {
  readonly role: "querent" | "quesited";
  readonly planet: ClassicalPlanet;
  readonly basis: Readonly<{
    kind: "house-cusp";
    house: HouseNumber;
    /** Actual computed cusp longitude, degrees in [0, 360). */
    longitude: number;
    sign: ZodiacSign;
    source: "lilly-house-ruler;ptolemy-domiciles";
  }>;
  readonly explanation: string;
}

export interface MoonSignificator {
  readonly role: "moon";
  readonly planet: "Moon";
  readonly basis: Readonly<{
    kind: "querent-co-significator";
    source: "lilly-moon";
  }>;
  readonly explanation: string;
}

export interface NaturalSignificator {
  readonly role: "natural";
  readonly planet: ClassicalPlanet;
  readonly basis: Readonly<{
    kind: "declared-natural";
    source: "caller-declaration";
  }>;
  readonly explanation: string;
}

export type SignificatorAssignment = HouseSignificator | MoonSignificator | NaturalSignificator;

export interface PlanetRoles {
  readonly planet: ClassicalPlanet;
  readonly roles: readonly SignificatorRole[];
  /** True when a single physical planet has several separately retained roles. */
  readonly shared: boolean;
  readonly explanation: string;
}

export interface HorarySignificators {
  readonly schema: "horary.significators/v1";
  readonly questionId: string;
  readonly houses: Readonly<{ requested: HouseSystem; actual: HouseSystem }>;
  /** Querent, quesited, Moon, then declared naturals in normalized input order. */
  readonly assignments: readonly SignificatorAssignment[];
  /** Unique physical planets in first-assignment order, retaining every role. */
  readonly planets: readonly PlanetRoles[];
}
