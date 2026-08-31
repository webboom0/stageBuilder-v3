/**
 * Upload local server/files/ library tree to R2 (Workers API bucket).
 *
 * Usage:
 *   node scripts/upload-library-to-r2.mjs
 *   LIBRARY_SRC=E:\...\server\files node scripts/upload-library-to-r2.mjs
 *
 * Requires: wrangler login, workers/ npm install
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIBRARY_SRC = process.env.LIBRARY_SRC || path.join(ROOT, 'server', 'files');
const BUCKET = process.env.R2_BUCKET || 'stagebuilder-v4-files';
const WORKERS_DIR = path.join(ROOT, 'workers');

const LIBRARY_DIRS = ['stage', 'music', 'characters', 'fbx', 'props', 'video'];

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile() && !entry.name.startsWith('.')) out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(WORKERS_DIR)) {
    console.error('[r2-upload] workers/ not found');
    process.exit(1);
  }
  if (!fs.existsSync(LIBRARY_SRC)) {
    console.error('[r2-upload] LIBRARY_SRC not found:', LIBRARY_SRC);
    console.error('  Set LIBRARY_SRC to server/files or upload manually — see R2-UPLOAD.md');
    process.exit(1);
  }

  /** @type {Array<{ local: string, key: string }>} */
  const jobs = [];
  for (const sub of LIBRARY_DIRS) {
    const dir = path.join(LIBRARY_SRC, sub);
    for (const local of walkFiles(dir)) {
      const rel = path.relative(LIBRARY_SRC, local).replace(/\\/g, '/');
      jobs.push({ local, key: `files/${rel}` });
    }
  }

  if (!jobs.length) {
    console.log('[r2-upload] No library files under', LIBRARY_SRC);
    console.log('[r2-upload] Add files to server/files/{stage,music,characters,...} or see R2-UPLOAD.md');
    process.exit(0);
  }

  console.log('[r2-upload] bucket =', BUCKET);
  console.log('[r2-upload] source =', LIBRARY_SRC);
  console.log('[r2-upload] files  =', jobs.length);

  for (const { local, key } of jobs) {
    const cmd = `npx wrangler r2 object put ${BUCKET}/${key} --file="${local.replace(/"/g, '\\"')}"`;
    console.log('[r2-upload]', key);
    execSync(cmd, { cwd: WORKERS_DIR, stdio: 'inherit' });
  }

  console.log('[r2-upload] Done.');
}

main();
