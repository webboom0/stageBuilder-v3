import {
  basename,
  extname,
  isAllowedExt,
  parseName,
  publicPrefixFromKey,
  uniqueFilename,
} from './util.js';

const FILES_ROOT = 'files';

/** @param {string} rel e.g. music/foo.mp3 */
export function fileKey(rel) {
  const clean = rel.replace(/^\/+/, '').replace(/\\/g, '/');
  return `${FILES_ROOT}/${clean}`;
}

/** @param {string} projectId */
export function projectPrefix(projectId) {
  return fileKey(`projects/${projectId}/`);
}

/**
 * @param {R2Bucket} bucket
 * @param {string} key
 */
export async function getObject(bucket, key) {
  return bucket.get(key);
}

/**
 * @param {R2Bucket} bucket
 * @param {string} key
 * @param {ArrayBuffer | Uint8Array | string} body
 * @param {Partial<R2PutOptions>} [opts]
 */
export async function putObject(bucket, key, body, opts = {}) {
  await bucket.put(key, body, opts);
}

/**
 * @param {R2Bucket} bucket
 * @param {string} key
 */
export async function deleteObject(bucket, key) {
  await bucket.delete(key);
}

/**
 * @param {R2Bucket} bucket
 * @param {string} prefix
 */
export async function deletePrefix(bucket, prefix) {
  let cursor;
  do {
    /** @type {R2ListOptions} */
    const opts = { prefix, limit: 1000 };
    if (cursor) opts.cursor = cursor;
    const listed = await bucket.list(opts);
    if (listed.objects.length) {
      await bucket.delete(listed.objects.map((o) => o.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

/**
 * @param {R2Bucket} bucket
 * @param {string} prefix
 */
export async function listAllKeys(bucket, prefix) {
  /** @type {string[]} */
  const keys = [];
  let cursor;
  do {
    /** @type {R2ListOptions} */
    const opts = { prefix, limit: 1000 };
    if (cursor) opts.cursor = cursor;
    const listed = await bucket.list(opts);
    for (const obj of listed.objects) keys.push(obj.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return keys;
}

/**
 * @param {R2Bucket} bucket
 * @param {string} subDir e.g. music
 * @param {string} publicPrefix e.g. /files/music/
 * @param {string[] | null} [allowedExtensions]
 */
export async function listLibraryFiles(bucket, subDir, publicPrefix, allowedExtensions = null) {
  const prefix = fileKey(`${subDir}/`);
  let cursor;
  /** @type {Array<{ name: string, displayName: string, filename: string, path: string, size: number, modifiedTime: string }>} */
  const out = [];
  do {
    /** @type {R2ListOptions} */
    const opts = { prefix, limit: 1000 };
    if (cursor) opts.cursor = cursor;
    const listed = await bucket.list(opts);
    for (const obj of listed.objects) {
      const filename = basename(obj.key);
      if (!filename || filename.startsWith('.') || filename.toLowerCase() === 'thumbs.db') continue;
      if (allowedExtensions && !isAllowedExt(allowedExtensions, filename)) continue;
      const { name } = parseName(filename);
      out.push({
        name,
        displayName: name.replace(/[_-]/g, ' '),
        filename,
        path: `${publicPrefix}${filename}`,
        size: obj.size,
        modifiedTime: obj.uploaded.toISOString(),
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
}

/**
 * @param {R2Bucket} bucket
 * @param {string} subDir
 */
export async function uniqueNameInDir(bucket, subDir, originalName) {
  const prefix = fileKey(`${subDir}/`);
  const keys = await listAllKeys(bucket, prefix);
  const existing = new Set(keys.map((k) => basename(k).toLowerCase()));
  return uniqueFilename(existing, originalName);
}

/**
 * @param {R2Bucket} bucket
 * @param {string} srcKey
 * @param {string} destKey
 */
export async function copyObject(bucket, srcKey, destKey) {
  const obj = await bucket.get(srcKey);
  if (!obj) return false;
  await bucket.put(destKey, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  });
  return true;
}

/**
 * @param {R2Bucket} bucket
 * @param {string} subDir
 * @param {string} filename
 */
export async function deleteLibraryFile(bucket, subDir, filename) {
  const safe = basename(filename);
  if (!safe || safe !== filename) return false;
  const key = fileKey(`${subDir}/${safe}`);
  const head = await bucket.head(key);
  if (!head) return false;
  await bucket.delete(key);
  return true;
}

/** @param {string} subDir */
export function libraryPublicPrefix(subDir) {
  return publicPrefixFromKey(fileKey(`${subDir}/`));
}

/** @param {R2ObjectBody} obj */
export function r2ContentType(obj, filename) {
  if (obj.httpMetadata?.contentType) return obj.httpMetadata.contentType;
  const ext = extname(filename);
  const map = {
    '.json': 'application/json',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.fbx': 'application/octet-stream',
    '.obj': 'text/plain',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}
