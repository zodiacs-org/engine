import { handleRequest } from "./http.js";

// Only the host API used here, kept local to avoid a runtime types dependency.
declare const Bun: {
  serve(options: { hostname: string; port: number; fetch: typeof handleRequest }): unknown;
};

export { handleRequest };

// Named exports avoid Bun's automatic serving of a default fetch export.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  Bun.serve({ hostname: "127.0.0.1", port: 8787, fetch: handleRequest });
  console.log("Chart HTTP listening on http://127.0.0.1:8787");
}
