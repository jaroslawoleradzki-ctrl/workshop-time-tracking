#!/usr/bin/env python3
"""Root-only A/B network probe; no registration, no client connection, no secrets."""
import os
import pwd
import socket
import socketserver
import subprocess
import threading

if os.geteuid() != 0:
    raise SystemExit('Run through the administrator prepare-host.sh script')
account = pwd.getpwnam('wtt-runner')

class Probe(socketserver.BaseRequestHandler):
    def handle(self):
        pass

# A transient TCP listener only; random port avoids every existing service.
# Compare an unrestricted local connection with the isolated user/container.
with socketserver.TCPServer(('192.168.100.29', 0), Probe) as server:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    try:
        with socket.create_connection((host, port), timeout=2):
            pass
        subprocess.run([
            'runuser', '-u', 'wtt-runner', '--', 'env',
            'HOME=/home/wtt-runner',
            f'XDG_RUNTIME_DIR=/run/user/{account.pw_uid}',
            f'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{account.pw_uid}/bus',
            f'DOCKER_HOST=unix:///run/user/{account.pw_uid}/docker.sock',
            'systemd-run', '--user', '--wait', '--pipe', '--collect',
            '--unit=wtt-isolation-check',
            f'--setenv=WTT_ISOLATION_PROBE_HOST={host}',
            f'--setenv=WTT_ISOLATION_PROBE_PORT={port}',
            '/home/wtt-runner/verify-isolation.sh',
        ], check=True)
        with socket.create_connection((host, port), timeout=2):
            pass
        print('PASS: live private-address probe reachable before/after, denied to WTT user and rootless container')
    finally:
        server.shutdown()
        thread.join()
