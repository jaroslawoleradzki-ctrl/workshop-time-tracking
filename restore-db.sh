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

# 1. Verify backup file argument was provided
if [ -z "$1" ]; then
  log "ERROR" "Backup file not provided."
  echo "Usage: ./restore-db.sh <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

# 2. Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  log "ERROR" "Backup file '$BACKUP_FILE' does not exist."
  exit 1
fi

# 3. Verify Docker CLI exists
if ! command -v docker >/dev/null 2>&1; then
  log "ERROR" "Docker CLI is not installed on this system."
  exit 1
fi

# 4. Verify Docker Compose exists
if ! docker compose version >/dev/null 2>&1; then
  log "ERROR" "Docker Compose is not installed on this system."
  exit 1
fi

# 5. Verify postgres container is running
CONTAINER_ID=$(docker compose ps -q "$SERVICE_NAME" --filter "status=running" 2>/dev/null || echo "")
if [ -z "$CONTAINER_ID" ]; then
  log "ERROR" "PostgreSQL container ($SERVICE_NAME) is not running. Restore aborted."
  exit 1
fi

# 6. Display warning and ask for confirmation
echo "=================================================================="
echo "   WARNING: DATABASE RESTORE IN PROGRESS                          "
echo "=================================================================="
echo " THIS WILL COMPLETELY DESTROY ALL CURRENT DATA IN THE DATABASE!   "
echo " Data will be replaced with the contents of:                      "
echo " $BACKUP_FILE"
echo "=================================================================="
echo ""
echo "To confirm, please type exactly 'YES' and press Enter."
echo "Any other input will abort the restore process."
read -r CONFIRMATION

if [ "$CONFIRMATION" != "YES" ]; then
  log "ERROR" "Confirmation failed. Restore aborted."
  exit 1
fi

log "INFO" "Cleaning existing database (dropping and recreating public schema)..."

# 7. Drop and recreate public schema to ensure a clean import state
if ! docker compose exec -T "$SERVICE_NAME" sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"' >/dev/null; then
  log "ERROR" "Failed to clean existing database schema."
  exit 1
fi

log "INFO" "Starting database restore from: $BACKUP_FILE..."

# 8. Execute restore via psql stream
if ! gunzip -c "$BACKUP_FILE" | docker compose exec -T "$SERVICE_NAME" sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null; then
  log "ERROR" "Database restore failed!"
  exit 1
fi

log "INFO" "Database restore completed successfully!"
