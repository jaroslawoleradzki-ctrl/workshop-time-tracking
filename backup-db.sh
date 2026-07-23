#!/bin/bash
set -euo pipefail

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

# 3. Backup Rotation (Retain only 10 newest backups)
log "INFO" "Running backup rotation (retention: 10 newest backups)..."

shopt -s nullglob
files=( "$BACKUP_DIR"/time_reporting_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9]-[0-9][0-9]-[0-9][0-9].sql.gz )
shopt -u nullglob

num_files=${#files[@]}

if [ "$num_files" -le 10 ]; then
  log "INFO" "No old backups to delete (total backups: $num_files)."
else
  limit=$((num_files - 10))
  log "INFO" "Found $num_files backups. Retaining 10 newest, deleting $limit oldest..."
  DELETED_COUNT=0
  for ((i=0; i<limit; i++)); do
    file="${files[i]}"
    if [ -f "$file" ]; then
      log "INFO" "Deleting obsolete backup: $file"
      rm -f "$file"
      DELETED_COUNT=$((DELETED_COUNT + 1))
    fi
  done
  log "INFO" "Backup rotation completed. Deleted $DELETED_COUNT obsolete backup file(s)."
fi
