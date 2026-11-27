import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// The icon font is cut down to the icons the code names (scripts/subset-icons.py). An icon used in the
// code but missing from the cut font would show as its name, so every Material Symbols name in src/
// must be in icons.json.
const root = path.resolve(__dirname, '../..');
const allNames = new Set(
  [...fs.readFileSync(path.join(root, 'node_modules/material-symbols/index.d.ts'), 'utf8').matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1])
);
const kept = new Set<string>(JSON.parse(fs.readFileSync(path.join(root, 'src/assets/icons/icons.json'), 'utf8')));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('icon font', () => {
  it('has every icon the code names (run `python3 scripts/subset-icons.py` after adding one)', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(path.join(root, 'src'))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/[a-z0-9_]+/g)) if (allNames.has(m[0])) used.add(m[0]);
    }
    const missing = [...used].filter((n) => !kept.has(n));
    expect(missing).toEqual([]);
  });

  it('is the cut font, not the 4 MB one', () => {
    const css = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
    expect(css).not.toContain("material-symbols/outlined.css");
    expect(fs.statSync(path.join(root, 'src/assets/icons/material-symbols-subset.woff2')).size).toBeLessThan(600_000);
  });
});
