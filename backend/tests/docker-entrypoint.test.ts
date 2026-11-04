import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const entrypointSource = path.resolve(__dirname, '../docker-entrypoint.sh');

function runEntrypoint(skipDbSeed?: string): string[] {
  const root = mkdtempSync(path.join(tmpdir(), 'wtt-entrypoint-test-'));
  const prismaBin = path.join(root, 'node_modules/.bin');
  const fakeBin = path.join(root, 'bin');
  const logFile = path.join(root, 'calls.log');
  const entrypoint = path.join(root, 'docker-entrypoint.sh');

  try {
    mkdirSync(prismaBin, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    copyFileSync(entrypointSource, entrypoint);
    chmodSync(entrypoint, 0o755);

    writeFileSync(
      path.join(prismaBin, 'prisma'),
      '#!/bin/sh\nprintf "prisma:%s\\n" "$*" >> "$ENTRYPOINT_TEST_LOG"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(fakeBin, 'node'),
      '#!/bin/sh\nprintf "node:%s\\n" "$*" >> "$ENTRYPOINT_TEST_LOG"\n',
      { mode: 0o755 },
    );

    const env = { ...process.env, ENTRYPOINT_TEST_LOG: logFile, PATH: `${fakeBin}:${process.env.PATH ?? ''}` };
    delete env.SKIP_DB_SEED;
    if (skipDbSeed !== undefined) env.SKIP_DB_SEED = skipDbSeed;

    const result = spawnSync('sh', [entrypoint], { cwd: root, env, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return readFileSync(logFile, 'utf8').trim().split('\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('backend Docker entrypoint seed control', () => {
  it('runs migrations and starts the API but skips seed when explicitly enabled', () => {
    expect(runEntrypoint('true')).toEqual(['prisma:migrate deploy', 'node:dist/index.js']);
  });

  it('preserves the existing migration, seed, and API startup sequence when unset', () => {
    expect(runEntrypoint()).toEqual([
      'prisma:migrate deploy',
      'node:dist/prisma/seed.js',
      'node:dist/index.js',
    ]);
  });

  it('runs the seed unless the value is exactly true', () => {
    expect(runEntrypoint('false')).toEqual([
      'prisma:migrate deploy',
      'node:dist/prisma/seed.js',
      'node:dist/index.js',
    ]);
  });
});
