// Run the private source project without emitting or rebuilding parent dist/.
import { readFile } from "node:fs/promises";
import ts from "typescript";

const ephemeris = new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "astronomy-engine") return nextResolve(ephemeris, context);
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.endsWith(".js") ||
        !(specifier.startsWith(".") || specifier.startsWith("file:"))) throw error;
    return nextResolve(specifier.slice(0, -3) + ".ts", context);
  }
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) return nextLoad(url, context);
  const source = await readFile(new URL(url), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true, sourceMap: false },
    fileName: new URL(url).pathname
  });
  return { format: "module", source: result.outputText, shortCircuit: true };
}
