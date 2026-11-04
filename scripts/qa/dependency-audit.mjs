import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const baseline = JSON.parse(readFileSync(new URL('./dependency-baseline.json', import.meta.url)));
let failed = false;
for (const project of ['backend', 'frontend']) {
  const result = spawnSync('npm', ['audit', '--json'], { cwd: project, encoding: 'utf8' });
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw new Error(`${project}: npm audit returned invalid JSON (${result.status})`); }
  if (result.error || report.error || !report.metadata || result.status === null) throw new Error(`${project}: npm audit unavailable`);
  console.log(`${project} vulnerability counts: ${JSON.stringify(report.metadata.vulnerabilities)}`);
  for (const item of Object.values(report.vulnerabilities || {})) {
    for (const advisory of item.via.filter(v => typeof v === 'object')) {
      const key = `${item.name}:${advisory.source}:${advisory.severity}`;
      const blocked = ['high', 'critical'].includes(advisory.severity) && !baseline[project].includes(key);
      console.log(`${blocked ? 'BLOCKED' : 'KNOWN/REPORTED'} ${key} ${advisory.url} affected=${advisory.range}`);
      failed ||= blocked;
    }
  }
}
if (failed) process.exitCode = 1;
