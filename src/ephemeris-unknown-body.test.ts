/**
 * An unknown body is the caller's bad input, so the root refuses it with a
 * RangeError whichever source would have computed it: astronomy-engine, the
 * shipped DE440 pack (the package's default) or a caller's pack through
 * withEphemeris. Before 2.0.0-rc.4 the DE440 sources let the reduction's
 * De440Error ("unknown-body") through. De440Error stays for failures of a
 * pack itself, and the DE440 entry's own source still refuses a body it does
 * not place with De440Error, as src/de440-header.test.ts holds.
 *
 * These pin behaviour, not accuracy.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { De440Error } from "./de440.js";
import { shippedDe440Source } from "./de440-pack.js";
import { findLongitudeCrossings, searchLongitudeCrossings, setDefaultEphemeris, withEphemeris } from "./index.js";
import { bodyLongitude, bodyLongitudeDetailed, longitudeSpeed, longitudeSpeedDetailed } from "./internal.js";
import type { BodyName } from "./types.js";

const FROM = "2020-01-01T00:00:00Z";
const TO = "2021-01-01T00:00:00Z";
const AT = new Date("2020-06-01T00:00:00Z");

/** A name the engine does not place, given as a caller in plain JavaScript could give it. */
const CHIRON = "Chiron" as BodyName;

const calls: [string, () => unknown][] = [
  ["searchLongitudeCrossings", () => searchLongitudeCrossings(CHIRON, 10, FROM, TO)],
  ["findLongitudeCrossings", () => findLongitudeCrossings(CHIRON, 10, FROM, TO)],
  ["bodyLongitude", () => bodyLongitude(CHIRON, AT)],
  ["longitudeSpeed", () => longitudeSpeed(CHIRON, AT)],
  ["bodyLongitudeDetailed", () => bodyLongitudeDetailed(CHIRON, AT)],
  ["longitudeSpeedDetailed", () => longitudeSpeedDetailed(CHIRON, AT)]
];

function thrownBy(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

function expectUnknownBody(call: () => unknown): void {
  const error = thrownBy(call);
  expect(error).toBeInstanceOf(RangeError);
  expect(error).not.toBeInstanceOf(De440Error);
  expect((error as RangeError).message).toBe("Unknown body: Chiron");
}

describe("an unknown body on the shipped DE440 pack, the package's default", () => {
  beforeAll(() => setDefaultEphemeris("de440"));
  afterAll(() => setDefaultEphemeris("astronomy-engine"));

  it.each(calls)("%s throws RangeError, not De440Error", (_name, call) => expectUnknownBody(call));

  it("still computes a known body on the pack", () => {
    const result = searchLongitudeCrossings("Sun", 0, FROM, TO);
    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.crossings).toHaveLength(1);
      expect(result.flags).toEqual([]);
    }
  });
});

describe("an unknown body on astronomy-engine", () => {
  beforeAll(() => setDefaultEphemeris("astronomy-engine"));

  it.each(calls)("%s throws RangeError", (_name, call) => expectUnknownBody(call));
});

describe("an unknown body on a caller's DE440 source, inside withEphemeris", () => {
  const source = shippedDe440Source();

  it.each(calls)("%s throws RangeError, not De440Error", (_name, call) => expectUnknownBody(() => withEphemeris(source, call)));

  it("leaves the DE440 entry's own refusal of the body a De440Error", () => {
    const error = thrownBy(() => source.place(CHIRON as never, 7457));
    expect(error).toBeInstanceOf(De440Error);
    expect((error as De440Error).code).toBe("unknown-body");
  });
});
