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
    // 2028: April 16 (leap year)
    expect(getEasterSunday(2028)).toEqual({ year: 2028, month: 4, day: 16 });
    // 2030: April 21
    expect(getEasterSunday(2030)).toEqual({ year: 2030, month: 4, day: 21 });
    // 2038: April 25 (latest possible Easter)
    expect(getEasterSunday(2038)).toEqual({ year: 2038, month: 4, day: 25 });
  });

  it('contains 13 statutory Polish public holidays for 2024 (pre-2025 baseline without Wigilia)', () => {
    const holidays2024 = getPolishHolidaysForYear(2024);
    expect(holidays2024.size).toBe(13);
    expect(holidays2024.has('2024-12-24')).toBe(false);
    expect(isPolishHoliday('2024-12-24')).toBe(false);
    expect(getPolishHolidayName('2024-12-24')).toBeNull();
    expect(holidays2024.get('2024-12-25')).toBe('Pierwszy dzień Bożego Narodzenia');
    expect(holidays2024.get('2024-12-26')).toBe('Drugi dzień Bożego Narodzenia');
  });

  it('contains all 14 statutory Polish public holidays for 2025 and 2026 including Wigilia Bożego Narodzenia', () => {
    // 2025 (14 holidays)
    const holidays2025 = getPolishHolidaysForYear(2025);
    expect(holidays2025.size).toBe(14);
    expect(holidays2025.get('2025-12-24')).toBe('Wigilia Bożego Narodzenia');
    expect(isPolishHoliday('2025-12-24')).toBe(true);
    expect(getPolishHolidayName('2025-12-24')).toBe('Wigilia Bożego Narodzenia');
    expect(holidays2025.get('2025-12-25')).toBe('Pierwszy dzień Bożego Narodzenia');
    expect(holidays2025.get('2025-12-26')).toBe('Drugi dzień Bożego Narodzenia');

    // 2026 (14 holidays)
    const holidays2026 = getPolishHolidaysForYear(2026);
    expect(holidays2026.size).toBe(14);

    expect(holidays2026.get('2026-01-01')).toBe('Nowy Rok');
    expect(holidays2026.get('2026-01-06')).toBe('Święto Trzech Króli');
    expect(holidays2026.get('2026-04-05')).toBe('Niedziela Wielkanocna');
    expect(holidays2026.get('2026-04-06')).toBe('Poniedziałek Wielkanocny');
    expect(holidays2026.get('2026-05-01')).toBe('Święto Pracy');
    expect(holidays2026.get('2026-05-03')).toBe('Święto Narodowe Trzeciego Maja');
    expect(holidays2026.get('2026-05-24')).toBe('Zielone Świątki');
    expect(holidays2026.get('2026-06-04')).toBe('Boże Ciało');
    expect(holidays2026.get('2026-08-15')).toBe('Wniebowzięcie Najświętszej Maryi Panny');
    expect(holidays2026.get('2026-11-01')).toBe('Wszystkich Świętych');
    expect(holidays2026.get('2026-11-11')).toBe('Narodowe Święto Niepodległości');
    expect(holidays2026.get('2026-12-24')).toBe('Wigilia Bożego Narodzenia');
    expect(holidays2026.get('2026-12-25')).toBe('Pierwszy dzień Bożego Narodzenia');
    expect(holidays2026.get('2026-12-26')).toBe('Drugi dzień Bożego Narodzenia');
  });

  it('correctly calculates movable holidays for different years (2025 and 2028)', () => {
    // 2025: Easter on 2025-04-20
    const h2025 = getPolishHolidaysForYear(2025);
    expect(h2025.get('2025-04-20')).toBe('Niedziela Wielkanocna');
    expect(h2025.get('2025-04-21')).toBe('Poniedziałek Wielkanocny');
    expect(h2025.get('2025-06-08')).toBe('Zielone Świątki');
    expect(h2025.get('2025-06-19')).toBe('Boże Ciało');

    // 2028 (leap year): Easter on 2028-04-16
    const h2028 = getPolishHolidaysForYear(2028);
    expect(h2028.get('2028-04-16')).toBe('Niedziela Wielkanocna');
    expect(h2028.get('2028-04-17')).toBe('Poniedziałek Wielkanocny');
    expect(h2028.get('2028-06-04')).toBe('Zielone Świątki');
    expect(h2028.get('2028-06-15')).toBe('Boże Ciało');
  });

  it('identifies public holidays and regular working days via helper functions', () => {
    expect(isPolishHoliday('2024-12-24')).toBe(false);
    expect(getPolishHolidayName('2024-12-24')).toBeNull();

    expect(isPolishHoliday('2025-12-24')).toBe(true);
    expect(getPolishHolidayName('2025-12-24')).toBe('Wigilia Bożego Narodzenia');

    expect(isPolishHoliday('2026-01-01')).toBe(true);
    expect(getPolishHolidayName('2026-01-01')).toBe('Nowy Rok');

    expect(isPolishHoliday('2026-06-04')).toBe(true);
    expect(getPolishHolidayName('2026-06-04')).toBe('Boże Ciało');

    expect(isPolishHoliday('2026-11-11')).toBe(true);
    expect(getPolishHolidayName('2026-11-11')).toBe('Narodowe Święto Niepodległości');

    expect(isPolishHoliday('2026-12-24')).toBe(true);
    expect(getPolishHolidayName('2026-12-24')).toBe('Wigilia Bożego Narodzenia');

    // Regular weekday
    expect(isPolishHoliday('2026-01-02')).toBe(false);
    expect(getPolishHolidayName('2026-01-02')).toBeNull();

    // Invalid date string
    expect(isPolishHoliday('invalid-date')).toBe(false);
    expect(getPolishHolidayName('invalid-date')).toBeNull();
  });
});
