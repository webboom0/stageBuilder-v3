import { isDevSkipAuth, checkAuth } from './auth.js';
import { handleAiRoutes } from './ai.js';
import { handleLibraryRoutes, serveFilesRoute } from './library.js';
import { handleProjectRoutes } from './projects.js';
import { corsHeaders, error, json, withHeaders } from './util.js';

/** @param {Response} res @param {Request} request */
function addCors(res, request) {
  return withHeaders(res, corsHeaders(request));
}

export default {
  /** @param {Request} request @param {Record<string, string>} env */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/health' && request.method === 'GET') {
      return addCors(json({
        status: 'ok',
        devSkipAuth: isDevSkipAuth(env),
        version: 4,
        backend: 'workers-r2',
      }), request);
    }

    const auth = checkAuth(request, env);
    if (!auth.ok) {
      return addCors(json(
        { error: auth.error, redirect: auth.redirect },
        auth.status || 401,
      ), request);
    }

    try {
      if (pathname.startsWith('/files/') && request.method === 'GET') {
        const fileRes = await serveFilesRoute(env.FILES, pathname);
        if (fileRes) return addCors(fileRes, request);
      }

      let res = await handleLibraryRoutes(env.FILES, pathname, request);
      if (res) return addCors(res, request);

      res = await handleProjectRoutes(env.FILES, pathname, request);
      if (res) return addCors(res, request);

      res = await handleAiRoutes(env, request);
      if (res) return addCors(res, request);

      return addCors(error('Not Found', 404), request);
    } catch (err) {
      console.error('[worker]', err);
      return addCors(error(err.message || '서버 내부 오류', 500), request);
    }
  },
};
