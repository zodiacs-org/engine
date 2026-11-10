import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { runCli } from "../src/cli.js";
import { catalog, findStar, starPositions } from "../src/index.js";
import { gastHours, onChartClock, parseNatalEnvelope } from "../src/engine.js";

const executable = fileURLToPath(new URL("../bin/fixedstars.mjs", import.meta.url));
const utc = "2000-03-20T06:00:00Z";
const from = "2000-03-20T00:00:00Z", to = "2000-03-21T00:00:00Z";
const natal = ["hits", "--utc", utc, "--conjunction-deg", "180", "--parallel-deg", "180", "--star", "Spica"];
const parans = ["parans", "--from", from, "--to", to, "--latitude", "0", "--longitude", "0",
  "--orb-ms", "86400000", "--star", "Spica", "--body", "Sun"];
const spica = findStar("Spica")!;

function invoke(argv: string[], timeZone = "UTC") {
  const child = spawnSync(process.execPath, [executable, ...argv], {
    // Every command must resolve the checkout relative to its own files.
    cwd: tmpdir(), encoding: "utf8", timeout: 30_000, maxBuffer: 4_000_000,
    env: { ...process.env, TZ: timeZone }
  });
  if (child.error) throw child.error;
  expect(child.signal).toBeNull();
  return { code: child.status, stdout: child.stdout, stderr: child.stderr };
}
function success(argv: string[]) {
  const child = invoke(argv);
  expect(child.code).toBe(0);
  expect(child.stderr).toBe("");
  expect(child.stdout.endsWith("\n")).toBe(true);
  const result = JSON.parse(child.stdout);
  expect(result.schema).toBe("fixedstars-cli/1");
  expect(result.command).toBe(argv[0]);
  expect(result.status).toBe("complete");
  return result;
}

describe("fixedstars executable with synthetic inputs", () => {
  it("lists the committed licensed catalog and retains astrometry, source locators and historical labels", () => {
    const result = success(["list"]);
    expect(result.stars).toEqual(catalog);
    const selected = success(["list", "--star", "HIP 65474", "--star=Regulus"]);
    expect(selected.stars.map((star: { id: string }) => star.id)).toEqual([spica.id, findStar("Regulus")!.id]);
    expect(selected.stars[0].historicalAttributions.every((lore: { status: string }) => lore.status === "historical-attribution")).toBe(true);
    expect(selected.stars[0].frame).toBe("j2000-mean-equator-equinox");
  });

  it("includes every body and available angle contact under a half-circle orb and keeps a readable native receipt", () => {
    const result = success([...natal, "--latitude", "12", "--longitude", "30", "--house-system", "equal"]);
    const targets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
      "North Node", "South Node", "Ascendant", "Midheaven", "Descendant", "Imum Coeli"];
    expect(result.result.targets.map((target: { targetId: string }) => target.targetId)).toEqual(targets);
    // Shortest longitude arcs and signed-declination differences cannot exceed
    // a half circle. Thus both kinds must match each available target once.
    expect(result.result.hits.map((hit: { targetId: string; kind: string }) => `${hit.targetId}/${hit.kind}`).sort()).toEqual(
      targets.flatMap((target) => [`${target}/conjunction`, `${target}/parallel`]).sort());
    for (const hit of result.result.hits) {
      expect(hit.starId).toBe(spica.id);
      expect(hit.maximumOrbDeg).toBe(180);
      expect(hit.orbDeg).toBeGreaterThanOrEqual(0);
      expect(hit.orbDeg).toBeLessThanOrEqual(180);
    }
    const parsed = parseNatalEnvelope(JSON.stringify(result.result.natal));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope.receipt.houses).toMatchObject({ requested: "equal", actual: "equal" });
    expect(result.result.conventions.receiptScope).toContain("covers-chart-only");
  });

  it("retains selected clocks and pins while suppressing unavailable angles and allowing a complete empty result", () => {
    const result = success([...natal, "--latitude", "-12", "--longitude=-30", "--time-known", "false",
      "--time-scale", "tt", "--delta-t", "0"]);
    expect(result.result.targets.every((target: { targetKind: string }) => target.targetKind === "body")).toBe(true);
    expect(result.result.natal.receipt.houses.absenceReason).toBe("unknown-time");
    expect(result.result.stellar.timeBasis.ttDays).toBe((Date.parse(utc) - Date.parse("2000-01-01T12:00:00Z")) / 86_400_000);
    expect(result.result.natal.result.deltaT.model).toBe("pinned");
    expect(result.result.natal.result.deltaT.seconds).toBe(0);
    expect(success(natal).result.targets.every((target: { targetKind: string }) => target.targetKind === "body")).toBe(true);
    const empty = success(["hits", "--utc", utc, "--conjunction-deg", "none", "--parallel-deg", "none"]);
    expect(empty.result.hits).toEqual([]);
    expect(empty.result.orbs).toEqual({ conjunctionDeg: null, parallelDeg: null });
    expect(empty.result.stellar.positions.map((star: { starId: string }) => star.starId)).toEqual(catalog.map(({ id }) => id));
  });

  it("keeps disabled contact kinds independent and treats zero as an explicit orb", () => {
    const conjunctions = success(["hits", "--utc", utc, "--conjunction-deg", "180", "--parallel-deg", "none", "--star", "Spica"]);
    expect(conjunctions.result.hits).toHaveLength(conjunctions.result.targets.length);
    expect(conjunctions.result.hits.every((hit: { kind: string }) => hit.kind === "conjunction")).toBe(true);
    const exact = success(["hits", "--utc", utc, "--conjunction-deg", "0", "--parallel-deg", "none", "--star", "Spica"]);
    expect(exact.result.orbs.conjunctionDeg).toBe(0);
    expect(exact.result.hits.every((hit: { orbDeg: number }) => hit.orbDeg === 0)).toBe(true);
  });

  it("returns every interior star/body event pair under a whole-window orb with stable call indices and native conventions", () => {
    const result = success([...parans, "--body", "Moon", "--star-max-samples", "unlimited",
      "--body-max-samples", "10000", "--height", "50", "--body-limb", "lower",
      "--star-refraction", "none", "--body-refraction", "standard"]).result;
    expect(result.stars).toHaveLength(1);
    expect(result.bodies.map((body: { sky: { body: string } }) => body.sky.body)).toEqual(["Moon", "Sun"]);
    expect(result.observer).toEqual({ latitude: 0, longitude: 0, height: 50 });
    const expected: string[] = [];
    for (const star of result.stars) for (const event of star.events) {
      expect(Date.parse(event.at)).toBeGreaterThanOrEqual(Date.parse(from));
      expect(Date.parse(event.at)).toBeLessThan(Date.parse(to));
      for (const body of result.bodies) for (const target of body.sky.events) {
        expected.push(`${star.starId}/${body.sky.body}/${event.kind}/${event.at}/${target.kind}/${target.at}`);
      }
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(result.hits.map((hit: { starId: string; targetId: string; starEvent: string; starAt: string; targetEvent: string; targetAt: string }) =>
      `${hit.starId}/${hit.targetId}/${hit.starEvent}/${hit.starAt}/${hit.targetEvent}/${hit.targetAt}`).sort()).toEqual(expected.sort());
    for (const hit of result.hits) {
      const offset = BigInt(Date.parse(hit.starAt)) - BigInt(Date.parse(hit.targetAt));
      expect(hit.offsetMs).toBe(Number(offset));
      expect(hit.orbMs).toBe(Number(offset < 0 ? -offset : offset));
      expect(result.stars[hit.provenance.starSearch].starId).toBe(hit.starId);
      expect(result.bodies[hit.provenance.bodySearch].sky.body).toBe(hit.targetId);
    }
    expect(result.stars[0].provenance.request.options.maxSamples).toBe("unlimited");
    expect(result.stars[0].conventions).toMatchObject({ limb: "centre", refraction: "none" });
    for (const body of result.bodies) {
      expect(body.sky.conventions).toMatchObject({ limb: "lower", refraction: "standard" });
      expect(body.provenance.request.options.maxSamples).toBe(10000);
      expect(body.provenance.nativeReceipt).toBe(false);
      expect(body.provenance.engine.name).toBe("@zodiacs/engine");
    }
  });

  it("finds a catalog star on the upper meridian at a constructed synthetic angle anchor", () => {
    const t = Date.parse(utc);
    const ra = starPositions({ utc }, [spica]).positions[0]!.raDeg!;
    // H = GAST*15 + east longitude - RA. Choose longitude so H=0;
    // a non-polar star is then at upper transit. This is construction evidence.
    const longitude = onChartClock(t, "utc", undefined, (time) => ((ra - gastHours(time) * 15 + 540) % 360) - 180);
    const result = success(["parans", "--from", new Date(t - 60_000).toISOString(), "--to", new Date(t + 60_000).toISOString(),
      "--latitude", "0", "--longitude", String(longitude), "--orb-ms", "2", "--star", "Spica", "--bodies", "none",
      "--angle", `Midheaven@${utc}`, "--star-refraction", "none"]).result;
    expect(result.bodies).toEqual([]);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({ starId: spica.id, targetId: "Midheaven", targetKind: "angle",
      starEvent: "upper-transit", targetEvent: "upper-transit", provenance: { starSearch: 0, bodySearch: null } });
    expect(Math.abs(Date.parse(result.hits[0].starAt) - t)).toBeLessThanOrEqual(2);
    expect(result.hits[0].targetAt).toBe(new Date(t).toISOString());
  });

  it.each(["star", "body"])("uses a distinct refusal exit code for a %s budget and retains every selected call", (subject) => {
    const child = invoke([...parans, `--${subject}-max-samples`, "1"]);
    expect(child.code).toBe(3);
    expect(child.stderr).toBe("");
    const output = JSON.parse(child.stdout);
    expect(output.status).toBe("refused");
    expect(output.result).toMatchObject({ status: "refused", reason: "sample-budget", hits: [] });
    expect(output.result.stars).toHaveLength(1);
    expect(output.result.bodies).toHaveLength(1);
    const refused = subject === "star" ? output.result.stars[0] : output.result.bodies[0].sky;
    const completed = subject === "star" ? output.result.bodies[0].sky : output.result.stars[0];
    expect(refused).toMatchObject({ status: "refused", events: [] });
    expect(completed.status).toBe("complete");
  });

  it("returns a complete empty paran set for an explicit empty target selection", () => {
    const result = success([...parans.slice(0, -2), "--bodies", "none"]).result;
    expect(result.hits).toEqual([]);
    expect(result.bodies).toEqual([]);
    expect(result.stars[0].status).toBe("complete");
  });

  it("accepts equivalent offset spellings and behaves the same across host time zones", () => {
    const args = ["hits", "--utc", "2000-03-20T08:00:00+02:00", "--conjunction-deg", "none", "--parallel-deg", "none", "--star", "Spica"];
    expect(invoke(args, "Pacific/Honolulu")).toEqual(invoke(args, "Asia/Bangkok"));
    expect(JSON.parse(invoke(args).stdout).result.natal.receipt.instant).toBe(new Date(utc).toISOString());
  });

  it.each([["--help"], ["list", "--help"], ["hits", "--help"], ["parans", "--help"]])("provides help for %j", (...argv) => {
    const child = invoke(argv);
    expect(child.code).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout).toContain("fixedstars list");
    expect(child.stdout).toContain("--orb-ms");
  });
});

describe("strict CLI input and failure semantics", () => {
  const invalid: string[][] = [
    [], ["unknown"], ["list", "Spica"], ["list", "-h"], ["list", "--help", "--star", "Spica"],
    ["list", "--star"], ["list", "--star="], ["list", "--star", "  "], ["list", "--star", "missing"],
    ["list", "--star", "Spica", "--star", "HIP 65474"], ["list", "--utc", utc],
    ["hits", "--utc", utc, "--conjunction-deg", "1"], ["hits", "--utc", "2000-02-30", "--conjunction-deg", "1", "--parallel-deg", "1"],
    [...natal, "--utc", utc], [...natal, "--latitude", "12"], [...natal, "--latitude", "91", "--longitude", "0"],
    [...natal, "--latitude", "0x10", "--longitude", "0"], [...natal, "--latitude", "1e1", "--longitude", "0"],
    [...natal, "--latitude", "NaN", "--longitude", "0"], [...natal, "--time-known", "yes"],
    [...natal, "--house-system", "unknown"], [...natal, "--time-scale", "tai"], [...natal, "--delta-t", "Infinity"],
    ["hits", "--utc=2000-03-20T06:00:00", "--conjunction-deg", "1", "--parallel-deg", "1"], [...natal, "--height", "0"],
    ["hits", "--utc", utc, "--conjunction-deg", "-1", "--parallel-deg", "none"],
    ["hits", "--utc", utc, "--conjunction-deg", "180.01", "--parallel-deg", "none"],
    [...parans, "--orb-seconds", "1"], [...parans, "--body", "North Node"], [...parans, "--body", "Sun"],
    [...parans, "--bodies", "none"], [...parans, "--body-limb", "center"], [...parans, "--body", "Pluto", "--body-limb", "upper"],
    [...parans, "--star-refraction", "bad"], [...parans, "--star-max-samples", "0"], [...parans, "--body-max-samples", "1.5"],
    [...parans, "--body-max-samples", "9007199254740992"], [...parans, "--star-max-samples", "Infinity"],
    [...parans, "--height", "100001"], [...parans, "--time-scale", "tt"], [...parans, "--delta-t", "0"],
    [...parans, "--angle", `Vertex@${utc}`], [...parans, "--angle", "Midheaven"], [...parans, "--angle", `Midheaven@${to}`],
    [...parans, "--angle", `Midheaven@${utc}`, "--angle", "Midheaven@2000-03-20T08:00:00+02:00"],
    parans.slice(0, -2),
    ["parans", "--from", to, "--to", from, "--latitude", "0", "--longitude", "0", "--orb-ms", "0", "--bodies", "none"],
    ["parans", "--from", from, "--to", to, "--latitude", "0", "--longitude", "0", "--orb-ms", "-0.1", "--bodies", "none"]
  ];
  it.each(invalid.map((argv) => [JSON.stringify(argv), argv] as const))("refuses %s with structured diagnostics and no partial stdout", (_label, argv) => {
    const child = invoke([...argv]);
    expect(child.code).toBe(2);
    expect(child.stdout).toBe("");
    expect(JSON.parse(child.stderr)).toMatchObject({ schema: "fixedstars-cli/1", status: "error", error: { code: "invalid-input" } });
  });

  it("validates a malformed sky request before Node preparation and classifies preparation failures as runtime", async () => {
    const prepareSky = vi.fn(async () => { throw new RangeError("incompatible engine source"); });
    const bad = await runCli([...parans, "--star-refraction", "invalid"], { prepareSky });
    expect(bad.exitCode).toBe(2);
    expect(prepareSky).not.toHaveBeenCalled();
    const failure = await runCli(parans, { prepareSky });
    expect(failure.exitCode).toBe(1);
    expect(failure.stdout).toBe("");
    expect(JSON.parse(failure.stderr)).toMatchObject({ command: "parans", error: { code: "runtime", message: "incompatible engine source" } });
    const list = await runCli(["list", "--star", "Spica"], { prepareSky });
    expect(list.exitCode).toBe(0);
    const hits = await runCli(natal, { prepareSky });
    expect(hits.exitCode).toBe(0);
    expect(prepareSky).toHaveBeenCalledTimes(1);
  });
});
