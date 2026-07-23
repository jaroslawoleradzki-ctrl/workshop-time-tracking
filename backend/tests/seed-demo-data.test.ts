import { OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { buildDemoData, DEMO_DATE_RANGE } from '../prisma/seed-demo-data';

function countAbsenceEpisodes(
  reports: ReturnType<typeof buildDemoData>['reports'],
  code: string,
): number {
  const datesByEmployee = new Map<string, string[]>();

  for (const report of reports.filter((entry) => entry.workTimeTypeCode === code)) {
    const dates = datesByEmployee.get(report.employeeId) ?? [];
    dates.push(report.date.toISOString().slice(0, 10));
    datesByEmployee.set(report.employeeId, dates);
  }

  let episodes = 0;
  for (const dates of datesByEmployee.values()) {
    dates.sort();
    let previousDate: Date | undefined;

    for (const isoDate of dates) {
      const currentDate = new Date(`${isoDate}T00:00:00.000Z`);
      if (!previousDate || currentDate.getTime() - previousDate.getTime() > 24 * 60 * 60 * 1000) {
        episodes++;
      }
      previousDate = currentDate;
    }
  }

  return episodes;
}

describe('deterministic LaserCAD demo data', () => {
  it('creates the requested users, employees, work time types and orders', () => {
    const data = buildDemoData();

    expect(data.users).toHaveLength(2);
    expect(data.employees).toHaveLength(15);
    expect(data.workTimeTypes.map((type) => type.code)).toEqual([
      'G',
      'NDR',
      'NS',
      'UW',
      'UOK',
      'UŻ',
      'L4',
    ]);
    expect(data.orders).toHaveLength(30);
    expect(data.orders.filter((order) => order.isActive)).toHaveLength(20);
    expect(data.orders.filter((order) => order.status === OrderStatus.CLOSED)).toHaveLength(10);
  });

  it('uses a deterministic bcrypt hash for the demo password', () => {
    const first = buildDemoData();
    const second = buildDemoData();

    expect(first.users[0].passwordHash).toBe(second.users[0].passwordHash);
    expect(first.users[0].passwordHash).not.toBe('LaserCAD2026!');
    expect(bcrypt.compareSync('LaserCAD2026!', first.users[0].passwordHash)).toBe(true);
  });

  it('generates the same complete dataset on every build', () => {
    expect(buildDemoData()).toEqual(buildDemoData());
  });

  it('covers the requested report range and planned absences', () => {
    const { reports } = buildDemoData();
    const reportDates = reports.map((report) => report.date.toISOString().slice(0, 10));

    expect(reports).toHaveLength(1886);
    expect(reportDates).toContain(DEMO_DATE_RANGE.start);
    expect(reportDates).toContain(DEMO_DATE_RANGE.end);
    expect(reports.filter((report) => report.workTimeTypeCode === 'UW')).toHaveLength(20);
    expect(countAbsenceEpisodes(reports, 'L4')).toBe(3);
    expect(reports.filter((report) => report.workTimeTypeCode === 'UŻ')).toHaveLength(2);
    expect(reports.filter((report) => report.workTimeTypeCode === 'UOK')).toHaveLength(1);
  });

  it('never mixes production with leave or sick leave for one employee and day', () => {
    const { reports } = buildDemoData();
    const grouped = new Map<string, typeof reports>();

    for (const report of reports) {
      const key = `${report.employeeId}:${report.date.toISOString().slice(0, 10)}`;
      const entries = grouped.get(key) ?? [];
      entries.push(report);
      grouped.set(key, entries);
    }

    for (const entries of grouped.values()) {
      const hasAbsence = entries.some((entry) => ['UW', 'UOK', 'UŻ', 'L4'].includes(entry.workTimeTypeCode));
      if (hasAbsence) {
        expect(entries).toHaveLength(1);
        expect(entries[0].orderId).toBeNull();
        expect(Number(entries[0].hours)).toBe(8);
      }

      const regularEntries = entries.filter((entry) => entry.workTimeTypeCode === 'G');
      const regularHours = regularEntries
        .reduce((sum, entry) => sum + Number(entry.hours), 0);
      if (regularHours > 0) {
        expect(regularHours).toBe(8);
        expect(regularEntries.length).toBeGreaterThanOrEqual(1);
        expect(regularEntries.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps order requirements, overtime limits and varied employee schedules', () => {
    const { employees, orders, reports } = buildDemoData();
    const openOrderIds = new Set(
      orders
        .filter((order) => order.status === OrderStatus.OPEN && order.isActive)
        .map((order) => order.id),
    );

    for (const report of reports) {
      const date = report.date.toISOString().slice(0, 10);
      const requiresOrder = ['G', 'NDR', 'NS'].includes(report.workTimeTypeCode);

      expect(date >= DEMO_DATE_RANGE.start && date <= DEMO_DATE_RANGE.end).toBe(true);
      expect(requiresOrder ? openOrderIds.has(report.orderId) : report.orderId === null).toBe(true);

      if (report.workTimeTypeCode === 'NDR') {
        expect([1, 2]).toContain(Number(report.hours));
      }
      if (report.workTimeTypeCode === 'NS') {
        expect(report.date.getUTCDay()).toBe(6);
      }
    }

    const scheduleSignatures = employees.map((employee) =>
      reports
        .filter((report) => report.employeeId === employee.id)
        .map((report) => `${report.date.toISOString().slice(0, 10)}:${report.workTimeTypeCode}:${report.hours}`)
        .join('|'),
    );

    expect(new Set(scheduleSignatures).size).toBe(15);
  });
});
