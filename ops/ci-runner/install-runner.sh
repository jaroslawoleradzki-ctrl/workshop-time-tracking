#!/usr/bin/env bash
# Run as the NEW dedicated wtt-runner account after administrator prerequisites.
set -euo pipefail
[[ "$(id -un)" == wtt-runner ]] || { echo 'Use the dedicated wtt-runner account'; exit 1; }
[[ "${DOCKER_HOST:-}" == "unix:///run/user/$(id -u)/docker.sock" ]] || { echo 'Dedicated rootless DOCKER_HOST required'; exit 1; }
docker info --format '{{json .SecurityOptions}}' | grep -q rootless || { echo 'Docker must be rootless'; exit 1; }
runner_dir="$HOME/actions-runner-wtt"
[[ ! -e "$runner_dir/.runner" ]] || { echo 'Runner already configured; refusing replacement'; exit 1; }
mkdir -p "$runner_dir"
cd "$runner_dir"
archive=actions-runner-linux-x64-2.338.2.tar.gz
curl -fsSLo "$archive" "https://github.com/actions/runner/releases/download/v2.338.2/$archive"
printf '%s  %s\n' baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40 "$archive" | sha256sum -c -
tar xzf "$archive"
printf 'Paste a short-lived WTT registration token (input hidden): ' >&2
IFS= read -rs runner_registration_token
printf '\n' >&2
./config.sh --unattended --url https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking \
  --token "$runner_registration_token" --name ai-node-wtt --labels wtt --work _work
unset runner_registration_token
printf 'Configured ai-node-wtt. Administrator can now install the supplied service after security prerequisites.\n'
