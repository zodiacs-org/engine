/** Event coordinates and body names will be mapped to the engine by its adapter. */
export const EVENT_BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"
] as const);
export type EventBody = (typeof EVENT_BODIES)[number];
export type StationBody = Exclude<EventBody, "Sun" | "Moon">;

export const ZODIAC_SIGNS = Object.freeze([
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
] as const);
export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];
export type Direction = "any" | "direct" | "retrograde";

export type EventFilter =
  | { readonly kind: "aspect-exact"; readonly bodies: readonly [EventBody, EventBody]; readonly angle: number }
  | { readonly kind: "ingress"; readonly body: EventBody; readonly sign: ZodiacSign; readonly direction: Direction }
  | { readonly kind: "station"; readonly body: StationBody; readonly direction: Direction }
  | { readonly kind: "eclipse"; readonly type: "any" | "solar" | "lunar" }
  | { readonly kind: "custom"; readonly expression: string };

/** Canonical ISO UTC instants; occurrence ownership is start inclusive, end exclusive. */
export interface ScheduleWindow {
  readonly start: string;
  readonly end: string;
}

/** Persistable configuration. secretRef identifies runtime key material, never the key itself. */
export interface SubscriptionSpec {
  readonly callbackUrl: string;
  readonly secretRef: string;
  readonly filter: EventFilter;
  readonly window: ScheduleWindow;
  readonly enabled: boolean;
}
