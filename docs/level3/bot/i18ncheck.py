# List player-facing English strings in the level-3 files that have no zh entry (zh.ts + zhWorks.ts).
import re, glob
files = glob.glob('src/level/works/*.ts') + ['src/enemy/StampPress.ts', 'src/enemy/StampPressLook.ts', 'src/enemy/RulerSnake.ts', 'src/enemy/RulerSnakeLook.ts', 'src/enemy/CompassSpinner.ts', 'src/enemy/CompassLook.ts', 'src/enemy/RedPenBoss.ts', 'src/enemy/RedPenLook.ts', 'src/enemy/RedPenAllies.ts', 'src/enemy/RedPenMoves.ts', 'src/enemy/RedPenSky.ts', 'src/enemy/RedPenHazards.ts', 'src/ui/SoulsHud.ts', 'src/level/levels.ts', 'src/ui/UI.ts']
zh = open('src/i18n/zh.ts').read() + open('src/i18n/zhWorks.ts').read() if __import__('os').path.exists('src/i18n/zhWorks.ts') else open('src/i18n/zh.ts').read()
keys = set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)':", zh, re.M)) | set(re.findall(r'^\s*"((?:[^"\\]|\\.)*)":', zh, re.M)) | set(re.findall(r"^\s*([A-Za-z]+):", zh, re.M))
seen = set()
for f in files:
    src = open(f).read()
    for m in re.finditer(r"'((?:[^'\\\n]|\\.){3,})'", src):
        s = m.group(1)
        if not re.search(r'[A-Za-z]', s) or re.match(r'^[a-zA-Z_\-./0-9]+$', s) or s.startswith('#') or s.startswith('w3') or s.startswith('cp-') or s.startswith('crown-') or s.startswith('drop-'):
            continue
        if not (' ' in s or s.endswith('!') or s.isupper()):
            continue
        if s not in keys and s not in seen:
            seen.add(s); print(f.split('/')[-1], '|', s)
