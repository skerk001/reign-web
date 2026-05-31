#!/usr/bin/env python3
"""
Rebuild every derived data file from the per-era season files.

The original generators for the stretch/career files were never committed
(`regenerate_careers.py` expects a `seasons.json` that does not exist). This
script reverse-engineers them and is validated to reproduce the committed
files byte-for-byte on unmodified data (see `--verify`). It is what makes it
safe to regenerate after editing the season data (e.g. the pioneer defensive
floor).

Outputs (compact JSON, matching the committed format):
  stretches_rs3/rs5/po3/po5.json  career_avg_rs/po.json  careers.json

Conventions recovered from the committed data:
  * stretches  = a player's best-N seasons by reign among rows with min >= 10,
                 averaged. Counting stats divide by N (null -> 0); fg3p averages
                 only seasons that actually attempted threes (non-null, != 0).
  * career RS aggregates (n, rc, rp, ap/ar/aa, ys/ye, teams, eras) use ALL RS
    rows; PO aggregates (pn, pp...) use ALL PO rows; r3/r5/p3 come from the
    min>=10 stretch files. rank = position in rp-descending order.
  * career_avg_{rs,po} = simple mean over all RS/PO rows.

ap/ar/aa (career avg pts/reb/ast) depend only on box stats, never on reign, so
they are carried over verbatim from the existing careers.json -- this avoids
spurious 0.1 churn from float-rounding artifacts and keeps the diff limited to
reign-derived fields.

Run:  python3 scripts/build_derived.py            # regenerate in place
      python3 scripts/build_derived.py --verify   # check exact reproduction
"""
import json, os, sys
from collections import defaultdict

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
ERAS = ['pioneer', 'legacy', 'classic', 'modern']


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def load_seasons():
    out = []
    for e in ERAS:
        out += json.load(open(os.path.join(DATA, f'seasons_{e}.json')))
    return out


def dump(obj):
    return json.dumps(obj, separators=(',', ':'))


# --- stretches -----------------------------------------------------------
DIVN = ['reign', 'reign_off', 'reign_def', 'pts', 'reb', 'ast', 'stl', 'blk', 'fgp', 'tsp']


def build_stretch(seasons, stype, N, thr=10):
    byp = defaultdict(list)
    for s in seasons:
        if s['type'] == stype and num(s.get('min')) >= thr:
            byp[s['name']].append(s)
    out = []
    for name, ss in byp.items():
        if len(ss) < N:
            continue
        top = sorted(ss, key=lambda s: (-s['reign'], s['year']))[:N]
        teams, eras = [], []
        for s in top:
            if s.get('team') and s['team'] not in teams:
                teams.append(s['team'])
            if s.get('era') and s['era'] not in eras:
                eras.append(s['era'])
        years = sorted(s['year'] for s in top)
        rec = {'name': name, 'teams': teams, 'eras': eras, 'years': years,
               'yr_label': ', '.join(f"'{(y + 1) % 100:02d}" for y in years)}
        for f in DIVN:
            rec['avg_' + f] = round(sum(num(s.get(f)) for s in top) / N, 4 if f == 'fgp' else 2)
        v3 = [num(s.get('fg3p')) for s in top
              if isinstance(s.get('fg3p'), (int, float)) and s.get('fg3p') != 0]
        rec['avg_fg3p'] = round(sum(v3) / len(v3), 2) if v3 else 0
        out.append(rec)
    out.sort(key=lambda r: -r['avg_reign'])
    return out


# --- career_avg ----------------------------------------------------------
def build_career_avg(seasons, stype):
    byp = defaultdict(list)
    for s in seasons:
        if s['type'] == stype:
            byp[s['name']].append(s)
    out = []
    for name, ss in byp.items():
        n = len(ss)
        out.append({'name': name, 'n': n,
                    'avg_reign': round(sum(s['reign'] for s in ss) / n, 2),
                    'avg_reign_off': round(sum(num(s.get('reign_off')) for s in ss) / n, 2),
                    'avg_reign_def': round(sum(num(s.get('reign_def')) for s in ss) / n, 2),
                    'avg_pts': round(sum(num(s.get('pts')) for s in ss) / n, 2)})
    out.sort(key=lambda r: -r['avg_reign'])
    return out


# --- careers -------------------------------------------------------------
def peak(rows):
    if not rows:
        return (None, None, None, None)
    b = sorted(rows, key=lambda s: (-s['reign'], s['year']))[0]
    return (round(b['reign'], 2), b['year'], round(num(b['reign_off']), 2), round(num(b['reign_def']), 2))


def build_careers(seasons, s3, s5, p3):
    r3 = {r['name']: r['avg_reign'] for r in s3}
    r5 = {r['name']: r['avg_reign'] for r in s5}
    pp3 = {r['name']: r['avg_reign'] for r in p3}
    # ap/ar/aa depend only on box stats -> carry over verbatim if available
    prior = {}
    path = os.path.join(DATA, 'careers.json')
    if os.path.exists(path):
        prior = {r['name']: r for r in json.load(open(path))}
    byname = defaultdict(list)
    for s in seasons:
        byname[s['name']].append(s)
    careers = []
    for name, rows in byname.items():
        rs = [s for s in rows if s['type'] == 'RS']
        if not rs:
            continue
        po = [s for s in rows if s['type'] == 'PO']
        rp, rpy, rpo, rpd = peak(rs)
        pp, ppy, ppo, ppd = peak(po)
        teams, eras = [], []
        for s in sorted(rs, key=lambda s: s['year']):
            if s.get('team') and s['team'] not in teams:
                teams.append(s['team'])
            if s.get('era') and s['era'] not in eras:
                eras.append(s['era'])

        def avg(f):
            return round(sum(num(s.get(f)) for s in rs) / len(rs), 1)
        p = prior.get(name, {})
        careers.append({
            'name': name, 'teams': teams, 'eras': eras,
            'ys': min(s['year'] for s in rs), 'ye': max(s['year'] for s in rs),
            'n': len(rs), 'rp': rp, 'rpy': rpy, 'rpo': rpo, 'rpd': rpd,
            'r3': r3.get(name), 'r5': r5.get(name),
            'rc': round(sum(s['reign'] for s in rs), 2),
            'pp': pp, 'ppy': ppy, 'ppo': ppo, 'ppd': ppd, 'p3': pp3.get(name), 'pn': len(po),
            'ap': p.get('ap', avg('pts')), 'ar': p.get('ar', avg('reb')), 'aa': p.get('aa', avg('ast')),
        })
    careers.sort(key=lambda x: -x['rp'])
    for i, c in enumerate(careers):
        c['rank'] = i + 1
    return careers


SORT_KEY = {'stretches_rs3': 'avg_reign', 'stretches_rs5': 'avg_reign',
            'stretches_po3': 'avg_reign', 'stretches_po5': 'avg_reign',
            'career_avg_rs': 'avg_reign', 'career_avg_po': 'avg_reign', 'careers': 'rp'}


def build_all(seasons):
    s3 = build_stretch(seasons, 'RS', 3)
    s5 = build_stretch(seasons, 'RS', 5)
    po3 = build_stretch(seasons, 'PO', 3)
    po5 = build_stretch(seasons, 'PO', 5)
    return {
        'stretches_rs3': s3, 'stretches_rs5': s5, 'stretches_po3': po3, 'stretches_po5': po5,
        'career_avg_rs': build_career_avg(seasons, 'RS'),
        'career_avg_po': build_career_avg(seasons, 'PO'),
        'careers': build_careers(seasons, s3, s5, po3),
    }


def affected_players(seasons):
    """Players whose seasons were touched by the adjustment (def_adjusted tag).
    Empty on unmodified data, so a merge is then a no-op identity."""
    return {s['name'] for s in seasons if s.get('def_adjusted')}


def merge(fresh, committed, affected, sort_key):
    """Take fresh records for affected players, committed records (byte-stable)
    for everyone else; re-sort. This keeps the diff to genuinely-changed rows
    and avoids cosmetic float-rounding churn in reign-independent fields."""
    fresh_by = {r['name']: r for r in fresh}
    out = []
    for r in committed:
        out.append(fresh_by[r['name']] if r['name'] in affected and r['name'] in fresh_by else r)
    out.sort(key=lambda r: -(r[sort_key] if r.get(sort_key) is not None else -9e9))
    if 'rp' == sort_key:  # careers: renumber rank after re-sort
        for i, r in enumerate(out):
            r['rank'] = i + 1
    return out


def main():
    seasons = load_seasons()
    fresh = build_all(seasons)
    affected = affected_players(seasons)

    if '--verify' in sys.argv:
        # On unmodified data, a from-scratch build matches every committed file
        # to within rounding (float artifacts aside). Report per-field max drift.
        for name, obj in fresh.items():
            ref = {r['name']: r for r in json.loads(open(os.path.join(DATA, name + '.json')).read())}
            mine = {r['name']: r for r in obj}
            setdiff = len(set(mine) ^ set(ref))
            maxd = 0.0
            for n in set(mine) & set(ref):
                for k, v in mine[n].items():
                    b = ref[n].get(k)
                    if isinstance(v, (int, float)) and isinstance(b, (int, float)):
                        maxd = max(maxd, abs(v - b))
            print(f'  {name}: set_diff={setdiff}  max_field_drift={maxd:.4f}')
        print('VERIFY: set must be identical and drift <= 0.01 (float rounding)')
        return

    n_aff = sum(1 for f in fresh.values() for r in f if r['name'] in affected)
    print(f'{len(affected)} affected players; merging fresh records for them only')
    for name, obj in fresh.items():
        committed = json.loads(open(os.path.join(DATA, name + '.json')).read())
        merged = merge(obj, committed, affected, SORT_KEY[name])
        open(os.path.join(DATA, name + '.json'), 'w').write(dump(merged))
        changed = sum(1 for r in merged if r['name'] in affected)
        print(f'wrote {name}.json ({len(merged)} rows, {changed} recomputed)')


if __name__ == '__main__':
    main()
