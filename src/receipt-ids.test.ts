/*
 * From 1.1.0-rc.1 a natal receipt names the conventions it and its result use
 * as ids of the Zodiacs conventions registry (zodiacs.org/developers/conventions),
 * in `receipt.conventionIds`, under a new conventions set: the set 0.1.1-rc.16
 * to 1.0.0 wrote, with `conventionIds` added. The codec requires the ids under
 * that set, exactly as natalConventionIds (./conventions) derives them from
 * the envelope's own fields, and refuses them under any earlier set. An
 * envelope of the set requires the feature `convention-ids`, which every
 * earlier engine refuses as `unsupported_feature`
 * (docs/evidence/1.1.0-rc.1-20261026/tools/earlier-readers.mjs). A receipt
 * names the engine that computed its chart, so both sets are accepted from
 * 0.1.1-rc.16, with no upper bound.
 * src/fixtures/receipt-1.0.0.json was serialized by the carried 1.0.0 archive
 * (docs/evidence/1.1.0-rc.1-20261026/tools/make-receipt-1.0.0.mjs). The charts
 * are synthetic.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "./api.js";
import {
  CONVENTIONS_REGISTRY,
  conventionAddress,
  conventionId,
  natalConventionIds,
  parseConventionId
} from "./conventions.js";
import {
  NATAL_RECEIPT_CONVENTION_SETS,
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  redactNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import type { NatalEnvelope, NatalEnvelopeContext, NatalEnvelopeErrorCode } from "./receipt.js";
import type { BirthInput } from "./types.js";

const ONE_ZERO = readFileSync(new URL("./fixtures/receipt-1.0.0.json", import.meta.url), "utf8");
const RC7 = readFileSync(new URL("./fixtures/receipt-rc7.json", import.meta.url), "utf8");

/**
 * The ids by the rule zodiacs.org's registry tests state, written apart from
 * natalConventionIds: each field's namespace and value, from the receipt
 * (natalReceiptIds in the site's tests/conventions-registry.test.ts) and from
 * the result's time records (as its calcReceiptIds reads an instant's).
 */
function bySiteRule(envelope: any): string[] {
  const { receipt, result } = envelope;
  const out: string[] = [];
  for (const [key, value] of Object.entries(receipt.conventions ?? {})) out.push(`${key}:${value}`);
  for (const [key, value] of Object.entries(receipt.coverage ?? {})) out.push(`${key}:${value}`);
  for (const system of [receipt.houses?.requested, receipt.houses?.actual]) if (system) out.push(`house:${system}`);
  if (receipt.houses?.absenceReason) out.push(`house-absence:${receipt.houses.absenceReason}`);
  for (const flag of [...(receipt.inputFlags ?? []), ...(receipt.resultFlags ?? [])]) out.push(`flag:${flag}`);
  if (receipt.reference) out.push(`reference:${receipt.reference}`);
  if (receipt.timeScale) out.push(`time-scale:${receipt.timeScale}`);
  const ephemeris = receipt.engine?.ephemeris;
  if (ephemeris) out.push(`ephemeris:${ephemeris.name}@${ephemeris.version}`);
  if (result.deltaT) out.push(`deltat-model:${result.deltaT.model}`, `deltat-segment:${result.deltaT.segment}`);
  if (result.timeScale) {
    out.push(`time-scale:${result.timeScale.input}`, `time-basis:${result.timeScale.basis}`);
    if (result.timeScale.ut1MinusUtc) out.push(`ut1-source:${result.timeScale.ut1MinusUtc.source}`);
  }
  return [...new Set(out)].sort();
}
const NEW_YORK = { utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" } as const;

function envelopeOf(birth: Partial<BirthInput> = {}, context: NatalEnvelopeContext = {}): NatalEnvelope {
  return createNatalEnvelope(natalChart({ ...NEW_YORK, ...birth }), context);
}

/** Parse after `change` edits a JSON copy; the codec's verdict. */
function verdict(envelope: NatalEnvelope | string, change: (copy: any) => void = () => {}): "ok" | NatalEnvelopeErrorCode {
  const copy = JSON.parse(typeof envelope === "string" ? envelope : serializeNatalEnvelope(envelope));
  change(copy);
  const parsed = parseNatalEnvelope(JSON.stringify(copy));
  return parsed.ok ? "ok" : parsed.code;
}

describe("convention ids", () => {
  it("are a namespace, a colon and a value, which is everything after the first colon", () => {
    expect(conventionId("zodiac", "tropical")).toBe("zodiac:tropical");
    expect(parseConventionId("deltat-model:iers-utc/1")).toEqual({ namespace: "deltat-model", value: "iers-utc/1" });
    expect(parseConventionId("frame:a:b")).toEqual({ namespace: "frame", value: "a:b" });
    expect(parseConventionId("ephemeris:astronomy-engine@2.1.19")).toEqual({
      namespace: "ephemeris",
      value: "astronomy-engine@2.1.19"
    });
  });

  it("refuse a malformed namespace, value or id, with a RangeError", () => {
    const zeroWidth = String.fromCharCode(0x200b);
    const lone = [String.fromCharCode(0xdc00), String.fromCharCode(0xd800)];
    for (const [namespace, value] of [["", "x"], ["a:b", "x"], ["1zodiac", "x"], ["zo diac", "x"], ["zodiac", ""], ["zodiac", "a b"], ["zodiac", "a\u0000"], ["zodiac", `a${zeroWidth}`], ["zodiac", `${lone[0]}x`], ["zodiac", `x${lone[1]}`]]) {
      expect(() => conventionId(namespace!, value!), `${namespace} ${value}`).toThrow(RangeError);
    }
    for (const id of ["zodiac", ":tropical", "zodiac:", "zodiac: tropical", `zodiac:${lone[1]}`]) {
      expect(() => parseConventionId(id), id).toThrow(RangeError);
      expect(() => conventionAddress(id), id).toThrow(RangeError);
    }
  });

  it("have an address on the registry's page, the id through encodeURI as its fragment", () => {
    expect(CONVENTIONS_REGISTRY).toBe("https://zodiacs.org/developers/conventions/");
    expect(conventionAddress("zodiac:tropical")).toBe("https://zodiacs.org/developers/conventions/#zodiac:tropical");
    expect(conventionAddress("longitudeUnit:degrees-[0,360)")).toBe(
      "https://zodiacs.org/developers/conventions/#longitudeUnit:degrees-%5B0,360)"
    );
    expect(decodeURI(new URL(conventionAddress("deltat-model:iers-utc/1")).hash.slice(1))).toBe("deltat-model:iers-utc/1");
    expect(() => conventionAddress("tropical")).toThrow(RangeError);
  });
});

describe("the ids of a natal receipt", () => {
  it("are each field's namespace and value, from the receipt and its result, sorted, each once", () => {
    const envelope = envelopeOf();
    expect(envelope.receipt.conventionIds).toEqual([
      "angleExclusions:exact-geographic-poles-and-ecliptic-horizon-coincidence",
      "angles:gast-and-true-obliquity",
      "aspects:major-aspects;sun-moon-eight-planets;no-nodes;applying-instantaneous-orb-rate",
      "assessment:finite-reference-cases-only",
      "broadDateRange:not-certified",
      "calendar:proleptic-gregorian",
      "conventionIds:zodiacs-conventions-registry;receipt-and-result;sorted-unique;in-receipt",
      "deltaT:tt-minus-ut1;value-in-result",
      "deltat-model:iers-utc/1",
      "deltat-segment:observed",
      "ephemeris:astronomy-engine@2.1.19",
      "house:placidus",
      "inputSyntax:not-an-astronomical-accuracy-guarantee",
      "localTime:tzdb-shards-before-1970;host-intl-from-1970;flags-from-transition-record",
      "longitudeUnit:degrees-[0,360)",
      "moonNodes:instantaneous-geocentric-moon-orbit-plane",
      "moonPosition:astronomy-engine-geo-moon;no-light-time;no-aberration",
      "nutation:iau2000b;equation-of-equinoxes-with-two-complementary-terms",
      "planetPositions:aberrated-geocentric-ecliptic-of-date;no-deflection",
      "reference:supplied-instant",
      "speed:degrees-per-day;central-difference-plus-minus-0.001-day;nodes-plus-minus-0.25-day",
      "time-basis:iers",
      "time-scale:utc",
      "timeScale:tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;delta-t-model-otherwise;in-result",
      "ut1-source:observed",
      "zodiac:tropical"
    ]);
    expect(natalConventionIds(envelope)).toEqual(envelope.receipt.conventionIds);
  });

  it.each([
    ["an unknown time", { timeKnown: false }, {}, ["house-absence:unknown-time", "flag:no-time"]],
    ["no location", { latitude: undefined, longitude: undefined }, {}, ["house-absence:missing-location"]],
    ["a polar fallback", { latitude: 70 }, {}, ["house:placidus", "house:whole", "flag:polar-fallback"]],
    ["local mean time", { flags: ["lmt"] }, {}, ["flag:lmt"]],
    ["Koch", { houseSystem: "koch" }, {}, ["house:koch"]],
    ["UTC noon for an unknown time", { utc: "2000-01-01T12:00:00Z", timeKnown: false }, { reference: "utc-noon" }, ["reference:utc-noon"]],
    ["TT", { utc: "2001-12-21T09:01:04.184Z", timeScale: "tt" }, {}, ["time-scale:tt", "time-basis:iers"]],
    ["UT1", { timeScale: "ut1" }, {}, ["time-scale:ut1"]],
    ["outside the reference span", { utc: "1700-06-15T12:30:00Z" }, {}, ["flag:outside-reference-span", "time-basis:delta-t", "deltat-model:zodiacs-deltat/1"]],
    ["a pinned ΔT", { deltaT: 69.2 }, {}, ["deltat-model:pinned", "deltat-segment:pinned", "time-basis:pinned"]]
  ] as const)("name %s", (_, birth, context, named) => {
    const input = { ...NEW_YORK, ...birth } as BirthInput;
    for (const key of ["latitude", "longitude"] as const) if (input[key] === undefined) delete input[key];
    const envelope = createNatalEnvelope(natalChart(input), context);
    const ids = envelope.receipt.conventionIds!;
    for (const id of named) expect(ids).toContain(id);
    expect(ids).toEqual(bySiteRule(envelope));
    expect(ids).toEqual(natalConventionIds(envelope));
    expect(ids).toEqual([...new Set(ids)].sort());
    expect(verdict(envelope)).toBe("ok");
  });

  it("come with the set that names them, and the rc.16 set otherwise", () => {
    const [current, rc16] = NATAL_RECEIPT_CONVENTION_SETS;
    expect(current).toEqual({ ...rc16, conventionIds: "zodiacs-conventions-registry;receipt-and-result;sorted-unique;in-receipt" });
    expect(envelopeOf().receipt.conventions).toEqual(current);
  });
});

describe("the codec and the ids", () => {
  it("reads a receipt back with its ids, in an envelope that requires them", () => {
    const envelope = envelopeOf();
    expect(envelope.requiredFeatures).toEqual(["convention-ids"]);
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope))).toEqual({ ok: true, envelope });
    expect(natalReplayInput(envelope)).toMatchObject({ utc: "1990-06-15T12:30:00.000Z", houseSystem: "placidus" });
  });

  it("refuses ids that are not the receipt's own", () => {
    const envelope = envelopeOf();
    const changes: Array<(ids: string[]) => void> = [
      (ids) => ids.pop(),
      (ids) => ids.push("zodiac:sidereal"),
      (ids) => ids.reverse(),
      (ids) => ids.push(ids[0]!),
      (ids) => (ids[ids.indexOf("house:placidus")] = "house:koch"),
      (ids) => ids.splice(0, ids.length)
    ];
    for (const change of changes) {
      expect(verdict(envelope, (copy) => change(copy.receipt.conventionIds))).toBe("inconsistent_result");
    }
    // A field changed without its id, and with it: the codec checks a claim's
    // structure, not its numbers.
    const koch = (copy: any) => {
      copy.receipt.houses.requested = copy.receipt.houses.actual = copy.result.houses.system = "koch";
    };
    expect(verdict(envelope, koch)).toBe("inconsistent_result");
    expect(
      verdict(envelope, (copy) => {
        koch(copy);
        copy.receipt.conventionIds = natalConventionIds(copy);
      })
    ).toBe("ok");
  });

  it("refuses the feature missing, repeated or with an earlier set, and any other feature", () => {
    const envelope = envelopeOf();
    expect(verdict(envelope, (copy) => (copy.requiredFeatures = []))).toBe("inconsistent_result");
    expect(verdict(envelope, (copy) => copy.requiredFeatures.push("convention-ids"))).toBe("inconsistent_result");
    expect(verdict(envelope, (copy) => copy.requiredFeatures.push("execute"))).toBe("unsupported_feature");
    expect(verdict(envelope, (copy) => (copy.requiredFeatures = "convention-ids"))).toBe("invalid_shape");
    expect(verdict(ONE_ZERO, (copy) => (copy.requiredFeatures = ["convention-ids"]))).toBe("inconsistent_result");
  });

  it("refuses the ids missing, malformed, or under an earlier set", () => {
    const envelope = envelopeOf();
    expect(verdict(envelope, (copy) => delete copy.receipt.conventionIds)).toBe("invalid_shape");
    expect(verdict(envelope, (copy) => (copy.receipt.conventionIds = "zodiac:tropical"))).toBe("invalid_shape");
    expect(verdict(envelope, (copy) => (copy.receipt.conventionIds = { 0: "zodiac:tropical" }))).toBe("invalid_shape");
    expect(verdict(envelope, (copy) => (copy.receipt.conventionIds[0] = 1))).toBe("invalid_value");
    expect(verdict(envelope, (copy) => delete copy.receipt.conventions.conventionIds)).toBe("invalid_shape");
    expect(
      verdict(envelope, (copy) => {
        delete copy.receipt.conventions.conventionIds;
        delete copy.receipt.conventionIds;
      })
    ).toBe("inconsistent_result");
    // As 1.0.0 writes it for a chart this engine computed: read, as 1.0.0 reads it.
    expect(
      verdict(envelope, (copy) => {
        delete copy.receipt.conventions.conventionIds;
        delete copy.receipt.conventionIds;
        copy.requiredFeatures = [];
      })
    ).toBe("ok");
    expect(
      verdict(ONE_ZERO, (copy) => (copy.receipt.conventionIds = natalConventionIds(copy)))
    ).toBe("invalid_shape");
  });

  it("still reads a receipt that 1.0.0 wrote, without ids, and replays it", () => {
    // Serialized by the carried 1.0.0 archive on Node 22.22.2 (ICU 78.2, tz 2025c), darwin-arm64.
    expect(createHash("sha256").update(ONE_ZERO).digest("hex")).toBe("fba1026ab4df6e816a8ad470ca9b96ff640b482c2fe14824f9d1626ba21817c4");
    const parsed = parseNatalEnvelope(ONE_ZERO);
    if (!parsed.ok) throw new Error(parsed.code);
    expect(parsed.envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[1]);
    expect(parsed.envelope.requiredFeatures).toEqual([]);
    expect("conventionIds" in parsed.envelope.receipt).toBe(false);
    expect(serializeNatalEnvelope(parsed.envelope)).toBe(ONE_ZERO.trimEnd());
    // Its fields name the same ids as this engine's receipt of the same chart, less the set's own.
    const today = envelopeOf({}, {
      reference: parsed.envelope.receipt.reference,
      localResolution: parsed.envelope.receipt.localResolution
    });
    expect(natalConventionIds(parsed.envelope)).toEqual(
      today.receipt.conventionIds!.filter((id) => !id.startsWith("conventionIds:"))
    );
    expect(natalConventionIds(parsed.envelope)).toEqual(bySiteRule(parsed.envelope));
    // Replayed by this engine, it gives its own positions, angles and cusps.
    const stored = parsed.envelope.result;
    const replay = natalChart(natalReplayInput(parsed.envelope));
    const degrees = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    for (const body of stored.bodies) {
      const now = replay.bodies.find((row) => row.body === body.body)!;
      expect(degrees(now.lon, body.lon), body.body).toBeLessThan(1e-9);
      expect(Math.abs(now.lat - body.lat), body.body).toBeLessThan(1e-9);
    }
    for (const key of ["asc", "mc", "dsc", "ic"] as const) expect(degrees(replay.angles![key], stored.angles![key])).toBeLessThan(1e-9);
    stored.houses!.cusps.forEach((cusp, index) => expect(degrees(replay.houses!.cusps[index]!, cusp)).toBeLessThan(1e-9));
    expect(replay.deltaT).toMatchObject({ model: stored.deltaT!.model, segment: stored.deltaT!.segment });
  });

  it("names an older record's ids from the fields it has", () => {
    const parsed = parseNatalEnvelope(RC7);
    if (!parsed.ok) throw new Error(parsed.code);
    const ids = natalConventionIds(parsed.envelope);
    expect(ids).toEqual(bySiteRule(parsed.envelope));
    expect(ids.some((id) => /^(?:deltat-|time-basis:|ut1-source:|time-scale:|ephemeris:)/u.test(id))).toBe(false);
  });

  it("reads an envelope's features before its receipt, so a later set is unsupported", () => {
    const envelope = envelopeOf();
    expect(verdict(envelope, (copy) => {
      copy.requiredFeatures.push("next-feature");
      copy.receipt.nextField = [];
    })).toBe("unsupported_feature");
    expect(verdict(envelope, (copy) => {
      copy.requiredFeatures.push("next-feature");
      copy.receipt.conventions.next = "x";
    })).toBe("unsupported_feature");
    expect(verdict(envelope, (copy) => {
      copy.requiredFeatures = ["next-feature"];
      copy.receipt = { schema: copy.receipt.schema };
    })).toBe("unsupported_feature");
  });

  it("refuses a malformed field by its own rule, not by the ids", () => {
    // The writer leaves the ids empty when a field cannot name one; the field's own check refuses it.
    const chart = natalChart(NEW_YORK);
    expect(() => createNatalEnvelope({ ...chart, flags: ["not a flag" as never] })).toThrow(/invalid_value/u);
    expect(() => createNatalEnvelope({ ...chart, input: { ...chart.input, houseSystem: "no system" as never } })).toThrow(
      /invalid_value/u
    );
  });

  it("reads a record whatever engine computed its chart, as 1.0.0 does", () => {
    // 1.0.0's set under a later engine's version: 1.0.0 writes that for a
    // chart a later engine computed, and reads it back.
    for (const version of ["1.1.0-rc.1", "1.1.0", "2.0.0"]) {
      expect(verdict(ONE_ZERO, (copy) => (copy.receipt.engine.version = version)), version).toBe("ok");
    }
    // This engine's set for a chart 1.0.0 computed: the same conventions, with the record's ids.
    const chart = { ...natalChart(NEW_YORK), engineVersion: "1.0.0" };
    const envelope = createNatalEnvelope(chart);
    expect(envelope.receipt.engine.version).toBe("1.0.0");
    expect(envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
    expect(verdict(envelope)).toBe("ok");
    // A chart from before 0.1.1-rc.16 is refused, as 1.0.0 refuses it.
    expect(() => createNatalEnvelope({ ...chart, engineVersion: "0.1.1-rc.15" })).toThrow(/inconsistent_result/u);
  });

  it("leaves the ids out of the redacted diagnostic", () => {
    expect(Object.keys(redactNatalEnvelope(envelopeOf())).sort()).toEqual([
      "houses",
      "inputFlags",
      "resultFlags",
      "schema",
      "status",
      "timeKnown"
    ]);
  });
});
