#!/usr/bin/env bash
# Administrator-only prerequisites. Does NOT register or start a GitHub runner.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as administrator: sudo bash ops/ci-runner/prepare-host.sh' >&2; exit 1; }
[[ $(hostname) == ai-node ]] || { echo 'This preparation is limited to AI-node' >&2; exit 1; }
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=ops/ci-runner/prepare-host-functions.sh
source "$source_dir/prepare-host-functions.sh"
account=wtt-runner
runner_home=/home/wtt-runner
[[ ! -e "$runner_home/actions-runner-wtt/.runner" ]] || { echo 'Runner already registered; refusing to reconfigure its account' >&2; exit 1; }
command -v dockerd-rootless-setuptool.sh >/dev/null
[[ -f /etc/apparmor.d/rootlesskit ]] || { echo 'Install the official rootlesskit AppArmor profile; do not disable Ubuntu namespace restrictions' >&2; exit 1; }
# Verify reserved rootless ranges do not overlap existing host/FINNARO networks.
python3 - <<'NETWORKS'
import ipaddress, json, subprocess
reserved = [ipaddress.ip_network('10.0.2.0/24'), ipaddress.ip_network('10.250.0.0/16')]
existing = []
for route in json.loads(subprocess.check_output(['ip', '-j', 'route', 'show', 'table', 'all'])):
    destination = route.get('dst', 'default')
    if destination != 'default':
        existing.append(destination)
command = ['docker', '--host', 'unix:///var/run/docker.sock', 'network']
ids = subprocess.check_output(command + ['ls', '-q'], text=True).split()
if ids:
    for network in json.loads(subprocess.check_output(command + ['inspect'] + ids)):
        existing += [entry['Subnet'] for entry in ((network.get('IPAM') or {}).get('Config') or []) if entry.get('Subnet')]
for destination in existing:
    network = ipaddress.ip_network(destination, strict=False)
    if network.version == 4 and any(network.overlaps(candidate) for candidate in reserved):
        raise SystemExit('Reserved rootless range overlaps host networking; choose isolated ranges before installation')
NETWORKS
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
missing_packages=()
for package in uidmap dbus-user-session slirp4netns fuse-overlayfs; do
  if [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) != 'install ok installed' ]]; then
    missing_packages+=("$package")
  fi
done
if (( ${#missing_packages[@]} )); then
  apt-get update
  apt-get install -y --no-install-recommends --no-upgrade "${missing_packages[@]}"
fi
if ! id "$account" >/dev/null 2>&1; then
  useradd --create-home --user-group --shell /bin/bash "$account"
fi
[[ $(getent passwd "$account" | cut -d: -f6) == "$runner_home" ]] || { echo 'Unexpected account HOME' >&2; exit 1; }
[[ $(id -u "$account") -ge 1000 && $(id -Gn "$account") == "$account" ]] || { echo 'Account must have only its dedicated group and no administrative groups' >&2; exit 1; }
chmod 700 "$runner_home"
python3 - <<'PY'
from pathlib import Path
for filename in ['/etc/subuid', '/etc/subgid']:
    ranges = []
    for line in Path(filename).read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        name, start, count = line.split(':')
        ranges.append((name, int(start), int(count)))
    own = [entry for entry in ranges if entry[0] == 'wtt-runner']
    if not own or sum(entry[2] for entry in own) < 65536:
        raise SystemExit(f'{filename}: allocate a unique range of at least 65536 IDs for wtt-runner')
    for _, start, count in own:
        if start < 65536 or any(name != 'wtt-runner' and max(start, other_start) < min(start + count, other_start + other_count) for name, other_start, other_count in ranges):
            raise SystemExit(f'{filename}: unsafe/overlapping subordinate ID allocation; refusing setup')
PY
runner_uid="$(id -u "$account")"
install -d -m 755 "/etc/systemd/system/user@${runner_uid}.service.d" "/etc/systemd/system/user-${runner_uid}.slice.d"
cat > "/etc/systemd/system/user@${runner_uid}.service.d/50-wtt-isolation.conf" <<'UNIT'
[Service]
IPAddressDeny=10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 fc00::/7 fe80::/10
# Only the new rootless transport and its prechecked private QA networks.
IPAddressAllow=10.0.2.0/24 10.250.0.0/16
InaccessiblePaths=-/home/cloud -/root -/srv -/tank -/var/lib/docker -/run/docker.sock -/var/run/docker.sock
ProtectProc=invisible
ProtectSystem=strict
UNIT
# RootlessKit requires temporary files while ProtectSystem=strict is enabled.
printf 'ReadWritePaths=/home/wtt-runner /run/user/%s /tmp\n' "$runner_uid" >> "/etc/systemd/system/user@${runner_uid}.service.d/50-wtt-isolation.conf"
# Only this account's slice; FINNARO remains in its own account/slice.
cat > "/etc/systemd/system/user-${runner_uid}.slice.d/50-wtt-limits.conf" <<'UNIT'
[Slice]
CPUQuota=200%
MemoryHigh=5G
MemoryMax=6G
TasksMax=2048
UNIT
prepare_runner_directories "$account" "$runner_home"
# Preserve an existing daemon configuration on every rerun.
if [[ ! -e "$runner_home/.config/docker/daemon.json" ]]; then
cat > "$runner_home/.config/docker/daemon.json" <<'DOCKER'
{"bip":"10.250.0.1/24","default-address-pools":[{"base":"10.250.0.0/16","size":24}]}
DOCKER
chown "$account:$account" "$runner_home/.config/docker/daemon.json"
chmod 600 "$runner_home/.config/docker/daemon.json"
fi
install -o "$account" -g "$account" -m 700 "$source_dir/install-runner.sh" "$runner_home/install-runner.sh"
install -o "$account" -g "$account" -m 700 "$source_dir/verify-isolation.sh" "$runner_home/verify-isolation.sh"
install -o "$account" -g "$account" -m 700 "$source_dir/system_docker_access.py" "$runner_home/system_docker_access.py"
sed "s/@UID@/${runner_uid}/g" "$source_dir/wtt-runner.service.template" > /etc/systemd/system/wtt-runner.service
systemctl daemon-reload
loginctl enable-linger "$account"
systemctl start "user@${runner_uid}.service"
# These run with the new account's HOME/runtime; never alter cloud's Docker context.
as_runner() {
  runuser -u "$account" -- env HOME="$runner_home" XDG_RUNTIME_DIR="/run/user/${runner_uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${runner_uid}/bus" \
    DOCKER_HOST="unix:///run/user/${runner_uid}/docker.sock" "$@"
}
ensure_rootless_docker
python3 "$source_dir/probe-isolation.py"
echo 'Host prerequisites prepared. No GitHub runner has been registered or started.'
echo 'Next: administrator approves fork policy, registers ai-node-wtt, then enables wtt-runner.service.'
