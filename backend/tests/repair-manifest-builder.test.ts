import { describe, expect, it } from 'vitest';
import {
  DuplicateAnalysisFile,
  buildRepairManifest,
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
  updatedAt = createdAt,
) {
  return {
    id,
    createdAt,
    updatedAt,
    deletedAt: null,
    createdByUserId: 'user-1',
    createAuditId: `audit-${id}`,
    copyBatchId,
  };
}

function batch(params: {
  id: string;
  reportIds: string[];
  startedAt: string;
  sourceMatch?: 'REPEATED' | 'EXACT' | 'PARTIAL';
  repetitionFactor?: number;
  likelihood?: 'STRONG' | 'POSSIBLE';
  sourceHistoryUncertain?: boolean;
  createAuditCoverage?: number;
  userId?: string;
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
    sourceDate: '2026-07-01',
    sourceMatch: params.sourceMatch || 'EXACT',
    repetitionFactor: params.repetitionFactor ?? 1,
    createAuditCoverage: params.createAuditCoverage ?? 1,
    explicitCopyAuditId: null,
    sourceHistoryUncertain: params.sourceHistoryUncertain ?? false,
    likelihood: params.likelihood || 'STRONG',
  };
}

function group(
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  records: ReturnType<typeof record>[],
  evidence = ['SOURCE_SET_MATCH', 'CASCADE_FROM_HIGH_SOURCE_GROUP', 'CREATE_AUDIT_MATCH'],
) {
  const created = records.map((item) => Date.parse(item.createdAt));
  return {
    id: 'group-0001',
    confidence,
    identity: {
      date: '2026-07-02',
      employeeId: 'employee-1',
      orderId: 'order-1',
      hours: '4.00',
      workTimeTypeCode: 'G',
    },
    records,
    evidence,
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

describe('repair manifest classification', () => {
  it('proposes KEEP for a complete copy batch without duplicate groups', () => {
    const input = analysis([
      batch({
        id: 'batch-valid',
        reportIds: ['report-valid'],
        startedAt: '2026-07-02T08:00:00.000Z',
      }),
    ], []);

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      batchId: 'batch-valid',
      action: 'KEEP',
      reasonCode: 'VALID_COPY_WITHOUT_DUPLICATES',
      requiresManualReview: false,
    });
    expect(result.approved).toBe(false);
    expect(result.databaseOperationsPerformed).toBe(false);
  });

  it('keeps the original batch and proposes DELETE only for a fully redundant later HIGH batch', () => {
    const result = buildRepairManifest(twoBatchHistory(), OPTIONS);

    expect(result.actions.map((action) => [action.batchId, action.action])).toEqual([
      ['batch-0001', 'KEEP'],
      ['batch-0002', 'DELETE'],
    ]);
    expect(result.actions[1]).toMatchObject({
      confidence: 'HIGH',
      reasonCode: 'REDUNDANT_COPY_BATCH',
      affectedRecords: 1,
      predecessorBatchIds: ['batch-0001'],
      requiresManualReview: true,
    });
    expect(result.summary.recordsByAction.DELETE).toBe(1);
  });

  it('always sends LOW groups to REVIEW', () => {
    const result = buildRepairManifest(twoBatchHistory('LOW'), OPTIONS);

    expect(result.actions.every((action) => action.action === 'REVIEW')).toBe(true);
    expect(result.actions.every((action) => action.reasonCode === 'LOW_CONFIDENCE_GROUP')).toBe(true);
    expect(result.summary.actionsByType.DELETE).toBe(0);
  });

  it('keeps MEDIUM groups in REVIEW even when batch history otherwise looks complete', () => {
    const result = buildRepairManifest(twoBatchHistory('MEDIUM'), OPTIONS);

    expect(result.actions.every((action) => action.action === 'REVIEW')).toBe(true);
    expect(result.actions.every((action) => action.reasonCode === 'MEDIUM_CONFIDENCE_GROUP')).toBe(true);
  });

  it('does not propose DELETE when the earlier batch was created by another user', () => {
    const input = twoBatchHistory();
    input.copyBatches[1].createdByUserId = 'user-2';

    const result = buildRepairManifest(input, OPTIONS);
    const later = result.actions.find((action) => action.batchId === 'batch-0002');

    expect(later).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'AMBIGUOUS_HIGH_BATCH',
      predecessorBatchIds: [],
    });
  });

  it('does not delete an internally repeated set when the whole batch cannot be removed', () => {
    const startedAt = '2026-07-02T08:00:00.000Z';
    const repeatedBatch = batch({
      id: 'batch-repeated',
      reportIds: ['report-1', 'report-2'],
      startedAt,
      sourceMatch: 'REPEATED',
      repetitionFactor: 2,
    });
    const input = analysis([repeatedBatch], [
      group('HIGH', [
        record('report-1', startedAt, repeatedBatch.id),
        record('report-2', '2026-07-02T08:00:00.020Z', repeatedBatch.id),
      ], ['SOURCE_SET_MATCH', 'COPY_BATCH_REPEATED_SOURCE_SET', 'CREATE_AUDIT_MATCH']),
    ]);

    const result = buildRepairManifest(input, OPTIONS);

    expect(result.actions[0]).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'REPEATED_SET_WITHIN_BATCH',
    });
  });

  it('does not propose DELETE when a candidate record has a later update', () => {
    const input = twoBatchHistory();
    input.groups[0].records[1].updatedAt = '2026-07-02T08:01:05.000Z';

    const result = buildRepairManifest(input, OPTIONS);
    const later = result.actions.find((action) => action.batchId === 'batch-0002');

    expect(later).toMatchObject({
      action: 'REVIEW',
      reasonCode: 'SOURCE_HISTORY_UNCERTAIN',
    });
  });

  it('creates a synthetic REVIEW action when a group references an absent batch', () => {
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

  it('is deterministic regardless of input array order and produces filterable summaries', () => {
    const input = twoBatchHistory();
    const reversed = structuredClone(input);
    reversed.copyBatches.reverse();
    reversed.groups[0].records.reverse();

    const first = buildRepairManifest(input, OPTIONS);
    const second = buildRepairManifest(reversed, OPTIONS);

    expect(second).toEqual(first);
    expect(repairManifestCsv(first).split('\n')[0]).toContain('batch_id,action,confidence');
    expect(repairManifestCsv(first).trim().split('\n')).toHaveLength(first.actions.length + 1);
    expect(repairManifestMarkdown(first)).toContain('## Przypadki wymagające ręcznej weryfikacji');
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
