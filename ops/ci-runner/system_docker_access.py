#!/usr/bin/env python3
"""Read-only system Engine denial check. Exit 0 PASS, 1 FAIL, 2 BLOCKED."""
import errno
import os
import socket
import subprocess

SYSTEM_HOST = 'unix:///var/run/docker.sock'


def check_system_docker_access(env=None, run=subprocess.run, connect=None):
    env = dict(os.environ if env is None else env)
    expected = f'unix:///run/user/{os.getuid()}/docker.sock'
    if env.get('DOCKER_HOST') != expected or env.get('DOCKER_CONTEXT') or env.get('DOCKER_TLS_VERIFY') or env.get('DOCKER_TLS'):
        return 2, 'BLOCKED: unexpected Docker host/context/TLS configuration'
    env['LC_ALL'] = 'C'
    try:
        version = run(['docker', '--version'], env=env, capture_output=True, text=True, timeout=5)
        if version.returncode != 0:
            return 2, 'BLOCKED: Docker client unavailable'
        result = run(['docker', '--host', SYSTEM_HOST, 'info', '--format', '{{.ID}}'],
                     env=env, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return 2, 'BLOCKED: Docker client error or timeout'
    if result.returncode == 0:
        return 1, 'FAIL: WTT can connect to the system Docker Engine'
    # A CLI failure alone is never isolation evidence. Require an explicit
    # permission error AND the same errno from an independent Unix connect.
    if 'permission denied' not in result.stderr.lower():
        return 2, 'BLOCKED: Docker failure does not confirm permission denial'
    if connect is None:
        def connect():
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.settimeout(2)
                client.connect('/var/run/docker.sock')
    try:
        connect()
    except OSError as error:
        if error.errno in (errno.EACCES, errno.EPERM):
            return 0, 'PASS: system Docker access explicitly denied by permissions'
        return 2, 'BLOCKED: Unix socket failure is not permission denial'
    return 1, 'FAIL: system Docker socket is reachable despite Docker CLI error'


if __name__ == '__main__':
    code, message = check_system_docker_access()
    print(message)
    raise SystemExit(code)
