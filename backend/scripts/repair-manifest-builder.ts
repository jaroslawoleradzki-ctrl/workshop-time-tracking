import { z } from 'zod';

export type RepairActionName = 'KEEP' | 'DELETE' | 'REVIEW';
export type RepairConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export const REPAIR_MANIFEST_VERSION = 1 as const;

const confidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

const duplicateRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: z.string().nullable(),
  createdByUserId: z.string().min(1),
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
type DuplicateRecord = DuplicateGroup['records'][number];
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
  | 'UNRESOLVED_BATCH_REFERENCE';

export interface RepairAction {
  batchId: string;
  action: RepairActionName;
  confidence: RepairConfidence;
  reasonCode: RepairReasonCode;
  reason: string;
  reportIds: string[];
  affectedGroups: string[];
  affectedRecords: number;
  predecessorBatchIds: string[];
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
  approved: boolean;
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

function timestamp(value: string, field: string) {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error(`Nieprawidłowy ${field}: ${value}`);
  return result;
}

function compareBatches(left: CopyBatch, right: CopyBatch) {
  return timestamp(left.startedAt, 'startedAt') - timestamp(right.startedAt, 'startedAt')
    || left.id.localeCompare(right.id);
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
      timestamp(record.createdAt, 'createdAt');
      timestamp(record.updatedAt, 'updatedAt');
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
  predecessorBatchIds: string[] = [],
): RepairAction {
  return {
    batchId: batch.id,
    action,
    confidence,
    reasonCode,
    reason,
    reportIds: [...batch.reportIds].sort(),
    affectedGroups: groups.map((group) => group.id).sort(),
    affectedRecords: batch.reportIds.length,
    predecessorBatchIds: [...new Set(predecessorBatchIds)].sort(),
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

  const actions = [...analysis.copyBatches].sort(compareBatches).map((batch) => {
    const batchReportIds = new Set(batch.reportIds);
    const groups = [...new Map(
      batch.reportIds
        .map((reportId) => groupByReportId.get(reportId))
        .filter((group): group is DuplicateGroup => Boolean(group))
        .map((group) => [group.id, group]),
    ).values()].sort((left, right) => left.id.localeCompare(right.id));
    const confidence = groupConfidence(groups);

    if (groups.some((group) => group.confidence === 'LOW')) {
      return actionFromBatch(
        batch,
        'REVIEW',
        'LOW',
        'LOW_CONFIDENCE_GROUP',
        'Batch obejmuje grupę LOW, która zgodnie z zasadą bezpieczeństwa zawsze wymaga ręcznej decyzji.',
        groups,
      );
    }
    if (groups.some((group) => group.confidence === 'MEDIUM')) {
      return actionFromBatch(
        batch,
        'REVIEW',
        'MEDIUM',
        'MEDIUM_CONFIDENCE_GROUP',
        'Batch obejmuje grupę MEDIUM; dostępna historia nie uzasadnia automatycznej propozycji usunięcia.',
        groups,
      );
    }

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
    const predecessorBatchIds = new Set<string>();
    const everyRecordHasEarlierCopy = allReportsMappedToHighGroups && records.every((record) => {
      const group = groupByReportId.get(record.id);
      if (!group) return false;
      const predecessors = group.records.filter((other) => {
        if (other.id === record.id || batchReportIds.has(other.id)) return false;
        if (timestamp(other.createdAt, 'createdAt') >= timestamp(record.createdAt, 'createdAt')) return false;
        const earlierBatch = other.copyBatchId ? batchById.get(other.copyBatchId) : null;
        return Boolean(
          earlierBatch
          && earlierBatch.reportIds.includes(other.id)
          && earlierBatch.date === batch.date
          && earlierBatch.employeeId === batch.employeeId
          && earlierBatch.createdByUserId === batch.createdByUserId
          && timestamp(earlierBatch.startedAt, 'startedAt') < timestamp(batch.startedAt, 'startedAt')
          && stableRecordHistory(other)
          && trustedCopyBatch(earlierBatch, analysis.parameters.copyBurstWindowMs),
        );
      });
      predecessors.forEach((other) => {
        if (other.copyBatchId) predecessorBatchIds.add(other.copyBatchId);
      });
      return predecessors.length > 0;
    });

    if (
      copyEvidenceIsComplete
      && highGroupsHaveCopyHistory
      && recordsHaveStableHistory
      && everyRecordHasEarlierCopy
    ) {
      return actionFromBatch(
        batch,
        'DELETE',
        'HIGH',
        'REDUNDANT_COPY_BATCH',
        'Każdy rekord batcha ma wcześniejszy odpowiednik z innego wiarygodnego batcha kopiowania, a pełny batch ma zgodne źródło, audyt i stabilną historię. DELETE jest wyłącznie propozycją wymagającą zatwierdzenia.',
        groups,
        [...predecessorBatchIds],
      );
    }

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
      return actionFromBatch(
        batch,
        'KEEP',
        'HIGH',
        'VALID_COPY_WITHOUT_DUPLICATES',
        'Pełny i audytowany batch dokładnie odpowiada źródłu, a jego rekordy nie należą do żadnej grupy duplikatów.',
        groups,
      );
    }
    if (canKeep && allReportsMappedToHighGroups && recordsHaveStableHistory) {
      return actionFromBatch(
        batch,
        'KEEP',
        'HIGH',
        'ORIGINAL_COPY_BATCH',
        'Batch jest najwcześniejszym stabilnym, pełnym odwzorowaniem źródła; późniejsze rekordy tworzą grupy HIGH, ale w tym batchu nie ma wewnętrznych ani wcześniejszych duplikatów.',
        groups,
      );
    }

    if (batch.sourceHistoryUncertain || !recordsHaveStableHistory) {
      return actionFromBatch(
        batch,
        'REVIEW',
        confidence,
        'SOURCE_HISTORY_UNCERTAIN',
        'Historia źródła albo rekordów docelowych zmieniła się lub jest niepełna, więc nie można bezpiecznie odtworzyć kolejności.',
        groups,
      );
    }
    if (batch.sourceMatch === 'REPEATED' && batch.repetitionFactor >= 2) {
      return actionFromBatch(
        batch,
        'REVIEW',
        confidence,
        'REPEATED_SET_WITHIN_BATCH',
        'Batch zawiera wielokrotność zestawu źródłowego, lecz nie wszystkie jego rekordy mają potwierdzony wcześniejszy odpowiednik; usunięcie całego batcha byłoby niebezpieczne.',
        groups,
      );
    }
    if (!copyEvidenceIsComplete) {
      return actionFromBatch(
        batch,
        'REVIEW',
        confidence,
        'INCOMPLETE_COPY_EVIDENCE',
        'Brakuje pełnego zestawu dowodów: dokładnego dopasowania źródła, stabilnej historii, krótkiej partii lub kompletnego audytu.',
        groups,
      );
    }
    return actionFromBatch(
      batch,
      'REVIEW',
      confidence,
      'AMBIGUOUS_HIGH_BATCH',
      'Dowody kopiowania są silne, ale nie pozwalają bezpiecznie oznaczyć całego batcha jako oryginalnego ani w całości nadmiarowego.',
      groups,
    );
  });

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
  const warnings = [
    'Manifest jest wyłącznie planem. Nie wykonał i nie zawiera kodu wykonującego DELETE, UPDATE, INSERT ani soft delete.',
    'Każda akcja DELETE jest propozycją i wymaga ręcznej weryfikacji oraz osobnego zatwierdzenia przed przyszłym etapem naprawy.',
    'Identyczne rekordy nie są samodzielną podstawą decyzji; klasyfikacja wymaga historii batchy, zgodności źródła i audytu.',
  ];
  if (actionsByType.REVIEW > 0) {
    warnings.push('Pozycje REVIEW nie mogą być automatycznie przekształcone w DELETE. Wymagają decyzji człowieka.');
  }
  if (unresolvedActions > 0) {
    warnings.push('Część rekordów wskazuje brakujący lub nierozpoznany batch i została wydzielona jako REVIEW.');
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
    },
    actions,
    warnings,
  };
}
