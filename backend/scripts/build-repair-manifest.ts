import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { buildRepairManifest } from './repair-manifest-builder';
import {
  repairManifestCsv,
  repairManifestMarkdown,
  repairManifestTerminalSummary,
} from './repair-manifest-output';

function usage() {
  return [
    'Użycie:',
    '  npm run duplicates:repair-plan -- --analysis reports/duplicate-analysis-YYYYMMDD-HHMMSS/duplicate-analysis.json',
    '',
    'Skrypt czyta wyłącznie plik JSON. Nie łączy się z bazą i nie wykonuje żadnych zmian danych.',
  ].join('\n');
}

function parseArguments(argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (argv.length !== 2 || argv[0] !== '--analysis' || !argv[1]) {
    throw new Error(`Nieprawidłowe argumenty.\n${usage()}`);
  }
  return argv[1];
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function main() {
  const analysisArgument = parseArguments(process.argv.slice(2));
  const analysisPath = await fs.realpath(path.resolve(process.cwd(), analysisArgument));
  if (path.basename(analysisPath) !== 'duplicate-analysis.json') {
    throw new Error('Plik wejściowy musi nazywać się duplicate-analysis.json.');
  }

  const source = await fs.readFile(analysisPath, 'utf8');
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    throw new Error('Plik duplicate-analysis.json nie zawiera prawidłowego JSON.');
  }

  const now = new Date();
  const manifest = buildRepairManifest(input, {
    generatedAt: now.toISOString(),
    analysisFile: analysisPath,
    analysisSha256: createHash('sha256').update(source).digest('hex'),
  });
  const outputDirectory = path.resolve(
    __dirname,
    '..',
    'reports',
    `repair-plan-${timestampForPath(now)}`,
  );
  await fs.mkdir(path.dirname(outputDirectory), { recursive: true });
  await fs.mkdir(outputDirectory, { recursive: false });
  await Promise.all([
    fs.writeFile(
      path.join(outputDirectory, 'repair-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    ),
    fs.writeFile(
      path.join(outputDirectory, 'repair-summary.md'),
      repairManifestMarkdown(manifest),
      'utf8',
    ),
    fs.writeFile(
      path.join(outputDirectory, 'repair-summary.csv'),
      repairManifestCsv(manifest),
      'utf8',
    ),
  ]);
  process.stdout.write(repairManifestTerminalSummary(manifest, outputDirectory));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
