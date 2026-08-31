/**
 * Cloudflare Pages — set STAGEBUILDER_API_URL and trigger a new deployment.
 *
 * Usage:
 *   node scripts/set-pages-api-url.mjs https://stagebuilder-v4-api.onrender.com
 *
 * Env:
 *   CLOUDFLARE_ACCOUNT_ID  (default: Tmaniaj account — stagebuilder project)
 *   CF_PAGES_PROJECT       (default: stagebuilder)
 *   CLOUDFLARE_API_TOKEN   (optional — else reads wrangler oauth_token)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API_URL = (process.argv[2] || '').replace(/\/$/, '');
if (!API_URL || !/^https?:\/\//.test(API_URL)) {
  console.error('Usage: node scripts/set-pages-api-url.mjs <https://your-api-host>');
  process.exit(1);
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '50020fa67496023f6b2349914dace964';
const PROJECT = process.env.CF_PAGES_PROJECT || 'stagebuilder';

function readWranglerToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const home = os.homedir();
  const candidates = [
    path.join(home, '.wrangler', 'config', 'default.toml'),
    path.join(home, 'AppData', 'Roaming', 'xdg.config', '.wrangler', 'config', 'default.toml'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  return null;
}

const token = readWranglerToken();
if (!token) {
  console.error('[set-pages-api] No Cloudflare token — run: npx wrangler login');
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.errors?.[0]?.message || res.statusText || 'Cloudflare API error');
  }
  return data;
}

async function main() {
  console.log('[set-pages-api] project =', PROJECT);
  console.log('[set-pages-api] API URL =', API_URL);

  const { result: project } = await api('GET', base);
  const env = { ...(project.deployment_configs?.production?.env_vars || {}) };
  env.STAGEBUILDER_API_URL = { type: 'plain_text', value: API_URL };

  await api('PATCH', base, {
    deployment_configs: {
      production: {
        ...project.deployment_configs?.production,
        env_vars: env,
      },
      preview: {
        ...project.deployment_configs?.preview,
        env_vars: {
          ...(project.deployment_configs?.preview?.env_vars || {}),
          STAGEBUILDER_API_URL: { type: 'plain_text', value: API_URL },
        },
      },
    },
  });
  console.log('[set-pages-api] Environment variables updated.');

  const { result: deploy } = await api('POST', `${base}/deployments`, {
    branch: 'v4',
  });
  console.log('[set-pages-api] Deployment triggered:', deploy?.url || deploy?.id || 'ok');
  console.log('[set-pages-api] Editor: https://stagebuilder.pages.dev/stageBuilder/index.html');
}

main().catch((err) => {
  console.error('[set-pages-api]', err.message || err);
  process.exit(1);
});
