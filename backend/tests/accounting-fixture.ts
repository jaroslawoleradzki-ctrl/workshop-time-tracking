import { vi } from 'vitest';
export function accountingFixture(absence = 16, missing = 0) {
  const types = [
    { code: 'G', name: 'Praca', isAbsence: false, requiresOrder: true },
    { code: 'UW', name: 'Urlop', isAbsence: true, requiresOrder: false },
    { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
  ];
  const reports = [
    { hours: 40, workTimeTypeCode: 'G', orderId: 'ord-1' },
    { hours: absence, workTimeTypeCode: 'UW', orderId: 'ord-1' },
    ...(missing ? [{ hours: missing, workTimeTypeCode: 'SZK', orderId: null }] : []),
  ].map(r => ({ ...r, employeeId: 'emp-1', employee: { firstName: 'Jan', lastName: 'Testowy', fullName: 'Testowy Jan' },
    workTimeType: types.find(t => t.code === r.workTimeTypeCode), date: new Date('2026-08-15'), order: r.orderId ? { orderNumber: 'ZL-TEST' } : null }));
  return {
    order: { findMany: vi.fn(async (args: any) => args.select ? [{ id: 'ord-1' }] : [{
      id: 'ord-1', orderNumber: 'ZL-TEST', productName: 'Test', plannedHours: 40, quantity: 1, quantityUnit: 'szt.',
      orderDate: new Date('2026-08-01'), status: 'OPEN', completionDate: null,
      // The fake applies the production relation predicate, rather than returning
      // desired totals independently from the underlying reports.
      reports: reports.filter(r => r.orderId && (!args.include.reports.where.workTimeType || !r.workTimeType?.isAbsence)),
    }]) },
    workTimeType: { findMany: vi.fn(async (args: any) => args.where?.accountingCategory ? [] : args.where?.OR ? types.filter(t => t.isAbsence) : types) },
    workTimeReport: { findMany: vi.fn(async (args: any) => args.where?.OR ? reports.filter(r => r.workTimeType?.isAbsence) : reports) },
  };
}
