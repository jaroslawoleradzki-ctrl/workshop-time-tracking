# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja produkcyjna: `0.2.9`; wersja przygotowana do wydania: `0.3.0`
- Gałąź robocza: `feature/0.3.0-deployment-stability`
- Bazowy commit przygotowania wydania: `c0b6a5f` (`fix(runtime): include Prisma engine for Alpine OpenSSL 3`)
- Stan zmian: metadane backendu, frontendu, plików lock, Docker Compose i dokumentacji wskazują wersję wydania `0.3.0`.
- Stan wdrożenia: próba wdrożenia commita `df4eae0` nie uruchomiła backendu, ponieważ produkcyjny seed nie znalazł Query Engine dla `linux-musl-openssl-3.0.x`; poprawka jest dostępna na gałęzi roboczej, ale wersja `0.3.0` nie została jeszcze ponownie wdrożona.

Etapy stabilizacji wdrożenia `0.3.0` ustabilizowały produkcyjny obraz backendu i dostępność Prisma CLI, dodały backendowy healthcheck kontenera oraz rozdzieliły konfigurację klienta od śledzonych plików. Poprawka runtime jawnie generuje i kopiuje Query Engine `linux-musl-openssl-3.0.x`, którego brak blokował produkcyjny seed. Nginx oczekuje na stan `service_healthy` backendu, a backend nadal oczekuje na zdrowy PostgreSQL. PostgreSQL, JWT, porty, poziom logowania i dokładna nazwa zewnętrznego wolumenu są ustawiane przez ignorowany rootowy `.env`; rutynowa aktualizacja nie wymaga już `git stash`. Polityka `restart: always` pozostała bez zmian.

Pierwsza zmiana funkcjonalna generuje kolumny miesięcznego raportu pracowników z aktualnego słownika rodzajów czasu oraz upraszcza tekst prezentowany przy braku konta księgowego.

Kolejna zmiana rozszerza wyszukiwarkę Bazy Zleceń Produkcyjnych o częściowe, nieczułe na wielkość liter dopasowanie po zamawiającym, numerze księgowym i numerze produktu.

## Weryfikacja poprawki Prisma runtime

- `npm ci` backendu zakończone powodzeniem; zgłoszono 5 istniejących podatności audytu zależności,
- `./node_modules/.bin/prisma generate` zakończone powodzeniem i utworzyło `libquery_engine-linux-musl-openssl-3.0.x.so.node`,
- backend: build oraz 28 testów zakończone powodzeniem,
- frontend: build oraz 8 testów zakończone powodzeniem,
- statyczna kontrola konfiguracji Prisma/Dockerfile i wygenerowanego engine'u zakończona powodzeniem,
- `bash -n scripts/verify-release.sh` zakończone powodzeniem; `shellcheck` nie jest dostępny,
- lint frontendu pozostaje niedostępny z powodu istniejącego braku pakietu `eslint` w zależnościach.

Docker CLI ani alternatywny runtime kontenerowy nie są dostępne w środowisku roboczym. Z tego powodu build obrazu backendu oraz izolowany test startu z PostgreSQL wymagają wykonania na hoście z Dockerem przed ponownym wdrożeniem. Nie uruchamiano żadnych operacji na produkcyjnej bazie ani wolumenie.

## Weryfikacja wersji 0.3.1

- backend: 30 testów zakończonych powodzeniem,
- backend: build zakończony powodzeniem,
- frontend: 13 testów zakończonych powodzeniem,
- frontend: build zakończony powodzeniem,

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

## Weryfikacja Etapu 5 wersji 0.3.0

Przed utworzeniem commita wykonano:

- `npm ci` backendu i frontendu zakończone powodzeniem,
- backend: 28 testów zakończonych powodzeniem, w tym brak sekretu JWT, podpisywanie skonfigurowanym sekretem oraz scenariusze healthcheck,
- backend: typecheck zakończony powodzeniem,
- backend: build zakończony powodzeniem,
- frontend: 8 testów zakończonych powodzeniem,
- frontend: typecheck zakończony powodzeniem,
- frontend: build zakończony powodzeniem,
- `git diff --check` zakończony bez błędów,
- kontrolę reguł ignorowania `.env`, braku śledzonych lokalnych plików środowiskowych oraz lokalnego ładowania `backend/.env`,
- kontrolę zgodności bezpośrednich zależności w obu plikach `package-lock.json`.

Docker CLI nie jest dostępne w środowisku roboczym, dlatego nie wykonano `docker compose config` ani buildów obrazów. Nie uruchamiano PostgreSQL, kontenerów ani żadnych operacji na wolumenie produkcyjnym. `npm ci` zgłasza istniejące podatności audytu zależności (backend: 5, frontend: 2); aktualizacja zależności nie należy do zakresu Etapu 5.

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
- Wersja 0.3.0 zachowuje możliwość raportowania na prawidłową przyszłą datę; reguła biznesowa ograniczająca przyszłość pozostaje do potwierdzenia.
- Testy współbieżności używają deterministycznego modelu transakcji; środowisko robocze nie udostępnia Dockera, dlatego nie wykonano automatycznego testu wielosesyjnego na rzeczywistym PostgreSQL.
- Limit źródła wynosi 100 aktywnych wpisów pracownika na dzień i powinien zostać zweryfikowany względem rzeczywistych, zanonimizowanych rozkładów danych.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
