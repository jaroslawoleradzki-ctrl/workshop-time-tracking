> Dokument historyczny. Późniejsza decyzja właściciela: osobny runner WTT jako cloud z systemowym Dockerem, bez pełnej izolacji. Aktualna konfiguracja: ops/ci-runner/README.md. Rootless zachowano i nie jest używany przez nowe CI.

# WTT rootless Docker — diagnoza cgroups

Data: 2026-11-04. AI-node, Ubuntu Server 26.04 LTS. Worktree `/tmp/wtt-accounting-fix`, branch `fix/work-time-accounting-2026-11`, HEAD `b572fd7`. Zakres ograniczono do kilkuminutowej diagnostyki odczytowej cgroups/systemd/D-Bus. Istniejący niezatwierdzony raport architektury zachowano.

## Wynik

**Potwierdzono miejsce awarii: autoryzacja żądania utworzenia scope przez systemd. Nie potwierdzono jednoznacznej przyczyny źródłowej tej odmowy.** Bez dostępu do jednostki i środowiska runtime WTT nie można uczciwie stwierdzić, że wystarczy dopisać zmienną D-Bus albo zmienić zabezpieczenie systemd. Stan: BLOCKED na brakującym dowodzie, nie na niedziałającym daemonie.

Nie wykonano sudo, restartów, instalacji, uruchamiania kontenerów, QA, zmian usług/polkit/konfiguracji, rejestracji ani deploymentu. Powstał wyłącznie ten raport. Polecenia poniżej są instrukcją do późniejszego wykonania przez administratora, a nie opisem wdrożonej naprawy.

## 1. Dowody z hosta

| Obszar | Odczyt | Wniosek |
|---|---|---|
| Cgroup | `stat -fc %T /sys/fs/cgroup` → cgroup2fs | Aktywne cgroup v2 |
| User manager | user@1001.service active, PID 3107729 | Manager użytkownika działa |
| Delegacja | Delegate=yes; vendor unit Delegate=pids memory cpu | Nie potwierdza się hipoteza braku delegacji na poziomie user@1001 |
| Kontrolery | cgroup.controllers i subtree_control user managera: cpu memory pids; katalogi i plik subtree_control należą do wtt-runner | Kontrolery są dostępne i włączone na tym poziomie |
| Docker cgroup | `/proc/3109561/cgroup`: `/user.slice/user-1001.slice/user@1001.service/app.slice/docker.service` | Docker rzeczywiście działa w usłudze user managera |
| Docker service cgroup | katalog należy do wtt-runner; controllers cpu memory pids | Nie dowodzi jeszcze efektywnego Delegate i wszystkich uprawnień potomnych docker.service |
| User bus | PID 3109510, UID 1001, dbus-daemon --session --address=systemd, w session.slice/dbus.service | Sesyjny D-Bus istnieje; brak pakietu/user bus nie jest potwierdzonym wyjaśnieniem |
| Rootless namespace | UID map dockerd: 0→1001 (1 UID), 1→165536 (65536 UID) | Daemon działa w user namespace, nie jako hostowy root |
| Runtime | Docker CLI 29.9.3; runc 1.5.2, commit v1.5.2-0-g29dd3dc2 | Wersje lokalnych programów; nie udowodniono, że daemon wskazuje dokładnie ten sam plik runc |

Ograniczenia user@1001: ProtectSystem=strict, ProtectProc=invisible, ProcSubset=all, ProtectControlGroups=no, RestrictNamespaces=no, NoNewPrivileges=no. Efektywne ReadWritePaths: `/home/wtt-runner /run/user/1001 /tmp`. Dostęp /tmp dodaje osobny `60-wtt-tmp.conf`; sam `50-wtt-isolation.conf` go nie zawiera. Maskowane są m.in. HOME cloud, /root, /srv, /tank, /var/lib/docker i systemowy socket; ograniczenia sieci pozostają aktywne.

### Log rzeczywistej awarii

Journal UID 1001 z 12:31:40 i 12:32:08 zawiera błąd runc podczas startu kontenera:

```text
unable to apply cgroup configuration
unable to start unit docker-…scope
Access denied as the requested operation requires interactive authentication.
However, interactive authentication has not been enabled by the calling program.
```

Żądanie zawiera Delegate=true i Slice=user.slice. Ten zapis potwierdza błąd autoryzacji operacji systemd, ale **nazwa slice nie rozstrzyga sama w sobie, że wywołano systemowy zamiast użytkownikowego managera**. Nie należy wyprowadzać z niej takiego wniosku bez sprawdzenia połączenia.

Wcześniej logowany jest też brak odczytu `/proc/1/cgroup`. ProtectProc=invisible jest zgodne z ograniczoną widocznością PID należącego do root, ale nie ma dowodu łączącego ten komunikat z odmową utworzenia scope. Nie rekomenduję wyłączania ProtectProc.

Journal polkit z okna obu błędów nie zwrócił wpisów. Nie jest to dowód braku problemu autoryzacji ani potwierdzenie konkretnej reguły polkit.

## 2. Rozdzielenie hipotez

| Hipoteza | Ocena |
|---|---|
| Brak cgroup v2 | Wykluczona przez odczyt filesystemu |
| Brak Delegate na user@1001 | Wykluczona na tym poziomie; delegacja docker.service nie została w pełni odczytana |
| Docker uruchomiony poza systemd użytkownika | Wykluczona dla procesu dockerd; jego podproces może nadal wybierać niewłaściwy bus/kontekst |
| Brak działającego user D-Bus | Proces istnieje; dostęp runtime do niego nie został potwierdzony |
| Odmowa autoryzacji systemd/D-Bus | Potwierdzony bezpośredni etap awarii; dokładny odbiorca, tożsamość i powód odmowy nieustalone |
| Błędny adres/środowisko user bus w runtime | Możliwe, niepotwierdzone |
| Zabezpieczenia user managera zakłócają identyfikację procesu | Możliwe, niepotwierdzone; nie jest podstawą do osłabienia sandboxu |
| ProtectSystem blokuje zapis /tmp | Efektywna polityka dopuszcza /tmp; obecny log dotyczy autoryzacji scope, nie EROFS |

Kod upstream pokazuje osobne ścieżki połączenia root/rootless i detekcję adresu sesyjnego busa. To wyjaśnia, dlaczego trzeba sprawdzić rzeczywisty kontekst runtime, ale nie jest dowodem na błąd konkretnej instalacji: [cgroups D-Bus](https://github.com/opencontainers/cgroups/blob/main/systemd/dbus.go), [user D-Bus i UID](https://github.com/opencontainers/cgroups/blob/main/systemd/user.go). Odczytano main upstream, nie źródła binarnego runtime z hosta. [Docker rootless tips](https://docs.docker.com/engine/security/rootless/tips/) opisuje zarządzanie daemonem przez systemd użytkownika i wymagania cgroups.

## 3. Dokładnie brakujący dowód

Konto cloud nie może odczytać `/home/wtt-runner/.config/systemd/user/docker.service`, `/run/user/1001/bus` ani `/proc/3109561/environ`. Nie obchodzono tych uprawnień. `Environment=` z systemctl show user@1001 opisuje konfigurację jednostki systemowej, a nie dowodzi środowiska dockerd.

Do rozstrzygnięcia brakuje:

1. Treści i efektywnych parametrów user docker.service, szczególnie Delegate, sposobu startu i ustawień busa.
2. Wartości XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS i DBUS_SYSTEM_BUS_ADDRESS w faktycznym dockerd/containerd oraz wybranego runtime; bez odczytu pozostałych zmiennych/sekretów.
3. Potwierdzenia managera i UID busa widzianego przez user service, a jeśli ustawienia okażą się poprawne — adresu AF_UNIX i odpowiedzi D-Bus dla nieudanego StartTransientUnit z runtime. Sama obecność zmiennej w powłoce administratora nie wystarcza.

### Odczyty do wykonania przez administratora — bez zmian usług

Poniższe polecenia nie zostały wykonane w tej sesji. Wynik pełnej jednostki przeglądać lokalnie; do przekazania wystarczą wymienione pola, bez sekretów.

```bash
sudo -u wtt-runner -H env \
  XDG_RUNTIME_DIR=/run/user/1001 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
  systemctl --user cat docker.service

sudo -u wtt-runner -H env \
  XDG_RUNTIME_DIR=/run/user/1001 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
  systemctl --user show docker.service \
    -p MainPID -p Delegate -p ControlGroup -p FragmentPath -p DropInPaths

sudo -u wtt-runner -H env \
  XDG_RUNTIME_DIR=/run/user/1001 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
  busctl --user status
```

Wyłącznie wybrane zmienne z rzeczywistych procesów (PID wyszukiwany na nowo):

```bash
sudo python3 - <<'PY'
from pathlib import Path
allowed = {b'XDG_RUNTIME_DIR', b'DBUS_SESSION_BUS_ADDRESS', b'DBUS_SYSTEM_BUS_ADDRESS'}
for proc in Path('/proc').iterdir():
    if not proc.name.isdecimal():
        continue
    try:
        if proc.stat().st_uid != 1001:
            continue
        name = (proc / 'comm').read_text().strip()
        if name not in {'dockerd', 'containerd'}:
            continue
        values = {}
        for item in (proc / 'environ').read_bytes().split(b'\0'):
            key, sep, value = item.partition(b'=')
            if sep and key in allowed:
                values[key.decode()] = value.decode(errors='replace')
        print(proc.name, name, values)
    except (FileNotFoundError, PermissionError):
        continue
PY
```

Jeżeli te odczyty są poprawne, nadal potrzeba śladu wywołania z kontekstu runtime podczas jednej kontrolowanej reprodukcji. Nie zalecam instalowania narzędzi ani szerokiego trace w ciemno. Brakujące dane są warunkiem wybrania poprawki, a nie powodem do zmiany polkit.

## 4. Jedna minimalna poprawka — wyłącznie warunkowy kandydat

**Nie ma jeszcze podstaw do bezwarunkowej rekomendacji wdrożeniowej.** Jedynym kandydatem opisanym tutaj jest jawne skierowanie usługi Docker WTT do własnego user bus przez drop-in środowiska. Wolno go wybrać dopiero, gdy brakujące odczyty pokażą brak/błędny adres w rzeczywistym runtime i potwierdzą, że odpowiada on za wybór niewłaściwego połączenia. Jeżeli adres jest już prawidłowy lub runtime wybiera inną ścieżkę niezależnie od niego, poniższa zmiana nie jest uzasadniona i należy jej nie wykonywać.

Kandydat nie obejmuje polkit, dodawania grupy docker, zmiany systemowego Engine, wyłączania cgroups/ProtectProc ani globalnego Delegate. Nie jest ogłoszony jako rozwiązanie potwierdzone.

### Polecenia wdrożenia po potwierdzeniu warunku i zatwierdzeniu

Wykonać w terminalu administratora AI-node. Polecenie odmawia nadpisania istniejącego pliku. Zmienia wyłącznie user docker.service WTT; restart przerwie jego kontenery.

```bash
set -euo pipefail
sudo -u wtt-runner -H bash -eu <<'SH'
export XDG_RUNTIME_DIR=/run/user/1001
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
install -d -m 700 "$HOME/.config/systemd/user/docker.service.d"
patch="$HOME/.config/systemd/user/docker.service.d/90-wtt-user-bus.conf"
test ! -e "$patch"
( set -o noclobber
  cat > "$patch" <<'UNIT'
[Service]
Environment=XDG_RUNTIME_DIR=/run/user/1001
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
UNIT
)
systemctl --user daemon-reload
systemctl --user restart docker.service
SH
```

Nie zerować DBUS_SYSTEM_BUS_ADDRESS bez dowodu — może być potrzebne innym składnikom. Jeżeli plik docelowy już istnieje, zatrzymać się i porównać go zamiast nadpisywać.

### Weryfikacja

Po sprawdzeniu środowiska faktycznego daemonu uruchomić tylko minimalny test jako WTT przez user systemd:

```bash
sudo -u wtt-runner -H env \
  XDG_RUNTIME_DIR=/run/user/1001 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
  systemd-run --user --wait --pipe --collect \
    --setenv=DOCKER_HOST=unix:///run/user/1001/docker.sock \
    /usr/bin/docker run --rm alpine:3.21 true
```

Wymagane exit 0 i brak ponownego błędu scope. Nie usuwać istniejących kontenerów/konfiguracji w ramach testu. Jeżeli runtime nadal odmawia autoryzacji, zachować log i wycofać tylko nowy drop-in; nie dokładać kolejnych obejść.

### Rollback tego konkretnego kandydata

Tylko jeśli plik powstał w powyższej procedurze i nie został później zmieniony przez administratora. `mv -n` zachowuje plik do diagnostyki; jeśli kopia disabled już istnieje, najpierw zatrzymać się i porównać stan.

```bash
sudo -u wtt-runner -H bash -eu <<'SH'
export XDG_RUNTIME_DIR=/run/user/1001
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
patch="$HOME/.config/systemd/user/docker.service.d/90-wtt-user-bus.conf"
test -f "$patch"
test ! -e "$patch.disabled"
mv -n -- "$patch" "$patch.disabled"
systemctl --user daemon-reload
systemctl --user restart docker.service
SH
```

## 5. Wpływ i dalszy krok

FINNARO: active, PID 1856, konfiguracja nietknięta. Opisany kandydat ogranicza się do usługi użytkownika 1001; nie restartuje systemowego Dockera, user managera cloud ani pozostałych usług hosta. Restart WTT wpływa na jego własne kontenery; CPU/RAM/dysk nadal są współdzielone. To ocena zakresu potencjalnej zmiany, nie wynik testu wdrożenia.

**Pełnego testu izolacji nie uruchamiać bezpośrednio na podstawie tego raportu.** Najpierw brakujące dowody, zatwierdzona celowana poprawka i minimalny test kontenera z exit 0. Dopiero wtedy można uruchomić istniejący pełny test izolacji z osiągalnym serwerem kontrolnym 192.168.100.29:8765 i kontrolami administratora przed/po. Nadal bez rejestracji runnera.

Następny wymagany krok: administrator wykonuje wyłącznie odczyty z sekcji 3. Bez tych danych wdrożenie jednego domniemanego rozwiązania byłoby zgadywaniem. Żadnej poprawki nie wdrożono; oczekujemy na dowody i zatwierdzenie.
