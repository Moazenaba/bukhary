#!/usr/bin/env python3
"""Cuts the Material Symbols icon font down to the icons the web app uses (4 MB -> a few dozen kB).

Every string in src/ that is a Material Symbols name is kept (a few extra words cost nothing; a missing
icon shows as its name). Run it after using a new icon:

    pip install fonttools brotli
    python3 scripts/subset-icons.py

It writes src/assets/icons/material-symbols-subset.woff2 and src/assets/icons/icons.json (the kept names,
which tests/web/icons.test.ts checks against the code).
"""
import json, re, pathlib
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

root = pathlib.Path(__file__).resolve().parent.parent
names = set(re.findall(r'"([a-z0-9_]+)"', (root / 'node_modules/material-symbols/index.d.ts').read_text()))
used = set()
for f in (root / 'src').rglob('*'):
    if f.suffix in ('.ts', '.tsx'):
        used |= set(re.findall(r'[a-z0-9_]+', f.read_text(encoding='utf-8'))) & names
used = sorted(used)

font = TTFont(root / 'node_modules/material-symbols/material-symbols-outlined.woff2', lazy=False)
opts = subset.Options()
opts.layout_features = ['liga', 'rlig', 'calt', 'ccmp']
opts.flavor = 'woff2'
opts.ignore_missing_glyphs = True
s = subset.Subsetter(opts)
s.populate(text=' '.join(used) + ' abcdefghijklmnopqrstuvwxyz0123456789_')
s.subset(font)
# The app draws icons outlined, at the normal grade and the 24px optical size; only the weight varies.
font = instancer.instantiateVariableFont(font, {'FILL': 0, 'GRAD': 0, 'opsz': 24, 'wght': 400})
out = root / 'src/assets/icons'
out.mkdir(parents=True, exist_ok=True)
font.flavor = 'woff2'
font.save(out / 'material-symbols-subset.woff2')
(out / 'icons.json').write_text(json.dumps(used, indent=0) + '\n')
print(f'{len(used)} icons -> {(out / "material-symbols-subset.woff2").stat().st_size // 1024} kB')
