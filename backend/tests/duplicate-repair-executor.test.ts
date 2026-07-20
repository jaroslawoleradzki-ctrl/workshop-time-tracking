import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REPAIR_EXECUTION_STUB_MESSAGE,
  approveManifestFile,
  executeManifestFile,
  parseExecutorArguments,
  summarizeManifestFile,
} from '../scripts/duplicate-repair-executor';

const APPROVED_AT = '2026-07-20T12:00:00.000Z';
let temporaryDirectory: string;
let manifestPath: string;

function action(batchId: string, name: 'KEEP' | 'DELETE' | 'REVIEW') {
  return {
    batchId,
    action: name,
    confidence: name === 'REVIEW' ? 'MEDIUM' : 'HIGH',
    reasonCode: `TEST_${name}`,
    reason: `Powód ${name}`,
    reportIds: [`report-${batchId}`],
    affectedGroups: [`group-${batchId}`],
    affectedRecords: 1,
    predecessorBatchIds: name === 'DELETE' ? ['batch-original'] : [],
    decisionEvidence: ['CREATE_AUDIT_MATCH'],
    requiresManualReview: name !== 'KEEP',
  };
}

function manifest() {
  const actions = [
    action('batch-delete-1', 'DELETE'),
    action('batch-delete-2', 'DELETE'),
    action('batch-keep', 'KEEP'),
    action('batch-review', 'REVIEW'),
  ];
  return {
    manifestVersion: 1,
    generatedAt: '2026-07-20T10:00:00.000Z',
    analysisFile: '/tmp/duplicate-analysis.json',
    analysisSha256: 'a'.repeat(64),
    requiresApproval: true,
    approved: false,
    readOnly: true,
    databaseOperationsPerformed: false,
    summary: {
      batches: 4,
      actions: 4,
      records: 4,
      actionsByType: { KEEP: 1, DELETE: 2, REVIEW: 1 },
      recordsByAction: { KEEP: 1, DELETE: 2, REVIEW: 1 },
      actionsByConfidence: { HIGH: 3, MEDIUM: 1, LOW: 0 },
      unresolvedActions: 0,
    },
    actions,
    warnings: ['Testowy manifest – bez operacji na bazie.'],
  };
}

async function writeManifest(value: unknown = manifest()) {
  await fs.writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ReturnType<typeof manifest> & {
    actions: Array<ReturnType<typeof action> & {
      approved?: true;
      approvedBy?: string;
      approvedAt?: string;
      approvalNote?: string;
    }>;
  };
}

const approval = (batchIds: string[]) => ({
  batchIds,
  approvedBy: 'Jarosław Oleradzki',
  approvalNote: 'Zweryfikowano ręcznie',
  approvedAt: APPROVED_AT,
});

beforeEach(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-executor-'));
  manifestPath = path.join(temporaryDirectory, 'repair-manifest.json');
  await writeManifest();
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

describe('Duplicate Repair Executor', () => {
  it('summary reads the manifest without modifying it or creating files', async () => {
    const before = await fs.readFile(manifestPath, 'utf8');
    const filesBefore = await fs.readdir(temporaryDirectory);

    const summary = await summarizeManifestFile(manifestPath);

    expect(summary).toContain('KEEP: 1; DELETE: 2; REVIEW: 1');
    expect(summary).toContain('Zatwierdzone DELETE: 0/2');
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
    expect(await fs.readdir(temporaryDirectory)).toEqual(filesBefore);
  });

  it('approves one DELETE batch in the same manifest', async () => {
    await approveManifestFile(manifestPath, approval(['batch-delete-1']));

    const result = await readManifest();
    const approved = result.actions.find((item) => item.batchId === 'batch-delete-1');
    expect(approved).toMatchObject({
      action: 'DELETE',
      approved: true,
      approvedBy: 'Jarosław Oleradzki',
      approvedAt: APPROVED_AT,
      approvalNote: 'Zweryfikowano ręcznie',
    });
    expect(result.approved).toBe(false);
    result.actions.filter((item) => item.action !== 'DELETE').forEach((item) => {
      expect(item).not.toHaveProperty('approved');
      expect(item).not.toHaveProperty('approvedBy');
      expect(item).not.toHaveProperty('approvedAt');
      expect(item).not.toHaveProperty('approvalNote');
    });
    expect(await fs.readdir(temporaryDirectory)).toEqual(['repair-manifest.json']);
  });

  it('approves multiple DELETE batches and marks the complete manifest approved', async () => {
    const parsed = parseExecutorArguments([
      '--manifest', manifestPath,
      '--approve', 'batch-delete-1',
      '--approve', 'batch-delete-2',
      '--approved-by', 'Jarosław Oleradzki',
      '--note', 'Zweryfikowano ręcznie',
    ]);
    expect(parsed).toMatchObject({
      mode: 'approve',
      batchIds: ['batch-delete-1', 'batch-delete-2'],
    });

    await approveManifestFile(manifestPath, approval(['batch-delete-1', 'batch-delete-2']));

    const result = await readManifest();
    expect(result.actions.filter((item) => item.approved === true)).toHaveLength(2);
    expect(result.approved).toBe(true);
  });

  it('rejects approval of KEEP without changing the manifest', async () => {
    const before = await fs.readFile(manifestPath, 'utf8');

    await expect(approveManifestFile(manifestPath, approval(['batch-keep'])))
      .rejects.toThrow('Nie można zatwierdzić akcji KEEP');

    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
  });

  it('rejects approval of REVIEW without changing the manifest', async () => {
    const before = await fs.readFile(manifestPath, 'utf8');

    await expect(approveManifestFile(manifestPath, approval(['batch-review'])))
      .rejects.toThrow('Nie można zatwierdzić akcji REVIEW');

    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
  });

  it('rejects a missing batch without changing the manifest', async () => {
    const before = await fs.readFile(manifestPath, 'utf8');

    await expect(approveManifestFile(manifestPath, approval(['batch-missing'])))
      .rejects.toThrow('Batch batch-missing nie istnieje');

    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
  });

  it('execute validates an approved manifest and returns only the stub message', async () => {
    await approveManifestFile(manifestPath, approval(['batch-delete-1']));
    const before = await fs.readFile(manifestPath, 'utf8');

    const result = await executeManifestFile(manifestPath);

    expect(result).toBe(REPAIR_EXECUTION_STUB_MESSAGE);
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
    expect(await fs.readdir(temporaryDirectory)).toEqual(['repair-manifest.json']);
  });

  it('execute rejects a manifest without approved DELETE actions', async () => {
    await expect(executeManifestFile(manifestPath))
      .rejects.toThrow('Manifest nie zawiera zatwierdzonych akcji DELETE.');
  });

  it('execute rejects an unsupported manifest version', async () => {
    const invalid = manifest();
    invalid.manifestVersion = 2;
    await writeManifest(invalid);

    await expect(executeManifestFile(manifestPath))
      .rejects.toThrow('Nieobsługiwana wersja manifestu: 2. Oczekiwana: 1.');
  });

  it('execute rejects a manifest missing required action fields', async () => {
    const invalid = manifest();
    invalid.actions[0].reportIds = [];
    await writeManifest(invalid);

    await expect(executeManifestFile(manifestPath))
      .rejects.toThrow('Nieprawidłowy Repair Manifest');
  });
});
