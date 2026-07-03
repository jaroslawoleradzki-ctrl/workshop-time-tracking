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
- [x] ✔ Zabezpieczenie ról w nawigacji – rola Leader widzi wyłącznie zakładki Raportowanie oraz Raporty.
- [x] ✔ Przeniesienie panelu użytkownika oraz czerwonego przycisku Wyloguj do górnego paska (Navbar).
- [x] ✔ Stała, stabilna wysokość sidebara (`100vh`) i dedykowany pasek wersji systemu w stopce sidebara.
- [x] ✔ Dodanie przycisku **Dzisiaj** (niebieski - primary) automatycznie odświeżającego wpisy dla wybranej daty.
- [x] ✔ Pamięć stanu wybranej zakładki oraz otwartej sekcji Administracji po odświeżeniu strony w `sessionStorage`.
- [x] ✔ Płynne animacje CSS Grid rozwijania podmenu oraz obrotu ikony Chevron.
