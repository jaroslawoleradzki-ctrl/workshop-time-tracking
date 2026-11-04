# Audyt obliczeń Centrum Raportów — 2026-11

## Zakres i ograniczenia

Audyt wykonano statycznie na gałęzi `development`, commit `58f3ae7f218a9864222211af1aad0905ea505d1d`, zsynchronizowanej z `origin/development`. Working tree przed audytem był czysty. Wersja pakietów backendu i frontendu oraz `APP_VERSION` w Compose to `0.6.2`; `PROJECT_STATUS.md` i sekcja wersji w `README.md` nadal opisują 0.6.1, co jest rozbieżnością dokumentacyjną.

Nie odczytywano bazy produkcyjnej ani danych dla podanych zleceń/pracownika. Podane liczby i zrzuty traktowane są jako wskazówki do prześledzenia kodu, nie jako dowód stanu bazy. Nie zmieniano kodu aplikacji, schematu, migracji ani danych. Niniejszy plik jest jedynym artefaktem audytu.

## Podsumowanie ustaleń

1. **Potwierdzona przyczyna różnicy 16 h, warunkowa co do metadanych słownika:** kod `OK` nie ma specjalnego traktowania ani nie jest kanonicznym typem w seedzie. Wpis z `isAbsence=false`, `requiresOrder=false` i bez zlecenia trafia do sumy raportu pracownika, lecz nie trafia ani do godzin wg zleceń, ani do sumy nieobecności kontroli. Dwa wpisy po 8 h dają zatem różnicę `4701 - 4717 = -16 h`. Wskazana przyczyna diagnostyczna odpowiada dokładnie tej gałęzi kodu. Nie można niezależnie potwierdzić bieżących flag `OK` bez odczytu konfiguracji słownika.
2. **Reguła biznesowa nierozstrzygnięta:** kod nie uznaje automatycznie „oddania krwi” za usprawiedliwioną nieobecność. Decyduje flaga `WorkTimeType.isAbsence`. To, czy `OK` powinien być tak oznaczony, wymaga decyzji właściciela reguł czasu pracy. Sama nazwa typu ani jego kod nie wystarczają implementacji do klasyfikacji.
3. **Potwierdzona niespójność semantyki godzin wg zleceń:** tabela raportu pokazuje `actualHours` z wybranego okresu, ale `deviation` i `percent` obliczane są z godzin narastających od `orderDate` do końca okresu. To zachowanie jest celowe według testów i dokumentacji v0.5.7, jednak obok siebie prezentowane wartości mają różne zakresy czasu. Może to wyjaśniać wysokie procenty; bez rzeczywistych danych nie można potwierdzić, czy przykłady są arytmetycznie poprawne.
4. **Potwierdzone ryzyko innych typów:** każdy typ niebędący nieobecnością i niewymagający zlecenia (np. `SZK`) pozostaje w sumie pracownika, ale nie jest rozliczany po stronie zleceń/nieobecności. Testy jawnie dokumentują tę różnicę. Z kolei nieobecność przypisana do zlecenia objętego raportem jest liczona zarówno jako godziny zlecenia, jak i nieobecność; diagnostyka określa ją jako podwójne naliczenie.
5. **Eksporty dziedziczą obliczenia:** JSON, tabela i XLSX zleceń używają `getOrderReportRows`; eksport CSV w UI korzysta z tych samych danych pobranych do tabeli. Błąd klasyfikacji lub różne zakresy agregacji przechodzą więc do eksportów. Kontrola rozliczenia jest również dostępna w XLSX/CSV trybu zamknięcia.

## Problem 1 — rozliczenie czasu i typ `OK`

### Jak klasyfikowany jest `OK`

W `backend/src/routes/analytics.ts:31-34` raportowa klasyfikacja nieobecności to `workTimeTypeCode === 'NN' || workTimeType.isAbsence`. Poza wyjątkiem `NN`, nie ma listy kodów takich jak `OK`; obowiązuje aktualna flaga słownikowa. `backend/prisma/seed.ts` inicjuje kanoniczne typy `G`, `NDR`, `NS`, `UW`, `UOK`, `UŻ`, `L4` (oraz osobne typy dodatkowe), ale nie definiuje `OK`. Brak `OK` w seedzie nie dowodzi, jakie metadane ma wpis w konkretnej bazie — typ może być niestandardowy.

Przy `isAbsence=false` raport pracowników dodaje godziny do `suma` (`analytics.ts:306-320`), niezależnie od `requiresOrder`. Kontrola sumy pracowników również bazuje na `suma`, a osobno dodaje kolumny typów oznaczonych jako nieobecności (`analytics.ts:808-833`). Przy `requiresOrder=false`, braku zlecenia i `isAbsence=false` diagnostyka przypisuje powód „Typ nie jest nieobecnością i nie wymaga zlecenia” oraz wkład ujemny równy godzinom (`analytics.ts:683-696`). To odpowiada dwóm podanym wpisom OK i różnicy -16 h.

Jeżeli `OK` miałoby `isAbsence=true`, raport pracowników nie wliczałby go do `suma`, lecz pokazał w dynamicznej kolumnie oraz w `sumaBezNadgodzin` (chyba że kod `NN`). Kontrola pobierałaby go jako typ nieobecności i doliczała po stronie absencji. Czy tak ma być dla oddawania krwi, to decyzja biznesowa; obecny kod nie rozstrzyga płatności ani usprawiedliwienia na podstawie nazwy.

### Czy inne typy mogą dawać podobny wynik

- **Nieobecność `isAbsence=true` bez zlecenia:** rozliczana w absencjach, zgodnie z sumą raportu pracownika.
- **Nieobecność `isAbsence=true` przypisana do zlecenia:** `getOrderReportRows` wyklucza z godzin zleceń tylko `NN`, więc taka pozycja może równocześnie wejść do `ordersHours` i `totalAbsenceHours`. Kod diagnostyki wskazuje dodatni wkład i podwójne naliczenie (`analytics.ts:653-680`). Testy obejmują ten przypadek dla `UW` (`analytics.test.ts:2908-2927`). Trasy zapisu nowych wpisów nieobecności wymagają `orderId=null` (`backend/src/routes/reports.ts:284-320`), zatem zagrożenie dotyczy przede wszystkim istniejących/historycznych lub inaczej wprowadzonych danych.
- **Czas niebędący nieobecnością, bez wymogu zlecenia i bez zlecenia:** zostaje w sumie pracownika, ale nie w rozliczeniu kontrolnym. Ten sam przypadek przetestowano dla `SZK` (`analytics.test.ts:1923-2012`, także regresje później w pliku).
- **Typ wymagający zlecenia bez zlecenia albo ze zleceniem nieuwzględnionym w raporcie zamknięcia:** również może powodować ujemny wkład, z przyczynami „Brak zlecenia” lub „Zlecenie nieobjęte raportem zamknięcia”.
- **`NN`:** specjalny wyjątek, wyłączony z obu sum kontrolnych i z godzin wg zleceń, niezależnie od historycznej flagi.

Nie ma jednej wspólnej funkcji wyznaczającej wszystkie kwalifikujące się godziny dla raportu pracownika, zleceń, absencji i kontroli. `isReportingAbsence` współdzieli część klasyfikacji dla pracownika i diagnostyki, ale selekcja godzin wg zleceń stosuje osobny warunek wykluczający tylko `NN`; kontrola składa sumy z kilku ścieżek. Istniejący strażnik sprawdza, czy wkłady diagnostyczne sumują się do różnicy, lecz potwierdza spójność wyjaśnienia arytmetycznego, a nie poprawność decyzji biznesowej.

### Zgodność pozostałych raportów

- **Raport miesięczny pracowników:** `getEmployeeReportRows` grupuje aktywne wpisy z okresu według pracownika i rodzaju czasu. `OK` jest widoczne w kolumnie typu, a przy `isAbsence=false` trafia do `suma`; tabela i eksporty pracowników korzystają z tych samych wierszy. Zatem 4717 h może być zgodne z obecną implementacją.
- **Raport szczegółowy:** `/report-detailed` zwraca aktywne wpisy i ich typy bez filtrowania po `isAbsence` (`analytics.ts:1005-1047`); `/api/reports` dnia także zwraca metadane słownikowe (`reports.ts:39-79`). Pozwala to zobaczyć dwa rekordy, ale nie definiuje ich rozliczeniowej klasyfikacji.
- **Kontrola rozliczenia:** `getClosureControlSummary` oblicza godziny wg zleceń, typy `isAbsence=true` i sumę pracowników w osobnych odczytach w transakcji RepeatableRead (`analytics.ts:722-842`). Nie uwzględnia w rozliczonej sumie nieobecności niewskazanych flagą.
- **Eksport:** eksport miesięczny używa `getEmployeeReportRows`; tabela/CSV w przeglądarce pobiera ten sam endpoint. Eksport zleceń XLSX używa `getOrderReportRows`, a podsumowanie kontroli tej samej funkcji `getClosureControlSummary`. Wartości będą odzwierciedlały powyższą klasyfikację, a nie korygowały jej.

### Testy dla problemu 1

Są testy ogólnej agregacji raportu pracownika, dynamiki typów, NN, braku zlecenia, `SZK` jako czasu niebędącego nieobecnością i nieobecności przypisanej do zlecenia. Brakuje testu regresyjnego dla kodu `OK` / oddania krwi oraz asercji, że ustalona biznesowo klasyfikacja tego typu daje zgodne sumy raportu pracownika i kontroli. Bieżące testy `SZK` potwierdzają, że obecne zachowanie dla `isAbsence=false` / `requiresOrder=false` jest zamierzone jako wykrywana niezgodność, a nie ukryte doliczenie do absencji.

## Problem 2 — procent wykorzystania i odchylenie

### Źródło i wzory

W `backend/src/routes/analytics.ts:493-576` `plannedHours` pochodzi z pola `Order.plannedHours`. `actualHours` jest sumą aktywnych raportów (`deletedAt=null`, kod różny od `NN`) ograniczonych do `dateFrom..dateTo`. Osobna wartość `cumulativeActualHours` sumuje z tego samego pobranego zbioru wpisy od `orderDate` do `dateTo`. Następnie:

- `percent = plannedHours > 0 ? cumulativeActualHours / plannedHours * 100 : 0`;
- `deviation = plannedHours - cumulativeActualHours`.

Wzory są zgodne z udokumentowaną regułą v0.5.7 i testem dla zlecenia wielomiesięcznego: 20 h w sierpniu, 50 h narastająco, plan 100 h daje `actualHours=20`, `percent=50`, `deviation=50` (`analytics.test.ts:1121-1207`). Test pokrywa też eksport XLSX dla tej samej logiki.

### Poziom agregacji, ilość i zakres

Plan i procent odnoszą się do całego planu zlecenia, a wykonanie/odchylenie do godzin narastająco od daty zlecenia, do końca wskazanego zakresu. `actualHours` na tej samej linii tabeli dotyczy natomiast wyłącznie wybranego okresu. To różne poziomy agregacji i może wyglądać na błąd, gdy użytkownik porównuje wyłącznie wyświetlone `actualHours` z procentem. Przykładowo plan 1 h i `actualHours=22 h` dawałby 2200%, gdyby licznik procentu był 22 h; 18200% może wynikać z narastającego 182 h. Takie wyjaśnienie jest możliwe, ale nie potwierdza konkretnych przykładów bez rekordów źródłowych.

Ilość produktów nie jest ponownie mnożona w raporcie: model ma `quantity`, `hoursPerUnit` i `plannedHours` (`backend/prisma/schema.prisma:65-78`), a raport używa zapisanej wartości `plannedHours`. Import zleceń oblicza plan jako `quantity × hoursPerUnit` (specyfikacja `docs/import-export-specification.md`, sekcja „Import zleceń”). Raport nie waliduje, czy ręcznie lub inną ścieżką zapisu te trzy pola są ze sobą zgodne. Samo `1 h` może więc być prawidłowym planem całego zlecenia albo podejrzaną wartością wejściową; kod raportu tego nie rozstrzyga.

Odchylenie ma poprawny znak względem udokumentowanej konwencji „plan minus rzeczywiste narastająco”: wartość dodatnia oznacza pozostały plan, ujemna przekroczenie. Nie jest to `plannedHours - actualHours` okresowego. Etykieta eksportu „Odchylenie (plan - rzecz.)” nie dopowiada, że chodzi o narastające godziny, co zwiększa ryzyko błędnej interpretacji.

### Tabela i eksporty

UI wyświetla bez przeliczania pola API `plannedHours`, `actualHours`, `deviation`, `percent` (`frontend/src/components/ReportsView.tsx:741-757`). Eksport XLSX mapuje dokładnie te same wartości z `getOrderReportRows` (`analytics.ts:1084-1152`). Eksport CSV raportu zleceń jest budowany w `ReportsView.tsx` z `safeReportData` i również zapisuje pola `percent` i `deviation` zwrócone przez endpoint (`ReportsView.tsx:360-390`). Nie ma niezależnego wzoru w tych warstwach, więc każda różnica agregacji/wartość procentowa z API przenosi się do tabeli, XLSX i CSV. `percent` jest zwracany jako liczba już pomnożona przez 100; warstwa UI pokazuje ją z sufiksem `%`, a nie stosuje dodatkowego przeliczenia.

Raport szczegółowy pokazuje surowe rekordy okresu, nie narastający postęp zlecenia. Raport miesięczny agreguje per pracownik i rodzaj czasu, nie jest źródłem `percent` ani odchylenia. Zestawienie szczegółów może więc potwierdzić okresowe 22 h, ale nie samo narastające 182 h bez rozszerzenia zakresu od daty zlecenia. Kontrola rozliczenia używa wyłącznie godzin okresowych (`actualHours`) — jej suma 4013 h nie jest miarą narastającego postępu procentowego.

### Testy dla problemu 2

Testy potwierdzają obliczanie postępu narastającego, pomijanie wpisów usuniętych i przyszłych, przypadki planu zero, zlecenia zamknięte oraz zgodność XLSX/JSON dla części kolumn. Brakuje przypadku z bardzo małym planem (np. 1 h) i dużym narastającym wykonaniem, testu potwierdzającego semantyczną różnicę `period actual` kontra `cumulative percent/deviation` w CSV, oraz testu spójności wszystkich wartości z XLSX. W aktualnym teście XLSX asercja obejmuje godziny, odchylenie i procent dla przykładu wielomiesięcznego, ale oddzielny test raportu zamknięcia porównuje tylko wybrane kolumny JSON/XLSX.

## Błędy potwierdzone, podejrzenia i decyzje

### Błędy / niespójności potwierdzone w kodzie

- Brak wspólnej, jawnej klasyfikacji kategorii rozliczeniowych pomiędzy raportem pracownika, zleceniami i absencjami. Typ `OK` z flagą `isAbsence=false` i bez zlecenia powoduje dokładnie taki deficyt, jaki wynika z diagnozy (-16 h), jeśli metadane i rekordy są zgodne z opisem.
- Nieobecność połączona ze zleceniem w raporcie zamknięcia wchodzi do sumy zleceń i absencji. Istniejąca diagnostyka wykrywa ten przypadek, a test dla `UW` oczekuje wkładu +10 h; testy nie dowodzą jednak, że użytkownik może utworzyć takie nowe wpisy przez obecny endpoint.
- Procent/odchylenie i kolumna godzin rzeczywistych prezentują inne zakresy agregacji bez jawnej informacji w tabeli. Sam wzór procentu jest zgodny z obecną specyfikacją; potwierdzona jest różnica zakresu, nie błędność podanych liczb.

### Podejrzenia wymagające danych źródłowych

- Czy słownik `OK` w środowisku, z którego pochodzą przykłady, ma obecnie `isAbsence=false`, `requiresOrder=false`.
- Czy plany zleceń 530-10-01/07/08 naprawdę wynoszą 1 h oraz czy ich `quantity`, `hoursPerUnit`, `plannedHours` są spójne.
- Czy odpowiednio narastające aktywne godziny do 31.10.2026 wynoszą wartości implikowane przez 18200%, 66100% i 4600% (przy planie 1 h: 182 h, 661 h, 46 h).
- Czy okresowe `actualHours` podane na zrzucie jest identyczne z API dla tych zleceń i czy są wpisy wcześniejsze od 1 października.

### Zachowania zgodne z obecną implementacją

- `OK` z `isAbsence=false` liczy się jako godzina raportowana pracownikowi, nawet gdy `requiresOrder=false`; kontrola ujawnia tę kategorię jako nierozliczoną zamiast zaliczać ją do absencji.
- `actualHours` jest okresowe, a procent/odchylenie narastające od daty zlecenia. Jest to zgodne z testami i dokumentacją v0.5.7.
- Ilość jest uwzględniona pośrednio w `plannedHours` zapisanym na zleceniu, nie mnożona ponownie w raporcie.
- JSON, UI i eksporty korzystają z tych samych obliczeń; eksport nie koryguje rozbieżności niezależnie.

### Kwestie do decyzji biznesowej

- Czy `OK` ma oznaczać usprawiedliwioną nieobecność, pracę poza zleceniem, czy inną kategorię rozliczeniową. Jeśli nieobecność, trzeba zatwierdzić flagę i skutki dla historycznych raportów; jeśli czas do rozliczenia inną ścieżką, trzeba zdefiniować tę ścieżkę jawnie.
- Czy procent i odchylenie mają być narastające (obecny kontrakt), czy okresowe jak `actualHours`; niezależnie od decyzji UI powinno jednoznacznie opisać różne zakresy.
- Czy ręczne ustawienie `plannedHours` ma być dopuszczalne niezależnie od `quantity × hoursPerUnit`, czy raport powinien wykrywać niespójność tych pól.
- Jak obsłużyć historyczne nieobecności przypisane do zleceń, aby nie liczyć ich po obu stronach kontroli.

## Wpływ i ryzyko dla historii

Zmiana samej flagi `WorkTimeType.isAbsence` nie zmienia rekordów czasu, ale raporty obliczają klasyfikację z aktualnego słownika, a nie z migawki klasyfikacji zapisanej przy wpisie. Zmiana flagi może zatem przeliczyć również starsze okresy: po stronie raportu pracowników typ przejdzie z `suma` do nieobecności, a kontrola przesunie godziny między sumami. `AuditLog` nie rejestruje zmian słownika czasu (opis w `docs/business-rules.md:97-101`), więc obecnie brakuje śladu tej zmiany dla wyjaśniania historycznych wyników. Ryzyko historycznej zmiany wyników jest **wysokie**, jeżeli flagi słownika zostaną poprawione bez uprzedniego uzgodnienia i porównania raportów.

Zmiana definicji `percent`/`deviation` mogłaby przeliczyć interpretację wcześniejszych eksportów/raportów, ale nie wymaga zmiany danych historycznych. Sam audyt nie wykazuje uszkodzenia danych. Schemat `WorkTimeReport` używa FK do typu i zlecenia, a rekordy są odczytywane przez status soft-delete; brak zrzutu bazy uniemożliwia ocenę konkretnych wartości wejściowych. Nie wykonano żadnych zapisów do bazy.

## Propozycja poprawek

1. Po decyzji biznesowej zatwierdzić klasyfikację `OK` i udokumentować ją w regułach biznesowych oraz słowniku; przed zmianą policzyć wpływ na okresy historyczne. Rozważyć audyt zmian słownika.
2. Zdefiniować jeden model rozliczeniowy: każda kategoria godziny ma trafić dokładnie do jednej z sum rozliczonych albo do jawnego koszyka „poza rozliczeniem” z uzasadnieniem. Ponownie wykorzystać tę klasyfikację w raporcie pracownika, zleceń, kontroli i diagnostyce. Nie zmieniać obecnej reguły automatycznie bez decyzji dla `SZK` i innych typów własnych.
3. Odfiltrowywać typy `isAbsence=true` z godzin zlecenia albo blokować/naprawiać stare przypisania w sposób uzgodniony, aby kontrola nie naliczała tych samych godzin podwójnie.
4. Ujednoznacznić zakresy: rozważyć osobne, nazwane pola `actualHoursInPeriod` oraz `cumulativeActualHours`, a w tabeli wyświetlać zakres przy procencie i odchyleniu. Alternatywnie, jeśli decyzja biznesowa nakaże metryki okresowe, obliczać wszystkie trzy wartości z jednego zakresu.
5. Dodać walidację/diagnostykę planu: porównać `plannedHours` z `quantity × hoursPerUnit` i pokazać plan całego zlecenia. Nie nadpisywać istniejących wartości automatycznie bez uzgodnienia.
6. Skorygować dokumentację wersji projektu: metadane pakietu są 0.6.2, lecz `PROJECT_STATUS.md`/`README.md` podają 0.6.1. To nie powoduje obliczeń, ale utrudnia ustalenie, który kontrakt sprawdzono.

## Plan testów regresyjnych

1. Test parametryzowany klasyfikacji: `OK`/typ własny z `isAbsence=false`, `true`, `requiresOrder=false`, z/bez `orderId`; sprawdzenie sum pracownika, kolumny dynamicznej, sumy kontroli, różnicy i diagnozy.
2. Test nieobecności z istniejącym zleceniem: potwierdzić brak podwójnego wliczenia lub jawny błąd walidacyjny; uwzględnić historię oraz soft delete.
3. Macierz dla typów `requiresOrder=true/false` × `isAbsence=true/false` × zlecenie obecne/brak/zamknięte poza okresem, z asercją, że suma wkładów diagnostyki równa się różnicy.
4. Test integracyjny spójności: ta sama fikcyjna migawka godzin ma dawać uzgodnione wartości w raporcie pracownika, szczegółach, raporcie zleceń, kontroli, XLSX i CSV.
5. Testy narastającego postępu: plan 1 h, wpisy sprzed i w okresie, wpisy po `dateTo`, wpis soft-deleted; asercje dla okresowych godzin, narastającego procentu i odchylenia, wraz z nazwą/zakresem kolumn w tabeli i XLSX/CSV.
6. Test planu z `quantity × hoursPerUnit` oraz przypadków niespójnych ręcznych wartości; ustalić oczekiwane zachowanie po decyzji biznesowej.
7. Zachować istniejące testy NN, UW/L4, `SZK`, nieobecności z orderem i historycznego zamknięcia zleceń; dodać przypadek dla `OK` jako osobną regresję, a nie zakładać z góry aktualnej klasyfikacji.

## Rekomendowana kolejność wdrożenia

1. **Najpierw decyzje biznesowe** dla `OK`, nieobecności ze zleceniem oraz semantyki metryk okresowych/narastających.
2. **Ustalić punkt odniesienia** na kopii/analitycznym eksporcie danych, bez zmian w produkcji: słownik typów, wpisy za 01–31.10.2026, plany zleceń i aktywne godziny narastające. Porównać API, eksporty i sumy ręcznie.
3. **Dopisać testy kontraktowe/regresyjne** dla uzgodnionych reguł i wspólnej klasyfikacji, zanim zostanie zmieniona implementacja.
4. **Wdrożyć minimalną zmianę obliczeń** bez modyfikacji historycznych rekordów; jeśli konieczna będzie zmiana flag słownika lub danych, przygotować osobną, zatwierdzoną procedurę i raport wpływu.
5. **Zaktualizować dokumentację i wersję**, uruchomić wymagane testy/buildy oraz ręcznie porównać tabelę, raport szczegółowy, raport pracowników, kontrolę i eksporty.
6. **Przed deploymentem uzyskać akceptację użytkownika** wyników na uzgodnionym środowisku. Ten audyt nie wykonuje ani nie rekomenduje deploymentu bez tej akceptacji.

## Wniosek

Rozbieżność 16 h jest zgodna z obecną logiką, jeśli `OK` jest w słowniku nieobecnością `false` i nie wymaga zlecenia; to nie dowodzi, że wpisy są błędne. Wymaga decyzji, do jakiej kategorii biznesowej należą. Bardzo wysokie wykorzystanie może być skutkiem poprawnie liczonego postępu narastającego przy małym planie, ale tabela zestawia go z godzinami okresowymi i nie pozwala z samych widocznych liczb zweryfikować licznika. Testy istnieją dla ogólnych reguł i narastającego postępu, ale nie dla `OK`, wartości skrajnych w CSV ani pełnego uzgodnienia wszystkich raportów.
