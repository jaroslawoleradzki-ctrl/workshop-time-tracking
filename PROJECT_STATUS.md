# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja: `0.2.9`
- Gałąź robocza: `fix/duplicate-reports-cleanup`
- Ostatni zatwierdzony commit: `b7fb467` (`feat(maintenance): add duplicate repair manifest v2`)
- Stan zmian: Ukończono etap 4C – implementacja rzeczywistego wykonania naprawy duplikatów w trybach `--execute --dry-run` oraz `--execute --apply` z zachowaniem transakcyjności, blokad pg_advisory_xact_lock i logów audytowych.
- Stan wdrożenia: W pełni sprawny i przetestowany executor.

Gałąź `development` zawiera zweryfikowaną poprawkę krytyczną operacji kopiowania ostatniego dnia. Bieżąca gałąź zawiera zatwierdzone etapy 1–4A, lokalny etap 4B oraz ukończony etap 4C. Builder generuje manifest v2 z rekordowymi preconditions, fingerprintami i konkretnymi poprzednikami. Detektor v2 rozpoznaje powtórzone sesje importu tego samego zestawu wpisów w odstępach kilku minut i przekazuje dowód `REPEATED_IMPORT_SESSION` do buildera manifestu bez zmian w executorze ani schemacie bazy. Builder rekonstruuje poprzedników dla takich sesji, dzięki czemu pierwsza stabilna fala może być `KEEP`, a późniejsze fale mogą otrzymać propozycje `DELETE` przy zachowaniu pełnych preconditions. Executor obsługuje teraz rzeczywistą bazę danych PostgreSQL, weryfikuje stany przed operacją, wykonuje soft delete rekordów DELETE w transakcji RepeatableRead, zapisuje powiązane audyty (usunięcie pojedynczych wpisów, zakończenie batcha, podsumowanie operacji) oraz chroni przed współbieżnością blokadą pg_advisory_xact_lock. W przypadku jakichkolwiek błędów transakcja jest w pełni wycofywana (rollback). Idempotentność jest wspierana – ponowne wykonanie jest no-op.

## Weryfikacja etapu 4C – Rzeczywiste wykonanie naprawy duplikatów

Przed przekazaniem do przeglądu wykonano:

- backend: Dodano 7 testów integracyjnych w `tests/duplicate-repair-executor.test.ts` weryfikujących:
  - poprawny dry-run,
  - poprawny apply,
  - automatyczny rollback przy błędach,
  - walidację zmienionego rekordu w bazie danych (blokowanie),
  - walidację zmienionego poprzednika w bazie danych (blokowanie),
  - odrzucanie niezatwierdzonego manifestu,
  - odrzucanie przy błędnej nazwie bazy danych.
- backend: Łącznie 26/26 testów przechodzi pomyślnie.
- backend: Kompilacja i typecheck skryptów diagnostycznych (`npx tsc --project tsconfig.scripts.json`) zakończona powodzeniem.
- backend i frontend: build zakończony powodzeniem.
- `git diff --check` zakończony bez błędów.

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

## Historyczna weryfikacja Repair Manifest Builder v1

- 10 testów jednostkowych buildera zakończonych powodzeniem,
- pełny backend: 41 testów zakończonych powodzeniem,
- frontend: 8 testów zakończonych powodzeniem,
- typecheck skryptów diagnostycznych zakończony powodzeniem,
- build backendu i frontendu zakończony powodzeniem,
- na istniejącym lokalnym raporcie zawierającym 504 batche wygenerowano przykładowy manifest: 8 KEEP, 11 propozycji DELETE i 494 REVIEW,
- wszystkie propozycje DELETE wymagają ręcznej weryfikacji, a manifest pozostaje `approved: false`,
- skrypt nie utworzył połączenia z bazą i zapisał wyłącznie pliki w ignorowanym katalogu `backend/reports/`.

Lint frontendu nadal nie uruchamia się, ponieważ istniejący skrypt odwołuje się do `eslint`, którego nie ma w zależnościach projektu. Nie zmieniano zależności poza zakresem narzędzi naprawczych.

## Historyczna weryfikacja Repair Manifest v2 – etap 4A

- 8 testów klasyfikatora analizatora zakończonych powodzeniem,
- 14 testów jednostkowych buildera v2 zakończonych powodzeniem,
- 19 testów jednostkowych executora v1/v2 zakończonych powodzeniem,
- pełny backend: 65 testów zakończonych powodzeniem,
- typecheck skryptów diagnostycznych zakończony powodzeniem,
- `--summary` potwierdzono dla istniejącego v1 i nowego v2,
- `--approve` zachowuje snapshoty, fingerprinty i poprzedników v2; nie zatwierdzano rzeczywistego manifestu,
- `--execute` odrzuca v1, waliduje kompletny v2 i nadal zwraca wyłącznie komunikat stubu,
- ponowny analizator zakresu 2026-06-01–2026-07-24 potwierdził transakcję PostgreSQL READ ONLY na lokalnej bazie; wykrył 4 aktywne raporty i 0 grup podejrzanych,
- pełny lokalny pipeline dla tej analizy utworzył manifest v2: 1 KEEP, 0 DELETE, 0 REVIEW,
- na istniejącym bezpiecznym raporcie 504 batchy: v1 miał 8 KEEP, 11 DELETE, 494 REVIEW i 611 rekordów DELETE; v2 ma 8 KEEP, 1 DELETE, 504 REVIEW, 2 rekordy DELETE z konkretnymi poprzednikami i 10 batchy zdegradowanych do REVIEW,
- moduł executora nie importuje Prisma, nie korzysta z `DATABASE_URL` i nie otwiera połączenia z bazą.

- build backendu zakończony powodzeniem,
- testy frontendu: 8/8 zakończonych powodzeniem,
- build frontendu zakończony powodzeniem,
- `git diff --check` zakończony bez błędów.

Lint frontendu nie został uruchomiony, ponieważ `eslint` nadal nie jest zainstalowany w zależnościach projektu. Zgodnie z zakresem etapu 4A nie instalowano nowych zależności tylko w celu lintowania.

## Weryfikacja kwalifikowania poprzedników – etap 4B

- 19 testów jednostkowych buildera v2 zakończonych powodzeniem,
- 19 testów jednostkowych executora v1/v2 zakończonych powodzeniem,
- pełny backend: 70/70 testów zakończonych powodzeniem,
- frontend: 8/8 testów zakończonych powodzeniem,
- typecheck skryptów diagnostycznych zakończony powodzeniem,
- build backendu i frontendu zakończony powodzeniem,
- `git diff --check` zakończony bez błędów,
- nie uruchamiano ponownie analizatora; builder otrzymał istniejący bezpieczny `duplicate-analysis-20260720-101544/duplicate-analysis.json`,
- przed poprawką manifest v2 miał 8 KEEP, 1 DELETE, 504 REVIEW, 2 rekordy DELETE i 10 batchy zdegradowanych przez brak preconditions,
- po poprawce manifest v2 ma 8 KEEP, 2 DELETE, 503 REVIEW, 8 rekordów DELETE z konkretnymi poprzednikami i 9 batchy zdegradowanych,
- wyłącznie `batch-1136` zmienił klasyfikację z REVIEW na DELETE; wskazuje 6 rekordów na zachowywany `batch-1134`,
- `batch-1145` i `batch-1151` pozostały REVIEW, ponieważ odpowiednio 21 i 51 rekordów nadal nie ma kwalifikowanego poprzednika KEEP,
- wygenerowany manifest pozostaje `approved: false`; nie uruchamiano `--approve` ani prawdziwego wykonania,
- builder i executor nie połączyły się z bazą, a `--execute` nadal jest stubem.

Lint frontendu nie został uruchomiony, ponieważ `eslint` nie jest dostępny w zależnościach projektu. Nie instalowano nowych zależności w ramach etapu 4B.

## Znane ustalenia wymagające uwagi

- Biznesowa strefa czasowa nie jest skonfigurowana jednolicie; szczegóły oznaczono jako „do potwierdzenia” w dokumentacji.
- Wersja 0.2.9 zachowuje możliwość raportowania na prawidłową przyszłą datę; reguła biznesowa ograniczająca przyszłość pozostaje do potwierdzenia.
- Testy współbieżności używają deterministycznego modelu transakcji; środowisko robocze nie udostępnia Dockera, dlatego nie wykonano automatycznego testu wielosesyjnego na rzeczywistym PostgreSQL.
- Limit źródła wynosi 100 aktywnych wpisów pracownika na dzień i powinien zostać zweryfikowany względem rzeczywistych, zanonimizowanych rozkładów danych.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
