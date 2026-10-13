# Scaffold validation

Session checks used Node 22.22.2 through a local npm exec runtime.

- `npm ci`: passed using the committed lockfile.
- `npm run check`: typecheck, Vitest and build passed.
- `test/scaffold.test.ts`: SDK handshake and synthetic natal receipt round-trip passed.
- `test/isolation.test.ts`: parent engine dry-run pack manifest excludes `mcp/`.
- Dependency audit from `npm ci`: no reported vulnerabilities.
- `git status --short`: changes confined to `mcp/`.

The parent `npm run package:contents` command was attempted and failed because
this checkout lacks `dist/calc.d.ts`. No parent build was run: the task requires
leaving `dist/` untouched. The dry-run pack isolation test passed independently;
it does not substitute for the engine's build-dependent size/content gates.

M3 session: typecheck, Vitest and isolated TypeScript build passed on Node
22.22.2. Contract tests cover input rejection, JSON Schema export, resource
policy boundaries, native receipt preservation and rejection of lossy output.
The existing engine pack isolation test passed. Engine sources, packed files,
archives and parent dist were not changed. Parent build-dependent gates retain
the scaffold limitation described above.
