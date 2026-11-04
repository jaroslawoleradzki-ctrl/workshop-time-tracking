"""Run real shell helpers with command spies; no host changes or sudo."""
from pathlib import Path
import subprocess
import unittest

FUNCTIONS = Path(__file__).resolve().parents[1] / 'prepare-host-functions.sh'
SCRIPT = FUNCTIONS.with_name('prepare-host.sh')


class RerunTests(unittest.TestCase):
    def run_helper(self, scenario, commands='ensure_rootless_docker'):
        return subprocess.run(['bash', '-eu', '-c', '''
source "$1"
scenario="$2"
ready=0
account=wtt-runner
runner_home=/home/wtt-runner
install() { printf 'INSTALL %s\\n' "$*"; }
as_runner() {
  printf 'CALL %s\\n' "$*" >&2
  if [[ "$1 $2" == 'docker info' ]]; then
    case "$scenario" in
      running) echo '["name=rootless"]';;
      stopped_ready|fresh_ready) [[ $ready == 1 ]] && echo '["name=rootless"]';;
      rootful) echo '["name=seccomp"]';;
      *) return 1;;
    esac
  elif [[ "$*" == 'systemctl --user cat docker.service' ]]; then
    [[ "$scenario" == stopped || "$scenario" == stopped_ready ]]
  elif [[ "$*" == 'systemctl --user enable --now docker' ]]; then
    ready=1
  fi
}
eval "$3"
''', 'test', str(FUNCTIONS), scenario, commands], text=True, capture_output=True)

    def test_running_rootless_is_not_reinstalled_or_restarted(self):
        result = self.run_helper('running')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('setuptool', result.stderr)
        self.assertNotIn('--now', result.stderr)
        self.assertIn('systemctl --user enable docker', result.stderr)

    def test_rootful_socket_is_rejected(self):
        result = self.run_helper('rootful')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('systemctl', result.stderr)
        self.assertNotIn('setuptool', result.stderr)

    def test_existing_stopped_service_is_not_reinstalled(self):
        result = self.run_helper('stopped')
        self.assertNotIn('setuptool', result.stderr)
        self.assertIn('systemctl --user enable --now docker', result.stderr)
        self.assertNotEqual(result.returncode, 0)  # Still unavailable: cannot claim success.

    def test_missing_service_installs_then_checks_readiness(self):
        result = self.run_helper('missing')
        self.assertEqual(result.stderr.count('CALL dockerd-rootless-setuptool.sh install'), 1)
        self.assertNotEqual(result.returncode, 0)  # Simulated installation did not produce a daemon.

    def test_successful_start_of_existing_service(self):
        result = self.run_helper('stopped_ready')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('setuptool', result.stderr)

    def test_successful_first_install(self):
        result = self.run_helper('fresh_ready')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr.count('CALL dockerd-rootless-setuptool.sh install'), 1)

    def test_config_and_child_have_explicit_owner(self):
        result = self.run_helper('running', 'prepare_runner_directories "$account" "$runner_home"')
        self.assertEqual(result.returncode, 0)
        self.assertIn('-o wtt-runner -g wtt-runner -m 700 /home/wtt-runner/.config /home/wtt-runner/.config/docker', result.stdout)

    def test_protected_manager_allows_required_tmp(self):
        script = SCRIPT.read_text()
        self.assertIn('ProtectSystem=strict', script)
        self.assertIn('ReadWritePaths=/home/wtt-runner /run/user/%s /tmp', script)
        self.assertNotIn('systemctl restart', script)

    def test_existing_daemon_config_is_not_overwritten(self):
        block = SCRIPT.read_text().split('# Preserve an existing daemon configuration on every rerun.\n', 1)[1].split('\ninstall -o ', 1)[0]
        import tempfile
        with tempfile.TemporaryDirectory() as home:
            directory = Path(home) / '.config/docker'
            directory.mkdir(parents=True)
            config = directory / 'daemon.json'
            config.write_text('{"existing":"preserve"}\n')
            result = subprocess.run(['bash', '-eu', '-c', 'runner_home="$1"\n' + block, 'test', home], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(config.read_text(), '{"existing":"preserve"}\n')


if __name__ == '__main__':
    unittest.main()
