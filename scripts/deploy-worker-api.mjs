/**
 * Deploy Workers API and connect Cloudflare Pages STAGEBUILDER_API_URL.
 *
 * Usage:
 *   node scripts/deploy-worker-api.mjs
 *   node scripts/deploy-worker-api.mjs --skip-pages
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WORKERS = path.join(ROOT, 'workers');
const skipPages = process.argv.includes('--skip-pages');

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function parseWorkerUrl(output) {
  const m = output.match(/https:\/\/[^\s]+\.workers\.dev/);
  return m ? m[0].replace(/\/$/, '') : null;
}

async function main() {
  console.log('[deploy-worker] Installing workers dependencies…');
  run('npm install', WORKERS);

  console.log('[deploy-worker] Creating R2 bucket if needed…');
  try {
    run('npx wrangler r2 bucket create stagebuilder-v4-files', WORKERS);
  } catch {
    console.log('[deploy-worker] Bucket may already exist — continuing.');
  }

  console.log('[deploy-worker] Deploying Worker…');
  const out = execSync('npx wrangler deploy', { cwd: WORKERS, encoding: 'utf8' });
  process.stdout.write(out);
  const apiUrl = parseWorkerUrl(out);
  if (!apiUrl) {
    console.error('[deploy-worker] Could not detect Worker URL from deploy output.');
    console.error('  Set Pages manually: node scripts/set-pages-api-url.mjs https://YOUR-WORKER.workers.dev');
    process.exit(1);
  }

  console.log('[deploy-worker] API URL =', apiUrl);
  fs.writeFileSync(
    path.join(WORKERS, 'deploy-url.txt'),
    `${apiUrl}\n`,
  );

  if (skipPages) {
    console.log('[deploy-worker] Skipping Pages connect (--skip-pages).');
    return;
  }

  console.log('[deploy-worker] Connecting Pages STAGEBUILDER_API_URL…');
  run(`node scripts/set-pages-api-url.mjs ${apiUrl}`);
  console.log('[deploy-worker] Done.');
  console.log('[deploy-worker] Next: upload library — see R2-UPLOAD.md');
}

main().catch((err) => {
  console.error('[deploy-worker]', err.message || err);
  process.exit(1);
});
