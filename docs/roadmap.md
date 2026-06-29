# Roadmapa Projektu

Roadmapa przedstawia etapy rozwoju aplikacji Workshop Time Tracking oraz plany techniczne na przyszłość.

## Legendy oznaczeń
- ✔ Zakończone
- □ Do wykonania / W planach

---

## Sprint A
*Status: Zakończony*
- [x] ✔ Wdrożenie podstawowego systemu logowania liderów i administratorów
- [x] ✔ Widok bazy pracowników z opcją dodawania i soft-delete
- [x] ✔ Rejestracja czasu pracy w panelu raportowania
- [x] ✔ Podstawowe walidacje dobowe godzin

## Sprint B
*Status: Zakończony z wyjątkiem automatycznego seeda*
- [x] ✔ Automatyczne uruchamianie migracji przy produkcyjnym starcie w Dockerze
- [x] ✔ Rozdzielenie danych pracowników na Imię, Nazwisko i ID pracownika
- [x] ✔ Nowy searchable combobox wyboru pracownika w panelu raportowania
- [ ] □ W pełni zautomatyzowany seed danych testowych w kontenerze produkcyjnym

## Sprint C
*Status: Planowany*
- [ ] □ Przebudowa modułu zleceń i dodanie obsługi etapów zlecenia
- [ ] □ Wprowadzenie statystyk wykonania norm produkcyjnych na zlecenie
- [ ] □ Rozbudowa raportów z filtrowaniem według zleceń i okresów
- [ ] □ Obsługa uprawnień dla liderów w zakresie edycji archiwalnych wpisów

---

## Sprint techniczny
Dług technologiczny i zadania optymalizacyjne:
- **T1: Optymalizacja z-index i pozycjonowania dropdownów**: Ujednolicenie stylów nakładania się dropdownów autouzupełniania dla zleceń oraz pracowników.
- **T2: Zautomatyzowany seed produkcyjny**: Przebudowa produkcyjnego uruchamiania skryptu seedującego bez zależności deweloperskich.
- **T3: Walidacja Excel**: Ulepszenie parsera plików importu w backendzie w celu dokładnego logowania błędnych danych wejściowych w arkuszu.
