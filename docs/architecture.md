# Architektura aplikacji

## Cel projektu
Aplikacja służy do rejestracji i raportowania czasu pracy pracowników warsztatowych nad konkretnymi zleceniami/produktami w systemie rozliczeniowym firmy.

## Stos technologiczny
- **Frontend**: React (Vite, TypeScript, Lucide React icons)
- **Backend**: Node.js (Express, TypeScript, Prisma ORM)
- **Baza danych**: PostgreSQL
- **Serwer**: Nginx (reverse proxy serwujący statyczne pliki frontendu i przekierowujący API do backendu)
- **Docker**: Konteneryzacja całego środowiska (Dockerfile dla backendu, Nginx i PostgreSQL spięte przez docker-compose)

## Struktura projektu
- `backend/`: Kod serwera, schemat Prisma, definicje endpointów i logika biznesowa importu/eksportu danych.
- `frontend/`: Kod aplikacji SPA, komponenty React (m.in. ReportingPanel, EmployeesView).
- `nginx/`: Konfiguracja serwera Nginx do obsługi routingu i proxy.
- `docs/`: Dokumentacja techniczna projektu.

## Model danych
- **Users**: Użytkownicy systemu (np. admin, lider), którzy mogą zarządzać danymi i przeglądać raporty.
- **Employees**: Pracownicy wykonujący pracę. Posiadają pola: `id`, `fullName`, `firstName`, `lastName`, `employeeNumber` oraz status aktywności `isActive`.
- **Orders**: Zlecenia produkcyjne z planem godzinowym (`plannedHours` wyliczanym automatycznie), datą zlecenia (`orderDate`), opcjonalną planowaną wysyłką (`plannedShipmentDate`), ilością (`quantity`), jednostką (`quantityUnit`), pracochłonnością jednostkową (`hoursPerUnit`), opcjonalnym kodem produktu (`productCode`), nazwą produktu, opcjonalnym kontem księgowym, statusami (`OPEN`, `SUSPENDED`, `CLOSED`) oraz flagą aktywności `isActive`.
- **WorkTimeReports**: Zapisy godzinowe czasu pracy przypisane do pracownika, rodzaju czasu pracy oraz zlecenia.
- **WorkTimeTypes**: Słownik rodzajów czasu pracy (np. "G" - godziny standardowe, "U" - urlop).

## Zrealizowane funkcjonalności

### Infrastruktura
- **GitHub**: Integracja z repozytorium kodu na gałęziach `development` oraz `main`.
- **Deployment**: Konteneryzacja stosu za pomocą Docker Compose.
- **Backup**: Skrypt `backup-db.sh` tworzący zrzuty bazy danych (`pg_dump`) skompresowane za pomocą `gzip` do folderu `backups/` z obsługą uruchamiania z dowolnej lokalizacji.
- **Rollback**: Skrypt `rollback.sh` umożliwiający cofnięcie kodu aplikacji do wybranego commita i przebudowę kontenerów z ostrzeżeniem o braku rollbacku bazy danych.
- **Healthcheck**: Endpoint `/api/health` weryfikujący stan działania serwera backendowego oraz łączność z bazą PostgreSQL.
- **Version endpoint**: Endpoint `/api/version` eksponujący nazwę, środowisko, wersję backendu oraz główną wersję aplikacji (`APP_VERSION`).

### Pracownicy
- **Rozdzielenie danych pracowników**: Wprowadzenie pól `firstName`, `lastName` oraz `employeeNumber` przy zachowaniu pola `fullName` dla kompatybilności.
- **Migracja bazy**: Wdrażanie zmian schematu bazy danych za pomocą Prisma (`npx prisma migrate deploy`) w entrypoincie kontenera.
- **Kompatybilność ze starszymi rekordami**: Dynamiczne parsowanie/splitowanie `fullName` w locie dla starych rekordów (formularz edycji i kolumny tabeli).
- **Zmiana importów**: Rozbudowanie importu z pliku Excel o obsługę nowych kolumn (imię, nazwisko, ID) wraz z fallbackiem do automatycznego podziału pełnego nazwiska. Szablon importu pracowników został dostosowany do nowego modelu danych i wykorzystuje kolumny: ID, Imię, Nazwisko.

### Raportowanie czasu
- **Searchable combobox**: Autouzupełniający komponent wyboru pracownika z polem tekstowym i ikoną lupy.
- **Wyszukiwanie**: Filtrowanie na żywo po imieniu, nazwisku lub pełnym imieniu i nazwisku.
- **Nawigacja**: Zachowanie przycisków "Poprzedni pracownik" i "Następny pracownik" jako alternatywnej nawigacji.

### Zlecenia
- **Przebudowa modelu i widoku**: Zmiana nazw kolumn na standard domenowy (`productCode`, `plannedHours`, `completionDate`), dodanie pól `quantity` i `quantityUnit` o typie Decimal(10,2) oraz systemowego enuma statusów.
- **Dodanie flagi aktywności**: Wprowadzenie pola `isActive`, pozwalającego dezaktywować zlecenia bez ich usuwania. Filtrowanie autouzupełniania zlecenia w panelu raportowania wyłącznie do aktywnych zleceń (status `OPEN` i `isActive = true`).

## Do rozbudowy
- **Importy (Krok 2)**: Przebudowa szablonu i parsera importu zleceń Excel zgodnie z nowym modelem danych.
- **Raporty**: Rozszerzone eksporty i analityka dla liderów.
- **Importy**: Dokładne logowanie błędów w arkuszach Excel.
- **UX**: Optymalizacja mobilna.
