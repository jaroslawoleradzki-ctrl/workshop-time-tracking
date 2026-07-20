import { DuplicateAnalysisResult, DuplicateGroupRecord } from './duplicate-report-classifier';

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function duplicateAnalysisCsv(result: DuplicateAnalysisResult) {
  const headers = [
    'group_id',
    'confidence',
    'evidence',
    'identical_count',
    'report_id',
    'date',
    'employee_id',
    'employee_name',
    'order_id',
    'order_number',
    'order_name',
    'hours',
    'work_time_type_code',
    'created_at',
    'updated_at',
    'deleted_at',
    'created_by_user_id',
    'created_by_user_name',
    'modified_by_user_id',
    'modified_by_user_name',
    'create_audit_id',
    'create_audit_at',
    'create_audit_user_id',
    'create_audit_user_name',
    'gap_from_previous_ms',
    'copy_batch_id',
    'source_dates',
    'cascade_depth',
    'review_required',
  ];

  const rows: unknown[][] = [];
  result.groups.forEach((group) => {
    group.records.forEach((record: DuplicateGroupRecord) => {
      rows.push([
        group.id,
        group.confidence,
        group.evidence.join('|'),
        group.identicalCount,
        record.id,
        record.date,
        record.employeeId,
        record.employeeName,
        record.orderId,
        record.orderNumber,
        record.orderName,
        record.hours,
        record.workTimeTypeCode,
        record.createdAt,
        record.updatedAt,
        record.deletedAt,
        record.createdByUserId,
        record.createdByUserName,
        record.modifiedByUserId,
        record.modifiedByUserName,
        record.createAuditId,
        record.createAuditAt,
        record.createAuditUserId,
        record.createAuditUserName,
        record.gapFromPreviousMs,
        record.copyBatchId,
        group.sourceDates.join('|'),
        group.cascadeDepth,
        'true',
      ]);
    });
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function terminalSummary(result: DuplicateAnalysisResult, outputDirectory: string) {
  const lines = [
    'Analiza historycznych duplikatów work_time_reports (READ-ONLY)',
    `Zakres dat raportowanych: ${result.parameters.from} .. ${result.parameters.to}`,
    `Przeanalizowane rekordy: ${result.summary.reportsInRange} (aktywne: ${result.summary.activeReportsInRange}, usunięte: ${result.summary.deletedReportsInRange})`,
    `Podejrzane grupy: ${result.summary.suspiciousGroups} (HIGH: ${result.summary.groupsByConfidence.HIGH}, MEDIUM: ${result.summary.groupsByConfidence.MEDIUM}, LOW: ${result.summary.groupsByConfidence.LOW})`,
    `Rekordy w grupach HIGH: ${result.summary.highCandidateRecords}`,
    `Rozpoznane partie podobne do kopiowania: ${result.summary.copyLikeBatches}`,
    '',
  ];

  if (result.groups.length === 0) {
    lines.push('Brak grup identycznych aktywnych wpisów w podanym zakresie.');
  } else {
    lines.push('Grupy wymagające przeglądu:');
    for (const group of result.groups) {
      const order = group.identity.orderNumber || group.identity.orderId || '-';
      const gaps = group.records
        .map((record) => record.gapFromPreviousMs)
        .filter((value): value is number => value !== null)
        .join('|') || '-';
      lines.push(
        `${group.id} ${group.confidence} ${group.identity.date} | ${group.identity.employeeName} | ${order} | ${group.identity.hours}h ${group.identity.workTimeTypeCode} | liczba=${group.identicalCount} | odstępy_ms=${gaps}`,
      );
    }
  }

  lines.push('', `Raporty zapisano w: ${outputDirectory}`);
  lines.push('Plik HIGH jest listą grup do ręcznego przeglądu, a nie listą rekordów do usunięcia.');
  return lines.join('\n') + '\n';
}
