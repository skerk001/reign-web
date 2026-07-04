#!/usr/bin/env python3
"""
REIGN 2.0 — reference implementation (proposal phases 1-2).

Computes v2 scores for every player-season from the season files alone and
emits a comparison report. Does NOT modify any shipped data.

Spec (docs/REIGN_V2_PROPOSAL.md), with one correction discovered while
implementing: the proposal's per-season quantile anchoring would force every
season's best player to the same score, erasing cross-season differences in
top-end dominance (Jordan '88 == weakest-year #1). Instead the rolling-window
z-composite IS the cross-era scale, and a single GLOBAL affine map calibrates
it to the familiar v1 scale (matching the pooled 1996+ median and 99th
percentile).

v2.1 (after maintainer review of the first run: "favors old-era rebounding
and centers; penalizes the dead-ball era; Mikan/Wilt/Russell over LeBron is
wrong"):
  * ROLE-RELATIVE DEFENSE: rebounds/steals/blocks are standardized within
    guard/wing/big pools, so centers are compared to centers.
  * CROSS-TIER DEF VARIANCE: the sparse pre-1973 DEF tiers are rescaled to
    the post-1973 qualified spread (kills +20 DEF outliers), and total DEF
    spread is balanced to v1's OFF/DEF ratio.
  * ERA-STRENGTH PRIOR: within-league z-scores measure separation from
    peers, which conflates dominance with league depth -- a 6-sigma outlier
    in a 10-team, pre-integration league is cheap. An empirical chained
    estimator (same players tracked across adjacent seasons, age-adjusted)
    was tried and REJECTED: survivor bias plus expansion dilution make it
    claim 1961 and 1983 were stronger than 2024. Instead: a DECLARED
    talent-pool index (US cohort growth + racial integration + international
    influx), applied as  score -= lambda * (log2 pool_now - log2 pool_then).
    lambda is the ONE dial; --lam auto (default) picks the smallest value
    satisfying the maintainer's ordering constraint: best LeBron season >=
    best of Mikan / Wilt / Russell.

Model:
  * standardization: centered 5-season window (+-2, clamped), qualified pool
    (>= 15 MPG) of the same season type (RS pools for RS rows, PO for PO)
  * OFF  = .40 z(pts) + .20 z(tsp - lg) + .15 z(pts * tsp/lg) + .15 z(ast)
           + .10 z(obpm)            [1973+; ows/gp before]
  * DEF  tier A/B (1973+):  .35 z(dbpm) + .25 z(dws/gp) + .15 z*(stl)
                            + .15 z*(blk) + .10 z*(dreb)
         tier C (1950-72):  .60 z(dws/gp) + .25 z*(reb)  + role floor
         tier D (1946-49):  .70 z(dws/gp)                + role floor
    (z* = role-relative; role floor = median tier-A DEF earned 1973-77 by
    same role and minutes bucket, clamped >= 0, applied as max().)
  * missing inputs contribute z = 0 (league average), never a penalty.

Run:  python3 scripts/reign2_compute.py                  # report to stdout
      python3 scripts/reign2_compute.py --markdown docs/REIGN_V2_REPORT.md
      python3 scripts/reign2_compute.py --lam 0.5        # fixed era-strength
"""
import argparse
import importlib.util
import math
import os
import statistics as st
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
ERA_OF = {'Pioneer': (1946, 1962), 'Legacy': (1963, 1995),
          'Classic': (1996, 2012), 'Modern': (2013, 2026)}
QUAL_MIN = 15
BUCKETS = [(0, 20), (20, 28), (28, 32), (32, 48)]

# Declared talent-pool index (relative eligible-talent supply). Anchors:
# pre-integration exclusion (< 1950), integration ramp (1950-70), US cohort
# growth, international influx ramp (1990-2015, ~30% of the league today).
POOL = {1946: .14, 1950: .17, 1955: .22, 1960: .32, 1965: .45, 1970: .58,
        1975: .68, 1980: .76, 1985: .84, 1990: .92, 1995: 1.00, 2000: 1.06,
        2005: 1.12, 2010: 1.17, 2015: 1.21, 2020: 1.24, 2026: 1.26}

ROLE_STATS = {'reb', 'dreb', 'stl', 'blk'}  # standardized within guard/wing/big

OFF_W = [('pts', .40), ('eff', .20), ('voleff', .15), ('ast', .15), ('oimp', .10)]
DEF_AB = [('dbpm', .35), ('dws_pg', .25), ('stl', .15), ('blk', .15), ('dreb', .10)]
DEF_C = [('dws_pg', .60), ('reb', .25)]
DEF_D = [('dws_pg', .70)]

# constraint set for --lam auto: best LeBron season must not trail these
CONSTRAINT_STAR = 'LeBron James'
CONSTRAINT_OLD = ('George Mikan', 'Wilt Chamberlain', 'Bill Russell')


def num(v):
    return float(v) if isinstance(v, (int, float)) else None


def pool_index(year):
    ys = sorted(POOL)
    year = max(ys[0], min(ys[-1], year))
    for a, b in zip(ys, ys[1:]):
        if a <= year <= b:
            t = (year - a) / (b - a) if b > a else 0
            return POOL[a] + t * (POOL[b] - POOL[a])
    return POOL[ys[-1]]


def depth_gap(year):
    """z-units of talent-depth disadvantage vs the modern league."""
    return math.log2(pool_index(max(POOL)) / pool_index(year))


def load_rows():
    spec = importlib.util.spec_from_file_location('bd', os.path.join(HERE, 'build_derived.py'))
    bd = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bd)
    return bd.load_seasons()  # deduped, one row per player-season


def features(r, win_tsp_mean):
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


def assign_roles(rows):
    """guard/wing/big from z(reb)-z(ast) within each season (v1 approach)."""
    by_year = defaultdict(list)
    for r in rows:
        by_year[r['year']].append(r)
    scores = {}
    for grp in by_year.values():
        stats = {}
        for key in ('reb', 'ast'):
            vals = [num(g.get(key)) or 0.0 for g in grp]
            stats[key] = (st.mean(vals), st.pstdev(vals) or 1.0)
        for g in grp:
            zr = ((num(g.get('reb')) or 0.0) - stats['reb'][0]) / stats['reb'][1]
            za = ((num(g.get('ast')) or 0.0) - stats['ast'][0]) / stats['ast'][1]
            scores[id(g)] = zr - za
    allv = sorted(scores.values())
    q33, q66 = allv[len(allv) // 3], allv[2 * len(allv) // 3]
    return {rid: ('guard' if s < q33 else 'big' if s > q66 else 'wing')
            for rid, s in scores.items()}


def build_params(rows, stype, roles):
    """year -> {stat or (stat, role): (mean, std)} over qualified window pools."""
    qual = [r for r in rows if r['type'] == stype and (num(r.get('min')) or 0) >= QUAL_MIN]
    by_year = defaultdict(list)
    for r in qual:
        by_year[r['year']].append(r)
    years = sorted(by_year)
    tsp_mean, params = {}, {}
    for y in years:
        a, b = window_years(y, years)
        vals = [num(r.get('tsp')) for yy in range(a, b + 1)
                for r in by_year.get(yy, []) if num(r.get('tsp'))]
        tsp_mean[y] = st.mean(vals) if vals else None
    stats = ['pts', 'ast', 'reb', 'stl', 'blk', 'dreb', 'dbpm', 'dws_pg', 'eff', 'voleff', 'oimp']
    feats_by_year = {y: [(features(r, tsp_mean[y]), roles[id(r)]) for r in by_year[y]]
                     for y in years}
    for y in years:
        a, b = window_years(y, years)
        params[y] = {}
        pool = [fr for yy in range(a, b + 1) for fr in feats_by_year.get(yy, [])]
        for s in stats:
            keys = [(s, role) for role in ('guard', 'wing', 'big')] if s in ROLE_STATS else [s]
            for key in keys:
                vals = [f[s] for f, role in pool
                        if f.get(s) is not None and (s not in ROLE_STATS or role == key[1])]
                if len(vals) >= 8:
                    params[y][key] = (st.mean(vals), st.pstdev(vals) or 1.0)
    return params, tsp_mean


def z(f, s, p, role):
    key = (s, role) if s in ROLE_STATS else s
    if key not in p or f.get(s) is None:
        return 0.0  # missing input = league average, never a penalty
    m, sd = p[key]
    return (f[s] - m) / sd


def raw_scores(r, p, tsp_mean, role):
    f = features(r, tsp_mean)
    off = sum(w * z(f, s, p, role) for s, w in OFF_W)
    if r['year'] >= 1973:
        dfn = sum(w * z(f, s, p, role) for s, w in DEF_AB)
    elif r['year'] >= 1950:
        dfn = sum(w * z(f, s, p, role) for s, w in DEF_C)
    else:
        dfn = sum(w * z(f, s, p, role) for s, w in DEF_D)
    return off, dfn


def bucket_of(m):
    for lo, hi in BUCKETS:
        if lo <= m < hi:
            return (lo, hi)
    return BUCKETS[-1]


def qtile(vals, pct):
    vals = sorted(vals)
    return vals[min(len(vals) - 1, int(pct * len(vals)))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--markdown', default=None)
    ap.add_argument('--lam', default='auto',
                    help="era-strength weight: 'auto' (solve the ordering constraint) or a float")
    args = ap.parse_args()

    rows = load_rows()
    scored, role_of = {}, {}
    for stype in ('RS', 'PO'):
        pool = [r for r in rows if r['type'] == stype]
        roles = assign_roles(pool)
        role_of.update(roles)
        params, tsp_mean = build_params(rows, stype, roles)
        for r in pool:
            p = params.get(r['year'])
            if p:
                scored[id(r)] = raw_scores(r, p, tsp_mean.get(r['year']), roles[id(r)])

    def is_qual(r):
        return (num(r.get('min')) or 0) >= QUAL_MIN and id(r) in scored

    # --- cross-tier DEF variance normalization (qualified RS spreads) ------
    def tier(y):
        return 'AB' if y >= 1973 else 'C' if y >= 1950 else 'D'
    dq = defaultdict(list)
    for r in rows:
        if r['type'] == 'RS' and is_qual(r):
            dq[tier(r['year'])].append(scored[id(r)][1])
    target = st.pstdev(dq['AB'])
    scale = {t: (target / st.pstdev(dq[t]) if len(dq[t]) > 20 and st.pstdev(dq[t]) else 1.0)
             for t in dq}
    for r in rows:
        if id(r) in scored and tier(r['year']) != 'AB':
            o, d = scored[id(r)]
            scored[id(r)] = (o, d * scale[tier(r['year'])])

    # --- OFF/DEF spread balance to v1's ratio (pooled 1996+ RS qualified) --
    anchor = [r for r in rows if r['type'] == 'RS' and r['year'] >= 1996 and is_qual(r)]
    v1_ratio = st.pstdev(num(r.get('reign_def')) or 0 for r in anchor) / \
        st.pstdev(num(r.get('reign_off')) or 0 for r in anchor)
    v2_ratio = st.pstdev(scored[id(r)][1] for r in anchor) / \
        st.pstdev(scored[id(r)][0] for r in anchor)
    dbal = v1_ratio / v2_ratio
    for rid, (o, d) in scored.items():
        scored[rid] = (o, d * dbal)

    # --- role floors for pre-1973 DEF (calibrated 1973-77, post-scaling) ---
    early = [r for r in rows if r['type'] == 'RS' and 1973 <= r['year'] <= 1977 and is_qual(r)]
    fl = defaultdict(list)
    for r in early:
        fl[(role_of[id(r)], bucket_of(num(r.get('min')) or 0))].append(scored[id(r)][1])
    floors = {k: max(0.0, st.median(v)) for k, v in fl.items()}
    for r in rows:
        if r['year'] < 1973 and id(r) in scored:
            o, d = scored[id(r)]
            f = floors.get((role_of[id(r)], bucket_of(num(r.get('min')) or 0)), 0.0)
            scored[id(r)] = (o, max(d, f))

    # --- era-strength prior -------------------------------------------------
    def adj_total(r, lam):
        o, d = scored[id(r)]
        return o + d - lam * depth_gap(r['year'])

    if args.lam == 'auto':
        star = [r for r in rows if r['type'] == 'RS' and r['name'] == CONSTRAINT_STAR and is_qual(r)]
        olds = [r for r in rows if r['type'] == 'RS' and r['name'] in CONSTRAINT_OLD and is_qual(r)]
        lam = 0.0
        while lam <= 2.0:
            if max(adj_total(r, lam) for r in star) >= max(adj_total(r, lam) for r in olds):
                break
            lam += 0.01
        lam = round(lam, 2)
    else:
        lam = float(args.lam)
    print(f'era-strength lambda = {lam}', file=sys.stderr)

    for r in rows:
        if id(r) in scored:
            o, d = scored[id(r)]
            gap = lam * depth_gap(r['year'])
            scored[id(r)] = (o - .6 * gap, d - .4 * gap)

    # --- global affine to the familiar v1 scale ----------------------------
    v1 = [r['reign'] for r in anchor]
    v2 = [sum(scored[id(r)]) for r in anchor]
    b = (qtile(v1, .99) - qtile(v1, .50)) / ((qtile(v2, .99) - qtile(v2, .50)) or 1.0)
    a_off = qtile([num(r.get('reign_off')) or 0 for r in anchor], .50) - \
        b * qtile([scored[id(r)][0] for r in anchor], .50)
    a_def = qtile([num(r.get('reign_def')) or 0 for r in anchor], .50) - \
        b * qtile([scored[id(r)][1] for r in anchor], .50)
    print(f'affine: b={b:.2f}, off int {a_off:+.2f}, def int {a_def:+.2f}', file=sys.stderr)

    out = []
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
    w('# REIGN 2.1 — full computation report\n')
    w('Rolling 5-year windows · role-relative defense · cross-tier variance '
      'normalization · declared talent-pool era-strength prior '
      f'(λ = {lam}, auto-solved so the best {CONSTRAINT_STAR} season is not '
      'below the best of Mikan/Wilt/Russell). No shipped data modified.\n')

    qual = [r for r in out if r['type'] == 'RS' and r['min'] >= QUAL_MIN]

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

    w('\n**Era-strength gap** (score docked at λ = %.2f, in final points): ' % lam +
      ' · '.join(f"{y}: −{lam * depth_gap(y) * b:.1f}"
                 for y in (1950, 1960, 1970, 1985, 2000, 2015)) + '\n')

    for era, (y0, y1) in ERA_OF.items():
        w(f'\n## {era} ({y0}–{y1}) — top 10 peak seasons\n')
        er = [r for r in qual if y0 <= r['year'] <= y1]
        w('| # | REIGN 2.1 | v2 (OFF/DEF) | v1 | | v1 top 10 | v1 |')
        w('|---|---|---|---|---|---|---|')
        t2 = sorted(er, key=lambda r: -r['v2'])[:10]
        t1 = sorted(er, key=lambda r: -r['v1'])[:10]
        for i in range(10):
            l2 = (f"{t2[i]['name']} '{str(t2[i]['year'] + 1)[2:]} | "
                  f"**{t2[i]['v2']:+.1f}** ({t2[i]['v2_off']:+.1f}/{t2[i]['v2_def']:+.1f}) | "
                  f"{t2[i]['v1']:+.1f}") if i < len(t2) else ' | | '
            l1 = (f"{t1[i]['name']} '{str(t1[i]['year'] + 1)[2:]} | "
                  f"{t1[i]['v1']:+.1f}") if i < len(t1) else ' | '
            w(f'| {i + 1} | {l2} | | {l1} |')

    w('\n## All-time top 20 peak seasons (REIGN 2.1, regular season)\n')
    w('| # | player | season | v2 | OFF | DEF | v1 |')
    w('|---|---|---|---|---|---|---|')
    for i, r in enumerate(sorted(qual, key=lambda r: -r['v2'])[:20], 1):
        w(f"| {i} | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | "
          f"**{r['v2']:+.1f}** | {r['v2_off']:+.1f} | {r['v2_def']:+.1f} | {r['v1']:+.1f} |")

    w('\n## Biggest movers (qualified RS seasons, |v2 − v1|)\n')
    w('| direction | player | season | v1 | v2 |')
    w('|---|---|---|---|---|')
    movers = sorted(qual, key=lambda r: -(r['v2'] - r['v1']))
    for r in movers[:8]:
        w(f"| ▲ | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | {r['v1']:+.1f} | {r['v2']:+.1f} |")
    for r in movers[-8:]:
        w(f"| ▼ | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | {r['v1']:+.1f} | {r['v2']:+.1f} |")

    w('\n## Pioneer edge check (era-pool bias fix)\n')
    w('| seasons | v2 mean OFF (qualified) |')
    w('|---|---|')
    for label, a0, a1 in (('1946–49', 1946, 1949), ('1958–62', 1958, 1962)):
        grp = [r for r in qual if a0 <= r['year'] <= a1]
        w(f'| {label} | {st.mean(r["v2_off"] for r in grp):+.2f} |')

    report = '\n'.join(lines)
    if args.markdown:
        open(args.markdown, 'w').write(report + '\n')
        print(f'wrote {args.markdown}', file=sys.stderr)
    else:
        print(report)


if __name__ == '__main__':
    main()
