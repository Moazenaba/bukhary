import fs from 'fs';
import path from 'path';

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let modifiedCount = 0;
let spansFixed = 0;

files.forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace <span ...material-symbols... > that don't have aria-hidden
  content = content.replace(/<span\s+([^>]*?material-symbols[^>]*?)>/g, (match, attrs) => {
    if (attrs.includes('aria-hidden')) return match;
    spansFixed++;
    return `<span ${attrs} aria-hidden="true">`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    console.log(`✓ Updated accessibility in: ${path.relative('.', filePath)}`);
  }
});

console.log(`\n🎉 Total spans fixed with aria-hidden="true": ${spansFixed} across ${modifiedCount} files.`);
