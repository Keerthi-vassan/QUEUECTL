#!/usr/bin/env bash
# tests/run-all.sh — runs all automated test scripts in sequence.
# Manual-only scenarios (restart persistence, hard-crash recovery, multi-terminal
# graceful shutdown) are documented separately in README.md's Testing Instructions,
# since they require killing real OS processes / multiple terminals and don't
# automate cleanly.

set -e  # stop on first failure

cd "$(dirname "$0")/.."  # run from repo root regardless of where this is called from

echo "Cleaning up any leftover state..."
rm -f data/jobs.json data/jobs.json.lock data/config.json data/config.json.lock data/workers.json data/workers.json.lock

echo ""
echo "########################################"
echo "# 1. Lock mutual exclusion"
echo "########################################"
node tests/test-lock.js

echo ""
echo "########################################"
echo "# 2. Concurrent claim safety (no duplicate processing)"
echo "########################################"
rm -f data/jobs.json data/jobs.json.lock
node tests/test-claim.js

echo ""
echo "########################################"
echo "# 3. Basic job completes successfully"
echo "########################################"
rm -f data/jobs.json data/jobs.json.lock
node tests/test-basic.js

echo ""
echo "########################################"
echo "# 4. Invalid command fails gracefully"
echo "########################################"
rm -f data/jobs.json data/jobs.json.lock
node tests/test-invalid-command.js

echo ""
echo "########################################"
echo "# 5. Full lifecycle: pending -> failed -> dead"
echo "########################################"
rm -f data/jobs.json data/jobs.json.lock
node tests/test-lifecycle.js

echo ""
echo "########################################"
echo "All automated tests completed."
echo "See README.md 'Testing Instructions' for manual restart-persistence"
echo "and crash-recovery verification steps."
echo "########################################"