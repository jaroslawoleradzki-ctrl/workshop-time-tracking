# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja produkcyjna: `0.2.9`; trwają prace nad `0.3.0`
- Gałąź robocza: `feature/0.3.0-deployment-stability`
- Bazowy commit Etapu 4: `bcd1631` (`chore(runtime): stabilize production container`)
- Stan zmian: Etap 4 zakończony i zweryfikowany lokalnie w jednym commicie. Commit nie został wysłany do origin.
- Stan wdrożenia: Wersja `0.3.0` nie została jeszcze wdrożona na serwer klienta.

Etapy stabilizacji wdrożenia `0.3.0` ustaliły stałą nazwę zewnętrznego wolumenu PostgreSQL, ustabilizowały produkcyjny obraz backendu i dostępność Prisma CLI oraz dodały backendowy healthcheck kontenera. Nginx oczekuje teraz na stan `service_healthy` backendu, a backend nadal oczekuje na zdrowy PostgreSQL. Polityka `restart: always` pozostała bez zmian.

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

## Weryfikacja Etapu 4 wersji 0.3.0

Przed utworzeniem commita wykonano:

- backend: 25 testów zakończonych powodzeniem, w tym deterministyczne scenariusze HTTP 200 i 503 endpointu `/api/health`,
- backend: typecheck zakończony powodzeniem,
- backend: build zakończony powodzeniem,
- frontend: 8 testów zakończonych powodzeniem,
- frontend: typecheck zakończony powodzeniem,
- frontend: build zakończony powodzeniem,
- `git diff --check` zakończony bez błędów,
- kontrola składni YAML `docker-compose.yml` zakończona powodzeniem.

Docker CLI nie jest dostępne w środowisku roboczym, dlatego nie wykonano `docker compose config` ani buildów obrazów. Nie uruchamiano PostgreSQL, kontenerów ani żadnych operacji na wolumenie produkcyjnym. Frontendowy lint nadal nie może się uruchomić, ponieważ istniejący skrypt odwołuje się do `eslint`, którego nie ma w zależnościach projektu; problem nie należy do zakresu Etapu 4.

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
