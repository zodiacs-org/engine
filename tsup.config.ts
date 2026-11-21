import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { defineConfig } from "tsup";

// Compact the calc implementation before code splitting. Use ES module syntax
// as written so the public functions retain their names.
// The normal build still emits the shared chunks, module markers and declarations.
export default defineConfig({
  esbuildPlugins: [{
    name: "calc-local-identifiers",
    setup(build) {
      build.onLoad({ filter: /[/\\]src[/\\]calc(?:-[\w-]+)?\.ts$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        const { code } = await transform(source, {
          sourcefile: path,
          loader: "ts",
          target: "esnext",
          tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
          minifyIdentifiers: true,
          minifySyntax: true
        });
        return { contents: code, loader: "js" };
      });
    }
  }]
});
