# Work time accounting fix — 2026-11

## Stan i zakres

Gałąź `fix/work-time-accounting-2026-11`, izolowany worktree `/tmp/wtt-accounting-fix`, baza `development` / `58f3ae7f218a9864222211af1aad0905ea505d1d`, pakiety aplikacji 0.6.2. Osobna gałąź jest zgodna z wyraźną instrukcją właściciela dla tego zadania. Wcześniejsze raporty audytu i planu zachowano jako historyczne dokumenty wejściowe; poniższy raport przedstawia aktualny stan implementacji.

**Zadanie pozostaje nieukończone według pełnego kryterium zakończenia: brak rzeczywistego zielonego GitHub Actions na dedykowanym runnerze WTT.** Kod poprawki i wspólne lokalne QA są zaimplementowane i zweryfikowane. Nie wykonano merge, release ani deploymentu aplikacji. Nie wykonano żadnych zapisów do baz HomeLab, w tym `wtt_client_test`, `wtt_dev` i DEMO.

## Przyczyny problemów

OK miało flagi false/false, więc raport pracownika widział godziny pracy bez zlecenia, a kontrola rozliczenia nie kwalifikowała ich ani jako zlecenia, ani jako nieobecności. Dwie niezależne flagi przy tworzeniu słownika dopuszczały sprzeczne kombinacje. Sumy zleceń, eksport bazy zleceń i dashboard wykluczały NN, ale nie wszystkie nieobecności, co pozwalało hipotetycznemu historycznemu wpisowi z order_id zwiększyć zarówno zlecenie, jak i absencję.

## Implementacja i migracja

- Nullable enum `AccountingCategory`: ORDER_WORK / ABSENCE / OFF_ORDER_WORK. Istniejące typy pozostają NULL; brak automatycznej klasyfikacji po nazwach. Dotychczasowe flagi i specjalna semantyka NN pozostają zgodne wstecznie.
- Migracja `20261104090056_add_work_time_accounting_category` została wygenerowana przez Prisma migrate dev na odizolowanej bazie AI-node, a następnie uzupełniona o CHECK spójności jawnej kategorii z flagami i celowany UPDATE wyłącznie słownika OK. Jeśli OK nie istnieje, migracja go nie tworzy. Pozostałe typy, w tym NN, NU, NUN, NUP, UB, UO, UPP, ŚR i SZK, nie są automatycznie zmieniane.
- Nie ma UPDATE/DELETE/ALTER tabeli WorkTimeReport w nowej migracji. Żadne historyczne wpisy czasu nie są przepisywane.
- Nowe typy wymagają kategorii. API wyznacza zgodne flagi albo odrzuca sprzeczny payload. Edycja istniejącego typu może zachować NULL; istniejąca sprzeczna kombinacja nie jest normalizowana automatycznie, ale nie można nowo wprowadzić sprzeczności. Nie można wyczyścić już wybranej kategorii.
- Formularz ma wymagany wybór kategorii przy tworzeniu. Etykieta NULL to „Dotychczasowe zasady rozliczania”. Zmiana kategorii w edycji wymaga potwierdzenia ostrzeżenia o historii. Flagi zwracane przez backend nadal sterują istniejącym formularzem raportowania, kalendarzem i wyborem zlecenia.
- Wspólny predykat `orderHoursWhere` jest używany przez raport zleceń, jego XLSX/JSON/CSV, bazę zleceń, eksport bazy i orderowe statystyki dashboardu. Nieobecności, NN i jawne OFF_ORDER_WORK nie zwiększają tych sum.
- Kontrola rozliczenia dodaje osobne `offOrderHours` wyłącznie dla jawnej kategorii OFF_ORDER_WORK. Typy NULL / false / false (np. SZK) zachowują dotychczasową semantykę, w tym diagnostykę ujemnego wkładu. Nieobecność z historycznym order_id jest rozliczona tylko w absencjach. Nowy zapis/edycja takiej nieobecności ze zleceniem jest odrzucany; kopiowanie tworzy nowy rekord bez zlecenia, nie zmieniając źródła.
- Zakres procentu/odchylenia zleceń pozostaje narastający według reguł v0.5.7. Zadanie nie zmienia planowania zleceń ani kalendarza.

## Weryfikacja 16 godzin na kopii klienta

Wykonano wyłącznie SELECT z wymuszeniem `default_transaction_read_only=on`, przez SSH do `192.168.100.22` i kontener `worktime-dev-db`, z jawnym wyborem bazy **wtt_client_test**. Potwierdzono 5849 wpisów i 22 typy; OK ma `is_absence=false`, `requires_order=false`. Nie wyświetlano ani nie zapisywano danych osobowych.

| Miara październik 2026 | Stan kopii | Projekcja po poprawce |
|---|---:|---:|
| Wpisy OK / godziny | 2 / 16 h | 2 / 16 h |
| OK ze zleceniem | 0 | 0 |
| Godziny zleceń | 4016 h | 4016 h |
| Nieobecności rozliczone | 688 h | 704 h |
| Suma rozliczeniowa pracowników | 4720 h | 4720 h |
| Łącznie rozliczone | 4704 h | 4720 h |
| Różnica | -16 h | 0 h |

W całej kopii brak aktywnych wpisów `is_absence=true` ze zleceniem: **0 wpisów / 0 h**. Suma zleceń i pracowników jest o 3 h większa niż pierwotnie zgłoszona, ale różnica i jej przyczyna są identyczne.

Projekcja została policzona SQL-em bez zmiany słownika lub schematu kopii. Nie uruchamiano nowej wersji API na tej kopii i nie zastosowano do niej migracji. Faktyczne predykaty nowego kodu zweryfikowano niezależnie na PostgreSQL z fikcyjnymi danymi. Ostateczny test akceptacyjny na kopii po zatwierdzonym zastosowaniu migracji pozostaje krokiem przed produkcją.

Wpływ na raport miesięczny: `suma` godzin pracy zmniejsza się o 16 h, kolumna OK zachowuje 16 h, a `sumaBezNadgodzin` pozostaje bez zmiany (wcześniej OK już wchodziło do tej sumy jako czas niebędący nadgodzinami). Suma kontrolna pracowników również pozostaje bez zmiany. To koryguje nieprecyzyjny opis „wzrostu sumaBezNadgodzin” we wcześniejszym planie.

## Local QA

Jedyny pełny zestaw poleceń: `./scripts/qa.sh`, opisany w [docs/qa.md](../qa.md). Wymagany Node 22.22.1 i Docker. Skrypt instaluje lockfile, generuje klienta i waliduje Prisma, przygotowuje świeżą bazę z historycznym schematem i danymi słownika, stosuje nową migrację, uruchamia build/test backendu, frontend lint/build/test, docs:validate, actionlint i npm audit. TypeScript jest sprawdzany przez oba buildy. Backend nie ma skonfigurowanego ESLint; nie deklaruje się takiej kontroli.

Wynik pełnego lokalnego QA: **PASS**.

- Backend: **239/239**, 18 plików, bez pominiętych testów w trybie pełnego QA.
- Frontend: **143/143**, 11 plików.
- Backend/frontend build i frontend lint: PASS.
- Prisma generate/validate oraz test pustej bazy i upgrade: PASS.
- Docs validate: PASS, 19 pozycji manifestu.
- Actionlint 1.7.7: PASS; obraz przypięty digestem w skrypcie QA.
- Dodatkowo `npm run docs:screenshots`: **32/32** rzeczywiste testy przeglądarkowe na lokalnej fikcyjnej bazie `_docs`. Zaktualizowano dwa rzeczywiste zrzuty zmienionych ekranów i obejrzano ich wynik. To dodatkowa walidacja UI/dokumentacji; nie jest częścią wspólnego skryptu CI. Pozostałe wygenerowane, niezwiązane obrazy przywrócono.
- `git diff --check`, `bash -n` skryptów QA i instalatora runnera: PASS.

## Test coverage

Przypadki A–L są pokryte przez testy istniejące i nowe:

- OK 8 h oraz dwa dni / 16 h, standardowa praca, jawna nieobecność i OFF_ORDER_WORK: prawdziwy PostgreSQL (`accounting-postgres.test.ts`).
- Historyczna nieobecność z order_id nie zwiększa zlecenia; NN z historyczną flagą false i order_id nie zwiększa sum; rekord soft-deleted nie jest liczony. Typ SZK z NULL zachowuje ujemny wkład. Po usunięciu fikcyjnego SZK w transakcji reszta daje MATCHED, bez podwójnego naliczania.
- Raport miesięczny, okresy nieobecności, JSON zleceń, baza zleceń, dashboard i XLSX kontroli/orderów są sprawdzane na tej samej fikcyjnej transakcji PostgreSQL, która na końcu jest wycofywana.
- CSV i widoczny składnik OFF_ORDER_WORK sprawdzają testy frontendu; XLSX/JSON ma także istniejące testy wspólnych helperów i test prawdziwego PostgreSQL. Nie ma jednego testu na realnej kopii klienta obejmującego wszystkie formaty.
- API: obowiązkowa kategoria, wszystkie trzy kategorie, sprzeczne flagi, edycja starych typów i ochrona systemowych typów. UI: zapis kategorii, blokada zapisu bez potwierdzenia zmiany historycznej i potwierdzony zapis.
- Stare testy oczekujące dodatniego wkładu podwójnie liczonej nieobecności zostały zastąpione sprawdzeniem pojedynczego naliczenia. Ich niezależne, niespójne mocki sum zastąpiono współdzielonym fikcyjnym zestawem stosującym otrzymany predykat; rzeczywisty PostgreSQL dodatkowo kontroluje selekcję relacji.

## Migration validation

Wspólny QA wymaga Dockera i rzeczywistych testów bazodanowych; nie dopuszcza cichego pominięcia integracji. Lokalna baza QA jest świeża, na losowym porcie loopback, o osobnej nazwie kontenera. Testy historycznego upgrade i pustej instalacji tworzą dodatkowy kontener z unikalną nazwą oraz losowym portem, co eliminuje konflikt z FINNARO. Sprawdzono zachowanie starych rekordów i FK oraz korektę wyłącznie OK. Migracja ma nullable kolumnę bez domyślnego przypisywania pozostałych kategorii i constraint spójności wyłącznie jawnych kategorii.

## GitHub Actions

Workflow `.github/workflows/ci.yml`: PR do development/main i push do development/main. Docelowe `runs-on: [self-hosted, Linux, X64, wtt]`; brak GitHub-hosted runnera. Usługa PostgreSQL jest odizolowana, na losowym porcie 127.0.0.1. Workflow wywołuje ten sam `scripts/qa.sh`, ma `contents: read`, wyłączone utrwalanie credentials checkout, przypięte SHA akcji i limit czasu. Nie wymaga żadnych sekretów produkcyjnych ani dostępu do HomeLab.

## Self-hosted runner

Potwierdzono przez konfigurację lokalną, systemd i GitHub API:

| Właściwość | FINNARO — istniejący | WTT — przygotowany do instalacji |
|---|---|---|
| Nazwa | ai-node-finance | ai-node-wtt |
| Repo | jaroslawoleradzki-ctrl/finance-platform | jaroslawoleradzki-ctrl/workshop-time-tracking |
| Etykiety | self-hosted, Linux, X64, ai-node | self-hosted, Linux, X64, wtt — do rejestracji |
| Katalog | /home/cloud/actions-runner | /home/wtt-runner/actions-runner-wtt |
| Stan | online; usługa active | niezarejestrowany, nieuruchomiony |

FINNARO nie było rekonfigurowane/restartowane; usługa zachowuje PID 1856 i czas startu 2026-10-30 09:07:21 UTC. Suma jej jednostki systemd: `66061faf3f23e1949f23bad8136ceeb28a6edd6decf959cb655158505de35721`. Nie używano jego katalogu roboczego, baz ani kontenerów. Oddzielny QA używał własnych kontenerów i portów.

`ops/ci-runner/` zawiera instalator oficjalnego runnera 2.338.2 z SHA256, template osobnej usługi i instrukcję wymagającą nowego użytkownika bez sudo/grupy docker/kluczy klienta, własnego rootless Docker i zablokowanego dostępu do prywatnych podsieci. Brakuje `newuidmap`, a `sudo -n` wymaga uwierzytelnienia administratora. Nie obchodzono tego przez hostowy socket ani uprzywilejowany kontener. To konkretna blokada instalacji instancji i wykonania CI.

## Security checks

Npm audit jest rzeczywisty i jawny: backend **23 podatności (14 moderate, 8 high, 1 critical)**, frontend **23 (15 moderate, 8 high)**. Krytyczna pozycja dotyczy `proxy-addr`; obecne advisory i ich identyfikatory są raportowane przez skrypt. Baseline obejmuje zastane wyjątki high/critical, a nowe high/critical blokują QA. Zależności nie były aktualizowane poza zakresem poprawki; PASS tej bramki oznacza brak nowych wyjątków, nie brak podatności.

Repo WTT jest publiczne. Obecna polityka forków to `first_time_contributors`; nie zapewnia wymaganej ochrony dla każdego niezaufanego PR. Przed uruchomieniem runnera administrator musi zatwierdzić i zastosować wymóg akceptacji wszystkich zewnętrznych kontrybutorów oraz nie dopuszczać ich workflow do wykonania na tej instancji. Sam warunek w YAML nie stanowi granicy zaufania, bo PR może również zmienić workflow. [GitHub opisuje ryzyko publicznych self-hosted runnerów](https://docs.github.com/en/actions/reference/security/secure-use). Dedykowane konto/rootless Docker i ograniczenia sieci są konieczne, aby kod nie miał dostępu do poświadczeń `cloud`, produkcji ani danych innych projektów.

## Branch protection

Odczyt GitHub API nie wykazał rulesetów. `ops/ci-runner/branch-ruleset.json` jest szablonem do zatwierdzenia przez administratora: development/main wymagają PR, niezależnego review, akceptacji ostatniego push, rozwiązania dyskusji i zielonego `WTT QA`; blokuje force-push/usuwanie i nie ma bypass. Polityki repozytorium nie zostały zmienione automatycznie.

## CI execution results

**Nie ma wyniku PASS GitHub Actions.** Workflow jest przygotowany do uruchomienia na PR, ale nie ma zarejestrowanego dedykowanego runnera z etykietą `wtt`. Wynik lokalnego QA nie jest wynikiem Actions. Aktualny stan workflow można sprawdzić w [GitHub Actions WTT CI](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/workflows/ci.yml). Po rejestracji bezpiecznej instancji administrator musi odczytać rzeczywisty job i jego logi oraz potwierdzić PASS. Do tego czasu pełne kryterium zakończenia pozostaje niespełnione.

## Remaining risks

- CI nie wykona się bez dedykowanego runnera i zatwierdzonej polityki PR; nie można jeszcze uznać zadania za gotowe według bramki właściciela.
- Zastane podatności high/critical wymagają jawnej akceptacji baseline w review i osobnego planu usunięcia.
- Korekta OK świadomie zmieni historyczne wyniki raportów, ale nie rekordy czasu; nie zmieniać jednocześnie pozostałych słowników.
- Odizolowane testy potwierdzają kod i migrację, projekcja kopii klienta potwierdza przyczynę -16 h. Nie wykonano runtime testu nowego API po migracji na kopii klienta ani produkcji.
- Nowi klienci API muszą przesyłać kategorię przy tworzeniu typu; dotychczasowy POST bez kategorii zwraca 400. Nullable odczyt/edycja istniejących typów pozostaje obsługiwana.

## Weryfikacja na DEV i rollback przed produkcją

Po niezależnym review i zielonym CI: przygotować backup/migawkę konfiguracji typów i punkt odniesienia raportów na zatwierdzonej kopii. Zastosować migrację najpierw na odizolowanej kopii, uruchomić nową aplikację wyłącznie według osobnej zgody na wdrożenie, sprawdzić październik, OK=16 h, różnicę=0, sumy pracownika, XLSX/CSV i nowe trzy kategorie. Potwierdzić, że inne typy i rekordy czasu pozostają takie same. Istniejący DEV nie zawiera OK, więc nie odtworzy sam danych klienta; nie nadpisywać go kopią.

Rollback: przywrócić poprzedni kod tylko po ocenie nowo utworzonych OFF_ORDER_WORK; starszy kod nie rozlicza ich nowego koszyka. Pozostawić nullable kolumnę/enum zamiast DROP. Przywrócenie flag/kategorii OK wymaga zatwierdzonej decyzji i zapisanej wartości sprzed zmiany; nie modyfikować rekordów czasu. Nie wykonywano żadnego rollbacku/deploymentu w tym zadaniu.

## Zmienione pliki

Lista obejmuje implementację, regresje, QA/CI i dokumentację; dwa wcześniejsze raporty są dołączone bez zmian jako wejścia do review:

- `.github/actionlint.yaml`
- `.github/workflows/ci.yml`
- `.node-version`
- `CHANGELOG.md`
- `PROJECT_STATUS.md`
- `README.md`
- `backend/prisma/migrations/20261104090056_add_work_time_accounting_category/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/routes/analytics.ts`
- `backend/src/routes/orders.ts`
- `backend/src/routes/reports.ts`
- `backend/src/routes/work-time-types.ts`
- `backend/src/services/copy-last-day.ts`
- `backend/src/utils/excel-report.ts`
- `backend/src/utils/work-time-accounting.ts`
- `backend/tests/accounting-fixture.ts`
- `backend/tests/accounting-postgres.test.ts`
- `backend/tests/analytics.test.ts`
- `backend/tests/canonical-work-time-types.test.ts`
- `backend/tests/executable-database-migration.test.ts`
- `backend/tests/work-time-types.test.ts`
- `docs/architecture.md`
- `docs/business-rules.md`
- `docs/import-export-specification.md`
- `docs/qa.md`
- `docs/reviews/CUSTOM_WORK_TIME_TYPES_CHANGE_PLAN.md`
- `docs/reviews/REPORTING_CALCULATION_AUDIT_2026-11.md`
- `docs/reviews/WORK_TIME_ACCOUNTING_FIX_REPORT_2026-11.md`
- `docs/user-guide.md`
- `frontend/docs-screenshots/client-feedback.spec.ts`
- `frontend/public/help/administracja-01-slowniki.png`
- `frontend/public/help/raport-zlecen-02-kontrola.png`
- `frontend/src/components/DictionariesView.tsx`
- `frontend/src/components/ReportsView.tsx`
- `frontend/src/help/chapters.tsx`
- `frontend/src/test/DictionariesView.test.tsx`
- `frontend/src/test/ReportsView.test.tsx`
- `ops/ci-runner/README.md`
- `ops/ci-runner/branch-ruleset.json`
- `ops/ci-runner/install-runner.sh`
- `ops/ci-runner/wtt-runner.service.template`
- `scripts/qa.sh`
- `scripts/qa/dependency-audit.mjs`
- `scripts/qa/dependency-baseline.json`
- `scripts/qa/prepare-database.mjs`
