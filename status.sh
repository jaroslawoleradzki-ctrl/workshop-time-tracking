#!/bin/bash
# status.sh
# Production Operational Diagnostic Script for Workshop Time Tracking System.
# This script is strictly read-only and does not modify any system states.

echo "=================================================================="
echo "          SYSTEM OPERATIONAL STATUS DIAGNOSTICS                   "
echo "=================================================================="
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=================================================================="
echo ""

# 1. GIT STATUS
echo "--- 1. GIT STATUS SUMMARY ---"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Branch: $(git branch --show-current 2>/dev/null || echo "Unknown")"
  echo "Status:"
  git status --short 2>/dev/null || echo "Could not run git status"
  echo "Latest Commit:"
  git log -1 --oneline 2>/dev/null || echo "No commit history found"
else
  echo "Not a git repository."
fi
echo ""

# 2. APPLICATION VERSION (API)
echo "--- 2. APPLICATION API VERSION ---"
if command -v curl >/dev/null 2>&1; then
  echo "Requesting GET http://localhost/api/version..."
  curl --connect-timeout 3 -s http://localhost/api/version || echo "Failed to connect to version API (localhost:80)"
else
  echo "curl is not installed."
fi
echo ""

# 3. DOCKER COMPOSE PROCESSES
echo "--- 3. DOCKER CONTAINER STATUS ---"
if command -v docker >/dev/null 2>&1; then
  docker compose ps 2>/dev/null || echo "Failed to run docker compose ps"
else
  echo "docker CLI not available."
fi
echo ""

# 4. SYSTEM RESOURCE USAGE
echo "--- 4. DISK SPACE ---"
df -h . 2>/dev/null || df -h 2>/dev/null || echo "Could not query disk space"
echo ""

echo "--- 5. MEMORY USAGE ---"
if command -v free >/dev/null 2>&1; then
  free -h 2>/dev/null || echo "Failed to run free -h"
elif [ -f /proc/meminfo ]; then
  grep -E "MemTotal|MemFree|MemAvailable" /proc/meminfo 2>/dev/null || echo "Failed to read /proc/meminfo"
elif command -v vm_stat >/dev/null 2>&1; then
  # Mac fallback
  vm_stat 2>/dev/null || echo "Failed to run vm_stat"
else
  echo "free command not available."
fi
echo ""

# 5. CONTAINER LOGS
echo "--- 6. LATEST BACKEND LOGS (worktime-api) ---"
if command -v docker >/dev/null 2>&1; then
  docker logs worktime-api --tail=40 2>/dev/null || echo "No logs or worktime-api container is missing/offline"
else
  echo "docker CLI not available."
fi
echo ""

echo "--- 7. LATEST WEB LOGS (worktime-web) ---"
if command -v docker >/dev/null 2>&1; then
  docker logs worktime-web --tail=30 2>/dev/null || echo "No logs or worktime-web container is missing/offline"
else
  echo "docker CLI not available."
fi
echo ""

# 6. BACKUP STATUS
echo "--- 8. DATABASE BACKUP FILES ---"
if [ -d "backups" ]; then
  ls -lh backups 2>/dev/null | tail -n 10 || echo "Failed to list backups directory"
else
  echo "backups directory does not exist yet."
fi
echo ""

echo "=================================================================="
echo "          DIAGNOSTICS COMPLETED                                   "
echo "=================================================================="
