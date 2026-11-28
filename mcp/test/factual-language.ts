// Wording regression checks for discovery and synthetic protocol results.
// This focused vocabulary is a review aid, not a semantic proof about prose.
const wordingRules = [
  ["predictive wording", /\b(?:predict(?:s|ed|ing|ions?|ive|ors?|able)?|forecast(?:s|ed|ing|ers?)?|prophes(?:y|ies|ied|ying)|prophe(?:cy|cies|tic))\b/u],
  ["fortune-telling wording", /\b(?:destin(?:y|ies|ed)|fated|soul ?mates?|fortune ?telling|divination)\b/u],
  ["personal outcome claim", /\b(?:you|your (?:life|career|relationship|finances|health)) (?:will|shall|are going to|is going to|can expect|may|might|could)\b/u],
  ["promised outcome", /\b(?:brings?|attracts?|promises?|ensures?) (?:you |your )?(?:love|wealth|success|luck|romance|prosperity|money)\b/u],
  ["financial advice wording", /\b(?:prices?|buy signals?|sell signals?|investment advice|market outlook|profits?|profitable|profitability|financial (?:gain|outlook))\b/u]
] as const;

function normalized(text: string): string {
  return text.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
    .replace(/[_\p{Dash_Punctuation}]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function nativeTimeSource(path: string, value: string): boolean {
  // Preserve the native Earth-rotation source label only in its exact fields.
  // Do not exempt arbitrary prose, a whole receipt, or any other value here.
  const local = path.replace(/^\/(?:structuredContent|content\/\d+\/text\/JSON)(?=\/)/u, "");
  return value === "predicted" && /^\/(?:data\/(?:chart|sky|transit\/natal|synastry\/[ab]|return\/chart)|receipts\/\d+\/envelope\/result)\/(?:deltaT\/segment|timeScale\/ut1MinusUtc\/source)$/u.test(local);
}

const pointerPart = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Inspect values and property names, reporting paths without copying result text. */
export function wordingIssues(value: unknown): string[] {
  const issues: string[] = [];
  function inspect(text: string, path: string, nativeLabel = false) {
    if (nativeLabel && nativeTimeSource(path, text)) return;
    const prose = normalized(text);
    for (const [rule, pattern] of wordingRules) {
      if (pattern.test(prose)) issues.push(`${path || "/"}: ${rule}`);
    }
  }
  function visit(item: unknown, path: string) {
    if (typeof item === "string") {
      // Successful tools repeat their JSON in text content. Inspect that copy
      // independently, including any text block added beside it.
      if (/^\/content\/\d+\/text$/u.test(path)) {
        let parsed: unknown;
        try { parsed = JSON.parse(item); } catch { /* Plain error/prose content. */ }
        if (parsed !== null && typeof parsed === "object") {
          visit(parsed, `${path}/JSON`);
          return;
        }
      }
      inspect(item, path, true);
    } else if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}/${index}`));
    } else if (item !== null && typeof item === "object") {
      for (const [key, entry] of Object.entries(item)) {
        const child = `${path}/${pointerPart(key)}`;
        inspect(key, `${child} (key)`);
        visit(entry, child);
      }
    }
  }
  visit(value, "");
  return issues;
}

/** Include tool titles and descriptions nested inside advertised JSON schemas. */
export function descriptionIssues(value: unknown): string[] {
  const issues: string[] = [];
  function visit(item: unknown, path: string) {
    if (Array.isArray(item)) item.forEach((entry, index) => visit(entry, `${path}/${index}`));
    else if (item !== null && typeof item === "object") {
      for (const [key, entry] of Object.entries(item)) {
        const child = `${path}/${pointerPart(key)}`;
        if ((key === "description" || key === "title") && typeof entry === "string") {
          issues.push(...wordingIssues(entry).map((issue) => `${child}${issue}`));
        } else visit(entry, child);
      }
    }
  }
  visit(value, "");
  return issues;
}
