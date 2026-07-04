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
  python3 scripts/backfill_modern_advanced.py --write --from-csv Advanced.csv
        # fill from the bref-scraped open dataset (see CSV SOURCE below)
  python3 scripts/backfill_modern_advanced.py --write --from-csv Advanced.csv --repair-year 2025
        # ALSO overwrite (not just fill) the advanced fields for one season --
        # used to repair the 2025-26 rows whose scraped advanced values were
        # corrupted (e.g. Jokic PER 22.8 vs bref's 32.3; ~30% of rows affected)

CSV SOURCE
----------
When basketball-reference is unreachable (it 403s datacenter/CI IPs), the same
tables are mirrored in the maintained open dataset
  https://github.com/sumitrodatta/bball-reference-datasets  (Data/Advanced.csv)
which is scraped from bref each season. Validated against our committed rows:
values agree exactly for prior seasons (Jokic/SGA/Giannis 2024-25 match to the
published precision). Rows filled from it are tagged
"advanced_source": "bref-mirror".

It only fills rows where the advanced fields are null (unless --repair-year),
is idempotent, and tags filled rows. After running, regenerate derived data
and re-check the fit:
  node scripts/build_rankings_index.js && node scripts/build_viz.js
  python3 scripts/derive_formulas.py
"""
import csv, json, os, sys, re, time, html, unicodedata, urllib.request

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
MODERN = os.path.join(DATA, 'seasons_modern.json')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

# bref data-stat name -> our field name
FIELD_MAP = {
    'per': 'per', 'ws': 'ws', 'ows': 'ows', 'dws': 'dws', 'ws_per_48': 'ws48',
    'bpm': 'bpm', 'obpm': 'obpm', 'dbpm': 'dbpm', 'vorp': 'vorp',
}
NEEDED = list(set(FIELD_MAP.values()))


def url_for(year, league='leagues'):
    """league='leagues' is the regular-season table; 'playoffs' the postseason.
    The two must never be cross-joined: RS advanced values only belong on RS
    rows and playoff values on PO rows."""
    return f'https://www.basketball-reference.com/{league}/NBA_{year}_advanced.html'


def fetch_html(year, source_dir=None, league='leagues'):
    if source_dir:
        sub = os.path.join(source_dir, 'playoffs') if league == 'playoffs' else source_dir
        with open(os.path.join(sub, f'NBA_{year}_advanced.html'), encoding='utf-8') as f:
            return f.read()
    req = urllib.request.Request(url_for(year, league), headers={'User-Agent': UA})
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


def norm_name(name):
    """Join key: accent/punctuation-insensitive, trailing generational suffixes
    dropped ('Marcus Morris Sr.' == 'Marcus Morris'), non-decomposing letters
    mapped (Asik's dotless i)."""
    s = unicodedata.normalize('NFKD', name or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.translate(str.maketrans({'ı': 'i', 'ø': 'o', 'đ': 'd', 'ł': 'l'}))
    toks = ''.join(c if c.isalnum() or c == ' ' else ' ' for c in s).split()
    while len(toks) > 1 and toks[-1] in ('jr', 'sr', 'ii', 'iii', 'iv', 'v'):
        toks.pop()
    return ''.join(toks)


def load_csv_table(path):
    """(norm_name, season end-year) -> csv row. Prefers the combined stint
    ('2TM'/'TOT') for traded players, else the most games."""
    idx = {}
    for r in csv.DictReader(open(path, encoding='utf-8')):
        try:
            season = int(r['season'])
        except (KeyError, ValueError):
            continue
        key = (norm_name(r['player']), season)
        combined = r['team'] == 'TOT' or bool(re.fullmatch(r'\dTM', r['team'] or ''))
        prev = idx.get(key)
        if not prev or (combined and not prev[1]) or \
           (combined == prev[1] and float(r['g'] or 0) > float(prev[0]['g'] or 0)):
            idx[key] = (r, combined)
    return idx


CSV_FIELD_MAP = {'per': 'per', 'ws': 'ws', 'ows': 'ows', 'dws': 'dws', 'ws_48': 'ws48',
                 'bpm': 'bpm', 'obpm': 'obpm', 'dbpm': 'dbpm', 'vorp': 'vorp'}


def fill_from_csv(rows, csv_path, write, repair_year=None):
    table = load_csv_table(csv_path)
    filled = repaired = skipped_gp = 0
    for r in rows:
        if r.get('type') not in ('RS', 'PO') or r.get('era') != 'Modern':
            continue
        # The dataset is regular-season only; playoff rows keep their values.
        if r.get('type') != 'RS':
            continue
        needs_fill = r.get('vorp') is None
        needs_repair = repair_year is not None and r.get('year') == repair_year
        if not needs_fill and not needs_repair:
            continue
        hit = table.get((norm_name(r.get('name')), r['year'] + 1))
        if not hit:
            continue
        d = hit[0]
        # Same-stint guard: a big games mismatch means the name key collided
        # with a different player -- do not fill from it.
        g = float(d['g'] or 0)
        if isinstance(r.get('gp'), (int, float)) and abs(g - r['gp']) > 3:
            skipped_gp += 1
            continue
        changed = False
        for stat, field in CSV_FIELD_MAP.items():
            v = d.get(stat)
            if v in (None, '', 'NA'):
                continue
            try:
                v = float(v)
            except ValueError:
                continue
            if r.get(field) != v:
                r[field] = v
                changed = True
        if changed:
            r['advanced_source'] = 'bref-mirror'
            if needs_fill:
                filled += 1
            else:
                repaired += 1
    print(f'from-csv: filled {filled} null rows, repaired {repaired} rows'
          f'{f" (year {repair_year})" if repair_year else ""}, '
          f'{skipped_gp} skipped on games mismatch')
    if write:
        json.dump(rows, open(MODERN, 'w'), indent=0)
        print(f'wrote {os.path.relpath(MODERN)} -- now rerun build + derive scripts '
              f'(and re-score the current season if it was repaired)')


def main():
    args = sys.argv[1:]
    write = '--write' in args
    source_dir = None
    if '--source-dir' in args:
        source_dir = args[args.index('--source-dir') + 1]
    from_csv = None
    if '--from-csv' in args:
        from_csv = args[args.index('--from-csv') + 1]
    repair_year = None
    if '--repair-year' in args:
        repair_year = int(args[args.index('--repair-year') + 1])

    rows = json.load(open(MODERN))
    todo = [r for r in rows if r.get('vorp') is None]
    years = sorted({r['year'] for r in todo})
    if todo:
        print(f'{len(todo)} rows missing advanced stats across years {years[0]}-{years[-1]}')

    if from_csv:
        fill_from_csv(rows, from_csv, write, repair_year)
        return

    if not write:
        from collections import Counter
        print('by year:', dict(sorted(Counter(r['year'] for r in todo).items())))
        print('(dry run - pass --write to fetch and fill)')
        return

    filled = 0
    for year in years:
        # rows store the season START year; bref pages are named by END year
        # (NBA_2014_advanced == the 2013-14 season).
        bref_year = year + 1
        # RS and PO rows must be filled from their own tables — never cross-join.
        for stype, league in (('RS', 'leagues'), ('PO', 'playoffs')):
            batch = [x for x in todo if x['year'] == year and x.get('type') == stype]
            if not batch:
                continue
            try:
                table = parse_advanced(fetch_html(bref_year, source_dir, league))
            except Exception as e:  # noqa: BLE001
                print(f'  {year} {stype}: FETCH FAILED ({e}). '
                      f'If 403, run where basketball-reference is reachable, or use '
                      f'--source-dir with pre-downloaded NBA_{bref_year}_advanced.html.')
                continue
            n = 0
            for r in batch:
                rec = table.get((r['name'], r.get('team'))) or next(
                    (v for (nm, _), v in table.items() if nm == r['name']), None)
                if rec:
                    for f in NEEDED:
                        if f in rec:
                            r[f] = rec[f]
                    r['advanced_source'] = 'bref'
                    filled += 1
                    n += 1
            print(f'  {year} {stype}: filled {n}/{len(batch)} rows')
            if not source_dir:
                time.sleep(3.5)  # be polite to bref's rate limit

    print(f'filled {filled}/{len(todo)} rows')
    if filled:
        json.dump(rows, open(MODERN, 'w'), indent=0)
        print(f'wrote {os.path.relpath(MODERN)} -- now rerun build + derive scripts')


if __name__ == '__main__':
    main()
