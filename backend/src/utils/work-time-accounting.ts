import { Prisma } from '@prisma/client';

export const CATEGORIES = ['ORDER_WORK', 'ABSENCE', 'OFF_ORDER_WORK'] as const;
export type Category = typeof CATEGORIES[number];
type Type = { code?: string; isAbsence?: boolean; requiresOrder?: boolean; accountingCategory?: string | null };
export function flagsForCategory(category: Category) {
  return { requiresOrder: category === 'ORDER_WORK', isAbsence: category === 'ABSENCE' };
}
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
export function isAbsenceType(type: Type): boolean {
  return type.code === 'NN' || (type.accountingCategory ? type.accountingCategory === 'ABSENCE' : Boolean(type.isAbsence));
}
export function isOffOrderType(type: Type): boolean {
  return type.code !== 'NN' && type.accountingCategory === 'OFF_ORDER_WORK';
}
// API and the database constraint keep flags in sync for explicit categories.
// NULL preserves all existing flags; NN remains excluded regardless of its flag.
export const orderHoursWhere: Prisma.WorkTimeReportWhereInput = {
  workTimeTypeCode: { not: 'NN' },
  workTimeType: {
    isAbsence: false,
    OR: [{ accountingCategory: null }, { accountingCategory: 'ORDER_WORK' }],
  },
};
