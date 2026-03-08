#!/usr/bin/env python3
"""
Regenerate careers.json from seasons.json and stretches files.
This ensures all pre-computed career summaries match the current REIGN scores.
"""
import json
import sys
import os

DATA_DIR = os.path.dirname(os.path.abspath(__file__)) if len(sys.argv) < 2 else sys.argv[1]

def load(name):
    with open(os.path.join(DATA_DIR, name)) as f:
        return json.load(f)

seasons = load('seasons.json')
stretches_rs3 = load('stretches_rs3.json')
stretches_rs5 = load('stretches_rs5.json')
stretches_po3 = load('stretches_po3.json')

# Index stretches by name for fast lookup
s_rs3 = {r['name']: r for r in stretches_rs3}
s_rs5 = {r['name']: r for r in stretches_rs5}
s_po3 = {r['name']: r for r in stretches_po3}

# Group seasons by player
from collections import defaultdict
player_seasons = defaultdict(lambda: {'RS': [], 'PO': []})
for s in seasons:
    player_seasons[s['name']][s['type']].append(s)

careers = []
for name, data in player_seasons.items():
    rs = sorted(data['RS'], key=lambda x: x['year'])
    po = sorted(data['PO'], key=lambda x: x['year'])
    
    if not rs:
        continue
    
    # Teams and eras
    teams = list(dict.fromkeys(r['team'] for r in rs))  # preserve order, dedupe
    eras = list(dict.fromkeys(r['era'] for r in rs))
    
    # Year range
    ys = rs[0]['year']
    ye = rs[-1]['year']
    n = len(rs)
    
    # RS Peak
    peak_rs = max(rs, key=lambda r: r['reign'])
    rp = round(peak_rs['reign'], 2)
    rpy = peak_rs['year']
    rpo = round(peak_rs['reign_off'], 2)
    rpd = round(peak_rs['reign_def'], 2)
    
    # RS Best 3yr and 5yr (from stretches - best N non-consecutive)
    r3 = round(s_rs3[name]['avg_reign'], 2) if name in s_rs3 else None
    r5 = round(s_rs5[name]['avg_reign'], 2) if name in s_rs5 else None
    
    # Career cumulative REIGN
    rc = round(sum(r['reign'] for r in rs), 2)
    
    # Playoff peak
    pp = None
    ppy = None
    ppo = None
    ppd = None
    p3 = None
    pn = len(po)
    
    if po:
        peak_po = max(po, key=lambda r: r['reign'])
        pp = round(peak_po['reign'], 2)
        ppy = peak_po['year']
        ppo = round(peak_po['reign_off'], 2)
        ppd = round(peak_po['reign_def'], 2)
        if name in s_po3:
            p3 = round(s_po3[name]['avg_reign'], 2)
    
    # Career avg box score (from RS)
    ap = round(sum(r.get('pts', 0) for r in rs) / n, 1) if n else None
    ar = round(sum(r.get('reb', 0) for r in rs) / n, 1) if n else None
    aa = round(sum(r.get('ast', 0) for r in rs) / n, 1) if n else None
    
    careers.append({
        'name': name,
        'teams': teams,
        'eras': eras,
        'ys': ys,
        'ye': ye,
        'n': n,
        'rp': rp,
        'rpy': rpy,
        'rpo': rpo,
        'rpd': rpd,
        'r3': r3,
        'r5': r5,
        'rc': rc,
        'pp': pp,
        'ppy': ppy,
        'ppo': ppo,
        'ppd': ppd,
        'p3': p3,
        'pn': pn,
        'ap': ap,
        'ar': ar,
        'aa': aa,
    })

# Sort by peak REIGN descending, assign ranks
careers.sort(key=lambda c: c['rp'], reverse=True)
for i, c in enumerate(careers):
    c['rank'] = i + 1

# Write
out_path = os.path.join(DATA_DIR, 'careers.json')
with open(out_path, 'w') as f:
    json.dump(careers, f, separators=(',', ':'))

print(f"Regenerated {out_path}: {len(careers)} players")

# Verify
lb = next(c for c in careers if c['name'] == 'LeBron James')
mj = next(c for c in careers if c['name'] == 'Michael Jordan')
print(f"  LeBron: rp={lb['rp']}, r3={lb['r3']}, r5={lb['r5']}, rank=#{lb['rank']}")
print(f"  Jordan: rp={mj['rp']}, r3={mj['r3']}, r5={mj['r5']}, rank=#{mj['rank']}")
