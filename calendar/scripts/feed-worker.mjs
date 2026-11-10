// A disposable isolate lets disconnects/deadlines interrupt synchronous searches.
import { register } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

register(new URL("./typescript-loader.mjs", import.meta.url));
try {
  const { configureFeed } = await import("../src/cli-config.ts");
  const { streamCalendar, streamSchedule, ScheduleStreamError } = await import("../src/stream.ts");
  const { request, options } = configureFeed(workerData);
  const iterator = streamCalendar(streamSchedule(request), options);
  let pulling = false, finished = false;
  parentPort.on("message", async message => {
    if (message !== "pull" || finished || pulling) return;
    pulling = true;
    try {
      const next = await iterator.next();
      if (next.done) throw new Error("Missing calendar footer.");
      if (next.value === "END:VCALENDAR\r\n") {
        if (!(await iterator.next()).done) throw new Error("Unexpected calendar content after footer.");
        finished = true;
        parentPort.postMessage({ type: "complete", chunk: next.value });
      } else parentPort.postMessage({ type: "chunk", chunk: next.value });
    } catch (error) {
      finished = true;
      const refusal = error instanceof ScheduleStreamError;
      const empty = error instanceof RangeError && error.message === "A calendar requires at least one event.";
      parentPort.postMessage({ type: "error", status: refusal || empty ? 422 : 500,
        reason: refusal ? `Feed search refused (${error.reason}).` : empty ? "No events in the configured range." : "Feed calculation failed." });
    } finally { pulling = false; }
  });
  parentPort.postMessage({ type: "ready" });
} catch {
  parentPort.postMessage({ type: "error", status: 500, reason: "Cannot initialize feed worker." });
}
