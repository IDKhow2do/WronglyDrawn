#!/usr/bin/env python3
# Rank scan spots by jitter. Usage: python3 rank.py scan-<level>-<tag>.json [N]
import json, sys
rows = json.load(open(sys.argv[1]))
n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
# drop buried spots (camera stuck at the head at every yaw: a spot WAI can't really stand in)
ok = [r for r in rows if r['valid'] >= 4 and r['closeMin'] < 50 and max(max(y['still']['closeMax'], y['sweep']['closeMax']) for y in r['yaws']) > 0.5]
ok.sort(key=lambda r: -r['worst'])
for r in ok[:n]:
    print(json.dumps({k: r[k] for k in ('sp', 'worst', 'flips', 'maxStep', 'closeMin', 'valid')}))
print('spots', len(rows), 'kept', len(ok), 'median worst', sorted(r['worst'] for r in ok)[len(ok) // 2] if ok else None)
