import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { REPAIR_MANIFEST_VERSION } from './repair-manifest-builder';

export const REPAIR_EXECUTION_STUB_MESSAGE = 'Repair execution not implemented yet.';

const actionNames = ['KEEP', 'DELETE', 'REVIEW'] as const;
const confidenceNames = ['HIGH', 'MEDIUM', 'LOW'] as const;
const isoTimestampSchema = z.string().datetime({ offset: true });

function isIsoTimestamp(value: string) {
  return isoTimestampSchema.safeParse(value).success;
}

const repairActionSchema = z.object({
  batchId: z.string().min(1),
  action: z.enum(actionNames),
  confidence: z.enum(confidenceNames),
  reasonCode: z.string().min(1),
  reason: z.string().min(1),
  reportIds: z.array(z.string().min(1)).min(1),
  affectedGroups: z.array(z.string().min(1)),
  affectedRecords: z.number().int().positive(),
  predecessorBatchIds: z.array(z.string().min(1)),
  decisionEvidence: z.array(z.string().min(1)),
  requiresManualReview: z.boolean(),
  approved: z.literal(true).optional(),
  approvedBy: z.string().min(1).optional(),
  approvedAt: z.string().min(1).optional(),
  approvalNote: z.string().min(1).optional(),
}).passthrough().superRefine((action, context) => {
  const approvalValues = [
    action.approved,
    action.approvedBy,
    action.approvedAt,
    action.approvalNote,
  ];
  const approvalCount = approvalValues.filter((value) => value !== undefined).length;

  if (action.action !== 'DELETE' && approvalCount > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Akcja ${action.action} ${action.batchId} nie może zawierać zatwierdzenia.`,
    });
  }
  if (action.action === 'DELETE' && approvalCount > 0 && approvalCount !== approvalValues.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Akcja DELETE ${action.batchId} ma niekompletne dane zatwierdzenia.`,
    });
  }
  if (action.approvedBy !== undefined && action.approvedBy.trim().length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'approvedBy nie może być pusty.' });
  }
  if (action.approvalNote !== undefined && action.approvalNote.trim().length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'approvalNote nie może być pusta.' });
  }
  if (action.approvedAt !== undefined && !isIsoTimestamp(action.approvedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'approvedAt musi być prawidłowym timestampem ISO.' });
  }
});

const countByActionSchema = z.object({ KEEP: z.number().int().nonnegative(), DELETE: z.number().int().nonnegative(), REVIEW: z.number().int().nonnegative() });
const countByConfidenceSchema = z.object({ HIGH: z.number().int().nonnegative(), MEDIUM: z.number().int().nonnegative(), LOW: z.number().int().nonnegative() });

const repairManifestSchema = z.object({
  manifestVersion: z.literal(REPAIR_MANIFEST_VERSION),
  generatedAt: z.string().min(1),
  analysisFile: z.string().min(1),
  analysisSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  requiresApproval: z.literal(true),
  approved: z.boolean(),
  readOnly: z.literal(true),
  databaseOperationsPerformed: z.literal(false),
  summary: z.object({
    batches: z.number().int().nonnegative(),
    actions: z.number().int().nonnegative(),
    records: z.number().int().nonnegative(),
    actionsByType: countByActionSchema,
    recordsByAction: countByActionSchema,
    actionsByConfidence: countByConfidenceSchema,
    unresolvedActions: z.number().int().nonnegative(),
  }).passthrough(),
  actions: z.array(repairActionSchema),
  warnings: z.array(z.string()),
}).passthrough();

export type ExecutorRepairManifest = z.infer<typeof repairManifestSchema>;
type ExecutorRepairAction = ExecutorRepairManifest['actions'][number];

export interface ApprovalDetails {
  batchIds: string[];
  approvedBy: string;
  approvalNote: string;
  approvedAt: string;
}

export type ExecutorArguments =
  | { mode: 'summary'; manifestPath: string }
  | { mode: 'approve'; manifestPath: string; batchIds: string[]; approvedBy: string; approvalNote: string }
  | { mode: 'execute'; manifestPath: string };

function issueText(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');
}

function validateManifestInvariants(manifest: ExecutorRepairManifest) {
  if (!isIsoTimestamp(manifest.generatedAt)) {
    throw new Error('Manifest ma nieprawidłowe generatedAt.');
  }

  const batchIds = new Set<string>();
  const actionsByType = { KEEP: 0, DELETE: 0, REVIEW: 0 };
  const recordsByAction = { KEEP: 0, DELETE: 0, REVIEW: 0 };
  const actionsByConfidence = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const action of manifest.actions) {
    if (batchIds.has(action.batchId)) {
      throw new Error(`Manifest zawiera powtórzony batchId: ${action.batchId}.`);
    }
    batchIds.add(action.batchId);
    if (new Set(action.reportIds).size !== action.reportIds.length) {
      throw new Error(`Akcja ${action.batchId} zawiera powtórzone reportIds.`);
    }
    if (action.affectedRecords !== action.reportIds.length) {
      throw new Error(`Akcja ${action.batchId} ma niespójne affectedRecords.`);
    }
    if (action.action === 'DELETE' && !action.requiresManualReview) {
      throw new Error(`Akcja DELETE ${action.batchId} musi wymagać ręcznej weryfikacji.`);
    }
    actionsByType[action.action] += 1;
    recordsByAction[action.action] += action.affectedRecords;
    actionsByConfidence[action.confidence] += 1;
  }

  const records = manifest.actions.reduce((sum, action) => sum + action.affectedRecords, 0);
  if (manifest.summary.actions !== manifest.actions.length || manifest.summary.records !== records) {
    throw new Error('Podsumowanie manifestu jest niespójne z listą akcji.');
  }
  for (const action of actionNames) {
    if (
      manifest.summary.actionsByType[action] !== actionsByType[action]
      || manifest.summary.recordsByAction[action] !== recordsByAction[action]
    ) {
      throw new Error(`Podsumowanie manifestu jest niespójne dla akcji ${action}.`);
    }
  }
  for (const confidence of confidenceNames) {
    if (manifest.summary.actionsByConfidence[confidence] !== actionsByConfidence[confidence]) {
      throw new Error(`Podsumowanie manifestu jest niespójne dla confidence ${confidence}.`);
    }
  }

  const deleteActions = manifest.actions.filter((action) => action.action === 'DELETE');
  const allDeleteActionsApproved = deleteActions.length > 0
    && deleteActions.every((action) => action.approved === true);
  if (manifest.approved !== allDeleteActionsApproved) {
    throw new Error('Pole approved manifestu jest niespójne z zatwierdzeniami akcji DELETE.');
  }
}

export function parseRepairManifest(input: unknown): ExecutorRepairManifest {
  const version = input && typeof input === 'object'
    ? (input as Record<string, unknown>).manifestVersion
    : undefined;
  if (version !== REPAIR_MANIFEST_VERSION) {
    throw new Error(
      `Nieobsługiwana wersja manifestu: ${String(version)}. Oczekiwana: ${REPAIR_MANIFEST_VERSION}.`,
    );
  }
  const parsed = repairManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Nieprawidłowy Repair Manifest: ${issueText(parsed.error)}`);
  }
  validateManifestInvariants(parsed.data);
  return parsed.data;
}

function approvedDeleteActions(manifest: ExecutorRepairManifest) {
  return manifest.actions.filter((action) =>
    action.action === 'DELETE' && action.approved === true);
}

export function formatRepairSummary(input: unknown) {
  const manifest = parseRepairManifest(input);
  const deleteActions = manifest.actions.filter((action) => action.action === 'DELETE');
  const approvedDeletes = approvedDeleteActions(manifest);
  return [
    'Duplicate Repair Executor – podsumowanie manifestu',
    `Wersja manifestu: ${manifest.manifestVersion}`,
    `Wygenerowano: ${manifest.generatedAt}`,
    `Akcje: ${manifest.summary.actions}; rekordy: ${manifest.summary.records}`,
    `KEEP: ${manifest.summary.actionsByType.KEEP}; DELETE: ${manifest.summary.actionsByType.DELETE}; REVIEW: ${manifest.summary.actionsByType.REVIEW}`,
    `Zatwierdzone DELETE: ${approvedDeletes.length}/${deleteActions.length}`,
    `Pełne zatwierdzenie manifestu: ${manifest.approved ? 'tak' : 'nie'}`,
    'Dostęp do bazy: nie.',
  ].join('\n') + '\n';
}

export function approveRepairActions(input: unknown, details: ApprovalDetails) {
  const manifest = parseRepairManifest(input);
  const batchIds = details.batchIds.map((batchId) => batchId.trim());
  if (batchIds.length === 0 || batchIds.some((batchId) => batchId.length === 0)) {
    throw new Error('Należy wskazać co najmniej jeden batch do zatwierdzenia.');
  }
  if (new Set(batchIds).size !== batchIds.length) {
    throw new Error('Ten sam batch nie może zostać podany w --approve więcej niż raz.');
  }
  const approvedBy = details.approvedBy.trim();
  const approvalNote = details.approvalNote.trim();
  if (!approvedBy) throw new Error('--approved-by nie może być pusty.');
  if (!approvalNote) throw new Error('--note nie może być pusta.');
  if (!isIsoTimestamp(details.approvedAt)) {
    throw new Error('approvedAt musi być prawidłowym timestampem ISO.');
  }

  const actionByBatchId = new Map(manifest.actions.map((action) => [action.batchId, action]));
  const targets = batchIds.map((batchId) => {
    const action = actionByBatchId.get(batchId);
    if (!action) throw new Error(`Batch ${batchId} nie istnieje w manifeście.`);
    if (action.action !== 'DELETE') {
      throw new Error(`Nie można zatwierdzić akcji ${action.action} dla batcha ${batchId}.`);
    }
    if (action.approved === true) throw new Error(`Batch ${batchId} jest już zatwierdzony.`);
    return action;
  });

  targets.forEach((action) => {
    action.approved = true;
    action.approvedBy = approvedBy;
    action.approvedAt = new Date(details.approvedAt).toISOString();
    action.approvalNote = approvalNote;
  });
  const deleteActions = manifest.actions.filter((action) => action.action === 'DELETE');
  manifest.approved = deleteActions.length > 0
    && deleteActions.every((action) => action.approved === true);
  return parseRepairManifest(manifest);
}

async function readJsonFile(manifestPath: string) {
  const source = await fs.readFile(manifestPath, 'utf8');
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error('Plik repair-manifest.json nie zawiera prawidłowego JSON.');
  }
}

async function resolvedManifestPath(value: string) {
  const manifestPath = await fs.realpath(path.resolve(process.cwd(), value));
  if (path.basename(manifestPath) !== 'repair-manifest.json') {
    throw new Error('Plik wejściowy musi nazywać się repair-manifest.json.');
  }
  return manifestPath;
}

async function writeManifestAtomically(manifestPath: string, manifest: ExecutorRepairManifest) {
  const temporaryPath = path.join(
    path.dirname(manifestPath),
    `.${path.basename(manifestPath)}.${process.pid}-${randomUUID()}.tmp`,
  );
  const mode = (await fs.stat(manifestPath)).mode & 0o777;
  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode },
    );
    await fs.rename(temporaryPath, manifestPath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function withManifestLock<T>(manifestPath: string, operation: () => Promise<T>) {
  const lockPath = path.join(path.dirname(manifestPath), `.${path.basename(manifestPath)}.lock`);
  let lock: Awaited<ReturnType<typeof fs.open>>;
  try {
    lock = await fs.open(lockPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Manifest jest aktualnie zatwierdzany przez inny proces.');
    }
    throw error;
  }
  try {
    return await operation();
  } finally {
    try {
      await lock.close();
    } finally {
      await fs.unlink(lockPath).catch(() => undefined);
    }
  }
}

export async function approveManifestFile(
  manifestArgument: string,
  details: ApprovalDetails,
) {
  const manifestPath = await resolvedManifestPath(manifestArgument);
  return withManifestLock(manifestPath, async () => {
    const approved = approveRepairActions(await readJsonFile(manifestPath), details);
    await writeManifestAtomically(manifestPath, approved);
    return { manifestPath, manifest: approved };
  });
}

export async function summarizeManifestFile(manifestArgument: string) {
  const manifestPath = await resolvedManifestPath(manifestArgument);
  return formatRepairSummary(await readJsonFile(manifestPath));
}

export function validateExecutionStub(input: unknown) {
  const manifest = parseRepairManifest(input);
  if (approvedDeleteActions(manifest).length === 0) {
    throw new Error('Manifest nie zawiera zatwierdzonych akcji DELETE.');
  }
  return REPAIR_EXECUTION_STUB_MESSAGE;
}

export async function executeManifestFile(manifestArgument: string) {
  const manifestPath = await resolvedManifestPath(manifestArgument);
  return validateExecutionStub(await readJsonFile(manifestPath));
}

export function usage() {
  return [
    'Użycie:',
    '  npm run duplicates:repair -- --manifest reports/.../repair-manifest.json --summary',
    '  npm run duplicates:repair -- --manifest reports/.../repair-manifest.json --approve batch-id --approved-by "Imię i nazwisko" --note "Opis weryfikacji"',
    '  npm run duplicates:repair -- --manifest reports/.../repair-manifest.json --execute',
    '',
    'Executor nie importuje Prisma, nie używa DATABASE_URL i nie łączy się z bazą.',
  ].join('\n');
}

function argumentValue(argv: string[], index: number, name: string) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Brak wartości dla ${name}.`);
  return value;
}

export function parseExecutorArguments(argv: string[]): ExecutorArguments {
  let manifestPath: string | null = null;
  let summary = false;
  let execute = false;
  const batchIds: string[] = [];
  let approvedBy: string | null = null;
  let approvalNote: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') {
      if (manifestPath !== null) throw new Error('--manifest może wystąpić tylko raz.');
      manifestPath = argumentValue(argv, index, argument);
      index += 1;
    } else if (argument === '--summary') {
      if (summary) throw new Error('--summary może wystąpić tylko raz.');
      summary = true;
    } else if (argument === '--execute') {
      if (execute) throw new Error('--execute może wystąpić tylko raz.');
      execute = true;
    } else if (argument === '--approve') {
      batchIds.push(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === '--approved-by') {
      if (approvedBy !== null) throw new Error('--approved-by może wystąpić tylko raz.');
      approvedBy = argumentValue(argv, index, argument);
      index += 1;
    } else if (argument === '--note') {
      if (approvalNote !== null) throw new Error('--note może wystąpić tylko raz.');
      approvalNote = argumentValue(argv, index, argument);
      index += 1;
    } else {
      throw new Error(`Nieznany argument: ${argument}.\n${usage()}`);
    }
  }

  if (!manifestPath) throw new Error(`Wymagany jest --manifest.\n${usage()}`);
  const modeCount = Number(summary) + Number(execute) + Number(batchIds.length > 0);
  if (modeCount !== 1) throw new Error('Należy wybrać dokładnie jeden tryb: --summary, --approve albo --execute.');
  if (batchIds.length > 0) {
    if (!approvedBy || !approvalNote) {
      throw new Error('Tryb --approve wymaga --approved-by oraz --note.');
    }
    return { mode: 'approve', manifestPath, batchIds, approvedBy, approvalNote };
  }
  if (approvedBy || approvalNote) {
    throw new Error('--approved-by i --note są dozwolone wyłącznie w trybie --approve.');
  }
  return summary
    ? { mode: 'summary', manifestPath }
    : { mode: 'execute', manifestPath };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const arguments_ = parseExecutorArguments(argv);
  if (arguments_.mode === 'approve') {
    const result = await approveManifestFile(arguments_.manifestPath, {
      batchIds: arguments_.batchIds,
      approvedBy: arguments_.approvedBy,
      approvalNote: arguments_.approvalNote,
      approvedAt: new Date().toISOString(),
    });
    process.stdout.write(
      `Zatwierdzono akcje DELETE: ${arguments_.batchIds.join(', ')}\nManifest: ${result.manifestPath}\n`,
    );
    return;
  }

  if (arguments_.mode === 'summary') {
    process.stdout.write(await summarizeManifestFile(arguments_.manifestPath));
    return;
  }
  process.stdout.write(`${await executeManifestFile(arguments_.manifestPath)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
