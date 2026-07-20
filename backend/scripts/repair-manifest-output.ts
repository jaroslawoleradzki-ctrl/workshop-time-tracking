import { RepairAction, RepairManifest, RepairReasonCode } from './repair-manifest-builder';

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function markdownCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function reasonCounts(actions: RepairAction[]) {
  const counts = new Map<RepairReasonCode, number>();
  actions.forEach((action) => {
    counts.set(action.reasonCode, (counts.get(action.reasonCode) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0]));
}

export function repairManifestCsv(manifest: RepairManifest) {
  const headers = [
    'batch_id',
    'action',
    'confidence',
    'reason_code',
    'reason',
    'report_count',
    'report_ids',
    'affected_groups',
    'predecessor_batch_ids',
    'decision_evidence',
    'requires_manual_review',
    'date',
    'started_at',
    'finished_at',
    'source_date',
    'source_match',
    'repetition_factor',
    'create_audit_coverage',
    'likelihood',
  ];
  const rows = manifest.actions.map((action) => [
    action.batchId,
    action.action,
    action.confidence,
    action.reasonCode,
    action.reason,
    action.affectedRecords,
    action.reportIds.join('|'),
    action.affectedGroups.join('|'),
    action.predecessorBatchIds.join('|'),
    action.decisionEvidence.join('|'),
    action.requiresManualReview,
    action.date,
    action.startedAt,
    action.finishedAt,
    action.sourceDate,
    action.sourceMatch,
    action.repetitionFactor,
    action.createAuditCoverage,
    action.likelihood,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function repairManifestMarkdown(manifest: RepairManifest) {
  const summary = manifest.summary;
  const lines = [
    '# Repair Manifest – podsumowanie',
    '',
    '> **READ-ONLY:** dokument jest propozycją. Nie wykonano żadnej operacji na bazie danych.',
    '',
    `- Wygenerowano: ${manifest.generatedAt}`,
    `- Plik analizy: \`${manifest.analysisFile}\``,
    `- SHA-256 analizy: \`${manifest.analysisSha256}\``,
    `- Wymaga zatwierdzenia: **tak**`,
    `- Zatwierdzony: **nie**`,
    '',
    '## Podsumowanie',
    '',
    '| Metryka | Liczba |',
    '|---|---:|',
    `| Batche wejściowe | ${summary.batches} |`,
    `| Akcje manifestu | ${summary.actions} |`,
    `| Rekordy objęte akcjami | ${summary.records} |`,
    `| KEEP | ${summary.actionsByType.KEEP} |`,
    `| DELETE (propozycje) | ${summary.actionsByType.DELETE} |`,
    `| REVIEW | ${summary.actionsByType.REVIEW} |`,
    `| Rekordy KEEP | ${summary.recordsByAction.KEEP} |`,
    `| Rekordy DELETE (propozycje) | ${summary.recordsByAction.DELETE} |`,
    `| Rekordy REVIEW | ${summary.recordsByAction.REVIEW} |`,
    `| Nierozpoznane batche | ${summary.unresolvedActions} |`,
    '',
    '## Podział według confidence',
    '',
    '| Confidence | Akcje |',
    '|---|---:|',
    `| HIGH | ${summary.actionsByConfidence.HIGH} |`,
    `| MEDIUM | ${summary.actionsByConfidence.MEDIUM} |`,
    `| LOW | ${summary.actionsByConfidence.LOW} |`,
    '',
    '## Najczęstsze powody decyzji',
    '',
    '| Kod powodu | Akcje |',
    '|---|---:|',
    ...reasonCounts(manifest.actions).map(([reason, count]) => `| ${reason} | ${count} |`),
    '',
    '## Ostrzeżenia',
    '',
    ...manifest.warnings.map((warning) => `- ${warning}`),
    '',
    '## Przypadki wymagające ręcznej weryfikacji',
    '',
  ];

  const manualActions = manifest.actions.filter((action) => action.requiresManualReview);
  if (manualActions.length === 0) {
    lines.push('Brak.');
  } else {
    lines.push(
      '| Batch | Akcja | Confidence | Rekordy | Grupy | Powód |',
      '|---|---|---|---:|---|---|',
      ...manualActions.map((action) =>
        `| ${markdownCell(action.batchId)} | ${action.action} | ${action.confidence} | ${action.affectedRecords} | ${markdownCell(action.affectedGroups.join(', ') || '-')} | ${markdownCell(action.reason)} |`),
    );
  }
  return lines.join('\n') + '\n';
}

export function repairManifestTerminalSummary(manifest: RepairManifest, outputDirectory: string) {
  const { summary } = manifest;
  return [
    'Repair Manifest Builder (READ-ONLY)',
    `Batche: ${summary.batches}; akcje: ${summary.actions}; rekordy: ${summary.records}`,
    `KEEP: ${summary.actionsByType.KEEP}; DELETE (propozycje): ${summary.actionsByType.DELETE}; REVIEW: ${summary.actionsByType.REVIEW}`,
    `Pliki zapisano w: ${outputDirectory}`,
    'Nie wykonano żadnej operacji na bazie danych. Manifest wymaga ręcznego zatwierdzenia.',
  ].join('\n') + '\n';
}
