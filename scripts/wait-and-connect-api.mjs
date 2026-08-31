/**
 * Poll Render API health, then update Cloudflare Pages STAGEBUILDER_API_URL.
 *
 * Usage:
 *   node scripts/wait-and-connect-api.mjs [apiUrl]
 *
 * Default apiUrl: https://stagebuilder-v4-api.onrender.com
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_URL = (process.argv[2] || 'https://stagebuilder-v4-api.onrender.com').replace(/\/$/, '');
const HEALTH = `${API_URL}/api/health`;
const MAX_ATTEMPTS = 60;
const INTERVAL_MS = 15_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SET_SCRIPT = path.join(__dirname, 'set-pages-api-url.mjs');

async function checkHealth() {
  try {
    const res = await fetch(HEALTH, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

async function main() {
  console.log('[wait-api] Waiting for', HEALTH);
  for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
    const ok = await checkHealth();
    if (ok) {
      console.log('[wait-api] API is up.');
      execSync(`node "${SET_SCRIPT}" "${API_URL}"`, { stdio: 'inherit' });
      return;
    }
    console.log(`[wait-api] attempt ${i}/${MAX_ATTEMPTS} — not ready, retry in ${INTERVAL_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  console.error('[wait-api] Timed out. Deploy Render Blueprint first (see DEPLOY-CLOUDFLARE.md §2).');
  process.exit(1);
}

main();
