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

echo "==> 1/6 refresh current season from Basketball-Reference"
python3 scripts/refresh_current_season.py "$@"

# Clutch comes from a different, flakier source (stats.nba.com) and is
# supplementary, so a clutch failure must not abort the core REIGN refresh.
echo "==> 2/6 pull current-season clutch from stats.nba.com (best-effort)"
if python3 scripts/backfill_clutch.py "$@"; then
  echo "    clutch updated"
else
  echo "    WARNING: clutch fetch failed (likely a blocked CI IP); continuing without it"
fi

echo "==> 3/6 update career clutch leaderboard"
python3 scripts/build_career_clutch.py

echo "==> 4/6 rebuild stretches / careers / career_avg (full)"
python3 scripts/build_derived.py --full

echo "==> 5/6 rebuild leaderboard index (rankings.json)"
node scripts/build_rankings_index.js

echo "==> 6/6 rebuild visualizations payload (viz.json)"
node scripts/build_viz.js

echo "==> done. Changed files:"
git status --porcelain public/data || true
