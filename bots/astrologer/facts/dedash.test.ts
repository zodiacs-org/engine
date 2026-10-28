import { describe, expect, it } from "vitest";
import { countDashes, dedash } from "./dedash.js";

const fix = (s: string) => dedash(s).text;

describe("dedash", () => {
  it("joins two point names with a hyphen", () => {
    expect(fix("This touches the Moon–Saturn theme.")).toBe("This touches the Moon-Saturn theme.");
    expect(fix("the Sun — Moon loop and the North Node–Ascendant pair")).toBe("the Sun-Moon loop and the North Node-Ascendant pair");
    expect(fix("the Venus\u2012Mars\u2015Jupiter chain")).toBe("the Venus-Mars-Jupiter chain");
  });

  it("writes numeric, date, month and weekday ranges with 'to'", () => {
    expect(fix("in orb 2026-11-01–2026-11-05, exact 2026-11-03.")).toBe("in orb 2026-11-01 to 2026-11-05, exact 2026-11-03.");
    expect(fix("for 3–5 days")).toBe("for 3 to 5 days");
    expect(fix("from 12° – 15° Leo")).toBe("from 12° to 15° Leo");
    expect(fix("November–January")).toBe("November to January");
    expect(fix("Monday—Friday")).toBe("Monday to Friday");
    expect(fix("between 3–5 days")).toBe("between 3 and 5 days");
  });

  it("turns a minus sign before a number into a hyphen-minus", () => {
    expect(fix("a speed of −0.5° per day")).toBe("a speed of -0.5° per day");
  });

  it("turns paired parenthetical dashes into commas", () => {
    expect(fix("Saturn — the ruler of your chart — stations in Aries.")).toBe("Saturn, the ruler of your chart, stations in Aries.");
    expect(fix("Saturn—the ruler of your chart—stations in Aries.")).toBe("Saturn, the ruler of your chart, stations in Aries.");
    expect(fix("It ends with the ruler — Saturn — .")).toBe("It ends with the ruler, Saturn.");
  });

  it("turns a single clause dash into a comma, a colon before a list, or a full stop before a new sentence", () => {
    expect(fix("Keep the week simple — it passes.")).toBe("Keep the week simple, it passes.");
    expect(fix("Three themes stand out — Venus, the Moon and Saturn.")).toBe("Three themes stand out: Venus, the Moon and Saturn.");
    expect(fix("Saturn stations direct — This is the main date.")).toBe("Saturn stations direct. This is the main date.");
    expect(fix("Saturn stations direct, — it is slow.")).toBe("Saturn stations direct, it is slow.");
    expect(fix("A first sentence. A second — with an aside. A third.")).toBe("A first sentence. A second, with an aside. A third.");
  });

  it("treats a dash at the start of a line as a list marker", () => {
    expect(fix("Themes:\n— the Sun\n— the Moon")).toBe("Themes:\n- the Sun\n- the Moon");
  });

  it("hyphenates an unspaced dash between other words", () => {
    expect(fix("a push–pull feeling")).toBe("a push-pull feeling");
  });

  it("leaves URLs, inline code and fenced code blocks alone", () => {
    const md = [
      "See [the chart](https://example.org/a–b?x=1–2) and https://example.org/c—d for detail — briefly.",
      "Run `a – b` here.",
      "```",
      "range 1–3 — kept",
      "```",
      "After the block, Moon–Sun."
    ].join("\n");
    const r = dedash(md);
    expect(r.text).toBe([
      "See [the chart](https://example.org/a–b?x=1–2) and https://example.org/c—d for detail, briefly.",
      "Run `a – b` here.",
      "```",
      "range 1–3 — kept",
      "```",
      "After the block, Moon-Sun."
    ].join("\n"));
    expect(r.before).toBe(2);
    expect(r.after).toBe(0);
    expect(r.protectedDashes).toBe(6);
  });

  it("leaves text without dashes unchanged and is idempotent", () => {
    const plain = "Mercury stations direct 2026-11-13 (plus or minus 1 day) in Scorpio.\n\n- a list item\n";
    expect(fix(plain)).toBe(plain);
    const once = fix("Saturn — the ruler — meets the Moon–Venus pair 3–5 days later — slowly.");
    expect(countDashes(once)).toBe(0);
    expect(fix(once)).toBe(once);
  });
});
