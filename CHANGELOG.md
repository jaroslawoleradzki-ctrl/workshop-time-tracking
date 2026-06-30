# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.
Format jest oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.3] (Development) - 2026-06-29

### Added
- rozdzielenie danych pracowników (dodanie pól `firstName`, `lastName` oraz `employeeNumber` w bazie danych).
- searchable wybór pracownika (autouzupełniający combobox z ikoną lupy w panelu raportowania).
- backup bazy (skrypt `backup-db.sh` wykonujący zrzut pg_dump z kontenera i kompresujący gzipem).
- rollback (skrypt `rollback.sh` do cofania wersji kodu aplikacji do wybranego commita).
- healthcheck (endpoint `/api/health` weryfikujący stan backendu i połączenie z bazą).
- version endpoint (endpoint `/api/version` eksponujący wersję całej aplikacji).
- nowy szablon importu pracowników w formacie XLSX, dostosowany do zaktualizowanego modelu danych (kolumny: ID, Imię, Nazwisko).
- przebudowa modelu Zleceń (dodanie pól `quantity` i `quantityUnit` o typie Decimal oraz flagi `isActive` typu Boolean).
- nowe kolumny i widoki formularzy w zakładce Zlecenia (Status, Numer zlecenia, Konto księgowe, Kod produktu, Nazwa produktu, Ilość, Plan, Rzeczywiste, Budżet).

### Changed
- model danych pracowników (schemat Prisma z rozdzielonymi polami osobowymi).
- UX wyboru pracownika (zmiana statycznego przełącznika na dynamiczny searchable combobox).
- zmiana nazw kolumn w bazie danych i modelu Prisma dla Zleceń: `productNumber` na `productCode`, `estimatedHours` na `plannedHours`, `closedAt` na `completionDate`.
- status zlecenia wykorzystuje teraz systemowy enum Prisma (`OPEN`, `SUSPENDED`, `CLOSED`).

### Fixed
- walidacja formularza pracowników (poprawne sprawdzanie i fallback na rozdzielanie pełnych nazwisk starszych rekordów).
