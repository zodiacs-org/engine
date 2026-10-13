import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { buildGeoNamesIndex } from "../src/build-index.js";
import { createGeocoder } from "../src/geocoder.js";
import type { GeocodeRequest, Geocoder } from "../src/geocoder.js";
import { createGeocodeServer } from "../src/http-server.js";
import type { GeocodeHttpServer } from "../src/http-server.js";
import { loadPlaceIndex } from "../src/load-index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const command = join(project, "bin", "server.mjs");
let temporary: string;
let indexDirectory: string;
let geocoder: Geocoder;
const services: GeocodeHttpServer[] = [];
const children: ChildProcess[] = [];

// Invented queries and clock readings against the attributed GeoNames sample.
// Comparisons establish transport fidelity, not independent time accuracy.
beforeAll(async () => {
  await mkdir(join(project, ".tmp"), { recursive: true });
  temporary = await mkdtemp(join(project, ".tmp", "http-service-"));
  indexDirectory = join(temporary, "index");
  const receipt = JSON.parse(await readFile(join(project, "data", "sample-receipt.json"), "utf8")) as {
    outputs: Array<{ file: string; sha256: string }>;
  };
  function source(file: string) {
    return {
      path: join(project, "data", file), url: "https://download.geonames.org/export/dump/",
      expectedSha256: receipt.outputs.find((entry) => entry.file === file)!.sha256
    };
  }
  await buildGeoNamesIndex({
    places: source("geonames-sample.tsv"), countries: source("country-info-sample.tsv"),
    admin1: source("admin1-sample.tsv"), outputDirectory: indexDirectory
  });
  geocoder = createGeocoder(await loadPlaceIndex(indexDirectory), loadAtlasTimeProvider());
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(services.splice(0).map((service) => service.close()));
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const finished = once(child, "exit");
    child.kill("SIGKILL");
    await finished;
  }
});
afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

describe("sample HTTP atlas and IANA composition", () => {
  it.each([
    { query: "Brest, France", date: "1885-06-01", time: "12:00" },
    { query: "Paris, France", date: "1911-03-10", time: "23:55" },
    { placeId: "geonames:5128581", date: "1918-03-31", time: "02:30" },
    { query: "Paris, France", date: "1920-01-01", time: "12:00" },
    { query: "Kathmandu", date: "2001-06-15", time: "08:30" },
    { query: "Kolkata", date: "2001-06-15", time: "08:30" },
    { query: "Longyearbyen", date: "2001-06-15", time: "08:30" }
  ])("preserves the composed answer for $query $placeId $date $time", async (input) => {
    const service = createGeocodeServer(geocoder);
    services.push(service);
    const { port } = await service.start();
    const response = await fetch(`http://127.0.0.1:${port}/tz`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
    });
    expect(response.status).toBe(200);
    const actual = await response.json();
    const expected = await geocoder.resolve(input as GeocodeRequest);
    expect(actual).toEqual(JSON.parse(JSON.stringify(expected)));
    if (expected.status === "time-result" && expected.time.provider === "atlas") {
      expect(actual).toHaveProperty("time.provenance.citations");
      expect(actual).toHaveProperty("time.resolution.instants.0.uncertainty");
    }
  });

  it("retains atlas answers when Intl is unavailable", async () => {
    const service = createGeocodeServer(geocoder);
    services.push(service);
    const { port } = await service.start();
    const input = { query: "Brest, France", date: "1885-06-01", time: "12:00" };
    const expected = JSON.parse(JSON.stringify(await geocoder.resolve(input)));
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Synthetic Intl failure"); });
    const response = await fetch(`http://127.0.0.1:${port}/tz`, {
      method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(input)
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("optional service launcher", () => {
  it("provides help without an index or opening network entry points", () => {
    const guard = fileURLToPath(new URL("./fixtures/no-network.mjs", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", guard, command, "--help"], { encoding: "utf8", cwd: temporary });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("GET /lookup");
    expect(result.stdout).toContain("POST /tz");
  });

  it.each([
    [], ["--index"], ["--index", "PRIVATE", "--port", "1e1"],
    ["--index", "PRIVATE", "--port", "65536"], ["--index", "https://PRIVATE/index"],
    ["--index", "PRIVATE", "--index", "PRIVATE"], ["--index", "PRIVATE", "--unknown"],
    ["--help", "--index", "PRIVATE"], ["--index", "PRIVATE", "positional"],
    ...["--burst", "--max-clients", "--max-concurrent", "--max-connections", "--idle-client-ms", "--cleanup-interval-ms"]
      .flatMap((flag) => ["0", "1.5", "1e2", "100000000"].map((value) => ["--index", "PRIVATE", flag, value])),
    ...["0", "0.0001", "Infinity", "1e2", "1000001"].map((value) => ["--index", "PRIVATE", "--refill-per-second", value]),
    ...["*", "localhost", "127.0.0.0/8", "127.0.0.1,", "127.0.0.1:80", "fe80::1%eth0"]
      .map((value) => ["--index", "PRIVATE", "--trusted-proxies", value]),
    ["--index", "PRIVATE", "--burst", "1", "--burst", "2"]
  ].map((args) => ({ args })))("refuses malformed launcher arguments %# privately", ({ args }) => {
    const result = spawnSync(process.execPath, [command, ...args], { encoding: "utf8", cwd: temporary });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toHaveProperty("error.code", "invalid-input");
    expect(result.stderr).not.toContain("PRIVATE");
  });

  it("reports startup failures without a local path or raw exception", () => {
    const result = spawnSync(process.execPath, [command, "--index", join(temporary, "PRIVATE-missing")], { encoding: "utf8", cwd: temporary });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toHaveProperty("error.code", "startup-error");
    expect(result.stderr).not.toContain("PRIVATE");
    expect(result.stderr).not.toContain(temporary);
  });

  it.each(["SIGTERM", "SIGINT"] as const)("starts explicitly on loopback and stops on %s", async (signal) => {
    const child = spawn(process.execPath, [command, "--index", indexDirectory,
      "--burst", "1", "--refill-per-second", "0.001", "--max-clients", "2", "--max-concurrent", "1",
      "--max-connections", "4", "--idle-client-ms", "1000", "--cleanup-interval-ms", "100",
      "--trusted-proxies", "::ffff:127.0.0.1"], {
      cwd: temporary, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TZ: "Pacific/Auckland" }
    });
    children.push(child);
    let stdout = "";
    let stderr = "";
    child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const address = await new Promise<{ address: string; port: number }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Launcher did not start")), 5000);
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", () => { clearTimeout(timeout); reject(new Error("Launcher exited before startup")); });
      child.stdout!.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (!stdout.includes("\n")) return;
        clearTimeout(timeout);
        try { resolve((JSON.parse(stdout.trim()) as { address: { address: string; port: number } }).address); }
        catch (error) { reject(error); }
      });
    });
    expect(address.address).toBe("127.0.0.1");
    const response = await fetch(`http://127.0.0.1:${address.port}/lookup?query=Brest&country=FR`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...geocoder.lookup("Brest", { country: "FR" }), provenance: geocoder.provenance });
    const limited = await fetch(`http://127.0.0.1:${address.port}/lookup?query=Brest`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("1000");
    expect(await limited.json()).toHaveProperty("error.code", "rate-limited");
    const other = await fetch(`http://127.0.0.1:${address.port}/lookup?query=Brest`, { headers: { "X-Forwarded-For": "192.0.2.1" } });
    expect(other.status).toBe(200);
    await other.json();
    const exited = once(child, "exit");
    child.kill(signal);
    expect(await exited).toEqual([0, null]);
    expect(stderr).toBe("");
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(stdout).not.toContain("Brest");
    await expect(fetch(`http://127.0.0.1:${address.port}/lookup?query=Brest`)).rejects.toThrow();
  });
});
