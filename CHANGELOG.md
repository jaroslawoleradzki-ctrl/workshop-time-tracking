# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.
Format jest oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Dodano automatyczną sekcję „Kontrola rozliczenia czasu” w trybie Raportu zamknięcia w raporcie „Godziny wg zleceń”.
- Logika dynamicznie agreguje godziny zleceń oraz wszystkie rodzaje nieobecności (`WorkTimeType.isAbsence=true`) występujące w okresie, porównując je z łączną sumą godzin pracowników z raportu miesięcznego.
- Wprowadzono jednoznaczny wskaźnik statusu zgodności (ZGODNE / NIEZGODNE) oraz prezentację różnicy liczbowej.
- Utworzono dedykowany endpoint backendowy `GET /api/analytics/closure-control-summary` oraz rozszerzono eksporty XLSX i CSV o sekcję kontrolną generowaną ze wspólnej logiki analitycznej.
- Dodano zestaw testów jednostkowych i integracyjnych dla backendu (`analytics.test.ts`) oraz frontendu (`ReportsView.test.tsx`).

### Fixed

- Usunięto zależność developerskiego stosu Homelab od bind mountu konfiguracji Nginx z checkoutu Portainera; konfiguracja jest teraz wbudowana w obraz frontendu.

## [0.5.0] - 2026-08-25

### Fixed

- Naprawiono filtrowanie po zleceniu w Raporcie Szczegółowym (`GET /api/analytics/report-detailed`), dodając poprawną obsługę parametru `orderId` w zapytaniu bazy danych.
- Poprawiono spójność filtrowania w tabeli Raportu Szczegółowego oraz w eksporcie XLSX i CSV (w tym dodano brakujące mapowanie `productCode`).
- Dodano testy regresyjne backendu i frontendu pokrywające filtrowanie pojedynczego zlecenia, kombinacje z pracownikiem i zakresem dat oraz eksporty.

### Added

- Dodano test regresyjny dla raportu okresów nieobecności weryfikujący, że **dowolny** typ czasu z `isAbsence=true` (nie tylko standardowe UW/UOK/UŻ/L4) jest poprawnie uwzględniany w raporcie, łącząc kolejne dni robocze przez weekend, rozdzielając przerwami i pomijając typy `isAbsence=false`. Test używa kodu `ART188` jako przykładu niestandardowego typu nieobecności.

## [0.4.9] - 2026-08-06

### Added

- Dodano przełącznik „Raport zamknięcia” do istniejącego raportu „Godziny wg zleceń”.
- Tryb łączy otwarte zlecenia z godzinami w okresie oraz zlecenia zamknięte w okresie, również bez godzin.
- Rozszerzono JSON, XLSX i CSV o rzeczywistą datę zakończenia oraz wspólną logikę danych JSON/XLSX.
- Stan trybu jest zapamiętywany w `sessionStorage` razem z filtrami raportu zleceń.
- Dodano walidację parametru `closureReport`, inkluzywnego zakresu dat oraz testy granic, soft delete, zerowych godzin i zgodności eksportu.

## [0.4.8] - 2026-08-06

### Added

- Dodano wspólny, wersjonowany mechanizm zapamiętywania filtrów Centrum Raportów w `sessionStorage`.
- Każdy z pięciu raportów przechowuje niezależnie wszystkie własne filtry i odtwarza je po zmianie zakładki, powrocie do modułu oraz odświeżeniu strony.
- Wyczyszczenie filtrów przywraca wartości domyślne i usuwa wyłącznie zapis aktywnego raportu.
- Dodano testy frontendu dla inicjalizacji, odtwarzania, natychmiastowego zapisu, izolacji raportów, resetu i ponownego montowania widoku.

## [0.4.7] - 2026-08-06

### Added

- Dodano jawną, niezależną właściwość `WorkTimeType.isAbsence` wraz z bezpieczną migracją klasyfikującą standardowe kody `UW`, `UOK`, `UŻ` i `L4`.
- Rozbudowano słownik rodzajów czasu o administracyjną edycję właściwości „Nieobecność”, niezależną od „Wymaga zlecenia”.
- Dodano raport okresów nieobecności z filtrowaniem po zakresie dat, pracowniku i rodzaju nieobecności oraz eksportem XLSX.
- Grupowanie raportu pomija weekendy, rozdziela okres po brakującym dniu roboczym i nie nalicza wielokrotnie duplikatów tego samego dnia.
- Dodano testy backendu, frontendu i treści migracji dla klasyfikacji oraz raportowania nieobecności.

## [0.4.6] - 2026-08-05

### Added

- Wprowadzono wymóg podania rzeczywistej daty zakończenia zlecenia (`completionDate`) przy zamykaniu zlecenia (status `CLOSED`).
- Dodano walidację braku daty, pustego ciągu znaków oraz niepoprawnego formatu daty po stronie API (kod błędu `COMPLETION_DATE_REQUIRED`, HTTP 400).
- Rozbudowano formularz edycji i tworzenia zleceń w interfejsie użytkownika (`OrdersView.tsx`) o pole „Rzeczywista data zakończenia” z oznaczeniem wymogu i walidacją.
- Zapewniono zachowanie istniejącej daty zakończenia przy ponownym otwarciu zlecenia (przejście ze statusu `CLOSED` na `OPEN` lub `SUSPENDED`).
- Dodano prezentację daty zamknięcia w odznace statusu w tabeli zleceń.

## [0.4.5] - 2026-08-05

### Fixed

- Funkcja „Kopiuj ostatni dzień” przenosi teraz kompletny zestaw wpisów pomiędzy dniami roboczymi, w tym nieobecności takie jak UW i L4.
- Kopiowanie całego dnia na sobotę lub niedzielę nadal jest blokowane bez tworzenia wpisów.
- Zachowano pomijanie wpisów powiązanych z usuniętymi zleceniami oraz pozostałe zabezpieczenia operacji kopiowania.

## [0.4.4] - 2026-08-02

### Added

- Dodano funkcję eksportu aktualnie wyświetlanego widoku Bazy Zleceń do pliku Excel (.xlsx) na ekranie `OrdersView`.
- Wdrożono nowy endpoint backendowy `POST /api/orders/export-xlsx` z walidacją parametrów (Zod) oraz obsługą ról `admin` i `leader`.
- Odzwierciedlenie aktualnej frazy wyszukiwania (`searchQuery`), filtra statusu (`statusFilter`), pola sortowania (`sortField`) oraz kierunku sortowania (`sortOrder`) z zachowaniem stabilnego sortowania po `orderNumber`.
- Wydzielono wspólny moduł `backend/src/utils/excel-report.ts` z helperami generowania i formatowania pliku ExcelJS, z którego korzystają endpointy w `analytics.ts` oraz `orders.ts`.
- Wygenerowany plik XLSX zawiera pełne 16 osobnych kolumn danych biznesowych bez łączenia ilości z jednostką oraz bez technicznych pól/przycisków Akcje.
- Dodano pakiet testów backendowych oraz frontendowych potwierdzających poprawność eksportu, pobierania Bloba, wyznaczania nazwy pliku z `Content-Disposition` oraz brak wpływu na istniejące eksporty.

## [0.4.3] - 2026-08-02

### Added

- Dodano funkcję seryjnej rejestracji nieobecności w zakresie dat dla wybranego pracownika na ekranie Raportowania.
- Wdrożono nowy endpoint podglądu `POST /api/reports/absence-range/preview` zwracający szczegółowe podsumowanie (dni kalendarzowe, dni robocze, pominięte weekendy, konflikty z istniejącymi wpisami, łączną liczbę godzin).
- Wdrożono nowy endpoint transakcyjnego zapisu `POST /api/reports/absence-range` z automatycznym pomijaniem sobót i niedziel oraz dni zawierających konflikty z istniejącymi wpisami.
- Wdrożono dedykowane zdarzenie audytowe `CREATE_ABSENCE_RANGE` w transakcji z blokadą współbieżności advisory lock (`absence-range:employeeId`).
- Dodano komponent interfejsu `AbsenceRangeModal.tsx` z filtrowaniem słownika (wyłącznie `requiresOrder = false`), kalkulacją podglądu w czasie rzeczywistym i automatycznym odświeżaniem listy po zapisie.
- Uwaga: Obsługa świąt ustawowych oraz zakładowych dni wolnych pozostaje kolejnym planowanym krokiem rozwoju systemu.

## [0.4.2] - 2026-08-02

### Fixed

- Przywrócono sumowanie wszystkich zaraportowanych godzin (`deletedAt = null`) w kafelkach `hoursToday` oraz `hoursMonth` Pulpitu Menedżerskiego (wycofano nadmiarowe filtry `orderId` i `requiresOrder` wprowadzone w v0.4.1).
- L4, urlopy (UW), opieka (UOK), chorobowe (CH) oraz inne typy czasu są ponownie uwzględniane w bilansie dobowym i miesięcznym, zachowując funkcję kontrolną dashboardu dla kadry menedżerskiej.
- Zachowano w całości backendową blokadę rejestracji nieprawidłowych wpisów weekendowych oraz blokadę Copy Last Day na sobotę i niedzielę z v0.4.1.
- Zaktualizowano zestaw testów regresyjnych dashboardu i potwierdzono przejście testów weekendowych.

## [0.4.1] - 2026-08-02

### Fixed

- Wdrożono całkowitą blokadę automatycznego kopiowania wpisów (`Copy Last Day`) na dzień wolny (sobota, niedziela), zwracając kod `400 Bad Request` oraz kod błędu `WEEKEND_COPY_NOT_ALLOWED`.
- Zablokowano możliwość rejestrowania i edytowania nieobecności (np. L4, UW, UŻ, UOK itp.) oraz innych wpisów bez zlecenia w weekendy; w sobótę i niedzielę dozwolona jest wyłącznie praca na zleceniu (`requiresOrder = true` oraz `orderId != null`).
- Zaktualizowano wyliczanie godzin dobowych (`hoursToday`) oraz miesięcznych (`hoursMonth`) na Pulpicie Menedżerskim: kafelki uwzględniają wyłącznie przepracowane godziny na zleceniach (`requiresOrder = true` i `orderId != null`), ignorując godziny nieobecności.
- Rozbudowano zestaw testów automatycznych backendu dla walidacji weekendowych, Copy Last Day oraz agregacji godzin na dashboardzie.

## [0.4.0] - 2026-08-02

### Fixed

- Ujednolicono kontrakt API endpointu `GET /api/analytics/dashboard` z frontendem (`openOrdersCount`, `closedThisMonthCount`, `hoursToday`, `hoursMonth`, `ordersExceeding`, `ordersApproaching`).
- Usunięto nieużywane i niespójne pola API (`activeOrdersCount`, `suspendedOrdersCount`, `closedOrdersCount`, `recentOrders`).
- Kafelek „Otwarte zlecenia” zlicza wyłącznie zlecenia o statusie `OPEN`, `isActive = true` oraz `deletedAt = null`.
- Zmieniono etykietę kafelka z „Zamknięte zlecenia” na „Zamknięte w tym miesiącu” (`closedThisMonthCount`), zliczając zlecenia zamknięte w bieżącym miesiącu na podstawie pola `completionDate`.
- Usunięto limit 5 zleceń przy analizie budżetowej; backend przeanalizuje teraz wszystkie otwarte zlecenia.
- Poprawiono i rozdzielono sekcje budżetowe: `ordersExceeding` (>100%) oraz `ordersApproaching` (80%–100%) ze stabilnym sortowaniem malejąco po procencie wykorzystania i rosnąco po numerze zlecenia.
- Zweryfikowano logikę `completionDate` podczas przejść statusów (ustawianie przy zamknięciu, czyszczenie przy ponownym otwarciu, zachowanie dotychczasowej daty przy edycji zlecenia już zamkniętego).
- Dodano zestaw testów regresyjnych dla backendu (`analytics.test.ts`, `orders.test.ts`) oraz frontendu (`DashboardView.test.tsx`).

## [0.3.9] - 2026-08-01

### Fixed

- Fixed global application layout so top navbar and sidebar remain permanently visible during page and table scrolling.
- Constrained application viewport height (`height: 100vh`, `overflow: hidden`) and isolated vertical scrolling strictly to `.content-wrapper`.
- Prevented double vertical scrollbars and enabled internal scrolling for sidebar when content exceeds screen height.

## [0.3.8] - 2026-07-31

### Fixed

- Changed employee name presentation in the monthly employee report to “Last name First name”.
- Unified employee name format across the application view, XLSX export and CSV export.
- Updated report sorting to use last name and first name consistently, if required by the existing implementation.

## [0.3.7] - 2026-07-31

### Added

- Added standardized report headers to all user-facing XLSX and CSV exports.
- Exported reports now include report name, date range, generation timestamp and applied filters.

### Changed

- Unified metadata formatting across report exports.
- Adjusted XLSX table position, filters and frozen rows to account for report metadata.

## [0.3.6] - 2026-07-31

### Added

- Added status filter in Orders Database.
- Orders can now be filtered by Open, Suspended and Closed status.

### Fixed

- Restored Orders Database access for Leader users.
- Leader now has full read-only access to Orders Database.
- Added regression tests for Leader navigation and Orders status filtering.

## [0.3.5] - 2026-07-31

### Added

- Leader otrzymał dostęp do ekranu Baza Zleceń w trybie tylko do odczytu.

### Changed

- Rozszerzono uprawnienia roli Leader.
- Zablokowano wszystkie operacje modyfikujące dane dla tej roli.
- Zachowano możliwość filtrowania i sortowania zleceń.

## [0.3.4] - 2026-07-31

### Added

- Kolumna Ilość w raporcie zleceń oraz eksportach CSV/XLSX.
- Filtr zleceń z zaraportowanymi godzinami (`onlyWithHours`) w raporcie i eksportach.
- Sortowanie Bazy Zleceń Produkcyjnych wg daty zlecenia i daty wysyłki (rosnąco / malejąco).
- Suma godzin bez nadgodzin (`sumaBezNadgodzin`) w raporcie pracowników.
- Sortowanie pracowników wg nazwiska (nazwisko, imię) w raporcie pracowników.

### Changed

- Zmieniono nazwę kolumny „Suma godzin” na „Suma godzin z nadgodzinami”.
- Zmieniono układ raportu pracowników (Pracownik, Suma z nadgodzinami, Suma bez nadgodzin, kody czasu pracy).
- Eksporty CSV/XLSX dostosowano do nowych kolumn i filtrów.

## [0.3.3] - 2026-07-31

### Fixed

- Zabezpieczono operację „Kopiuj ostatni dzień” przed kopiowaniem nieobecności (takich jak `UW`, `L4`, `UOK`, `UŻ`): kopiowanie przenosi wyłącznie faktyczne wpisy robocze z poprzedniego dnia roboczego.
- Naprawiono filtr statusu zlecenia (`OPEN`, `SUSPENDED`, `CLOSED`) w raporcie godzin według zleceń oraz eksporcie XLSX, zapewniając spójność wielkości liter w zapytaniu API i Prisma ORM.
- Zdiagnozowano mechanizm tabel: ustalono brak wcześniejszego mechanizmu manualnego resize kolumn w aplikacji i udokumentowano wymaganie dla kolejnych wydań.

## [0.3.2] - 2026-07-27

### Added

- Dodano opcjonalne uwagi do zleceń, obsługiwane podczas tworzenia i edycji oraz prezentowane w nowej kolumnie Bazy Zleceń Produkcyjnych.

### Fixed

- Ujednolicono dane miesięcznego raportu według pracowników w tabeli oraz eksportach XLSX i CSV; wszystkie formaty używają tych samych filtrów, rekordów i dynamicznych kolumn aktualnego słownika rodzajów czasu.
- Ujednolicono poziome przewijanie wszystkich tabel Centrum raportów z ekranem Zlecenia: szerokie tabele pozostają w obszarze ekranu i mają zsynchronizowane paski przewijania u góry i u dołu.

### Changed

- Rozpoczęto cykl rozwojowy `0.3.2` i zsynchronizowano numer wersji w metadanych projektu oraz dokumentacji.

## [0.3.1] - 2026-07-23

### Added

- Dynamiczne kolumny raportu miesięcznego.
- Rozszerzone wyszukiwanie zleceń.
- Numeracja i sortowanie pracowników.
- Oznaczanie wpisów jako „Brak karty” (missingCard).
- Nawigacja pomiędzy dniami raportowania (strzałki ◀ i ▶).

### Changed

- Retencja kopii zapasowych ograniczona do 10 najnowszych w skrypcie `backup-db.sh`.

## [0.3.0] - 2026-07-22

### Fixed
- Produkcyjny obraz backendu Alpine zawiera Prisma Query Engine dla `linux-musl-openssl-3.0.x`; walidacja wydania sprawdza target, sposób generowania i kopiowania klienta oraz obecność właściwego artefaktu przed wdrożeniem.

### Added
- Rozbudowano strukturę dokumentacji o reguły biznesowe, specyfikację importów i eksportów, konfigurację, testowanie, runbook operacyjny oraz instrukcję użytkownika; uzupełniono także architekturę i indeks dokumentacji.
- Dodano `PROJECT_STATUS.md` oraz obowiązkową procedurę rozpoczęcia sesji i przekazania pracy między ChatGPT i Codexem w `docs/session-start.md`; powiązano procedurę z zasadami w `AGENTS.md`.
- Dodano rootowy `.env.example` dla konfiguracji Docker Compose oraz testy wymuszające jawny `JWT_SECRET` i potwierdzające podpisywanie tokenów skonfigurowanym sekretem.

### Changed
- Zsynchronizowano numer wydania `0.3.0` w metadanych backendu, frontendu, plikach lock, Docker Compose i dokumentacji.
- Dodano backendowy healthcheck kontenera oparty na Node i endpointcie `/api/health`, a uruchomienie Nginx uzależniono od stanu `service_healthy` backendu; PostgreSQL nadal jest warunkiem gotowości backendu.
- Healthcheck PostgreSQL korzysta z `POSTGRES_USER` i `POSTGRES_DB` kontenera, a rutynowe probe'y backendu nie generują wpisów `info` ani powtarzanych wpisów `error` podczas niedostępności bazy.
- Testy `/api/health` deterministycznie weryfikują odpowiedzi HTTP 200 i 503 wraz z ich formatem.
- Ustawienia PostgreSQL, JWT, portów, logowania i nazwy zewnętrznego wolumenu przeniesiono z plików śledzonych do ignorowanego rootowego `.env`; backendowy `.env` przestał być śledzony, a Nginx używa neutralnego `server_name _`.
- Rozszerzono `verify-release.sh` o kontrole konfiguracji środowiska, sekretów, wymaganych zmiennych, reguł ignorowania oraz zgodności bezpośrednich zależności z plikami `package-lock.json`.
- Uzupełniono dokumentację o pierwszą instalację, rutynową aktualizację bez `git stash`, bezpieczne przechowywanie `.env` i jednorazową migrację istniejącego wolumenu PostgreSQL.

## [0.2.9] (Development) - 2026-07-20

### Added
- Dodano wspólną transakcyjną blokadę advisory PostgreSQL dla kopiowania i zwykłego zapisu raportu dla tej samej pary pracownik–data docelowa, limit 100 wpisów źródłowych oraz strukturalne logowanie operacji kopiowania.
- Zapytanie pobierające wpisy źródłowe zostało ograniczone do 101 rekordów, co pozwala wykryć przekroczenie limitu bez pobierania całego dnia.
- Dodano testy backendu dla walidacji, soft delete, atomowego audytu i współbieżności (w tym 20 równoległych żądań) oraz testy blokady interfejsu.

### Fixed
- Funkcja „Kopiuj ostatni dzień” wybiera najnowszą wcześniejszą datę z aktywnym wpisem pracownika niezależnie od stanu powiązanego zlecenia, a następnie pomija wpisy usuniętych zleceń bez cofania się do starszego dnia.
- Niepusty dzień docelowy jest odrzucany odpowiedzią `409`, a równoległe lub wielokrotne uruchomienia nie mogą dopisać kolejnych kompletów.
- Kopiowanie wpisów i zapis jednego audytu operacji są atomowe; błąd audytu wycofuje całą operację.

## [0.2.8] (Development) - 2026-07-04

### Added
- Uporządkowanie konfiguracji TypeScript dla skryptu zasilania bazy danych (Prisma seed) poprzez utworzenie dedykowanego pliku `tsconfig.seed.json` i dodanie typów Node.
- Wprowadzenie automatycznego zasilania bazy danych (database seed) w pliku `docker-entrypoint.sh` po wykonaniu migracji a przed uruchomieniem backendu.
- Usprawnienie procedury pierwszej instalacji systemu (first-install experience).
- Poprawienie idempotentności skryptu zasilającego poprzez bezpieczną aktualizację użytkowników testowych bez resetowania haseł.
- Rozdzielenie zasilania bazy danych na część systemową/produkcyjną (`seed.ts`) oraz część demo/przykładową (`seed-demo.ts`).
- Zapewnienie, że dane demonstracyjne nie uruchamiają się automatycznie w żadnym środowisku i muszą być ładowane manualnie.

## [0.2.7] (Development) - 2026-07-04

### Added
- Wdrożenie szkieletu automatycznych testów frontendu (konfiguracja środowiska Vitest + React Testing Library + Happy DOM).
- Przygotowanie pierwszych stabilnych testów widoku logowania i weryfikacji wersji systemu.
- Integracja testów frontendu z procesem automatycznej walidacji wydania (`verify-release.sh`).
- Wprowadzenie centralnego loggera opartego na bibliotece **Pino** w backendzie.
- Zastąpienie wszystkich wystąpień `console.log` / `console.error` w kodzie źródłowym i rutach backendu zunifikowanymi wywołaniami loggera.
- Przygotowanie backendu do strukturalnego logowania JSON, ułatwiającego integrację z systemami monitoringu logów (np. ELK, Datadog).

## [0.2.6] (Development) - 2026-07-04

### Added
- Wdrożenie skryptu automatycznej walidacji wydania (`verify-release.sh`).
- Wprowadzenie testów integracyjnych backendu (Vitest + Supertest) dla endpointów health check, login oraz kontroli dostępu.
- Wpięcie testów automatycznych backendu do procesu walidacji wydania.
- Zabezpieczenie i uszczelnienie procedury rollback w skrypcie `rollback.sh`.
- Wdrożenie bezpiecznego narzędzia automatycznego przywracania bazy danych (`restore-db.sh`).
- Stworzenie pełnej dokumentacji testów (`docs/testing.md`).

## [0.2.5] (Development) - 2026-07-04

### Added
- Pełna konteneryzacja procesu budowania frontendu (multi-stage Dockerfile dla aplikacji frontendowej).
- Aktualizacja konfiguracji docker-compose.yml w celu automatycznego budowania obrazu frontendu przy uruchomieniu kontenera.
- Aktualizacja README.md i docs/deployment.md odzwierciedlająca uproszczoną procedurę wdrożeniową.

## [0.2.3] (Development) - 2026-07-04

### Added
- Wdrożenie automatycznego wylogowania użytkownika i przekierowania do ekranu logowania po aktualizacji wersji systemu (zmianie wersji na backendzie) z wyświetleniem odpowiedniego komunikatu.

## [0.2.2] (Development) - 2026-07-04

### Added
- Dostosowanie szablonu importu zleceń Excel do aktualnego modelu bazy danych (dodanie brakującej kolumny "Jednostka *", oznaczenie wymaganych kolumn symbolem "*" oraz uporządkowanie kolejności kolumn według wytycznych biznesowych).

## [0.2.1] (Development) - 2026-07-03

### Added
- Gruntowna reorganizacja pliku README.md w celu pełnego udokumentowania architektury, procesów wdrażania, struktury repozytorium oraz stosu technologicznego.
- Utworzenie dokumentu wytycznych deweloperskich AGENTS.md opisującego standardy pracy dla deweloperów i agentów AI (Definition of Done, Git workflow, reguły bazy danych/Prisma, standard opisu zadań).
- Dostosowanie dokumentacji technicznej w katalogu `docs/` do stanu rzeczywistego (usunięcie sekcji planowanych zmian w architecture.md i zaktualizowanie roadmap.md do listy zrealizowanych kamieni milowych).

## [0.2.0] (Development) - 2026-07-03

### Added
- Nowy dwusekcyjny układ menu nawigacyjnego dla Administratora (Robocza vs Administracja).
- Ograniczenie dostępu dla roli Leader do zakładki Zlecenia (widzi wyłącznie Raportowanie i Raporty).
- Collapsible submenu dla sekcji Administracja z automatycznym rozwijaniem i wyróżnieniem nadrzędnego elementu.
- Nowa stopka sidebara zawierająca wersję systemu, zalogowanego użytkownika oraz przycisk wylogowania na samym dole.
- Ujednolicenie terminologii w interfejsie ("Wersja systemu" zamiast "Wersja aplikacji").

## [0.1.6] - 2026-07-02

### Added
- Nowe usprawnienia layoutu i UX dla modułu Zlecenia (wersja 0.1.6).

## [0.1.5] - 2026-07-02

### Added
- nowe kolumny i widoki w zakładce Zlecenia (`Data zlecenia`, `Planowana wysyłka`, `Zamawiający`, `Godziny / szt.`).
- automatyczne dynamiczne wyliczanie planowanych godzin (`plannedHours = quantity * hoursPerUnit`) w formularzu frontendu oraz podczas zapisu i importu.
- obsługa nowych pól `orderDate`, `plannedShipmentDate`, `orderedBy` oraz `hoursPerUnit` w bazie danych PostgreSQL i Prisma Client.

### Changed
- kolumna planowanych godzin jest teraz tylko do odczytu i wyliczana automatycznie.
- szablon importu Excel oraz parser obsługują nowe kolumny: `Numer zlecenia`, `Data zlecenia`, `Data planowanej wysyłki`, `Numer produktu`, `Nazwa produktu`, `Konto księgowe`, `Ilość`, `Godziny / szt.` (usunięto kolumnę `Przewidywana liczba godzin`).

### Fixed
- automatyczne bezpieczne wyliczenie `hoursPerUnit` dla starych danych w bazie podczas migracji (`plannedHours / quantity` z fallbackiem).

## [0.1.4] (Development) - 2026-06-30

### Added
- przebudowa modelu Zleceń (dodanie pól `quantity` i `quantityUnit` o typie Decimal, opcjonalnego `productCode` i `accountingAccount` oraz flagi `isActive` typu Boolean).
- nowe kolumny i widoki formularzy w zakładce Zlecenia (Status, Numer zlecenia, Konto księgowe, Kod produktu, Nazwa produktu, Ilość, Plan, Rzeczywiste, Budżet).
- konfiguracja `prisma.seed` w `package.json` oraz idempotentne zasilanie bazy danych użytkowników, zleceń i typów czasu.

### Changed
- zmiana nazw kolumn w bazie danych i modelu Prisma dla Zleceń: `productNumber` na `productCode`, `estimatedHours` na `plannedHours`, `closedAt` na `completionDate`.
- status zlecenia wykorzystuje teraz systemowy enum Prisma (`OPEN`, `SUSPENDED`, `CLOSED`).
- walidacja formularzy i API: godziny planowane muszą być `>= 0`, a ilość strictly `> 0`.
- opcjonalność pól: Kod produktu (`productCode`) i Konto księgowe (`accountingAccount`) są teraz opcjonalne (w bazie zapisywane jako `NULL`, a w tabeli wyświetlane jako `-`).

### Fixed
- crash interfejsu w `ReportingPanel.tsx` wywołany przez `activeOrders.filter is not a function` przy pustej/błędnej odpowiedzi API.
- odporność filtrowania wyszukiwarki zleceń na wartości `null` dla `productCode` i `accountingAccount`.
- obsługa błędów autoryzacji 401/403 przy pobieraniu słowników (brak crasha, poprawne wywołanie interceptora).

## [0.1.3] (Development) - 2026-06-29

### Added
- rozdzielenie danych pracowników (dodanie pól `firstName`, `lastName` oraz `employeeNumber` w bazie danych).
- searchable wybór pracownika (autouzupełniający combobox z ikoną lupy w panelu raportowania).
- backup bazy (skrypt `backup-db.sh` wykonujący zrzut pg_dump z kontenera i kompresujący gzipem).
- rollback (skrypt `rollback.sh` do cofania wersji kodu aplikacji do wybranego commita).
- healthcheck (endpoint `/api/health` weryfikujący stan backendu i połączenie z bazą).
- version endpoint (endpoint `/api/version` eksponujący wersję całej aplikacji).
- nowy szablon importu pracowników w formacie XLSX, dostosowany do zaktualizowanego modelu danych (kolumny: ID, Imię, Nazwisko).

### Changed
- model danych pracowników (schemat Prisma z rozdzielonymi polami osobowymi).
- UX wyboru pracownika (zmiana statycznego przełącznika na dynamiczny searchable combobox).

### Fixed
- walidacja formularza pracowników (poprawne sprawdzanie i fallback na rozdzielanie pełnych nazwisk starszych rekordów).
