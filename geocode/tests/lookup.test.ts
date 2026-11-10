import { describe, expect, it } from "vitest";
import { createPlaceLookup, DatasetValidationError } from "../src/index.js";
import type { LookupOptions, PlaceRecord } from "../src/index.js";

// These are invented settlements and queries, unrelated to anybody's birth.
function place(id: string, overrides: Partial<PlaceRecord> = {}) {
  return {
    id: `synthetic:${id}`,
    name: "Amber Harbour",
    asciiName: "Amber Harbour",
    aliases: ["Port of Amber"],
    countryCode: "ZZ",
    countryName: "Example Republic",
    regionCode: "01",
    regionName: "North Reach",
    latitude: 12.3456789,
    longitude: -45.6789123,
    elevationMeters: null,
    demElevationMeters: null,
    population: null,
    timeZone: null,
    ...overrides
  };
}

function dataset(places: readonly PlaceRecord[] = [place("amber")]) {
  return {
    schemaVersion: 1,
    provenance: {
      dataset: "synthetic",
      license: "MIT",
      attribution: "Invented records for the geocode lookup tests",
      sources: []
    },
    places
  };
}

function ids(result: ReturnType<ReturnType<typeof createPlaceLookup>["lookup"]>): string[] {
  return result.candidates.map((candidate) => candidate.place.id);
}

describe("city, region and country lookup", () => {
  const lookup = createPlaceLookup(dataset()).lookup;

  it.each([
    "Amber Harbour",
    "  AMBER   HARBOUR  ",
    "Amber Harbour North Reach",
    "Amber Harbour 01",
    "Amber Harbour Example Republic",
    "Amber Harbour zz",
    "Amber Harbour North Reach Example Republic",
    "Amber Harbour 01 ZZ",
    "Amber Harbour, North Reach",
    "Amber Harbour, 01",
    "Amber Harbour, Example Republic",
    "Amber Harbour, zz",
    "Amber Harbour, North Reach, Example Republic",
    "Amber Harbour, 01, ZZ",
    "Amber Harbour，01，ZZ"
  ])("matches the city-first phrase %s", (query) => {
    const result = lookup(query);
    expect(result).toMatchObject({ status: "unique", total: 1, truncated: false });
    expect(ids(result)).toEqual(["synthetic:amber"]);
    expect(result.candidates[0]?.match).toEqual({ kind: "exact", field: "name", text: "Amber Harbour" });
  });

  it.each([
    "Harbour Amber", "Example Republic Amber Harbour", "North Reach", "Example Republic",
    "Amber Harbour, Unknown Reach", "Amber Harbour, North Reach, YY", "Amber Harbour, 1",
    "Amber Harbour, ZZ, North Reach", "An invented place absent from this dataset"
  ])("does not guess a city or unknown qualifier for %s", (query) => {
    expect(lookup(query)).toEqual({ status: "no-match", total: 0, truncated: false, candidates: [] });
  });

  it("matches a prefix only at the beginning of a city label", () => {
    expect(lookup("Amber Har, ZZ").candidates[0]?.match).toEqual({ kind: "prefix", field: "name", text: "Amber Harbour" });
    expect(lookup("Harbour").status).toBe("no-match");
    expect(lookup("Ambar Harbour").status).toBe("no-match");
  });

  it("intersects explicit country and region filters with the query", () => {
    expect(lookup("Amber Harbour", { country: " zz ", region: "north reach" }).status).toBe("unique");
    expect(lookup("Amber Harbour, ZZ", { country: "Example Republic", region: "01" }).status).toBe("unique");
    expect(lookup("Amber Harbour, ZZ", { country: "YY" }).status).toBe("no-match");
    expect(lookup("Amber Harbour, North Reach", { region: "South Reach" }).status).toBe("no-match");
    expect(lookup("Amber Harbour", { country: "Exam" }).status).toBe("no-match");
    expect(lookup("Amber Harbour", { region: "North" }).status).toBe("no-match");
    expect(lookup("Amber Harbour", { region: "1" }).status).toBe("no-match");
  });

  it("keeps both full-city and city-plus-qualifier interpretations", () => {
    const index = createPlaceLookup(dataset([
      place("amber", { name: "Amber", asciiName: "Amber", aliases: [], regionName: "North" }),
      place("amber-north", { name: "Amber North", asciiName: "Amber North", aliases: [], regionName: "South" })
    ]));
    expect(index.lookup("Amber North").status).toBe("ambiguous");
    expect(ids(index.lookup("Amber North"))).toEqual(["synthetic:amber", "synthetic:amber-north"]);
    expect(ids(index.lookup("Amber, North"))).toEqual(["synthetic:amber"]);
  });

  it("treats a two-part comma qualifier as region or country without guessing which", () => {
    const index = createPlaceLookup(dataset([
      place("region-zz", { countryCode: "YY", countryName: "Second Republic", regionCode: "ZZ" }),
      place("country-zz", { regionCode: "02" })
    ]));
    const result = index.lookup("Amber Harbour, ZZ");
    expect(result.status).toBe("ambiguous");
    expect(new Set(ids(result))).toEqual(new Set(["synthetic:region-zz", "synthetic:country-zz"]));
    expect(ids(index.lookup("Amber Harbour, ZZ", { country: "YY" }))).toEqual(["synthetic:region-zz"]);
  });

  it("does not match missing region facts as text", () => {
    const index = createPlaceLookup(dataset([place("no-region", { regionCode: null, regionName: null })]));
    expect(index.lookup("Amber Harbour").status).toBe("unique");
    expect(index.lookup("Amber Harbour", { region: "null" }).status).toBe("no-match");
    expect(index.lookup("Amber Harbour, 01").status).toBe("no-match");
  });

  it("retains exact city names and aliases that contain commas", () => {
    const index = createPlaceLookup(dataset([
      place("literal-comma", { name: "Amber, Delta Ward", asciiName: "Amber, Delta Ward", aliases: ["River Landing, Old Port"] }),
      place("structured", { name: "Amber", asciiName: "Amber", aliases: [], regionName: "Delta Ward" })
    ]));
    expect(index.lookup("Amber, Delta Ward").status).toBe("ambiguous");
    expect(new Set(ids(index.lookup("Amber, Delta Ward")))).toEqual(new Set(["synthetic:literal-comma", "synthetic:structured"]));
    expect(ids(index.lookup("Amber, Delta Ward", { region: "North Reach" }))).toEqual(["synthetic:literal-comma"]);
    expect(index.lookup("River Landing, Old Port").candidates[0]?.match)
      .toEqual({ kind: "exact", field: "alias", text: "River Landing, Old Port" });
    expect(ids(index.lookup("Amber Delta Ward"))).toContain("synthetic:literal-comma");
  });

  it("treats explicit comma-bearing country and region filters as scalar labels", () => {
    const index = createPlaceLookup(dataset([place("comma-metadata", {
      countryName: "North Island, East Island and West Island",
      regionName: "Harbour, North District"
    })]));
    expect(index.lookup("Amber Harbour", {
      country: "North Island, East Island and West Island",
      region: "Harbour, North District"
    }).status).toBe("unique");
    expect(index.lookup("Amber Harbour", { country: "ZZ,YY" }).status).toBe("no-match");
  });
});

describe("Unicode labels and aliases", () => {
  it("folds Latin accents and compatibility spelling while preserving display labels", () => {
    const index = createPlaceLookup(dataset([place("etoile", {
      name: "Étoile-sur-Mer", asciiName: "Etoile-sur-Mer", aliases: ["Port d’Étoile"],
      countryName: "République Imaginaire", regionName: "Côte Nord"
    })]));
    for (const query of ["Etoile sur Mer", "E\u0301toile-sur-Mer", "ÉTOILE SUR MER", "ＥＴＯＩＬＥ ＳＵＲ ＭＥＲ"]) {
      expect(index.lookup(query).candidates[0]?.match).toEqual({ kind: "exact", field: "name", text: "Étoile-sur-Mer" });
    }
    for (const query of ["Port d'Etoile", "Port d’Etoile", "Port dEtoile"]) {
      expect(index.lookup(query, { country: "Republique Imaginaire", region: "Cote Nord" }).candidates[0]?.match)
        .toEqual({ kind: "exact", field: "alias", text: "Port d’Étoile" });
    }
    expect(index.lookup("Etoile").candidates[0]?.place.name).toBe("Étoile-sur-Mer");
  });

  it("uses supplied transliteration and native-script aliases", () => {
    const index = createPlaceLookup(dataset([place("native", {
      name: "架空港", asciiName: "Kakuu Harbour", aliases: ["架空の港", "Imaginary Moon Harbour"]
    })]));
    expect(index.lookup("Kakuu Harbour").candidates[0]?.match.field).toBe("asciiName");
    expect(index.lookup("架空の港").candidates[0]?.match).toEqual({ kind: "exact", field: "alias", text: "架空の港" });
    expect(index.lookup("架空港").candidates[0]?.match.field).toBe("name");
    expect(index.lookup("Unprovided Transliteration").status).toBe("no-match");
  });

  it("preserves non-Latin vowel marks instead of merging different names", () => {
    const index = createPlaceLookup(dataset([
      place("marked", { name: "किरन", asciiName: "Marked Example", aliases: [] }),
      place("unmarked", { name: "करन", asciiName: "Unmarked Example", aliases: [] })
    ]));
    expect(ids(index.lookup("किरन"))).toEqual(["synthetic:marked"]);
    expect(ids(index.lookup("करन"))).toEqual(["synthetic:unmarked"]);
  });

  it("reports collisions caused by normalization as separate place choices", () => {
    const index = createPlaceLookup(dataset([
      place("accented", { name: "Étoile", asciiName: "Etoile", aliases: [] }),
      place("plain", { name: "Etoile", asciiName: "Etoile", aliases: [] })
    ]));
    expect(index.lookup("Etoile")).toMatchObject({ status: "ambiguous", total: 2 });
  });

  it("deduplicates one place's matching names and aliases and chooses the best match", () => {
    const index = createPlaceLookup(dataset([place("duplicates", {
      name: "Amber Harbour", asciiName: "Amber Harbour", aliases: ["AMBER HARBOUR", "Amber Harbour East", "Ámber Harbour"]
    })]));
    expect(index.lookup("Amber Harbour")).toMatchObject({ status: "unique", total: 1 });
    expect(index.lookup("Amber Harbour").candidates[0]?.match).toEqual({ kind: "exact", field: "name", text: "Amber Harbour" });
  });

  it("selects alias evidence independently of source alias order", () => {
    const aliases = ["Étoile", "ETOILE", "Etoile Grove"];
    const a = createPlaceLookup(dataset([place("alias-order", { aliases })]));
    const b = createPlaceLookup(dataset([place("alias-order", { aliases: [...aliases].reverse() })]));
    expect(a.lookup("Etoile").candidates[0]?.match).toEqual(b.lookup("Etoile").candidates[0]?.match);
    expect(a.lookup("Eto").candidates[0]?.match).toEqual(b.lookup("Eto").candidates[0]?.match);
  });
});

describe("ranking and ambiguity", () => {
  it("ranks exact before prefix and name before transliteration before alias", () => {
    const index = createPlaceLookup(dataset([
      place("prefix", { name: "Arrow Grove", asciiName: "Arrow Grove", aliases: [], population: 1_000_000 }),
      place("alias", { name: "Quiver", asciiName: "Quiver", aliases: ["Arrow"], population: 100_000 }),
      place("ascii", { name: "Imaginary Native Name", asciiName: "Arrow", aliases: [], population: 10_000 }),
      place("name", { name: "Arrow", asciiName: "Arrow", aliases: [], population: 1 })
    ]));
    expect(ids(index.lookup("Arrow"))).toEqual(["synthetic:name", "synthetic:ascii", "synthetic:alias", "synthetic:prefix"]);
    expect(index.lookup("Arrow").status).toBe("ambiguous");
  });

  it("sorts population descending, keeps zero above unknown, then uses stable IDs", () => {
    const rows = [
      place("unknown", { population: null }), place("zero", { population: 0 }),
      place("b", { population: 12 }), place("a", { population: 12 }), place("largest", { population: 100 })
    ];
    const expected = ["synthetic:largest", "synthetic:a", "synthetic:b", "synthetic:zero", "synthetic:unknown"];
    expect(ids(createPlaceLookup(dataset(rows)).lookup("Amber Harbour"))).toEqual(expected);
    expect(ids(createPlaceLookup(dataset([...rows].reverse())).lookup("Amber Harbour"))).toEqual(expected);
  });

  it("uses normalized city names before IDs to break matching-alias ties", () => {
    const index = createPlaceLookup(dataset([
      place("a", { name: "Zulu Cove", asciiName: "Zulu Cove", aliases: ["Old Harbour"] }),
      place("z", { name: "Étoile Cove", asciiName: "Etoile Cove", aliases: ["Old Harbour"] })
    ]));
    expect(ids(index.lookup("Old Harbour"))).toEqual(["synthetic:z", "synthetic:a"]);
  });

  it("reports all matching choices before applying the returned-candidate limit", () => {
    const index = createPlaceLookup(dataset([
      place("exact", { population: 10 }),
      place("prefix", { name: "Amber Harbour East", asciiName: "Amber Harbour East", aliases: [] })
    ]));
    const limited = index.lookup("Amber Harbour", { limit: 1 });
    expect(limited).toMatchObject({ status: "ambiguous", total: 2, truncated: true });
    expect(ids(limited)).toEqual(["synthetic:exact"]);
    expect(index.lookup("Amber Harbour", { limit: 2 })).toMatchObject({ status: "ambiguous", total: 2, truncated: false });
  });

  it("enforces default and maximum limits without hiding total ambiguity", () => {
    const index = createPlaceLookup(dataset(Array.from({ length: 101 }, (_, i) => place(`duplicate-${i}`))));
    expect(index.lookup("Amber Harbour")).toMatchObject({ status: "ambiguous", total: 101, truncated: true });
    expect(index.lookup("Amber Harbour").candidates).toHaveLength(10);
    expect(index.lookup("Amber Harbour", { limit: 100 }).candidates).toHaveLength(100);
    expect(index.lookup("Amber Harbour", { limit: 100 }).total).toBe(101);
  });
});

describe("lookup boundaries and snapshots", () => {
  it.each(["", "   ", "...", "---", "’''", "\u0301"])("returns no-match for empty search content %s", (query) => {
    expect(createPlaceLookup(dataset()).lookup(query)).toEqual({ status: "no-match", total: 0, truncated: false, candidates: [] });
  });

  it("accepts an empty dataset and valid polar records without inventing missing facts", () => {
    expect(createPlaceLookup(dataset([]))).toMatchObject({ size: 0 });
    expect(createPlaceLookup(dataset([])).lookup("Amber").status).toBe("no-match");
    const polar = place("polar", { latitude: 90, longitude: -180, population: 0, elevationMeters: -2.5, demElevationMeters: null });
    const candidate = createPlaceLookup(dataset([polar])).lookup("Amber Harbour").candidates[0]!;
    expect(candidate.place).toEqual(polar);
    expect(candidate.place.timeZone).toBeNull();
    expect(candidate.place.demElevationMeters).toBeNull();
  });

  it("captures a detached snapshot so input mutation cannot corrupt indexed results", () => {
    const aliases = ["Port of Amber"];
    const row = place("amber", { aliases });
    const rows = [row];
    const input = dataset(rows);
    const index = createPlaceLookup(input);
    row.name = "Changed Name";
    row.latitude = 88;
    aliases[0] = "Changed Alias";
    rows.push(place("added"));
    input.provenance.attribution = "Changed Attribution";
    expect(index.size).toBe(1);
    expect(index.provenance.attribution).toBe("Invented records for the geocode lookup tests");
    expect(index.lookup("Port of Amber").candidates[0]?.place).toMatchObject({ name: "Amber Harbour", latitude: 12.3456789 });
    expect(index.lookup("Changed Name").status).toBe("no-match");
    expect(index.lookup("Changed Alias").status).toBe("no-match");
  });

  it("freezes exposed index metadata, candidates and match evidence", () => {
    const index = createPlaceLookup(dataset());
    const result = index.lookup("Amber");
    const candidate = result.candidates[0]!;
    for (const value of [index, index.provenance, index.provenance.sources, result, result.candidates, candidate, candidate.match, candidate.place, candidate.place.aliases]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Reflect.set(candidate.match, "kind", "exact")).toBe(false);
    expect(Reflect.set(candidate.place, "name", "Changed Name")).toBe(false);
    expect(index.lookup("Amber").candidates[0]?.match.kind).toBe("prefix");
  });

  it("validates caller datasets and does not accept duplicate source IDs", () => {
    expect(() => createPlaceLookup(null)).toThrow(DatasetValidationError);
    expect(() => createPlaceLookup(dataset([place("same"), place("same")]))).toThrow(DatasetValidationError);
  });

  it("accepts query and filter labels exactly at the UTF-16 length bound", () => {
    const name = "a".repeat(512);
    const countryName = "b".repeat(512);
    const regionName = "c".repeat(512);
    const index = createPlaceLookup(dataset([place("long-labels", { name, asciiName: name, countryName, regionName, aliases: [] })]));
    expect(index.lookup(name, { country: countryName, region: regionName }).status).toBe("unique");
    expect(index.lookup("🌙".repeat(256)).status).toBe("no-match");
    expect(() => index.lookup("🌙".repeat(257))).toThrow(RangeError);
    expect(() => index.lookup(name, { region: "c".repeat(513) })).toThrow(RangeError);
  });

  it.each([null, undefined, 2, {}, [], "a\nb", "a\u0000b", "a\u007fb", "a\ud800b", "x".repeat(513)])(
    "rejects malformed query input %# without echoing it",
    (query) => {
      expect(() => createPlaceLookup(dataset()).lookup(query as string)).toThrow(RangeError);
    }
  );

  it.each([",", "Amber Harbour,", ",ZZ", "Amber Harbour,,ZZ", "Amber Harbour,01,ZZ,extra", "Amber Harbour,..."])(
    "rejects malformed comma syntax %s",
    (query) => expect(() => createPlaceLookup(dataset()).lookup(query)).toThrow(RangeError)
  );

  it.each([
    null, [], 1, "ZZ", { unknown: true }, { country: undefined }, { country: null }, { country: "" },
    { country: "..." }, { country: "ZZ\n" }, { country: "x".repeat(513) },
    { region: undefined }, { region: "" }, { region: "\ud800" },
    { limit: undefined }, { limit: null }, { limit: 0 }, { limit: -1 }, { limit: 1.5 },
    { limit: 101 }, { limit: NaN }, { limit: Infinity }, { limit: "1" }
  ])("rejects malformed options %#", (options) => {
    expect(() => createPlaceLookup(dataset()).lookup("Amber", options as LookupOptions)).toThrow(RangeError);
  });

  it("validates options even for blank searches and omits submitted text from errors", () => {
    const index = createPlaceLookup(dataset());
    expect(() => index.lookup("", { limit: 0 })).toThrow(RangeError);
    const privateQuery = "PRIVATE_SYNTHETIC_QUERY\n";
    try {
      index.lookup(privateQuery);
      expect.unreachable("Control-bearing text should be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
      expect((error as Error).message).not.toContain("PRIVATE_SYNTHETIC_QUERY");
    }
  });
});
