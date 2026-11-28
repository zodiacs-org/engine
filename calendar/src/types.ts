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
  /** A persistent caller UID, or eventUid(identity) when identity is supplied. */
  readonly uid: string;
  readonly identity?: EventIdentity;
  readonly summary: string;
  readonly receipt: ScheduleReceipt;
  /** Exclusive interval end in the same canonical UTC format as receipt.utc. */
  readonly endUtc?: string;
}

/** Semantic calculation settings, excluding presentation and search output. */
export interface EventDefinition {
  /** Adapter-owned versioned definition, for example "tropical-ingress/1". */
  readonly id: string;
  /** Include branch, direction, zodiac and other settings that define the event. */
  readonly parameters: JsonObject;
}

export type EventOccurrence =
  | { readonly scheme: "source-key/1"; readonly key: string }
  | { readonly scheme: "utc-day-ordinal/1"; readonly startUtc: string; readonly ordinal: number };

/** Stable identity claims supplied by an adapter, not inferred from a root estimate. */
export interface EventIdentity {
  readonly schema: "zodiacs-calendar-event/1";
  /** A durable producer/feed scope; use a globally unique value owned by the caller. */
  readonly namespace: string;
  readonly eventType: ScheduleEventType;
  readonly bodies: readonly string[];
  /** Durable chart configuration IDs, in participant order, never display names. */
  readonly chartIds: readonly string[];
  /** The angle defines the aspect; its translated/display name does not. */
  readonly aspectAngleDegrees: number | null;
  readonly definition: EventDefinition;
  readonly occurrence: EventOccurrence;
}

export interface IdentityWindow {
  /** Canonical UTC day start, excluded, matching the upstream events convention. */
  readonly startUtc: string;
  /** Following UTC midnight, included. */
  readonly endUtc: string;
}

export interface UnidentifiedEvent {
  readonly summary: string;
  readonly receipt: ScheduleReceipt;
  readonly endUtc?: string;
  readonly chartIds: readonly string[];
  readonly definition: EventDefinition;
}

/** A complete result for the supplied fixed day, before any display filtering. */
export type IdentityBatch =
  | { readonly status: "complete"; readonly window: IdentityWindow; readonly events: readonly UnidentifiedEvent[] }
  | { readonly status: "refused"; readonly window: IdentityWindow; readonly events: readonly [] };

export interface CalendarOptions {
  /** UTC revision instant supplied explicitly so export never reads the wall clock. */
  readonly dtstamp: string;
  /** A bounded, immutable projection returned by createCalendarTimeZone. */
  readonly timeZone?: CalendarTimeZone;
}

/** Public metadata; createCalendarTimeZone also retains a private offset snapshot. */
export interface CalendarTimeZone {
  readonly tzid: string;
  /** Inclusive UTC bounds for all event endpoints, including interval ends. */
  readonly startUtc: string;
  readonly endUtc: string;
  readonly tzdbVersion: string;
  readonly dataForm: "rearguard";
}
