# Bundled Chinese hand font

`public/fonts/xiaolai-game.woff2` is a subset of Xiaolai (小赖字体) v3.126 by LXGW, SIL Open Font License 1.1
(`public/fonts/OFL-Xiaolai.txt`). Source: https://github.com/lxgw/kose-font/releases

The subset holds every non-ASCII character in `src/` and `index.html`, the 3755 GB2312 level-1 characters
(for free text such as the partner's chat), CJK punctuation and full-width forms. Other characters fall
back to system fonts.

Rebuild after adding Chinese text that shows blank or in a different font:

```bash
python3 docs/fonts/subset-chars.py . /tmp/chars.txt
pyftsubset Xiaolai-Regular.ttf --text-file=/tmp/chars.txt --flavor=woff2 --layout-features='' --no-hinting --output-file=public/fonts/xiaolai-game.woff2
```

`pyftsubset` comes with `pip install fonttools brotli`.
