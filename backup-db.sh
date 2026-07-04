#!/bin/bash
set -e

# Logging helper
log() {
  local level="$1"
  local message="$2"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${level} ${message}"
}

# Resolve script directory and change to it
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
SERVICE_NAME="postgres"
BACKUP_DIR="backups"

# 1. Docker Verification
if ! command -v docker >/dev/null 2>&1; then
  log "ERROR" "Docker is not available. Please install Docker first."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  log "ERROR" "Docker Compose is not available. Please install Docker Compose first."
  exit 1
fi

# 2. Container Verification
CONTAINER_ID=$(docker compose ps -q "$SERVICE_NAME" --filter "status=running" 2>/dev/null || echo "")
if [ -z "$CONTAINER_ID" ]; then
  log "ERROR" "PostgreSQL container ($SERVICE_NAME) is not running. Backup aborted."
  exit 1
fi

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate filename
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="${BACKUP_DIR}/time_reporting_${TIMESTAMP}.sql.gz"

log "INFO" "Starting database backup..."

# Run pg_dump inside the postgres service using container env variables
if ! docker compose exec -T "$SERVICE_NAME" sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$FILENAME"; then
  log "ERROR" "Database backup failed during pg_dump execution."
  # Remove incomplete file if it exists
  rm -f "$FILENAME"
  exit 1
fi

log "INFO" "Backup completed successfully!"
log "INFO" "Saved to: $FILENAME"

# 3. Backup Rotation (Remove files older than 30 days)
log "INFO" "Running backup rotation (retention: 30 days)..."

DELETED_COUNT=0
# Loop through files that are older than 30 days and delete them
while IFS= read -r file; do
  if [ -n "$file" ]; then
    log "INFO" "Deleting obsolete backup: $file"
    rm -f "$file"
    DELETED_COUNT=$((DELETED_COUNT + 1))
  fi
done < <(find "$BACKUP_DIR" -type f -name "time_reporting_*.sql.gz" -mtime +30 2>/dev/null || true)

log "INFO" "Backup rotation completed. Deleted $DELETED_COUNT obsolete backup file(s)."
