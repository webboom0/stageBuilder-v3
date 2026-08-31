import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  basename,
  error,
  json,
  MEDIA_EXTS,
  safeProjectId,
  safeSceneId,
  slugify,
} from './util.js';
import {
  copyObject,
  deleteObject,
  deletePrefix,
  fileKey,
  listAllKeys,
  projectPrefix,
  putObject,
  uniqueNameInDir,
} from './r2.js';
import { resolveGlobalLibraryFile } from './library.js';

/** @type {Record<string, { subDir: string, field: string, exts: string[], maxBytes: number }>} */
const ASSET_KINDS = {
  characters: {
    subDir: 'assets/characters',
    field: 'fbxFile',
    exts: MEDIA_EXTS.characters,
    maxBytes: 100 * 1024 * 1024,
  },
  props: {
    subDir: 'assets/props',
    field: 'propFile',
    exts: MEDIA_EXTS.props,
    maxBytes: 100 * 1024 * 1024,
  },
  audio: {
    subDir: 'assets/audio',
    field: 'audioFile',
    exts: MEDIA_EXTS.music,
    maxBytes: 50 * 1024 * 1024,
  },
  video: {
    subDir: 'assets/video',
    field: 'video',
    exts: MEDIA_EXTS.video,
    maxBytes: 500 * 1024 * 1024,
  },
};

const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

/** @param {R2Bucket} bucket @param {string} key */
async function readJson(bucket, key) {
  const obj = await bucket.get(key);
  if (!obj) throw new Error('파일을 찾을 수 없습니다.');
  return JSON.parse(await obj.text());
}

/** @param {R2Bucket} bucket @param {string} key @param {unknown} data */
async function writeJson(bucket, key, data) {
  await putObject(bucket, key, `${JSON.stringify(data, null, 2)}\n`, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

/** @param {string} projectId @param {string} kind */
function assetPublicPrefix(projectId, kind) {
  const cfg = ASSET_KINDS[kind];
  if (!cfg) return null;
  return `/files/projects/${projectId}/${cfg.subDir.replace(/\\/g, '/')}/`;
}

/** @param {string} kind @param {string} filename */
function assetRelPath(kind, filename) {
  return `${ASSET_KINDS[kind].subDir}/${filename}`.replace(/\\/g, '/');
}

/** @param {string} sceneId @param {string} [name] */
function defaultSceneDocument(sceneId, name) {
  return {
    version: 4,
    id: sceneId,
    name: name || '1막',
    stageType: 'proscenium',
    durationSec: 180,
    durationMode: 'clampEnd',
    playheadSec: 0,
    tracks: [],
    folders: [],
    motions: [],
    groups: [],
    video: null,
    audioMasterVolume: 1,
  };
}

/** @param {R2Bucket} bucket @param {string} baseName */
async function uniqueProjectId(bucket, baseName) {
  let id = slugify(baseName);
  let n = 2;
  while (await bucket.head(fileKey(`projects/${id}/project.json`))) {
    id = `${slugify(baseName)}_${n}`;
    n += 1;
  }
  return id;
}

/** @param {R2Bucket} bucket @param {string} projectId @param {object} meta */
async function createProjectOnR2(bucket, projectId, meta) {
  const prefix = projectPrefix(projectId);
  const now = new Date().toISOString();
  const sceneId = 'scene_01';
  const sceneFile = `scenes/${sceneId}.json`;
  const project = {
    version: 4,
    id: projectId,
    name: meta.showName || projectId,
    showName: meta.showName || projectId,
    genre: meta.genre || '',
    startDate: meta.startDate || '',
    endDate: meta.endDate || '',
    showPeriod: meta.showPeriod || '',
    venue: meta.venue || '',
    director: meta.director || '',
    stageProfile: meta.stageProfile || null,
    scenes: [{ id: sceneId, name: '1막', order: 0, file: sceneFile }],
    activeSceneId: sceneId,
    positionPresets: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeJson(bucket, `${prefix}project.json`, project);
  await writeJson(bucket, `${prefix}${sceneFile}`, defaultSceneDocument(sceneId, '1막'));
  await writeJson(bucket, `${prefix}manifest.json`, { version: 4, assets: [] });
  return project;
}

/** @param {Record<string, Uint8Array>} files */
function findProjectRootInZip(files) {
  if (Object.keys(files).includes('project.json')) return '';
  for (const k of Object.keys(files)) {
    if (k.endsWith('/project.json')) return k.slice(0, -'project.json'.length);
  }
  return null;
}

/** @param {Record<string, Uint8Array>} files @param {string} rootPrefix */
function zipHasAssetFiles(files, rootPrefix) {
  return Object.keys(files).some((k) => k.startsWith(`${rootPrefix}assets/`) && !k.endsWith('/'));
}

/** @param {R2Bucket} bucket @param {Record<string, Uint8Array>} files @param {string} srcRoot @param {string} projectId */
async function applyJsonSnapshotToProject(bucket, files, srcRoot, projectId) {
  const projectPath = `${srcRoot}project.json`;
  if (!files[projectPath]) throw new Error('ZIP 안에 project.json을 찾을 수 없습니다.');
  const snapshotProject = JSON.parse(strFromU8(files[projectPath]));
  snapshotProject.id = projectId;
  snapshotProject.updatedAt = new Date().toISOString();
  const prefix = projectPrefix(projectId);
  await writeJson(bucket, `${prefix}project.json`, snapshotProject);
  const manifestPath = `${srcRoot}manifest.json`;
  if (files[manifestPath]) {
    await putObject(bucket, `${prefix}manifest.json`, files[manifestPath], {
      httpMetadata: { contentType: 'application/json' },
    });
  }
  const kept = new Set();
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith(`${srcRoot}scenes/`) || !path.endsWith('.json')) continue;
    const name = path.slice(`${srcRoot}scenes/`.length);
    await putObject(bucket, `${prefix}scenes/${name}`, data, {
      httpMetadata: { contentType: 'application/json' },
    });
    kept.add(name);
  }
  for (const key of await listAllKeys(bucket, `${prefix}scenes/`)) {
    const name = key.slice(`${prefix}scenes/`.length);
    if (name.endsWith('.json') && !kept.has(name)) await deleteObject(bucket, key);
  }
  return snapshotProject;
}

/** @param {R2Bucket} bucket @param {Record<string, Uint8Array>} files @param {string} srcRoot @param {string} projectId */
async function copyZipTreeToProject(bucket, files, srcRoot, projectId) {
  const destPrefix = projectPrefix(projectId);
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith(srcRoot) || path.endsWith('/')) continue;
    const rel = path.slice(srcRoot.length);
    if (!rel || rel.includes('..')) continue;
    await putObject(bucket, `${destPrefix}${rel}`, data);
  }
}

/** @param {R2Bucket} bucket @param {string} pathname @param {Request} request */
export async function handleProjectRoutes(bucket, pathname, request) {
  if (pathname === '/api/projects' && request.method === 'GET') {
    const prefix = fileKey('projects/');
    const projects = [];
    for (const pk of (await listAllKeys(bucket, prefix)).filter((k) => k.endsWith('/project.json'))) {
      const id = pk.slice(prefix.length, -'/project.json'.length);
      try {
        const data = await readJson(bucket, pk);
        projects.push({
          id,
          name: data.showName || data.name || id,
          sceneCount: Array.isArray(data.scenes) ? data.scenes.length : 0,
          updatedAt: data.updatedAt || null,
        });
      } catch {
        projects.push({ id, name: id, sceneCount: 0, updatedAt: null });
      }
    }
    projects.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return json(projects);
  }

  if (pathname === '/api/projects' && request.method === 'POST') {
    const meta = await request.json().catch(() => ({}));
    if (!meta.showName || !String(meta.showName).trim()) return error('공연명(showName)이 필요합니다.');
    try {
      const projectId = await uniqueProjectId(bucket, meta.showName);
      return json({ success: true, project: await createProjectOnR2(bucket, projectId, meta) }, 201);
    } catch (err) {
      return error(err.message || '프로젝트 생성 실패', 500);
    }
  }

  if (pathname === '/api/projects/import' && request.method === 'POST') {
    return handleImportProject(bucket, request);
  }

  const exportMatch = pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (exportMatch && request.method === 'GET') return handleExportProject(bucket, exportMatch[1], request);

  const snapshotRestore = pathname.match(/^\/api\/projects\/([^/]+)\/snapshot\/restore$/);
  if (snapshotRestore && request.method === 'POST') return handleSnapshotRestore(bucket, snapshotRestore[1], request);

  const sceneOrder = pathname.match(/^\/api\/projects\/([^/]+)\/scenes\/order$/);
  if (sceneOrder && request.method === 'PUT') return handleSceneOrder(bucket, sceneOrder[1], request);

  const scenesPost = pathname.match(/^\/api\/projects\/([^/]+)\/scenes$/);
  if (scenesPost && request.method === 'POST') return handleAddScene(bucket, scenesPost[1], request);

  const importLib = pathname.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)\/import-library$/);
  if (importLib && request.method === 'POST') return handleImportLibrary(bucket, importLib[1], importLib[2], request);

  const assetFile = pathname.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)\/([^/]+)$/);
  if (assetFile && request.method === 'DELETE') {
    const projectId = safeProjectId(assetFile[1]);
    const kind = assetFile[2];
    const cfg = ASSET_KINDS[kind];
    if (!projectId || !cfg) return error('잘못된 요청', 400);
    const filename = basename(decodeURIComponent(assetFile[3]));
    const key = `${projectPrefix(projectId)}${cfg.subDir}/${filename}`;
    if (!(await bucket.head(key))) return error('파일을 찾을 수 없습니다.', 404);
    await deleteObject(bucket, key);
    return json({ success: true });
  }

  const assetKind = pathname.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/);
  if (assetKind) {
    const projectId = safeProjectId(assetKind[1]);
    const kind = assetKind[2];
    if (!projectId || !ASSET_KINDS[kind]) return error('잘못된 요청', 400);
    if (request.method === 'GET') return handleListProjectAssets(bucket, projectId, kind);
    if (request.method === 'POST') return handleUploadProjectAsset(bucket, projectId, kind, request);
  }

  const sceneOne = pathname.match(/^\/api\/projects\/([^/]+)\/scenes\/([^/]+)$/);
  if (sceneOne) {
    const projectId = safeProjectId(sceneOne[1]);
    const sceneId = safeSceneId(sceneOne[2]);
    if (!projectId || !sceneId) return error('잘못된 요청', 400);
    if (request.method === 'GET') return handleGetScene(bucket, projectId, sceneId);
    if (request.method === 'PUT') return handlePutScene(bucket, projectId, sceneId, request);
    if (request.method === 'DELETE') return handleDeleteScene(bucket, projectId, sceneId);
  }

  const projectOne = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectOne) {
    const projectId = safeProjectId(projectOne[1]);
    if (!projectId) return error('잘못된 프로젝트 ID', 400);
    if (request.method === 'GET') return handleGetProject(bucket, projectId);
    if (request.method === 'PUT') return handlePutProject(bucket, projectId, request);
    if (request.method === 'DELETE') return handleDeleteProject(bucket, projectId);
  }

  return null;
}

/** @param {R2Bucket} bucket @param {string} projectId */
async function handleGetProject(bucket, projectId) {
  const key = `${projectPrefix(projectId)}project.json`;
  if (!(await bucket.head(key))) return error('프로젝트를 찾을 수 없습니다.', 404);
  try {
    return json({ project: await readJson(bucket, key) });
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} projectId @param {Request} request */
async function handlePutProject(bucket, projectId, request) {
  const key = `${projectPrefix(projectId)}project.json`;
  if (!(await bucket.head(key))) return error('프로젝트를 찾을 수 없습니다.', 404);
  try {
    const body = await request.json();
    const patch = body?.project || body || {};
    const prev = await readJson(bucket, key);
    const next = { ...prev, ...patch, id: prev.id, version: 4, updatedAt: new Date().toISOString() };
    await writeJson(bucket, key, next);
    return json({ success: true, project: next });
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} projectId */
async function handleDeleteProject(bucket, projectId) {
  const prefix = projectPrefix(projectId);
  if (!(await bucket.head(`${prefix}project.json`))) return error('프로젝트를 찾을 수 없습니다.', 404);
  await deletePrefix(bucket, prefix);
  return json({ success: true });
}

/** @param {R2Bucket} bucket @param {string} projectId @param {string} sceneId */
async function handleGetScene(bucket, projectId, sceneId) {
  const key = `${projectPrefix(projectId)}scenes/${sceneId}.json`;
  if (!(await bucket.head(key))) return error('씬을 찾을 수 없습니다.', 404);
  try {
    return json({ scene: await readJson(bucket, key) });
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} projectId @param {string} sceneId @param {Request} request */
async function handlePutScene(bucket, projectId, sceneId, request) {
  const prefix = projectPrefix(projectId);
  if (!(await bucket.head(`${prefix}project.json`))) return error('프로젝트를 찾을 수 없습니다.', 404);
  try {
    const body = await request.json();
    const scene = body?.scene || body;
    if (!scene || typeof scene !== 'object') return error('scene JSON이 필요합니다.');
    const next = { ...scene, id: sceneId, version: 4 };
    await writeJson(bucket, `${prefix}scenes/${sceneId}.json`, next);
    const project = await readJson(bucket, `${prefix}project.json`);
    project.updatedAt = new Date().toISOString();
    await writeJson(bucket, `${prefix}project.json`, project);
    if (body?.manifest) await writeJson(bucket, `${prefix}manifest.json`, body.manifest);
    return json({ success: true, scene: next });
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} rawId @param {Request} request */
async function handleSceneOrder(bucket, rawId, request) {
  const projectId = safeProjectId(rawId);
  if (!projectId) return error('잘못된 프로젝트 ID', 400);
  const projectKey = `${projectPrefix(projectId)}project.json`;
  if (!(await bucket.head(projectKey))) return error('프로젝트를 찾을 수 없습니다.', 404);
  const body = await request.json().catch(() => ({}));
  const sceneIds = body?.sceneIds;
  if (!Array.isArray(sceneIds) || !sceneIds.length) return error('sceneIds 배열이 필요합니다.');
  try {
    const project = await readJson(bucket, projectKey);
    const scenes = Array.isArray(project.scenes) ? project.scenes : [];
    const byId = new Map(scenes.map((s) => [s.id, s]));
    if (sceneIds.length !== scenes.length || sceneIds.some((id) => !byId.has(id))) {
      return error('씬 ID 목록이 프로젝트와 일치하지 않습니다.');
    }
    project.scenes = sceneIds.map((id, i) => ({ ...byId.get(id), order: i }));
    project.updatedAt = new Date().toISOString();
    await writeJson(bucket, projectKey, project);
    return json({ success: true, project });
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} rawId @param {Request} request */
async function handleAddScene(bucket, rawId, request) {
  const projectId = safeProjectId(rawId);
  if (!projectId) return error('잘못된 프로젝트 ID', 400);
  const prefix = projectPrefix(projectId);
  const projectKey = `${prefix}project.json`;
  if (!(await bucket.head(projectKey))) return error('프로젝트를 찾을 수 없습니다.', 404);
  try {
    const body = await request.json().catch(() => ({}));
    const project = await readJson(bucket, projectKey);
    const scenes = Array.isArray(project.scenes) ? project.scenes : [];
    const n = scenes.length + 1;
    const sceneId = `scene_${String(n).padStart(2, '0')}`;
    const name = body?.name || `${n}막`;
    const sceneFile = `scenes/${sceneId}.json`;
    await writeJson(bucket, `${prefix}${sceneFile}`, defaultSceneDocument(sceneId, name));
    scenes.push({ id: sceneId, name, order: n - 1, file: sceneFile });
    project.scenes = scenes;
    project.activeSceneId = sceneId;
    project.updatedAt = new Date().toISOString();
    await writeJson(bucket, projectKey, project);
    return json({ success: true, project, sceneId }, 201);
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} projectId @param {string} sceneId */
async function handleDeleteScene(bucket, projectId, sceneId) {
  const prefix = projectPrefix(projectId);
  const projectKey = `${prefix}project.json`;
  if (!(await bucket.head(projectKey))) return error('프로젝트를 찾을 수 없습니다.', 404);
  try {
    const project = await readJson(bucket, projectKey);
    const scenes = Array.isArray(project.scenes) ? project.scenes : [];
    if (scenes.length <= 1) return error('마지막 씬은 삭제할 수 없습니다.');
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return error('씬을 찾을 수 없습니다.', 404);
    const sceneKey = `${prefix}scenes/${sceneId}.json`;
    if (await bucket.head(sceneKey)) await deleteObject(bucket, sceneKey);
    scenes.splice(idx, 1);
    scenes.forEach((s, i) => { s.order = i; });
    project.scenes = scenes;
    if (project.activeSceneId === sceneId) {
      project.activeSceneId = scenes[Math.min(idx, scenes.length - 1)].id;
    }
    project.updatedAt = new Date().toISOString();
    await writeJson(bucket, projectKey, project);
    return json({ success: true, project, activeSceneId: project.activeSceneId });
  } catch (err) {
    return error(err.message, 500);
  }
}

/** @param {R2Bucket} bucket @param {string} projectId @param {string} kind */
async function handleListProjectAssets(bucket, projectId, kind) {
  const prefix = projectPrefix(projectId);
  if (!(await bucket.head(`${prefix}project.json`))) return error('프로젝트를 찾을 수 없습니다.', 404);
  const cfg = ASSET_KINDS[kind];
  const assetPrefix = `${prefix}${cfg.subDir}/`;
  const publicPrefix = assetPublicPrefix(projectId, kind);
  const files = [];
  for (const key of await listAllKeys(bucket, assetPrefix)) {
    const filename = key.slice(assetPrefix.length);
    if (!filename || !cfg.exts.some((e) => filename.toLowerCase().endsWith(e))) continue;
    const head = await bucket.head(key);
    if (!head) continue;
    const base = filename.replace(/\.[^.]+$/, '');
    files.push({
      name: base,
      displayName: base.replace(/[_-]/g, ' '),
      filename,
      path: `${publicPrefix}${filename}`,
      relPath: assetRelPath(kind, filename),
      size: head.size,
      modifiedTime: head.uploaded.toISOString(),
    });
  }
  files.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
  return json(files);
}

/** @param {R2Bucket} bucket @param {string} projectId @param {string} kind @param {Request} request */
async function handleUploadProjectAsset(bucket, projectId, kind, request) {
  const prefix = projectPrefix(projectId);
  if (!(await bucket.head(`${prefix}project.json`))) return error('프로젝트를 찾을 수 없습니다.', 404);
  const cfg = ASSET_KINDS[kind];
  const fd = await request.formData();
  const file = fd.get(cfg.field);
  if (!file || typeof file.arrayBuffer !== 'function') return error(`${cfg.field}이 필요합니다.`);
  if (file.size > cfg.maxBytes) return error('파일 크기가 제한을 초과했습니다.');
  if (!cfg.exts.some((e) => file.name.toLowerCase().endsWith(e))) return error('지원하지 않는 파일 형식입니다.');
  const filename = await uniqueNameInDir(bucket, `projects/${projectId}/${cfg.subDir}`, file.name);
  const key = `${prefix}${cfg.subDir}/${filename}`;
  await putObject(bucket, key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });
  const publicPrefix = assetPublicPrefix(projectId, kind);
  return json({
    success: true,
    message: '파일 업로드가 완료되었습니다.',
    file: {
      originalName: file.name,
      filename,
      path: `${publicPrefix}${filename}`,
      relPath: assetRelPath(kind, filename),
      size: file.size,
      mimetype: file.type,
      uploadTime: new Date().toISOString(),
    },
  });
}

/** @param {R2Bucket} bucket @param {string} rawId @param {string} kind @param {Request} request */
async function handleImportLibrary(bucket, rawId, kind, request) {
  const projectId = safeProjectId(rawId);
  const cfg = ASSET_KINDS[kind];
  if (!projectId || !cfg) return error('잘못된 요청', 400);
  const prefix = projectPrefix(projectId);
  if (!(await bucket.head(`${prefix}project.json`))) return error('프로젝트를 찾을 수 없습니다.', 404);
  const body = await request.json().catch(() => ({}));
  if (!body?.filename) return error('filename이 필요합니다.');
  const found = await resolveGlobalLibraryFile(bucket, kind, body.filename);
  if (!found) return error('라이브러리에서 파일을 찾을 수 없습니다.', 404);
  const destName = await uniqueNameInDir(bucket, `projects/${projectId}/${cfg.subDir}`, found.filename);
  const destKey = `${prefix}${cfg.subDir}/${destName}`;
  if (!(await copyObject(bucket, found.key, destKey))) return error('복사 실패', 500);
  const publicPrefix = assetPublicPrefix(projectId, kind);
  return json({
    success: true,
    file: {
      filename: destName,
      path: `${publicPrefix}${destName}`,
      relPath: assetRelPath(kind, destName),
    },
  });
}

/** @param {R2Bucket} bucket @param {string} rawId @param {Request} request */
async function handleExportProject(bucket, rawId, request) {
  const projectId = safeProjectId(rawId);
  if (!projectId) return error('잘못된 프로젝트 ID', 400);
  const prefix = projectPrefix(projectId);
  const projectKey = `${prefix}project.json`;
  if (!(await bucket.head(projectKey))) return error('프로젝트를 찾을 수 없습니다.', 404);
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'snapshot' || url.searchParams.get('mode') === 'link' ? 'snapshot' : 'bundle';
  let project;
  try {
    project = await readJson(bucket, projectKey);
  } catch (err) {
    return error(err.message, 500);
  }
  const zipBase = slugify(project.showName || project.name || projectId) || projectId;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = mode === 'snapshot' ? `${zipBase}_snapshot_${stamp}.zip` : `${zipBase}.zip`;
  const zipEntries = {};
  const zipPrefix = `${projectId}/`;
  if (mode === 'snapshot') {
    zipEntries[`${zipPrefix}project.json`] = strToU8(JSON.stringify(project, null, 2));
    const manifestKey = `${prefix}manifest.json`;
    if (await bucket.head(manifestKey)) {
      const obj = await bucket.get(manifestKey);
      if (obj) zipEntries[`${zipPrefix}manifest.json`] = new Uint8Array(await obj.arrayBuffer());
    }
    for (const sk of await listAllKeys(bucket, `${prefix}scenes/`)) {
      if (!sk.endsWith('.json')) continue;
      const obj = await bucket.get(sk);
      if (!obj) continue;
      zipEntries[`${zipPrefix}scenes/${sk.slice(`${prefix}scenes/`.length)}`] = new Uint8Array(await obj.arrayBuffer());
    }
  } else {
    for (const key of await listAllKeys(bucket, prefix)) {
      const obj = await bucket.get(key);
      if (!obj) continue;
      zipEntries[`${zipPrefix}${key.slice(prefix.length)}`] = new Uint8Array(await obj.arrayBuffer());
    }
  }
  return new Response(zipSync(zipEntries), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

/** @param {R2Bucket} bucket @param {string} rawId @param {Request} request */
async function handleSnapshotRestore(bucket, rawId, request) {
  const projectId = safeProjectId(rawId);
  if (!projectId) return error('잘못된 프로젝트 ID', 400);
  if (!(await bucket.head(`${projectPrefix(projectId)}project.json`))) {
    return error('프로젝트를 찾을 수 없습니다.', 404);
  }
  const fd = await request.formData();
  const file = fd.get('snapshotZip');
  if (!file || typeof file.arrayBuffer !== 'function') return error('snapshotZip 파일이 필요합니다.');
  if (file.size > ZIP_MAX_BYTES) return error('ZIP 크기 제한 초과', 400);
  try {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const srcRoot = findProjectRootInZip(files);
    if (srcRoot === null) throw new Error('ZIP 안에 project.json을 찾을 수 없습니다.');
    if (zipHasAssetFiles(files, srcRoot)) {
      throw new Error('에셋이 포함된 ZIP은 스냅샷 복원에 사용할 수 없습니다. 「프로젝트 ZIP (에셋 포함)」은 ZIP 가져오기를 사용하세요.');
    }
    const project = await applyJsonSnapshotToProject(bucket, files, srcRoot, projectId);
    return json({ success: true, projectId, project });
  } catch (err) {
    return error(err.message, 400);
  }
}

/** @param {R2Bucket} bucket @param {Request} request */
async function handleImportProject(bucket, request) {
  const fd = await request.formData();
  const file = fd.get('projectZip');
  if (!file || typeof file.arrayBuffer !== 'function') return error('projectZip 파일이 필요합니다.');
  if (file.size > ZIP_MAX_BYTES) return error('ZIP 크기 제한 초과', 400);
  try {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const srcRoot = findProjectRootInZip(files);
    if (srcRoot === null) return error('ZIP 안에 project.json을 찾을 수 없습니다.', 400);
    if (!zipHasAssetFiles(files, srcRoot)) {
      return error('에셋이 없는 ZIP은 새 프로젝트로 가져올 수 없습니다. 편집 중인 프로젝트에서는 「스냅샷에서 복원」을, 다른 PC로 옮길 때는 「프로젝트 ZIP (에셋 포함)」을 사용하세요.');
    }
    const projectPath = `${srcRoot}project.json`;
    let project;
    try {
      project = JSON.parse(strFromU8(files[projectPath]));
    } catch (parseErr) {
      return error(`project.json 읽기 실패: ${parseErr.message}`, 400);
    }
    const baseId = slugify(project.id || project.showName || project.name || basename(srcRoot.replace(/\/$/, '')));
    const projectId = await uniqueProjectId(bucket, baseId || 'project');
    if (projectId !== (project.id || baseId)) {
      project.id = projectId;
      project.updatedAt = new Date().toISOString();
      files[projectPath] = strToU8(JSON.stringify(project, null, 2));
    }
    await deletePrefix(bucket, projectPrefix(projectId));
    await copyZipTreeToProject(bucket, files, srcRoot, projectId);
    return json({ success: true, projectId, project }, 201);
  } catch (err) {
    return error(err.message || '가져오기 실패', 500);
  }
}
