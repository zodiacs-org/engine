// Render aggregate receipts without changing their historical measurement identity.
export function renderJplMarkdown(report) {
  const lines = ['# JPL inertial reduction validation', '', report.what + '.', '',
    'Command: `' + report.command + '` on ' + report.software.node + '.',
    'Kernel SHA-256: `' + report.kernel.sha256 + '`.',
    'Exact tooling and public input hashes, selection rules, tolerances and TT span are in [jpl-reduction.json](jpl-reduction.json).', '',
    'This compares the independently authored SPK reduction with committed JPL Horizons DE441 responses. Differences include DE440 versus DE441, the truncated NAIF TT/TDB model, and CN versus Horizons LT semantics. Limits are acceptance checks fixed in lib/horizons.mjs before the comparison, not an engine accuracy claim.', '',
    'This historical validation evaluates inertial reduction only. True-of-date frames and relativistic correction implementations were subsequently validated in [frame-validation.md](frame-validation.md); engine charts were measured separately in [bounded-sample.md](bounded-sample.md) and [driver-smoke.md](driver-smoke.md). Swiss transport is implemented, but no live Swiss comparison was run. The aggregate receipt retains the measurement commands, runtime and tooling identities; this markdown includes current project context.', '',
    '| Correction / NAIF target | Compared | Angular max (arcsec) | Range max (km) | Failed angle / range |',
    '| --- | ---: | ---: | ---: | ---: |'];
  for (const [key, group] of Object.entries(report.groups)) {
    lines.push(`| ${key} | ${group.angleArcseconds.n} | ${group.angleArcseconds.maxAbs} | ${group.rangeKm.maxAbs} | ${group.angleArcseconds.failed} / ${group.rangeKm.failed} |`);
  }
  return lines.join('\n') + '\n';
}
