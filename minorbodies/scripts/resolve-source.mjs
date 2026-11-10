import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const engineSource = new URL("../../src/", import.meta.url).href;
const companionSource = new URL("../", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(engineSource) && specifier === "astronomy-engine") {
    return nextResolve(new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href, context);
  }
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    const candidate = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
    if (candidate.href.startsWith(engineSource) || candidate.href.startsWith(companionSource)) {
      try { await access(fileURLToPath(candidate)); }
      catch { return nextResolve(specifier, context); }
      return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}
