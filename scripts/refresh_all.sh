#!/usr/bin/env bash
# Nightly REIGN data refresh: scrape the current season, re-score it with the
# published formulas, pull clutch stats, and regenerate every derived/index
# file the site loads.
#
# Safe to run by hand or from CI (see .github/workflows/refresh-data.yml).
# Idempotent: a no-change night leaves the working tree clean.
#
#   scripts/refresh_all.sh            # auto-detect the current season
#   scripts/refresh_all.sh --year 2026
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/7 refresh current season from Basketball-Reference"
python3 scripts/refresh_current_season.py "$@"

# Clutch comes from a different, flakier source (stats.nba.com) and is
# supplementary, so a clutch failure must not abort the core REIGN refresh.
echo "==> 2/7 pull current-season clutch from stats.nba.com (best-effort)"
if python3 scripts/backfill_clutch.py "$@"; then
  echo "    clutch updated"
else
  echo "    WARNING: clutch fetch failed (likely a blocked CI IP); continuing without it"
fi

echo "==> 3/7 update career clutch leaderboard"
python3 scripts/build_career_clutch.py

# Self-healing: fill any season rows still missing advanced stats (currently
# the 2013-24 playoff rows). Idempotent and cheap -- once everything is
# filled the script finds nothing to do and makes zero network requests.
# Best-effort like clutch: bref 403s datacenter IPs, so this succeeds only
# from a self-hosted/residential runner and must not abort the refresh.
echo "==> 4/7 backfill missing advanced stats from basketball-reference (best-effort)"
if python3 scripts/backfill_modern_advanced.py --write; then
  echo "    advanced stats backfill ok (no-op when already complete)"
  echo "    NOTE: if rows were just filled, consider re-deriving the formulas"
  echo "          once (python3 scripts/derive_formulas.py) -- deliberate,"
  echo "          manual step; do not automate it nightly."
else
  echo "    WARNING: advanced backfill failed (likely a blocked IP); continuing"
fi

echo "==> 5/7 rebuild stretches / careers / career_avg (full)"
python3 scripts/build_derived.py --full

echo "==> 6/7 rebuild leaderboard index (rankings.json)"
node scripts/build_rankings_index.js

echo "==> 7/7 rebuild visualizations payload (viz.json)"
node scripts/build_viz.js

echo "==> done. Changed files:"
git status --porcelain public/data || true
