#!/bin/bash
# verify-release.sh
# Verifies if the project is ready for a production release.
# This script is strictly read-only and does not modify the git state or source code.

# Exit immediately if a command fails in a pipeline
set -o pipefail

# Parse command line arguments
WITH_DOCKER=false
EXPECTED_BRANCH=""

usage() {
  echo "Usage: $0 [--with-docker] [--branch <name>]"
  echo ""
  echo "By default, allowed branches are:"
  echo "  main"
  echo "  development"
  echo "  feature/0.3.0-deployment-stability"
  echo ""
  echo "--branch <name> replaces the default allowlist with exactly <name>."
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-docker)
      WITH_DOCKER=true
      shift
      ;;
    --branch)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "ERROR: --branch requires a non-empty branch name." >&2
        usage >&2
        exit 2
      fi
      EXPECTED_BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument '$1'." >&2
      usage >&2
      exit 2
      ;;
  esac
done

DEFAULT_ALLOWED_BRANCHES=(
  "main"
  "development"
  "feature/0.3.0-deployment-stability"
)

if [ -n "$EXPECTED_BRANCH" ]; then
  ALLOWED_BRANCHES=("$EXPECTED_BRANCH")
else
  ALLOWED_BRANCHES=("${DEFAULT_ALLOWED_BRANCHES[@]}")
fi

# Script directory resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Global indicators
GIT_STATUS="PENDING"
REQUIRED_FILES_STATUS="PENDING"
RUNTIME_CONFIG_STATUS="PENDING"
VERSIONS_STATUS="PENDING"
LOCKFILES_STATUS="PENDING"
BACKEND_BUILD_STATUS="PENDING"
FRONTEND_BUILD_STATUS="PENDING"
BACKEND_TESTS_STATUS="PENDING"
FRONTEND_TESTS_STATUS="PENDING"
DOCKER_STATUS="SKIPPED"
DOCS_STATUS="PENDING"
FINAL_GIT_STATUS="PENDING"

FAIL_REASON=""

# Helper log functions
log_fail() {
  if [ -n "$FAIL_REASON" ]; then
    FAIL_REASON="${FAIL_REASON}\n$1"
  else
    FAIL_REASON="$1"
  fi
}

# 1. REQUIRED FILES
validate_required_files() {
  local required_file
  local missing_files=""

  for required_file in \
    .gitignore \
    .env.example \
    docker-compose.yml \
    backend/.env.example \
    backend/Dockerfile \
    backend/docker-entrypoint.sh \
    backend/package.json \
    backend/package-lock.json \
    frontend/Dockerfile \
    frontend/package.json \
    frontend/package-lock.json \
    nginx/nginx.conf \
    README.md \
    CHANGELOG.md; do
    if [ ! -f "$required_file" ]; then
      missing_files="${missing_files}- ${required_file}\n"
    fi
  done

  if [ -n "$missing_files" ]; then
    log_fail "Missing required file(s):\n${missing_files}"
    REQUIRED_FILES_STATUS="FAIL"
    return 1
  fi

  REQUIRED_FILES_STATUS="PASS"
  return 0
}

# 2. GIT VALIDATION
validate_git() {
  local branch allowed_branch branch_allowed
  branch=$(git branch --show-current 2>/dev/null || echo "")
  branch_allowed=false

  for allowed_branch in "${ALLOWED_BRANCHES[@]}"; do
    if [ "$branch" = "$allowed_branch" ]; then
      branch_allowed=true
      break
    fi
  done

  if [ "$branch_allowed" != true ]; then
    log_fail "Current branch is '$branch'. Allowed branch(es): ${ALLOWED_BRANCHES[*]}"
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
  if ! status_porcelain=$(git status --porcelain 2>/dev/null); then
    log_fail "Unable to read Git working tree status."
    GIT_STATUS="FAIL"
    return 1
  fi
  if [ -n "$status_porcelain" ]; then
    log_fail "Repository is dirty (has uncommitted or untracked changes):\n$status_porcelain"
    GIT_STATUS="FAIL"
    return 1
  fi

  GIT_STATUS="PASS"
  return 0
}

# 3. RUNTIME CONFIGURATION HYGIENE
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

# 4. VERSION CONSISTENCY
validate_versions() {
  local package_version readme_ver changelog_ver

  if ! node <<'NODE'
const fs = require('fs');

const versionFiles = [
  'backend/package.json',
  'backend/package-lock.json',
  'frontend/package.json',
  'frontend/package-lock.json',
];
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const errors = [];
const versions = new Map();

function isValidSemver(version) {
  const match = semverPattern.exec(version);
  if (!match) return false;

  const prerelease = match[4];
  if (!prerelease) return true;

  return prerelease.split('.').every((identifier) => {
    return !(/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'));
  });
}

for (const file of versionFiles) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${file}: cannot read valid JSON (${error.message})`);
    continue;
  }

  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    errors.push(`${file}: missing or empty version field`);
    continue;
  }

  const version = parsed.version;
  if (!isValidSemver(version)) {
    errors.push(`${file}: invalid semantic version '${version}'`);
    continue;
  }

  versions.set(file, version);
}

if (versions.size === versionFiles.length) {
  const distinctVersions = new Set(versions.values());
  if (distinctVersions.size !== 1) {
    errors.push('Package version mismatch:');
    for (const [file, version] of versions) errors.push(`- ${file}: ${version}`);
  }
}

let appVersion = '';
try {
  const composeLines = fs.readFileSync('docker-compose.yml', 'utf8').split(/\r?\n/);
  const appVersionLines = composeLines.filter((line) => /^\s*APP_VERSION\s*:/.test(line));

  if (appVersionLines.length !== 1) {
    errors.push(`docker-compose.yml: expected exactly one APP_VERSION entry, found ${appVersionLines.length}`);
  } else {
    const rawValue = appVersionLines[0].replace(/^\s*APP_VERSION\s*:/, '').trim();
    const quotedValue = rawValue.match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
    const plainValue = rawValue.match(/^([^\s#]+)(?:\s+#.*)?$/);
    appVersion = quotedValue ? quotedValue[2] : plainValue ? plainValue[1] : '';

    if (appVersion === '') {
      errors.push('docker-compose.yml: APP_VERSION is empty or malformed');
    } else if (!isValidSemver(appVersion)) {
      errors.push(`docker-compose.yml: APP_VERSION '${appVersion}' is not valid semver`);
    }
  }
} catch (error) {
  errors.push(`docker-compose.yml: cannot read APP_VERSION (${error.message})`);
}

const packageVersion = versions.get('backend/package.json') || '';
if (packageVersion && appVersion && packageVersion !== appVersion) {
  errors.push(`Version mismatch: packages use ${packageVersion}, docker-compose.yml uses ${appVersion}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

NODE
  then
    log_fail "Package and Docker Compose version validation failed; see details above."
    VERSIONS_STATUS="FAIL"
    DOCS_STATUS="FAIL"
    return 1
  fi

  package_version=$(node -p "require('./backend/package.json').version")

  # Extract documentation versions
  readme_ver=$(grep 'Aktualna wersja' README.md | head -n 1 | sed -E 's/.*`([0-9]+\.[0-9]+\.[0-9]+)`.*/\1/')
  changelog_ver=$(grep -E '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | head -n 1 | sed -E 's/## \[([0-9]+\.[0-9]+\.[0-9]+)\].*/\1/')

  VERSIONS_STATUS="PASS"

  # Verify docs versions
  local docs_mismatch=0
  local docs_reason=""
  if [ "$package_version" != "$readme_ver" ]; then
    docs_reason="${docs_reason}- packages ($package_version) != README.md ($readme_ver)\n"
    docs_mismatch=1
  fi
  if [ "$package_version" != "$changelog_ver" ]; then
    docs_reason="${docs_reason}- packages ($package_version) != CHANGELOG.md ($changelog_ver)\n"
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

# 5. PACKAGE-LOCK DIRECT DEPENDENCY CONSISTENCY
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

# 6. BUILD VALIDATION
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

# 7. BACKEND TESTS VALIDATION
validate_backend_tests() {
  if ! (cd backend && npm test >/dev/null 2>&1); then
    log_fail "Backend automated tests failed. Run 'npm test' inside backend/ to diagnose."
    BACKEND_TESTS_STATUS="FAIL"
    return 1
  fi
  BACKEND_TESTS_STATUS="PASS"
  return 0
}

# 8. FRONTEND TESTS VALIDATION
validate_frontend_tests() {
  if ! (cd frontend && npm test >/dev/null 2>&1); then
    log_fail "Frontend automated tests failed. Run 'npm test' inside frontend/ to diagnose."
    FRONTEND_TESTS_STATUS="FAIL"
    return 1
  fi
  FRONTEND_TESTS_STATUS="PASS"
  return 0
}

# 9. DOCKER VALIDATION
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

# 10. FINAL GIT CLEANLINESS
validate_final_git() {
  local status_porcelain

  if ! status_porcelain=$(git status --porcelain 2>/dev/null); then
    log_fail "Unable to read final Git working tree status."
    FINAL_GIT_STATUS="FAIL"
    return 1
  fi

  if [ -n "$status_porcelain" ]; then
    log_fail "Verification commands changed the repository or created untracked files:\n$status_porcelain"
    FINAL_GIT_STATUS="FAIL"
    return 1
  fi

  FINAL_GIT_STATUS="PASS"
  return 0
}

# Main Execution Flow
echo "========================================="
echo "Release Validation"
echo "========================================="

# Run validations one by one. If one fails, we print status and stop.
if validate_required_files; then
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
                validate_final_git || true
              fi
            fi
          fi
        fi
      fi
    fi
  fi
fi

# Format results
echo "Required Files............ $REQUIRED_FILES_STATUS"
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
echo "Final Git Cleanliness..... $FINAL_GIT_STATUS"
echo "========================================="

if [ "$REQUIRED_FILES_STATUS" = "PASS" ] && \
   [ "$GIT_STATUS" = "PASS" ] && \
   [ "$RUNTIME_CONFIG_STATUS" = "PASS" ] && \
   [ "$VERSIONS_STATUS" = "PASS" ] && \
   [ "$LOCKFILES_STATUS" = "PASS" ] && \
   [ "$BACKEND_BUILD_STATUS" = "PASS" ] && \
   [ "$FRONTEND_BUILD_STATUS" = "PASS" ] && \
   [ "$BACKEND_TESTS_STATUS" = "PASS" ] && \
   [ "$FRONTEND_TESTS_STATUS" = "PASS" ] && \
   ( [ "$WITH_DOCKER" = false ] || [ "$DOCKER_STATUS" = "PASS" ] ) && \
   [ "$DOCS_STATUS" = "PASS" ] && \
   [ "$FINAL_GIT_STATUS" = "PASS" ]; then
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
