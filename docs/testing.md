# Testowanie

## Testy istniejące

Backend używa Vitest i Supertest. `backend/tests/version.test.ts` sprawdza `/api/version`; `integration.test.ts` sprawdza health check (200 lub 503), odrzucenie błędnego logowania oraz ochronę tras bez tokenu.

Frontend używa Vitest, Happy DOM i React Testing Library. `frontend/src/test/App.test.tsx` sprawdza renderowanie logowania oraz pobranie i błąd pobrania wersji. `frontend/src/test/setup.ts` zapewnia asercje DOM i pamięci webowe.

## Polecenia

| Obszar | Polecenie |
|---|---|
| Test backendu | `cd backend && npm test` |
| Build backendu | `cd backend && npm run build` |
| Test frontendu | `cd frontend && npm test` |
| Lint frontendu | `cd frontend && npm run lint` |
| Build frontendu | `cd frontend && npm run build` |

Backend nie definiuje skryptu lint. Oba skrypty testowe wykonują `vitest run`.

## Testy ręczne przed wydaniem

- logowanie obu ról, wygaśnięcie sesji i ograniczenia menu/API;
- utworzenie, edycja i soft delete pracownika, zlecenia oraz wpisu czasu;
- wymaganie zlecenia według rodzaju czasu i ostrzeżenia 8/12/24 godzin;
- kopiowanie ostatniej wcześniejszej daty, również przy nieaktywnych rekordach;
- import poprawny, częściowy, błędny, duplikat i przywrócenie soft delete;
- wszystkie cztery raporty, filtry, XLSX i CSV;
- migracja na kopii produkcyjnej, health check, logi i responsywność laptop/tablet.

## Braki pokrycia

Automatyczne testy nie obejmują poprawnego logowania, CRUD i autoryzacji ról, reguł raportowania, ostrzeżeń, kopiowania, soft delete, audytu, importów, analityki/eksportów, migracji, Nginx/Docker ani pełnych interakcji widoków. Nie ma testów E2E. Testy backendu zależne od bazy dopuszczają niedostępność bazy tylko dla health checku.
