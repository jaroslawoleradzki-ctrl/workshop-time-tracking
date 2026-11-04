# Work time accounting fix — 2026-11

> Aktualny wynik końcowy CI (2026-11-04): ai-node-wtt ONLINE, osobna usługa cloud z systemowym Dockerem, Actions 41833334661 PASS. Poniższe wcześniejsze etapy rootless i blokady są historią; obowiązuje końcowa sekcja „Potwierdzone wykonanie”. Brak pełnej izolacji hosta został jawnie zaakceptowany przez właściciela.

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
- Dzienne sumy ewidencji w formularzu i ostrzeżenia limitów nadal sumują każdy zaraportowany rekord raz; nie są sumami pracy na zleceniach. Raport szczegółowy i kont zachowują surowe wiersze ewidencji.
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

**Nie ma wyniku PASS GitHub Actions.** Gałąź została wypchnięta po zatwierdzeniu commita przez właściciela; utworzono [draft PR #4](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/pull/4). Pierwszy rzeczywisty [run 41812403287](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/runs/41812403287) dla commita `0e61c44` został zaobserwowany w stanie **queued**, bez conclusion i bez wykonanych testów CI. Kolejne push mogą anulować poprzednią kolejkę zgodnie z concurrency; wymagany jest zielony run dla najnowszego HEAD PR. Workflow jest przygotowany do uruchomienia na PR, ale nie ma zarejestrowanego dedykowanego runnera z etykietą `wtt`. Wynik lokalnego QA nie jest wynikiem Actions. Aktualny stan workflow można sprawdzić w [GitHub Actions WTT CI](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/workflows/ci.yml). Po rejestracji bezpiecznej instancji administrator musi odczytać rzeczywisty job i jego logi oraz potwierdzić PASS. Do tego czasu pełne kryterium zakończenia pozostaje niespełnione.

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


## Kontynuacja: dedykowany runner AI-node — 2026-11-04

**Status: ZABLOKOWANE.** Nie zarejestrowano ani nie uruchomiono runnera WTT. GitHub API zwraca 0 runnerów repozytorium. Run [41812659006](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/runs/41812659006) pozostaje `queued`, job `WTT QA` nie wykonał żadnego kroku. Nie jest to wynik PASS. Commit opublikowany pozostaje `cd76089`, draft PR #4 istnieje; poniższe przygotowania infrastrukturalne są lokalnymi zmianami bez nowego commita/pusha.

### Potwierdzony stan hosta i blokada

AI-node / 192.168.100.29: Ubuntu 26.04.1, cloud UID 1000. Konto cloud należy do sudo i docker, ale `sudo -n true` wymaga uwierzytelnienia. Nie istnieje konto wtt-runner; brakuje newuidmap/newgidmap, slirp4netns i fuse-overlayfs. Dostępne są Docker 29.9.3, rootlesskit i skrypty dockerd-rootless; aktualny daemon hosta jest rootful. Profil AppArmor rootlesskit istnieje; nie wyłączano ograniczeń namespace ani AppArmor.

FINNARO: runner `ai-node-finance`, repo `jaroslawoleradzki-ctrl/finance-platform`, etykiety self-hosted/Linux/X64/ai-node, katalog `/home/cloud/actions-runner`. Usługa `actions.runner.jaroslawoleradzki-ctrl-finance-platform.ai-node-finance.service` nadal active, PID 1856, start 2026-10-30 09:07:21 UTC. Nie zmieniono konfiguracji, procesu, konta ani kontenerów FINNARO.

### Przygotowana konfiguracja — jeszcze niezastosowana

Docelowo `ai-node-wtt`, repo `jaroslawoleradzki-ctrl/workshop-time-tracking`, etykiety self-hosted/Linux/X64/wtt. Osobne konto i HOME `/home/wtt-runner`, katalog runnera `actions-runner-wtt`, własny rootless daemon/socket/storage. Osobna usługa wtt-runner.service, linger i autostart Docker; ograniczenia zapisu, maskowanie HOME cloud i rootful socketu, blokada prywatnych i metadata adresów, limity wyłącznie nowego user slice. Wewnętrzne zakresy rootless 10.0.2.0/24 oraz 10.250.0.0/16 wymagają kontroli kolizji i mają wyjątki tylko w nowym user managerze.

Dodano `ops/ci-runner/prepare-host.sh`, `verify-isolation.sh`, `probe-isolation.py`; uzupełniono README i template usługi. Skrypt przygotowania nie rejestruje runnera. Test izolacji wymaga działającego lokalnego punktu kontrolnego przed i po odmowie połączenia z nowego konta i kontenera; nie łączy się z HomeLab. Bez sudo nie wykonano tych testów runtime. Nie można potwierdzić izolacji samą analizą plików.

### Bezpieczeństwo publicznego repozytorium

Workflow ma triggers PR/push development i main, GITHUB_TOKEN contents:read, przypięte akcje i checkout bez utrwalania credentials. Repo API wykazało 0 sekretów repozytorium i 0 environments; nie jest to audyt wszystkich sekretów hosta/organizacji. Workflow odrzuca obce forki przed checkout, ale usługi joba są tworzone wcześniej, a YAML PR może się zmienić. Warunek YAML nie stanowi granicy bezpieczeństwa.

Polityka forków `first_time_contributors` wymaga zaostrzenia przez administratora do `all_external_contributors`. Nie zmieniono jej samodzielnie. Nawet po zmianie nie zatwierdzać niezaufanych workflow na tym hoście. Rootless Docker i osobne konto nie są izolacją równoważną osobnej maszynie: współdzielą kernel i zasoby hosta. Dla wykonywania dowolnego niezaufanego kodu potrzebna jest dodatkowa izolacja, np. odtwarzana VM z kontrolowanym egress, bez danych i poświadczeń innych projektów. Przygotowanie dotyczy wyłącznie przejrzanych, zaufanych gałęzi; dopóki testy izolacji i polityka nie zostaną zweryfikowane, nie uruchamiać workflow. Nie potwierdzono jeszcze braku możliwości dostępu do wszystkich usług hosta, w tym loopback; wymaga to kontroli runtime przed aktywacją.

### Wykonane kontrole

- bash -n, ShellCheck skryptów runnera: PASS.
- actionlint konfiguracji workflow: PASS.
- kontrola składni Python i odmowy uruchomienia instalatora/przygotowania z niewłaściwego konta: PASS.
- oficjalny pakiet runnera 2.338.2 pobrany do katalogu tymczasowego: SHA256 zgodne, Runner.Listener --version działa. Bez rejestracji i uruchomienia jobów.
- 414 testów aplikacji PASS to wcześniejszy wynik lokalnego QA; nie uruchamiano ich ponownie w tej kontynuacji infrastrukturalnej. Brak nowych wyników Actions.

### Następny wymagany krok

Administrator AI-node powinien przejrzeć przygotowane pliki i wykonać w terminalu hosta:

```bash
sudo bash /tmp/wtt-accounting-fix/ops/ci-runner/prepare-host.sh
```

To rzeczywista blokada uprawnień, nie problem aplikacji. Bez przesyłania haseł/tokenów do rozmowy. Dalsze kroki zatwierdzenia polityki, rejestracji i autostartu opisuje `ops/ci-runner/README.md`; nie włączać usługi przed zaakceptowaniem zabezpieczeń i weryfikacją izolacji. Następnie wymagane są ONLINE, rzeczywisty PASS wszystkich jobów PR #4 i ponowna kontrola FINNARO. Zadanie pozostaje nieukończone.


## Naprawa preflight Docker IPAM.Config — 2026-11-04

Docker network inspect może zwracać `IPAM.Config=null`; domyślna wartość `dict.get` nie zastępuje jawnego null. Preflight normalizuje teraz brak/null IPAM i Config do pustych kolekcji. Sprawdzanie rzeczywistych podsieci i odrzucanie kolizji pozostają aktywne.

Dodano 7 testów unittest wykonujących rzeczywisty fragment diagnostyczny prepare-host.sh z podmienionym wyłącznie subprocess.check_output: null, pusta lista, poprawne IPv4/IPv6, brak/null IPAM, kolizja po null, kolizja trasy hosta oraz brak sieci Docker. Sprawdzono, że przywrócenie starego wyrażenia w pamięci powoduje oczekiwany TypeError w teście regresyjnym. Testy są częścią scripts/qa.sh lokalnie i w Actions. Nie uruchamiają instalatora ani operacji administracyjnych.

Przegląd ops/ i scripts/: pozostałe użycia Docker JSON to docker info SecurityOptions filtrowane tekstowo; nie iterują po nullable polach. Iteracja po wyniku network inspect oczekuje listy zgodnej z kontraktem tego polecenia; odczyt tras hosta dotyczy JSON ip, nie Dockera.

Bieżące wyniki: pełne ./scripts/qa.sh PASS (exit 0), backend 239/239, frontend 143/143, preflight 7/7, build obu pakietów, ESLint, Prisma, migracje fresh/upgrade, walidacja Pomocy i actionlint PASS. Dodatkowo ShellCheck wszystkich skryptów runnera i bash -n PASS. Kontrola bezpieczeństwa zależności PASS względem jawnego baseline; nadal 23 podatności backendu (w tym 1 critical) oraz 23 frontendu. Log lokalny: /tmp/wtt-prepare-host-qa.log, nie jest artefaktem Git.

W tej kontynuacji nie wykonano sudo, instalacji systemowej, rejestracji runnera, zmian FINNARO ani dostępu do HomeLab. Poprawka instalatora jest zweryfikowana lokalnie; instalacja i izolacja runtime nadal wymagają administratora. Commit obejmuje również znane, wcześniej niezatwierdzone pliki przygotowania runnera z poprzedniej kontynuacji. Nie wykonano push, merge ani deploymentu. Brak nowego wyniku GitHub Actions.


## Kontynuacja po uruchomieniu rootless Docker — 2026-11-04

**Stan instalacji: nadal ZABLOKOWANE przed rejestracją/aktywacją GitHub runnera.** Konto wtt-runner istnieje (UID/GID 1001), ma wyłącznie własną grupę. Procesy RootlessKit, dockerd i containerd działają jako to konto; RootlessKit ma --disable-host-loopback. User manager active. Potwierdzenie SecurityOptions name=rootless i socketu /run/user/1001/docker.sock pochodzi od administratora; bezpośrednia próba odczytu jako cloud jest odrzucana, sudo -n -u wtt-runner wymaga uwierzytelnienia. Nie obchodzono tych ograniczeń.

Systemowy daemon działa jako root, SecurityOptions bez rootless, storage /srv/docker, socket /var/run/docker.sock root:docker 660. Rozdzielenie kont i procesów jest potwierdzone; pełne porównanie storage/kontenerów oraz negatywne testy WTT wymagają uruchomienia przygotowanej diagnostyki przez administratora. Nie można jeszcze zadeklarować pełnej izolacji runtime.

Odczyt systemctl user@1001: ProtectSystem=strict, ReadWritePaths obejmuje własne HOME, runtime oraz /tmp; maski /home/cloud, /root, /srv, /tank, /var/lib/docker i rootful socketu; deny zakresów prywatnych/metadata z wyjątkami wyłącznie dla własnych sieci rootless. PrivateTmp=no — /tmp pozostaje współdzielone. Nie zmieniono ustawień hosta. FINNARO nadal active z PID 1856, bez ingerencji. wtt-runner.service inactive, GitHub API 0 runnerów WTT. Polityka forków nadal first_time_contributors; administrator musi zatwierdzić jej zaostrzenie przed aktywacją. CI YAML pozostaje bez zmian, self-hosted/Linux/X64/wtt, contents:read, bez dostępu do infrastruktury klienta.

### Zmiany instalatora

- Osobny testowalny prepare-host-functions.sh: jawny właściciel obu poziomów .config, wykrywanie działającego rootless bez reinstalacji/restartu, start istniejącej zatrzymanej usługi bez reinstalacji, weryfikacja po starcie, odmowa daemonu innego niż rootless.
- Dostęp /tmp w ReadWritePaths user managera. Kontrola możliwości utworzenia i usunięcia własnego pliku tymczasowego oraz właściciela .config w verify-isolation.sh.
- Zachowanie istniejącego daemon.json, pominięcie apt przy komplecie pakietów. Brak automatycznego restartu aktywnych usług i brak przepisywania rejestracji runnera.
- probe-isolation.py przekazuje DOCKER_HOST jawnie przez systemd-run --setenv; środowisko klienta systemd-run nie jest automatycznie środowiskiem uruchamianego joba.
- 9 nowych testów regresyjnych, razem 16: działający rootless, odmowa rootful, start istniejącej usługi i pierwsza instalacja (sukces/porażka), właściciel katalogów, /tmp, zachowanie daemon.json. Polecenia systemowe zastępowane wyłącznie w testach; bez sudo i instalacji.

### Wyniki i ograniczenia

Pełne lokalne ./scripts/qa.sh zakończone exit 0: backend 239, frontend 143, Prisma, migracje fresh/upgrade, oba buildy, lint, walidacja Pomocy, actionlint, kontrola zależności względem dotychczasowego baseline. Finalne testy preflight 16/16 PASS; ShellCheck -x wszystkich skryptów runnera i bash -n PASS. Przy pierwszym ShellCheck wykryto adnotację source i zakres zmiennych; skorygowano je i ponowna kontrola przeszła. Log pełnego QA: /tmp/wtt-runner-rerun-qa.log. Istniejące podatności zależności nie zostały usunięte.

Nie instalowano ponownie Dockera, nie wykonywano prepare-host.sh ani rejestracji, nie zmieniano FINNARO lub baz HomeLab. Nie pobrano tokenu rejestracyjnego. Nie wykonano merge, deploymentu ani nowego push/commita. Zmiany pozostają w bieżącej gałęzi roboczej po ee8122f; origin nadal cd76089.

Następny krok administratora: przejrzeć zmiany i wykonać etap A z ops/ci-runner/README.md (`sudo bash /tmp/wtt-accounting-fix/ops/ci-runner/prepare-host.sh`), który teraz zachowuje działający rootless Docker. Jeżeli izolacja runtime ma PASS i aktywne polityki odpowiadają wymaganiom, zatwierdzić politykę GitHub i wykonać opisane etapy B/C bez przekazywania sekretów do rozmowy. Następnie wymagane ONLINE i rzeczywisty PASS Actions. Samo uruchomienie Docker nie spełnia kryterium zakończenia całego zadania.


## Finalizacja testu dostępu do systemowego Engine — 2026-11-04

**Pełna izolacja: BLOCKED. Gotowość do rejestracji: NIE.** Usunięto błędny warunek `! -S /var/run/docker.sock`: widoczność socketu nie oznacza dostępu. Nowy system_docker_access.py wymaga jawnej odmowy uprawnień z klienta Docker oraz EACCES/EPERM z niezależnego połączenia AF_UNIX. Połączenie skuteczne to FAIL; błędy klienta, timeout, odmowa połączenia przez niedziałający daemon, brak socketu i błędne DOCKER_HOST/context/TLS to BLOCKED. Orkiestrator dodatkowo wymaga odpowiedzi systemowego Engine przed i po próbie WTT. Nie zmieniono uprawnień socketu ani konfiguracji Dockera.

probe-isolation.py nie uruchamia już własnego serwera na losowym porcie. Wymaga działającego punktu 192.168.100.29:8765; kontroluje go z kontekstu administratora przed i po systemd-run --user dla wtt-runner. verify-isolation.sh nie wypisuje samodzielnie pełnego PASS. Dodano rozróżnienie technicznych błędów bind mount/kontenera; ogólny błąd nie stanowi dowodu izolacji. Udany bind chronionego HOME lub połączenie sieciowe powoduje FAIL. Instalator kopiuje nowy moduł diagnostyczny; dotychczasowe poprawki ponawiania przygotowania z poprzedniej sesji są zachowane.

### Faktycznie wykonane sprawdzenia hosta

- Tożsamość: wtt-runner UID/GID 1001, wyłącznie grupa wtt-runner.
- Systemowy Docker odpowiada na odczyt info z uprawnionego konta cloud. Nie zmieniano konfiguracji ani danych.
- Serwer kontrolny 192.168.100.29:8765 osiągalny z cloud. Nie uruchamiano ani nie zatrzymywano serwera.
- Próba `sudo -n python3 .../probe-isolation.py` zatrzymana: interactive authentication is required. Kontrole administratora oraz user-systemd NIE zostały wykonane. Nie deklarujemy PASS na podstawie samej osiągalności z cloud.
- FINNARO active, MainPID 1856, bez restartu lub zmian.
- Rootless, pull/start alpine, odmowa systemowego Engine jako WTT, bind chronionych katalogów i filtracja sieci z WTT wymagają jeszcze rzeczywistego pełnego testu. Potwierdzenia administratora z opisu zadania nie zastępują wykonania nowej wersji testu.

### Testy i pliki

30 regresji skryptów PASS (7 sieci Docker, 9 ponawiania, 10 systemowego Engine, 4 kontroli A/B). Obejmują wymaganą odmowę dostępu, sukces połączenia, błąd klienta, timeout, błędny host, zanik serwera oraz wymóg user-systemd. Testy używają kontrolowanych odpowiedzi procesów/socketów; nie stanowią rzeczywistego PASS izolacji hosta. ShellCheck -x i bash -n PASS. Pełne lokalne QA: backend 239, frontend 143, oba buildy, lint, Prisma, migracje fresh/upgrade, walidacja Pomocy, actionlint i baseline zależności PASS. Zastane podatności pozostają jawne. Log: /tmp/wtt-isolation-final-qa.log.

Zmiany bieżące oraz zatwierdzane zaległe poprawki tej samej diagnostyki: CHANGELOG.md, PROJECT_STATUS.md, niniejszy raport, ops/ci-runner/.gitignore, README.md, prepare-host.sh, prepare-host-functions.sh, probe-isolation.py, verify-isolation.sh, system_docker_access.py, tests/test_prepare_host_rerun.py, tests/test_isolation_controls.py, tests/test_system_docker_access.py. Nie zmieniano kodu biznesowego, YAML workflow ani polityki GitHub. Commit używa dokładnej wcześniej zatwierdzonej wiadomości. Bez push, rejestracji, merge i deploymentu.

### Dokładny następny krok

Administrator po review kopiuje wyłącznie dwa aktualne pliki diagnostyczne i uruchamia kontroler; nie musi ponownie wykonywać prepare-host.sh:

```bash
sudo install -o wtt-runner -g wtt-runner -m 700 \
  /tmp/wtt-accounting-fix/ops/ci-runner/verify-isolation.sh \
  /tmp/wtt-accounting-fix/ops/ci-runner/system_docker_access.py \
  /home/wtt-runner/
sudo python3 /tmp/wtt-accounting-fix/ops/ci-runner/probe-isolation.py
```

Kontroler sam przełącza test do systemd użytkownika WTT. Nie uruchamiać verify-isolation przez sudo bash jako root. Gdy punkt kontrolny nie działa, wynik BLOCKED; instrukcja bezpiecznego serwera na pustym katalogu znajduje się w ops/ci-runner/README.md. Rejestracja możliwa dopiero po pełnym PASS oraz osobnym spełnieniu wymagań publicznego repozytorium. W ramach tej sesji nie zmieniono polityki i nie pozyskano tokenu.


## Aktualna decyzja CI: systemowy Docker — 2026-11-04

Właściciel zastąpił wcześniejszą architekturę rootless: zaufane repo/workflow WTT, osobny runner i katalogi, konto cloud oraz istniejący systemowy Docker. Zaakceptowano brak pełnej izolacji bezpieczeństwa. Wcześniejsze raporty i blokady rootless są historyczne; konfiguracji, konta i usług rootless nie usunięto ani nie restartowano. Nie zmieniono systemowego Docker Engine, socketu, grup ani polityki GitHub.

Potwierdzono cloud z istniejącą grupą docker, systemowy Engine 29.9.3, aktywny user systemd i Linger=yes. FINNARO jest osobną usługą systemową pod cloud, PID 1856, online jako ai-node-finance. WTT ma własne /home/cloud/actions-runner-wtt, _work, home, _tool; pakiet 2.338.2 ze zweryfikowanym SHA256. Rejestracja ai-node-wtt zakończyła się sukcesem przez istniejącą autoryzację gh i krótkotrwały token tylko WTT przekazany przez stdin. Nie odczytywano credentials FINNARO. Własny HOME i wyczyszczone środowisko ograniczają przypadkowe użycie konfiguracji innych projektów, ale nie są granicą dostępu przy tym samym UID i rootful Engine.

Nowa usługa user-systemd wtt-system-runner.service jest niezależna od systemowej usługi FINNARO i od pozostawionej nieaktywnej wtt-runner.service. Istniejący linger zapewnia autostart bez sudo. Workflow zachowuje etykietę wtt, contents:read i wspólne QA; wymaga RUNNER_NAME=ai-node-wtt, cloud, własnego workspace i systemowego socketu. Warunek zaufania PR jest na poziomie joba przed inicjalizacją PostgreSQL; forki nie wykonują joba. Nie zmieniono globalnej polityki GitHub.

Lokalne QA na systemowym Dockerze: PASS, exit 0, 30 testów skryptów, backend 239, frontend 143, oba buildy, lint, Prisma, migracje fresh/upgrade, integracje, docs:validate, actionlint oraz audyt zależności względem jawnego baseline. ShellCheck nowego instalatora PASS. Istniejące podatności nadal raportowane. Log /tmp/wtt-system-runner-qa.log. Nazwy kontenerów WTT mają własne prefiksy i PID, porty są losowe na loopback; brak współdzielonych wolumenów/Compose i dostępu do HomeLab.

Na moment przygotowania tej rewizji: runner zarejestrowany, jeszcze nieuruchomiony; Actions nie ma potwierdzonego PASS nowej konfiguracji. Kolejność: commit/push dostosowanego workflow, start usługi WTT, weryfikacja ONLINE i rzeczywistego runu PR #4, aktualizacja wyniku. Nie wykonano merge/deploymentu/release i nie zmieniono wersji aplikacji.

Pliki tej decyzji: .github/workflows/ci.yml, ops/ci-runner/install-system-runner.sh, ops/ci-runner/wtt-system-runner.service, ops/ci-runner/README.md, docs/qa.md, README.md, CHANGELOG.md, PROJECT_STATUS.md, niniejszy raport; dołączono historyczne dokumenty docs/ci z oznaczeniem zastąpienia decyzji. Szczegóły rejestracji i bezpiecznego rollbacku usługi WTT w instrukcji runnera.


## Potwierdzone wykonanie na ai-node-wtt — 2026-11-04

**Wynik: PASS.** Repozytorium WTT ma runner ai-node-wtt ONLINE, etykiety self-hosted/Linux/X64/wtt. Job API potwierdza runner_name=ai-node-wtt, grupa Default. Usługa użytkownika cloud wtt-system-runner.service active/enabled, PID 3172405. Jednostka: /home/cloud/.config/systemd/user/wtt-system-runner.service, instalacja /home/cloud/actions-runner-wtt, własne _work, home i _tool. cloud ma istniejący Linger=yes. Zapewniono konfigurację autostartu, ale nie restartowano całego hosta w celu jej testowania.

Run [41833334661](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/runs/41833334661) dla PR #4 i commita 68fe1fddfbc3f85796d94c22fb9897ece69f3dc7: completed/success. Job WTT QA 126585817627: success. Wszystkie etapy przeszły: setup, inicjalizacja PostgreSQL, kontrola runnera/systemowego Docker, checkout, Node, pełne QA, post actions i stop containers. W logu 30 testów skryptów, 239 backendu i 143 frontendu; migracje fresh/upgrade, integracje, oba buildy, frontend lint, Prisma, docs:validate, actionlint i kontrola zależności względem baseline PASS. Nie jest to wynik Playwright ani usunięcia zastanych podatności. Lokalny QA ma ten sam zakres i również exit 0.

Stare oczekujące runy 41812659006 i 41812403287 zostały anulowane przez istniejącą concurrency po push nowej rewizji. Runner wystartował dopiero po publikacji nowej konfiguracji. Gałąź fix/work-time-accounting-2026-11 wypchnięta do GitHub; PR #4 pozostaje draft, bez merge. Kolejny commit dokumentacji zapisuje niniejsze rzeczywiste wyniki; jego workflow należy odrębnie sprawdzić po push.

FINNARO: systemowa usługa active, PID 1856, bez zmian konfiguracji, konta i katalogów; runner nadal oddzielny. Nie używano jego credentials ani katalogu roboczego. Nie zmieniono Engine/socketu/grup, globalnej polityki Actions, produkcji, baz HomeLab, DEV/DEMO ani wersji aplikacji. Rootless i konto wtt-runner pozostawiono nietknięte i nie są wykorzystywane przez WTT CI.

Pozostałe ograniczenia: oba runnery dzielą UID cloud i uprzywilejowany Engine, kernel i zasoby; nie ma pełnej separacji dostępu do danych hosta. Ten model jest zaakceptowaną decyzją właściciela i dotyczy tylko zaufanych workflow. Job-level gate odrzuca forki, ale kod/YAML może zmienić uprawniony współpracownik; wymagany review. Branch protection/rulesets nie zmieniono automatycznie. Nadal potrzebny niezależny review poprawki rozliczeń i decyzja administratora o ochronie gałęzi. Autostart po rzeczywistym restarcie hosta pozostaje do potwierdzenia w uzgodnionym oknie. Żaden z tych punktów nie został ukryty jako wynik testu izolacji rootless.
