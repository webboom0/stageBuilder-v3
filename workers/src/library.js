import {
  basename,
  error,
  json,
  MEDIA_EXTS,
} from './util.js';
import {
  deleteLibraryFile,
  fileKey,
  libraryPublicPrefix,
  listLibraryFiles,
  putObject,
  uniqueNameInDir,
} from './r2.js';

/** @type {Record<string, { subDir: string, field: string, exts: string[], maxBytes: number, uploadRoute: string, listRoute: string }>} */
export const LIBRARY_KINDS = {
  audio: {
    subDir: 'music',
    field: 'audioFile',
    exts: MEDIA_EXTS.music,
    maxBytes: 50 * 1024 * 1024,
    uploadRoute: '/api/upload-audio',
    listRoute: '/api/audio-files',
  },
  characters: {
    subDir: 'characters',
    field: 'fbxFile',
    exts: MEDIA_EXTS.characters,
    maxBytes: 100 * 1024 * 1024,
    uploadRoute: '/api/upload-fbx',
    listRoute: '/api/fbx-files',
  },
  props: {
    subDir: 'props',
    field: 'propFile',
    exts: MEDIA_EXTS.props,
    maxBytes: 100 * 1024 * 1024,
    uploadRoute: '/api/upload-prop',
    listRoute: '/api/prop-files',
  },
  video: {
    subDir: 'video',
    field: 'video',
    exts: MEDIA_EXTS.video,
    maxBytes: 500 * 1024 * 1024,
    uploadRoute: '/api/upload-video',
    listRoute: '/api/video-files',
  },
};

/**
 * @param {R2Bucket} bucket
 * @param {string} kind
 * @param {File} file
 */
async function handleLibraryUpload(bucket, kind, file) {
  const cfg = LIBRARY_KINDS[kind];
  if (!cfg) return error('지원하지 않는 업로드', 400);
  if (!file || typeof file.arrayBuffer !== 'function') {
    return error(`${cfg.field}이 필요합니다.`, 400);
  }
  if (file.size > cfg.maxBytes) {
    return error('파일 크기가 제한을 초과했습니다.', 400);
  }
  if (!cfg.exts.some((e) => file.name.toLowerCase().endsWith(e))) {
    return error(`지원하지 않는 파일 형식입니다.`, 400);
  }

  const filename = await uniqueNameInDir(bucket, cfg.subDir, file.name);
  const key = fileKey(`${cfg.subDir}/${filename}`);
  const buf = await file.arrayBuffer();
  await putObject(bucket, key, buf, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });
  const prefix = libraryPublicPrefix(cfg.subDir);
  return json({
    success: true,
    message: '파일 업로드가 완료되었습니다.',
    file: {
      originalName: file.name,
      filename,
      path: `${prefix}${filename}`,
      size: file.size,
      mimetype: file.type,
      uploadTime: new Date().toISOString(),
    },
  });
}

/**
 * @param {R2Bucket} bucket
 */
export async function listCharacterFiles(bucket) {
  const chars = await listLibraryFiles(
    bucket,
    'characters',
    libraryPublicPrefix('characters'),
    MEDIA_EXTS.characters,
  );
  const legacy = await listLibraryFiles(
    bucket,
    'fbx',
    libraryPublicPrefix('fbx'),
    MEDIA_EXTS.fbx,
  );
  const seen = new Set(chars.map((f) => f.filename.toLowerCase()));
  for (const f of legacy) {
    if (!seen.has(f.filename.toLowerCase())) chars.push(f);
  }
  return chars.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
}

/**
 * @param {R2Bucket} bucket
 * @param {string} pathname
 * @param {Request} request
 */
export async function handleLibraryRoutes(bucket, pathname, request) {
  if (pathname === '/api/upload-audio' && request.method === 'POST') {
    const fd = await request.formData();
    return handleLibraryUpload(bucket, 'audio', fd.get('audioFile'));
  }
  if (pathname === '/api/audio-files' && request.method === 'GET') {
    return json(await listLibraryFiles(bucket, 'music', libraryPublicPrefix('music'), MEDIA_EXTS.music));
  }
  const audioDel = pathname.match(/^\/api\/audio-files\/([^/]+)$/);
  if (audioDel && request.method === 'DELETE') {
    const ok = await deleteLibraryFile(bucket, 'music', decodeURIComponent(audioDel[1]));
    return ok ? json({ success: true }) : error('파일을 찾을 수 없습니다.', 404);
  }

  if (pathname === '/api/upload-fbx' && request.method === 'POST') {
    const fd = await request.formData();
    return handleLibraryUpload(bucket, 'characters', fd.get('fbxFile'));
  }
  if (pathname === '/api/fbx-files' && request.method === 'GET') {
    return json(await listCharacterFiles(bucket));
  }
  const fbxDel = pathname.match(/^\/api\/fbx-files\/([^/]+)$/);
  if (fbxDel && request.method === 'DELETE') {
    const name = decodeURIComponent(fbxDel[1]);
    const ok = await deleteLibraryFile(bucket, 'characters', name)
      || await deleteLibraryFile(bucket, 'fbx', name);
    return ok ? json({ success: true }) : error('파일을 찾을 수 없습니다.', 404);
  }

  if (pathname === '/api/upload-prop' && request.method === 'POST') {
    const fd = await request.formData();
    return handleLibraryUpload(bucket, 'props', fd.get('propFile'));
  }
  if (pathname === '/api/prop-files' && request.method === 'GET') {
    return json(await listLibraryFiles(bucket, 'props', libraryPublicPrefix('props'), MEDIA_EXTS.props));
  }
  const propDel = pathname.match(/^\/api\/prop-files\/([^/]+)$/);
  if (propDel && request.method === 'DELETE') {
    const ok = await deleteLibraryFile(bucket, 'props', decodeURIComponent(propDel[1]));
    return ok ? json({ success: true }) : error('파일을 찾을 수 없습니다.', 404);
  }

  if (pathname === '/api/upload-video' && request.method === 'POST') {
    const fd = await request.formData();
    return handleLibraryUpload(bucket, 'video', fd.get('video'));
  }
  if (pathname === '/api/video-files' && request.method === 'GET') {
    return json(await listLibraryFiles(bucket, 'video', libraryPublicPrefix('video'), MEDIA_EXTS.video));
  }
  const videoDel = pathname.match(/^\/api\/video-files\/([^/]+)$/);
  if (videoDel && request.method === 'DELETE') {
    const ok = await deleteLibraryFile(bucket, 'video', decodeURIComponent(videoDel[1]));
    return ok ? json({ success: true }) : error('파일을 찾을 수 없습니다.', 404);
  }

  return null;
}

/** @param {R2Bucket} bucket @param {string} kind @param {string} filename */
export async function resolveGlobalLibraryFile(bucket, kind, filename) {
  const safe = basename(String(filename || ''));
  if (!safe || safe !== filename) return null;
  /** @type {Record<string, string[]>} */
  const sources = {
    characters: ['characters', 'fbx'],
    props: ['props'],
    audio: ['music'],
    video: ['video'],
  };
  const subs = sources[kind] || [];
  for (const sub of subs) {
    const key = fileKey(`${sub}/${safe}`);
    const head = await bucket.head(key);
    if (head) return { key, filename: safe, subDir: sub };
  }
  return null;
}

/**
 * @param {R2Bucket} bucket
 * @param {string} pathname
 */
export async function serveFilesRoute(bucket, pathname) {
  if (!pathname.startsWith('/files/')) return null;
  const rel = decodeURIComponent(pathname.slice('/files/'.length));
  if (!rel || rel.includes('..')) return error('잘못된 경로', 400);
  const key = fileKey(rel);
  const obj = await bucket.get(key);
  if (!obj) return error('Not Found', 404);
  const filename = basename(rel);
  const headers = {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
  };
  return new Response(obj.body, { status: 200, headers });
}
