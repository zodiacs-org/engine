# The pack's weight in a web page: three ways out

For the owner to decide. Every size and time here is in `results.json` beside
this file (README.md explains how it was measured); accuracy is from the
conformance suite. Nothing here changes the package.

**The problem, in numbers.** Since 1.1.0 the package carries NASA's DE440
tables, and its positions agree with JPL's DE441 to within 0.013 arc seconds
(0.0127) on all 240 position tests of the conformance suite (`conformance/RESULTS.md`). A web page that uses `natalChart` from `@zodiacs/engine` therefore
carries 3,415,068 to 3,417,703 bytes of script under each of the four
bundlers measured, 2,279,479 to 2,281,323 bytes after brotli compression
(app a). For comparison, 1.0.0 gave 74,115 to 76,543 bytes. Switching to the
older ephemeris with `setDefaultEphemeris("astronomy-engine")` does not help:
the tables stay in (app b, 3,415,229 to 3,417,864 bytes). On the "Fast 4G"
setting the browser step would use (1,012,500 bytes a second), downloading
2,279,479 bytes takes at least 2.25 seconds before any script runs; that is
arithmetic from those two numbers, not a measured load time, because no
browser could be run here. In Node, the first chart takes a median 77.37 ms
after a 45.62 ms import.

**Option A: add a light entry, `@zodiacs/engine/core`.** Same functions as
the main entry, computed on the older ephemeris (astronomy-engine), without
the tables. Measured on a prototype: 75,937 to 79,084 bytes (28,537 to 30,163
after brotli), about 0.03 seconds to download on Fast 4G by the same
arithmetic; in Node it imports in 14.29 ms and draws a first chart in 51.11
ms. Accuracy: 48 of the 240 position tests pass at 1 arc second (the main
entry passes 240), and every chart says it came from astronomy-engine.
Nothing breaks for existing callers: the main entry is unchanged. Costs: the
package grows by one more copy of the engine's code (`dist/core.js`, 108,411
bytes unpacked; the archive grows by 32,272 bytes), which is over the package's size cap and needs your
yes to raise it; two existing tests plus the exports:smoke and api:check
steps need teaching about the new entry (README lists them); a page that
loads both entries gets two separate copies, each with its own settings. The
README would say: "Use `@zodiacs/engine/core` where page weight matters more
than sub-arc-second accuracy; it is about 77 KB and computes on
astronomy-engine."

**Option B: make the tables an explicit download, `await loadDe440()`.** The
main entry would start on astronomy-engine and label each result
`de440-unavailable` until the page calls `loadDe440()`, which fetches the
tables as a separate file. Not prototyped. From the measured parts, the first
script would be about A's size, and the tables would arrive as one file of
3,414,614 to 3,444,935 bytes (app e's second file). Expected accuracy, not
measured because B was not built: 48 of 240 until loaded, 240 of 240 after. What breaks: every existing caller that does
not add the new call silently drops from 240 to 48 passing position tests
(labelled, but a change of what the package gives by default), which needs
a new major version and rewrites the README's "DE440 by default" promise.

**Option C: keep the package as it is and publish the numbers.** Add this
measurement to the README, with the recipe of app e: load the engine with
`await import("@zodiacs/engine")` when the chart is needed. Measured: the
page's first script is then 745 to 2,534 bytes under all four bundlers, and
the tables arrive when the chart is asked for, in one file of 3,414,614 to
3,444,935 bytes; every bundler split it correctly. Accuracy stays 240 of
240. Nothing breaks. But a developer who imports the usual way still sees
3.4 MB in their bundle report, and the first chart still waits for the whole
download.

**Recommendation.** A, together with C's README numbers. A and C both give
a developer a small first script without changing anything an existing
caller gets; only A also draws the first chart without waiting for the
2.28 MB (brotli) tables. A's first script is measured at 75,937 to 79,084 bytes against 3,415,068
to 3,417,703, with every result labelled as astronomy-engine's. C
costs nothing and should go in the README whatever you choose, but on its own
leaves the 3.4 MB in front of every developer who has not read it. B gives
the best of both for a page that waits, but it changes what every existing
caller gets by default, which is the one thing this measurement found no
reason to do. Whichever you pick is a new ticket, and A needs your yes to
raise the package's size cap.
