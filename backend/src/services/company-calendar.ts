import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../utils/prisma';
import { formatDateString, parseDateString } from '../utils/date';

export type CalendarDecisionSource = 'standard weekday' | 'weekend' | 'company override';

export interface WorkingDayDecision {
  date: string;
  isWorkingDay: boolean;
  source: CalendarDecisionSource;
  reason?: string;
}

type CalendarClient = PrismaClient | Prisma.TransactionClient;

export async function getWorkingDayDecision(
  dateInput: Date | string,
  client: CalendarClient = prisma,
): Promise<WorkingDayDecision> {
  const date = typeof dateInput === 'string' ? parseDateString(dateInput) : dateInput;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error('Nieprawidłowa data kalendarza');
  }

  const dateKey = formatDateString(date);
  const dateValue = parseDateString(dateKey)!;
  // Unit tests and legacy transaction doubles may not expose the newly added
  // model. In that case there cannot be an override, so use the base calendar.
  // A configured production client always has the generated model available.
  const calendarModel = (client as any).companyCalendarDay;
  const override = calendarModel
    ? await calendarModel.findUnique({ where: { date: dateValue } })
    : null;

  if (override) {
    return {
      date: dateKey,
      isWorkingDay: override.isWorkingDay,
      source: 'company override',
      ...(override.reason ? { reason: override.reason } : {}),
    };
  }

  const dayOfWeek = dateValue.getUTCDay();
  return {
    date: dateKey,
    isWorkingDay: dayOfWeek !== 0 && dayOfWeek !== 6,
    source: dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'standard weekday',
  };
}

export async function isWorkingDay(dateInput: Date | string, client: CalendarClient = prisma) {
  return (await getWorkingDayDecision(dateInput, client)).isWorkingDay;
}
