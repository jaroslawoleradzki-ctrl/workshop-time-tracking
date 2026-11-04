import errno
import importlib.util
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('system_access', Path(__file__).resolve().parents[1] / 'system_docker_access.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SystemDockerAccessTests(unittest.TestCase):
    def check(self, client=None, error=None, env=None):
        run = Mock(side_effect=[subprocess.CompletedProcess([], 0, 'Docker version', ''),
                                client or subprocess.CompletedProcess([], 1, '', 'permission denied')])
        connect = Mock(side_effect=error)
        result = module.check_system_docker_access(
            env if env is not None else {'DOCKER_HOST': f'unix:///run/user/{os.getuid()}/docker.sock'}, run, connect)
        return result, run, connect

    def test_explicit_permission_denial(self):
        result, run, _ = self.check(error=PermissionError(errno.EACCES, 'denied'))
        self.assertEqual(result[0], 0)
        self.assertEqual(run.call_args.args[0][1:3], ['--host', 'unix:///var/run/docker.sock'])

    def test_successful_connection_fails(self):
        result, _, connect = self.check(client=subprocess.CompletedProcess([], 0, 'engine-id', ''))
        self.assertEqual(result[0], 1)
        connect.assert_not_called()

    def test_client_technical_error_is_blocked(self):
        result, _, _ = self.check(client=subprocess.CompletedProcess([], 1, '', 'unknown flag'))
        self.assertEqual(result[0], 2)

    def test_timeout_is_blocked(self):
        run = Mock(side_effect=subprocess.TimeoutExpired('docker', 5))
        result = module.check_system_docker_access({'DOCKER_HOST': f'unix:///run/user/{os.getuid()}/docker.sock'}, run)
        self.assertEqual(result[0], 2)

    def test_invalid_docker_host_is_blocked_before_client(self):
        result, run, _ = self.check(env={'DOCKER_HOST': 'unix:///var/run/docker.sock'})
        self.assertEqual(result[0], 2)
        run.assert_not_called()

    def test_socket_timeout_is_blocked(self):
        self.assertEqual(self.check(error=TimeoutError())[0][0], 2)

    def test_unavailable_or_missing_socket_is_blocked(self):
        for code in (errno.ECONNREFUSED, errno.ENOENT):
            with self.subTest(code=code):
                self.assertEqual(self.check(error=OSError(code, 'unavailable'))[0][0], 2)

    def test_cli_denial_but_socket_reachable_fails(self):
        self.assertEqual(self.check()[0][0], 1)

    def test_missing_client_is_blocked(self):
        result = module.check_system_docker_access({'DOCKER_HOST': f'unix:///run/user/{os.getuid()}/docker.sock'}, Mock(side_effect=FileNotFoundError()))
        self.assertEqual(result[0], 2)

    def test_conflicting_context_is_blocked(self):
        result, _, _ = self.check(env={'DOCKER_HOST': f'unix:///run/user/{os.getuid()}/docker.sock', 'DOCKER_CONTEXT': 'other'})
        self.assertEqual(result[0], 2)


if __name__ == '__main__':
    unittest.main()
