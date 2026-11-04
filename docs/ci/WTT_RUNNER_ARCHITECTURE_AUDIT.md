> Dokument historyczny. Późniejsza decyzja właściciela: osobny runner WTT jako cloud z systemowym Dockerem, bez pełnej izolacji. Aktualna konfiguracja: ops/ci-runner/README.md. Rootless zachowano i nie jest używany przez nowe CI.

# Audyt architektury lokalnego CI WTT

Data: 2026-11-04. Host: AI-node, Ubuntu Server 26.04 LTS. Katalog `/tmp/wtt-accounting-fix`, gałąź `fix/work-time-accounting-2026-11`, HEAD `b572fd73c1224144ffa65e6daab25b3549a8dee0`. Origin gałęzi wskazuje `cd76089`; lokalne commity nie zostały wypchnięte. Przed audytem working tree był czysty. Osobna gałąź wynika z zatwierdzonego zakresu zadania. Wersja pakietów aplikacji: 0.6.2.

## Wniosek

**Rekomendacja: A — naprawa obecnego rootless Docker, z ograniczonym czasem diagnostyki i bez nowych komponentów.** Zachować istniejące konto, daemon, socket, osobny workdir i workflow. Naprawić komunikację uruchamiania kontenerów z właściwym systemd użytkownika WTT. Nie kopiować uprawnień konta FINNARO i nie przechodzić automatycznie na wspólny rootful Docker.

To rekomendacja architektury, a nie potwierdzenie sprawnego CI. Obecny rootless Docker nie spełnia wymagań: daemon odpowiada, ale start kontenera kończy się błędem cgroups/autoryzacji. Rejestracja WTT pozostaje wstrzymana do sprawnego startu kontenerów, pełnego PASS izolacji oraz spełnienia warunków obsługi publicznego repozytorium.

## Metoda i ograniczenia

Wykonano wyłącznie odczyty repozytorium, parametrów systemd, wybranych metadanych instalacji runnera i GitHub API, kontrolerów cgroup oraz diagnostyki WTT z journala. Nie czytano plików credentials runnera, sekretów ani danych klienta. Początkowy odczyt `.runner` wymagał poprawienia dekodowania UTF-8 BOM; odczytano następnie wyłącznie nazwę, URL repozytorium i nazwę workdir.

Nie wykonano sudo, instalacji, uruchamiania kontenerów, zmian usług, rejestracji, zmian polityki GitHub, merge ani deploymentu. Nie uruchamiano ponownie QA: audyt nie zmienia kodu i nie jest próbą naprawy runtime. Wyniki wcześniejszych testów nie dowodzą sprawności rootless WTT. Brak dostępu do prywatnego HOME/runtime WTT jako cloud ogranicza bezpośredni odczyt konfiguracji jego user service; dokładne ustawienia i środowisko procesu wymagają późniejszej weryfikacji przez administratora.

## 1. Działający model FINNARO

| Element | Potwierdzony stan |
|---|---|
| Repozytorium | `jaroslawoleradzki-ctrl/finance-platform` |
| Runner i etykiety | `ai-node-finance`; `self-hosted`, `Linux`, `X64`, `ai-node`; GitHub API: online |
| Katalog / workdir | `/home/cloud/actions-runner`, `_work` |
| Konto | `cloud`, UID 1000; grupy obejmują `docker` i `sudo` |
| Instalacja | Standardowa rozpakowana dystrybucja runnera, obecne `svc.sh`, `.runner`, `.service`; usługa uruchamia `runsvc.sh`. To dowód układu instalacji, nie dowód historycznej komendy instalacyjnej |
| Usługa | `actions.runner.jaroslawoleradzki-ctrl-finance-platform.ai-node-finance.service`, active, PID 1856 |
| Systemd | `User=cloud`, `WorkingDirectory=/home/cloud/actions-runner`, `After=network-online.target`, `KillMode=process`, `KillSignal=SIGTERM`, `TimeoutStopSec=5min`, `WantedBy=multi-user.target` |
| Ograniczenia usługi | `ProtectSystem=no`, `NoNewPrivileges=no`, brak dedykowanych ReadWritePaths; nie stwierdzono sandboxu podobnego do przygotowanego dla WTT |
| Docker | Systemowy socket `root:docker`, 660; konto cloud uzyskuje dostęp przez grupę docker |

GitHub workflow odczytano z domyślnej gałęzi FINNARO przez API, nie z workdir aktywnego joba:

- `ci.yml`: PR, push i workflow_dispatch; joby na `[self-hosted, Linux, X64, ai-node]`, PostgreSQL 16 jako service, testy pytest i npm, lint/build, joby Docker/buildx i walidacja Compose.
- `docs-guard.yml`: PR/push/dispatch, ten sam zestaw etykiet, kontrole dokumentacji i secret scan.
- `s0-quality-gate.yml`: push/dispatch, ten sam runner, PostgreSQL, testy backendu/frontendu, kontrole zależności i Docker/Compose.

Ostatnie odczytane uruchomienia docs-guard i S0 quality gate zakończyły się success. Nie audytowano bezpieczeństwa całego FINNARO i nie zmieniono jego konfiguracji. Model działa operacyjnie, ale nie należy traktować go jako wzorca izolacji od innych danych hosta.

## 2. Wymagania WTT

Źródła: `.github/workflows/ci.yml`, `scripts/qa.sh`, `scripts/qa/prepare-database.mjs`, `backend/tests/executable-database-migration.test.ts`, `backend/tests/accounting-postgres.test.ts`, package.json obu pakietów i pliki Compose.

### Wykonanie workflow

Workflow wymaga `[self-hosted, Linux, X64, wtt]`, działa na PR/push do development i main, ma `contents:read`, przypięte akcje checkout/setup-node i checkout bez utrwalania credentials. Node 22.22.1 jest wskazany przez `.node-version`. Job wymaga Python 3, npm, Docker i dostępu do publicznych rejestrów. Uruchamia ten sam `./scripts/qa.sh` co lokalnie.

Zależności wykonania kontenerowego są trzy:

1. PostgreSQL 15 service workflow, jednorazowa baza, losowy port na 127.0.0.1. Lokalny QA tworzy analogiczny kontener, gdy nie podano portu usługi.
2. Test `executable-database-migration.test.ts` niezależnie tworzy PostgreSQL 16, własne bazy fresh/upgrade, odpala migracje i seed, a potem usuwa swój kontener. Samo dostarczenie PostgreSQL 15 nie usuwa tej zależności od Docker CLI.
3. `scripts/qa.sh` uruchamia przypięty obraz actionlint przez Docker z repozytorium zamontowanym read-only.

Skrypt przygotowania QA odmawia pracy na niepustej bazie. Integracje accounting używają dedykowanego URL loopback i fikcyjnych danych. WTT nie potrzebuje dostępu do HomeLab, DEV, DEMO ani kopii klienta.

### Backend i frontend

Backend: Node/TypeScript, Express, Prisma 5.x, PostgreSQL, Vitest/Supertest oraz biblioteki eksportów; build sprawdza TypeScript. Nie ma osobnego backend lint. Frontend: React/Vite/TypeScript, ESLint, Vitest/Testing Library/happy-dom. Testy jednostkowe frontendu nie wymagają kontenera ani uruchomionego backendu. `docs:validate` sprawdza istniejące zasoby Pomocy bez przeglądarki; nie jest wykonaniem testów Playwright ani generowaniem zrzutów. Playwright występuje w osobnym `docs:screenshots`, poza standardowym QA.

### Docker Compose

Repo zawiera `docker-compose.yml` i `docker-compose.homelab-dev.yml`: PostgreSQL, backend, frontend, trwały wolumen danych, porty i zmienne dla środowisk aplikacji. **Obecny workflow i pełne QA nie uruchamiają Compose ani stosu aplikacji.** Compose jest potrzebny do odtworzenia/deploymentu tych środowisk, a nie do aktualnej bramki testowej. Nie należy uruchamiać stosów DEV/DEMO w CI ani używać ich wolumenów. Składni Compose w tym audycie nie walidowano z rzeczywistym środowiskiem/sekretami.

### Czy można bez Dockera?

Częściowo tak: testy skryptów Python, frontend, buildy, lint, Prisma validate/generate, kontrola zależności i większość mockowanych testów backendu. **Pełne obecne QA — nie.** Wymaga przynajmniej PostgreSQL i zmiany trzech wymienionych ścieżek kontenerowych.

Wariant C wymagałby natywnego, własnego klastra PostgreSQL dla WTT, zarządzania jednorazowymi bazami fresh/upgrade, refaktoryzacji testu migracji, zamiany obrazu actionlint na weryfikowany lokalny program oraz zmiany workflow/skryptu QA. Trzeba jawnie zdecydować o zachowaniu pokrycia PostgreSQL 15/16. Nie wolno uzyskać pozornego sukcesu przez brak Docker i pominięcie integracji; WTT_QA_REQUIRED oraz wymagane testy mają nadal blokować niepełne QA. Użycie istniejącej współdzielonej bazy hosta nie spełnia tego wariantu.

## 3. Ustalony problem rootless

Potwierdzenie administratora: UID 1001, własna grupa, HOME i socket, name=rootless, lecz `docker run alpine:3.21 true` zwraca 125. Audyt nie uruchamiał ponownie tego polecenia.

Journal użytkownika 1001 z 12:31 i 12:32 potwierdza: tworzenie kontenera dochodzi do OCI/runc i próby utworzenia `docker-…scope`; zastosowanie cgroup kończy się odmową wymagającą interaktywnej autoryzacji. To rzeczywisty błąd uruchamiania kontenera, nie błąd samego testu niewidoczności socketu.

`user@1001.service` ma Delegate=yes, ProtectSystem=strict, zapisy do własnego HOME/runtime i /tmp, maskowanie katalogów cloud/danych hosta/socketu oraz blokady prywatnych zakresów IP. Cgroup user managera udostępnia kontrolery `cpu memory pids`. Nie można więc bez dodatkowych danych uznać, że przyczyną jest po prostu brak Delegate=yes. Ostrzeżenia odczytu `/proc/1/cgroup` również występują w logu, ale nie udowadniają źródła odmowy autoryzacji.

**Hipoteza do weryfikacji:** runtime kontenera komunikuje się z niewłaściwym systemd/D-Bus albo traci właściwy kontekst user managera w istniejącym sandboxie. Należy sprawdzić środowisko i bus faktycznego daemonu/containerd/runc oraz delegację docker.service, zamiast dodawać ogólną regułę polkit lub wyłączać zabezpieczenia. Dokładna poprawka nie jest jeszcze potwierdzona.

Docker zaleca zarządzanie rootless przez usługę systemd użytkownika; cgroups wymagają poprawnej współpracy systemd i cgroup v2. Źródła: [Rootless tips](https://docs.docker.com/engine/security/rootless/tips/), [Rootless troubleshooting](https://docs.docker.com/engine/security/rootless/troubleshoot/). Sam odpowiadający daemon nie weryfikuje tej ścieżki tworzenia kontenerów.

## 4. Porównanie wariantów

| Kryterium | A: naprawa rootless | B: systemowy Docker | C: bez Dockera |
|---|---|---|---|
| Bezpieczeństwo hosta | Własne UID/daemon/socket; zachowuje bariery dostępu, lecz wspólny kernel pozostaje | Dostęp do wspólnego rootful Engine daje możliwość działania z uprawnieniami roota; osobne konto i nazwy kontenerów nie chronią FINNARO | Bez socketu Docker; nadal wykonuje kod na hoście i wymaga osobnej bazy/ograniczeń plików i sieci |
| Prostota teraz | Najmniej zmian w QA; jedna niesprawna ścieżka systemd/cgroups do ustalenia | Technicznie szybki start, ale wymaga usunięcia założeń izolacji i zmiany workflow; nie spełnia wymaganej separacji | Mniej runtime kontenerowego, więcej zmian skryptów i utrzymania PostgreSQL |
| Niezależność od FINNARO | Oddzielny daemon, storage i UID; współdzieli CPU/RAM/dysk/kernel | Wspólny daemon i obiekty; WTT może usuwać lub modyfikować zasoby FINNARO | Własny user/workdir i klaster możliwe bez wspólnego Engine; host i zasoby nadal wspólne |
| Utrzymanie | Aktualizacja runnera/Dockera i jednoznaczny runbook user-systemd | Mniej daemonów, ale duży wspólny obszar awarii i uprzywilejowany dostęp | Natywne PostgreSQL, bazy fresh/upgrade, procesy/porty i actionlint zarządzane osobno |
| Zgodność obecnego workflow | Najwyższa, po naprawie i testach runtime | Postgres/testy mogą działać, ale rootless guard i założenie braku dostępu do Engine celowo odrzucą wariant | Brak zgodności: service, guard, skrypt QA, test migracji i actionlint wymagają zmian |
| Ocena | **Rekomendowany warunkowo** | **Odrzucony dla obecnych wymagań** | Technicznie możliwy, obecnie nie jest najmniejszą zmianą |

Dostęp do grupy docker daje uprawnienia na poziomie roota według [dokumentacji Docker](https://docs.docker.com/engine/install/linux-postinstall/). Reguły systemd dotyczące samego procesu runnera nie ograniczą uprawnień wspólnego uprzywilejowanego daemonu wykonującego jego żądania. Dlatego B nie można uznać za bezpieczny odpowiednik A bez zmiany założeń właściciela.

## 5. Publiczne repozytorium i granice bezpieczeństwa

WTT jest publiczne. Sam rootless Docker ani dedykowany użytkownik nie czynią hosta bezpiecznym do wykonywania dowolnego niezaufanego kodu. GitHub ostrzega przed self-hosted runnerami w publicznych repozytoriach: [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).

Istniejący warunek odrzucenia forków jest krokiem joba, po inicjalizacji service, i może zostać zmieniony w YAML PR. Nie jest niezależną granicą zaufania. Poprzednio stwierdzona polityka `first_time_contributors` nie jest wystarczającą zgodą na uruchamianie niezaufanych PR; w tym audycie nie zmieniano ani ponownie nie potwierdzano tego ustawienia. Wdrożenie wymaga przeglądu i zatwierdzenia polityki przez administratora oraz wykonywania wyłącznie zaufanych, przejrzanych zmian. Nie potrzeba do tej naprawy nowej orkiestracji, proxy Dockera czy dodatkowych daemonów. Jeśli wymaganiem stanie się automatyczne wykonywanie dowolnych zewnętrznych PR, żaden z trzech wariantów w opisanej postaci nie daje wystarczającej gwarancji na współdzielonym AI-node — należy wtedy zatrzymać aktywację i wrócić po decyzję, zamiast osłabiać ochronę.

## 6. Plan wdrożenia A — maksymalnie pięć kroków

1. **Punkt przywracania i diagnostyka tylko WTT.** Administrator zachowuje kopie konfiguracji WTT z właścicielami/trybami, stan usług i kontrolny stan FINNARO. Sprawdza user docker.service, środowisko runtime, właściwy user bus oraz delegację. Wyznaczyć do 1–2 h na ustalenie konkretnej przyczyny. Nie zmieniać globalnego user@.service, systemowego Dockera, polkit ani FINNARO. Jeśli nie da się wskazać poprawki ograniczonej do WTT, zatrzymać wdrożenie i przedstawić dowody; nie przełączać automatycznie na B.
2. **Jedna celowana poprawka i test kontenera.** Naprawić potwierdzony problem wyłącznie w jednostce/środowisku WTT lub jego drop-in dla UID 1001. Zachować rootless, ochronę danych i blokady sieci; nie reinstalować działającego daemonu, nie wyłączać cgroups ani autoryzacji. Jeśli potrzeba, restartować wyłącznie usługę WTT po uzgodnieniu okna. Warunek wyjścia: alpine:3.21 true kończy się 0 i jednorazowy PostgreSQL działa. Rollback: przywrócić kopię zmienionych plików WTT, przeładować jednostki i zrestartować wyłącznie dotkniętą usługę WTT; runner nadal niezarejestrowany.
3. **Izolacja i pełna równoważność QA.** Uruchomić istniejący test izolacji przez systemd użytkownika WTT z kontrolą administratora przed/po na 192.168.100.29:8765. Wymagać pełnego PASS: odmowa systemowego Engine, ochrona cloud/bindów, sieć, pull/start. Uruchomić wspólne scripts/qa.sh jako WTT na jednorazowych bazach, w tym migracje. Sprawdzić działanie usługi PostgreSQL GitHub Actions na rootless, a nie tylko ręczne docker run. Każdy FAIL/BLOCKED zatrzymuje aktywację; nie usuwać testów. Rollback jak w kroku 2, cleanup wyłącznie identyfikowalnych zasobów testowych WTT.
4. **Kontrolowana rejestracja i jedno wykonanie CI.** Po PASS i zatwierdzeniu polityki publicznych PR zarejestrować ai-node-wtt dla repo WTT, etykiety self-hosted/Linux/X64/wtt, własny workdir i autostart. Token tylko w terminalu. Opublikować zatwierdzone zmiany potrzebne PR, uruchomić przejrzany PR #4 i wymagać rzeczywistego PASS wszystkich kontroli. Rollback: zatrzymać/wyłączyć wyłącznie usługę runnera WTT; w razie potrzeby wyrejestrować wyłącznie jego wpis. Zachować konto i dane do diagnostyki, bez usuwania konfiguracji.
5. **Odbiór i runbook.** Sprawdzić autostart WTT bez restartowania całego AI-node w czasie pracy FINNARO; test po realnym restarcie odłożyć do uzgodnionego okna. Ponownie potwierdzić FINNARO active/online, brak zmian jego jednostek, kontenerów i baz. Zapisać run ID, wyniki QA/izolacji, dokładną poprawkę i rollback. Nie wykonywać merge ani deploymentu aplikacji. W razie regresji wrócić do zatrzymanego, nieaktywnego runnera WTT, pozostawiając FINNARO bez zmian.

Nie można zagwarantować zerowego wpływu obciążenia na współdzielony host; niezależność administracyjną zapewnia zakres zmian, a wpływ CPU/RAM/dysku należy ograniczać i mierzyć. Plan nie obejmuje restartu hosta ani wspólnego Dockera.

## 7. Ryzyka i estymacja

- Niepotwierdzona dokładna przyczyna autoryzacji: konieczny dostęp administratora do kontekstu WTT; nie obiecywać naprawy samym eksportem DBUS_SESSION_BUS_ADDRESS.
- Nadmierny sandbox może blokować wymagane elementy systemd, ale jego hurtowe wyłączenie naruszyłoby wymagania. Wymagana celowana zmiana i ponowny PASS.
- Zgodność runner service containers z rootless na tej konfiguracji musi być sprawdzona rzeczywistym jobem.
- Wspólny kernel/zasoby, publiczne PR i znane podatności zależności pozostają ryzykami po naprawie cgroups. Nie naprawiano ich w tym audycie.

Szacunki inżynierskie, nie gwarancja: **A 3–6 h aktywnej pracy**, w tym diagnostyka 1–2 h, poprawka 0,5–1 h, izolacja/QA/Actions i dokumentacja 1,5–3 h. Oczekiwanie na uprawnienia/akceptację poza estymacją. B około 1–2 h technicznej konfiguracji, lecz bez spełnienia separacji i bez rekomendacji wdrożenia. C około 1–2 dni roboczych na refaktoryzację QA i testów, przygotowanie natywnej bazy oraz weryfikację pokrycia; nie uzasadnia go jeszcze obecny błąd.

**Status audytu: ukończony. Status CI WTT: niesprawny/niegotowy do rejestracji. Następna decyzja: zatwierdzić ograniczoną diagnostykę i naprawę A przez administratora, bez ingerencji w FINNARO.**
