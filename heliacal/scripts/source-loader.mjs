import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoots = [
  fileURLToPath(new URL("../src/", import.meta.url)),
  fileURLToPath(new URL("../../src/", import.meta.url))
];
const ephemerisUrl = new URL("../node_modules/astronomy-engine/esm/astronomy.js", import.meta.url).href;
const ephemerisMetadata = new URL("../node_modules/astronomy-engine/package.json", import.meta.url);
let ephemerisChecked;

function sourcePath(url) {
  if (!url || !url.startsWith("file:")) return undefined;
  const parsed = new URL(url);
  if (parsed.search || parsed.hash) return undefined;
  const path = fileURLToPath(parsed);
  return sourceRoots.some((root) => {
    const tail = relative(root, path);
    return tail !== "" && tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail);
  }) ? path : undefined;
}

async function checkEphemeris() {
  ephemerisChecked ??= readFile(ephemerisMetadata, "utf8").then((text) => {
    const metadata = JSON.parse(text);
    if (metadata.name !== "astronomy-engine" || metadata.version !== "2.1.19") {
      throw new Error("heliacal requires its local astronomy-engine dependency at exactly 2.1.19.");
    }
  });
  return ephemerisChecked;
}

export async function resolve(specifier, context, nextResolve) {
  const parentIsSource = sourcePath(context.parentURL) !== undefined;
  if (parentIsSource && specifier === "astronomy-engine") {
    await checkEphemeris();
    return { url: ephemerisUrl, shortCircuit: true };
  }

  // First preserve normal JavaScript resolution. Only an absent .js import
  // between the two source trees may fall back to its TypeScript source.
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!parentIsSource || error.code !== "ERR_MODULE_NOT_FOUND" ||
        !(specifier.startsWith("./") || specifier.startsWith("../"))) throw error;
    const target = new URL(specifier, context.parentURL);
    if (!sourcePath(target.href) || !target.pathname.endsWith(".js")) throw error;
    target.pathname = `${target.pathname.slice(0, -3)}.ts`;
    try {
      if (!(await stat(target)).isFile()) throw error;
    } catch (missing) {
      if (missing.code === "ENOENT" || missing.code === "ENOTDIR") throw error;
      throw missing;
    }
    return { url: target.href, shortCircuit: true };
  }
}

export async function load(url, context, nextLoad) {
  if (url === ephemerisUrl) {
    await checkEphemeris();
    // The pinned dependency's import entry is ESM despite its missing type
    // field. Set the known format explicitly, including on Node 22.7.
    return { format: "module", source: await readFile(new URL(url), "utf8"), shortCircuit: true };
  }

  const path = sourcePath(url);
  if (!path || !path.endsWith(".ts") || path.endsWith(".d.ts")) return nextLoad(url, context);
  const result = ts.transpileModule(await readFile(path, "utf8"), {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      sourceMap: false,
      inlineSourceMap: false
    }
  });
  const error = result.diagnostics?.find((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (error) throw new SyntaxError(ts.flattenDiagnosticMessageText(error.messageText, " "));
  return { format: "module", source: result.outputText, shortCircuit: true };
}
