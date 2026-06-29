#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
SERVICE_NAME="postgres"
BACKUP_DIR="backups"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate filename
FILENAME="${BACKUP_DIR}/time_reporting_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

echo "Starting database backup..."

# Run pg_dump inside the postgres service using container env variables
docker compose exec -T "$SERVICE_NAME" sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$FILENAME"

echo "Backup completed successfully!"
echo "Saved to: $FILENAME"
