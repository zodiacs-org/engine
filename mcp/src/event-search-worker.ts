import { parentPort, workerData } from "node:worker_threads";
import { eventSearchTool } from "./tools/events.js";

if (!parentPort) throw new Error("Event search worker requires a parent port.");

try {
  parentPort.postMessage({ type: "started" });
  parentPort.postMessage({ type: "result", result: eventSearchTool(workerData) });
} catch {
  // Engine and validation errors may contain submitted values. Keep them local.
  parentPort.postMessage({ type: "failure" });
} finally {
  parentPort.close();
}
