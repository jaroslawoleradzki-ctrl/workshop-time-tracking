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

Na końcu wykonuje `verify-isolation.sh` przez nowy user manager, wraz z `probe-isolation.py`: uruchamia chwilowy, pusty listener TCP na losowym porcie AI-node i potwierdza jego dostępność przed oraz po negatywnym teście nowego konta i kontenera. Nie łączy się z HomeLab. Dzięki porównaniu A/B timeout sam w sobie nie jest dowodem izolacji. Sprawdzany jest też brak odczytu poświadczeń cloud i dostępu do hostowego socketu. Listener zawsze jest zamykany po teście. Reguły blokują całą podsieć HomeLab, a nie tylko punkt kontrolny. Każdy błąd zatrzymuje przygotowanie. Nie przechodzić do etapu B, jeżeli izolacja nie ma wyniku PASS. Bez działania administratora te kontrole runtime nie zostały wykonane.

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
