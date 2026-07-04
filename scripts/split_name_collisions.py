#!/usr/bin/env python3
"""
Split same-named players into distinct careers using Basketball-Reference IDs.

PROBLEM
-------
Every file in the pipeline keys players by display name. 38 NBA names belong
to 2-3 DIFFERENT people (Patrick Ewing + his son, Larry Johnson the Hornets
star + a 1977 journeyman, Mike Dunleavy Sr./Jr., three 1970s George
Johnsons, ...), so their careers were merged: wrong season counts, wrong
career totals, wrong award shelves, and two players' trajectories drawn as
one line.

FIX
---
Attribute each season row of a colliding name to its bref player_id using the
mirror dataset (season + team + games), then disambiguate the display name
with the player's career span, e.g.

    George Johnson  ->  George Johnson (1970-77)   [johnsge01]
                        George Johnson (1972-86)   [johnsge02]
                        George Johnson (1978-86)   [johnsge03]

ALL members of a collision get a span suffix (no ambiguous plain name
survives). The mapping is written to public/data/name_aliases.json so the
nightly scraper can apply the same renames to freshly scraped rows.

Also fixes the two name-keyed sidecar files:
  * awards.json  -- honors assigned to the player who earned them (largest
    career by games, with explicit overrides where that heuristic is wrong:
    'Eddie Johnson' honors belong to Fast Eddie the Atlanta guard, not the
    longer-career Kings forward; 'Freddie Lewis' All-Star honors belong to
    the ABA-era guard).
  * career_clutch.json -- entries attributed by era overlap; entries that
    genuinely merge two players' clutch careers (both active in the clutch
    window with no way to split the pre-2013 portion) are DROPPED with a log
    line, since a wrong merged entry is worse than a missing fringe one.

CSV SOURCE: Data/Advanced.csv from
https://github.com/sumitrodatta/bball-reference-datasets (bref-scraped,
already validated against our committed rows -- see backfill_modern_advanced).

Run:  python3 scripts/split_name_collisions.py --csv Advanced.csv [--write]
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
ERAS = ['pioneer', 'legacy', 'classic', 'modern']

# awards bundles that the max-games heuristic would misassign
AWARD_OVERRIDES = {
    # Fast Eddie (Atlanta guard, 1977-87) earned the All-Star nods, not the
    # longer-career Kings/Suns forward (1981-99).
    'Eddie Johnson': 'earliest',
    # The 3x (ABA) All-Star is the 1966-77 guard, not the 1950s Hawks player.
    'Freddie Lewis': 'latest',
}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def load_mirror(path):
    """player display name -> pid -> {season_end_year: [(team, games), ...]}"""
    byname = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for r in csv.DictReader(open(path, encoding='utf-8')):
        if r['lg'] not in ('NBA', 'BAA'):
            continue
        byname[r['player']][r['player_id']][int(r['season'])].append(
            (r['team'], num(r['g'])))
    return byname


def span_label(seasons):
    """'1978-86' from season END years (display convention: start year to
    two-digit end year)."""
    first, last = min(seasons) - 1, max(seasons)
    return f'{first}-{str(last)[2:]}'


def build_plan(mirror):
    """For each colliding name: pid -> {label, seasons, teams_by_season}."""
    plan = {}
    for name, pids in mirror.items():
        if len(pids) < 2:
            continue
        entries = {}
        for pid, seasons in pids.items():
            label = f'{name} ({span_label(seasons.keys())})'
            entries[pid] = {'label': label, 'seasons': seasons}
        # identical spans would produce identical labels -- disambiguate
        labels = [e['label'] for e in entries.values()]
        if len(set(labels)) != len(labels):
            for pid, e in entries.items():
                e['label'] = f"{name} ({span_label(e['seasons'].keys())}, {pid})"
        plan[name] = entries
    return plan


def attribute(row, entries):
    """Which pid does this season row belong to? Match season end-year, then
    team, then closest games count. Returns pid or None."""
    year_end = row['year'] + 1
    active = {pid: e for pid, e in entries.items() if year_end in e['seasons']}
    if not active:
        return None
    if len(active) == 1:
        return next(iter(active))
    team = row.get('team')
    by_team = [pid for pid, e in active.items()
               if any(t == team for t, _ in e['seasons'][year_end])]
    if len(by_team) == 1:
        return by_team[0]
    # combined ('2TM') rows or shared team: closest games count wins
    gp = row.get('gp')
    if isinstance(gp, (int, float)):
        best, best_d = None, 1e9
        for pid, e in active.items():
            for _t, g in e['seasons'][year_end]:
                d = abs(g - gp)
                if d < best_d:
                    best, best_d = pid, d
        return best
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', required=True)
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    mirror = load_mirror(args.csv)
    plan = build_plan(mirror)
    print(f'{len(plan)} colliding display names in the bref mirror')

    renamed = defaultdict(int)
    unattributed = []
    for era in ERAS:
        path = os.path.join(DATA, f'seasons_{era}.json')
        rows = json.load(open(path))
        changed = 0
        for r in rows:
            entries = plan.get(r.get('name'))
            if not entries:
                continue
            pid = attribute(r, entries)
            if pid is None:
                unattributed.append((r['name'], r['year'], r.get('team')))
                continue
            new = entries[pid]['label']
            renamed[(r['name'], new)] += 1
            r['name'] = new
            changed += 1
        if args.write and changed:
            json.dump(rows, open(path, 'w'), indent=0)
        print(f'  seasons_{era}: {changed} rows renamed')

    print(f'\n{sum(renamed.values())} season rows attributed; '
          f'{len(unattributed)} unattributed{": " + str(unattributed[:5]) if unattributed else ""}')
    for (old, new), n in sorted(renamed.items()):
        print(f'  {old:24} -> {new:34} ({n} rows)')

    # --- awards.json: assign each colliding entry to the earning player ----
    awards = json.load(open(os.path.join(DATA, 'awards.json')))
    aw_changed = 0
    for a in awards:
        entries = plan.get(a.get('name'))
        if not entries:
            continue
        mode = AWARD_OVERRIDES.get(a['name'], 'most_games')
        if mode == 'earliest':
            pid = min(entries, key=lambda p: min(entries[p]['seasons']))
        elif mode == 'latest':
            pid = max(entries, key=lambda p: min(entries[p]['seasons']))
        else:  # most career games in the mirror
            pid = max(entries, key=lambda p: sum(
                g for yr in entries[p]['seasons'].values() for _t, g in yr))
        print(f'  awards: {a["name"]} -> {entries[pid]["label"]}')
        a['name'] = entries[pid]['label']
        aw_changed += 1
    if args.write and aw_changed:
        json.dump(awards, open(os.path.join(DATA, 'awards.json'), 'w'),
                  separators=(',', ':'))

    # --- career_clutch.json: attribute by era overlap or drop merged -------
    cc_path = os.path.join(DATA, 'career_clutch.json')
    cc = json.load(open(cc_path))
    kept, dropped = [], []
    for c in cc:
        entries = plan.get(c.get('name'))
        if not entries:
            kept.append(c)
            continue
        active = [pid for pid, e in entries.items()
                  if any(c['ys'] + 1 <= yr <= c['ye'] + 1 for yr in e['seasons'])]
        if len(active) == 1:
            print(f'  clutch: {c["name"]} -> {entries[active[0]]["label"]}')
            c['name'] = entries[active[0]]['label']
            kept.append(c)
        else:
            dropped.append(c['name'])
            print(f'  clutch: DROPPED merged entry "{c["name"]}" '
                  f'({len(active)} players share its clutch window)')
    if args.write:
        json.dump(kept, open(cc_path, 'w'), separators=(',', ':'))

    # --- alias map for the nightly scraper ---------------------------------
    aliases = {}
    for name, entries in plan.items():
        aliases[name] = [
            {'pid': pid, 'label': e['label'],
             'seasons': sorted(e['seasons'].keys())}
            for pid, e in sorted(entries.items())]
    if args.write:
        with open(os.path.join(DATA, 'name_aliases.json'), 'w') as f:
            json.dump(aliases, f, separators=(',', ':'))
        print(f'\nwrote name_aliases.json ({len(aliases)} names) -- '
              f'now rebuild derived/index files')
    else:
        print('\n(dry run -- pass --write to apply)')


if __name__ == '__main__':
    main()
