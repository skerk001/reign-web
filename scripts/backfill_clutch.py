#!/usr/bin/env python3
"""
Fetch regular-season clutch stats from the NBA's stats API and merge them onto
the season rows.

"Clutch" follows the nba.com definition the existing data uses: the last 5
minutes of a game with the score within 5 points. The endpoint is
`stats.nba.com/stats/leaguedashplayerclutch` (PerMode=Totals, MeasureType=Base);
per-game values are derived by dividing totals by games played, matching how the
committed clutch_* fields are stored. Only RS clutch is populated -- that is the
only clutch the season files carry (playoff clutch lives, pre-aggregated, in
career_clutch.json and is not refreshed here).

Fields written onto each matched modern RS row:
  clutch_gp clutch_min clutch_pts clutch_reb clutch_ast clutch_stl clutch_blk
  clutch_pm clutch_fgp clutch_fg3p clutch_ftp clutch_wpct
  clutch_tot_pts clutch_tot_reb clutch_tot_ast clutch_tot_pm
  clutch_ts  (PTS / (2*(FGA + 0.44*FTA)))
  clutch_lg_ts  (league clutch TS for the season, as a 0-100 percentage)
  clutch_ts_vs_lg  (clutch_ts*100 - clutch_lg_ts)

HEADS UP: stats.nba.com aggressively blocks datacenter IPs (the same problem
basketball-reference has from CI). The required browser-like headers are set
below, but a GitHub-hosted runner may still get blocked or time out. On any
fetch failure the script writes nothing and exits non-zero so the pipeline
fails loud rather than wiping clutch data. Use --source-file to parse a
pre-saved JSON response offline.

USAGE
-----
  python3 scripts/backfill_clutch.py                 # current season, RS
  python3 scripts/backfill_clutch.py --year 2026
  python3 scripts/backfill_clutch.py --dry-run
  python3 scripts/backfill_clutch.py --source-file clutch_2026.json
"""
import argparse
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
MODERN = os.path.join(DATA, 'seasons_modern.json')

ENDPOINT = 'https://stats.nba.com/stats/leaguedashplayerclutch'
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/120 Safari/537.36'),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'Connection': 'keep-alive',
}
# every parameter the endpoint demands; only a handful are non-empty
PARAMS = {
    'AheadBehind': 'Ahead or Behind', 'ClutchTime': 'Last 5 Minutes', 'PointDiff': '5',
    'MeasureType': 'Base', 'PerMode': 'Totals', 'SeasonType': 'Regular Season',
    'LeagueID': '00', 'Season': '', 'Period': '0', 'Month': '0', 'LastNGames': '0',
    'OpponentTeamID': '0', 'TeamID': '0', 'PaceAdjust': 'N', 'PlusMinus': 'N', 'Rank': 'N',
    'DateFrom': '', 'DateTo': '', 'GameScope': '', 'GameSegment': '', 'Location': '',
    'Outcome': '', 'PORound': '0', 'PlayerExperience': '', 'PlayerPosition': '',
    'SeasonSegment': '', 'ShotClockRange': '', 'StarterBench': '', 'VsConference': '',
    'VsDivision': '', 'Conference': '', 'Division': '', 'College': '', 'Country': '',
    'DraftPick': '', 'DraftYear': '', 'Height': '', 'Weight': '',
}


def season_label(year):
    return f'{year - 1}-{str(year)[2:]}'  # 2026 -> "2025-26"


def fetch(year, source_file=None):
    if source_file:
        return json.load(open(source_file))
    params = dict(PARAMS, Season=season_label(year))
    url = ENDPOINT + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


def parse_response(payload):
    """NBA stats responses are {resultSets:[{headers:[...], rowSet:[[...]]}]}."""
    rs = payload['resultSets'][0] if 'resultSets' in payload else payload['resultSet']
    cols = rs['headers']
    idx = {c: i for i, c in enumerate(cols)}
    out = []
    for row in rs['rowSet']:
        out.append({c: row[idx[c]] for c in cols})
    return out


def norm(name):
    """Accent/punctuation-insensitive key for joining bref vs nba.com names."""
    s = unicodedata.normalize('NFKD', name or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return ''.join(c for c in s.lower() if c.isalnum())


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def to_clutch_fields(rec):
    """One nba.com clutch row (Totals) -> our per-season clutch_* fields."""
    gp = num(rec.get('GP'))
    if gp <= 0:
        return None
    fga, fta, pts = num(rec.get('FGA')), num(rec.get('FTA')), num(rec.get('PTS'))
    ts_den = 2 * (fga + 0.44 * fta)
    ts = pts / ts_den if ts_den else 0.0

    def per_game(stat):
        return round(num(rec.get(stat)) / gp, 1)

    return {
        'clutch_gp': int(gp),
        'clutch_min': per_game('MIN'),
        'clutch_pts': per_game('PTS'),
        'clutch_reb': per_game('REB'),
        'clutch_ast': per_game('AST'),
        'clutch_stl': per_game('STL'),
        'clutch_blk': per_game('BLK'),
        'clutch_pm': per_game('PLUS_MINUS'),
        'clutch_fgp': round(num(rec.get('FG_PCT')), 2),
        'clutch_fg3p': round(num(rec.get('FG3_PCT')), 2),
        'clutch_ftp': round(num(rec.get('FT_PCT')), 2),
        'clutch_wpct': round(num(rec.get('W_PCT')), 2),
        'clutch_tot_pts': round(pts, 1),
        'clutch_tot_reb': round(num(rec.get('REB')), 1),
        'clutch_tot_ast': round(num(rec.get('AST')), 1),
        'clutch_tot_pm': round(num(rec.get('PLUS_MINUS')), 1),
        '_ts': ts,  # stashed; finalized once league TS is known
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', type=int, default=None)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--source-file', default=None)
    args = ap.parse_args()

    # reuse the season detector from the season refresher
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'rcs', os.path.join(os.path.dirname(__file__), 'refresh_current_season.py'))
    rcs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rcs)
    year = args.year or rcs.current_season_year()
    # nba.com is queried by END year (season_label); the dataset stores seasons
    # by START year, so clutch merges onto season_year rows (= year - 1).
    season_year = year - 1
    print(f'fetching {season_label(year)} regular-season clutch')

    try:
        payload = fetch(year, args.source_file)
    except Exception as e:  # noqa: BLE001
        print(f'FETCH FAILED ({e}).\n'
              f'  stats.nba.com commonly blocks datacenter/CI IPs (HTTP 403) and '
              f'rate-limits. Run from a reachable network, or pass --source-file '
              f'with a saved leaguedashplayerclutch JSON response.', file=sys.stderr)
        return 2

    rows = parse_response(payload)
    clutch = {}
    league_pts = league_den = 0.0
    for rec in rows:
        fields = to_clutch_fields(rec)
        if not fields:
            continue
        clutch[norm(rec.get('PLAYER_NAME'))] = (rec.get('TEAM_ABBREVIATION'), fields)
        league_pts += num(rec.get('PTS'))
        league_den += 2 * (num(rec.get('FGA')) + 0.44 * num(rec.get('FTA')))
    lg_ts = round(league_pts / league_den * 100, 1) if league_den else 0.0
    print(f'parsed {len(clutch)} clutch players; league clutch TS = {lg_ts}')

    # finalize TS-relative fields now that the league average is known
    for _team, f in clutch.values():
        f['clutch_lg_ts'] = lg_ts
        f['clutch_ts'] = round(f.pop('_ts'), 2)
        f['clutch_ts_vs_lg'] = round(f['clutch_ts'] * 100 - lg_ts, 1)

    if args.dry_run:
        top = sorted(clutch.values(), key=lambda kv: -kv[1]['clutch_pts'])[:5]
        print('top clutch scorers: ' +
              ', '.join(f"{t} {f['clutch_pts']}p" for t, f in top))
        print('(dry run -- not writing)')
        return 0

    modern = json.load(open(MODERN))
    matched = 0
    for r in modern:
        if r.get('year') != season_year or r.get('type') != 'RS':
            continue
        hit = clutch.get(norm(r['name']))
        if hit:
            r.update(hit[1])
            matched += 1
    json.dump(modern, open(MODERN, 'w'), indent=0)
    print(f'wrote {os.path.relpath(MODERN)}: clutch merged onto {matched} of '
          f'{sum(1 for r in modern if r.get("year") == season_year and r.get("type") == "RS")} '
          f'{season_label(year)} RS rows. Now rebuild career_clutch + derived/index files.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
