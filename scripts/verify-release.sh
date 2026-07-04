#!/bin/bash
# verify-release.sh
# Verifies if the project is ready for a production release.
# This script is strictly read-only and does not modify the git state or source code.

# Exit immediately if a command fails in a pipeline
set -o pipefail

# Parse command line arguments
WITH_DOCKER=false
for arg in "$@"; do
  if [ "$arg" = "--with-docker" ]; then
    WITH_DOCKER=true
  fi
done

# Script directory resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Global indicators
GIT_STATUS="PENDING"
VERSIONS_STATUS="PENDING"
BACKEND_BUILD_STATUS="PENDING"
FRONTEND_BUILD_STATUS="PENDING"
DOCKER_STATUS="SKIPPED"
DOCS_STATUS="PENDING"

FAIL_REASON=""

# Helper log functions
log_fail() {
  FAIL_REASON="$1"
}

# 1. GIT VALIDATION
validate_git() {
  # Check if branch is main or development
  local branch
  branch=$(git branch --show-current 2>/dev/null || echo "")
  if [ "$branch" != "development" ] && [ "$branch" != "main" ]; then
    log_fail "Current branch is '$branch' (must be 'development' or 'main')"
    GIT_STATUS="FAIL"
    return 1
  fi

  # Check if there is a merge in progress
  local git_dir
  git_dir=$(git rev-parse --git-dir 2>/dev/null || echo "")
  if [ -f "$git_dir/MERGE_HEAD" ]; then
    log_fail "A Git merge is currently in progress."
    GIT_STATUS="FAIL"
    return 1
  fi

  # Check if repository has uncommitted changes
  local status_porcelain
  status_porcelain=$(git status --porcelain 2>/dev/null || echo "")
  if [ -n "$status_porcelain" ]; then
    log_fail "Repository is dirty (has uncommitted or untracked changes):\n$status_porcelain"
    GIT_STATUS="FAIL"
    return 1
  fi

  GIT_STATUS="PASS"
  return 0
}

# 2. VERSION CONSISTENCY
validate_versions() {
  local backend_json backend_lock frontend_json frontend_lock docker_compose readme_ver changelog_ver

  # Extract backend versions
  if [ ! -f "backend/package.json" ]; then
    log_fail "Missing backend/package.json"
    VERSIONS_STATUS="FAIL"
    DOCS_STATUS="FAIL"
    return 1
  fi
  backend_json=$(grep '"version"' backend/package.json | head -n 1 | awk -F '"' '{print $4}')

  if [ ! -f "backend/package-lock.json" ]; then
    log_fail "Missing backend/package-lock.json"
    VERSIONS_STATUS="FAIL"
    DOCS_STATUS="FAIL"
    return 1
  fi
  backend_lock=$(grep '"version"' backend/package-lock.json | head -n 1 | awk -F '"' '{print $4}')

  # Extract frontend versions
  if [ ! -f "frontend/package.json" ]; then
    log_fail "Missing frontend/package.json"
    VERSIONS_STATUS="FAIL"
    DOCS_STATUS="FAIL"
    return 1
  fi
  frontend_json=$(grep '"version"' frontend/package.json | head -n 1 | awk -F '"' '{print $4}')

  if [ ! -f "frontend/package-lock.json" ]; then
    log_fail "Missing frontend/package-lock.json"
    VERSIONS_STATUS="FAIL"
    DOCS_STATUS="FAIL"
    return 1
  fi
  frontend_lock=$(grep '"version"' frontend/package-lock.json | head -n 1 | awk -F '"' '{print $4}')

  # Extract docker-compose version
  if [ ! -f "docker-compose.yml" ]; then
    log_fail "Missing docker-compose.yml"
    VERSIONS_STATUS="FAIL"
    return 1
  fi
  docker_compose=$(grep 'APP_VERSION:' docker-compose.yml | head -n 1 | sed -E 's/.*APP_VERSION:[[:space:]]*["'\'']?([^"'\''[:space:]]+)["'\'']?.*/\1/')

  # Extract documentation versions
  if [ ! -f "README.md" ]; then
    log_fail "Missing README.md"
    DOCS_STATUS="FAIL"
    return 1
  fi
  readme_ver=$(grep 'Aktualna wersja' README.md | head -n 1 | sed -E 's/.*`([0-9]+\.[0-9]+\.[0-9]+)`.*/\1/')

  if [ ! -f "CHANGELOG.md" ]; then
    log_fail "Missing CHANGELOG.md"
    DOCS_STATUS="FAIL"
    return 1
  fi
  changelog_ver=$(grep -E '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | head -n 1 | sed -E 's/## \[([0-9]+\.[0-9]+\.[0-9]+)\].*/\1/')

  # Verification output list for debug
  local version_mismatch=0
  local reason=""

  if [ "$backend_json" != "$backend_lock" ]; then
    reason="${reason}- backend/package.json ($backend_json) != backend/package-lock.json ($backend_lock)\n"
    version_mismatch=1
  fi
  if [ "$backend_json" != "$frontend_json" ]; then
    reason="${reason}- backend/package.json ($backend_json) != frontend/package.json ($frontend_json)\n"
    version_mismatch=1
  fi
  if [ "$frontend_json" != "$frontend_lock" ]; then
    reason="${reason}- frontend/package.json ($frontend_json) != frontend/package-lock.json ($frontend_lock)\n"
    version_mismatch=1
  fi
  if [ "$backend_json" != "$docker_compose" ]; then
    reason="${reason}- backend/package.json ($backend_json) != docker-compose.yml ($docker_compose)\n"
    version_mismatch=1
  fi

  if [ $version_mismatch -eq 1 ]; then
    log_fail "Version mismatch detected in config files:\n$reason"
    VERSIONS_STATUS="FAIL"
    return 1
  fi

  VERSIONS_STATUS="PASS"

  # Verify docs versions
  local docs_mismatch=0
  local docs_reason=""
  if [ "$backend_json" != "$readme_ver" ]; then
    docs_reason="${docs_reason}- packages ($backend_json) != README.md ($readme_ver)\n"
    docs_mismatch=1
  fi
  if [ "$backend_json" != "$changelog_ver" ]; then
    docs_reason="${docs_reason}- packages ($backend_json) != CHANGELOG.md ($changelog_ver)\n"
    docs_mismatch=1
  fi

  if [ $docs_mismatch -eq 1 ]; then
    log_fail "Version mismatch in documentation files:\n$docs_reason"
    DOCS_STATUS="FAIL"
    return 1
  fi

  DOCS_STATUS="PASS"
  return 0
}

# 3. BUILD VALIDATION
validate_builds() {
  # Backend build
  if ! (cd backend && npm run build >/dev/null 2>&1); then
    log_fail "Backend compilation failed. Run 'npm run build' inside backend/ to diagnose."
    BACKEND_BUILD_STATUS="FAIL"
    return 1
  fi
  BACKEND_BUILD_STATUS="PASS"

  # Frontend build
  if ! (cd frontend && npm run build >/dev/null 2>&1); then
    log_fail "Frontend compilation failed. Run 'npm run build' inside frontend/ to diagnose."
    FRONTEND_BUILD_STATUS="FAIL"
    return 1
  fi
  FRONTEND_BUILD_STATUS="PASS"

  return 0
}

# 4. DOCKER VALIDATION
validate_docker() {
  DOCKER_STATUS="PENDING"
  if ! command -v docker >/dev/null 2>&1; then
    log_fail "Docker CLI is not installed on this system."
    DOCKER_STATUS="FAIL"
    return 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    log_fail "Docker Compose is not installed on this system."
    DOCKER_STATUS="FAIL"
    return 1
  fi

  if ! docker compose config >/dev/null 2>&1; then
    log_fail "Docker Compose configuration is invalid. Run 'docker compose config' to diagnose."
    DOCKER_STATUS="FAIL"
    return 1
  fi

  DOCKER_STATUS="PASS"
  return 0
}

# Main Execution Flow
echo "========================================="
echo "Release Validation"
echo "========================================="

# Run validations one by one. If one fails, we print status and stop.
if validate_git; then
  if validate_versions; then
    if validate_builds; then
      if [ "$WITH_DOCKER" = true ]; then
        validate_docker || true
      fi
    fi
  fi
fi

# Format results
echo "Git....................... $GIT_STATUS"
echo "Versions.................. $VERSIONS_STATUS"
echo "Backend Build............. $BACKEND_BUILD_STATUS"
echo "Frontend Build............ $FRONTEND_BUILD_STATUS"
echo "Docker Compose............ $DOCKER_STATUS"
echo "Documentation............. $DOCS_STATUS"
echo "========================================="

if [ "$GIT_STATUS" = "PASS" ] && \
   [ "$VERSIONS_STATUS" = "PASS" ] && \
   [ "$BACKEND_BUILD_STATUS" = "PASS" ] && \
   [ "$FRONTEND_BUILD_STATUS" = "PASS" ] && \
   ( [ "$WITH_DOCKER" = false ] || [ "$DOCKER_STATUS" = "PASS" ] ) && \
   [ "$DOCS_STATUS" = "PASS" ]; then
  echo "RESULT: RELEASE VALIDATION PASSED"
  echo "========================================="
  exit 0
else
  echo "RESULT: RELEASE VALIDATION FAILED"
  echo "========================================="
  echo "Reason:"
  echo -e "$FAIL_REASON"
  exit 1
fi
