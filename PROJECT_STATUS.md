# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja: `0.2.9`
- Gałąź robocza: `fix/duplicate-reports-cleanup`
- Ostatni zatwierdzony commit: `c949b9d` (`docs: update project status after 0.2.9 merge`)
- Stan zmian: lokalne, niezatwierdzone narzędzie read-only do analizy historycznych duplikatów; zmiany nie zostały wypchnięte ani scalone.
- Stan wdrożenia: narzędzie diagnostyczne nie zostało wdrożone ani uruchomione na produkcyjnej bazie.

Gałąź `development` zawiera zweryfikowaną poprawkę krytyczną operacji kopiowania ostatniego dnia. Bieżąca gałąź dodaje wyłącznie diagnostykę poza kodem produkcyjnym: klasyfikator, CLI wymuszający transakcję PostgreSQL `READ ONLY`, eksport JSON/CSV, testy jednostkowe i dokumentację. Skrypt nie wykonuje `INSERT`, `UPDATE` ani `DELETE`.

## Dokumentacja projektu

Aktualny pakiet dokumentacyjny obejmuje:

- instrukcję użytkownika,
- reguły biznesowe,
- specyfikację importów i eksportów,
- konfigurację,
- architekturę,
- testowanie,
- wdrożenie i runbook operacyjny,
- procedurę rozpoczęcia sesji projektowej,
- changelog i zrealizowane kamienie milowe.

Indeks dokumentów znajduje się w `README.md`.

## Weryfikacja poprawki 0.2.9

Przed przekazaniem do przeglądu wykonano:

- backend: 24 testy zakończone powodzeniem, w tym 19 scenariuszy kopiowania,
- backend: typecheck zakończony powodzeniem,
- backend: build zakończony powodzeniem,
- frontend: 8 testów zakończonych powodzeniem, w tym 5 scenariuszy kopiowania,
- frontend: typecheck zakończony powodzeniem,
- frontend: build zakończony powodzeniem,
- test serializacji 2 i 20 równoległych żądań na deterministycznym modelu transakcji zakończony powodzeniem,
- `git diff --check` zakończony bez błędów.

Lint frontendu nie uruchomił się, ponieważ istniejący skrypt odwołuje się do `eslint`, którego nie ma w zależnościach projektu. Nie rozszerzano zależności w ramach poprawki krytycznej.

## Weryfikacja analizatora duplikatów

- 7 testów jednostkowych klasyfikatora zakończonych powodzeniem,
- pełny backend: 31 testów zakończonych powodzeniem,
- typecheck skryptów diagnostycznych zakończony powodzeniem,
- backend i frontend: build zakończony powodzeniem,
- frontend: 8 testów zakończonych powodzeniem,
- punkt wejścia `reports:analyze-duplicates -- --help` zakończony powodzeniem bez połączenia z bazą,
- analizator nie został uruchomiony z zakresem dat ani przeciwko produkcyjnej bazie.

## Znane ustalenia wymagające uwagi

- Biznesowa strefa czasowa nie jest skonfigurowana jednolicie; szczegóły oznaczono jako „do potwierdzenia” w dokumentacji.
- Wersja 0.2.9 zachowuje możliwość raportowania na prawidłową przyszłą datę; reguła biznesowa ograniczająca przyszłość pozostaje do potwierdzenia.
- Testy współbieżności używają deterministycznego modelu transakcji; środowisko robocze nie udostępnia Dockera, dlatego nie wykonano automatycznego testu wielosesyjnego na rzeczywistym PostgreSQL.
- Limit źródła wynosi 100 aktywnych wpisów pracownika na dzień i powinien zostać zweryfikowany względem rzeczywistych, zanonimizowanych rozkładów danych.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
