# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.
Format jest oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Kolumnę `Lp.` z kolejnymi stabilnymi numerami wierszy w widoku bazy pracowników.
- Stabilne sortowanie alfabetyczne listy pracowników na poziomie frontendu według nazwiska (A–Z), a przy równych nazwiskach pomocniczo według imienia.

### Changed

- Miesięczny raport według pracowników generuje kolumny rodzajów czasu pracy z aktualnego słownika, zachowując kolejność istniejących typów i automatycznie uwzględniając dodane lub usunięte pozycje.
- Brak konta księgowego przy wpisach bez zlecenia jest prezentowany jako `brak`.
- Wyszukiwarka w Bazie Zleceń Produkcyjnych obejmuje również zamawiającego, numer księgowy i numer produktu, zachowując częściowe dopasowanie bez rozróżniania wielkości liter.

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
