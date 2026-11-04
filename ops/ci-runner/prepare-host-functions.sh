#!/usr/bin/env bash
# Sourced by prepare-host.sh; functions are also exercised without privileges.
prepare_runner_directories() {
  local account="$1" runner_home="$2"
  # install -d on a child alone can leave the intermediate .config owned by root.
  install -d -o "$account" -g "$account" -m 700 \
    "$runner_home/.config" "$runner_home/.config/docker"
}

ensure_rootless_docker() {
  local security_options
  if security_options="$(as_runner docker info --format '{{json .SecurityOptions}}' 2>/dev/null)"; then
    [[ "$security_options" == *'name=rootless'* ]] || {
      echo 'Dedicated socket responds but is not rootless; refusing changes' >&2
      return 1
    }
    echo 'Rootless Docker already running; preserving installation and daemon configuration'
    as_runner systemctl --user enable docker
    return
  fi
  if as_runner systemctl --user cat docker.service >/dev/null 2>&1; then
    echo 'Existing Docker service found; starting without reinstalling'
  else
    as_runner dockerd-rootless-setuptool.sh install
  fi
  as_runner systemctl --user enable --now docker
  security_options="$(as_runner docker info --format '{{json .SecurityOptions}}')" || return 1
  [[ "$security_options" == *'name=rootless'* ]] || {
    echo 'Rootless Docker verification failed; refusing to continue' >&2
    return 1
  }
}
