# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja: `0.2.9`
- Gałąź robocza: `fix/duplicate-reports-cleanup`
- Ostatni zatwierdzony commit: `36c884b` (`feat(maintenance): add read-only duplicate repair manifest builder`)
- Stan zmian: lokalny, niezatwierdzony etap 3 – Duplicate Repair Executor; zmiany nie zostały wypchnięte ani scalone.
- Stan wdrożenia: narzędzia diagnostyczne i executor nie zostały wdrożone; etap 3 nie łączy się z bazą danych i nie wykonuje naprawy.

Gałąź `development` zawiera zweryfikowaną poprawkę krytyczną operacji kopiowania ostatniego dnia. Bieżąca gałąź zawiera zatwierdzone etapy 1 i 2 oraz lokalny etap 3: jeden executor z trybem podsumowania, atomowym zatwierdzaniem akcji DELETE w tym samym manifeście i stubem wykonania. Executor nie importuje Prisma, nie używa `DATABASE_URL` i nie wykonuje `INSERT`, `UPDATE`, `DELETE` ani soft delete.

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
- istniejący lokalny `duplicate-analysis.json` został wykorzystany jako wejście etapu 2; dokumentacja nie przypisuje tego pliku do środowiska produkcyjnego.

## Weryfikacja Repair Manifest Builder

- 10 testów jednostkowych buildera zakończonych powodzeniem,
- pełny backend: 41 testów zakończonych powodzeniem,
- frontend: 8 testów zakończonych powodzeniem,
- typecheck skryptów diagnostycznych zakończony powodzeniem,
- build backendu i frontendu zakończony powodzeniem,
- na istniejącym lokalnym raporcie zawierającym 504 batche wygenerowano przykładowy manifest: 8 KEEP, 11 propozycji DELETE i 494 REVIEW,
- wszystkie propozycje DELETE wymagają ręcznej weryfikacji, a manifest pozostaje `approved: false`,
- skrypt nie utworzył połączenia z bazą i zapisał wyłącznie pliki w ignorowanym katalogu `backend/reports/`.

Lint frontendu nadal nie uruchamia się, ponieważ istniejący skrypt odwołuje się do `eslint`, którego nie ma w zależnościach projektu. Nie zmieniano zależności poza zakresem narzędzi naprawczych.

## Weryfikacja Duplicate Repair Executor

- 10 testów jednostkowych executora zakończonych powodzeniem,
- pełny backend: 51 testów zakończonych powodzeniem,
- frontend: 8 testów zakończonych powodzeniem,
- typecheck skryptów diagnostycznych zakończony powodzeniem,
- build backendu i frontendu zakończony powodzeniem,
- tryb summary nie zmienia manifestu ani nie tworzy plików,
- approve odrzuca KEEP, REVIEW i brakujący batch bez częściowego zapisu,
- execute weryfikuje `manifestVersion: 1`, wymagane pola oraz zatwierdzone DELETE i zwraca wyłącznie komunikat stubu,
- moduł nie importuje Prisma, nie korzysta z `DATABASE_URL` i nie otwiera połączenia z bazą.

Lint frontendu nadal nie uruchamia się, ponieważ w zależnościach projektu nie ma programu `eslint`; nie rozszerzano zależności w ramach etapu 3.

## Znane ustalenia wymagające uwagi

- Biznesowa strefa czasowa nie jest skonfigurowana jednolicie; szczegóły oznaczono jako „do potwierdzenia” w dokumentacji.
- Wersja 0.2.9 zachowuje możliwość raportowania na prawidłową przyszłą datę; reguła biznesowa ograniczająca przyszłość pozostaje do potwierdzenia.
- Testy współbieżności używają deterministycznego modelu transakcji; środowisko robocze nie udostępnia Dockera, dlatego nie wykonano automatycznego testu wielosesyjnego na rzeczywistym PostgreSQL.
- Limit źródła wynosi 100 aktywnych wpisów pracownika na dzień i powinien zostać zweryfikowany względem rzeczywistych, zanonimizowanych rozkładów danych.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
