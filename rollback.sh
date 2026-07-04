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

# Verify that the commit exists in the repository
if ! git cat-file -e "$COMMIT_HASH^{commit}" 2>/dev/null; then
  echo "Error: Commit '$COMMIT_HASH' does not exist in this repository."
  exit 1
fi

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
if ! git checkout "$COMMIT_HASH"; then
  echo "ERROR: Git checkout failed. Aborting rollback."
  exit 1
fi

echo "Rebuilding and starting Docker containers..."
docker compose up -d --build

echo "Current container status:"
docker ps

echo "Rollback completed successfully!"
