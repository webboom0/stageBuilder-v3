/**
 * Cloudflare Git build — deploy step (uses CI-injected credentials).
 * Deploy command in dashboard:
 *   node scripts/cf-pages-deploy.mjs
 */
import { execSync } from 'node:child_process';

const project =
  process.env.CF_PAGES_PROJECT_NAME
  || process.env.WRANGLER_PAGES_PROJECT
  || 'stagebuilder-v3';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const dir = 'pages-dist';

const parts = [
  'npx', 'wrangler', 'pages', 'deploy', dir,
  `--project-name=${project}`,
];
if (accountId) parts.push(`--account-id=${accountId}`);

console.log('[cf-pages-deploy] project =', project);
console.log('[cf-pages-deploy] account =', accountId || '(from wrangler login/token)');
console.log('[cf-pages-deploy]', parts.join(' '));

execSync(parts.join(' '), { stdio: 'inherit', env: process.env });
