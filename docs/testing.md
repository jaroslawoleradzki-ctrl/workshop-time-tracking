# Testowanie

## Testy istniejące

Backend używa Vitest i Supertest. `backend/tests/version.test.ts` sprawdza `/api/version`; `integration.test.ts` osobno sprawdza odpowiedź 200 healthchecka przy działającym połączeniu Prisma, odpowiedź 503 przy błędzie bazy, format obu odpowiedzi, ograniczenie powtarzanych logów awarii, odrzucenie błędnego logowania oraz ochronę tras bez tokenu. `copy-last-day.test.ts` sprawdza kontrakt i walidację kopiowania, kopiowanie UW i L4 pomiędzy dniami roboczymi, kompletność dnia mieszanego, blokadę soboty i niedzieli bez tworzenia rekordów, wybór pracownika i źródła, soft delete, limit, role, rollback audytu oraz serializację 2 i 20 równoległych żądań na deterministycznym modelu transakcji. `analytics.test.ts` sprawdza raport okresów nieobecności oraz tryb zamknięcia raportu zleceń: trzy grupy wyników, granice dat, soft delete, zera, brak regresji zwykłego raportu, walidację i zgodność XLSX z JSON. `work-time-types.test.ts` weryfikuje niezależność `isAbsence` i `requiresOrder`, a `is-absence-migration.test.ts` deterministyczną i niedestrukcyjną treść migracji.

Frontend używa Vitest, Happy DOM i React Testing Library. `frontend/src/test/App.test.tsx` sprawdza renderowanie logowania oraz pobranie i błąd pobrania wersji. `ReportingPanel.test.tsx` sprawdza `employeeId`, blokadę przycisku, wieloklik/klawiaturę, odblokowanie po błędzie i komunikat `409`. `ReportsView.test.tsx` sprawdza raporty, wersjonowane filtry `sessionStorage` oraz przełącznik raportu zamknięcia: aktywację, wygląd, parametry JSON/XLSX, zera, reset, odtworzenie i zmianę zakładek. `DictionariesView.test.tsx` weryfikuje niezależny zapis obu flag. `OrdersView.test.tsx` sprawdza częściowe wyszukiwanie bez rozróżniania wielkości liter po zamawiającym, numerze księgowym, numerze produktu i dotychczasowym numerze zlecenia. `frontend/src/test/setup.ts` zapewnia asercje DOM i pamięci webowe.

## Polecenia

| Obszar | Polecenie |
|---|---|
| Test backendu | `cd backend && npm test` |
| Build backendu | `cd backend && npm run build` |
| Test frontendu | `cd frontend && npm test` |
| Lint frontendu | `cd frontend && npm run lint` |
| Build frontendu | `cd frontend && npm run build` |
| Walidacja obrazów Pomocy bez przeglądarki | `cd frontend && npm run docs:validate` |
| Zrzuty Pomocy na izolowanym `*_docs` | `cd frontend && npm run docs:screenshots` |

Backend nie definiuje skryptu lint. Oba skrypty testowe wykonują `vitest run`.
Testy Playwright w `frontend/docs-screenshots/` są uruchamiane tylko na żądanie przez `docs:screenshots`, przy lokalnym backendzie podłączonym wyłącznie do bazy o nazwie zakończonej `_docs`. Test wykonuje 20 ujęć prawdziwego UI, sprawdza ich renderowanie w Pomocy na desktopie i tablecie oraz pięć odnośników kontekstowych. Zwykłe `npm test` nie uruchamia przeglądarki. `docs:validate` weryfikuje manifest, pliki PNG i referencje rozdziałów bez Playwright; jest częścią `scripts/verify-release.sh`.

## Testy ręczne przed wydaniem

- logowanie obu ról, wygaśnięcie sesji i ograniczenia menu/API;
- utworzenie, edycja i soft delete pracownika, zlecenia oraz wpisu czasu;
- wymaganie zlecenia według rodzaju czasu i ostrzeżenia 8/12/24 godzin;
- kopiowanie ostatniej wcześniejszej daty wyłącznie wybranego pracownika: pojedynczo, dwuklikiem, z dwóch kart, przez dwóch liderów i przy niepustym celu;
- import poprawny, częściowy, błędny, duplikat i przywrócenie soft delete;
- wszystkie pięć raportów, filtry, XLSX i CSV;
- migracja na kopii produkcyjnej, health check, logi i responsywność laptop/tablet.

## Braki pokrycia

Automatyczne testy nie obejmują całego CRUD, każdego wariantu importu i eksportu, Nginx/Docker ani pełnych interakcji wszystkich widoków. Playwright sprawdza scenariusze instrukcji na izolowanej bazie, lecz nie zastępuje akceptacji ręcznej. Krytyczne kopiowanie ma testy endpointu i modelu transakcji; testy healthchecka i analityki używają też kontrolowanych odpowiedzi Prisma.
