import { formatDateString, parseDateString } from './date';

export interface PolishHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Calculates Easter Sunday for a given Gregorian year using the
 * Anonymous Gregorian / Meeus-Jones-Butcher algorithm.
 */
export function getEasterSunday(year: number): { year: number; month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { year, month, day };
}

function addDaysToUtcDate(year: number, month: number, day: number, daysToAdd: number): string {
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return formatDateString(date);
}

/**
 * Returns a map of all statutory Polish public holidays for a given year (date -> name).
 * Based on the Polish Act of 18 January 1951 on non-working days (Dz.U. z 2020 r. poz. 1920).
 */
export function getPolishHolidaysForYear(year: number): Map<string, string> {
  const holidays = new Map<string, string>();

  // Fixed holidays
  const pad = (n: number) => String(n).padStart(2, '0');
  holidays.set(`${year}-01-01`, 'Nowy Rok');
  holidays.set(`${year}-01-06`, 'Święto Trzech Króli');
  holidays.set(`${year}-05-01`, 'Święto Pracy');
  holidays.set(`${year}-05-03`, 'Święto Narodowe Trzeciego Maja');
  holidays.set(`${year}-08-15`, 'Wniebowzięcie Najświętszej Maryi Panny');
  holidays.set(`${year}-11-01`, 'Wszystkich Świętych');
  holidays.set(`${year}-11-11`, 'Narodowe Święto Niepodległości');
  if (year >= 2025) {
    holidays.set(`${year}-12-24`, 'Wigilia Bożego Narodzenia');
  }
  holidays.set(`${year}-12-25`, 'Pierwszy dzień Bożego Narodzenia');
  holidays.set(`${year}-12-26`, 'Drugi dzień Bożego Narodzenia');

  // Movable holidays
  const easter = getEasterSunday(year);
  const easterDateStr = `${year}-${pad(easter.month)}-${pad(easter.day)}`;
  holidays.set(easterDateStr, 'Niedziela Wielkanocna');

  const easterMondayStr = addDaysToUtcDate(easter.year, easter.month, easter.day, 1);
  holidays.set(easterMondayStr, 'Poniedziałek Wielkanocny');

  // Zielone Świątki: 49 days after Easter (7th Sunday after Easter)
  const pentecostStr = addDaysToUtcDate(easter.year, easter.month, easter.day, 49);
  holidays.set(pentecostStr, 'Zielone Świątki');

  // Boże Ciało: 60 days after Easter (Thursday)
  const corpusChristiStr = addDaysToUtcDate(easter.year, easter.month, easter.day, 60);
  holidays.set(corpusChristiStr, 'Boże Ciało');

  return holidays;
}

// Simple in-memory cache per year
const holidayCacheByYear = new Map<number, Map<string, string>>();

function getYearHolidays(year: number): Map<string, string> {
  let cached = holidayCacheByYear.get(year);
  if (!cached) {
    cached = getPolishHolidaysForYear(year);
    holidayCacheByYear.set(year, cached);
  }
  return cached;
}

/**
 * Returns holiday name if the date is a Polish public holiday, or null otherwise.
 * dateStr must be in YYYY-MM-DD format.
 */
export function getPolishHolidayName(dateStr: string): string | null {
  const date = parseDateString(dateStr);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const holidays = getYearHolidays(year);
  return holidays.get(dateStr) ?? null;
}

/**
 * Returns true if the date is a Polish public holiday.
 */
export function isPolishHoliday(dateStr: string): boolean {
  return getPolishHolidayName(dateStr) !== null;
}
