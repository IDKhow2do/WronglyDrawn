# List player-facing English strings in the level-2 expansion files that have no zh entry.
import re, sys
files = ['src/enemy/MegaphoneCrab.ts', 'src/enemy/FogJelly.ts', 'src/enemy/RedGramophone.ts', 'src/level/harbor/BandstandPier.ts',
         'src/level/harbor/PierDirector.ts', 'src/level/harbor/EchoGallery.ts', 'src/level/harbor/RedPenSky.ts', 'src/level/harbor/PierKit.ts']
zh = open('src/i18n/zh.ts').read()
keys = set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)':", zh, re.M))
miss = []
for f in files:
    src = open(f).read()
    for m in re.finditer(r"'((?:[^'\\\n]|\\.){3,})'", src):
        s = m.group(1)
        if not re.search(r'[A-Za-z]', s) or re.match(r'^[a-z_\-./]+$', s) or re.match(r'^#', s) or s.startswith('p-') or s.startswith('crown-') or s.startswith('cp-'):
            continue
        if not (' ' in s or s.endswith('!') or s.isupper()):
            continue
        if s not in keys:
            miss.append((f.split('/')[-1], s))
for f, s in miss:
    print(f, '|', s)
