#!/usr/bin/env python3
"""
Refresh the current (in-progress) NBA season from Basketball-Reference and
re-score it with the published REIGN formulas.

WHAT IT DOES
------------
Historical eras (1946-2012) never change, so a nightly job only needs to keep
the latest season current. This script:

  1. fetches the season's per-game and advanced tables from basketball-reference
  2. joins them into rows in the same schema as `seasons_modern.json`
  3. scores each row with `reign_score.py` (the published per-era formulas)
  4. upserts them into `seasons_modern.json` -- rows for the target year are
     replaced, every other year is left byte-for-byte untouched.

It is idempotent: run it ten times in a morning and the file converges to the
same state. After it runs, regenerate the derived/index files:

  python3 scripts/build_derived.py --full
  node    scripts/build_rankings_index.js
  node    scripts/build_viz.js

(`scripts/refresh_all.sh` chains all of that.)

USAGE
-----
  python3 scripts/refresh_current_season.py            # auto-detect season
  python3 scripts/refresh_current_season.py --year 2026
  python3 scripts/refresh_current_season.py --dry-run  # fetch + report, no write
  python3 scripts/refresh_current_season.py --source-dir ./brefhtml
        # offline: parse pre-downloaded NBA_<year>_{per_game,advanced}.html

NOTES
-----
* Basketball-Reference is the authoritative source the repo already scrapes
  (see backfill_modern_advanced.py). It rate-limits, so we sleep between the
  two table fetches and set a real User-Agent.
* Clutch (clutch_*) stats come from nba.com, not bref, and REIGN does not use
  them, so freshly scraped rows carry no clutch fields until a clutch backfill
  runs. The leaderboard, profiles, compare, eras and viz all render without it.
* Multi-team players: bref emits a combined season-total row (team code like
  "2TM"/"3TM") plus one row per team. We keep the combined total -- it is the
  player's full season -- matching how a single season-row-per-player is stored.
"""
import argparse
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.request

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
MODERN = os.path.join(DATA, 'seasons_modern.json')
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120 Safari/537.36')

# bref data-stat -> our field. Per-game table.
PER_GAME_MAP = {
    'age': 'age', 'games': 'gp', 'mp_per_g': 'min',
    'fg_per_g': 'fgm', 'fga_per_g': 'fga', 'fg_pct': 'fgp',
    'fg3_per_g': 'fg3m', 'fg3a_per_g': 'fg3a', 'fg3_pct': 'fg3p',
    'efg_pct': 'efg', 'ft_per_g': 'ftm', 'fta_per_g': 'fta', 'ft_pct': 'ftp',
    'orb_per_g': 'oreb', 'drb_per_g': 'dreb', 'trb_per_g': 'reb',
    'ast_per_g': 'ast', 'stl_per_g': 'stl', 'blk_per_g': 'blk',
    'tov_per_g': 'tov', 'pf_per_g': 'pf', 'pts_per_g': 'pts',
}
# Advanced table. usg_pct is a 0-100 percentage on bref; normalized below.
# (ts_pct/fg*_pct are already 0..1 fractions, so they are NOT rescaled.)
ADVANCED_MAP = {
    'per': 'per', 'ts_pct': 'tsp', 'usg_pct': 'usg',
    'ows': 'ows', 'dws': 'dws', 'ws': 'ws', 'ws_per_48': 'ws48',
    'obpm': 'obpm', 'dbpm': 'dbpm', 'bpm': 'bpm', 'vorp': 'vorp',
}
# field the site stores as 0..1 but bref reports as a 0..100 percentage
TO_FRACTION = {'usg'}


def current_season_year(today=None):
    """The NBA 'season year' is the end year (2025-26 -> 2026). The season
    tips off in October, so Oct-Dec belong to next year's season."""
    today = today or datetime.date.today()
    return today.year + 1 if today.month >= 10 else today.year


def fetch(year, kind, source_dir=None):
    fname = f'NBA_{year}_{kind}.html'
    if source_dir:
        with open(os.path.join(source_dir, fname), encoding='utf-8') as f:
            return f.read()
    url = f'https://www.basketball-reference.com/leagues/{fname}'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def parse_table(page, field_map):
    """Parse a bref stats table into {(name, team): {field: value}}.
    bref wraps some tables in HTML comments, so strip those first."""
    page = page.replace('<!--', '').replace('-->', '')
    rows = {}
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S):
        if 'data-stat="name_display"' not in tr and 'data-stat="player"' not in tr:
            continue
        cells = dict(re.findall(r'data-stat="([a-z0-9_]+)"[^>]*>(.*?)</t[dh]>', tr, re.S))

        def clean(v):
            return html.unescape(re.sub(r'<[^>]+>', '', v)).strip()

        name = clean(cells.get('name_display') or cells.get('player') or '')
        team = clean(cells.get('team_name_abbr') or cells.get('team_id') or '')
        if not name:
            continue
        rec = {}
        for stat, field in field_map.items():
            raw = clean(cells.get(stat, ''))
            if raw not in ('', '-'):
                try:
                    val = float(raw)
                    rec[field] = val / 100.0 if field in TO_FRACTION else val
                except ValueError:
                    pass
        # keep the row with the most teams' worth of games (the combined total
        # for traded players sorts first because bref lists it first; but guard
        # by preferring whichever has the larger games count)
        key = (name, team)
        prev = rows.get(key)
        if not prev or rec.get('gp', 0) >= prev.get('gp', 0):
            rows[key] = {**(prev or {}), **rec, '_team': team}
    return rows


def combined_rows(per_game, advanced, year):
    """Merge per-game + advanced by player, preferring each player's combined
    season-total row (bref team code 2TM/3TM/...) when they were traded."""
    by_name = {}
    for (name, team), rec in per_game.items():
        # a 'TOT'/'NTM' row is the whole season; prefer it over a partial split
        combined = bool(re.fullmatch(r'\dTM', team)) or team in ('TOT',)
        cur = by_name.get(name)
        if cur is None or (combined and not cur[2]) or \
           (combined == cur[2] and rec.get('gp', 0) > cur[1].get('gp', 0)):
            by_name[name] = (team, rec, combined)

    out = []
    for name, (team, pg, _combined) in by_name.items():
        adv = advanced.get((name, team))
        if adv is None:  # advanced table may key the combined row differently
            adv = next((v for (n, _), v in advanced.items() if n == name), {})
        row = {'name': name, 'team': team, 'year': year, 'type': 'RS', 'era': 'Modern'}
        for f, v in pg.items():
            if not f.startswith('_'):
                row[f] = v
        for f, v in adv.items():
            if not f.startswith('_'):
                row[f] = v
        out.append(row)
    return out


def upsert(modern, fresh, year):
    """Replace all rows for `year` with `fresh`; keep every other row as-is."""
    kept = [r for r in modern if r.get('year') != year]
    fresh_sorted = sorted(fresh, key=lambda r: -r.get('reign', 0))
    return kept + fresh_sorted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', type=int, default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--source-dir', default=None)
    args = ap.parse_args()

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'reign_score', os.path.join(os.path.dirname(__file__), 'reign_score.py'))
    reign_score = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reign_score)

    year = args.year or current_season_year()
    print(f'refreshing {year - 1}-{str(year)[2:]} season (year={year})')

    try:
        per_html = fetch(year, 'per_game', args.source_dir)
        if not args.source_dir:
            time.sleep(3.5)  # be polite to bref's rate limit
        adv_html = fetch(year, 'advanced', args.source_dir)
    except Exception as e:  # noqa: BLE001
        print(f'FETCH FAILED ({e}).\n'
              f'  If HTTP 403, run where basketball-reference.com is reachable '
              f'(e.g. GitHub Actions), or pass --source-dir with pre-downloaded '
              f'NBA_{year}_per_game.html and NBA_{year}_advanced.html.', file=sys.stderr)
        return 2

    per_game = parse_table(per_html, PER_GAME_MAP)
    advanced = parse_table(adv_html, ADVANCED_MAP)
    if not per_game:
        print('no per-game rows parsed -- bref layout may have changed', file=sys.stderr)
        return 3

    fresh = combined_rows(per_game, advanced, year)
    formulas = reign_score.load_formulas()
    for r in fresh:
        r['reign_off'], r['reign_def'], r['reign'] = reign_score.score_row(r, 'modern', formulas)
        r['advanced_source'] = 'bref'

    fresh.sort(key=lambda r: -r['reign'])
    print(f'built {len(fresh)} rows; top: ' +
          ', '.join(f"{r['name']} {r['reign']:+.1f}" for r in fresh[:5]))

    if args.dry_run:
        print('(dry run -- not writing)')
        return 0

    modern = json.load(open(MODERN))
    before = sum(1 for r in modern if r.get('year') == year)
    merged = upsert(modern, fresh, year)
    json.dump(merged, open(MODERN, 'w'), indent=0)
    print(f'wrote {os.path.relpath(MODERN)}: year {year} {before} -> {len(fresh)} rows '
          f'({len(merged)} total). Now rerun build_derived --full + build_*.js.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
