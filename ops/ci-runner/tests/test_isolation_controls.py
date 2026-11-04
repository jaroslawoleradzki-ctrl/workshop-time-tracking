import importlib.util
import contextlib
import io
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('isolation_controls', Path(__file__).resolve().parents[1] / 'probe-isolation.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class IsolationControlTests(unittest.TestCase):
    def invoke(self, controls, user_result=0):
        with patch.object(module.os, 'geteuid', return_value=0), \
             patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), \
             patch.object(module, 'control', side_effect=controls) as control, \
             patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], user_result)) as run:
            with contextlib.redirect_stdout(io.StringIO()):
                result = module.main()
        return result, control, run

    def test_unavailable_control_blocks_without_running_user_probe(self):
        result, _, run = self.invoke([ConnectionRefusedError()])
        self.assertEqual(result, 2)
        run.assert_not_called()

    def test_control_lost_after_user_test_is_blocked(self):
        self.assertEqual(self.invoke([None, TimeoutError()])[0], 2)

    def test_success_requires_both_controls_and_user_systemd(self):
        result, control, run = self.invoke([None, None])
        self.assertEqual(result, 0)
        self.assertEqual(control.call_count, 2)
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ['runuser', '-u', 'wtt-runner'])
        self.assertIn('systemd-run', args)
        self.assertIn('--user', args)
        self.assertIn('--setenv=WTT_ISOLATION_PROBE_PORT=8765', args)

    def test_failed_user_probe_never_passes(self):
        self.assertEqual(self.invoke([None, None], user_result=1)[0], 1)


if __name__ == '__main__':
    unittest.main()
