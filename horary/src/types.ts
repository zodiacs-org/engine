import type {
  Angles, Chart, ClassicalPlanet, DateInput, HouseNumber, Houses, HouseSystem
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
