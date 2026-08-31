/** @param {Request} request @param {Record<string, string>} env */
export function checkAuth(request, env) {
  const devSkip = env.DEV_SKIP_AUTH === '1' || env.DEV_SKIP_AUTH === 'true';
  if (devSkip) {
    return { ok: true, user: { sub: 'dev-user' } };
  }

  let token = null;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)pb_token=([^;]+)/);
  if (m) token = m[1];
  if (!token) {
    const auth = request.headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }
  if (!token) {
    return { ok: false, status: 401, error: '인증이 필요합니다.', redirect: '/login' };
  }

  // Production JWT — set SECRET_KEY secret and implement verify if needed.
  return { ok: false, status: 501, error: 'JWT 인증은 Workers에서 아직 미구현입니다. DEV_SKIP_AUTH=1을 사용하세요.' };
}

/** @param {Record<string, string>} env */
export function isDevSkipAuth(env) {
  return env.DEV_SKIP_AUTH === '1' || env.DEV_SKIP_AUTH === 'true';
}
