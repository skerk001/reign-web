#!/usr/bin/env python3
"""
Apply the published REIGN formulas to a season row.

This is the *forward* direction of `derive_formulas.py`: that script recovers
the per-era weights by regressing known reign outputs onto the inputs; this one
takes those frozen weights (`public/data/reign_formulas.json`) and uses them to
SCORE a row whose reign is not yet known -- e.g. a freshly scraped current
season. The formula spec is the model the site ships, so scoring new rows with
it keeps every era on one consistent, reproducible ruler.

Each term scores as  weight * (raw_feature - mean) / std  and the component is
the sum of its terms plus the intercept. `reign = reign_off + reign_def`.
Engineered features (e.g. "pts*tsp") are the product of their raw factors,
z-scored with that term's own mean/std -- matching how derive_formulas builds
them. Importable (`score_row`) and runnable as a CLI to re-score a file in place.
"""
import json
import os

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data')
FORMULAS_PATH = os.path.join(DATA, 'reign_formulas.json')


def load_formulas(path=FORMULAS_PATH):
    return json.load(open(path))


def _raw(row, feature):
    """Raw (un-z-scored) value of a base or engineered ('a*b') feature."""
    if '*' in feature:
        prod = 1.0
        for factor in feature.split('*'):
            v = row.get(factor)
            prod *= float(v) if isinstance(v, (int, float)) else 0.0
        return prod
    v = row.get(feature)
    return float(v) if isinstance(v, (int, float)) else 0.0


def _component(row, model):
    total = model['intercept']
    for t in model['terms']:
        total += t['weight'] * (_raw(row, t['feature']) - t['mean']) / t['std']
    return total


def score_row(row, era, formulas):
    """Return (reign_off, reign_def, reign) for `row` under the era's formulas."""
    era = era.lower()
    spec = formulas[era]
    off = _component(row, spec['reign_off'])
    dfn = _component(row, spec['reign_def'])
    return round(off, 2), round(dfn, 2), round(off + dfn, 2)


def main():
    import sys
    args = sys.argv[1:]
    if not args:
        print('usage: reign_score.py seasons_<era>.json [...]  # re-score in place')
        return
    formulas = load_formulas()
    for path in args:
        rows = json.load(open(path))
        era = rows[0].get('era', '') if rows else ''
        for r in rows:
            off, dfn, reign = score_row(r, r.get('era', era), formulas)
            r['reign_off'], r['reign_def'], r['reign'] = off, dfn, reign
        json.dump(rows, open(path, 'w'), indent=0)
        print(f'rescored {len(rows)} rows in {os.path.relpath(path)}')


if __name__ == '__main__':
    main()
