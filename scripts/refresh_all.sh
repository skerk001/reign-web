#!/usr/bin/env bash
# Nightly REIGN data refresh: scrape the current season, re-score it with the
# published formulas, and regenerate every derived/index file the site loads.
#
# Safe to run by hand or from CI (see .github/workflows/refresh-data.yml).
# Idempotent: a no-change night leaves the working tree clean.
#
#   scripts/refresh_all.sh            # auto-detect the current season
#   scripts/refresh_all.sh --year 2026
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4 refresh current season from Basketball-Reference"
python3 scripts/refresh_current_season.py "$@"

echo "==> 2/4 rebuild stretches / careers / career_avg (full)"
python3 scripts/build_derived.py --full

echo "==> 3/4 rebuild leaderboard index (rankings.json)"
node scripts/build_rankings_index.js

echo "==> 4/4 rebuild visualizations payload (viz.json)"
node scripts/build_viz.js

echo "==> done. Changed files:"
git status --porcelain public/data || true
