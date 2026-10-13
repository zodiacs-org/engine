/** JSON data retained from an upstream engine/search receipt. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject { readonly [key: string]: JsonValue }

export type ScheduleEventType =
  | "natal-transit"
  | "ingress"
  | "station"
  | "eclipse"
  | "void-of-course"
  | "synastry-exact";

export interface EngineIdentity {
  readonly name: "@zodiacs/engine";
  readonly version: string;
  readonly ephemeris: { readonly name: "astronomy-engine"; readonly version: string };
}

/** A record supplied by a calculation adapter, not proof of its authenticity. */
export interface ScheduleReceipt {
  readonly schema: "zodiacs-calendar-receipt/1";
  /** Canonical UTC ISO instant with milliseconds, YYYY-MM-DDTHH:mm:ss.sssZ. */
  readonly utc: string;
  readonly eventType: ScheduleEventType;
  /** Ordered participating bodies; order retains the moving/target roles. */
  readonly bodies: readonly string[];
  readonly aspect: { readonly name: string; readonly angleDegrees: number } | null;
  /** Angular residual in degrees, or null when an angular orb does not apply. */
  readonly orbDegrees: number | null;
  readonly engine: EngineIdentity;
  /** Preserve upstream convention, time-basis and search records when available. */
  readonly source?: JsonObject;
}

export interface ScheduleEvent {
  /** A caller-supplied persistent identity until the UID factory is implemented. */
  readonly uid: string;
  readonly summary: string;
  readonly receipt: ScheduleReceipt;
  /** Exclusive interval end in the same canonical UTC format as receipt.utc. */
  readonly endUtc?: string;
}

export interface CalendarOptions {
  /** UTC revision instant supplied explicitly so export never reads the wall clock. */
  readonly dtstamp: string;
}
