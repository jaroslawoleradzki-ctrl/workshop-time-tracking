import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateReportInput,
  analyzeDuplicateReports,
} from '../scripts/duplicate-report-classifier';

const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '10000000-0000-4000-8000-000000000001';
let reportSequence = 0;

function report(params: {
  date: string;
  createdAt: string;
  orderId?: string | null;
  orderNumber?: string | null;
  hours?: number;
  type?: string;
  userId?: string;
  audit?: boolean;
}): DuplicateReportInput {
  reportSequence += 1;
  const id = `report-${String(reportSequence).padStart(4, '0')}`;
  const userId = params.userId || USER_ID;
  return {
    id,
    date: params.date,
    employeeId: EMPLOYEE_ID,
    employeeName: 'Pracownik testowy',
    orderId: params.orderId === undefined ? 'order-a' : params.orderId,
    orderNumber: params.orderNumber === undefined ? '530-2-01' : params.orderNumber,
    orderName: params.orderId === null ? null : 'Produkt testowy',
    hours: params.hours ?? 4,
    workTimeTypeCode: params.type || 'G',
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    deletedAt: null,
    createdByUserId: userId,
    createdByUserName: 'Lider testowy',
    modifiedByUserId: null,
    modifiedByUserName: null,
    createAudit: params.audit === false
      ? null
      : {
          id: `audit-${id}`,
          userId,
          userName: 'Lider testowy',
          createdAt: new Date(new Date(params.createdAt).getTime() + 10).toISOString(),
        },
  };
}

function analyze(reports: DuplicateReportInput[], from = '2026-07-01', to = '2026-07-10') {
  return analyzeDuplicateReports(reports, { from, to, copyBurstWindowMs: 5_000 });
}

beforeEach(() => {
  reportSequence = 0;
});

describe('duplicate report classification', () => {
  it('does not flag a normal valid report', () => {
    const result = analyze([
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:00:00.000Z' }),
    ]);

    expect(result.groups).toHaveLength(0);
    expect(result.highCandidates).toHaveLength(0);
  });

  it('classifies two identical manual reports created at different times as LOW', () => {
    const result = analyze([
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:00:00.000Z' }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.000Z' }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T14:00:00.000Z' }),
    ]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ confidence: 'LOW', identicalCount: 2 });
    expect(result.groups[0].creationSpanMs).toBe(6 * 60 * 60 * 1_000);
    expect(result.highCandidates).toHaveLength(0);
  });

  it('exports the complete record state required by Repair Manifest v2', () => {
    const result = analyze([
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.000Z', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T14:00:00.000Z', hours: 4 }),
    ]);

    expect(result.groups[0].records[0]).toMatchObject({
      date: '2026-07-02',
      employeeId: EMPLOYEE_ID,
      orderId: 'order-a',
      orderNumber: '530-2-01',
      orderName: 'Produkt testowy',
      hours: '4.00',
      workTimeTypeCode: 'G',
      createdAt: '2026-07-02T08:00:00.000Z',
      updatedAt: '2026-07-02T08:00:00.000Z',
      deletedAt: null,
      createdByUserId: USER_ID,
      modifiedByUserId: null,
      createAuditId: expect.any(String),
      copyBatchId: expect.any(String),
    });
  });

  it('recognizes one valid copy operation without creating duplicate candidates', () => {
    const reports = [
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:01:00.000Z', orderId: 'order-b', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.050Z', orderId: 'order-b', hours: 4 }),
    ];

    const result = analyze(reports, '2026-07-02', '2026-07-02');

    expect(result.groups).toHaveLength(0);
    expect(result.copyBatches).toHaveLength(1);
    expect(result.copyBatches[0]).toMatchObject({ sourceMatch: 'EXACT', repetitionFactor: 1 });
    expect(result.highCandidates).toHaveLength(0);
  });

  it('classifies multiple parallel copies of the same source set as HIGH', () => {
    const reports = [
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:01:00.000Z', orderId: 'order-b', hours: 6 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.020Z', orderId: 'order-b', hours: 6 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.040Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.060Z', orderId: 'order-b', hours: 6 }),
    ];

    const result = analyze(reports, '2026-07-02', '2026-07-02');

    expect(result.groups).toHaveLength(2);
    expect(result.groups.every((group) => group.confidence === 'HIGH')).toBe(true);
    expect(result.groups.every((group) => group.evidence.includes('COPY_BATCH_REPEATED_SOURCE_SET'))).toBe(true);
    expect(result.highCandidates).toHaveLength(2);
    expect(result.summary.highCandidateRecords).toBe(4);
  });

  it('propagates HIGH confidence through avalanche copies across several days', () => {
    const reports = [
      report({ date: '2026-07-01', createdAt: '2026-07-01T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.020Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-03', createdAt: '2026-07-03T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-03', createdAt: '2026-07-03T08:00:00.020Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-04', createdAt: '2026-07-04T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-04', createdAt: '2026-07-04T08:00:00.020Z', orderId: 'order-a', hours: 4 }),
    ];

    const result = analyze(reports, '2026-07-02', '2026-07-04');
    const dayTwo = result.groups.find((group) => group.identity.date === '2026-07-02');
    const dayThree = result.groups.find((group) => group.identity.date === '2026-07-03');
    const dayFour = result.groups.find((group) => group.identity.date === '2026-07-04');

    expect(dayTwo).toMatchObject({ confidence: 'HIGH', cascadeDepth: 0 });
    expect(dayThree).toMatchObject({ confidence: 'HIGH', cascadeDepth: 1 });
    expect(dayFour).toMatchObject({ confidence: 'HIGH', cascadeDepth: 2 });
    expect(dayThree?.evidence).toContain('CASCADE_FROM_HIGH_SOURCE_GROUP');
    expect(dayFour?.evidence).toContain('CASCADE_FROM_HIGH_SOURCE_GROUP');
  });

  it('keeps leave and absence entries without orderId separate by work time type', () => {
    const result = analyze([
      report({
        date: '2026-07-02',
        createdAt: '2026-07-02T08:00:00.000Z',
        orderId: null,
        orderNumber: null,
        hours: 8,
        type: 'UW',
      }),
      report({
        date: '2026-07-02',
        createdAt: '2026-07-02T08:00:00.020Z',
        orderId: null,
        orderNumber: null,
        hours: 8,
        type: 'NN',
      }),
    ]);

    expect(result.groups).toHaveLength(0);
    expect(result.highCandidates).toHaveLength(0);
  });

  it('does not group different hour sets for the same employee and day', () => {
    const result = analyze([
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.000Z', hours: 4 }),
      report({ date: '2026-07-02', createdAt: '2026-07-02T08:00:00.020Z', hours: 8 }),
    ]);

    expect(result.groups).toHaveLength(0);
    expect(result.highCandidates).toHaveLength(0);
  });
});

  it('classifies repeated import sessions minutes apart as HIGH regression', () => {
    const reports = [
      report({ date: '2026-07-16', createdAt: '2026-07-16T08:00:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-16', createdAt: '2026-07-16T08:00:01.000Z', orderId: 'order-b', hours: 3 }),
      report({ date: '2026-07-16', createdAt: '2026-07-16T08:00:02.000Z', orderId: 'order-c', hours: 1 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:45:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:45:01.000Z', orderId: 'order-b', hours: 3 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:45:02.000Z', orderId: 'order-c', hours: 1 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:50:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:50:01.000Z', orderId: 'order-b', hours: 3 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:50:02.000Z', orderId: 'order-c', hours: 1 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:56:00.000Z', orderId: 'order-a', hours: 4 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:56:01.000Z', orderId: 'order-b', hours: 3 }),
      report({ date: '2026-07-17', createdAt: '2026-07-17T09:56:02.000Z', orderId: 'order-c', hours: 1 }),
    ];

    const result = analyze(reports, '2026-07-17', '2026-07-17');

    expect(result.groups).toHaveLength(3);
    expect(result.groups.every((group) => group.confidence === 'HIGH')).toBe(true);
    expect(result.groups.every((group) => group.evidence.includes('REPEATED_IMPORT_SESSION'))).toBe(true);
    expect(result.copyBatches.filter((batch) => batch.repeatedImportSessionOf !== null)).toHaveLength(2);
  });
