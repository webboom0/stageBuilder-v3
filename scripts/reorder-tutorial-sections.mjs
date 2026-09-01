import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targets = [
  path.join(__dirname, '..', 'editor', 'tutorial', 'index.html'),
  path.join(__dirname, '..', 'docs', 'tutorial', 'index.html'),
];

const order = [
  'right-panels',
  'properties-panel',
  'char-pattern',
  'char-props',
  'stage-pattern',
  'stage-props',
  'char-group',
  'pattern-library',
  'position-presets',
  'light-props',
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  const re = /<section id="([^"]+)"[^>]*>[\s\S]*?<\/section>/g;
  const sections = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    sections.set(m[1], m[0]);
  }
  const start = html.indexOf('<section id="right-panels"');
  const end = html.indexOf('<section id="viewport-multiview"');
  if (start < 0 || end < 0) {
    console.warn('[reorder] skip', file, 'markers missing');
    continue;
  }
  const block = order.map((id) => {
    const s = sections.get(id);
    if (!s) throw new Error(`missing section ${id} in ${file}`);
    return s;
  }).join('\n\n      ');
  html = `${html.slice(0, start)}${block}\n\n      ${html.slice(end)}`;
  fs.writeFileSync(file, html);
  console.log('[reorder] ok', path.relative(process.cwd(), file));
}
