#!/usr/bin/env python3
"""
Re-derive the REIGN formulas, per era, directly from the frozen season data.

The original scoring pipeline was never committed to this repo. But every
season row carries BOTH the model inputs (ows, obpm, vorp, dws, dbpm, stl,
blk, dreb, ...) AND the model outputs (reign_off, reign_def, reign). So we can
recover the weights the original model used by regressing the outputs back
onto the (era-normalized) inputs, separately for each era.

Two facts established empirically and used throughout:

  1. reign == reign_off + reign_def, exactly, in every era. So we only need to
     recover the two component formulas.

  2. The available inputs differ by era. In particular the PIONEER era
     (1946-1962) predates official steal/block tracking (NBA began recording
     STL/BLK in 1973-74), so stl/blk/dreb/oreb/tov/obpm/dbpm/vorp are all
     empty there. The only defensive signal is DWS. We therefore fit each era
     on the features that actually exist in it.

Method: ordinary least squares via the normal equations with light ridge
damping, implemented in pure Python (no numpy/sklearn dependency, so this runs
unchanged in any environment). Features are era-normalized to z-scores so the
weights are directly comparable. Engineered terms (volume x efficiency
products, squared advanced metrics) are included where their inputs exist, to
bring the interpretable linear fit closer to the nonlinear ceiling.

Run:  python3 scripts/derive_formulas.py
Writes: public/data/reign_formulas.json
"""
import json, os, math

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
ERAS = ['pioneer', 'legacy', 'classic', 'modern']

# Base candidate features per component. Engineered terms are added in build().
# We list every plausible feature; build() drops any that are empty in an era.
OFF_BASE = ['ows', 'obpm', 'vorp', 'per', 'ws48', 'pts', 'ast', 'tsp', 'ftm', 'fga', 'min', 'gp']
DEF_BASE = ['dws', 'dbpm', 'blk', 'stl', 'dreb', 'reb', 'pf', 'min', 'gp']

# Engineered terms: (name, [factor features]). Product of the listed columns.
OFF_ENG = [('pts*tsp', ['pts', 'tsp']), ('min*ws48', ['min', 'ws48']), ('min*obpm', ['min', 'obpm'])]
DEF_ENG = [('min*dbpm', ['min', 'dbpm']), ('blk*min', ['blk', 'min']), ('stl*min', ['stl', 'min'])]


def load_era(era):
    return json.load(open(os.path.join(DATA, f'seasons_{era}.json')))


def col_present(rows, f):
    """A feature 'exists' in an era if it is non-zero/non-null for >5% of rows."""
    nz = sum(1 for r in rows if isinstance(r.get(f), (int, float)) and r.get(f) != 0)
    return nz > len(rows) * 0.05


def value(r, f):
    v = r.get(f)
    return float(v) if isinstance(v, (int, float)) else 0.0


def build(rows, base, eng):
    """Build the era-appropriate feature matrix (z-scored), names, means, stds."""
    feats = [f for f in base if col_present(rows, f)]
    raw = {f: [value(r, f) for r in rows] for f in set(feats)
                                              | {x for _, fs in eng for x in fs}}
    cols, names = [], []
    for f in feats:
        cols.append(raw[f]); names.append(f)
    for name, factors in eng:
        if all(col_present(rows, x) for x in factors):
            prod = [math.prod(raw[x][i] for x in factors) for i in range(len(rows))]
            cols.append(prod); names.append(name)
    # z-score each column
    means, stds = [], []
    for j, c in enumerate(cols):
        m = sum(c) / len(c)
        s = math.sqrt(sum((x - m) ** 2 for x in c) / len(c)) or 1.0
        means.append(m); stds.append(s)
        cols[j] = [(x - m) / s for x in c]
    X = [[cols[j][i] for j in range(len(cols))] for i in range(len(rows))]
    return X, names, means, stds


def solve_ridge(X, y, lam=1e-2):
    n, k = len(X), len(X[0])
    Xa = [[1.0] + row for row in X]
    p = k + 1
    A = [[0.0] * p for _ in range(p)]
    b = [0.0] * p
    for i in range(n):
        xi, yi = Xa[i], y[i]
        for a in range(p):
            b[a] += xi[a] * yi
            xa = xi[a]
            for c in range(p):
                A[a][c] += xa * xi[c]
    for a in range(1, p):
        A[a][a] += lam
    return gauss_solve(A, b)


def gauss_solve(A, b):
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        pv = M[col][col]
        if abs(pv) < 1e-12:
            continue
        for r in range(n):
            if r == col:
                continue
            factor = M[r][col] / pv
            for c in range(col, n + 1):
                M[r][c] -= factor * M[col][c]
    return [M[i][n] / M[i][i] if abs(M[i][i]) > 1e-12 else 0.0 for i in range(n)]


def stats(y, yhat):
    n = len(y)
    ybar = sum(y) / n
    ss_tot = sum((yi - ybar) ** 2 for yi in y) or 1.0
    ss_res = sum((y[i] - yhat[i]) ** 2 for i in range(n))
    mae = sum(abs(y[i] - yhat[i]) for i in range(n)) / n
    return 1 - ss_res / ss_tot, mae


def derive(rows, base, eng, target):
    X, names, means, stds = build(rows, base, eng)
    y = [value(r, target) for r in rows]
    coef = solve_ridge(X, y)
    yhat = [coef[0] + sum(coef[j + 1] * X[i][j] for j in range(len(names)))
            for i in range(len(rows))]
    r2, mae = stats(y, yhat)
    return {
        'n': len(rows),
        'r2': round(r2, 4),
        'mae': round(mae, 4),
        'intercept': round(coef[0], 4),
        'terms': [{'feature': names[j], 'weight': round(coef[j + 1], 4),
                   'mean': round(means[j], 4), 'std': round(stds[j], 4)}
                  for j in range(len(names))],
    }


def fmt(d):
    w = '  '.join(f"{t['feature']}={t['weight']:+.3f}" for t in d['terms'])
    return f"n={d['n']:5d}  R2={d['r2']:.3f}  MAE={d['mae']:.3f}  int={d['intercept']:+.2f}\n      {w}"


def main():
    out = {'_note': 'reign = reign_off + reign_def (exact). Weights apply to '
                    'z-scored features: contribution = weight * (x - mean) / std.'}
    for era in ERAS:
        rows = load_era(era)
        off = derive(rows, OFF_BASE, OFF_ENG, 'reign_off')
        dfn = derive(rows, DEF_BASE, DEF_ENG, 'reign_def')
        out[era] = {'reign_off': off, 'reign_def': dfn}
        print(f"\n========== {era.upper()} ==========")
        print("  REIGN_OFF <-", fmt(off))
        print("  REIGN_DEF <-", fmt(dfn))
    path = os.path.join(DATA, 'reign_formulas.json')
    json.dump(out, open(path, 'w'), indent=2)
    print(f"\nwrote {os.path.relpath(path)}")


if __name__ == '__main__':
    main()
