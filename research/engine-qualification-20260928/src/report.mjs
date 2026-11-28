const safe = value => String(value).replace(/[\r\n|]/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const number = value => typeof value === 'number' ? value.toFixed(4) : 'unavailable';
export function renderReport(report) {
  const lines = ['# Engine candidate qualification report','',`Status: **${safe(report.status)}**. Adapter review is required. No adapter qualification or release is authorized.`, '', `Plan SHA-256: \`${report.planSha256}\``, `Report digest: \`${report.reportDigest}\``, ''];
  if (report.blocker) lines.push(`Blocked at **${safe(report.blocker.stage)}**: ${safe(report.blocker.message)}`, '');
  lines.push('## Checks', '', '| Check | Result |', '| --- | --- |');
  for (const [name, gate] of Object.entries(report.gates)) lines.push(`| ${safe(name)} | ${safe(gate.status)} |`);
  lines.push('');
  if (report.evaluation) {
    lines.push('## Reference residuals', '', 'The table uses the larger absolute longitude/latitude residual for each observed row. Missing rows remain failures. These are known regression cases under the declared reference profile.', '', '| Body | Rows baseline / candidate / expected | Baseline max, arcsec | Candidate max, arcsec | Candidate target exceedances |','| --- | --- | --- | --- | --- |');
    for (const group of report.evaluation.groups) lines.push(`| ${safe(group.body)} | ${group.baseline.observedRows} / ${group.candidate.observedRows} / ${group.candidate.expectedRows} | ${number(group.baseline.statistics?.max)} | ${number(group.candidate.statistics?.max)} | ${group.candidate.targetExceedances} |`);
    lines.push('', `Numerical digest: \`${report.evaluation.numericalDigest}\`. It excludes run timestamps and performance timing; observation epochs remain bound to the results. The full report digest includes execution measurements.`, '');
  }
  if (report.declarations) {
    lines.push('## Declared candidate conventions', '', report.declarations.meaning, '');
    for (const [key, value] of Object.entries(report.declarations.candidate.implementation)) lines.push(`- **${safe(key)}:** ${safe(value)}`);
    lines.push('', 'Declared differences:', '');
    for (const difference of report.declarations.candidate.knownDifferences) lines.push('- ' + safe(difference));
    if (!report.declarations.candidate.knownDifferences.length) lines.push('- None declared; this does not establish exact reference equivalence.');
    lines.push('');
  }
  lines.push('## Limits', '');
  for (const limitation of report.limitations) lines.push('- ' + safe(limitation));
  if (report.checklist.length) { lines.push('', '## Review checklist', ''); for (const item of report.checklist) lines.push('- [ ] ' + safe(item)); }
  return lines.join('\n') + '\n';
}
