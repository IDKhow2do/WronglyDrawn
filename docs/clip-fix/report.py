import json,sys
d=json.load(open(sys.argv[1])); kinds=sys.argv[2].split(',') if len(sys.argv)>2 else ['SINK','FLOAT','COVER']
print({k:d.get(k) for k in ['ms','cols','tops','off','sink','cover','float']})
for c in d['clusters']:
  if c['sign'] in kinds: print(c['sign'],c['n'],c['max'],c['mean'],c['tag'],c['shape'],round(c['cy'],2),(c['x0'],c['x1'],c['z0'],c['z1']),c['mesh'][:70])
