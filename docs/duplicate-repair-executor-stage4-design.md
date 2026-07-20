# Duplicate Repair Executor – projekt architektury etapu 4

## Status dokumentu i granice etapu

Ten dokument opisuje docelową architekturę wykonania zatwierdzonego Repair Manifestu przez tryb `--execute`. Nie jest implementacją. Na tym etapie nie powstaje kod naprawczy, migracja ani połączenie z bazą danych.

Etap 4A zrealizował część przygotowawczą: builder generuje `manifestVersion: 2` z pełnymi snapshotami targetów, biznesowymi fingerprintami SHA-256 i dokładnie jednym konkretnym poprzednikiem dla każdego DELETE. Executor obsługuje summary/approve dla v1/v2 i waliduje v2, lecz `--execute` nadal jest stubem bez dostępu do bazy. Poniższy przebieg transakcyjny pozostaje projektem przyszłego etapu wykonawczego.

Zakładany efekt przyszłego wykonania to wyłącznie kontrolowany soft delete zatwierdzonych, nadmiarowych rekordów `work_time_reports`. Akcje `KEEP` i `REVIEW` nigdy nie zmieniają danych.

Projekt opiera się na następujących zasadach:

- bezpieczeństwo ma pierwszeństwo przed częściowym wykonaniem;
- wszystkie zatwierdzone akcje, których nie wykonano wcześniej, są wykonywane atomowo albo żadna nie jest wykonywana;
- niejednoznaczność zawsze zatrzymuje wykonanie;
- stan bazy jest sprawdzany ponownie bezpośrednio przed zmianą;
- manifest pozostaje niezmieniony podczas `--execute`;
- audyt i soft delete należą do tej samej transakcji;
- ponowne wykonanie tego samego, zakończonego planu jest bezpiecznym no-op.

## Stan istniejącego rozwiązania

Historyczny manifest v1 zawiera akcje batchy, `reportIds`, `predecessorBatchIds`, klasyfikację i metadane zatwierdzenia. Manifest v2 dodaje rekordowe preconditions, fingerprint oraz konkretny obiekt poprzednika. W bazie nadal nie istnieje encja batcha ani pole `copyBatchId`; batch jest syntetycznym wynikiem analizatora. „Istnienie batcha” można więc zweryfikować tylko w manifeście, a nie przez zapytanie do bazy.

Model `WorkTimeReport` udostępnia między innymi:

- `id`, `date`, `employeeId`, `orderId`, `hours`, `workTimeTypeCode`;
- `createdByUserId`, `modifiedByUserId`;
- `createdAt`, `updatedAt`, `deletedAt`.

Model `AuditLog` udostępnia `id`, `tableName`, `recordId`, `action`, `oldValues`, `newValues`, `userId` i `createdAt`. `userId` jest wymaganym UUID istniejącego użytkownika. Obecne `approvedBy` jest wyłącznie tekstem, dlatego nie może być bezpiecznie użyte jako `AuditLog.userId`.

## Decyzje bazowe

### Soft delete zamiast fizycznego usuwania

Docelowa operacja ustawia `deletedAt` oraz `modifiedByUserId`. Nie wykonuje fizycznego `DELETE`. Dla wszystkich rekordów jednego wykonania należy użyć jednego czasu pochodzącego z bazy danych.

### Jedna transakcja dla całego wykonania

Zatwierdzony zestaw jest traktowany jako jedna jednostka biznesowa. Błąd jednego rekordu powoduje rollback całego zestawu. Dzielenie kilkuset rekordów na niezależnie zatwierdzane transakcje stworzyłoby stan częściowej naprawy i skomplikowałoby recovery.

### Manifest v1 nie może uruchamiać naprawy

Manifest v1 nie zawiera wystarczających preconditions do wiarygodnego wykrycia, że rekord został zmieniony po analizie. Nie zawiera również konkretnych `predecessorReportIds`, tylko syntetyczne identyfikatory batchy. Etap wykonawczy nie powinien rekonstruować tych informacji heurystycznie.

Jawnie wersjonowany kontrakt `manifestVersion: 2` jest zaimplementowany w etapie 4A. Tryb `--execute` odrzuca v1 z instrukcją ponownego wygenerowania analizy i planu. Nie konwertuje v1 automatycznie i nadal nie wykonuje naprawy.

### Manifest pozostaje jedynym wejściem decyzji

Executor nie powinien ponownie klasyfikować duplikatów ani podejmować nowych decyzji. Może jedynie:

- zweryfikować zatwierdzoną decyzję z manifestu;
- sprawdzić, czy rzeczywisty stan bazy nadal odpowiada zatwierdzonemu stanowi oczekiwanemu;
- wykonać dokładnie zatwierdzony soft delete.

Plik `duplicate-analysis.json` może być zachowany jako materiał dowodowy, ale nie powinien być drugim źródłem decyzji w czasie wykonania.

## Wymagany kontrakt manifestu wykonawczego

Manifest v2 zachowuje dotychczasowe dane i dodaje zestaw preconditions. Dla każdego rekordu proponowanego do usunięcia zapisuje:

- `reportId`;
- oczekiwane `date`, `employeeId`, `orderId`, `hours` i `workTimeTypeCode`;
- oczekiwane `createdByUserId`, `createdAt` i `updatedAt`;
- oczekiwane `deletedAt: null`;
- `batchId` zatwierdzonej akcji;
- dokładnie jeden konkretny `predecessorReportId` przeznaczony do zachowania;
- batch poprzednika, pełny snapshot i fingerprint poprzednika.

Etap 4A używa fingerprintu biznesowego rekordu obejmującego datę, pracownika, `orderId`, znormalizowane godziny i kod typu czasu. `createdAt`, `updatedAt`, `deletedAt`, autorzy, audyt i `copyBatchId` pozostają w snapshotach i są walidowane niezależnie.

Przed prawdziwym wykonaniem kontrakt lub osobny zatwierdzony kontekst musi jeszcze zapewnić:

- identyfikator użytkownika zatwierdzającego w postaci UUID, niezależnie od czytelnego `approvedBy`;
- stabilny skrót niezmiennej części planu, niezależny od kolejności kluczy JSON;
- stabilny fingerprint całej akcji, obejmujący jej rekordy, preconditions i poprzedników;
- wersję algorytmu budującego plan;
- zakres analizy i SHA-256 pliku analizy;
- niebędącą sekretem tożsamość źródłowej bazy/środowiska oraz oczekiwaną wersję schematu;
- jednoznaczną informację, które akcje DELETE są zatwierdzone do wykonania.

Wartości dziesiętne muszą być kanonizowane przed obliczeniem skrótu i porównaniem. `4`, `4.0` i `4.00` nie mogą przypadkowo tworzyć różnych preconditions, jeżeli oznaczają tę samą wartość bazy.

Approval pozostaje przypisane do pojedynczych akcji DELETE. Nadrzędne `approved` jest tylko polem zbiorczym: `false` nie blokuje wykonania prawidłowo i kompletnie zatwierdzonych akcji, jeżeli inne DELETE pozostają niezatwierdzone. Executor rozpatruje wszystkie i tylko indywidualnie zatwierdzone DELETE obecne w odczytanym manifeście. Akcje o identycznym fingerprintcie, których wcześniejsze wykonanie jest potwierdzone audytem, są pomijane jako już zakończone; pozostałe tworzą atomowy zbiór bieżącej transakcji. Brak choć jednej zatwierdzonej akcji kończy operację błędem.

Pole `databaseOperationsPerformed: false` z obecnego manifestu opisuje wyłącznie read-only działanie buildera. Nie może być używane jako dowód, że późniejszy executor nie został uruchomiony. Informacja o rzeczywistym wykonaniu pochodzi wyłącznie z audytu bazy.

## Pełny przebieg `--execute`

### Faza A – walidacja pliku bez dostępu do bazy

1. Rozwiąż ścieżkę i odczytaj cały plik jako jeden snapshot. Atomowy zapis etapu 3 gwarantuje, że czytelnik zobaczy poprzednią albo nową kompletną wersję.
2. Zachowaj SHA-256 dokładnych bajtów pliku jako identyfikator wejścia diagnostycznego.
3. Parsuj JSON. Błąd składni kończy operację przed otwarciem połączenia.
4. Sprawdź obsługiwaną wersję manifestu. Wykonanie obsługuje wyłącznie wersję z kompletnymi preconditions.
5. Sprawdź pełną strukturę, typy, wymagane pola, znaczniki czasu, UUID i liczniki podsumowania.
6. Sprawdź reguły akcji i zatwierdzeń. Approval musi być kompletne i może należeć wyłącznie do DELETE.
7. Wyznacz zbiór zatwierdzonych DELETE. KEEP, REVIEW i niezatwierdzone DELETE pozostają poza zakresem.
8. Sprawdź unikalność `batchId`, unikalność rekordów wewnątrz batcha i brak tego samego `reportId` w więcej niż jednej wykonywanej akcji.
9. Sprawdź zależności poprzedników: każdy usuwany rekord musi wskazywać konkretny rekord zachowywany, a żaden poprzednik nie może znajdować się w zbiorze usuwanym.
10. Sprawdź zgodność `affectedRecords`, `reportIds`, preconditions, fingerprintów akcji, podsumowania i approval.
11. Oblicz deterministyczny fingerprint wykonania z wersji manifestu, skrótu planu, posortowanych zatwierdzonych batchy, posortowanych rekordów, preconditions i approval. Ścieżka pliku oraz kolejność elementów w JSON nie wpływają na fingerprint.
12. Wyświetl zakres planowanej operacji: liczba batchy, rekordów, identyfikator wykonania i informacja o wymaganym soft delete. Na tym etapie nie ma jeszcze żadnej zmiany w bazie.

Każdy błąd fazy A kończy proces bez otwarcia transakcji.

### Faza B – rozpoczęcie transakcji i blokady

13. Otwórz jedną transakcję bazy z izolacją co najmniej `REPEATABLE READ`.
14. Jako pierwszą operację transakcji uzyskaj transakcyjną advisory lock zarezerwowaną dla Duplicate Repair Executor. Jedna wspólna blokada globalna jest właściwa dla rzadkiego narzędzia utrzymaniowego i zapobiega równoległemu wykonaniu dwóch różnych, potencjalnie nakładających się manifestów.
15. Sprawdź tożsamość docelowej bazy i wersję schematu względem manifestu. Nie wolno wykonywać planu utworzonego dla innej instancji lub niezgodnego schematu.
16. Sprawdź audyt po deterministycznym identyfikatorze/fingerprintcie wykonania oraz po fingerprintach pojedynczych akcji. Jeżeli cały zakres był już wykonany, zakończ transakcję bez zmian. Jeżeli wykonano tylko część identycznych akcji podczas wcześniejszego zatwierdzania etapami, oznacz je jako zakończone i pozostaw poza zbiorem bieżącej zmiany. Niezgodny audyt jest konfliktem.
17. Zbuduj posortowaną listę targetów i poprzedników dla niewykonanych jeszcze akcji. Pobierz je zbiorczo oraz zablokuj w stałej kolejności. Targety i poprzedniki powinny mieć blokadę wiersza uniemożliwiającą ich równoległą aktualizację do końca transakcji.

### Faza C – autorytatywna walidacja stanu bazy

18. Sprawdź, czy istnieje dokładnie jeden wiersz dla każdego oczekiwanego `reportId` i `predecessorReportId`.
19. Dla każdego targetu sprawdź `deletedAt`. Wartość różna od `null` jest konfliktem, chyba że krok idempotencji potwierdził wcześniejsze wykonanie dokładnie fingerprintu tej akcji.
20. Porównaj target z pełnym snapshotem: pola biznesowe, autor, `createdAt`, `updatedAt` oraz stan usunięcia. Każda różnica oznacza zmianę po analizie i zatrzymuje całość.
21. Dla każdego poprzednika sprawdź istnienie, aktywność, zgodność snapshotu i identyczną tożsamość biznesową z targetem. Poprzednik musi być wcześniejszy od targetu i nie może należeć do zbioru usuwanego.
22. Sprawdź konflikty między batchami po rozwinięciu ich do rekordów. Syntetyczne `batchId` służy wyłącznie do raportowania; decyzja bazodanowa dotyczy konkretnych UUID raportów.
23. Sprawdź, czy użytkownik wykonujący istnieje i może zostać zapisany jako `modifiedByUserId` oraz `AuditLog.userId`. Tekstowego `approvedBy` nie wolno dopasowywać do użytkownika po nazwie.
24. Opcjonalne odczyty wykonane wcześniej nie mają mocy decyzyjnej. Wynik kroków 18–23 wewnątrz transakcji jest jedyną autorytatywną walidacją bazy.

### Faza D – zmiana i audyt

25. Pobierz jeden czas wykonania z bazy.
26. Wykonaj jeden zbiorczy, warunkowy soft delete targetów niewykonanych jeszcze akcji. Warunek musi ponownie wymagać `deletedAt IS NULL` i zgodnych preconditions; jest to ostatnia ochrona przed zmianą pomiędzy odczytem a zapisem.
27. Ustaw `deletedAt` na wspólny czas i `modifiedByUserId` na UUID wykonującego. `updatedAt` ma odzwierciedlić tę zmianę.
28. Porównaj liczbę faktycznie zmienionych wierszy z dokładną liczbą bieżących targetów. Jakakolwiek różnica powoduje błąd i rollback.
29. W tej samej transakcji zapisz audyt każdego zmienionego raportu, stan ukończenia każdego nowo wykonanego batcha oraz jeden wpis podsumowujący wykonanie. Błąd audytu jest błędem całej operacji.
30. Ponownie sprawdź podstawowe inwarianty wyniku: wszystkie bieżące targety mają ten sam `deletedAt`, żaden poprzednik nie jest usunięty, liczby audytów odpowiadają liczbie zmian.

### Faza E – zakończenie

31. Commit następuje dopiero po pomyślnym soft delete, kompletnym audycie i walidacji liczników.
32. Po commit wypisz czytelne podsumowanie: identyfikator wykonania, fingerprint, liczba batchy nowych i wcześniej wykonanych, liczba zmienionych rekordów, czas commit oraz wynik `COMPLETED`.
33. Nie modyfikuj manifestu po commit. Plik i baza nie mogą uczestniczyć w jednej transakcji; próba zapisania statusu do manifestu tworzyłaby okno niespójności. Źródłem prawdy o wykonaniu jest audyt bazy.

## Kolejność walidacji

| Kolejność | Walidacja | Gdzie | Wynik negatywny |
|---:|---|---|---|
| 1 | odczyt kompletnego pliku i poprawny JSON | przed bazą | przerwanie |
| 2 | obsługiwana `manifestVersion` | przed bazą | przerwanie i regeneracja planu |
| 3 | schemat, typy, UUID, daty i wymagane pola | przed bazą | przerwanie |
| 4 | zgodność podsumowania i liczników | przed bazą | przerwanie |
| 5 | poprawność akcji KEEP/DELETE/REVIEW | przed bazą | przerwanie |
| 6 | kompletność indywidualnych approval DELETE | przed bazą | przerwanie |
| 7 | unikalność batchy i rekordów | przed bazą | przerwanie |
| 8 | kompletność snapshotów i poprzedników | przed bazą | przerwanie |
| 9 | brak konfliktów target–target i target–predecessor | przed bazą | przerwanie |
| 10 | fingerprinty akcji i deterministyczny execution ID | przed bazą | przerwanie przy niespójności |
| 11 | globalna advisory lock | w transakcji | timeout/rollback |
| 12 | tożsamość bazy i wersja schematu | w transakcji | rollback |
| 13 | wcześniejsze wykonanie całości lub pojedynczych akcji | w transakcji | no-op, pominięcie wykonanej akcji albo konflikt audytu |
| 14 | istnienie użytkownika wykonującego | w transakcji | rollback |
| 15 | istnienie wszystkich raportów | w transakcji, po blokadzie wierszy | rollback |
| 16 | brak wcześniejszego soft delete | w transakcji | rollback lub potwierdzony no-op akcji |
| 17 | zgodność pełnych snapshotów targetów | w transakcji | rollback |
| 18 | istnienie, aktywność i zgodność poprzedników | w transakcji | rollback |
| 19 | brak konfliktów ujawnionych przez stan bazy | w transakcji | rollback |
| 20 | warunkowy soft delete i liczba zmienionych wierszy | w transakcji | rollback |
| 21 | kompletność audytu i inwarianty końcowe | w transakcji | rollback |

## Granice transakcji

### Początek

Transakcja rozpoczyna się dopiero po pełnej walidacji pliku, approval, zależności i fingerprintu. Pierwszym działaniem w transakcji jest advisory lock, a następnie sprawdzenie idempotencji.

### Commit

Commit występuje tylko raz, po:

- zablokowaniu i ponownym zweryfikowaniu wszystkich wierszy;
- zmianie dokładnie oczekiwanej liczby rekordów;
- zapisaniu pełnego audytu;
- potwierdzeniu inwariantów wyniku.

### Rollback

Rollback obejmuje wszystkie soft delete i wszystkie wpisy audytu z bieżącej próby. Jest wymagany dla każdego błędu zapytania, timeoutu, utraty połączenia, niezgodności rekordu, brakującego poprzednika, błędnej liczby zmian albo nieudanego audytu. Proces nie próbuje kontynuować od kolejnego batcha.

## Scenariusze błędów

| Scenariusz | Interpretacja | Zachowanie |
|---|---|---|
| brak lub uszkodzony manifest | brak wiarygodnego wejścia | stop przed bazą |
| manifest starszej lub nieznanej wersji | brak wymaganych gwarancji | stop; ponowna analiza i budowa v2 |
| manifest pochodzi z innej bazy lub wersji schematu | ryzyko działania na niewłaściwym zbiorze danych | rollback przed odczytem raportów |
| zmieniony skrót planu | manifest nie odpowiada zatwierdzonemu planowi | stop przed bazą |
| brak zatwierdzonego DELETE | brak zakresu do wykonania | stop bez transakcji |
| niepełne approval | nie wiadomo kto/co zatwierdził | stop przed bazą |
| approval przy KEEP lub REVIEW | naruszenie kontraktu | stop przed bazą |
| powtórzony `batchId` | niejednoznaczna akcja | stop przed bazą |
| powtórzony `reportId` w jednym lub wielu batchach | ryzyko podwójnej zmiany | stop przed bazą |
| target jest poprzednikiem innej akcji | plan usuwa własny dowód zachowania | stop przed bazą |
| batch nie istnieje | dotyczy wyłącznie odwołania wewnątrz manifestu | stop przed bazą |
| rekord bazy nie istnieje | stan różni się od analizy | rollback |
| rekord został zmieniony | `updatedAt` lub snapshot nie jest zgodny | rollback i nowa analiza |
| rekord jest już soft-deleted | obca zmiana albo przerwane postępowanie | no-op tylko przy zgodnym audycie; inaczej rollback |
| brak poprzednika | usunięcie mogłoby skasować jedyny prawidłowy wpis | rollback |
| poprzednik jest usunięty | brak aktywnego rekordu do zachowania | rollback |
| poprzednik został zmieniony | dowód z manifestu jest nieaktualny | rollback |
| poprzednik nie ma tej samej tożsamości | niespójny plan | rollback |
| nieznany użytkownik wykonujący | brak poprawnego FK i audytu | rollback |
| konflikt z drugim executorem | blokada globalna nieuzyskana w limicie | stop/rollback, bez zgadywania |
| konflikt z bieżącą edycją aplikacji | precondition lub blokada wiersza nie przechodzi | rollback |
| liczba zaktualizowanych wierszy jest inna | wyścig lub błąd planu | rollback |
| nie udało się zapisać audytu | naprawa bez audytu jest niedopuszczalna | rollback |
| timeout/deadlock/błąd połączenia przed commit | wynik niepewny dla klienta | ponowne uruchomienie po sprawdzeniu audytu |
| błąd wyświetlenia wyniku po commit | baza jest już poprawnie zmieniona | retry rozpozna wykonanie i zwróci no-op |

Błędy walidacyjne nie powinny być automatycznie ponawiane. Błędy przejściowe bazy można ponowić ograniczoną liczbę razy wyłącznie przez ponowienie całej transakcji z tym samym fingerprintem, nigdy od środka listy.

## Idempotencja

### Identyfikator wykonania

Z fingerprintu całego uruchomienia należy wyprowadzić deterministyczny UUID `executionId`. Ten sam zestaw zatwierdzonych akcji, rekordów, preconditions i approval zawsze daje ten sam identyfikator. Zmiana choć jednego elementu daje nowy identyfikator i wymaga nowego zatwierdzenia.

Niezależnie każda akcja ma stabilny fingerprint planu oraz fingerprint approval. Jest to konieczne, gdy batch A został zatwierdzony i wykonany wcześniej, a następnie do tego samego manifestu dodano approval batcha B. Nowe uruchomienie ma rozpoznać A jako dokładnie wykonaną akcję, a transakcyjnie wykonać tylko B; nie może próbować ponownie usuwać rekordów A ani uznać ich stanu za obcy konflikt.

### Drugie uruchomienie

Po uzyskaniu advisory lock executor szuka zakończonego audytu o tym samym `executionId` i fingerprintcie, a następnie statusów wszystkich fingerprintów akcji.

- Jeżeli audyt jest kompletny i liczby są zgodne, drugie uruchomienie nie zmienia rekordów ani nie dopisuje kolejnych audytów. Kończy się sukcesem `ALREADY_COMPLETED` i pokazuje pierwotny wynik.
- Jeżeli część akcji ma kompletny, zgodny audyt wcześniejszego wykonania, są one pomijane; wszystkie pozostałe zatwierdzone akcje tworzą jeden atomowy zestaw bieżącej transakcji.
- Jeżeli `executionId` istnieje, ale fingerprint lub zakres jest inny, jest to konflikt integralności i wykonanie zostaje zatrzymane.
- Jeżeli rekordy akcji są już usunięte, lecz nie ma kompletnego audytu jej fingerprintu, executor nie uznaje ich za własny sukces. Zwraca `RECOVERY_REQUIRED`.
- Jeżeli pierwsza próba przerwała się przed commit, transakcja nie pozostawia zmian; drugie uruchomienie wykonuje plan normalnie.
- Jeżeli pierwsza próba wykonała commit, ale proces nie zdążył wypisać wyniku, drugie uruchomienie rozpoznaje zakończony audyt i zwraca bezpieczny no-op.

Obecny `audit_logs` nie ma unikalnego ograniczenia dla `executionId`. Globalna advisory lock zapobiega równoległemu podwójnemu wykonaniu, lecz decyzja, czy dodać osobny rejestr wykonań z unikalnym fingerprintem, pozostaje do zatwierdzenia przed implementacją.

## Audyt

### Wpis podsumowujący wykonanie

W tej samej transakcji powinien powstać jeden wpis operacyjny z:

- `executionId` i fingerprintem;
- wersją manifestu i algorytmu;
- SHA-256 manifestu oraz analizy;
- listą zatwierdzonych `batchId`;
- liczbą batchy i rekordów;
- UUID i czytelną nazwą zatwierdzającego;
- czasami approval;
- notatką approval;
- UUID użytkownika wykonującego;
- wspólnym czasem soft delete;
- wynikiem `COMPLETED`;
- wersją aplikacji/narzędzia.

`AuditLog.recordId` może przechowywać deterministyczny `executionId`, ponieważ ma typ UUID. Akcja operacyjna musi mieścić się w istniejącym limicie 20 znaków. Nie należy zapisywać pełnej ścieżki systemowej, sekretów ani `DATABASE_URL`.

### Wpis ukończenia batcha

Dla każdej nowo wykonanej akcji DELETE potrzebny jest wpis operacyjny zawierający `batchId`, fingerprint planu i approval, `executionId`, listę `reportIds`, liczbę rekordów i wynik `COMPLETED`. To ten wpis pozwala bezpiecznie rozpoznać wcześniej wykonaną akcję po późniejszym, etapowym dodaniu kolejnych approval do manifestu.

### Audyt każdego raportu

Każdy zmieniony `work_time_reports` powinien mieć osobny wpis z:

- `action: DELETE`, zgodnie z obecną konwencją soft delete;
- pełnym snapshotem `oldValues`;
- pełnym `newValues` z `deletedAt` i `modifiedByUserId`;
- `executionId`, fingerprintem i `batchId` w metadanych naprawy;
- approval powiązanym z batchem;
- `userId` wykonującego.

Wszystkie audyty muszą być zapisywane przez ten sam kontekst transakcyjny, a błąd zapisu ma być propagowany. Ciche pominięcie audytu, dopuszczalne w niektórych zwykłych ścieżkach aplikacji, nie jest dopuszczalne w executorze.

Nieudane próby przed commit powinny trafić do chronionego logu operacyjnego procesu. Nie należy commitować osobnego wpisu „FAILED” po rollback bez osobnej decyzji, ponieważ komplikowałoby to atomowość i idempotencję.

## Soft delete i dodatkowe pola

### Pola `work_time_reports`

Istniejące `deletedAt` jest właściwym mechanizmem. Należy również ustawić `modifiedByUserId`; `updatedAt` powinno zostać zaktualizowane. Nie ma potrzeby dodawania do tabeli biznesowej pól `repairBatchId`, `repairExecutionId` ani osobnego znacznika duplikatu. Takie dane należą do audytu.

### Czy potrzebny jest dodatkowy rejestr wykonania

Nie jest wymagany do samego soft delete, ale poprawia gwarancję exactly-once. Docelowa tabela/rejestr z unikalnym `executionId` lub fingerprintem pozwoliłaby jednoznacznie egzekwować idempotencję i szybko odczytywać status. Jej dodanie oznaczałoby osobno zatwierdzoną migrację, której ten etap nie tworzy.

Bez nowego rejestru możliwy jest wariant minimalny: deterministyczny UUID w `audit_logs`, globalna advisory lock i sprawdzanie wpisu `COMPLETED`. Jest bezpieczny przy jednym kontrolowanym executorze, ale opiera unikalność na protokole, a nie constraint bazy. Do środowiska produkcyjnego rekomendowany jest rejestr z unikalnym kluczem albo formalna akceptacja słabszej gwarancji wariantu minimalnego.

## Recovery i odtworzenie

### Przerwanie procesu

- Przed rozpoczęciem transakcji: baza pozostaje nietknięta.
- Po rozpoczęciu, przed commit: zerwane połączenie powoduje rollback całej transakcji; advisory lock i blokady wierszy są zwalniane.
- Po commit, przed pokazaniem wyniku: audyt `COMPLETED` pozwala rozpoznać sukces przy ponowieniu.
- Nieznany stan klienta: operator ponawia dokładnie ten sam manifest. Nie wykonuje ręcznych korekt przed wynikiem kontroli idempotencji.

### Odtworzenie danych

Przed produkcyjnym wykonaniem wymagany jest sprawdzony backup lub aktywne point-in-time recovery. Soft delete ułatwia odtworzenie, ale nie zastępuje kopii.

Przywrócenie rekordów nie należy do `--execute` i nie może następować automatycznie. Powinno być osobnym, zatwierdzonym procesem korzystającym z `executionId` i audytu, który:

- potwierdza, że rekord nie zmienił się po naprawie;
- ustawia `deletedAt` z powrotem na poprzednią wartość, zwykle `null`;
- ustawia właściwego `modifiedByUserId`;
- zapisuje osobny audyt odtworzenia.

Jeżeli audyt i stan rekordów nie pozwalają udowodnić spójności, recovery odbywa się z backupu lub przez ręczną procedurę, nie przez zgadywanie.

## Wydajność i ograniczenie zapytań

Dla kilkuset rekordów właściwa jest jedna transakcja i operacje zbiorcze:

- jedna walidacja pliku i budowa map/setów w pamięci;
- jedno zbiorcze pobranie targetów oraz jedno zbiorcze pobranie unikalnych poprzedników albo jedno wspólne pobranie wszystkich UUID;
- stałe sortowanie UUID przed blokowaniem wierszy, aby ograniczyć ryzyko deadlocku;
- jedno zbiorcze, warunkowe ustawienie soft delete zamiast pętli zapytań;
- zbiorczy zapis audytów, z zachowaniem jednego wpisu na rekord;
- brak zapytań N+1 dla użytkowników, batchy i raportów;
- porównania snapshotów w pamięci oraz warunek precondition w zapytaniu aktualizującym;
- jawny limit liczby rekordów wykonania i timeout transakcji uzgodnione przed wdrożeniem.

Jeżeli liczba parametrów przekracza limit sterownika, wejście można technicznie podzielić na fragmenty zapytań wewnątrz tej samej transakcji. Nie wolno dzielić operacji na osobne commity.

Globalna blokada executora nie blokuje zwykłej aplikacji. Blokady wierszy chronią istniejące targety i poprzedników, lecz zwykłe ścieżki POST/PUT/DELETE nie wszystkie korzystają z tej samej blokady globalnej. Dla jednorazowego wykonania rekomendowane jest okno utrzymaniowe z wstrzymaniem zapisów raportów. Alternatywą jest wcześniejsze objęcie wszystkich ścieżek modyfikujących raporty wspólnym protokołem blokad i warunkowych zapisów; to osobna zmiana produkcyjna i nie należy jej ukrywać w executorze.

## Diagram przebiegu

```text
repair-manifest.json
         |
         v
[odczyt kompletnego pliku + SHA-256]
         |
         v
[wersja v2 + schema + inwarianty]
         |
         v
[approval DELETE + konflikty + preconditions]
         |
         v
[fingerprint + deterministyczny executionId]
         |
         v
================ START TRANSACTION ================
         |
         v
[global advisory lock]
         |
         v
[tożsamość bazy + wersja schematu]
         |
         v
[audyt executionId i akcji już COMPLETED?] -- wszystkie --> [NO-OP / ALREADY_COMPLETED]
         |
   część albo żadna
         |
         v
[wykluczenie zgodnie ukończonych akcji]
         |
         v
[zbiorcze pobranie i blokada pozostałych targetów/poprzedników]
         |
         v
[istnienie + aktywność + snapshot + predecessor]
         |
         +---------------- błąd -------------------+
         |                                         |
         v                                         v
[warunkowy zbiorczy soft delete]                [ROLLBACK]
         |                                         |
         v                                         v
[liczniki + audyt rekordów + audyt operacji]   [FAILED / bez zmian]
         |
         +---------------- błąd -------------------+
         |
         v
[kontrola inwariantów końcowych]
         |
         v
===================== COMMIT ======================
         |
         v
[COMPLETED + executionId + liczby]
```

## Ryzyka

- Manifest v1 nie ma danych wystarczających do bezpiecznego wykonania; użycie go wymagałoby zgadywania.
- `approvedBy` jako tekst nie zapewnia UUID wymaganego przez audyt i `modifiedByUserId`.
- Brak unikalnego rejestru wykonania osłabia bazodanową gwarancję exactly-once.
- `audit_logs` nie ma obecnie indeksu ani unikalnego constraintu dla identyfikatora wykonania.
- Batch nie istnieje w bazie; jego integralność zależy od manifestu i konkretnych `reportIds`.
- Równoległe PUT/DELETE mogą rozpocząć się poza protokołem executora. Same blokady wierszy nie zastępują operacyjnego wstrzymania zapisów.
- Zbyt długa transakcja może blokować bieżące operacje, dlatego wykonanie powinno odbywać się w oknie utrzymaniowym.
- Błędne przypisanie poprzednika w planie może usunąć właściwy rekord; pełny snapshot i ręczne approval są obowiązkowe.
- Soft delete jest odwracalny logicznie, ale późniejsze zmiany mogą uniemożliwić automatyczne przywrócenie.

## Otwarte pytania

1. Skąd lokalny CLI ma pozyskać wiarygodny UUID zatwierdzającego i wykonującego: z nowych obowiązkowych parametrów, uwierzytelnionego kontekstu czy dedykowanej tożsamości serwisowej?
2. Czy zatwierdzający i wykonujący muszą być dwiema różnymi osobami?
3. Czy dopuścić częściowe approval manifestu zgodnie z obecną semantyką etapu 3, czy produkcyjne wykonanie ma wymagać `manifest.approved: true` dla wszystkich DELETE?
4. Czy utworzyć dedykowany rejestr wykonań z unikalnym fingerprintem, czy zaakceptować wariant minimalny oparty na `audit_logs` i advisory lock?
5. Jaki maksymalny rozmiar wykonania, timeout blokady i timeout transakcji są akceptowalne produkcyjnie?
6. Czy wymagane jest formalne okno utrzymaniowe, czy przed etapem 4 zostaną ujednolicone blokady ścieżek POST/PUT/DELETE?
7. Jak długo przechowywać manifest, analizę, log procesu i dowód backupu oraz gdzie przechowywać je bezpiecznie?
8. Czy osobny proces odtworzenia ma wejść do zakresu kolejnego etapu, czy pozostaje wyłącznie procedurą operacyjną?

## Decyzje wymagające zatwierdzenia

Przed rozpoczęciem implementacji należy formalnie zatwierdzić:

1. uzupełnienie kontekstu wykonania o tożsamość docelowej bazy, wersję schematu i fingerprint całej akcji;
2. źródło UUID użytkownika wykonującego oraz zasadę rozdziału ról approver/executor;
3. semantykę częściowego approval;
4. wybór rejestru idempotencji: dedykowana tabela z unikalnym kluczem albo świadomie zaakceptowany wariant `audit_logs`;
5. obowiązkowy backup/PITR i okno wstrzymania zapisów raportów;
6. limity liczby rekordów i czasów oczekiwania;
7. format audytu operacyjnego i procedurę odtworzenia.

## Rekomendowana kolejność implementacji

1. Ukończono: manifest v2 z pełnymi snapshotami targetów i konkretnymi poprzednikami, walidacja offline oraz testy bez bazy.
2. Zatwierdzić pozostałe decyzje, zwłaszcza tożsamość wykonującego, docelowej bazy i rejestr idempotencji.
3. Rozszerzyć approval o stabilny UUID zatwierdzającego oraz dodać fingerprint całej akcji i ochronę niezmiennej części planu.
4. Przygotować warstwę transakcyjną z globalną advisory lock, zbiorczymi blokadami wierszy i odczytami preconditions.
5. Dodać soft delete oraz audyt w jednej transakcji, z wymuszeniem błędu audytu i dokładnego row count.
6. Dodać testy integracyjne: rollback każdego błędu, równoległe wykonania, zmieniony rekord, brak poprzednika, już usunięty rekord i retry po commit.
7. Przeprowadzić próbę na kopii produkcyjnej bazy z rzeczywistym manifestem i zmierzyć czas blokad.
8. Zatwierdzić runbook, backup, recovery i okno utrzymaniowe.
9. Dopiero po osobnej akceptacji uruchomić etap wykonawczy na produkcji.
