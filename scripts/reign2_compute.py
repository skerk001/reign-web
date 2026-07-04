#!/usr/bin/env python3
"""
REIGN 2.0 — reference implementation (proposal phase 1).

Computes v2 scores for every player-season from the season files alone and
emits a comparison report. Does NOT modify any shipped data.

Spec (docs/REIGN_V2_PROPOSAL.md), with one correction discovered while
implementing: the proposal's per-season quantile anchoring would force every
season's best player to the same score, erasing cross-season differences in
top-end dominance (Jordan '88 == weakest-year #1). Instead the rolling-window
z-composite IS the cross-era scale, and a single GLOBAL affine map calibrates
it to the familiar v1 scale (matching the pooled 1996+ median and 99th
percentile). Relative structure is preserved everywhere.

Model:
  * standardization: centered 5-season window (+-2, clamped), qualified pool
    (>= 15 MPG) of the same season type (RS pools for RS rows, PO for PO)
  * OFF  = .40 z(pts) + .20 z(tsp - lg) + .15 z(pts * tsp/lg) + .15 z(ast)
           + .10 z(obpm)            [1973+; ows/gp before]
  * DEF  tier A/B (1973+):  .35 z(dbpm) + .25 z(dws/gp) + .15 z(stl)
                            + .15 z(blk) + .10 z(dreb)
         tier C (1950-72):  .60 z(dws/gp) + .25 z(reb)   + role floor
         tier D (1946-49):  .70 z(dws/gp)                + role floor
    role floor = median tier-A DEF earned 1973-77 by same role (guard/wing/
    big from z(reb)-z(ast)) and minutes bucket, clamped >= 0; DEF never
    reduced (max(), the validated v1 approach).
  * missing inputs contribute z = 0 (league average), never a penalty.

Run:  python3 scripts/reign2_compute.py            # report to stdout
      python3 scripts/reign2_compute.py --markdown docs/REIGN_V2_REPORT.md
"""
import argparse
import importlib.util
import json
import os
import statistics as st
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
ERAS = ['pioneer', 'legacy', 'classic', 'modern']
ERA_OF = {'Pioneer': (1946, 1962), 'Legacy': (1963, 1995),
          'Classic': (1996, 2012), 'Modern': (2013, 2026)}
QUAL_MIN = 15
BUCKETS = [(0, 20), (20, 28), (28, 32), (32, 48)]

OFF_W = [('pts', .40), ('eff', .20), ('voleff', .15), ('ast', .15), ('oimp', .10)]
DEF_AB = [('dbpm', .35), ('dws_pg', .25), ('stl', .15), ('blk', .15), ('dreb', .10)]
DEF_C = [('dws_pg', .60), ('reb', .25)]
DEF_D = [('dws_pg', .70)]


def num(v):
    return float(v) if isinstance(v, (int, float)) else None


def load_rows():
    spec = importlib.util.spec_from_file_location('bd', os.path.join(HERE, 'build_derived.py'))
    bd = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bd)
    return bd.load_seasons()  # deduped, one row per player-season


def features(r, win_tsp_mean):
    """Raw feature dict for a row; None = missing."""
    gp = num(r.get('gp'))
    f = {
        'pts': num(r.get('pts')), 'ast': num(r.get('ast')), 'reb': num(r.get('reb')),
        'stl': num(r.get('stl')), 'blk': num(r.get('blk')), 'dreb': num(r.get('dreb')),
        'dbpm': num(r.get('dbpm')),
        'dws_pg': (num(r.get('dws')) / gp) if gp and num(r.get('dws')) is not None else None,
    }
    tsp = num(r.get('tsp'))
    f['eff'] = (tsp - win_tsp_mean) if (tsp is not None and win_tsp_mean) else None
    f['voleff'] = (f['pts'] * tsp / win_tsp_mean) if (
        f['pts'] is not None and tsp is not None and win_tsp_mean) else None
    if r['year'] >= 1973:
        f['oimp'] = num(r.get('obpm'))
    else:
        ows = num(r.get('ows'))
        f['oimp'] = (ows / gp) if gp and ows is not None else None
    return f


def window_years(year, all_years):
    lo, hi = min(all_years), max(all_years)
    a, b = year - 2, year + 2
    if a < lo:
        a, b = lo, min(hi, lo + 4)
    if b > hi:
        a, b = max(lo, hi - 4), hi
    return a, b


def build_params(rows, stype):
    """(year -> stat -> (mean, std)) over the qualified window pool, plus the
    window tsp mean used by the eff/voleff features."""
    qual = [r for r in rows if r['type'] == stype and (num(r.get('min')) or 0) >= QUAL_MIN]
    by_year = defaultdict(list)
    for r in qual:
        by_year[r['year']].append(r)
    years = sorted(by_year)
    tsp_mean, params = {}, {}
    # pass 1: window tsp means (needed to define eff/voleff)
    for y in years:
        a, b = window_years(y, years)
        vals = [num(r.get('tsp')) for yy in range(a, b + 1)
                for r in by_year.get(yy, []) if num(r.get('tsp'))]
        tsp_mean[y] = st.mean(vals) if vals else None
    # pass 2: per-stat window mean/std
    stats = ['pts', 'ast', 'reb', 'stl', 'blk', 'dreb', 'dbpm', 'dws_pg', 'eff', 'voleff', 'oimp']
    feats_by_year = {y: [features(r, tsp_mean[y]) for r in by_year[y]] for y in years}
    for y in years:
        a, b = window_years(y, years)
        params[y] = {}
        for s in stats:
            vals = [f[s] for yy in range(a, b + 1)
                    for f in feats_by_year.get(yy, []) if f.get(s) is not None]
            if len(vals) >= 8:
                m = st.mean(vals)
                sd = st.pstdev(vals) or 1.0
                params[y][s] = (m, sd)
    return params, tsp_mean


def z(f, s, p):
    if s not in p or f.get(s) is None:
        return 0.0  # missing input = league average, never a penalty
    m, sd = p[s]
    return (f[s] - m) / sd


def raw_scores(r, p, tsp_mean):
    f = features(r, tsp_mean)
    off = sum(w * z(f, s, p) for s, w in OFF_W)
    if r['year'] >= 1973:
        dfn = sum(w * z(f, s, p) for s, w in DEF_AB)
    elif r['year'] >= 1950:
        dfn = sum(w * z(f, s, p) for s, w in DEF_C)
    else:
        dfn = sum(w * z(f, s, p) for s, w in DEF_D)
    return off, dfn


def assign_roles(rows):
    """guard/wing/big from z(reb)-z(ast) within each season (v1 approach)."""
    by_year = defaultdict(list)
    for r in rows:
        by_year[r['year']].append(r)
    scores = {}
    for grp in by_year.values():
        for key in ('reb', 'ast'):
            vals = [num(g.get(key)) or 0.0 for g in grp]
            m, sd = st.mean(vals), (st.pstdev(vals) or 1.0)
            for g, v in zip(grp, vals):
                scores.setdefault(id(g), 0.0)
                scores[id(g)] += ((v - m) / sd) if key == 'reb' else -((v - m) / sd)
    allv = sorted(scores.values())
    q33, q66 = allv[len(allv) // 3], allv[2 * len(allv) // 3]
    return {rid: ('guard' if s < q33 else 'big' if s > q66 else 'wing')
            for rid, s in scores.items()}


def bucket_of(m):
    for lo, hi in BUCKETS:
        if lo <= m < hi:
            return (lo, hi)
    return BUCKETS[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--markdown', default=None)
    args = ap.parse_args()

    rows = load_rows()
    out = []

    scored = {}  # id(row) -> (off_raw, def_raw)
    for stype in ('RS', 'PO'):
        params, tsp_mean = build_params(rows, stype)
        pool = [r for r in rows if r['type'] == stype]
        for r in pool:
            p = params.get(r['year'])
            if not p:
                continue
            scored[id(r)] = raw_scores(r, p, tsp_mean.get(r['year']))

    # role floors for pre-1973 DEF, calibrated on 1973-77 RS qualified rows
    early = [r for r in rows if r['type'] == 'RS' and 1973 <= r['year'] <= 1977
             and (num(r.get('min')) or 0) >= QUAL_MIN and id(r) in scored]
    roles = assign_roles(early)
    floor = defaultdict(list)
    for r in early:
        floor[(roles[id(r)], bucket_of(num(r.get('min')) or 0))].append(scored[id(r)][1])
    floors = {k: max(0.0, st.median(v)) for k, v in floor.items()}
    pre = [r for r in rows if r['year'] < 1973 and id(r) in scored]
    pre_roles = assign_roles(pre)
    for r in pre:
        o, d = scored[id(r)]
        fl = floors.get((pre_roles[id(r)], bucket_of(num(r.get('min')) or 0)), 0.0)
        scored[id(r)] = (o, max(d, fl))

    # global affine calibration to the familiar v1 scale:
    # match pooled 1996+ RS qualified median and 99th percentile
    def q(vals, pct):
        vals = sorted(vals)
        return vals[min(len(vals) - 1, int(pct * len(vals)))]
    anchor = [r for r in rows if r['type'] == 'RS' and r['year'] >= 1996
              and (num(r.get('min')) or 0) >= QUAL_MIN and id(r) in scored]
    v1 = [r['reign'] for r in anchor]
    v2 = [sum(scored[id(r)]) for r in anchor]
    b = (q(v1, .99) - q(v1, .50)) / ((q(v2, .99) - q(v2, .50)) or 1.0)
    a = q(v1, .50) - b * q(v2, .50)
    v1o = [num(r.get('reign_off')) or 0 for r in anchor]
    v1d = [num(r.get('reign_def')) or 0 for r in anchor]
    a_off = q(v1o, .50) - b * q([scored[id(r)][0] for r in anchor], .50)
    a_def = q(v1d, .50) - b * q([scored[id(r)][1] for r in anchor], .50)
    print(f'affine: score = {a:+.2f} {b:+.2f}*raw  (off int {a_off:+.2f}, def int {a_def:+.2f})',
          file=sys.stderr)

    for r in rows:
        if id(r) not in scored:
            continue
        o, d = scored[id(r)]
        r2o, r2d = a_off + b * o, a_def + b * d
        out.append({'name': r['name'], 'year': r['year'], 'type': r['type'],
                    'team': r.get('team'), 'era': r.get('era'), 'min': num(r.get('min')) or 0,
                    'v1': r['reign'], 'v2': round(r2o + r2d, 2),
                    'v2_off': round(r2o, 2), 'v2_def': round(r2d, 2)})

    # ---------------- report ----------------
    lines = []
    w = lines.append
    w('# REIGN 2.0 — first full computation\n')
    w('Scored from the season files alone (rolling 5-year windows, declared '
      'weights, global affine to the v1 scale). No shipped data modified.\n')

    qual = [r for r in out if r['type'] == 'RS' and r['min'] >= QUAL_MIN]
    # rank correlation v1 vs v2 (Spearman via rank lists)
    def spearman(pairs):
        xs = sorted(range(len(pairs)), key=lambda i: pairs[i][0])
        ys = sorted(range(len(pairs)), key=lambda i: pairs[i][1])
        rx, ry = [0] * len(pairs), [0] * len(pairs)
        for rank, i in enumerate(xs):
            rx[i] = rank
        for rank, i in enumerate(ys):
            ry[i] = rank
        n = len(pairs)
        return 1 - 6 * sum((rx[i] - ry[i]) ** 2 for i in range(n)) / (n * (n * n - 1))
    w(f'\n**Continuity:** Spearman(v1, v2) over {len(qual):,} qualified RS '
      f'seasons = **{spearman([(r["v1"], r["v2"]) for r in qual]):.3f}**\n')

    for era, (y0, y1) in ERA_OF.items():
        w(f'\n## {era} ({y0}–{y1}) — top 10 peak seasons\n')
        er = [r for r in qual if y0 <= r['year'] <= y1]
        w('| # | REIGN 2.0 | v2 (OFF/DEF) | v1 | | # | REIGN 1.x | v1 |')
        w('|---|---|---|---|---|---|---|---|')
        t2 = sorted(er, key=lambda r: -r['v2'])[:10]
        t1 = sorted(er, key=lambda r: -r['v1'])[:10]
        for i in range(10):
            l2 = (f"{t2[i]['name']} '{str(t2[i]['year'] + 1)[2:]} | "
                  f"**{t2[i]['v2']:+.1f}** ({t2[i]['v2_off']:+.1f}/{t2[i]['v2_def']:+.1f}) | "
                  f"{t2[i]['v1']:+.1f}") if i < len(t2) else ' | | '
            l1 = (f"{t1[i]['name']} '{str(t1[i]['year'] + 1)[2:]} | "
                  f"{t1[i]['v1']:+.1f}") if i < len(t1) else ' | '
            w(f'| {i + 1} | {l2} | | {i + 1} | {l1} |')

    # all-time peak top 15 (v2)
    w('\n## All-time top 15 peak seasons (REIGN 2.0, regular season)\n')
    w('| # | player | season | v2 | OFF | DEF | v1 |')
    w('|---|---|---|---|---|---|---|')
    for i, r in enumerate(sorted(qual, key=lambda r: -r['v2'])[:15], 1):
        w(f"| {i} | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | "
          f"**{r['v2']:+.1f}** | {r['v2_off']:+.1f} | {r['v2_def']:+.1f} | {r['v1']:+.1f} |")

    # movers
    w('\n## Biggest movers (qualified RS seasons, |v2 − v1|)\n')
    w('| direction | player | season | v1 | v2 |')
    w('|---|---|---|---|---|')
    movers = sorted(qual, key=lambda r: -(r['v2'] - r['v1']))
    for r in movers[:8]:
        w(f"| ▲ | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | {r['v1']:+.1f} | {r['v2']:+.1f} |")
    for r in movers[-8:]:
        w(f"| ▼ | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | {r['v1']:+.1f} | {r['v2']:+.1f} |")

    # the bug this exists to fix: early-pioneer OFF vs late-pioneer OFF
    w('\n## Pioneer edge check (era-pool bias fix)\n')
    w('Mean OFF of qualified players by season — v1 penalized 1947–50 for '
      'preceding the era-pool average; v2 should be ~flat:\n')
    w('| seasons | v1 mean OFF | v2 mean OFF |')
    w('|---|---|---|')
    early_p = [r for r in qual if 1946 <= r['year'] <= 1949]
    late_p = [r for r in qual if 1958 <= r['year'] <= 1962]
    rows_by = {}
    for r in [x for x in rows if x['type'] == 'RS' and (num(x.get('min')) or 0) >= QUAL_MIN]:
        rows_by[(r['name'], r['year'])] = num(r.get('reign_off')) or 0
    for label, grp in (('1946–49', early_p), ('1958–62', late_p)):
        v1m = st.mean(rows_by.get((r['name'], r['year']), 0) for r in grp)
        v2m = st.mean(r['v2_off'] for r in grp)
        w(f'| {label} | {v1m:+.2f} | {v2m:+.2f} |')

    report = '\n'.join(lines)
    if args.markdown:
        open(args.markdown, 'w').write(report + '\n')
        print(f'wrote {args.markdown}', file=sys.stderr)
    else:
        print(report)


if __name__ == '__main__':
    main()
