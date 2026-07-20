import { createHash } from 'crypto';
import { z } from 'zod';

export type RepairActionName = 'KEEP' | 'DELETE' | 'REVIEW';
export type RepairConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export const REPAIR_MANIFEST_VERSION = 2 as const;
export const REPORT_FINGERPRINT_VERSION = 'work-time-report-business-v1' as const;

const confidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

const duplicateRecordSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  employeeId: z.string().min(1),
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  orderName: z.string().nullable(),
  hours: z.string().min(1),
  workTimeTypeCode: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: z.string().nullable(),
  createdByUserId: z.string().min(1),
  modifiedByUserId: z.string().nullable(),
  createAuditId: z.string().nullable(),
  copyBatchId: z.string().nullable(),
}).passthrough();

const duplicateGroupSchema = z.object({
  id: z.string().min(1),
  confidence: confidenceSchema,
  identity: z.object({
    date: z.string().min(1),
    employeeId: z.string().min(1),
    orderId: z.string().nullable(),
    hours: z.string().min(1),
    workTimeTypeCode: z.string().min(1),
  }).passthrough(),
  records: z.array(duplicateRecordSchema).min(2),
  evidence: z.array(z.string()),
  creationSpanMs: z.number().nonnegative(),
}).passthrough();

const copyBatchSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  employeeId: z.string().min(1),
  createdByUserId: z.string().min(1),
  reportIds: z.array(z.string().min(1)).min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  durationMs: z.number().nonnegative(),
  sourceDate: z.string().nullable(),
  sourceMatch: z.enum(['REPEATED', 'EXACT', 'PARTIAL', 'NONE', 'NO_SOURCE']),
  repetitionFactor: z.number().int().nonnegative(),
  createAuditCoverage: z.number().min(0).max(1),
  explicitCopyAuditId: z.string().nullable(),
  sourceHistoryUncertain: z.boolean(),
  likelihood: z.enum(['STRONG', 'POSSIBLE', 'NONE']),
}).passthrough();

export const duplicateAnalysisFileSchema = z.object({
  parameters: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    copyBurstWindowMs: z.number().positive(),
  }).passthrough(),
  summary: z.record(z.unknown()),
  groups: z.array(duplicateGroupSchema),
  copyBatches: z.array(copyBatchSchema),
}).passthrough();

export type DuplicateAnalysisFile = z.infer<typeof duplicateAnalysisFileSchema>;
type DuplicateGroup = DuplicateAnalysisFile['groups'][number];
export type DuplicateRecord = DuplicateGroup['records'][number];
type CopyBatch = DuplicateAnalysisFile['copyBatches'][number];

export type RepairReasonCode =
  | 'VALID_COPY_WITHOUT_DUPLICATES'
  | 'ORIGINAL_COPY_BATCH'
  | 'REDUNDANT_COPY_BATCH'
  | 'LOW_CONFIDENCE_GROUP'
  | 'MEDIUM_CONFIDENCE_GROUP'
  | 'SOURCE_HISTORY_UNCERTAIN'
  | 'REPEATED_SET_WITHIN_BATCH'
  | 'INCOMPLETE_COPY_EVIDENCE'
  | 'AMBIGUOUS_HIGH_BATCH'
  | 'DELETE_PRECONDITIONS_INCOMPLETE'
  | 'UNRESOLVED_BATCH_REFERENCE';

export interface ReportPreconditions {
  employeeId: string;
  date: string;
  orderId: string | null;
  orderNumber: string | null;
  orderName: string | null;
  hours: string;
  workTimeTypeCode: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdByUserId: string;
  modifiedByUserId: string | null;
  createAuditId: string | null;
  copyBatchId: string | null;
}

export interface RepairDeleteRecord {
  reportId: string;
  preconditions: ReportPreconditions;
  fingerprint: string;
  predecessor: {
    reportId: string;
    batchId: string;
    preconditions: ReportPreconditions;
    fingerprint: string;
  };
}

export interface RepairAction {
  batchId: string;
  action: RepairActionName;
  confidence: RepairConfidence;
  reasonCode: RepairReasonCode;
  reason: string;
  reportIds: string[];
  records?: RepairDeleteRecord[];
  approved?: false;
  affectedGroups: string[];
  affectedRecords: number;
  predecessorBatchIds: string[];
  preconditionIssues: string[];
  decisionEvidence: string[];
  requiresManualReview: boolean;
  date: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sourceDate: string | null;
  sourceMatch: CopyBatch['sourceMatch'] | null;
  repetitionFactor: number | null;
  createAuditCoverage: number | null;
  likelihood: CopyBatch['likelihood'] | null;
}

export interface RepairManifest {
  manifestVersion: typeof REPAIR_MANIFEST_VERSION;
  generatedAt: string;
  analysisFile: string;
  analysisSha256: string;
  requiresApproval: true;
  approved: false;
  readOnly: true;
  databaseOperationsPerformed: false;
  summary: {
    batches: number;
    actions: number;
    records: number;
    actionsByType: Record<RepairActionName, number>;
    recordsByAction: Record<RepairActionName, number>;
    actionsByConfidence: Record<RepairConfidence, number>;
    unresolvedActions: number;
    deleteRecordsWithPreconditions: number;
    deleteRecordsWithPredecessor: number;
    batchesDegradedForPreconditions: number;
  };
  actions: RepairAction[];
  warnings: string[];
}

export interface BuildRepairManifestOptions {
  generatedAt: string;
  analysisFile: string;
  analysisSha256: string;
}

const COPY_HISTORY_EVIDENCE = new Set([
  'COPY_BATCH_REPEATED_SOURCE_SET',
  'MULTIPLE_SOURCE_MATCHING_BATCHES',
  'CASCADE_FROM_HIGH_SOURCE_GROUP',
]);

function isoDate(value: string, field: string) {
  const normalized = value.slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error(`Nieprawidłowy ${field}: ${value}`);
  }
  return normalized;
}

function isoTimestamp(value: string, field: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Nieprawidłowy ${field}: ${value}`);
  return parsed.toISOString();
}

function timestamp(value: string, field: string) {
  return Date.parse(isoTimestamp(value, field));
}

export function normalizeReportHours(value: string | number) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Nieprawidłowa liczba godzin: ${String(value)}`);
  return number.toFixed(2);
}

export function createReportPreconditions(record: DuplicateRecord): ReportPreconditions {
  return {
    employeeId: record.employeeId,
    date: isoDate(record.date, 'date'),
    orderId: record.orderId,
    orderNumber: record.orderNumber,
    orderName: record.orderName,
    hours: normalizeReportHours(record.hours),
    workTimeTypeCode: record.workTimeTypeCode,
    createdAt: isoTimestamp(record.createdAt, 'createdAt'),
    updatedAt: isoTimestamp(record.updatedAt, 'updatedAt'),
    deletedAt: record.deletedAt === null ? null : isoTimestamp(record.deletedAt, 'deletedAt'),
    createdByUserId: record.createdByUserId,
    modifiedByUserId: record.modifiedByUserId,
    createAuditId: record.createAuditId,
    copyBatchId: record.copyBatchId,
  };
}

export function reportBusinessFingerprint(
  value: Pick<ReportPreconditions, 'date' | 'employeeId' | 'orderId' | 'hours' | 'workTimeTypeCode'>,
) {
  const canonicalFields = [
    REPORT_FINGERPRINT_VERSION,
    ['date', isoDate(value.date, 'date')],
    ['employeeId', value.employeeId],
    ['orderId', value.orderId],
    ['hours', normalizeReportHours(value.hours)],
    ['workTimeTypeCode', value.workTimeTypeCode],
  ];
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalFields)).digest('hex')}`;
}

function compareBatches(left: CopyBatch, right: CopyBatch) {
  return timestamp(left.startedAt, 'startedAt') - timestamp(right.startedAt, 'startedAt')
    || left.id.localeCompare(right.id);
}

function recordMatchesGroup(record: DuplicateRecord, group: DuplicateGroup) {
  return record.date === group.identity.date
    && record.employeeId === group.identity.employeeId
    && record.orderId === group.identity.orderId
    && normalizeReportHours(record.hours) === normalizeReportHours(group.identity.hours)
    && record.workTimeTypeCode === group.identity.workTimeTypeCode;
}

function validateAnalysis(analysis: DuplicateAnalysisFile) {
  const batchIds = new Set<string>();
  const batchReportIds = new Set<string>();
  for (const batch of analysis.copyBatches) {
    if (batchIds.has(batch.id)) throw new Error(`Powtórzony identyfikator batcha: ${batch.id}`);
    batchIds.add(batch.id);
    const startedAt = timestamp(batch.startedAt, 'startedAt');
    const finishedAt = timestamp(batch.finishedAt, 'finishedAt');
    if (finishedAt < startedAt) {
      throw new Error(`Batch ${batch.id} kończy się przed swoim rozpoczęciem.`);
    }
    for (const reportId of batch.reportIds) {
      if (batchReportIds.has(reportId)) {
        throw new Error(`Raport ${reportId} należy do więcej niż jednego batcha.`);
      }
      batchReportIds.add(reportId);
    }
  }

  const groupIds = new Set<string>();
  const groupedReportIds = new Set<string>();
  for (const group of analysis.groups) {
    if (groupIds.has(group.id)) throw new Error(`Powtórzony identyfikator grupy: ${group.id}`);
    groupIds.add(group.id);
    for (const record of group.records) {
      if (groupedReportIds.has(record.id)) {
        throw new Error(`Raport ${record.id} należy do więcej niż jednej grupy.`);
      }
      groupedReportIds.add(record.id);
      createReportPreconditions(record);
    }
  }
}

function groupConfidence(groups: DuplicateGroup[]): RepairConfidence {
  if (groups.some((group) => group.confidence === 'LOW')) return 'LOW';
  if (groups.some((group) => group.confidence === 'MEDIUM')) return 'MEDIUM';
  return groups.length > 0 ? 'HIGH' : 'LOW';
}

function stableRecordHistory(record: DuplicateRecord) {
  const updateDelay = timestamp(record.updatedAt, 'updatedAt')
    - timestamp(record.createdAt, 'createdAt');
  return record.deletedAt === null && updateDelay >= 0 && updateDelay <= 1_000;
}

function trustedCopyBatch(batch: CopyBatch, copyBurstWindowMs: number) {
  const matchIsConsistent =
    (batch.sourceMatch === 'EXACT' && batch.repetitionFactor === 1)
    || (batch.sourceMatch === 'REPEATED' && batch.repetitionFactor >= 2);
  return batch.likelihood === 'STRONG'
    && matchIsConsistent
    && batch.sourceDate !== null
    && batch.durationMs <= copyBurstWindowMs
    && (batch.createAuditCoverage === 1 || batch.explicitCopyAuditId !== null)
    && !batch.sourceHistoryUncertain;
}

function actionFromBatch(
  batch: CopyBatch,
  action: RepairActionName,
  confidence: RepairConfidence,
  reasonCode: RepairReasonCode,
  reason: string,
  groups: DuplicateGroup[],
  repairRecords: RepairDeleteRecord[] = [],
  preconditionIssues: string[] = [],
): RepairAction {
  const sortedRecords = [...repairRecords].sort((left, right) => left.reportId.localeCompare(right.reportId));
  const reportIds = action === 'DELETE'
    ? sortedRecords.map((record) => record.reportId)
    : [...batch.reportIds].sort();
  return {
    batchId: batch.id,
    action,
    confidence,
    reasonCode,
    reason,
    reportIds,
    ...(action === 'DELETE' ? { records: sortedRecords, approved: false as const } : {}),
    affectedGroups: groups.map((group) => group.id).sort(),
    affectedRecords: reportIds.length,
    predecessorBatchIds: [...new Set(
      sortedRecords.map((record) => record.predecessor.batchId),
    )].sort(),
    preconditionIssues: [...new Set(preconditionIssues)].sort(),
    decisionEvidence: [...new Set(groups.flatMap((group) => group.evidence))].sort(),
    requiresManualReview: action !== 'KEEP',
    date: batch.date,
    startedAt: batch.startedAt,
    finishedAt: batch.finishedAt,
    sourceDate: batch.sourceDate,
    sourceMatch: batch.sourceMatch,
    repetitionFactor: batch.repetitionFactor,
    createAuditCoverage: batch.createAuditCoverage,
    likelihood: batch.likelihood,
  };
}

function predecessorCandidates(
  record: DuplicateRecord,
  group: DuplicateGroup,
  batch: CopyBatch,
  batchById: Map<string, CopyBatch>,
  copyBurstWindowMs: number,
) {
  const batchReportIds = new Set(batch.reportIds);
  return group.records.filter((other) => {
    if (other.id === record.id || batchReportIds.has(other.id)) return false;
    if (timestamp(other.createdAt, 'createdAt') >= timestamp(record.createdAt, 'createdAt')) return false;
    if (!recordMatchesGroup(other, group) || !stableRecordHistory(other)) return false;
    const earlierBatch = other.copyBatchId ? batchById.get(other.copyBatchId) : null;
    return Boolean(
      earlierBatch
      && earlierBatch.reportIds.includes(other.id)
      && earlierBatch.date === batch.date
      && earlierBatch.employeeId === batch.employeeId
      && earlierBatch.createdByUserId === batch.createdByUserId
      && timestamp(earlierBatch.startedAt, 'startedAt') < timestamp(batch.startedAt, 'startedAt')
      && trustedCopyBatch(earlierBatch, copyBurstWindowMs),
    );
  }).sort((left, right) =>
    timestamp(left.createdAt, 'createdAt') - timestamp(right.createdAt, 'createdAt')
    || left.id.localeCompare(right.id));
}

function buildDeleteRecord(
  record: DuplicateRecord,
  group: DuplicateGroup,
  batch: CopyBatch,
  batchById: Map<string, CopyBatch>,
  actionByBatchId: Map<string, RepairAction>,
  copyBurstWindowMs: number,
) {
  const issues: string[] = [];
  if (!recordMatchesGroup(record, group)) {
    issues.push(`${record.id}:BUSINESS_KEY_MISMATCH`);
    return { record: null, issues };
  }

  const candidates = predecessorCandidates(
    record,
    group,
    batch,
    batchById,
    copyBurstWindowMs,
  );

  if (candidates.length === 0) {
    issues.push(`${record.id}:MISSING_PREDECESSOR`);
    return { record: null, issues };
  }
  if (candidates.length > 1) {
    issues.push(`${record.id}:MULTIPLE_PREDECESSORS:${candidates.map((item) => item.id).join('|')}`);
    return { record: null, issues };
  }

  const predecessor = candidates[0];
  const predecessorBatchId = predecessor.copyBatchId;
  if (!predecessorBatchId) {
    issues.push(`${record.id}:PREDECESSOR_WITHOUT_BATCH`);
    return { record: null, issues };
  }
  const predecessorAction = actionByBatchId.get(predecessorBatchId);
  if (!predecessorAction || predecessorAction.action !== 'KEEP') {
    const status = predecessorAction?.action || 'UNKNOWN';
    issues.push(`${record.id}:PREDECESSOR_NOT_CONFIRMED_KEEP:${predecessor.id}:${status}`);
    return { record: null, issues };
  }

  const preconditions = createReportPreconditions(record);
  const predecessorPreconditions = createReportPreconditions(predecessor);
  const fingerprint = reportBusinessFingerprint(preconditions);
  const predecessorFingerprint = reportBusinessFingerprint(predecessorPreconditions);
  if (fingerprint !== predecessorFingerprint) {
    issues.push(`${record.id}:PREDECESSOR_BUSINESS_KEY_MISMATCH:${predecessor.id}`);
    return { record: null, issues };
  }

  return {
    record: {
      reportId: record.id,
      preconditions,
      fingerprint,
      predecessor: {
        reportId: predecessor.id,
        batchId: predecessorBatchId,
        preconditions: predecessorPreconditions,
        fingerprint: predecessorFingerprint,
      },
    } satisfies RepairDeleteRecord,
    issues,
  };
}

export function buildRepairManifest(
  input: unknown,
  options: BuildRepairManifestOptions,
): RepairManifest {
  const analysis = duplicateAnalysisFileSchema.parse(input);
  validateAnalysis(analysis);

  const batchById = new Map(analysis.copyBatches.map((batch) => [batch.id, batch]));
  const groupByReportId = new Map<string, DuplicateGroup>();
  const recordById = new Map<string, DuplicateRecord>();
  analysis.groups.forEach((group) => {
    group.records.forEach((record) => {
      groupByReportId.set(record.id, group);
      recordById.set(record.id, record);
    });
  });

  const actions: RepairAction[] = [];
  const actionByBatchId = new Map<string, RepairAction>();
  for (const batch of [...analysis.copyBatches].sort(compareBatches)) {
    const batchReportIds = new Set(batch.reportIds);
    const groups = [...new Map(
      batch.reportIds
        .map((reportId) => groupByReportId.get(reportId))
        .filter((group): group is DuplicateGroup => Boolean(group))
        .map((group) => [group.id, group]),
    ).values()].sort((left, right) => left.id.localeCompare(right.id));
    const confidence = groupConfidence(groups);
    let action: RepairAction;

    if (groups.some((group) => group.confidence === 'LOW')) {
      action = actionFromBatch(
        batch,
        'REVIEW',
        'LOW',
        'LOW_CONFIDENCE_GROUP',
        'Batch obejmuje grupę LOW, która zgodnie z zasadą bezpieczeństwa zawsze wymaga ręcznej decyzji.',
        groups,
      );
    } else if (groups.some((group) => group.confidence === 'MEDIUM')) {
      action = actionFromBatch(
        batch,
        'REVIEW',
        'MEDIUM',
        'MEDIUM_CONFIDENCE_GROUP',
        'Batch obejmuje grupę MEDIUM; dostępna historia nie uzasadnia automatycznej propozycji usunięcia.',
        groups,
      );
    } else {
      const copyEvidenceIsComplete = trustedCopyBatch(batch, analysis.parameters.copyBurstWindowMs);
      const records = batch.reportIds
        .map((reportId) => recordById.get(reportId))
        .filter((record): record is DuplicateRecord => Boolean(record));
      const allReportsMappedToHighGroups = records.length === batch.reportIds.length
        && groups.length > 0
        && groups.every((group) => group.confidence === 'HIGH');
      const highGroupsHaveCopyHistory = groups.length > 0 && groups.every((group) =>
        group.evidence.some((evidence) => COPY_HISTORY_EVIDENCE.has(evidence))
        && (group.creationSpanMs <= analysis.parameters.copyBurstWindowMs
          || group.evidence.includes('COPY_BATCH_REPEATED_SOURCE_SET')
          || group.evidence.includes('CASCADE_FROM_HIGH_SOURCE_GROUP')),
      );
      const recordsHaveStableHistory = records.every(stableRecordHistory);
      const legacyEveryRecordHasEarlierCopy = allReportsMappedToHighGroups && records.every((record) => {
        const group = groupByReportId.get(record.id);
        return Boolean(group && predecessorCandidates(
          record,
          group,
          batch,
          batchById,
          analysis.parameters.copyBurstWindowMs,
        ).length > 0);
      });

      const deleteRecords: RepairDeleteRecord[] = [];
      const preconditionIssues: string[] = [];
      if (allReportsMappedToHighGroups) {
        for (const record of records) {
          const group = groupByReportId.get(record.id);
          if (!group) {
            preconditionIssues.push(`${record.id}:MISSING_GROUP`);
            continue;
          }
          const candidate = buildDeleteRecord(
            record,
            group,
            batch,
            batchById,
            actionByBatchId,
            analysis.parameters.copyBurstWindowMs,
          );
          preconditionIssues.push(...candidate.issues);
          if (candidate.record) deleteRecords.push(candidate.record);
        }
      }
      const completeDeletePreconditions = allReportsMappedToHighGroups
        && deleteRecords.length === batch.reportIds.length
        && preconditionIssues.length === 0;

      if (
        copyEvidenceIsComplete
        && highGroupsHaveCopyHistory
        && recordsHaveStableHistory
        && completeDeletePreconditions
      ) {
        action = actionFromBatch(
          batch,
          'DELETE',
          'HIGH',
          'REDUNDANT_COPY_BATCH',
          'Każdy rekord batcha ma dokładnie jeden wcześniejszy, aktywny i zachowywany odpowiednik z wiarygodnego batcha. DELETE jest wyłącznie propozycją wymagającą zatwierdzenia.',
          groups,
          deleteRecords,
        );
      } else {
        const groupCountsInBatch = new Map<string, number>();
        for (const reportId of batch.reportIds) {
          const group = groupByReportId.get(reportId);
          if (group) groupCountsInBatch.set(group.id, (groupCountsInBatch.get(group.id) || 0) + 1);
        }
        const noInternalDuplicates = [...groupCountsInBatch.values()].every((count) => count === 1);
        const noEarlierDuplicate = records.every((record) => {
          const group = groupByReportId.get(record.id);
          return !group || !group.records.some((other) =>
            other.id !== record.id
            && !batchReportIds.has(other.id)
            && timestamp(other.createdAt, 'createdAt') < timestamp(record.createdAt, 'createdAt'));
        });
        const canKeep = copyEvidenceIsComplete
          && batch.sourceMatch === 'EXACT'
          && batch.repetitionFactor === 1
          && noInternalDuplicates
          && noEarlierDuplicate;

        if (canKeep && groups.length === 0) {
          action = actionFromBatch(
            batch,
            'KEEP',
            'HIGH',
            'VALID_COPY_WITHOUT_DUPLICATES',
            'Pełny i audytowany batch dokładnie odpowiada źródłu, a jego rekordy nie należą do żadnej grupy duplikatów.',
            groups,
          );
        } else if (canKeep && allReportsMappedToHighGroups && recordsHaveStableHistory) {
          action = actionFromBatch(
            batch,
            'KEEP',
            'HIGH',
            'ORIGINAL_COPY_BATCH',
            'Batch jest najwcześniejszym stabilnym, pełnym odwzorowaniem źródła; późniejsze rekordy tworzą grupy HIGH, ale w tym batchu nie ma wewnętrznych ani wcześniejszych duplikatów.',
            groups,
          );
        } else if (
          copyEvidenceIsComplete
          && highGroupsHaveCopyHistory
          && recordsHaveStableHistory
          && allReportsMappedToHighGroups
          && legacyEveryRecordHasEarlierCopy
          && !completeDeletePreconditions
        ) {
          action = actionFromBatch(
            batch,
            'REVIEW',
            confidence,
            'DELETE_PRECONDITIONS_INCOMPLETE',
            `Batch spełnia dowody kopiowania, ale nie ma kompletnego, jednoznacznego poprzednika dla każdego rekordu: ${[...new Set(preconditionIssues)].sort().join('; ') || 'brak kompletnych preconditions'}.`,
            groups,
            [],
            preconditionIssues.length > 0 ? preconditionIssues : ['INCOMPLETE_RECORD_PRECONDITIONS'],
          );
        } else if (batch.sourceHistoryUncertain || !recordsHaveStableHistory) {
          action = actionFromBatch(
            batch,
            'REVIEW',
            confidence,
            'SOURCE_HISTORY_UNCERTAIN',
            'Historia źródła albo rekordów docelowych zmieniła się lub jest niepełna, więc nie można bezpiecznie odtworzyć kolejności.',
            groups,
          );
        } else if (batch.sourceMatch === 'REPEATED' && batch.repetitionFactor >= 2) {
          action = actionFromBatch(
            batch,
            'REVIEW',
            confidence,
            'REPEATED_SET_WITHIN_BATCH',
            'Batch zawiera wielokrotność zestawu źródłowego, lecz nie wszystkie jego rekordy mają potwierdzony wcześniejszy odpowiednik; usunięcie całego batcha byłoby niebezpieczne.',
            groups,
            [],
            preconditionIssues,
          );
        } else if (!copyEvidenceIsComplete) {
          action = actionFromBatch(
            batch,
            'REVIEW',
            confidence,
            'INCOMPLETE_COPY_EVIDENCE',
            'Brakuje pełnego zestawu dowodów: dokładnego dopasowania źródła, stabilnej historii, krótkiej partii lub kompletnego audytu.',
            groups,
          );
        } else {
          action = actionFromBatch(
            batch,
            'REVIEW',
            confidence,
            'AMBIGUOUS_HIGH_BATCH',
            'Dowody kopiowania są silne, ale nie pozwalają bezpiecznie oznaczyć całego batcha jako oryginalnego ani w całości nadmiarowego.',
            groups,
            [],
            preconditionIssues,
          );
        }
      }
    }

    actions.push(action);
    actionByBatchId.set(batch.id, action);
  }

  const representedBatchIds = new Set(analysis.copyBatches.map((batch) => batch.id));
  for (const group of [...analysis.groups].sort((left, right) => left.id.localeCompare(right.id))) {
    const unresolved = group.records
      .filter((record) => !record.copyBatchId || !representedBatchIds.has(record.copyBatchId))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (unresolved.length === 0) continue;
    actions.push({
      batchId: `unresolved:${group.id}`,
      action: 'REVIEW',
      confidence: group.confidence,
      reasonCode: 'UNRESOLVED_BATCH_REFERENCE',
      reason: 'Rekordy grupy nie wskazują batcha obecnego w pliku analizy; nie można odtworzyć ich historii kopiowania.',
      reportIds: unresolved.map((record) => record.id),
      affectedGroups: [group.id],
      affectedRecords: unresolved.length,
      predecessorBatchIds: [],
      preconditionIssues: unresolved.map((record) => `${record.id}:UNRESOLVED_BATCH_REFERENCE`),
      decisionEvidence: [...group.evidence].sort(),
      requiresManualReview: true,
      date: group.identity.date,
      startedAt: null,
      finishedAt: null,
      sourceDate: null,
      sourceMatch: null,
      repetitionFactor: null,
      createAuditCoverage: null,
      likelihood: null,
    });
  }

  actions.sort((left, right) =>
    (left.startedAt || '').localeCompare(right.startedAt || '')
    || left.batchId.localeCompare(right.batchId));

  const actionsByType: Record<RepairActionName, number> = { KEEP: 0, DELETE: 0, REVIEW: 0 };
  const recordsByAction: Record<RepairActionName, number> = { KEEP: 0, DELETE: 0, REVIEW: 0 };
  const actionsByConfidence: Record<RepairConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  actions.forEach((action) => {
    actionsByType[action.action] += 1;
    recordsByAction[action.action] += action.affectedRecords;
    actionsByConfidence[action.confidence] += 1;
  });

  const unresolvedActions = actions.filter((action) =>
    action.reasonCode === 'UNRESOLVED_BATCH_REFERENCE').length;
  const deleteRecords = actions.flatMap((action) => action.action === 'DELETE' ? action.records || [] : []);
  const batchesDegradedForPreconditions = actions.filter((action) =>
    action.reasonCode === 'DELETE_PRECONDITIONS_INCOMPLETE').length;
  const warnings = [
    'Manifest jest wyłącznie planem. Nie wykonał i nie zawiera kodu wykonującego DELETE, UPDATE, INSERT ani soft delete.',
    'Każda akcja DELETE jest propozycją i wymaga ręcznej weryfikacji oraz osobnego zatwierdzenia przed przyszłym etapem naprawy.',
    'Identyczne rekordy nie są samodzielną podstawą decyzji; klasyfikacja wymaga historii batchy, zgodności źródła i audytu.',
    'Manifest v2 wymaga dokładnie jednego konkretnego, aktywnego poprzednika dla każdego rekordu proponowanego do DELETE.',
  ];
  if (actionsByType.REVIEW > 0) {
    warnings.push('Pozycje REVIEW nie mogą być automatycznie przekształcone w DELETE. Wymagają decyzji człowieka.');
  }
  if (unresolvedActions > 0) {
    warnings.push('Część rekordów wskazuje brakujący lub nierozpoznany batch i została wydzielona jako REVIEW.');
  }
  if (batchesDegradedForPreconditions > 0) {
    warnings.push('Część batchy zdegradowano do REVIEW, ponieważ nie udało się wskazać jednoznacznych i zachowywanych poprzedników.');
  }

  return {
    manifestVersion: REPAIR_MANIFEST_VERSION,
    generatedAt: options.generatedAt,
    analysisFile: options.analysisFile,
    analysisSha256: options.analysisSha256,
    requiresApproval: true,
    approved: false,
    readOnly: true,
    databaseOperationsPerformed: false,
    summary: {
      batches: analysis.copyBatches.length,
      actions: actions.length,
      records: actions.reduce((sum, action) => sum + action.affectedRecords, 0),
      actionsByType,
      recordsByAction,
      actionsByConfidence,
      unresolvedActions,
      deleteRecordsWithPreconditions: deleteRecords.length,
      deleteRecordsWithPredecessor: deleteRecords.filter((record) => Boolean(record.predecessor)).length,
      batchesDegradedForPreconditions,
    },
    actions,
    warnings,
  };
}
