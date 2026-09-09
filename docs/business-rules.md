# Reguły biznesowe

Dokument opisuje zachowanie zaimplementowane w API i interfejsie wersji 0.5.2.

## Role i dostęp

- Konto ma rolę `admin` albo `leader`; API odrzuca inne role przy tworzeniu i edycji użytkownika.
- Administrator zarządza użytkownikami, pracownikami, zleceniami, rodzajami czasu i importami. Lider ma w interfejsie zakładki Raportowanie i Raporty.
- Odczyt pracowników, zleceń, rodzajów czasu i raportów wymaga aktywnego konta oraz ważnego JWT. Token wygasa po 12 godzinach.
- Użytkownik nie może dezaktywować własnego konta ani odebrać sobie roli administratora.
- `User` i `Employee` są niezależnymi modelami. Kod nie przypisuje konta użytkownika do pracownika.

## Pracownicy i zlecenia

- Pracownik ma flagę `isActive` i opcjonalny `deletedAt`. Lista raportowania pobiera tylko aktywnych, nieusuniętych pracowników.
- Lista pracowników w bazie pracowników jest sortowana alfabetycznie według nazwiska (A–Z), a przy identycznych nazwiskach pomocniczo według imienia. Zaimplementowano stabilne sortowanie na poziomie frontendu.
- Tabela pracowników zawiera pierwszą kolumnę "Lp." z kolejnymi, stabilnymi numerami wierszy (1, 2, 3, ...), odpowiadającymi aktualnemu widocznemu stanowi tabeli. Numery te nie są zapisywane w bazie danych.
- Usunięcie pracownika ustawia `deletedAt` oraz `isActive=false`; rekord i historyczne raporty pozostają w bazie.
- Zlecenie ma status `OPEN`, `SUSPENDED` lub `CLOSED`, flagę `isActive` i opcjonalny `deletedAt`.
- W panelu raportowania dostępne są wyłącznie zlecenia `OPEN`, aktywne i nieusunięte. Odczyt historyczny zachowuje relacje do pozostałych zleceń.
- Zmiana statusu na `CLOSED` bezwzględnie wymaga podania rzeczywistej daty zakończenia (`completionDate`); brak daty zwraca błąd walidacji `COMPLETION_DATE_REQUIRED` (HTTP 400). Ponowne otwarcie zlecenia (`CLOSED` -> `OPEN` / `SUSPENDED`) nie usuwa automatycznie wcześniej zapisanej daty. Usunięcie zlecenia (soft delete) ustawia `deletedAt` i status `CLOSED`.
- `plannedHours` jest zawsze wyliczane jako `quantity * hoursPerUnit`. Ilość musi być większa od zera, a godziny na jednostkę nieujemne.

## Rejestrowanie czasu

- Kalendarz zakładowy stosuje hierarchiczną regułę wyznaczania charakteru dnia:
  1. **Wyjątek administratora (`company override`)**: jawny wpis w `CompanyCalendarDay` ma najwyższy priorytet (może oznaczyć święto/weekend jako dzień roboczy lub zwykły dzień tygodnia jako wolny).
  2. **Ustawowe święto w Polsce (`public holiday`)**: system automatycznie rozpoznaje polskie święta ustawowe (13 dni dla lat do 2024 r. włącznie oraz 14 dni od 2025 r., w tym 24 grudnia – Wigilia Bożego Narodzenia; pozostałe: Nowy Rok, Trzech Króli, Niedziela Wielkanocna, Poniedziałek Wielkanocny, Święto Pracy, Święto Trzeciego Maja, Zielone Świątki, Boże Ciało, Wniebowzięcie NMP, Wszystkich Świętych, Święto Niepodległości, I i II dzień Bożego Narodzenia) i traktuje je jako dni wolne od pracy (`isWorkingDay=false`).
  3. **Weekend (`weekend`)**: sobota i niedziela są dniami wolnymi (`isWorkingDay=false`).
  4. **Standardowy dzień roboczy (`standard weekday`)**: poniedziałek–piątek są dniami roboczymi (`isWorkingDay=true`).
- W dniu wolnym nie można zapisać typu `G` ani typu oznaczonego `isAbsence=true`. Dozwolona pozostaje praca nad zleceniem z typem niebędącym nieobecnością, np. istniejący `NS`.

- Wpis wymaga daty, pracownika, liczby godzin większej od zera i istniejącego kodu rodzaju czasu pracy.
- Wpis raportu czasu może zostać oznaczony jako „Brak karty” (`missingCard`) w sytuacji, gdy pracownik nie posiadał lub nie użył karty podczas rejestracji czasu pracy. Wartość ta jest przechowywana w bazie danych jako pole logiczne (domyślnie `false`).
- Zlecenie jest wymagane tylko wtedy, gdy `WorkTimeType.requiresOrder=true`. Dla pozostałych typów API zapisuje `orderId=null`.
- `WorkTimeType.isAbsence` niezależnie klasyfikuje typ jako nieobecność pracownika. Flagi `isAbsence` (czy reprezentuje nieobecność) i `requiresOrder` (czy wymaga zlecenia produkcyjnego) są całkowicie niezależne i zmiana jednej nie modyfikuje drugiej.
- Kanoniczne typy systemowe (`isSystem=true`) obejmują:
  - Praca ze zleceniem: `G` (Standardowe godziny pracy), `NDR` (Nadgodziny), `NS` (Nadgodziny sobota/niedziela),
  - Nieobecności: `UW` (Urlop wypoczynkowy), `UOK` (Urlop okolicznościowy), `UŻ` (Urlop na żądanie), `L4` (Zwolnienie chorobowe), `WKU` (Wojsko), `NN` (Nieobecność nieusprawiedliwiona), `NU` (Nieobecność usprawiedliwiona), `NUN` (Nieobecność usprawiedliwiona niepłatna), `NUP` (Nieobecność usprawiedliwiona płatna), `UB` (Urlop bezpłatny), `UO` (Urlop ojcowski), `UPP` (Urlop płatny pozostały), `OP` (Opieka nad dzieckiem art. 188 KP).
- Typy systemowe są chronione przed usunięciem, a flaga `requiresOrder` jest dla nich zablokowana do edycji; administrator może korygować pole `isAbsence` oraz pełną nazwę słownikową.
- Nowy wpis można utworzyć tylko dla aktywnego, nieusuniętego pracownika. Jeżeli typ wymaga zlecenia, API sprawdza istnienie nieusuniętego zlecenia; nie sprawdza jednak jego `status` ani `isActive` przy bezpośrednim wywołaniu API.
- Schemat bazy ogranicza godziny do `Decimal(4,2)`. Kod sprawdza jedynie wartość `> 0`; maksymalna wartość i liczba miejsc po przecinku przychodząca z API są **do potwierdzenia** na poziomie zachowania PostgreSQL/Prisma.
- Ostrzeżenia są miękkie: ponad 8 godzin kodu `G`, ponad 12 godzin łącznie i ponad 24 godziny łącznie. Interfejs pozwala wybrać „Ignoruj i zapisz”.
- Przy edycji ostrzeżenia pomijają aktualnie edytowany wpis. Edycja ustawia `modifiedByUserId`; data utworzenia i twórca pozostają bez zmian.
- Usunięcie wpisu ustawia `deletedAt`. Lider i administrator mogą tworzyć, edytować i usuwać wpisy, ponieważ trasy raportów nie mają dodatkowego ograniczenia roli.

## Kopiowanie poprzedniego dnia

- Operację mogą uruchomić role `admin` i `leader`. Interfejs wysyła identyfikator aktualnie wybranego pracownika oraz datę docelową.
- Źródłem jest najnowsza data wcześniejsza od docelowej, na której ten pracownik ma co najmniej jeden aktywny wpis. Wpisy usunięte logicznie oraz wpisy powiązane z usuniętym zleceniem nie są kopiowane.
- Pracownik musi istnieć, być aktywny i nieusunięty. Kopiowane są godziny, rodzaj czasu i opcjonalne zlecenie wyłącznie jego wpisów. Dotyczy to również nieobecności, takich jak UW, L4 i WKU, gdy dniem docelowym jest dzień roboczy.
- Jeżeli data docelowa przypada w sobotę lub niedzielę, cała operacja jest odrzucana odpowiedzią `400 Bad Request` i kodem `WEEKEND_COPY_NOT_ALLOWED`, zanim powstaną jakiekolwiek wpisy. Blokada zależy od dnia docelowego, a nie od rodzaju wpisu źródłowego.
- Jeżeli dzień docelowy zawiera już aktywny wpis tego pracownika, cała operacja jest odrzucana odpowiedzią `409 Conflict`; nie ma trybu dopisywania, scalania ani nadpisywania.
- Maksymalny rozmiar źródła wynosi 100 aktywnych wpisów. Przekroczenie limitu kończy operację bez utworzenia danych.
- Blokada transakcyjna PostgreSQL dla pary `(employeeId, targetDate)` oraz ponowne sprawdzenie dnia po jej uzyskaniu chronią również przed równoległymi żądaniami z wielu kart, użytkowników i instancji API.
- Ustalenie źródła, utworzenie całego kompletu i jeden audyt operacji są objęte tą samą transakcją. Błąd dowolnego etapu wycofuje wszystkie nowe wpisy.
- Wersja 0.3.2 zachowuje dotychczasowe dopuszczenie prawidłowych przyszłych dat. Docelowa polityka raportowania przyszłości pozostaje **do potwierdzenia**.

### Kontrakt `POST /api/reports/copy-last-day`

Żądanie:

```json
{
  "employeeId": "20000000-0000-4000-8000-000000000001",
  "date": "2026-07-20"
}
```

Odpowiedź sukcesu (`201`) zawiera co najmniej `employeeId`, `sourceDate`, `targetDate` i `createdCount`. Nieprawidłowe dane zwracają `400`, niedostępny pracownik lub brak źródła `404`, niepusty cel `409`, a przekroczenie limitu `422`.

## Raport okresów nieobecności

- Raport uwzględnia wyłącznie aktywne wpisy (`deletedAt=null`) powiązane z typem czasu, dla którego `isAbsence=true`.
- Kolejne dni robocze jednego pracownika i jednego typu są łączone w okres; dni oznaczone przez kalendarz zakładowy jako wolne (ustawowe święta, weekendy, jawne wyjątki administratora) nie przerywają okresu i nie zwiększają liczby dni.
- Brak wpisu w dniu roboczym rozdziela okres, a wielokrotne wpisy tego samego typu w tym samym dniu są liczone jako jeden dzień.
- Filtr dat przycina dane przed grupowaniem. Raport korzysta ze wspólnego kalendarza zakładowego z automatyczną obsługą polskich świąt (w tym Wigilii od 2025 roku) oraz wyjątków administratora.
- **Ważne**: Standardowe kody nieobecności (`UW`, `UOK`, `UŻ`, `L4` oraz `WKU`) są sklasyfikowane jako nieobecności (`isAbsence=true`). Niestandardowe, własne typy nieobecności utworzone przez użytkownika mogą być w dowolnym momencie oznaczone jako nieobecność w **Administracja → Słownik Rodzajów Czasu Pracy** (pole „Nieobecność” = Tak). Kod raportu **nie hardkoduje** listy kodów — filtruje dynamicznie po `isAbsence=true`.

## Raport zamknięcia zleceń

- Przełącznik „Raport zamknięcia” działa wewnątrz istniejącego raportu „Godziny wg zleceń” i wymaga prawidłowego, inkluzywnego zakresu dat.
- Wynik obejmuje zlecenia `OPEN` z dodatnią sumą aktywnych wpisów w okresie oraz zlecenia `CLOSED`, których `completionDate` mieści się w okresie — również wtedy, gdy suma godzin w okresie wynosi zero.
- Godziny sprzed lub po zakresie nie są uwzględniane. Usunięte wpisy nie zwiększają sumy, a usunięte zlecenia, zlecenia `SUSPENDED` i zlecenia zamknięte poza zakresem są wykluczone.
- W trybie zamknięcia wyszukiwanie numeru zlecenia pozostaje aktywne. Filtry statusu oraz „tylko z godzinami” są sprzeczne z definicją trybu, dlatego interfejs je wyłącza, a API ignoruje.
- `completionDate` jest porównywana jako data biznesowa w UTC, od początku `dateFrom` do końca `dateTo`, bez konwersji przez lokalną strefę czasową.
- W trybie raportu zamknięcia dostępna jest automatyczna sekcja **„Kontrola rozliczenia czasu”** (zarówno w interfejsie pod tabelą zleceń, jak i w eksporcie XLSX/CSV), która porównuje łączny rozliczony czas (`Godziny wg zleceń` + dynamicznie zagregowane godziny wszystkich typów ze słownika oznaczonych jako `isAbsence=true`) z sumą godzin pracowników z raportu miesięcznego (`totalEmployeeHours`). Różnica równa zero oznacza status **ZGODNE** (`MATCHED`), natomiast różnica różna od zera oznacza status **NIEZGODNE** (`MISMATCHED`). Wszystkie odczyty sum kontrolnych oraz diagnostyki wykonywane są w ramach pojedynczej spójnej migawki transakcyjnej (`RepeatableRead`). Przy statusie NIEZGODNE system generuje szczegółową diagnostykę rekordów z podpisanym wkładem (`contribution`), a serwerowy strażnik niezmiennika gwarantuje, że zaokrąglona suma wkładów diagnostyki jest równa wyliczonej różnicy kontrolnej dla zwróconej migawki.
- Diagnostyka podaje faktyczną przyczynę wykluczenia lub niezgodności wpisu: dla typów z `requiresOrder=true` bez zlecenia wskazuje `Brak zlecenia`, dla typów z `requiresOrder=false` i `isAbsence=false` wskazuje `Typ nie jest nieobecnością i nie wymaga zlecenia`, natomiast dla nieobecności przypisanych do zlecenia objętego rozliczeniem wskazuje `Nieobecność z zleceniem w rozliczeniu (podwójne naliczenie)` z wkładem dodatnim (`contribution = hours`).

## Audyt i daty

- `AuditLog` zapisuje `CREATE`, `UPDATE` i `DELETE` wraz z użytkownikiem oraz starymi/nowymi wartościami dla pracowników, zleceń i wpisów czasu. Kopiowanie zapisuje jeden atomowy audyt całej operacji z identyfikatorem żądania, datami i licznikami. Importy również audytują tworzenie i aktualizację pracowników/zleceń.
- Zmiany użytkowników i rodzajów czasu nie są rejestrowane w `AuditLog`.
- Data raportu jest kolumną PostgreSQL `date`. API tworzy daty przez `new Date(...)`, a odpowiedzi formatuje przez UTC (`toISOString().split('T')[0]`). Zarówno przycisk „Dzisiaj”, jak i początkowa data formularza raportowania używają lokalnej daty biznesowej przeglądarki (`getLocalDateString()`). Jednolita biznesowa strefa czasowa nie jest skonfigurowana — **do potwierdzenia**.
