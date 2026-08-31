/**
 * Render / server deploy prep — stage FBX + upload dirs.
 *
 * Env (optional):
 *   STAGE_ASSETS_SRC      — folder with background.fbx, arena_stage.fbx
 *   STAGE_ASSETS_RELEASE  — GitHub release base URL (no trailing slash)
 *                           e.g. https://github.com/webboom0/stageBuilder-v3/releases/download/stage-deploy-assets-v1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FILES = path.join(ROOT, 'server', 'files');
const STAGE = path.join(FILES, 'stage');

const STAGE_RELEASE_BASE = (
  process.env.STAGE_ASSETS_RELEASE
  || 'https://github.com/webboom0/stageBuilder-v3/releases/download/stage-deploy-assets-v1'
).replace(/\/$/, '');

const STAGE_CANDIDATES = [
  process.env.STAGE_ASSETS_SRC,
  path.join(ROOT, 'deploy', 'stage'),
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

async function downloadIfMissing(name) {
  const dest = path.join(STAGE, name);
  if (fs.existsSync(dest)) return true;
  const url = `${STAGE_RELEASE_BASE}/${name}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    ensureDir(STAGE);
    fs.writeFileSync(dest, buf);
    console.log('[deploy-assets] downloaded', name, '←', url);
    return true;
  } catch (err) {
    console.warn('[deploy-assets] download failed', name, err.message || err);
    return false;
  }
}

for (const sub of UPLOAD_DIRS) ensureDir(path.join(FILES, sub));

let copied = 0;
for (const name of REQUIRED) {
  const dest = path.join(STAGE, name);
  if (fs.existsSync(dest)) {
    copied += 1;
    continue;
  }
  let found = false;
  for (const base of STAGE_CANDIDATES) {
    const src = path.join(base, name);
    if (copyIfExists(src, dest)) {
      console.log('[deploy-assets] copied', name, '←', src);
      copied += 1;
      found = true;
      break;
    }
  }
  if (!found && await downloadIfMissing(name)) {
    copied += 1;
  }
}

if (copied < REQUIRED.length) {
  console.warn(
    '[deploy-assets] WARNING: stage FBX missing.\n'
    + '  Set STAGE_ASSETS_SRC or STAGE_ASSETS_RELEASE, or upload to server/files/stage/.',
  );
  for (const name of REQUIRED) {
    if (!fs.existsSync(path.join(STAGE, name))) {
      console.warn('  missing:', name);
    }
  }
} else {
  console.log('[deploy-assets] stage FBX OK');
}
