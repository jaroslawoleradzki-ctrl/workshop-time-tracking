import { useState } from 'react';

const STORAGE_VERSION = 1;

interface StoredReportFilters<T> {
  version: number;
  filters: T;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readFilters = <T extends Record<string, string | boolean>>(
  storageKey: string,
  defaults: T,
): T => {
  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) return defaults;

    const stored = JSON.parse(rawValue) as unknown;
    if (!isRecord(stored) || stored.version !== STORAGE_VERSION || !isRecord(stored.filters)) {
      window.sessionStorage.removeItem(storageKey);
      return defaults;
    }

    const restored = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const value = stored.filters[key as string];
      if (typeof value !== typeof defaults[key]) {
        window.sessionStorage.removeItem(storageKey);
        return defaults;
      }
      restored[key] = value as T[keyof T];
    }
    return restored;
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
    return defaults;
  }
};

export function useReportFilters<T extends Record<string, string | boolean>>(
  storageKey: string,
  defaults: T,
) {
  const [filters, setFiltersState] = useState<T>(() => readFilters(storageKey, defaults));

  const setFilters = (updates: Partial<T>) => {
    setFiltersState(current => {
      const next = { ...current, ...updates };
      const stored: StoredReportFilters<T> = { version: STORAGE_VERSION, filters: next };
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(stored));
      } catch {
        // Filters still work in React state if browser storage is unavailable.
      }
      return next;
    });
  };

  const resetFilters = () => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Filters still reset in React state if browser storage is unavailable.
    }
    setFiltersState(defaults);
  };

  return { filters, setFilters, resetFilters };
}

export const REPORT_FILTER_STORAGE_VERSION = STORAGE_VERSION;
