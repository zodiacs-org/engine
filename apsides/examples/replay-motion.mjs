// Run after `npm run build`: node examples/replay-motion.mjs < result.json
// This compares stored motion samples with the currently installed engine.
// It does not authenticate the input, validate the event search or phase fields,
// install an earlier engine, or establish independent astronomical accuracy.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

process.stdout.on("error", () => { process.exitCode = 1; });
process.stderr.on("error", () => { process.exitCode = 1; });

function requireInput(condition, message) {
  if (!condition) throw new RangeError(message);
}

try {
  requireInput(process.argv.length === 2, "Read completed-result JSON from stdin; this example takes no arguments.");
  let result;
  try {
    result = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    throw new RangeError("stdin must contain a JSON result document.");
  }
  requireInput(result?.status === "complete" && Array.isArray(result.events),
    "Replay requires a completed search result with an events array; refusals are not replayable results.");
  const { calc } = await import("@zodiacs/engine/calc");
  const { AU_KM, DISTANCE_TARGETS } = await import("../.generated/cli/index.js");
  const differentProbes = [];
  let comparedProbes = 0;
  for (const [eventIndex, event] of result.events.entries()) {
    requireInput(event && typeof event.body === "string" && Object.hasOwn(DISTANCE_TARGETS, event.body),
      `Event ${eventIndex} needs a supported body.`);
    for (const name of ["before", "at", "after"]) {
      const probe = event.motion?.[name];
      requireInput(probe && typeof probe === "object" && !Array.isArray(probe),
        `Event ${eventIndex} needs motion.${name}.`);
      requireInput(probe.instant && Number.isFinite(probe.instant.jdTt) &&
        [probe.distanceAu, probe.distanceKm, probe.radialSpeedKmPerSecond,
          probe.orbitalSpeedKmPerSecond].every((value) => typeof value === "number" && Number.isFinite(value)),
      `Event ${eventIndex} motion.${name} needs finite distance, speed and TT fields.`);
      const request = probe.receipt?.request;
      requireInput(request?.body === event.body && request.center === DISTANCE_TARGETS[event.body].center &&
        request.frame === "equatorial-j2000" &&
        isDeepStrictEqual(request.time, { jd: probe.instant.jdTt, scale: "tt" }) &&
        request.flags?.correction === "geometric" && request.flags.speeds === true &&
        request.flags.cartesian === true,
      `Event ${eventIndex} motion.${name} needs its geometric distance receipt request.`);
      // Replay the captured request unchanged. Version labels alone cannot
      // select or authenticate the engine that originally produced a record.
      const replay = calc(request);
      requireInput(replay.status === "ok", `Event ${eventIndex} motion.${name} replay was refused.`);
      const expected = {
        instant: replay.receipt.instants[0],
        distanceAu: replay.dist,
        distanceKm: replay.dist * AU_KM,
        radialSpeedKmPerSecond: replay.speeds.dist * AU_KM / 86_400,
        orbitalSpeedKmPerSecond: Math.hypot(replay.cartesian.vx, replay.cartesian.vy,
          replay.cartesian.vz) * AU_KM / 86_400,
        bounds: replay.bounds,
        receipt: replay.receipt
      };
      const fields = Object.keys(expected).filter((field) => !isDeepStrictEqual(probe[field], expected[field]));
      if (fields.length) differentProbes.push({ eventIndex, body: event.body, probe: name, fields });
      comparedProbes += 1;
    }
  }
  process.exitCode = differentProbes.length ? 1 : 0;
  process.stdout.write(`${JSON.stringify({
    status: differentProbes.length ? "different" : "matching",
    scope: "motion-probes-only", authenticated: false, comparedProbes, differentProbes
  })}\n`);
} catch (error) {
  process.exitCode = error instanceof RangeError ? 2 : 1;
  process.stderr.write(`${JSON.stringify({
    status: "error",
    message: error instanceof RangeError ? error.message
      : "Motion replay could not run. Install local dependencies and run npm run build in apsides/."
  })}\n`);
}
