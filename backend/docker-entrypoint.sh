#!/bin/sh
set -e

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Running database seeding..."
node dist/prisma/seed.js

echo "Starting backend application..."
exec node dist/index.js
