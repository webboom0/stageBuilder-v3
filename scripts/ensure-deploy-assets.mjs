/**
 * Render / server deploy prep — stage FBX + upload dirs.
 *
 * Env (optional):
 *   STAGE_ASSETS_SRC  — folder with background.fbx, arena_stage.fbx
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FILES = path.join(ROOT, 'server', 'files');
const STAGE = path.join(FILES, 'stage');

const STAGE_CANDIDATES = [
  process.env.STAGE_ASSETS_SRC,
  path.join(ROOT, 'runtime', 'files', 'stage'),
  path.join(ROOT, '..', '..', 'pivot', 'nginx', 'html', 'stageBuilder', 'files', 'stage'),
  path.join(ROOT, '..', 'StageBuilder_v3', 'files', 'stage'),
].filter(Boolean);

const REQUIRED = ['background.fbx', 'arena_stage.fbx'];
const UPLOAD_DIRS = ['music', 'characters', 'props', 'fbx', 'video', 'projects', 'stage'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

for (const sub of UPLOAD_DIRS) ensureDir(path.join(FILES, sub));

let copied = 0;
for (const name of REQUIRED) {
  const dest = path.join(STAGE, name);
  if (fs.existsSync(dest)) {
    copied += 1;
    continue;
  }
  for (const base of STAGE_CANDIDATES) {
    const src = path.join(base, name);
    if (copyIfExists(src, dest)) {
      console.log('[deploy-assets] copied', name, '←', src);
      copied += 1;
      break;
    }
  }
}

if (copied < REQUIRED.length) {
  console.warn(
    '[deploy-assets] WARNING: stage FBX missing.\n'
    + '  Set STAGE_ASSETS_SRC to a folder with background.fbx + arena_stage.fbx\n'
    + '  or upload manually to server/files/stage/ on the host.',
  );
  for (const name of REQUIRED) {
    if (!fs.existsSync(path.join(STAGE, name))) {
      console.warn('  missing:', name);
    }
  }
} else {
  console.log('[deploy-assets] stage FBX OK');
}
