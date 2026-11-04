#!/usr/bin/env bash
# Trusted WTT runner only. No sudo, socket permissions or FINNARO changes.
set -euo pipefail
[[ $(id -un) == cloud ]] || { echo 'Use cloud on AI-node'; exit 1; }
[[ $(hostname) == ai-node ]] || exit 1
export DOCKER_HOST=unix:///var/run/docker.sock
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY
options="$(docker info --format '{{json .SecurityOptions}}')"
[[ "$options" != *rootless* ]] || { echo 'System Docker required'; exit 1; }
runner_dir=/home/cloud/actions-runner-wtt
[[ ! -e "$runner_dir/.runner" ]] || { echo 'WTT runner already registered; refusing replacement'; exit 1; }
mkdir -p "$runner_dir/home" "$runner_dir/_work" "$runner_dir/_tool"
chmod 700 "$runner_dir" "$runner_dir/home"
export HOME="$runner_dir/home" DOCKER_CONFIG="$runner_dir/home/.docker"
cd "$runner_dir"
archive=actions-runner-linux-x64-2.338.2.tar.gz
curl -fsSLo "$archive" "https://github.com/actions/runner/releases/download/v2.338.2/$archive"
printf '%s  %s\n' baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40 "$archive" | sha256sum -c -
tar xzf "$archive"
IFS= read -rs runner_registration_token
[[ -n "$runner_registration_token" ]]
./config.sh --unattended --url https://github.com/jaroslawoleradzki-ctrl/workshop-time-tracking \
  --token "$runner_registration_token" --name ai-node-wtt --labels wtt --work _work
unset runner_registration_token
