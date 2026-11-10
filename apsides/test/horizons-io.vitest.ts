import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { horizonsParameters, horizonsUrl, parseHorizons, fetchHorizons } from "../scripts/horizons.mjs";

const { runCurl } = vi.hoisted(() => ({ runCurl: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => {}, { [Symbol.for("nodejs.util.promisify.custom")]: runCurl })
}));

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const jdList = [2451545, 2451546];
const request = { targetId: "301", centerId: "500@399", jdList };
const params = () => horizonsParameters(request.targetId, request.centerId, request.jdList);

// Synthetic protocol samples only, with exact 3-4-5 geometry. They are not
// astronomical reference data and do not establish ephemeris accuracy.
function response(epochs = jdList): string {
  return [
    "API VERSION: 1.2", "API SOURCE: NASA/JPL Horizons API",
    "Target body name: Synthetic target (301) {source: SYNTHETIC-T}",
    "Center body name: Synthetic origin (399) {source: SYNTHETIC-C}",
    "Center-site name: BODY CENTER",
    "Start time : A.D. 2000-Jan-01 12:00:00.0000 TT",
    "Stop  time : A.D. 2000-Jan-02 12:00:00.0000 TT",
    "Step-size : DISCRETE TIME-LIST",
    "Output units : KM-S", "Output type : GEOMETRIC cartesian states",
    "Output format : 3 (position, velocity, LT, range, range-rate)",
    "Reference frame : ICRF",
    "JDTT , Calendar Date (TT ), X, Y, Z, VX, VY, VZ, LT, RG, RR,",
    "$$SOE",
    ...epochs.map((jd) => `${jd.toFixed(9)}, A.D. 2000-Jan-01 12:00:00.0000, 3, 4, 0, -4, 3, 0, ${5 / 299_792.458}, 5, 0,`),
    "$$EOE", ""
  ].join("\n");
}

describe("Horizons query and response contracts", () => {
  it("uses explicit, canonical geometric TT queries and sorts URL keys", () => {
    const query = params();
    expect(query).toMatchObject({
      format: "text", COMMAND: "301", CENTER: "500@399", OBJ_DATA: "NO",
      MAKE_EPHEM: "YES", EPHEM_TYPE: "VECTORS", VEC_TABLE: "3", VEC_CORR: "NONE",
      OUT_UNITS: "KM-S", REF_SYSTEM: "ICRF", REF_PLANE: "FRAME", CSV_FORMAT: "YES",
      TIME_TYPE: "TT", TLIST_TYPE: "JD", TIME_DIGITS: "FRACSEC",
      TLIST: "'2451545.000000000000' '2451546.000000000000'"
    });
    expect(horizonsParameters(301, 399, jdList)).toEqual(query);
    const url = new URL(horizonsUrl(query));
    expect(url.origin + url.pathname).toBe("https://ssd.jpl.nasa.gov/api/horizons.api");
    expect(url.searchParams.get("COMMAND")).toBe("'301'");
    expect(url.searchParams.get("TLIST")).toBe(query.TLIST);
    expect([...url.searchParams.keys()]).toEqual(Object.keys(query).sort());
    expect(horizonsUrl(Object.fromEntries(Object.entries(query).reverse()))).toBe(url.href);
  });

  it("limits and validates epochs, IDs and conventions before a request", () => {
    expect(() => horizonsParameters("301", "500@399", Array.from({ length: 64 }, (_, i) => 2451545 + i))).not.toThrow();
    for (const invalid of [[], Array(65).fill(2451545), [NaN], [Infinity], [1e9], [1, 1], [2, 1], [2451545, 2451545 + 1e-9], ["2451545"], Array(1)]) {
      expect(() => horizonsParameters("301", "500@399", invalid)).toThrow();
    }
    for (const invalid of ["Moon", "301'", "0301", -1, NaN, null, {}]) {
      expect(() => horizonsParameters(invalid, "500@399", jdList)).toThrow();
    }
    for (const changed of [{ TIME_TYPE: "TDB" }, { EXTRA_PREC: "YES" }, { CENTER: "399" }, { TLIST: "2451545" }]) {
      expect(() => horizonsUrl({ ...params(), ...changed })).toThrow();
    }
  });

  it("preserves raw header, names and solutions while validating scalar geometry", () => {
    const text = response().replaceAll("\n", "\r\n");
    const parsed = parseHorizons(text, request);
    expect(parsed.header).toEqual({
      raw: text.slice(0, text.indexOf("$$SOE")),
      apiVersion: "1.2",
      target: { id: "301", name: "Synthetic target", solution: "SYNTHETIC-T" },
      center: { id: "399", name: "Synthetic origin", solution: "SYNTHETIC-C" },
      units: "KM-S", frame: "ICRF", timeScale: "TT", correction: "NONE"
    });
    expect(parsed.rows).toEqual(jdList.map((jdTt) => ({
      jdTt, positionKm: [3, 4, 0], velocityKmPerSecond: [-4, 3, 0],
      distanceKm: 5, radialSpeedKmPerSecond: 0
    })));
  });

  it.each([
    ["API SOURCE: NASA/JPL Horizons API", "API SOURCE: Different service"],
    ["API VERSION: 1.2", "API VERSION: 99.0"],
    ["(301)", "(302)"], ["(399)", "(10)"],
    ["{source: SYNTHETIC-T}", ""], ["BODY CENTER", "SURFACE LOCATION"],
    ["KM-S", "AU-D"], ["GEOMETRIC cartesian states", "ASTROMETRIC cartesian states"],
    ["Reference frame : ICRF", "Reference frame : Ecliptic of J2000.0"],
    ["0000 TT", "0000 TDB"], ["JDTT", "JDTDB"],
    ["Calendar Date (TT )", "Calendar Date (TDB)"],
    ["DISCRETE TIME-LIST", "60 minutes"], ["VX, VY, VZ", "VX, VZ, VY"],
    ["Target body name:", "Unexpected body name:"],
    ["$$SOE", "$$SOE\n$$SOE"], ["$$EOE", "$$EOE\n$$EOE"],
    ["API VERSION: 1.2", "API VERSION: 1.2\nERROR: no ephemeris"],
    ["Output units : KM-S", "Output units : KM-S\nOutput units : KM-S"]
  ])("rejects changed/missing/duplicate header data: %s", (oldText, replacement) => {
    expect(() => parseHorizons(response().replace(oldText, replacement), request)).toThrow();
  });

  it("rejects missing, additional, duplicate, reordered and misaligned epochs", () => {
    for (const changed of [[2451545], [2451545, 2451546, 2451547], [2451545, 2451545], [2451546, 2451545], [2451545, 2451546.001]]) {
      expect(() => parseHorizons(response(changed), request)).toThrow();
    }
    const printed = response([2451545.123456789]);
    expect(() => parseHorizons(printed, { ...request, jdList: [2451545.1234567894] })).not.toThrow();
  });

  it.each([
    [", 3, 4, 0,", ", NaN, 4, 0,"], [", 3, 4, 0,", ", Infinity, 4, 0,"],
    [", 3, 4, 0,", ", 1e999, 4, 0,"], [", 3, 4, 0,", ", , 4, 0,"],
    [", 3, 4, 0,", ", 0x3, 4, 0,"], [", 3, 4, 0,", ", 30, 4, 0,"],
    [", -4, 3, 0,", ", 4, 3, 0,"], [", 5, 0,", ", 5, 1,"],
    [", 5, 0,", ", -5, 0,"], [", 5, 0,", ", 5, 0, 1,"],
    ["A.D. 2000-Jan-01 12:00:00.0000,", "unlabelled time,"],
    [String(5 / 299_792.458), "1"]
  ])("rejects invalid numbers, CSV or inconsistent vectors: %s", (oldText, replacement) => {
    expect(() => parseHorizons(response().replace(oldText, replacement), request)).toThrow();
  });

  it("rejects oversized responses and service errors", () => {
    expect(() => parseHorizons("x".repeat(2_000_000), request)).toThrow();
    expect(() => parseHorizons('{"error":"No data"}', request)).toThrow();
    expect(runCurl).not.toHaveBeenCalled();
  });
});

describe("explicit immutable Horizons cache", () => {
  let directory: string;

  beforeEach(async () => {
    runCurl.mockReset();
    const generated = fileURLToPath(new URL("../.generated/", import.meta.url));
    await mkdir(generated, { recursive: true });
    directory = await mkdtemp(join(generated, "horizons-io-"));
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  async function seed(text = response()) {
    const query = params();
    const url = horizonsUrl(query);
    const key = digest(url);
    const source = { url, params: query, retrievedAt: "2026-10-15T00:00:00.000Z", responseSha256: digest(text) };
    await writeFile(join(directory, `${key}.txt`), text);
    await writeFile(join(directory, `${key}.json`), JSON.stringify(source));
    return { key, source };
  }

  it("reads valid frozen data offline and retains source metadata", async () => {
    const { source } = await seed();
    expect(await fetchHorizons(params(), { cacheDirectory: directory, offline: true })).toEqual({ text: response(), source });
    expect(runCurl).not.toHaveBeenCalled();
  });

  it("refuses an offline miss without networking", async () => {
    await expect(fetchHorizons(params(), { cacheDirectory: directory, offline: true })).rejects.toThrow("offline cache miss");
    expect(runCurl).not.toHaveBeenCalled();
  });

  it.each(["digest", "query", "partial", "oversized", "symlink", "conventions"])("refuses %s cache corruption without replacement", async (fault) => {
    const { key, source } = await seed();
    if (fault === "digest") await writeFile(join(directory, `${key}.txt`), `${response()}extra`);
    if (fault === "query") await writeFile(join(directory, `${key}.json`), JSON.stringify({ ...source, url: `${source.url}&bad=1` }));
    if (fault === "partial") await rm(join(directory, `${key}.json`));
    if (fault === "oversized") await writeFile(join(directory, `${key}.txt`), "x".repeat(1_900_001));
    if (fault === "symlink") {
      await rm(join(directory, `${key}.txt`));
      await writeFile(join(directory, "actual.txt"), response());
      await symlink("actual.txt", join(directory, `${key}.txt`));
    }
    if (fault === "conventions") {
      const text = response().replace("KM-S", "AU-D");
      await writeFile(join(directory, `${key}.txt`), text);
      await writeFile(join(directory, `${key}.json`), JSON.stringify({ ...source, responseSha256: digest(text) }));
    }
    await expect(fetchHorizons(params(), { cacheDirectory: directory })).rejects.toThrow();
    expect(runCurl).not.toHaveBeenCalled();
  });

  it("serializes requests, caches exact bytes once and never refreshes existing identities", async () => {
    let active = 0;
    let peak = 0;
    runCurl.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { stdout: Buffer.from(response()) };
    });
    const options = { cacheDirectory: directory };
    const [first, second] = await Promise.all([fetchHorizons(params(), options), fetchHorizons(params(), options)]);
    expect(peak).toBe(1);
    expect(runCurl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.source.responseSha256).toBe(digest(response()));
    const files = await readdir(directory);
    expect(files.sort()).toEqual([`${digest(first.source.url)}.json`, `${digest(first.source.url)}.txt`]);
    expect(await readFile(join(directory, `${digest(first.source.url)}.txt`), "utf8")).toBe(response());
    const [command, args, limits] = runCurl.mock.calls[0]!;
    expect(command).toBe("curl");
    expect(args[0]).toBe("--disable");
    expect(args).toContain("zodiacs-apsides-reference/1.0 (+https://github.com/zodiacs-org/engine/tree/main/apsides)");
    expect(args).toContain("45");
    expect(limits).toMatchObject({ timeout: 50_000, maxBuffer: 1_900_000 });
  });

  it("does not freeze a failed response and recovers the serial queue after failure", async () => {
    runCurl.mockResolvedValueOnce({ stdout: Buffer.from("API error") });
    await expect(fetchHorizons(params(), { cacheDirectory: directory })).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
    runCurl.mockResolvedValueOnce({ stdout: Buffer.from(response()) });
    await expect(fetchHorizons(params(), { cacheDirectory: directory })).resolves.toMatchObject({ text: response() });
  });
});
