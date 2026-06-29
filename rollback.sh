#!/bin/bash
set -e

# Change directory to where the script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check if commit hash argument is provided
if [ -z "$1" ]; then
  echo "Error: Commit hash not provided."
  echo "Usage: ./rollback.sh <commit_hash>"
  echo ""
  echo "Last 10 commits:"
  git log --oneline -10
  exit 1
fi

COMMIT_HASH="$1"

echo "=================================================================="
echo "WARNING: Rollback will update the application code to: $COMMIT_HASH"
echo "It does NOT automatically restore or rollback the database."
echo "If database schema changes or data loss occurred, you must"
echo "restore the database separately using your backup files."
echo "=================================================================="
echo ""
echo "Press Ctrl+C to abort, or press Enter to proceed with rollback..."
read -r

echo "Switching code to commit $COMMIT_HASH..."
git checkout "$COMMIT_HASH"

echo "Rebuilding and starting Docker containers..."
docker compose up -d --build

echo "Current container status:"
docker ps

echo "Rollback completed successfully!"
