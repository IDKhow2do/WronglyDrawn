import sys, pathlib
root = pathlib.Path(sys.argv[1]); out = set()
# every non-ASCII character the game's own source uses
for p in list(root.glob('src/**/*.ts')) + [root/'index.html']:
    out.update(c for c in p.read_text(encoding='utf-8', errors='ignore') if ord(c) > 0x2000)
# GB2312 level 1: the 3755 most common characters (for free text such as the partner's chat)
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try: out.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError: pass
# CJK punctuation and full-width forms
out.update(chr(c) for c in range(0x3000, 0x3040)); out.update(chr(c) for c in range(0xFF00, 0xFFF0))
out.update('—…·“”‘’《》、。！？：；（）')
pathlib.Path(sys.argv[2]).write_text(''.join(sorted(out)), encoding='utf-8'); print(len(out))
