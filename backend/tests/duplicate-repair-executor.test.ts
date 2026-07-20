import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REPAIR_EXECUTION_STUB_MESSAGE,
  approveManifestFile,
  executeManifestFile,
  parseExecutorArguments,
  parseRepairManifest,
  summarizeManifestFile,
} from '../scripts/duplicate-repair-executor';
import {
  ReportPreconditions,
  reportBusinessFingerprint,
} from '../scripts/repair-manifest-builder';

const APPROVED_AT = '2026-07-20T12:00:00.000Z';
let temporaryDirectory: string;
let manifestPath: string;

function legacyAction(batchId: string, name: 'KEEP' | 'DELETE' | 'REVIEW') {
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

function manifestV1() {
  const actions = [
    legacyAction('batch-delete-1', 'DELETE'),
    legacyAction('batch-delete-2', 'DELETE'),
    legacyAction('batch-keep', 'KEEP'),
    legacyAction('batch-review', 'REVIEW'),
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
    warnings: ['Testowy manifest v1 – bez operacji na bazie.'],
  };
}

function preconditions(
  reportId: string,
  batchId: string,
  createdAt: string,
): ReportPreconditions {
  return {
    employeeId: 'employee-1',
    date: '2026-07-02',
    orderId: 'order-1',
    orderNumber: '530-2-01',
    orderName: 'Produkt testowy',
    hours: '4.00',
    workTimeTypeCode: 'G',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    createdByUserId: 'user-1',
    modifiedByUserId: null,
    createAuditId: `audit-${reportId}`,
    copyBatchId: batchId,
  };
}

function deleteActionV2(batchId: string, sequence: number) {
  const reportId = `report-${batchId}`;
  const predecessorReportId = 'report-batch-keep';
  const target = preconditions(reportId, batchId, `2026-07-02T08:0${sequence}:00.000Z`);
  const predecessor = preconditions(
    predecessorReportId,
    'batch-keep',
    '2026-07-02T07:59:00.000Z',
  );
  return {
    batchId,
    action: 'DELETE' as const,
    confidence: 'HIGH' as const,
    reasonCode: 'REDUNDANT_COPY_BATCH',
    reason: 'Jednoznaczny poprzednik',
    reportIds: [reportId],
    records: [{
      reportId,
      preconditions: target,
      fingerprint: reportBusinessFingerprint(target),
      predecessor: {
        reportId: predecessorReportId,
        batchId: predecessor.copyBatchId!,
        preconditions: predecessor,
        fingerprint: reportBusinessFingerprint(predecessor),
      },
    }],
    approved: false,
    affectedGroups: [`group-${batchId}`],
    affectedRecords: 1,
    predecessorBatchIds: [predecessor.copyBatchId!],
    preconditionIssues: [],
    decisionEvidence: ['CREATE_AUDIT_MATCH'],
    requiresManualReview: true,
  };
}

function nonDeleteActionV2(batchId: string, name: 'KEEP' | 'REVIEW') {
  return {
    batchId,
    action: name,
    confidence: name === 'KEEP' ? 'HIGH' : 'MEDIUM',
    reasonCode: `TEST_${name}`,
    reason: `Powód ${name}`,
    reportIds: [`report-${batchId}`],
    affectedGroups: [`group-${batchId}`],
    affectedRecords: 1,
    predecessorBatchIds: [],
    preconditionIssues: name === 'REVIEW' ? ['MANUAL_REVIEW'] : [],
    decisionEvidence: ['CREATE_AUDIT_MATCH'],
    requiresManualReview: name === 'REVIEW',
  };
}

function manifestV2() {
  const actions = [
    deleteActionV2('batch-delete-1', 1),
    deleteActionV2('batch-delete-2', 2),
    nonDeleteActionV2('batch-keep', 'KEEP'),
    nonDeleteActionV2('batch-review', 'REVIEW'),
  ];
  return {
    manifestVersion: 2,
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
      deleteRecordsWithPreconditions: 2,
      deleteRecordsWithPredecessor: 2,
      batchesDegradedForPreconditions: 0,
    },
    actions,
    warnings: ['Testowy manifest v2 – bez operacji na bazie.'],
  };
}

async function writeManifest(value: unknown = manifestV2()) {
  await fs.writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ReturnType<typeof manifestV2>;
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

describe('Duplicate Repair Executor manifest v1/v2', () => {
  it('summary supports v1 without modifying it or creating files', async () => {
    await writeManifest(manifestV1());
    const before = await fs.readFile(manifestPath, 'utf8');
    const filesBefore = await fs.readdir(temporaryDirectory);

    const summary = await summarizeManifestFile(manifestPath);

    expect(summary).toContain('Wersja manifestu: 1');
    expect(summary).toContain('KEEP: 1; DELETE: 2; REVIEW: 1');
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
    expect(await fs.readdir(temporaryDirectory)).toEqual(filesBefore);
  });

  it('summary v2 shows complete DELETE preconditions and predecessors', async () => {
    const summary = await summarizeManifestFile(manifestPath);

    expect(summary).toContain('Wersja manifestu: 2');
    expect(summary).toContain('Rekordy DELETE z pełnymi preconditions i poprzednikiem: 2/2');
  });

  it('approve still supports a legacy v1 manifest', async () => {
    await writeManifest(manifestV1());

    await approveManifestFile(manifestPath, approval(['batch-delete-1']));
    const result = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    expect(result.actions[0]).toMatchObject({ approved: true, approvedAt: APPROVED_AT });
    expect(result.manifestVersion).toBe(1);
  });

  it('approves one v2 DELETE without changing technical data', async () => {
    const before = await readManifest();
    const technicalBefore = structuredClone(before.actions[0].records);

    await approveManifestFile(manifestPath, approval(['batch-delete-1']));

    const result = await readManifest();
    expect(result.actions[0]).toMatchObject({
      action: 'DELETE',
      approved: true,
      approvedBy: 'Jarosław Oleradzki',
      approvedAt: APPROVED_AT,
      approvalNote: 'Zweryfikowano ręcznie',
    });
    expect(result.actions[0].records).toEqual(technicalBefore);
    expect(result.approved).toBe(false);
    expect(await fs.readdir(temporaryDirectory)).toEqual(['repair-manifest.json']);
  });

  it('approves multiple v2 DELETE batches and marks the manifest approved', async () => {
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

  it('rejects approval of a missing batch without changing the manifest', async () => {
    const before = await fs.readFile(manifestPath, 'utf8');
    await expect(approveManifestFile(manifestPath, approval(['batch-missing'])))
      .rejects.toThrow('Batch batch-missing nie istnieje');
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
  });

  it('execute accepts an approved valid v2 and still returns only the stub', async () => {
    await approveManifestFile(manifestPath, approval(['batch-delete-1']));
    const before = await fs.readFile(manifestPath, 'utf8');

    expect(await executeManifestFile(manifestPath)).toBe(REPAIR_EXECUTION_STUB_MESSAGE);
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(before);
    expect(await fs.readdir(temporaryDirectory)).toEqual(['repair-manifest.json']);
  });

  it('execute rejects v1 with a clear v2 requirement', async () => {
    const legacy = manifestV1();
    Object.assign(legacy.actions[0], {
      approved: true,
      approvedBy: 'Jarosław Oleradzki',
      approvedAt: APPROVED_AT,
      approvalNote: 'Zweryfikowano ręcznie',
    });
    await writeManifest(legacy);

    await expect(executeManifestFile(manifestPath))
      .rejects.toThrow('Tryb --execute wymaga manifestVersion 2');
  });

  it('execute rejects v2 without an approved DELETE', async () => {
    await expect(executeManifestFile(manifestPath))
      .rejects.toThrow('Manifest nie zawiera zatwierdzonych akcji DELETE.');
  });

  it('rejects a missing or unsupported manifest version', () => {
    expect(() => parseRepairManifest({})).toThrow('Nieobsługiwana wersja manifestu: undefined');
    expect(() => parseRepairManifest({ manifestVersion: 3 })).toThrow(
      'Nieobsługiwana wersja manifestu: 3',
    );
  });

  it('detects a duplicated reportId across actions', () => {
    const invalid = manifestV2();
    invalid.actions[1].reportIds[0] = invalid.actions[0].reportIds[0];
    invalid.actions[1].records![0].reportId = invalid.actions[0].reportIds[0];

    expect(() => parseRepairManifest(invalid)).toThrow('występuje w więcej niż jednej akcji');
  });

  it('detects a DELETE record without a fingerprint', () => {
    const invalid = manifestV2() as any;
    delete invalid.actions[0].records[0].fingerprint;

    expect(() => parseRepairManifest(invalid)).toThrow('Nieprawidłowy Repair Manifest');
  });

  it('detects a DELETE action without record preconditions', () => {
    const invalid = manifestV2() as any;
    delete invalid.actions[0].records;

    expect(() => parseRepairManifest(invalid)).toThrow('nie zawiera rekordowych preconditions');
  });

  it('detects predecessorReportId equal to reportId', () => {
    const invalid = manifestV2();
    invalid.actions[0].records![0].predecessor.reportId = invalid.actions[0].records![0].reportId;

    expect(() => parseRepairManifest(invalid)).toThrow('wskazuje sam siebie jako poprzednika');
  });

  it('detects a predecessor that is also proposed for DELETE', () => {
    const invalid = manifestV2();
    const firstTarget = invalid.actions[0].reportIds[0];
    const secondRecord = invalid.actions[1].records![0];
    secondRecord.predecessor.reportId = firstTarget;
    secondRecord.predecessor.batchId = invalid.actions[0].batchId;
    secondRecord.predecessor.preconditions = structuredClone(invalid.actions[0].records![0].preconditions);
    secondRecord.predecessor.preconditions.copyBatchId = invalid.actions[0].batchId;
    secondRecord.predecessor.fingerprint = reportBusinessFingerprint(secondRecord.predecessor.preconditions);
    invalid.actions[1].predecessorBatchIds = [invalid.actions[0].batchId];

    expect(() => parseRepairManifest(invalid)).toThrow('jest również proponowany do DELETE');
  });

  it('detects a reportIds to records mismatch', () => {
    const invalid = manifestV2();
    invalid.actions[0].reportIds[0] = 'different-report';

    expect(() => parseRepairManifest(invalid)).toThrow('ma rozbieżne reportIds i records');
  });

  it('detects an invalid global approved value', () => {
    const invalid = manifestV2();
    invalid.approved = true;

    expect(() => parseRepairManifest(invalid)).toThrow(
      'Pole approved manifestu jest niespójne',
    );
  });
});
