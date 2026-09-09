/**
 * Date utility functions for deterministic date manipulations and weekend detection.
 * All functions operate in UTC to prevent timezone offsets.
 */

/**
 * Parse YYYY-MM-DD string into a UTC Date object set to 00:00:00.000Z.
 * Returns null if format or value is invalid.
 */
export function parseDateString(dateStr: string): Date | null {
  if (typeof dateStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Format a Date object to YYYY-MM-DD UTC string.
 */
export function formatDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns true if the date is a weekend day (Saturday = 6, Sunday = 0).
 */
export function isWeekend(dateInput: Date | string): boolean {
  let date: Date | null;
  if (typeof dateInput === 'string') {
    date = parseDateString(dateInput);
  } else {
    date = dateInput;
  }

  if (!date || Number.isNaN(date.getTime())) return false;
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Returns true if the day is a non-working day (currently weekends; extendable for holidays in the future).
 */
export function isNonWorkingDay(dateInput: Date | string): boolean {
  return isWeekend(dateInput);
}

/**
 * Generates an array of YYYY-MM-DD strings for all calendar days from dateFromStr to dateToStr inclusive.
 * Returns empty array if dateFrom > dateTo or if dates are invalid.
 */
export function getDatesInRange(dateFromStr: string, dateToStr: string): string[] {
  const startDate = parseDateString(dateFromStr);
  const endDate = parseDateString(dateToStr);

  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const result: string[] = [];
  const current = new Date(startDate.getTime());

  while (current <= endDate) {
    result.push(formatDateString(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}
