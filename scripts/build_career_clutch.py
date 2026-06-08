#!/usr/bin/env python3
"""
Update career_clutch.json from the per-season clutch stats.

career_clutch.json powers the Visualizations "clutch career" leaderboard. It
aggregates each player's RS *and* PO clutch numbers -- but only the REGULAR
SEASON clutch lives in the season files (clutch_* fields, RS rows only). The
playoff clutch totals exist *only* here, pre-aggregated, with no committed
source. So we cannot safely rebuild this file from scratch without dropping
historical playoff clutch.

Instead this updater is conservative and idempotent:

  * It starts from the committed file and keeps every entry byte-for-byte
    UNLESS that player's regular-season clutch game count changed (i.e. they
    played new clutch minutes since the last run -- exactly the rows a daily
    refresh touches).
  * For a changed player it recomputes the RS aggregates from their season
    rows (the source of truth), PRESERVES their playoff portion from the
    committed file, and recomputes the RS+PO totals.
  * A genuinely new player is added only once their RS clutch games reach the
    file's ~10-game membership floor (their PO portion starts empty until a
    playoff clutch backfill fills it).

On unmodified data every player's season-row rs_gp equals the stored rs_gp, so
this reproduces career_clutch.json exactly (verified with --verify).

Run:  python3 scripts/build_career_clutch.py
      python3 scripts/build_career_clutch.py --verify
"""
import json
import os
import sys
from collections import defaultdict

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
ERAS = ['pioneer', 'legacy', 'classic', 'modern']
OUT = os.path.join(DATA, 'career_clutch.json')
MIN_TOTAL_GP = 10  # membership floor recovered from the committed file


def load_rs_clutch():
    """RS clutch season rows grouped by player (the only clutch in season files)."""
    byname = defaultdict(list)
    for e in ERAS:
        for r in json.load(open(os.path.join(DATA, f'seasons_{e}.json'))):
            if r.get('type') == 'RS' and isinstance(r.get('clutch_gp'), (int, float)) and r['clutch_gp']:
                byname[r['name']].append(r)
    return byname


def rs_aggregate(rows):
    gp = sum(r['clutch_gp'] for r in rows)
    tot_pts = sum(r.get('clutch_tot_pts', 0) for r in rows)
    tot_pm = sum(r.get('clutch_tot_pm', 0) for r in rows)
    tot_ast = sum(r.get('clutch_tot_ast', 0) for r in rows)
    # games-weighted win pct (clutch wins aren't stored per season, so this is
    # weighted from the rounded per-season clutch_wpct -- exact to ~0.01)
    wpct = sum(r.get('clutch_wpct', 0) * r['clutch_gp'] for r in rows) / gp if gp else 0
    teams, eras, years = [], [], []
    for r in sorted(rows, key=lambda x: x['year']):
        if r.get('team') and r['team'] not in teams:
            teams.append(r['team'])
        if r.get('era') and r['era'] not in eras:
            eras.append(r['era'])
        years.append(r['year'])
    return {
        'rs_seasons': len(rows), 'rs_gp': gp,
        'rs_tot_pts': round(tot_pts, 1), 'rs_tot_pm': round(tot_pm, 1), 'rs_tot_ast': round(tot_ast, 1),
        'rs_avg_pts': round(tot_pts / gp, 1) if gp else 0,
        'rs_avg_pm': round(tot_pm / gp, 1) if gp else 0,
        'rs_avg_wpct': round(wpct, 2),
        '_teams': teams, '_eras': eras, '_ys': min(years), '_ye': max(years),
    }


def merged_record(prior, rows):
    """Recompute a player's record: fresh RS aggregates + preserved PO portion."""
    agg = rs_aggregate(rows)
    po_gp = prior.get('po_gp', 0)
    po_pts = prior.get('po_tot_pts', 0.0)
    po_pm = prior.get('po_tot_pm', 0.0)
    # union team/era/year span across RS rows and whatever the committed record knew
    teams = list(dict.fromkeys((prior.get('teams') or []) + agg.pop('_teams')))
    eras = list(dict.fromkeys((prior.get('eras') or []) + agg.pop('_eras')))
    ys = min([agg.pop('_ys')] + ([prior['ys']] if 'ys' in prior else []))
    ye = max([agg.pop('_ye')] + ([prior['ye']] if 'ye' in prior else []))
    rec = {
        'name': prior.get('name'), 'teams': teams, 'eras': eras, 'ys': ys, 'ye': ye,
        **agg,
        'po_seasons': prior.get('po_seasons', 0), 'po_gp': po_gp,
        'po_tot_pts': prior.get('po_tot_pts', 0.0), 'po_tot_pm': prior.get('po_tot_pm', 0.0),
        'po_tot_ast': prior.get('po_tot_ast', 0.0),
        'po_avg_pts': prior.get('po_avg_pts', 0.0), 'po_avg_pm': prior.get('po_avg_pm', 0.0),
        'po_avg_wpct': prior.get('po_avg_wpct', 0.0),
        'total_gp': agg['rs_gp'] + po_gp,
        'total_pts': round(agg['rs_tot_pts'] + po_pts, 1),
        'total_pm': round(agg['rs_tot_pm'] + po_pm, 1),
    }
    # keep the committed key order/shape: drop PO keys that weren't in prior
    if 'po_gp' not in prior:
        for k in ['po_seasons', 'po_gp', 'po_tot_pts', 'po_tot_pm', 'po_tot_ast',
                  'po_avg_pts', 'po_avg_pm', 'po_avg_wpct']:
            rec[k] = 0 if k in ('po_seasons', 'po_gp') else 0.0
    return rec


def build(prior_list, byname):
    prior = {c['name']: c for c in prior_list}
    out, seen = [], set()
    # existing entries: keep verbatim unless their RS clutch games changed
    for c in prior_list:
        rows = byname.get(c['name'])
        seen.add(c['name'])
        if rows and sum(r['clutch_gp'] for r in rows) != c.get('rs_gp'):
            rec = merged_record(c, rows)
            rec['name'] = c['name']
            out.append(rec)
        else:
            out.append(c)
    # brand-new players who have crossed the membership floor
    for name, rows in byname.items():
        if name in seen:
            continue
        if sum(r['clutch_gp'] for r in rows) >= MIN_TOTAL_GP:
            rec = merged_record({'name': name}, rows)
            out.append(rec)
    return out


def main():
    prior_list = json.load(open(OUT))
    byname = load_rs_clutch()
    fresh = build(prior_list, byname)

    if '--verify' in sys.argv:
        before = json.dumps(prior_list, separators=(',', ':'))
        after = json.dumps(fresh, separators=(',', ':'))
        print('VERIFY:', 'identical' if before == after else 'CHANGED',
              f'({len(prior_list)} -> {len(fresh)} entries)')
        return

    changed = sum(1 for a, b in zip(prior_list, fresh) if a != b) + (len(fresh) - len(prior_list))
    json.dump(fresh, open(OUT, 'w'), separators=(',', ':'))
    print(f'wrote {os.path.relpath(OUT)} ({len(fresh)} entries, ~{changed} updated/added)')


if __name__ == '__main__':
    main()
