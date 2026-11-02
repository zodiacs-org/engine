import { prepareLocalTime, resolveLocalToUtc } from "../../src/geo.js";
import type { LocalTimeResolution } from "../../src/geo.js";
import { assertCivilTime } from "./civil-time.js";

export interface IanaTimeResolution {
  readonly provider: "iana";
  readonly status: "ok" | "ambiguous" | "nonexistent";
  readonly timeZone: string;
  /** Native engine result, including provider version, transition and policy. */
  readonly resolution: LocalTimeResolution;
}

export interface UnavailableTimeResolution {
  readonly provider: "iana";
  readonly status: "unavailable";
  readonly timeZone: string | null;
  readonly reason: "missing-timezone" | "unsupported-timezone";
}

/** Reads only the assigned IANA zone, without a birthplace mean-time override. */
export async function resolveIanaTime(
  date: string, time: string, timeZone: string | null
): Promise<IanaTimeResolution | UnavailableTimeResolution> {
  assertCivilTime(date, time);
  if (timeZone === null) {
    return { provider: "iana", status: "unavailable", timeZone, reason: "missing-timezone" };
  }
  // Intl also accepts numeric offsets in some runtimes. Require a zone label.
  if (typeof timeZone !== "string" || timeZone.length > 255
      || !/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/u.test(timeZone)) {
    throw new RangeError("Expected an IANA timezone identifier or null.");
  }
  try {
    // The engine requires host support even when its shipped history answers.
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { provider: "iana", status: "unavailable", timeZone, reason: "unsupported-timezone" };
  }
  // Do not catch provider failures or downgrade failed history loads to Intl.
  await prepareLocalTime(date, timeZone);
  const resolution = resolveLocalToUtc(date, time, timeZone);
  const status = resolution.jump?.kind === "gap" ? "nonexistent"
    : resolution.jump?.kind === "fold" ? "ambiguous" : "ok";
  return { provider: "iana", status, timeZone, resolution };
}
