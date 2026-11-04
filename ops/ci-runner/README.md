# Aktualna konfiguracja WTT: systemowy Docker

Decyzja właściciela z 2026-11-04 zastępuje wcześniejszy wymóg pełnej izolacji rootless. Osobny runner ai-node-wtt dla jaroslawoleradzki-ctrl/workshop-time-tracking działa jako cloud, z etykietami self-hosted/Linux/X64/wtt. Osobny katalog /home/cloud/actions-runner-wtt, workdir _work, HOME home i cache _tool. Używa istniejącego systemowego socketu Docker. Nie zmieniamy daemonu, socketu, grup ani runnera FINNARO. Konto cloud już ma grupę docker; zaakceptowano wynikające z tego uprawnienia i współdzielenie hosta. Własny HOME ogranicza przypadkowe użycie konfiguracji innych projektów, ale nie stanowi bariery bezpieczeństwa przy wspólnym UID i rootful Docker.

Usługa **użytkownika cloud**: wtt-system-runner.service; WantedBy=default.target. cloud ma już Linger=yes, więc user manager i enabled service startują po restarcie hosta. Nie wymaga to zmiany systemowej usługi FINNARO. Nie restartować całego user managera ani hostowego Dockera.

## Rejestracja i autostart

Instalator sprawdza host/konto, systemowy Engine oraz SHA256 pakietu 2.338.2. Nie zastępuje istniejącej rejestracji. Token pobrać wyłącznie dla WTT; nie używać plików credentials FINNARO. W terminalu cloud z istniejącą autoryzacją gh:

```bash
set -euo pipefail
gh api --method POST repos/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/runners/registration-token --jq .token | \
  env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cloud \
  bash /tmp/wtt-accounting-fix/ops/ci-runner/install-system-runner.sh
install -m 644 /tmp/wtt-accounting-fix/ops/ci-runner/wtt-system-runner.service \
  /home/cloud/.config/systemd/user/wtt-system-runner.service
systemctl --user daemon-reload
systemctl --user enable --now wtt-system-runner.service
```

Nie zapisywać tokenu w rozmowie, repo lub logu. Rejestracja nie uruchamia jobów do startu usługi. Sprawdzić GitHub API: ai-node-wtt online, etykiety self-hosted/Linux/X64/wtt. W GitHub są to rzeczywiste domyślne etykiety platformy, mimo że porównanie etykiet nie rozróżnia wielkości liter.

## QA i zaufanie

Workflow dopuszcza push development/main i PR do tych gałęzi. Warunek na poziomie joba odrzuca forki oraz autorów spoza OWNER/MEMBER/COLLABORATOR przed inicjalizacją usług. Wykonywać wyłącznie zaufane, przejrzane workflow; nie zatwierdzać niezaufanych zmian YAML. Nie zmieniono globalnej polityki GitHub. Uprawnienia tokenu: contents:read, checkout bez utrwalania credentials.

Lokalnie i na runnerze: ./scripts/qa.sh. Systemowy Docker tworzy wyłącznie jednorazowe kontenery WTT z unikalnymi nazwami i losowymi portami loopback. PostgreSQL workflow jest własną usługą joba. Testy migracji mają własne bazy i kontener; nie korzystają z danych FINNARO/HomeLab/DEV/DEMO ani współdzielonych wolumenów. CI nie uruchamia Compose. Znane podatności zależności są jawne w baseline audytu.

## Rootless — konfiguracja nieużywana przez aktualne CI

Pliki prepare-host.sh, prepare-host-functions.sh, install-runner.sh, wtt-runner.service.template, verify-isolation.sh, system_docker_access.py i probe-isolation.py zachowano jako wcześniejszą ścieżkę. Nie uruchamiać ich dla obecnego wdrożenia. Konto wtt-runner, jego rootless Docker i istniejące jednostki pozostają bez zmian; nie usuwamy ich i nie diagnozujemy dalej. Raporty docs/ci z poprzedniego etapu są historyczne i nie zastępują tej decyzji. Ich testy jednostkowe mogą nadal działać bez aktywowania runtime rootless.

## Weryfikacja i rollback

Sprawdzić local QA, actionlint, GitHub run i FINNARO active/online. Zmiana jest gotowa dopiero po rzeczywistym PASS WTT Actions. Nie utożsamiać sukcesu lokalnego z wynikiem CI. Rollback zatrzymuje wyłącznie `systemctl --user disable --now wtt-system-runner.service`; pozostawia pliki i rejestrację do diagnostyki. Nie usuwać kontenerów innych jobów ani zmieniać konfiguracji FINNARO. Nie wykonuje deploymentu aplikacji.

## Potwierdzony wynik

2026-11-04: ai-node-wtt ONLINE, wtt-system-runner.service active/enabled, cloud Linger=yes. Rzeczywisty run [41833334661](https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking/actions/runs/41833334661) na PR #4 zakończył się PASS na ai-node-wtt, łącznie z pełnym QA i cleanup. FINNARO pozostało aktywne z PID 1856. Nie testowano restartu całego hosta; autostart wynika z konfiguracji linger/enabled.
