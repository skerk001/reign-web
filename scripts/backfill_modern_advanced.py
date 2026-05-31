#!/usr/bin/env python3
"""
Backfill the missing modern-era advanced stats from Basketball-Reference.

PROBLEM
-------
2335 of 6906 modern rows (34%) have ALL of {bpm, obpm, dbpm, vorp, ws, ows,
dws, ws48, per} as null -- a join failure in the original data build, not a
real "this player has no BPM" (it includes 30+ mpg starters). With those inputs
present, modern REIGN is recoverable (reign_def CV-R2 0.85, reign_off 0.97);
without them it collapses to 0.48 / 0.84. So filling them is the real fix.

WHY THIS IS A SCRIPT, NOT A DONE DEAL
-------------------------------------
The authoritative source (Basketball-Reference) is network-blocked (HTTP 403)
from the environment where this was written, and stats.nba.com / nba.com are
too. Box-score imputation was measured at only 0.72-0.88 accuracy (dbpm, the
key defensive driver, is weakest), so we do NOT fabricate values. Instead this
script fetches the real per-season advanced tables and joins them in -- run it
from any environment that can reach basketball-reference.com.

USAGE
-----
  python3 scripts/backfill_modern_advanced.py --dry-run     # report only
  python3 scripts/backfill_modern_advanced.py --write       # fetch + fill
  python3 scripts/backfill_modern_advanced.py --write --source-dir ./brefhtml
        # offline: parse pre-downloaded NBA_<year>_advanced.html files instead

It only fills rows where the advanced fields are null, is idempotent, and tags
filled rows with "advanced_source": "bref". After running, regenerate derived
data and re-check the fit:
  node scripts/build_rankings_index.js && node scripts/build_viz.js
  python3 scripts/derive_formulas.py
"""
import json, os, sys, re, time, html, urllib.request

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
MODERN = os.path.join(DATA, 'seasons_modern.json')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

# bref data-stat name -> our field name
FIELD_MAP = {
    'per': 'per', 'ws': 'ws', 'ows': 'ows', 'dws': 'dws', 'ws_per_48': 'ws48',
    'bpm': 'bpm', 'obpm': 'obpm', 'dbpm': 'dbpm', 'vorp': 'vorp',
}
NEEDED = list(set(FIELD_MAP.values()))


def url_for(year):
    return f'https://www.basketball-reference.com/leagues/NBA_{year}_advanced.html'


def fetch_html(year, source_dir=None):
    if source_dir:
        path = os.path.join(source_dir, f'NBA_{year}_advanced.html')
        with open(path, encoding='utf-8') as f:
            return f.read()
    req = urllib.request.Request(url_for(year), headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def parse_advanced(page):
    """Parse the advanced table into {(player, team): {field: value}}.
    bref sometimes wraps tables in HTML comments; strip those first."""
    page = page.replace('<!--', '').replace('-->', '')
    out = {}
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S):
        if 'data-stat="name_display"' not in row and 'data-stat="player"' not in row:
            continue
        cells = dict(re.findall(r'data-stat="([a-z0-9_]+)"[^>]*>(.*?)</t[dh]>', row, re.S))
        def clean(v):
            return html.unescape(re.sub(r'<[^>]+>', '', v)).strip()
        name = clean(cells.get('name_display') or cells.get('player') or '')
        team = clean(cells.get('team_name_abbr') or cells.get('team_id') or '')
        if not name:
            continue
        rec = {}
        for stat, field in FIELD_MAP.items():
            raw = clean(cells.get(stat, ''))
            if raw not in ('', '-'):
                try:
                    rec[field] = float(raw)
                except ValueError:
                    pass
        if rec:
            out[(name, team)] = rec
    return out


def main():
    args = sys.argv[1:]
    write = '--write' in args
    source_dir = None
    if '--source-dir' in args:
        source_dir = args[args.index('--source-dir') + 1]

    rows = json.load(open(MODERN))
    todo = [r for r in rows if r.get('vorp') is None]
    years = sorted({r['year'] for r in todo})
    print(f'{len(todo)} rows missing advanced stats across years {years[0]}-{years[-1]}')
    if not write:
        from collections import Counter
        print('by year:', dict(sorted(Counter(r['year'] for r in todo).items())))
        print('(dry run - pass --write to fetch and fill)')
        return

    filled = 0
    for year in years:
        try:
            table = parse_advanced(fetch_html(year, source_dir))
        except Exception as e:  # noqa: BLE001
            print(f'  {year}: FETCH FAILED ({e}). '
                  f'If 403, run where basketball-reference is reachable, or use '
                  f'--source-dir with pre-downloaded NBA_{year}_advanced.html.')
            continue
        # bref season pages use the END year (2013 page == 2012-13 season).
        for r in (x for x in todo if x['year'] == year):
            rec = table.get((r['name'], r.get('team'))) or next(
                (v for (n, _), v in table.items() if n == r['name']), None)
            if rec:
                for f in NEEDED:
                    if f in rec:
                        r[f] = rec[f]
                r['advanced_source'] = 'bref'
                filled += 1
        print(f'  {year}: filled {sum(1 for x in todo if x["year"]==year and x.get("advanced_source"))} rows')
        if not source_dir:
            time.sleep(3.5)  # be polite to bref's rate limit

    print(f'filled {filled}/{len(todo)} rows')
    if filled:
        json.dump(rows, open(MODERN, 'w'), indent=0)
        print(f'wrote {os.path.relpath(MODERN)} -- now rerun build + derive scripts')


if __name__ == '__main__':
    main()
