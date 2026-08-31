/** @param {string} name */
export function slugify(name) {
  const base = String(name || 'project')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\uAC00-\uD7A3-]/g, '')
    .slice(0, 48);
  return base || 'project';
}

/** @param {string} filename */
export function basename(filename) {
  const s = String(filename || '').replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** @param {string} filename */
export function extname(filename) {
  const base = basename(filename);
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

/** @param {string} filename */
export function parseName(filename) {
  const base = basename(filename);
  const i = base.lastIndexOf('.');
  if (i < 0) return { name: base, ext: '' };
  return { name: base.slice(0, i), ext: base.slice(i) };
}

/**
 * @param {Set<string>} existingLower
 * @param {string} originalName
 */
export function uniqueFilename(existingLower, originalName) {
  const { name, ext } = parseName(basename(originalName));
  let candidate = `${name}${ext}`;
  let n = 2;
  while (existingLower.has(candidate.toLowerCase())) {
    candidate = `${name}${n}${ext}`;
    n += 1;
  }
  existingLower.add(candidate.toLowerCase());
  return candidate;
}

/** @param {unknown} data @param {number} [status] @param {Record<string, string>} [extraHeaders] */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

/** @param {string} message @param {number} [status] @param {Record<string, string>} [extraHeaders] */
export function error(message, status = 400, extraHeaders = {}) {
  return json({ error: message }, status, extraHeaders);
}

/** @param {Request} request */
export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/** @param {Response} res @param {Record<string, string>} headers */
export function withHeaders(res, headers) {
  const next = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) next.headers.set(k, v);
  return next;
}

/** @param {string} segment */
export function decodeRouteSegment(segment) {
  try {
    return decodeURIComponent(String(segment || ''));
  } catch {
    return String(segment || '');
  }
}

/** @param {string} projectId */
export function safeProjectId(projectId) {
  const decoded = decodeRouteSegment(projectId);
  const safe = basename(String(decoded || ''));
  if (!safe || safe !== decoded || safe.includes('..')) return null;
  return safe;
}

/** @param {string} sceneId */
export function safeSceneId(sceneId) {
  const decoded = decodeRouteSegment(sceneId);
  const safe = basename(String(decoded || ''));
  if (!safe || safe !== decoded || safe.includes('..')) return null;
  return safe;
}

export const MEDIA_EXTS = {
  music: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
  fbx: ['.fbx'],
  characters: ['.fbx'],
  props: ['.fbx', '.obj'],
  video: ['.mp4', '.webm', '.ogg', '.avi', '.mov'],
};

/** @param {string[]} allowed @param {string} filename */
export function isAllowedExt(allowed, filename) {
  const ext = extname(filename);
  return allowed.map((e) => e.toLowerCase()).includes(ext);
}

/** @param {string} dirPrefix e.g. files/music/ */
export function publicPrefixFromKey(dirPrefix) {
  return `/${dirPrefix.replace(/\\/g, '/')}`;
}
