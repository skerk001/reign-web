#!/usr/bin/env python3
"""
Adjust pioneer-era (1946-1962) defensive REIGN: role-relative floor.

WHY
---
The pioneer era predates official steal/block tracking. The only individual
defensive signal in the data is DWS, which is allocated largely by minutes on
good defensive teams and so mechanically favors centers. As a result pioneer
`reign_def` has a median of 0.00 and starting guards/wings are credited with
~zero defense, even though no player who logs starter minutes contributes
literally nothing on that end.

WHAT
----
We never fabricate elite defense. We apply a *floor* only, calibrated to the
earliest era that actually has defensive data (legacy, 1963-1972):

  reign_def_adj = max(reign_def_orig, floor[role][minutes_bucket])

where floor[role][bucket] is the MEDIAN reign_def earned by same-role,
same-minutes players once defense became measurable (clamped at >= 0). Because
it is a max(), no player is ever demoted: Russell/Mikan keep their large,
legitimate defensive scores; under-credited starters are lifted to the level
their measurable-era peers actually achieved.

Role is inferred (there is no position field) from each season's rebound/assist
profile: role_score = z(reb) - z(ast); low = guard, high = big, middle = wing.

reign is then recomposed as reign_off + reign_def_adj.

The script is idempotent and reversible: it preserves `reign_def_orig` /
`reign_orig` and always recomputes from those, and tags adjusted rows with
`def_adjusted`. Re-running with a different calibration just overwrites the adj.

Run:  python3 scripts/adjust_pioneer_defense.py [--write]
Without --write it only prints the before/after; with --write it updates
public/data/seasons_pioneer.json.
"""
import json, os, sys, statistics as st

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
BUCKETS = [(0, 20), (20, 28), (28, 32), (32, 48)]


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def zscore(vals):
    m = st.mean(vals)
    s = st.pstdev(vals) or 1.0
    return [(v - m) / s for v in vals]


def assign_roles(rows):
    """Per-season role from z(reb)-z(ast). Returns thresholds + tags rows._role."""
    by_year = {}
    for r in rows:
        by_year.setdefault(r['year'], []).append(r)
    for grp in by_year.values():
        zr = zscore([num(g.get('reb')) for g in grp])
        za = zscore([num(g.get('ast')) for g in grp])
        for g, a, b in zip(grp, zr, za):
            g['_role_score'] = a - b
    scores = sorted(r['_role_score'] for r in rows)
    q33 = scores[len(scores) // 3]
    q66 = scores[2 * len(scores) // 3]
    for r in rows:
        s = r['_role_score']
        r['_role'] = 'guard' if s < q33 else ('big' if s > q66 else 'wing')
    return q33, q66


def bucket_of(minutes):
    for lo, hi in BUCKETS:
        if lo <= minutes < hi:
            return (lo, hi)
    return BUCKETS[-1]


def calibrate_floor():
    """Median reign_def by (role, minutes bucket) from legacy 1963-1972, >=0."""
    leg = json.load(open(os.path.join(DATA, 'seasons_legacy.json')))
    early = [x for x in leg if 1963 <= x['year'] <= 1972 and num(x.get('min')) > 0]
    assign_roles(early)
    floor = {}
    for role in ('guard', 'wing', 'big'):
        floor[role] = {}
        for b in BUCKETS:
            vals = [x['reign_def'] for x in early
                    if x['_role'] == role and bucket_of(num(x.get('min'))) == b]
            floor[role][b] = max(0.0, st.median(vals)) if vals else 0.0
    return floor


def apply_adjustment(rows, floor):
    """Floor only, and tag *only* the rows we actually change, so unaffected
    rows stay byte-identical in the compact JSON. Idempotent: recompute from
    the preserved original and un-tag if a row no longer clears the floor."""
    for r in rows:
        orig_def = r.get('reign_def_orig', r['reign_def'])
        orig_off = num(r.get('reign_off'))
        f = floor[r['_role']][bucket_of(num(r.get('min')))]
        adj = max(orig_def, f)
        if adj > orig_def + 1e-9:
            r['reign_def_orig'] = orig_def
            r.setdefault('reign_orig', r['reign'])
            r['reign_def'] = round(adj, 2)
            r['reign'] = round(orig_off + adj, 2)
            r['def_adjusted'] = True
        elif 'reign_def_orig' in r:  # previously adjusted, now restore
            r['reign_def'] = r.pop('reign_def_orig')
            r['reign'] = r.pop('reign_orig', r['reign'])
            r.pop('def_adjusted', None)
    return rows


def peak_table(rows, label):
    best = {}
    for r in rows:
        if r['name'] not in best or r['reign'] > best[r['name']]['reign']:
            best[r['name']] = r
    top = sorted(best.values(), key=lambda x: -x['reign'])[:12]
    print(f"\n=== {label}: peak-season leaderboard ===")
    print(f"{'player':22}{'yr':>5}{'reign':>7}{'off':>7}{'def':>7}{'role':>7}")
    for x in top:
        print(f"{x['name'][:21]:22}{x['year']:>5}{x['reign']:>7.1f}"
              f"{num(x['reign_off']):>7.1f}{x['reign_def']:>7.1f}{x.get('_role',''):>7}")


def main():
    write = '--write' in sys.argv
    rows = json.load(open(os.path.join(DATA, 'seasons_pioneer.json')))
    floor = calibrate_floor()
    print("Calibrated floors (legacy 1963-72 median reign_def, clamped >=0):")
    for role in ('guard', 'wing', 'big'):
        print(f"  {role:6}", {f'{lo}-{hi}': round(floor[role][(lo, hi)], 2) for lo, hi in BUCKETS})
    assign_roles(rows)
    peak_table(rows, "BEFORE")
    apply_adjustment(rows, floor)
    peak_table(rows, "AFTER")
    nadj = sum(1 for r in rows if r.get('def_adjusted'))
    print(f"\n{nadj}/{len(rows)} pioneer rows lifted by the floor.")
    if write:
        for r in rows:
            r.pop('_role_score', None)
            r.pop('_role', None)
        path = os.path.join(DATA, 'seasons_pioneer.json')
        with open(path, 'w') as f:
            json.dump(rows, f, separators=(',', ':'))
        print(f"wrote {os.path.relpath(path)}")
    else:
        print("(dry run - pass --write to persist)")


if __name__ == '__main__':
    main()
