/**
 * Cloudflare Pages build — editor + Three.js runtime + API URL injection.
 *
 * Env:
 *   STAGEBUILDER_API_URL  (required) e.g. https://stagebuilder-v4-api.onrender.com
 *
 * Output: pages-dist/
 *   /stageBuilder/index.html
 *   /build/three.module.js
 *   /examples/jsm/...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pages-dist');
const EDITOR = path.join(ROOT, 'editor');

const API_URL = (process.env.STAGEBUILDER_API_URL || '').replace(/\/$/, '');
if (!API_URL) {
  console.error(
    '[pages:build] STAGEBUILDER_API_URL is required.\n'
    + '  Example: STAGEBUILDER_API_URL=https://your-api.onrender.com node scripts/prepare-pages-deploy.mjs',
  );
  process.exit(1);
}

const RUNTIME_CANDIDATES = [
  path.join(ROOT, 'runtime'),
  path.join(ROOT, '..', '..', 'pivot', 'nginx', 'html', 'stageBuilder'),
  path.join(ROOT, '..', 'StageBuilder_v3'),
];

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function resolveRuntimeRoot() {
  for (const candidate of RUNTIME_CANDIDATES) {
    const buildFile = path.join(candidate, 'build', 'three.module.js');
    if (fs.existsSync(buildFile)) return candidate;
  }
  return null;
}

function installThreeToTemp() {
  const temp = path.join(ROOT, '.pages-three-cache');
  const pkg = path.join(temp, 'package.json');
  if (!fs.existsSync(pkg)) {
    fs.mkdirSync(temp, { recursive: true });
    fs.writeFileSync(pkg, JSON.stringify({
      name: 'stagebuilder-pages-three',
      private: true,
      dependencies: { three: '0.172.0' },
    }, null, 2));
    console.log('[pages:build] Installing three@0.172.0 (one-time cache)…');
    execSync('npm install --omit=dev', { cwd: temp, stdio: 'inherit' });
  }
  const modRoot = path.join(temp, 'node_modules', 'three');
  if (!fs.existsSync(path.join(modRoot, 'build', 'three.module.js'))) {
    throw new Error('three install failed — delete .pages-three-cache and retry');
  }
  return modRoot;
}

function injectApiConfig(html) {
  const snippet = [
    '  <!-- injected by scripts/prepare-pages-deploy.mjs -->',
    '  <script>',
    `    window.__STAGEBUILDER_API__ = ${JSON.stringify(API_URL)};`,
    '  </script>',
  ].join('\n');
  if (html.includes('__STAGEBUILDER_API__')) return html;
  return html.replace('<head>', `<head>\n${snippet}`);
}

// ─── Build ───
console.log('[pages:build] API →', API_URL);
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

copyDir(EDITOR, path.join(OUT, 'stageBuilder'));

const runtime = resolveRuntimeRoot() || installThreeToTemp();
console.log('[pages:build] Three.js from', runtime);
copyDir(path.join(runtime, 'build'), path.join(OUT, 'build'));
copyDir(path.join(runtime, 'examples'), path.join(OUT, 'examples'));

const indexPath = path.join(OUT, 'stageBuilder', 'index.html');
fs.writeFileSync(indexPath, injectApiConfig(fs.readFileSync(indexPath, 'utf8')));

const redirects = [
  '/ /stageBuilder/index.html 302',
  '/stageBuilder /stageBuilder/index.html 302',
  '/tutorial /stageBuilder/tutorial/index.html 302',
  '/tutorial/ /stageBuilder/tutorial/index.html 302',
].join('\n');
fs.writeFileSync(path.join(OUT, '_redirects'), `${redirects}\n`);

const meta = {
  builtAt: new Date().toISOString(),
  apiUrl: API_URL,
  entry: '/stageBuilder/index.html',
};
fs.writeFileSync(path.join(OUT, 'deploy-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

console.log('[pages:build] Done → pages-dist/');
console.log('[pages:build] Preview: npx wrangler pages dev pages-dist');
console.log('[pages:build] Editor URL path: /stageBuilder/index.html');
