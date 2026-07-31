# Status projektu

## Stan bieżący

- Projekt: Workshop Time Tracking
- Aktualna wersja produkcyjna: `0.3.3`
- Aktualna wersja development: `0.3.4`
- Gałąź produkcyjna: `main`
- Gałąź robocza: `development`
- Stan prac: wersja `0.3.4` zaimplementowana i zweryfikowana

Zakres wersji `0.3.4`:

- Dodano kolumnę „Ilość” w raporcie „Godziny wg Zleceń” oraz eksportach CSV i XLSX.
- Dodano filtr „Pokaż tylko zlecenia z zaraportowanymi godzinami” w raporcie i eksportach zleceń.
- Dodano sortowanie Bazy Zleceń Produkcyjnych po dacie zlecenia i dacie wysyłki (rosnąco / malejąco).
- Dodano sortowanie pracowników według nazwiska w raporcie pracowników.
- Zmieniono układ kolumn w raporcie pracowników: Pracownik, Suma godzin z nadgodzinami, Suma godzin bez nadgodzin, kody czasu pracy.
- Zaktualizowano eksporty CSV i XLSX w celu odzwierciedlenia nowych kolumn i filtrowania.

## Weryfikacja wersji 0.3.4

- backend: 46 testów zakończonych powodzeniem,
- backend: build (`npm run build`) zakończony powodzeniem,
- frontend: 26 testów zakończonych powodzeniem,
- frontend: build (`npm run build`) zakończony powodzeniem.

## Następne kroki (Plan na v0.3.5)

- Dostęp tylko do odczytu do Bazy Zleceń dla roli `Leader`.
- Poprawki modułu urlopów i nieobecności.
- Poprawki raportów wynikające z testów użytkowników.

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
