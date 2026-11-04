"""Exercise the actual read-only preflight, never the installer/system changes."""
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'prepare-host.sh'
PREFLIGHT = SCRIPT.read_text().split("python3 - <<'NETWORKS'\n", 1)[1].split('\nNETWORKS', 1)[0]


class NetworkPreflightTests(unittest.TestCase):
    def run_preflight(self, networks, routes=None, ids=b'network-id\n'):
        def output(command, **kwargs):
            if command[0] == 'ip':
                return json.dumps(routes or [{'dst': 'default'}]).encode()
            if command[-2:] == ['ls', '-q']:
                return ids.decode() if kwargs.get('text') else ids
            if 'inspect' in command:
                return json.dumps(networks).encode()
            self.fail(f'Unexpected command: {command}')

        with patch.object(subprocess, 'check_output', side_effect=output) as mocked:
            exec(compile(PREFLIGHT, str(SCRIPT), 'exec'), {})
        return mocked

    def test_null_config(self):
        self.run_preflight([{'IPAM': {'Config': None}}])

    def test_empty_config(self):
        self.run_preflight([{'IPAM': {'Config': []}}])

    def test_valid_subnets(self):
        self.run_preflight([{'IPAM': {'Config': [
            {'Subnet': '172.18.0.0/16'}, {'Subnet': 'fd00::/64'}, {'Gateway': '172.18.0.1'},
        ]}}])

    def test_missing_and_null_ipam(self):
        self.run_preflight([{}, {'IPAM': None}, {'IPAM': {}}])

    def test_conflict_after_null_config_still_rejected(self):
        for subnet in ('10.0.2.0/24', '10.250.3.0/24'):
            with self.subTest(subnet=subnet), self.assertRaisesRegex(SystemExit, 'overlaps'):
                self.run_preflight([{'IPAM': {'Config': None}}, {'IPAM': {'Config': [{'Subnet': subnet}]}}])

    def test_host_route_conflict_still_rejected(self):
        with self.assertRaisesRegex(SystemExit, 'overlaps'):
            self.run_preflight([], routes=[{'dst': '10.250.0.0/16'}])

    def test_no_docker_networks_skips_inspect(self):
        mocked = self.run_preflight([], ids=b'')
        self.assertEqual(mocked.call_count, 2)


if __name__ == '__main__':
    unittest.main()
