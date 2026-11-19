#!/usr/bin/env python3
# Worst-10 (from the before scans of all three levels) before vs after, as a markdown table.
import json
def load(lv, tag):
    try:
        return {tuple(r['sp']): r for r in json.load(open(f'/tmp/wd-cam/scan-{lv}-{tag}.json'))}
    except FileNotFoundError:
        return {}
def ok(r):
    return r['valid'] >= 4 and max(max(y['still']['closeMax'], y['sweep']['closeMax']) for y in r['yaws']) > 0.5
def still(r): return max(y['still']['jit'] for y in r['yaws'] if y['moved'] < 0.3)
def sweep(r): return max(y['sweep']['jit'] for y in r['yaws'] if y['moved'] < 0.3)
def flips(r): return max(max(y['still']['flips'], y['sweep']['flips']) for y in r['yaws'] if y['moved'] < 0.3)
rows = []
for lv in ('plaza', 'harbor', 'works'):
    b, a = load(lv, 'before'), load(lv, 'after')
    for k, r in b.items():
        if ok(r): rows.append((lv, k, r, a.get(k)))
rows.sort(key=lambda q: -q[2]['worst'])
print('| # | level | spot (x, y, z) | jit still before → after | jit sweep before → after | flips before → after | max step mm before → after |')
print('|---|---|---|---|---|---|---|')
for i, (lv, k, b, a) in enumerate(rows[:10]):
    f = lambda fn: f"{fn(b):.0f} → {fn(a):.0f}" if a else f"{fn(b):.0f} → ?"
    print(f"| {i+1} | {lv} | {k[0]:.1f}, {k[1]:.1f}, {k[2]:.1f} | {f(still)} | {f(sweep)} | {f(flips)} | {b['maxStep']:.0f} → {a['maxStep']:.0f} |" if a else f"| {i+1} | {lv} | {k} | {f(still)} | {f(sweep)} | {f(flips)} | {b['maxStep']:.0f} → ? |")
# whole-scan summary
for lv in ('plaza', 'harbor', 'works'):
    b, a = load(lv, 'before'), load(lv, 'after')
    ks = [k for k, r in b.items() if ok(r) and k in a]
    if not ks: continue
    med = lambda xs: sorted(xs)[len(xs) // 2]
    print(f"{lv}: {len(ks)} spots, median worst {med([b[k]['worst'] for k in ks]):.0f} → {med([a[k]['worst'] for k in ks]):.0f}, "
          f"spots with worst > 100: {sum(b[k]['worst'] > 100 for k in ks)} → {sum(a[k]['worst'] > 100 for k in ks)}, "
          f"max {max(b[k]['worst'] for k in ks):.0f} → {max(a[k]['worst'] for k in ks):.0f}")
