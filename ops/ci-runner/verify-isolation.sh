#!/usr/bin/env bash
# Run through systemd-run --user under the dedicated isolated user manager.
set -euo pipefail
[[ $(id -un) == wtt-runner ]]
[[ $(id -Gn) == wtt-runner ]]
[[ ${DOCKER_HOST:-} == "unix:///run/user/$(id -u)/docker.sock" ]]
[[ -O "$HOME/.config" && -w "$HOME/.config" ]]
# RootlessKit needs writable temporary space under ProtectSystem=strict.
probe_tmp="$(mktemp)"
rm -- "$probe_tmp"
docker info --format '{{json .SecurityOptions}}' | grep -q rootless
[[ ! -r /home/cloud/.ssh/id_ed25519 && ! -r /home/cloud/.config/gh/hosts.yml ]]
python3 "$(dirname -- "$0")/system_docker_access.py"
# The administrator's live A/B probe proves that the endpoint is up, independently
# from the isolated user. IP packet filters may yield a timeout, not EPERM.
[[ ${WTT_ISOLATION_PROBE_HOST:-} == 192.168.100.29 ]]
[[ ${WTT_ISOLATION_PROBE_PORT:-} == 8765 ]]
python3 - <<'PROBE'
import os, socket
with socket.socket() as connection:
    connection.settimeout(2)
    try:
        connection.connect((os.environ['WTT_ISOLATION_PROBE_HOST'], int(os.environ['WTT_ISOLATION_PROBE_PORT'])))
    except OSError as error:
        import errno
        if not isinstance(error, TimeoutError) and error.errno not in (errno.EACCES, errno.EPERM, errno.ENETUNREACH, errno.EHOSTUNREACH):
            print('BLOCKED: network failure is not confirmed filtering')
            raise SystemExit(2)
        print('Isolated user cannot reach the administrator-controlled probe; outer A/B control still required')
    else:
        raise SystemExit('Private-address probe reachable from WTT; do not start the runner')
PROBE
# Pull public image first so a pull failure cannot masquerade as isolation success.
docker pull alpine:3.21 >/dev/null
docker run --rm alpine:3.21 true
# The daemon also runs under the masked user manager: a bind must not expose cloud.
mount_log="$(mktemp)"
trap 'rm -f -- "$mount_log"' EXIT
if docker run --rm --mount type=bind,src=/home/cloud,dst=/host-cloud,readonly alpine:3.21 \
  true >"$mount_log" 2>&1; then
  echo 'Host cloud HOME is exposed through the daemon; do not start the runner' >&2
  exit 1
fi
if ! grep -qi 'permission denied' "$mount_log"; then
  echo 'BLOCKED: bind mount failure did not confirm permission denial' >&2
  exit 2
fi
if docker run --rm alpine:3.21 sh -c 'nc -z -w 2 "$1" "$2"' sh \
  "$WTT_ISOLATION_PROBE_HOST" "$WTT_ISOLATION_PROBE_PORT" >/dev/null 2>&1; then
  echo 'Rootless container can reach the private-address probe; do not start the runner' >&2
  exit 1
else
  network_status=$?
  if [[ $network_status != 1 ]]; then
    echo 'BLOCKED: container network probe failed technically' >&2
    exit 2
  fi
fi
echo 'Component checks complete; final PASS requires administrator controls before and after.'
# No standalone PASS: only the administrator orchestrator can confirm controls.
echo 'Checked: dedicated rootless Docker and protected host paths; no client credentials used'
