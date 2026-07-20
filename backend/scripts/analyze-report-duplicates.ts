import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/utils/prisma';
import {
  CopyOperationAuditEvidence,
  CreateAuditEvidence,
  DuplicateReportInput,
  analyzeDuplicateReports,
} from './duplicate-report-classifier';
import { duplicateAnalysisCsv, terminalSummary } from './duplicate-report-output';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const reportInclude = Prisma.validator<Prisma.WorkTimeReportInclude>()({
  employee: { select: { fullName: true } },
  order: { select: { orderNumber: true, productName: true } },
  createdByUser: { select: { fullName: true } },
  modifiedByUser: { select: { fullName: true } },
});

type DatabaseReport = Prisma.WorkTimeReportGetPayload<{ include: typeof reportInclude }>;

const auditInclude = Prisma.validator<Prisma.AuditLogInclude>()({
  user: { select: { fullName: true } },
});

type DatabaseAudit = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;

function validIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function usage() {
  return [
    'Użycie:',
    '  npm run reports:analyze-duplicates -- --from YYYY-MM-DD --to YYYY-MM-DD',
    '',
    'Skrypt działa wyłącznie odczytowo i zapisuje raporty do backend/reports/.',
  ].join('\n');
}

function parseArguments(argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const allowed = new Set(['--from', '--to']);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || !value || value.startsWith('--')) {
      throw new Error(`Nieprawidłowe argumenty.\n${usage()}`);
    }
    values.set(name, value);
  }

  const from = values.get('--from');
  const to = values.get('--to');
  if (!from || !to || !validIsoDate(from) || !validIsoDate(to)) {
    throw new Error(`--from i --to muszą być prawidłowymi datami YYYY-MM-DD.\n${usage()}`);
  }
  if (from > to) throw new Error('--from nie może być późniejsze niż --to.');
  return { from, to };
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : null;
}

function numberFromJson(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' ? value : null;
}

function stringFromJson(value: Prisma.JsonValue | undefined) {
  return typeof value === 'string' ? value : null;
}

function mapOperationAudit(audit: DatabaseAudit): CopyOperationAuditEvidence | null {
  const values = jsonObject(audit.newValues);
  if (!values || values.eventType !== 'COPY_LAST_DAY') return null;
  const employeeId = stringFromJson(values.employeeId);
  const sourceDate = stringFromJson(values.sourceDate);
  const targetDate = stringFromJson(values.targetDate);
  if (!employeeId || !sourceDate || !targetDate) return null;
  return {
    id: audit.id,
    userId: audit.userId,
    userName: audit.user.fullName,
    createdAt: audit.createdAt,
    employeeId,
    sourceDate,
    targetDate,
    sourceCount: numberFromJson(values.sourceCount),
    createdCount: numberFromJson(values.createdCount),
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function loadCreateAudits(
  tx: Prisma.TransactionClient,
  reportIds: string[],
) {
  const audits: DatabaseAudit[] = [];
  for (const ids of chunks(reportIds, 1_000)) {
    const part = await tx.auditLog.findMany({
      where: {
        tableName: 'work_time_reports',
        action: 'CREATE',
        recordId: { in: ids },
      },
      include: auditInclude,
      orderBy: { createdAt: 'asc' },
    });
    audits.push(...part);
  }
  return audits;
}

async function loadOperationAudits(
  tx: Prisma.TransactionClient,
  fromCreatedAt: Date,
  toCreatedAt: Date,
) {
  return tx.auditLog.findMany({
    where: {
      tableName: 'work_time_reports',
      action: 'CREATE',
      createdAt: { gte: fromCreatedAt, lte: toCreatedAt },
      newValues: { path: ['eventType'], equals: 'COPY_LAST_DAY' },
    },
    include: auditInclude,
    orderBy: { createdAt: 'asc' },
  });
}

function reportInput(
  report: DatabaseReport,
  createAudit: CreateAuditEvidence | null,
): DuplicateReportInput {
  return {
    id: report.id,
    date: report.date,
    employeeId: report.employeeId,
    employeeName: report.employee.fullName,
    orderId: report.orderId,
    orderNumber: report.order?.orderNumber || null,
    orderName: report.order?.productName || null,
    hours: report.hours.toString(),
    workTimeTypeCode: report.workTimeTypeCode,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    deletedAt: report.deletedAt,
    createdByUserId: report.createdByUserId,
    createdByUserName: report.createdByUser.fullName,
    modifiedByUserId: report.modifiedByUserId,
    modifiedByUserName: report.modifiedByUser?.fullName || null,
    createAudit,
  };
}

async function readAnalysisData(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const transactionState = await tx.$queryRaw<Array<{ transaction_read_only: string }>>`
        SELECT current_setting('transaction_read_only') AS transaction_read_only
      `;
      if (transactionState[0]?.transaction_read_only !== 'on') {
        throw new Error('Baza nie potwierdziła trybu transakcji READ ONLY. Analiza została przerwana.');
      }

      const employeesInRange = await tx.workTimeReport.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        select: { employeeId: true },
        distinct: ['employeeId'],
      });
      const employeeIds = employeesInRange.map((report) => report.employeeId);
      if (employeeIds.length === 0) return { reports: [], operationAudits: [] };

      // Candidate rows are limited by --from/--to. Earlier rows for the same
      // employees are read only as source context for copy-batch comparison.
      const reports = await tx.workTimeReport.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { lte: toDate },
        },
        include: reportInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      const targetReports = reports.filter(
        (report) => report.date >= fromDate && report.date <= toDate,
      );
      const targetIds = targetReports.map((report) => report.id);
      const createAudits = await loadCreateAudits(tx, targetIds);
      const createAuditByRecordId = new Map<string, CreateAuditEvidence>();
      createAudits.forEach((audit) => {
        if (!createAuditByRecordId.has(audit.recordId)) {
          createAuditByRecordId.set(audit.recordId, {
            id: audit.id,
            userId: audit.userId,
            userName: audit.user.fullName,
            createdAt: audit.createdAt,
          });
        }
      });

      const creationTimes = targetReports.map((report) => report.createdAt.getTime());
      const creationBounds = creationTimes.reduce(
        (bounds, value) => ({ min: Math.min(bounds.min, value), max: Math.max(bounds.max, value) }),
        { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      );
      const operationAudits = creationTimes.length > 0
        ? await loadOperationAudits(
            tx,
            new Date(creationBounds.min - 5_000),
            new Date(creationBounds.max + 5_000),
          )
        : [];

      return {
        reports: reports.map((report) =>
          reportInput(report, createAuditByRecordId.get(report.id) || null),
        ),
        operationAudits: operationAudits
          .map(mapOperationAudit)
          .filter((audit): audit is CopyOperationAuditEvidence => Boolean(audit)),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function writeReports(
  from: string,
  to: string,
  result: ReturnType<typeof analyzeDuplicateReports>,
) {
  const outputDirectory = path.resolve(__dirname, '..', 'reports', `duplicate-analysis-${timestampForPath()}`);
  await fs.mkdir(outputDirectory, { recursive: true });
  const fullJson = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    deletionPerformed: false,
    updatePerformed: false,
    ...result,
  };
  const highJson = {
    generatedAt: fullJson.generatedAt,
    from,
    to,
    reviewRequired: true,
    deletionPerformed: false,
    warning: 'Identyfikatory obejmują wszystkie rekordy w grupie. To nie jest lista DELETE ani wybór rekordu do zachowania.',
    groups: result.highCandidates,
  };

  await Promise.all([
    fs.writeFile(path.join(outputDirectory, 'duplicate-analysis.json'), `${JSON.stringify(fullJson, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDirectory, 'duplicate-analysis.csv'), duplicateAnalysisCsv(result), 'utf8'),
    fs.writeFile(path.join(outputDirectory, 'high-candidates.json'), `${JSON.stringify(highJson, null, 2)}\n`, 'utf8'),
  ]);
  return outputDirectory;
}

async function main() {
  const { from, to } = parseArguments(process.argv.slice(2));
  process.stdout.write('Uruchamianie analizy w transakcji PostgreSQL READ ONLY...\n');
  const data = await readAnalysisData(from, to);
  const result = analyzeDuplicateReports(data.reports, {
    from,
    to,
    operationAudits: data.operationAudits,
  });
  const outputDirectory = await writeReports(from, to, result);
  process.stdout.write(terminalSummary(result, outputDirectory));
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
