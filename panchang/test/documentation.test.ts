import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import ts from "typescript";

it("typechecks every README TypeScript example independently against the source API", () => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  // Virtual files live beside README.md, so its documented relative imports
  // resolve exactly as they do when a reader copies an example there.
  const examples = new Map([...readme.matchAll(/^```ts\n([\s\S]*?)^```/gm)].map((match, i) =>
    [`${project}README.example-${i + 1}.ts`, match[1]! + "\nexport {};\n"]));
  expect(examples.size).toBeGreaterThan(0);
  const config = ts.readConfigFile(`${project}tsconfig.json`, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project);
  expect(config.error).toBeUndefined();
  expect(parsed.errors).toEqual([]);
  const host = ts.createCompilerHost(parsed.options);
  const originalRead = host.readFile;
  const originalExists = host.fileExists;
  const originalSource = host.getSourceFile;
  host.readFile = (path) => examples.get(path) ?? originalRead(path);
  host.fileExists = (path) => examples.has(path) || originalExists(path);
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => {
    const example = examples.get(path);
    return example === undefined ? originalSource(path, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(path, example, languageVersion, true);
  };
  const program = ts.createProgram([...examples.keys()], parsed.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file, getCurrentDirectory: () => project, getNewLine: () => "\n"
  })).toBe("");
}, 15_000);
