import { describe, expect, it } from "vitest";
import { DatasetValidationError, parsePlaceDataset } from "../src/dataset.js";

// Invented place records and source receipts, never anybody's birth details.
function place(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "synthetic:amber-harbour",
    name: "Amber Harbour",
    asciiName: "Amber Harbour",
    aliases: ["Port of Amber"],
    countryCode: "ZZ",
    countryName: "Example Republic",
    regionCode: "NW-EXAMPLE",
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

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    file: "invented-places.tsv",
    url: "https://example.invalid/invented-places.tsv",
    sha256: "0123456789abcdef".repeat(4),
    ...overrides
  };
}

function provenance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dataset: "synthetic",
    license: "MIT",
    attribution: "Invented records for the geocode test suite",
    sources: [],
    ...overrides
  };
}

function dataset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    provenance: provenance(),
    places: [place()],
    ...overrides
  };
}

function rejects(value: unknown): void {
  expect(() => parsePlaceDataset(value)).toThrow(DatasetValidationError);
}

describe("place dataset snapshots", () => {
  it("detaches nested data so edits to the input cannot alter the validated snapshot", () => {
    const aliases = ["Port of Amber"];
    const inputPlace = place({ aliases });
    const inputSource = source();
    const sources = [inputSource];
    const inputProvenance = provenance({ sources });
    const places = [inputPlace];
    const input = dataset({ provenance: inputProvenance, places });
    const result = parsePlaceDataset(input);

    input.schemaVersion = 2;
    inputPlace.latitude = 88;
    aliases.push("Changed alias");
    places.push(place({ id: "synthetic:another-place" }));
    inputProvenance.attribution = "Changed attribution";
    inputSource.url = "https://example.invalid/changed.tsv";
    sources.push(source({ file: "changed.tsv" }));

    expect(result.schemaVersion).toBe(1);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]?.latitude).toBe(12.3456789);
    expect(result.places[0]?.aliases).toEqual(["Port of Amber"]);
    expect(result.provenance.attribution).toBe("Invented records for the geocode test suite");
    expect(result.provenance.sources).toHaveLength(1);
    expect(result.provenance.sources[0]?.url).toBe("https://example.invalid/invented-places.tsv");
  });

  it("freezes every exposed record and array against edits by library consumers", () => {
    const result = parsePlaceDataset(dataset({ provenance: provenance({ sources: [source()] }) }));
    const row = result.places[0]!;
    const receipt = result.provenance.sources[0]!;
    for (const value of [result, result.places, row, row.aliases, result.provenance, result.provenance.sources, receipt]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Reflect.set(row, "latitude", 0)).toBe(false);
    expect(Reflect.set(row.aliases, "0", "Changed alias")).toBe(false);
    expect(Reflect.set(receipt, "url", "https://example.invalid/changed.tsv")).toBe(false);
    expect(row.latitude).toBe(12.3456789);
    expect(row.aliases).toEqual(["Port of Amber"]);
  });

  it("preserves independently identified places with the same name", () => {
    const result = parsePlaceDataset(dataset({
      places: [place(), place({ id: "synthetic:amber-harbour-east", regionName: "East Reach", longitude: 40 })]
    }));
    expect(result.places.map((row) => row.name)).toEqual(["Amber Harbour", "Amber Harbour"]);
    expect(result.places.map((row) => row.id)).toEqual(["synthetic:amber-harbour", "synthetic:amber-harbour-east"]);
    expect(result.places[1]?.regionName).toBe("East Reach");
  });

  it("rejects duplicate IDs even when their place details differ", () => {
    rejects(dataset({ places: [place(), place({ name: "Different Settlement", longitude: 40 })] }));
  });

  it("keeps Unicode display names and aliases without changing their spelling", () => {
    const aliases = ["Port d’Étoile Imaginaire", "架空の港", "Imaginary 🌙 Harbour", "E\u0301toile Imaginaire"];
    const result = parsePlaceDataset(dataset({ places: [place({ name: "Étoile Imaginaire", aliases })] }));
    expect(result.places[0]?.name).toBe("Étoile Imaginaire");
    expect(result.places[0]?.aliases).toEqual(aliases);
    expect(result.places[0]?.asciiName).toBe("Amber Harbour");
  });

  it("allows an empty dataset with explicit provenance", () => {
    expect(parsePlaceDataset(dataset({ places: [] })).places).toEqual([]);
  });
});

describe("coordinates and optional place facts", () => {
  it.each([
    [-90, -180], [-90, 180], [90, -180], [90, 180], [0, 0], [12.3456789, -45.6789123]
  ])("preserves latitude %s and longitude %s without rounding", (latitude, longitude) => {
    const row = parsePlaceDataset(dataset({ places: [place({ latitude, longitude })] })).places[0]!;
    expect(row.latitude).toBe(latitude);
    expect(row.longitude).toBe(longitude);
  });

  it.each([
    ["latitude", 90.00001], ["latitude", -90.00001], ["longitude", 180.00001], ["longitude", -180.00001],
    ["latitude", NaN], ["latitude", Infinity], ["longitude", -Infinity], ["latitude", "12.5"],
    ["longitude", null], ["latitude", undefined]
  ])("rejects invalid %s value %s", (field, value) => {
    rejects(dataset({ places: [place({ [field as string]: value })] }));
  });

  it.each([
    [null, null], [0, 28], [-120, -115], [null, 350], [23.75, null]
  ])("keeps reported elevation %s separate from terrain estimate %s", (elevationMeters, demElevationMeters) => {
    const row = parsePlaceDataset(dataset({ places: [place({ elevationMeters, demElevationMeters })] })).places[0]!;
    expect(row.elevationMeters).toBe(elevationMeters);
    expect(row.demElevationMeters).toBe(demElevationMeters);
  });

  it.each(["elevationMeters", "demElevationMeters"])("rejects invalid %s values instead of guessing a height", (field) => {
    for (const value of [NaN, Infinity, -Infinity, "0", undefined]) {
      rejects(dataset({ places: [place({ [field]: value })] }));
    }
  });

  it("retains missing region, population and timezone assignments explicitly", () => {
    const row = parsePlaceDataset(dataset({ places: [place({ regionCode: null, regionName: null })] })).places[0]!;
    expect(row.regionCode).toBeNull();
    expect(row.regionName).toBeNull();
    expect(row.population).toBeNull();
    expect(row.timeZone).toBeNull();
  });

  it.each([0, 1200, Number.MAX_SAFE_INTEGER])("accepts population %s without treating zero as missing", (population) => {
    expect(parsePlaceDataset(dataset({ places: [place({ population })] })).places[0]?.population).toBe(population);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "100"])("rejects invalid population %s", (population) => {
    rejects(dataset({ places: [place({ population })] }));
  });
});

describe("timezone assignment syntax", () => {
  it.each(["Future/Imaginary_Harbour", "Etc/GMT+5", "UTC"])("retains identifier %s for later provider validation", (timeZone) => {
    expect(parsePlaceDataset(dataset({ places: [place({ timeZone })] })).places[0]?.timeZone).toBe(timeZone);
  });

  it.each(["+05:30", "-0330", "UTC+05:45", "5.75", "Region//Place", "/Place", "Region/", "Region/Place Name", ""])(
    "rejects malformed or offset-only assignment %s",
    (timeZone) => rejects(dataset({ places: [place({ timeZone })] }))
  );
});

describe("schema boundaries", () => {
  it.each([null, undefined, [], "dataset", 1, new Date(0)].map((value) => ({ value })))(
    "rejects non-record input $value",
    ({ value }) => rejects(value)
  );

  it.each([0, 2, "1", null])("rejects unsupported schema version %s", (schemaVersion) => {
    rejects(dataset({ schemaVersion }));
  });

  it("rejects missing and unknown fields at each object boundary", () => {
    const cases: Array<[Record<string, unknown>, string, (row: Record<string, unknown>) => unknown]> = [
      [dataset(), "schemaVersion", (row) => row],
      [provenance(), "attribution", (row) => dataset({ provenance: row })],
      [place(), "longitude", (row) => dataset({ places: [row] })],
      [source(), "sha256", (row) => dataset({ provenance: provenance({ sources: [row] }) })]
    ];
    for (const [row, required, wrap] of cases) {
      const incomplete = { ...row };
      delete incomplete[required];
      rejects(wrap(incomplete));
      rejects(wrap({ ...row, unrecognizedField: true }));
    }
  });

  it.each([
    ["name", ""], ["name", " Padded"], ["name", "Padded "], ["name", "Line\nBreak"],
    ["name", "Bad\u007fName"], ["name", "Bad\ud800Name"], ["name", "x".repeat(513)],
    ["asciiName", null], ["countryName", ""], ["countryCode", "zz"], ["countryCode", "ZZZ"],
    ["regionCode", 123], ["regionName", ""], ["id", "amber-harbour"], ["id", "geonames:123"]
  ])("rejects malformed field %s", (field, value) => {
    rejects(dataset({ places: [place({ [field as string]: value })] }));
  });

  it.each([null, "alias", [""], ["Good", "Good"], ["Good", 2], ["Bad\tAlias"]].map((aliases) => ({ aliases })))(
    "rejects malformed aliases $aliases",
    ({ aliases }) => rejects(dataset({ places: [place({ aliases })] }))
  );

  it("rejects non-record entries at nested object boundaries", () => {
    rejects(dataset({ places: [null] }));
    rejects(dataset({ provenance: [] }));
    rejects(dataset({ provenance: provenance({ sources: [null] }) }));
  });

  it("rejects sparse arrays instead of silently dropping records, aliases or receipts", () => {
    rejects(dataset({ places: new Array(1) }));
    rejects(dataset({ places: [place({ aliases: new Array(1) })] }));
    rejects(dataset({ provenance: provenance({ sources: new Array(1) }) }));
  });

  it("rejects non-array collections", () => {
    rejects(dataset({ places: {} }));
    rejects(dataset({ places: [place({ aliases: new Set(["Alias"]) })] }));
    rejects(dataset({ provenance: provenance({ sources: {} }) }));
  });

  it("reports the bad field without echoing submitted content", () => {
    const privateText = "UNEXPECTED_PRIVATE_QUERY";
    try {
      parsePlaceDataset(dataset({ places: [place({ latitude: privateText })] }));
      expect.unreachable("Invalid coordinate should have failed validation");
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetValidationError);
      expect((error as DatasetValidationError).path).toBe("places[0].latitude");
      expect((error as Error).message).not.toContain(privateText);
    }
  });
});

describe("source provenance", () => {
  it("accepts a correctly attributed GeoNames-shaped dataset with manufactured test records", () => {
    const result = parsePlaceDataset(dataset({
      provenance: provenance({ dataset: "geonames", license: "CC-BY-4.0", sources: [source()] }),
      places: [place({ id: "geonames:900000000000001" })]
    }));
    expect(result.provenance.dataset).toBe("geonames");
    expect(result.provenance.license).toBe("CC-BY-4.0");
    expect(result.provenance.sources[0]?.sha256).toBe("0123456789abcdef".repeat(4));
  });

  it.each([
    { dataset: "unknown" }, { license: "CC-BY-4.0" },
    { dataset: "geonames", license: "MIT" }, { attribution: "" }
  ])("rejects unsupported or mismatched provenance %s", (override) => {
    rejects(dataset({ provenance: provenance(override), places: [] }));
  });

  it("requires source receipts for GeoNames data even when there are no place records", () => {
    rejects(dataset({ provenance: provenance({ dataset: "geonames", license: "CC-BY-4.0" }), places: [] }));
  });

  it("rejects two source receipts that claim the same file", () => {
    rejects(dataset({ provenance: provenance({ sources: [source(), source({ sha256: "f".repeat(64) })] }) }));
  });

  it.each(["", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), null])("rejects invalid digest %s", (sha256) => {
    rejects(dataset({ provenance: provenance({ sources: [source({ sha256 })] }) }));
  });

  it.each([
    "file:///tmp/places.tsv", "http://example.invalid/places.tsv", "/places.tsv", "not-a-url",
    "https://reader@example.invalid/places.tsv", "https://reader:example@example.invalid/places.tsv"
  ])("rejects unsafe or non-HTTPS source URL %s", (url) => {
    rejects(dataset({ provenance: provenance({ sources: [source({ url })] }) }));
  });

  it.each(["synthetic:amber-harbour", "geonames:0", "geonames:-1", "geonames:1.5", "geonames:01"])(
    "rejects GeoNames identifier %s without its required positive decimal identity",
    (id) => rejects(dataset({
      provenance: provenance({ dataset: "geonames", license: "CC-BY-4.0", sources: [source()] }),
      places: [place({ id })]
    }))
  );
});
