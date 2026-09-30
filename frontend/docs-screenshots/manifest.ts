import type { HelpChapterId } from '../src/help/chapters';

export interface DocsScreenshot {
  id: string;
  chapter: HelpChapterId;
  tab: 'login' | 'dashboard' | 'reporting' | 'reports' | 'orders' | 'calendar' | 'dictionaries' | 'imports';
  role: 'anonymous' | 'admin' | 'leader';
  viewport: { width: number; height: number };
  seedState: string;
  uiActions: string[];
  targetFile: string;
  caption: string;
  stabilityNotes?: string;
}

const desktop = { width: 1440, height: 900 };
const tablet = { width: 834, height: 1112 };
const docs = 'isolated *_docs database: fixed fictional employee, order, shifts I/II/III, absences and calendar exception';
const entry = (id: string, chapter: HelpChapterId, tab: DocsScreenshot['tab'], role: DocsScreenshot['role'], targetFile: string, caption: string, uiActions: string[], viewport = desktop): DocsScreenshot =>
  ({ id, chapter, tab, role, viewport, seedState: role === 'anonymous' ? 'empty login form' : docs, uiActions, targetFile, caption, stabilityNotes: 'Fixed Chromium, pl-PL, UTC, disabled motion and caret.' });

export const screenshotManifest: DocsScreenshot[] = [
  entry('login-empty', 'logowanie', 'login', 'anonymous', 'logowanie-01-ekran-logowania.png', 'Ekran logowania aplikacji Warsztat.', ['open login']),
  entry('nav-admin', 'ekran-glowny', 'dashboard', 'admin', 'ekran-glowny-01-admin-menu.png', 'Menu administratora z pełnym zakresem ekranów.', ['log in as docs-admin']),
  entry('nav-leader', 'ekran-glowny', 'reporting', 'leader', 'ekran-glowny-02-leader-menu.png', 'Menu lidera z Raportowaniem, Zleceniami, Raportami i Pomocą.', ['log in as docs-leader']),
  entry('reporting-filled', 'rejestracja-czasu', 'reporting', 'leader', 'rejestracja-czasu-01-wypelniony-formularz.png', 'Przykładowy wpis G ze zmianą i zleceniem przed zapisem.', ['select date 2026-07-08', 'select shift I', 'select fictional order', 'enter hours']),
  entry('reporting-tablet', 'rejestracja-czasu', 'reporting', 'leader', 'rejestracja-czasu-02-tablet.png', 'Ten sam formularz na tablecie lidera.', ['select date and fill entry'], tablet),
  entry('absence-shift-disabled', 'zmiany', 'reporting', 'leader', 'zmiany-01-nieobecnosc.png', 'Po wybraniu nieobecności pole Zmiana jest nieaktywne.', ['select WKU', 'verify shift disabled']),
  entry('hours-warning', 'rejestracja-czasu', 'reporting', 'leader', 'rejestracja-czasu-03-ostrzezenie.png', 'Ostrzeżenie o sumie godzin z możliwością anulowania.', ['fill 9 hours', 'attempt save']),
  entry('absence-range', 'nieobecnosci', 'reporting', 'leader', 'nieobecnosci-01-zakres.png', 'Podgląd zakresu nieobecności przed zapisem.', ['open absence range', 'select date range']),
  entry('copied-day-shifts', 'kopiowanie-dnia', 'reporting', 'leader', 'kopiowanie-dnia-01-zmiany.png', 'Skopiowane wpisy zachowują etykiety zmian I, II i III.', ['select 2026-07-08', 'copy previous day']),
  entry('orders', 'baza-zlecen', 'orders', 'admin', 'baza-zlecen-01-filtry.png', 'Baza zleceń z wyszukiwaniem i filtrem statusu.', ['open Orders', 'search DOC']),
  entry('hr-overview', 'raport-hr', 'reports', 'admin', 'raport-hr-01-zmiana.png', 'Raport pracowników z pojedynczą kolumną Zmiana.', ['select by-employee', 'filter July 2026']),
  entry('hr-shifts', 'raport-hr', 'reports', 'admin', 'raport-hr-02-trzy-zmiany.png', 'Trzy zmiany jednego fikcyjnego pracownika w osobnych wierszach.', ['select by-employee', 'verify I, II, III']),
  entry('hr-tablet', 'raport-hr', 'reports', 'leader', 'raport-hr-03-tablet.png', 'Raport HR na tablecie z przewijaną tabelą.', ['select by-employee', 'filter July 2026'], tablet),
  entry('by-order', 'raport-zlecen', 'reports', 'admin', 'raport-zlecen-01-tabela.png', 'Godziny i realizacja fikcyjnego zlecenia.', ['select by-order', 'filter July 2026']),
  entry('closure-control', 'raport-zlecen', 'reports', 'admin', 'raport-zlecen-02-kontrola.png', 'Raport zamknięcia oraz kontrola zgodności godzin.', ['enable closure mode', 'filter July 2026']),
  entry('absence-periods', 'raport-nieobecnosci', 'reports', 'admin', 'raport-nieobecnosci-01-okresy.png', 'Okresy nieobecności i podsumowanie dni.', ['select absence periods', 'filter July 2026']),
  entry('calendar', 'kalendarz', 'calendar', 'admin', 'kalendarz-01-wyjatek.png', 'Firmowy wyjątek dla przykładowej soboty.', ['show 2026-07-07 through 2026-07-13']),
  entry('dictionaries', 'administracja', 'dictionaries', 'admin', 'administracja-01-slowniki.png', 'Słownik rodzajów czasu pracy.', ['open dictionaries']),
  entry('imports', 'administracja', 'imports', 'admin', 'administracja-02-importy.png', 'Szablony i historia fikcyjnego importu.', ['open imports']),
  entry('dashboard', 'ekran-glowny', 'dashboard', 'admin', 'ekran-glowny-03-pulpit.png', 'Pulpit z licznikami i wykorzystaniem planu.', ['open dashboard']),
  entry('export-actions', 'eksport', 'reports', 'admin', 'eksport-01-akcje.png', 'Akcje pobrania XLSX i CSV przy raporcie.', ['select by-order', 'filter July 2026', 'verify exports']),
];
