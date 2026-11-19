// Shared by every app: records what was computed and marks the moment the
// first chart (or result) is on the page, for the browser timing step. In
// Node, where there is no document, it only records.
export function report(app, value) {
  globalThis.__bundleWeight = { app, value };
  if (typeof document !== "undefined") {
    const out = document.createElement("pre");
    out.id = "result";
    out.textContent = JSON.stringify(value);
    document.body.append(out);
  }
  if (typeof performance !== "undefined" && typeof performance.mark === "function") performance.mark("first-chart");
}
