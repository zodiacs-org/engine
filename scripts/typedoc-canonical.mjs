import { Comment, Converter, PageEvent, ReflectionKind } from "typedoc";

const DOCS_BASE = "https://zodiacs.org/developers/engine/reference/";

export function load(application) {
  application.converter.on(Converter.EVENT_RESOLVE, (_context, reflection) => {
    if (reflection.kind !== ReflectionKind.Module || reflection.name !== "core") return;
    reflection.comment ??= new Comment([
      { kind: "code", text: "`@zodiacs/engine/core`" },
      {
        kind: "text",
        text: " exports the root API, defaults to astronomy-engine, and ships without the DE440 pack.",
      },
    ]);
  });

  application.renderer.on(PageEvent.END, (page) => {
    if (!page.contents) return;
    const canonical = page.url === "index.html" ? DOCS_BASE : new URL(page.url, DOCS_BASE).href;
    const metadata =
      `<link rel="canonical" href="${canonical}"/>` +
      '<meta name="robots" content="noindex,follow"/>';
    page.contents = page.contents
      .replace(/<link\s+rel="canonical"[^>]*\/?\s*>/giu, "")
      .replace("<head>", `<head>${metadata}`);
  });
}
