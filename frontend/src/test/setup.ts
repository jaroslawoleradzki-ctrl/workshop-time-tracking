import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Simple mock for localStorage and sessionStorage to avoid Node.js environment conflicts
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
};

Object.defineProperty(global, 'localStorage', {
  value: createStorageMock(),
  writable: true,
});

Object.defineProperty(global, 'sessionStorage', {
  value: createStorageMock(),
  writable: true,
});
