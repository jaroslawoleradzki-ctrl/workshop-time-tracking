# Analiza historycznych duplikatów czasu pracy

## Cel i zasady bezpieczeństwa

Narzędzie `reports:analyze-duplicates` służy do jednorazowej, diagnostycznej analizy tabeli `work_time_reports` po historycznym błędzie funkcji kopiowania poprzedniego dnia. Nie usuwa, nie aktualizuje i nie tworzy rekordów w bazie.

Przed odczytem skrypt otwiera transakcję Prisma, wykonuje `SET TRANSACTION READ ONLY` i sprawdza `current_setting('transaction_read_only')`. Jeżeli PostgreSQL nie potwierdzi wartości `on`, analiza zostaje przerwana. Wszystkie zapytania do danych używają `findMany`; jedyne pliki tworzone przez skrypt powstają lokalnie w `backend/reports/`.

Mimo zabezpieczenia zaleca się:

- uruchamiać analizę przy użyciu użytkownika bazy z uprawnieniami wyłącznie `SELECT`;
- najpierw wykonać ją na aktualnej kopii bazy;
- chronić wygenerowane raporty, ponieważ zawierają dane pracowników i identyfikatory rekordów;
- nie używać pliku `high-candidates.json` jako wejścia do automatycznego `DELETE`.

## Uruchomienie

Skrypt korzysta z istniejącego `DATABASE_URL`. Polecenie należy wykonać w katalogu `backend`:

```bash
npm run reports:analyze-duplicates -- --from YYYY-MM-DD --to YYYY-MM-DD
```

Przykład:

```bash
cd backend
npm run reports:analyze-duplicates -- --from 2026-06-01 --to 2026-07-24
```

Obie granice dotyczą daty raportowanej, są włączne i muszą mieć format `YYYY-MM-DD`. Skrypt nie przyjmuje flag modyfikujących dane.

## Wykorzystywane tabele i pola

Sygnatura identycznego wpisu składa się z:

- `date`,
- `employee_id`,
- `order_id` (również `NULL`),
- `hours`,
- `work_time_type_code`.

Te pola opisują biznesową treść `WorkTimeReport`. Model nie ma pola komentarza. Różne zlecenie, typ czasu albo liczba godzin zawsze tworzą odrębną grupę.

Dodatkowe dowody pochodzą z:

- `created_at` i `created_by_user_id` – kolejność, odstępy i wspólny twórca;
- `updated_at`, `modified_by_user_id` i `deleted_at` – późniejsze zmiany obniżające pewność;
- relacji `Employee`, `Order` i `User` – nazwy pracownika, zlecenia i użytkownika;
- `audit_logs` – indywidualnych audytów `CREATE` oraz nowszych audytów operacyjnych `eventType: COPY_LAST_DAY`.

Historyczna funkcja kopiowania zapisywała osobny audyt `CREATE` dla każdego utworzonego raportu. Tak samo audytowany był ręczny POST, dlatego sam wpis w `audit_logs` nie jest dowodem kopiowania.

## Mechanizm analizy

1. Skrypt wybiera pracowników mających raporty w podanym zakresie.
2. Dla tych pracowników odczytuje raporty do daty `--to`. Wcześniejsze rekordy są używane wyłącznie jako kontekst źródłowy; kandydaci nadal są ograniczeni przez `--from` i `--to`.
3. Aktywne rekordy z zakresu są grupowane według pełnej sygnatury biznesowej. Rekordy usunięte są liczone w podsumowaniu, ale nie trafiają na listę kandydatów do dalszego porządkowania.
4. Rekordy tego samego pracownika, dnia i użytkownika są dzielone na krótkie partie. Domyślne okno wynosi 5 sekund.
5. Wielozbiór każdej partii jest porównywany z ostatnim wcześniejszym dniem tego pracownika, który istniał w chwili tworzenia partii.
6. Analiza wykrywa dokładne powielenie zestawu, wielokrotne utworzenie całego zestawu i dziedziczenie wcześniej wykrytej partii `HIGH` przez kolejne dni.
7. Każda grupa identycznych aktywnych rekordów otrzymuje poziom `HIGH`, `MEDIUM` albo `LOW` wraz z listą kodów dowodowych.

## Poziomy pewności

- `HIGH` – cała grupa jest objęta partiami zgodnymi ze źródłem, audyt lub jawny audyt operacji potwierdza twórcę, historia nie wskazuje późniejszych zmian, a zestaw został powtórzony co najmniej dwukrotnie albo jest dalszym etapem potwierdzonego lawinowego kopiowania.
- `MEDIUM` – zestaw prawdopodobnie pochodzi z kopiowania, lecz może być pojedynczym poprawnym przeniesieniem już istniejących identycznych wpisów albo ma niepełne dowody.
- `LOW` – rekordy są biznesowo identyczne, ale czas utworzenia, brak zgodnego źródła lub brak historii nie pozwala wiarygodnie przypisać ich do błędnego kopiowania. Przykładem są dwa ręczne wpisy utworzone w różnych godzinach.

Każdy poziom wymaga przeglądu. Narzędzie celowo nie wskazuje najstarszego rekordu jako „oryginału” i nie wybiera identyfikatorów do usunięcia.

## Wyniki

Każde uruchomienie tworzy katalog:

```text
backend/reports/duplicate-analysis-YYYYMMDD-HHMMSS/
```

Zawartość:

- `duplicate-analysis.json` – pełne parametry, podsumowanie, partie, grupy, rekordy, odstępy i ograniczenia;
- `duplicate-analysis.csv` – jeden wiersz na rekord w podejrzanej grupie, przeznaczony do ręcznej analizy;
- `high-candidates.json` – grupy `HIGH` i wszystkie ich identyfikatory, z flagą `reviewRequired`; nie jest to lista `DELETE`.

Terminal pokazuje liczby grup według poziomu, rozpoznane partie, podstawowe dane każdej grupy i ścieżkę wynikową. Katalog `backend/reports/` jest ignorowany przez Git.

## Ograniczenia

- Stare rekordy nie przechowują `operationId` ani `requestId` funkcji kopiowania.
- Audyt `CREATE` nie rozróżnia ręcznego POST od starego kopiowania i mógł nie zostać zapisany po błędzie audytu.
- Bieżące `updated_at` oraz `deleted_at` nie są pełnym obrazem stanu rekordu w dowolnym momencie historycznym.
- Szybka ręczna seria może przypominać kopiowanie, zwłaszcza gdy składa się z jednego rekordu.
- Użytkownik systemu nie jest relacyjnie powiązany z pracownikiem, którego czas raportuje.
- Dla pracowników z raportami w zakresie odczytywany jest także wcześniejszy kontekst do daty `--to`; na dużych bazach analizę warto dzielić na krótsze okresy.
- Klasyfikacja jest wsparciem dla człowieka, a nie automatyczną decyzją o usunięciu danych.

## Testy

Testy klasyfikatora nie wymagają połączenia z bazą:

```bash
cd backend
npm test -- tests/duplicate-report-classifier.test.ts
```

Pełny zestaw backendu:

```bash
cd backend
npm test
```
