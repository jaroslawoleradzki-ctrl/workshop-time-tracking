# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja: `0.2.8`
- Gałąź robocza: `development`
- Ostatni zakończony pakiet: rozbudowa dokumentacji biznesowej i projektowej
- Ostatni zatwierdzony commit tego pakietu: `e438d3d` (`docs: add business documentation and project documentation structure`)

Gałąź `development` zawiera działającą aplikację do rejestrowania i raportowania czasu pracy, zarządzania pracownikami, zleceniami, użytkownikami i rodzajami czasu, importowania pracowników i zleceń oraz generowania raportów i eksportów.

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

## Weryfikacja ostatniego pakietu

Przed zatwierdzeniem pakietu dokumentacyjnego wykonano:

- backend: 5 testów zakończonych powodzeniem,
- backend: build zakończony powodzeniem,
- frontend: 3 testy zakończone powodzeniem,
- frontend: build zakończony powodzeniem,
- kontrolę linków względnych i `git diff --check` zakończoną bez błędów.

Lint frontendu nie uruchomił się, ponieważ skrypt odwołuje się do `eslint`, którego nie ma w zależnościach projektu. Nie zmieniano zależności w ramach zadania dokumentacyjnego.

## Znane ustalenia wymagające uwagi

- Biznesowa strefa czasowa nie jest skonfigurowana jednolicie; szczegóły oznaczono jako „do potwierdzenia” w dokumentacji.
- Kopiowanie poprzedniego dnia działa dla ostatniej wcześniejszej daty znalezionej globalnie i kopiuje kwalifikujące się wpisy wszystkich pracowników.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
