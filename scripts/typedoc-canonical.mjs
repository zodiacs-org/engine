import { PageEvent } from "typedoc";

const DOCS_BASE = "https://zodiacs.org/sdk/engine/";

/** TypeDoc plugin: canonicalize every generated page without hand-editing output. */
export function load(application) {
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
