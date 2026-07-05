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
  * DEFENSIVE-STAT RELIABILITY (v2.2): steals/blocks before the video-
    review era are documented as scorekeeper-inflated, selectively for
    stars (e.g. Jordan's 1987-88 DPOY season shows ~2x home-vs-road
    steal/block rates). Season aggregates carry no home/road splits, so a
    direct correction is impossible -- instead the measurement-error-correct
    response: shrink stl/blk z-scores toward league average by a declared
    reliability factor (0.75 at introduction in 1973-74, 0.90 by the 1997
    play-by-play era, 1.0 from 2001), and dbpm by its square root (BPM
    inherits the same inputs, diluted). Extreme (padded) values compress
    hardest; average seasons barely move.
  * TEAM-DEFENSE SHARE (v2.4): box stats can't see scheme value and
    positioning, so DEF includes a small direct team-defense component --
    z(-team DRtg) within season (coverage 1951+; traded/unknown team ->
    neutral). Weight kept modest to limit free-rider credit; the
    --calibrate-def mode shows why the term is needed: individual box
    components alone explain far less of team defense than OFF components
    explain of team offense.
  * v2.5 (maintainer review: "Mikan shouldn't be top-5; centers devalued
    too much; era greats like Wilt/Shaq/Kareem/Jokic/CP3/Duncan/Magic/Bird
    should headline their eras; top-10 mostly LeBron/Jordan"):
      - ROLE DEFENSIVE-IMPACT multiplier (big 1.15 / wing 1.0 / guard .95):
        role-relative z restores within-role fairness, this restores the
        between-role reality that rim protection anchors defenses.
      - LOAD term in OFF: z(minutes) within the era window -- sustaining
        production over a 40-minute burden beats 34, era-fair because each
        season is compared to its own league's minute norms.
      - Playmaking floor .10 -> .15; reliability floor softened to .75 (the
        v2.2 value stacked three shrinkages on 1980s guards); Z_CAP 4.5;
        lambda-auto constraint extended: no pre-1960 season in the all-time
        top 5. Era boards report best-season-per-player.
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
  * OFF  = .45 z(pts * tsp/lg) + .35 z(obpm) + .10 z(tsp - lg)
           + .10 z(ast) - .10 z(tov)     [obpm 1973+, ows/gp before;
                                          tov untracked pre-1978 -> z = 0]
    (weights team-attribution calibrated with guardrails -- see OFF_W)
  * DEF  tier A/B (1973+):  .25 z(dbpm) + .20 z(dws/gp) + .15 z(teamdef)
                            + .15 z*(stl) + .15 z*(blk) + .10 z*(dreb)
         tier C (1950-72):  .45 z(dws/gp) + .20 z*(reb) + .20 z(teamdef)
                            + role floor
         tier D (1946-49):  .70 z(dws/gp)               + role floor
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

# Role defensive-impact multiplier (v2.5). Role-relative z restores fairness
# WITHIN roles but flattens the between-role reality that rim protection
# anchors defenses -- impact-metric distributions (DRAPM/DPM) consistently
# show bigs dominating the defensive top end. Applied after the within-role
# standardization: compare centers to centers, then weight the role's
# defensive importance.
ROLE_DEF_IMPACT = {'big': 1.15, 'wing': 1.0, 'guard': 0.95}

# Reliability of recorded steals/blocks (scorekeeper-bias shrinkage).
# Anchors: hand-tallied introduction (1973-74), public play-by-play era
# (1996-97), league-wide video review / stat auditing (~2000-01).
DEF_RELIABILITY = {1973: .75, 1990: .82, 1997: .90, 2001: 1.0}


def reliability(year):
    if year >= 2001:
        return 1.0
    ys = sorted(DEF_RELIABILITY)
    year = max(ys[0], min(ys[-1], year))
    for a, b in zip(ys, ys[1:]):
        if a <= year <= b:
            t = (year - a) / (b - a) if b > a else 0
            return DEF_RELIABILITY[a] + t * (DEF_RELIABILITY[b] - DEF_RELIABILITY[a])
    return 1.0

# OFF weights, v2.3: team-attribution calibrated (see calibrate_off).
# Regressing within-season z(team ORtg) on minutes-weighted player component
# z's over 806 team-seasons 1997+ gives R2 = 0.92 with raw coefficients
#   pts -0.67, voleff +0.81, eff +0.07, ast -0.01, tov -0.31, oimp +2.70
# -- i.e. volume WITHOUT efficiency actively hurts team offense (the
# inefficiency cost), and OBPM carries the largest independent signal.
# Guardrails from the proposal (no component > 0.5 -- tightened to 0.35 for
# oimp so REIGN stays multi-component and era-portable given the pre-1973
# OWS substitution; ast kept at a declared 0.10 floor for playmaking
# credit): raw pts is dropped in favor of efficiency-scaled volume.
# v2.5: playmaking floor raised to .15 (funded from voleff) after review --
# .10 undercredited pure creators (Magic, CP3) relative to their impact.
# v2.5 also adds a LOAD term: z(minutes) within the era window. Sustaining
# production over a 40-minute burden is more valuable than over 34, and the
# within-window z makes it era-fair (each season is compared to its own
# league's minute norms, so high-minute eras don't leak an advantage).
OFF_W = [('voleff', .40), ('oimp', .30), ('ast', .15), ('load', .10),
         ('eff', .05), ('tov', -.10)]
DEF_AB = [('dbpm', .25), ('dws_pg', .20), ('teamdef', .15),
          ('stl', .15), ('blk', .15), ('dreb', .10)]
DEF_C = [('dws_pg', .45), ('reb', .20), ('teamdef', .20)]
DEF_D = [('dws_pg', .70)]

# (team, start_year) -> within-season z of -DRtg; filled from --team-csv.
TEAM_DEF_Z = {}


def load_team_def(team_csv):
    import csv as csvmod
    by_season = defaultdict(dict)
    for t in csvmod.DictReader(open(team_csv, encoding='utf-8')):
        if (t.get('lg') in ('NBA', 'BAA') and t.get('d_rtg') not in (None, '', 'NA')
                and t.get('abbreviation') not in (None, '', 'NA')):
            by_season[int(t['season']) - 1][t['abbreviation']] = float(t['d_rtg'])
    for y, teams in by_season.items():
        vals = list(teams.values())
        m, sd = st.mean(vals), (st.pstdev(vals) or 1.0)
        for team, v in teams.items():
            TEAM_DEF_Z[(team, y)] = -(v - m) / sd  # lower DRtg = better defense

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
    f['tov'] = num(r.get('tov'))
    f['load'] = num(r.get('min'))  # minutes burden relative to era norms
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
    stats = ['pts', 'ast', 'reb', 'stl', 'blk', 'dreb', 'dbpm', 'dws_pg', 'eff', 'voleff', 'oimp', 'tov', 'load']
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


Z_CAP = 4.5  # winsorize: beyond ~4.5 sigma, separation from a thin pool is
             # noise, not signal. Modern qualified pools (~350 players) never
             # exceed it; 1940s-50s pools (~70-90) produce 6-7 sigma box
             # outliers that would otherwise dominate the all-time boards.


def z(f, s, p, role):
    key = (s, role) if s in ROLE_STATS else s
    if key not in p or f.get(s) is None:
        return 0.0  # missing input = league average, never a penalty
    m, sd = p[key]
    return max(-Z_CAP, min(Z_CAP, (f[s] - m) / sd))


OFF_COMPS = ['pts', 'eff', 'voleff', 'ast', 'tov', 'oimp', 'load']


def off_component_z(r, p, tsp_mean, role):
    f = features(r, tsp_mean)
    return {s: z(f, s, p, role) for s in OFF_COMPS}


def raw_scores(r, p, tsp_mean, role):
    f = features(r, tsp_mean)
    # team-defense share: within-season z of -DRtg (neutral when unknown,
    # e.g. traded '2TM' rows or pre-1951). RS and PO rows both use the
    # team's regular-season defensive quality (a scheme prior).
    f['teamdef'] = TEAM_DEF_Z.get((r.get('team'), r['year']))
    off = sum(w * z(f, s, p, role) for s, w in OFF_W)
    if r['year'] >= 1973:
        rel = reliability(r['year'])
        shrink = {'stl': rel, 'blk': rel, 'dbpm': math.sqrt(rel)}
        dfn = sum(w * z_direct(f, s, p, role) * shrink.get(s, 1.0) for s, w in DEF_AB)
    elif r['year'] >= 1950:
        dfn = sum(w * z_direct(f, s, p, role) for s, w in DEF_C)
    else:
        dfn = sum(w * z_direct(f, s, p, role) for s, w in DEF_D)
    return off, dfn * ROLE_DEF_IMPACT.get(role, 1.0)


def z_direct(f, s, p, role):
    if s == 'teamdef':  # already a within-season z; just cap
        v = f.get('teamdef')
        return 0.0 if v is None else max(-Z_CAP, min(Z_CAP, v))
    return z(f, s, p, role)


def bucket_of(m):
    for lo, hi in BUCKETS:
        if lo <= m < hi:
            return (lo, hi)
    return BUCKETS[-1]


def qtile(vals, pct):
    vals = sorted(vals)
    return vals[min(len(vals) - 1, int(pct * len(vals)))]


def gauss_solve(A, bb):
    n = len(A)
    M = [row[:] + [bb[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        pv = M[col][col] or 1e-12
        for r in range(n):
            if r == col:
                continue
            f = M[r][col] / pv
            for c in range(col, n + 1):
                M[r][c] -= f * M[col][c]
    return [M[i][n] / (M[i][i] or 1e-12) for i in range(n)]


def calibrate_off(rows, team_csv):
    """Team-attribution calibration: regress within-season z of team ORtg on
    the minutes-weighted mean of players' OFF component z's (RS 1997+,
    combined '2TM' rows excluded since they have no team). The weights that
    make player scores add up to team offense are the empirical anchor --
    and they naturally price inefficient volume."""
    import csv as csvmod
    import re as remod
    ortg = {}
    by_season = defaultdict(list)
    for t in csvmod.DictReader(open(team_csv, encoding='utf-8')):
        if (t.get('lg') == 'NBA' and t.get('o_rtg') not in (None, '', 'NA')
                and t.get('abbreviation') not in (None, '', 'NA')):
            season = int(t['season'])
            ortg[(t['abbreviation'], season - 1)] = float(t['o_rtg'])  # our start-year keys
            by_season[season - 1].append(float(t['o_rtg']))
    zortg = {}
    for (team, y), v in ortg.items():
        grp = by_season[y]
        m, sd = st.mean(grp), (st.pstdev(grp) or 1.0)
        zortg[(team, y)] = (v - m) / sd

    pool = [r for r in rows if r['type'] == 'RS' and r['year'] >= 1997]
    roles = assign_roles([r for r in rows if r['type'] == 'RS'])
    params, tsp_mean = build_params(rows, 'RS', roles)
    agg = defaultdict(lambda: defaultdict(float))
    wsum = defaultdict(float)
    for r in pool:
        team = r.get('team')
        if not team or remod.fullmatch(r'\dTM', team) or team == 'TOT':
            continue
        p = params.get(r['year'])
        if not p or (team, r['year']) not in zortg:
            continue
        wt = (num(r.get('min')) or 0) * (num(r.get('gp')) or 0)
        if wt <= 0:
            continue
        cz = off_component_z(r, p, tsp_mean.get(r['year']), roles.get(id(r), 'wing'))
        for k, v in cz.items():
            agg[(team, r['year'])][k] += wt * v
        wsum[(team, r['year'])] += wt

    X, y = [], []
    for key, comps in agg.items():
        if wsum[key] < 48 * 82 * 3 * 0.6:  # require decent roster coverage
            continue
        X.append([comps[k] / wsum[key] for k in OFF_COMPS])
        y.append(zortg[key])
    k = len(OFF_COMPS)
    n = len(X)
    A = [[0.0] * (k + 1) for _ in range(k + 1)]
    bb = [0.0] * (k + 1)
    for i in range(n):
        xi = [1.0] + X[i]
        for a_ in range(k + 1):
            bb[a_] += xi[a_] * y[i]
            for c in range(k + 1):
                A[a_][c] += xi[a_] * xi[c]
    for d in range(1, k + 1):
        A[d][d] += 1e-3
    coef = gauss_solve(A, bb)
    yhat = [coef[0] + sum(coef[j + 1] * X[i][j] for j in range(k)) for i in range(n)]
    ybar = st.mean(y)
    r2 = 1 - sum((y[i] - yhat[i]) ** 2 for i in range(n)) / (sum((v - ybar) ** 2 for v in y) or 1)
    print(f'team-attribution calibration: {n} team-seasons, R2 = {r2:.3f}')
    raw = dict(zip(OFF_COMPS, coef[1:]))
    print('raw coefficients:', {k_: round(v, 3) for k_, v in raw.items()})
    # normalize: positive components sum to 1; tov keeps its (negative) sign,
    # capped at -0.20 relative
    pos = {k_: max(0.0, v) for k_, v in raw.items() if k_ != 'tov'}
    tot = sum(pos.values()) or 1.0
    weights = [(k_, round(v / tot, 2)) for k_, v in pos.items() if v / tot >= 0.005]
    tov_w = max(-0.20, min(0.0, raw['tov'] / tot))
    if tov_w < -0.005:
        weights.append(('tov', round(tov_w, 2)))
    print('normalized OFF_W:', weights)
    return weights


def calibrate_def(rows, team_csv):
    """Evidence for the team-defense component: regress within-season
    z(-team DRtg) on minutes-weighted individual DEF box components
    (dbpm/stl/blk/dreb -- dws EXCLUDED, it is derived from team defense and
    would be circular). A low R2 relative to the OFF calibration shows how
    much of team defense individual box stats cannot see."""
    load_team_def(team_csv)
    import re as remod
    pool = [r for r in rows if r['type'] == 'RS' and r['year'] >= 1997]
    roles = assign_roles([r for r in rows if r['type'] == 'RS'])
    params, tsp_mean = build_params(rows, 'RS', roles)
    comps = ['dbpm', 'stl', 'blk', 'dreb']
    agg = defaultdict(lambda: defaultdict(float))
    wsum = defaultdict(float)
    for r in pool:
        team = r.get('team')
        if not team or remod.fullmatch(r'\dTM', team) or (team, r['year']) not in TEAM_DEF_Z:
            continue
        p = params.get(r['year'])
        if not p:
            continue
        wt = (num(r.get('min')) or 0) * (num(r.get('gp')) or 0)
        if wt <= 0:
            continue
        f = features(r, tsp_mean.get(r['year']))
        for k in comps:
            agg[(team, r['year'])][k] += wt * z(f, k, p, roles.get(id(r), 'wing'))
        wsum[(team, r['year'])] += wt
    X, y = [], []
    for key, cz in agg.items():
        if wsum[key] < 48 * 82 * 3 * 0.6:
            continue
        X.append([cz[k] / wsum[key] for k in comps])
        y.append(TEAM_DEF_Z[key])
    k = len(comps)
    n = len(X)
    A = [[0.0] * (k + 1) for _ in range(k + 1)]
    bb = [0.0] * (k + 1)
    for i in range(n):
        xi = [1.0] + X[i]
        for a_ in range(k + 1):
            bb[a_] += xi[a_] * y[i]
            for c in range(k + 1):
                A[a_][c] += xi[a_] * xi[c]
    for d in range(1, k + 1):
        A[d][d] += 1e-3
    coef = gauss_solve(A, bb)
    yhat = [coef[0] + sum(coef[j + 1] * X[i][j] for j in range(k)) for i in range(n)]
    ybar = st.mean(y)
    r2 = 1 - sum((y[i] - yhat[i]) ** 2 for i in range(n)) / (sum((v - ybar) ** 2 for v in y) or 1)
    print(f'DEF box-only calibration: {n} team-seasons, R2 = {r2:.3f} '
          f'(vs 0.92 for OFF -- the gap is what the team-defense share covers)')
    print('coefficients:', {k_: round(v, 3) for k_, v in zip(comps, coef[1:])})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--markdown', default=None)
    ap.add_argument('--lam', default='auto',
                    help="era-strength weight: 'auto' (solve the ordering constraint) or a float")
    ap.add_argument('--calibrate-off', default=None, metavar='TEAM_CSV',
                    help='run the team-attribution OFF weight calibration and exit')
    ap.add_argument('--calibrate-def', default=None, metavar='TEAM_CSV',
                    help='regress team DRtg on individual DEF box components and exit')
    ap.add_argument('--team-csv', default=None, metavar='TEAM_CSV',
                    help='Team Summaries.csv -- enables the team-defense DEF component')
    args = ap.parse_args()

    if args.calibrate_off:
        calibrate_off(load_rows(), args.calibrate_off)
        return
    if args.calibrate_def:
        calibrate_def(load_rows(), args.calibrate_def)
        return
    if args.team_csv:
        load_team_def(args.team_csv)
        print(f'team-defense component enabled ({len(TEAM_DEF_Z)} team-seasons)', file=sys.stderr)

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
        rs_all = [r for r in rows if r['type'] == 'RS' and is_qual(r)]
        pre60 = [r for r in rs_all if r['year'] < 1960]
        lam = 0.0
        while lam <= 2.0:
            ok1 = max(adj_total(r, lam) for r in star) >= max(adj_total(r, lam) for r in olds)
            # no pre-1960 season inside the all-time top 5
            top5 = sorted((adj_total(r, lam) for r in rs_all), reverse=True)[4]
            ok2 = max(adj_total(r, lam) for r in pre60) < top5
            if ok1 and ok2:
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
    w('# REIGN 2.5 — full computation report\n')
    w('Rolling 5-year windows · role-relative defense · cross-tier variance '
      'normalization · pre-2001 stl/blk scorekeeper-reliability shrinkage · '
      'team-calibrated OFF weights · z winsorized at ±4 · '
      'declared talent-pool era-strength prior '
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

    def best_per_player(rows_, key):
        best = {}
        for r in rows_:
            if r['name'] not in best or r[key] > best[r['name']][key]:
                best[r['name']] = r
        return sorted(best.values(), key=lambda r: -r[key])

    for era, (y0, y1) in ERA_OF.items():
        w(f'\n## {era} ({y0}–{y1}) — top 10 players (best season each)\n')
        er = [r for r in qual if y0 <= r['year'] <= y1]
        w('| # | REIGN 2.5 | v2 (OFF/DEF) | v1 | | v1 top 10 | v1 |')
        w('|---|---|---|---|---|---|---|')
        t2 = best_per_player(er, 'v2')[:10]
        t1 = best_per_player(er, 'v1')[:10]
        for i in range(10):
            l2 = (f"{t2[i]['name']} '{str(t2[i]['year'] + 1)[2:]} | "
                  f"**{t2[i]['v2']:+.1f}** ({t2[i]['v2_off']:+.1f}/{t2[i]['v2_def']:+.1f}) | "
                  f"{t2[i]['v1']:+.1f}") if i < len(t2) else ' | | '
            l1 = (f"{t1[i]['name']} '{str(t1[i]['year'] + 1)[2:]} | "
                  f"{t1[i]['v1']:+.1f}") if i < len(t1) else ' | '
            w(f'| {i + 1} | {l2} | | {l1} |')

    w('\n## All-time top 20 peak seasons (REIGN 2.5, regular season)\n')
    w('| # | player | season | v2 | OFF | DEF | v1 |')
    w('|---|---|---|---|---|---|---|')
    for i, r in enumerate(sorted(qual, key=lambda r: -r['v2'])[:20], 1):
        w(f"| {i} | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | "
          f"**{r['v2']:+.1f}** | {r['v2_off']:+.1f} | {r['v2_def']:+.1f} | {r['v1']:+.1f} |")

    # playoff boards: >= 15 MPG and >= 8 playoff games (about three series in
    # any era; filters 4-game cameo spikes without excluding 1950s title runs)
    po_qual = [r for r in out if r['type'] == 'PO' and r['min'] >= QUAL_MIN]
    po_rows_by = {}
    for r in load_rows():
        if r['type'] == 'PO':
            po_rows_by[(r['name'], r['year'])] = num(r.get('gp')) or 0
    po_qual = [r for r in po_qual if po_rows_by.get((r['name'], r['year']), 0) >= 8]
    w('\n## All-time top 15 playoff runs (REIGN 2.5, ≥8 games)\n')
    w('*Playoff scores are standardized against the playoff field — a far '
      'stronger population than the regular season — so +20 in the playoffs '
      'is rarer than +20 in the regular season.*\n')
    w('| # | player | playoffs | v2 | OFF | DEF | v1 |')
    w('|---|---|---|---|---|---|---|')
    for i, r in enumerate(sorted(po_qual, key=lambda r: -r['v2'])[:15], 1):
        w(f"| {i} | {r['name']} | {r['year']}-{str(r['year'] + 1)[2:]} | "
          f"**{r['v2']:+.1f}** | {r['v2_off']:+.1f} | {r['v2_def']:+.1f} | {r['v1']:+.1f} |")
    w('\n**Best playoff run per era:** ' + ' · '.join(
        f"{era}: {t['name']} '{str(t['year'] + 1)[2:]} ({t['v2']:+.1f})"
        for era, (y0, y1) in ERA_OF.items()
        for t in [max((r for r in po_qual if y0 <= r['year'] <= y1),
                      key=lambda r: r['v2'], default=None)] if t) + '\n')

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
