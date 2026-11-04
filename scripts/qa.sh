#!/usr/bin/env bash
set -euo pipefail
export TZ=UTC
cd "$(dirname "$0")/.."
required_node="$(cat .node-version)"
[[ "$(node -v)" == "v${required_node}" ]] || { echo "Use Node ${required_node}" >&2; exit 1; }
python3 -m unittest discover -s ops/ci-runner/tests -v
docker info >/dev/null
qa_container=""
cleanup() { if [[ -n "$qa_container" ]]; then docker rm -f "$qa_container" >/dev/null; fi; }
trap cleanup EXIT
if [[ -z "${QA_DATABASE_PORT:-}" ]]; then
  qa_container="wtt-qa-${USER:-runner}-$$"
  docker run -d --name "$qa_container" -e POSTGRES_PASSWORD=wtt_disposable_test_only -e POSTGRES_DB=wtt_accounting_test -p 127.0.0.1::5432 postgres:15-alpine >/dev/null
  for attempt in {1..40}; do
    if docker exec "$qa_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  QA_DATABASE_PORT="$(docker port "$qa_container" 5432/tcp | awk -F: '{print $NF}')"
fi
[[ "$QA_DATABASE_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid QA PostgreSQL port'; exit 1; }
# Fixed loopback and dedicated database name: never accept a client/DEV/DEMO URL.
export DATABASE_URL="postgresql://postgres:wtt_disposable_test_only@127.0.0.1:${QA_DATABASE_PORT}/wtt_accounting_test"
export WTT_ACCOUNTING_TEST_URL="$DATABASE_URL"
export WTT_QA_REQUIRED=1
(cd backend && npm ci)
(cd frontend && npm ci)
(cd backend && npx prisma generate && npx prisma validate)
node scripts/qa/prepare-database.mjs
(cd backend && npm run build && npm test)
(cd frontend && npm run lint && npm run build && npm test && npm run docs:validate)
docker run --rm -v "$PWD:/repo:ro" -w /repo rhysd/actionlint@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9 .github/workflows/ci.yml
node scripts/qa/dependency-audit.mjs
printf '\nPASS: full WTT QA (tests, PostgreSQL regressions, fresh/upgrade migrations, types, lint, builds, Prisma, docs, dependency audit)\n'
