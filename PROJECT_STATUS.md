# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja produkcyjna: `0.5.4`
- Aktualna wersja development: `0.5.4`
- Gałąź produkcyjna: `main`
- Gałąź robocza: `development`
- Stan prac: v0.5.4 wydane; uszczelnienie słownika rodzajów czasu pracy (WorkTimeTypes hardening) po niezależnym przeglądzie: bezpieczna korekta WKU (requires_order=false, is_absence=true) z zachowaniem nazwy i statusu własności, wąska migracja i bezpieczny seed bez przejmowania typów własnych (OP, NN itp.), naprawa wyrównania kolumn tabeli słowników w UI, ujednolicenie semantyki diagnostyki rozliczenia, wykonywalne testy bazy danych PostgreSQL oraz testy integracji z mechanizmami v0.5.3

Zakres wersji `0.5.4` (rework po niezależnym przeglądzie):

- Bezpieczna korekta semantyki kodu `WKU` w słowniku: `requires_order = false`, `is_absence = true`.
- Zachowanie nienaruszonej nazwy klienta (`name`) oraz statusu własności (`is_system = false`) dla istniejącego rekordu WKU.
- Przeprojektowanie migracji bazy danych `20260908120000_canonical_work_time_types_hardening`: aktualizuje wyłącznie WKU w wąskim, precyzyjnym zakresie, bez wprowadzania niezatwierdzonych kodów wieloznacznych (`NN`, `NU`, `NUN`, `NUP`, `UB`, `UO`, `UPP`, `OP`) i bez przejmowania typów własnych klienta (w tym `OP`).
- Bezpieczny seed produkcyjny (`seed.ts`): ograniczony wyłącznie do 7 ustalonych kanonicznych kodów systemowych (`G`, `NDR`, `NS`, `UW`, `UOK`, `UŻ`, `L4`), zachowujący nazwy zmodyfikowane przez administratora i chroniący typy własne.
- Naprawa mapowania kolumn w widoku tabeli Słownika Rodzajów Czasu Pracy (`DictionariesView.tsx`): `Kod`, `Pełna nazwa`, `Wymaga zlecenia`, `Nieobecność`, `Status słownika`, `Akcje`.
- Poprawa semantyki diagnostyki rozliczenia w `analytics.ts`: precyzyjne rozróżnienie „Brak zlecenia” od „Typ nie jest nieobecnością i nie wymaga zlecenia” oraz wykrywanie podwójnego naliczenia nieobecności ze zleceniem w rozliczeniu.
- Zachowano pełną zgodność niezmiennika sumy wkładów diagnostyki (`sum(contribution) === difference`) oraz spójność migawki transakcyjnej (`RepeatableRead`).
- Dodanie wykonywalnych testów migracji i seeda na kontenerze PostgreSQL (`executable-database-migration.test.ts`), testujących zachowanie custom WKU, custom OP, kolizji, typów własnych, historycznych raportów oraz instalacji od zera.
- Dodanie testów integracyjnych WKU z mechanizmami v0.5.3 (`analytics.test.ts`, `ReportsView.test.tsx`): weekendy, święta ustawowe, Wigilia 2025+, nadrzędność wyjątków kalendarza, poprawność `workingDays`, brak naliczania godzin w dni wolne, eksport XLSX i CSV.

## Weryfikacja wersji 0.5.4

- backend: 192 testów zakończonych powodzeniem (15 plików testowych), w tym 5 testów na rzeczywistej bazie PostgreSQL w kontenerze weryfikujących ścisłą ścieżkę produkcyjną (`prisma migrate deploy` oraz `node dist/prisma/seed.js`),
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) oraz generowanie klienta (`npx prisma generate`) — zakończone powodzeniem,
- frontend: 93 testy zakończone powodzeniem (10 plików testowych),
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń,
- git diff --check: brak błędów białych znaków.

Zakres wersji `0.5.3`:

- Dodano automatyczne wyznaczanie polskich świąt ustawowych w module `backend/src/utils/holidays.ts` (w tym uwzględnienie Wigilii Bożego Narodzenia 24 grudnia od 2025 roku).
- Kalendarz zakładowy: nadrzędność wyjątków administratora nad domyślnymi regułami dni roboczych, weekendów i świąt.
- Raport okresów nieobecności: uwzględnienie dni wolnych (świąt ustawowych, weekendów, wyjątków kalendarza) w mostkowaniu okresów, bez sztucznego zwiększania liczby dni roboczych (`workingDays`).
- Dodano łączne podsumowanie liczby dni nieobecności w stopce tabeli oraz spójny eksport CSV.

## Weryfikacja wersji 0.5.3

- backend: 186 testów zakończonych powodzeniem (14 plików testowych),
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) — schemat poprawny,
- frontend: 92 testy zakończone powodzeniem (10 plików testowych),
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń.

## Weryfikacja wersji 0.5.2

- backend: 164 testy zakończone powodzeniem (12 plików testowych), w tym 5 deterministycznych testów regresyjnych współbieżności i spójności migawki transakcyjnej, strażnika niezmiennika oraz deterministyczne parsowanie XLSX przez ExcelJS,
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) — schemat poprawny (z lokalnym parse-only DATABASE_URL),
- frontend: 88 testów zakończonych powodzeniem (10 plików testowych), w tym szczegółowe testy renderowania pól diagnostyki w UI,
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń,
- verify-release.sh: zatrzymany przez feature branch guard na gałęzi `feature/v0.5.2-production-followup` (zgodnie z przeznaczeniem skryptu).

Zakres Pakietu 2 (Sumy kontrolne zamknięcia miesiąca):

- Dodano automatyczną sekcję „Kontrola rozliczenia czasu” w trybie Raportu zamknięcia w widoku „Godziny wg zleceń”.
- Zaimplementowano backendową logikę analityczną `getClosureControlSummary` oraz dedykowany endpoint `GET /api/analytics/closure-control-summary`.
- Logika dynamicznie agreguje godziny zleceń oraz wszystkie rodzaje nieobecności ze słownika `WorkTimeType` (`isAbsence=true`) występujące w okresie, bez sztywnej listy kodów, i porównuje je z łączną sumą godzin pracowników z miesięcznego raportu czasu pracy.
- Dodano prezentację statusu zgodności (ZGODNE / NIEZGODNE) oraz różnicy w UI, eksporcie XLSX (`GET /api/analytics/export/by-order`) oraz CSV.
- Dodano zestaw testów regresyjnych dla backendu (`analytics.test.ts`) i frontendu (`ReportsView.test.tsx`).
- Zmiana nie wymaga migracji bazy danych.

## Weryfikacja Pakietu 2

- backend: 131 testów zakończonych powodzeniem, w tym 38 testów `analytics.test.ts`,
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) zakończona powodzeniem,
- frontend: 77 testów zakończonych powodzeniem, w tym 34 testy `ReportsView.test.tsx`,
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń.

Zakres Pakietu 3: fundament kalendarza zakładowego został wdrożony; nie obejmuje automatycznej bazy polskich świąt. Walidacja blokuje `G` i wszystkie typy `isAbsence=true` w dniach wolnych, a dozwolone typy nadgodzin, np. `NS`, pozostają dostępne.

Zakres wersji `0.5.1`:

- Naprawiono filtrowanie po zleceniu w Raporcie Szczegółowym (`GET /api/analytics/report-detailed`), uwzględniając parametr `orderId` w zapytaniu bazy danych.
- Poprawiono spójność filtrowania w tabeli Raportu Szczegółowego oraz w eksporcie XLSX i CSV (dodano mapowanie `productCode`).
- Dodano zestaw testów regresyjnych dla backendu (`analytics.test.ts`) i frontendu (`ReportsView.test.tsx`).
- Zmiana nie wymaga migracji bazy danych.

## Weryfikacja wersji 0.5.1

- backend: 127 testów zakończonych powodzeniem, w tym 34 testy `analytics.test.ts` (nowy test: niestandardowe typy nieobecności z `isAbsence=true`, mostkowanie weekendów, rozdzielanie przerwami, pomijanie `isAbsence=false`),
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) — schemat poprawny (DATABASE_URL nieustawione w środowisku testowym),
- frontend: 74 testy zakończone powodzeniem, w tym 31 testów `ReportsView.test.tsx`,
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń,
- test ręczny interfejsu i akceptacja użytkownika zakończone pomyślnie.

Zakres wersji `0.4.9`:

- Dodano tryb „Raport zamknięcia” do raportu „Godziny wg zleceń”, bez tworzenia nowej zakładki.
- Tryb pokazuje otwarte zlecenia z dodatnią sumą godzin oraz zlecenia zamknięte w inkluzywnym zakresie `completionDate`, również bez godzin w tym okresie.
- Usunięte zlecenia, usunięte wpisy, zlecenia zawieszone i zamknięte poza zakresem są pomijane.
- JSON i XLSX korzystają ze wspólnego generatora wierszy, zachowując identyczne sortowanie i rekordy zerowe.
- Stan trybu jest elementem wersjonowanych filtrów `report.by-order` w `sessionStorage`; sprzeczne filtry statusu i „tylko z godzinami” są wyłączone oraz ignorowane w aktywnym trybie.
- Zmiana nie wymaga migracji bazy danych.

## Weryfikacja wersji 0.4.9

- backend: 121 testów zakończonych powodzeniem, w tym 28 testów `analytics.test.ts`,
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) zakończona powodzeniem,
- frontend: 70 testów zakończonych powodzeniem, w tym 27 testów `ReportsView.test.tsx`,
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń,
- test ręczny interfejsu i akceptacja użytkownika pozostają do wykonania.

Zakres wersji `0.4.8`:

- Dodano wspólny hook `useReportFilters` obsługujący wersjonowany odczyt, zapis i usuwanie filtrów z `sessionStorage`.
- Wszystkie pięć raportów przechowuje niezależne zestawy filtrów pod osobnymi kluczami `report.*`.
- Filtry są odtwarzane po zmianie zakładki, powrocie do modułu i ponownym zamontowaniu widoku; reset usuwa wyłącznie zapis aktywnego raportu.
- Nie wprowadzono zmian backendu, API, bazy danych ani innych funkcjonalności.

## Weryfikacja wersji 0.4.8

- backend: 105 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 61 testów zakończonych powodzeniem, w tym 18 testów `ReportsView`,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń,
- frontend: build (`npm run build`) zakończony powodzeniem,
- test ręczny interfejsu i akceptacja użytkownika pozostają do wykonania.

Zakres wersji `0.4.7`:

- Dodano niezależną klasyfikację `WorkTimeType.isAbsence` wraz z bezpieczną migracją standardowych kodów `UW`, `UOK`, `UŻ` i `L4`.
- Dodano administracyjną obsługę właściwości „Nieobecność” w słowniku rodzajów czasu.
- Dodano raport okresów nieobecności, filtry dat/pracownika/rodzaju oraz eksport XLSX.
- Okresy łączą kolejne dni robocze przez weekend, pomijają weekendy i duplikaty dni oraz rozdzielają się po brakującym dniu roboczym.
- Kalendarz świąt, indywidualne harmonogramy i pamiętanie filtrów nie należą do zakresu tej wersji.

> Po aktualizacji administrator powinien zweryfikować niestandardowe typy nieobecności. Automatycznie sklasyfikowano wyłącznie `UW`, `UOK`, `UŻ` i `L4`.

## Weryfikacja wersji 0.4.7

- backend: 105 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) zakończona powodzeniem,
- migracja: pełny łańcuch ośmiu migracji zastosowany na efemerycznej lokalnej bazie PostgreSQL; `prisma migrate status` potwierdził aktualny schemat, a test danych historycznych oznaczył wyłącznie `UW`, `UOK`, `UŻ` i `L4`, pozostawiając pozostałe kody jako `false`,
- frontend: 53 testy zakończone powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń,
- frontend: build (`npm run build`) zakończony powodzeniem,
- test ręczny interfejsu i akceptacja użytkownika pozostają do wykonania.

Zakres wersji `0.4.6`:

- Wprowadzono wymóg podania rzeczywistej daty zakończenia zlecenia (`Order.completionDate`) przy zamykaniu zlecenia (status `CLOSED`).
- Dodano walidację braku daty, pustego ciągu znaków oraz nieprawidłowego formatu po stronie API z kodem błędu `COMPLETION_DATE_REQUIRED` (HTTP 400).
- Rozbudowano formularz tworzenia i edycji zleceń (`OrdersView.tsx`) o wymagane pole „Rzeczywista data zakończenia” z automatyczną propozycją bieżącej daty po przełączeniu na status Zamknięte.
- Zapewniono zachowanie istniejącej daty zakończenia przy ponownym otwarciu zlecenia (`CLOSED` -> `OPEN` / `SUSPENDED`).
- Dodano prezentację daty zamknięcia w odznace statusu w tabeli Bazy Zleceń Produkcyjnych.

## Weryfikacja wersji 0.4.6

- backend: 97 testów zakończonych powodzeniem (w tym 13 nowych testów walidacji daty zakończenia zlecenia),
- backend: build (`npm run build`) zakończony powodzeniem,
- backend: walidacja schematu Prisma (`npx prisma validate`) zakończona powodzeniem,
- frontend: 50 testów zakończonych powodzeniem (w tym 5 nowych testów walidacji i prezentacji formularza),
- frontend: build (`npm run build`) zakończony powodzeniem,
- frontend: lint (`npm run lint`) zakończony powodzeniem z wynikiem 0 ostrzeżeń.

Zakres wersji `0.4.4`:

- Dodano funkcję eksportu aktualnego widoku Bazy Zleceń do pliku Excel (.xlsx) na ekranie `OrdersView`.
- Utworzono backendowy endpoint `POST /api/orders/export-xlsx` dla ról Administrator oraz Leader z walidacją parametrów Zod.
- Odzwierciedlenie aktualnego filtrowania (`searchQuery`, `statusFilter`) i sortowania (`sortField`, `sortOrder`) z obsługą brakujących dat.
- Wydzielono wspólny moduł generatora ExcelJS `backend/src/utils/excel-report.ts`, zachowujący spójny wygląd nagłówków we wszystkich raportach XLSX.
- Wygenerowany plik XLSX zawiera 16 osobnych kolumn biznesowych bez kolumny Akcje i bez parametrów technicznych.

## Weryfikacja wersji 0.4.4

- backend: 87 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 45 testów zakończonych powodzeniem,
- frontend: build (`npm run build`) zakończony powodzeniem.

## Weryfikacja wersji 0.4.2

- backend: 61 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 36 testów zakończonych powodzeniem,
- frontend: build (`npm run build`) zakończony powodzeniem.

## Weryfikacja wersji 0.4.1

- backend: 61 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 36 testów zakończonych powodzeniem,
- frontend: build (`npm run build`) zakończony powodzeniem.

## Weryfikacja wersji 0.4.0

- backend: 54 testy zakończone powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 36 testów zakończonych powodzeniem,
- frontend: build (`npm run build`) zakończony powodzeniem.

## Weryfikacja wersji 0.3.9

- backend: 49 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 34 testy zakończone powodzeniem,
- frontend: build (`npm run build`) zakończony powodzeniem.

## Weryfikacja uwag do zleceń w wersji 0.3.2

- backend: 40 testów zakończonych powodzeniem, w tym odczyt, tworzenie, edycja i walidacja uwag do zlecenia,
- backend: build zakończony powodzeniem,
- frontend: 25 testów zakończonych powodzeniem, w tym prezentacja i edycja uwag,
- frontend: build zakończony powodzeniem,
- schemat Prisma: walidacja zakończona powodzeniem,
- lint frontendu nie uruchamia się z powodu istniejącego braku pakietu `eslint` w zależnościach; zależności nie zmieniano w ramach dodawania uwag.

## Weryfikacja przewijania tabel Centrum raportów w wersji 0.3.2

- frontend: 24 testy zakończone powodzeniem, w tym kontrola wspólnej struktury przewijania wszystkich czterech zakładek raportowych,
- frontend: build zakończony powodzeniem,
- backend: build zakończony powodzeniem mimo braku zmian backendu,
- viewport 768 px: szerokość dokumentu odpowiada szerokości widoku, bez rozszerzenia strony w poziomie,
- lint frontendu nie uruchamia się z powodu istniejącego braku pakietu `eslint` w zależnościach; zależności nie zmieniano w ramach poprawki interfejsu.

## Weryfikacja poprawki raportu pracowników w wersji 0.3.2

- backend: 36 testów zakończonych powodzeniem, w tym porównanie filtrów i wartości raportu JSON z arkuszem XLSX,
- backend: build zakończony powodzeniem,
- frontend: 20 testów zakończonych powodzeniem, w tym porównanie tabeli z dynamicznym eksportem CSV,
- frontend: build zakończony powodzeniem,
- lint frontendu nie uruchamia się z powodu istniejącego braku pakietu `eslint` w zależnościach; zależności nie zmieniano w ramach poprawki raportu.

Wersja `0.3.1` obejmuje zmiany funkcjonalne podnoszące użyteczność oraz stabilność aplikacji:
- Generowanie kolumn raportu miesięcznego bezpośrednio ze słownika rodzajów czasu.
- Rozszerzone wyszukiwanie zleceń w Bazie Zleceń Produkcyjnych (po zamawiającym, numerze księgowym i numerze produktu).
- Numeracja w kolumnie "Lp." oraz stabilne sortowanie alfabetyczne (nazwisko, imię) na liście pracowników.
- Możliwość oznaczania wpisów czasem pracy jako „Brak karty” (missingCard) na poziomie formularza i bazy danych.
- Wygodna nawigacja strzałkami ◀ / ▶ pomiędzy dniami na ekranie raportowania czasu.
- Ograniczenie retencji kopii zapasowych bazy danych do 10 najnowszych kopii.

## Weryfikacja wersji 0.3.1

- backend: 35 testów zakończonych powodzeniem,
- backend: build zakończony powodzeniem,
- frontend: 16 testów zakończonych powodzeniem,
- frontend: build zakończony powodzeniem,
- lint frontendu nie uruchamia się z powodu istniejącego braku pakietu `eslint` w zależnościach; zależności nie zmieniano w ramach rozpoczęcia wersji.

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

## Znane ustalenia wymagające uwagi

- Biznesowa strefa czasowa nie jest skonfigurowana jednolicie; szczegóły oznaczono jako „do potwierdzenia” w dokumentacji.
- Obecne zachowanie dopuszcza raportowanie na prawidłową przyszłą datę; reguła biznesowa ograniczająca przyszłość pozostaje do potwierdzenia.
- Testy współbieżności używają deterministycznego modelu transakcji; nie wykonano automatycznego testu wielosesyjnego na rzeczywistym PostgreSQL.
- Limit źródła wynosi 100 aktywnych wpisów pracownika na dzień i powinien zostać zweryfikowany względem rzeczywistych, zanonimizowanych rozkładów danych.
- Bezpośredni zapis wpisu przez API sprawdza istnienie nieusuniętego zlecenia, ale nie wymusza jego statusu `OPEN` ani flagi `isActive`.

## Rozpoczęcie kolejnej pracy

Przed następną zmianą należy wykonać procedurę z `docs/session-start.md`, sprawdzić aktualność tego pliku i zaktualizować go, jeżeli zmieniły się wersja, zakończony zakres, wyniki weryfikacji lub znane ryzyka.
