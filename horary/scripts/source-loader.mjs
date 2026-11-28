// Checkout-local ESM loader. Transpile in memory; never build or write dist/.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const roots = [new URL("../src/", import.meta.url).href, new URL("../../src/", import.meta.url).href];
const ephemeris = new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href;
const localSource = url => roots.some(root => url.startsWith(root));

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "astronomy-engine" && context.parentURL && localSource(context.parentURL)) {
    return { url: ephemeris, shortCircuit: true };
  }
  if (context.parentURL && specifier.startsWith(".") && specifier.endsWith(".js")) {
    const url = new URL(specifier, context.parentURL).href;
    if (localSource(url)) return { url: url.slice(0, -3) + ".ts", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (localSource(url) && url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    const result = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true }
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
