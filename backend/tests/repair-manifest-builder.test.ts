import { describe, expect, it } from 'vitest';
import {
  DuplicateAnalysisFile,
  buildRepairManifest,
  createReportPreconditions,
  qualifiedPredecessorCandidates,
  reportBusinessFingerprint,
} from '../scripts/repair-manifest-builder';
import {
  repairManifestCsv,
  repairManifestMarkdown,
} from '../scripts/repair-manifest-output';

const GENERATED_AT = '2026-07-20T12:00:00.000Z';
const OPTIONS = {
  generatedAt: GENERATED_AT,
  analysisFile: '/tmp/duplicate-analysis.json',
  analysisSha256: 'a'.repeat(64),
};

function record(
  id: string,
  createdAt: string,
  copyBatchId: string | null,
  options: {
    updatedAt?: string;
    deletedAt?: string | null;
    employeeId?: string;
    orderId?: string | null;
    orderNumber?: string | null;
    orderName?: string | null;
    hours?: string;
    workTimeTypeCode?: string;
    createdByUserId?: string;
  } = {},
) {
  const orderId = options.orderId === undefined ? 'order-1' : options.orderId;
  return {
    id,
    date: '2026-07-02',
    employeeId: options.employeeId || 'employee-1',
    employeeName: 'Pracownik testowy',
    orderId,
    orderNumber: options.orderNumber === undefined
      ? (orderId === null ? null : '530-2-01')
      : options.orderNumber,
    orderName: options.orderName === undefined
      ? (orderId === null ? null : 'Produkt testowy')
      : options.orderName,
    hours: options.hours || '4.00',
    workTimeTypeCode: options.workTimeTypeCode || 'G',
    createdAt,
    updatedAt: options.updatedAt || createdAt,
    deletedAt: options.deletedAt === undefined ? null : options.deletedAt,
    createdByUserId: options.createdByUserId || 'user-1',
    createdByUserName: 'Lider testowy',
    modifiedByUserId: null,
    modifiedByUserName: null,
    createAuditId: `audit-${id}`,
    createAuditAt: createdAt,
    createAuditUserId: options.createdByUserId || 'user-1',
    createAuditUserName: 'Lider testowy',
    gapFromPreviousMs: null,
    copyBatchId,
  };
}

function batch(params: {
  id: string;
  reportIds: string[];
  startedAt: string;
  sourceMatch?: 'REPEATED' | 'EXACT' | 'PARTIAL' | 'NONE' | 'NO_SOURCE';
  repetitionFactor?: number;
  likelihood?: 'STRONG' | 'POSSIBLE';
  sourceHistoryUncertain?: boolean;
  createAuditCoverage?: number;
  userId?: string;
  sourceDate?: string | null;
  repeatedImportSessionOf?: string | null;
}) {
  const finishedAt = new Date(new Date(params.startedAt).getTime() + 100).toISOString();
  return {
    id: params.id,
    date: '2026-07-02',
    employeeId: 'employee-1',
    createdByUserId: params.userId || 'user-1',
    reportIds: params.reportIds,
    startedAt: params.startedAt,
    finishedAt,
    durationMs: 100,
    sourceDate: params.sourceDate === undefined ? '2026-07-01' : params.sourceDate,
    sourceMatch: params.sourceMatch || 'EXACT',
    repetitionFactor: params.repetitionFactor ?? 1,
    createAuditCoverage: params.createAuditCoverage ?? 1,
    explicitCopyAuditId: null,
    sourceHistoryUncertain: params.sourceHistoryUncertain ?? false,
    likelihood: params.likelihood || 'STRONG',
    repeatedImportSessionOf: params.repeatedImportSessionOf ?? null,
  };
}

function group(
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  records: ReturnType<typeof record>[],
  options: {
    id?: string;
    evidence?: string[];
    identityHours?: string;
  } = {},
) {
  const created = records.map((item) => Date.parse(item.createdAt));
  return {
    id: options.id || 'group-0001',
    confidence,
    identity: {
      date: '2026-07-02',
      employeeId: 'employee-1',
      orderId: 'order-1',
      hours: options.identityHours || '4.00',
      workTimeTypeCode: 'G',
    },
    records,
    evidence: options.evidence || [
      'SOURCE_SET_MATCH',
      'CASCADE_FROM_HIGH_SOURCE_GROUP',
      'CREATE_AUDIT_MATCH',
    ],
    creationSpanMs: Math.max(...created) - Math.min(...created),
  };
}

function analysis(
  copyBatches: ReturnType<typeof batch>[],
  groups: ReturnType<typeof group>[],
): DuplicateAnalysisFile {
  return {
    parameters: { from: '2026-07-01', to: '2026-07-31', copyBurstWindowMs: 5_000 },
    summary: {},
    copyBatches,
    groups,
  };
}

function twoBatchHistory(confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH') {
  const firstAt = '2026-07-02T08:00:00.000Z';
  const secondAt = '2026-07-02T08:01:00.000Z';
  const first = batch({ id: 'batch-0001', reportIds: ['report-1'], startedAt: firstAt });
  const second = batch({ id: 'batch-0002', reportIds: ['report-2'], startedAt: secondAt });
  const duplicateGroup = group(confidence, [
    record('report-1', firstAt, first.id),
    record('report-2', secondAt, second.id),
  ]);
  return analysis([second, first], [duplicateGroup]);
}

describe('repair manifest v2 classification', () => {
  it('generates manifest v2 with one concrete predecessor for every DELETE record', () => {
    const result = buildRepairManifest(twoBatchHistory(), OPTIONS);

    expect(result.manifestVersion).toBe(2);
    expect(result.actions.map((action) => [action.batchId, action.action])).toEqual([
      ['batch-0001', 'KEEP'],
      ['batch-0002', 'DELETE'],
    ]);
    expect(result.actions[1]).toMatchObject({
      approved: false,
      confidence: 'HIGH',
      reasonCode: 'REDUNDANT_COPY_BATCH',
      affectedRecords: 1,
      predecessorBatchIds: ['batch-0001'],
      preconditionIssues: [],
      records: [{
        reportId: 'report-2',
        predecessor: { reportId: 'report-1', batchId: 'batch-0001' },
      }],
    });
    expect(result.summary).toMatchObject({
      recordsByAction: { DELETE: 1 },
      deleteRecordsWithPreconditions: 1,
      deleteRecordsWithPredecessor: 1,
      batchesDegradedForPreconditions: 0,
    });
  });



  it('keeps original repeated import session and deletes redundant waves without prior-day source', () => {
    const firstAt = '2026-07-17T09:45:00.000Z';
    const secondAt = '2026-07-17T09:50:00.000Z';
    const thirdAt = '2026-07-17T09:56:00.000Z';
    const input = analysis([
      batch({
        id: 'batch-original',
        reportIds: ['original-a', 'original-b'],
        startedAt: firstAt,
        sourceMatch: 'NO_SOURCE',
        repetitionFactor: 0,
        sourceDate: null,
      }),
      batch({
        id: 'batch-repeat-1',
        reportIds: ['repeat-1-a', 'repeat-1-b'],
        startedAt: secondAt,
        sourceDate: '2026-07-17',
        repeatedImportSessionOf: 'batch-original',
      }),
      batch({
        id: 'batch-repeat-2',
        reportIds: ['repeat-2-a', 'repeat-2-b'],
        startedAt: thirdAt,
        sourceDate: '2026-07-17',
        repeatedImportSessionOf: 'batch-original',
      }),
    ], [
      group('HIGH', [
        record('original-a', firstAt, 'batch-original'),
        record('repeat-1-a', secondAt, 'batch-repeat-1'),
        record('repeat-2-a', thirdAt, 'batch-repeat-2'),
      ], {
        id: 'group-a',
        evidence: ['SOURCE_SET_MATCH', 'REPEATED_IMPORT_SESSION', 'CREATE_AUDIT_MATCH'],
      }),
      group('HIGH', [
        record('original-b', '2026-07-17T09:45:01.000Z', 'batch-original', { hours: '6.00' }),
        record('repeat-1-b', '2026-07-17T09:50:01.000Z', 'batch-repeat-1', { hours: '6.00' }),
        record('repeat-2-b', '2026-07-17T09:56:01.000Z', 'batch-repeat-2', { hours: '6.00' }),
      ], {
        id: 'group-b',
        identityHours: '6.00',
        evidence: ['SOURCE_SET_MATCH', 'REPEATED_IMPORT_SESSION', 'CREATE_AUDIT_MATCH'],
      }),
    ]);

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions.map((action) => [action.batchId, action.action, action.reasonCode])).toEqual([
      ['batch-original', 'KEEP', 'ORIGINAL_COPY_BATCH'],
      ['batch-repeat-1', 'DELETE', 'REDUNDANT_COPY_BATCH'],
      ['batch-repeat-2', 'DELETE', 'REDUNDANT_COPY_BATCH'],
    ]);
    expect(result.actions.find((action) => action.batchId === 'batch-repeat-1')).toMatchObject({
      predecessorBatchIds: ['batch-original'],
      preconditionIssues: [],
      records: [
        { reportId: 'repeat-1-a', predecessor: { reportId: 'original-a', batchId: 'batch-original' } },
        { reportId: 'repeat-1-b', predecessor: { reportId: 'original-b', batchId: 'batch-original' } },
      ],
    });
    expect(result.summary.actionsByType).toMatchObject({ KEEP: 1, DELETE: 2, REVIEW: 0 });
  });

  it('creates a deterministic SHA-256 business fingerprint', () => {
    const first = createReportPreconditions(record(
      'report-1',
      '2026-07-02T08:00:00.000Z',
      'batch-1',
      { hours: '4' },
    ));
    const second = { ...first, hours: '4.00', updatedAt: '2026-07-20T12:00:00.000Z' };

    expect(reportBusinessFingerprint(first)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(reportBusinessFingerprint(second)).toBe(reportBusinessFingerprint(first));
  });

  it('normalizes null, dates and hours in record preconditions', () => {
    const result = createReportPreconditions(record(
      'report-1',
      '2026-07-02T10:00:00.000+02:00',
      'batch-1',
      { orderId: null, hours: '8' },
    ));

    expect(result).toMatchObject({
      date: '2026-07-02',
      orderId: null,
      orderNumber: null,
      orderName: null,
      hours: '8.00',
      createdAt: '2026-07-02T08:00:00.000Z',
      deletedAt: null,
    });
  });

  it('proposes KEEP for a complete copy batch without duplicate groups', () => {
    const input = analysis([
      batch({
        id: 'batch-valid',
        reportIds: ['report-valid'],
        startedAt: '2026-07-02T08:00:00.000Z',
      }),
    ], []);

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions[0]).toMatchObject({
      batchId: 'batch-valid',
      action: 'KEEP',
      reasonCode: 'VALID_COPY_WITHOUT_DUPLICATES',
      requiresManualReview: false,
    });
    expect(result.approved).toBe(false);
    expect(result.databaseOperationsPerformed).toBe(false);
  });

  it('degrades a batch without a predecessor to REVIEW', () => {
    const startedAt = '2026-07-02T08:00:00.000Z';
    const onlyBatch = batch({
      id: 'batch-repeated',
      reportIds: ['report-1', 'report-2'],
      startedAt,
      sourceMatch: 'REPEATED',
      repetitionFactor: 2,
    });
    const input = analysis([onlyBatch], [
      group('HIGH', [
        record('report-1', startedAt, onlyBatch.id),
        record('report-2', '2026-07-02T08:00:00.020Z', onlyBatch.id),
      ], {
        evidence: ['SOURCE_SET_MATCH', 'COPY_BATCH_REPEATED_SOURCE_SET', 'CREATE_AUDIT_MATCH'],
      }),
    ]);

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions[0]).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'REPEATED_SET_WITHIN_BATCH',
    });
    expect(result.actions[0].preconditionIssues).toEqual(expect.arrayContaining([
      'report-1:MISSING_PREDECESSOR',
      'report-2:MISSING_PREDECESSOR',
    ]));
    expect(result.summary.batchesDegradedForPreconditions).toBe(0);
  });

  it('uses the sole KEEP predecessor when another earlier candidate belongs to DELETE', () => {
    const input = twoBatchHistory();
    const thirdAt = '2026-07-02T08:02:00.000Z';
    input.copyBatches.push(batch({ id: 'batch-0003', reportIds: ['report-3'], startedAt: thirdAt }));
    input.groups[0].records.push(record('report-3', thirdAt, 'batch-0003'));

    const result = buildRepairManifest(input, OPTIONS);
    const third = result.actions.find((action) => action.batchId === 'batch-0003');

    expect(third).toMatchObject({
      action: 'DELETE',
      reasonCode: 'REDUNDANT_COPY_BATCH',
      predecessorBatchIds: ['batch-0001'],
      records: [{
        reportId: 'report-3',
        predecessor: { reportId: 'report-1', batchId: 'batch-0001' },
      }],
    });
    expect(third?.preconditionIssues).toEqual([]);
  });

  it('never uses a report from another DELETE action as predecessor', () => {
    const input = twoBatchHistory();
    const thirdAt = '2026-07-02T08:02:00.000Z';
    input.copyBatches.push(batch({ id: 'batch-0003', reportIds: ['report-3'], startedAt: thirdAt }));
    input.groups[0].records.push(record('report-3', thirdAt, 'batch-0003'));

    const result = buildRepairManifest(input, OPTIONS);
    const deleteTargets = new Set(result.actions
      .filter((action) => action.action === 'DELETE')
      .flatMap((action) => action.reportIds));
    const predecessors = result.actions
      .filter((action) => action.action === 'DELETE')
      .flatMap((action) => action.records || [])
      .map((item) => item.predecessor.reportId);

    expect(predecessors.every((id) => !deleteTargets.has(id))).toBe(true);
    expect(result.actions.find((action) => action.batchId === 'batch-0003')?.action).toBe('DELETE');
    expect(predecessors).toEqual(['report-1', 'report-1']);
  });

  it('ignores several REVIEW candidates when exactly one KEEP predecessor remains', () => {
    const keepAt = '2026-07-02T08:00:00.000Z';
    const reviewOneAt = '2026-07-02T08:00:01.000Z';
    const reviewTwoAt = '2026-07-02T08:00:02.000Z';
    const targetAt = '2026-07-02T08:00:03.000Z';
    const input = analysis([
      batch({ id: 'batch-keep', reportIds: ['report-keep'], startedAt: keepAt }),
      batch({
        id: 'batch-review-1',
        reportIds: ['report-review-1', 'unmapped-1'],
        startedAt: reviewOneAt,
      }),
      batch({
        id: 'batch-review-2',
        reportIds: ['report-review-2', 'unmapped-2'],
        startedAt: reviewTwoAt,
      }),
      batch({ id: 'batch-target', reportIds: ['report-target'], startedAt: targetAt }),
    ], [
      group('HIGH', [
        record('report-keep', keepAt, 'batch-keep'),
        record('report-review-1', reviewOneAt, 'batch-review-1'),
        record('report-review-2', reviewTwoAt, 'batch-review-2'),
        record('report-target', targetAt, 'batch-target'),
      ]),
    ]);

    const result = buildRepairManifest(input, OPTIONS);
    const target = result.actions.find((action) => action.batchId === 'batch-target');

    expect(result.actions.find((action) => action.batchId === 'batch-review-1')?.action).toBe('REVIEW');
    expect(result.actions.find((action) => action.batchId === 'batch-review-2')?.action).toBe('REVIEW');
    expect(target).toMatchObject({
      action: 'DELETE',
      predecessorBatchIds: ['batch-keep'],
      records: [{ predecessor: { reportId: 'report-keep', batchId: 'batch-keep' } }],
    });
  });

  it('degrades a batch when two qualified KEEP predecessors remain', () => {
    const keepAt = '2026-07-02T08:00:00.000Z';
    const targetAt = '2026-07-02T08:00:01.000Z';
    const input = analysis([
      batch({ id: 'batch-keep-1', reportIds: ['report-keep-1'], startedAt: keepAt }),
      batch({ id: 'batch-keep-2', reportIds: ['report-keep-2'], startedAt: keepAt }),
      batch({ id: 'batch-target', reportIds: ['report-target'], startedAt: targetAt }),
    ], [
      group('HIGH', [
        record('report-keep-1', keepAt, 'batch-keep-1'),
        record('report-keep-2', keepAt, 'batch-keep-2'),
        record('report-target', targetAt, 'batch-target'),
      ]),
    ]);

    const result = buildRepairManifest(input, OPTIONS);
    const target = result.actions.find((action) => action.batchId === 'batch-target');

    expect(result.actions.filter((action) => action.action === 'KEEP')).toHaveLength(2);
    expect(target).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'DELETE_PRECONDITIONS_INCOMPLETE',
    });
    expect(target?.preconditionIssues).toEqual([
      'report-target:MULTIPLE_PREDECESSORS:report-keep-1|report-keep-2',
    ]);
  });

  it('leaves a batch in REVIEW when all historical candidates belong to REVIEW', () => {
    const reviewOneAt = '2026-07-02T08:00:00.000Z';
    const reviewTwoAt = '2026-07-02T08:00:01.000Z';
    const targetAt = '2026-07-02T08:00:02.000Z';
    const input = analysis([
      batch({
        id: 'batch-review-1',
        reportIds: ['report-review-1', 'unmapped-1'],
        startedAt: reviewOneAt,
      }),
      batch({
        id: 'batch-review-2',
        reportIds: ['report-review-2', 'unmapped-2'],
        startedAt: reviewTwoAt,
      }),
      batch({ id: 'batch-target', reportIds: ['report-target'], startedAt: targetAt }),
    ], [
      group('HIGH', [
        record('report-review-1', reviewOneAt, 'batch-review-1'),
        record('report-review-2', reviewTwoAt, 'batch-review-2'),
        record('report-target', targetAt, 'batch-target'),
      ]),
    ]);

    const result = buildRepairManifest(input, OPTIONS);
    const target = result.actions.find((action) => action.batchId === 'batch-target');

    expect(target).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'DELETE_PRECONDITIONS_INCOMPLETE',
    });
    expect(target?.preconditionIssues).toEqual([
      'report-target:MISSING_QUALIFIED_KEEP_PREDECESSOR',
    ]);
  });

  it('filters out candidates belonging exclusively to DELETE actions', () => {
    const candidates = [record(
      'report-delete',
      '2026-07-02T08:00:00.000Z',
      'batch-delete',
    )];
    const actionByBatchId = new Map([
      ['batch-delete', { action: 'DELETE' as const }],
    ]);

    expect(qualifiedPredecessorCandidates(candidates, actionByBatchId)).toEqual([]);
  });

  it('keeps an entire mixed batch in REVIEW when one record lacks a KEEP predecessor', () => {
    const keepAt = '2026-07-02T08:00:00.000Z';
    const reviewAt = '2026-07-02T08:00:01.000Z';
    const targetAt = '2026-07-02T08:00:02.000Z';
    const input = analysis([
      batch({ id: 'batch-keep', reportIds: ['report-keep'], startedAt: keepAt }),
      batch({
        id: 'batch-review',
        reportIds: ['report-review-a', 'report-review-b', 'unmapped'],
        startedAt: reviewAt,
      }),
      batch({
        id: 'batch-target',
        reportIds: ['report-target-a', 'report-target-b'],
        startedAt: targetAt,
      }),
    ], [
      group('HIGH', [
        record('report-keep', keepAt, 'batch-keep'),
        record('report-review-a', reviewAt, 'batch-review'),
        record('report-target-a', targetAt, 'batch-target'),
      ], { id: 'group-a' }),
      group('HIGH', [
        record('report-review-b', '2026-07-02T08:00:01.010Z', 'batch-review', { hours: '6.00' }),
        record('report-target-b', '2026-07-02T08:00:02.010Z', 'batch-target', { hours: '6.00' }),
      ], { id: 'group-b', identityHours: '6.00' }),
    ]);

    const result = buildRepairManifest(input, OPTIONS);
    const target = result.actions.find((action) => action.batchId === 'batch-target');

    expect(target).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'DELETE_PRECONDITIONS_INCOMPLETE',
      reportIds: ['report-target-a', 'report-target-b'],
      affectedRecords: 2,
    });
    expect(target?.preconditionIssues).toEqual([
      'report-target-b:MISSING_QUALIFIED_KEEP_PREDECESSOR',
    ]);
  });

  it('degrades a mismatched business key to REVIEW', () => {
    const input = twoBatchHistory();
    input.groups[0].records[1].hours = '5.00';

    const result = buildRepairManifest(input, OPTIONS);
    const later = result.actions.find((action) => action.batchId === 'batch-0002');

    expect(later).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'DELETE_PRECONDITIONS_INCOMPLETE',
    });
    expect(later?.preconditionIssues).toContain('report-2:BUSINESS_KEY_MISMATCH');
  });

  it('keeps reportIds derived from DELETE records in stable order', () => {
    const firstAt = '2026-07-02T08:00:00.000Z';
    const secondAt = '2026-07-02T08:01:00.000Z';
    const input = analysis([
      batch({ id: 'batch-1', reportIds: ['original-b', 'original-a'], startedAt: firstAt }),
      batch({ id: 'batch-2', reportIds: ['target-b', 'target-a'], startedAt: secondAt }),
    ], [
      group('HIGH', [
        record('original-a', firstAt, 'batch-1'),
        record('target-a', secondAt, 'batch-2'),
      ], { id: 'group-a' }),
      group('HIGH', [
        record('original-b', '2026-07-02T08:00:00.010Z', 'batch-1', { hours: '6.00' }),
        record('target-b', '2026-07-02T08:01:00.010Z', 'batch-2', { hours: '6.00' }),
      ], { id: 'group-b', identityHours: '6.00' }),
    ]);

    const result = buildRepairManifest(input, OPTIONS);
    const deletion = result.actions.find((action) => action.action === 'DELETE');

    expect(deletion?.reportIds).toEqual(['target-a', 'target-b']);
    expect(deletion?.records?.map((item) => item.reportId)).toEqual(deletion?.reportIds);
  });

  it('always sends LOW and MEDIUM groups to REVIEW', () => {
    const low = buildRepairManifest(twoBatchHistory('LOW'), OPTIONS);
    const medium = buildRepairManifest(twoBatchHistory('MEDIUM'), OPTIONS);

    expect(low.actions.every((action) => action.action === 'REVIEW')).toBe(true);
    expect(medium.actions.every((action) => action.action === 'REVIEW')).toBe(true);
    expect(low.summary.actionsByType.DELETE).toBe(0);
    expect(medium.summary.actionsByType.DELETE).toBe(0);
  });

  it('does not propose DELETE when a candidate record has a later update', () => {
    const input = twoBatchHistory();
    input.groups[0].records[1].updatedAt = '2026-07-02T08:01:05.000Z';

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions.find((action) => action.batchId === 'batch-0002')).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'SOURCE_HISTORY_UNCERTAIN',
    });
  });

  it('creates a synthetic REVIEW action for an absent batch', () => {
    const input = analysis([], [
      group('HIGH', [
        record('report-1', '2026-07-02T08:00:00.000Z', 'batch-missing'),
        record('report-2', '2026-07-02T08:00:01.000Z', null),
      ]),
    ]);

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions).toEqual([
      expect.objectContaining({
        batchId: 'unresolved:group-0001',
        action: 'REVIEW',
        reasonCode: 'UNRESOLVED_BATCH_REFERENCE',
        reportIds: ['report-1', 'report-2'],
      }),
    ]);
    expect(result.summary.unresolvedActions).toBe(1);
  });

  it('is deterministic regardless of input array order and produces readable summaries', () => {
    const input = twoBatchHistory();
    const reversed = structuredClone(input);
    reversed.copyBatches.reverse();
    reversed.groups[0].records.reverse();

    const first = buildRepairManifest(input, OPTIONS);
    const second = buildRepairManifest(reversed, OPTIONS);

    expect(second).toEqual(first);
    expect(repairManifestCsv(first).split('\n')[0]).toContain('manifest_version,batch_id,action');
    expect(repairManifestCsv(first).trim().split('\n')).toHaveLength(first.actions.length + 1);
    expect(repairManifestMarkdown(first)).toContain('Wersja manifestu: **2**');
    expect(repairManifestMarkdown(first)).toContain('Rekordy DELETE z jednoznacznym poprzednikiem');
  });

  it('rejects a report assigned to more than one batch', () => {
    const startedAt = '2026-07-02T08:00:00.000Z';
    const input = analysis([
      batch({ id: 'batch-1', reportIds: ['report-1'], startedAt }),
      batch({ id: 'batch-2', reportIds: ['report-1'], startedAt: '2026-07-02T09:00:00.000Z' }),
    ], []);

    expect(() => buildRepairManifest(input, OPTIONS)).toThrow(
      'Raport report-1 należy do więcej niż jednego batcha.',
    );
  });
});
