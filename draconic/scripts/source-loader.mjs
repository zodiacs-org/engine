import { readFile } from "node:fs/promises";
import ts from "typescript";

const roots = [new URL("../src/", import.meta.url).href, new URL("../../src/", import.meta.url).href];
const ephemeris = new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href;

function owned(url) {
  return roots.some((root) => url.startsWith(root));
}

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL && owned(context.parentURL)) {
    if (specifier === "astronomy-engine") return { url: ephemeris, shortCircuit: true };
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      const url = new URL(specifier.slice(0, -3) + ".ts", context.parentURL).href;
      if (owned(url)) return { url, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (owned(url) && url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    const result = ts.transpileModule(source, {
      fileName: new URL(url).pathname,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true
      }
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
