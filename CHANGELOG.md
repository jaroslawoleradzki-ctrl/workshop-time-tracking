# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.
Format jest oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
