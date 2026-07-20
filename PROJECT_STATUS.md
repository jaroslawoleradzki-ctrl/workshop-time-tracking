# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja: `0.2.9`
- Gałąź robocza: `fix/0.2.9-copy-last-day`
- Ostatni zatwierdzony commit: `c3c696c` (`fix(reports): secure copy-last-day operation in 0.2.9`)
- Stan zmian po code review: lokalne, niezatwierdzone i niewysłane do `origin`

Gałąź `fix/0.2.9-copy-last-day` zawiera zatwierdzony hotfix oraz lokalne poprawki po code review. Data źródłowa jest wybierana niezależnie od stanu powiązanego zlecenia, a wpisy usuniętych zleceń są pomijane dopiero przy pobieraniu wybranego dnia. Zapytanie źródłowe pobiera maksymalnie 101 rekordów, aby wykryć przekroczenie limitu 100. Kopiowanie i zwykły zapis `POST /api/reports` używają wspólnej blokady PostgreSQL dla pary pracownik–data. Nie wykonano wdrożenia, migracji danych ani merge; lokalnych poprawek po code review nie zatwierdzono i nie wysłano.

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

## Znane ustalenia wymagające uwagi

- Biznesowa strefa czasowa nie jest skonfigurowana jednolicie; szczegóły oznaczono jako „do potwierdzenia” w dokumentacji.
- Wersja 0.2.9 zachowuje możliwość raportowania na prawidłową przyszłą datę; reguła biznesowa ograniczająca przyszłość pozostaje do potwierdzenia.
- Testy współbieżności używają deterministycznego modelu transakcji; środowisko robocze nie udostępnia Dockera, dlatego nie wykonano automatycznego testu wielosesyjnego na rzeczywistym PostgreSQL.
- Limit źródła wynosi 100 aktywnych wpisów pracownika na dzień i powinien zostać zweryfikowany względem rzeczywistych, zanonimizowanych rozkładów danych.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
