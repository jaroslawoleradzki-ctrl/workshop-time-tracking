#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Running database seeding..."
node dist/prisma/seed.js

echo "Starting backend application..."
exec node dist/index.js
