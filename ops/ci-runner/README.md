# Dedykowany runner WTT na AI-node

Zweryfikowany stan hosta 192.168.100.29: `/home/cloud/actions-runner`, runner `ai-node-finance`, repozytorium `jaroslawoleradzki-ctrl/finance-platform`, etykiety `self-hosted`, `Linux`, `X64`, `ai-node`; usługa `actions.runner.jaroslawoleradzki-ctrl-finance-platform.ai-node-finance.service` jest aktywna. Nie zmieniono jej konfiguracji ani procesu. Istnieje też katalog runnera SLR; nie jest wykorzystywany przez WTT.

Docelowa osobna instancja: nazwa `ai-node-wtt`, repozytorium `jaroslawoleradzki-ctrl/workshop-time-tracking`, etykiety domyślne `self-hosted`, `Linux`, `X64` i własna `wtt`, katalog `/home/wtt-runner/actions-runner-wtt`, workdir `_work`. Te etykiety NIE są jeszcze zarejestrowane. Runner nie może działać jako `cloud`, korzystać z `/home/cloud`, hostowego `/var/run/docker.sock`, sudo ani grupy docker. Wymagany jest własny rootless Docker, jego własny socket i storage.

## Warunki przed uruchomieniem — administrator

Repozytorium jest publiczne. GitHub ostrzega przed wykonywaniem niezaufanego kodu na self-hosted runnerach: [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use). Obecna polityka repo wymaga akceptacji tylko pierwszego PR kontrybutora (`first_time_contributors`), a nie każdego niezaufanego PR. Przed rejestracją/uruchomieniem administrator musi ustawić „Require approval for all outside collaborators” oraz nie zatwierdzać zewnętrznych PR do wykonania na tym runnerze. Workflow dodatkowo odrzuca fork/niezaufanego autora przed checkout, ale kod YAML z PR również może być zmieniony — sam warunek YAML nie zastępuje polityki GitHub.

1. Zainstalować `uidmap` (`newuidmap`, `newgidmap`) oraz wymagania rootless Docker; utworzyć konto `wtt-runner` z prywatnym HOME, bez sudo, bez grupy docker i bez kluczy SSH/tokenów do infrastruktury klienta. Przypisać mu unikalne zakresy `/etc/subuid` i `/etc/subgid`. Nie edytować konta/runnera FINNARO.
2. Zainstalować i uruchomić rootless Docker dla nowego użytkownika zgodnie z [instrukcją Docker](https://docs.docker.com/engine/security/rootless/). Rootless daemon i jego kontenery mają osobny storage; nie mogą używać hostowego socketu. Włączyć linger wyłącznie dla nowego konta. Na obecnym hoście brakuje `newuidmap`, a `sudo -n` wymaga uwierzytelnienia — instalacja wymaga działania administratora.
3. Ograniczyć dostęp sieciowy dedykowanego konta/daemonu do infrastruktury prywatnej (w tym 192.168.100.22), np. przez `IPAddressDeny=10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 fc00::/7` na dedykowanym `user@UID.service`, z zachowaniem loopback i publicznych GitHub/npm/Docker. Zweryfikować działanie ograniczeń dla procesu runnera i jego rootless kontenerów. Nie zmieniać globalnego firewalla ani usług FINNARO.
4. Sprawdzić jako nowy użytkownik, że `docker info` wskazuje rootless, nie ma dostępu do `/home/cloud/.ssh`, hostowego socketu ani baz/sekretów innych projektów. Nie montować katalogów innych projektów do kontenerów QA.
5. Jako `wtt-runner`, z `DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock`, uruchomić `install-runner.sh`. Pakiet 2.338.2 pobierany jest z oficjalnego release i sprawdzany SHA256. Krótkotrwały token rejestracji administrator pobiera dla repo WTT w Settings → Actions → Runners → New self-hosted runner i podaje przez ukryte stdin. Nie zapisywać tokenu w repo, logach ani jednostce systemd.
6. Administrator zastępuje `@UID@` w `wtt-runner.service.template` rzeczywistym UID nowego konta, reviewuje i instaluje jako osobną usługę. Template ogranicza zapisy do HOME/runtime nowego konta i blokuje prywatne podsieci dla runnera. Najpierw muszą działać rootless Docker i ograniczenia sieciowe.
7. Zweryfikować przez GitHub API runner `ai-node-wtt`, repo i etykiety. Uruchomić QA na PR, odczytać rzeczywisty wynik Actions oraz sprawdzić, że usługa FINNARO nadal ma tę samą konfigurację i jest aktywna. Dopiero wynik zielonego joba można nazwać sukcesem CI.

Nie stosować uprzywilejowanego Docker-in-Docker ani hostowego socketu jako obejścia braku uprawnień do rootless Docker. Rejestracja runnera nie jest deploymentem aplikacji; skrypt nie wykonuje deploymentu, migracji danych klienta ani zmiany polityk repo. Rotację/reinstalację runnera po incydencie oraz aktualizacje pakietu wykonuje administrator.

## Dokładne polecenia administratora — kontynuacja po cd76089

Bieżąca blokada została potwierdzona ponownie: Ubuntu 26.04.1 / AI-node, brak konta `wtt-runner`, brak `newuidmap`/`newgidmap`, `sudo -n true` wymaga uwierzytelnienia. Hostowy Docker 29.9.3 jest rootful i dostępny przez grupę docker; nie jest bezpiecznym daemonem dla jobów WTT. Nie wolno uruchamiać instalatora jako cloud ani dopisywać nowego konta do tej grupy.

**Etap A — jedyne wymagane działanie na obecnej blokadzie** (w lokalnym terminalu administratora AI-node):

```bash
sudo bash /tmp/wtt-accounting-fix/ops/ci-runner/prepare-host.sh
```

Przed uruchomieniem należy przeczytać skrypt. Instaluje wyłącznie wymagania rootless bez aktualizowania istniejących pakietów i bez restartowania innych usług, tworzy osobne konto i sprawdza zakresy subuid/subgid. Zapisuje ograniczenia tylko dla nowego UID: maskowanie `/home/cloud`, danych hosta i rootful socketu, blokadę prywatnych/metadata adresów oraz limity 2 CPU / 6 GiB w dedykowanym user slice. Włącza autostart wyłącznie nowego user managera/rootless Docker. Dla rootless transportu i jego własnych testowych sieci rezerwuje 10.0.2.0/24 i 10.250.0.0/16, sprawdzając wcześniej brak kolizji z trasami hosta i sieciami Docker innych projektów. Tylko manager nowego użytkownika ma wyjątki tych wewnętrznych zakresów, aby nie zablokować komunikacji kontenerów QA. Sam proces runnera nie ma tych wyjątków. Nie zmienia globalnych sysctl, AppArmor, firewalla, konta cloud ani FINNARO. Nie rejestruje runnera i nie uruchamia workflow.

Na końcu wykonuje `verify-isolation.sh` przez nowy user manager, wraz z `probe-isolation.py`: wymaga wcześniej uruchomionego serwera kontrolnego na 192.168.100.29:8765 i potwierdza jego dostępność przed oraz po negatywnym teście nowego konta i kontenera. Nie łączy się z HomeLab. Dzięki porównaniu A/B timeout sam w sobie nie jest dowodem izolacji. Sprawdzany jest też brak odczytu poświadczeń cloud i dostępu do hostowego socketu. Serwer kontrolny administrator zamyka po zakończeniu testów. Reguły blokują całą podsieć HomeLab, a nie tylko punkt kontrolny. Każdy błąd zatrzymuje przygotowanie. Nie przechodzić do etapu B, jeżeli izolacja nie ma wyniku PASS. Bez działania administratora te kontrole runtime nie zostały wykonane.

**Etap B — zatwierdzenie polityki GitHub przez administratora repozytorium** (nie wykonano automatycznie):

```bash
gh api --method PUT repos/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/permissions/fork-pr-contributor-approval \
  -f approval_policy=all_external_contributors
```

Nie akceptować wykonania workflow z zewnętrznych forków na tym runnerze. Po review przenosić zaakceptowane zmiany do zaufanej gałęzi w repo. Samo zaostrzenie polityki nie uprawnia do wykonywania niezaufanego kodu. Nie uruchamiać jobów przed sprawdzeniem izolacji i zatwierdzeniem tej polityki.

**Etap C — rejestracja i autostart** (terminal z istniejącym uwierzytelnieniem gh administratora repo; token nie trafia do rozmowy ani pliku):

```bash
set -euo pipefail
test "$(gh api repos/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/permissions/fork-pr-contributor-approval --jq .approval_policy)" = all_external_contributors
wtt_runner_uid="$(id -u wtt-runner)"
gh api --method POST repos/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/runners/registration-token --jq .token | \
  sudo -u wtt-runner -H env \
    XDG_RUNTIME_DIR="/run/user/$wtt_runner_uid" \
    DOCKER_HOST="unix:///run/user/$wtt_runner_uid/docker.sock" \
    /home/wtt-runner/install-runner.sh
sudo systemctl enable --now wtt-runner.service
```

Instalator odrzuca nieprawidłowe konto/daemon i sprawdza SHA256 oficjalnego pakietu. Przed włączeniem usługi administrator powinien sprawdzić wyrenderowany `/etc/systemd/system/wtt-runner.service`. Usługa czeka na gotowość własnego rootless Docker, maskuje dane innych projektów i nie korzysta z konta cloud. Rootless Docker oraz runner startują po restarcie dzięki linger i enable. Kolejka PR #4 może zostać podjęta natychmiast po przejściu runnera ONLINE.

Po tych krokach można kontynuować od sprawdzenia `gh api .../actions/runners` oraz aktualnego runu PR #4; nie trzeba ponawiać analizy rozliczeń. Instalacja nie jest potwierdzona, dopóki konto/usługi/rootless test i rzeczywisty Actions nie przejdą kontroli. Blokadę administracyjną należy rozwiązać w terminalu hosta, bez przesyłania haseł lub tokenów do rozmowy.

## Testy diagnostyki sieci

`python3 -m unittest discover -s ops/ci-runner/tests -v` uruchamia rzeczywisty fragment preflight z podmienionym wyłącznie odczytem poleceń. Nie wykonuje instalacji ani wymaga sudo/Dockera. Obejmuje `IPAM.Config=null`, pustą listę, poprawne podsieci, brak IPAM, brak sieci i wykrywanie kolizji także po sieci z Config=null. Testy są częścią wspólnego `scripts/qa.sh`.


## Ponowne przygotowanie po uruchomieniu rootless Docker (UID 1001)

`prepare-host.sh` ustawia właściciela i tryb 700 zarówno `.config`, jak i `.config/docker`. W polityce user managera dopuszcza zapis do `/tmp` potrzebny RootlessKit przy ProtectSystem=strict. Jest to współdzielony katalog tymczasowy hosta (nie sandbox dla niezaufanego kodu). Nie zapisywać tam sekretów; izolacja sieci i maskowanie danych innych kont pozostają wymagane.

Skrypt sprawdza zainstalowane pakiety i pomija apt, jeśli wszystkie wymagania istnieją. Zachowuje istniejący daemon.json. Działający daemon z name=rootless nie jest reinstalowany ani restartowany. Zatrzymana, istniejąca usługa Docker jest uruchamiana bez reinstalacji; instalator rootless jest wykonywany tylko przy braku działającego daemonu i usługi. Odpowiedź inna niż rootless zatrzymuje przygotowanie. Istniejąca rejestracja GitHub nadal powoduje bezpieczną odmowę zmian. Skrypt nie restartuje aktywnego user managera; daemon-reload nie stosuje nowych zabezpieczeń do już działających procesów. Jeżeli polityka uruchomionej usługi różni się od przygotowanej, administrator musi zaplanować jej zastosowanie i ponowić testy izolacji przed aktywacją runnera.

Na obecnym etapie konto cloud nie ma dostępu do socketu `/run/user/1001/docker.sock`, a sudo wymaga uwierzytelnienia. Administrator może kontynuować etap A powyżej; po PASS testów runtime oraz zatwierdzeniu polityki forków przejść do B/C. Nie reinstalować ręcznie działającego rootless Docker. Nie podawać tokenów w rozmowie. Testy A/B sprawdzają dostęp do prywatnej sieci na lokalnym punkcie kontrolnym, bez połączeń do HomeLab. Rejestracja nadal jest odrębnym krokiem i nie została wykonana.


## Pełna weryfikacja izolacji — obowiązująca procedura (8765)

Samo istnienie systemowego socketu nie stanowi FAIL. `system_docker_access.py` wykonuje `docker --host unix:///var/run/docker.sock info` z limitem czasu, sprawdza klienta i niezależną próbą AF_UNIX potwierdza EACCES/EPERM. Tylko jawna odmowa uprawnień w obu próbach daje PASS tego komponentu. Udane połączenie daje FAIL. Timeout, brak klienta/socketu, niedziałający daemon, inny błąd oraz błędny DOCKER_HOST/context/TLS dają BLOCKED. Administrator przed i po testach potwierdza również, że systemowy Engine odpowiada. Skrypt nie zmienia socketu ani Dockera.

Wymagane środowisko testu WTT:

```text
DOCKER_HOST=unix:///run/user/1001/docker.sock
WTT_ISOLATION_PROBE_HOST=192.168.100.29
WTT_ISOLATION_PROBE_PORT=8765
```

Orkiestrator ustawia je jawnie w jednostce systemd użytkownika WTT. `verify-isolation.sh` nie uruchamiać przez sudo bash jako root. `probe-isolation.py` wymaga administratora wyłącznie do kontroli A/B i przejścia przez runuser do systemd-run --user. Nie zmienia usług i nie rejestruje runnera.

1. Serwer kontrolny musi działać. Jeśli port jest już zajęty przez znany serwer kontrolny, nie uruchamiać drugiego i nie zatrzymywać istniejącej usługi. Jeśli serwera nie ma, w osobnym terminalu AI-node uruchomić prosty HTTP server obsługujący wyłącznie nowy pusty katalog, bez danych innych projektów:

```bash
(
  probe_dir="$(mktemp -d /tmp/wtt-isolation-control.XXXXXX)"
  trap 'rmdir -- "$probe_dir"' EXIT
  python3 -m http.server 8765 --bind 192.168.100.29 --directory "$probe_dir"
)
```

Nie otwierać portu publicznie i nie zmieniać firewalla. Jeśli bindowanie lub osiągalność są niemożliwe: BLOCKED. Po teście zakończyć własny serwer Ctrl+C. Nie zatrzymywać cudzego procesu.

2. Administrator po review aktualnych plików kopiuje wyłącznie diagnostykę (bez prepare-host, bez reinstalacji i bez restartów):

```bash
sudo install -o wtt-runner -g wtt-runner -m 700   /tmp/wtt-accounting-fix/ops/ci-runner/verify-isolation.sh   /tmp/wtt-accounting-fix/ops/ci-runner/system_docker_access.py   /home/wtt-runner/
sudo python3 /tmp/wtt-accounting-fix/ops/ci-runner/probe-isolation.py
```

Kontrole administratora sprawdzają rzeczywistą odpowiedź Engine i połączenie TCP przed i po teście. Brak serwera lub Engine blokuje test; nie jest dowodem izolacji. Test WTT sprawdza konto/grupy, rootless, konfigurację, chronione pliki cloud, jawny brak dostępu do systemowego Engine, pull alpine:3.21, start kontenera, bind chronionego HOME i połączenia sieciowe z konta oraz kontenera. Potwierdzony sukces bind mount albo połączenia oznacza FAIL. Niejasny błąd bind lub techniczny błąd kontenera oznacza BLOCKED. Sam verify-isolation wypisuje jedynie zakończenie komponentów, nie pełny PASS.

3. Interpretacja: **PASS** wyłącznie po sukcesie całego orkiestratora i obu kontroli A/B; **FAIL** oznacza wykryte naruszenie lub niezaliczone wymaganie; **BLOCKED** oznacza brak warunków, uprawnień albo niejednoznaczny błąd techniczny. Kody orkiestratora: 0 PASS, niezero bez prawa rejestracji; wyjście 2 oznacza blokadę. Przy FAIL/BLOCKED nie rejestrować ani nie uruchamiać runnera.

4. Dopiero po udokumentowanym pełnym PASS administrator może przejść do etapów B/C powyżej. Najpierw wymagane jest odrębne zatwierdzenie warunków dla publicznego repozytorium. Nie wykonywać zmian polityki ani rejestracji w ramach samego testu. Token rejestracyjny pozyskiwać wyłącznie w terminalu, bez rozmowy i bez pliku. Następnie sprawdzić nazwę ai-node-wtt, repo, etykiety self-hosted/Linux/X64/wtt i ONLINE. Pełny PASS izolacji nie zastępuje zielonego wykonania QA na GitHub.
