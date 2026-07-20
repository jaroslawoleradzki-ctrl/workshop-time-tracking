# Repair Manifest Builder dla historycznych duplikatów

## Cel i granice etapu 2

Narzędzie `duplicates:repair-plan` przekształca istniejący plik `duplicate-analysis.json` w konserwatywną propozycję dalszego postępowania. Wskazuje batche wyglądające na prawidłowe, całkowicie nadmiarowe albo niejednoznaczne.

To nie jest mechanizm naprawy. Skrypt:

- nie importuje Prisma ani konfiguracji `DATABASE_URL`;
- nie otwiera połączenia z bazą danych;
- nie zawiera i nie wykonuje `DELETE`, `UPDATE`, `INSERT` ani soft delete;
- nie zmienia wejściowego raportu;
- zapisuje wyłącznie trzy nowe pliki lokalne w `backend/reports/`.

Nowe manifesty mają `manifestVersion: 2`, `requiresApproval: true`, globalne `approved: false`, `readOnly: true` oraz `databaseOperationsPerformed: false`. Każda propozycja DELETE otrzymuje własne `approved: false`. Builder nie wykonuje naprawy. Istniejące manifesty v1 pozostają czytelne dla podsumowania i zatwierdzania, lecz nie mają danych wystarczających do przyszłego wykonania.

## Uruchomienie

Polecenie należy wykonać w katalogu `backend`, przekazując pełny raport z etapu 1:

```bash
cd backend
npm run duplicates:repair-plan -- --analysis reports/duplicate-analysis-YYYYMMDD-HHMMSS/duplicate-analysis.json
```

Pomoc bez odczytywania pliku:

```bash
npm run duplicates:repair-plan -- --help
```

Skrypt wymaga pliku o nazwie `duplicate-analysis.json`, sprawdza jego strukturę, unikalność identyfikatorów grup i batchy oraz brak przypisania jednego raportu do kilku batchy. SHA-256 wejścia trafia do manifestu, aby późniejsza weryfikacja dotyczyła dokładnie tego samego raportu.

## Pliki wynikowe

Każde uruchomienie tworzy katalog:

```text
backend/reports/repair-plan-YYYYMMDD-HHMMSS/
```

Zawartość:

- `repair-manifest.json` – kompletny, maszynowo czytelny plan wraz z akcjami, powodami, dowodami, snapshotami rekordów DELETE i konkretnymi poprzednikami;
- `repair-summary.md` – podsumowanie KEEP/DELETE/REVIEW, podział według pewności, najczęstsze powody, ostrzeżenia i pełna lista pozycji wymagających ręcznej weryfikacji;
- `repair-summary.csv` – jeden wiersz na batch, przygotowany do filtrowania w Excelu. Nierozpoznane odwołania do batcha są dodawane jako osobne, syntetyczne wiersze `unresolved:<groupId>` z akcją REVIEW.

Katalog `backend/reports/` jest ignorowany przez Git i może zawierać dane osobowe oraz identyfikatory rekordów. Pliki należy chronić tak samo jak raport źródłowy.

## Znaczenie akcji

- `KEEP` – batch wygląda na prawidłową, pierwszą kopię albo kompletną kopię bez grup duplikatów. Akcja oznacza brak proponowanej zmiany.
- `DELETE` – cały batch wygląda na późniejszą, całkowicie nadmiarową kopię. Jest to wyłącznie propozycja; `requiresManualReview` pozostaje ustawione na `true`.
- `REVIEW` – historia jest niejednoznaczna, niepełna albo nie pozwala bezpiecznie zdecydować o całym batchu.

Builder nie generuje częściowego DELETE dla wybranych rekordów batcha. Jeżeli choć jeden rekord partii nie spełnia warunków, cała partia trafia do REVIEW.

## Reguły klasyfikacji

### Zasady nadrzędne

Sama liczba identycznych rekordów nigdy nie wystarcza do propozycji DELETE. Decyzja wykorzystuje `copyBatchId`, kolejność `createdAt`, `updatedAt`, `deletedAt`, `sourceMatch`, `repetitionFactor`, `createAuditCoverage`, `likelihood`, `sourceHistoryUncertain`, `creationSpanMs` oraz kody `evidence` grupy.

- Każdy batch obejmujący grupę `LOW` otrzymuje REVIEW.
- Każdy batch obejmujący grupę `MEDIUM` otrzymuje REVIEW. Etap 2 celowo nie korzysta z opcjonalnego wyjątku DELETE dla MEDIUM.
- Brak rozpoznanego batcha, niepełne dowody albo zmieniona historia oznaczają REVIEW.

### Warunki propozycji DELETE

DELETE jest możliwe wyłącznie dla całego batcha, gdy jednocześnie:

1. wszystkie jego raporty należą do grup `HIGH`;
2. każda grupa ma dowód historii kopiowania: powtórzony zestaw, wiele batchy źródłowych albo potwierdzoną kaskadę;
3. batch ma `likelihood: STRONG`, zgodne `EXACT` z `repetitionFactor: 1` albo `REPEATED` z czynnikiem co najmniej 2, ustaloną datę źródłową i czas trwania nieprzekraczający okna analizy;
4. `createAuditCoverage` wynosi 1 albo istnieje jawny audyt operacji kopiowania;
5. historia źródła nie jest oznaczona jako niepewna;
6. każdy rekord jest aktywny i nie ma późniejszej istotnej aktualizacji;
7. historyczni kandydaci są najpierw filtrowani do rekordów aktywnych, wcześniejszych, zgodnych biznesowo i należących do wiarygodnych batchy już sklasyfikowanych jako KEEP;
8. dopiero wśród tak zakwalifikowanych kandydatów każdy rekord musi mieć dokładnie jednego poprzednika, który nie należy do bieżącego batcha ani żadnej akcji DELETE i ma ten sam fingerprint biznesowy.

Dla każdego rekordu DELETE manifest zapisuje `reportId`, pełne `preconditions`, fingerprint oraz obiekt `predecessor` z konkretnym `reportId`, `batchId`, snapshotem i fingerprintem poprzednika. `reportIds` jest generowane z rekordów DELETE, a executor sprawdza zgodność obu reprezentacji. Kandydaci z akcji REVIEW i DELETE są odrzucani przed sprawdzeniem liczby poprzedników i nie mogą tworzyć pozornej wieloznaczności. Zero zakwalifikowanych kandydatów KEEP albo więcej niż jeden taki kandydat powoduje REVIEW całego batcha z listą `preconditionIssues`; builder nie wybiera pierwszego UUID i nie dzieli batcha na części.

### Snapshot i fingerprint

Snapshot obejmuje rzeczywiste pola raportu i dane dostępne w analizie: `employeeId`, `date`, `orderId`, `orderNumber`, `orderName`, `hours`, `workTimeTypeCode`, `createdAt`, `updatedAt`, `deletedAt`, `createdByUserId`, `modifiedByUserId`, `createAuditId` i `copyBatchId`.

Fingerprint ma format `sha256:<hex>` i jest liczony przez standardowy moduł Node.js z jawnie uporządkowanego zestawu:

1. wersja algorytmu `work-time-report-business-v1`;
2. `date` jako `YYYY-MM-DD`;
3. `employeeId`;
4. `orderId`, przy czym brak zlecenia jest JSON `null`;
5. `hours` znormalizowane do dwóch miejsc po przecinku;
6. `workTimeTypeCode`.

`updatedAt`, `deletedAt`, autorzy i dane audytu nie należą do fingerprintu biznesowego, lecz pozostają osobnymi, dokładnymi preconditions. Zmiana któregokolwiek z nich będzie mogła zostać wykryta przed przyszłym wykonaniem bez zmiany znaczenia biznesowego fingerprintu.

### Warunki KEEP

KEEP wymaga pełnego, stabilnego batcha `EXACT` z `repetitionFactor: 1`, kompletnym audytem, pewną historią i brakiem wewnętrznych powtórzeń.

- Jeżeli żaden rekord batcha nie należy do grupy duplikatów, powodem jest `VALID_COPY_WITHOUT_DUPLICATES`.
- Jeżeli późniejsze rekordy tworzą grupy `HIGH`, ale w bieżącym batchu nie ma wcześniejszych ani wewnętrznych duplikatów, powodem jest `ORIGINAL_COPY_BATCH`.
- Dowód `REPEATED_IMPORT_SESSION` z detektora v2 jest traktowany jako historia kopiowania/importu na równi z innymi silnymi dowodami. Builder nadal wymaga pełnych preconditions i dokładnie jednego wcześniejszego poprzednika z batcha `KEEP`; brak takiego poprzednika pozostawia batch w `REVIEW`.

Wszystkie pozostałe konfiguracje przechodzą do REVIEW. Szczególnie dotyczy to batcha zawierającego wielokrotność zestawu źródłowego, gdy nie można bezpiecznie usunąć całej partii.

## Deterministyczność i idempotencja

Dla tego samego pliku wejściowego klasyfikacja, kolejność akcji, powody i listy identyfikatorów są deterministyczne niezależnie od kolejności tablic w JSON. Każde uruchomienie tworzy nowy katalog i nowy `generatedAt`; nie nadpisuje raportu źródłowego ani wcześniejszych wyników.

Idempotencja dotyczy stanu danych: wielokrotne uruchomienie nie zmienia bazy ani istniejących raportów. Różnić mogą się wyłącznie czas wygenerowania i nazwa nowego katalogu.

## Ręczna weryfikacja

Przed jakimkolwiek przyszłym etapem naprawy należy co najmniej:

1. potwierdzić SHA-256 wejściowego `duplicate-analysis.json`;
2. przejrzeć każdą akcję DELETE i jej `predecessorBatchIds`;
3. upewnić się, że zachowany poprzednik zawiera biznesowo prawidłowy wpis;
4. rozstrzygnąć wszystkie REVIEW niezależnie od poziomu confidence;
5. utworzyć kopię bazy i przeprowadzić osobny proces zatwierdzenia.

Builder ustawia `approved: false` przy każdej akcji DELETE i globalne `approved: false`. Zatwierdzanie wybranych akcji DELETE oraz read-only stub wykonania zapewnia opisany osobno [Duplicate Repair Executor](duplicate-repair-executor.md).

## Ograniczenia

- Wiarygodność planu nie może być większa niż wiarygodność wejściowej analizy.
- Historyczne rekordy nie mają pełnego `operationId` ani `requestId`, a audyt `CREATE` nie zawsze rozróżnia ręczny zapis od kopiowania.
- Builder operuje na całych batchach. Mieszany batch z rekordami prawidłowymi i nadmiarowymi zawsze wymaga REVIEW.
- Pole `updatedAt` nie jest pełnym dziennikiem zmian; jego stabilność jest tylko jednym z wymaganych sygnałów.
- Akcja DELETE nie jest zgodą na usunięcie i nie może być wykonana automatycznie na podstawie samego manifestu.
- Konserwatywny wymóg dokładnie jednego poprzednika może znacząco zmniejszyć liczbę propozycji DELETE; jest to zamierzone.

## Testy

Testy jednostkowe nie wymagają bazy danych:

```bash
cd backend
npm test -- tests/repair-manifest-builder.test.ts
npm exec tsc -- --project tsconfig.scripts.json
```

Obejmują manifest v2, KEEP/DELETE/REVIEW, fingerprint i normalizację, dokładnie jednego poprzednika KEEP, odfiltrowanie kandydatów REVIEW/DELETE, dwóch kandydatów KEEP, brak zakwalifikowanego poprzednika, batch mieszany, niezgodny klucz biznesowy, zgodność `reportIds` z `records`, zmienioną historię, brakujący batch i deterministyczność eksportu.
