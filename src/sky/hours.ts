/*
 * Planetary hours: the day from sunrise to sunset and the night from sunset
 * to the next sunrise, each in twelve equal parts, ruled in the Chaldean
 * order from the day's ruler at sunrise. docs/sky.md is the guide.
 */
import { dateFrom } from "../date-input.js";
import { outsideReferenceSpan } from "../reference-span.js";
import { CHALDEAN_ORDER } from "../timing/rulers.js";
import type { TraditionalPlanet } from "../timing/rulers.js";
import type { DateInput } from "../types.js";
import {
  budgetOf,
  calendarDateMs,
  conventionsOf,
  observerOf,
  offsetOf,
  optionsOf,
  searchEvents
} from "./riseset.js";
import type { Observer, SkyConventions, SkyDayOptions, SkyFlag } from "./riseset.js";

/** The ruler of each weekday, Sunday first (Cassius Dio 37.18–19). */
export const PLANETARY_DAY_RULERS: readonly TraditionalPlanet[] = /*#__PURE__*/ Object.freeze([
  "Sun",
  "Moon",
  "Mars",
  "Mercury",
  "Jupiter",
  "Venus",
  "Saturn"
]);

export interface PlanetaryHour {
  /** 1 to 24: hours 1–12 are the day's, 13–24 the night's. */
  readonly number: number;
  readonly period: "day" | "night";
  readonly ruler: TraditionalPlanet;
  readonly start: Date;
  /** Exclusive; the next hour's start. */
  readonly end: Date;
}

interface PlanetaryDayBase {
  /** The calendar date whose sunrise begins the day, on the clock of `utcOffsetMinutes`. */
  readonly date: string;
  readonly utcOffsetMinutes: number;
  /** 0 for Sunday to 6 for Saturday. */
  readonly weekday: number;
  /** The weekday's ruler, which rules the first hour. */
  readonly ruler: TraditionalPlanet;
  readonly conventions: SkyConventions;
  readonly flags: readonly SkyFlag[];
  readonly samples: number;
}

/**
 * `"complete"`: the Sun rose on the date, set, and rose again, and the 24
 * hours are given. `"no-sunrise"`: the date's 24 hours on the chosen clock
 * hold no sunrise, in polar day or night (`flags` says which) or when the
 * clock's midnight falls next to sunrise. `"no-sunset"`: the Sun rose but did
 * not set within three days of the date's start, as polar day begins.
 * `"no-next-sunrise"`: it rose and set but did not rise again within those
 * three days, as polar night begins. `"refused"`: the sample budget ran out.
 */
export type PlanetaryDay =
  | (PlanetaryDayBase & {
      readonly status: "complete";
      readonly sunrise: Date;
      readonly sunset: Date;
      readonly nextSunrise: Date;
      readonly hours: readonly PlanetaryHour[];
    })
  | (PlanetaryDayBase & {
      readonly status: "no-sunrise" | "no-sunset" | "no-next-sunrise" | "refused";
      readonly sunrise: null;
      readonly sunset: null;
      readonly nextSunrise: null;
      readonly hours: readonly [];
    });

const DAY_MS = 86_400_000;
/** The Sun's rises and sets are searched over three days from the date's start. */
const SPAN_DAYS = 3;

function isoDate(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  return `${String(year).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** The ruler of hour `number` (1–24) of a day whose ruler is `ruler`. */
function hourRuler(ruler: TraditionalPlanet, number: number): TraditionalPlanet {
  return CHALDEAN_ORDER[(CHALDEAN_ORDER.indexOf(ruler) + number - 1) % 7]!;
}

function dayOf(site: Readonly<Required<Observer>>, input: Record<string, unknown>, midnightMs: number): PlanetaryDay {
  const conventions = conventionsOf("Sun", input);
  const offset = offsetOf(input.utcOffsetMinutes, site);
  const startMs = midnightMs - offset * 60_000;
  // 1970-01-01 was a Thursday.
  const weekday = (((Math.floor(midnightMs / DAY_MS) + 4) % 7) + 7) % 7;
  const ruler = PLANETARY_DAY_RULERS[weekday]!;
  const search = searchEvents("Sun", site, conventions, startMs, startMs + SPAN_DAYS * DAY_MS, budgetOf(input.maxSamples), false);
  const base = { date: isoDate(midnightMs), utcOffsetMinutes: offset, weekday, ruler, conventions, samples: search.samples };
  const empty = { sunrise: null, sunset: null, nextSunrise: null, hours: Object.freeze([]) as readonly [] };
  if (search.status === "refused") return Object.freeze({ ...base, flags: Object.freeze([]), status: "refused", ...empty });
  const rise = search.events.find((event) => event.kind === "rise" && event.at.getTime() < startMs + DAY_MS);
  const set = rise && search.events.find((event) => event.kind === "set" && event.at > rise.at);
  const next = set && search.events.find((event) => event.kind === "rise" && event.at > set.at);
  if (!rise || !set || !next) {
    const flags: SkyFlag[] = [];
    const firstDay = search.events.filter((event) => event.at.getTime() < startMs + DAY_MS);
    if (firstDay.length === 0) flags.push(search.first!.above > 0 ? "never-sets" : "never-rises");
    const status = !rise ? "no-sunrise" : !set ? "no-sunset" : "no-next-sunrise";
    return Object.freeze({ ...base, flags: Object.freeze(flags), status, ...empty });
  }
  const hours: PlanetaryHour[] = [];
  const marks = [rise.at.getTime(), set.at.getTime(), next.at.getTime()];
  for (let number = 1; number <= 24; number += 1) {
    const night = number > 12;
    const from = marks[night ? 1 : 0]!;
    const length = (marks[night ? 2 : 1]! - from) / 12;
    const k = night ? number - 13 : number - 1;
    hours.push(
      Object.freeze({
        number,
        period: night ? "night" : "day",
        ruler: hourRuler(ruler, number),
        start: new Date(k === 0 ? from : Math.round(from + k * length)),
        end: new Date(k === 11 ? marks[night ? 2 : 1]! : Math.round(from + (k + 1) * length))
      } as const)
    );
  }
  const flags: SkyFlag[] = outsideReferenceSpan(rise.at) || outsideReferenceSpan(next.at) ? ["outside-reference-span"] : [];
  return Object.freeze({
    ...base,
    flags: Object.freeze(flags),
    status: "complete",
    sunrise: rise.at,
    sunset: set.at,
    nextSunrise: next.at,
    hours: Object.freeze(hours)
  });
}

const DAY_KEYS = ["limb", "refraction", "maxSamples", "utcOffsetMinutes"] as const;

/**
 * The planetary day that begins at the Sun's first rise on `date` (YYYY-MM-DD
 * on the clock `utcOffsetMinutes` east of UTC, by default the observer's local
 * mean time): the day's ruler, sunrise, sunset, the next sunrise and the 24
 * hours. Rise and set follow the options of `skyEvents` for the Sun.
 */
export function planetaryHours(observer: Observer, date: string, options?: SkyDayOptions): PlanetaryDay {
  const site = observerOf(observer);
  const input = optionsOf(options, DAY_KEYS, "options");
  return dayOf(site, input, calendarDateMs(date));
}

/**
 * The planetary hour running at `at`, with its day: the day whose sunrise is
 * the last at or before `at`. `hour` is null when that day is not complete.
 */
export function planetaryHourAt(
  observer: Observer,
  at: DateInput,
  options?: SkyDayOptions
): { readonly day: PlanetaryDay; readonly hour: PlanetaryHour | null } {
  const site = observerOf(observer);
  const input = optionsOf(options, DAY_KEYS, "options");
  const ms = dateFrom(at, "at").getTime();
  const offset = offsetOf(input.utcOffsetMinutes, site);
  let midnight = Math.floor((ms + offset * 60_000) / DAY_MS) * DAY_MS;
  let day = dayOf(site, input, midnight);
  // Before the date's sunrise the hour belongs to the day before; from the
  // next sunrise on, to the day after.
  for (let step = 0; step < 2 && day.status === "complete"; step += 1) {
    const shift = ms < day.sunrise.getTime() ? -1 : ms >= day.nextSunrise.getTime() ? 1 : 0;
    if (shift === 0) break;
    midnight += shift * DAY_MS;
    day = dayOf(site, input, midnight);
  }
  if (day.status !== "complete") return Object.freeze({ day, hour: null });
  const hour = day.hours.find((candidate) => ms >= candidate.start.getTime() && ms < candidate.end.getTime()) ?? null;
  return Object.freeze({ day, hour });
}
