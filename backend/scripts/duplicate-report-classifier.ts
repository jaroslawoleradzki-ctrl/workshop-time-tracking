export type DuplicateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export const DEFAULT_COPY_BURST_WINDOW_MS = 5_000;

export interface CreateAuditEvidence {
  id: string;
  userId: string;
  userName?: string | null;
  createdAt: string | Date;
}

export interface CopyOperationAuditEvidence {
  id: string;
  userId: string;
  userName?: string | null;
  createdAt: string | Date;
  employeeId: string;
  sourceDate: string;
  targetDate: string;
  sourceCount?: number | null;
  createdCount?: number | null;
}

export interface DuplicateReportInput {
  id: string;
  date: string | Date;
  employeeId: string;
  employeeName: string;
  orderId: string | null;
  orderNumber?: string | null;
  orderName?: string | null;
  hours: string | number;
  workTimeTypeCode: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
  createdByUserId: string;
  createdByUserName?: string | null;
  modifiedByUserId?: string | null;
  modifiedByUserName?: string | null;
  createAudit?: CreateAuditEvidence | null;
}

interface NormalizedReport extends Omit<DuplicateReportInput, 'date' | 'hours' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createAudit'> {
  date: string;
  hours: string;
  createdAt: string;
  createdAtMs: number;
  updatedAt: string;
  updatedAtMs: number;
  deletedAt: string | null;
  deletedAtMs: number | null;
  createAudit: (Omit<CreateAuditEvidence, 'createdAt'> & { createdAt: string; createdAtMs: number }) | null;
}

export interface CopyBatchAnalysis {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  createdByUserId: string;
  createdByUserName: string | null;
  reportIds: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourceDate: string | null;
  sourceReportCount: number;
  sourceMatch: 'REPEATED' | 'EXACT' | 'PARTIAL' | 'NONE' | 'NO_SOURCE';
  repetitionFactor: number;
  createAuditCoverage: number;
  explicitCopyAuditId: string | null;
  sourceHistoryUncertain: boolean;
  likelihood: 'STRONG' | 'POSSIBLE' | 'NONE';
  repeatedImportSessionOf: string | null;
}

export interface DuplicateGroupRecord {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  orderId: string | null;
  orderNumber: string | null;
  orderName: string | null;
  hours: string;
  workTimeTypeCode: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdByUserId: string;
  createdByUserName: string | null;
  modifiedByUserId: string | null;
  modifiedByUserName: string | null;
  createAuditId: string | null;
  createAuditAt: string | null;
  createAuditUserId: string | null;
  createAuditUserName: string | null;
  gapFromPreviousMs: number | null;
  copyBatchId: string | null;
}

export interface DuplicateGroupAnalysis {
  id: string;
  confidence: DuplicateConfidence;
  identicalCount: number;
  identity: {
    date: string;
    employeeId: string;
    employeeName: string;
    orderId: string | null;
    orderNumber: string | null;
    orderName: string | null;
    hours: string;
    workTimeTypeCode: string;
  };
  creationSpanMs: number;
  sourceDates: string[];
  cascadeDepth: number;
  evidence: string[];
  reviewRequired: true;
  records: DuplicateGroupRecord[];
}

export interface DuplicateAnalysisResult {
  parameters: {
    from: string;
    to: string;
    copyBurstWindowMs: number;
  };
  summary: {
    reportsInRange: number;
    activeReportsInRange: number;
    deletedReportsInRange: number;
    suspiciousGroups: number;
    groupsByConfidence: Record<DuplicateConfidence, number>;
    highCandidateRecords: number;
    copyLikeBatches: number;
  };
  groups: DuplicateGroupAnalysis[];
  copyBatches: CopyBatchAnalysis[];
  highCandidates: Array<{
    groupId: string;
    reportIds: string[];
    evidence: string[];
    reviewRequired: true;
  }>;
  limitations: string[];
}

export interface AnalyzeDuplicateOptions {
  from: string;
  to: string;
  copyBurstWindowMs?: number;
  operationAudits?: CopyOperationAuditEvidence[];
}

const ANALYSIS_LIMITATIONS = [
  'Historyczne rekordy nie mają identyfikatora operacji kopiowania ani requestId.',
  'CREATE w audit_logs może pochodzić zarówno z ręcznego POST, jak i ze starego kopiowania.',
  'Historyczny zapis audytu mógł się nie udać, ponieważ błędy audytu nie zawsze przerywały operację.',
  'updated_at, modified_by_user_id i deleted_at opisują stan bieżący, a nie pełną historię zmian.',
  'Szybkie ręczne wpisy mogą przypominać partię kopiowania; dlatego każdy kandydat wymaga przeglądu.',
  'Plik HIGH zawiera wszystkie identyfikatory w podejrzanej grupie i nie wskazuje rekordów do usunięcia.',
];

function isoDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function isoTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function timestampMs(value: string | Date) {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new Error(`Nieprawidłowy znacznik czasu: ${String(value)}`);
  return result;
}

function normalizedHours(value: string | number) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Nieprawidłowa liczba godzin: ${String(value)}`);
  return number.toFixed(2);
}

function normalizeReport(report: DuplicateReportInput): NormalizedReport {
  const deletedAt = report.deletedAt ? isoTimestamp(report.deletedAt) : null;
  const audit = report.createAudit
    ? {
        ...report.createAudit,
        createdAt: isoTimestamp(report.createAudit.createdAt),
        createdAtMs: timestampMs(report.createAudit.createdAt),
      }
    : null;

  return {
    ...report,
    date: isoDate(report.date),
    hours: normalizedHours(report.hours),
    createdAt: isoTimestamp(report.createdAt),
    createdAtMs: timestampMs(report.createdAt),
    updatedAt: isoTimestamp(report.updatedAt),
    updatedAtMs: timestampMs(report.updatedAt),
    deletedAt,
    deletedAtMs: report.deletedAt ? timestampMs(report.deletedAt) : null,
    createAudit: audit,
  };
}

function businessSignature(report: Pick<NormalizedReport, 'orderId' | 'hours' | 'workTimeTypeCode'>) {
  return `${report.orderId || '<NO_ORDER>'}\u001f${report.hours}\u001f${report.workTimeTypeCode}`;
}

function duplicateGroupKey(report: Pick<NormalizedReport, 'date' | 'employeeId' | 'orderId' | 'hours' | 'workTimeTypeCode'>) {
  return `${report.date}\u001f${report.employeeId}\u001f${businessSignature(report)}`;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function multiset(reports: NormalizedReport[]) {
  const result = new Map<string, number>();
  reports.forEach((report) => increment(result, businessSignature(report)));
  return result;
}

function compareMultisets(target: Map<string, number>, source: Map<string, number>) {
  if (source.size === 0 || target.size === 0) {
    return { sourceMatch: 'NO_SOURCE' as const, repetitionFactor: 0 };
  }

  let factor: number | null = null;
  let allTargetSignaturesExist = true;

  for (const [signature, targetCount] of target) {
    const sourceCount = source.get(signature);
    if (!sourceCount) {
      allTargetSignaturesExist = false;
      break;
    }
    const currentFactor = targetCount / sourceCount;
    if (!Number.isInteger(currentFactor) || currentFactor < 1) {
      allTargetSignaturesExist = false;
      break;
    }
    factor = factor === null ? currentFactor : factor;
    if (factor !== currentFactor) {
      allTargetSignaturesExist = false;
      break;
    }
  }

  const sameSignatures = allTargetSignaturesExist && target.size === source.size;
  if (sameSignatures && factor !== null) {
    return factor > 1
      ? { sourceMatch: 'REPEATED' as const, repetitionFactor: factor }
      : { sourceMatch: 'EXACT' as const, repetitionFactor: 1 };
  }

  const overlap = [...target.keys()].some((signature) => source.has(signature));
  return overlap
    ? { sourceMatch: 'PARTIAL' as const, repetitionFactor: 0 }
    : { sourceMatch: 'NONE' as const, repetitionFactor: 0 };
}

function reportWasActiveAt(report: NormalizedReport, timestamp: number) {
  return report.createdAtMs <= timestamp && (report.deletedAtMs === null || report.deletedAtMs > timestamp);
}

function findSourceReports(
  allReports: NormalizedReport[],
  employeeId: string,
  targetDate: string,
  batchStartedAtMs: number,
) {
  const possible = allReports.filter(
    (report) =>
      report.employeeId === employeeId &&
      report.date < targetDate &&
      reportWasActiveAt(report, batchStartedAtMs),
  );
  const sourceDate = possible.reduce<string | null>(
    (latest, report) => (!latest || report.date > latest ? report.date : latest),
    null,
  );
  return {
    sourceDate,
    reports: sourceDate ? possible.filter((report) => report.date === sourceDate) : [],
  };
}

function operationAuditForBatch(
  audits: CopyOperationAuditEvidence[],
  batch: {
    employeeId: string;
    date: string;
    createdByUserId: string;
    startedAtMs: number;
    finishedAtMs: number;
  },
  windowMs: number,
) {
  return audits.find((audit) => {
    const auditMs = timestampMs(audit.createdAt);
    return (
      audit.employeeId === batch.employeeId &&
      audit.targetDate === batch.date &&
      audit.userId === batch.createdByUserId &&
      auditMs >= batch.startedAtMs - windowMs &&
      auditMs <= batch.finishedAtMs + windowMs
    );
  });
}

function buildCopyBatches(
  rangeReports: NormalizedReport[],
  allReports: NormalizedReport[],
  operationAudits: CopyOperationAuditEvidence[],
  windowMs: number,
) {
  const partitions = new Map<string, NormalizedReport[]>();
  rangeReports.forEach((report) => {
    const key = `${report.date}\u001f${report.employeeId}\u001f${report.createdByUserId}`;
    const partition = partitions.get(key) || [];
    partition.push(report);
    partitions.set(key, partition);
  });

  const batches: CopyBatchAnalysis[] = [];
  let sequence = 0;

  for (const reports of partitions.values()) {
    reports.sort((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id));
    let segment: NormalizedReport[] = [];

    const finishSegment = () => {
      if (segment.length === 0) return;
      sequence += 1;
      const first = segment[0];
      const last = segment[segment.length - 1];
      const source = findSourceReports(allReports, first.employeeId, first.date, first.createdAtMs);
      const comparison = compareMultisets(multiset(segment), multiset(source.reports));
      const createAuditCount = segment.filter((report) => {
        if (!report.createAudit) return false;
        return (
          report.createAudit.userId === report.createdByUserId &&
          Math.abs(report.createAudit.createdAtMs - report.createdAtMs) <= windowMs
        );
      }).length;
      const operationAudit = operationAuditForBatch(
        operationAudits,
        {
          employeeId: first.employeeId,
          date: first.date,
          createdByUserId: first.createdByUserId,
          startedAtMs: first.createdAtMs,
          finishedAtMs: last.createdAtMs,
        },
        windowMs,
      );
      const sourceHistoryUncertain = source.reports.some(
        (report) => report.modifiedByUserId || report.updatedAtMs > first.createdAtMs,
      );
      const auditCoverage = segment.length === 0 ? 0 : createAuditCount / segment.length;
      const strongMatch = comparison.sourceMatch === 'EXACT' || comparison.sourceMatch === 'REPEATED';

      const independentlyStrongBatch =
        segment.length > 1 || comparison.sourceMatch === 'REPEATED' || Boolean(operationAudit);

      batches.push({
        id: `batch-${String(sequence).padStart(4, '0')}`,
        date: first.date,
        employeeId: first.employeeId,
        employeeName: first.employeeName,
        createdByUserId: first.createdByUserId,
        createdByUserName: first.createdByUserName || null,
        reportIds: segment.map((report) => report.id),
        startedAt: first.createdAt,
        finishedAt: last.createdAt,
        durationMs: last.createdAtMs - first.createdAtMs,
        sourceDate: source.sourceDate,
        sourceReportCount: source.reports.length,
        sourceMatch: comparison.sourceMatch,
        repetitionFactor: comparison.repetitionFactor,
        createAuditCoverage: Number(auditCoverage.toFixed(4)),
        explicitCopyAuditId: operationAudit?.id || null,
        sourceHistoryUncertain,
        likelihood: strongMatch && independentlyStrongBatch && (auditCoverage === 1 || operationAudit)
          ? 'STRONG'
          : comparison.sourceMatch === 'PARTIAL' || strongMatch
            ? 'POSSIBLE'
            : 'NONE',
        repeatedImportSessionOf: null,
      });
      segment = [];
    };

    for (const report of reports) {
      const first = segment[0];
      const previous = segment[segment.length - 1];
      if (
        segment.length > 0 &&
        (report.createdAtMs - first.createdAtMs > windowMs ||
          report.createdAtMs - previous.createdAtMs > windowMs)
      ) {
        finishSegment();
      }
      segment.push(report);
    }
    finishSegment();
  }

  const sortedBatches = batches.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.startedAt.localeCompare(right.startedAt) ||
      left.id.localeCompare(right.id),
  );

  const reportsById = new Map(allReports.map((report) => [report.id, report]));
  const firstSessionBySignature = new Map<string, CopyBatchAnalysis>();
  for (const batch of sortedBatches) {
    const reports = batch.reportIds
      .map((id) => reportsById.get(id))
      .filter((report): report is NormalizedReport => Boolean(report));
    if (reports.length !== batch.reportIds.length || reports.length < 2) continue;
    const signature = [...multiset(reports).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => `${key}=${count}`)
      .join('\u001e');
    const sessionKey = `${batch.date}\u001f${batch.employeeId}\u001f${batch.createdByUserId}\u001f${signature}`;
    const first = firstSessionBySignature.get(sessionKey);
    if (!first) {
      firstSessionBySignature.set(sessionKey, batch);
      continue;
    }
    if (first.createAuditCoverage === 1 || first.explicitCopyAuditId) first.likelihood = 'STRONG';
    batch.repeatedImportSessionOf = first.id;
    batch.sourceDate = first.date;
    batch.sourceReportCount = first.reportIds.length;
    batch.sourceMatch = 'EXACT';
    batch.repetitionFactor = 1;
    if (batch.createAuditCoverage === 1 || batch.explicitCopyAuditId) batch.likelihood = 'STRONG';
  }

  return sortedBatches;
}

function recordView(
  report: NormalizedReport,
  previous: NormalizedReport | null,
  batchId: string | null,
): DuplicateGroupRecord {
  return {
    id: report.id,
    date: report.date,
    employeeId: report.employeeId,
    employeeName: report.employeeName,
    orderId: report.orderId,
    orderNumber: report.orderNumber || null,
    orderName: report.orderName || null,
    hours: report.hours,
    workTimeTypeCode: report.workTimeTypeCode,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    deletedAt: report.deletedAt,
    createdByUserId: report.createdByUserId,
    createdByUserName: report.createdByUserName || null,
    modifiedByUserId: report.modifiedByUserId || null,
    modifiedByUserName: report.modifiedByUserName || null,
    createAuditId: report.createAudit?.id || null,
    createAuditAt: report.createAudit?.createdAt || null,
    createAuditUserId: report.createAudit?.userId || null,
    createAuditUserName: report.createAudit?.userName || null,
    gapFromPreviousMs: previous ? report.createdAtMs - previous.createdAtMs : null,
    copyBatchId: batchId,
  };
}

export function analyzeDuplicateReports(
  inputReports: DuplicateReportInput[],
  options: AnalyzeDuplicateOptions,
): DuplicateAnalysisResult {
  const windowMs = options.copyBurstWindowMs || DEFAULT_COPY_BURST_WINDOW_MS;
  const allReports = inputReports.map(normalizeReport);
  const reportsInRange = allReports.filter(
    (report) => report.date >= options.from && report.date <= options.to,
  );
  const activeReportsInRange = reportsInRange.filter((report) => report.deletedAt === null);
  const batches = buildCopyBatches(
    activeReportsInRange,
    allReports,
    options.operationAudits || [],
    windowMs,
  );
  const batchByReportId = new Map<string, CopyBatchAnalysis>();
  batches.forEach((batch) => batch.reportIds.forEach((id) => batchByReportId.set(id, batch)));

  const reportGroups = new Map<string, NormalizedReport[]>();
  activeReportsInRange.forEach((report) => {
    const key = duplicateGroupKey(report);
    const group = reportGroups.get(key) || [];
    group.push(report);
    reportGroups.set(key, group);
  });

  const candidateGroups = [...reportGroups.entries()]
    .filter(([, reports]) => reports.length > 1)
    .sort(([, left], [, right]) =>
      left[0].date.localeCompare(right[0].date) ||
      left[0].employeeId.localeCompare(right[0].employeeId) ||
      businessSignature(left[0]).localeCompare(businessSignature(right[0])),
    );

  const classifiedByGroupKey = new Map<string, DuplicateGroupAnalysis>();
  const groups: DuplicateGroupAnalysis[] = [];
  let groupSequence = 0;

  for (const [key, reports] of candidateGroups) {
    groupSequence += 1;
    reports.sort((left, right) => left.createdAtMs - right.createdAtMs || left.id.localeCompare(right.id));
    const groupBatches = [...new Map(
      reports
        .map((report) => batchByReportId.get(report.id))
        .filter((batch): batch is CopyBatchAnalysis => Boolean(batch))
        .map((batch) => [batch.id, batch]),
    ).values()];
    const matchingBatches = groupBatches.filter(
      (batch) => batch.sourceMatch === 'EXACT' || batch.sourceMatch === 'REPEATED',
    );
    const matchingBatchIds = new Set(matchingBatches.map((batch) => batch.id));
    const allCoveredByMatchingBatches = reports.every((report) => {
      const batch = batchByReportId.get(report.id);
      return batch ? matchingBatchIds.has(batch.id) : false;
    });
    const matchingStarts = matchingBatches.map((batch) => timestampMs(batch.startedAt));
    const matchingBatchSpan = matchingStarts.length > 0
      ? Math.max(...matchingStarts) - Math.min(...matchingStarts)
      : Number.POSITIVE_INFINITY;
    const repeatedInsideBatch = matchingBatches.some(
      (batch) => batch.sourceMatch === 'REPEATED' && batch.repetitionFactor >= 2,
    );
    const repeatedImportSession = groupBatches.some((batch) => batch.repeatedImportSessionOf !== null);
    const repeatedImportSessionBatchIds = new Set(
      groupBatches.filter((batch) => batch.repeatedImportSessionOf !== null).map((batch) => batch.id),
    );
    const parallelMatchingBatches =
      matchingBatches.length >= 2 && matchingBatchSpan <= windowMs;
    const sourceGroups = matchingBatches
      .map((batch) => {
        if (!batch.sourceDate) return null;
        return classifiedByGroupKey.get(
          `${batch.sourceDate}\u001f${reports[0].employeeId}\u001f${businessSignature(reports[0])}`,
        ) || null;
      })
      .filter((group): group is DuplicateGroupAnalysis => Boolean(group));
    const inheritedHighGroup = sourceGroups.find((group) => group.confidence === 'HIGH');
    const cascadeDepth = inheritedHighGroup ? inheritedHighGroup.cascadeDepth + 1 : 0;
    const auditIsStrong = matchingBatches.length > 0 && matchingBatches.every(
      (batch) => batch.createAuditCoverage === 1 || Boolean(batch.explicitCopyAuditId),
    );
    const targetHistoryUncertain = reports.some(
      (report) => report.modifiedByUserId || report.updatedAtMs - report.createdAtMs > 1_000,
    );
    const sourceHistoryUncertain = matchingBatches.some((batch) => batch.sourceHistoryUncertain);
    const sameCreator = new Set(reports.map((report) => report.createdByUserId)).size === 1;
    const creationSpanMs = reports[reports.length - 1].createdAtMs - reports[0].createdAtMs;
    const shortGroupBurst = creationSpanMs <= windowMs;
    const hasMultiRecordSourceMatch = matchingBatches.some((batch) => batch.reportIds.length > 1);

    let confidence: DuplicateConfidence = 'LOW';
    const evidence: string[] = [];

    if (matchingBatches.length > 0) evidence.push('SOURCE_SET_MATCH');
    if (repeatedInsideBatch) evidence.push('COPY_BATCH_REPEATED_SOURCE_SET');
    if (parallelMatchingBatches) evidence.push('MULTIPLE_SOURCE_MATCHING_BATCHES');
    if (inheritedHighGroup) evidence.push('CASCADE_FROM_HIGH_SOURCE_GROUP');
    if (auditIsStrong) evidence.push('CREATE_AUDIT_MATCH');
    if (shortGroupBurst) evidence.push('SHORT_CREATION_BURST');
    if (sameCreator) evidence.push('SAME_CREATOR');
    if (targetHistoryUncertain || sourceHistoryUncertain) evidence.push('HISTORY_CHANGED_OR_INCOMPLETE');

    if (repeatedImportSession) evidence.push('REPEATED_IMPORT_SESSION');

    const allCoveredByRepeatedImportSessions = reports.every((report) => {
      const batch = batchByReportId.get(report.id);
      return batch ? repeatedImportSessionBatchIds.has(batch.id) : false;
    });
    const highCopyEvidence = repeatedInsideBatch || parallelMatchingBatches || Boolean(inheritedHighGroup) || repeatedImportSession;
    if (
      highCopyEvidence &&
      (allCoveredByMatchingBatches || allCoveredByRepeatedImportSessions) &&
      auditIsStrong &&
      !targetHistoryUncertain &&
      !sourceHistoryUncertain
    ) {
      confidence = 'HIGH';
    } else if (
      matchingBatches.length > 0 &&
      (hasMultiRecordSourceMatch || shortGroupBurst || Boolean(inheritedHighGroup))
    ) {
      confidence = 'MEDIUM';
    } else {
      evidence.push('INSUFFICIENT_COPY_EVIDENCE');
    }

    const group: DuplicateGroupAnalysis = {
      id: `group-${String(groupSequence).padStart(4, '0')}`,
      confidence,
      identicalCount: reports.length,
      identity: {
        date: reports[0].date,
        employeeId: reports[0].employeeId,
        employeeName: reports[0].employeeName,
        orderId: reports[0].orderId,
        orderNumber: reports[0].orderNumber || null,
        orderName: reports[0].orderName || null,
        hours: reports[0].hours,
        workTimeTypeCode: reports[0].workTimeTypeCode,
      },
      creationSpanMs,
      sourceDates: [...new Set(matchingBatches.map((batch) => batch.sourceDate).filter(Boolean))] as string[],
      cascadeDepth,
      evidence,
      reviewRequired: true,
      records: reports.map((report, index) =>
        recordView(report, index > 0 ? reports[index - 1] : null, batchByReportId.get(report.id)?.id || null),
      ),
    };
    groups.push(group);
    classifiedByGroupKey.set(key, group);
  }

  const groupsByConfidence: Record<DuplicateConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  groups.forEach((group) => {
    groupsByConfidence[group.confidence] += 1;
  });
  const highCandidates = groups
    .filter((group) => group.confidence === 'HIGH')
    .map((group) => ({
      groupId: group.id,
      reportIds: group.records.map((record) => record.id),
      evidence: group.evidence,
      reviewRequired: true as const,
    }));

  return {
    parameters: {
      from: options.from,
      to: options.to,
      copyBurstWindowMs: windowMs,
    },
    summary: {
      reportsInRange: reportsInRange.length,
      activeReportsInRange: activeReportsInRange.length,
      deletedReportsInRange: reportsInRange.length - activeReportsInRange.length,
      suspiciousGroups: groups.length,
      groupsByConfidence,
      highCandidateRecords: highCandidates.reduce((sum, group) => sum + group.reportIds.length, 0),
      copyLikeBatches: batches.filter((batch) => batch.likelihood !== 'NONE').length,
    },
    groups,
    copyBatches: batches.filter((batch) => batch.likelihood !== 'NONE'),
    highCandidates,
    limitations: ANALYSIS_LIMITATIONS,
  };
}
