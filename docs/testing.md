# Testowanie

## Testy istniejące

Backend używa Vitest i Supertest. `backend/tests/version.test.ts` sprawdza `/api/version`; `integration.test.ts` sprawdza health check (200 lub 503), odrzucenie błędnego logowania oraz ochronę tras bez tokenu. `copy-last-day.test.ts` sprawdza kontrakt i walidację kopiowania, wybór pracownika i źródła, soft delete, limit, role, rollback audytu oraz serializację 2 i 20 równoległych żądań na deterministycznym modelu transakcji. `duplicate-report-classifier.test.ts` sprawdza konserwatywną klasyfikację duplikatów, prawidłowe kopiowanie, równoległe partie, lawinowe powielanie, typy bez zlecenia i rozróżnianie godzin. `repair-manifest-builder.test.ts` sprawdza KEEP/DELETE/REVIEW, reguły LOW/MEDIUM, niepełną historię, nierozpoznane batche, walidację wejścia i deterministyczność planu. `duplicate-repair-executor.test.ts` sprawdza trzy tryby executora, zatwierdzanie wyłącznie DELETE, atomowość zapisu, brak zmian w trybach summary/execute oraz walidację wersji.

Frontend używa Vitest, Happy DOM i React Testing Library. `frontend/src/test/App.test.tsx` sprawdza renderowanie logowania oraz pobranie i błąd pobrania wersji. `ReportingPanel.test.tsx` sprawdza `employeeId`, blokadę przycisku, wieloklik/klawiaturę, odblokowanie po błędzie i komunikat `409`. `frontend/src/test/setup.ts` zapewnia asercje DOM i pamięci webowe.

## Polecenia

| Obszar | Polecenie |
|---|---|
| Test backendu | `cd backend && npm test` |
| Test klasyfikatora duplikatów | `cd backend && npm test -- tests/duplicate-report-classifier.test.ts` |
| Test Repair Manifest Builder | `cd backend && npm test -- tests/repair-manifest-builder.test.ts` |
| Test Duplicate Repair Executor | `cd backend && npm test -- tests/duplicate-repair-executor.test.ts` |
| Typecheck skryptów diagnostycznych | `cd backend && npm exec tsc -- --project tsconfig.scripts.json` |
| Build backendu | `cd backend && npm run build` |
| Test frontendu | `cd frontend && npm test` |
| Lint frontendu | `cd frontend && npm run lint` |
| Build frontendu | `cd frontend && npm run build` |

Backend nie definiuje skryptu lint. Oba skrypty testowe wykonują `vitest run`.

## Testy ręczne przed wydaniem

- logowanie obu ról, wygaśnięcie sesji i ograniczenia menu/API;
- utworzenie, edycja i soft delete pracownika, zlecenia oraz wpisu czasu;
- wymaganie zlecenia według rodzaju czasu i ostrzeżenia 8/12/24 godzin;
- kopiowanie ostatniej wcześniejszej daty wyłącznie wybranego pracownika: pojedynczo, dwuklikiem, z dwóch kart, przez dwóch liderów i przy niepustym celu;
- import poprawny, częściowy, błędny, duplikat i przywrócenie soft delete;
- wszystkie cztery raporty, filtry, XLSX i CSV;
- migracja na kopii produkcyjnej, health check, logi i responsywność laptop/tablet.

## Braki pokrycia

Automatyczne testy nie obejmują pełnego poprawnego logowania, całego CRUD, ostrzeżeń, importów, analityki/eksportów, migracji, Nginx/Docker ani pełnych interakcji widoków. Krytyczne kopiowanie ma testy endpointu i modelu transakcji, lecz repozytorium nadal nie ma automatycznego E2E ani testu współbieżności uruchamianego na rzeczywistym PostgreSQL. Testy backendu zależne od bazy dopuszczają niedostępność bazy tylko dla health checku.
