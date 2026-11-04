#!/usr/bin/env python3
"""Administrator A/B controls around user-systemd checks; never starts a server."""
import os
import pwd
import socket
import subprocess

HOST, PORT = '192.168.100.29', 8765


def control():
    # Explicit host ignores the caller's rootless Docker host/context.
    result = subprocess.run(['docker', '--host', 'unix:///var/run/docker.sock', 'info', '--format', '{{.ID}}'],
                            capture_output=True, timeout=5, check=True)
    if not result.stdout.strip():
        raise RuntimeError('System Engine control returned no identity')
    with socket.create_connection((HOST, PORT), timeout=2):
        pass


def main():
    if os.geteuid() != 0:
        print('BLOCKED: administrator required for controls and runuser; do not run the isolation script as root')
        return 2
    account = pwd.getpwnam('wtt-runner')
    if account.pw_uid != 1001:
        print('BLOCKED: unexpected WTT UID')
        return 2
    try:
        control()
        print('Administrator controls reachable before test', flush=True)
        result = subprocess.run([
            'runuser', '-u', 'wtt-runner', '--', 'env',
            'HOME=/home/wtt-runner', f'XDG_RUNTIME_DIR=/run/user/{account.pw_uid}',
            f'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{account.pw_uid}/bus',
            'systemd-run', '--user', '--wait', '--pipe', '--collect',
            '--unit=wtt-isolation-check',
            f'--setenv=DOCKER_HOST=unix:///run/user/{account.pw_uid}/docker.sock',
            f'--setenv=WTT_ISOLATION_PROBE_HOST={HOST}',
            f'--setenv=WTT_ISOLATION_PROBE_PORT={PORT}',
            '/home/wtt-runner/verify-isolation.sh',
        ], timeout=180)
        control()
    except (OSError, RuntimeError, subprocess.SubprocessError):
        print('BLOCKED: administrator control, systemd invocation or timeout failed; no PASS')
        return 2
    if result.returncode:
        print('FAIL/BLOCKED: user isolation checks did not complete successfully; inspect preceding output')
        return result.returncode
    print('PASS: full isolation; system Engine and network controls reachable before/after user-systemd checks')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
