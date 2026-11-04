# Plan zmiany klasyfikacji własnych rodzajów czasu pracy

## Zakres i stan repozytorium

Plan opiera się na kodzie gałęzi `development` (`58f3ae7f218a9864222211af1aad0905ea505d1d`), zsynchronizowanej z `origin/development`, raporcie audytu [`REPORTING_CALCULATION_AUDIT_2026-11.md`](REPORTING_CALCULATION_AUDIT_2026-11.md), schemacie Prisma, endpointach i testach. Nie odczytywano produkcyjnej bazy. Nie wprowadzono zmian w kodzie ani w bazie.

`OK` nie występuje w seedzie ani w repozytoryjnej liście kanonicznych typów. Jest typem własnym/konfigurowanym w słowniku, więc dokładnej wartości jego flag w bieżącej bazie nie da się ustalić statycznie. Diagnoza z audytu („Typ nie jest nieobecnością i nie wymaga zlecenia”) wskazuje, że raportująca ją migawka traktowała `OK` jak `isAbsence=false`, `requiresOrder=false`. Aktualną konfigurację należy potwierdzić przez odczyt administratora z `/api/work-time-types` albo widok słownika przed zmianą.

Wszystkie rodzaje poza `OK` uznaje się w tym planie za poprawne. Nie zmieniać ich klasyfikacji ani dotychczasowych zachowań — w szczególności `NN` i `SZK`.

## 1. Stan obecny

- Model `WorkTimeType` ma niezależne flagi `requiresOrder` i `isAbsence`; nie ma pola rozróżniającego pracę poza zleceniem od pozostałego czasu niebędącego nieobecnością (`backend/prisma/schema.prisma:45-55`).
- Formularz Administracja → Słownik Rodzajów Czasu Pracy przedstawia dwie niezależne kontrolki: „Nieobecność pracownika” i „Wymaga podania zlecenia produkcyjnego” (`frontend/src/components/DictionariesView.tsx:28-35, 186-212`). Obie mogą być włączone równocześnie. Test UI wprost akceptuje zapis obu wartości `true` (`frontend/src/test/DictionariesView.test.tsx:81-103`).
- `POST /api/work-time-types` przyjmuje obie flagi niezależnie, domyślnie obie do `false`; `PUT` waliduje ich typ, ale nie spójność kombinacji (`backend/src/routes/work-time-types.ts:25-57, 67-99`). Tylko administrator może tworzyć/edytować typy.
- Nowy wpis czasu wymaga zlecenia, gdy `requiresOrder=true`; gdy typ ma `isAbsence=true`, zapis wymusza brak zlecenia. Gdy obie flagi są `false`, API zapisuje wpis bez zlecenia, ale raportowa kontrola kwalifikuje takie godziny jako czas pracownika poza sumą zleceń i nieobecności (`backend/src/routes/reports.ts:284-320, 429-466`; `analytics.ts:683-696`). Tak działa między innymi obecny `SZK`; to zachowanie ma pozostać bez zmian dla istniejącego typu.
- W rozliczeniu wg zleceń wykluczany jest specjalnie kod `NN`, lecz nie każdy typ z flagą nieobecności (`backend/src/routes/analytics.ts:531-540`). Kontrola dodaje osobno godziny nieobecności (`analytics.ts:747-806`), a diagnostyka rozpoznaje nieobecność przypisaną do zlecenia jako podwójne naliczenie (`analytics.ts:653-680`). Nowe wpisy nieobecności mają blokadę `orderId`, lecz istniejące rekordy mogą zachować wcześniejsze przypisanie.

## 2. Przyczyna problemu `OK`

Raporty nie wyciągają znaczenia z kodu `OK` ani z nazwy „Oddanie krwi”. Klasyfikacja nieobecności zależy od aktualnego `WorkTimeType.isAbsence` (wyjątkiem jest historyczny specjalny kod `NN`). Jeśli `OK` ma flagi `isAbsence=false` i `requiresOrder=false`, wpis 8 h jest widoczny w raporcie pracownika jako godzina niebędąca nieobecnością, ale nie należy do godzin wg zleceń ani do godzin nieobecności w kontroli. Dwa wpisy powodują deficyt 16 h.

Zatwierdzona reguła biznesowa dla tego planu: **`OK` oznacza usprawiedliwioną nieobecność i nie wymaga zlecenia**. Docelowa konfiguracja zgodna z obecną semantyką flag to `isAbsence=true`, `requiresOrder=false` (oraz docelowa jawna kategoria `ABSENCE`, jeśli zostanie przyjęty kontrakt dla nowych typów poniżej).

Obecny model nie ma osobnej flagi płatności. Każdy typ `isAbsence=true` poza `NN` trafia do dynamicznej sumy nieobecności kontroli i do `sumaBezNadgodzin` raportu pracownika. Plan zakłada właśnie tę obecną semantykę dla `OK`; jeśli „usprawiedliwiona” ma oznaczać wyłączenie z którejś z tych sum, potrzebna jest dodatkowa decyzja biznesowa przed implementacją.

## 3. Minimalny zakres zmian

### Konieczne

1. **Poprawić wyłącznie konfigurację `OK`.** Najpierw odczytać i zapisać stan zastany flag. Jeśli potwierdzi się błędne ustawienie, ustawić `isAbsence=true` oraz `requiresOrder=false` przez istniejącą ścieżkę administracyjną albo kontrolowaną operację administracyjną. Nie zmieniać żadnego innego typu ani wpisów `WorkTimeReport`.
2. **Wykluczyć nieobecności z agregatu godzin zleceń.** W `getOrderReportRows` wybrać do sumy tylko wpisy, których typ nie jest nieobecnością, zachowując niezależne wyłączenie `NN`. Zastosować tę samą regułę przy kwalifikowaniu zleceń do raportu zamknięcia i w kontroli. W diagnostyce wpis nieobecności z `orderId` nie może już otrzymywać dodatniego wkładu wynikającego z podwójnego wliczenia; można pokazać ostrzeżenie o historycznym przypisaniu, ale jego wkład do różnicy powinien wynikać z nowych, spójnych sum.
3. **Zdefiniować bezpieczną klasyfikację nowych typów bez zmiany zachowania istniejących.** Same dwie obecne flagi nie wystarczą: `false/false` już oznacza istniejące `SZK`, którego bieżące zachowanie ma zostać zachowane, a nowy typ „praca poza zleceniem” musi być rozliczany jawnie. Najmniejszym niejednoznacznym rozszerzeniem jest jedno opcjonalne pole `accountingCategory` na `WorkTimeType`, np. `ORDER_WORK`, `ABSENCE`, `OFF_ORDER_WORK`; `NULL` oznacza konfigurację legacy i zachowuje dotychczasową interpretację flag. Dla nowych wpisów pole jest wymagane. Dla `OK` ustawić kategorię `ABSENCE` razem z flagami zgodnymi wstecznie.
4. **Dodać jeden wspólny resolver kategorii** używany przez walidację zapisu, raport pracownika, raport wg zleceń, kontrolę i diagnostykę. Dla kategorii `NULL` ma zachowywać dotychczasowe zachowanie istniejących typów; nie normalizować masowo flag ani nie zmieniać istniejących `NN`/`SZK`.
5. **W kontroli rozliczenia pokazać osobny koszyk pracy poza zleceniem** dla nowych typów `OFF_ORDER_WORK`, wliczany dokładnie raz do sumy rozliczonej. Wymaga to małego rozszerzenia sumy kontroli i jej prezentacji/eksportu; inaczej nowy trzeci wybór nadal tworzyłby nierozliczone różnice.

Dodanie opcjonalnego pola kategorii wymaga nowej, niedestrukcyjnej migracji (kolumna nullable, wszystkie stare rekordy pozostają `NULL`). To propozycja do przyszłej implementacji po akceptacji, nie migracja wykonywana w tym zadaniu. Jeśli właściciel projektu nie akceptuje żadnego pola modelu, trzeba ograniczyć wymagania UI: nie da się jednocześnie odróżnić nowego `OFF_ORDER_WORK` od istniejącego `SZK` i zachować dla `SZK` odrębne dotychczasowe rozliczenie wyłącznie na podstawie obecnych flag.

### Opcjonalne usprawnienia

- Rejestrowanie zmian słownika w `AuditLog` lub osobnej historii konfiguracji. Aktualnie zmiany `WorkTimeType` nie są audytowane, a bieżąca klasyfikacja służy do wyliczania także historycznych okresów.
- Data obowiązywania klasyfikacji albo migawka kategorii przy każdym wpisie czasu. Jest to potrzebne wyłącznie, jeśli wymaganiem biznesowym będzie zachowanie starej interpretacji historycznej po zmianie definicji typu; oznacza większą zmianę modelu i nie jest potrzebne do minimalnego naprawienia `OK`.
- Oddzielny raport/audyt historycznych wpisów nieobecności ze zleceniem, aby administrator mógł je przejrzeć. Nie aktualizować ich automatycznie.

## 4. Propozycja konfiguracji UI

W formularzu tworzenia nowego rodzaju zastąpić dwie niezależne kratki jednym wymaganym polem wyboru (radio/select):

| Wybór | Zapis kategorii | Zachowanie wpisu |
|---|---|---|
| Praca na zleceniu | `ORDER_WORK` | wymaga wskazania zlecenia |
| Nieobecność | `ABSENCE` | nie przyjmuje zlecenia; uwzględnia godziny nieobecności w kontroli |
| Praca poza zleceniem | `OFF_ORDER_WORK` | nie przyjmuje zlecenia; trafia do osobnego koszyka kontroli |

W edycji typów istniejących z kategorią `NULL` pokazać stan „Dotychczasowe zasady rozliczania” i nie przypisywać nowej kategorii automatycznie. Jeśli administrator jawnie zmieni kategorię istniejącego typu, pokazać ostrzeżenie, że zmieni to wyniki raportów dla wszystkich powiązanych historycznych wpisów; wymagać potwierdzenia. `OK` jest wąskim, zatwierdzonym wyjątkiem do klasyfikacji jako `ABSENCE`.

Dla `NN` zachować specjalne zasady niepłatnej nieobecności i dotychczasowe wyłączenie z sum, niezależnie od nowej kategorii. Nie zmieniać kategorii ani wyniku istniejącego `SZK` — jego `NULL`/legacy oznacza zachowanie bieżącego zachowania. Jeżeli `SZK` ma kiedyś otrzymać inne rozliczenie, wymaga to osobnej decyzji i zadania.

Tabela słownika powinna prezentować jedną kolumnę „Kategoria rozliczenia” (Praca na zleceniu / Nieobecność / Praca poza zleceniem / Dotychczasowe zasady rozliczania), zamiast zachęcać do niezależnego ustawiania flag. Pozostałe kolumny i działania administracyjne pozostają bez zmian.

## 5. Zasady walidacji

1. Przy tworzeniu nowego typu API wymaga prawidłowej wartości `accountingCategory`; brak lub nieznana wartość zwraca `400`. Domyślne `false/false` nie może już po cichu utworzyć nowego typu legacy.
2. Reguły efektywne są wzajemnie wykluczające:
   - `ORDER_WORK` → `requiresOrder=true`, `isAbsence=false`;
   - `ABSENCE` → `requiresOrder=false`, `isAbsence=true`;
   - `OFF_ORDER_WORK` → `requiresOrder=false`, `isAbsence=false`.
   API zapisuje flagi zgodne z kategorią lub odrzuca sprzeczne pola przesłane przez klienta. Nie mogą powstać nowe kombinacje `requiresOrder=true && isAbsence=true`.
3. `ABSENCE` i `OFF_ORDER_WORK` nie mogą przyjmować `orderId`; `ORDER_WORK` wymaga prawidłowego, nieusuniętego zlecenia zgodnie z dotychczasową walidacją. Te same reguły muszą obowiązywać przy tworzeniu, edycji i kopiowaniu wpisów.
4. Typy legacy (`accountingCategory=NULL`) pozostają obsługiwane dokładnie według bieżącej logiki, aby nie zmienić `SZK` ani żadnego innego poprawnie skonfigurowanego rodzaju. `NN` nadal jest niepłatnym wyjątkiem niezależnie od flag historycznych.
5. Nieobecność historycznie przypisana do zlecenia nie jest automatycznie przepisywana ani kasowana. Agregacja zleceń pomija taki wpis, kontrola liczy go jako nieobecność raz, a diagnostyka może go oznaczyć jako anomalię danych z zerowym wkładem do sumy kontrolnej.
6. Zmiana kategorii istniejącego typu jest operacją o wpływie historycznym. UI/API powinny ją jawnie odróżniać od zwykłej zmiany nazwy; logowanie tej zmiany jest zalecane, lecz stanowi opcjonalne rozszerzenie modelu audytowego.

## 6. Wpływ na istniejące dane

- **Schemat:** pole kategorii jako nullable nie wymaga przepisywania starych rekordów. Migracja powinna dodać kolumnę bez wartości domyślnej semantycznie mapującej stare typy; `NULL` jest świadomym trybem zachowania kompatybilności.
- **`OK`:** ustawienie kategorii `ABSENCE` i flagi `isAbsence=true` nie modyfikuje wpisów czasu, ale zmienia raportowanie wszystkich aktywnych wpisów `OK` — historycznych i bieżących — bo powiązane wpisy odwołują się do aktualnego rekordu słownika. W przykładzie z października 16 h przeszłoby z `suma` pracownika do dynamicznej kolumny nieobecności i powinno wejść do sumy absencji kontroli; różnica powinna się zmniejszyć z `-16 h` do `0`, o ile nie występują inne rozbieżności.
- **Pozostałe typy:** pozostawienie kategorii `NULL` i bez zmian ich flag zachowuje dotychczasowe obliczenia. W szczególności `SZK` i `NN` pozostają zgodne z obecną implementacją.
- **Nieobecności połączone ze zleceniem:** nie zmienia się rekord historyczny. Po zmianie agregacji taki wpis przestaje podnosić godziny zlecenia i pozostaje w nieobecnościach; w raportach historycznych może więc zmienić się suma godzin zlecenia i status kontroli. Raport powinien sygnalizować taki rekord do ręcznego przeglądu.
- **Ryzyko interpretacji historii:** kategoria na słowniku jest bieżącą klasyfikacją, więc zmiana `OK` przeliczy wszystkie jego okresy. Jeżeli oczekiwane jest zachowanie historycznych raportów dokładnie według dawnej klasyfikacji, nullable pole typu nie wystarczy — potrzebna będzie wersjonowana klasyfikacja lub snapshot przy wpisie (opcja poza zakresem minimalnym).

## 7. Plan testów regresyjnych

### Backend

- Test słownika: wymaganie kategorii przy tworzeniu nowych typów; wszystkie trzy poprawne mapowania; odrzucenie brakującej/nieznanej kategorii i sprzecznych kombinacji; poprawna edycja.
- Test kompatybilności legacy: typy istniejące bez kategorii nadal zachowują wyniki sprzed zmiany; w szczególności `NN`, `SZK` oraz pozostałe typy z aktualnego seed/test fixtures.
- Test `OK`: kategoria nieobecności, brak wymogu zlecenia, próba zapisu bez `orderId`, kolumna dynamiczna pracownika, wyłączenie z `suma` pracy i uwzględnienie w sumie absencji/rozliczeniu kontrolnym. Sprawdzić aktywne i soft-deleted wpisy.
- Test rozliczenia każdej nowej kategorii: praca na zleceniu jest liczona wyłącznie w zleceniach; nieobecność wyłącznie w absencjach; praca poza zleceniem wyłącznie w nowym koszyku. Suma wkładów diagnostyki nadal równa się różnicy.
- Test historycznej nieobecności z `orderId`: nie zwiększa `ordersHours`, pozostaje w absencjach tylko raz, nie powoduje sztucznego dodatniego wkładu; diagnostyka sygnalizuje anomalię.
- Test API rejestracji i edycji: zlecenie dozwolone tylko dla `ORDER_WORK`; kopiowanie wpisu nie omija walidacji kategorii.
- Testy niezmienionej obsługi raportów wg zleceń, miesięcznego pracownika, szczegółów, kontroli oraz XLSX/CSV na wspólnym zestawie fikcyjnych danych.

### Frontend

- Test formularza tworzenia: wybór każdej z trzech kategorii, przesłanie kategorii i brak kombinacji dwóch niezależnych checkboxów.
- Test edycji: typ bez nowej kategorii pokazuje „Dotychczasowe zasady rozliczania”, nie zmienia kategorii bez działania użytkownika; jawna zmiana ostrzega o wpływie na historię.
- Test tabeli słownika: prezentuje jednoznaczną kategorię; systemowy `NN` nadal jest chroniony zgodnie z aktualnymi zasadami.
- Test wpisu raportowania: dla nowej kategorii nieobecności oraz pracy poza zleceniem pole zlecenia jest ukryte/niedostępne; dla pracy na zleceniu jest wymagane.
- Test tabeli i eksportów kontroli, w tym nowego koszyka pracy poza zleceniem; test sprawdza spójność danych JSON, UI, XLSX i CSV.

Nie uruchamiano testów w ramach przygotowania planu.

## 8. Ryzyka wdrożenia

| Ryzyko | Ocena | Ograniczenie |
|---|---|---|
| Zmiana flagi `OK` zmieni wyniki wszystkich historycznych raportów tego typu | Wysokie | Potwierdzić bieżący rekord słownika, wyeksportować bazowe sumy, zatwierdzić biznesowo klasyfikację, porównać wyniki po zmianie na kopii/środowisku testowym. |
| Filtr `isAbsence` w agregacie zleceń zmniejszy historyczne godziny zleceń z przypisanymi nieobecnościami | Średnie/wysokie | Dodać diagnostykę anomalii i przed wdrożeniem policzyć liczbę oraz sumę takich wpisów; żadnego automatycznego przepisywania danych. |
| Nowe pole kategorii i stara para flag mogą się rozjechać | Średnie | Jedno źródło prawdy po stronie API; wyliczanie flag zgodnych z kategorią; test kontraktu i walidacja przy zapisie. |
| Pole `NULL` oznaczające zachowanie dotychczasowych reguł może być pomylone z nową kategorią pracy poza zleceniem | Średnie | Jawna etykieta „Dotychczasowe zasady rozliczania”, brak automatycznej migracji typów i dokumentacja, że nowa kategoria nie została jeszcze wybrana. |
| Dotychczasowa informacja o klasyfikacji w historycznych raportach nie jest snapshotem | Wysokie | Przed zmianą zachować porównanie raportów; jeśli wymagany jest niezmienny odczyt historyczny, osobno zatwierdzić kategorię obowiązującą od daty lub snapshot per wpis. |

## Kolejność realizacji po akceptacji

1. Odczytać bieżącą konfigurację `OK` i zinwentaryzować historyczne wpisy `OK` oraz nieobecności z `orderId` (tylko odczyt).
2. Zatwierdzić zakres historycznego przeliczenia oraz decyzję o polu `accountingCategory` i nowym koszyku pracy poza zleceniem.
3. Przygotować migrację nullable i testy backendowe; zachować `NULL` dla wszystkich istniejących typów, w tym `SZK` i `NN`.
4. Wprowadzić wspólną klasyfikację, wykluczenie nieobecności z agregatu zleceń, walidację wpisów i spójną diagnostykę.
5. Zmienić formularz/tabelę słownika oraz raportową prezentację nowej kategorii i rozszerzyć testy UI/eksportów.
6. Dopiero po testach regresji i porównaniu wyników zatwierdzić kontrolowaną zmianę konfiguracji `OK`; nie aktualizować żadnych wpisów historycznych automatycznie.

## Weryfikacja przedimplementacyjna — 2026-11-04

### Środowisko i ograniczenia danych

- Gałąź: `development`; `HEAD` i `origin/development` są równe (`58f3ae7f218a9864222211af1aad0905ea505d1d`). Working tree ma wyłącznie dwa nieśledzone dokumenty z poprzednich zadań oraz ten plan; kod nie był modyfikowany.
- Nie znaleziono uruchomionego ani zatrzymanego kontenera `worktime-dev-db`. W repozytorium nie ma rootowego `.env`, `backend/.env` ani `.env.test`. Odczyt listy wolumenów Docker nie był dostępny, więc nie można potwierdzić, czy pozostał wolumen z danymi. Nie podłączano się do żadnej bazy.
- Testy backendu używają `vitest` i mocków Prisma w analizowanych scenariuszach. Uruchomiono wyłącznie dwa wybrane testy mockowe: `returns MISMATCHED status and positive diagnostics for Direction B` oraz `diagnostics include double-counted absences (Direction B)`. Wynik: **2 passed**, 232 pozostałe testy pominięte; testy nie odczytywały bazy.
- W rezultacie nie ma potwierdzonych liczebności ani sum z rzeczywistej testowej bazy. Kod/seed repozytorium nie definiuje kanonicznego typu `OK`; jego obecność i flagi w konkretnej bazie pozostają nieznane. Diagnoza z raportu audytu sugeruje `isAbsence=false`, `requiresOrder=false` dla tamtej migawki, ale nie jest odczytem bieżącego słownika.

### Co potwierdzają syntetyczne przypadki testowe

- Test kontroli tworzy osobny scenariusz: 100 h pracy na zleceniu, 16 h `UW` w danych absencji i rekordzie diagnostycznym powiązanym ze zleceniem. Asercje oczekują `ordersHours=100`, `totalAbsenceHours=16`, różnicy `+16` oraz wkładu diagnostycznego `+16` (`backend/tests/analytics.test.ts:2016-2115`). Mock listy godzin dla orderu zawiera tylko 100 h; ten test **nie mierzy liczby/godzin wpisów z nieobecnością w agregacie zlecenia**.
- Oddzielny test diagnostyki zawiera jeden syntetyczny wpis `UW` / 10 h z `orderId` i oczekuje dodatniego wkładu 10 h (`analytics.test.ts:2882-2929`). To potwierdza bieżącą klasyfikację diagnostyczną, nie stan bazy ani wpływ na kompletny zestaw raportów.
- Z kodu wynika natomiast bezpośrednio, że agregat orderów wyklucza `NN`, lecz nie filtruje `isAbsence=true` (`backend/src/routes/analytics.ts:531-540`). Jeśli taki aktywny rekord istnieje w realnej bazie, może podnieść `actualHours` orderu i jednocześnie sumę absencji. Liczba i godziny rekordów wymagają zapytania SQL poniżej.

### Polecenia SQL tylko do odczytu

Uruchamiać wyłącznie po potwierdzeniu, że wybrany connection string wskazuje na testową bazę workshop-time-tracking, a nie produkcję klienta. Poniższy blok nie modyfikuje danych; transakcja jest `READ ONLY` i kończy się `ROLLBACK`.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 1. Istnienie OK i bieżące flagi słownikowe.
SELECT code, name, is_absence, requires_order, is_system
FROM work_time_types
WHERE code = 'OK';

-- 2. Liczba i godziny OK: aktywne, logicznie usunięte, z order_id oraz bez niego.
SELECT
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active_entries,
  COALESCE(SUM(hours) FILTER (WHERE deleted_at IS NULL), 0)::numeric(12,2) AS active_hours,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_id IS NOT NULL) AS active_entries_with_order,
  COALESCE(SUM(hours) FILTER (WHERE deleted_at IS NULL AND order_id IS NOT NULL), 0)::numeric(12,2) AS active_hours_with_order,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND order_id IS NULL) AS active_entries_without_order,
  COALESCE(SUM(hours) FILTER (WHERE deleted_at IS NULL AND order_id IS NULL), 0)::numeric(12,2) AS active_hours_without_order,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted_entries,
  COALESCE(SUM(hours) FILTER (WHERE deleted_at IS NOT NULL), 0)::numeric(12,2) AS soft_deleted_hours
FROM work_time_reports
WHERE work_time_type_code = 'OK';

-- 3. Aktywne wpisy OK przypięte do zleceń, według zlecenia i zakresu październikowego.
SELECT
  r.order_id,
  o.order_number,
  COUNT(*) AS entries,
  SUM(r.hours)::numeric(12,2) AS hours,
  COUNT(*) FILTER (WHERE r.date >= DATE '2026-10-01' AND r.date < DATE '2026-11-01') AS october_entries,
  COALESCE(SUM(r.hours) FILTER (WHERE r.date >= DATE '2026-10-01' AND r.date < DATE '2026-11-01'), 0)::numeric(12,2) AS october_hours
FROM work_time_reports r
LEFT JOIN orders o ON o.id = r.order_id
WHERE r.work_time_type_code = 'OK'
  AND r.deleted_at IS NULL
  AND r.order_id IS NOT NULL
GROUP BY r.order_id, o.order_number
ORDER BY o.order_number NULLS LAST;

-- 4. Wszystkie aktywne nieobecności przypisane do order_id, według rodzaju;
-- NN uwzględnione także przy historycznym is_absence=false.
SELECT
  r.work_time_type_code AS code,
  t.name,
  t.is_absence,
  t.requires_order,
  COUNT(*) AS entries,
  SUM(r.hours)::numeric(12,2) AS hours,
  COUNT(*) FILTER (WHERE r.date >= DATE '2026-10-01' AND r.date < DATE '2026-11-01') AS october_entries,
  COALESCE(SUM(r.hours) FILTER (WHERE r.date >= DATE '2026-10-01' AND r.date < DATE '2026-11-01'), 0)::numeric(12,2) AS october_hours
FROM work_time_reports r
JOIN work_time_types t ON t.code = r.work_time_type_code
WHERE r.deleted_at IS NULL
  AND r.order_id IS NOT NULL
  AND (t.is_absence = TRUE OR r.work_time_type_code = 'NN')
GROUP BY r.work_time_type_code, t.name, t.is_absence, t.requires_order
ORDER BY r.work_time_type_code;

ROLLBACK;
```

Pierwsze zapytanie rozstrzyga, czy `OK` w ogóle istnieje. Drugie podaje liczbę i godziny bez ujawniania danych pracowników. Trzecie wskazuje, czy OK ma historyczne powiązania ze zleceniami. Czwarte daje liczbę i sumę godzin potencjalnego podwójnego naliczenia, zarówno ogółem, jak i dla 01–31.10.2026. Rekordy soft-deleted są wyłączone z wpływu raportowego; query 2 raportuje je osobno.

### Wpływ zatwierdzonej klasyfikacji `OK`

Docelowe flagi zgodne z aktualną logiką: `is_absence=true`, `requires_order=false` (oraz `accounting_category='ABSENCE'` po dodaniu pola). Zmiana słownika nie edytuje wpisów `work_time_reports`.

- Miesięczny raport: historyczne godziny OK pozostają w kolumnie dynamicznej; `suma` (godziny pracy z nadgodzinami) zmniejsza się o sumę OK; `sumaBezNadgodzin` zwiększa się o tę sumę, zgodnie z obecną regułą dla nieobecności innych niż NN.
- Suma pracownika w kontroli pozostaje niezmieniona, bo te same godziny przechodzą z `suma` do dynamicznych nieobecności uwzględnianych przez kontrolę.
- Jeśli wpisy OK nie mają zleceń, godziny zostaną dodane do absencji w sumie rozliczonej; przy warunkach z audytu różnica `-16 h` przesunie się do zera, o ile nie ma innych odchyleń.
- Jeśli wpisy OK mają `order_id`, samo przełączenie flag bez poprawki agregacji chwilowo pozostawiłoby je w godzinach orderu i dodałoby do absencji. Dlatego wykluczenie nieobecności z orderów musi wejść w tym samym wdrożeniu. Po nim składnik orderów zmniejszy się o te godziny, absencje wzrosną o tę samą wartość, a suma rozliczona nie policzy wpisu dwa razy.
- Zmiana flagi/kategorii typu przelicza wszystkie okresy, w których istnieją aktywne rekordy OK; historyczny wpływ jest zaakceptowany. Nie trzeba ani nie wolno aktualizować rekordów czasu.

### Potwierdzenie bezpieczeństwa zakresu implementacji

1. **Migracja niedestrukcyjna — potwierdzone warunkowo:** dodanie nullable pola `accounting_category` (ew. nullable enum PostgreSQL z trzema wartościami) bez `DEFAULT`, backfillu, `NOT NULL` i zmian w tabeli wpisów pozostawia istniejące typy jako `NULL`. Nie usuwa ani nie aktualizuje danych. Migracja nadal wymaga zwykłego przeglądu SQL i testu na kopii przed zatwierdzeniem.
2. **Zachowanie istniejących typów — możliwe z ważnym wyjątkiem:** dla kategorii `NULL` resolver musi zachować dotychczasową logikę każdego typu. Wymóg „nieobecność nigdy nie zwiększa orderu” celowo zmieni sumy tylko dla istniejących rekordów nieobecności historycznie połączonych ze zleceniem; jest to zgodne z zatwierdzonym założeniem 3, ale może zmienić historyczne raporty orderów/kontroli. Nie zmienia wpisów źródłowych.
3. **`NN` i `SZK` — zachowanie da się zabezpieczyć testami:** `NN` pozostaje niepłatnym wyjątkiem niezależnie od nullable kategorii; `SZK` zostaje `NULL` i przechodzi dokładnie starą ścieżką flag. Jego obecna diagnostyka nierozliczonego czasu pozostaje bez zmian.
4. **Sprzeczne konfiguracje — backend jest autorytetem:** POST dla nowego typu wymaga jednej z trzech enum wartości; backend wylicza lub waliduje zgodne flagi i odrzuca sprzeczności. PUT bez pola kategorii zachowuje rekord dotychczasowy; jawna zmiana legacy kategorii musi przejść ostrzeżenie po stronie UI oraz walidację po stronie API. Stare kombinacje flag pozostają dozwolone tylko dla istniejących/NULL typów.
5. **Frontend/backend:** frontend pokazuje wybór i dostosowuje formularz wpisu, ale backend egzekwuje kategorię i `orderId`; nie może polegać wyłącznie na ukrywaniu kontrolki. API zwraca kategorię oraz zgodne flagi.
6. **Raporty i eksporty:** backend musi stosować resolver w `getEmployeeReportRows`, `getAbsencePeriodRows`, `getOrderReportRows`, `getClosureControlSummary` i diagnostyce; `OFF_ORDER_WORK` trafia do osobnego składnika sumy kontroli. Raport miesięczny pracowników nadal liczy pracę poza orderem jako czas pracy; raport szczegółowy/konta zachowują surowe wiersze. XLSX orderów i CSV tabeli bazują na `getOrderReportRows`. Sekcja kontroli XLSX (`backend/src/utils/excel-report.ts`), UI i CSV (`frontend/src/components/ReportsView.tsx`) muszą pokazywać nowy składnik. Wymagana regresja porównująca JSON, widok, XLSX i CSV.
7. **Nieobecności raz:** order agregat i kwalifikacja orderów pomijają `ABSENCE` (i dalej `NN`); suma absencji liczy je raz; historyczny `order_id` generuje ostrzeżenie, nie dodatkowe godziny. Diagnostyka wkładów musi odpowiadać nowej arytmetyce.

### Ostateczny zakres implementacji

**Wymagane w jednym spójnym wdrożeniu:** jedna nullable kolumna `accounting_category` z wartościami `ORDER_WORK`, `ABSENCE`, `OFF_ORDER_WORK`; `NULL` dla istniejących typów; wspólny resolver z fallbackiem zachowującym starą logikę; wymóg kategorii dla nowych typów i walidacja trzech poprawnych kombinacji; obsługa/ostrzeżenie przy edycji typu istniejącego; konfiguracja `OK` jako `ABSENCE` bez zlecenia; zakaz nowych powiązań order dla absencji i pracy poza zleceniem; wykluczenie historycznych nieobecności z godzin orderu i diagnostyka; osobny `offOrderHours` w kontroli; aktualizacja eksportów i testów. Żadnych automatycznych zmian w `WorkTimeReport`.

**Pliki wymagające zmian (oczekiwany minimalny zakres):**

- `backend/prisma/schema.prisma` oraz nowy `backend/prisma/migrations/<timestamp>_add_work_time_accounting_category/migration.sql`.
- Nowy współdzielony helper, np. `backend/src/utils/work-time-accounting.ts`.
- `backend/src/routes/work-time-types.ts` (API słownika), `backend/src/routes/reports.ts` (walidacja create/update/copy wpisu) i `backend/src/routes/analytics.ts` (agregaty, diagnostyka, raporty).
- `backend/src/utils/excel-report.ts` (podsumowanie kontroli XLSX).
- `frontend/src/components/DictionariesView.tsx`, `frontend/src/components/ReportingPanel.tsx` i `frontend/src/components/ReportsView.tsx`.
- Testy: `backend/tests/work-time-types.test.ts`, `backend/tests/reports.test.ts`, `backend/tests/analytics.test.ts`, `backend/tests/copy-last-day.test.ts`; frontend `frontend/src/test/DictionariesView.test.tsx`, `frontend/src/test/ReportingPanel.test.tsx`, `frontend/src/test/ReportsView.test.tsx`.
- Dokumentacja zgodnie z AGENTS: `docs/business-rules.md`, `docs/architecture.md`, `docs/user-guide.md`, `docs/import-export-specification.md`, `CHANGELOG.md`, `PROJECT_STATUS.md` (i sekcja statusu `README.md`, jeśli zmieni się aktualna wersja/opis).

To lista do potwierdzenia przy implementacji: jeśli helper kategorii można zawrzeć w istniejącym module bez duplikowania reguł, nie dodawać nowego pliku. Nie edytować historycznych migracji.

### Rollback

1. Przed wdrożeniem zapisać odczytową migawkę konfiguracji typów (`code`, dotychczasowe flagi, nowa kategoria) oraz agregaty kontrolne i orderów dla zakresów weryfikowanych. To materiał do porównania/odtworzenia konfiguracji, nie kopia tabeli wpisów.
2. Jeśli aplikacja po wdrożeniu wymaga rollbacku, zatrzymać tworzenie/zmianę typów, przywrócić poprzednią wersję backendu i frontendu. Starszy kod ignoruje nową nullable kolumnę, więc pozostawienie schematu jest bezpieczniejsze niż migracja wsteczna.
3. Nie usuwać enum/kolumny i nie uruchamiać migracji `DROP`; pozostawić ją pustą/używaną przez nowy kod dopóki nie będzie osobno zatwierdzona procedura schematu.
4. Przywrócenie poprzednich flag/kategorii `OK` wykonać tylko po decyzji administratora, używając zapisanej wartości przed zmianą. To cofnie historyczne przeliczenie `OK`; nie aktualizować żadnych wpisów `WorkTimeReport`.
5. Jeśli w czasie działania nowego kodu dodano typy `OFF_ORDER_WORK`, poprzedni backend nie będzie znał ich kategorii i kontrola może znów wykazywać różnicę. Przed rollbackiem porównać listę typów utworzonych/zmienionych po wdrożeniu; pozostawić rekordy, wyłączyć ich użycie i uzgodnić ręczną kontynuację/odtworzenie nowej wersji. Nie kasować typów ani wpisów automatycznie.
6. Po rollbacku wykonać wyłącznie odczytowe porównanie raportu pracownika, zleceń, kontroli i eksportów z zachowanym punktem odniesienia; deployment/rollback produkcyjny wymaga odrębnej akceptacji i nie należy do tego planu.

## Zmiany konieczne a opcjonalne — podsumowanie

**Konieczne do spełnienia celów:** poprawna konfiguracja `OK`; nieobecność liczona poza godzinami zleceń; reguła dla historycznej nieobecności z przypisanym zleceniem bez modyfikacji rekordu; jawna kategoria dla nowych typów z zachowaniem legacy/null dla istniejących; walidacja API i UI; spójny koszyk kontroli dla pracy poza zleceniem; regresje chroniące `NN`, `SZK` i pozostałe typy.

**Opcjonalne:** historia zmian słownika, kategorie obowiązujące od określonej daty, snapshot kategorii w każdym raporcie czasu, dodatkowy ekran przeglądu anomalii. Te elementy zwiększają odtwarzalność historii, ale nie są niezbędne do minimalnego wdrożenia.
