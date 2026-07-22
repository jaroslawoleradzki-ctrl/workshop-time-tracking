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
RUNTIME_CONFIG_STATUS="PENDING"
VERSIONS_STATUS="PENDING"
LOCKFILES_STATUS="PENDING"
BACKEND_BUILD_STATUS="PENDING"
FRONTEND_BUILD_STATUS="PENDING"
BACKEND_TESTS_STATUS="PENDING"
FRONTEND_TESTS_STATUS="PENDING"
DOCKER_STATUS="SKIPPED"
DOCS_STATUS="PENDING"

FAIL_REASON=""

# Helper log functions
log_fail() {
  FAIL_REASON="$1"
}

# 1. GIT VALIDATION
validate_git() {
  # Release checks can be prepared on the release feature branch and repeated
  # on the integration/production branches.
  local branch
  branch=$(git branch --show-current 2>/dev/null || echo "")
  case "$branch" in
    main|development|feature/*) ;;
    *)
      log_fail "Current branch is '$branch' (expected 'main', 'development', or 'feature/*')"
      GIT_STATUS="FAIL"
      return 1
      ;;
  esac

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

# 2. RUNTIME CONFIGURATION HYGIENE
validate_runtime_config() {
  local required_variable

  if git ls-files | grep -Eq '(^|/)\.env$'; then
    log_fail "A local .env file is tracked by Git. Remove it from the index before release."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  if [ ! -f ".env.example" ]; then
    log_fail "Missing root .env.example."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  for required_variable in \
    WTT_POSTGRES_USER \
    WTT_POSTGRES_PASSWORD \
    WTT_POSTGRES_DB \
    WTT_JWT_SECRET \
    WTT_POSTGRES_VOLUME \
    WTT_HTTP_PORT \
    WTT_BACKEND_HOST_PORT \
    WTT_POSTGRES_HOST_PORT \
    WTT_LOG_LEVEL; do
    if ! grep -q "^${required_variable}=" .env.example; then
      log_fail "Root .env.example is missing ${required_variable}."
      RUNTIME_CONFIG_STATUS="FAIL"
      return 1
    fi
  done

  if ! git check-ignore -q .env || \
     ! git check-ignore -q backend/.env || \
     ! git check-ignore -q frontend/.env; then
    log_fail "Local root/backend/frontend .env files are not all ignored by Git."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  if git check-ignore -q .env.example || git check-ignore -q backend/.env.example; then
    log_fail "An example environment file is unexpectedly ignored by Git."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  for required_variable in \
    WTT_POSTGRES_USER \
    WTT_POSTGRES_PASSWORD \
    WTT_POSTGRES_DB \
    WTT_JWT_SECRET \
    WTT_POSTGRES_VOLUME; do
    if ! grep -Fq "\${${required_variable}:?" docker-compose.yml; then
      log_fail "docker-compose.yml does not require ${required_variable}."
      RUNTIME_CONFIG_STATUS="FAIL"
      return 1
    fi
  done

  if ! grep -Eq 'APP_VERSION:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' docker-compose.yml || \
     grep -Eq 'APP_VERSION:.*\$\{' docker-compose.yml; then
    log_fail "APP_VERSION must remain a literal semantic version in docker-compose.yml."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  if grep -REqs 'process\.env\.JWT_SECRET[[:space:]]*(\|\||\?\?)' backend/src; then
    log_fail "Backend source contains a JWT_SECRET fallback."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  if grep -Eq '^WTT_(POSTGRES_PASSWORD|JWT_SECRET)=.+' .env.example; then
    log_fail "Secret values in root .env.example must remain empty."
    RUNTIME_CONFIG_STATUS="FAIL"
    return 1
  fi

  RUNTIME_CONFIG_STATUS="PASS"
  return 0
}

# 3. VERSION CONSISTENCY
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

# 4. PACKAGE-LOCK DIRECT DEPENDENCY CONSISTENCY
validate_lockfiles() {
  local project

  for project in backend frontend; do
    if ! node - "$project/package.json" "$project/package-lock.json" <<'NODE'
const fs = require('fs');

const manifestPath = process.argv[2];
const lockfilePath = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
const lockRoot = lockfile.packages && lockfile.packages[''];

if (!lockRoot) {
  console.error(`${lockfilePath}: missing packages[\"\"] metadata`);
  process.exit(1);
}

const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const mismatches = [];

for (const section of sections) {
  const expected = manifest[section] || {};
  const actual = lockRoot[section] || {};
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);

  for (const name of names) {
    if (expected[name] !== actual[name]) {
      mismatches.push(`${section}.${name}: package.json=${expected[name] ?? '<missing>'}, package-lock.json=${actual[name] ?? '<missing>'}`);
    }
  }
}

if (mismatches.length > 0) {
  console.error(`${manifestPath} and ${lockfilePath} have inconsistent direct dependencies:`);
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}
NODE
    then
      log_fail "Direct dependency metadata differs between ${project}/package.json and package-lock.json."
      LOCKFILES_STATUS="FAIL"
      return 1
    fi
  done

  LOCKFILES_STATUS="PASS"
  return 0
}

# 5. BUILD VALIDATION
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

# 6. BACKEND TESTS VALIDATION
validate_backend_tests() {
  if ! (cd backend && npm test >/dev/null 2>&1); then
    log_fail "Backend automated tests failed. Run 'npm test' inside backend/ to diagnose."
    BACKEND_TESTS_STATUS="FAIL"
    return 1
  fi
  BACKEND_TESTS_STATUS="PASS"
  return 0
}

# 7. FRONTEND TESTS VALIDATION
validate_frontend_tests() {
  if ! (cd frontend && npm test >/dev/null 2>&1); then
    log_fail "Frontend automated tests failed. Run 'npm test' inside frontend/ to diagnose."
    FRONTEND_TESTS_STATUS="FAIL"
    return 1
  fi
  FRONTEND_TESTS_STATUS="PASS"
  return 0
}

# 8. DOCKER VALIDATION
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

  # Use synthetic non-production values and suppress rendered configuration so
  # credentials can never be printed by this verification step.
  if ! WTT_POSTGRES_USER=verify_user \
       WTT_POSTGRES_PASSWORD=verify_database_password \
       WTT_POSTGRES_DB=verify_database \
       WTT_JWT_SECRET=verify_jwt_secret_for_release_validation \
       WTT_POSTGRES_VOLUME=verify-pgdata \
       WTT_HTTP_PORT=18080 \
       WTT_BACKEND_HOST_PORT=15000 \
       WTT_POSTGRES_HOST_PORT=15432 \
       WTT_LOG_LEVEL=info \
       docker compose --env-file .env.example config >/dev/null 2>&1; then
    log_fail "Docker Compose configuration is invalid with safe verification values."
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
  if validate_runtime_config; then
    if validate_versions; then
      if validate_lockfiles; then
        if validate_builds; then
          if validate_backend_tests; then
            if validate_frontend_tests; then
              if [ "$WITH_DOCKER" = true ]; then
                validate_docker || true
              fi
            fi
          fi
        fi
      fi
    fi
  fi
fi

# Format results
echo "Git....................... $GIT_STATUS"
echo "Runtime Configuration..... $RUNTIME_CONFIG_STATUS"
echo "Versions.................. $VERSIONS_STATUS"
echo "Package Lockfiles......... $LOCKFILES_STATUS"
echo "Backend Build............. $BACKEND_BUILD_STATUS"
echo "Frontend Build............ $FRONTEND_BUILD_STATUS"
echo "Backend Tests............ $BACKEND_TESTS_STATUS"
echo "Frontend Tests........... $FRONTEND_TESTS_STATUS"
echo "Docker Compose............ $DOCKER_STATUS"
echo "Documentation............. $DOCS_STATUS"
echo "========================================="

if [ "$GIT_STATUS" = "PASS" ] && \
   [ "$RUNTIME_CONFIG_STATUS" = "PASS" ] && \
   [ "$VERSIONS_STATUS" = "PASS" ] && \
   [ "$LOCKFILES_STATUS" = "PASS" ] && \
   [ "$BACKEND_BUILD_STATUS" = "PASS" ] && \
   [ "$FRONTEND_BUILD_STATUS" = "PASS" ] && \
   [ "$BACKEND_TESTS_STATUS" = "PASS" ] && \
   [ "$FRONTEND_TESTS_STATUS" = "PASS" ] && \
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
