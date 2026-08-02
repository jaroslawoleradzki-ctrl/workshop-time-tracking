# Kamienie Milowe Projektu (Roadmapa Zrealizowana)

Dokument przedstawia zrealizowane etapy rozwoju i kamienie milowe aplikacji Workshop Time Tracking. Opisane poniżej funkcjonalności zostały w pełni wdrożone w systemie.

## Legendy oznaczeń
- ✔ Zakończone

---

## Sprint A
*Status: Zakończony*
- [x] ✔ Wdrożenie podstawowego systemu logowania liderów i administratorów (autoryzacja JWT, hash bcrypt).
- [x] ✔ Widok bazy pracowników z opcją dodawania i mechanizmem soft-delete.
- [x] ✔ Rejestracja czasu pracy w panelu szybkiego raportowania godzin.
- [x] ✔ Podstawowe walidacje dobowe godzin (8h, 12h, 24h).

---

## Sprint B
*Status: Zakończony*
- [x] ✔ Automatyczne uruchamianie migracji przy produkcyjnym starcie w Dockerze (skrypt `docker-entrypoint.sh`).
- [x] ✔ Rozdzielenie danych pracowników na Imię, Nazwisko i ID pracownika.
- [x] ✔ Nowy autouzupełniający komponent wyboru pracownika (Searchable Combobox) w panelu raportowania.
- [x] ✔ Skrypty automatycznego wdrożenia, kopii zapasowych (`backup-db.sh`) oraz wycofywania kodu (`rollback.sh`).

---

## Sprint 0.1.6
*Status: Zakończony*
- [x] ✔ Nowy układ i ujednolicenie widoków tabeli Zleceń (kolumny: ilość, jednostka, plan godzinowy, wykorzystanie).
- [x] ✔ Zaimplementowanie podwójnego suwaka poziomego (scroll Left) synchronizowanego refami React.
- [x] ✔ Automatyczne wyliczanie planowanych godzin zlecenia (`plannedHours = quantity * hoursPerUnit`).
- [x] ✔ Wprowadzenie flagi aktywności (`isActive`) dla zleceń produkcyjnych w bazie danych.

---

## Sprint 0.2.0
*Status: Zakończony*
- [x] ✔ Nowy dwusekcyjny układ menu bocznego (Robocza vs Administracja) dla administratora z collapsible dropdownem.
## Sprint 0.3.4
*Status: Zakończony*
- [x] ✔ Kolumna Ilość w raporcie „Godziny wg Zleceń” oraz eksportach CSV i XLSX.
- [x] ✔ Filtr „Pokaż tylko zlecenia z zaraportowanymi godzinami” w raporcie i eksportach.
- [x] ✔ Sortowanie Bazy Zleceń Produkcyjnych po dacie zlecenia i dacie wysyłki (rosnąco / malejąco).
- [x] ✔ Sortowanie pracowników według nazwiska w raporcie pracowników.
- [x] ✔ Zmiana nazwy kolumny „Suma godzin” na „Suma godzin z nadgodzinami”.
- [x] ✔ Nowa kolumna „Suma godzin bez nadgodzin” w raporcie pracowników.
- [x] ✔ Nowy układ kolumn raportu pracowników oraz dostosowanie eksportów CSV i XLSX.

---

## Sprint 0.3.5
*Status: Zakończony*
- [x] ✔ Udostępnienie ekranu „Baza Zleceń” dla użytkownika z rolą `Leader` w trybie tylko do odczytu.
- [x] ✔ Zablokowanie przycisków dodawania, edycji, usuwania i zapisu danych dla Lidera w interfejsie.
- [x] ✔ Zabezpieczenie endpointów modyfikujących w backendzie (`403 Forbidden` dla roli Leader).

---

## Sprint 0.3.6
*Status: Zakończony*
- [x] ✔ Dodano filtr statusów zleceń w Bazie Zleceń.

---

## Sprint 0.3.7
*Status: Zakończony*
- [x] ✔ Ujednolicono nagłówki metadanych dla wszystkich eksportów XLSX i CSV.

---

## Sprint 0.3.8
*Status: Zakończony*
- [x] ✔ Ujednolicono formatowanie nazwiska i imienia (`Nazwisko Imię`) w miesięcznym raporcie pracowników w widoku, XLSX oraz CSV.

---

## Sprint 0.3.9
*Status: Do weryfikacji*
- [x] ✔ Naprawiono główny layout aplikacji (stały navbar i sidebar, izolacja przewijania do `content-wrapper`, lepki nagłówek `.table th`, brak podwójnych scrollbarów).

---

## Sprint 0.4.0
*Status: Do weryfikacji*
- [x] ✔ Ujednolicenie kontraktu API Pulpitu Menedżerskiego (`GET /api/analytics/dashboard`).
- [x] ✔ Poprawne zliczanie otwartych zleceń (`openOrdersCount`) oraz zleceń zamkniętych w bieżącym miesiącu (`closedThisMonthCount`).
- [x] ✔ Analiza wykorzystania budżetu dla wszystkich otwartych zleceń bez limitu 5 zleceń.
- [x] ✔ Poprawne zasilanie i sortowanie sekcji zleceń przekraczających budżet (`ordersExceeding` >100%) oraz blisko przekroczenia (`ordersApproaching` 80%–100%).
- [x] ✔ Dodanie pełnego pakietu testów regresyjnych dla backendu i frontendu.

---

## Sprint 0.4.1
*Status: Do weryfikacji*
- [x] ✔ Blokada automatycznego kopiowania wpisów (`Copy Last Day`) na dni wolne (sobota, niedziela).
- [x] ✔ Możliwość ręcznej rejestracji w weekend wyłącznie rzeczywistej pracy wykonywanej na zleceniu (`requiresOrder = true` i `orderId != null`).
- [x] ✔ Blokada rejestracji i edycji wszelkich nieobecności w weekendy.
- [x] ✔ Rozbudowany pakiet testów regresyjnych.

---

## Sprint 0.4.2
*Status: Do weryfikacji*
- [x] ✔ Przywrócenie sumowania wszystkich aktywnych godzin (`deletedAt = null`) na Pulpicie Menedżerskim (`hoursToday`, `hoursMonth`) dla zapewnienia funkcji kontrolnej (L4, urlopy, godziny bez zlecenia).
- [x] ✔ Zachowanie w całości backendowej blokady nieprawidłowych wpisów weekendowych oraz blokady Copy Last Day z v0.4.1.
- [x] ✔ Zaktualizowany pakiet testów regresyjnych dashboardu.
