#!/bin/sh
set -e

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${SKIP_DB_SEED:-}" = "true" ]; then
  echo "Skipping database seeding (SKIP_DB_SEED=true)."
else
  echo "Running database seeding..."
  node dist/prisma/seed.js
fi

echo "Starting backend application..."
exec node dist/index.js
