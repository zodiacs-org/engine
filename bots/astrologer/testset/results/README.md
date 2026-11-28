# Test set results

Summaries of `run-mcp.mjs` (see `../tolerance.md`). Each file holds, per check, how many passed and failed and the largest residual, and the server's versions. No expected value and no per-case residual is committed, because the expected values are Swiss Ephemeris output (`AGENTS.md`).

## mcp-engine-2026-11-02.json

Server: zodiacs-org/site PR #868 (`/mcp/engine`, site commit `b06940beb`), run on this machine with `npx vite-node --script scripts/serve-engine-mcp.ts`, Node 22.23.3, host tzdb 2026c, engine 1.1.0-rc.1, astronomy-engine 2.1.19. The 64 charts of `charts.inputs.json`; expected values from Swiss Ephemeris 2.10.03 (pyswisseph) and Python `zoneinfo` over tzdb 2026c, generated 2026-10-26 outside the repository. The engine sheets for `--sheets` came from `facts/cli.ts` at engine commit `a253973`.

```sh
node bots/astrologer/testset/run-mcp.mjs --endpoint http://127.0.0.1:8787/mcp/engine \
  --expect charts.json --sheets sheets.json > results/mcp-engine-2026-11-02.json
```

Result: 2,482 of 2,486 checks pass. All 64 `reading_facts` sheets are byte-identical to the engine CLI's.

The 4 failures are all chart P14 (Berlin, 1890-04-01 12:00, before Germany's standard time): its UTC instant (9 seconds), its Ascendant, its Midheaven and its Placidus cusps. The server reads local mean time at the birthplace's longitude (13.405 degrees east, +0:53:37) and the generator reads tzdb's local mean time for Europe/Berlin (+0:53:28). Without the longitude, `resolve_civil_time` gives the generator's instant, 1890-04-01T11:06:32Z. This is a difference of convention between the two (`TRIAGE.md` R3), not a calculation error. The tolerance is left as it is; the owner decides whether the test set should expect the birthplace's local mean time.

Not covered by this run: a deployed server (it ran locally), JPL Horizons, and the checks `tolerance.md` lists under "What this set does not check".
