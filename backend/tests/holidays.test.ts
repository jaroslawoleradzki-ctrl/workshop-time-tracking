import { describe, expect, it } from 'vitest';
import {
  getEasterSunday,
  getPolishHolidaysForYear,
  getPolishHolidayName,
  isPolishHoliday,
} from '../src/utils/holidays';

describe('Polish holidays utility', () => {
  it('correctly calculates Easter Sunday for known years', () => {
    // 2024: March 31
    expect(getEasterSunday(2024)).toEqual({ year: 2024, month: 3, day: 31 });
    // 2025: April 20
    expect(getEasterSunday(2025)).toEqual({ year: 2025, month: 4, day: 20 });
    // 2026: April 5
    expect(getEasterSunday(2026)).toEqual({ year: 2026, month: 4, day: 5 });
    // 2027: March 28
    expect(getEasterSunday(2027)).toEqual({ year: 2027, month: 3, day: 28 });
    // 2030: April 21
    expect(getEasterSunday(2030)).toEqual({ year: 2030, month: 4, day: 21 });
  });

  it('contains all 13 statutory Polish public holidays for 2026', () => {
    const holidays = getPolishHolidaysForYear(2026);
    expect(holidays.size).toBe(13);

    expect(holidays.get('2026-01-01')).toBe('Nowy Rok');
    expect(holidays.get('2026-01-06')).toBe('Święto Trzech Króli');
    expect(holidays.get('2026-04-05')).toBe('Niedziela Wielkanocna');
    expect(holidays.get('2026-04-06')).toBe('Poniedziałek Wielkanocny');
    expect(holidays.get('2026-05-01')).toBe('Święto Pracy');
    expect(holidays.get('2026-05-03')).toBe('Święto Narodowe Trzeciego Maja');
    expect(holidays.get('2026-05-24')).toBe('Zielone Świątki');
    expect(holidays.get('2026-06-04')).toBe('Boże Ciało');
    expect(holidays.get('2026-08-15')).toBe('Wniebowzięcie Najświętszej Maryi Panny');
    expect(holidays.get('2026-11-01')).toBe('Wszystkich Świętych');
    expect(holidays.get('2026-11-11')).toBe('Narodowe Święto Niepodległości');
    expect(holidays.get('2026-12-25')).toBe('Pierwszy dzień Bożego Narodzenia');
    expect(holidays.get('2026-12-26')).toBe('Drugi dzień Bożego Narodzenia');
  });

  it('identifies public holidays and regular working days via helper functions', () => {
    expect(isPolishHoliday('2026-01-01')).toBe(true);
    expect(getPolishHolidayName('2026-01-01')).toBe('Nowy Rok');

    expect(isPolishHoliday('2026-06-04')).toBe(true);
    expect(getPolishHolidayName('2026-06-04')).toBe('Boże Ciało');

    expect(isPolishHoliday('2026-11-11')).toBe(true);
    expect(getPolishHolidayName('2026-11-11')).toBe('Narodowe Święto Niepodległości');

    // Regular weekday
    expect(isPolishHoliday('2026-01-02')).toBe(false);
    expect(getPolishHolidayName('2026-01-02')).toBeNull();

    // Invalid date string
    expect(isPolishHoliday('invalid-date')).toBe(false);
    expect(getPolishHolidayName('invalid-date')).toBeNull();
  });
});
