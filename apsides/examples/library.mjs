// Run after `npm run build`, from apsides/: node examples/library.mjs
// These TT endpoints belong to the registered development window.
process.stdout.on("error", () => { process.exitCode = 1; });
process.stderr.on("error", () => { process.exitCode = 1; });

try {
  if (process.argv.length !== 2) throw new RangeError("This fixed library example takes no arguments.");
  const { searchApsidesWindow } = await import("../.generated/cli/index.js");
  const result = searchApsidesWindow({
    from: { jd: 2_451_544.5, scale: "tt" },
    to: { jd: 2_451_575.5, scale: "tt" },
    bodies: ["Moon", "Mercury", "Earth"],
    syzygyOrbDegrees: 5,
    maxEvaluations: 10_000
  });
  // Keep every event, motion sample and receipt. A refusal has no partial list.
  process.exitCode = result.status === "complete" ? 0 : 3;
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.exitCode = error instanceof RangeError ? 2 : 1;
  process.stderr.write(`${JSON.stringify({
    status: "error",
    message: error instanceof RangeError ? error.message
      : "Library example could not run. Install local dependencies and run npm run build in apsides/."
  })}\n`);
}
